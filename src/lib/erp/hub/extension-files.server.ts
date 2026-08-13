/** Chrome MV3 extension source, generated per-download with the app origin baked in. */
import type { ZipEntry } from "./zip.server";

const MANIFEST = (origin: string) =>
  JSON.stringify(
    {
      manifest_version: 3,
      name: "Growth Hub Capture",
      version: "1.1.0",
      description:
        "Save any product, competitor ad or content inspiration straight into your Growth Hub.",
      permissions: ["activeTab", "scripting", "storage", "contextMenus", "notifications"],
      host_permissions: ["<all_urls>"],
      background: { service_worker: "background.js" },
      action: { default_popup: "popup.html", default_title: "Save to Growth Hub" },
      options_page: "options.html",
      icons: { 128: "icon128.png" },
      externally_connectable: { matches: [origin.replace(/\/$/, "") + "/*"] },
    },
    null,
    2,
  );

const CONFIG = (origin: string, token: string | null) =>
  "export const DEFAULTS = " +
  JSON.stringify({ base: origin.replace(/\/$/, ""), token: token ?? "" }) +
  ";\n";

const SCRAPE = `
// Injected into the page. Returns everything worth capturing.
(() => {
  const meta = (sel, attr) => {
    const el = document.querySelector(sel);
    return el ? (el.getAttribute(attr || 'content') || '').trim() : '';
  };
  const abs = (u) => { try { return new URL(u, location.href).href; } catch { return null; } };
  const imgs = [];
  const push = (u) => { const a = abs(u); if (a && a.startsWith('http') && !imgs.includes(a)) imgs.push(a); };
  push(meta('meta[property="og:image"]'));
  push(meta('meta[name="twitter:image"]'));
  Array.from(document.querySelectorAll('img')).forEach((im) => {
    const w = im.naturalWidth || im.width, h = im.naturalHeight || im.height;
    if (w >= 200 && h >= 200) push(im.currentSrc || im.src);
  });
  Array.from(document.querySelectorAll('video[poster]')).forEach((v) => push(v.getAttribute('poster')));

  let price = null;
  const pm = meta('meta[property="product:price:amount"]') || meta('meta[property="og:price:amount"]');
  if (pm) price = parseFloat(pm.replace(/[^0-9.]/g, ''));
  if (!price) {
    const body = (document.body ? document.body.innerText : '').slice(0, 20000);
    const m = body.match(/(?:৳|Tk\\.?|BDT|RM|\\$|¥|USD)\\s?([0-9][0-9,]{1,9}(?:\\.[0-9]{1,2})?)/i);
    if (m) price = parseFloat(m[1].replace(/,/g, ''));
  }

  const host = location.hostname.replace(/^www\\./, '');
  let platform = 'web';
  if (/facebook\\.com/.test(host)) platform = 'facebook';
  else if (/instagram\\.com/.test(host)) platform = 'instagram';
  else if (/tiktok\\.com/.test(host)) platform = 'tiktok';
  else if (/youtube\\.com|youtu\\.be/.test(host)) platform = 'youtube';
  else if (/pinterest\\./.test(host)) platform = 'pinterest';
  else if (/1688\\.com|alibaba\\.com|taobao\\.com|aliexpress\\./.test(host)) platform = 'supplier';

  let siteName = meta('meta[property="og:site_name"]') || host;
  const heading = document.querySelector('h1');
  return {
    url: location.href,
    title: (meta('meta[property="og:title"]') || (heading && heading.innerText) || document.title || '').trim().slice(0, 300),
    description: (meta('meta[name="description"]') || meta('meta[property="og:description"]') || '').slice(0, 500),
    selection: (window.getSelection() + '').trim().slice(0, 2000),
    images: imgs.slice(0, 24),
    price: Number.isFinite(price) ? price : null,
    platform: platform,
    host: host,
    siteName: siteName
  };
})();
`;

