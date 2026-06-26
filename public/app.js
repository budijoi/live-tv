const grid = document.getElementById('grid');
const browse = document.getElementById('browse');
const player = document.getElementById('player');
const playerTitle = document.getElementById('player-title');
const playerSub = document.getElementById('player-sub');
const backBtn = document.getElementById('back');
const searchEl = document.getElementById('search');
const countryNav = document.getElementById('country-nav');
const videoEl = document.getElementById('video-el');
const videoBox = document.getElementById('video-box');
const ytBox = document.getElementById('yt-box');
const blank = document.getElementById('blank');
const toast = document.getElementById('toast');
const toastMsg = document.getElementById('toast-msg');
const panel = document.getElementById('panel');
const panelTitle = document.getElementById('panel-title');
const panelGrid = document.getElementById('panel-grid');
const panelClose = document.getElementById('panel-close');
const refreshBtn = document.getElementById('refresh-btn');
const lastUpdated = document.getElementById('last-updated');

let channels = [];
let abort = null;

const avatarColors = [
  '#e94560','#6c5ce7','#00b894','#fdcb6e','#e17055',
  '#0984e3','#fd79a8','#00cec9','#a29bfe','#fab1a0',
  '#81ecec','#ff7675','#74b9ff','#55efc4','#ffeaa7',
  '#b2bec3','#636e72','#d63031',
];

function colorFor(name) {
  let h = 0;
  for (let i = 0; i < name.length; i++) h = ((h << 5) - h) + name.charCodeAt(i);
  return avatarColors[Math.abs(h) % avatarColors.length];
}

// toast
function toastShow(msg, err) {
  toast.classList.remove('hidden', 'err');
  toastMsg.textContent = msg;
  if (err) toast.classList.add('err');
}
function toastHide() { toast.classList.add('hidden'); }

// player
function resetPlayer() {
  if (abort) { abort.abort(); abort = null; }
  videoEl.removeAttribute('src');
  videoEl.load();
  ytBox.innerHTML = '';
  ytBox.style.display = 'none';
  blank.classList.remove('hide');
  toastHide();
}

function goBrowse() {
  hidePanel();
  browse.style.display = '';
  player.classList.add('hidden');
  resetPlayer();
}

function goPlayer(ch) {
  browse.style.display = 'none';
  player.classList.remove('hidden');
  playerTitle.textContent = ch.name;
  playerSub.textContent = ch.country || '';
}

backBtn.addEventListener('click', goBrowse);

// ---- channel panel (bottom sheet) ----
function showPanel(country) {
  const list = channels
    .filter(ch => (ch.country || 'Lainnya') === country)
    .sort((a, b) => {
      const an = a.name.toLowerCase().replace(/^the\s+/, '');
      const bn = b.name.toLowerCase().replace(/^the\s+/, '');
      return an < bn ? -1 : an > bn ? 1 : 0;
    });

  if (!list.length) return;

  const label = country === 'US' ? '🇺🇸 US' : country;
  panelTitle.textContent = label;

  panelGrid.className = 'country-row';
  panelGrid.innerHTML = list.map(ch => {
    const cc = colorFor(ch.name);
    return `
    <div class="ch-card" data-id="${ch.id}">
      <div class="ch-thumb" style="background:linear-gradient(135deg,${cc},${cc}88)">${ch.name.charAt(0).toUpperCase()}</div>
      <div class="ch-body">
        <div class="ch-name">${ch.name}</div>
        <div class="ch-footer">
          ${ch.type === 'youtube' ? '<span class="ch-badge">YT</span>' : ''}
        </div>
      </div>
    </div>`;
  }).join('');

  panelGrid.addEventListener('wheel', e => {
    if (Math.abs(e.deltaX) > Math.abs(e.deltaY)) return;
    e.preventDefault();
    panelGrid.scrollLeft += e.deltaY;
  }, { passive: false });

  panelGrid.querySelectorAll('.ch-card').forEach(el => {
    el.addEventListener('click', () => {
      const id = el.dataset.id;
      const ch = channels.find(c => c.id === id);
      if (ch && ch.streamUrl) {
        hidePanel();
        play(ch);
      }
    });
  });

  panel.classList.remove('hidden');
}

