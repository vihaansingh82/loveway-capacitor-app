/* ============================================================
   Loveway — Indian festival themes
   ------------------------------------------------------------
   Poore Loveway ka look ek festival ke hisaab se badal jaata hai.
   Ye setting SITE-WIDE hai aur ADMIN chalata hai (Control Center >
   🎨 Themes) — kyunki tyohaar sabke liye ek saath aata hai, har
   user ka apna nahi hota.

   Teen mode:
     off    — koi festival theme nahi, sabko apni chuni hui theme
     auto   — aaj ki date ke hisaab se apne aap (window ke andar)
     fixed  — admin ne jo chuna hai wahi, date kuch bhi ho

   Setting `app_settings` table (key = 'festival_theme') me rehti
   hai. Har page use localStorage me cache karta hai taaki load par
   theme flash na ho, aur peechhe se DB se taaza kar leta hai.

   User apne liye ise Settings > Appearance se band bhi kar sakta
   hai — tab uski apni theme wapas aa jaati hai.

   ⚠️ Dates ke baare me: Republic Day / Independence Day / Christmas
   jaise fixed din har saal ek hi tareekh par aate hain, wo yahan
   `md` (month-day) se aate hain. Lekin Diwali, Holi, Eid, Navratri
   jaise chaand/panchang wale tyohaar har saal alag din padte hain —
   unke liye `dates` me saal-wise list hai. Naya saal aane par sirf
   wahi list badalni hoti hai (ya admin `fixed` mode se khud chun
   sakta hai, jo kabhi galat nahi hota).
   ============================================================ */
