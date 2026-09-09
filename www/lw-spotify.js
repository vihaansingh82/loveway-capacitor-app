/* ============================================================
   Loveway — Spotify connection (per-user, apne hi account se)
   ------------------------------------------------------------
   PEHLE kya dikkat thi:
     Spotify ka access token Supabase ke `session.provider_token`
     se aata tha. Uska matlab —
       • sirf wahi log Spotify use kar paate the jinhone Loveway
         mein Spotify se hi LOGIN kiya ho (email/password aur
         Google wale users kabhi connect hi nahi kar paate the),
       • "Connect" dabate hi poora Loveway session hi badal jaata
         tha (Spotify wale account se dobara sign-in ho jaata tha),
       • token ~1 ghante mein mar jaata tha aur refresh karne ka
         koi tarika nahi tha — har baar dobara login.

   AB:
     Spotify ka apna Authorization Code + PKCE flow, seedha browser
     se. Ye Loveway ke login se bilkul alag hai — koi bhi user,
     kisi bhi tarah se sign-in kiya ho, apna Spotify jod sakta hai.
     Refresh token bhi milta hai, isliye connection tab tak chalta
     hai jab tak user khud "Disconnect" na kare.

   Client SECRET ki zarurat nahi (PKCE public client hai), isliye
   static site par bhi poori tarah safe hai.
   ============================================================ */