function hidePanel() {
  panel.classList.add('hidden');
}

panelClose.addEventListener('click', hidePanel);

function play(ch) {
  resetPlayer();
  goPlayer(ch);

  if (ch.type === 'youtube') {
    const m = ch.streamUrl.match(/(?:channel\/|@)([^/]+)/);
    const h = m ? m[1] : '';
    if (h) {
      ytBox.style.display = 'block';
      ytBox.innerHTML = `<iframe src="https://www.youtube.com/embed/live_stream?channel=${h}&autoplay=1&mute=1" allow="autoplay; encrypted-media" allowfullscreen></iframe>`;
      blank.classList.add('hide');
    }
  } else {
    const ac = new AbortController();
    abort = ac;
    const s = ac.signal;

    videoEl.src = ch.streamUrl;
    toastShow('Memuat ' + ch.name + '...');

    videoEl.addEventListener('loadedmetadata', () => {
      blank.classList.add('hide');
      toastHide();
    }, { signal: s, once: true });

    videoEl.addEventListener('waiting', () => toastShow('Buffering...'), { signal: s });
    videoEl.addEventListener('playing', () => { blank.classList.add('hide'); toastHide(); }, { signal: s });

    videoEl.addEventListener('error', () => {
      const e = videoEl.error;
      const m = e ? (e.message || 'Kode ' + e.code) : 'Gagal';
      toastShow('Error: ' + ch.name + ' (' + m + ')', true);
    }, { signal: s });

    videoEl.addEventListener('stalled', () => toastShow('Stream tersendat...'), { signal: s });
    videoEl.load();
    videoEl.play().catch(() => {});
  }
}

// ---- M3U parser ----
function parseM3U(text, country) {
  const chs = []; let cur = {};
  for (const line of text.split('\n')) {
    const t = line.trim();
    if (t.startsWith('#EXTINF:')) {
      const n = t.match(/,([^,]+)$/);
      cur = { name: n ? n[1].trim() : 'Unknown', country, type: 'hls' };
    } else if ((t.startsWith('http://') || t.startsWith('https://')) && cur.name) {
      if (!/geo-blocked/i.test(cur.name)) {
        cur.id = cur.name.toLowerCase().replace(/[^a-z0-9]+/g, '-') + '-' + country;
        cur.streamUrl = t;
        chs.push(cur);
      }
      cur = {};
    }
  }
  return chs;
}

