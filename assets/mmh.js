/* ===========================================================
   EDIT THIS BLOCK ONLY.
   Every page reads its contact details, links and the weekly
   call-in times from here.
   =========================================================== */
var MMH = {
  /* Sign up free at formspree.io, create a form, paste its URL here.
     Leave it empty and every form opens the visitor's email app. */
  formEndpoint: "",
  email: "hello@modernmusichub.com",
  city: "Charlottesville, Virginia",

  social: {
    instagram: "https://instagram.com/amanorsac",
    youtube:   "https://www.youtube.com/@amanorsac",
    tiktok:    "https://www.tiktok.com/@amanorsac1",
    facebook:  ""
  },

  /* The weekly live call-ins on the Online Hub. All times Eastern. */
  callins: [
    { day:"Tue", title:"Piano by Ear Live",   note:"Bring a song you love. We work out the chords together.", time:"7:00 PM ET", k:"var(--orange)" },
    { day:"Thu", title:"Producer Lab Live",    note:"Share your screen, get feedback on your beat in Fender Studio.", time:"7:00 PM ET", k:"var(--violet)" },
    { day:"Sat", title:"Teen Beat Club",       note:"Monthly challenge, listening party and shout-outs. Ages 12-18.", time:"5:30 PM ET", k:"var(--sun)" },
    { day:"Sun", title:"Open Office Hours",    note:"Stuck on something? Drop in with any question, any level.", time:"6:00 PM ET", k:"var(--sky)" }
  ]
};
/* ==================== stop editing here ==================== */