(function () {
  'use strict';

  var CFG = window.LOVEWAY_CONFIG || {};
  var CLIENT_ID = CFG.SPOTIFY_CLIENT_ID || '';

  var AUTH_URL  = 'https://accounts.spotify.com/authorize';
  var TOKEN_URL = 'https://accounts.spotify.com/api/token';
  var API_BASE  = 'https://api.spotify.com/v1';

  /* Sirf wahi scopes jo asal me call hone wale endpoints maangte hain.
     Pehle 13 maange jaate the; unme se 8 kisi bhi chalne wale feature ke
     liye zaroori nahi the — user ko bekaar me itni permissions dikhti thi:
       playlist-modify-public/private  — hum Spotify ki playlist kabhi nahi
                                         badalte (apni playlists apne DB me hain)
       playlist-read-collaborative     — koi endpoint isse nahi maangta
       user-read-playback-state        — /me/player kabhi call nahi hota
       user-read-currently-playing     — "abhi baj raha hai" kahin nahi dikhta
       user-library-modify             — Spotify ki library hum kabhi badalte nahi
       user-read-email                 — callback sirf display_name/id dikhata hai

     Jo endpoints in scopes ke bina chal hi nahi sakte the wo ab hata diye
     gaye hain (nowPlaying / saveTrack / unsaveTrack / isTrackSaved) — unka
     koi caller tha hi nahi, aur scope na hone ki wajah se call karne par
     Spotify sirf 403 deta. Aage zarurat pade to endpoint ke saath uska
     scope bhi wapas jodna padega. */
  var SCOPES = [
    'user-read-private',            // GET /me
    'playlist-read-private',        // GET /me/playlists, GET /playlists/{id}/items
    'user-library-read',            // GET /me/tracks, GET /me/library/contains
    'user-top-read',                // GET /me/top/tracks
    'user-read-recently-played'     // GET /me/player/recently-played
  ].join(' ');

  var TOK_KEY    = 'lw_spotify_token';      // { access_token, expires_at, scope, owner } — refresh_token server par rehta hai
  var VERIFY_KEY = 'lw_spotify_verifier';   // PKCE code_verifier (redirect ke beech mein)
  var RETURN_KEY = 'lw_spotify_return';     // connect dabaane wala page — wahin wapas bhejenge
  var STATE_KEY  = 'lw_spotify_state';      // CSRF state
  var REDIR_KEY  = 'lw_spotify_redirect';   // authorize par jo redirect_uri bheja tha, wahi
  /* Asli connection SERVER par hai (spotify_tokens ka refresh_token); browser
     me sirf 1 ghante wala access token cache hota hai. Isliye "juda hai ya
     nahi" ka jawab akele localStorage se nikal hi nahi sakta — ye key server
     wale jawab ko yaad rakhti hai: { owner, linked }. Key ka na hona matlab
     abhi pata nahi, ek baar server se poochhna padega. */
  var LINK_KEY   = 'lw_spotify_linked';

  /* ---------- chhote helpers ---------- */

  function ls(key) { try { return localStorage.getItem(key); } catch (e) { return null; } }
  function lsSet(key, val) { try { localStorage.setItem(key, val); } catch (e) {} }
  function lsDel(key) { try { localStorage.removeItem(key); } catch (e) {} }

  function pageUrl(page) {
    if (window.LW && window.LW.pageUrl) return window.LW.pageUrl(page);
    var base = location.pathname.replace(/[^/]*$/, '');
    return location.origin + base + page;
  }

  /* App ke andar hain ya normal browser me?
     Pehle sirf window.Capacitor dekha jaata tha. Par bridge (native-bridge.js)
     WebView khud inject karta hai, aur agar wo page ke chalne se pehle taiyaar
     na ho to ye check false ho jaata hai — tab app web wala redirect bhej deta
     hai, yaani apna hi origin: https://localhost/spotify-callback.html. Spotify
     wahin bhej deta hai aur browser me "Web page not available" aata hai,
     kyunki localhost par koi server hai hi nahi.

     Isliye ek aur pehchan: Capacitor app ka origin hi khaas hota hai —
     Android par https://localhost (bina port ke), iOS par capacitor://.
     Asli website in par kabhi nahi chalti. Local dev https://localhost:5500
     jaise port par hota hai, isliye port hone par isse app nahi maanate. */
  function isNativeApp() {
    if (window.Capacitor && window.Capacitor.isNativePlatform && window.Capacitor.isNativePlatform()) {
      return true;
    }
    if (location.protocol === 'capacitor:') return true;
    return location.hostname === 'localhost' && !location.port;
  }

  var NATIVE_REDIRECT = 'com.loveway.app://spotify-callback';

  function redirectUri() {
    return isNativeApp() ? NATIVE_REDIRECT : pageUrl('spotify-callback.html');
  }

  // Spotify redirect URI ka EXACT match maangta hai — scheme, host, port,
  // path, sab. Ye function batata hai ki jo browser bhejega usme koi aisi
  // baat to nahi jise Spotify kabhi accept hi nahi karega.
  function redirectProblem() {
    if (isNativeApp()) return null;
    var u;
    try { u = new URL(redirectUri()); } catch (e) { return null; }

    if (u.hostname === 'localhost') {
      return 'Spotify "localhost" accept nahi karta. Isi page ko ' +
             u.href.replace('//localhost', '//127.0.0.1') + ' se kholo aur wahi URI Spotify me daalo.';
    }
    if (u.protocol === 'http:' && u.hostname !== '127.0.0.1' && u.hostname !== '[::1]') {
      return 'Spotify sirf https redirect URI leta hai (127.0.0.1 iska apvaad hai). ' +
             'Site ko https par kholo.';
    }
    return null;
  }

  function randomString(len) {
    var chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-._~';
    var arr = new Uint8Array(len);
    (window.crypto || window.msCrypto).getRandomValues(arr);
    var out = '';
    for (var i = 0; i < len; i++) out += chars[arr[i] % chars.length];
    return out;
  }

  function base64Url(buf) {
    var bytes = new Uint8Array(buf), s = '';
    for (var i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i]);
    return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  }

  function sha256(text) {
    return window.crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  }

  /* ---------- token store ----------
     Token ke saath Loveway user ki id bhi rakhte hain. Ek hi browser
     par doosra Loveway account khulne par pichhle user ka Spotify
     apne aap alag ho jaaye — warna A ka Spotify B ke naam par chalta. */

  function currentOwner() {
    var p = window.LW && window.LW.profile;
    return (p && p.id) || null;
  }

  function readToken() {
    var raw = ls(TOK_KEY);
    if (!raw) return null;
    var tok;
    try { tok = JSON.parse(raw); } catch (e) { return null; }
    if (!tok || !tok.access_token) return null;
    var owner = currentOwner();
    if (owner && tok.owner && tok.owner !== owner) return null;   // kisi aur user ka token
    // Purane version ne refresh_token yahin localStorage me rakha tha. Jinke
    // browser me wo abhi bhi pada hai, unka ek baar server par bhej kar yahan
    // se hata do — warna upgrade ke baad bhi mahino chalne wala token browser
    // me hi rehta.
    if (tok.refresh_token) {
      var legacy = tok.refresh_token;
      delete tok.refresh_token;
      lsSet(TOK_KEY, JSON.stringify(tok));
      saveRefreshToken(legacy);
    }
    return tok;
  }

  // localStorage me sirf 1 ghante wala access token jaata hai. refresh_token
  // mahino chalta hai — use browser me rakhne ka matlab hai ki ek XSS milte hi
  // kisi ka Spotify account hamesha ke liye khul jaaye. Isliye wo server par
  // rakha jaata hai (spotify_tokens table, RLS ke peeche) aur naya access token
  // wahin se aata hai.
  function writeToken(data) {
    var prev = readToken() || {};
    var tok = {
      access_token: data.access_token,
      // 60s ka safety margin, taaki request beech raste mein expire na ho
      expires_at:   Date.now() + ((data.expires_in || 3600) - 60) * 1000,
      scope:        data.scope || prev.scope || SCOPES,
      owner:        currentOwner() || prev.owner || null
    };
    var was = hasConnection();
    lsSet(TOK_KEY, JSON.stringify(tok));
    setLinked(true);
    if (!was) emit();          // sirf tab jab UI ke liye sach me kuch badla ho
    return tok;
  }

  // refresh_token server ko saunp do — aage ke saare refresh wahin se honge.
  // Ye step fail ho jaaye to connect phir bhi chalta hai, bas ek ghante baad
  // dobara connect karna padega; isliye yahan throw nahi karte.
  function saveRefreshToken(rt) {
    var sb = window.LW && window.LW.sb;
    if (!rt || !sb || !sb.rpc) return Promise.resolve(false);
    return sb.rpc('lw_save_spotify_refresh', { p_refresh_token: rt })
      .then(function (r) { return !(r && r.error); })
      .catch(function () { return false; });
  }

  function clearToken() { lsDel(TOK_KEY); }

  function configured() { return !!CLIENT_ID; }

  /* ---------- juda hai ya nahi ----------
     PEHLE ye sirf localStorage dekhta tha, aur wahi sabse badi dikkat thi:
     access token 1 ghante ka hota hai aur sirf usi browser me rehta hai. To
     naye phone par, doosre browser me, ya cache saaf karte hi user ko wapas
     "Connect karo" dikhta tha — jabki uska Spotify pehle se juda tha
     (refresh_token server par salamat pada tha). Ab teen haalat hain:
       '1'  = server ke paas refresh_token hai (juda hai)
       '0'  = server ne saaf mana kar diya (juda nahi hai)
       null = abhi pata nahi — ek baar server se poochhna hai */

  function linkState() {
    var raw = ls(LINK_KEY);
    if (!raw) return null;
    var v;
    try { v = JSON.parse(raw); } catch (e) { return null; }
    if (!v) return null;
    var owner = currentOwner();
    if (owner && v.owner && v.owner !== owner) return null;   // kisi aur user ka nishaan
    return v.linked ? '1' : '0';
  }

  function setLinked(yes) {
    lsSet(LINK_KEY, JSON.stringify({ owner: currentOwner() || null, linked: !!yes }));
  }

  // server ne bataya ki wahan kuch hai hi nahi — local cache bhi saaf kar do
  function markUnlinked() {
    var was = hasConnection();
    clearToken();
    setLinked(false);
    if (was) emit();
  }

  /* Turant (sync) jawab — pehli screen paint karne ke liye. Ye "shayad juda
     hai" wala andaza hai; pakka jawab ensureConnected() se aata hai. */
  function hasConnection() {
    if (readToken()) return true;
    return linkState() === '1';
  }

  /* Pakka (async) jawab — zarurat padne par server se ek baar poochh leta
     hai. UI ko yahi use karna chahiye, taaki naye device par "Connect" ka
     prompt galti se na dikhe. */
  function ensureConnected() {
    if (!configured()) return Promise.resolve(false);
    var tok = readToken();
    if (tok && Date.now() < tok.expires_at) return Promise.resolve(true);
    // '0' matlab poochh chuke hain aur jawab na tha — dobara poochhna sirf
    // ek bekaar Edge Function call hai
    if (!tok && linkState() === '0') return Promise.resolve(false);
    return refresh().then(function (t) { return !!t; });
  }

  /* ---------- connection badle to sab widgets ko batao ----------
     Ek hi page par Spotify ke kai box hote hain (rail ka status row, music
     card, picker modal, dedication modal). Pehle inme koi taalmel nahi tha —
     ek jagah connect/disconnect karne par baaki box purani halat hi dikhate
     rehte the jab tak page reload na ho. */
  var _listeners = [];

  function onChange(cb) {
    if (typeof cb === 'function') _listeners.push(cb);
  }

  function emit() {
    var connected = hasConnection();
    _listeners.slice().forEach(function (cb) {
      try { cb(connected); } catch (e) {}
    });
  }

  /* ---------- connect (step 1: Spotify par bhejo) ---------- */

  function fail(msg) {
    if (window.LWApp && window.LWApp.toast) window.LWApp.toast('❌ ' + msg, 'error');
    else alert(msg);
    return Promise.resolve(false);
  }

  function connect(returnTo) {
    if (!configured()) {
      return fail('config.js me SPOTIFY_CLIENT_ID daalein — tabhi Spotify connect hoga.');
    }
    // PKCE ka code_challenge crypto.subtle se banta hai, jo sirf secure
    // context (https ya localhost) mein milta hai. Bina iske chup-chaap
    // exception aata tha aur button "kuch nahi karta" lagta tha.
    if (!window.isSecureContext || !window.crypto || !window.crypto.subtle) {
      return fail('Spotify connect ke liye site https par honi chahiye (ya localhost par).');
    }

    var problem = redirectProblem();
    if (problem) return fail(problem);

    var verifier = randomString(64);
    var state = randomString(16);
    // Jo redirect_uri authorize par bheja, token exchange par BILKUL wahi
    // bhejna padta hai. Beech mein URL badal jaaye (www. lag jaaye, ya
    // callback kisi aur host par khule) to Spotify "invalid_grant" de deta
    // hai — isliye use yaad rakhte hain, dobara bana kar nahi.
    var redir = redirectUri();
    lsSet(VERIFY_KEY, verifier);
    lsSet(STATE_KEY, state);
    lsSet(REDIR_KEY, redir);
    lsSet(RETURN_KEY, returnTo || (location.pathname.split('/').pop() || 'dashboard.html') + location.hash);

    return sha256(verifier).then(function (hash) {
      var url = AUTH_URL + '?' + new URLSearchParams({
        client_id: CLIENT_ID,
        response_type: 'code',
        redirect_uri: redir,
        code_challenge_method: 'S256',
        code_challenge: base64Url(hash),
        state: state,
        scope: SCOPES,
        // har baar account chunne ka mauka — ek hi device par do log alag-alag
        // Spotify jod sakein (warna Spotify chupchaap pichhle account se jod deta hai)
        show_dialog: 'true'
      }).toString();

      if (isNativeApp() && window.Capacitor.Plugins.Browser) {
        window.Capacitor.Plugins.Browser.open({ url: url });
      } else {
        window.location.href = url;
      }
      return true;
    });
  }

  /* ---------- connect (step 2: code ko token se badlo) ---------- */

  function exchangeCode(code, state) {
    var verifier = ls(VERIFY_KEY);
    var expected = ls(STATE_KEY);
    var usedRedirect = ls(REDIR_KEY) || redirectUri();
    lsDel(VERIFY_KEY); lsDel(STATE_KEY); lsDel(REDIR_KEY);

    if (!verifier) return Promise.reject(new Error('Connect request purani ho gayi — dobara try karein.'));
    if (expected && state && expected !== state) return Promise.reject(new Error('State match nahi hui — dobara try karein.'));

    return fetch(TOKEN_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'authorization_code',
        code: code,
        redirect_uri: usedRedirect,
        client_id: CLIENT_ID,
        code_verifier: verifier
      }).toString()
    }).then(function (r) {
      return r.json().then(function (j) {
        if (!r.ok) {
          var msg = j.error_description || j.error || ('HTTP ' + r.status);
          // sabse aam wajah — Spotify dashboard mein URI register nahi hai
          if (/redirect|invalid_grant/i.test(msg)) {
            msg += '\n\nSpotify Dashboard > apni app > Settings > Redirect URIs mein ' +
                   'BILKUL ye line honi chahiye:\n' + usedRedirect;
          }
          throw new Error(msg);
        }
        // refresh_token seedha server ko de do, browser me sirf access token
        // cache hota hai
        return saveRefreshToken(j.refresh_token).then(function () {
          return writeToken(j);
        });
      });
    });
  }

  /* ---------- token refresh ---------- */

  var _refreshing = null;

  // Naya access token Edge Function se aata hai, Spotify se seedha nahi.
  // Function user ke Supabase JWT se pehchanta hai ki refresh_token kiska
  // uthana hai, isliye browser ko refresh_token dekhne ki zarurat hi nahi
  // padti — aur kisi aur ka token maang bhi nahi sakta.
  function refresh() {
    if (_refreshing) return _refreshing;   // parallel calls ek hi refresh ka intezaar karein
    if (!CFG.SUPABASE_URL || !window.LW || !window.LW.getSession) {
      return Promise.resolve(null);
    }

    _refreshing = window.LW.getSession().then(function (s) {
      if (!s || !s.access_token) return null;   // Loveway me login hi nahi hai
      return fetch(CFG.SUPABASE_URL + '/functions/v1/spotify-token', {
        method: 'POST',
        headers: {
          Authorization: 'Bearer ' + s.access_token,
          apikey: CFG.SUPABASE_ANON_KEY,
          'Content-Type': 'application/json'
        }
      }).then(function (r) {
        return r.json().catch(function () { return {}; }).then(function (j) {
          if (r.ok && j.access_token) return writeToken(j);   // linked='1' wahin set hota hai
          // Server ke paas refresh_token hai hi nahi, ya Spotify ne use thukra
          // diya (user ne apne Spotify se access hata diya). Dono soorat me
          // aage koi fayda nahi — connection saaf kar do taaki UI wapas
          // "Connect" dikhaye, warna user chakkar kaatta rahega.
          markUnlinked();
          return null;
        });
      });
    }).catch(function () {
      return null;   // network problem — purana token rehne do, agli baar phir try hoga
    }).then(function (out) {
      _refreshing = null;
      return out;
    });

    return _refreshing;
  }

  // hamesha ek chalne layak access token dega — expire hone par khud refresh karke
  function accessToken() {
    var tok = readToken();
    if (tok && Date.now() < tok.expires_at) return Promise.resolve(tok.access_token);
    /* Local token ka na hona "connect nahi hai" ka matlab NAHI hai — asli
       connection server par refresh_token ke roop me padi hai. Pehle yahan se
       seedha null laut jaata tha jab localStorage khaali ho, isliye har naye
       browser/device par user ko dobara poora OAuth karna padta tha. Ab wahi
       ek refresh call yahan bhi lag jaati hai. */
    if (!tok && linkState() === '0') return Promise.resolve(null);
    return refresh().then(function (t) { return t ? t.access_token : null; });
  }

  /* ---------- API call ----------
     Return shape wahi purana hai — { data } ya { error } — taaki
     pehle se likha saara code (lw-app.js, lw-rails.js, settings.html)
     bina badle chalta rahe. */

  function api(path, opts) {
    opts = opts || {};
    return accessToken().then(function (tok) {
      if (!tok) return legacyApi(path, opts);   // purana Supabase-provider wala raasta
      return call(path, opts, tok).then(function (res) {
        // 401 = token beech mein hi invalid ho gaya; ek baar refresh karke dobara
        if (res && res.status === 401) {
          return refresh().then(function (t) {
            if (!t) { return { error: 'no-token' }; }
            return call(path, opts, t.access_token);
          });
        }
        return res;
      });
    });
  }

  function sleep(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }

  /* Spotify 429 par Retry-After header bhejta hai, aur uska kehna maanna
     zaroori hai — turant dobara maarne se rate limit lamba ho jaata hai.
     `attempt` sirf andar se badhta hai; bina Retry-After wale case me
     exponential backoff (1s, 2s, 4s) lagta hai. 3 koshish ke baad haar
     maan kar error lauta dete hain, taaki koi tight loop na bane. */
  var MAX_RETRIES = 3;

  function call(path, opts, tok, attempt) {
    attempt = attempt || 0;
    var headers = { Authorization: 'Bearer ' + tok };
    if (opts.body) headers['Content-Type'] = 'application/json';
    return fetch(API_BASE + path, {
      method: opts.method || 'GET',
      headers: headers,
      body: opts.body ? JSON.stringify(opts.body) : undefined
    }).then(function (r) {
      if (r.status === 429 && attempt < MAX_RETRIES) {
        var ra = parseInt(r.headers.get('Retry-After') || '', 10);
        var waitMs = (isNaN(ra) ? Math.pow(2, attempt) : Math.min(ra, 60)) * 1000;
        return sleep(waitMs).then(function () {
          return call(path, opts, tok, attempt + 1);
        });
      }
      if (r.status === 204) return { data: {} };            // PUT/DELETE ka khaali jawab
      if (!r.ok) {
        return r.json().catch(function () { return {}; }).then(function (j) {
          // Spotify apne jawab me asli wajah bhejta hai — usi ko aage bhejte
          // hain, "HTTP 400" jaisa bekaar message dikhane ke bajaye.
          var msg = (j && j.error && (j.error.message || j.error)) || null;

          // 403 matlab token to theek hai, par Spotify ne is account ko hi
          // allow nahi kiya — app "Development mode" me ho to sirf allowlist
          // wale accounts chalte hain. Ise alag code dete hain taaki UI
          // "dobara connect karo" ke bajaye asli wajah bata sake; reconnect
          // se ye kabhi theek hota hi nahi.
          if (r.status === 403) return { error: 'forbidden', status: 403, detail: msg };
          if (r.status === 429) return { error: 'rate-limited', status: 429, detail: msg };
          return { error: msg || ('HTTP ' + r.status), status: r.status };
        });
      }
      return r.json().then(function (j) { return { data: j }; });
    }).catch(function (e) {
      return { error: e.message || 'network error' };
    });
  }

  // Jinhone purane tarike se (Supabase ke Spotify login se) sign-in kiya
  // hai unka session abhi bhi kaam kare — nayi connection na hone par
  // wahi provider_token try kar lo.
  function legacyApi(path, opts) {
    if (!window.LW || !window.LW.getSession) return Promise.resolve({ error: 'no-token' });
    return window.LW.getSession().then(function (s) {
      var tok = s && s.provider_token;
      if (!tok) return { error: 'no-token' };
      return call(path, opts || {}, tok);
    });
  }

  function disconnect() {
    var was = hasConnection();
    clearToken();
    setLinked(false);          // server ki row bhi abhi neeche hat rahi hai
    lsDel(VERIFY_KEY); lsDel(STATE_KEY); lsDel(RETURN_KEY); lsDel(REDIR_KEY);
    if (was) emit();
    // Server par pada refresh_token bhi hatana zaroori hai — warna "disconnect"
    // dabane ke baad bhi wo mahino tak is account ka Spotify khol sakta hai.
    var sb = window.LW && window.LW.sb;
    if (!sb || !sb.rpc) return Promise.resolve();
    return sb.rpc('lw_forget_spotify').catch(function () {});
  }

  /* ---------- feature helpers (user ke apne account se) ---------- */

  function me() { return api('/me'); }

  function search(q, types, limit) {
    return api('/search?type=' + (types || 'track') +
      '&limit=' + (limit || 20) + '&q=' + encodeURIComponent(q));
  }

  function myPlaylists(limit) { return api('/me/playlists?limit=' + (limit || 50)); }

  // /playlists/{id}/tracks Spotify ke spec me deprecated hai; /items uska
  // replacement hai (query params wahi hain, response shape bhi wahi)
  function playlistTracks(id, limit) {
    return api('/playlists/' + encodeURIComponent(id) + '/items?limit=' + (limit || 50));
  }

  function likedTracks(limit) { return api('/me/tracks?limit=' + (limit || 50)); }
  function topTracks(limit) { return api('/me/top/tracks?limit=' + (limit || 20) + '&time_range=short_term'); }
  function recentlyPlayed(limit) { return api('/me/player/recently-played?limit=' + (limit || 20)); }

  /* ---------- "Spotify juda nahi hai" ka EK hi prompt ----------
     Pehle ye box CHHE jagah alag-alag likha tha: lw-app.js ka picker modal,
     lw-rails.js me teen jagah (search error, status row, Liked/Top/Recent),
     messages.html ka dedication modal, aur Settings. Har jagah alag wording
     aur alag button — ek jagah sudhaarne par baaki paanch waise hi reh jaate
     the. Ab sab yahin se aata hai.

     Do raaste jaan-boojh kar dete hain:
       • "Connect karo" — wahin se PKCE flow. User jis page par tha wahin
                          wapas aa jaata hai (RETURN_KEY), isliye jo kaam
                          chal raha tha wo beech me nahi tootta.
       • "Settings"     — connection ka asli ghar: kis naam se juda hai,
                          redirect URI ki madad, aur Disconnect. */
  function gateHtml(opts) {
    opts = opts || {};
    var esc = (window.LW && window.LW.escapeHtml)
      ? window.LW.escapeHtml
      : function (x) { return String(x == null ? '' : x); };
    var sm = opts.size === 'sm';
    var reason = opts.reason || 'no-token';
    var msg, showConnect = true;

    if (!configured()) {
      // client id hi nahi hai — button dabane par kabhi kuch nahi hoga
      msg = 'Spotify ka setup abhi baaki hai (config.js me SPOTIFY_CLIENT_ID).';
      showConnect = false;
    } else if (reason === 'forbidden') {
      // Spotify app "Development mode" me hai — allowlist ke bahar wale
      // account ko Spotify khud 403 deta hai. Reconnect se ye kabhi theek
      // nahi hota, isliye button dikhana sirf chakkar katwana hai.
      msg = (window.t ? window.t('devModeHint')
                      : 'Spotify ne is account ko abhi allow nahi kiya (app development mode me hai).');
      showConnect = false;
    } else if (reason === 'rate-limited') {
      msg = 'Spotify ne thodi der ke liye rok diya hai (bahut zyada requests ek saath). ' +
            'Ek-do minute baad dobara try karo.';
      showConnect = false;
    } else if (reason === 'no-token') {
      msg = 'Apna Spotify ek baar jod do — phir search, playlists, liked songs ' +
            'aur Music of the Day sab yahin chalenge.';
    } else {
      msg = 'Spotify se baat nahi ho paayi — ek baar dobara connect karke dekho.';
    }

    return '<div class="empty"><span class="ic">🎧</span>' + esc(msg) +
      (showConnect
        ? '<br><br><button type="button" class="btn ' + (sm ? 'sm ' : '') + 'primary" ' +
          'onclick="LW.spotifyConnect()">🎵 Connect karo</button>'
        : '') +
      '<div class="muted" style="margin-top:10px;font-size:.78rem">' +
        '<a href="' + esc(pageUrl('settings.html')) + '#account">Settings</a>' +
        ' me poora status aur Disconnect milega.' +
        (opts.note ? '<br>' + esc(opts.note) : '') +
      '</div></div>';
  }

  /* ---------- Spotify ke raw track object ko Loveway ke shape mein ---------- */
  function normTrack(t) {
    if (!t) return null;
    return {
      id: t.id,
      title: t.name || '',
      artist: (t.artists || []).map(function (a) { return a.name; }).join(', '),
      url: (t.external_urls && t.external_urls.spotify) || (t.id ? 'https://open.spotify.com/track/' + t.id : ''),
      image: (t.album && t.album.images && t.album.images.length
        ? t.album.images[t.album.images.length - 1].url : null)
    };
  }

  window.LWSpotify = {
    configured: configured,
    isConnected: hasConnection,          // turant, andaza — pehli paint ke liye
    ensureConnected: ensureConnected,    // pakka, zarurat par server se
    onChange: onChange,                  // connect/disconnect par UI refresh
    gateHtml: gateHtml,                  // "juda nahi hai" ka EK hi prompt
    redirectUri: redirectUri, redirectProblem: redirectProblem,
    connect: connect, disconnect: disconnect, exchangeCode: exchangeCode,
    accessToken: accessToken, api: api, normTrack: normTrack,
    me: me, search: search, myPlaylists: myPlaylists, playlistTracks: playlistTracks,
    likedTracks: likedTracks, topTracks: topTracks, recentlyPlayed: recentlyPlayed,
    returnTarget: function () { var r = ls(RETURN_KEY); lsDel(RETURN_KEY); return r || 'dashboard.html'; }
  };

  /* ---------- purane API ko naye raaste par mod do ----------
     lw-app.js / lw-rails.js / settings.html sab `LW.spotifyApi()` aur
     `LW.spotify()` hi call karte hain — inhe yahin replace kar dene se
     un sab files ka Spotify ab apne-aap user ke apne account se chalta
     hai, wahan ek line badle bina. */
  if (window.LW) {
    window.LW.spotifyApi = api;
    window.LW.spotifyToken = accessToken;

    /* LOGIN aur CONNECT do alag cheezein hain — inhe alag hi rehna chahiye:
         LW.spotify()        = "Spotify se login/sign up" (login.html,
                               signup.html) — Supabase ka OAuth provider,
                               jo Loveway ka account banata/kholta hai.
                               Iska redirect Supabase par jaata hai.
         LW.spotifyConnect() = "apna Spotify jodo" (Settings, music widget)
                               — PKCE flow, Loveway ke login ko chhue bina.
                               Iska redirect spotify-callback.html par.

       Pehle yahan LW.spotify ko hi override kar diya gaya tha, isliye
       login page ka "Spotify se login" button login karne ki jagah
       connect chalane lagta tha — aur spotify-callback.html par bhejta
       tha, jo Spotify Dashboard me register nahi hota. Wahi
       "redirect_uri: Not matching configuration" wali dikkat thi. */
    window.LW.spotifyConnect = function (e) {
      if (e && e.preventDefault) e.preventDefault();
      if (configured()) return connect();
      // client id set nahi hai to purana provider_token wala raasta
      return window.LW.oauth ? window.LW.oauth('spotify') : Promise.resolve();
    };
    window.LW.spotifyDisconnect = disconnect;
    window.LW.spotifyConnected = hasConnection;
  }

  /* ---------- Android app: custom scheme se wapas aana ---------- */
  if (isNativeApp() && window.Capacitor.Plugins.App) {
    window.Capacitor.Plugins.App.addListener('appUrlOpen', function (data) {
      var url = (data && data.url) || '';
      if (url.indexOf(NATIVE_REDIRECT) !== 0) return;
      if (window.Capacitor.Plugins.Browser) {
        try { window.Capacitor.Plugins.Browser.close(); } catch (e) {}
      }
      // Android ka URI parsing NATIVE_REDIRECT (jisme koi path nahi hai) ke
      // baad ek implicit "/" daal deta hai jab query/fragment ho — seedha
      // prefix-length se slice karne par "spotify-callback.html/?code=..."
      // ban jaata tha (extra "/" ke saath), jo ek invalid path hai aur
      // "Web page not available" deta tha. Ab seedha ?/# dhoondh kar wahi
      // le rahe hain, beech ka stray "/" (ya kuch bhi) ignore karke.
      var rest = url.slice(NATIVE_REDIRECT.length);
      var qIdx = rest.search(/[?#]/);
      var suffix = qIdx === -1 ? '' : rest.slice(qIdx);
      window.location.href = pageUrl('spotify-callback.html') + suffix;
    });
  }
})();
