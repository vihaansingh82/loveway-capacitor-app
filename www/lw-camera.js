/* ============================================================
   Loveway — live camera: filters, AR lenses, video, overlays
   ------------------------------------------------------------
   Ek hi engine, do jagah se khulta hai: Stories (dashboard.html)
   aur Chat (messages.html). Dono `LWCamera.open({mode, onCapture})`
   hi bulate hain — poora UI is file ke andar banta hai, kisi page
   mein HTML pehle se likhne ki zarurat nahi.

   Do stage hote hain:
     1. SHOOT  — live preview par filter + lens, tap se photo,
                 dabaye rakho to video (max 15s)
     2. EDIT   — photo par text / drawing / sticker daalo, phir bhejo
                 (video par overlay nahi — uske liye video dobara
                  encode karna padta hai, jo browser mein bhaari hai;
                  video par filter/lens shoot ke waqt hi bake ho
                  jaate hain kyunki recording canvas se hoti hai)

   Filters wahi CSS filter strings hain jo Story ka static editor
   bhi use karta hai — definition yahan hai (LWCamera.FILTERS) aur
   dashboard.html isi ko padhta hai, do jagah maintain nahi karni.

   AR lenses MediaPipe Face Landmarker se chalte hain — wo library
   bhaari hai (WASM + model), isliye sirf tab load hoti hai jab user
   pehli baar koi lens chune, camera khulte hi nahi.

   Mic ki permission bhi tabhi maangi jaati hai jab video record
   shuru ho — sirf photo lene wale user se mic kabhi nahi poocha
   jaata.
   ============================================================ */