const BACKGROUND = `
import { DEFAULTS } from './config.js';

async function cfg() {
  const s = await chrome.storage.sync.get(['base', 'token', 'brandId']);
  return { base: s.base || DEFAULTS.base, token: s.token || DEFAULTS.token, brandId: s.brandId || null };
}

export async function api(payload) {
  const c = await cfg();
  if (!c.token) throw new Error('Token missing — open extension options.');
  const r = await fetch(c.base + '/api/public/hub/capture', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(Object.assign({ token: c.token }, payload))
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok || j.error) throw new Error(j.error || ('HTTP ' + r.status));
  return j;
}

function notify(title, message) {
  try {
    chrome.notifications.create({ type: 'basic', iconUrl: 'icon128.png', title: title, message: message });
  } catch (e) { /* ignore */ }
}

chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.removeAll(() => {
    chrome.contextMenus.create({ id: 'gh-idea', title: 'Growth Hub: product idea হিসেবে সেভ', contexts: ['page', 'image', 'link', 'selection'] });
    chrome.contextMenus.create({ id: 'gh-swipe', title: 'Growth Hub: swipe / inspiration সেভ', contexts: ['page', 'image', 'link', 'selection'] });
    chrome.contextMenus.create({ id: 'gh-rival', title: 'Growth Hub: rival page হিসেবে সেভ', contexts: ['page', 'link'] });
  });
});

chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  try {
    const c = await cfg();
    const [res] = await chrome.scripting.executeScript({ target: { tabId: tab.id }, files: ['scrape.js'] });
    const page = (res && res.result) || {};
    const image = info.srcUrl || (page.images && page.images[0]) || null;
    const common = {
      brand_id: c.brandId,
      url: info.linkUrl || page.url || (tab && tab.url),
      title: page.title || (tab && tab.title),
      image_url: image,
      note: info.selectionText || page.selection || null,
      price: page.price,
      platform: page.platform
    };
    if (info.menuItemId === 'gh-idea') {
      await api(Object.assign({ kind: 'idea', images: page.images ? page.images.slice(0, 6) : [] }, common));
      notify('Growth Hub', 'Product idea সেভ হয়েছে ✅');
    } else if (info.menuItemId === 'gh-swipe') {
      await api(Object.assign({ kind: 'swipe', asset_type: 'ad', competitor_name: page.siteName, competitor_url: page.url }, common));
      notify('Growth Hub', 'Swipe সেভ হয়েছে ✅');
    } else {
      await api({ kind: 'competitor', brand_id: c.brandId, name: page.siteName || page.host, url: info.linkUrl || page.url, platform: page.platform });
      notify('Growth Hub', 'Rival page সেভ হয়েছে ✅');
    }
  } catch (e) {
    notify('Growth Hub — ব্যর্থ', String(e.message || e));
  }
});
`;

const POPUP_HTML = `<!doctype html>
<html lang="bn">
<head>
<meta charset="utf-8" />
<link rel="stylesheet" href="popup.css" />
</head>
<body>
  <header>
    <div class="brandmark">GH</div>
    <div>
      <strong>Growth Hub Capture</strong>
      <small id="host">…</small>
    </div>
    <button id="settings" class="ghost" title="Settings">⚙</button>
  </header>

  <div id="setup" class="hidden pad">
    <p class="muted">প্রথমে Growth Hub → Rivals → Browser capture থেকে token নাও।</p>
    <input id="setupToken" placeholder="Token পেস্ট করো" />
    <button id="setupSave" class="primary block">সেভ করো</button>
  </div>

  <main id="app" class="hidden">
    <div class="tabs">
      <button class="tab on" data-kind="idea">💡 Idea</button>
      <button class="tab" data-kind="swipe">🎨 Swipe</button>
      <button class="tab" data-kind="competitor">🏴 Rival</button>
    </div>

    <div class="shots" id="shots"></div>

    <label>Title</label>
    <input id="title" />

    <div class="row">
      <div>
        <label>Brand</label>
        <select id="brand"></select>
      </div>
      <div id="typeWrap">
        <label>Type</label>
        <select id="assetType">
          <option value="ad">Ad</option>
          <option value="landing">Landing page</option>
          <option value="product">Product page</option>
          <option value="organic">Organic post</option>
          <option value="creative">Creative</option>
        </select>
      </div>
    </div>

    <div class="row">
      <div>
        <label>Price</label>
        <input id="price" type="number" step="0.01" />
      </div>
      <div id="rivalWrap">
        <label>Rival page</label>
        <select id="competitor"></select>
      </div>
    </div>

    <label>Note / কেন ভালো লাগলো</label>
    <textarea id="note" rows="3"></textarea>

    <label>Tags (কমা দিয়ে)</label>
    <input id="tags" placeholder="winner, hook, ugc" />

    <button id="save" class="primary block">Growth Hub-এ সেভ করো</button>
    <p id="msg" class="msg"></p>
  </main>
</body>
<script type="module" src="popup.js"></script>
</html>`;