(function () {
  'use strict';

  var SETTING_KEY = 'festival_theme';
  var CACHE_KEY   = 'lw_festival_setting';   // { mode, festival }
  var OPTOUT_KEY  = 'loveway_festival_off';  // user ka apna opt-out

  var IMAGES_KEY  = 'festival_images';   // admin ki lagayi images (per festival)
  var FX_KEY = 'loveway_festival_fx';   // user animation band kar sakta hai

  /* ---------- festival list ----------
     md    : 'MM-DD'  — har saal wahi din
     dates : ['YYYY-MM-DD', …] — chaand/panchang wale, saal-wise
     days  : theme kitne din chale (default: 1 din pehle se 1 din baad tak)
     fx    : [animation-style, glyphs…] — screen par halki si sajawat
             styles: fall (girte hue), rise (upar uthte hue),
                     sway (idhar-udhar hilte hue), twinkle (jhilmilate hue) */
  var FESTIVALS = [
    { id: 'lohri',        name: 'Lohri',              emoji: '🔥', md: '01-13',
      fx: ['rise', '🔥', '✨'], sym: '🔥', wish: "Lohri di lakh lakh vadhaiyan!" },
    { id: 'sankranti',    name: 'Makar Sankranti',    emoji: '🪁', md: '01-14', days: 2,
      fx: ['sway', '🪁', '🪁', '✨'], sym: '🪁', wish: "Makar Sankranti ki shubhkamnayein!" },
    { id: 'pongal',       name: 'Pongal',             emoji: '🌾', md: '01-15', days: 2,
      fx: ['fall', '🌾', '🌻'], sym: '🌾', wish: "Happy Pongal!" },
    { id: 'republic',     name: 'Republic Day',       emoji: '🇮🇳', md: '01-26',
      fx: ['fall', '🇮🇳', '✨'], sym: '🇮🇳', wish: "Happy Republic Day!" },
    { id: 'vasant',       name: 'Vasant Panchami',    emoji: '📖', dates: ['2026-01-23', '2027-02-11'],
      fx: ['fall', '🌼', '📖'], sym: '📖', wish: "Vasant Panchami ki shubhkamnayein!" },
    { id: 'shivratri',    name: 'Maha Shivratri',     emoji: '🔱', dates: ['2026-02-15', '2027-03-06'],
      fx: ['twinkle', '🔱', '🕉️', '✨'], sym: '🕉️', wish: "Har Har Mahadev 🙏" },
    { id: 'valentine',    name: "Valentine's Day",    emoji: '💘', md: '02-14',
      fx: ['rise', '💘', '💖', '💕'], sym: '💖', wish: "Happy Valentine's Day!" },
    { id: 'holi',         name: 'Holi',               emoji: '🎨', dates: ['2026-03-04', '2027-03-22'], days: 2,
      fx: ['burst', '🎨', '🌈', '💛', '💜', '💚'], sym: '🎨', wish: "Bura na maano, Holi hai!" },
    { id: 'gudipadwa',    name: 'Gudi Padwa / Ugadi', emoji: '🌼', dates: ['2026-03-19', '2027-04-07'],
      fx: ['fall', '🌼', '🍃'], sym: '🌸', wish: "Gudi Padwa / Ugadi ki shubhkamnayein!" },
    { id: 'eid',          name: 'Eid al-Fitr',        emoji: '🌙', dates: ['2026-03-20', '2027-03-10'], days: 2,
      fx: ['twinkle', '🌙', '⭐', '✨'], sym: '🌙', wish: "Eid Mubarak!" },
    { id: 'ramnavami',    name: 'Ram Navami',         emoji: '🏹', dates: ['2026-03-26', '2027-04-15'],
      fx: ['rise', '🏹', '🌸'], sym: '🏹', wish: "Jai Shri Ram 🙏" },
    { id: 'baisakhi',     name: 'Baisakhi',           emoji: '🌾', md: '04-14',
      fx: ['sway', '🌾', '🥁'], sym: '🥁', wish: "Baisakhi diyan vadhaiyan!" },
    { id: 'bakrid',       name: 'Bakrid',             emoji: '🕌', dates: ['2026-05-27', '2027-05-16'],
      fx: ['twinkle', '🌙', '⭐'], sym: '🕌', wish: "Eid-ul-Adha Mubarak!" },
    { id: 'rathyatra',    name: 'Rath Yatra',         emoji: '🛕', dates: ['2026-07-16', '2027-07-05'],
      fx: ['rise', '🛕', '🌺'], sym: '🛕', wish: "Jai Jagannath 🙏" },
    { id: 'independence', name: 'Independence Day',   emoji: '🇮🇳', md: '08-15',
      fx: ['fall', '🇮🇳', '🎈'], sym: '🇮🇳', wish: "Happy Independence Day!" },
    { id: 'rakhi',        name: 'Raksha Bandhan',     emoji: '🎗️', dates: ['2026-08-28', '2027-08-17'],
      fx: ['fall', '🎗️', '🌸', '💐'], sym: '🎗️', wish: "Happy Raksha Bandhan!" },
    { id: 'janmashtami',  name: 'Janmashtami',        emoji: '🦚', dates: ['2026-09-04', '2027-08-25'],
      fx: ['fall', '🦚', '🪶', '🧿'], sym: '🦚', wish: "Jai Shri Krishna 🙏" },
    { id: 'onam',         name: 'Onam',               emoji: '🌺', dates: ['2026-08-26', '2027-09-13'], days: 3,
      fx: ['fall', '🌺', '🌼', '🍃'], sym: '🌺', wish: "Happy Onam!" },
    { id: 'ganesh',       name: 'Ganesh Chaturthi',   emoji: '🐘', dates: ['2026-09-14', '2027-09-04'], days: 3,
      fx: ['rise', '🐘', '🌺', '🪔'], sym: '🐘', wish: "Ganpati Bappa Morya!" },
    { id: 'navratri',     name: 'Navratri',           emoji: '🪔', dates: ['2026-10-11', '2027-09-30'], days: 9,
      fx: ['rise', '🪔', '💃', '✨'], sym: '🪔', wish: "Jai Mata Di 🙏" },
    { id: 'durgapuja',    name: 'Durga Puja',         emoji: '🌸', dates: ['2026-10-17', '2027-10-06'], days: 4,
      fx: ['fall', '🌸', '🌺', '🥁'], sym: '🌺', wish: "Shubho Durga Puja!" },
    { id: 'dussehra',     name: 'Dussehra',           emoji: '🏹', dates: ['2026-10-20', '2027-10-09'],
      fx: ['rise', '🏹', '🔥', '✨'], sym: '🏹', wish: "Happy Dussehra!" },
    { id: 'karvachauth',  name: 'Karva Chauth',       emoji: '🌕', dates: ['2026-10-29', '2027-10-18'],
      fx: ['rise', '🌕', '✨', '💫'], sym: '🌕', wish: "Karva Chauth ki shubhkamnayein!" },
    { id: 'dhanteras',    name: 'Dhanteras',          emoji: '🪙', dates: ['2026-11-06', '2027-10-27'],
      fx: ['fall', '🪙', '✨'], sym: '🪙', wish: "Shubh Dhanteras!" },
    { id: 'diwali',       name: 'Diwali',             emoji: '🪔', dates: ['2026-11-08', '2027-10-29'], days: 3,
      fx: ['rise', '🪔', '✨', '🎆'], sym: '🪔', wish: "Shubh Deepavali!" },
    { id: 'bhaidooj',     name: 'Bhai Dooj',          emoji: '👫', dates: ['2026-11-11', '2027-10-31'],
      fx: ['fall', '👫', '🌸'], sym: '👫', wish: "Happy Bhai Dooj!" },
    { id: 'chhath',       name: 'Chhath Puja',        emoji: '🌅', dates: ['2026-11-15', '2027-11-04'], days: 2,
      fx: ['rise', '🌅', '🪔'], sym: '🌅', wish: "Chhathi Maiya ki jai 🙏" },
    { id: 'gurunanak',    name: 'Guru Nanak Jayanti', emoji: '🙏', dates: ['2026-11-24', '2027-11-14'],
      fx: ['twinkle', '🙏', '✨', '🕯️'], sym: '🙏', wish: "Guru Nanak Jayanti diyan vadhaiyan!" },
    { id: 'christmas',    name: 'Christmas',          emoji: '🎄', md: '12-25', days: 2,
      fx: ['fall', '❄️', '🎄', '⭐'], sym: '🎄', wish: "Merry Christmas!" },
    { id: 'newyear',      name: 'New Year',           emoji: '🎉', md: '01-01', days: 2,
      fx: ['burst', '🎉', '🎊', '✨'], sym: '🎉', wish: "Happy New Year!" }
  ];

  var BY_ID = {};
  FESTIVALS.forEach(function (f) { BY_ID[f.id] = f; });

  /* ---------- date helpers (IST — Loveway ka din IST par chalta hai) ---------- */
  var IST_MS = 330 * 60000;
  function istToday() {
    var d = new Date(Date.now() + IST_MS);
    return d.getUTCFullYear() + '-' +
      String(d.getUTCMonth() + 1).padStart(2, '0') + '-' +
      String(d.getUTCDate()).padStart(2, '0');
  }
  function daysBetween(a, b) {
    return Math.round((Date.parse(a + 'T00:00:00Z') - Date.parse(b + 'T00:00:00Z')) / 86400000);
  }

  // aaj kaun sa festival "chal raha" hai (sabse nazdeek wala)
  function festivalForToday(today) {
    today = today || istToday();
    var year = today.slice(0, 4);
    var best = null, bestDist = 99;

    FESTIVALS.forEach(function (f) {
      var span = f.days || 1;
      // ek din pehle se shuru, festival ke span tak
      var candidates = f.md ? [year + '-' + f.md] : (f.dates || []);
      candidates.forEach(function (d) {
        var diff = daysBetween(today, d);      // aaj - festival
        if (diff < -1 || diff > span - 1) return;
        var dist = Math.abs(diff);
        if (dist < bestDist) { bestDist = dist; best = f; }
      });
    });
    return best;
  }

  /* ---------- setting: DB + localStorage cache ---------- */
  function readCache() {
    try { return JSON.parse(localStorage.getItem(CACHE_KEY) || 'null'); } catch (e) { return null; }
  }
  function writeCache(v) {
    try { localStorage.setItem(CACHE_KEY, JSON.stringify(v || {})); } catch (e) {}
  }

  function userOptedOut() {
    try { return localStorage.getItem(OPTOUT_KEY) === '1'; } catch (e) { return false; }
  }
  function setUserOptOut(off) {
    try { localStorage.setItem(OPTOUT_KEY, off ? '1' : '0'); } catch (e) {}
    apply();
  }

  // abhi effective festival kaun sa hai (setting + date + opt-out sab dekh kar)
  function activeFestival(setting) {
    setting = setting || readCache() || { mode: 'auto' };
    if (userOptedOut()) return null;
    if (setting.mode === 'off') return null;
    if (setting.mode === 'fixed') return BY_ID[setting.festival] || null;
    return festivalForToday();          // 'auto' (default)
  }

  /* ---------- animation ----------
     Halki si sajawat — girte/uthte hue glyphs. Sab CSS animation par
     chalta hai (koi JS loop nahi), pointer-events:none hai to click
     kabhi nahi rokta, aur `prefers-reduced-motion` par CSS khud band
     kar deti hai. Modal khulne par bhi chhup jaata hai. */
  function fxOn() {
    try { return localStorage.getItem(FX_KEY) !== '0'; } catch (e) { return true; }
  }
  function setFxOn(on) {
    try { localStorage.setItem(FX_KEY, on ? '1' : '0'); } catch (e) {}
    apply();
  }

  function removeFx() {
    var el = document.getElementById('lwFestFx');
    if (el) el.remove();
  }

  function renderFx(f) {
    removeFx();
    if (!f || !f.fx || !fxOn()) return;

    var style = f.fx[0];
    var glyphs = f.fx.slice(1);
    var box = document.createElement('div');
    box.id = 'lwFestFx';
    box.className = 'lw-fest-fx lw-fx-' + style;
    box.setAttribute('aria-hidden', 'true');

    var n = 16;
    var html = '';
    for (var i = 0; i < n; i++) {
      // har glyph ki apni jagah/raftaar — warna sab ek saath girte hain
      var left = Math.round((i / n) * 100 + (Math.random() * 6 - 3));
      var dur = (7 + Math.random() * 8).toFixed(1);
      var delay = (Math.random() * 10).toFixed(1);
      var size = (0.8 + Math.random() * 0.9).toFixed(2);
      var drift = Math.round(Math.random() * 60 - 30);
      html += '<span style="left:' + Math.max(0, Math.min(98, left)) + '%;' +
        '--d:' + dur + 's;--delay:-' + delay + 's;--sz:' + size + 'rem;--drift:' + drift + 'px">' +
        glyphs[i % glyphs.length] + '</span>';
    }
    box.innerHTML = html;
    document.body.appendChild(box);
  }

  /* ---------- greeting banner ----------
     Festival ka chinh + shubhkamna. Admin apni image laga sakta hai
     (Control Center > 🎨 Themes) — tab chinh ki jagah wahi dikhti hai.
     Har din ek baar dikhta hai, band karne par us din dobara nahi. */
  function bannerDismissed(id) {
    try { return localStorage.getItem('lw_fest_banner') === id + ':' + istToday(); }
    catch (e) { return false; }
  }
  function dismissBanner() {
    var f = activeFestival();
    try { if (f) localStorage.setItem('lw_fest_banner', f.id + ':' + istToday()); } catch (e) {}
    var el = document.getElementById('lwFestBanner');
    if (el) el.remove();
  }

  function images() {
    try { return JSON.parse(localStorage.getItem('lw_festival_images') || '{}'); }
    catch (e) { return {}; }
  }

  function renderBanner(f) {
    var old = document.getElementById('lwFestBanner');
    if (old) old.remove();
    if (!f || bannerDismissed(f.id)) return;

    // banner sirf app pages par — container ke sabse upar
    var host = document.querySelector('.container') || document.querySelector('main.wrap');
    if (!host) return;

    var img = images()[f.id];
    var el = document.createElement('div');
    el.id = 'lwFestBanner';
    el.className = 'lw-fest-banner';
    el.innerHTML =
      (img
        ? '<img class="lw-fest-img" src="' + String(img).replace(/"/g, '&quot;') + '" alt="">'
        : '<span class="lw-fest-sym">' + (f.sym || f.emoji) + '</span>') +
      '<div class="lw-fest-text"><b>' + (f.wish || f.name) + '</b>' +
      '<small>Loveway aaj ' + f.name + ' ke rang me hai</small></div>' +
      '<button type="button" class="lw-fest-x" aria-label="Band karo">✕</button>';
    el.querySelector('.lw-fest-x').addEventListener('click', dismissBanner);
    host.insertBefore(el, host.firstChild);
  }

  /* ---------- theme lagao ----------
     Festival chalu ho to body par data-theme="fest-<id>" (palette
     lw-responsive.css me hai). Warna user ki apni theme wapas. */
  function apply() {
    var f = activeFestival();
    var body = document.body;
    if (!body) return null;

    if (f) {
      body.setAttribute('data-theme', 'fest-' + f.id);
      body.setAttribute('data-festival', f.id);
      renderFx(f);
      renderBanner(f);
    } else {
      body.removeAttribute('data-festival');
      removeFx();
      var b = document.getElementById('lwFestBanner');
      if (b) b.remove();
      // user ki apni theme wapas — LWApp ho to usi ka restore use karo
      if (window.LWApp && window.LWApp.restoreTheme) window.LWApp.restoreTheme();
      else {
        var saved = 'ocean';
        try { saved = localStorage.getItem('loveway_theme') || 'ocean'; } catch (e) {}
        body.setAttribute('data-theme', saved);
      }
    }
    document.dispatchEvent(new CustomEvent('lw:festival', { detail: f }));
    return f;
  }

  /* ---------- DB se setting laao / badlo ---------- */
  function sb() { return window.LW && window.LW.sb; }

  function load() {
    if (!sb()) return Promise.resolve(readCache());
    // dono settings ek hi call me — theme mode aur admin ki lagayi images
    return sb().from('app_settings').select('key, value').in('key', [SETTING_KEY, IMAGES_KEY])
      .then(function (r) {
        var v = { mode: 'auto' };
        (r.data || []).forEach(function (row) {
          if (row.key === SETTING_KEY) v = row.value || v;
          if (row.key === IMAGES_KEY) {
            try { localStorage.setItem('lw_festival_images', JSON.stringify(row.value || {})); } catch (e) {}
          }
        });
        writeCache(v);
        apply();
        return v;
      })
      .catch(function () { return readCache(); });
  }

  // admin: kisi festival ke liye apni (dharmik) image set/hataao
  function saveImage(festivalId, url) {
    var all = images();
    if (url) all[festivalId] = url; else delete all[festivalId];
    try { localStorage.setItem('lw_festival_images', JSON.stringify(all)); } catch (e) {}
    apply();
    if (!sb()) return Promise.resolve({ error: 'no-db' });
    return sb().from('app_settings')
      .upsert({ key: IMAGES_KEY, value: all }, { onConflict: 'key' })
      .select().maybeSingle();
  }

  // sirf admin — RLS bhi yahi rok lagati hai
  function save(setting) {
    writeCache(setting);
    apply();
    if (!sb()) return Promise.resolve({ error: 'no-db' });
    return sb().from('app_settings')
      .upsert({ key: SETTING_KEY, value: setting }, { onConflict: 'key' })
      .select().maybeSingle();
  }

  window.LWFest = {
    list: FESTIVALS, byId: BY_ID,
    today: istToday, forToday: festivalForToday,
    active: activeFestival, apply: apply, load: load, save: save,
    images: images, saveImage: saveImage,
    fxOn: fxOn, setFxOn: setFxOn, dismissBanner: dismissBanner,
    setting: function () { return readCache() || { mode: 'auto' }; },
    userOptedOut: userOptedOut, setUserOptOut: setUserOptOut
  };

  /* Pehle cache se turant lagao (taaki theme flash na ho), phir DB se
     taaza kar lo. Ye HAR page par hota hai — pehle sirf admin/settings
     hi load() bulate the, isliye admin ka badla hua theme baaki users
     tak pahunchta hi nahi tha. */
  function boot() {
    apply();
    if (sb()) load();
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();