// ---- Manual channels ----
function getManualChannels() {
  return [
    { id: 'transtv', name: 'Trans TV', country: 'Indonesia', type: 'youtube', streamUrl: 'https://www.youtube.com/@TRANSTV_Official/live' },
    { id: 'trans7', name: 'Trans 7', country: 'Indonesia', type: 'youtube', streamUrl: 'https://www.youtube.com/@trans7official/live' },
    { id: 'cnn', name: 'CNN Indonesia', country: 'Indonesia', type: 'hls', streamUrl: 'https://live.cnnindonesia.com/livecnn/smil:cnntv.smil/chunklist_w80388450_b384000_sleng.m3u8' },
    { id: 'cnbc', name: 'CNBC Indonesia', country: 'Indonesia', type: 'hls', streamUrl: 'https://live.cnbcindonesia.com/livecnbc/smil:cnbctv.smil/chunklist_w481242722_b384000_sleng.m3u8' },
    { id: 'kompas', name: 'Kompas TV', country: 'Indonesia', type: 'youtube', streamUrl: 'https://www.youtube.com/@kompastv/live' },
    { id: 'metrotv', name: 'Metro TV', country: 'Indonesia', type: 'youtube', streamUrl: 'https://www.youtube.com/@MetroTV/live' },
    { id: 'tvri', name: 'TVRI Nasional', country: 'Indonesia', type: 'youtube', streamUrl: 'https://www.youtube.com/@TVRINasional/live' },
    { id: 'rtv', name: 'RTV', country: 'Indonesia', type: 'hls', streamUrl: 'https://rtvstream.rtv.co.id:4555/hls/rtv.m3u8' },
    { id: 'nusantara', name: 'Nusantara TV', country: 'Indonesia', type: 'hls', streamUrl: 'https://nusantaratv.siar.us/nusantaratv/live/playlist.m3u8' },
    { id: 'jogja', name: 'Jogja TV', country: 'Indonesia', type: 'hls', streamUrl: 'https://stream.jogjatv.co.id/jtvlive/stream/index.m3u8' },
    { id: 'daai', name: 'DAAI TV', country: 'Indonesia', type: 'hls', streamUrl: 'https://pull.daaiplus.com/live-DAAIPLUS/live-DAAIPLUS_HD.m3u8' },
    { id: 'mqtv', name: 'MQTV', country: 'Indonesia', type: 'hls', streamUrl: 'https://5bf7b725107e5.streamlock.net/mqtv/mqtv/playlist.m3u8' },
    { id: 'garuda', name: 'Garuda TV', country: 'Indonesia', type: 'hls', streamUrl: 'https://hgmtv.com:19360/garudatvlivestreaming/garudatvlivestreaming.m3u8' },
    { id: 'mnc', name: 'MNC', country: 'Indonesia', type: 'hls', streamUrl: 'https://edge.medcom.id/live-edge/smil:mgnch.smil/playlist.m3u8' },
    { id: 'rcti', name: 'RCTI', country: 'Indonesia', type: 'hls', streamUrl: 'https://rcti-linier.rctiplus.id/rcti-sdi.m3u8?hdnts=exp=1782448083~hmac=3b841da38169e1c5ad506956ea197f1e0685fba684f24dc0253014e6d15ad3fd' },
  ];
}

// ---- Fetch iptv-org playlist ----
async function fetchIptv(code) {
  try {
    const text = await fetch(
      `https://raw.githubusercontent.com/iptv-org/iptv/master/streams/${code}.m3u`,
      { signal: AbortSignal.timeout(8000) }
    ).then(r => r.text());
    return parseM3U(text, code.toUpperCase());
  } catch {
    return [];
  }
}

const COUNTRIES = ['us', 'gb', 'jp', 'kr', 'my', 'sg', 'in', 'de', 'fr', 'au'];

async function fetchAllChannels() {
  const manual = getManualChannels();
  const iptvResults = await Promise.all(COUNTRIES.map(fetchIptv));
  return [...manual, ...iptvResults.flat()];
}

