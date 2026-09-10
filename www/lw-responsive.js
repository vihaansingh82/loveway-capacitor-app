/* ============================================================
   Loveway — responsive behaviour
   ------------------------------------------------------------
   Sirf woh teen cheezein jo akeli CSS se nahi ho sakti thin:

     1. mobile header ka "⋯" dropdown toggle
     2. mobile chat ka single-pane view + back button
     3. marketing nav ke Login/Sign Up ki mobile menu me copy

   Baaki sab kuch lw-responsive.css me hai. Ye file kisi page ka
   markup nahi badalti aur na hi lw-app.js ke banaye elements ko
   hataati hai — sirf class toggle karti hai aur do naye buttons
   jodti hai, taaki page ke apne inline handlers aur i18n labels
   waise ke waise kaam karte rahen.
   ============================================================ */
(function () {
  'use strict';

  var MOBILE_Q = '(max-width: 899px)';   // single-pane chat
  var HEADER_Q = '(max-width: 1023px)';  // header dropdown (= jab sidebar nahi hai)

  function on(el, ev, fn) { if (el) el.addEventListener(ev, fn); }
  function isMobile() { return window.matchMedia(MOBILE_Q).matches; }

  /* ---------- 1. Header ka "⋯" dropdown ---------------------
     .header-tools ko CSS mobile par dropdown panel bana deti hai;
     yahan sirf usko kholne wala button aur outside-click/Esc se
     band hona add hota hai. */
  function initHeaderMenu() {
    var head = document.querySelector('header');
    if (!head) return;
    var tools = head.querySelector('.header-tools');
    if (!tools || head.querySelector('.lw-header-more')) return;

    var btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'lw-header-more';
    btn.setAttribute('aria-label', 'Menu');
    btn.setAttribute('aria-expanded', 'false');
    btn.setAttribute('aria-controls', 'lwHeaderTools');
    btn.textContent = '⋯';
    if (!tools.id) tools.id = 'lwHeaderTools';
    tools.parentNode.insertBefore(btn, tools);

    function close() {
      tools.classList.remove('lw-open');
      btn.setAttribute('aria-expanded', 'false');
    }

    on(btn, 'click', function (e) {
      e.stopPropagation();
      var open = tools.classList.toggle('lw-open');
      btn.setAttribute('aria-expanded', open ? 'true' : 'false');
    });

    // panel ke andar kisi link/button par click hote hi band
    on(tools, 'click', function (e) {
      if (e.target.closest('a, button')) close();
    });

    on(document, 'click', function (e) {
      if (!tools.contains(e.target) && e.target !== btn) close();
    });

    on(document, 'keydown', function (e) {
      if (e.key === 'Escape') close();
    });

    // desktop par wapas jaate hi panel ki state saaf
    var mq = window.matchMedia(HEADER_Q);
    var onChange = function () { if (!mq.matches) close(); };
    if (mq.addEventListener) mq.addEventListener('change', onChange);
    else if (mq.addListener) mq.addListener(onChange);

    labelBareActions(tools);

    // unread notifications ka dot band panel par bhi dikhe
    syncNotifDot(btn, tools);
  }

  /* lw-app.js har `data-icon` wale header button par ek .label lagata
     hai, lekin theme toggle jaise JS-injected buttons par nahi. Mobile
     dropdown me wo bina naam ke akela icon ban jaate hain — unka
     `title` label bana do. */
  function labelBareActions(tools) {
    tools.querySelectorAll('.header-action').forEach(function (el) {
      if (el.querySelector('.label')) return;
      var text = el.getAttribute('title') || el.getAttribute('aria-label');
      if (!text) return;
      /* `.label` / `.has-label` NAHI — wo desktop par bhi button ko
         chaudi pill bana dete hain. `lw-mlabel` sirf mobile dropdown
         ke andar dikhta hai. */
      var span = document.createElement('span');
      span.className = 'lw-mlabel';
      span.textContent = text;
      el.appendChild(span);
    });
  }

  function syncNotifDot(btn, tools) {
    function paint() {
      var count = tools.querySelector('#notifCount');
      var unread = count && count.style.display !== 'none' &&
                   parseInt(count.textContent, 10) > 0;
      var dot = btn.querySelector('.lw-dot');
      if (unread && !dot) {
        dot = document.createElement('span');
        dot.className = 'lw-dot';
        btn.appendChild(dot);
      } else if (!unread && dot) {
        dot.remove();
      }
    }
    paint();
    // lw-app.js badge ko async bharta hai — badalne par dobara paint
    try {
      new MutationObserver(paint).observe(tools, {
        subtree: true, childList: true, characterData: true, attributes: true
      });
    } catch (e) {}
  }

  /* ---------- 2. Mobile chat: list <-> thread ----------------
     messages.html ka .chat-wrap desktop par do-pane grid hai.
     Mobile par CSS ek waqt me ek hi pane dikhati hai; yahan
     .lw-thread-open class toggle hoti hai. */
  function initChat() {
    var wrap = document.querySelector('.chat-wrap');
    if (!wrap) return;
    var list = wrap.querySelector('.chat-list');
    var head = wrap.querySelector('.chat-head');
    if (!list || !head) return;

    var back = document.createElement('button');
    back.type = 'button';
    back.className = 'lw-chat-back';
    back.setAttribute('aria-label', 'Back to chats');
    back.textContent = '‹';
    on(back, 'click', function () {
      wrap.classList.remove('lw-thread-open');
    });

    // openConv() chat-head ka innerHTML poora replace karta hai,
    // isliye har badlaav ke baad back button dobara lagana padta hai
    function ensureBack() {
      if (back.parentNode !== head) head.insertBefore(back, head.firstChild);
    }
    ensureBack();
    try {
      new MutationObserver(ensureBack).observe(head, { childList: true });
    } catch (e) {}

    // kisi bhi conversation par click -> thread view
    on(list, 'click', function (e) {
      if (!e.target.closest('.item')) return;
      // delete button chat kholta nahi hai
      if (e.target.closest('.conv-delete-btn')) return;
      if (isMobile()) wrap.classList.add('lw-thread-open');
    });

    // ?c=<id> ke saath direct link se aaye to seedha thread par
    if (isMobile() && /[?&]c=/.test(window.location.search)) {
      wrap.classList.add('lw-thread-open');
    }
  }

  /* ---------- 3. Marketing nav ke CTA mobile menu me ---------
     400px se neeche Login/Sign Up top bar se hat jaate hain
     (CSS), isliye unki ek copy hamburger menu ke andar. */
  function initNavCta() {
    var nav = document.querySelector('nav');
    if (!nav || nav.classList.contains('bottom-nav')) return;
    var list = nav.querySelector('ul');
    var actions = nav.querySelector('.nav-actions');
    if (!list || !actions || list.querySelector('.lw-nav-cta')) return;

    var made = 0;
    actions.querySelectorAll(':scope > .btn-ghost, :scope > .btn-primary')
      .forEach(function (src) {
        var li = document.createElement('li');
        li.className = 'lw-nav-cta';
        var a = src.cloneNode(true);
        a.removeAttribute('id');

        /* logged-in / logged-out ki visibility lw-core.js ka paintNav()
           `[data-lw-when]` par inline display set karke handle karta hai.
           Wo attribute anchor se hata kar <li> par le jao, taaki paintNav
           poori menu row chhupaye (sirf uska andar ka link nahi — warna
           menu me khaali bordered rows reh jaati hain). Anchor par inline
           display bhi saaf, warna wo CSS ko override karta rehta. */
        if (a.hasAttribute('data-lw-when')) {
          li.setAttribute('data-lw-when', a.getAttribute('data-lw-when'));
          a.removeAttribute('data-lw-when');
          li.style.display = a.style.display;
          a.style.display = '';
        }
        li.appendChild(a);
        list.appendChild(li);
        made++;
      });

    /* paintNav() DOMContentLoaded par async chal chuka ho sakta hai,
       yaani naye clones ko usne dekha hi nahi. Dobara chala do —
       wo idempotent hai. */
    if (made && window.LW && typeof window.LW.paintNav === 'function') {
      try { window.LW.paintNav(); } catch (e) {}
    }
  }

  function init() {
    try { initHeaderMenu(); } catch (e) {}
    try { initChat(); } catch (e) {}
    try { initNavCta(); } catch (e) {}
  }

  // lw-app.js ka shell() DOMContentLoaded ke andar header bharta hai,
  // isliye hum uske baad chalte hain (do rAF = ek frame baad).
  function boot() {
    requestAnimationFrame(function () { requestAnimationFrame(init); });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
})();
