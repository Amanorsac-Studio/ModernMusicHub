/* The admin dashboard: overview, trial requests, students, lessons,
   live call-ins, the feedback queue and announcements. */
(function(){
  var $ = App.$, $$ = App.$$, esc = App.esc, api = App.api, P = App.PROGRAM;
  var me;
  var LEAD_STATUS = ['new','contacted','booked','enrolled','closed'];
  var LEAD_LABEL = { new:'New', contacted:'Contacted', booked:'Trial booked', enrolled:'Enrolled', closed:'Closed' };
  var PROGRAM_KEYS = ['piano','production','teenlab','online','private'];
  var DAYS = ['Mon','Tue','Wed','Thu','Fri','Sat','Sun'];
  var COLOR_NAME = { orange:'Pop Orange', pink:'Hot Pink', lime:'Lime Pop', violet:'Ultra Violet', sky:'Sky Pop', sun:'Sunshine' };

  App.me().then(function(u){
    me = u;
    if(u.role !== 'admin' && u.role !== 'teacher'){ location.href = 'hub.html'; return; }
    App.shell(u, [
      ['overview','Overview','overview'], ['leads','Trial requests','leads'], ['students','Students','people'],
      ['lessons','Lessons','lessons'], ['live','Live sessions','live'], ['feedback','Feedback','feedback'],
      ['news','Announcements','news'], ['hub','View the Hub','learn']
    ], u.role === 'admin' ? 'Admin' : 'Teacher');
    App.router({ overview:overview, leads:leads, students:students, lessons:lessons, live:live, feedback:feedback, news:news,
      hub:function(){ location.href = 'hub.html'; } }, 'overview');
    refreshCounts();
  });

  function refreshCounts(){
    api('GET', '/admin/overview').then(function(d){
      App.count('leads', d.counts.new_leads); App.count('students', d.counts.pending); App.count('feedback', d.counts.to_review);
    }).catch(function(){});
  }
  function head(kick, title, sub, acts){
    return '<div class="page-h"><div><p class="kick">' + kick + '</p><h1>' + title + '</h1>' + (sub ? '<p>' + sub + '</p>' : '') + '</div>' +
      (acts ? '<div class="acts">' + acts + '</div>' : '') + '</div>';
  }
  function empty(title, text){ return '<div class="card empty">' + App.EMPTY_MARK + '<b>' + title + '</b><p>' + text + '</p></div>'; }
  function progBadges(list){
    return (list || []).map(function(p){ return P[p] ? '<span class="badge soft prog-' + p + '" style="margin:2px 4px 2px 0">' + esc(P[p].name) + '</span>' : ''; }).join('') || '<small>None yet</small>';
  }

  /* ---------- overview ---------- */
  function overview(main){
    return api('GET', '/admin/overview').then(function(d){
      var c = d.counts;
      main.innerHTML = head('Overview', 'Hello, ' + esc(me.name.split(' ')[0]) + '.', 'Here\'s what needs you today.') +
        '<div class="grid g4">' +
          stat('#leads', c.new_leads, 'New trial requests', 'var(--pink)') +
          stat('#students', c.pending, 'Students waiting for approval', 'var(--sun)') +
          stat('#feedback', c.to_review, 'Uploads to review', 'var(--violet)') +
          stat('#students', c.students, 'Active students', 'var(--lime)') +
        '</div>' +
        '<div class="grid g3 mt">' +
          '<div class="card"><div class="card-h"><h2>Latest trial requests</h2><a class="more" href="#leads">All</a></div>' +
            (d.leads.length ? '<div class="rows">' + d.leads.map(function(l){
              return '<a class="row" href="#leads/' + l.id + '"><span class="avatar" style="--k:' + App.colorFor(l.email) + ';width:34px;height:34px;font-size:13px">' + esc(App.initials(l.name)) + '</span>' +
                '<span class="grow"><b>' + esc(l.name) + '</b><small>' + esc(programName(l.program)) + ' &middot; ' + App.when(l.created_at) + '</small></span>' +
                '<span class="badge b-' + l.status + '">' + LEAD_LABEL[l.status] + '</span></a>';
            }).join('') + '</div>' : '<p class="hint">No requests yet. They arrive here from the free trial form on the website.</p>') + '</div>' +
          '<div class="card"><div class="card-h"><h2>Waiting for approval</h2><a class="more" href="#students">All</a></div>' +
            (d.pending.length ? '<div class="rows">' + d.pending.map(function(u){
              return '<a class="row" href="#students/' + u.id + '"><span class="dot" style="--k:var(--sun)"></span><span class="grow"><b>' + esc(u.name) + '</b><small>' + esc(u.email) + '</small></span><small>' + App.when(u.created_at) + '</small></a>';
            }).join('') + '</div>' : '<p class="hint">Nobody waiting. New sign-ups appear here.</p>') + '</div>' +
          '<div class="card"><div class="card-h"><h2>Feedback queue</h2><a class="more" href="#feedback">All</a></div>' +
            (d.queue.length ? '<div class="rows">' + d.queue.map(function(s){
              return '<a class="row" href="#feedback/' + s.id + '"><span class="dot" style="--k:var(--violet)"></span><span class="grow"><b>' + esc(s.title) + '</b><small>' + esc(s.student_name) + ' &middot; ' + App.when(s.created_at) + '</small></span></a>';
            }).join('') + '</div>' : '<p class="hint">All caught up.</p>') + '</div>' +
        '</div>' +
        '<div class="grid g3 mt">' +
          '<div class="card dark"><p class="kick" style="--k:var(--lime)">This week</p><h2 style="font-size:28px;margin:0">' + c.completions_week + ' lessons completed</h2><p>' + c.leads_week + ' trial requests &middot; ' + c.lessons + ' lessons published</p></div>' +
          '<a class="card tint" style="--k:var(--orange);text-decoration:none;color:inherit" href="#lessons"><h2>Add a lesson</h2><p>Paste a YouTube or Vimeo link and the practice steps.</p></a>' +
          '<a class="card tint" style="--k:var(--sky);text-decoration:none;color:inherit" href="#live"><h2>Edit the call-in schedule</h2><p>Changes show on the website and in the Hub straight away.</p></a>' +
        '</div>';
    });
  }
  function stat(href, n, label, k){ return '<a class="card stat" href="' + href + '" style="--k:' + k + '"><b>' + n + '</b><span>' + label + '</span></a>'; }
  function programName(p){ return P[p] ? P[p].name : (p === 'both' ? 'Piano and Production' : p === 'inperson' ? 'Studio visit' : p || 'Not sure yet'); }

  /* ---------- trial requests ---------- */
  function leads(main, openId){
    var filter = 'open';
    return api('GET', '/admin/leads').then(function(d){
      var all = d.leads;
      function draw(){
        var q = ($('#q', main) || {}).value || '';
        var list = all.filter(function(l){
          if(filter === 'open' && (l.status === 'closed' || l.status === 'enrolled')) return false;
          if(filter !== 'open' && filter !== 'all' && l.status !== filter) return false;
          return !q || (l.name + ' ' + l.email + ' ' + l.message).toLowerCase().indexOf(q.toLowerCase()) >= 0;
        });
        $('#list', main).innerHTML = list.length ? '<div class="table-wrap"><table class="t"><thead><tr><th>Name</th><th>Wants</th><th>Where / when</th><th>Status</th><th class="r">Received</th></tr></thead><tbody>' +
          list.map(function(l){
            return '<tr data-id="' + l.id + '"><td><b>' + esc(l.name) + '</b><small>' + esc(l.email) + '</small></td>' +
              '<td>' + esc(programName(l.program)) + '<br><small>' + esc(l.learner || '') + '</small></td>' +
              '<td>' + esc(l.format || '') + '<br><small>' + esc(l.when_pref || '') + '</small></td>' +
              '<td><span class="badge b-' + l.status + '">' + LEAD_LABEL[l.status] + '</span></td><td class="r"><small>' + App.when(l.created_at) + '</small></td></tr>';
          }).join('') + '</tbody></table></div>' : empty('No trial requests here', 'Requests from the free trial form on the website land in this list.');
        $$('#list tr[data-id]', main).forEach(function(tr){ tr.addEventListener('click', function(){ openLead(+tr.getAttribute('data-id')); }); });
      }
      function openLead(id){
        var l = all.filter(function(x){ return x.id === id; })[0]; if(!l) return;
        var d = App.panel(l.name,
          '<dl class="meta"><dt>Email</dt><dd><a href="mailto:' + esc(l.email) + '?subject=' + encodeURIComponent('Your free trial lesson at Modern Music Hub') + '" style="color:#c2410c">' + esc(l.email) + '</a></dd>' +
          '<dt>Learner</dt><dd>' + esc(l.learner || '') + '</dd><dt>Wants</dt><dd>' + esc(programName(l.program)) + '</dd>' +
          '<dt>Where</dt><dd>' + esc(l.format || '') + '</dd><dt>Best time</dt><dd>' + esc(l.when_pref || '') + '</dd>' +
          '<dt>Experience</dt><dd>' + esc(l.experience || '') + '</dd><dt>Received</dt><dd>' + new Date(l.created_at * 1000).toLocaleString() + '</dd></dl>' +
          (l.message ? '<div class="quote">' + esc(l.message) + '</div>' : '') +
          '<form class="f" id="lf"><label>Status<select name="status">' + LEAD_STATUS.map(function(s){ return '<option value="' + s + '"' + (s === l.status ? ' selected' : '') + '>' + LEAD_LABEL[s] + '</option>'; }).join('') + '</select></label>' +
          '<label>Notes<textarea name="notes" placeholder="Called back Tue, trial booked for Sat 10am...">' + esc(l.notes) + '</textarea></label>' +
          '<div class="acts"><button class="btn" type="submit">Save</button>' +
          '<a class="btn ghost" href="mailto:' + esc(l.email) + '?subject=' + encodeURIComponent('Your free trial lesson at Modern Music Hub') + '">Email them</a>' +
          '<button class="btn danger" type="button" id="del">Delete</button></div></form>');
        $('#lf', d).addEventListener('submit', function(e){
          e.preventDefault();
          api('PATCH', '/admin/leads/' + id, App.formData(this)).then(function(r){
            all = all.map(function(x){ return x.id === id ? r.lead : x; }); draw(); refreshCounts(); App.toast('Saved'); d.close();
          }).catch(App.fail);
        });
        $('#del', d).addEventListener('click', function(){
          if(!confirm('Delete this trial request for good?')) return;
          api('DELETE', '/admin/leads/' + id).then(function(){ all = all.filter(function(x){ return x.id !== id; }); draw(); refreshCounts(); d.close(); App.toast('Deleted'); }).catch(App.fail);
        });
      }
      main.innerHTML = head('Trial requests', 'Free trial lessons.', 'Everyone who filled in the form on the website. Reply by email, then move them along.') +
        '<div class="tools"><input type="search" id="q" placeholder="Search name, email or message"><div class="pills" id="pills">' +
          [['open','Open'],['new','New'],['contacted','Contacted'],['booked','Trial booked'],['enrolled','Enrolled'],['closed','Closed'],['all','All']].map(function(p){
            return '<button type="button" data-f="' + p[0] + '" class="' + (p[0] === filter ? 'on' : '') + '">' + p[1] + '</button>';
          }).join('') + '</div></div><div id="list"></div>';
      $('#q', main).addEventListener('input', draw);
      $$('#pills button', main).forEach(function(b){ b.addEventListener('click', function(){ filter = b.getAttribute('data-f'); $$('#pills button', main).forEach(function(x){ x.classList.toggle('on', x === b); }); draw(); }); });
      draw();
      if(openId) openLead(+openId);
    });
  }

  /* ---------- students ---------- */
  function students(main, openId){
    var filter = 'all';
    return api('GET', '/admin/users').then(function(d){
      var all = d.users;
      function draw(){
        var q = ($('#q', main) || {}).value || '';
        var list = all.filter(function(u){
          if(filter === 'pending' && u.status !== 'pending') return false;
          if(filter === 'active' && u.status !== 'active') return false;
          if(filter === 'staff' && u.role === 'student') return false;
          if(PROGRAM_KEYS.indexOf(filter) >= 0 && u.programs.indexOf(filter) < 0) return false;
          return !q || (u.name + ' ' + u.email).toLowerCase().indexOf(q.toLowerCase()) >= 0;
        });
        $('#list', main).innerHTML = list.length ? '<div class="table-wrap"><table class="t"><thead><tr><th>Name</th><th>Programs</th><th>Status</th><th class="r">Lessons done</th><th class="r">Last seen</th></tr></thead><tbody>' +
          list.map(function(u){
            return '<tr data-id="' + u.id + '"><td><div style="display:flex;gap:12px;align-items:center"><span class="avatar" style="--k:' + App.colorFor(u.email) + ';width:34px;height:34px;font-size:13px">' + esc(App.initials(u.name)) + '</span>' +
              '<span><b>' + esc(u.name) + '</b><small>' + esc(u.email) + '</small></span></div></td>' +
              '<td>' + progBadges(u.programs) + '</td>' +
              '<td><span class="badge b-' + u.status + '">' + esc(u.status) + '</span>' + (u.role !== 'student' ? ' <span class="badge b-' + u.role + '">' + esc(u.role) + '</span>' : '') + '</td>' +
              '<td class="r">' + (u.lessons_done || 0) + '</td><td class="r"><small>' + App.when(u.last_login) + '</small></td></tr>';
          }).join('') + '</tbody></table></div>' : empty('Nobody here yet', 'Students appear when they create an account, or when you add them.');
        $$('#list tr[data-id]', main).forEach(function(tr){ tr.addEventListener('click', function(){ openUser(+tr.getAttribute('data-id')); }); });
      }
      function programChecks(sel){
        return '<div class="checks-row">' + PROGRAM_KEYS.map(function(p){
          return '<label><input type="checkbox" name="programs" data-list value="' + p + '"' + (sel.indexOf(p) >= 0 ? ' checked' : '') + '> ' + esc(P[p].name) + '</label>';
        }).join('') + '</div>';
      }
      function roleSelect(cur){
        if(me.role !== 'admin') return '';
        return '<label>Role<select name="role">' + ['student','teacher','admin'].map(function(r){ return '<option value="' + r + '"' + (r === cur ? ' selected' : '') + '>' + r[0].toUpperCase() + r.slice(1) + '</option>'; }).join('') + '</select></label>';
      }
      function openUser(id){
        var u = all.filter(function(x){ return x.id === id; })[0]; if(!u) return;
        var self = u.id === me.id;
        var d = App.panel(u.name,
          (u.status === 'pending' ? '<div class="card tint" style="--k:var(--sun);margin:0 0 18px"><b>Waiting for approval.</b> Choose their programs and approve them to open the Hub.<div class="acts" style="margin-top:12px"><button class="btn" type="button" id="approve">Approve</button></div></div>' : '') +
          '<dl class="meta"><dt>Email</dt><dd><a href="mailto:' + esc(u.email) + '" style="color:#c2410c">' + esc(u.email) + '</a></dd>' +
          '<dt>Joined</dt><dd>' + new Date(u.created_at * 1000).toLocaleDateString() + '</dd><dt>Last seen</dt><dd>' + App.when(u.last_login) + '</dd>' +
          '<dt>Progress</dt><dd>' + (u.lessons_done || 0) + ' lessons done &middot; ' + (u.submissions || 0) + ' uploads</dd></dl>' +
          '<form class="f" id="uf"><label>Name<input name="name" value="' + esc(u.name) + '" required></label>' +
          '<label>Programs</label>' + programChecks(u.programs) +
          '<div class="two"><label>Status<select name="status"' + (self ? ' disabled' : '') + '>' + ['pending','active','paused'].map(function(s){ return '<option value="' + s + '"' + (s === u.status ? ' selected' : '') + '>' + s[0].toUpperCase() + s.slice(1) + '</option>'; }).join('') + '</select></label>' +
          (self ? '' : roleSelect(u.role)) + '</div>' +
          '<label>Teacher notes<textarea name="notes" placeholder="Goals, songs they love, what to work on next...">' + esc(u.notes) + '</textarea><span class="hint">Only staff see these.</span></label>' +
          '<div class="acts"><button class="btn" type="submit">Save</button><button class="btn ghost" type="button" id="reset">Reset password</button>' +
          (me.role === 'admin' && !self ? '<button class="btn danger" type="button" id="del">Remove</button>' : '') + '</div></form><div id="pwbox"></div>');
        function save(extra){
          var body = App.formData($('#uf', d));
          if(self){ delete body.status; delete body.role; }
          Object.keys(extra || {}).forEach(function(k){ body[k] = extra[k]; });
          return api('PATCH', '/admin/users/' + id, body).then(function(r){
            all = all.map(function(x){ return x.id === id ? Object.assign({}, x, r.user, { lessons_done:x.lessons_done, submissions:x.submissions }) : x; });
            draw(); refreshCounts(); App.toast('Saved'); d.close();
          }).catch(App.fail);
        }
        $('#uf', d).addEventListener('submit', function(e){ e.preventDefault(); save(); });
        var ap = $('#approve', d); if(ap) ap.addEventListener('click', function(){ save({ status:'active' }); });
        $('#reset', d).addEventListener('click', function(){
          if(!confirm('Make a new temporary password for ' + u.name + '? Their current password will stop working.')) return;
          api('POST', '/admin/users/' + id + '/reset-password').then(function(r){
            $('#pwbox', d).innerHTML = '<p class="mt"><b>New temporary password.</b> Send it to them; they can change it in Settings.</p>' + App.copyBox(r.password);
          }).catch(App.fail);
        });
        var del = $('#del', d); if(del) del.addEventListener('click', function(){
          if(!confirm('Remove ' + u.name + ' and all their progress and uploads? This cannot be undone.')) return;
          api('DELETE', '/admin/users/' + id).then(function(){ all = all.filter(function(x){ return x.id !== id; }); draw(); refreshCounts(); d.close(); App.toast('Removed'); }).catch(App.fail);
        });
      }
      function addUser(){
        var d = App.panel('Add a student',
          '<form class="f" id="nf"><label>Name<input name="name" required></label><label>Email<input name="email" type="email" required></label>' +
          '<label>Programs</label>' + programChecks([]) + roleSelect('student') +
          '<p class="hint">They\'re approved straight away. You\'ll get a temporary password to send them.</p>' +
          '<div class="acts"><button class="btn" type="submit">Add</button></div></form><div id="pwbox"></div>');
        $('#nf', d).addEventListener('submit', function(e){
          e.preventDefault();
          var f = this;
          api('POST', '/admin/users', App.formData(f)).then(function(r){
            f.hidden = true;
            $('#pwbox', d).innerHTML = '<p><b>Account created.</b> Send them this temporary password and the sign-in link: <b>' + esc(location.origin) + '/login.html</b></p>' + App.copyBox(r.password);
            api('GET', '/admin/users').then(function(x){ all = x.users; draw(); });
          }).catch(App.fail);
        });
      }
      main.innerHTML = head('Students', 'Your students.', 'Approve new sign-ups, set programs and keep notes.', '<button class="btn" type="button" id="add">Add a student</button>') +
        '<div class="tools"><input type="search" id="q" placeholder="Search name or email"><div class="pills" id="pills">' +
          [['all','Everyone'],['pending','Waiting'],['active','Active'],['piano','Piano'],['production','Production'],['teenlab','Teen Lab'],['staff','Staff']].map(function(p){
            return '<button type="button" data-f="' + p[0] + '" class="' + (p[0] === filter ? 'on' : '') + '">' + p[1] + '</button>';
          }).join('') + '</div></div><div id="list"></div>';
      $('#add', main).addEventListener('click', addUser);
      $('#q', main).addEventListener('input', draw);
      $$('#pills button', main).forEach(function(b){ b.addEventListener('click', function(){ filter = b.getAttribute('data-f'); $$('#pills button', main).forEach(function(x){ x.classList.toggle('on', x === b); }); draw(); }); });
      draw();
      if(openId) openUser(+openId);
    });
  }

  /* ---------- lessons ---------- */
  function lessons(main){
    var prog = 'piano';
    return api('GET', '/admin/lessons').then(function(d){
      var all = d.lessons;
      function draw(){
        var list = all.filter(function(l){ return l.program === prog; });
        $('#list', main).innerHTML = [1,2,3,4].map(function(n){
          var ls = list.filter(function(l){ return l.level === n; });
          return '<section class="level" style="--k:' + P[prog].k + '"><div class="level-h"><span class="lv"><span><small>LEVEL</small><span>' + n + '</span></span></span><h3>Level ' + n + '</h3>' +
            '<button class="btn sm ghost" type="button" data-add="' + n + '" style="margin-left:auto">+ Add to level ' + n + '</button></div>' +
            '<div class="lessons">' + (ls.length ? ls.map(function(l){
              return '<a class="lesson-row" href="#" data-id="' + l.id + '"><span class="badge ' + (l.published ? 'b-active' : 'b-draft') + '">' + (l.published ? 'Live' : 'Draft') + '</span>' +
                '<span><b>' + esc(l.title) + '</b><small>' + esc(l.summary) + '</small></span><span class="vid">' + (l.video_url ? App.icon('video') + 'Video' : 'No video yet') + '</span></a>';
            }).join('') : '<p class="hint">No lessons in this level yet.</p>') + '</div></section>';
        }).join('');
        $$('#list [data-id]', main).forEach(function(a){ a.addEventListener('click', function(e){ e.preventDefault(); edit(all.filter(function(x){ return x.id === +a.getAttribute('data-id'); })[0]); }); });
        $$('#list [data-add]', main).forEach(function(b){ b.addEventListener('click', function(){ edit(null, +b.getAttribute('data-add')); }); });
      }
      function edit(l, level){
        var isNew = !l;
        l = l || { program:prog, level:level || 1, position:(all.filter(function(x){ return x.program === prog && x.level === level; }).length + 1), title:'', summary:'', video_url:'', body:'', published:1 };
        var d = App.panel(isNew ? 'New lesson' : 'Edit lesson',
          '<form class="f" id="lf">' +
          '<div class="two"><label>Program<select name="program"><option value="piano"' + (l.program === 'piano' ? ' selected' : '') + '>Piano by Ear</option><option value="production"' + (l.program === 'production' ? ' selected' : '') + '>Music Production</option></select></label>' +
          '<label>Level<select name="level">' + [1,2,3,4].map(function(n){ return '<option' + (n === l.level ? ' selected' : '') + '>' + n + '</option>'; }).join('') + '</select></label></div>' +
          '<label>Title<input name="title" value="' + esc(l.title) + '" required></label>' +
          '<label>Summary<textarea name="summary" style="min-height:70px">' + esc(l.summary) + '</textarea><span class="hint">One or two sentences students see in the list.</span></label>' +
          '<label>Video link<input name="video_url" type="url" value="' + esc(l.video_url) + '" placeholder="https://youtu.be/..."><span class="hint">YouTube or Vimeo links play inside the Hub. Unlisted YouTube videos work well.</span></label>' +
          '<label>Practice steps<textarea name="body" style="min-height:150px" placeholder="One step per line">' + esc(l.body) + '</textarea><span class="hint">One step per line. They show as a numbered checklist.</span></label>' +
          '<div class="two"><label>Order in level<input name="position" type="number" min="0" value="' + l.position + '"></label>' +
          '<label class="check" style="align-self:end"><input type="checkbox" name="published"' + (l.published ? ' checked' : '') + '> Live in the Hub</label></div>' +
          '<div class="acts"><button class="btn" type="submit">' + (isNew ? 'Add lesson' : 'Save') + '</button>' +
          (isNew ? '' : '<a class="btn ghost" href="hub.html#lesson/' + l.id + '" target="_blank" rel="noopener">Preview</a><button class="btn danger" type="button" id="del">Delete</button>') + '</div></form>');
        $('#lf', d).addEventListener('submit', function(e){
          e.preventDefault();
          var b = App.formData(this);
          (isNew ? api('POST', '/admin/lessons', b) : api('PATCH', '/admin/lessons/' + l.id, b)).then(function(r){
            all = isNew ? all.concat([r.lesson]) : all.map(function(x){ return x.id === l.id ? r.lesson : x; });
            all.sort(function(a,b){ return a.program.localeCompare(b.program) || a.level - b.level || a.position - b.position || a.id - b.id; });
            prog = r.lesson.program; syncTabs(); draw(); d.close(); App.toast(isNew ? 'Lesson added' : 'Saved');
          }).catch(App.fail);
        });
        var del = $('#del', d); if(del) del.addEventListener('click', function(){
          if(!confirm('Delete "' + l.title + '"? Students lose their tick for it.')) return;
          api('DELETE', '/admin/lessons/' + l.id).then(function(){ all = all.filter(function(x){ return x.id !== l.id; }); draw(); d.close(); App.toast('Deleted'); }).catch(App.fail);
        });
      }
      function syncTabs(){ $$('.tabs button', main).forEach(function(b){ b.classList.toggle('on', b.getAttribute('data-p') === prog); }); }
      main.innerHTML = head('Lessons', 'The lesson library.', 'What students see in My Learning. Add a video link and practice steps to each lesson.', '<button class="btn" type="button" id="add">New lesson</button>') +
        '<div class="tabs"><button type="button" data-p="piano" class="on" style="--k:var(--orange)">Piano by Ear</button><button type="button" data-p="production" style="--k:var(--violet)">Music Production</button></div><div id="list"></div>';
      $$('.tabs button', main).forEach(function(b){ b.addEventListener('click', function(){ prog = b.getAttribute('data-p'); syncTabs(); draw(); }); });
      $('#add', main).addEventListener('click', function(){ edit(null, 1); });
      draw();
    });
  }

  /* ---------- live call-ins ---------- */
  function live(main){
    return api('GET', '/admin/callins').then(function(d){
      var all = d.callins;
      function draw(){
        $('#list', main).innerHTML = all.length ? '<div class="card"><div class="live">' + all.map(function(c){
          return '<div class="slot" data-id="' + c.id + '" style="--k:var(--' + esc(c.color) + ');cursor:pointer' + (c.active ? '' : ';opacity:.5') + '"><span class="day">' + esc(c.day) + '</span>' +
            '<span><b>' + esc(c.title) + (c.active ? '' : ' (hidden)') + '</b><small>' + esc(c.note) + '</small></span><span class="time">' + esc(c.time_text) + (c.link ? '' : ' &middot; <span style="color:#b42318">no link</span>') + '</span></div>';
        }).join('') + '</div></div>' : empty('No sessions yet', 'Add your first weekly call-in.');
        $$('#list [data-id]', main).forEach(function(el){ el.addEventListener('click', function(){ edit(all.filter(function(x){ return x.id === +el.getAttribute('data-id'); })[0]); }); });
      }
      function edit(c){
        var isNew = !c;
        c = c || { day:'Tue', title:'', note:'', time_text:'7:00 PM ET', color:'orange', link:'', position:all.length, active:1 };
        var d = App.panel(isNew ? 'New live session' : 'Edit live session',
          '<form class="f" id="cf"><div class="two"><label>Day<select name="day">' + DAYS.map(function(x){ return '<option' + (x === c.day ? ' selected' : '') + '>' + x + '</option>'; }).join('') + '</select></label>' +
          '<label>Time<input name="time_text" value="' + esc(c.time_text) + '" required placeholder="7:00 PM ET"></label></div>' +
          '<label>Title<input name="title" value="' + esc(c.title) + '" required></label>' +
          '<label>Description<input name="note" value="' + esc(c.note) + '"></label>' +
          '<label>Meeting link<input name="link" type="url" value="' + esc(c.link) + '" placeholder="https://zoom.us/j/..."><span class="hint">Zoom, Google Meet or similar. Only signed-in students see it; the website shows the time without the link.</span></label>' +
          '<div class="two"><label>Colour<select name="color">' + App.COLORS.map(function(x){ return '<option value="' + x + '"' + (x === c.color ? ' selected' : '') + '>' + COLOR_NAME[x] + '</option>'; }).join('') + '</select></label>' +
          '<label>Order<input name="position" type="number" min="0" value="' + c.position + '"></label></div>' +
          '<label class="check"><input type="checkbox" name="active"' + (c.active ? ' checked' : '') + '> Show on the website and in the Hub</label>' +
          '<p class="hint">Keep weekday sessions after 5 PM.</p>' +
          '<div class="acts"><button class="btn" type="submit">' + (isNew ? 'Add session' : 'Save') + '</button>' + (isNew ? '' : '<button class="btn danger" type="button" id="del">Delete</button>') + '</div></form>');
        $('#cf', d).addEventListener('submit', function(e){
          e.preventDefault();
          var b = App.formData(this);
          (isNew ? api('POST', '/admin/callins', b) : api('PATCH', '/admin/callins/' + c.id, b)).then(function(r){
            all = isNew ? all.concat([r.callin]) : all.map(function(x){ return x.id === c.id ? r.callin : x; });
            all.sort(function(a,b){ return a.position - b.position || a.id - b.id; });
            draw(); d.close(); App.toast('Saved. The website shows it within a minute.');
          }).catch(App.fail);
        });
        var del = $('#del', d); if(del) del.addEventListener('click', function(){
          if(!confirm('Delete "' + c.title + '"?')) return;
          api('DELETE', '/admin/callins/' + c.id).then(function(){ all = all.filter(function(x){ return x.id !== c.id; }); draw(); d.close(); App.toast('Deleted'); }).catch(App.fail);
        });
      }
      main.innerHTML = head('Live sessions', 'Weekly call-ins.', 'The schedule on the Online Hub page and in every student\'s Hub. Add a meeting link so students can join.', '<button class="btn" type="button" id="add">New session</button>') + '<div id="list"></div>';
      $('#add', main).addEventListener('click', function(){ edit(null); });
      draw();
    });
  }

  /* ---------- feedback ---------- */
  function feedback(main, openId){
    var filter = 'new';
    return api('GET', '/admin/submissions').then(function(d){
      var all = d.submissions;
      function draw(){
        var list = all.filter(function(s){ return filter === 'all' || s.status === filter; });
        $('#list', main).innerHTML = list.length ? '<div class="table-wrap"><table class="t"><thead><tr><th>Upload</th><th>Student</th><th>Lesson</th><th>Status</th><th class="r">Sent</th></tr></thead><tbody>' +
          list.map(function(s){
            return '<tr data-id="' + s.id + '"><td><b>' + esc(s.title) + '</b><small>' + esc((s.note || '').slice(0, 80)) + '</small></td><td>' + esc(s.student_name) + '</td>' +
              '<td><small>' + esc(s.lesson_title || '') + '</small></td><td><span class="badge ' + (s.status === 'reviewed' ? 'b-reviewed' : 'b-new') + '">' + (s.status === 'reviewed' ? 'Reviewed' : 'To review') + '</span></td>' +
              '<td class="r"><small>' + App.when(s.created_at) + '</small></td></tr>';
          }).join('') + '</tbody></table></div>' : empty(filter === 'new' ? 'All caught up' : 'No uploads yet', 'Student uploads land here for your feedback.');
        $$('#list tr[data-id]', main).forEach(function(tr){ tr.addEventListener('click', function(){ open(+tr.getAttribute('data-id')); }); });
      }
      function open(id){
        var s = all.filter(function(x){ return x.id === id; })[0]; if(!s) return;
        var src = App.embed(s.url);
        var d = App.panel(s.title,
          (src ? '<div class="video" style="margin:0 0 16px"><iframe src="' + esc(src) + '" title="' + esc(s.title) + '" allowfullscreen loading="lazy"></iframe></div>' : '') +
          '<dl class="meta"><dt>Student</dt><dd>' + esc(s.student_name) + ' &middot; <a href="mailto:' + esc(s.student_email) + '" style="color:#c2410c">' + esc(s.student_email) + '</a></dd>' +
          '<dt>Lesson</dt><dd>' + esc(s.lesson_title || 'Not about a lesson') + '</dd><dt>Link</dt><dd><a href="' + esc(s.url) + '" target="_blank" rel="noopener" style="color:#c2410c">Open</a></dd>' +
          '<dt>Sent</dt><dd>' + new Date(s.created_at * 1000).toLocaleString() + '</dd></dl>' +
          (s.note ? '<div class="quote">' + esc(s.note) + '</div>' : '') +
          '<form class="f" id="ff"><label>Your feedback<textarea name="feedback" style="min-height:170px" required placeholder="What\'s working, and the one thing to fix next...">' + esc(s.feedback) + '</textarea></label>' +
          '<div class="acts"><button class="btn" type="submit">' + (s.status === 'reviewed' ? 'Update feedback' : 'Send feedback') + '</button></div></form>');
        $('#ff', d).addEventListener('submit', function(e){
          e.preventDefault();
          var fb = this.feedback.value;
          api('PATCH', '/admin/submissions/' + id, { feedback: fb }).then(function(){
            all = all.map(function(x){ return x.id === id ? Object.assign({}, x, { status:'reviewed', feedback:fb, reviewed_by:me.name }) : x; });
            draw(); refreshCounts(); d.close(); App.toast('Feedback sent to ' + s.student_name);
          }).catch(App.fail);
        });
      }
      main.innerHTML = head('Feedback', 'Student uploads.', 'Watch or listen, then reply. Students see your feedback in their Hub.') +
        '<div class="tools"><div class="pills" id="pills">' + [['new','To review'],['reviewed','Reviewed'],['all','All']].map(function(p){
          return '<button type="button" data-f="' + p[0] + '" class="' + (p[0] === filter ? 'on' : '') + '">' + p[1] + '</button>';
        }).join('') + '</div></div><div id="list"></div>';
      $$('#pills button', main).forEach(function(b){ b.addEventListener('click', function(){ filter = b.getAttribute('data-f'); $$('#pills button', main).forEach(function(x){ x.classList.toggle('on', x === b); }); draw(); }); });
      draw();
      if(openId) open(+openId);
    });
  }

  /* ---------- announcements ---------- */
  function news(main){
    return api('GET', '/admin/announcements').then(function(d){
      var all = d.announcements;
      main.innerHTML = head('Announcements', 'News for students.', 'Shows on the home screen of every student\'s Hub. Pin the important ones.') +
        '<div class="grid" style="grid-template-columns:minmax(0,1fr) minmax(0,1.2fr)">' +
          '<div class="card"><h2>New announcement</h2><form class="f" id="af"><label>Title<input name="title" required placeholder="Showcase Night is Dec 14!"></label>' +
            '<label>Message<textarea name="body"></textarea></label><label class="check"><input type="checkbox" name="pinned"> Pin to the top</label>' +
            '<div class="acts"><button class="btn" type="submit">Post</button></div></form></div>' +
          '<div>' + (all.length ? all.map(function(a){
            return '<div class="card" style="margin-bottom:14px"><div class="card-h"><h2 style="font-size:17px">' + esc(a.title) + '</h2>' + (a.pinned ? '<span class="badge b-admin">Pinned</span>' : '') +
              '<small class="hint" style="margin-left:auto">' + App.when(a.created_at) + '</small></div>' + (a.body ? '<p style="margin:0 0 12px;white-space:pre-wrap">' + esc(a.body) + '</p>' : '') +
              '<div class="acts" style="display:flex;gap:8px"><button class="btn sm ghost" type="button" data-pin="' + a.id + '" data-v="' + (a.pinned ? 0 : 1) + '">' + (a.pinned ? 'Unpin' : 'Pin') + '</button>' +
              '<button class="btn sm danger" type="button" data-del="' + a.id + '">Delete</button></div></div>';
          }).join('') : empty('Nothing posted', 'Your first announcement will show on every student\'s home screen.')) + '</div></div>';
      if(matchMedia('(max-width:900px)').matches) $('.grid', main).style.gridTemplateColumns = '1fr';
      $('#af', main).addEventListener('submit', function(e){
        e.preventDefault();
        api('POST', '/admin/announcements', App.formData(this)).then(function(){ App.toast('Posted'); news(main); }).catch(App.fail);
      });
      $$('[data-pin]', main).forEach(function(b){ b.addEventListener('click', function(){
        api('PATCH', '/admin/announcements/' + b.getAttribute('data-pin'), { pinned: b.getAttribute('data-v') === '1' }).then(function(){ news(main); }).catch(App.fail);
      }); });
      $$('[data-del]', main).forEach(function(b){ b.addEventListener('click', function(){
        if(!confirm('Delete this announcement?')) return;
        api('DELETE', '/admin/announcements/' + b.getAttribute('data-del')).then(function(){ App.toast('Deleted'); news(main); }).catch(App.fail);
      }); });
    });
  }
})();