(function(){
  var $  = function(s,r){ return (r||document).querySelector(s); };
  var $$ = function(s,r){ return [].slice.call((r||document).querySelectorAll(s)); };
  var here = (location.pathname.split('/').pop() || 'index.html').replace(/\.html$/,'') || 'index';

  /* ---- the mark, drawn once and reused by the bar ---- */
  var MARK = '<svg viewBox="0 0 104 80" aria-hidden="true">' +
    [['#FF6A2B',18,1],['#FF4D9D',4,1],['#B8F23A',24,0],['#8B5CFF',24,0],['#3EC8FF',0,1],['#FFC93C',24,0]].map(function(b,i){
      var x=i*18, s='<rect x="'+x+'" y="'+b[1]+'" width="14" height="'+(62-b[1])+'" rx="1.5" fill="'+b[0]+'"/>';
      if(b[2]) s+='<rect x="'+(x+5.75)+'" y="62" width="2.5" height="18" fill="'+b[0]+'"/>';
      return s;
    }).join('') + '</svg>';

  var NAV = [
    ['piano','Piano by Ear','var(--orange)'],
    ['production','Production','var(--violet)'],
    ['online','Online Hub','var(--sky)'],
    ['charlottesville','In Person','var(--pink)'],
    ['plans','Programs','var(--lime)'],
    ['about','About','var(--sun)']
  ];

  var head = $('[data-head]');
  if(head){
    head.outerHTML =
      '<a class="skip" href="#main">Skip to content</a>' +
      '<header class="gnav" id="gnav">' +
        '<a class="brand" href="index.html" aria-label="Modern Music Hub, home">'+MARK+'<b>Modern<br>Music Hub</b></a>' +
        '<nav aria-label="Site" id="site-nav">' + NAV.map(function(n){
          return '<a href="'+n[0]+'.html" style="--k:'+n[2]+'"'+(here===n[0]?' aria-current="page"':'')+'>'+n[1]+'</a>';
        }).join('') + '</nav>' +
        '<a class="signin" id="signin" href="login.html">Sign in</a>' +
        '<a class="btn sm cta" href="plans.html#trial">Free trial lesson</a>' +
        '<button class="menu-btn" type="button" aria-label="Menu" aria-expanded="false" aria-controls="site-nav">' +
          '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M4 7h16M4 12h16M4 17h16"/></svg></button>' +
      '</header><div class="keys-rule" aria-hidden="true"></div>';
    var g = $('#gnav'), mb = $('.menu-btn', g);
    mb.addEventListener('click', function(){
      var open = g.classList.toggle('open');
      mb.setAttribute('aria-expanded', String(open));
    });
    /* signed in? the link becomes the way back to your Hub */
    fetch('/api/me', { credentials:'same-origin' }).then(function(r){ return r.ok ? r.json() : null; }).then(function(d){
      var u = d && d.user, a = $('#signin');
      if(!u || !a) return;
      var staff = u.role === 'admin' || u.role === 'teacher';
      a.textContent = staff ? 'Dashboard' : 'My Hub';
      a.href = staff ? 'admin.html' : 'hub.html';
    }).catch(function(){});
  }

  var ICONS = {
    instagram:'<path d="M12 2.2c3.2 0 3.6 0 4.8.1 3.2.1 4.8 1.7 4.9 4.9.1 1.3.1 1.6.1 4.8s0 3.6-.1 4.8c-.1 3.2-1.7 4.8-4.9 4.9-1.3.1-1.6.1-4.8.1s-3.6 0-4.8-.1c-3.3-.1-4.8-1.7-4.9-4.9C2.2 15.6 2.2 15.2 2.2 12s0-3.6.1-4.8C2.4 3.9 3.9 2.4 7.2 2.3 8.4 2.2 8.8 2.2 12 2.2zM12 7a5 5 0 100 10 5 5 0 000-10zm0 8.2a3.2 3.2 0 110-6.4 3.2 3.2 0 010 6.4zm5.2-9.6a1.2 1.2 0 100 2.4 1.2 1.2 0 000-2.4z"/>',
    youtube:'<path d="M23.5 6.2a3 3 0 00-2.1-2.1C19.5 3.6 12 3.6 12 3.6s-7.5 0-9.4.5A3 3 0 00.5 6.2 31 31 0 000 12a31 31 0 00.5 5.8 3 3 0 002.1 2.1c1.9.5 9.4.5 9.4.5s7.5 0 9.4-.5a3 3 0 002.1-2.1A31 31 0 0024 12a31 31 0 00-.5-5.8zM9.6 15.6V8.4l6.2 3.6-6.2 3.6z"/>',
    tiktok:'<path d="M19.6 6.7a4.8 4.8 0 01-3.8-4.2V2h-3.4v13.4a2.9 2.9 0 11-2-2.7V9.2a6.3 6.3 0 105.4 6.2V8.6a8.2 8.2 0 003.8 1.2V6.7z"/>',
    facebook:'<path d="M24 12a12 12 0 10-13.9 11.9v-8.4h-3V12h3V9.4c0-3 1.8-4.7 4.5-4.7 1.3 0 2.7.2 2.7.2v3h-1.5c-1.5 0-2 .9-2 1.9V12h3.4l-.5 3.5h-2.9v8.4A12 12 0 0024 12z"/>'
  };

  var foot = $('[data-foot]');
  if(foot){
    var soc = Object.keys(MMH.social).filter(function(k){ return MMH.social[k]; }).map(function(k){
      return '<a href="'+MMH.social[k]+'" target="_blank" rel="noopener" aria-label="'+k+'"><svg viewBox="0 0 24 24">'+ICONS[k]+'</svg></a>';
    }).join('');
    foot.outerHTML =
      '<div class="keys-rule" aria-hidden="true"></div><footer class="sfoot"><div class="cols">' +
        '<div class="sf-brand"><img src="images/brand/logo-on-dark.svg" alt="Modern Music Hub. Learn. Create. Produce." width="364" height="122">' +
          '<p>Piano by ear and music production lessons for teens and adults.</p><p>In person in '+MMH.city+', and online everywhere.</p><p>After school, evenings and weekends. Email is the best way to reach us.</p>' +
          '<div class="social">'+soc+'</div></div>' +
        '<div><h4>Learn</h4><ul><li><a href="piano.html">Piano by Ear</a></li><li><a href="production.html">Music Production</a></li><li><a href="production.html#fender-studio">Fender Studio</a></li><li><a href="piano.html#path">The Learning Path</a></li></ul></div>' +
        '<div><h4>Join</h4><ul><li><a href="online.html">Online Hub</a></li><li><a href="charlottesville.html">In Person, Charlottesville</a></li><li><a href="charlottesville.html#teens">Teen Producer Lab</a></li><li><a href="plans.html">Programs</a></li></ul></div>' +
        '<div><h4>Hub</h4><ul><li><a href="online.html#callins">Weekly Call-Ins</a></li><li><a href="plans.html#faq">FAQ</a></li><li><a href="about.html">About</a></li><li><a href="brand.html">Brand Guide</a></li></ul></div>' +
        '<div><h4>Start</h4><ul><li><a href="plans.html#trial">Free trial lesson</a></li><li><a href="mailto:'+MMH.email+'">'+MMH.email+'</a></li><li><a href="https://amanorsac.studio" target="_blank" rel="noopener">Amanorsac Studio</a></li></ul></div>' +
      '</div><div class="base"><span>&copy; '+new Date().getFullYear()+' Modern Music Hub</span><span>Learn. Create. Produce.</span><span>'+MMH.city+' and online</span></div></footer>';
  }

  /* ---- the weekly call-in list, wherever a page asks for it.
     The schedule is edited in the admin dashboard; MMH.callins above is
     only what shows if the backend can't be reached. ---- */
  function esc(s){ return String(s == null ? '' : s).replace(/[&<>"']/g, function(c){ return '&#'+c.charCodeAt(0)+';'; }); }
  function slots(list){
    return list.map(function(c){
      return '<div class="slot" style="--k:'+esc(c.k)+'"><span class="day">'+esc(c.day)+'</span><span><b>'+esc(c.title)+'</b><small>'+esc(c.note)+'</small></span><span class="time">'+esc(c.time)+'</span></div>';
    }).join('');
  }
  var boxes = $$('[data-callins]');
  if(boxes.length){
    boxes.forEach(function(box){ box.innerHTML = slots(MMH.callins); });
    fetch('/api/callins').then(function(r){ return r.ok ? r.json() : null; }).then(function(d){
      if(!d || !d.callins || !d.callins.length) return;
      var list = d.callins.map(function(c){ return { day:c.day, title:c.title, note:c.note, time:c.time_text, k:'var(--'+c.color+')' }; });
      boxes.forEach(function(box){ box.innerHTML = slots(list); });
    }).catch(function(){});
  }

  /* ---- sections rise into place as they arrive ---- */
  if('IntersectionObserver' in window){
    var io = new IntersectionObserver(function(es){
      es.forEach(function(e){ if(e.isIntersecting){ e.target.classList.add('in-view'); io.unobserve(e.target); } });
    }, { threshold:.12, rootMargin:'0px 0px -40px 0px' });
    $$('.rise').forEach(function(el){ io.observe(el); });
  } else { $$('.rise').forEach(function(el){ el.classList.add('in-view'); }); }

  /* ---- the trial form: straight into the admin dashboard. If the
     backend can't be reached, Formspree if configured, else email. ---- */
  $$('form.cform').forEach(function(f){
    f.addEventListener('submit', function(e){
      e.preventDefault();
      var data = new FormData(f), lines = [], obj = {};
      data.forEach(function(v,k){ obj[k] = v; if(String(v).trim()) lines.push(k + ': ' + v); });
      var btn = $('button[type=submit]', f); if(btn) btn.disabled = true;
      fetch('/api/trial', { method:'POST', headers:{ 'Content-Type':'application/json' }, body:JSON.stringify(obj) })
        .then(function(r){ if(!r.ok) throw 0; f.classList.add('sent'); })
        .catch(fallback)
        .then(function(){ if(btn) btn.disabled = false; });
      function fallback(){
        if(MMH.formEndpoint){
          return fetch(MMH.formEndpoint, { method:'POST', body:data, headers:{ 'Accept':'application/json' } })
            .then(function(r){ if(!r.ok) throw 0; f.classList.add('sent'); })
            .catch(mail);
        }
        mail();
      }
      function mail(){
        location.href = 'mailto:' + MMH.email + '?subject=' + encodeURIComponent(f.getAttribute('data-subject') || 'Modern Music Hub') +
          '&body=' + encodeURIComponent(lines.join('\n'));
        f.classList.add('sent');
      }
    });
  });

  /* ---- a program chosen on another page arrives pre-ticked ---- */
  var want = new URLSearchParams(location.search).get('program');
  if(want){ var box = $('input[name="program"][value="'+want+'"]'); if(box) box.checked = true; }
})();