const POPUP_CSS = `
:root { color-scheme: light dark; --bg:#0b0f1a; --card:#141a2a; --line:#26304a; --fg:#e8ecf7; --mut:#8e9ab8; --acc:#6366f1; }
* { box-sizing: border-box; font-family: ui-sans-serif, system-ui, "Segoe UI", Roboto, sans-serif; }
body { width: 360px; margin: 0; background: var(--bg); color: var(--fg); }
header { display:flex; align-items:center; gap:10px; padding:12px 14px; border-bottom:1px solid var(--line); }
.brandmark { width:30px; height:30px; border-radius:9px; background:linear-gradient(135deg,#6366f1,#a855f7); display:flex; align-items:center; justify-content:center; font-size:12px; font-weight:800; color:#fff; }
header strong { display:block; font-size:13px; }
header small { color: var(--mut); font-size:11px; display:block; max-width:220px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
header .ghost { margin-left:auto; background:none; border:none; color:var(--mut); font-size:15px; cursor:pointer; }
main, .pad { padding: 12px 14px 16px; }
.tabs { display:flex; gap:6px; margin-bottom:10px; }
.tab { flex:1; padding:7px 0; font-size:12px; border-radius:9px; border:1px solid var(--line); background:transparent; color:var(--mut); cursor:pointer; }
.tab.on { border-color:var(--acc); background:rgba(99,102,241,.16); color:#c7cbff; }
.shots { display:flex; gap:6px; overflow-x:auto; padding-bottom:6px; margin-bottom:8px; }
.shots img { height:64px; width:64px; object-fit:cover; border-radius:9px; border:2px solid transparent; cursor:pointer; flex:none; background:#222; }
.shots img.on { border-color:var(--acc); }
label { display:block; font-size:11px; color:var(--mut); margin:8px 0 4px; }
input, select, textarea { width:100%; padding:7px 9px; font-size:12px; border-radius:8px; border:1px solid var(--line); background:var(--card); color:var(--fg); }
textarea { resize:vertical; }
.row { display:flex; gap:8px; }
.row > div { flex:1; min-width:0; }
.primary { background:linear-gradient(135deg,#6366f1,#8b5cf6); color:#fff; border:none; border-radius:9px; padding:9px 0; font-size:13px; font-weight:600; cursor:pointer; }
.block { width:100%; margin-top:12px; }
.primary:disabled { opacity:.6; cursor:default; }
.msg { font-size:11px; margin:8px 0 0; min-height:14px; }
.msg.ok { color:#4ade80; } .msg.err { color:#f87171; }
.muted { color:var(--mut); font-size:12px; }
.hidden { display:none; }
`;

