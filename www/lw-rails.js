/* ============================================================
   Loveway — shared side-rail widgets
   ------------------------------------------------------------
   Nearby couple-spots (OpenStreetMap Overpass, no API key),
   curated song suggestions (Spotify embed play, no API key),
   and upcoming festivals + birthdays.
   Used by dashboard.html, messages.html, and other app pages
   with the .side-rail markup + lw-rails.css.
   ============================================================ */

/* ---------- Left rail: nearby couple-spots ---------- */
/* img = representative category photo (Unsplash, free-to-use) — Overpass doesn't give per-venue
   photos, so one stock image per category is shown instead of the exact venue's real photo. */
var SPOT_CATS = [
  { key: 'amenity', val: 'cafe', ic: '☕', label: 'Cafes', img: 'https://images.unsplash.com/photo-1752756992329-961db6366376?w=400&h=300&fit=crop&q=70&auto=format' },
  { key: 'amenity', val: 'restaurant', ic: '🍽️', label: 'Best Restaurants', img: 'https://images.unsplash.com/photo-1646473315764-c6cd47fe74c3?w=400&h=300&fit=crop&q=70&auto=format' },
  { key: 'leisure', val: 'park', ic: '🌳', label: 'Parks', img: 'https://images.unsplash.com/photo-1766050589989-41a592b3f123?w=400&h=300&fit=crop&q=70&auto=format' },
  { key: 'tourism', val: 'viewpoint', ic: '🌅', label: 'Viewpoints', img: 'https://images.unsplash.com/photo-1684690640456-381bc7183e86?w=400&h=300&fit=crop&q=70&auto=format' },
  { key: 'amenity', val: 'cinema', ic: '🎬', label: 'Theatres', img: 'https://images.unsplash.com/photo-1631702825172-a9a848c473ad?w=400&h=300&fit=crop&q=70&auto=format' },
  { key: 'tourism', val: 'attraction', ic: '✨', label: 'Attractions', img: 'https://images.unsplash.com/photo-1545562083-c583d014b4f2?w=400&h=300&fit=crop&q=70&auto=format' }
];
var SPOT_FALLBACK_IMG = SPOT_CATS[0].img;
function spotSlide(btn, dir) {
  var slider = btn.parentElement.querySelector('.spot-slider');
  if (!slider) return;
  var card = slider.querySelector('.spot-card');
  var step = (card ? card.offsetWidth + 12 : 200) * 2;
  slider.scrollBy({ left: dir * step, behavior: 'smooth' });
}
function haversineKm(lat1, lon1, lat2, lon2) {
  var R = 6371, dLat = (lat2 - lat1) * Math.PI / 180, dLon = (lon2 - lon1) * Math.PI / 180;
  var a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLon / 2) * Math.sin(dLon / 2);
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}
function setAllHtml(cls, html) {
  document.querySelectorAll('.' + cls).forEach(function (el) { el.innerHTML = html; });
}
function loadNearbySpots() {
  if (!document.querySelector('.spots-body')) return;
  if (!navigator.geolocation) { setAllHtml('spots-body', '<div class="muted" style="font-size:.8rem">Location supported nahi hai.</div>'); return; }
  setAllHtml('spots-body', '<div class="muted" style="font-size:.8rem">Location dhoonda ja raha hai…</div>');
  navigator.geolocation.getCurrentPosition(function (pos) {
    var lat = pos.coords.latitude, lng = pos.coords.longitude;
    setAllHtml('spots-body', '<div class="muted" style="font-size:.8rem">Best spots dhoonde ja rahe hain…</div>');
    var filters = SPOT_CATS.map(function (c) {
      return 'node[' + c.key + '=' + c.val + '](around:3000,' + lat + ',' + lng + ');';
    }).join('');
    var query = '[out:json][timeout:15];(' + filters + ');out center 30;';
    fetch('https://overpass-api.de/api/interpreter', { method: 'POST', body: query })
      .then(function (r) { return r.json(); })
      .then(function (data) {
        var els = (data.elements || []).filter(function (e) { return e.tags && e.tags.name && e.lat != null; });
        els.forEach(function (e) {
          e._dist = haversineKm(lat, lng, e.lat, e.lon);
          e._cat = SPOT_CATS.filter(function (c) { return e.tags[c.key] === c.val; })[0];
        });
        if (!els.length) { setAllHtml('spots-body', '<div class="muted" style="font-size:.8rem">Aas-paas koi spot nahi mila.</div>'); return; }

        function spotCardHtml(e) {
          var mapUrl = 'https://www.openstreetmap.org/?mlat=' + e.lat + '&mlon=' + e.lon + '#map=17/' + e.lat + '/' + e.lon;
          return '<a class="spot-card" href="' + mapUrl + '" target="_blank" rel="noopener">' +
            '<div class="spot-card-img-wrap"><img src="' + (e._cat ? e._cat.img : SPOT_FALLBACK_IMG) + '" alt="" loading="lazy">' +
            '<span class="ic">' + (e._cat ? e._cat.ic : '📍') + '</span></div>' +
            '<b>' + LWApp.esc(e.tags.name) + '</b>' +
            '<small>' + e._dist.toFixed(1) + ' km</small></a>';
        }

        // category ke hisaab se alag-alag section (Parks, Restaurants, Theatres, etc.)
        var groupsHtml = SPOT_CATS.map(function (c) {
          var group = els.filter(function (e) { return e._cat === c; })
            .sort(function (a, b) { return a._dist - b._dist; })
            .slice(0, 8);
          if (!group.length) return '';
          return '<div class="spot-cat-group">' +
            '<div class="spot-cat-head">' + c.ic + ' ' + c.label + '</div>' +
            '<div class="spot-slider-wrap">' +
              '<button type="button" class="spot-nav prev" onclick="spotSlide(this,-1)" aria-label="Previous">‹</button>' +
              '<div class="spot-slider">' + group.map(spotCardHtml).join('') + '</div>' +
              '<button type="button" class="spot-nav next" onclick="spotSlide(this,1)" aria-label="Next">›</button>' +
            '</div>' +
          '</div>';
        }).join('');
        setAllHtml('spots-body', groupsHtml || '<div class="muted" style="font-size:.8rem">Aas-paas koi spot nahi mila.</div>');
      })
      .catch(function () {
        setAllHtml('spots-body', '<div class="muted" style="font-size:.8rem">Spots load nahi ho paaye, thodi der baad try karo.</div>');
      });
  }, function () {
    setAllHtml('spots-body', '<div class="muted" style="font-size:.8rem">Location permission nahi mili.</div>' +
      '<button class="btn sm" style="margin-top:8px;width:100%" onclick="loadNearbySpots()">🔄 Retry</button>');
  });
}

