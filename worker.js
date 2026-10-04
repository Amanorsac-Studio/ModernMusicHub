/* =====================================================================
   Modern Music Hub: the backend.

   Every request for a file (pages, images, styles) is answered by the
   asset server and never reaches this code. Only /api/* runs here
   (see "run_worker_first" in wrangler.jsonc).

   Storage is one D1 database, bound as DB. The tables create themselves
   on the first request, and the lesson library and call-in schedule are
   seeded with starter content the first time they are empty, so a fresh
   deploy works with nothing to run by hand.

   Who is who
     admin    everything, including changing other people's roles
     teacher  the admin dashboard, apart from roles
     student  the Hub. A new sign-up is "pending" until an admin or
              teacher approves it; pending students can sign in but only
              see a welcome screen.
   The very first account ever created becomes the admin.

   Sessions are random tokens in an HttpOnly cookie; only their SHA-256
   is stored. Passwords are PBKDF2-SHA256 with a per-user salt.
   ===================================================================== */

const COOKIE = 'mmh_session';
const SESSION_DAYS = 30;
const PBKDF2_ITERATIONS = 100000;      // the most Workers allows
const PROGRAMS = ['piano', 'production', 'teenlab', 'online', 'private'];
const LEAD_STATUSES = ['new', 'contacted', 'booked', 'enrolled', 'closed'];
const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (!url.pathname.startsWith('/api/')) return env.ASSETS.fetch(request);
    try {
      await ensureSchema(env.DB);
      return await route(request, env, url);
    } catch (err) {
      if (err instanceof HttpError) return json({ error: err.message }, err.status);
      console.error(err);
      return json({ error: 'Something went wrong on our side. Please try again.' }, 500);
    }
  }
};

/* ------------------------------------------------------------------ */
/* routing                                                             */
/* ------------------------------------------------------------------ */

async function route(request, env, url) {
  const db = env.DB;
  const method = request.method;
  const path = url.pathname.replace(/\/+$/, '');
  if (method !== 'GET' && method !== 'HEAD') checkOrigin(request, url);

  // ---- public ----
  if (path === '/api/callins' && method === 'GET') {
    const rows = await all(db, 'SELECT id, day, title, note, time_text, color FROM callins WHERE active = 1 ORDER BY position, id');
    return json({ callins: rows }, 200, { 'Cache-Control': 'public, max-age=60' });
  }
  if (path === '/api/trial' && method === 'POST') return createLead(db, await body(request));

  // ---- accounts ----
  if (path === '/api/auth/register' && method === 'POST') return register(db, await body(request), url);
  if (path === '/api/auth/login' && method === 'POST') return login(db, await body(request), url);
  if (path === '/api/auth/logout' && method === 'POST') return logout(db, request, url);

  const me = await currentUser(db, request);
  if (path === '/api/me' && method === 'GET') return json({ user: me ? publicUser(me) : null });
  if (!me) throw new HttpError(401, 'Please sign in.');

  if (path === '/api/me' && method === 'PATCH') return updateMe(db, me, await body(request));

  // ---- the Hub (active students and staff) ----
  if (path.startsWith('/api/hub')) {
    if (me.status !== 'active' && !isStaff(me)) throw new HttpError(403, 'Your account is waiting for approval.');
    if (path === '/api/hub' && method === 'GET') return hubHome(db, me);
    if (path === '/api/hub/lessons' && method === 'GET') return hubLessons(db, me);
    let m;
    if ((m = path.match(/^\/api\/hub\/lessons\/(\d+)$/)) && method === 'GET') return hubLesson(db, me, +m[1]);
    if ((m = path.match(/^\/api\/hub\/lessons\/(\d+)\/progress$/)) && method === 'POST') return setProgress(db, me, +m[1], await body(request));
    if (path === '/api/hub/submissions' && method === 'GET') return mySubmissions(db, me);
    if (path === '/api/hub/submissions' && method === 'POST') return createSubmission(db, me, await body(request));
    if (path === '/api/hub/callins' && method === 'GET') {
      return json({ callins: await all(db, 'SELECT * FROM callins WHERE active = 1 ORDER BY position, id') });
    }
  }

  // ---- the admin dashboard (admins and teachers) ----
  if (path.startsWith('/api/admin')) {
    if (!isStaff(me)) throw new HttpError(403, 'This area is for Modern Music Hub staff.');
    return admin(db, me, request, path, method);
  }

  throw new HttpError(404, 'Not found.');
}

