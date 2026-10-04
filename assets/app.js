/* =====================================================================
   Shared by the Hub and the admin dashboard: talking to the backend,
   the sidebar, side panels, toasts and a tiny hash router.
   Plain JavaScript, no build step, same as the rest of the site.
   ===================================================================== */
var App = (function(){
  var $  = function(s,r){ return (r||document).querySelector(s); };
  var $$ = function(s,r){ return [].slice.call((r||document).querySelectorAll(s)); };

  function esc(s){
    return String(s == null ? '' : s).replace(/[&<>"']/g, function(c){
      return { '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[c];
    });
  }

  /* every call to /api goes through here */
  function api(method, path, data){
    var opt = { method:method, credentials:'same-origin', headers:{} };
    if(data !== undefined){ opt.headers['Content-Type'] = 'application/json'; opt.body = JSON.stringify(data); }
    return fetch('/api' + path, opt).then(function(r){
      return r.json().catch(function(){ return {}; }).then(function(d){
        if(r.status === 401 && path !== '/me' && path.indexOf('/auth/') !== 0){ location.href = 'login.html?next=' + encodeURIComponent(location.pathname + location.hash); }
        if(!r.ok) throw new Error(d.error || 'Something went wrong. Please try again.');
        return d;
      });
    });
  }

  function toast(msg, isErr){
    var box = $('.toasts');
    if(!box){ box = document.createElement('div'); box.className = 'toasts'; box.setAttribute('role','status'); document.body.appendChild(box); }
    var t = document.createElement('div');
    t.className = 'toast' + (isErr ? ' err' : '');
    t.textContent = msg;
    box.appendChild(t);
    setTimeout(function(){ t.remove(); }, isErr ? 6000 : 3200);
  }
  function fail(e){ toast(e && e.message ? e.message : String(e), true); }

  function when(ts){
    if(!ts) return 'never';
    var d = new Date(ts * 1000), diff = (Date.now() - d) / 1000;
    if(diff < 60) return 'just now';
    if(diff < 3600) return Math.floor(diff/60) + ' min ago';
    if(diff < 86400) return Math.floor(diff/3600) + ' h ago';
    if(diff < 86400*7) return Math.floor(diff/86400) + ' d ago';
    return d.toLocaleDateString(undefined, { month:'short', day:'numeric', year: d.getFullYear() === new Date().getFullYear() ? undefined : 'numeric' });
  }

  var PROGRAM = {
    piano:{ name:'Piano by Ear', k:'var(--orange)' },
    production:{ name:'Music Production', k:'var(--violet)' },
    teenlab:{ name:'Teen Producer Lab', k:'var(--sun)' },
    online:{ name:'Online Hub', k:'var(--sky)' },
    private:{ name:'Private Lessons', k:'var(--pink)' }
  };
  var COLORS = ['orange','pink','lime','violet','sky','sun'];
  function initials(name){ return String(name || '?').trim().split(/\s+/).slice(0,2).map(function(w){ return w[0]; }).join('').toUpperCase(); }
  function colorFor(s){ var h = 0; String(s).split('').forEach(function(c){ h = (h*31 + c.charCodeAt(0)) >>> 0; }); return 'var(--' + COLORS[h % COLORS.length] + ')'; }

  var MARK = '<svg viewBox="0 0 104 80" aria-hidden="true">' +
    [['#FF6A2B',18,1],['#FF4D9D',4,1],['#B8F23A',24,0],['#8B5CFF',24,0],['#3EC8FF',0,1],['#FFC93C',24,0]].map(function(b,i){
      var x=i*18, s='<rect x="'+x+'" y="'+b[1]+'" width="14" height="'+(62-b[1])+'" rx="1.5" fill="'+b[0]+'"/>';
      if(b[2]) s+='<rect x="'+(x+5.75)+'" y="62" width="2.5" height="18" fill="'+b[0]+'"/>';
      return s;
    }).join('') + '</svg>';

  var ICON = {
    home:'<path d="M3 11l9-8 9 8v9a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z"/>',
    learn:'<path d="M2 6l10-4 10 4-10 4z"/><path d="M6 8v6c3 2.5 9 2.5 12 0V8"/>',
    live:'<circle cx="12" cy="12" r="2"/><path d="M16.2 7.8a6 6 0 0 1 0 8.4M7.8 16.2a6 6 0 0 1 0-8.4M19 5a10 10 0 0 1 0 14M5 19A10 10 0 0 1 5 5"/>',
    feedback:'<path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>',
    settings:'<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/>',
    overview:'<rect x="3" y="3" width="7" height="9" rx="1.5"/><rect x="14" y="3" width="7" height="5" rx="1.5"/><rect x="14" y="12" width="7" height="9" rx="1.5"/><rect x="3" y="16" width="7" height="5" rx="1.5"/>',
    leads:'<path d="M4 4h16v16H4z"/><path d="M4 9h16M9 14h6"/>',
    people:'<circle cx="9" cy="8" r="3.5"/><path d="M2.5 20a6.5 6.5 0 0 1 13 0"/><circle cx="17" cy="9" r="2.5"/><path d="M16 14.2a5 5 0 0 1 6 4.8"/>',
    lessons:'<rect x="2" y="4" width="20" height="14" rx="2"/><path d="M10 8.5v5l4.5-2.5z"/>',
    news:'<path d="M3 11l15-6v14L3 13z"/><path d="M7 13v5a2 2 0 0 0 4 0v-4"/>',
    out:'<path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9"/>',
    play:'<path d="M7 4l13 8-13 8z" fill="currentColor" stroke="none"/>',
    check:'<path d="M5 12l5 5 9-11"/>',
    video:'<rect x="2" y="5" width="15" height="14" rx="2"/><path d="M17 10l5-3v10l-5-3z"/>',
    music:'<path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/>',
    flame:'<path d="M12 22c4 0 7-2.8 7-7 0-4.5-4-7-4.5-11-2.5 2-3.5 4.5-3.5 6.5C9.5 9 9 7.5 9 6c-2.5 2-4 5-4 9 0 4.2 3 7 7 7z"/>',
    upload:'<path d="M12 16V4M7 9l5-5 5 5"/><path d="M5 16v3a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-3"/>',
    star:'<path d="M12 3l2.6 5.4 5.9.8-4.3 4.1 1 5.8L12 16.4 6.8 19.1l1-5.8L3.5 9.2l5.9-.8z"/>',
    plus:'<path d="M12 5v14M5 12h14"/>',
    userplus:'<circle cx="9" cy="8" r="3.5"/><path d="M2.5 20a6.5 6.5 0 0 1 13 0M19 8v6M16 11h6"/>',
    inbox:'<path d="M3 13h5l1.5 3h5L16 13h5"/><path d="M5 5h14l2 8v6a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1v-6z"/>'
  };
  function icon(name){ return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">' + (ICON[name]||'') + '</svg>'; }

  /* the sidebar: items are [hash, label, icon] */
  function shell(user, items, roleLabel){
    var side = $('#side');
    side.innerHTML =
      '<div class="keys-rule" aria-hidden="true"></div>' +
      '<a class="brand" href="index.html" aria-label="Modern Music Hub website">' + MARK + '<b>Modern<br>Music Hub</b></a>' +
      '<p class="role">' + esc(roleLabel) + '</p>' +
      '<nav aria-label="Sections">' + items.map(function(it){
        if(it[0] === '-') return '<p class="grp">' + esc(it[1]) + '</p>';
        return '<a href="#' + it[0] + '" data-r="' + it[0] + '">' + icon(it[2]) + '<span>' + esc(it[1]) + '</span><span class="count" data-count="' + it[0] + '" hidden></span></a>';
      }).join('') + '</nav>' +
      '<a class="site-link" href="index.html">&larr; Back to the website</a>' +
      '<div class="me"><span class="avatar" style="--k:' + colorFor(user.email) + '">' + esc(initials(user.name)) + '</span>' +
        '<div><b>' + esc(user.name) + '</b><small>' + esc(user.email) + '</small></div>' +
        '<button class="out" type="button" title="Sign out" aria-label="Sign out">' + icon('out') + '</button></div>';
    var top = $('#topbar');
    if(top){
      top.innerHTML = '<span class="crumb">' + esc(roleLabel) + ' / <b id="crumb"></b></span>' +
        '<span class="date"><i></i>' + new Date().toLocaleDateString(undefined, { weekday:'long', month:'long', day:'numeric' }) + '</span>' +
        '<span class="qa" id="qa"></span>';
    }
    $('.out', side).addEventListener('click', function(){
      api('POST', '/auth/logout').finally(function(){ location.href = 'login.html'; });
    });
  }
  /* buttons in the top bar: [label, href, icon, primary?] */
  function actions(list){
    var qa = $('#qa'); if(!qa) return;
    qa.innerHTML = list.map(function(a){
      return '<a class="btn sm' + (a[3] ? '' : ' ghost') + '" href="' + a[1] + '">' + (a[2] ? '<span style="display:inline-flex;width:16px;height:16px">' + icon(a[2]) + '</span>' : '') + esc(a[0]) + '</a>';
    }).join('');
  }
  function count(key, n){
    var el = $('[data-count="' + key + '"]');
    if(!el) return;
    el.hidden = !n; el.textContent = n > 99 ? '99+' : n;
  }

  /* #name/arg -> routes[name](arg) */
  function router(routes, fallback){
    function go(){
      var h = location.hash.replace(/^#/, '') || fallback;
      var parts = h.split('/'), name = parts[0], arg = parts.slice(1).join('/');
      if(!routes[name]){ name = fallback; arg = ''; }
      $$('#side nav a').forEach(function(a){ var r = a.getAttribute('data-r');
        a.classList.toggle('on', r === name || (!!routes[name].parent && r === routes[name].parent)); });
      var onA = $('#side nav a.on');
      if(onA && matchMedia('(max-width:900px)').matches){ var nv = onA.parentNode; nv.scrollLeft = onA.offsetLeft - (nv.clientWidth - onA.offsetWidth) / 2; }
      var cur = $('#side nav a.on span'), cr = $('#crumb');
      if(cr) cr.textContent = cur ? cur.textContent : '';
      var main = $('#main');
      main.innerHTML = '<div class="loading"><span class="eq" aria-label="Loading"><i></i><i></i><i></i><i></i><i></i></span></div>';
      window.scrollTo(0, 0);
      Promise.resolve(routes[name](main, arg)).catch(function(e){
        main.innerHTML = '<div class="card empty"><b>That did not load.</b><p>' + esc(e.message) + '</p><button class="btn" onclick="location.reload()">Try again</button></div>';
      });
    }
    window.addEventListener('hashchange', go);
    go();
  }

  /* a side panel; returns the body element. onClose runs once. */
  function panel(title, html, onClose){
    var d = document.createElement('dialog');
    d.className = 'panel-d';
    d.innerHTML = '<div class="ph"><h2>' + esc(title) + '</h2><button type="button" aria-label="Close">&times;</button></div><div class="pb">' + html + '</div>';
    document.body.appendChild(d);
    $('.ph button', d).addEventListener('click', function(){ d.close(); });
    d.addEventListener('click', function(e){ if(e.target === d) d.close(); });
    d.addEventListener('close', function(){ d.remove(); if(onClose) onClose(); });
    d.showModal();
    return d;
  }

  function formData(form){
    var o = {};
    $$('input,select,textarea', form).forEach(function(el){
      if(!el.name) return;
      if(el.type === 'checkbox' && el.dataset.list !== undefined){
        o[el.name] = o[el.name] || [];
        if(el.checked) o[el.name].push(el.value);
      } else if(el.type === 'checkbox'){ o[el.name] = el.checked; }
      else { o[el.name] = el.value; }
    });
    return o;
  }

  function copyBox(value){
    return '<div class="secret"><span>' + esc(value) + '</span><button class="btn sm lime" type="button" data-copy="' + esc(value) + '">Copy</button></div>';
  }
  document.addEventListener('click', function(e){
    var b = e.target.closest('[data-copy]');
    if(!b) return;
    navigator.clipboard.writeText(b.getAttribute('data-copy')).then(function(){ toast('Copied'); }, function(){ toast('Select it and copy it by hand', true); });
  });

  /* hover / focus tooltips: data-tip="main line" data-tip-sub="second line" */
  var tipEl = null;
  function showTip(el){
    if(!tipEl){ tipEl = document.createElement('div'); tipEl.className = 'tip'; tipEl.setAttribute('aria-hidden', 'true'); document.body.appendChild(tipEl); }
    tipEl.innerHTML = esc(el.getAttribute('data-tip')) + (el.getAttribute('data-tip-sub') ? '<small>' + esc(el.getAttribute('data-tip-sub')) + '</small>' : '');
    var r = el.getBoundingClientRect();
    tipEl.style.left = (r.left + r.width / 2) + 'px';
    tipEl.style.top = r.top + 'px';
    tipEl.hidden = false;
  }
  function hideTip(){ if(tipEl) tipEl.hidden = true; }
  ['mouseover','focusin'].forEach(function(ev){ document.addEventListener(ev, function(e){ var t = e.target.closest && e.target.closest('[data-tip]'); if(t) showTip(t); }); });
  ['mouseout','focusout'].forEach(function(ev){ document.addEventListener(ev, function(e){ if(e.target.closest && e.target.closest('[data-tip]')) hideTip(); }); });
  window.addEventListener('scroll', hideTip, true);

  /* who's signed in; sends people who aren't to the right place */
  function me(){
    return api('GET', '/me').then(function(d){
      if(!d.user){ location.href = 'login.html?next=' + encodeURIComponent(location.pathname + location.hash); throw new Error('Not signed in'); }
      return d.user;
    });
  }

  /* YouTube and Vimeo links become players; anything else stays a link */
  function embed(url){
    if(!url) return '';
    var m = url.match(/(?:youtube\.com\/(?:watch\?v=|embed\/|shorts\/|live\/)|youtu\.be\/)([\w-]{6,})/);
    if(m) return 'https://www.youtube-nocookie.com/embed/' + m[1] + '?rel=0';
    m = url.match(/vimeo\.com\/(?:video\/)?(\d+)(?:\/(\w+))?/);
    if(m) return 'https://player.vimeo.com/video/' + m[1] + (m[2] ? '?h=' + m[2] : '');
    return '';
  }

  var EMPTY_MARK = '<div class="mark">' + MARK + '</div>';

  return { $:$, $$:$$, esc:esc, api:api, toast:toast, fail:fail, when:when, PROGRAM:PROGRAM, COLORS:COLORS, icon:icon,
    shell:shell, actions:actions, count:count, router:router, panel:panel, formData:formData, copyBox:copyBox, me:me, embed:embed,
    initials:initials, colorFor:colorFor, MARK:MARK, EMPTY_MARK:EMPTY_MARK };
})();
