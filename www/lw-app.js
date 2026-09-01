/* ============================================================
   Loveway — app data layer
   Har page ke Supabase calls yahan hain. Page sirf UI banata hai.
   lw-core.js ke baad load karein.
   ============================================================ */
(function () {
  'use strict';

  var sb = function () { return window.LW && window.LW.sb; };

  /* ---------- user content translation (posts / messages / comments) ----------
     Loveway ke apne LW_LANG dictionary sirf app ke UI text ke liye hai —
     users ke asli likhe hue posts/messages translate karne ke liye MyMemory
     (free, bina API key wala) translation API use karte hain, in-memory cache
     ke saath taaki same text baar baar translate na ho (free quota bachane ke liye). */
  var CONTENT_API_LANG = { en: 'en', hi: 'hi', mr: 'mr', braj: 'hi', raj: 'hi', bho: 'hi', hyd: 'hi', ta: 'ta', te: 'te', bn: 'bn', pa: 'pa', gu: 'gu' };
  var contentTransCache = {};

  function contentApiLang(code) { return CONTENT_API_LANG[code] || 'en'; }

  // Apni script dikhe to wahi bhaasha maano, warna English/Hinglish maano —
  // koi bhi free API romanized Hindi (Hinglish) ko reliably detect nahi karta
  var SCRIPT_RANGES = [
    ['ta', /[஀-௿]/], ['te', /[ఀ-౿]/], ['bn', /[ঀ-৿]/],
    ['pa', /[਀-੿]/], ['gu', /[઀-૿]/], ['hi', /[ऀ-ॿ]/]
  ];
  function guessContentLang(text) {
    text = text || '';
    for (var i = 0; i < SCRIPT_RANGES.length; i++) {
      if (SCRIPT_RANGES[i][1].test(text)) return SCRIPT_RANGES[i][0];
    }
    return 'en';
  }

  // batata hai ki text pehle se hi target language mein hai (translate karne ki zaroorat nahi)
  function contentLangMatches(text, langCode) { return guessContentLang(text) === contentApiLang(langCode); }

  function translateText(text, langCode) {
    text = (text || '').trim();
    if (!text) return Promise.resolve('');
    var target = contentApiLang(langCode);
    var source = guessContentLang(text);
    if (source === target) return Promise.resolve(text);

    var key = target + '::' + text;
    if (contentTransCache[key]) return contentTransCache[key];

    var p = fetch('https://api.mymemory.translated.net/get?q=' + encodeURIComponent(text) +
        '&langpair=' + source + '|' + target)
      .then(function (r) { return r.json(); })
      .then(function (d) {
        var t = d && d.responseData && d.responseData.translatedText;
        return (t && d.responseStatus === 200) ? t : text;
      })
      .catch(function () { return text; });

    contentTransCache[key] = p;
    return p;
  }

  /* ---------- header icons (SVG, ek hi jagah se sab pages) ---------- */
  var ICONS = {
    home:      '<path d="M3 9.5 12 3l9 6.5"/><path d="M5 9.5V20a1 1 0 0 0 1 1h4v-6h4v6h4a1 1 0 0 0 1-1V9.5"/>',
    friends:   '<path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/>',
    profile:   '<path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/>',
    settings:  '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/>',
    target:    '<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="5"/><circle cx="12" cy="12" r="1.4" fill="currentColor" stroke="none"/>',
    community: '<path d="M3 21V10l4-3 4 3v11"/><path d="M13 21V7l4-4 4 4v14"/><path d="M3 21h18"/>',
    pin:       '<path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/>',
    tree:      '<line x1="6" y1="3" x2="6" y2="15"/><circle cx="18" cy="6" r="3"/><circle cx="6" cy="18" r="3"/><path d="M18 9a9 9 0 0 1-9 9"/>',
    logout:    '<path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><path d="M16 17l5-5-5-5"/><path d="M21 12H9"/>',
    bell:      '<path d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/>',
    globe:     '<circle cx="12" cy="12" r="10"/><line x1="2" y1="12" x2="22" y2="12"/><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/>',
    chevron:   '<polyline points="6 9 12 15 18 9"/>',
    chain:     '<path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/>',
    image:     '<rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5" fill="currentColor" stroke="none"/><path d="M21 15l-5-5L5 21"/>',
    download:  '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/>',
    chat:      '<path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z"/>',
    search:    '<circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>',
    sun:       '<circle cx="12" cy="12" r="5"/><line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/><line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/>',
    heart:     '<path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/>',
    gift:      '<polyline points="20 12 20 22 4 22 4 12"/><rect x="2" y="7" width="20" height="5"/><line x1="12" y1="22" x2="12" y2="7"/><path d="M12 7H7.5a2.5 2.5 0 0 1 0-5C11 2 12 7 12 7z"/><path d="M12 7h4.5a2.5 2.5 0 0 0 0-5C13 2 12 7 12 7z"/>'
  };

  function icon(name, size) {
    return '<svg viewBox="0 0 24 24" width="' + (size || 18) + '" height="' + (size || 18) +
      '" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
      (ICONS[name] || '') + '</svg>';
  }

  // native <select> ka dropdown popup browser/OS style hota hai, style nahi ho sakta —
  // isliye असli select ko chhupa ke ek custom button+list bana dete hain. Select
  // form-value/onchange ke liye zinda rehta hai, bas dikhta nahi.
  function customSelect(selectEl, plain) {
    if (!selectEl || selectEl.dataset.lwEnhanced) return;
    selectEl.dataset.lwEnhanced = '1';
    selectEl.style.display = 'none';

    var wrap = document.createElement('span');
    wrap.className = 'lw-dd' + (plain ? ' plain' : '');

    var trigger = document.createElement('button');
    trigger.type = 'button';
    trigger.className = 'lw-dd-trigger';

    var menu = document.createElement('div');
    menu.className = 'lw-dd-menu';

    function refresh() {
      var opt = selectEl.options[selectEl.selectedIndex];
      trigger.textContent = opt ? opt.textContent : '';
      Array.prototype.forEach.call(menu.children, function (item, i) {
        item.classList.toggle('selected', i === selectEl.selectedIndex);
      });
    }

    Array.prototype.forEach.call(selectEl.options, function (opt, i) {
      var item = document.createElement('div');
      item.className = 'lw-dd-item';
      item.textContent = opt.textContent;
      item.addEventListener('click', function () {
        selectEl.selectedIndex = i;
        menu.classList.remove('open');
        refresh();
        selectEl.dispatchEvent(new Event('change', { bubbles: true }));
      });
      menu.appendChild(item);
    });
    refresh();
    selectEl.addEventListener('change', refresh);

    // Trigger ke neeche jitni jagah bachi hai usi hisaab se menu ko upar/neeche
    // kholte hain aur uski max-height clamp karte hain — warna screen ke bottom
    // ke paas wale dropdown (jaise composer ka "Post" selector) viewport ke
    // bahar cut ho jaate the aur andar scroll karke bhi baaki options nahi
    // dikhte the (scroll sirf menu ke apne max-height ke andar kaam karta hai,
    // viewport ke bahar wale hisse ke liye nahi).
    function positionMenu() {
      var pad = 10;
      var rect = trigger.getBoundingClientRect();
      var spaceBelow = window.innerHeight - rect.bottom - pad;
      var spaceAbove = rect.top - pad;
      var naturalMax = 280;

      menu.style.top = '';
      menu.style.bottom = '';

      if (spaceBelow >= Math.min(naturalMax, 160) || spaceBelow >= spaceAbove) {
        menu.style.top = 'calc(100% + 8px)';
        menu.style.maxHeight = Math.max(120, Math.min(naturalMax, spaceBelow)) + 'px';
      } else {
        menu.style.bottom = 'calc(100% + 8px)';
        menu.style.maxHeight = Math.max(120, Math.min(naturalMax, spaceAbove)) + 'px';
      }
    }

    trigger.addEventListener('click', function (ev) {
      ev.stopPropagation();
      document.querySelectorAll('.lw-dd-menu.open').forEach(function (m) { if (m !== menu) m.classList.remove('open'); });
      var willOpen = !menu.classList.contains('open');
      if (willOpen) positionMenu();
      menu.classList.toggle('open');
    });

    wrap.appendChild(trigger);
    wrap.appendChild(menu);
    selectEl.parentNode.insertBefore(wrap, selectEl.nextSibling);
  }

  if (!window._lwDdCloser) {
    window._lwDdCloser = true;
    document.addEventListener('click', function () {
      document.querySelectorAll('.lw-dd-menu.open').forEach(function (m) { m.classList.remove('open'); });
    });
  }

  // .card ki entrance animation (fill-mode:both) hamesha ke liye ek naya stacking
  // context bana deti hai, jisse uske andar ka .lw-dd-menu (position:absolute,
  // z-index) card ke baad wale siblings (jaise .tabs) ke peeche chhup jaata hai.
  // Animation khatam hote hi hata dete hain taaki dropdown sahi se upar dikhe.
  if (!window._lwCardAnimCloser) {
    window._lwCardAnimCloser = true;
    document.addEventListener('animationend', function (ev) {
      if (ev.animationName === 'lwFadeUp' && ev.target.classList.contains('card')) {
        ev.target.style.animation = 'none';
      }
    }, true);
  }

  /* ---------- helpers ---------- */

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  function initials(p) {
    var n = (p && (p.full_name || p.username)) || '?';
    return n.trim().charAt(0).toUpperCase();
  }

  function avatarHtml(p, cls) {
    var c = 'avatar' + (cls ? ' ' + cls : '');
    if (p && p.avatar_url) {
      return '<div class="' + c + '"><img src="' + esc(p.avatar_url) + '" alt=""></div>';
    }
    return '<div class="' + c + '">' + esc(initials(p)) + '</div>';
  }

  // "2 ghante pehle" type
  function timeAgo(ts) {
    if (!ts) return '';
    var s = Math.floor((Date.now() - new Date(ts).getTime()) / 1000);
    if (s < 60)     return 'abhi';
    if (s < 3600)   return Math.floor(s / 60) + ' min pehle';
    if (s < 86400)  return Math.floor(s / 3600) + ' ghante pehle';
    if (s < 604800) return Math.floor(s / 86400) + ' din pehle';
    return new Date(ts).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
  }

  function toast(msg, type) {
    var box = document.getElementById('alertBox');
    if (!box) { return; }
    box.className = 'alert ' + (type || 'success');
    box.textContent = msg;
    clearTimeout(box._t);
    box._t = setTimeout(function () { box.className = 'alert'; }, 4000);
  }

  function err(e) {
    return (e && (e.message || e.error_description || e.msg)) || 'Kuch gadbad ho gayi';
  }

  /* ---------- theme + shell ---------- */

  var THEME_VARS = ['--bg', '--bg2', '--card', '--primary', '--primary-soft',
    '--accent', '--text', '--text-soft', '--border', '--shadow', '--grad'];

  function setTheme(name, el) {
    var root = document.documentElement;
    THEME_VARS.forEach(function (v) { root.style.removeProperty(v); }); // custom overrides hatao
    document.body.setAttribute('data-theme', name);
    try { localStorage.setItem('loveway_theme', name); localStorage.removeItem('loveway_custom_color'); } catch (e) {}
    document.querySelectorAll('.theme-dot').forEach(function (d) { d.classList.remove('active'); });
    if (el) el.classList.add('active');
    else {
      var d = document.querySelector('.dot-' + name);
      if (d) d.classList.add('active');
    }
  }

  function hexToRgb(hex) {
    var m = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex || '');
    return m ? { r: parseInt(m[1], 16), g: parseInt(m[2], 16), b: parseInt(m[3], 16) } : { r: 233, g: 30, b: 99 };
  }

  // amt: -1..1 — negative darkens, positive lightens
  function shade(hex, amt) {
    var c = hexToRgb(hex);
    function adj(v) { return Math.max(0, Math.min(255, Math.round(v + (amt > 0 ? (255 - v) * amt : v * amt)))); }
    return 'rgb(' + adj(c.r) + ',' + adj(c.g) + ',' + adj(c.b) + ')';
  }

  // user apna accent color chunta hai — baaki (bg/text/border) ek safe neutral
  // scaffold se aate hain taaki koi bhi color pick karo, UI hamesha padhne layak rahe
  function setCustomColor(hex) {
    var root = document.documentElement;
    var accent = shade(hex, .25);
    root.style.setProperty('--primary', hex);
    root.style.setProperty('--accent', accent);
    root.style.setProperty('--primary-soft', shade(hex, .85));
    root.style.setProperty('--grad', 'linear-gradient(135deg,' + accent + ',' + hex + ')');
    root.style.setProperty('--bg', '#f7f7fa');
    root.style.setProperty('--bg2', '#eeeef4');
    root.style.setProperty('--card', '#ffffff');
    root.style.setProperty('--text', '#242430');
    root.style.setProperty('--text-soft', '#82829a');
    root.style.setProperty('--border', '#e3e3ec');
    root.style.setProperty('--shadow', '0 4px 20px rgba(0,0,0,.10)');
    document.body.setAttribute('data-theme', 'custom');
    try { localStorage.setItem('loveway_theme', 'custom'); localStorage.setItem('loveway_custom_color', hex); } catch (e) {}
    document.querySelectorAll('.theme-dot').forEach(function (d) { d.classList.remove('active'); });
    var dot = document.getElementById('customThemeDot');
    if (dot) dot.classList.add('active');
  }

  function restoreTheme() {
    var saved = 'ocean', customColor = null;
    try {
      saved = localStorage.getItem('loveway_theme') || 'ocean';
      customColor = localStorage.getItem('loveway_custom_color');
    } catch (e) {}
    if (saved === 'custom' && customColor) setCustomColor(customColor);
    else setTheme(saved);
    restoreBgPhoto();
  }

  // photo background on/off Settings > Appearance se control hota hai —
  // yahan bas jo save hua hai wahi apply karna hai (default auth-bg.jpg,
  // ya user ki apni upload ki hui custom image agar hai)
  function restoreBgPhoto() {
    var on = true, customUrl = null;
    try {
      on = localStorage.getItem('loveway_bg_photo') !== '0';
      customUrl = localStorage.getItem('loveway_bg_custom_url');
    } catch (e) {}
    document.body.classList.toggle('bg-photo', on);
    if (on && customUrl) {
      var dark = document.body.getAttribute('data-theme') === 'dark';
      var overlay = dark
        ? 'linear-gradient(rgba(18,18,26,.86),rgba(18,18,26,.86))'
        : 'linear-gradient(rgba(255,255,255,.82),rgba(255,255,255,.82))';
      document.body.style.backgroundImage = overlay + ', url("' + customUrl + '")';
    } else {
      document.body.style.backgroundImage = '';
    }
  }

  // har page ka header + bottom nav ek jaisa
  function shell(active) {
    var pages = [
      { id: 'feed',       href: 'dashboard.html',  ic: 'home',      label: 'Feed' },
      { id: 'chat',       href: 'messages.html',   ic: 'chat',      label: 'Chat' },
      { id: 'community',  href: 'community.html',  ic: 'community', label: 'Community' },
      { id: 'activities', href: 'activities.html', ic: 'pin',       label: 'Board' },
      { id: 'profile',    href: 'profile.html',    ic: 'profile',   label: 'Profile' }
    ];

    var h1 = document.querySelector('header h1');
    if (h1 && !h1.querySelector('img')) {
      h1.innerHTML = '<img src="logo.png" alt="Loveway" class="lw-logo-icon">';
    }

    var head = document.querySelector('header .header-tools');

    // icon ka pura naam bhi button ke saath dikhe (sirf hover tooltip nahi) —
    // key se i18n key map, taaki language badalne par naam bhi translate ho
    var NAV_I18N = {
      home: 'navHome', chain: 'navLifeChain', target: 'navGoals',
      friends: 'navFriends', settings: 'navSettings', logout: 'logout',
      profile: 'navProfile'
    };

    // per-page static icons ko emoji se SVG mein badlo (ek hi jagah se, sab pages ke liye)
    if (head) {
      head.querySelectorAll('.header-action[data-icon]').forEach(function (el) {
        var iconName = el.getAttribute('data-icon');
        if (!el.querySelector('svg')) el.insertAdjacentHTML('afterbegin', icon(iconName));
        if (!el.querySelector('.label')) {
          var key = NAV_I18N[iconName];
          var span = document.createElement('span');
          span.className = 'label';
          if (key) span.dataset.i18n = key;
          span.textContent = (key && window.t) ? window.t(key) : el.title;
          el.appendChild(span);
          el.classList.add('has-label');
        }
      });
    }

    document.querySelectorAll('.side-rail-toggle[data-icon]').forEach(function (el) {
      if (!el.querySelector('svg')) el.insertAdjacentHTML('afterbegin', icon(el.getAttribute('data-icon'), 14));
    });

    if (head && !document.getElementById('language')) {
      var langs = window.LW_LANGS || [{ code: 'en', label: 'English' }, { code: 'hi', label: 'हिंदी' }];
      var box = document.createElement('div');
      box.className = 'language-box';
      box.title = 'Language';
      box.innerHTML = icon('globe', 15) +
        '<select id="language" aria-label="Language">' +
        langs.map(function (l) { return '<option value="' + l.code + '">' + l.label + '</option>'; }).join('') +
        '</select>' + '<span class="chev">' + icon('chevron', 11) + '</span>';
      head.insertBefore(box, head.firstChild);
      var langSelect = box.querySelector('select');
      langSelect.addEventListener('change', function () {
        if (typeof window.setLanguage === 'function') window.setLanguage(this.value);
      });
      customSelect(langSelect, true);
    }

    if (head && !document.getElementById('themeToggleBtn')) {
      var themeBtn = document.createElement('button');
      themeBtn.type = 'button';
      themeBtn.className = 'header-action';
      themeBtn.id = 'themeToggleBtn';
      themeBtn.title = 'Switch theme';
      themeBtn.onclick = function () { cycleTheme(); };
      themeBtn.innerHTML = icon('sun', 16);
      head.insertBefore(themeBtn, head.firstChild);
    }

    if (head && !document.getElementById('notifBtn')) {
      var b = document.createElement('button');
      b.className = 'header-action has-label';
      b.id = 'notifBtn';
      b.title = 'Notifications';
      b.onclick = function () { window.location.href = 'notifications.html'; };
      b.innerHTML = icon('bell') + '<span class="label" data-i18n="navNotifications">' +
        (window.t ? window.t('navNotifications') : 'Notifications') + '</span>' +
        '<span class="badge-count" id="notifCount" style="display:none">0</span>';
      head.insertBefore(b, head.firstChild);
    }

    if (!document.querySelector('.bottom-nav')) {
      var nav = document.createElement('nav');
      nav.className = 'bottom-nav';
      nav.innerHTML = pages.map(function (p) {
        return '<a href="' + p.href + '" title="' + p.label + '"' + (p.id === active ? ' class="active"' : '') +
               '>' + icon(p.ic, 22) + '</a>';
      }).join('');
      document.body.appendChild(nav);
    }

    buildSidebar(active);
    buildTopbarSearch();
    buildRailRight();

    if (!window._lwScrollBound) {
      window._lwScrollBound = true;
      window.addEventListener('scroll', function () {
        var h = document.querySelector('header');
        if (h) h.classList.toggle('scrolled', window.scrollY > 6);
      }, { passive: true });
    }

    restoreTheme();
    restoreSidebarCollapsed();
    restoreRailCollapsed();
    refreshNotifCount();
    if (typeof window.applyLanguage === 'function') window.applyLanguage();
  }

  // desktop sidebar ka open/close button — state localStorage me yaad rehta hai
  function toggleSidebar() {
    var collapsed = document.body.classList.toggle('sidebar-collapsed');
    try { localStorage.setItem('loveway_sidebar_collapsed', collapsed ? '1' : '0'); } catch (e) {}
  }
  function restoreSidebarCollapsed() {
    var collapsed = false;
    try { collapsed = localStorage.getItem('loveway_sidebar_collapsed') === '1'; } catch (e) {}
    document.body.classList.toggle('sidebar-collapsed', collapsed);
  }

  // side-rail widgets (dashboard/messages ke "nearby spots" / "festivals")
  // ka open/close button — sidebar jaisa hi pattern, per-side yaad rehta hai
  function toggleRail(side) {
    var el = document.getElementById(side === 'left' ? 'railLeft' : 'railRight');
    if (!el) return;
    var collapsed = el.classList.toggle('collapsed');
    try { localStorage.setItem('loveway_rail_' + side + '_collapsed', collapsed ? '1' : '0'); } catch (e) {}
  }
  function restoreRailCollapsed() {
    ['left', 'right'].forEach(function (side) {
      var el = document.getElementById(side === 'left' ? 'railLeft' : 'railRight');
      if (!el) return;
      var collapsed = false;
      try { collapsed = localStorage.getItem('loveway_rail_' + side + '_collapsed') === '1'; } catch (e) {}
      el.classList.toggle('collapsed', collapsed);
    });
  }

  /* ---------- Left sidebar nav (desktop) — JS-injected once, same list on
     every shell() page, no per-page markup needed ---------- */
  var SIDEBAR_PAGES = [
    { id: 'feed',          href: 'dashboard.html',     icon: 'home',      label: 'navHome' },
    { id: 'community',     href: 'community.html',     icon: 'community', label: 'navCommunity' },
    { id: 'activities',    href: 'activities.html',    icon: 'pin',       label: 'navBoard' },
    { id: 'journey',       href: 'journey.html',       icon: 'chain',     label: 'navLifeChain' },
    { id: 'announcements', href: 'announcements.html', icon: 'gift',      label: 'Announcements' },
    { id: 'goals',         href: 'goals.html',         icon: 'target',    label: 'navGoals' },
    { id: 'friends',       href: 'friends.html',       icon: 'friends',   label: 'navFriends' },
    { id: 'chat',          href: 'messages.html',      icon: 'chat',      label: 'navChat' },
    { id: 'notifications', href: 'notifications.html', icon: 'bell',      label: 'navNotifications' },
    { id: 'settings',      href: 'settings.html',      icon: 'settings',  label: 'navSettings' }
  ];

  function buildSidebar(active) {
    if (document.querySelector('.app-sidebar')) return;
    var me = window.LW && window.LW.profile;
    var sidebar = document.createElement('aside');
    sidebar.className = 'app-sidebar';
    sidebar.innerHTML =
      '<div class="app-sidebar-brand">' +
        '<a href="dashboard.html"><img src="logo.png" alt="Loveway" class="lw-logo-icon"></a>' +
        '<button type="button" class="app-sidebar-toggle" onclick="LWApp.toggleSidebar()" title="Sidebar collapse/expand">' +
          icon('chevron', 16) +
        '</button>' +
      '</div>' +
      '<div class="app-sidebar-nav" role="navigation">' +
      SIDEBAR_PAGES.map(function (p) {
        return '<a href="' + p.href + '"' + (p.id === active ? ' class="active"' : '') + '>' +
          icon(p.icon) + '<span data-i18n="' + p.label + '">' +
          (window.t ? window.t(p.label) : p.id) + '</span></a>';
      }).join('') +
      '</div>' +
      '<a href="profile.html" class="app-sidebar-profile">' +
        avatarHtml(me || {}, 'sm') +
        '<div style="min-width:0"><b>' + esc((me && (me.full_name || me.username)) || '—') + '</b>' +
        '<small>@' + esc((me && me.username) || '') + '</small></div>' +
      '</a>';
    document.body.appendChild(sidebar);
  }

  /* ---------- Topbar search — real search (LWApp.searchPeople), not a
     placeholder; JS-injected into the existing <header>, no markup change
     needed on any page ---------- */
  var _topbarSearchTimer = null;
  function buildTopbarSearch() {
    var head = document.querySelector('header');
    if (!head || head.querySelector('.app-topbar-search')) return;
    var wrap = document.createElement('div');
    wrap.className = 'app-topbar-search';
    wrap.innerHTML =
      icon('search', 16) +
      '<input type="search" id="topbarSearch" placeholder="Search Loveway…" autocomplete="off">' +
      '<div class="app-search-results" style="display:none"></div>';
    var h1 = head.querySelector('h1');
    if (h1 && h1.nextSibling) head.insertBefore(wrap, h1.nextSibling);
    else head.insertBefore(wrap, head.firstChild.nextSibling || null);

    var input = wrap.querySelector('#topbarSearch');
    var results = wrap.querySelector('.app-search-results');
    input.addEventListener('input', function () {
      var q = this.value.trim();
      clearTimeout(_topbarSearchTimer);
      if (!q) { results.style.display = 'none'; results.innerHTML = ''; return; }
      _topbarSearchTimer = setTimeout(function () {
        searchPeople(q).then(function (people) {
          results.style.display = '';
          results.innerHTML = people.length
            ? people.map(function (p) {
                return '<a class="picker-item" href="profile.html?u=' + encodeURIComponent(p.username || '') + '" style="display:flex;align-items:center;gap:8px;text-decoration:none;color:inherit">' +
                  avatarHtml(p, 'sm') + '<span>' + esc(p.full_name || p.username || '—') + '</span></a>';
              }).join('')
            : '<div class="picker-item disabled">Koi nahi mila</div>';
        });
      }, 350);
    });
    document.addEventListener('click', function (e) {
      if (!wrap.contains(e.target)) { results.style.display = 'none'; }
    });
  }

  /* ---------- Right "extras" mini-rail — only injected on pages that don't
     already have their own richer .side-rail-right (dashboard/messages) ---------- */
  function buildRailRight() {
    if (document.querySelector('.side-rail-right') || document.querySelector('.app-rail-right')) return;
    var me = window.LW && window.LW.profile;
    if (!me) return;
    var rail = document.createElement('aside');
    rail.className = 'app-rail-right';
    rail.innerHTML =
      '<div class="card">' +
        '<div style="display:flex;gap:10px;align-items:center">' +
          avatarHtml(me, 'sm') +
          '<div style="min-width:0"><b style="display:block">' + esc(me.full_name || me.username || '—') + '</b>' +
          '<small class="muted">@' + esc(me.username || '') + '</small></div>' +
        '</div>' +
        '<div class="stats" id="appRailStats">' +
          '<div><b>—</b><span data-i18n="statFriends">Dost</span></div>' +
          '<div><b>—</b><span data-i18n="statPosts">Posts</span></div>' +
          '<div><b>—</b><span data-i18n="statStreak">Chain 🔥</span></div>' +
        '</div>' +
        '<a class="btn sm" href="profile.html" style="width:100%;justify-content:center;margin-top:10px">View profile</a>' +
      '</div>';
    document.body.appendChild(rail);

    Promise.all([myFriends(), myStreak()]).then(function (r) {
      var boxes = document.querySelectorAll('#appRailStats b');
      if (boxes[0]) boxes[0].textContent = r[0].length;
      if (boxes[2]) boxes[2].textContent = r[1].current_count || 0;
    }).catch(function () {});
  }

  /* ---------- Quick theme-cycle button (topbar) — cycles through all 5
     data-theme values using the existing setTheme(), no new light/dark
     concept introduced ---------- */
  var THEME_CYCLE = ['romantic', 'dark', 'ocean', 'sunset', 'modern'];
  function cycleTheme() {
    var cur = document.body.getAttribute('data-theme') || 'romantic';
    var i = THEME_CYCLE.indexOf(cur);
    setTheme(THEME_CYCLE[(i + 1) % THEME_CYCLE.length]);
  }

  function refreshNotifCount() {
    if (!sb()) return;
    sb().rpc('lw_unread_count').then(function (r) {
      var el = document.getElementById('notifCount');
      if (!el) return;
      var n = r.data || 0;
      el.textContent = n;
      el.style.display = n > 0 ? '' : 'none';
    }, function () {});
  }

  /* ---------- profiles ---------- */

  function publicProfile(idOrUsername) {
    var q = sb().from('lw_public_profiles').select('*');
    q = /^[0-9a-f-]{36}$/i.test(idOrUsername)
      ? q.eq('id', idOrUsername)
      : q.ilike('username', idOrUsername);
    return q.maybeSingle().then(function (r) { return r.data; });
  }

  function searchPeople(term) {
    var t = (term || '').trim();
    if (t.length < 2) return Promise.resolve([]);
    return sb().from('lw_public_profiles')
      .select('id, full_name, username, avatar_url, city')
      .or('username.ilike.%' + t + '%,full_name.ilike.%' + t + '%')
      .limit(25)
      .then(function (r) { return r.data || []; });
  }

  function saveProfile(patch) {
    return sb().from('profiles').update(patch).eq('id', window.LW.profile.id)
      .select().maybeSingle();
  }

  // area-wise log — apni profile mein set ki hui latitude/longitude se
  // (asli GPS distance, sirf city-naam match nahi) sabse najdeek log pehle
  function nearbyPeople(lat, lng, limit) {
    if (lat == null || lng == null) return Promise.resolve([]);
    return sb().rpc('lw_nearby_people', { p_lat: lat, p_lng: lng, p_limit: limit || 12 })
      .then(function (r) { return r.data || []; });
  }

  // "Suggested for you" — jinse abhi dosti nahi hai, unme se kuch dikhao
  // (apne shehar wale pehle, phir baaki naye log)
  function suggestedPeople(limit) {
    var meId = window.LW.profile.id;
    var myCity = window.LW.profile.city;
    return sb().from('lw_public_profiles')
      .select('id, full_name, username, avatar_url, city')
      .neq('id', meId)
      .order('created_at', { ascending: false })
      .limit(60)
      .then(function (r) {
        var rows = r.data || [];
        if (myCity) {
          rows.sort(function (a, b) {
            var aCity = a.city === myCity ? 0 : 1;
            var bCity = b.city === myCity ? 0 : 1;
            return aCity - bCity;
          });
        }
        return rows.slice(0, limit || 8);
      });
  }

  /* ---------- friends ---------- */

  function myFriends() {
    return sb().rpc('lw_my_friends').then(function (r) { return r.data || []; });
  }

  function pendingRequests() {
    return sb().from('friendships')
      .select('id, requester_id, created_at')
      .eq('addressee_id', window.LW.profile.id)
      .eq('status', 'pending')
      .then(function (r) {
        var rows = r.data || [];
        if (!rows.length) return [];
        return sb().from('lw_public_profiles')
          .select('id, full_name, username, avatar_url, city')
          .in('id', rows.map(function (x) { return x.requester_id; }))
          .then(function (p) {
            var by = {};
            (p.data || []).forEach(function (x) { by[x.id] = x; });
            return rows.map(function (x) {
              return { req_id: x.id, created_at: x.created_at, person: by[x.requester_id] || {} };
            });
          });
      });
  }

  function sentRequests() {
    return sb().from('friendships')
      .select('id, addressee_id, status')
      .eq('requester_id', window.LW.profile.id)
      .then(function (r) { return r.data || []; });
  }

  function addFriend(otherId) {
    return sb().from('friendships')
      .insert({ requester_id: window.LW.profile.id, addressee_id: otherId });
  }

  function answerRequest(reqId, accept) {
    return sb().from('friendships')
      .update({ status: accept ? 'accepted' : 'declined' })
      .eq('id', reqId);
  }

  function removeFriend(otherId) {
    var me = window.LW.profile.id;
    return sb().from('friendships').delete()
      .or('and(requester_id.eq.' + me + ',addressee_id.eq.' + otherId + '),' +
          'and(requester_id.eq.' + otherId + ',addressee_id.eq.' + me + ')');
  }

  // koi bhi existing friendship/request row ho to seedha 'blocked' kar do,
  // warna pehle ek row banao (insert sirf 'pending' status allow karta hai) phir block karo
  function blockUser(otherId) {
    var me = window.LW.profile.id;
    return sb().from('friendships').select('id')
      .or('and(requester_id.eq.' + me + ',addressee_id.eq.' + otherId + '),' +
          'and(requester_id.eq.' + otherId + ',addressee_id.eq.' + me + ')')
      .maybeSingle()
      .then(function (r) {
        if (r.data) return sb().from('friendships').update({ status: 'blocked' }).eq('id', r.data.id);
        return sb().from('friendships').insert({ requester_id: me, addressee_id: otherId, status: 'pending' })
          .select('id').maybeSingle()
          .then(function (ins) {
            if (ins.error) throw ins.error;
            return sb().from('friendships').update({ status: 'blocked' }).eq('id', ins.data.id);
          });
      });
  }

  function blockedUsers() {
    var me = window.LW.profile.id;
    return sb().from('friendships').select('id, requester_id, addressee_id')
      .eq('status', 'blocked')
      .or('requester_id.eq.' + me + ',addressee_id.eq.' + me)
      .then(function (r) {
        var rows = r.data || [];
        if (!rows.length) return [];
        var others = rows.map(function (x) { return x.requester_id === me ? x.addressee_id : x.requester_id; });
        return sb().from('lw_public_profiles').select('id, full_name, username, avatar_url').in('id', others)
          .then(function (p) {
            var by = {};
            (p.data || []).forEach(function (x) { by[x.id] = x; });
            return rows.map(function (x) {
              var oid = x.requester_id === me ? x.addressee_id : x.requester_id;
              return { friendship_id: x.id, person: by[oid] || { id: oid } };
            });
          });
      });
  }

  /* ---------- family ---------- */

  function familyList(ownerId) {
    return sb().from('family_members').select('*')
      .eq('owner_id', ownerId || window.LW.profile.id)
      .order('id')
      .then(function (r) { return r.data || []; });
  }

  function familyTree(ownerId) {
    return sb().rpc('lw_family_tree', { p_owner: ownerId || window.LW.profile.id })
      .then(function (r) { return r.data || []; });
  }

  function saveFamilyMember(m) {
    m.owner_id = window.LW.profile.id;
    if (m.id) {
      var id = m.id; delete m.id;
      return sb().from('family_members').update(m).eq('id', id);
    }
    return sb().from('family_members').insert(m);
  }

  function deleteFamilyMember(id) {
    return sb().from('family_members').delete().eq('id', id);
  }

  /* ---------- feed ---------- */

  var POST_COLS = 'id, author_id, content, kind, media_url, song_title, song_artist, song_url,' +
                  ' visibility, community_id, created_at';

  function feed(opts) {
    opts = opts || {};
    var q = sb().from('posts').select(POST_COLS).order('created_at', { ascending: false }).limit(opts.limit || 30);
    if (opts.authorId)    q = q.eq('author_id', opts.authorId);
    if (opts.communityId) q = q.eq('community_id', opts.communityId);
    return q.then(function (r) { return decorate(r.data || []); });
  }

  // posts ke saath author, reaction count, meri reaction, comment count
  function decorate(posts) {
    if (!posts.length) return Promise.resolve([]);
    var ids     = posts.map(function (p) { return p.id; });
    var authors = posts.map(function (p) { return p.author_id; });
    var me      = window.LW.profile.id;

    return Promise.all([
      sb().from('lw_public_profiles').select('id, full_name, username, avatar_url').in('id', authors),
      sb().from('post_reactions').select('post_id, user_id').in('post_id', ids),
      sb().from('post_comments').select('id, post_id').in('post_id', ids)
    ]).then(function (res) {
      var by = {};
      (res[0].data || []).forEach(function (a) { by[a.id] = a; });

      var reacts = {}, mine = {};
      (res[1].data || []).forEach(function (x) {
        reacts[x.post_id] = (reacts[x.post_id] || 0) + 1;
        if (x.user_id === me) mine[x.post_id] = true;
      });

      var comments = {};
      (res[2].data || []).forEach(function (x) {
        comments[x.post_id] = (comments[x.post_id] || 0) + 1;
      });

      posts.forEach(function (p) {
        p.author       = by[p.author_id] || { full_name: '—' };
        p.love_count   = reacts[p.id] || 0;
        p.i_loved      = !!mine[p.id];
        p.comment_count = comments[p.id] || 0;
      });
      return posts;
    });
  }

  function createPost(p) {
    p.author_id = window.LW.profile.id;
    return sb().from('posts').insert(p).select(POST_COLS).maybeSingle();
  }

  // feed/story photo — "posts" bucket, path: <user_id>/<file>
  function uploadPostMedia(file) {
    var safe = (file.name || 'file').replace(/[^a-zA-Z0-9._-]/g, '_');
    var path = window.LW.profile.id + '/' + Date.now() + '-' + safe;
    return sb().storage.from('posts')
      .upload(path, file, { contentType: file.type || undefined })
      .then(function (r) {
        if (r.error) throw r.error;
        return sb().storage.from('posts').getPublicUrl(path).data.publicUrl;
      });
  }

  /* ---------- Announcements (birthday/anniversary/proposal/... — approval-gated,
     recipient must approve before it becomes a real post) ---------- */
  function createAnnouncement(a) {
    a.sender_id = window.LW.profile.id;
    return sb().from('announcements').insert(a).select().maybeSingle();
  }

  // announcements/<user_id>/<file> — "announcements" bucket, path jaisa posts/journey mein hai
  function uploadAnnouncementMedia(file) {
    var safe = (file.name || 'file').replace(/[^a-zA-Z0-9._-]/g, '_');
    var path = window.LW.profile.id + '/' + Date.now() + '-' + safe;
    return sb().storage.from('announcements')
      .upload(path, file, { contentType: file.type || undefined })
      .then(function (r) {
        if (r.error) throw r.error;
        return sb().storage.from('announcements').getPublicUrl(path).data.publicUrl;
      });
  }

  function pendingAnnouncements() {
    return sb().from('announcements')
      .select('id, sender_id, kind, message, media_url, visibility, created_at')
      .eq('recipient_id', window.LW.profile.id)
      .eq('status', 'pending')
      .order('created_at', { ascending: false })
      .then(function (r) {
        var rows = r.data || [];
        if (!rows.length) return [];
        return sb().from('lw_public_profiles')
          .select('id, full_name, username, avatar_url')
          .in('id', rows.map(function (x) { return x.sender_id; }))
          .then(function (p) {
            var by = {};
            (p.data || []).forEach(function (x) { by[x.id] = x; });
            return rows.map(function (x) { x.sender = by[x.sender_id] || {}; return x; });
          });
      });
  }

  function sentAnnouncements() {
    return sb().from('announcements')
      .select('id, recipient_id, kind, message, media_url, visibility, status, created_at')
      .eq('sender_id', window.LW.profile.id)
      .order('created_at', { ascending: false })
      .then(function (r) {
        var rows = r.data || [];
        if (!rows.length) return [];
        return sb().from('lw_public_profiles')
          .select('id, full_name, username, avatar_url')
          .in('id', rows.map(function (x) { return x.recipient_id; }))
          .then(function (p) {
            var by = {};
            (p.data || []).forEach(function (x) { by[x.id] = x; });
            return rows.map(function (x) { x.recipient = by[x.recipient_id] || {}; return x; });
          });
      });
  }

  function answerAnnouncement(id, approve) {
    return sb().from('announcements')
      .update({ status: approve ? 'approved' : 'rejected' })
      .eq('id', id);
  }

  /* ---------- Location picker (Leaflet + OpenStreetMap Nominatim, no API key) ---------- */
  var _lwMap = null, _lwMarker = null, _lwPickCallback = null, _lwLeafletLoading = null;

  function loadLeaflet() {
    if (window.L) return Promise.resolve();
    if (_lwLeafletLoading) return _lwLeafletLoading;
    _lwLeafletLoading = new Promise(function (resolve, reject) {
      var css = document.createElement('link');
      css.rel = 'stylesheet';
      css.href = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css';
      document.head.appendChild(css);
      var js = document.createElement('script');
      js.src = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js';
      js.onload = resolve;
      js.onerror = reject;
      document.head.appendChild(js);
    });
    return _lwLeafletLoading;
  }

  function ensureLocationModal() {
    if (document.getElementById('lwLocModal')) return;
    var modal = document.createElement('div');
    modal.className = 'modal-bg';
    modal.id = 'lwLocModal';
    modal.innerHTML =
      '<div class="modal" style="max-width:560px">' +
        '<h3>📍 Location chuno</h3>' +
        '<button type="button" class="btn primary" id="lwLocDetectBtn" onclick="LWApp.detectMyLocation()" ' +
          'style="width:100%;margin-bottom:10px;justify-content:center">📍 Meri location detect karo</button>' +
        '<input type="text" id="lwLocSearch" placeholder="Ya jagah khojo… (jaise Goa, Marine Drive)" autocomplete="off">' +
        '<div id="lwLocResults" class="lw-loc-results"></div>' +
        '<div id="lwLocMap" class="lw-loc-map"></div>' +
        '<div class="muted" id="lwLocSelected" style="margin-top:8px;min-height:20px"></div>' +
        '<div class="foot">' +
          '<button class="btn" onclick="LWApp.closeLocationPicker()">Cancel</button>' +
          '<button class="btn primary" id="lwLocConfirm" onclick="LWApp.confirmLocation()" disabled>Ye location use karo</button>' +
        '</div>' +
      '</div>';
    document.body.appendChild(modal);
    modal.addEventListener('click', function (e) { if (e.target === modal) closeLocationPicker(); });

    var searchTimer = null;
    document.getElementById('lwLocSearch').addEventListener('input', function () {
      clearTimeout(searchTimer);
      var q = this.value.trim();
      if (q.length < 3) { document.getElementById('lwLocResults').innerHTML = ''; return; }
      searchTimer = setTimeout(function () { searchPlace(q); }, 400);
    });
  }

  function searchPlace(q) {
    var box = document.getElementById('lwLocResults');
    box.innerHTML = '<div class="spinner" style="padding:14px">Khoj rahe hain…</div>';
    fetch('https://nominatim.openstreetmap.org/search?format=json&limit=6&q=' + encodeURIComponent(q))
      .then(function (r) { return r.json(); })
      .then(function (rows) {
        window._lwLocResults = rows;
        box.innerHTML = rows.length
          ? rows.map(function (r, i) {
              return '<div class="lw-loc-item" onclick="LWApp.pickSearchResult(' + i + ')">📍 ' + esc(r.display_name) + '</div>';
            }).join('')
          : '<div class="muted" style="padding:8px">Kuch nahi mila.</div>';
      })
      .catch(function () { box.innerHTML = '<div class="muted" style="padding:8px">Search fail ho gayi.</div>'; });
  }

  function pickSearchResult(i) {
    var r = (window._lwLocResults || [])[i];
    if (!r) return;
    setPickedLocation(parseFloat(r.lat), parseFloat(r.lon), r.display_name);
    document.getElementById('lwLocResults').innerHTML = '';
    document.getElementById('lwLocSearch').value = '';
  }

  function setPickedLocation(lat, lng, name) {
    _lwMap.setView([lat, lng], 15);
    if (_lwMarker) _lwMap.removeLayer(_lwMarker);
    _lwMarker = window.L.marker([lat, lng]).addTo(_lwMap);
    window._lwPicked = { lat: lat, lng: lng, name: name };
    document.getElementById('lwLocSelected').textContent = '📍 ' + name;
    document.getElementById('lwLocConfirm').disabled = false;
  }

  function reverseGeocode(lat, lng) {
    return fetch('https://nominatim.openstreetmap.org/reverse?format=json&lat=' + lat + '&lon=' + lng + '&zoom=14&addressdetails=1')
      .then(function (r) { return r.json(); })
      .then(function (r) {
        var a = r && r.address;
        if (a) {
          // "Area, City" jaisa chhota naam banao — poora address se behtar dikhta hai
          var area = a.suburb || a.neighbourhood || a.city_district || a.town || a.village || '';
          var city = a.city || a.town || a.village || a.state_district || '';
          var parts = [];
          if (area && area !== city) parts.push(area);
          if (city) parts.push(city);
          else if (a.state) parts.push(a.state);
          if (parts.length) return parts.join(', ');
        }
        return (r && r.display_name) || (lat.toFixed(4) + ', ' + lng.toFixed(4));
      })
      .catch(function () { return lat.toFixed(4) + ', ' + lng.toFixed(4); });
  }

  // browser ka native GPS/location — "profile kis area ki hai" turant pata chal jaaye
  function detectMyLocation() {
    var btn = document.getElementById('lwLocDetectBtn');
    if (!navigator.geolocation) {
      if (btn) btn.textContent = '❌ Is browser mein location detect nahi ho sakti';
      return;
    }
    var original = btn ? btn.textContent : '';
    if (btn) { btn.disabled = true; btn.textContent = '📍 Detect ho raha hai…'; }

    // map abhi initialize ho raha ho sakta hai (openLocationPicker isko async banata hai) —
    // pehle uske taiyaar hone ka intezaar karo, warna setPickedLocation crash ho sakta hai
    function whenMapReady(cb) {
      if (_lwMap) cb(); else setTimeout(function () { whenMapReady(cb); }, 60);
    }

    navigator.geolocation.getCurrentPosition(
      function (pos) {
        var lat = pos.coords.latitude, lng = pos.coords.longitude;
        loadLeaflet().then(function () {
          whenMapReady(function () {
            reverseGeocode(lat, lng).then(function (name) {
              setPickedLocation(lat, lng, name);
              if (btn) { btn.disabled = false; btn.textContent = original; }
            });
          });
        });
      },
      function (err) {
        if (btn) {
          btn.disabled = false;
          btn.textContent = err && err.code === 1
            ? '❌ Location permission denied — browser settings mein allow karo'
            : '❌ Location nahi mil payi, dobara try karo';
        }
      },
      { enableHighAccuracy: true, timeout: 10000 }
    );
  }

  function openLocationPicker(onPick) {
    ensureLocationModal();
    _lwPickCallback = onPick;
    document.getElementById('lwLocModal').classList.add('open');
    document.getElementById('lwLocSearch').value = '';
    document.getElementById('lwLocResults').innerHTML = '';
    document.getElementById('lwLocSelected').textContent = '';
    document.getElementById('lwLocConfirm').disabled = true;
    window._lwPicked = null;

    loadLeaflet().then(function () {
      setTimeout(function () {   // modal ko render hone do, tabhi map sahi size leta hai
        if (!_lwMap) {
          _lwMap = window.L.map('lwLocMap').setView([20.5937, 78.9629], 5);   // India center default
          window.L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
            attribution: '© OpenStreetMap'
          }).addTo(_lwMap);
          _lwMap.on('click', function (e) {
            reverseGeocode(e.latlng.lat, e.latlng.lng).then(function (name) {
              setPickedLocation(e.latlng.lat, e.latlng.lng, name);
            });
          });
        } else {
          _lwMap.invalidateSize();
        }
      }, 50);
    });
  }

  function closeLocationPicker() {
    var m = document.getElementById('lwLocModal');
    if (m) m.classList.remove('open');
  }

  function confirmLocation() {
    if (!window._lwPicked || !_lwPickCallback) return;
    _lwPickCallback(window._lwPicked);
    closeLocationPicker();
  }

  /* ---------- Spotify track picker (reusable — story music, dedications, etc) ---------- */
  var _spotifyPickCallback = null;

  function spotifyEmbedUrl(url) {
    var m = /open\.spotify\.com\/(track|album|playlist|episode)\/([a-zA-Z0-9]+)/.exec(url || '');
    return m ? 'https://open.spotify.com/embed/' + m[1] + '/' + m[2] + '?utm_source=loveway' : null;
  }

  var _spotifySearchTimer = null;

  function ensureSpotifyModal() {
    if (document.getElementById('lwSpotifyModal')) return;
    var modal = document.createElement('div');
    modal.className = 'modal-bg';
    modal.id = 'lwSpotifyModal';
    modal.innerHTML =
      '<div class="modal">' +
        '<h3>🎵 Spotify se gaana chuno</h3>' +
        '<input type="text" id="lwSpotifySearch" placeholder="🔍 Gaana ya singer ka naam likho…" style="margin-top:10px" autocomplete="off">' +
        '<div id="lwSpotifyBody" style="margin-top:10px"><div class="spinner">Load ho raha hai…</div></div>' +
        '<div class="foot"><button class="btn" onclick="LWApp.closeSpotifyPicker()">Band karo</button></div>' +
      '</div>';
    document.body.appendChild(modal);
    modal.addEventListener('click', function (e) { if (e.target === modal) closeSpotifyPicker(); });
    document.getElementById('lwSpotifySearch').addEventListener('input', function () {
      var q = this.value.trim();
      clearTimeout(_spotifySearchTimer);
      _spotifySearchTimer = setTimeout(function () {
        if (q) searchSpotifyTracks(q); else loadSpotifyPlaylists();
      }, 400);
    });
  }

  function openSpotifyPicker(onPick) {
    ensureSpotifyModal();
    _spotifyPickCallback = onPick;
    document.getElementById('lwSpotifyModal').classList.add('open');
    document.getElementById('lwSpotifySearch').value = '';
    loadSpotifyPlaylists();
  }

  // Spotify /search ka fetch-only hissa — modal (searchSpotifyTracks) aur
  // dashboard rail ka inline search box, dono isi ek jagah se track list laate
  // hain, taaki API-call/error-handling logic do baar na likhna pade.
  async function fetchSpotifyTracks(query) {
    var r = await window.LW.spotifyApi('/search?type=track&limit=20&q=' + encodeURIComponent(query));
    if (r.error) return { error: r.error };
    return { tracks: (r.data && r.data.tracks && r.data.tracks.items) || [] };
  }

  // free-text song search (Spotify /search) — alag se query type karke gaana dhoondo,
  // playlist mein dhoondhne ke bajaye
  async function searchSpotifyTracks(query) {
    var box = document.getElementById('lwSpotifyBody');
    box.innerHTML = '<div class="spinner">"' + esc(query) + '" khoja ja raha hai…</div>';
    var r = await fetchSpotifyTracks(query);
    if (r.error) {
      box.innerHTML =
        '<div class="empty"><span class="ic">🎧</span>' +
        (r.error === 'no-token'
          ? 'Pehle Spotify se sign-in/connect karo, tabhi search kaam karegi.'
          : 'Spotify session expire ho gaya lagta hai — dobara connect karo.') +
        '<br><br><button class="btn primary" onclick="LW.spotify()">🎵 Spotify connect karo</button></div>';
      return;
    }
    renderSpotifyTrackResults(r.tracks, 'Kuch nahi mila. Doosra naam try karo.');
  }

  function closeSpotifyPicker() {
    var m = document.getElementById('lwSpotifyModal');
    if (m) m.classList.remove('open');
  }

  async function loadSpotifyPlaylists() {
    var box = document.getElementById('lwSpotifyBody');
    box.innerHTML = '<div class="spinner">Spotify se connect ho raha hai…</div>';
    var r = await window.LW.spotifyApi('/me/playlists?limit=50');
    if (r.error) {
      box.innerHTML =
        '<div class="empty"><span class="ic">🎧</span>' +
        (r.error === 'no-token'
          ? 'Pehle Spotify se sign-in/connect karo, tabhi playlist dikhegi.'
          : 'Spotify session expire ho gaya lagta hai — dobara connect karo.') +
        '<br><br><button class="btn primary" onclick="LW.spotify()">🎵 Spotify connect karo</button></div>';
      return;
    }
    renderSpotifyPlaylists((r.data && r.data.items) || []);
  }

  function renderSpotifyPlaylists(items) {
    var box = document.getElementById('lwSpotifyBody');
    if (!items.length) {
      box.innerHTML = '<div class="empty"><span class="ic">🎧</span>Koi playlist nahi mili.</div>';
      return;
    }
    box.innerHTML = items.map(function (p) {
      var img = (p.images && p.images[0] && p.images[0].url) || '';
      var safeName = esc(String(p.name || '').replace(/\\/g, '\\\\').replace(/'/g, "\\'"));
      return '<div class="sp-item" onclick="LWApp.openSpotifyPlaylistTracks(\'' + p.id + '\',\'' + safeName + '\')">' +
        (img ? '<img src="' + esc(img) + '">' : '<div class="avatar sm">🎵</div>') +
        '<div style="min-width:0"><b>' + esc(p.name) + '</b><br><small class="muted">' +
        (p.tracks ? p.tracks.total : 0) + ' gaane</small></div></div>';
    }).join('');
  }

  async function openSpotifyPlaylistTracks(playlistId, name) {
    var box = document.getElementById('lwSpotifyBody');
    box.innerHTML = '<div class="spinner">"' + esc(name) + '" load ho raha hai…</div>';
    var r = await window.LW.spotifyApi('/playlists/' + encodeURIComponent(playlistId) + '/tracks?limit=50');
    if (r.error) { box.innerHTML = '<div class="empty"><span class="ic">🎧</span>Load nahi ho paaya.</div>'; return; }

    var tracks = ((r.data && r.data.items) || []).map(function (it) { return it.track; }).filter(Boolean);
    renderSpotifyTrackResults(tracks, 'Is playlist mein gaane nahi hain.', true);
  }

  function backToSpotifyPlaylists() { loadSpotifyPlaylists(); }

  // playlist tracks aur free-text search — dono jagah gaano ki list ek jaisi dikhti hai
  function renderSpotifyTrackResults(tracks, emptyMsg, showBackBtn) {
    var box = document.getElementById('lwSpotifyBody');
    var backBtn = showBackBtn
      ? '<div class="foot" style="justify-content:flex-start;margin:0 0 8px">' +
        '<button class="btn" onclick="LWApp.backToSpotifyPlaylists()">⬅ Playlists</button></div>'
      : '';
    if (!tracks.length) {
      box.innerHTML = backBtn + '<div class="empty"><span class="ic">🎧</span>' + esc(emptyMsg) + '</div>';
      return;
    }
    box.innerHTML = backBtn + tracks.map(function (t) {
      var img = (t.album && t.album.images && t.album.images[t.album.images.length - 1] && t.album.images[t.album.images.length - 1].url) || '';
      var artists = (t.artists || []).map(function (a) { return a.name; }).join(', ');
      return '<div class="sp-item" onclick="LWApp.pickSpotifyTrack(' + JSON.stringify({
          id: t.id, title: t.name, artist: artists, url: (t.external_urls && t.external_urls.spotify) || ''
        }).replace(/"/g, '&quot;') + ')">' +
        (img ? '<img src="' + esc(img) + '">' : '<div class="avatar sm">🎵</div>') +
        '<div style="min-width:0"><b>' + esc(t.name) + '</b><br><small class="muted">' + esc(artists) + '</small></div></div>';
    }).join('');
  }

  function pickSpotifyTrack(track) {
    if (_spotifyPickCallback) _spotifyPickCallback(track);
    closeSpotifyPicker();
  }

  /* ---------- Song favorites + playlists (dashboard/messages right-rail music card) ----------
     track shape everywhere here: { id, title, artist, url } — same shape the
     Spotify picker already hands back via pickSpotifyTrack(). */
  function myFavorites() {
    return sb().from('song_favorites').select('*')
      .eq('user_id', window.LW.profile.id).order('created_at', { ascending: false })
      .then(function (r) { return r.data || []; });
  }

  function favoriteSong(track) {
    return sb().from('song_favorites').upsert({
      user_id: window.LW.profile.id,
      spotify_track_id: track.id,
      song_title: track.title,
      song_artist: track.artist || null,
      song_url: track.url || null
    }, { onConflict: 'user_id,spotify_track_id' });
  }

  function unfavoriteSong(spotifyTrackId) {
    return sb().from('song_favorites').delete()
      .eq('user_id', window.LW.profile.id).eq('spotify_track_id', spotifyTrackId);
  }

  function myPlaylists() {
    return sb().from('playlists').select('*')
      .eq('owner_id', window.LW.profile.id).order('created_at', { ascending: false })
      .then(function (r) { return r.data || []; });
  }

  function createPlaylist(name) {
    return sb().from('playlists').insert({ owner_id: window.LW.profile.id, name: name }).select().maybeSingle()
      .then(function (r) { return r.data; });
  }

  function deletePlaylist(id) {
    return sb().from('playlists').delete().eq('id', id);
  }

  function playlistTracks(playlistId) {
    return sb().from('playlist_tracks').select('*')
      .eq('playlist_id', playlistId).order('position', { ascending: true })
      .then(function (r) { return r.data || []; });
  }

  function addToPlaylist(playlistId, track) {
    return sb().from('playlist_tracks').upsert({
      playlist_id: playlistId,
      spotify_track_id: track.id,
      song_title: track.title,
      song_artist: track.artist || null,
      song_url: track.url || null
    }, { onConflict: 'playlist_id,spotify_track_id' });
  }

  function removeFromPlaylist(playlistId, spotifyTrackId) {
    return sb().from('playlist_tracks').delete()
      .eq('playlist_id', playlistId).eq('spotify_track_id', spotifyTrackId);
  }

  // profile par pin kiya hua gaana (Instagram jaisa) — track=null pin hata deta hai
  function updateProfilePinnedSong(track) {
    return sb().from('profiles').update({
      pinned_spotify_track_id: track ? track.id : null,
      pinned_song_title: track ? track.title : null,
      pinned_song_artist: track ? (track.artist || null) : null,
      pinned_song_url: track ? (track.url || null) : null
    }).eq('id', window.LW.profile.id);
  }

  /* ---------- Life Chain (couple's shared journey) ---------- */

  var JOURNEY_COLS = 'id, author_id, title, quote, image_url, location_name, latitude, longitude, entry_date, is_important, created_at';

  function withAuthors(rows) {
    if (!rows.length) return Promise.resolve(rows);
    var ids = rows.map(function (x) { return x.author_id; });
    return sb().from('lw_public_profiles').select('id, full_name, username, avatar_url').in('id', ids)
      .then(function (p) {
        var by = {};
        (p.data || []).forEach(function (x) { by[x.id] = x; });
        rows.forEach(function (x) { x.author = by[x.author_id] || {}; });
        return rows;
      });
  }

  // RLS khud scope kar deta hai — apni aur partner ki, dono ki entries ek hi list mein
  function journeyEntries() {
    return sb().from('journey_entries').select(JOURNEY_COLS)
      .order('entry_date', { ascending: false })
      .order('created_at', { ascending: false })
      .limit(200)
      .then(function (r) { return withAuthors(r.data || []); });
  }

  function createJourneyEntry(e) {
    e.author_id = window.LW.profile.id;
    return sb().from('journey_entries').insert(e).select(JOURNEY_COLS).maybeSingle();
  }

  function deleteJourneyEntry(id) {
    return sb().from('journey_entries').delete().eq('id', id);
  }

  // journey photo — "journey" bucket, path: <user_id>/<file>
  function uploadJourneyMedia(file) {
    var safe = (file.name || 'file').replace(/[^a-zA-Z0-9._-]/g, '_');
    var path = window.LW.profile.id + '/' + Date.now() + '-' + safe;
    return sb().storage.from('journey')
      .upload(path, file, { contentType: file.type || undefined })
      .then(function (r) {
        if (r.error) throw r.error;
        return sb().storage.from('journey').getPublicUrl(path).data.publicUrl;
      });
  }

  function journeyUpdates(entryId) {
    return sb().from('journey_updates')
      .select('id, entry_id, author_id, content, image_url, created_at')
      .eq('entry_id', entryId).order('created_at')
      .then(function (r) { return withAuthors(r.data || []); });
  }

  function addJourneyUpdate(entryId, content, imageUrl) {
    return sb().from('journey_updates').insert({
      entry_id: entryId, author_id: window.LW.profile.id,
      content: content || null, image_url: imageUrl || null
    });
  }

  // 24-ghante wali stories — RLS friends/visibility filter kar deta hai, par apni
  // hi expired story author ko hamesha dikhti rahegi (RLS use bypass karta hai),
  // isliye expiry yahan client-side bhi check karte hain
  function storiesFeed() {
    return sb().from('posts').select(POST_COLS)
      .eq('kind', 'story')
      .order('created_at', { ascending: false })
      .limit(100)
      .then(function (r) {
        var rows = (r.data || []).filter(function (p) {
          return !p.expires_at || new Date(p.expires_at) > new Date();
        });
        return decorate(rows);
      });
  }

  function deletePost(id) {
    return sb().from('posts').delete().eq('id', id);
  }

  function toggleLove(postId, currentlyLoved) {
    var me = window.LW.profile.id;
    return currentlyLoved
      ? sb().from('post_reactions').delete().eq('post_id', postId).eq('user_id', me)
      : sb().from('post_reactions').insert({ post_id: postId, user_id: me, kind: 'love' });
  }

  function comments(postId) {
    return sb().from('post_comments')
      .select('id, author_id, content, created_at')
      .eq('post_id', postId).order('created_at')
      .then(function (r) {
        var rows = r.data || [];
        if (!rows.length) return [];
        return sb().from('lw_public_profiles')
          .select('id, full_name, username, avatar_url')
          .in('id', rows.map(function (c) { return c.author_id; }))
          .then(function (p) {
            var by = {};
            (p.data || []).forEach(function (x) { by[x.id] = x; });
            rows.forEach(function (c) { c.author = by[c.author_id] || {}; });
            return rows;
          });
      });
  }

  function addComment(postId, text) {
    return sb().from('post_comments')
      .insert({ post_id: postId, author_id: window.LW.profile.id, content: text });
  }

  /* ---------- chat ---------- */

  function myConversations() {
    var me = window.LW.profile.id;
    return sb().from('conversation_members')
      .select('conversation_id, last_read_at')
      .eq('user_id', me)
      .then(function (r) {
        var rows = r.data || [];
        if (!rows.length) return [];
        var ids = rows.map(function (x) { return x.conversation_id; });

        return Promise.all([
          sb().from('conversations').select('*').in('id', ids).order('updated_at', { ascending: false }),
          sb().from('conversation_members').select('conversation_id, user_id').in('conversation_id', ids)
        ]).then(function (res) {
          var convs   = res[0].data || [];
          var members = res[1].data || [];

          // direct chat ka naam = doosre banda
          var others = [];
          var byConv = {};
          members.forEach(function (m) {
            (byConv[m.conversation_id] = byConv[m.conversation_id] || []).push(m.user_id);
            if (m.user_id !== me) others.push(m.user_id);
          });

          if (!others.length) return convs.map(function (c) { c.members = byConv[c.id] || []; return c; });

          return sb().from('lw_public_profiles')
            .select('id, full_name, username, avatar_url')
            .in('id', others)
            .then(function (p) {
              var by = {};
              (p.data || []).forEach(function (x) { by[x.id] = x; });
              convs.forEach(function (c) {
                c.members = byConv[c.id] || [];
                if (c.kind === 'direct') {
                  var o = c.members.filter(function (u) { return u !== me; })[0];
                  c.other = by[o] || {};
                  c.title = c.other.full_name || c.other.username || 'Chat';
                }
              });
              return convs;
            });
        });
      });
  }

  function openDirect(otherId) {
    return sb().rpc('lw_direct_conversation', { p_other: otherId })
      .then(function (r) {
        if (r.error) throw r.error;
        return r.data;
      });
  }

  function messages(convId, limit) {
    return sb().from('messages')
      .select('id, sender_id, content, kind, meta, created_at')
      .eq('conversation_id', convId)
      .order('created_at', { ascending: false })
      .limit(limit || 60)
      .then(function (r) {
        var rows = (r.data || []).reverse();
        if (!rows.length) return [];
        var senders = rows.map(function (m) { return m.sender_id; });
        return sb().from('lw_public_profiles')
          .select('id, full_name, username, avatar_url')
          .in('id', senders)
          .then(function (p) {
            var by = {};
            (p.data || []).forEach(function (x) { by[x.id] = x; });
            rows.forEach(function (m) { m.sender = by[m.sender_id] || {}; });
            return rows;
          });
      });
  }

  // chat header mein "ab tak N messages" dikhane ke liye — sirf count, poora data nahi
  function conversationMessageCount(convId) {
    return sb().from('messages')
      .select('id', { count: 'exact', head: true })
      .eq('conversation_id', convId)
      .then(function (r) { return r.count || 0; });
  }

  function songMessages(convId, limit) {
    return sb().from('messages')
      .select('id, sender_id, content, meta, created_at')
      .eq('conversation_id', convId)
      .eq('kind', 'song')
      .order('created_at', { ascending: false })
      .limit(limit || 50)
      .then(function (r) { return r.data || []; });
  }

  function sendMessage(convId, text, kind, meta) {
    return sb().from('messages').insert({
      conversation_id: convId,
      sender_id: window.LW.profile.id,
      content: text,
      kind: kind || 'text',
      meta: meta || {}
    }).select('id, created_at').maybeSingle();
  }

  // chat photo/video/audio — "chat-media" bucket, path: <conv>/<sender>/<file>
  // upload karke public URL + meta lauta deta hai; message bhejna caller ka kaam hai
  // (taaki UI turant optimistic bubble dikha sake, jaise gaana bhejte waqt hota hai)
  function uploadChatMedia(convId, file) {
    var safe = (file.name || 'file').replace(/[^a-zA-Z0-9._-]/g, '_');
    var path = convId + '/' + window.LW.profile.id + '/' + Date.now() + '-' + safe;
    return sb().storage.from('chat-media')
      .upload(path, file, { contentType: file.type || undefined, upsert: false })
      .then(function (r) {
        if (r.error) throw r.error;
        var pub = sb().storage.from('chat-media').getPublicUrl(path);
        return { url: pub.data.publicUrl, mime: file.type || '', name: file.name, size: file.size };
      });
  }

  // profile photo — "avatars" bucket, path: <user_id>/<file>  (public URL seedha avatar_url ban jaata hai)
  function uploadAvatar(file) {
    var uid = window.LW.profile.id;
    var ext = ((file.name || '').split('.').pop() || 'jpg').toLowerCase().replace(/[^a-z0-9]/g, '') || 'jpg';
    var path = uid + '/' + Date.now() + '.' + ext;
    return sb().storage.from('avatars')
      .upload(path, file, { contentType: file.type || undefined, upsert: true })
      .then(function (r) {
        if (r.error) throw r.error;
        return sb().storage.from('avatars').getPublicUrl(path).data.publicUrl;
      });
  }

  function createGroup(title, memberIds, kind, communityId) {
    return sb().from('conversations')
      .insert({ kind: kind || 'group', title: title, created_by: window.LW.profile.id,
                community_id: communityId || null })
      .select().maybeSingle()
      .then(function (r) {
        if (r.error) throw r.error;
        var cid = r.data.id;
        if (!memberIds || !memberIds.length) return cid;
        return sb().from('conversation_members')
          .insert(memberIds.map(function (u) { return { conversation_id: cid, user_id: u }; }))
          .then(function () { return cid; });
      });
  }

  function markRead(convId) {
    return sb().from('conversation_members')
      .update({ last_read_at: new Date().toISOString() })
      .eq('conversation_id', convId).eq('user_id', window.LW.profile.id);
  }

  // chat delete/leave karo — apni khud ki membership row hatti hai, isliye
  // direct chat mein doosre banda ke liye chat waisi hi rehti hai
  function leaveConversation(convId) {
    return sb().from('conversation_members').delete()
      .eq('conversation_id', convId).eq('user_id', window.LW.profile.id);
  }

  // ek hi realtime channel se: naye messages, reactions, seen-status (read receipt),
  // aur typing indicator (broadcast — DB mein store nahi hota)
  function liveConversation(convId, handlers) {
    handlers = handlers || {};
    return sb().channel('lw-chat-' + convId)
      .on('postgres_changes',
          { event: 'INSERT', schema: 'public', table: 'messages',
            filter: 'conversation_id=eq.' + convId },
          function (payload) { if (handlers.onMessage) handlers.onMessage(payload.new); })
      .on('postgres_changes',
          { event: '*', schema: 'public', table: 'message_reactions' },
          function (payload) { if (handlers.onReaction) handlers.onReaction(payload); })
      .on('postgres_changes',
          { event: 'UPDATE', schema: 'public', table: 'conversation_members',
            filter: 'conversation_id=eq.' + convId },
          function (payload) { if (handlers.onMemberUpdate) handlers.onMemberUpdate(payload.new); })
      .on('broadcast', { event: 'typing' },
          function (payload) { if (handlers.onTyping) handlers.onTyping(payload.payload); })
      .subscribe();
  }

  // "X type kar raha hai" — sirf broadcast, koi DB row nahi banti
  function sendTyping(channel) {
    if (!channel) return;
    channel.send({ type: 'broadcast', event: 'typing', payload: { user_id: window.LW.profile.id } });
  }

  function memberReadStates(convId) {
    return sb().from('conversation_members').select('user_id, last_read_at')
      .eq('conversation_id', convId)
      .then(function (r) { return r.data || []; });
  }

  // Snapchat jaisi per-friend streak — dono taraf se activity chahiye
  function chatStreak(convId) {
    return sb().rpc('lw_chat_streak', { p_conv: convId }).then(function (r) { return r.data || 0; });
  }

  // message par ek emoji react karo — dobara wahi emoji dabao to hat jaata hai
  function reactToMessage(messageId, emoji) {
    var me = window.LW.profile.id;
    return sb().from('message_reactions').select('emoji')
      .eq('message_id', messageId).eq('user_id', me).maybeSingle()
      .then(function (r) {
        if (r.data && r.data.emoji === emoji) {
          return sb().from('message_reactions').delete().eq('message_id', messageId).eq('user_id', me);
        }
        return sb().from('message_reactions').upsert({ message_id: messageId, user_id: me, emoji: emoji });
      });
  }

  // apna bheja hua message delete karo (RLS: sirf sender ya admin hi delete kar sakta hai)
  function deleteMessage(messageId) {
    return sb().from('messages').delete().eq('id', messageId).eq('sender_id', window.LW.profile.id);
  }

  // kai messages ke reactions ek saath — { messageId: [{user_id, emoji}, ...] }
  function messageReactions(messageIds) {
    if (!messageIds || !messageIds.length) return Promise.resolve({});
    return sb().from('message_reactions').select('message_id, user_id, emoji')
      .in('message_id', messageIds)
      .then(function (r) {
        var by = {};
        (r.data || []).forEach(function (x) { (by[x.message_id] = by[x.message_id] || []).push(x); });
        return by;
      });
  }

  /* ---------- community ---------- */

  // curated communities (couples/singles/spiritual/etc) — city filter se alag,
  // hamesha dikhti hain chahe koi bhi city search chal rahi ho
  function featuredCommunities() {
    return sb().from('communities').select('*').not('category', 'is', null).order('id')
      .then(function (r) { return r.data || []; });
  }

  function communities(opts) {
    opts = opts || {};
    var q = sb().from('communities').select('*').order('created_at', { ascending: false }).limit(60);
    if (opts.city) q = q.ilike('city', '%' + opts.city + '%');
    return q.then(function (r) { return r.data || []; });
  }

  function myCommunityIds() {
    return sb().from('community_members')
      .select('community_id, role')
      .eq('user_id', window.LW.profile.id)
      .then(function (r) { return r.data || []; });
  }

  function createCommunity(c) {
    c.created_by = window.LW.profile.id;
    c.slug = (c.slug || c.name).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
    return sb().from('communities').insert(c).select().maybeSingle();
  }

  function joinCommunity(id) {
    return sb().from('community_members')
      .insert({ community_id: id, user_id: window.LW.profile.id });
  }

  function leaveCommunity(id) {
    return sb().from('community_members').delete()
      .eq('community_id', id).eq('user_id', window.LW.profile.id);
  }

  function communityMembers(id) {
    return sb().from('community_members').select('user_id, role').eq('community_id', id)
      .then(function (r) {
        var rows = r.data || [];
        if (!rows.length) return [];
        return sb().from('lw_public_profiles')
          .select('id, full_name, username, avatar_url, city')
          .in('id', rows.map(function (x) { return x.user_id; }))
          .then(function (p) {
            var by = {};
            (rows || []).forEach(function (x) { by[x.user_id] = x.role; });
            return (p.data || []).map(function (x) { x.role = by[x.id]; return x; });
          });
      });
  }

  /* ---------- activity board ---------- */

  function activities(opts) {
    opts = opts || {};
    var q = sb().from('activities').select('*').order('starts_at', { ascending: true }).limit(60);
    if (opts.communityId) q = q.eq('community_id', opts.communityId);
    if (opts.upcoming)    q = q.gte('starts_at', new Date().toISOString());
    return q.then(function (r) {
      var rows = r.data || [];
      if (!rows.length) return [];
      var ids = rows.map(function (a) { return a.id; });
      return Promise.all([
        sb().from('activity_participants').select('activity_id, user_id, status').in('activity_id', ids),
        sb().from('lw_public_profiles').select('id, full_name, username, avatar_url')
          .in('id', rows.map(function (a) { return a.host_id; }))
      ]).then(function (res) {
        var me = window.LW.profile.id, going = {}, mine = {};
        (res[0].data || []).forEach(function (p) {
          if (p.status === 'going') going[p.activity_id] = (going[p.activity_id] || 0) + 1;
          if (p.user_id === me) mine[p.activity_id] = p.status;
        });
        var hosts = {};
        (res[1].data || []).forEach(function (h) { hosts[h.id] = h; });
        rows.forEach(function (a) {
          a.going_count = going[a.id] || 0;
          a.my_status   = mine[a.id] || null;
          a.host        = hosts[a.host_id] || {};
        });
        return rows;
      });
    });
  }

  function createActivity(a) {
    a.host_id = window.LW.profile.id;
    return sb().from('activities').insert(a).select().maybeSingle();
  }

  function joinActivity(id, status) {
    return sb().from('activity_participants')
      .upsert({ activity_id: id, user_id: window.LW.profile.id, status: status || 'going' },
              { onConflict: 'activity_id,user_id' });
  }

  function leaveActivity(id) {
    return sb().from('activity_participants').delete()
      .eq('activity_id', id).eq('user_id', window.LW.profile.id);
  }

  /* ---------- goals, streak, gifts ---------- */

  function goals() {
    return sb().from('goals').select('*')
      .eq('user_id', window.LW.profile.id)
      .order('created_at', { ascending: false })
      .then(function (r) {
        var rows = r.data || [];
        if (!rows.length) return [];
        return sb().from('goal_checkins')
          .select('goal_id, day')
          .in('goal_id', rows.map(function (g) { return g.id; }))
          .then(function (c) {
            var today = new Date().toISOString().slice(0, 10);
            var count = {}, done = {};
            (c.data || []).forEach(function (x) {
              count[x.goal_id] = (count[x.goal_id] || 0) + 1;
              if (x.day === today) done[x.goal_id] = true;
            });
            rows.forEach(function (g) {
              g.checkin_count = count[g.id] || 0;
              g.done_today    = !!done[g.id];
            });
            return rows;
          });
      });
  }

  function createGoal(g) {
    g.user_id = window.LW.profile.id;
    return sb().from('goals').insert(g).select().maybeSingle();
  }

  function updateGoal(id, patch) {
    return sb().from('goals').update(patch).eq('id', id);
  }

  function deleteGoal(id) {
    return sb().from('goals').delete().eq('id', id);
  }

  function checkinGoal(goalId, note) {
    return sb().from('goal_checkins')
      .insert({ goal_id: goalId, user_id: window.LW.profile.id, note: note || null });
  }

  function myStreak() {
    return sb().from('streaks').select('*').eq('user_id', window.LW.profile.id).maybeSingle()
      .then(function (r) { return r.data || { current_count: 0, longest_count: 0, last_day: null }; });
  }

  function gifts() {
    var me = window.LW.profile.id;
    return sb().from('gifts').select('*')
      .or('sender_id.eq.' + me + ',receiver_id.eq.' + me)
      .order('created_at', { ascending: false }).limit(40)
      .then(function (r) {
        var rows = r.data || [];
        if (!rows.length) return [];
        var ppl = [];
        rows.forEach(function (g) { ppl.push(g.sender_id, g.receiver_id); });
        return sb().from('lw_public_profiles')
          .select('id, full_name, username, avatar_url').in('id', ppl)
          .then(function (p) {
            var by = {};
            (p.data || []).forEach(function (x) { by[x.id] = x; });
            rows.forEach(function (g) {
              g.sender   = by[g.sender_id]   || {};
              g.receiver = by[g.receiver_id] || {};
              g.incoming = g.receiver_id === me;
            });
            return rows;
          });
      });
  }

  function sendGift(g) {
    g.sender_id = window.LW.profile.id;
    return sb().from('gifts').insert(g);
  }

  function openGift(id) {
    return sb().from('gifts').update({ opened_at: new Date().toISOString() }).eq('id', id);
  }

  /* ---------- timeline, birthdays, notifications ---------- */

  function timeline(userId, limit) {
    return sb().from('timeline_events').select('*')
      .eq('user_id', userId || window.LW.profile.id)
      .order('created_at', { ascending: false })
      .limit(limit || 25)
      .then(function (r) { return r.data || []; });
  }

  function birthdays(days) {
    return sb().rpc('lw_upcoming_birthdays', { p_days: days || 30 })
      .then(function (r) { return r.data || []; });
  }

  function notifications(limit) {
    return sb().from('notifications').select('*')
      .order('created_at', { ascending: false }).limit(limit || 50)
      .then(function (r) {
        var rows = r.data || [];
        var actors = rows.map(function (n) { return n.actor_id; }).filter(Boolean);
        if (!actors.length) return rows;
        return sb().from('lw_public_profiles')
          .select('id, full_name, username, avatar_url').in('id', actors)
          .then(function (p) {
            var by = {};
            (p.data || []).forEach(function (x) { by[x.id] = x; });
            rows.forEach(function (n) { n.actor = by[n.actor_id] || {}; });
            return rows;
          });
      });
  }

  function markNotifRead(id) {
    return sb().from('notifications').update({ is_read: true }).eq('id', id);
  }

  function markAllNotifRead() {
    return sb().from('notifications')
      .update({ is_read: true })
      .eq('user_id', window.LW.profile.id).eq('is_read', false);
  }

  /* ---------- export ---------- */
  window.LWApp = {
    esc: esc, initials: initials, avatarHtml: avatarHtml, timeAgo: timeAgo, icon: icon,
    toast: toast, err: err, setTheme: setTheme, restoreTheme: restoreTheme, setCustomColor: setCustomColor,
    restoreBgPhoto: restoreBgPhoto,
    shell: shell, refreshNotifCount: refreshNotifCount, customSelect: customSelect, toggleSidebar: toggleSidebar, toggleRail: toggleRail,

    publicProfile: publicProfile, searchPeople: searchPeople, saveProfile: saveProfile,
    suggestedPeople: suggestedPeople, nearbyPeople: nearbyPeople,

    myFriends: myFriends, pendingRequests: pendingRequests, sentRequests: sentRequests,
    addFriend: addFriend, answerRequest: answerRequest, removeFriend: removeFriend,
    blockUser: blockUser, blockedUsers: blockedUsers,

    familyList: familyList, familyTree: familyTree,
    saveFamilyMember: saveFamilyMember, deleteFamilyMember: deleteFamilyMember,

    feed: feed, createPost: createPost, deletePost: deletePost, toggleLove: toggleLove,
    comments: comments, addComment: addComment,
    uploadPostMedia: uploadPostMedia, storiesFeed: storiesFeed,

    createAnnouncement: createAnnouncement, uploadAnnouncementMedia: uploadAnnouncementMedia,
    pendingAnnouncements: pendingAnnouncements, sentAnnouncements: sentAnnouncements,
    answerAnnouncement: answerAnnouncement,

    journeyEntries: journeyEntries, createJourneyEntry: createJourneyEntry,
    deleteJourneyEntry: deleteJourneyEntry, uploadJourneyMedia: uploadJourneyMedia,
    journeyUpdates: journeyUpdates, addJourneyUpdate: addJourneyUpdate,

    openLocationPicker: openLocationPicker, closeLocationPicker: closeLocationPicker,
    confirmLocation: confirmLocation, pickSearchResult: pickSearchResult, detectMyLocation: detectMyLocation,

    openSpotifyPicker: openSpotifyPicker, closeSpotifyPicker: closeSpotifyPicker,
    openSpotifyPlaylistTracks: openSpotifyPlaylistTracks, backToSpotifyPlaylists: backToSpotifyPlaylists,
    pickSpotifyTrack: pickSpotifyTrack, spotifyEmbedUrl: spotifyEmbedUrl, fetchSpotifyTracks: fetchSpotifyTracks,

    myFavorites: myFavorites, favoriteSong: favoriteSong, unfavoriteSong: unfavoriteSong,
    myPlaylists: myPlaylists, createPlaylist: createPlaylist, deletePlaylist: deletePlaylist,
    playlistTracks: playlistTracks, addToPlaylist: addToPlaylist, removeFromPlaylist: removeFromPlaylist,
    updateProfilePinnedSong: updateProfilePinnedSong,

    myConversations: myConversations, openDirect: openDirect, messages: messages,
    sendMessage: sendMessage, createGroup: createGroup, markRead: markRead,
    liveConversation: liveConversation, sendTyping: sendTyping, songMessages: songMessages,
    conversationMessageCount: conversationMessageCount,
    translateText: translateText, contentLangMatches: contentLangMatches,
    uploadChatMedia: uploadChatMedia, uploadAvatar: uploadAvatar,
    memberReadStates: memberReadStates, chatStreak: chatStreak, leaveConversation: leaveConversation,
    reactToMessage: reactToMessage, messageReactions: messageReactions, deleteMessage: deleteMessage,

    communities: communities, featuredCommunities: featuredCommunities, myCommunityIds: myCommunityIds,
    createCommunity: createCommunity, joinCommunity: joinCommunity,
    leaveCommunity: leaveCommunity, communityMembers: communityMembers,

    activities: activities, createActivity: createActivity,
    joinActivity: joinActivity, leaveActivity: leaveActivity,

    goals: goals, createGoal: createGoal, updateGoal: updateGoal, deleteGoal: deleteGoal,
    checkinGoal: checkinGoal, myStreak: myStreak,
    gifts: gifts, sendGift: sendGift, openGift: openGift,

    timeline: timeline, birthdays: birthdays,
    notifications: notifications, markNotifRead: markNotifRead,
    markAllNotifRead: markAllNotifRead
  };
})();
