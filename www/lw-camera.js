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

  var LENSES = [
    { key: 'dog',     label: '🐶', draw: drawDogLens },
    { key: 'cat',     label: '🐱', draw: drawCatLens },
    { key: 'bunny',   label: '🐰', draw: drawBunnyLens },
    { key: 'flower',  label: '🌸', draw: drawFlowerLens },
    { key: 'glasses', label: '🕶️', draw: drawGlassesLens },
    { key: 'heart',   label: '😍', draw: drawHeartEyesLens }
  ];

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
    filterKey: 'none', lensKey: null,
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
      if ($('camFilterRow')) renderFilterRow();
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
      if ($('camFilterRow')) renderFilterRow();
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

          '<div class="cam-lens-row" id="camLensRow"></div>' +
          '<div class="cam-filter-row" id="camFilterRow"></div>' +

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

  /* ---------- shoot stage: chips ---------- */
  function renderFilterRow() {
    $('camFilterRow').innerHTML = FILTERS.map(function (f) {
      return '<button type="button" class="cam-chip' + (f.key === st.filterKey ? ' on' : '') +
        '" onclick="LWCamera.setFilter(\'' + f.key + '\')">' + esc(f.label) + '</button>';
    }).join('') +
    // apna filter banane ka raasta wahin, jahan filter chune jaate hain
    '<button type="button" class="cam-chip cam-chip-new" onclick="LWCamera.newFilterFromCamera()"' +
      ' aria-label="Naya filter banao">＋</button>';
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

  function renderLensRow() {
    $('camLensRow').innerHTML =
      '<button type="button" class="cam-chip cam-lens-chip' + (!st.lensKey ? ' on' : '') +
        '" onclick="LWCamera.setLens(null)" aria-label="Lens hatao">🚫</button>' +
      LENSES.map(function (l) {
        return '<button type="button" class="cam-chip cam-lens-chip' + (l.key === st.lensKey ? ' on' : '') +
          '" onclick="LWCamera.setLens(\'' + l.key + '\')">' + l.label + '</button>';
      }).join('');
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
    st.facingMode = 'user';
    st.zoom = 1;
    st.flashOn = false;
    st.timerSec = 0;
    st.captured = null;
    st.items = []; st.strokes = [];

    ensureModal();
    syncFilters();          // profile me pade user ke apne filters bhi aa jaayein
    renderFilterRow();
    renderLensRow();
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