async function admin(db, me, request, path, method) {
  let m;
  if (path === '/api/admin/overview' && method === 'GET') return adminOverview(db);

  // trial requests
  if (path === '/api/admin/leads' && method === 'GET') {
    return json({ leads: await all(db, 'SELECT * FROM leads ORDER BY created_at DESC LIMIT 500') });
  }
  if ((m = path.match(/^\/api\/admin\/leads\/(\d+)$/))) {
    if (method === 'PATCH') {
      const b = await body(request);
      const sets = {};
      if (b.status !== undefined) sets.status = oneOf(b.status, LEAD_STATUSES, 'status');
      if (b.notes !== undefined) sets.notes = text(b.notes, 4000);
      await update(db, 'leads', +m[1], sets);
      return json({ lead: await first(db, 'SELECT * FROM leads WHERE id = ?', +m[1]) });
    }
    if (method === 'DELETE') { await run(db, 'DELETE FROM leads WHERE id = ?', +m[1]); return json({ ok: true }); }
  }

  // people
  if (path === '/api/admin/users' && method === 'GET') {
    const users = await all(db, `SELECT u.*, (SELECT COUNT(*) FROM progress p WHERE p.user_id = u.id) AS lessons_done,
      (SELECT COUNT(*) FROM submissions s WHERE s.user_id = u.id) AS submissions
      FROM users u ORDER BY u.created_at DESC`);
    const total = (await first(db, 'SELECT COUNT(*) AS n FROM lessons WHERE published = 1')).n;
    return json({ users: users.map(adminUser), lessons_total: total });
  }
  if (path === '/api/admin/users' && method === 'POST') return adminCreateUser(db, me, await body(request));
  if ((m = path.match(/^\/api\/admin\/users\/(\d+)$/))) {
    if (method === 'PATCH') return adminUpdateUser(db, me, +m[1], await body(request));
    if (method === 'DELETE') {
      if (me.role !== 'admin') throw new HttpError(403, 'Only an admin can remove accounts.');
      if (+m[1] === me.id) throw new HttpError(400, "You can't remove your own account.");
      await db.batch([
        db.prepare('DELETE FROM sessions WHERE user_id = ?').bind(+m[1]),
        db.prepare('DELETE FROM progress WHERE user_id = ?').bind(+m[1]),
        db.prepare('DELETE FROM submissions WHERE user_id = ?').bind(+m[1]),
        db.prepare('DELETE FROM users WHERE id = ?').bind(+m[1])
      ]);
      return json({ ok: true });
    }
  }
  if ((m = path.match(/^\/api\/admin\/users\/(\d+)\/reset-password$/)) && method === 'POST') {
    const target = await first(db, 'SELECT * FROM users WHERE id = ?', +m[1]);
    if (!target) throw new HttpError(404, 'No such account.');
    if (target.role === 'admin' && me.role !== 'admin') throw new HttpError(403, "Only an admin can reset an admin's password.");
    const temp = tempPassword();
    const { hash, salt } = await hashPassword(temp);
    await db.batch([
      db.prepare('UPDATE users SET pass_hash = ?, pass_salt = ? WHERE id = ?').bind(hash, salt, +m[1]),
      db.prepare('DELETE FROM sessions WHERE user_id = ?').bind(+m[1])
    ]);
    return json({ password: temp });
  }

  // lessons
  if (path === '/api/admin/lessons' && method === 'GET') {
    return json({ lessons: await all(db, 'SELECT * FROM lessons ORDER BY program, level, position, id') });
  }
  if (path === '/api/admin/lessons' && method === 'POST') {
    const v = lessonFields(await body(request), true);
    const r = await run(db, `INSERT INTO lessons (program, level, position, title, summary, video_url, body, published, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`, v.program, v.level, v.position, v.title, v.summary, v.video_url, v.body, v.published, now());
    return json({ lesson: await first(db, 'SELECT * FROM lessons WHERE id = ?', r.meta.last_row_id) }, 201);
  }
  if ((m = path.match(/^\/api\/admin\/lessons\/(\d+)$/))) {
    if (method === 'PATCH') {
      await update(db, 'lessons', +m[1], lessonFields(await body(request), false));
      return json({ lesson: await first(db, 'SELECT * FROM lessons WHERE id = ?', +m[1]) });
    }
    if (method === 'DELETE') {
      await db.batch([
        db.prepare('DELETE FROM progress WHERE lesson_id = ?').bind(+m[1]),
        db.prepare('UPDATE submissions SET lesson_id = NULL WHERE lesson_id = ?').bind(+m[1]),
        db.prepare('DELETE FROM lessons WHERE id = ?').bind(+m[1])
      ]);
      return json({ ok: true });
    }
  }

  // live call-ins
  if (path === '/api/admin/callins' && method === 'GET') {
    return json({ callins: await all(db, 'SELECT * FROM callins ORDER BY position, id') });
  }
  if (path === '/api/admin/callins' && method === 'POST') {
    const v = callinFields(await body(request), true);
    const r = await run(db, 'INSERT INTO callins (day, title, note, time_text, color, link, position, active) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
      v.day, v.title, v.note, v.time_text, v.color, v.link, v.position, v.active);
    return json({ callin: await first(db, 'SELECT * FROM callins WHERE id = ?', r.meta.last_row_id) }, 201);
  }
  if ((m = path.match(/^\/api\/admin\/callins\/(\d+)$/))) {
    if (method === 'PATCH') {
      await update(db, 'callins', +m[1], callinFields(await body(request), false));
      return json({ callin: await first(db, 'SELECT * FROM callins WHERE id = ?', +m[1]) });
    }
    if (method === 'DELETE') { await run(db, 'DELETE FROM callins WHERE id = ?', +m[1]); return json({ ok: true }); }
  }

  // feedback
  if (path === '/api/admin/submissions' && method === 'GET') {
    return json({ submissions: await all(db, `SELECT s.*, u.name AS student_name, u.email AS student_email, l.title AS lesson_title
      FROM submissions s JOIN users u ON u.id = s.user_id LEFT JOIN lessons l ON l.id = s.lesson_id
      ORDER BY (s.status = 'new') DESC, s.created_at DESC LIMIT 500`) });
  }
  if ((m = path.match(/^\/api\/admin\/submissions\/(\d+)$/)) && method === 'PATCH') {
    const b = await body(request);
    const feedback = text(b.feedback, 6000);
    await run(db, "UPDATE submissions SET feedback = ?, status = 'reviewed', reviewed_by = ?, reviewed_at = ? WHERE id = ?",
      feedback, me.name, now(), +m[1]);
    return json({ ok: true });
  }

  // announcements
  if (path === '/api/admin/announcements' && method === 'GET') {
    return json({ announcements: await all(db, 'SELECT * FROM announcements ORDER BY pinned DESC, created_at DESC') });
  }
  if (path === '/api/admin/announcements' && method === 'POST') {
    const b = await body(request);
    const title = required(text(b.title, 140), 'a title');
    await run(db, 'INSERT INTO announcements (title, body, pinned, created_at) VALUES (?, ?, ?, ?)',
      title, text(b.body, 4000), b.pinned ? 1 : 0, now());
    return json({ ok: true }, 201);
  }
  if ((m = path.match(/^\/api\/admin\/announcements\/(\d+)$/))) {
    if (method === 'PATCH') {
      const b = await body(request), sets = {};
      if (b.title !== undefined) sets.title = required(text(b.title, 140), 'a title');
      if (b.body !== undefined) sets.body = text(b.body, 4000);
      if (b.pinned !== undefined) sets.pinned = b.pinned ? 1 : 0;
      await update(db, 'announcements', +m[1], sets);
      return json({ ok: true });
    }
    if (method === 'DELETE') { await run(db, 'DELETE FROM announcements WHERE id = ?', +m[1]); return json({ ok: true }); }
  }

  throw new HttpError(404, 'Not found.');
}

