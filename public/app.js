const channelList = document.getElementById('channel-list');
const video = document.getElementById('video-player');
const ytPlayer = document.getElementById('youtube-player');
const placeholder = document.getElementById('placeholder');
const noChannel = document.getElementById('no-channel');
const resSelector = document.getElementById('res-selector');
const resSelect = document.getElementById('res-select');

let hls = null;
let allChannels = [];

function renderChannels(channels) {
  const groups = {};
  channels.forEach(ch => {
    const key = ch.country || 'Lainnya';
    if (!groups[key]) groups[key] = [];
    groups[key].push(ch);
  });

  channelList.innerHTML = Object.entries(groups).map(([country, chs]) => `
    <div class="country-label">${country} (${chs.length})</div>
    ${chs.map(ch => {
      const dotClass = ch.online === true ? 'online' : ch.online === false ? 'offline' : 'unknown';
      return `
      <div class="channel-item" data-id="${ch.id}">
        <span class="dot ${dotClass}"></span>
        <div class="channel-logo">${ch.name.charAt(0).toUpperCase()}</div>
        <span class="channel-name">${ch.name}</span>
        ${ch.type === 'youtube' ? '<span class="channel-badge">YT</span>' : ''}
      </div>`;
    }).join('')}
  `).join('');

  channelList.querySelectorAll('.channel-item').forEach(el => {
    el.addEventListener('click', () => {
      const id = el.dataset.id;
      const ch = allChannels.find(c => c.id === id);
      if (ch && ch.streamUrl) playChannel(ch, el);
    });
  });
}

function populateResolutions() {
  if (!hls || !hls.levels) { resSelector.style.display = 'none'; return; }
  resSelect.innerHTML = '<option value="-1">Auto</option>';
  hls.levels.forEach((l, i) => {
    const h = l.height || 0;
    const label = h >= 2160 ? '4K' : h >= 1440 ? '1440p' : h >= 1080 ? '1080p' : h >= 720 ? '720p' : h >= 480 ? '480p' : h >= 360 ? '360p' : h >= 240 ? '240p' : h + 'p';
    const opt = document.createElement('option');
    opt.value = i;
    opt.textContent = label + (l.bitrate ? ' (' + Math.round(l.bitrate / 1000) + 'kbps)' : '');
    resSelect.appendChild(opt);
  });
  resSelector.style.display = 'flex';
}

function playChannel(channel, el) {
  channelList.querySelectorAll('.channel-item').forEach(i => i.classList.remove('active'));
  if (el) el.classList.add('active');

  if (hls) { hls.destroy(); hls = null; }
  video.src = '';
  video.style.display = 'none';
  ytPlayer.innerHTML = '';
  ytPlayer.style.display = 'none';
  resSelector.style.display = 'none';
  placeholder.classList.remove('hidden');

  if (channel.type === 'youtube') {
    const m = channel.streamUrl.match(/(?:channel\/|@)([^/]+)/);
    const handle = m ? m[1] : '';
    if (handle) {
      ytPlayer.style.display = 'block';
      ytPlayer.innerHTML = `<iframe src="https://www.youtube.com/embed/live_stream?channel=${handle}&autoplay=1&mute=1" allow="autoplay; encrypted-media" allowfullscreen></iframe>`;
      placeholder.classList.add('hidden');
    }
  } else {
    video.style.display = 'block';
    const url = channel.streamUrl;
    if (video.canPlayType('application/vnd.apple.mpegurl')) {
      video.src = url;
      video.play().then(() => placeholder.classList.add('hidden')).catch(() => {});
    } else if (Hls.isSupported()) {
      hls = new Hls();
      hls.loadSource(url);
      hls.attachMedia(video);
      hls.on(Hls.Events.MANIFEST_PARSED, () => {
        placeholder.classList.add('hidden');
        video.play().catch(() => {});
        if (channel.online !== false) populateResolutions();
      });
      hls.on(Hls.Events.LEVEL_SWITCHED, (e, data) => {
        resSelect.value = data.level === -1 ? '-1' : '' + data.level;
      });
      hls.on(Hls.Events.ERROR, (e, data) => {
        if (data.fatal) { hls.destroy(); hls = null; noChannel.textContent = 'Gagal: ' + channel.name; }
      });
    }
  }
}

resSelect.addEventListener('change', () => {
  if (hls) hls.currentLevel = parseInt(resSelect.value);
});

noChannel.textContent = 'Memuat...';

fetch('/api/channels')
  .then(r => r.json())
  .then(data => {
    const channels = Array.isArray(data) ? data : (data.channels || []);
    if (!channels.length) { noChannel.textContent = 'Tidak ada channel'; return; }
    allChannels = channels;
    noChannel.textContent = channels.length + ' channel';
    renderChannels(channels.slice(0, 500));
  })
  .catch(() => { noChannel.textContent = 'Gagal load server'; });
