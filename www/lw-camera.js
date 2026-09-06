/* ============================================================
   Loveway — live camera: color filters + AR face lenses
   ------------------------------------------------------------
   Ek hi engine, do jagah se khulta hai: Stories (dashboard.html)
   aur Chat (messages.html). Dono `LWCamera.open({mode, onCapture})`
   hi bulate hain — is file ke andar hi poora UI ban jaata hai
   (koi HTML kisi page mein pehle se likhne ki zarurat nahi).

   Filters wahi CSS strings hain jo Story compose editor (static,
   gallery-picked photo par) pehle se use karta hai — is file mein
   FILTERS yahin define hote hain aur dashboard.html apna purana
   copy hata kar isi ko LWCamera.FILTERS se padhta hai, taaki do
   jagah ek hi list maintain na karni pade.

   AR lenses (dog/cat/bunny/flower/glasses/heart-eyes) MediaPipe
   Face Landmarker se chalte hain — ye library BADI hai (WASM +
   model file), isliye tabhi load hoti hai jab user pehli baar
   koi lens chune, camera khulte hi nahi.
   ============================================================ */
(function () {
  'use strict';

  var FILTERS = [
    { key: 'none',    label: 'Original', css: 'none' },
    { key: 'warm',    label: 'Warm',     css: 'sepia(0.35) saturate(1.35) contrast(1.05)' },
    { key: 'cool',    label: 'Cool',     css: 'hue-rotate(-15deg) saturate(1.25) brightness(1.05)' },
    { key: 'bw',      label: 'B&W',      css: 'grayscale(1) contrast(1.15)' },
    { key: 'vintage', label: 'Vintage',  css: 'sepia(0.55) saturate(0.85) contrast(0.95) brightness(1.05)' },
    { key: 'vivid',   label: 'Vivid',    css: 'saturate(1.7) contrast(1.15)' },
    { key: 'soft',    label: 'Soft',     css: 'brightness(1.08) saturate(0.95) contrast(0.92)' }
  ];

  var LENSES = [
    { key: 'dog',      label: '🐶', draw: drawDogLens },
    { key: 'cat',      label: '🐱', draw: drawCatLens },
    { key: 'bunny',    label: '🐰', draw: drawBunnyLens },
    { key: 'flower',   label: '🌸', draw: drawFlowerLens },
    { key: 'glasses',  label: '🕶️', draw: drawGlassesLens },
    { key: 'heart',    label: '😍', draw: drawHeartEyesLens }
  ];

  var MP_VERSION = '0.10.14';
  var MP_MODULE_URL = 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@' + MP_VERSION;
  var MP_WASM_URL = MP_MODULE_URL + '/wasm';
  var MP_MODEL_URL = 'https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task';

  var st = {
    stream: null, facingMode: 'user', filterKey: 'none', lensKey: null,
    onCapture: null, rafId: null,
    faceLandmarker: null, faceLandmarkerLoading: null, lastLandmarks: null,
    detectBusy: false
  };

  function $(id) { return document.getElementById(id); }

  function filterCss() {
    for (var i = 0; i < FILTERS.length; i++) if (FILTERS[i].key === st.filterKey) return FILTERS[i].css;
    return 'none';
  }

  function lensByKey(key) {
    for (var i = 0; i < LENSES.length; i++) if (LENSES[i].key === key) return LENSES[i];
    return null;
  }

  /* ---------- modal shell (ek hi baar banta hai, phir reuse hota hai) ---------- */
  function ensureModal() {
    if ($('lwCameraModal')) return;
    var el = document.createElement('div');
    el.className = 'modal-bg camera-view';
    el.id = 'lwCameraModal';
    el.innerHTML =
      '<div class="camera-box">' +
        '<video id="camVideo" autoplay playsinline muted style="display:none"></video>' +
        '<canvas id="camCanvas"></canvas>' +
        '<div class="cam-empty" id="camEmpty" style="display:none">' +
          '<span class="ic">📷</span>Camera khul nahi payi.<br>' +
          '<small id="camEmptyReason"></small></div>' +
        '<div class="cam-top-bar">' +
          '<button type="button" class="cam-icon-btn" onclick="LWCamera.close()" aria-label="Close">✕</button>' +
          '<button type="button" class="cam-icon-btn" onclick="LWCamera.flip()" aria-label="Flip camera">🔄</button>' +
        '</div>' +
        '<div class="cam-lens-row" id="camLensRow"></div>' +
        '<div class="cam-filter-row" id="camFilterRow"></div>' +
        '<div class="cam-shutter-row">' +
          '<button type="button" class="cam-shutter" id="camShutterBtn" onclick="LWCamera.capture()" aria-label="Capture"></button>' +
        '</div>' +
      '</div>';
    document.body.appendChild(el);
    el.addEventListener('click', function (e) { if (e.target === el) close(); });
  }

  function renderFilterRow() {
    $('camFilterRow').innerHTML = FILTERS.map(function (f) {
      return '<button type="button" class="cam-chip' + (f.key === st.filterKey ? ' on' : '') +
        '" onclick="LWCamera.setFilter(\'' + f.key + '\')">' + esc(f.label) + '</button>';
    }).join('');
  }

  function renderLensRow() {
    $('camLensRow').innerHTML =
      '<button type="button" class="cam-chip cam-lens-chip' + (!st.lensKey ? ' on' : '') +
        '" onclick="LWCamera.setLens(null)">🚫</button>' +
      LENSES.map(function (l) {
        return '<button type="button" class="cam-chip cam-lens-chip' + (l.key === st.lensKey ? ' on' : '') +
          '" onclick="LWCamera.setLens(\'' + l.key + '\')">' + l.label + '</button>';
      }).join('');
  }

  function esc(s) {
    return (window.LWApp && window.LWApp.esc) ? window.LWApp.esc(s) :
      String(s).replace(/[&<>"']/g, function (c) {
        return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
      });
  }

  /* ---------- camera lifecycle ---------- */
  async function startStream() {
    stopStream();
    var video = $('camVideo');
    try {
      st.stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: st.facingMode }, audio: false
      });
    } catch (e) {
      $('camEmpty').style.display = 'flex';
      $('camEmptyReason').textContent = (e && e.name === 'NotAllowedError')
        ? 'Camera ki permission nahi mili — browser/app settings check karo.'
        : 'Ye device/browser camera support nahi karta.';
      return false;
    }
    video.srcObject = st.stream;
    await new Promise(function (res) { video.onloadedmetadata = res; });
    await video.play().catch(function () {});
    var canvas = $('camCanvas');
    canvas.width = video.videoWidth || 720;
    canvas.height = video.videoHeight || 1280;
    $('camEmpty').style.display = 'none';
    return true;
  }

  function stopStream() {
    if (st.stream) {
      st.stream.getTracks().forEach(function (t) { t.stop(); });
      st.stream = null;
    }
  }

  function renderLoop() {
    var video = $('camVideo'), canvas = $('camCanvas');
    if (!video || !canvas) return;
    var ctx = canvas.getContext('2d');

    if (video.readyState >= 2) {
      ctx.save();
      ctx.filter = filterCss();
      // Front camera ka video mirror dikhta hai (jaisa selfie mein natural
      // lagta hai) — lekin capture usi mirrored frame ko save karta hai,
      // taaki jo dikha wahi post ho (Snapchat/Instagram dono aisa hi karte).
      if (st.facingMode === 'user') {
        ctx.translate(canvas.width, 0);
        ctx.scale(-1, 1);
      }
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
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

  /* ---------- AR face lens engine (lazy-loaded) ---------- */
  async function ensureFaceLandmarker() {
    if (st.faceLandmarker) return st.faceLandmarker;
    if (st.faceLandmarkerLoading) return st.faceLandmarkerLoading;
    st.faceLandmarkerLoading = (async function () {
      var vision = await import(/* webpackIgnore: true */ MP_MODULE_URL);
      var fileset = await vision.FilesetResolver.forVisionTasks(MP_WASM_URL);
      var landmarker = await vision.FaceLandmarker.createFromOptions(fileset, {
        baseOptions: { modelAssetPath: MP_MODEL_URL, delegate: 'GPU' },
        runningMode: 'VIDEO',
        numFaces: 1
      });
      st.faceLandmarker = landmarker;
      return landmarker;
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

  /* landmark helpers — indices yahan MediaPipe ke standard 468-point face
     mesh ke hain (documented constants): 1=nose tip, 10=forehead top,
     33/263=eye outer corners, 61/291=mouth corners, 152=chin. Mesh sirf
     chehre ke SAAMNE ke hisse ko cover karta hai (kaan/sar ke upar nahi),
     isliye ears/crown jaisi cheezein forehead point se andaza lagakar upar-
     bahar rakhi jaati hain — pixel-perfect nahi, par kaafi convincing. */
  function pt(landmarks, i, w, h) { var p = landmarks[i]; return { x: p.x * w, y: p.y * h }; }
  function dist(a, b) { return Math.hypot(a.x - b.x, a.y - b.y); }
  function angle(a, b) { return Math.atan2(b.y - a.y, b.x - a.x); }

  function faceBasis(lm, w, h) {
    var leftEye = pt(lm, 33, w, h), rightEye = pt(lm, 263, w, h);
    var forehead = pt(lm, 10, w, h), nose = pt(lm, 1, w, h), chin = pt(lm, 152, w, h);
    var eyeDist = dist(leftEye, rightEye);
    var center = { x: (leftEye.x + rightEye.x) / 2, y: (leftEye.y + rightEye.y) / 2 };
    var rot = angle(leftEye, rightEye);
    return { leftEye: leftEye, rightEye: rightEye, forehead: forehead, nose: nose, chin: chin,
      eyeDist: eyeDist, center: center, rot: rot };
  }

  function withFaceTransform(ctx, origin, rot, fn) {
    ctx.save();
    ctx.translate(origin.x, origin.y);
    ctx.rotate(rot);
    fn();
    ctx.restore();
  }

  function drawDogLens(ctx, lm, w, h) {
    var b = faceBasis(lm, w, h);
    var s = b.eyeDist;
    withFaceTransform(ctx, b.forehead, b.rot, function () {
      ctx.fillStyle = '#8a5a34';
      [-1, 1].forEach(function (side) {
        ctx.beginPath();
        ctx.ellipse(side * s * 0.85, -s * 0.55, s * 0.42, s * 0.62, side * 0.35, 0, Math.PI * 2);
        ctx.fill();
      });
    });
    withFaceTransform(ctx, b.nose, b.rot, function () {
      ctx.fillStyle = '#241a12';
      ctx.beginPath();
      ctx.ellipse(0, s * 0.08, s * 0.16, s * 0.12, 0, 0, Math.PI * 2);
      ctx.fill();
    });
  }

  function drawCatLens(ctx, lm, w, h) {
    var b = faceBasis(lm, w, h);
    var s = b.eyeDist;
    withFaceTransform(ctx, b.forehead, b.rot, function () {
      ctx.fillStyle = '#3a3a3a';
      [-1, 1].forEach(function (side) {
        ctx.beginPath();
        ctx.moveTo(side * s * 0.35, -s * 0.15);
        ctx.lineTo(side * s * 0.95, -s * 1.15);
        ctx.lineTo(side * s * 1.15, -s * 0.15);
        ctx.closePath();
        ctx.fill();
      });
    });
    withFaceTransform(ctx, b.nose, b.rot, function () {
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
      ctx.beginPath();
      ctx.ellipse(0, s * 0.06, s * 0.1, s * 0.08, 0, 0, Math.PI * 2);
      ctx.fill();
    });
  }

  function drawBunnyLens(ctx, lm, w, h) {
    var b = faceBasis(lm, w, h);
    var s = b.eyeDist;
    withFaceTransform(ctx, b.forehead, b.rot, function () {
      ctx.fillStyle = '#f2ecec';
      [-1, 1].forEach(function (side) {
        ctx.beginPath();
        ctx.ellipse(side * s * 0.4, -s * 1.35, s * 0.3, s * 1.1, 0, 0, Math.PI * 2);
        ctx.fill();
      });
      ctx.fillStyle = '#f2a6bd';
      [-1, 1].forEach(function (side) {
        ctx.beginPath();
        ctx.ellipse(side * s * 0.4, -s * 1.35, s * 0.14, s * 0.75, 0, 0, Math.PI * 2);
        ctx.fill();
      });
    });
  }

  function drawFlowerLens(ctx, lm, w, h) {
    var b = faceBasis(lm, w, h);
    var s = b.eyeDist;
    var colors = ['#ff6f91', '#ffd166', '#7c83fd', '#8bd3a0', '#ff9f6f'];
    withFaceTransform(ctx, b.forehead, b.rot, function () {
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
        ctx.beginPath();
        ctx.arc(x, yOff - s * 0.55, s * 0.07, 0, Math.PI * 2);
        ctx.fill();
      }
    });
  }

  function drawGlassesLens(ctx, lm, w, h) {
    var b = faceBasis(lm, w, h);
    var s = b.eyeDist;
    withFaceTransform(ctx, b.center, b.rot, function () {
      ctx.fillStyle = 'rgba(20,20,26,.88)';
      ctx.strokeStyle = 'rgba(20,20,26,.95)';
      ctx.lineWidth = Math.max(2, s * 0.05);
      [-1, 1].forEach(function (side) {
        ctx.beginPath();
        ctx.ellipse(side * s * 0.52, 0, s * 0.46, s * 0.34, 0, 0, Math.PI * 2);
        ctx.fill();
      });
      ctx.beginPath();
      ctx.moveTo(-s * 0.1, 0);
      ctx.lineTo(s * 0.1, 0);
      ctx.stroke();
    });
  }

  function drawHeartEyesLens(ctx, lm, w, h) {
    var b = faceBasis(lm, w, h);
    var s = b.eyeDist;
    function heart(cx, cy, size) {
      ctx.beginPath();
      ctx.moveTo(cx, cy + size * 0.3);
      ctx.bezierCurveTo(cx - size, cy - size * 0.6, cx - size * 0.5, cy - size * 1.3, cx, cy - size * 0.5);
      ctx.bezierCurveTo(cx + size * 0.5, cy - size * 1.3, cx + size, cy - size * 0.6, cx, cy + size * 0.3);
      ctx.closePath();
      ctx.fill();
    }
    withFaceTransform(ctx, b.center, b.rot, function () {
      ctx.fillStyle = '#ff3b5c';
      heart(-s * 0.52, 0, s * 0.34);
      heart(s * 0.52, 0, s * 0.34);
    });
  }

  /* ---------- public API ---------- */
  async function open(opts) {
    opts = opts || {};
    st.onCapture = opts.onCapture || null;
    st.filterKey = 'none';
    st.lensKey = null;
    st.facingMode = 'user';
    ensureModal();
    renderFilterRow();
    renderLensRow();
    $('lwCameraModal').classList.add('open');
    var ok = await startStream();
    if (ok) renderLoop();
  }

  function close() {
    if (st.rafId) cancelAnimationFrame(st.rafId);
    st.rafId = null;
    stopStream();
    var el = $('lwCameraModal');
    if (el) el.classList.remove('open');
    st.onCapture = null;
    st.lastLandmarks = null;
  }

  async function flip() {
    st.facingMode = st.facingMode === 'user' ? 'environment' : 'user';
    await startStream();
  }

  function setFilter(key) {
    st.filterKey = key;
    renderFilterRow();
  }

  async function setLens(key) {
    st.lensKey = key;
    st.lastLandmarks = null;
    renderLensRow();
    if (key) {
      $('camShutterBtn').disabled = true;
      try { await ensureFaceLandmarker(); } catch (e) {}
      $('camShutterBtn').disabled = false;
    }
  }

  function capture() {
    var canvas = $('camCanvas');
    if (!canvas) return;
    canvas.toBlob(function (blob) {
      if (!blob) return;
      var cb = st.onCapture;
      close();
      if (cb) cb(blob);
    }, 'image/jpeg', 0.92);
  }

  window.LWCamera = {
    FILTERS: FILTERS,
    open: open,
    close: close,
    flip: flip,
    setFilter: setFilter,
    setLens: setLens,
    capture: capture
  };
})();