/* ------------------------------------------------------------------ */
/* public                                                              */
/* ------------------------------------------------------------------ */

async function createLead(db, b) {
  if (b.website) return json({ ok: true });            // the hidden field only bots fill in
  const name = required(text(b.name, 120), 'your name');
  const email = emailAddress(b.email);
  // the same address asking twice in ten minutes is a double-click, not a new lead
  const dupe = await first(db, 'SELECT id FROM leads WHERE email = ? AND created_at > ?', email, now() - 600);
  if (!dupe) {
    await run(db, `INSERT INTO leads (name, email, learner, program, format, experience, when_pref, message, status, notes, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'new', '', ?)`,
      name, email, text(b.learner, 60), text(b.program, 40), text(b.format, 60), text(b.experience, 60),
      text(b.when, 60), text(b.message, 2000), now());
  }
  return json({ ok: true }, 201);
}

/* ------------------------------------------------------------------ */
/* accounts                                                            */
/* ------------------------------------------------------------------ */

async function register(db, b, url) {
  const name = required(text(b.name, 120), 'your name');
  const email = emailAddress(b.email);
  const password = newPassword(b.password);
  if (await first(db, 'SELECT id FROM users WHERE email = ?', email)) {
    throw new HttpError(409, 'There is already an account with that email. Try signing in.');
  }
  const count = (await first(db, 'SELECT COUNT(*) AS n FROM users')).n;
  const role = count === 0 ? 'admin' : 'student';
  const status = count === 0 ? 'active' : 'pending';
  const programs = PROGRAMS.includes(b.program) ? b.program : '';
  const { hash, salt } = await hashPassword(password);
  const r = await run(db, `INSERT INTO users (email, name, pass_hash, pass_salt, role, status, programs, created_at, last_login)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`, email, name, hash, salt, role, status, programs, now(), now());
  const user = await first(db, 'SELECT * FROM users WHERE id = ?', r.meta.last_row_id);
  return withSession(db, user, url, 201);
}

async function login(db, b, url) {
  const email = String(b.email || '').trim().toLowerCase();
  const password = String(b.password || '');
  const since = now() - 15 * 60;
  const tries = (await first(db, 'SELECT COUNT(*) AS n FROM login_attempts WHERE email = ? AND at > ?', email, since)).n;
  if (tries >= 8) throw new HttpError(429, 'Too many attempts. Please wait 15 minutes and try again.');
  const user = await first(db, 'SELECT * FROM users WHERE email = ?', email);
  const ok = user && await checkPassword(password, user.pass_hash, user.pass_salt);
  if (!ok) {
    await run(db, 'INSERT INTO login_attempts (email, at) VALUES (?, ?)', email, now());
    throw new HttpError(401, "That email and password don't match.");
  }
  await db.batch([
    db.prepare('DELETE FROM login_attempts WHERE email = ?').bind(email),
    db.prepare('DELETE FROM login_attempts WHERE at < ?').bind(since),
    db.prepare('DELETE FROM sessions WHERE expires_at < ?').bind(now()),
    db.prepare('UPDATE users SET last_login = ? WHERE id = ?').bind(now(), user.id)
  ]);
  return withSession(db, user, url, 200);
}

async function logout(db, request, url) {
  const token = readCookie(request, COOKIE);
  if (token) await run(db, 'DELETE FROM sessions WHERE token_hash = ?', await sha256(token));
  return json({ ok: true }, 200, { 'Set-Cookie': cookie('', url, 0) });
}

async function withSession(db, user, url, status) {
  const token = b64url(crypto.getRandomValues(new Uint8Array(32)));
  await run(db, 'INSERT INTO sessions (token_hash, user_id, created_at, expires_at) VALUES (?, ?, ?, ?)',
    await sha256(token), user.id, now(), now() + SESSION_DAYS * 86400);
  return json({ user: publicUser(user) }, status, { 'Set-Cookie': cookie(token, url, SESSION_DAYS * 86400) });
}

async function currentUser(db, request) {
  const token = readCookie(request, COOKIE);
  if (!token) return null;
  return first(db, `SELECT u.* FROM sessions s JOIN users u ON u.id = s.user_id
    WHERE s.token_hash = ? AND s.expires_at > ?`, await sha256(token), now());
}