// ---- grid rendering ----
function render(list) {
  if (!list.length) {
    grid.innerHTML = '<div class="empty-state"><h3>Tidak ada channel</h3><p>Coba refresh</p></div>';
    countryNav.innerHTML = '';
    return;
  }

  const groups = {};
  list.forEach(ch => {
    const key = ch.country || 'Lainnya';
    if (!groups[key]) groups[key] = [];
    groups[key].push(ch);
  });

  function alpha(a, b) {
    const an = a.name.toLowerCase().replace(/^the\s+/, '');
    const bn = b.name.toLowerCase().replace(/^the\s+/, '');
    return an < bn ? -1 : an > bn ? 1 : 0;
  }

  function cardHtml(ch) {
    const c = colorFor(ch.name);
    return `
    <div class="ch-card" data-id="${ch.id}">
      <div class="ch-thumb" style="background:linear-gradient(135deg,${c},${c}88)">${ch.name.charAt(0).toUpperCase()}</div>
      <div class="ch-body">
        <div class="ch-name">${ch.name}</div>
        <div class="ch-footer">
          ${ch.type === 'youtube' ? '<span class="ch-badge">YT</span>' : ''}
        </div>
      </div>
    </div>`;
  }

  const countryKeys = Object.keys(groups);
  let html = '';
  let navHtml = '';

  countryKeys.forEach((country, idx) => {
    const chs = groups[country].sort(alpha);

    if (country === 'US') {
      const letters = {};
      chs.forEach(ch => {
        const c = ch.name.match(/[a-zA-Z]/) ? ch.name[0].toUpperCase() : '#';
        if (!letters[c]) letters[c] = [];
        letters[c].push(ch);
      });
      const sortedLetters = Object.keys(letters).sort();
      sortedLetters.forEach(letter => {
        html += `
        <div class="country-block" data-country="US-${letter}">
          <div class="country-head"><h2>${country} — ${letter}</h2><span>${letters[letter].length}</span></div>
          <div class="country-row">${letters[letter].map(cardHtml).join('')}</div>
        </div>`;
      });
    } else {
      html += `
      <div class="country-block" data-country="${country}">
        <div class="country-head"><h2>${country}</h2><span>${chs.length}</span></div>
        <div class="country-row">${chs.map(cardHtml).join('')}</div>
      </div>`;
    }

    const label = country === 'US' ? '🇺🇸 US' : country;
    navHtml += `<span class="nav-pill" data-target="${country}">${label}</span>`;
  });

  grid.innerHTML = html;
  countryNav.innerHTML = navHtml;

  // card clicks
  grid.querySelectorAll('.ch-card').forEach(el => {
    el.addEventListener('click', () => {
      const id = el.dataset.id;
      const ch = channels.find(c => c.id === id);
      if (ch && ch.streamUrl) play(ch);
    });
  });

  // horizontal scroll via mouse wheel
  grid.querySelectorAll('.country-row').forEach(row => {
    row.addEventListener('wheel', e => {
      if (Math.abs(e.deltaX) > Math.abs(e.deltaY)) return;
      e.preventDefault();
      row.scrollLeft += e.deltaY;
    }, { passive: false });
  });

  // nav clicks
  countryNav.querySelectorAll('.nav-pill').forEach(pill => {
    pill.addEventListener('click', () => {
      const inPlayer = !player.classList.contains('hidden');
      const target = pill.dataset.target;

      if (inPlayer) {
        showPanel(target);
        return;
      }

      let block;
      if (target === 'US') {
        block = document.querySelector('.country-block[data-country^="US-"]');
      } else {
        block = document.querySelector(`.country-block[data-country="${target}"]`);
      }
      if (block) block.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
  });
}

// ---- search ----
function filter(q) {
  if (!q) { render(channels); return; }
  const t = q.toLowerCase();
  const f = channels.filter(ch =>
    ch.name.toLowerCase().includes(t) ||
    (ch.country || '').toLowerCase().includes(t)
  );
  if (!f.length) {
    grid.innerHTML = '<div class="empty-state"><h3>Channel tidak ditemukan</h3><p>Coba kata kunci lain</p></div>';
    countryNav.innerHTML = '';
    return;
  }
  render(f);
}

searchEl.addEventListener('input', e => filter(e.target.value));

// ---- refresh ----
function setUpdated() {
  const now = new Date();
  lastUpdated.textContent = now.getHours().toString().padStart(2,'0') + ':' + now.getMinutes().toString().padStart(2,'0');
}

refreshBtn.addEventListener('click', () => {
  refreshBtn.textContent = '↻';
  refreshBtn.style.animation = 'spin 0.6s linear';
  grid.innerHTML = '<div class="empty-state"><h3>Memperbarui channel...</h3></div>';
  fetchAllChannels().then(list => {
    channels = list;
    render(list);
    setUpdated();
    refreshBtn.textContent = '↻';
    refreshBtn.style.animation = '';
  });
});

// ---- init ----
grid.innerHTML = '<div class="empty-state"><h3>Memuat channel...</h3></div>';

fetchAllChannels().then(list => {
  channels = list;
  render(list);
  setUpdated();
}).catch(() => {
  grid.innerHTML = '<div class="empty-state"><h3>Gagal memuat channel</h3><p>Periksa koneksi internet</p></div>';
});

// auto-refresh every 10 minutes
setInterval(() => {
  fetchAllChannels().then(list => {
    channels = list;
    const q = searchEl.value.trim();
    if (q) filter(q); else render(list);
    setUpdated();
  });
}, 600_000);