/* --- Right rail: curated song suggestions (Spotify embed play, no API key) ---------- */
var SONG_POOL = [
  { t: 'Tum Hi Ho', a: 'Arijit Singh', id: '56zZ48jdyY2oDXHVnwg5Di' },
  { t: 'Raabta', a: 'Arijit Singh, Nikhita Gandhi', id: '1LvOpTDkOfMZEqkr2fUgrz' },
  { t: 'Perfect', a: 'Ed Sheeran', id: '5Pyr83QZJFvSWqDxEFsn7W' },
  { t: 'Tera Ban Jaunga', a: 'Akhil Sachdeva, Tulsi Kumar', id: '4OcvkkpF3xmyCGGY5IBlgi' },
  { t: 'Kesariya', a: 'Arijit Singh', id: '6A533N93v1YHtyVISPQ0GD' },
  { t: 'Photograph', a: 'Ed Sheeran', id: '1HNkqx9Ahdgi1Ixy2xkKkL' },
  { t: 'Tum Se Hi', a: 'Mohit Chauhan', id: '1vl5fcbBBvnhNNIxUoHfnJ' },
  { t: 'Shayad', a: 'Arijit Singh, Pritam', id: '3WXvr6rwl4I8U3ancJ08Yy' },
  { t: 'Channa Mereya', a: 'Arijit Singh', id: '2T0ELWNY5rSwLTvAGu2e7F' },
  { t: 'All of Me', a: 'John Legend', id: '1fxxfVnsg0dsbfsiRARzf6' },
  { t: 'Thinking Out Loud', a: 'Ed Sheeran', id: '2B9rp5zGDCZtOR3f7HnVe8' },
  { t: 'Tum Mile', a: 'Neeraj Shridhar, Pritam', id: '7wrV3DQ3HMyxgoQbxS6MfA' },
  { t: 'Jeene Laga Hoon', a: 'Atif Aslam, Shreya Ghoshal', id: '3t3wsY5IdLVzB9WidegJSU' }
];
var currentSongSet = [];
function pickRandomSongs(n) {
  var pool = SONG_POOL.slice();
  var out = [];
  while (out.length < n && pool.length) {
    var i = Math.floor(Math.random() * pool.length);
    out.push(pool.splice(i, 1)[0]);
  }
  return out;
}
function renderSongSuggestions() {
  if (!document.querySelector('.song-sugg-body')) return;
  currentSongSet = pickRandomSongs(6);
  var html = currentSongSet.map(function (s, i) {
    return '<div class="song-sugg-wrap">' +
      '<div class="song-sugg-item" style="animation-delay:' + (i * 0.06) + 's">' +
        '<span class="ic">🎵</span>' +
        '<div style="min-width:0;flex:1"><b style="display:block;font-size:.82rem">' + LWApp.esc(s.t) + '</b>' +
        '<small style="color:var(--muted);font-size:.72rem">' + LWApp.esc(s.a) + '</small></div>' +
        '<button type="button" class="icon-btn" onclick="playSongFromList(this,' + i + ')" title="Play">▶</button>' +
        '<button type="button" class="icon-btn" onclick="copySong(' + i + ')" title="Copy">📋</button>' +
      '</div>' +
    '</div>';
  }).join('');
  setAllHtml('song-sugg-body', html);
  highlightPlayingSong();
}
// list mein jo song abhi mini-player mein baj raha hai usko highlight karta hai —
// header ke prev/next se song badle ya list ke ▶ se, dono jagah se sahi sync rahe
function highlightPlayingSong() {
  var playingId = currentTrack ? currentTrack.id : null;
  document.querySelectorAll('.song-sugg-body').forEach(function (body) {
    body.querySelectorAll('.song-sugg-wrap').forEach(function (wrap, i) {
      var s = currentSongSet[i];
      wrap.classList.toggle('playing', !!(s && playingId && s.id === playingId));
    });
  });
}
// list ke ▶ ko header/sheet ke SHARED mini-player se link karta hai —
// har item ka apna alag (chhota, broken-looking) embed banane ke bajaye
function playSongFromList(btn, i) {
  var s = currentSongSet[i];
  if (!s) return;
  var poolIdx = -1;
  for (var p = 0; p < SONG_POOL.length; p++) { if (SONG_POOL[p].id === s.id) { poolIdx = p; break; } }
  if (poolIdx >= 0) mpIndex = poolIdx;
  currentTrack = s;
  updateMiniPlayerName();
  whenPlayerReady(function () { mpController.loadUri('spotify:track:' + s.id); mpController.play(); });
}