async function updateMe(db, me, b) {
  const sets = {};
  if (b.name !== undefined) sets.name = required(text(b.name, 120), 'your name');
  if (b.new_password !== undefined) {
    if (!await checkPassword(String(b.current_password || ''), me.pass_hash, me.pass_salt)) {
      throw new HttpError(400, 'Your current password is not right.');
    }
    const { hash, salt } = await hashPassword(newPassword(b.new_password));
    sets.pass_hash = hash; sets.pass_salt = salt;
  }
  await update(db, 'users', me.id, sets);
  return json({ user: publicUser(await first(db, 'SELECT * FROM users WHERE id = ?', me.id)) });
}

/* ------------------------------------------------------------------ */
/* the Hub                                                             */
/* ------------------------------------------------------------------ */

async function hubHome(db, me) {
  const [lessons, done, callins, announcements, feedback, counts] = await Promise.all([
    all(db, 'SELECT id, program, level, position, title, summary FROM lessons WHERE published = 1 ORDER BY program, level, position, id'),
    all(db, 'SELECT lesson_id, done_at FROM progress WHERE user_id = ?', me.id),
    all(db, 'SELECT * FROM callins WHERE active = 1 ORDER BY position, id'),
    all(db, 'SELECT * FROM announcements ORDER BY pinned DESC, created_at DESC LIMIT 5'),
    all(db, `SELECT s.id, s.title, s.feedback, s.reviewed_by, s.reviewed_at FROM submissions s
      WHERE s.user_id = ? AND s.status = 'reviewed' ORDER BY s.reviewed_at DESC LIMIT 3`, me.id),
    first(db, `SELECT COUNT(*) AS uploads, SUM(status = 'reviewed') AS reviewed FROM submissions WHERE user_id = ?`, me.id)
  ]);
  const doneSet = new Set(done.map(d => d.lesson_id));
  const programs = {};
  for (const p of ['piano', 'production']) {
    const list = lessons.filter(l => l.program === p);
    const next = list.find(l => !doneSet.has(l.id)) || null;
    programs[p] = { total: list.length, done: list.filter(l => doneSet.has(l.id)).length, next };
  }
  const pub = new Set(lessons.map(l => l.id));
  const stats = {
    done: done.filter(d => pub.has(d.lesson_id)).length,
    uploads: counts.uploads || 0,
    reviewed: counts.reviewed || 0,
    // when lessons were ticked, for the streak; the browser counts days in its own time zone
    done_times: done.map(d => d.done_at).filter(t => t > now() - 120 * 86400)
  };
  return json({ user: publicUser(me), programs, callins, announcements, feedback, stats });
}

async function hubLessons(db, me) {
  const [lessons, done] = await Promise.all([
    all(db, 'SELECT id, program, level, position, title, summary, video_url FROM lessons WHERE published = 1 ORDER BY program, level, position, id'),
    all(db, 'SELECT lesson_id FROM progress WHERE user_id = ?', me.id)
  ]);
  const doneSet = new Set(done.map(d => d.lesson_id));
  return json({ lessons: lessons.map(l => ({ ...l, has_video: !!l.video_url, video_url: undefined, done: doneSet.has(l.id) })) });
}

async function hubLesson(db, me, id) {
  const lesson = await first(db, 'SELECT * FROM lessons WHERE id = ? AND (published = 1 OR ?)', id, isStaff(me) ? 1 : 0);
  if (!lesson) throw new HttpError(404, 'That lesson is not available.');
  const done = await first(db, 'SELECT 1 AS d FROM progress WHERE user_id = ? AND lesson_id = ?', me.id, id);
  const siblings = await all(db, 'SELECT id, title FROM lessons WHERE program = ? AND published = 1 ORDER BY level, position, id', lesson.program);
  const i = siblings.findIndex(s => s.id === id);
  return json({ lesson: { ...lesson, done: !!done }, prev: siblings[i - 1] || null, next: siblings[i + 1] || null });
}

async function setProgress(db, me, id, b) {
  if (b.done) await run(db, 'INSERT OR IGNORE INTO progress (user_id, lesson_id, done_at) VALUES (?, ?, ?)', me.id, id, now());
  else await run(db, 'DELETE FROM progress WHERE user_id = ? AND lesson_id = ?', me.id, id);
  return json({ ok: true });
}

async function mySubmissions(db, me) {
  return json({ submissions: await all(db, `SELECT s.*, l.title AS lesson_title FROM submissions s
    LEFT JOIN lessons l ON l.id = s.lesson_id WHERE s.user_id = ? ORDER BY s.created_at DESC`, me.id) });
}

async function createSubmission(db, me, b) {
  const title = required(text(b.title, 140), 'a title');
  const link = linkUrl(b.url, true);
  const lessonId = b.lesson_id ? +b.lesson_id : null;
  await run(db, `INSERT INTO submissions (user_id, lesson_id, title, url, note, status, feedback, created_at)
    VALUES (?, ?, ?, ?, ?, 'new', '', ?)`, me.id, lessonId, title, link, text(b.note, 2000), now());
  return json({ ok: true }, 201);
}

/* ------------------------------------------------------------------ */
/* admin                                                               */
/* ------------------------------------------------------------------ */

