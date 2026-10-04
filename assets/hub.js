/* The student Hub: home, the lesson library, a lesson, live call-ins,
   feedback on your work, and your settings. */
(function(){
  var $ = App.$, $$ = App.$$, esc = App.esc, api = App.api, icon = App.icon, P = App.PROGRAM;
  var user, lessonsCache = null;
  var LEVEL_NAMES = {
    piano:['Find Your Way Around','Chord Builder','Play What You Hear','Make It Sound Pro'],
    production:['First Beat','Chords and Hooks','Arrange and Record','Mix and Release']
  };

  App.me().then(function(u){
    user = u;
    var staff = u.role === 'admin' || u.role === 'teacher';
    if(u.status !== 'active' && !staff){
      App.shell(u, [['home','Home','home'],['settings','Settings','settings']], 'Student Hub');
      App.router({ home:pending, settings:settings }, 'home');
      return;
    }
    var items = [['home','Home','home'],['learn','My Learning','learn'],['live','Live Sessions','live'],['feedback','Feedback','feedback'],['settings','Settings','settings']];
    if(staff) items.push(['admin','Admin dashboard','overview']);
    App.shell(u, items, staff ? 'Hub preview' : 'Student Hub');
    App.actions([['Share my work', '#feedback', 'upload'], ['My lessons', '#learn', 'learn', true]]);
    lesson.parent = 'learn';
    App.router({ home:home, learn:learn, lesson:lesson, live:live, feedback:feedback, settings:settings,
      admin:function(){ location.href = 'admin.html'; } }, 'home');
  });

  /* ---------- waiting for approval ---------- */
  function pending(main){
    main.innerHTML =
      '<div class="hero-card"><p class="kick" style="--k:var(--sun)">Almost there</p>' +
      '<h1>Welcome, <em>' + esc(first(user.name)) + '.</em></h1>' +
      '<p>Your account is set up. A teacher will approve it and add you to your program, usually within a day. You\'ll see your lessons here as soon as that happens.</p>' +
      bars() + '</div>' +
      '<div class="grid g2 mt">' +
        '<div class="card"><h2>While you wait</h2><div class="rows">' +
          '<a class="row" href="plans.html#trial"><span class="dot" style="--k:var(--orange)"></span><span class="grow"><b>Book your free trial lesson</b><small>If you haven\'t already</small></span></a>' +
          '<a class="row" href="online.html#callins"><span class="dot" style="--k:var(--sky)"></span><span class="grow"><b>See this week\'s live call-ins</b><small>Weekday evenings and weekends</small></span></a>' +
          '<a class="row" href="production.html#fender-studio"><span class="dot" style="--k:var(--violet)"></span><span class="grow"><b>Install Fender Studio</b><small>The free version is all you need to start</small></span></a>' +
        '</div></div>' +
        '<div class="card tint" style="--k:var(--sun)"><h2>Questions?</h2><p>Email us any time. We teach after school, in the evenings and on weekends, and reply within a day.</p></div>' +
      '</div>';
  }

  /* ---------- home ---------- */
  function home(main){
    return api('GET', '/hub').then(function(d){
      var cont = ['piano','production'].map(function(p){
        var g = d.programs[p], pct = g.total ? Math.round(100 * g.done / g.total) : 0;
        var next = g.next;
        return '<div class="card" style="--k:' + P[p].k + '">' +
          '<div class="card-h"><span class="badge" style="--k:' + P[p].k + '">' + esc(P[p].name) + '</span><a class="more" href="#learn/' + p + '">All lessons</a></div>' +
          (next
            ? '<a class="next" href="#lesson/' + next.id + '"><span class="thumb">' + icon(p === 'piano' ? 'music' : 'video') + '</span>' +
              '<span><small>Level ' + next.level + ' &middot; up next</small><b>' + esc(next.title) + '</b></span><span class="play">' + icon('play') + '</span></a>'
            : '<p><b>Every lesson done.</b> Brilliant work. Bring something to a live call-in this week.</p>') +
          '<div class="bar mt" style="margin-top:18px"><i style="width:' + pct + '%"></i></div>' +
          '<div class="bar-row"><span>' + g.done + ' of ' + g.total + ' lessons</span><span>' + pct + '%</span></div></div>';
      }).join('');

      var news = d.announcements.length ? d.announcements.map(function(a){
        return '<div class="row"><span class="dot" style="--k:' + (a.pinned ? 'var(--orange)' : 'var(--sky)') + '"></span><span class="grow"><b>' + esc(a.title) + '</b>' +
          (a.body ? '<small style="white-space:normal">' + esc(a.body) + '</small>' : '') + '</span></div>';
      }).join('') : '<p class="hint">Nothing new right now.</p>';

      var fb = d.feedback.length ? d.feedback.map(function(f){
        return '<div class="fb" style="margin-bottom:10px"><b>' + esc(f.title) + '</b>\n' + esc(f.feedback) + '<small>' + esc(f.reviewed_by || 'Your teacher') + ' &middot; ' + App.when(f.reviewed_at) + '</small></div>';
      }).join('') : '<p>Upload a playing video or a track and your teacher will reply here.</p><a class="btn sm" href="#feedback">Share your work</a>';

      var st = d.stats || { done:0, uploads:0, reviewed:0, done_times:[] }, streak = streakDays(st.done_times);
      var strip = '<div class="stats4">' +
        tile('var(--lime)', 'check', st.done, 'lessons done') +
        tile('var(--orange)', 'flame', streak, streak === 1 ? 'day streak' : 'day streak') +
        tile('var(--violet)', 'upload', st.uploads, st.uploads === 1 ? 'piece shared' : 'pieces shared') +
        tile('var(--sky)', 'feedback', st.reviewed, 'feedback received') + '</div>';
      main.innerHTML =
        '<div class="hello">' +
          '<div class="hero-card"><p class="kick" style="--k:var(--sun)">' + greeting() + '</p>' +
            '<h1>Welcome back, <em>' + esc(first(user.name)) + '.</em></h1>' +
            '<p>Keep learning. Keep creating. Pick up where you left off, or bring a question to this week\'s live call-in.</p>' +
            '<a class="btn" href="#learn">Go to my lessons</a>' + bars() + '</div>' +
          '<div class="card"><div class="card-h"><h2>Live this week</h2><a class="more" href="#live">All sessions</a></div>' + liveList(d.callins.slice(0, 3)) + '</div>' +
        '</div>' + strip +
        '<div class="grid g2">' + cont + '</div>' +
        '<div class="grid g2 mt">' +
          '<div class="card"><h2>From your teacher</h2>' + fb + '</div>' +
          '<div class="card"><h2>Announcements</h2><div class="rows">' + news + '</div></div>' +
        '</div>';
    });
  }

  /* ---------- the library ---------- */
  function getLessons(){
    return api('GET', '/hub/lessons').then(function(d){ lessonsCache = d.lessons; return d.lessons; });
  }
  function learn(main, prog){
    prog = prog === 'production' ? 'production' : 'piano';
    return getLessons().then(function(all){
      var list = all.filter(function(l){ return l.program === prog; });
      var levels = [1,2,3,4].map(function(n){
        var ls = list.filter(function(l){ return l.level === n; });
        if(!ls.length) return '';
        var done = ls.filter(function(l){ return l.done; }).length;
        return '<section class="level" style="--k:' + P[prog].k + '">' +
          '<div class="level-h"><span class="lv"><span><small>LEVEL</small><span>' + n + '</span></span></span>' +
          '<div><h3>' + esc(LEVEL_NAMES[prog][n-1]) + '</h3><small class="hint">' + done + ' of ' + ls.length + ' done</small></div>' +
          '<div class="bar"><i style="width:' + Math.round(100*done/ls.length) + '%"></i></div></div>' +
          '<div class="lessons">' + ls.map(function(l){
            return '<a class="lesson-row' + (l.done ? ' done' : '') + '" href="#lesson/' + l.id + '">' +
              '<span class="tick">' + icon('check') + '</span>' +
              '<span><b>' + esc(l.title) + '</b><small>' + esc(l.summary) + '</small></span>' +
              (l.has_video ? '<span class="vid">' + icon('video') + 'Video</span>' : '') + '</a>';
          }).join('') + '</div></section>';
      }).join('');
      main.innerHTML =
        '<div class="page-h"><div><p class="kick">My Learning</p><h1>Your learning path.</h1><p>Tick off each lesson as you go. Move up a level when you can play it.</p></div></div>' +
        '<div class="tabs">' +
          '<button type="button" data-p="piano" class="' + (prog === 'piano' ? 'on' : '') + '" style="--k:var(--orange)">Piano by Ear</button>' +
          '<button type="button" data-p="production" class="' + (prog === 'production' ? 'on' : '') + '" style="--k:var(--violet)">Music Production</button>' +
        '</div>' +
        (levels || '<div class="card empty">' + App.EMPTY_MARK + '<b>Lessons are on the way.</b><p>Your teacher is adding them now.</p></div>');
      $$('.tabs button', main).forEach(function(b){ b.addEventListener('click', function(){ location.hash = 'learn/' + b.getAttribute('data-p'); }); });
    });
  }

  /* ---------- one lesson ---------- */
  function lesson(main, id){
    return (lessonsCache ? Promise.resolve() : getLessons().catch(function(){})).then(function(){ return api('GET', '/hub/lessons/' + encodeURIComponent(id)); }).then(function(d){
      var l = d.lesson, k = P[l.program].k, src = App.embed(l.video_url);
      var inLevel = (lessonsCache || []).filter(function(x){ return x.program === l.program && x.level === l.level; });
      var pos = inLevel.map(function(x){ return x.id; }).indexOf(l.id);
      var steps = String(l.body || '').split(/\n+/).map(function(s){ return s.trim(); }).filter(Boolean);
      var video = src
        ? '<div class="video"><iframe src="' + esc(src) + '" title="' + esc(l.title) + '" allow="autoplay; fullscreen; picture-in-picture; encrypted-media" allowfullscreen loading="lazy"></iframe></div>'
        : l.video_url
          ? '<div class="video"><div class="none"><div>' + icon('video') + '<b>Watch this lesson</b><a class="btn sm" href="' + esc(l.video_url) + '" target="_blank" rel="noopener">Open the video</a></div></div></div>'
          : '<div class="video"><div class="none"><div><span class="eq" style="font-size:40px;height:.8em" aria-hidden="true"><i></i><i></i><i></i><i></i><i></i></span><b>Video coming soon</b><span>Follow the practice steps for now.</span></div></div></div>';
      main.innerHTML =
        '<div class="page-h"><div><p class="kick" style="--k:' + k + '"><a href="#learn/' + l.program + '" style="color:inherit;text-decoration:none">&larr; ' + esc(P[l.program].name) + '</a> &middot; Level ' + l.level + '</p>' +
          '<h1>' + esc(l.title) + '</h1>' + (l.summary ? '<p>' + esc(l.summary) + '</p>' : '') +
          '<div class="lesson-meta">' + (pos >= 0 ? '<span class="badge soft" style="--k:' + k + '">Lesson ' + (pos + 1) + ' of ' + inLevel.length + ' in level ' + l.level + '</span>' : '') +
          (l.done ? '<span class="badge b-reviewed">Done</span>' : '') + (l.video_url ? '<span class="badge soft" style="--k:var(--sky)">Video</span>' : '') + '</div></div></div>' +
        '<div class="lesson-view" style="--k:' + k + '">' +
          '<div>' + video +
            '<div class="pager">' +
              (d.prev ? '<a class="btn ghost sm" href="#lesson/' + d.prev.id + '">&larr; ' + esc(d.prev.title) + '</a>' : '<span></span>') +
              (d.next ? '<a class="btn ghost sm" href="#lesson/' + d.next.id + '">' + esc(d.next.title) + ' &rarr;</a>' : '') +
            '</div></div>' +
          '<div class="grid">' +
            '<div class="card"><h2>This week\'s practice</h2>' +
              (steps.length ? '<ol class="steps-list">' + steps.map(function(s){ return '<li>' + esc(s) + '</li>'; }).join('') + '</ol>' : '<p class="hint">Your teacher will add practice steps here.</p>') +
              '<button class="btn mt" type="button" id="done" style="width:100%">' + (l.done ? 'Done! Mark as not done' : 'Mark lesson complete') + '</button></div>' +
            '<div class="card tint" style="--k:' + k + '"><h2>Played it? Show us.</h2><p>Share a video of your playing or your track, and your teacher will send feedback.</p>' +
              '<a class="btn dark sm" href="#feedback/' + l.id + '">Share my work</a></div>' +
          '</div></div>';
      var btn = $('#done', main), isDone = l.done;
      if(isDone) btn.classList.add('lime');
      btn.addEventListener('click', function(){
        btn.disabled = true;
        api('POST', '/hub/lessons/' + l.id + '/progress', { done: !isDone }).then(function(){
          isDone = !isDone;
          btn.textContent = isDone ? 'Done! Mark as not done' : 'Mark lesson complete';
          btn.classList.toggle('lime', isDone);
          App.toast(isDone ? 'Nice work! Lesson complete.' : 'Marked as not done');
          if(isDone && d.next) setTimeout(function(){ App.toast('Up next: ' + d.next.title); }, 500);
        }).catch(App.fail).finally(function(){ btn.disabled = false; });
      });
    });
  }

  /* ---------- live call-ins ---------- */
  function live(main){
    return api('GET', '/hub/callins').then(function(d){
      main.innerHTML =
        '<div class="page-h"><div><p class="kick">Live Sessions</p><h1>Call in this week.</h1><p>Camera on or off, play or just listen. Weekday evenings and weekends, all times Eastern.</p></div></div>' +
        '<div class="card">' + (d.callins.length ? liveList(d.callins) : '<div class="empty"><b>No sessions scheduled</b><p>Check back soon.</p></div>') + '</div>' +
        '<div class="grid g3 mt">' +
          '<div class="card tint" style="--k:var(--orange)"><h3>Bring a song</h3><p>Tell us one you love. We\'ll work out the chords together, live.</p></div>' +
          '<div class="card tint" style="--k:var(--violet)"><h3>Share your screen</h3><p>Open your Fender Studio project and get feedback on your beat.</p></div>' +
          '<div class="card tint" style="--k:var(--sky)"><h3>Just listen</h3><p>Missed it? Sessions are recorded for the lesson library.</p></div>' +
        '</div>';
    });
  }
  function liveList(list){
    if(!list.length) return '<p class="hint">No sessions this week.</p>';
    return '<div class="live">' + list.map(function(c){
      return '<div class="slot" style="--k:var(--' + esc(c.color) + ')"><span class="day">' + esc(c.day) + '</span>' +
        '<span><b>' + esc(c.title) + '</b><small>' + (c.link ? esc(c.time_text) + (c.note ? ' &middot; ' : '') : '') + esc(c.note) + '</small></span>' +
        (c.link ? '<a class="btn sm go" href="' + esc(c.link) + '" target="_blank" rel="noopener">Join live</a>' : '<span class="time">' + esc(c.time_text) + '</span>') + '</div>';
    }).join('') + '</div>';
  }

  /* ---------- feedback ---------- */
  function feedback(main, lessonId){
    return Promise.all([api('GET', '/hub/submissions'), lessonsCache ? Promise.resolve(lessonsCache) : getLessons()]).then(function(r){
      var subs = r[0].submissions, lessons = r[1];
      var opts = '<option value="">Not about a lesson</option>' + lessons.map(function(l){
        return '<option value="' + l.id + '"' + (String(l.id) === lessonId ? ' selected' : '') + '>' + esc(P[l.program].name + ' · L' + l.level + ' · ' + l.title) + '</option>';
      }).join('');
      var list = subs.length ? subs.map(function(s){
        return '<div class="card" style="margin-bottom:14px"><div class="card-h"><h2 style="font-size:17px">' + esc(s.title) + '</h2>' +
          '<span class="badge ' + (s.status === 'reviewed' ? 'b-reviewed' : 'b-pending') + '" style="margin-left:auto">' + (s.status === 'reviewed' ? 'Feedback ready' : 'Waiting') + '</span></div>' +
          '<p class="hint" style="margin:0 0 10px">' + (s.lesson_title ? esc(s.lesson_title) + ' &middot; ' : '') + 'sent ' + App.when(s.created_at) +
          ' &middot; <a href="' + esc(s.url) + '" target="_blank" rel="noopener" style="color:#c2410c">open link</a></p>' +
          (s.note ? '<p style="margin:0 0 10px">' + esc(s.note) + '</p>' : '') +
          (s.status === 'reviewed' ? '<div class="fb">' + esc(s.feedback) + '<small>' + esc(s.reviewed_by || 'Your teacher') + ' &middot; ' + App.when(s.reviewed_at) + '</small></div>' : '') +
          '</div>';
      }).join('') : '<div class="card empty">' + App.EMPTY_MARK + '<b>Nothing shared yet</b><p>Your first upload is the hardest. Send something rough!</p></div>';
      main.innerHTML =
        '<div class="page-h"><div><p class="kick">Feedback</p><h1>Show us what you made.</h1><p>Share a link to a playing video or a track. Your teacher replies here.</p></div></div>' +
        '<div class="grid" style="grid-template-columns:minmax(0,1fr) minmax(0,1.2fr)">' +
          '<div><div class="card"><h2>Share your work</h2><form class="f" id="sub">' +
            '<label>Title<input name="title" required placeholder="My 1-4-5 in G, take 2"></label>' +
            '<label>Link<input name="url" type="url" required placeholder="https://"><span class="hint">A YouTube (unlisted is fine), Google Drive, Dropbox or SoundCloud link.</span></label>' +
            '<label>Lesson<select name="lesson_id">' + opts + '</select></label>' +
            '<label>Anything you want help with?<textarea name="note" placeholder="The chord change in bar 3 feels slow..."></textarea></label>' +
            '<div class="acts"><button class="btn" type="submit">Send for feedback</button></div></form></div></div>' +
          '<div>' + list + '</div></div>';
      fixGrid(main);
      $('#sub', main).addEventListener('submit', function(e){
        e.preventDefault();
        var b = $('button', this); b.disabled = true;
        api('POST', '/hub/submissions', App.formData(this)).then(function(){
          App.toast('Sent! Your teacher will reply here.');
          feedback(main);
        }).catch(function(x){ App.fail(x); b.disabled = false; });
      });
    });
  }

  /* ---------- settings ---------- */
  function settings(main){
    main.innerHTML =
      '<div class="page-h"><div><p class="kick">Settings</p><h1>Your account.</h1></div></div>' +
      '<div class="grid g2">' +
        '<div class="card"><h2>Profile</h2><form class="f" id="prof">' +
          '<label>Name<input name="name" value="' + esc(user.name) + '" required></label>' +
          '<label>Email<input value="' + esc(user.email) + '" disabled><span class="hint">Email us to change the address on your account.</span></label>' +
          '<div>' + (user.programs.length ? user.programs.map(function(p){ return P[p] ? '<span class="badge prog-' + p + '" style="margin:0 6px 6px 0">' + esc(P[p].name) + '</span>' : ''; }).join('') : '<span class="hint">Your teacher will add your programs.</span>') + '</div>' +
          '<div class="acts"><button class="btn" type="submit">Save</button></div></form></div>' +
        '<div class="card"><h2>Change password</h2><form class="f" id="pw">' +
          '<label>Current password<input name="current_password" type="password" autocomplete="current-password" required></label>' +
          '<label>New password<input name="new_password" type="password" autocomplete="new-password" minlength="8" required><span class="hint">At least 8 characters.</span></label>' +
          '<div class="acts"><button class="btn" type="submit">Update password</button></div></form></div>' +
      '</div>';
    $('#prof', main).addEventListener('submit', function(e){
      e.preventDefault();
      api('PATCH', '/me', { name: this.name.value }).then(function(d){ user = d.user; App.toast('Saved'); $('.side .me b').textContent = user.name; $('.side .avatar').textContent = App.initials(user.name); }).catch(App.fail);
    });
    $('#pw', main).addEventListener('submit', function(e){
      e.preventDefault();
      var f = this;
      api('PATCH', '/me', App.formData(f)).then(function(){ App.toast('Password updated'); f.reset(); }).catch(App.fail);
    });
  }

  /* ---------- bits ---------- */
  function tile(k, ic, n, label){ return '<div class="s"><span class="ic" style="--k:' + k + '">' + icon(ic) + '</span><div><b>' + n + '</b><span>' + label + '</span></div></div>'; }
  /* days in a row with at least one lesson ticked, counted in the student's own time zone.
     A streak that ran to yesterday is still alive today. */
  function streakDays(times){
    var days = {};
    (times || []).forEach(function(t){ var x = new Date(t * 1000); days[x.toDateString()] = 1; });
    var d = new Date(), n = 0;
    if(!days[d.toDateString()]) d.setDate(d.getDate() - 1);
    while(days[d.toDateString()]){ n++; d.setDate(d.getDate() - 1); }
    return n;
  }
  function first(name){ return String(name || '').split(' ')[0]; }
  function greeting(){ var h = new Date().getHours(); return h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening'; }
  function bars(){
    var c = ['--orange','--pink','--lime','--violet','--sky','--sun'], hs = [45,80,35,60,95,50];
    return '<div class="bars" aria-hidden="true">' + c.map(function(k,i){ return '<i style="height:' + hs[i] + '%;background:var(' + k + ')"></i>'; }).join('') + '</div>';
  }
  function fixGrid(main){
    if(matchMedia('(max-width:900px)').matches){ $$('.grid', main).forEach(function(g){ if(g.style.gridTemplateColumns) g.style.gridTemplateColumns = '1fr'; }); }
  }
})();
