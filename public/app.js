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

// ---- grid rendering ----
function render(list) {
  if (!list.length) {
    grid.innerHTML = '<div class="empty-state"><h3>Semua channel offline</h3><p>Coba lagi nanti</p></div>';
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
    const dot = ch.online === true ? 'on' : ch.online === false ? 'off' : 'none';
    return `
    <div class="ch-card" data-id="${ch.id}">
      <div class="ch-avatar" style="background:${colorFor(ch.name)}">${ch.name.charAt(0).toUpperCase()}</div>
      <div class="ch-name">${ch.name}</div>
      <div class="ch-footer">
        <span class="ch-dot ${dot}"></span>
        ${ch.type === 'youtube' ? '<span class="ch-badge">YT</span>' : ''}
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
      sortedLetters.forEach((letter, li) => {
        if (li > 0) html += '<hr class="country-divider">';
        html += `
        <div class="country-block" data-country="US-${letter}">
          <div class="country-head"><h2>${country} — ${letter}</h2><span>${letters[letter].length}</span></div>
          <div class="card-grid">${letters[letter].map(cardHtml).join('')}</div>
        </div>`;
      });
    } else {
      if (idx > 0) html += '<hr class="country-divider">';
      html += `
      <div class="country-block" data-country="${country}">
        <div class="country-head"><h2>${country}</h2><span>${chs.length}</span></div>
        <div class="card-grid">${chs.map(cardHtml).join('')}</div>
      </div>`;
    }

    // nav pill
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

  // nav clicks — switch to browse & scroll
  countryNav.querySelectorAll('.nav-pill').forEach(pill => {
    pill.addEventListener('click', () => {
      if (!player.classList.contains('hidden')) goBrowse();
      const target = pill.dataset.target;
      let block;
      if (target === 'US') {
        block = document.querySelector('.country-block[data-country^="US-"]');
      } else {
        block = document.querySelector(`.country-block[data-country="${target}"]`);
      }
      if (block) setTimeout(() => block.scrollIntoView({ behavior: 'smooth', block: 'start' }), 50);
    });
  });
}

// ---- search ----
function filter(q) {
  if (!q) { render(channels.filter(ch => ch.online !== false)); return; }
  const t = q.toLowerCase();
  const f = channels.filter(ch =>
    (ch.online !== false) && (
      ch.name.toLowerCase().includes(t) ||
      (ch.country || '').toLowerCase().includes(t)
    )
  );
  if (!f.length) {
    grid.innerHTML = '<div class="empty-state"><h3>Channel tidak ditemukan</h3><p>Coba kata kunci lain</p></div>';
    countryNav.innerHTML = '';
    return;
  }
  render(f);
}

searchEl.addEventListener('input', e => filter(e.target.value));

// ---- init ----
grid.innerHTML = '<div class="empty-state"><h3>Memuat channel...</h3></div>';

let loadAttempts = 0;
function loadChannels() {
  fetch('/api/channels')
    .then(r => r.json())
    .then(data => {
      const list = Array.isArray(data) ? data : (data.channels || []);
      channels = list;
      const online = list.filter(ch => ch.online !== false);
      if (!online.length && loadAttempts < 3) {
        // retry — background check might still be running
        loadAttempts++;
        setTimeout(loadChannels, 3000);
        return;
      }
      render(online);
    })
    .catch(() => {
      if (loadAttempts < 3) {
        loadAttempts++;
        setTimeout(loadChannels, 3000);
      } else {
        grid.innerHTML = '<div class="empty-state"><h3>Gagal terhubung ke server</h3></div>';
      }
    });
}

loadChannels();