async function adminOverview(db) {
  const weekAgo = now() - 7 * 86400;
  const twoWeeks = now() - 15 * 86400;
  const [c, leads, pending, queue, leadTimes, studentPrograms, activity] = await Promise.all([
    first(db, `SELECT
      (SELECT COUNT(*) FROM users WHERE role = 'student' AND status = 'active') AS students,
      (SELECT COUNT(*) FROM users WHERE status = 'pending') AS pending,
      (SELECT COUNT(*) FROM leads WHERE status = 'new') AS new_leads,
      (SELECT COUNT(*) FROM leads WHERE created_at > ?) AS leads_week,
      (SELECT COUNT(*) FROM submissions WHERE status = 'new') AS to_review,
      (SELECT COUNT(*) FROM lessons WHERE published = 1) AS lessons,
      (SELECT COUNT(*) FROM progress WHERE done_at > ?) AS completions_week`, weekAgo, weekAgo),
    all(db, 'SELECT * FROM leads ORDER BY created_at DESC LIMIT 5'),
    all(db, "SELECT id, name, email, programs, created_at FROM users WHERE status = 'pending' ORDER BY created_at DESC LIMIT 5"),
    all(db, `SELECT s.id, s.title, s.created_at, u.name AS student_name FROM submissions s JOIN users u ON u.id = s.user_id
      WHERE s.status = 'new' ORDER BY s.created_at LIMIT 5`),
    // bucketed into days in the browser, so the days are the viewer's own
    all(db, 'SELECT created_at FROM leads WHERE created_at > ?', twoWeeks),
    all(db, "SELECT programs FROM users WHERE role = 'student' AND status = 'active'"),
    all(db, `SELECT * FROM (
        SELECT 'signup' AS kind, u.name AS who, '' AS what, u.created_at AS at, u.id AS ref FROM users u
        UNION ALL SELECT 'lead', l.name, l.program, l.created_at, l.id FROM leads l
        UNION ALL SELECT 'done', u.name, ls.title, p.done_at, ls.id FROM progress p JOIN users u ON u.id = p.user_id JOIN lessons ls ON ls.id = p.lesson_id
        UNION ALL SELECT 'upload', u.name, s.title, s.created_at, s.id FROM submissions s JOIN users u ON u.id = s.user_id
      ) ORDER BY at DESC LIMIT 12`)
  ]);
  const programs = Object.fromEntries(PROGRAMS.map(p => [p, 0]));
  for (const u of studentPrograms) for (const p of (u.programs || '').split(',')) if (p in programs) programs[p]++;
  return json({ counts: c, leads, pending, queue, lead_times: leadTimes.map(r => r.created_at), programs, activity });
}

async function adminCreateUser(db, me, b) {
  const name = required(text(b.name, 120), 'a name');
  const email = emailAddress(b.email);
  if (await first(db, 'SELECT id FROM users WHERE email = ?', email)) throw new HttpError(409, 'That email already has an account.');
  const role = b.role && me.role === 'admin' ? oneOf(b.role, ['student', 'teacher', 'admin'], 'role') : 'student';
  const temp = tempPassword();
  const { hash, salt } = await hashPassword(temp);
  await run(db, `INSERT INTO users (email, name, pass_hash, pass_salt, role, status, programs, created_at, last_login)
    VALUES (?, ?, ?, ?, ?, 'active', ?, ?, NULL)`, email, name, hash, salt, role, programList(b.programs), now());
  return json({ password: temp }, 201);
}

async function adminUpdateUser(db, me, id, b) {
  const target = await first(db, 'SELECT * FROM users WHERE id = ?', id);
  if (!target) throw new HttpError(404, 'No such account.');
  const sets = {};
  if (b.name !== undefined) sets.name = required(text(b.name, 120), 'a name');
  if (b.status !== undefined) sets.status = oneOf(b.status, ['pending', 'active', 'paused'], 'status');
  if (b.programs !== undefined) sets.programs = programList(b.programs);
  if (b.notes !== undefined) sets.notes = text(b.notes, 4000);
  if (b.role !== undefined && b.role !== target.role) {
    if (me.role !== 'admin') throw new HttpError(403, 'Only an admin can change roles.');
    if (id === me.id) throw new HttpError(400, "You can't change your own role.");
    sets.role = oneOf(b.role, ['student', 'teacher', 'admin'], 'role');
  }
  if (target.role === 'admin' && me.role !== 'admin' && Object.keys(sets).length) {
    throw new HttpError(403, "Only an admin can change an admin's account.");
  }
  await update(db, 'users', id, sets);
  if (sets.status === 'paused') await run(db, 'DELETE FROM sessions WHERE user_id = ?', id);
  return json({ user: adminUser(await first(db, 'SELECT * FROM users WHERE id = ?', id)) });
}

/* ------------------------------------------------------------------ */
/* field checks                                                        */
/* ------------------------------------------------------------------ */

function lessonFields(b, creating) {
  const v = {};
  if (creating || b.program !== undefined) v.program = oneOf(b.program, ['piano', 'production'], 'program');
  if (creating || b.level !== undefined) v.level = clampInt(b.level, 1, 4, 1);
  if (creating || b.position !== undefined) v.position = clampInt(b.position, 0, 999, 0);
  if (creating || b.title !== undefined) v.title = required(text(b.title, 140), 'a title');
  if (creating || b.summary !== undefined) v.summary = text(b.summary, 600);
  if (creating || b.video_url !== undefined) v.video_url = linkUrl(b.video_url, false);
  if (creating || b.body !== undefined) v.body = text(b.body, 10000);
  if (creating || b.published !== undefined) v.published = b.published ? 1 : 0;
  return v;
}