// open.spotify.com/track/<id> jaisa URL se sirf id nikaalo
function extractSpotifyId(url) {
  var m = /open\.spotify\.com\/track\/([a-zA-Z0-9]+)/.exec(url || '');
  return m ? m[1] : null;
}

// apni marzi ka koi bhi gaana khojo aur seedha mini-player mein bajao —
// fixed SONG_POOL tak seemित nahi, LWApp ka reusable Spotify search picker use karta hai
function searchAndPlaySong() {
  LWApp.openSpotifyPicker(function (track) {
    var id = extractSpotifyId(track.url);
    if (!id) { LWApp.toast('❌ Ye gaana bina Spotify link ke play nahi ho sakta', 'error'); return; }
    mpIndex = -1;   // ab suggestion pool ke bahar ka gaana chal raha hai
    currentTrack = { t: track.title, a: track.artist, id: id };
    updateMiniPlayerName();
    whenPlayerReady(function () { mpController.loadUri('spotify:track:' + id); mpController.play(); });
  });
}
function copySong(i) {
  var s = currentSongSet[i];
  if (!s) return;
  var text = s.t + ' — ' + s.a;
  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(text)
      .then(function () { LWApp.toast('📋 Copy ho gaya!'); })
      .catch(function () { LWApp.toast('❌ Copy nahi ho paaya', 'error'); });
  } else {
    LWApp.toast('❌ Copy is browser mein supported nahi hai', 'error');
  }
}

/* ============================================================
   Right rail music card — search + favorites + playlists, sab
   isi ek card mein (dashboard/messages side-rail + mobile
   rail-sheet, .music-rail-card class se dono jagah render hota
   hai). Shared mini-player (mpController) se hi bajta hai — har
   row ka apna alag embed nahi banate.
   ============================================================ */
var favTrackIds = {};   // { spotifyTrackId: true } — heart icon turant sahi dikhane ke liye cache

function musicTrackNorm(track) {
  var id = track.id || track.spotify_track_id;
  return {
    id: id,
    title: track.t || track.title || track.song_title || '',
    artist: track.a || track.artist || track.song_artist || '',
    url: track.url || track.song_url || (id ? 'https://open.spotify.com/track/' + id : '')
  };
}