const POPUP_JS = `
import { DEFAULTS } from './config.js';

const $ = (id) => document.getElementById(id);
let kind = 'idea';
let page = {};
let chosen = null;
let cfg = {};

async function loadCfg() {
  const s = await chrome.storage.sync.get(['base', 'token', 'brandId']);
  cfg = { base: s.base || DEFAULTS.base, token: s.token || DEFAULTS.token, brandId: s.brandId || '' };
}

async function api(payload) {
  const r = await fetch(cfg.base + '/api/public/hub/capture', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(Object.assign({ token: cfg.token }, payload))
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok || j.error) throw new Error(j.error || ('HTTP ' + r.status));
  return j;
}

function setKind(k) {
  kind = k;
  document.querySelectorAll('.tab').forEach((t) => t.classList.toggle('on', t.dataset.kind === k));
  $('typeWrap').style.visibility = k === 'swipe' ? 'visible' : 'hidden';
  $('rivalWrap').style.visibility = k === 'swipe' ? 'visible' : 'hidden';
}

async function init() {
  await loadCfg();
  $('settings').onclick = () => chrome.runtime.openOptionsPage();
  if (!cfg.token) {
    $('setup').classList.remove('hidden');
    $('setupSave').onclick = async () => {
      const t = $('setupToken').value.trim();
      if (!t) return;
      await chrome.storage.sync.set({ token: t, base: cfg.base });
      location.reload();
    };
    return;
  }
  $('app').classList.remove('hidden');

  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  try {
    const [res] = await chrome.scripting.executeScript({ target: { tabId: tab.id }, files: ['scrape.js'] });
    page = (res && res.result) || {};
  } catch (e) {
    page = { url: tab.url, title: tab.title, images: [] };
  }

  $('host').textContent = page.host || tab.url || '';
  $('title').value = page.title || tab.title || '';
  $('note').value = page.selection || page.description || '';
  if (page.price) $('price').value = page.price;

  const shots = $('shots');
  (page.images || []).forEach((src, i) => {
    const im = document.createElement('img');
    im.src = src;
    im.onerror = () => im.remove();
    if (i === 0) { im.classList.add('on'); chosen = src; }
    im.onclick = () => {
      shots.querySelectorAll('img').forEach((x) => x.classList.remove('on'));
      im.classList.add('on');
      chosen = src;
    };
    shots.appendChild(im);
  });

  document.querySelectorAll('.tab').forEach((t) => (t.onclick = () => setKind(t.dataset.kind)));
  setKind('idea');

  try {
    const meta = await api({ action: 'meta' });
    const b = $('brand');
    b.innerHTML = '<option value="">(brand ছাড়া)</option>';
    (meta.brands || []).forEach((x) => {
      const o = document.createElement('option');
      o.value = x.id; o.textContent = x.name;
      b.appendChild(o);
    });
    b.value = cfg.brandId || meta.default_brand_id || '';
    b.onchange = () => chrome.storage.sync.set({ brandId: b.value });

    const c = $('competitor');
    c.innerHTML = '<option value="">এই সাইট থেকে auto</option>';
    (meta.competitors || []).forEach((x) => {
      const o = document.createElement('option');
      o.value = x.id; o.textContent = x.name;
      c.appendChild(o);
    });
  } catch (e) {
    $('msg').textContent = String(e.message || e);
    $('msg').className = 'msg err';
  }

  $('save').onclick = save;
}

async function save() {
  const btn = $('save');
  btn.disabled = true;
  $('msg').textContent = 'সেভ হচ্ছে…';
  $('msg').className = 'msg';
  const tags = $('tags').value.split(',').map((s) => s.trim()).filter(Boolean);
  const body = {
    kind: kind,
    brand_id: $('brand').value || null,
    title: $('title').value.trim(),
    url: page.url,
    image_url: chosen,
    images: (page.images || []).slice(0, 6),
    note: $('note').value.trim() || null,
    price: $('price').value ? Number($('price').value) : null,
    tags: tags,
    platform: page.platform,
    asset_type: $('assetType').value,
    competitor_id: $('competitor').value || null,
    competitor_name: page.siteName || page.host,
    competitor_url: page.url
  };
  try {
    await api(body);
    $('msg').textContent = 'সেভ হয়েছে ✅';
    $('msg').className = 'msg ok';
    setTimeout(() => window.close(), 700);
  } catch (e) {
    $('msg').textContent = String(e.message || e);
    $('msg').className = 'msg err';
  } finally {
    btn.disabled = false;
  }
}

init();
`;

const OPTIONS_HTML = `<!doctype html>
<html lang="bn"><head><meta charset="utf-8" /><link rel="stylesheet" href="popup.css" />
<style>body{width:460px}</style></head>
<body>
<header><div class="brandmark">GH</div><div><strong>Growth Hub Capture — Settings</strong><small>token ও server</small></div></header>
<main class="pad">
  <label>Growth Hub URL</label>
  <input id="base" />
  <label>Capture token</label>
  <input id="token" placeholder="Rivals → Browser capture থেকে নাও" />
  <button id="save" class="primary block">সেভ করো</button>
  <button id="test" class="primary block" style="background:#26304a">Connection টেস্ট করো</button>
  <p id="msg" class="msg"></p>
</main>
<script type="module" src="options.js"></script>
</body></html>`;