function callinFields(b, creating) {
  const v = {};
  if (creating || b.day !== undefined) v.day = oneOf(b.day, DAYS, 'day');
  if (creating || b.title !== undefined) v.title = required(text(b.title, 80), 'a title');
  if (creating || b.note !== undefined) v.note = text(b.note, 200);
  if (creating || b.time_text !== undefined) v.time_text = required(text(b.time_text, 40), 'a time');
  if (creating || b.color !== undefined) v.color = oneOf(b.color || 'orange', ['orange', 'pink', 'lime', 'violet', 'sky', 'sun'], 'colour');
  if (creating || b.link !== undefined) v.link = linkUrl(b.link, false);
  if (creating || b.position !== undefined) v.position = clampInt(b.position, 0, 999, 0);
  if (creating || b.active !== undefined) v.active = b.active === undefined ? 1 : (b.active ? 1 : 0);
  return v;
}

function text(v, max) { return String(v ?? '').trim().slice(0, max); }
function required(v, what) { if (!v) throw new HttpError(400, `Please add ${what}.`); return v; }
function oneOf(v, list, what) { if (!list.includes(v)) throw new HttpError(400, `That ${what} isn't one we know.`); return v; }
function clampInt(v, lo, hi, dflt) { const n = parseInt(v, 10); return Number.isFinite(n) ? Math.min(hi, Math.max(lo, n)) : dflt; }
function emailAddress(v) {
  const e = String(v || '').trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e) || e.length > 200) throw new HttpError(400, 'Please enter a valid email address.');
  return e;
}
function newPassword(v) {
  const p = String(v || '');
  if (p.length < 8) throw new HttpError(400, 'Passwords need at least 8 characters.');
  if (p.length > 200) throw new HttpError(400, 'That password is too long.');
  return p;
}
function linkUrl(v, need) {
  const s = String(v || '').trim();
  if (!s) { if (need) throw new HttpError(400, 'Please add a link.'); return ''; }
  let u;
  try { u = new URL(s); } catch { throw new HttpError(400, 'That link does not look right. It should start with https://'); }
  if (u.protocol !== 'https:' && u.protocol !== 'http:') throw new HttpError(400, 'Links must start with https://');
  return u.toString().slice(0, 1000);
}
function programList(v) {
  const list = Array.isArray(v) ? v : String(v || '').split(',');
  return list.map(s => String(s).trim()).filter(s => PROGRAMS.includes(s)).join(',');
}

function isStaff(u) { return u && (u.role === 'admin' || u.role === 'teacher'); }
function publicUser(u) {
  return { id: u.id, name: u.name, email: u.email, role: u.role, status: u.status,
    programs: u.programs ? u.programs.split(',') : [], created_at: u.created_at };
}
function adminUser(u) {
  return { ...publicUser(u), notes: u.notes || '', last_login: u.last_login,
    lessons_done: u.lessons_done ?? undefined, submissions: u.submissions ?? undefined };
}

/* ------------------------------------------------------------------ */
/* crypto                                                              */
/* ------------------------------------------------------------------ */

async function hashPassword(password, saltB64) {
  const salt = saltB64 ? b64decode(saltB64) : crypto.getRandomValues(new Uint8Array(16));
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(password), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt, iterations: PBKDF2_ITERATIONS }, key, 256);
  return { hash: b64(new Uint8Array(bits)), salt: b64(salt) };
}
async function checkPassword(password, hash, salt) {
  if (!hash || !salt) return false;
  const { hash: h } = await hashPassword(password, salt);
  const a = new TextEncoder().encode(h), b = new TextEncoder().encode(hash);
  return a.length === b.length && crypto.subtle.timingSafeEqual(a, b);
}
async function sha256(s) {
  return b64(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s))));
}
function tempPassword() {
  const words = ['piano', 'chord', 'tempo', 'groove', 'beat', 'synth', 'melody', 'bass', 'drums', 'remix', 'major', 'minor', 'scale', 'treble'];
  const r = crypto.getRandomValues(new Uint32Array(3));
  return `${words[r[0] % words.length]}-${words[r[1] % words.length]}-${1000 + (r[2] % 9000)}`;
}
function b64(bytes) { let s = ''; bytes.forEach(b => { s += String.fromCharCode(b); }); return btoa(s); }
function b64url(bytes) { return b64(bytes).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, ''); }
function b64decode(s) { return Uint8Array.from(atob(s), c => c.charCodeAt(0)); }

/* ------------------------------------------------------------------ */
/* http                                                                */
/* ------------------------------------------------------------------ */

class HttpError extends Error { constructor(status, message) { super(message); this.status = status; } }

function json(data, status = 200, headers = {}) {
  return new Response(JSON.stringify(data), {
    status, headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', ...headers }
  });
}
async function body(request) {
  const type = request.headers.get('Content-Type') || '';
  if (type.includes('application/json')) { try { return await request.json(); } catch { throw new HttpError(400, 'Bad request.'); } }
  if (type.includes('form')) return Object.fromEntries(await request.formData());
  throw new HttpError(415, 'Send JSON.');
}
/* A request that changes something must come from this site. Browsers
   always send Origin on such requests, so a missing or foreign one is
   refused. With SameSite=Lax cookies this closes cross-site forgery. */