(function () {
  'use strict';

  var BUILTIN_FILTERS = [
    { key: 'none',    label: 'Original', css: 'none' },
    { key: 'warm',    label: 'Warm',     css: 'sepia(0.35) saturate(1.35) contrast(1.05)' },
    { key: 'cool',    label: 'Cool',     css: 'hue-rotate(-15deg) saturate(1.25) brightness(1.05)' },
    { key: 'bw',      label: 'B&W',      css: 'grayscale(1) contrast(1.15)' },
    { key: 'vintage', label: 'Vintage',  css: 'sepia(0.55) saturate(0.85) contrast(0.95) brightness(1.05)' },
    { key: 'vivid',   label: 'Vivid',    css: 'saturate(1.7) contrast(1.15)' },
    { key: 'soft',    label: 'Soft',     css: 'brightness(1.08) saturate(0.95) contrast(0.92)' }
  ];

  /* Ye array kabhi REPLACE nahi hota — sirf andar se badalta hai.
     dashboard.html shuru mein hi `var STORY_FILTERS = LWCamera.FILTERS`
     karke ISI reference ko pakad leta hai; naya array bana kar assign kar
     diya to story composer hamesha purani list dikhata rahega. Isliye
     syncFilters() length=0 karke dobara bharta hai, = se badalta nahi. */
  var FILTERS = BUILTIN_FILTERS.slice();

  var CUSTOM_PREF_KEY = 'customFilters';   // profiles.preferences ke andar
  var MAX_CUSTOM = 12;

  /* label = carousel par dikhne wala emoji, name = search ka naam */
  var LENSES = [
    { key: 'dog',     label: '🐶', name: 'Dog',       draw: drawDogLens },
    { key: 'cat',     label: '🐱', name: 'Cat',       draw: drawCatLens },
    { key: 'bunny',   label: '🐰', name: 'Bunny',     draw: drawBunnyLens },
    { key: 'flower',  label: '🌸', name: 'Flower',    draw: drawFlowerLens },
    { key: 'glasses', label: '🕶️', name: 'Shades',    draw: drawGlassesLens },
    { key: 'heart',   label: '😍', name: 'Heart eyes', draw: drawHeartEyesLens }
  ];

  /* ============================================================
     Time stamps — waqt/taareekh wale "aesthetic" overlays
     ------------------------------------------------------------
     Ye AR lens NAHI hain, aur jaan-boojh kar unse alag rakhe gaye:
     inhe chehre ki zarurat hi nahi hoti, isliye MediaPipe (WASM +
     model, kai MB) in ke liye kabhi load nahi hota. Sirf canvas par
     likha hua text hai — purane phone par bhi bina atke chalta hai.

     Teen alag axis hain aur teeno saath chal sakte hain:
         filter (CSS)  +  stamp (text)  +  lens (chehra)
     Snapchat par ek waqt ek hi lens chalta hai; yahan filter aur stamp
     saath lag sakte hain kyunki dono alag layer par hain.

     Time har frame par dobara likha jaata hai, isliye preview mein
     ghadi chalti dikhti hai — aur photo/video mein wahi waqt bake hota
     hai jo shutter dabate waqt tha (capture canvas se hi hota hai).

     MIRROR: front camera ka video ulta (mirrored) draw hota hai aur
     lens bhi usi ulte frame mein draw hote hain — chehre par chipke
     rehna hai to yahi sahi hai. Par TEXT ko ulta likhna galat hai,
     wo sheeshe jaisa padha hi nahi jaayega. Isliye stamps mirror
     transform ke BAHAR draw hote hain (renderLoop dekho).
     ============================================================ */

  var F_SANS   = 'system-ui, -apple-system, "Segoe UI", Roboto, Arial, sans-serif';
  var F_SERIF  = 'Georgia, "Times New Roman", serif';
  var F_MONO   = '"Courier New", ui-monospace, monospace';
  var F_SCRIPT = '"Segoe Script", "Bradley Hand", "Brush Script MT", cursive';

  var DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  var MONTHS = ['January', 'February', 'March', 'April', 'May', 'June',
                'July', 'August', 'September', 'October', 'November', 'December'];

  function two(n) { return (n < 10 ? '0' : '') + n; }
  function t12(d) {
    var h = d.getHours() % 12; if (h === 0) h = 12;
    return h + ':' + two(d.getMinutes()) + ' ' + (d.getHours() >= 12 ? 'PM' : 'AM');
  }
  function t24(d) { return two(d.getHours()) + ':' + two(d.getMinutes()); }
  function spaced(s) { return String(s).split('').join(' '); }

  /* Stamp kisi bhi background par pad sakta hai — safed aasman par safed
     text gayab ho jaata hai. Isliye halki shadow, koi bhaari box nahi. */
  function glow(ctx, a) {
    ctx.shadowColor = 'rgba(0,0,0,' + (a == null ? 0.5 : a) + ')';
    ctx.shadowBlur = 18;
    ctx.shadowOffsetY = 1;
  }
  function noGlow(ctx) {
    ctx.shadowColor = 'transparent'; ctx.shadowBlur = 0; ctx.shadowOffsetY = 0;
  }

  // ctx.roundRect har WebView mein nahi hai (Android 12 se pehle nahi tha)
  function roundRect(ctx, x, y, w, h, r) {
    ctx.beginPath();
    if (ctx.roundRect) { ctx.roundRect(x, y, w, h, r); return; }
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }

  var STAMPS = [
    { key: 'mood', label: 'Mood', sample: 'MOOD',
      draw: function (ctx, w, h, d) {
        var u = Math.min(w, h) / 720;
        ctx.textAlign = 'center'; ctx.textBaseline = 'alphabetic';
        glow(ctx); ctx.fillStyle = '#fff';
        ctx.font = '600 ' + (30 * u) + 'px ' + F_SANS;
        ctx.fillText(spaced('MOOD'), w / 2, h * 0.60);
        ctx.font = '400 ' + (26 * u) + 'px ' + F_SANS;
        ctx.fillText(t12(d), w / 2, h * 0.60 + 34 * u);
        noGlow(ctx);
      } },

    { key: 'weekday', label: 'Weekday', sample: 'FRI',
      draw: function (ctx, w, h, d) {
        var u = Math.min(w, h) / 720, x = 40 * u, y = h - 58 * u;
        ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic';
        glow(ctx); ctx.fillStyle = '#fff';
        ctx.font = '700 ' + (46 * u) + 'px ' + F_SANS;
        ctx.fillText(DAYS[d.getDay()].toUpperCase(), x, y);
        ctx.font = '400 ' + (20 * u) + 'px ' + F_SANS;
        ctx.fillText(MONTHS[d.getMonth()] + ' ' + d.getDate() + '   ' + t12(d), x, y + 27 * u);
        noGlow(ctx);
      } },

    { key: 'bigtime', label: 'Big time', sample: '9:12',
      draw: function (ctx, w, h, d) {
        var u = Math.min(w, h) / 720, x = 40 * u, y = 98 * u;
        ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic';
        glow(ctx); ctx.fillStyle = '#fff';
        ctx.font = '300 ' + (64 * u) + 'px ' + F_SANS;
        ctx.fillText(t12(d), x, y);
        ctx.font = '400 ' + (19 * u) + 'px ' + F_SANS;
        ctx.fillText(DAYS[d.getDay()] + ' ' + MONTHS[d.getMonth()].slice(0, 3) + ' ' +
                     d.getDate() + ' ' + d.getFullYear(), x, y + 27 * u);
        noGlow(ctx);
      } },

    { key: 'script', label: 'Script', sample: 'Sat',
      draw: function (ctx, w, h, d) {
        var u = Math.min(w, h) / 720, x = 44 * u, y = h - 64 * u;
        ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic';
        glow(ctx, 0.55); ctx.fillStyle = '#fff';
        ctx.font = 'italic 400 ' + (52 * u) + 'px ' + F_SCRIPT;
        ctx.fillText(DAYS[d.getDay()], x, y);
        ctx.font = '300 ' + (24 * u) + 'px ' + F_SANS;
        ctx.fillText(t24(d), x + 4 * u, y + 30 * u);
        noGlow(ctx);
      } },

    { key: 'classic', label: 'Classic', sample: 'Aa',
      draw: function (ctx, w, h, d) {
        var u = Math.min(w, h) / 720;
        ctx.textAlign = 'center'; ctx.textBaseline = 'alphabetic';
        glow(ctx, 0.5); ctx.fillStyle = '#fff';
        ctx.font = 'italic 400 ' + (34 * u) + 'px ' + F_SERIF;
        ctx.fillText(DAYS[d.getDay()] + ', ' + MONTHS[d.getMonth()] + ' ' + d.getDate(),
                     w / 2, h - 76 * u);
        ctx.font = '300 ' + (22 * u) + 'px ' + F_SANS;
        ctx.fillText(spaced(t24(d)), w / 2, h - 46 * u);
        noGlow(ctx);
      } },

    /* Purane point-and-shoot camera ka narangi date imprint */
    { key: 'film', label: 'Film date', sample: "'25",
      draw: function (ctx, w, h, d) {
        var u = Math.min(w, h) / 720;
        ctx.textAlign = 'right'; ctx.textBaseline = 'alphabetic';
        ctx.fillStyle = '#ff9a3c';
        ctx.shadowColor = 'rgba(255,120,0,.6)'; ctx.shadowBlur = 16 * u; ctx.shadowOffsetY = 0;
        ctx.font = '700 ' + (30 * u) + 'px ' + F_MONO;
        ctx.fillText(two(d.getDate()) + ' ' + two(d.getMonth() + 1) + " '" +
                     String(d.getFullYear()).slice(2), w - 40 * u, h - 44 * u);
        noGlow(ctx);
      } },

    { key: 'pill', label: 'Pill', sample: '◗',
      draw: function (ctx, w, h, d) {
        var u = Math.min(w, h) / 720, txt = t12(d);
        ctx.font = '600 ' + (22 * u) + 'px ' + F_SANS;
        var bw = ctx.measureText(txt).width + 36 * u, bh = 40 * u;
        var x = (w - bw) / 2, y = 72 * u;
        ctx.fillStyle = 'rgba(0,0,0,.34)';
        roundRect(ctx, x, y, bw, bh, bh / 2); ctx.fill();
        ctx.fillStyle = '#fff';
        ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillText(txt, w / 2, y + bh / 2 + u);
      } },

    { key: 'stack', label: 'Stacked', sample: '≡',
      draw: function (ctx, w, h, d) {
        var u = Math.min(w, h) / 720, x = w - 40 * u, y = h - 86 * u;
        ctx.textAlign = 'right'; ctx.textBaseline = 'alphabetic';
        glow(ctx); ctx.fillStyle = '#fff';
        ctx.font = '200 ' + (52 * u) + 'px ' + F_SANS;
        ctx.fillText(t24(d), x, y);
        ctx.font = '600 ' + (18 * u) + 'px ' + F_SANS;
        ctx.fillText(spaced(DAYS[d.getDay()].toUpperCase().slice(0, 3)), x, y + 25 * u);
        ctx.font = '400 ' + (17 * u) + 'px ' + F_SANS;
        ctx.fillText(d.getDate() + ' ' + MONTHS[d.getMonth()], x, y + 47 * u);
        noGlow(ctx);
      } },

    { key: 'minimal', label: 'Minimal', sample: '·',
      draw: function (ctx, w, h, d) {
        var u = Math.min(w, h) / 720;
        ctx.textAlign = 'center'; ctx.textBaseline = 'alphabetic';
        glow(ctx, 0.45); ctx.fillStyle = 'rgba(255,255,255,.92)';
        ctx.font = '300 ' + (20 * u) + 'px ' + F_SANS;
        ctx.fillText(spaced(t24(d)), w / 2, h - 46 * u);
        noGlow(ctx);
      } },

    { key: 'heart', label: 'Heart', sample: '♥',
      draw: function (ctx, w, h, d) {
        var u = Math.min(w, h) / 720, x = 44 * u, y = h - 58 * u;
        ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic';
        glow(ctx, 0.5);
        ctx.fillStyle = '#fff';
        ctx.font = 'italic 400 ' + (40 * u) + 'px ' + F_SCRIPT;
        var s = DAYS[d.getDay()];
        ctx.fillText(s, x, y);
        var sw = ctx.measureText(s).width;
        ctx.fillStyle = '#ff5c7a';
        ctx.font = '400 ' + (26 * u) + 'px ' + F_SANS;
        ctx.fillText('♥', x + sw + 10 * u, y - 2 * u);
        ctx.fillStyle = '#fff';
        ctx.font = '300 ' + (22 * u) + 'px ' + F_SANS;
        ctx.fillText(t24(d), x + 3 * u, y + 26 * u);
        noGlow(ctx);
      } },

    { key: 'bar', label: 'Bar', sample: '▭',
      draw: function (ctx, w, h, d) {
        var u = Math.min(w, h) / 720, bh = 54 * u, y = h - bh;
        var g = ctx.createLinearGradient(0, y - 30 * u, 0, h);
        g.addColorStop(0, 'rgba(0,0,0,0)');
        g.addColorStop(1, 'rgba(0,0,0,.58)');
        ctx.fillStyle = g; ctx.fillRect(0, y - 30 * u, w, bh + 30 * u);
        ctx.fillStyle = '#fff'; ctx.textBaseline = 'middle';
        ctx.textAlign = 'left';
        ctx.font = '500 ' + (19 * u) + 'px ' + F_SANS;
        ctx.fillText(DAYS[d.getDay()] + ', ' + d.getDate() + ' ' + MONTHS[d.getMonth()],
                     34 * u, h - bh / 2);
        ctx.textAlign = 'right';
        ctx.font = '700 ' + (21 * u) + 'px ' + F_SANS;
        ctx.fillText(t12(d), w - 34 * u, h - bh / 2);
      } }
  ];

  function stampByKey(k) {
    for (var i = 0; i < STAMPS.length; i++) if (STAMPS[i].key === k) return STAMPS[i];
    return null;
  }


  var STICKERS = ['❤️', '😍', '🔥', '😂', '🥰', '✨', '💯', '🎵', '🌸', '👑', '💋', '🙌'];
  var INK = ['#ffffff', '#111111', '#ff3b5c', '#ffc400', '#42d392', '#4aa3ff', '#b06bff'];

  var MAX_VIDEO_MS = 15000;   // Snapchat jaisa chhota clip
  var HOLD_MS = 260;          // itni der dabaye rakha to video, warna photo
  var TIMER_STEPS = [0, 3, 10];

  var MP_VERSION = '0.10.14';
  var MP_MODULE_URL = 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@' + MP_VERSION;
  var MP_WASM_URL = MP_MODULE_URL + '/wasm';
  var MP_MODEL_URL = 'https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task';

  var st = {
    stream: null, audioStream: null, facingMode: 'user',
    filterKey: 'none', lensKey: null, stampKey: null,
    fxCat: 'foryou', fxOpen: false, fxQuery: '',
    zoom: 1, flashOn: false, timerSec: 0,
    onCapture: null, rafId: null,
    faceLandmarker: null, faceLandmarkerLoading: null, lastLandmarks: null, detectBusy: false,
    recorder: null, chunks: [], recStart: 0, recTimer: null, holdTimer: null, recording: false,
    captured: null,            // { blob, kind, url }
    tool: null,                // 'text' | 'draw' | 'sticker' | null
    ink: '#ffffff',
    items: [],                 // text + sticker overlays
    strokes: [],               // drawing paths
    drawing: null,
    dragItem: null
  };

  function $(id) { return document.getElementById(id); }

  function esc(s) {
    return (window.LWApp && window.LWApp.esc) ? window.LWApp.esc(s) :
      String(s).replace(/[&<>"']/g, function (c) {
        return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
      });
  }

  /* ============================================================
     User ke apne filters
     ------------------------------------------------------------
     profiles.preferences.customFilters (jsonb) me rehte hain. Do wajah:
       • koi migration nahi chahiye — ye column isi kaam ke liye bana tha
       • filter user ke saath har device par jaata hai. localStorage me
         rakhte to wo ek hi browser tak simat jaata (bilkul wahi galti jo
         Spotify connection me thi).
     ============================================================ */

  // slider se banne wale filter ke hisse. def = "kuch nahi badla" wali value.
  var FX = [
    { key: 'brightness', label: 'Roshni',   min: 0.4,  max: 1.6, step: 0.01, def: 1, unit: '' },
    { key: 'contrast',   label: 'Contrast', min: 0.4,  max: 2,   step: 0.01, def: 1, unit: '' },
    { key: 'saturate',   label: 'Rang',     min: 0,    max: 2.5, step: 0.01, def: 1, unit: '' },
    { key: 'hue-rotate', label: 'Hue',      min: -180, max: 180, step: 1,    def: 0, unit: 'deg' },
    { key: 'sepia',      label: 'Sepia',    min: 0,    max: 1,   step: 0.01, def: 0, unit: '' },
    { key: 'grayscale',  label: 'B&W',      min: 0,    max: 1,   step: 0.01, def: 0, unit: '' },
    { key: 'blur',       label: 'Blur',     min: 0,    max: 4,   step: 0.1,  def: 0, unit: 'px' }
  ];

  function fxDefaults() {
    var v = {};
    FX.forEach(function (f) { v[f.key] = f.def; });
    return v;
  }

  // sirf wahi hisse likho jo default se hate hain — chhoti aur padhne layak
  // CSS banti hai, aur "none" ka matlab saaf rehta hai
  function fxToCss(vals) {
    var out = [];
    FX.forEach(function (f) {
      var v = Number(vals[f.key]);
      if (isNaN(v) || v === f.def) return;
      out.push(f.key + '(' + v + f.unit + ')');
    });
    return out.length ? out.join(' ') : 'none';
  }

  function customList() {
    var p = window.LW && window.LW.profile;
    var arr = p && p.preferences && p.preferences[CUSTOM_PREF_KEY];
    return Array.isArray(arr) ? arr.slice() : [];
  }

  // FILTERS ko jagah par hi dobara bharo (upar wala comment dekho)
  function syncFilters() {
    FILTERS.length = 0;
    BUILTIN_FILTERS.forEach(function (f) { FILTERS.push(f); });
    customList().forEach(function (f) {
      if (f && f.key && f.css) {
        FILTERS.push({ key: f.key, label: f.label || 'Mera', css: f.css, custom: true });
      }
    });
    return FILTERS;
  }

  function persistCustom(list) {
    var p = window.LW && window.LW.profile;
    if (!p || !window.LWApp || !window.LWApp.saveProfile) return Promise.resolve(false);
    var merged = Object.assign({}, p.preferences || {});
    merged[CUSTOM_PREF_KEY] = list;
    return window.LWApp.saveProfile({ preferences: merged }).then(function (r) {
      if (r && r.error) return false;
      p.preferences = merged;      // local copy bhi taaza rakho
      syncFilters();
      return true;
    }).catch(function () { return false; });
  }

  function deleteCustomFilter(key) {
    var f = FILTERS.filter(function (x) { return x.key === key; })[0];
    if (!f) return Promise.resolve(false);
    if (!confirm('"' + f.label + '" filter hata dein?')) return Promise.resolve(false);
    var list = customList().filter(function (x) { return x.key !== key; });
    return persistCustom(list).then(function (ok) {
      if (!ok) { toast('Filter hataya nahi ja saka', 'error'); return false; }
      // jo filter abhi laga hua tha wahi hat gaya to Original par wapas
      if (st.filterKey === key) st.filterKey = 'none';
      if ($('camFxRow')) renderFx();
      renderMakerList();
      notifyFiltersChanged();
      return true;
    });
  }

  function toast(msg, kind) {
    if (window.LWApp && window.LWApp.toast) window.LWApp.toast(msg, kind);
  }

  /* Filter list badalne par jo bhi page sun raha ho (dashboard ka story
     composer) apni chips dobara bana le — warna naya filter tabhi dikhta
     jab poora page reload ho. */
  var _filterListeners = [];
  function onFiltersChanged(cb) { if (typeof cb === 'function') _filterListeners.push(cb); }
  function notifyFiltersChanged() {
    _filterListeners.slice().forEach(function (cb) { try { cb(FILTERS); } catch (e) {} });
  }

  /* ---------- filter banane wala modal ----------
     Camera aur story composer dono isi ko kholte hain, isliye ye camera
     modal ke andar nahi, alag element hai. */
  var mk = { vals: fxDefaults(), previewSrc: null, editKey: null };

  function ensureMaker() {
    if ($('lwFilterMaker')) return;
    var el = document.createElement('div');
    el.className = 'modal-bg';
    el.id = 'lwFilterMaker';
    el.innerHTML =
      '<div class="modal fm-box">' +
        '<h3 id="fmTitle">🎨 Apna filter banao</h3>' +
        '<div class="fm-preview"><img id="fmImg" alt=""><div class="fm-swatch" id="fmSwatch"></div></div>' +
        '<div class="fm-sliders" id="fmSliders"></div>' +
        '<input type="text" id="fmName" maxlength="14" placeholder="Filter ka naam (jaise: Sunset)">' +
        '<div class="fm-mine" id="fmMine"></div>' +
        '<div class="fm-actions">' +
          '<button type="button" class="btn" onclick="LWCamera.resetFilterMaker()">Reset</button>' +
          '<button type="button" class="btn" onclick="LWCamera.closeFilterMaker()">Rehne do</button>' +
          '<button type="button" class="btn primary" onclick="LWCamera.saveFilterMaker()">Save</button>' +
        '</div>' +
      '</div>';
    document.body.appendChild(el);
    el.addEventListener('click', function (e) { if (e.target === el) closeFilterMaker(); });

    $('fmSliders').innerHTML = FX.map(function (f) {
      return '<label class="fm-row"><span>' + esc(f.label) + '</span>' +
        '<input type="range" data-fx="' + f.key + '" min="' + f.min + '" max="' + f.max +
        '" step="' + f.step + '" value="' + f.def + '">' +
        '<b data-fxval="' + f.key + '">' + f.def + '</b></label>';
    }).join('');

    $('fmSliders').addEventListener('input', function (e) {
      var k = e.target && e.target.getAttribute('data-fx');
      if (!k) return;
      mk.vals[k] = Number(e.target.value);
      paintMaker();
    });
  }

  function paintMaker() {
    var css = fxToCss(mk.vals);
    var img = $('fmImg'), sw = $('fmSwatch');
    // Preview ke liye asli photo sabse behtar hai. Na mile (camera abhi
    // chal raha hai / permission nahi) to ek rangeen swatch dikha dete hain
    // — usse bhi filter ka asar saaf dikh jaata hai.
    if (mk.previewSrc) {
      img.src = mk.previewSrc; img.hidden = false; sw.hidden = true;
      img.style.filter = css;
    } else {
      img.hidden = true; sw.hidden = false;
      sw.style.filter = css;
    }
    FX.forEach(function (f) {
      var out = $('fmSliders').querySelector('[data-fxval="' + f.key + '"]');
      var inp = $('fmSliders').querySelector('[data-fx="' + f.key + '"]');
      if (inp) inp.value = mk.vals[f.key];
      if (out) out.textContent = mk.vals[f.key];
    });
  }

  function renderMakerList() {
    var box = $('fmMine');
    if (!box) return;
    var mine = customList();
    if (!mine.length) { box.innerHTML = ''; return; }
    box.innerHTML = '<div class="fm-mine-t">Tumhare filters</div>' +
      mine.map(function (f) {
        return '<span class="fm-tag"><i style="filter:' + f.css + '"></i>' + esc(f.label) +
          '<button type="button" aria-label="Hatao" onclick="LWCamera.deleteCustomFilter(\'' +
          f.key + '\')">×</button></span>';
      }).join('');
  }

  function openFilterMaker(opts) {
    opts = opts || {};
    ensureMaker();
    mk.vals = fxDefaults();
    mk.previewSrc = opts.previewSrc || null;
    $('fmName').value = '';
    paintMaker();
    renderMakerList();
    $('lwFilterMaker').classList.add('open');
  }

  function closeFilterMaker() {
    var el = $('lwFilterMaker');
    if (el) el.classList.remove('open');
  }

  function resetFilterMaker() {
    mk.vals = fxDefaults();
    paintMaker();
  }

  function saveFilterMaker() {
    var css = fxToCss(mk.vals);
    if (css === 'none') { toast('Pehle koi slider hilao — abhi filter khaali hai', 'error'); return; }
    var name = ($('fmName').value || '').trim();
    if (!name) { toast('Filter ko naam do', 'error'); return; }

    var list = customList();
    if (list.length >= MAX_CUSTOM) {
      toast('Zyada se zyada ' + MAX_CUSTOM + ' filter rakh sakte ho — koi purana hatao', 'error');
      return;
    }
    if (list.some(function (f) { return (f.label || '').toLowerCase() === name.toLowerCase(); })) {
      toast('Is naam ka filter pehle se hai', 'error');
      return;
    }

    var f = { key: 'u:' + Date.now().toString(36), label: name, css: css };
    list.push(f);
    persistCustom(list).then(function (ok) {
      if (!ok) { toast('Filter save nahi hua', 'error'); return; }
      st.filterKey = f.key;                 // banate hi laga do
      if ($('camFxRow')) renderFx();
      notifyFiltersChanged();
      closeFilterMaker();
      toast('✅ "' + name + '" filter ban gaya');
    });
  }

  function filterCss() {
    for (var i = 0; i < FILTERS.length; i++) if (FILTERS[i].key === st.filterKey) return FILTERS[i].css;
    return 'none';
  }

  function lensByKey(key) {
    for (var i = 0; i < LENSES.length; i++) if (LENSES[i].key === key) return LENSES[i];
    return null;
  }

  /* ---------- modal shell ---------- */
  function ensureModal() {
    if ($('lwCameraModal')) return;
    var el = document.createElement('div');
    el.className = 'modal-bg camera-view';
    el.id = 'lwCameraModal';
    el.innerHTML =
      '<div class="camera-box">' +
        '<video id="camVideo" autoplay playsinline muted></video>' +
        '<canvas id="camCanvas"></canvas>' +

        '<div class="cam-flash" id="camFlash"></div>' +

        '<div class="cam-empty" id="camEmpty" style="display:none">' +
          '<span class="ic">📷</span><span id="camEmptyReason"></span></div>' +

        '<div class="cam-count" id="camCount" hidden></div>' +

        /* ---- shoot stage ---- */
        '<div class="cam-stage cam-shoot" id="camShoot">' +
          '<div class="cam-top-bar">' +
            '<button type="button" class="cam-icon-btn" onclick="LWCamera.close()" aria-label="Band karo">✕</button>' +
            '<div class="cam-top-right">' +
              '<button type="button" class="cam-icon-btn" id="camTimerBtn" onclick="LWCamera.cycleTimer()" aria-label="Timer">⏱</button>' +
              '<button type="button" class="cam-icon-btn" id="camFlashBtn" onclick="LWCamera.toggleFlash()" aria-label="Flash">⚡</button>' +
              '<button type="button" class="cam-icon-btn" onclick="LWCamera.flip()" aria-label="Camera badlo">🔄</button>' +
            '</div>' +
          '</div>' +

          '<div class="cam-zoom" id="camZoomWrap">' +
            '<input type="range" id="camZoom" min="1" max="4" step="0.1" value="1" aria-label="Zoom"' +
              ' oninput="LWCamera.setZoom(this.value)">' +
            '<span id="camZoomLabel">1.0x</span>' +
          '</div>' +

          '<div class="cam-fx">' +
            '<div class="cam-fx-head">' +
              '<div class="cam-fx-tabs" id="camFxTabs"></div>' +
              '<button type="button" class="cam-fx-more" id="camFxMore"' +
                ' onclick="LWCamera.toggleBrowser()" aria-label="Sab effects dikhao">⌃</button>' +
            '</div>' +
            '<div class="cam-fx-row" id="camFxRow"></div>' +
          '</div>' +

          '<div class="cam-fx-browser" id="camFxBrowser" hidden>' +
            '<div class="cam-fx-tabs cam-fx-tabs-wide" id="camFxTabs2"></div>' +
            '<div class="cam-fx-search">' +
              '<input type="search" id="camFxSearch" placeholder="Effect dhoondo…"' +
                ' oninput="LWCamera.fxSearch(this.value)" aria-label="Effect dhoondo">' +
              '<button type="button" class="cam-icon-btn"' +
                ' onclick="LWCamera.toggleBrowser()" aria-label="Band karo">✕</button>' +
            '</div>' +
            '<div class="cam-fx-grid" id="camFxGrid"></div>' +
          '</div>' +

          '<div class="cam-shutter-row">' +
            '<span class="cam-hint" id="camHint">Tap = photo &middot; dabaye rakho = video</span>' +
            '<button type="button" class="cam-shutter" id="camShutterBtn" aria-label="Photo lo">' +
              '<svg class="cam-ring" viewBox="0 0 100 100" aria-hidden="true">' +
                '<circle id="camRing" cx="50" cy="50" r="46" />' +
              '</svg>' +
            '</button>' +
          '</div>' +
        '</div>' +

        /* ---- edit stage ---- */
        '<div class="cam-stage cam-edit" id="camEdit" hidden>' +
          '<img id="camShot" alt="">' +
          '<video id="camShotVideo" playsinline loop muted hidden></video>' +
          '<canvas id="camDrawLayer"></canvas>' +
          '<div class="cam-items" id="camItems"></div>' +

          '<div class="cam-top-bar">' +
            '<button type="button" class="cam-icon-btn" onclick="LWCamera.retake()" aria-label="Dobara lo">✕</button>' +
            '<div class="cam-top-right">' +
              '<button type="button" class="cam-icon-btn" id="camTextBtn" onclick="LWCamera.pickTool(\'text\')" aria-label="Text">T</button>' +
              '<button type="button" class="cam-icon-btn" id="camDrawBtn" onclick="LWCamera.pickTool(\'draw\')" aria-label="Draw">✏️</button>' +
              '<button type="button" class="cam-icon-btn" id="camStickerBtn" onclick="LWCamera.pickTool(\'sticker\')" aria-label="Sticker">😀</button>' +
              '<button type="button" class="cam-icon-btn" onclick="LWCamera.undo()" aria-label="Undo">↶</button>' +
            '</div>' +
          '</div>' +

          '<div class="cam-ink-row" id="camInkRow" hidden></div>' +
          '<div class="cam-sticker-row" id="camStickerRow" hidden></div>' +
          '<div class="cam-video-note" id="camVideoNote" hidden>Video par overlay nahi lagta &mdash; filter aur lens pehle se ismein bake hain.</div>' +

          '<div class="cam-send-row">' +
            '<button type="button" class="btn" onclick="LWCamera.retake()">Dobara</button>' +
            '<button type="button" class="btn primary" id="camSendBtn" onclick="LWCamera.send()">Bhejo ➤</button>' +
          '</div>' +
        '</div>' +

      '</div>';
    document.body.appendChild(el);
    el.addEventListener('click', function (e) { if (e.target === el) close(); });

    wireShutter();
    wireEditSurface();
  }

  /* ============================================================
     Effects picker — ek hi jagah se filter + stamp + lens
     ------------------------------------------------------------
     Pehle do alag flat row thi (lens chips, filter chips) aur list
     badhne par wo bekaar ho jaati: 11 stamp + 7 filter + 6 lens = 24
     cheezein ek line mein scroll karna kisi kaam ka nahi.

     Ab: category tabs + ek carousel, aur chevron dabao to poora grid
     search ke saath. Har cheez ko dil (♥) se favorite kar sakte ho.

     Teen kism ek saath chal sakti hain — ek filter, ek stamp aur ek
     lens. Isliye "on" ek nahi, teen ho sakte hain, aur dobara tap
     karne par wahi cheez band ho jaati hai.
     ============================================================ */

  var CATS = [
    { key: 'recent',    label: 'Recents' },
    { key: 'fav',       label: 'Favorites' },
    { key: 'foryou',    label: 'For You' },
    { key: 'aesthetic', label: 'Aesthetic' },
    { key: 'look',      label: 'Appearance' },
    { key: 'lens',      label: 'Lens' }
  ];

  var FAV_PREF_KEY  = 'favEffects';    // profiles.preferences ke andar
  var RECENT_LS_KEY = 'lw_fx_recent';  // sirf is device par
  var MAX_RECENT    = 12;

  /* Filter ka CSS style attribute mein jaata hai. Wo aata to hamare hi
     banaye buildCss() se hai (sirf number), par custom filters user ke
     profile mein store hote hain — beech mein kuch bhi ghus sakta hai.
     Isliye style mein daalne se pehle sirf wahi akshar rehne do jo CSS
     filter function mein lagte hain. */
  function safeCss(s) {
    return String(s || 'none').replace(/[^a-zA-Z0-9().,%#\s-]/g, '').slice(0, 300) || 'none';
  }

  function allEffects() {
    var out = [];
    FILTERS.forEach(function (f) {
      if (f.key === 'none') return;
      out.push({ id: 'filter:' + f.key, kind: 'filter', key: f.key,
                 label: f.label, css: f.css, cat: 'look', custom: !!f.custom });
    });
    STAMPS.forEach(function (s) {
      out.push({ id: 'stamp:' + s.key, kind: 'stamp', key: s.key,
                 label: s.label, sample: s.sample, cat: 'aesthetic' });
    });
    LENSES.forEach(function (l) {
      out.push({ id: 'lens:' + l.key, kind: 'lens', key: l.key,
                 label: l.name || 'Lens', emoji: l.label, cat: 'lens' });
    });
    return out;
  }

  function effectById(id) {
    var all = allEffects();
    for (var i = 0; i < all.length; i++) if (all[i].id === id) return all[i];
    return null;
  }

  /* ---------- favorites (account ke saath chalte hain) ---------- */
  function favList() {
    var p = window.LW && window.LW.profile;
    var arr = p && p.preferences && p.preferences[FAV_PREF_KEY];
    return Array.isArray(arr) ? arr.slice() : [];
  }
  function isFav(id) { return favList().indexOf(id) !== -1; }

  function toggleFav(id) {
    var list = favList(), i = list.indexOf(id);
    if (i === -1) list.push(id); else list.splice(i, 1);

    // Dil turant bhare — save network par hai, uska intezaar karwana
    // bura lagta hai. Fail hone par batate hain aur wapas kar dete hain.
    var p = window.LW && window.LW.profile;
    if (!p) return;
    var before = p.preferences || {};
    var merged = Object.assign({}, before);
    merged[FAV_PREF_KEY] = list;
    p.preferences = merged;
    renderFx();

    if (!(window.LWApp && window.LWApp.saveProfile)) return;
    window.LWApp.saveProfile({ preferences: merged }).then(function (r) {
      if (r && r.error) { p.preferences = before; renderFx(); toast('Favorite save nahi hua', 'error'); }
    }).catch(function () {
      p.preferences = before; renderFx(); toast('Favorite save nahi hua', 'error');
    });
  }

  /* ---------- recents (sirf is device par) ----------
     Ye localStorage mein hai, profile mein nahi: har tap par ek network
     save karna bekaar hai, aur "maine is phone par abhi kya use kiya"
     waise bhi device ki baat hai. */
  function recentList() {
    try {
      var a = JSON.parse(localStorage.getItem(RECENT_LS_KEY) || '[]');
      return Array.isArray(a) ? a : [];
    } catch (e) { return []; }
  }
  function pushRecent(id) {
    var l = recentList().filter(function (x) { return x !== id; });
    l.unshift(id);
    try { localStorage.setItem(RECENT_LS_KEY, JSON.stringify(l.slice(0, MAX_RECENT))); } catch (e) {}
  }

  /* For You = tumhara apna pehle (favorites, phir recents), uske baad
     har kism se thoda-thoda — taaki jo cheez kabhi try hi nahi ki wo
     bhi saamne aaye. */
  function forYou(all) {
    var byId = {}, seen = {}, out = [];
    all.forEach(function (e) { byId[e.id] = e; });
    function add(e) { if (e && !seen[e.id]) { seen[e.id] = 1; out.push(e); } }
    favList().forEach(function (id) { add(byId[id]); });
    recentList().forEach(function (id) { add(byId[id]); });
    ['stamp', 'filter', 'lens'].forEach(function (kind) {
      all.filter(function (e) { return e.kind === kind; }).slice(0, 6).forEach(add);
    });
    return out;
  }

  function effectsFor(cat, q) {
    var all = allEffects(), byId = {};
    all.forEach(function (e) { byId[e.id] = e; });
    var list;
    if (cat === 'recent')      list = recentList().map(function (id) { return byId[id]; }).filter(Boolean);
    else if (cat === 'fav')    list = favList().map(function (id) { return byId[id]; }).filter(Boolean);
    else if (cat === 'foryou') list = forYou(all);
    else                       list = all.filter(function (e) { return e.cat === cat; });

    if (q) {
      var s = String(q).toLowerCase();
      list = list.filter(function (e) { return e.label.toLowerCase().indexOf(s) !== -1; });
    }
    return list;
  }

  function isOn(e) {
    if (e.kind === 'filter') return st.filterKey === e.key;
    if (e.kind === 'stamp')  return st.stampKey === e.key;
    if (e.kind === 'lens')   return st.lensKey === e.key;
    return false;
  }

  function anyOn() { return st.filterKey !== 'none' || !!st.stampKey || !!st.lensKey; }

  function thumbInner(e) {
    if (e.kind === 'filter') return '<i class="cam-fx-sw" style="filter:' + safeCss(e.css) + '"></i>';
    if (e.kind === 'stamp')  return '<i class="cam-fx-st">' + esc(e.sample || '⏱') + '</i>';
    return '<i class="cam-fx-em">' + esc(e.emoji || '✨') + '</i>';
  }

  /* ---------- render ---------- */
  function renderFxTabs() {
    var boxes = [$('camFxTabs'), $('camFxTabs2')].filter(Boolean);
    if (!boxes.length) return;
    var html = CATS.map(function (c) {
      var n = effectsFor(c.key, '').length;
      // Khaali category ko dikhana par dabne na dena — "yahan kuch nahi
      // hai" batana "gayab kar dena" se behtar hai
      return '<button type="button" class="cam-fx-tab' + (c.key === st.fxCat ? ' on' : '') +
        (n ? '' : ' empty') + '" onclick="LWCamera.setFxCat(\'' + c.key + '\')">' +
        esc(c.label) + '</button>';
    }).join('');
    boxes.forEach(function (b) {
      b.innerHTML = html;
      // Chuni hui tab kinare par kat na jaaye. scrollIntoView poore page
      // ko hila deta hai, isliye sirf is strip ka scrollLeft set karte hain.
      var on = b.querySelector('.cam-fx-tab.on');
      if (on) b.scrollLeft = Math.max(0, on.offsetLeft - (b.clientWidth - on.offsetWidth) / 2);
    });
  }

  function itemHtml(e, withFav) {
    return '<button type="button" class="cam-fx-item' + (isOn(e) ? ' on' : '') +
      '" onclick="LWCamera.applyEffect(\'' + e.id + '\')" title="' + esc(e.label) + '">' +
      '<span class="cam-fx-thumb">' + thumbInner(e) + '</span>' +
      '<span class="cam-fx-name">' + esc(e.label) + '</span>' +
      (withFav ? '<span class="cam-fx-fav' + (isFav(e.id) ? ' on' : '') +
        '" role="button" tabindex="0" aria-label="Favorite"' +
        ' onclick="event.stopPropagation();LWCamera.toggleFav(\'' + e.id + '\')">' +
        (isFav(e.id) ? '♥' : '♡') + '</span>' : '') +
      '</button>';
  }

  function renderFxRow() {
    var row = $('camFxRow');
    if (!row) return;
    var list = effectsFor(st.fxCat, '');
    var head =
      '<button type="button" class="cam-fx-item cam-fx-none' + (anyOn() ? '' : ' on') +
        '" onclick="LWCamera.clearEffects()" title="Kuch nahi">' +
        '<span class="cam-fx-thumb"><i class="cam-fx-em">⊘</i></span>' +
        '<span class="cam-fx-name">Original</span></button>';
    if (!list.length) {
      row.innerHTML = head + '<span class="cam-fx-empty">' +
        (st.fxCat === 'fav' ? 'Abhi koi favorite nahi — grid mein ♡ dabao'
                            : 'Yahan abhi kuch nahi') + '</span>';
      return;
    }
    row.innerHTML = head + list.map(function (e) { return itemHtml(e, false); }).join('') +
      (st.fxCat === 'look'
        ? '<button type="button" class="cam-fx-item cam-fx-new" onclick="LWCamera.newFilterFromCamera()"' +
          ' title="Naya filter banao"><span class="cam-fx-thumb"><i class="cam-fx-em">＋</i></span>' +
          '<span class="cam-fx-name">Naya</span></button>'
        : '');
  }

  function renderFxGrid() {
    var g = $('camFxGrid');
    if (!g) return;
    var list = effectsFor(st.fxCat, st.fxQuery);
    if (!list.length) {
      g.innerHTML = '<p class="cam-fx-empty">' +
        (st.fxQuery ? 'Is naam ka kuch nahi mila' : 'Is category mein abhi kuch nahi') + '</p>';
      return;
    }
    g.innerHTML = list.map(function (e) { return itemHtml(e, true); }).join('');
  }

  function renderFx() {
    renderFxTabs();
    renderFxRow();
    if (st.fxOpen) renderFxGrid();
  }

  // Purane naam — dashboard/story se aane wale call sites inhi ko bulate hain
  function renderFilterRow() { renderFx(); }
  function renderLensRow() { renderFx(); }

  /* ---------- actions ---------- */
  function setFxCat(cat) {
    st.fxCat = cat;
    renderFx();
  }

  function toggleBrowser() {
    st.fxOpen = !st.fxOpen;
    var b = $('camFxBrowser'), m = $('camFxMore');
    if (b) b.hidden = !st.fxOpen;
    if (m) { m.textContent = st.fxOpen ? '⌄' : '⌃'; m.classList.toggle('on', st.fxOpen); }
    if (st.fxOpen) { renderFxGrid(); var s = $('camFxSearch'); if (s) s.focus(); }
  }

  function fxSearch(v) {
    st.fxQuery = v || '';
    renderFxGrid();
  }

  function applyEffect(id) {
    var e = effectById(id);
    if (!e) return;
    if (e.kind === 'filter')     setFilter(st.filterKey === e.key ? 'none' : e.key);
    else if (e.kind === 'stamp') setStamp(st.stampKey === e.key ? null : e.key);
    else if (e.kind === 'lens')  setLens(st.lensKey === e.key ? null : e.key);
    if (isOn(e)) pushRecent(id);
    renderFx();
  }

  function clearEffects() {
    st.filterKey = 'none';
    st.stampKey = null;
    if (st.lensKey) setLens(null); else renderFx();
  }

  function setStamp(key) {
    st.stampKey = key || null;
    renderFx();
  }


  /* Camera se maker kholte waqt preview ke liye abhi ka frame de dete hain —
     apne hi chehre par filter dekh kar banana asaan hai. */
  function newFilterFromCamera() {
    var src = null;
    try {
      var c = $('camCanvas');
      if (c && c.width) src = c.toDataURL('image/jpeg', 0.7);
    } catch (e) {}
    openFilterMaker({ previewSrc: src });
  }

  function paintTimerBtn() {
    var b = $('camTimerBtn');
    b.textContent = st.timerSec ? st.timerSec + 's' : '⏱';
    b.classList.toggle('on', !!st.timerSec);
  }

  function paintFlashBtn() {
    $('camFlashBtn').classList.toggle('on', st.flashOn);
  }

  /* ---------- camera lifecycle ---------- */
  async function startStream() {
    stopStream();
    var video = $('camVideo');
    try {
      st.stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: st.facingMode, width: { ideal: 1280 }, height: { ideal: 1280 } },
        audio: false
      });
    } catch (e) {
      $('camEmpty').style.display = 'flex';
      $('camEmptyReason').innerHTML = (e && e.name === 'NotAllowedError')
        ? 'Camera ki permission nahi mili.<br><small>Browser/app settings mein Loveway ko camera ki ijazat do.</small>'
        : 'Is device ya browser par camera nahi chal raha.';
      return false;
    }
    video.srcObject = st.stream;
    await new Promise(function (res) {
      if (video.readyState >= 1) return res();
      video.onloadedmetadata = res;
    });
    try { await video.play(); } catch (e) {}

    var c = $('camCanvas');
    c.width = video.videoWidth || 720;
    c.height = video.videoHeight || 1280;
    $('camEmpty').style.display = 'none';

    // torch sirf peechhe wale camera par hota hai; aage wale ke liye
    // screen-flash use karte hain (neeche flashPulse)
    $('camFlashBtn').hidden = false;
    return true;
  }

  function stopStream() {
    if (st.stream) { st.stream.getTracks().forEach(function (t) { t.stop(); }); st.stream = null; }
    if (st.audioStream) { st.audioStream.getTracks().forEach(function (t) { t.stop(); }); st.audioStream = null; }
  }

  function videoTrack() {
    return st.stream && st.stream.getVideoTracks ? st.stream.getVideoTracks()[0] : null;
  }

  /* ---------- render loop ---------- */
  function renderLoop() {
    var video = $('camVideo'), canvas = $('camCanvas');
    if (!video || !canvas) return;
    var ctx = canvas.getContext('2d');

    if (video.readyState >= 2) {
      var vw = video.videoWidth, vh = video.videoHeight;
      // digital zoom — source rect ko kaat kar poore canvas par khinchte hain.
      // Track ka native zoom har device par nahi hota, ye har jagah chalta hai.
      var z = st.zoom || 1;
      var sw = vw / z, sh = vh / z;
      var sx = (vw - sw) / 2, sy = (vh - sh) / 2;

      ctx.save();
      ctx.filter = filterCss();
      // Front camera mirror dikhta hai (selfie mein natural lagta hai) aur
      // capture bhi wahi mirrored frame save karta hai — jo dikha wahi jaata hai.
      if (st.facingMode === 'user') { ctx.translate(canvas.width, 0); ctx.scale(-1, 1); }
      ctx.drawImage(video, sx, sy, sw, sh, 0, 0, canvas.width, canvas.height);
      ctx.restore();

      if (st.lensKey) {
        maybeDetectFace(video);
        var lens = lensByKey(st.lensKey);
        if (lens && st.lastLandmarks) {
          ctx.save();
          if (st.facingMode === 'user') { ctx.translate(canvas.width, 0); ctx.scale(-1, 1); }
          try { lens.draw(ctx, st.lastLandmarks, canvas.width, canvas.height); } catch (e) {}
          ctx.restore();
        }
      }

      /* Stamp JAAN-BOOJH KAR mirror ke bahar hai — yahan koi translate/
         scale nahi. Lens ko ulta frame chahiye (chehre par chipakna hai),
         par text ulta likh diya to sheeshe jaisa padha hi nahi jaayega. */
      if (st.stampKey) {
        var sp = stampByKey(st.stampKey);
        if (sp) {
          ctx.save();
          try { sp.draw(ctx, canvas.width, canvas.height, new Date()); } catch (e) {}
          ctx.restore();
        }
      }
    }
    st.rafId = requestAnimationFrame(renderLoop);
  }

  /* ---------- AR lenses (lazy) ---------- */
  async function ensureFaceLandmarker() {
    if (st.faceLandmarker) return st.faceLandmarker;
    if (st.faceLandmarkerLoading) return st.faceLandmarkerLoading;
    st.faceLandmarkerLoading = (async function () {
      var vision = await import(MP_MODULE_URL);
      var fileset = await vision.FilesetResolver.forVisionTasks(MP_WASM_URL);
      st.faceLandmarker = await vision.FaceLandmarker.createFromOptions(fileset, {
        baseOptions: { modelAssetPath: MP_MODEL_URL, delegate: 'GPU' },
        runningMode: 'VIDEO',
        numFaces: 1
      });
      return st.faceLandmarker;
    })().catch(function (e) {
      st.faceLandmarkerLoading = null;
      if (window.LWApp) window.LWApp.toast('❌ Lens load nahi hua (internet check karo)', 'error');
      throw e;
    });
    return st.faceLandmarkerLoading;
  }

  function maybeDetectFace(video) {
    if (!st.faceLandmarker || st.detectBusy) return;
    st.detectBusy = true;
    try {
      var res = st.faceLandmarker.detectForVideo(video, performance.now());
      st.lastLandmarks = (res && res.faceLandmarks && res.faceLandmarks[0]) || null;
    } catch (e) {
      st.lastLandmarks = null;
    }
    st.detectBusy = false;
  }

  /* landmark helpers — MediaPipe ke standard 468-point face mesh indices:
     1 = naak ki nok, 10 = maathe ka upar, 33/263 = aankhon ke bahari kone,
     152 = thodi. Mesh sirf chehre ke saamne ka hissa deta hai (kaan aur sar
     ke upar nahi), isliye ears/crown maathe ke point se andaza laga kar upar-
     bahar rakhe jaate hain — pixel-perfect nahi, par convincing lagta hai. */
  function pt(lm, i, w, h) { var p = lm[i]; return { x: p.x * w, y: p.y * h }; }
  function dist(a, b) { return Math.hypot(a.x - b.x, a.y - b.y); }
  function angleOf(a, b) { return Math.atan2(b.y - a.y, b.x - a.x); }

  function faceBasis(lm, w, h) {
    var leftEye = pt(lm, 33, w, h), rightEye = pt(lm, 263, w, h);
    return {
      leftEye: leftEye, rightEye: rightEye,
      forehead: pt(lm, 10, w, h), nose: pt(lm, 1, w, h), chin: pt(lm, 152, w, h),
      eyeDist: dist(leftEye, rightEye),
      center: { x: (leftEye.x + rightEye.x) / 2, y: (leftEye.y + rightEye.y) / 2 },
      rot: angleOf(leftEye, rightEye)
    };
  }

  function withFace(ctx, origin, rot, fn) {
    ctx.save(); ctx.translate(origin.x, origin.y); ctx.rotate(rot); fn(); ctx.restore();
  }

  function drawDogLens(ctx, lm, w, h) {
    var b = faceBasis(lm, w, h), s = b.eyeDist;
    withFace(ctx, b.forehead, b.rot, function () {
      ctx.fillStyle = '#8a5a34';
      [-1, 1].forEach(function (side) {
        ctx.beginPath();
        ctx.ellipse(side * s * 0.85, -s * 0.55, s * 0.42, s * 0.62, side * 0.35, 0, Math.PI * 2);
        ctx.fill();
      });
    });
    withFace(ctx, b.nose, b.rot, function () {
      ctx.fillStyle = '#241a12';
      ctx.beginPath(); ctx.ellipse(0, s * 0.08, s * 0.16, s * 0.12, 0, 0, Math.PI * 2); ctx.fill();
    });
  }

  function drawCatLens(ctx, lm, w, h) {
    var b = faceBasis(lm, w, h), s = b.eyeDist;
    withFace(ctx, b.forehead, b.rot, function () {
      ctx.fillStyle = '#3a3a3a';
      [-1, 1].forEach(function (side) {
        ctx.beginPath();
        ctx.moveTo(side * s * 0.35, -s * 0.15);
        ctx.lineTo(side * s * 0.95, -s * 1.15);
        ctx.lineTo(side * s * 1.15, -s * 0.15);
        ctx.closePath(); ctx.fill();
      });
    });
    withFace(ctx, b.nose, b.rot, function () {
      ctx.strokeStyle = 'rgba(255,255,255,.85)';
      ctx.lineWidth = Math.max(1, s * 0.02);
      [-1, 1].forEach(function (side) {
        for (var i = 0; i < 3; i++) {
          ctx.beginPath();
          ctx.moveTo(side * s * 0.1, s * (0.05 + i * 0.05));
          ctx.lineTo(side * s * 0.9, s * (-0.05 + i * 0.05));
          ctx.stroke();
        }
      });
      ctx.fillStyle = '#e07a9c';
      ctx.beginPath(); ctx.ellipse(0, s * 0.06, s * 0.1, s * 0.08, 0, 0, Math.PI * 2); ctx.fill();
    });
  }

  function drawBunnyLens(ctx, lm, w, h) {
    var b = faceBasis(lm, w, h), s = b.eyeDist;
    withFace(ctx, b.forehead, b.rot, function () {
      ctx.fillStyle = '#f2ecec';
      [-1, 1].forEach(function (side) {
        ctx.beginPath(); ctx.ellipse(side * s * 0.4, -s * 1.35, s * 0.3, s * 1.1, 0, 0, Math.PI * 2); ctx.fill();
      });
      ctx.fillStyle = '#f2a6bd';
      [-1, 1].forEach(function (side) {
        ctx.beginPath(); ctx.ellipse(side * s * 0.4, -s * 1.35, s * 0.14, s * 0.75, 0, 0, Math.PI * 2); ctx.fill();
      });
    });
  }

  function drawFlowerLens(ctx, lm, w, h) {
    var b = faceBasis(lm, w, h), s = b.eyeDist;
    var colors = ['#ff6f91', '#ffd166', '#7c83fd', '#8bd3a0', '#ff9f6f'];
    withFace(ctx, b.forehead, b.rot, function () {
      for (var i = -3; i <= 3; i++) {
        var x = i * s * 0.42, yOff = -Math.abs(i) * s * 0.06;
        ctx.fillStyle = colors[(i + 3) % colors.length];
        for (var p = 0; p < 5; p++) {
          var ang = p * (Math.PI * 2 / 5);
          ctx.beginPath();
          ctx.ellipse(x + Math.cos(ang) * s * 0.14, yOff - s * 0.55 + Math.sin(ang) * s * 0.14,
            s * 0.11, s * 0.08, ang, 0, Math.PI * 2);
          ctx.fill();
        }
        ctx.fillStyle = '#fff6a8';
        ctx.beginPath(); ctx.arc(x, yOff - s * 0.55, s * 0.07, 0, Math.PI * 2); ctx.fill();
      }
    });
  }

  function drawGlassesLens(ctx, lm, w, h) {
    var b = faceBasis(lm, w, h), s = b.eyeDist;
    withFace(ctx, b.center, b.rot, function () {
      ctx.fillStyle = 'rgba(20,20,26,.88)';
      ctx.strokeStyle = 'rgba(20,20,26,.95)';
      ctx.lineWidth = Math.max(2, s * 0.05);
      [-1, 1].forEach(function (side) {
        ctx.beginPath(); ctx.ellipse(side * s * 0.52, 0, s * 0.46, s * 0.34, 0, 0, Math.PI * 2); ctx.fill();
      });
      ctx.beginPath(); ctx.moveTo(-s * 0.1, 0); ctx.lineTo(s * 0.1, 0); ctx.stroke();
    });
  }

  function drawHeartEyesLens(ctx, lm, w, h) {
    var b = faceBasis(lm, w, h), s = b.eyeDist;
    function heart(cx, cy, size) {
      ctx.beginPath();
      ctx.moveTo(cx, cy + size * 0.3);
      ctx.bezierCurveTo(cx - size, cy - size * 0.6, cx - size * 0.5, cy - size * 1.3, cx, cy - size * 0.5);
      ctx.bezierCurveTo(cx + size * 0.5, cy - size * 1.3, cx + size, cy - size * 0.6, cx, cy + size * 0.3);
      ctx.closePath(); ctx.fill();
    }
    withFace(ctx, b.center, b.rot, function () {
      ctx.fillStyle = '#ff3b5c';
      heart(-s * 0.52, 0, s * 0.34);
      heart(s * 0.52, 0, s * 0.34);
    });
  }

  /* ---------- flash ---------- */
  function trackHasTorch() {
    var t = videoTrack();
    if (!t || !t.getCapabilities) return false;
    try { return !!t.getCapabilities().torch; } catch (e) { return false; }
  }

  async function torch(on) {
    var t = videoTrack();
    if (!t || !trackHasTorch()) return false;
    try { await t.applyConstraints({ advanced: [{ torch: on }] }); return true; }
    catch (e) { return false; }
  }

  // Aage wale camera par torch nahi hota — screen ko safed kar dena hi
  // "flash" hai (yahi trick har selfie app use karti hai)
  function flashPulse() {
    return new Promise(function (res) {
      var f = $('camFlash');
      f.classList.add('on');
      setTimeout(function () { f.classList.remove('on'); res(); }, 220);
    });
  }

  async function withFlash(fn) {
    if (!st.flashOn) return fn();
    var torched = await torch(true);
    if (!torched) await flashPulse();
    var out = await fn();
    if (torched) await torch(false);
    return out;
  }

  /* ---------- countdown ---------- */
  function countdown(sec) {
    if (!sec) return Promise.resolve();
    var box = $('camCount');
    box.hidden = false;
    return new Promise(function (res) {
      var left = sec;
      box.textContent = left;
      var iv = setInterval(function () {
        left--;
        if (left <= 0) {
          clearInterval(iv);
          box.hidden = true;
          res();
        } else {
          box.textContent = left;
        }
      }, 1000);
    });
  }

  /* ---------- shutter: tap = photo, hold = video ---------- */
  function wireShutter() {
    var btn = $('camShutterBtn');

    btn.addEventListener('pointerdown', function (e) {
      e.preventDefault();
      if (st.captured) return;
      st.holdTimer = setTimeout(function () {
        st.holdTimer = null;
        startRecording();
      }, HOLD_MS);
    });

    function release() {
      if (st.holdTimer) {           // itni jaldi chhoda = tap = photo
        clearTimeout(st.holdTimer);
        st.holdTimer = null;
        takePhoto();
        return;
      }
      if (st.recording) stopRecording();
    }

    btn.addEventListener('pointerup', release);
    btn.addEventListener('pointercancel', release);
    btn.addEventListener('pointerleave', function () { if (st.recording) stopRecording(); });
  }

  async function takePhoto() {
    var btn = $('camShutterBtn');
    btn.disabled = true;
    try {
      await countdown(st.timerSec);
      await withFlash(function () {
        return new Promise(function (res) {
          $('camCanvas').toBlob(function (blob) {
            if (blob) enterEdit(blob, 'image');
            res();
          }, 'image/jpeg', 0.92);
        });
      });
    } finally {
      btn.disabled = false;
    }
  }

  function pickVideoMime() {
    var want = ['video/webm;codecs=vp9,opus', 'video/webm;codecs=vp8,opus', 'video/webm', 'video/mp4'];
    for (var i = 0; i < want.length; i++) {
      if (window.MediaRecorder && MediaRecorder.isTypeSupported(want[i])) return want[i];
    }
    return '';
  }

  async function startRecording() {
    if (!window.MediaRecorder || !$('camCanvas').captureStream) {
      if (window.LWApp) window.LWApp.toast('Is browser mein video record nahi ho sakta — photo le lo', 'error');
      return;
    }

    // Canvas se record karte hain (video element se nahi) — isliye filter aur
    // lens seedha video mein bake ho jaate hain, baad mein kuch karna nahi padta.
    var canvasStream = $('camCanvas').captureStream(30);

    // Mic ki permission yahin maangi jaati hai, camera khulte hi nahi —
    // sirf photo lene wale user se mic kabhi poocha nahi jaata.
    try {
      st.audioStream = await navigator.mediaDevices.getUserMedia({ audio: true });
      st.audioStream.getAudioTracks().forEach(function (t) { canvasStream.addTrack(t); });
    } catch (e) {
      // mic mana kar diya to bhi video chalega, bas awaaz nahi hogi
      console.log('[LWCamera] mic nahi mila, bina awaaz record kar rahe hain');
    }

    var mime = pickVideoMime();
    try {
      st.recorder = mime ? new MediaRecorder(canvasStream, { mimeType: mime })
                         : new MediaRecorder(canvasStream);
    } catch (e) {
      if (window.LWApp) window.LWApp.toast('Video record shuru nahi ho paaya', 'error');
      return;
    }

    st.chunks = [];
    st.recorder.ondataavailable = function (e) { if (e.data && e.data.size) st.chunks.push(e.data); };
    st.recorder.onstop = function () {
      var type = (st.recorder && st.recorder.mimeType) || mime || 'video/webm';
      var blob = new Blob(st.chunks, { type: type });
      st.chunks = [];
      if (blob.size) enterEdit(blob, 'video');
    };

    if (st.flashOn && trackHasTorch()) await torch(true);

    st.recorder.start(200);
    st.recording = true;
    st.recStart = Date.now();
    document.getElementById('camShutterBtn').classList.add('rec');
    $('camHint').textContent = 'Record ho raha hai…';

    st.recTimer = setInterval(function () {
      var pct = Math.min(1, (Date.now() - st.recStart) / MAX_VIDEO_MS);
      var ring = $('camRing');
      var circ = 2 * Math.PI * 46;
      ring.style.strokeDasharray = circ;
      ring.style.strokeDashoffset = circ * (1 - pct);
      if (pct >= 1) stopRecording();
    }, 100);
  }

  function stopRecording() {
    if (!st.recording) return;
    st.recording = false;
    clearInterval(st.recTimer); st.recTimer = null;
    if (st.flashOn) torch(false);
    try { st.recorder.stop(); } catch (e) {}
    if (st.audioStream) {
      st.audioStream.getTracks().forEach(function (t) { t.stop(); });
      st.audioStream = null;
    }
    var btn = $('camShutterBtn');
    btn.classList.remove('rec');
    $('camRing').style.strokeDashoffset = 0;
    $('camHint').textContent = 'Tap = photo · dabaye rakho = video';
  }

  /* ---------- edit stage ---------- */
  function enterEdit(blob, kind) {
    if (st.captured && st.captured.url) URL.revokeObjectURL(st.captured.url);
    st.captured = { blob: blob, kind: kind, url: URL.createObjectURL(blob) };
    st.items = [];
    st.strokes = [];
    st.tool = null;
    st.ink = INK[0];

    var isVid = kind === 'video';
    var img = $('camShot'), vid = $('camShotVideo');

    img.hidden = isVid;
    vid.hidden = !isVid;
    if (isVid) { vid.src = st.captured.url; vid.play().catch(function () {}); }
    else { img.src = st.captured.url; }

    // video par overlay nahi — uske liye poora clip dobara encode karna padta
    // hai, jo browser mein bhaari aur dhima hai. Filter/lens usme pehle se
    // bake hain, isliye editing ki zarurat bhi kam padti hai.
    ['camTextBtn', 'camDrawBtn', 'camStickerBtn'].forEach(function (id) { $(id).hidden = isVid; });
    $('camVideoNote').hidden = !isVid;
    $('camInkRow').hidden = true;
    $('camStickerRow').hidden = true;

    renderInkRow();
    renderStickerRow();
    renderItems();
    resizeDrawLayer();
    redrawStrokes();

    $('camShoot').hidden = true;
    $('camEdit').hidden = false;
  }

  function retake() {
    if (st.captured && st.captured.url) URL.revokeObjectURL(st.captured.url);
    st.captured = null;
    st.items = []; st.strokes = []; st.tool = null;
    var vid = $('camShotVideo');
    try { vid.pause(); } catch (e) {}
    vid.removeAttribute('src');
    $('camShot').removeAttribute('src');
    $('camEdit').hidden = true;
    $('camShoot').hidden = false;
  }

  function renderInkRow() {
    $('camInkRow').innerHTML = INK.map(function (c) {
      return '<button type="button" class="cam-ink' + (c === st.ink ? ' on' : '') +
        '" style="background:' + c + '" onclick="LWCamera.setInk(\'' + c + '\')" aria-label="Rang"></button>';
    }).join('');
  }

  function renderStickerRow() {
    $('camStickerRow').innerHTML = STICKERS.map(function (s) {
      return '<button type="button" class="cam-chip cam-lens-chip" onclick="LWCamera.addSticker(\'' +
        s + '\')">' + s + '</button>';
    }).join('');
  }

  function renderItems() {
    $('camItems').innerHTML = st.items.map(function (it, i) {
      var style = 'left:' + it.x + '%;top:' + it.y + '%;' +
        'font-size:' + it.size + 'px;' + (it.kind === 'text' ? 'color:' + it.color + ';' : '');
      return '<div class="cam-item' + (it.kind === 'text' ? ' cam-item-text' : '') +
        '" data-i="' + i + '" style="' + style + '">' + esc(it.value) + '</div>';
    }).join('');
  }

  function pickTool(tool) {
    st.tool = st.tool === tool ? null : tool;
    $('camInkRow').hidden = !(st.tool === 'draw' || st.tool === 'text');
    $('camStickerRow').hidden = st.tool !== 'sticker';
    $('camTextBtn').classList.toggle('on', st.tool === 'text');
    $('camDrawBtn').classList.toggle('on', st.tool === 'draw');
    $('camStickerBtn').classList.toggle('on', st.tool === 'sticker');
    $('camDrawLayer').classList.toggle('active', st.tool === 'draw');

    if (st.tool === 'text') addText();
  }

  function addText() {
    var value = window.prompt('Kya likhna hai?');
    if (!value) { st.tool = null; pickTool(null); return; }
    st.items.push({ kind: 'text', value: value.slice(0, 60), x: 50, y: 45, size: 30, color: st.ink });
    st.tool = null;
    $('camTextBtn').classList.remove('on');
    $('camInkRow').hidden = true;
    renderItems();
  }

  function addSticker(emoji) {
    st.items.push({ kind: 'sticker', value: emoji, x: 50, y: 50, size: 56 });
    renderItems();
  }

  function setInk(c) {
    st.ink = c;
    renderInkRow();
  }

  function undo() {
    // aakhri cheez jo daali gayi thi wahi hatao — stroke ya item, jo naya ho
    var lastItem = st.items.length ? st.items[st.items.length - 1] : null;
    var lastStroke = st.strokes.length ? st.strokes[st.strokes.length - 1] : null;
    if (lastItem && (!lastStroke || (lastItem.at || 0) > (lastStroke.at || 0))) st.items.pop();
    else if (lastStroke) st.strokes.pop();
    renderItems();
    redrawStrokes();
  }

  function resizeDrawLayer() {
    var c = $('camDrawLayer'), box = $('camEdit');
    c.width = box.clientWidth || 400;
    c.height = box.clientHeight || 700;
  }

  function redrawStrokes() {
    var c = $('camDrawLayer'), ctx = c.getContext('2d');
    ctx.clearRect(0, 0, c.width, c.height);
    ctx.lineJoin = ctx.lineCap = 'round';
    st.strokes.forEach(function (s) {
      if (s.pts.length < 2) return;
      ctx.strokeStyle = s.color;
      ctx.lineWidth = s.width;
      ctx.beginPath();
      ctx.moveTo(s.pts[0].x * c.width, s.pts[0].y * c.height);
      for (var i = 1; i < s.pts.length; i++) ctx.lineTo(s.pts[i].x * c.width, s.pts[i].y * c.height);
      ctx.stroke();
    });
  }

  // Drawing aur items dono normalized (0..1 / %) mein store hote hain, taaki
  // export ke waqt asli photo ke resolution par theek scale ho jaayein —
  // preview chhota hai, photo bada.
  function wireEditSurface() {
    var layer = $('camDrawLayer');

    function rel(e, el) {
      var r = el.getBoundingClientRect();
      return { x: (e.clientX - r.left) / r.width, y: (e.clientY - r.top) / r.height };
    }

    layer.addEventListener('pointerdown', function (e) {
      if (st.tool !== 'draw') return;
      layer.setPointerCapture(e.pointerId);
      st.drawing = { color: st.ink, width: 6, pts: [rel(e, layer)], at: Date.now() };
      st.strokes.push(st.drawing);
    });
    layer.addEventListener('pointermove', function (e) {
      if (!st.drawing) return;
      st.drawing.pts.push(rel(e, layer));
      redrawStrokes();
    });
    function endStroke() { st.drawing = null; }
    layer.addEventListener('pointerup', endStroke);
    layer.addEventListener('pointercancel', endStroke);

    // text / sticker ko ungli se ghumao
    var items = $('camItems');
    items.addEventListener('pointerdown', function (e) {
      var el = e.target.closest('.cam-item');
      if (!el) return;
      st.dragItem = { i: +el.dataset.i, el: el };
      items.setPointerCapture(e.pointerId);
    });
    items.addEventListener('pointermove', function (e) {
      if (!st.dragItem) return;
      var p = rel(e, items);
      var it = st.items[st.dragItem.i];
      it.x = Math.max(2, Math.min(98, p.x * 100));
      it.y = Math.max(2, Math.min(98, p.y * 100));
      st.dragItem.el.style.left = it.x + '%';
      st.dragItem.el.style.top = it.y + '%';
    });
    function endDrag() { st.dragItem = null; }
    items.addEventListener('pointerup', endDrag);
    items.addEventListener('pointercancel', endDrag);
  }

  /* ---------- export ---------- */
  function composePhoto() {
    return new Promise(function (resolve, reject) {
      var img = new Image();
      img.onload = function () {
        var c = document.createElement('canvas');
        c.width = img.naturalWidth;
        c.height = img.naturalHeight;
        var ctx = c.getContext('2d');
        ctx.drawImage(img, 0, 0);

        // strokes — normalized se asli resolution par
        ctx.lineJoin = ctx.lineCap = 'round';
        var scale = c.width / ($('camDrawLayer').width || c.width);
        st.strokes.forEach(function (s) {
          if (s.pts.length < 2) return;
          ctx.strokeStyle = s.color;
          ctx.lineWidth = Math.max(2, s.width * scale);
          ctx.beginPath();
          ctx.moveTo(s.pts[0].x * c.width, s.pts[0].y * c.height);
          for (var i = 1; i < s.pts.length; i++) ctx.lineTo(s.pts[i].x * c.width, s.pts[i].y * c.height);
          ctx.stroke();
        });

        // text + stickers
        var preview = $('camEdit').clientHeight || c.height;
        var fscale = c.height / preview;
        st.items.forEach(function (it) {
          var px = (it.x / 100) * c.width, py = (it.y / 100) * c.height;
          var size = it.size * fscale;
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.font = (it.kind === 'text' ? '700 ' : '') + size + 'px ' +
            (it.kind === 'text' ? 'system-ui, -apple-system, "Segoe UI", sans-serif' : 'sans-serif');
          if (it.kind === 'text') {
            ctx.lineWidth = Math.max(2, size * 0.09);
            ctx.strokeStyle = 'rgba(0,0,0,.55)';
            ctx.strokeText(it.value, px, py);
            ctx.fillStyle = it.color;
          } else {
            ctx.fillStyle = '#fff';
          }
          ctx.fillText(it.value, px, py);
        });

        c.toBlob(function (b) { b ? resolve(b) : reject(new Error('photo ban nahi payi')); }, 'image/jpeg', 0.92);
      };
      img.onerror = function () { reject(new Error('photo load nahi hui')); };
      img.src = st.captured.url;
    });
  }

  async function send() {
    if (!st.captured) return;
    var btn = $('camSendBtn');
    btn.disabled = true;
    try {
      var out = st.captured.blob, kind = st.captured.kind;
      if (kind === 'image' && (st.items.length || st.strokes.length)) {
        out = await composePhoto();
      }
      var cb = st.onCapture;
      close();
      if (cb) cb(out, kind);
    } catch (e) {
      if (window.LWApp) window.LWApp.toast('❌ ' + (e.message || 'bhej nahi paaye'), 'error');
      btn.disabled = false;
    }
  }

  /* ---------- public API ---------- */
  async function open(opts) {
    opts = opts || {};
    st.onCapture = opts.onCapture || null;
    st.filterKey = 'none';
    st.lensKey = null;
    st.stampKey = null;
    st.fxCat = 'foryou'; st.fxOpen = false; st.fxQuery = '';
    st.facingMode = 'user';
    st.zoom = 1;
    st.flashOn = false;
    st.timerSec = 0;
    st.captured = null;
    st.items = []; st.strokes = [];

    ensureModal();
    syncFilters();          // profile me pade user ke apne filters bhi aa jaayein
    var _b = $('camFxBrowser'); if (_b) _b.hidden = true;
    var _m = $('camFxMore'); if (_m) { _m.textContent = '⌃'; _m.classList.remove('on'); }
    var _s = $('camFxSearch'); if (_s) _s.value = '';
    renderFx();
    paintTimerBtn();
    paintFlashBtn();
    $('camZoom').value = 1;
    $('camZoomLabel').textContent = '1.0x';
    $('camEdit').hidden = true;
    $('camShoot').hidden = false;
    $('camShutterBtn').disabled = false;
    $('camHint').textContent = 'Tap = photo · dabaye rakho = video';

    $('lwCameraModal').classList.add('open');
    var ok = await startStream();
    if (ok) renderLoop();
  }

  function close() {
    if (st.recording) stopRecording();
    if (st.rafId) cancelAnimationFrame(st.rafId);
    st.rafId = null;
    stopStream();
    if (st.captured && st.captured.url) URL.revokeObjectURL(st.captured.url);
    st.captured = null;
    var el = $('lwCameraModal');
    if (el) el.classList.remove('open');
    st.onCapture = null;
    st.lastLandmarks = null;
  }

  async function flip() {
    st.facingMode = st.facingMode === 'user' ? 'environment' : 'user';
    st.zoom = 1;
    $('camZoom').value = 1;
    $('camZoomLabel').textContent = '1.0x';
    await startStream();
  }

  function setFilter(key) { st.filterKey = key; renderFilterRow(); }

  async function setLens(key) {
    st.lensKey = key;
    st.lastLandmarks = null;
    renderLensRow();
    if (key) {
      var btn = $('camShutterBtn');
      btn.disabled = true;
      $('camHint').textContent = 'Lens load ho raha hai…';
      try { await ensureFaceLandmarker(); } catch (e) {}
      btn.disabled = false;
      $('camHint').textContent = 'Tap = photo · dabaye rakho = video';
    }
  }

  function setZoom(v) {
    st.zoom = Math.max(1, Math.min(4, parseFloat(v) || 1));
    $('camZoomLabel').textContent = st.zoom.toFixed(1) + 'x';
  }

  function cycleTimer() {
    var i = TIMER_STEPS.indexOf(st.timerSec);
    st.timerSec = TIMER_STEPS[(i + 1) % TIMER_STEPS.length];
    paintTimerBtn();
  }

  function toggleFlash() {
    st.flashOn = !st.flashOn;
    paintFlashBtn();
  }

  window.LWCamera = {
    FILTERS: FILTERS,
    STAMPS: STAMPS,
    syncFilters: syncFilters,
    onFiltersChanged: onFiltersChanged,
    openFilterMaker: openFilterMaker,
    closeFilterMaker: closeFilterMaker,
    resetFilterMaker: resetFilterMaker,
    saveFilterMaker: saveFilterMaker,
    deleteCustomFilter: deleteCustomFilter,
    newFilterFromCamera: newFilterFromCamera,
    open: open,
    close: close,
    flip: flip,
    setFilter: setFilter,
    setLens: setLens,
    setStamp: setStamp,
    applyEffect: applyEffect,
    clearEffects: clearEffects,
    toggleFav: toggleFav,
    setFxCat: setFxCat,
    toggleBrowser: toggleBrowser,
    fxSearch: fxSearch,
    setZoom: setZoom,
    cycleTimer: cycleTimer,
    toggleFlash: toggleFlash,
    pickTool: pickTool,
    addSticker: addSticker,
    setInk: setInk,
    undo: undo,
    retake: retake,
    send: send
  };
})();