function musicRowHtml(track, mode, playlistId) {
  var t = musicTrackNorm(track);
  var attr = JSON.stringify(t).replace(/"/g, '&quot;');
  var isFav = !!favTrackIds[t.id];
  var extraBtn = (mode === 'playlist')
    ? '<button type="button" class="icon-btn" onclick="removeFromPlaylistUI(this,' + playlistId + ',' + attr + ')" title="Hatao">✕</button>'
    : '<button type="button" class="icon-btn" onclick="openAddToPlaylistPicker(this,' + attr + ')" title="Playlist mein daalo">➕</button>';
  return '<div class="song-sugg-wrap"><div class="song-sugg-item">' +
    '<span class="ic">🎵</span><div style="min-width:0;flex:1"><b style="display:block;font-size:.82rem">' + LWApp.esc(t.title) + '</b>' +
    '<small style="color:var(--muted);font-size:.72rem">' + LWApp.esc(t.artist) + '</small></div>' +
    '<button type="button" class="icon-btn" onclick="playMusicTrack(' + attr + ')" title="Play">▶</button>' +
    '<button type="button" class="icon-btn" onclick="toggleFavoriteTrack(this,' + attr + ')" title="Favorite">' + (isFav ? '❤️' : '🤍') + '</button>' +
    extraBtn + '</div></div>';
}

// kisi bhi source (suggestion/search/favorite/playlist) se gaana shared mini-player mein bajao
function playMusicTrack(track) {
  var t = musicTrackNorm(track);
  if (!t.id) { LWApp.toast('❌ Ye gaana bina Spotify link ke play nahi ho sakta', 'error'); return; }
  mpIndex = -1;
  currentTrack = { t: t.title, a: t.artist, id: t.id };
  updateMiniPlayerName();
  whenPlayerReady(function () { mpController.loadUri('spotify:track:' + t.id); mpController.play(); });
}

async function toggleFavoriteTrack(btn, track) {
  var t = musicTrackNorm(track);
  var wasFav = !!favTrackIds[t.id];
  btn.disabled = true;
  try {
    if (wasFav) { await LWApp.unfavoriteSong(t.id); delete favTrackIds[t.id]; }
    else { await LWApp.favoriteSong(t); favTrackIds[t.id] = true; }
    document.querySelectorAll('.music-rail-card .icon-btn[onclick*="' + t.id + '"]').forEach(function (b) {
      if (/toggleFavoriteTrack/.test(b.getAttribute('onclick') || '')) b.textContent = wasFav ? '🤍' : '❤️';
    });
    if (wasFav) LWApp.toast('Favorites se hata diya');
    else LWApp.toast('❤️ Favorites mein add ho gaya');
    if (document.querySelector('.music-fav-body')) renderMusicFavorites();
  } catch (e) {
    LWApp.toast('❌ ' + LWApp.err(e), 'error');
  }
  btn.disabled = false;
}

async function refreshFavIds() {
  favTrackIds = {};
  try {
    var favs = await LWApp.myFavorites();
    favs.forEach(function (f) { favTrackIds[f.spotify_track_id] = true; });
  } catch (e) {}
}

async function renderMusicFavorites() {
  var body = document.querySelector('.music-fav-body');
  if (!body) return;
  body.innerHTML = '<div class="spinner">Load ho raha hai…</div>';
  try {
    var favs = await LWApp.myFavorites();
    document.querySelectorAll('.music-fav-body').forEach(function (b) {
      b.innerHTML = favs.length
        ? favs.map(function (f) { return musicRowHtml(f, 'fav'); }).join('')
        : '<div class="muted" style="font-size:.8rem">Abhi koi favorite gaana nahi hai — kisi bhi gaane par ❤️ dabao.</div>';
    });
  } catch (e) {
    document.querySelectorAll('.music-fav-body').forEach(function (b) {
      b.innerHTML = '<div class="muted" style="font-size:.8rem">Load nahi ho paaya.</div>';
    });
  }
}

function plSlide(btn, dir) {
  var slider = btn.parentElement.querySelector('.playlist-slider');
  if (!slider) return;
  var card = slider.querySelector('.playlist-card');
  var step = (card ? card.offsetWidth + 10 : 130) * 2;
  slider.scrollBy({ left: dir * step, behavior: 'smooth' });
}

async function renderMusicPlaylists() {
  var body = document.querySelector('.music-pl-body');
  if (!body) return;
  body.innerHTML = '<div class="spinner">Load ho raha hai…</div>';
  try {
    var lists = await LWApp.myPlaylists();
    var cardsHtml = lists.map(function (p) {
      return '<div class="playlist-card" onclick="openPlaylistTracks(' + p.id + ',this)">' +
        '<span class="ic">📋</span><b>' + LWApp.esc(p.name) + '</b>' +
        '<button type="button" class="icon-btn" onclick="event.stopPropagation();deletePlaylistUI(this,' + p.id + ')" title="Delete">🗑</button></div>';
    }).join('') + '<div class="playlist-card new" onclick="promptNewPlaylist()"><span class="ic">➕</span><b>Nayi Playlist</b></div>';
    var html = '<div class="spot-slider-wrap">' +
      '<button type="button" class="spot-nav prev" onclick="plSlide(this,-1)" aria-label="Previous">‹</button>' +
      '<div class="playlist-slider">' + cardsHtml + '</div>' +
      '<button type="button" class="spot-nav next" onclick="plSlide(this,1)" aria-label="Next">›</button>' +
      '</div>' +
      '<div class="playlist-tracks-body"></div>';
    document.querySelectorAll('.music-pl-body').forEach(function (b) { b.innerHTML = html; });
  } catch (e) {
    document.querySelectorAll('.music-pl-body').forEach(function (b) {
      b.innerHTML = '<div class="muted" style="font-size:.8rem">Load nahi ho paaya.</div>';
    });
  }
}

async function openPlaylistTracks(playlistId, cardEl) {
  var body = cardEl.closest('.music-pl-body').querySelector('.playlist-tracks-body');
  body.innerHTML = '<div class="spinner">Load ho raha hai…</div>';
  try {
    var tracks = await LWApp.playlistTracks(playlistId);
    body.innerHTML = tracks.length
      ? tracks.map(function (t) { return musicRowHtml(t, 'playlist', playlistId); }).join('')
      : '<div class="muted" style="font-size:.8rem">Is playlist mein abhi koi gaana nahi hai — kisi gaane par ➕ dabao.</div>';
  } catch (e) {
    body.innerHTML = '<div class="muted" style="font-size:.8rem">Load nahi ho paaya.</div>';
  }
}

async function removeFromPlaylistUI(btn, playlistId, track) {
  var t = musicTrackNorm(track);
  btn.disabled = true;
  try {
    await LWApp.removeFromPlaylist(playlistId, t.id);
    btn.closest('.song-sugg-wrap').remove();
  } catch (e) {
    LWApp.toast('❌ ' + LWApp.err(e), 'error');
    btn.disabled = false;
  }
}

async function deletePlaylistUI(btn, playlistId) {
  if (!confirm('Ye playlist delete karni hai?')) return;
  btn.disabled = true;
  try {
    await LWApp.deletePlaylist(playlistId);
    LWApp.toast('🗑 Playlist delete ho gayi');
    renderMusicPlaylists();
  } catch (e) {
    LWApp.toast('❌ ' + LWApp.err(e), 'error');
    btn.disabled = false;
  }
}

/* ---------- "Playlist mein daalo" mini-popup ---------- */
async function openAddToPlaylistPicker(btn, track) {
  document.querySelectorAll('.picker-pop.pl-add-pop').forEach(function (p) { p.remove(); });
  var t = musicTrackNorm(track);
  var pop = document.createElement('div');
  pop.className = 'picker-pop open pl-add-pop';
  pop.style.position = 'absolute';
  pop.innerHTML = '<div class="spinner">Load ho raha hai…</div>';
  btn.parentElement.style.position = 'relative';
  btn.parentElement.appendChild(pop);
  var closeIt = function (e) {
    if (e && pop.contains(e.target)) return;
    pop.remove();
    document.removeEventListener('click', closeIt);
  };
  setTimeout(function () { document.addEventListener('click', closeIt); }, 0);

  try {
    var lists = await LWApp.myPlaylists();
    var attr = JSON.stringify(t).replace(/"/g, '&quot;');
    pop.innerHTML = (lists.length
      ? lists.map(function (p) {
          return '<div class="picker-item" onclick="addToPlaylistUI(' + p.id + ',' + attr + ',this)">' + LWApp.esc(p.name) + '</div>';
        }).join('')
      : '<div class="picker-item disabled">Koi playlist nahi hai</div>') +
      '<div class="picker-item" onclick="promptNewPlaylist(' + attr + ')">➕ Nayi playlist</div>';
  } catch (e) {
    pop.innerHTML = '<div class="picker-item disabled">Load nahi ho paaya</div>';
  }
}

async function addToPlaylistUI(playlistId, track, itemEl) {
  var t = musicTrackNorm(track);
  try {
    await LWApp.addToPlaylist(playlistId, t);
    LWApp.toast('✅ Playlist mein add ho gaya');
    if (itemEl) itemEl.closest('.picker-pop').remove();
    if (document.querySelector('.playlist-tracks-body')) renderMusicPlaylists();
  } catch (e) {
    LWApp.toast('❌ ' + LWApp.err(e), 'error');
  }
}

/* ---------- naya playlist banane ka chhota modal ---------- */
var _newPlaylistPendingTrack = null;
function ensureNewPlaylistModal() {
  if (document.getElementById('lwNewPlaylistModal')) return;
  var modal = document.createElement('div');
  modal.className = 'modal-bg';
  modal.id = 'lwNewPlaylistModal';
  modal.innerHTML =
    '<div class="modal">' +
      '<h3>📋 Nayi playlist</h3>' +
      '<input type="text" id="lwNewPlaylistName" placeholder="Playlist ka naam" style="margin-top:10px" autocomplete="off">' +
      '<div class="foot"><button class="btn" onclick="closeNewPlaylistModal()">Cancel</button>' +
      '<button class="btn primary" onclick="submitNewPlaylist()">Banao</button></div>' +
    '</div>';
  document.body.appendChild(modal);
  modal.addEventListener('click', function (e) { if (e.target === modal) closeNewPlaylistModal(); });
}
function promptNewPlaylist(track) {
  document.querySelectorAll('.picker-pop.pl-add-pop').forEach(function (p) { p.remove(); });
  ensureNewPlaylistModal();
  _newPlaylistPendingTrack = track || null;
  document.getElementById('lwNewPlaylistModal').classList.add('open');
  document.getElementById('lwNewPlaylistName').value = '';
  document.getElementById('lwNewPlaylistName').focus();
}
function closeNewPlaylistModal() {
  var m = document.getElementById('lwNewPlaylistModal');
  if (m) m.classList.remove('open');
}
async function submitNewPlaylist() {
  var name = document.getElementById('lwNewPlaylistName').value.trim();
  if (!name) { LWApp.toast('❌ Playlist ka naam likho', 'error'); return; }
  try {
    var pl = await LWApp.createPlaylist(name);
    if (_newPlaylistPendingTrack && pl) await LWApp.addToPlaylist(pl.id, musicTrackNorm(_newPlaylistPendingTrack));
    _newPlaylistPendingTrack = null;
    closeNewPlaylistModal();
    LWApp.toast('✅ Playlist ban gayi');
    renderMusicPlaylists();
  } catch (e) {
    LWApp.toast('❌ ' + LWApp.err(e), 'error');
  }
}

/* ---------- inline search box (rail card ke andar hi, modal khole bina) ---------- */
var _railSearchTimer = null;
function debouncedRailSearch(input) {
  var q = input.value.trim();
  clearTimeout(_railSearchTimer);
  _railSearchTimer = setTimeout(function () { railSearchTracks(q, input); }, 400);
}
async function railSearchTracks(query, inputEl) {
  var scope = inputEl.closest('.music-rail-card');
  var resultsBox = scope.querySelector('.music-search-results');
  var suggBox = scope.querySelector('.song-sugg-body');
  if (!query) { resultsBox.style.display = 'none'; resultsBox.innerHTML = ''; suggBox.style.display = ''; return; }
  suggBox.style.display = 'none';
  resultsBox.style.display = '';
  resultsBox.innerHTML = '<div class="spinner">"' + LWApp.esc(query) + '" khoja ja raha hai…</div>';
  var r = await LWApp.fetchSpotifyTracks(query);
  if (r.error) {
    resultsBox.innerHTML = '<div class="empty"><span class="ic">🎧</span>' +
      (r.error === 'no-token'
        ? 'Pehle Spotify se sign-in/connect karo, tabhi search kaam karegi.'
        : 'Spotify session expire ho gaya lagta hai — dobara connect karo.') +
      '<br><br><button class="btn primary" onclick="LW.spotify()">🎵 Spotify connect karo</button></div>';
    return;
  }
  resultsBox.innerHTML = r.tracks.length
    ? r.tracks.map(function (t) { return musicRowHtml({ id: t.id, t: t.name, a: (t.artists || []).map(function (a) { return a.name; }).join(', ') }, 'search'); }).join('')
    : '<div class="empty"><span class="ic">🎧</span>Kuch nahi mila. Doosra naam try karo.</div>';
}

async function renderMusicRailCard() {
  var shell =
    '<div class="rail-card-head"><h3>🎵 Music</h3>' +
      '<button type="button" class="rail-refresh-btn" onclick="renderSongSuggestions()" title="Naye gaane dikhao">🔄</button></div>' +
    '<input type="search" style="margin-bottom:10px" placeholder="🔍 Gaana ya singer khojo…" oninput="debouncedRailSearch(this)" autocomplete="off">' +
    '<div class="music-search-results" style="display:none"></div>' +
    '<div class="song-sugg-body"></div>' +
    '<details class="music-fav-details" style="margin-top:12px">' +
      '<summary>❤️ Favorites</summary>' +
      '<div class="music-fav-body" style="margin-top:8px"></div>' +
    '</details>' +
    '<details class="music-pl-details" style="margin-top:12px" open>' +
      '<summary>📋 My Playlists</summary>' +
      '<div class="music-pl-body" style="margin-top:8px"></div>' +
    '</details>';
  setAllHtml('music-rail-card', shell);
  await refreshFavIds();
  renderSongSuggestions();
  document.querySelectorAll('.music-fav-details').forEach(function (d) {
    d.addEventListener('toggle', function () { if (d.open) renderMusicFavorites(); });
  });
  renderMusicPlaylists();
}

/* ---------- Right rail: upcoming festivals + birthdays ---------- */
var FESTIVALS_2026 = [
  { d: '2026-08-28', ic: '🎗️', name: 'Raksha Bandhan' },
  { d: '2026-09-14', ic: '🐘', name: 'Ganesh Chaturthi' },
  { d: '2026-10-11', ic: '🪔', name: 'Navratri shuru' },
  { d: '2026-10-20', ic: '🏹', name: 'Dussehra' },
  { d: '2026-10-29', ic: '🌙', name: 'Karva Chauth' },
  { d: '2026-11-06', ic: '🪙', name: 'Dhanteras' },
  { d: '2026-11-08', ic: '🪔', name: 'Diwali' },
  { d: '2026-11-11', ic: '👫', name: 'Bhai Dooj' },
  { d: '2026-12-25', ic: '🎄', name: 'Christmas' },
  { d: '2027-01-01', ic: '🎉', name: 'New Year' },
  { d: '2027-02-14', ic: '💘', name: "Valentine's Day" }
];
function festSlide(btn, dir) {
  var slider = btn.parentElement.querySelector('.fest-slider');
  if (!slider) return;
  var card = slider.querySelector('.fest-card');
  var step = (card ? card.offsetWidth + 10 : 114) * 2;
  slider.scrollBy({ left: dir * step, behavior: 'smooth' });
}

async function renderUpcomingRail() {
  if (!document.querySelector('.upcoming-body')) return;
  var today = new Date(); today.setHours(0, 0, 0, 0);
  var items = FESTIVALS_2026.map(function (f) {
    var dt = new Date(f.d + 'T00:00:00');
    var days = Math.round((dt - today) / 86400000);
    return { ic: f.ic, name: f.name, days: days };
  }).filter(function (x) { return x.days >= 0 && x.days <= 90; });

  try {
    var b = await LWApp.birthdays(90);
    b.forEach(function (x) {
      items.push({ ic: '🎂', name: (x.full_name || x.username) + ' ka birthday', days: x.days_left });
    });
  } catch (e) {}

  items.sort(function (a, b) { return a.days - b.days; });
  items = items.slice(0, 10);

  var html = items.length
    ? '<div class="spot-slider-wrap">' +
        '<button type="button" class="spot-nav prev" onclick="festSlide(this,-1)" aria-label="Previous">‹</button>' +
        '<div class="fest-slider">' + items.map(function (x, i) {
          var when = x.days === 0 ? 'Aaj' : x.days === 1 ? 'Kal' : x.days + ' din baad';
          return '<div class="fest-card' + (x.days === 0 ? ' today' : '') + '" style="animation-delay:' + (i * 0.06) + 's">' +
            '<span class="ic">' + x.ic + '</span><b>' + LWApp.esc(x.name) + '</b>' +
            '<small>' + when + '</small></div>';
        }).join('') + '</div>' +
        '<button type="button" class="spot-nav next" onclick="festSlide(this,1)" aria-label="Next">›</button>' +
      '</div>'
    : '<div class="muted" style="font-size:.8rem">Agle 90 din mein kuch nahi hai.</div>';
  setAllHtml('upcoming-body', html);
}

/* ---------- Mobile bottom-sheet: same widgets, reachable via a header button ---------- */
var RAIL_SHEET_HTML =
  '<div class="rail-sheet-overlay" id="railSheetOverlay" onclick="if(event.target===this) closeRailSheet()">' +
    '<div class="rail-sheet">' +
      '<div class="rail-sheet-handle"></div>' +
      '<button type="button" class="rail-sheet-close" onclick="closeRailSheet()">✕</button>' +
      '<h2>✨ Loveway Extras</h2>' +
      '<div class="rail-sheet-section">' +
        '<div class="rail-card-head"><h3>🎵 Now Playing</h3></div>' +
        '<div class="mp-big">' +
          '<button type="button" class="mp-btn-big" onclick="miniPlayerPrev()" title="Previous">⏮</button>' +
          '<button type="button" class="mp-btn-big mp-play-btn" onclick="miniPlayerToggle()" title="Play">▶</button>' +
          '<button type="button" class="mp-btn-big" onclick="miniPlayerNext()" title="Next">⏭</button>' +
        '</div>' +
        '<div class="mp-name-big mp-name">🎵 Loveway Radio</div>' +
        '<button type="button" class="btn sm" style="width:100%;margin-top:8px" onclick="searchAndPlaySong()">🔍 Apna gaana khojo</button>' +
        '<a class="mp-fallback-link mp-fallback-link-big" href="#" target="_blank" rel="noopener" style="display:none">🔗 Spotify par kholo</a>' +
        '<div class="mp-embed-visible"><div id="mpEmbedHost"></div></div>' +
      '</div>' +
      '<div class="rail-sheet-section music-rail-card"></div>' +
      '<div class="rail-sheet-section">' +
        '<h3>💑 Aas-paas ke best spots</h3>' +
        '<div class="spots-body">' +
          '<div class="muted" style="font-size:.8rem">Location on karke best couple spots dekho.</div>' +
          '<button type="button" class="btn sm" style="margin-top:8px;width:100%" onclick="loadNearbySpots()">📍 Location on karo</button>' +
        '</div>' +
      '</div>' +
      '<div class="rail-sheet-section">' +
        '<h3>🎉 Aane wale festival aur birthdays</h3>' +
        '<div class="upcoming-body"><div class="muted" style="font-size:.8rem">Load ho raha hai…</div></div>' +
      '</div>' +
    '</div>' +
  '</div>';
function ensureRailSheet() {
  if (document.getElementById('railSheetOverlay')) return;
  document.body.insertAdjacentHTML('beforeend', RAIL_SHEET_HTML);
}
function openRailSheet() {
  ensureRailSheet();
  document.getElementById('railSheetOverlay').classList.add('open');
  updateMiniPlayerName();
  loadNearbySpots();
  renderMusicRailCard();
  renderUpcomingRail();
}
function closeRailSheet() {
  var el = document.getElementById('railSheetOverlay');
  if (el) el.classList.remove('open');
}

/* ---------- Init helper: call from each page's DOMContentLoaded ---------- */
function initSideRails() {
  ensureRailSheet();
  if (window.innerWidth >= 1680) {
    loadNearbySpots();
    renderMusicRailCard();
    renderUpcomingRail();
  }
}

/* ---------- Header mini music player (Spotify iFrame API — real prev/play/next control) ---------- */
var mpIndex = 0, mpController = null, mpReady = false, mpPendingAction = null, mpLoadTimedOut = false;
var currentTrack = SONG_POOL[0];
window.onSpotifyIframeApiReady = function (IFrameAPI) {
  ensureRailSheet();
  var el = document.getElementById('mpEmbedHost');
  if (!el) return;
  // height 80 = sirf ek patli control bar; 152 par Spotify apna progress-bar/scrubber
  // bhi dikhata hai — "full mode" jaisa feel deta hai bina kuch naya banaye
  var options = { uri: 'spotify:track:' + currentTrack.id, width: '300', height: '152' };
  IFrameAPI.createController(el, options, function (controller) {
    mpController = controller;
    // 'ready' event ka timing bharosemand nahi hai (kabhi der se aata hai, kabhi bilkul nahi) —
    // controller ban jaana hi practically play()/loadUri() call karne ke liye kaafi hai
    mpReady = true;
    updateMiniPlayerFallbackLink();
    if (mpPendingAction) { var fn = mpPendingAction; mpPendingAction = null; fn(); }
    controller.addListener('playback_update', function (e) {
      document.querySelectorAll('.mp-play-btn').forEach(function (btn) {
        btn.textContent = e.data.isPaused ? '▶' : '⏸';
      });
    });
  });
};
// player abhi load ho raha ho to action ko queue karo aur user ko bata do —
// pehle silently kuch nahi hota tha jab tak Spotify ka iframe ready na ho
function whenPlayerReady(action) {
  if (mpReady && mpController) { action(); return; }
  mpPendingAction = action;
  LWApp.toast('⏳ Player load ho raha hai…');
  setTimeout(function () {
    if (!mpReady) {
      mpLoadTimedOut = true;
      mpPendingAction = null;
      updateMiniPlayerFallbackLink();
      LWApp.toast('❌ Player load nahi ho paya (ad-blocker ho sakta hai) — "Spotify par kholo" try karo', 'error');
    }
  }, 6000);
}
function updateMiniPlayerFallbackLink() {
  var show = mpLoadTimedOut && !mpReady;
  document.querySelectorAll('.mp-fallback-link').forEach(function (a) {
    a.href = 'https://open.spotify.com/track/' + currentTrack.id;
    a.style.display = show ? '' : 'none';
  });
}
function initMiniPlayer() {
  mpIndex = Math.floor(Math.random() * SONG_POOL.length);
  currentTrack = SONG_POOL[mpIndex];
  updateMiniPlayerName();
}
function updateMiniPlayerName() {
  var text = '🎵 ' + currentTrack.t + ' — ' + currentTrack.a;
  document.querySelectorAll('.mp-name').forEach(function (el) { el.textContent = text; });
  highlightPlayingSong();
  updateMiniPlayerFallbackLink();
}
function miniPlayerToggle() {
  whenPlayerReady(function () { mpController.togglePlay(); });
}
function miniPlayerNext() {
  mpIndex = (mpIndex + 1) % SONG_POOL.length;
  currentTrack = SONG_POOL[mpIndex];
  updateMiniPlayerName();
  whenPlayerReady(function () { mpController.loadUri('spotify:track:' + currentTrack.id); mpController.play(); });
}
function miniPlayerPrev() {
  mpIndex = (mpIndex - 1 + SONG_POOL.length) % SONG_POOL.length;
  currentTrack = SONG_POOL[mpIndex];
  updateMiniPlayerName();
  whenPlayerReady(function () { mpController.loadUri('spotify:track:' + currentTrack.id); mpController.play(); });
}