function checkOrigin(request, url) {
  const origin = request.headers.get('Origin');
  if (!origin || new URL(origin).host !== url.host) throw new HttpError(403, 'Request refused.');
}
function readCookie(request, name) {
  const all = request.headers.get('Cookie') || '';
  for (const part of all.split(/;\s*/)) {
    const i = part.indexOf('=');
    if (i > 0 && part.slice(0, i) === name) return decodeURIComponent(part.slice(i + 1));
  }
  return null;
}
function cookie(value, url, maxAge) {
  const secure = url.protocol === 'https:' ? '; Secure' : '';
  return `${COOKIE}=${value}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAge}${secure}`;
}

/* ------------------------------------------------------------------ */
/* database                                                            */
/* ------------------------------------------------------------------ */

const now = () => Math.floor(Date.now() / 1000);
const all = async (db, sql, ...args) => (await db.prepare(sql).bind(...args).all()).results;
const first = (db, sql, ...args) => db.prepare(sql).bind(...args).first();
const run = (db, sql, ...args) => db.prepare(sql).bind(...args).run();

async function update(db, table, id, sets) {
  const keys = Object.keys(sets);
  if (!keys.length) return;
  // keys only ever come from the field checks above, never from the request
  await run(db, `UPDATE ${table} SET ${keys.map(k => `${k} = ?`).join(', ')} WHERE id = ?`, ...keys.map(k => sets[k]), id);
}

let schemaReady = false;
async function ensureSchema(db) {
  if (schemaReady) return;
  await db.batch([
    `CREATE TABLE IF NOT EXISTS users (id INTEGER PRIMARY KEY, email TEXT NOT NULL UNIQUE, name TEXT NOT NULL,
      pass_hash TEXT, pass_salt TEXT, role TEXT NOT NULL DEFAULT 'student', status TEXT NOT NULL DEFAULT 'pending',
      programs TEXT NOT NULL DEFAULT '', notes TEXT NOT NULL DEFAULT '', created_at INTEGER NOT NULL, last_login INTEGER)`,
    `CREATE TABLE IF NOT EXISTS sessions (token_hash TEXT PRIMARY KEY, user_id INTEGER NOT NULL,
      created_at INTEGER NOT NULL, expires_at INTEGER NOT NULL)`,
    `CREATE INDEX IF NOT EXISTS sessions_user ON sessions (user_id)`,
    `CREATE TABLE IF NOT EXISTS login_attempts (email TEXT NOT NULL, at INTEGER NOT NULL)`,
    `CREATE INDEX IF NOT EXISTS login_attempts_email ON login_attempts (email, at)`,
    `CREATE TABLE IF NOT EXISTS leads (id INTEGER PRIMARY KEY, name TEXT NOT NULL, email TEXT NOT NULL, learner TEXT,
      program TEXT, format TEXT, experience TEXT, when_pref TEXT, message TEXT, status TEXT NOT NULL DEFAULT 'new',
      notes TEXT NOT NULL DEFAULT '', created_at INTEGER NOT NULL)`,
    `CREATE TABLE IF NOT EXISTS lessons (id INTEGER PRIMARY KEY, program TEXT NOT NULL, level INTEGER NOT NULL,
      position INTEGER NOT NULL DEFAULT 0, title TEXT NOT NULL, summary TEXT NOT NULL DEFAULT '', video_url TEXT NOT NULL DEFAULT '',
      body TEXT NOT NULL DEFAULT '', published INTEGER NOT NULL DEFAULT 1, created_at INTEGER NOT NULL)`,
    `CREATE TABLE IF NOT EXISTS progress (user_id INTEGER NOT NULL, lesson_id INTEGER NOT NULL, done_at INTEGER NOT NULL,
      PRIMARY KEY (user_id, lesson_id))`,
    `CREATE TABLE IF NOT EXISTS callins (id INTEGER PRIMARY KEY, day TEXT NOT NULL, title TEXT NOT NULL, note TEXT NOT NULL DEFAULT '',
      time_text TEXT NOT NULL, color TEXT NOT NULL DEFAULT 'orange', link TEXT NOT NULL DEFAULT '',
      position INTEGER NOT NULL DEFAULT 0, active INTEGER NOT NULL DEFAULT 1)`,
    `CREATE TABLE IF NOT EXISTS submissions (id INTEGER PRIMARY KEY, user_id INTEGER NOT NULL, lesson_id INTEGER, title TEXT NOT NULL,
      url TEXT NOT NULL, note TEXT NOT NULL DEFAULT '', status TEXT NOT NULL DEFAULT 'new', feedback TEXT NOT NULL DEFAULT '',
      reviewed_by TEXT, reviewed_at INTEGER, created_at INTEGER NOT NULL)`,
    `CREATE TABLE IF NOT EXISTS announcements (id INTEGER PRIMARY KEY, title TEXT NOT NULL, body TEXT NOT NULL DEFAULT '',
      pinned INTEGER NOT NULL DEFAULT 0, created_at INTEGER NOT NULL)`
  ].map(sql => db.prepare(sql)));
  await seed(db);
  schemaReady = true;
}

/* Starter content, written once, so the Hub is never an empty room.
   Everything here can be edited or deleted from the admin dashboard. */
