const express = require('express');
const path = require('path');
const https = require('https');
const http = require('http');
const app = express();
const PORT = 3000;

app.use(express.static('public'));

// ---- Online check helpers ----
function checkUrl(url) {
  return new Promise(resolve => {
    try {
      const u = new URL(url);
      const mod = u.protocol === 'https:' ? https : http;
      const req = mod.request(u.href, {
        method: 'HEAD',
        rejectUnauthorized: false,
        timeout: 4000,
        headers: { 'User-Agent': 'Mozilla/5.0' }
      }, r => { r.destroy(); resolve(r.statusCode >= 200 && r.statusCode < 400); });
      req.on('error', () => resolve(false));
      req.on('timeout', () => { req.destroy(); resolve(false); });
      req.end();
    } catch { resolve(false); }
  });
}

async function checkBatch(channels, concurrency = 8) {
  const out = [];
  for (let i = 0; i < channels.length; i += concurrency) {
    const batch = channels.slice(i, i + concurrency);
    const checked = await Promise.all(batch.map(async ch => ({
      ...ch,
      online: ch.type === 'youtube' ? null : await checkUrl(ch.streamUrl)
    })));
    out.push(...checked);
  }
  return out;
}

// ---- Cache ----
let cache = null;
let cacheTime = 0;
const TTL = 300_000; // 5 min

// ---- Data sources ----
function getManualRaw() {
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

async function fetchIptv(code) {
  try {
    const text = await fetch(
      `https://raw.githubusercontent.com/iptv-org/iptv/master/streams/${code}.m3u`,
      { signal: AbortSignal.timeout(6000) }
    ).then(r => r.text());
    const chs = []; let cur = {};
    for (const line of text.split('\n')) {
      const t = line.trim();
      if (t.startsWith('#EXTINF:')) {
        const n = t.match(/,([^,]+)$/);
        cur = { name: n ? n[1].trim() : 'Unknown', country: code.toUpperCase(), type: 'hls', online: null };
      } else if ((t.startsWith('http://') || t.startsWith('https://')) && cur.name) {
        cur.id = cur.name.toLowerCase().replace(/[^a-z0-9]+/g, '-') + '-' + code;
        cur.streamUrl = t;
        chs.push(cur); cur = {};
      }
    }
    return chs;
  } catch { return []; }
}

// ---- Build & check all channels ----
async function buildChannels(forceRefresh) {
  const now = Date.now();
  if (cache && !forceRefresh && now - cacheTime < TTL) return cache;

  const manualRaw = getManualRaw();
  const COUNTRIES = ['us', 'gb', 'jp', 'kr', 'my', 'sg', 'in', 'de', 'fr', 'au'];

  const [manual, ...iptvLists] = await Promise.all([
    // return manual channels immediately, check online in background
    Promise.resolve(manualRaw.map(ch => ({ ...ch, online: ch.type === 'youtube' ? null : true }))),
    ...COUNTRIES.map(fetchIptv),
  ]);

  const all = [...manual, ...iptvLists.flat()];

  // Check online status in background (don't block response)
  checkBatch(all).then(checked => {
    cache = checked;
    cacheTime = Date.now();
  });

  cache = all;
  cacheTime = now;
  return all;
}

// ---- API ----
app.get('/api/channels', async (req, res) => {
  try {
    const channels = await buildChannels(req.query.refresh === '1');
    res.json(channels);
  } catch { res.json([]); }
});

app.listen(PORT, () => {
  console.log(`Live TV running at http://localhost:${PORT}`);
  // Warm cache on startup
  buildChannels(true);
});