const OPTIONS_JS = `
import { DEFAULTS } from './config.js';
const $ = (id) => document.getElementById(id);

chrome.storage.sync.get(['base', 'token'], (s) => {
  $('base').value = s.base || DEFAULTS.base;
  $('token').value = s.token || DEFAULTS.token;
});

$('save').onclick = async () => {
  await chrome.storage.sync.set({ base: $('base').value.trim().replace(/\\/$/, ''), token: $('token').value.trim() });
  $('msg').textContent = 'সেভ হয়েছে ✅';
  $('msg').className = 'msg ok';
};

$('test').onclick = async () => {
  $('msg').textContent = 'টেস্ট হচ্ছে…';
  $('msg').className = 'msg';
  try {
    const r = await fetch($('base').value.trim().replace(/\\/$/, '') + '/api/public/hub/capture', {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ token: $('token').value.trim(), action: 'meta' })
    });
    const j = await r.json();
    if (!r.ok || j.error) throw new Error(j.error || ('HTTP ' + r.status));
    $('msg').textContent = 'ঠিক আছে ✅ — ' + (j.brands || []).length + ' brand পাওয়া গেছে';
    $('msg').className = 'msg ok';
  } catch (e) {
    $('msg').textContent = String(e.message || e);
    $('msg').className = 'msg err';
  }
};
`;

const README = (origin: string) => `# Growth Hub Capture — Chrome / Edge extension

## Install (1 মিনিট)
1. এই zip টা যেকোনো ফোল্ডারে **extract** করো।
2. Chrome-এ যাও: chrome://extensions
3. উপরে ডানে **Developer mode** ON করো।
4. **Load unpacked** চাপো → extract করা ফোল্ডারটা select করো।
5. Toolbar-এ GH আইকনে ক্লিক → token পেস্ট করো (Growth Hub → Rivals → Browser capture থেকে)।

Server: ${origin}

## ব্যবহার
- যেকোনো product page-এ আইকনে ক্লিক → **Idea** → সেভ → Product Pipeline-এ চলে আসবে (vote/rating সহ)।
- Facebook / Instagram / TikTok ad বা ভালো লাগা content-এ → **Swipe** → Rivals-এর Swipe file-এ সেভ হবে, rival page auto তৈরি হবে।
- কোনো rival-এর page-এ → **Rival** → Competitor registry-তে যোগ হবে।
- Right-click মেনু থেকেও ছবি/লিংক/selected text এক ক্লিকে সেভ করা যায়।
`;

/** Tiny purple PNG icon (128x128 flat) generated as a data payload. */
const ICON_B64 =
  "iVBORw0KGgoAAAANSUhEUgAAAIAAAACACAYAAADDPmHLAAAAX0lEQVR42u3QMQEAAAgDoJnc6BpjDyRgTlLp1atXr169evXq1atXr169evXq1atXr169evXq1atXr169evXq1atXr169evXq1atXr169evXq1atXr169evXqH1sHUwABKDRlnQAAAABJRU5ErkJggg==";

function b64ToBytes(b64: string) {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

export function extensionFiles(origin: string, token: string | null): ZipEntry[] {
  return [
    { name: "manifest.json", data: MANIFEST(origin) },
    { name: "config.js", data: CONFIG(origin, token) },
    { name: "background.js", data: BACKGROUND },
    { name: "scrape.js", data: SCRAPE },
    { name: "popup.html", data: POPUP_HTML },
    { name: "popup.css", data: POPUP_CSS },
    { name: "popup.js", data: POPUP_JS },
    { name: "options.html", data: OPTIONS_HTML },
    { name: "options.js", data: OPTIONS_JS },
    { name: "icon128.png", data: b64ToBytes(ICON_B64) },
    { name: "README.md", data: README(origin) },
  ];
}