async function seed(db) {
  const t = now();
  if (!(await first(db, 'SELECT COUNT(*) AS n FROM callins')).n) {
    const callins = [
      ['Tue', 'Piano by Ear Live', 'Bring a song you love. We work out the chords together.', '7:00 PM ET', 'orange'],
      ['Thu', 'Producer Lab Live', 'Share your screen, get feedback on your beat in Fender Studio.', '7:00 PM ET', 'violet'],
      ['Sat', 'Teen Beat Club', 'Monthly challenge, listening party and shout-outs. Ages 12-18.', '5:30 PM ET', 'sun'],
      ['Sun', 'Open Office Hours', 'Stuck on something? Drop in with any question, any level.', '6:00 PM ET', 'sky']
    ];
    await db.batch(callins.map((c, i) => db.prepare(
      'INSERT INTO callins (day, title, note, time_text, color, link, position, active) VALUES (?, ?, ?, ?, ?, \'\', ?, 1)').bind(...c, i)));
  }
  if (!(await first(db, 'SELECT COUNT(*) AS n FROM lessons')).n) {
    const L = [
      ['piano', 1, 'Welcome: find your way around the keys', 'The pattern of black and white keys, finding C anywhere, and how to sit and hold your hands.', 'Find every C on your keyboard, top to bottom.\nPlay C to C with your right thumb on C, then your left.\nFive minutes a day: name each white key out loud as you play it.'],
      ['piano', 1, 'The major scale and the number system', 'Why musicians count 1 to 7 instead of saying letters, and the major scale in C.', 'Play the C major scale hands separately, slowly.\nSay the numbers 1 to 7 as you play.\nPlay 1, 4 and 5 and listen to how each one feels.'],
      ['piano', 2, 'Your first chords: 1, 4 and 5', 'Build major triads on 1, 4 and 5 and play your first progression.', 'Play C, F and G chords with your right hand.\nAdd the root note in your left hand.\nLoop 1-4-5-1 for two minutes without stopping.'],
      ['piano', 2, 'Inversions for smooth changes', 'Move between chords without jumping around the keyboard.', 'Learn the three positions of C major.\nPlay 1-4-5 using the closest inversion each time.\nRecord yourself and listen for smooth changes.'],
      ['piano', 3, 'Find the key of any song', 'A simple routine to land on the key of a recording in under a minute.', 'Pick a song you love and hum the last note of the chorus.\nFind that note on the keyboard: it is usually the 1.\nCheck by playing the 1, 4 and 5 chords along with the song.'],
      ['piano', 3, 'Pick out a melody by ear', 'Train your ear to find a tune note by note.', 'Choose a simple melody you know well.\nFind the first note, then move up or down by ear.\nOnce you have it, add the 1, 4 or 5 chord underneath.'],
      ['piano', 4, 'Sevenths and ninths', 'Add colour to simple chords the way gospel and R&B players do.', 'Turn each chord in 1-4-5 into a seventh chord.\nTry adding the 9 on top.\nPlay a song you know with the new voicings.'],
      ['piano', 4, 'Passing chords and runs', 'Connect chords with movement so your playing breathes.', 'Learn one passing chord between 1 and 4.\nAdd a short run into the chorus.\nPlay along with a recording and fit them in.'],
      ['production', 1, 'Welcome to Fender Studio', 'Install, set up your audio and MIDI, and find your way around the screen.', 'Install Fender Studio (the free version is fine).\nConnect headphones and your MIDI keyboard if you have one.\nCreate a new song and save it with your name.'],
      ['production', 1, 'Your first drum beat', 'Program a kick, snare and hi-hat groove in the piano roll.', 'Make a 4-bar drum pattern at 90 BPM.\nPut the kick on 1 and 3, snare on 2 and 4.\nAdd hi-hats and change one hit to make it yours.'],
      ['production', 2, 'Chords with a MIDI keyboard', 'Write a chord progression and record it into a virtual instrument.', 'Choose a piano or synth instrument.\nRecord the 1-5-6-4 progression over your beat.\nQuantize it and adjust the velocity so it breathes.'],
      ['production', 2, 'Basslines and melodies', 'Write a bassline that locks to your kick and a melody on top.', 'Write a bassline using the root of each chord.\nLine the bass notes up with your kick drum.\nHum a melody, then find it on the keys and record it.'],
      ['production', 3, 'From loop to song', 'Turn an 8-bar loop into an intro, verse, chorus and outro.', 'Duplicate your loop into four sections.\nTake parts out of the intro and verse, bring everything in for the chorus.\nAdd one change in the last chorus.'],
      ['production', 3, 'Recording vocals', 'Set up a mic, record clean takes and choose the best one.', 'Record three takes of one verse.\nListen back and pick the best lines.\nComp them into one take and trim the gaps.'],
      ['production', 4, 'Mixing basics', 'Balance, EQ and compression so your track sounds clear everywhere.', 'Balance every track with only the faders first.\nCut low end from everything except kick and bass.\nCheck the mix on headphones, phone and car.'],
      ['production', 4, 'Finish and share your track', 'Export, a simple master and getting your song out into the world.', 'Add a limiter on the master and bring the level up gently.\nExport a WAV and an MP3.\nShare it in the Hub for feedback.']
    ];
    const pos = {};
    await db.batch(L.map(([program, level, title, summary, body]) => {
      const k = program + level; pos[k] = (pos[k] || 0) + 1;
      return db.prepare(`INSERT INTO lessons (program, level, position, title, summary, video_url, body, published, created_at)
        VALUES (?, ?, ?, ?, ?, '', ?, 1, ?)`).bind(program, level, pos[k], title, summary, body, t);
    }));
  }
  if (!(await first(db, 'SELECT COUNT(*) AS n FROM announcements')).n) {
    await run(db, 'INSERT INTO announcements (title, body, pinned, created_at) VALUES (?, ?, 1, ?)',
      'Welcome to the Hub!', 'Start with Level 1 in Piano by Ear or Production, tick off each lesson as you go, and bring your questions to a live call-in this week.', t);
  }
}
