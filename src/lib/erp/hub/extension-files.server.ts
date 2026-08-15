/** Chrome MV3 extension source, generated per-download with the app origin baked in. */
import type { ZipEntry } from "./zip.server";

const MANIFEST = (origin: string) =>
  JSON.stringify(
    {
      manifest_version: 3,
      name: "Synq With Us",
      version: "3.0.2",
      description:
        "Scrape any product (auto BDT price), competitor page or content inspiration straight into your ERP.",
      permissions: ["activeTab", "scripting", "storage", "contextMenus", "notifications", "tabs"],
      host_permissions: ["<all_urls>"],
      background: { service_worker: "background.js", type: "module" },
      action: { default_popup: "popup.html", default_title: "Synq With Us" },
      commands: {
        "toggle-clip": {
          suggested_key: { default: "Alt+Shift+S" },
          description: "Synq Clip panel খোলো/বন্ধ করো",
        },
      },
      content_scripts: [
        { matches: ["<all_urls>"], js: ["content.js"], run_at: "document_idle", all_frames: false },
      ],
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
// Injected into the page. Deep product / page / content scraper.
(() => {
  const meta = (sel, attr) => {
    const el = document.querySelector(sel);
    return el ? (el.getAttribute(attr || 'content') || '').trim() : '';
  };
  const abs = (u) => { try { return new URL(u, location.href).href; } catch { return null; } };
  const txt = (el) => (el && el.innerText ? el.innerText.trim() : '');

  /* ---------------- JSON-LD ---------------- */
  const ld = [];
  Array.from(document.querySelectorAll('script[type="application/ld+json"]')).forEach((n) => {
    try {
      const parsed = JSON.parse(n.textContent);
      (Array.isArray(parsed) ? parsed : [parsed]).forEach((x) => {
        if (x && x['@graph']) ld.push.apply(ld, x['@graph']); else if (x) ld.push(x);
      });
    } catch (e) {}
  });
  const typeOf = (x) => { const t = x && x['@type']; return Array.isArray(t) ? t.join(',') : (t || ''); };
  const product = ld.find((x) => /Product/i.test(typeOf(x)));
  const profile = ld.find((x) => /ProfilePage|Organization|Person/i.test(typeOf(x)));

  /* ---------------- images ---------------- */
  const imgs = [];
  const push = (u) => { const a = abs(u); if (a && /^https?:/.test(a) && !imgs.includes(a) && !/\\.svg($|\\?)/i.test(a)) imgs.push(a); };
  push(meta('meta[property="og:image"]'));
  push(meta('meta[name="twitter:image"]'));
  if (product && product.image) (Array.isArray(product.image) ? product.image : [product.image]).forEach((im) => push(typeof im === 'string' ? im : im && im.url));
  Array.from(document.querySelectorAll('img')).forEach((im) => {
    const w = im.naturalWidth || im.width, h = im.naturalHeight || im.height;
    if (w >= 200 && h >= 200) push(im.currentSrc || im.src);
    else if (!w && im.getAttribute('data-src')) push(im.getAttribute('data-src'));
  });
  Array.from(document.querySelectorAll('[style*="background-image"]')).slice(0, 40).forEach((el) => {
    const m = /url\\(["']?(.*?)["']?\\)/.exec(el.getAttribute('style') || '');
    if (m) push(m[1]);
  });
  Array.from(document.querySelectorAll('video[poster]')).forEach((v) => push(v.getAttribute('poster')));

  /* ---------------- price + currency ---------------- */
  const num = (v) => { const n = parseFloat(String(v == null ? '' : v).replace(/[^0-9.]/g, '')); return Number.isFinite(n) ? n : null; };
  let price = null, currency = null, sku = null, availability = null, brandName = null;
  if (product) {
    const offer = Array.isArray(product.offers) ? product.offers[0] : product.offers;
    if (offer) {
      price = num(offer.price || offer.lowPrice || (offer.priceSpecification && offer.priceSpecification.price));
      currency = offer.priceCurrency || null;
      availability = typeof offer.availability === 'string' ? offer.availability.split('/').pop() : null;
    }
    sku = product.sku || product.mpn || null;
    brandName = product.brand ? (typeof product.brand === 'string' ? product.brand : product.brand.name) : null;
  }
  if (price == null) price = num(meta('meta[property="product:price:amount"]') || meta('meta[property="og:price:amount"]'));
  if (!currency) currency = meta('meta[property="product:price:currency"]') || meta('meta[property="og:price:currency"]') || null;
  if (price == null) {
    const cand = document.querySelector('[itemprop="price"],.price,.product-price,[class*="price" i]');
    const t = txt(cand);
    const m = t && t.match(/(?:৳|Tk\\.?|BDT|RM|\\$|¥|€|£|USD|CNY)\\s?([0-9][0-9,]{0,9}(?:\\.[0-9]{1,2})?)/i);
    if (m) price = num(m[1]);
  }
  if (price == null) {
    const body = (document.body ? document.body.innerText : '').slice(0, 20000);
    const m = body.match(/(?:৳|Tk\\.?|BDT|RM|\\$|¥|€|£|USD|CNY)\\s?([0-9][0-9,]{1,9}(?:\\.[0-9]{1,2})?)/i);
    if (m) price = num(m[1]);
  }
  if (!currency) {
    const b = (document.body ? document.body.innerText : '').slice(0, 4000);
    currency = /৳|Tk\\.?|BDT/i.test(b) ? 'BDT' : /¥|CNY|RMB|元/i.test(b) ? 'CNY' : /\\$|USD/.test(b) ? 'USD' : null;
  }

  /* ---------------- variants / options ---------------- */
  const variants = [];
  Array.from(document.querySelectorAll('select')).forEach((sel) => {
    const name = (sel.getAttribute('name') || sel.getAttribute('aria-label') || '').toLowerCase();
    if (!/color|colour|size|variant|option|style|model/.test(name)) return;
    const vals = Array.from(sel.options).map((o) => o.text.trim()).filter((v) => v && !/select|choose/i.test(v));
    if (vals.length) variants.push({ name: name, values: vals.slice(0, 20) });
  });
  Array.from(document.querySelectorAll('[data-option-name],[class*="swatch" i]')).slice(0, 40).forEach((el) => {
    const v = txt(el) || el.getAttribute('title') || el.getAttribute('aria-label');
    if (v && v.length < 30) {
      let g = variants.find((x) => x.name === 'options');
      if (!g) { g = { name: 'options', values: [] }; variants.push(g); }
      if (!g.values.includes(v) && g.values.length < 24) g.values.push(v);
    }
  });

  /* ---------------- platform / page ---------------- */
  const host = location.hostname.replace(/^www\\./, '');
  let platform = 'web';
  if (/facebook\\.com/.test(host)) platform = 'facebook';
  else if (/instagram\\.com/.test(host)) platform = 'instagram';
  else if (/tiktok\\.com/.test(host)) platform = 'tiktok';
  else if (/youtube\\.com|youtu\\.be/.test(host)) platform = 'youtube';
  else if (/pinterest\\./.test(host)) platform = 'pinterest';
  else if (/1688\\.com|alibaba\\.com|taobao\\.com|aliexpress\\.|made-in-china|dhgate/.test(host)) platform = 'supplier';
  else if (/shopee|lazada|daraz|amazon\\./.test(host)) platform = 'marketplace';

  let handle = null, followers = null;
  if (platform === 'instagram') {
    const m = location.pathname.match(/^\\/([A-Za-z0-9_.]+)\\/?$/);
    if (m) handle = '@' + m[1];
  } else if (platform === 'facebook') {
    const m = location.pathname.match(/^\\/([A-Za-z0-9_.-]+)\\/?$/);
    if (m && !/profile\\.php|watch|marketplace|groups/.test(m[1])) handle = m[1];
  } else if (platform === 'tiktok') {
    const m = location.pathname.match(/^\\/@([A-Za-z0-9_.]+)/);
    if (m) handle = '@' + m[1];
  }
  const fm = (document.body ? document.body.innerText : '').slice(0, 4000)
    .match(/([0-9][0-9.,]*\\s?[KMkm]?)\\s*(followers|ফলোয়ার|Followers)/);
  if (fm) followers = fm[1].trim();
  const isPage = !!handle;

  const siteName = meta('meta[property="og:site_name"]') || (profile && profile.name) || host;
  const heading = document.querySelector('h1');
  const article = document.querySelector('article, [role="article"], main');

  /* ---------------- listing grid (bulk grab) ---------------- */
  const listing = [];
  try {
    const seen = {};
    Array.from(document.querySelectorAll('a[href]')).forEach((a) => {
      if (listing.length >= 40) return;
      const href = abs(a.getAttribute('href'));
      if (!href || seen[href]) return;
      if (!/\\/(product|products|item|p|dp|goods|offer)[\\/-]/i.test(href)) return;
      const im = a.querySelector('img');
      const src = im ? (im.currentSrc || im.src || im.getAttribute('data-src')) : null;
      const label = (a.getAttribute('title') || (im && im.getAttribute('alt')) || txt(a) || '').trim();
      if (!label) return;
      const pm = txt(a).match(/(?:৳|Tk\\.?|BDT|\\$|¥|€|£)\\s?([0-9][0-9,]{0,9}(?:\\.[0-9]{1,2})?)/i);
      seen[href] = 1;
      listing.push({ url: href, title: label.slice(0, 160), image_url: abs(src || ''), price: pm ? num(pm[1]) : null });
    });
  } catch (e) {}

  return {
    url: (product && product.url ? abs(product.url) : null) || location.href,
    title: ((product && product.name) || meta('meta[property="og:title"]') || txt(heading) || document.title || '').trim().slice(0, 300),
    description: ((product && product.description) || meta('meta[name="description"]') || meta('meta[property="og:description"]') || '').slice(0, 800),
    content: (txt(article) || '').slice(0, 4000),
    selection: (window.getSelection() + '').trim().slice(0, 2000),
    images: imgs.slice(0, 24),
    price: price,
    currency: currency,
    sku: sku,
    availability: availability,
    brand_name: brandName,
    variants: variants.slice(0, 6),
    platform: platform,
    host: host,
    handle: handle,
    followers: followers,
    is_page: isPage,
    is_product: !!product || /product|\\/p\\/|\\/item\\//i.test(location.pathname),
    siteName: siteName,
    listing: listing
  };
})();
`;

const BACKGROUND = `
import { DEFAULTS } from './config.js';

async function readJson(r) {
  const text = await r.text().catch(() => '');
  const head = text.slice(0, 40).trim().toLowerCase();
  if (head.startsWith('<')) {
    throw new Error('Server URL ঠিক নেই — এই ঠিকানা HTML ফেরত দিচ্ছে (login/preview page)। Published app URL দাও।');
  }
  try { return text ? JSON.parse(text) : {}; } catch (e) { return {}; }
}


async function cfg() {
  const s = await chrome.storage.sync.get(['base', 'token', 'brandId', 'email']);
  return { base: s.base || DEFAULTS.base, token: s.token || DEFAULTS.token, brandId: s.brandId || null, email: s.email || null };
}

export async function api(payload) {
  const c = await cfg();
  if (!c.token) throw new Error('আগে Synq extension-এ login করো।');
  let r;
  try {
    r = await fetch(c.base + '/api/public/hub/capture', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(Object.assign({ token: c.token }, payload))
    });
  } catch (e) {
    throw new Error('Server-এ পৌঁছানো গেল না — ' + c.base);
  }
  const j = await readJson(r);
  if (j && j.code === 'invalid_token') {
    await chrome.storage.sync.remove(['token', 'email']);
    throw new Error('Session শেষ — extension আইকনে ক্লিক করে আবার login করো।');
  }
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
    chrome.contextMenus.create({ id: 'gh-idea', title: 'Synq: product idea হিসেবে সেভ', contexts: ['page', 'image', 'link', 'selection'] });
    chrome.contextMenus.create({ id: 'gh-swipe', title: 'Synq: swipe / inspiration সেভ', contexts: ['page', 'image', 'link', 'selection'] });
    chrome.contextMenus.create({ id: 'gh-rival', title: 'Synq: rival page হিসেবে সেভ', contexts: ['page', 'link'] });
  });
});


/* ------- bridge for the in-page clip button ------- */
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  (async () => {
    try {
      if (msg && msg.type === 'gh-scrape') {
        const [res] = await chrome.scripting.executeScript({ target: { tabId: sender.tab.id }, files: ['scrape.js'] });
        const c = await cfg();
        sendResponse({ ok: true, page: (res && res.result) || {}, brandId: c.brandId, hasToken: !!c.token, email: c.email });
      } else if (msg && msg.type === 'gh-meta') {
        const j = await api({ action: 'meta' });
        sendResponse({ ok: true, meta: j });
      } else if (msg && msg.type === 'gh-save') {
        if (msg.payload && msg.payload.brand_id) await chrome.storage.sync.set({ brandId: msg.payload.brand_id });
        const j = await api(msg.payload);
        sendResponse({ ok: true, result: j });
      } else {
        sendResponse({ ok: false, error: 'unknown message' });
      }
    } catch (e) {
      sendResponse({ ok: false, error: String(e.message || e) });
    }
  })();
  return true;
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
      notify('Synq With Us', 'Product idea সেভ হয়েছে ✅');
    } else if (info.menuItemId === 'gh-swipe') {
      await api(Object.assign({ kind: 'swipe', asset_type: 'ad', competitor_name: page.siteName, competitor_url: page.url }, common));
      notify('Synq With Us', 'Swipe সেভ হয়েছে ✅');
    } else {
      await api({ kind: 'competitor', brand_id: c.brandId, name: page.siteName || page.host, url: info.linkUrl || page.url, platform: page.platform });
      notify('Synq With Us', 'Rival page সেভ হয়েছে ✅');
    }
  } catch (e) {
    notify('Synq — ব্যর্থ', String(e.message || e));
  }
});

/* ------- keyboard shortcut: toggle the in-page clip panel ------- */
chrome.commands.onCommand.addListener(async (command) => {
  if (command !== 'toggle-clip') return;
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab || !tab.id) return;
  try {
    await chrome.scripting.executeScript({ target: { tabId: tab.id }, files: ['content.js'] });
  } catch (e) { /* already injected */ }
  try {
    await chrome.tabs.sendMessage(tab.id, { type: 'gh-toggle' });
  } catch (e) { /* ignore */ }
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
    <div class="brandmark">S</div>
    <div>
      <strong>Synq With Us</strong>
      <small id="host">…</small>
    </div>
    <button id="settings" class="ghost" title="Settings">⚙</button>
  </header>

  <div id="login" class="hidden pad">
    <div class="hero">
      <div class="orb">S</div>
      <h2>Synq With Us</h2>
      <p class="muted">তোমার ERP account দিয়ে login করো — যেকোনো website থেকে product, rival page ও content সরাসরি Growth Hub-এ যাবে।</p>
    </div>
    <label>Email or username</label>
    <input id="email" type="text" placeholder="you@company.com / yourname" autocomplete="username" />
    <label>Password</label>
    <input id="password" type="password" placeholder="••••••••" autocomplete="current-password" />
    <button id="loginBtn" class="primary block">Login</button>
    <details class="adv">
      <summary>Advanced</summary>
      <label>Server URL</label>
      <input id="loginBase" />
      <label>অথবা capture token</label>
      <input id="setupToken" placeholder="Token পেস্ট করো" />
      <button id="setupSave" class="primary block" style="background:#26304a">Token দিয়ে ঢুকো</button>
    </details>
    <p id="loginMsg" class="msg"></p>
  </div>

  <main id="app" class="hidden">
    <div class="who"><span id="who"></span><button id="logout" class="link">Logout</button></div>
    <div class="views">
      <button class="vt on" data-v="capture">Capture</button>
      <button class="vt" data-v="recent">Recent</button>
    </div>
    <div id="vCapture">
    <div class="tabs">
      <button class="tab on" data-kind="idea">🛍 Product</button>
      <button class="tab" data-kind="competitor">🏴 Competitor</button>
      <button class="tab" data-kind="swipe">🎬 Content</button>
    </div>

    <div class="shots" id="shots"></div>

    <label>Title / Page name</label>
    <input id="title" />

    <label>Brand</label>
    <select id="brand"></select>

    <!-- PRODUCT -->
    <div id="wProduct">
      <div class="row">
        <div>
          <label>Price</label>
          <input id="price" type="number" step="0.01" />
        </div>
        <div>
          <label>Currency</label>
          <select id="currency"></select>
        </div>
      </div>
      <p class="conv" id="conv"></p>
      <label>Stage</label>
      <select id="stage">
        <option value="voting">🗳 Voting-এ পাঠাও</option>
        <option value="idea">💡 Idea</option>
      </select>
    </div>

    <!-- COMPETITOR -->
    <div id="wRivalPage" class="hidden">
      <label>Niche / কি নিয়ে কাজ করে</label>
      <input id="niche" placeholder="kids toys, gadgets, hobby…" />
      <div class="row">
        <div>
          <label>Type</label>
          <select id="pageType">
            <option value="website">Website</option>
            <option value="social">Social page</option>
          </select>
        </div>
        <div>
          <label>Threat</label>
          <select id="threat">
            <option value="low">Low</option>
            <option value="medium" selected>Medium</option>
            <option value="high">High</option>
          </select>
        </div>
      </div>
      <p class="conv" id="pageInfo"></p>
    </div>

    <!-- CONTENT -->
    <div id="wContent" class="hidden">
      <div class="row">
        <div>
          <label>Type</label>
          <select id="assetType">
            <option value="ad">Ad</option>
            <option value="organic">Organic post</option>
            <option value="creative">Creative / reel</option>
            <option value="landing">Landing page</option>
            <option value="product">Product page</option>
          </select>
        </div>
        <div>
          <label>Competitor (optional)</label>
          <select id="competitor"></select>
        </div>
      </div>
      <label>Hook / কেন ভালো</label>
      <input id="hook" placeholder="প্রথম ৩ সেকেন্ডের hook…" />
    </div>

    <label>Note</label>
    <textarea id="note" rows="2"></textarea>

    <label>Tags (কমা দিয়ে)</label>
    <input id="tags" placeholder="winner, hook, ugc" />

    <button id="save" class="primary block">Synq করো</button>
    <button id="bulk" class="ghostbtn block hidden">এই পেজের সব product ধরো</button>
    <p id="msg" class="msg"></p>
    </div>
    <div id="vRecent" class="hidden feed"></div>
  </main>
<script type="module" src="popup.js"></script>
</body>
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
.hero { text-align:center; padding:6px 0 4px; }
.hero .orb { width:52px; height:52px; margin:0 auto 8px; border-radius:16px; background:linear-gradient(135deg,#6366f1,#a855f7); display:flex; align-items:center; justify-content:center; font-weight:800; font-size:20px; color:#fff; box-shadow:0 10px 26px rgba(99,102,241,.45); }
.hero h2 { margin:0 0 4px; font-size:15px; }
.adv { margin-top:12px; }
.adv summary { color:var(--mut); font-size:11px; cursor:pointer; }
.who { display:flex; align-items:center; gap:8px; font-size:11px; color:var(--mut); margin-bottom:8px; }
.link { margin-left:auto; background:none; border:none; color:#a5b4fc; font-size:11px; cursor:pointer; text-decoration:underline; }
.views { display:flex; gap:4px; padding:3px; border-radius:10px; background:var(--card); border:1px solid var(--line); margin-bottom:10px; }
.vt { flex:1; padding:6px 0; font-size:11.5px; border:none; border-radius:8px; background:transparent; color:var(--mut); cursor:pointer; }
.vt.on { background:rgba(99,102,241,.2); color:#c7cbff; font-weight:600; }
.ghostbtn { background:transparent; border:1px dashed var(--line); color:var(--mut); border-radius:9px; padding:8px 0; font-size:12px; cursor:pointer; }
.ghostbtn:hover { color:#c7cbff; border-color:var(--acc); }
.feed { display:flex; flex-direction:column; gap:6px; }
.feed .it { display:flex; gap:8px; align-items:center; padding:6px; border:1px solid var(--line); border-radius:10px; background:var(--card); }
.feed .it img { width:34px; height:34px; border-radius:7px; object-fit:cover; background:#222; flex:none; }
.feed .it b { font-size:11.5px; font-weight:500; display:block; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
.feed .it small { color:var(--mut); font-size:10px; }
.conv { font-size:11px; color:#a5b4fc; margin:6px 0 0; min-height:14px; }
`;


const POPUP_JS = `
import { DEFAULTS } from './config.js';

async function readJson(r) {
  const text = await r.text().catch(() => '');
  const head = text.slice(0, 40).trim().toLowerCase();
  if (head.startsWith('<')) {
    throw new Error('Server URL ঠিক নেই — এই ঠিকানা HTML ফেরত দিচ্ছে (login/preview page)। Published app URL দাও।');
  }
  try { return text ? JSON.parse(text) : {}; } catch (e) { return {}; }
}


const $ = (id) => document.getElementById(id);
let kind = 'idea';
let page = {};
let chosen = null;
let cfg = {};
let fx = { BDT: 1 };
const CCY = ['BDT','USD','PKR','INR','CNY','EUR','GBP','AED','SAR','MYR','THB','SGD','AUD','CAD','TRY','IDR','VND','JPY','KRW','NPR','LKR'];

function normBase(v) {
  let b = String(v || '').trim().replace(/\\/+$/, '');
  if (!b) return DEFAULTS.base;
  if (!/^https?:\\/\\//i.test(b)) b = 'https://' + b;
  // Editor preview hosts are auth-gated (they return an HTML login page), so
  // fall back to the real app URL baked in at download time.
  if (/lovableproject\\.com|id-preview/i.test(b)) return DEFAULTS.base;
  return b;
}

async function forceLogout(reason) {
  await chrome.storage.sync.remove(['token', 'email']);
  try { sessionStorage.setItem('gh-login-msg', reason || ''); } catch (e) {}
  location.reload();
}

async function loadCfg() {
  const s = await chrome.storage.sync.get(['base', 'token', 'brandId', 'email']);
  cfg = { base: normBase(s.base || DEFAULTS.base), token: s.token || DEFAULTS.token, brandId: s.brandId || '', email: s.email || '' };
}

async function api(payload) {
  let r;
  try {
    r = await fetch(cfg.base + '/api/public/hub/capture', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(Object.assign({ token: cfg.token }, payload))
    });
  } catch (e) {
    throw new Error('Server-এ পৌঁছানো গেল না — ' + cfg.base);
  }
  const j = await readJson(r);
  if (j && j.code === 'invalid_token') { await forceLogout(j.error || 'Session শেষ — আবার login করো'); throw new Error(j.error || 'Session শেষ'); }
  if (!r.ok || j.error) throw new Error(j.error || ('HTTP ' + r.status));
  return j;
}

function setKind(k) {
  kind = k;
  document.querySelectorAll('.tab').forEach((t) => t.classList.toggle('on', t.dataset.kind === k));
  $('wProduct').classList.toggle('hidden', k !== 'idea');
  $('wRivalPage').classList.toggle('hidden', k !== 'competitor');
  $('wContent').classList.toggle('hidden', k !== 'swipe');
  $('save').textContent = k === 'idea' ? '🛍 Product Synq করো' : k === 'competitor' ? '🏴 Competitor সেভ করো' : '🎬 Content সেভ করো';
}

function renderConv() {
  const p = Number($('price').value);
  const c = $('currency').value || 'BDT';
  const rate = fx[c] || 1;
  if (!Number.isFinite(p) || p <= 0) { $('conv').textContent = ''; return; }
  if (c === 'BDT') { $('conv').textContent = '৳ ' + p.toLocaleString(); return; }
  $('conv').textContent = p + ' ' + c + ' ≈ ৳ ' + Math.round(p * rate).toLocaleString() + '  (1 ' + c + ' = ৳' + (Math.round(rate * 100) / 100) + ')';
}

async function init() {
  await loadCfg();
  $('settings').onclick = () => chrome.runtime.openOptionsPage();
  if (!cfg.token) {
    $('login').classList.remove('hidden');
    $('loginBase').value = cfg.base;
    const say = (t, cls) => { $('loginMsg').textContent = t; $('loginMsg').className = 'msg ' + (cls || ''); };
    try {
      const prev = sessionStorage.getItem('gh-login-msg');
      if (prev) { say(prev, 'err'); sessionStorage.removeItem('gh-login-msg'); }
    } catch (e) {}
    const doLogin = async () => {
      const email = $('email').value.trim();
      const password = $('password').value;
      const base = normBase($('loginBase').value || cfg.base);
      $('loginBase').value = base;
      if (!email || !password) return say('Email/username ও password দাও', 'err');
      $('loginBtn').disabled = true;
      say('Login হচ্ছে…');
      try {
        const r = await fetch(base + '/api/public/hub/capture', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ action: 'login', email: email, password: password })
        });
        const j = await readJson(r);
        if (!r.ok || j.error) throw new Error(j.error || ('HTTP ' + r.status));
        await chrome.storage.sync.set({ base: base, token: j.token, email: j.email || email, brandId: j.default_brand_id || '' });
        say('স্বাগতম ✅', 'ok');
        setTimeout(() => location.reload(), 400);
      } catch (e) {
        say(String((e && e.message) || e) === 'Failed to fetch' ? ('Server-এ পৌঁছানো গেল না — ' + base) : String((e && e.message) || e), 'err');
      } finally {
        $('loginBtn').disabled = false;
      }
    };
    $('loginBtn').onclick = doLogin;
    $('password').onkeydown = (e) => { if (e.key === 'Enter') doLogin(); };
    $('email').onkeydown = (e) => { if (e.key === 'Enter') doLogin(); };
    setTimeout(() => { try { $('email').focus(); } catch (e) {} }, 50);
    $('setupSave').onclick = async () => {
      const t = $('setupToken').value.trim();
      if (!t) return;
      await chrome.storage.sync.set({ token: t, base: normBase($('loginBase').value || cfg.base) });
      location.reload();
    };
    return;
  }
  $('app').classList.remove('hidden');
  $('who').textContent = cfg.email ? ('Logged in — ' + cfg.email) : 'Logged in';
  $('logout').onclick = async () => {
    try { await api({ action: 'logout' }); } catch (e) {}
    await chrome.storage.sync.remove(['token', 'email']);
    location.reload();
  };

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

  const cs = $('currency');
  cs.innerHTML = '';
  CCY.forEach((c) => { const o = document.createElement('option'); o.value = c; o.textContent = c; cs.appendChild(o); });
  cs.value = (page.currency && CCY.indexOf(String(page.currency).toUpperCase()) >= 0) ? String(page.currency).toUpperCase() : 'BDT';
  cs.onchange = renderConv;
  $('price').oninput = renderConv;
  renderConv();

  if (page.handle || page.followers || page.siteName) {
    const bits = [];
    if (page.handle) bits.push(page.handle);
    if (page.followers) bits.push(page.followers + ' followers');
    if (page.platform && page.platform !== 'web') bits.push(page.platform);
    $('pageInfo').textContent = bits.join(' · ');
  }
  $('pageType').value = (page.is_page || (page.platform && page.platform !== 'web')) ? 'social' : 'website';

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
  setKind(page.is_page ? 'competitor' : (page.is_product || page.platform === 'supplier' || page.platform === 'marketplace') ? 'idea' : 'swipe');

  /* view switcher */
  document.querySelectorAll('.vt').forEach((v) => (v.onclick = () => {
    document.querySelectorAll('.vt').forEach((x) => x.classList.toggle('on', x === v));
    const rec = v.dataset.v === 'recent';
    $('vCapture').classList.toggle('hidden', rec);
    $('vRecent').classList.toggle('hidden', !rec);
    if (rec) loadRecent();
  }));

  /* bulk grab from listing pages */
  const list = (page.listing || []).filter((x) => x && x.title);
  if (list.length >= 3) {
    const b = $('bulk');
    b.classList.remove('hidden');
    b.textContent = 'এই পেজের সব product ধরো (' + list.length + ')';
    b.onclick = async () => {
      b.disabled = true;
      $('msg').textContent = list.length + ' টা সেভ হচ্ছে…';
      $('msg').className = 'msg';
      try {
        const r = await api({ action: 'bulk', brand_id: $('brand').value || null, items: list, tags: ['bulk'], currency: $('currency').value });
        $('msg').textContent = (r.count || 0) + ' টা idea সেভ হয়েছে ✅';
        $('msg').className = 'msg ok';
      } catch (e) {
        $('msg').textContent = String(e.message || e);
        $('msg').className = 'msg err';
      }
      b.disabled = false;
    };
  }

  try {
    const meta = await api({ action: 'meta' });
    if (meta.fx) { fx = Object.assign(fx, meta.fx); renderConv(); }
    const b = $('brand');
    b.innerHTML = '';
    (meta.brands || []).forEach((x) => {
      const o = document.createElement('option');
      o.value = x.id; o.textContent = x.name;
      b.appendChild(o);
    });
    b.value = cfg.brandId || meta.default_brand_id || ((meta.brands || [])[0] || {}).id || '';
    b.onchange = () => chrome.storage.sync.set({ brandId: b.value });

    const c = $('competitor');
    c.innerHTML = '<option value="">লিংক করব না</option>';
    (meta.competitors || []).forEach((x) => {
      const o = document.createElement('option');
      o.value = x.id; o.textContent = x.name + (x.niche ? ' · ' + x.niche : '');
      c.appendChild(o);
    });
  } catch (e) {
    $('msg').textContent = String(e.message || e);
    $('msg').className = 'msg err';
  }

  $('save').onclick = save;
}

async function loadRecent() {
  const box = $('vRecent');
  box.innerHTML = '<p class="muted">লোড হচ্ছে…</p>';
  try {
    const r = await api({ action: 'recent' });
    const items = r.items || [];
    if (!items.length) { box.innerHTML = '<p class="muted">এখনো কিছু সেভ করোনি।</p>'; return; }
    const icon = { idea: '💡', swipe: '🎨', competitor: '🏴' };
    box.innerHTML = '';
    items.forEach((it) => {
      const d = document.createElement('div');
      d.className = 'it';
      const img = document.createElement('img');
      img.src = it.image || '';
      img.onerror = () => { img.style.visibility = 'hidden'; };
      const t = document.createElement('div');
      t.style.minWidth = '0';
      t.innerHTML = '<b></b><small></small>';
      t.querySelector('b').textContent = it.title || '(no title)';
      t.querySelector('small').textContent = (icon[it.kind] || '') + ' ' + it.kind + ' · ' + String(it.at || '').slice(0, 10);
      d.appendChild(img); d.appendChild(t);
      box.appendChild(d);
    });
  } catch (e) {
    box.innerHTML = '<p class="msg err"></p>';
    box.querySelector('p').textContent = String(e.message || e);
  }
}

async function save() {
  const btn = $('save');
  btn.disabled = true;
  $('msg').textContent = 'সেভ হচ্ছে…';
  $('msg').className = 'msg';
  const tags = $('tags').value.split(',').map((s) => s.trim()).filter(Boolean);
  const extra = [];
  if (page.sku) extra.push('SKU: ' + page.sku);
  if ($('price').value) extra.push('Listed: ' + $('price').value + ' ' + $('currency').value);
  (page.variants || []).forEach((v) => extra.push(v.name + ': ' + v.values.join(', ')));
  if (page.followers) extra.push('Followers: ' + page.followers);
  if (page.handle) extra.push('Handle: ' + page.handle);
  const noteFull = [$('note').value.trim(), extra.join(' | ')].filter(Boolean).join('\\n');
  const body = {
    kind: kind,
    brand_id: $('brand').value || null,
    name: $('title').value.trim(),
    title: $('title').value.trim(),
    url: page.url,
    image_url: chosen,
    images: (page.images || []).slice(0, 8),
    note: noteFull || null,
    price: $('price').value ? Number($('price').value) : null,
    currency: $('currency').value || 'BDT',
    status: $('stage').value,
    niche: $('niche').value.trim() || null,
    handle: page.handle || null,
    followers: page.followers || null,
    threat_level: $('threat').value,
    hook: $('hook').value.trim() || null,
    link_competitor: !!$('competitor').value,
    tags: tags,
    platform: page.platform,
    asset_type: $('assetType').value,
    competitor_id: $('competitor').value || null,
    competitor_name: page.handle || page.siteName || page.host,
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


const CONTENT_JS = `
/* Synq With Us — floating clip button + quick capture panel */
(() => {
  if (window.__ghClipMounted) return;
  window.__ghClipMounted = true;

  const send = (msg) => new Promise((res) => chrome.runtime.sendMessage(msg, (r) => res(r || { ok: false, error: 'no response' })));

  const host = document.createElement('div');
  host.id = 'gh-clip-host';
  host.style.cssText = 'position:fixed;z-index:2147483647;top:0;left:0;width:0;height:0;';
  const root = host.attachShadow({ mode: 'open' });
  document.documentElement.appendChild(host);

  const css = document.createElement('style');
  css.textContent = \`
    .fab{position:fixed;top:96px;right:14px;width:38px;height:38px;border-radius:12px;border:none;cursor:pointer;
      background:linear-gradient(135deg,#6366f1,#a855f7);color:#fff;font-size:17px;line-height:1;
      box-shadow:0 8px 22px rgba(79,70,229,.42);display:flex;align-items:center;justify-content:center;
      opacity:.55;transition:opacity .18s, transform .18s;}
    .fab:hover{opacity:1;transform:translateY(-1px) scale(1.05);}
    .panel{position:fixed;top:96px;right:60px;width:320px;max-height:78vh;overflow:auto;border-radius:16px;
      background:#0f1421;color:#e8ecf7;border:1px solid #26304a;box-shadow:0 24px 60px rgba(0,0,0,.5);
      font:13px/1.45 ui-sans-serif,system-ui,"Segoe UI",Roboto,sans-serif;padding:12px;display:none;}
    .panel.on{display:block;}
    .hd{display:flex;align-items:center;gap:8px;margin-bottom:10px;}
    .hd b{font-size:13px;} .hd small{color:#8e9ab8;font-size:11px;}
    .x{margin-left:auto;background:none;border:none;color:#8e9ab8;cursor:pointer;font-size:15px;}
    .tabs{display:flex;gap:5px;margin-bottom:9px;}
    .tab{flex:1;padding:6px 0;font-size:11px;border-radius:8px;border:1px solid #26304a;background:transparent;color:#8e9ab8;cursor:pointer;}
    .tab.on{border-color:#6366f1;background:rgba(99,102,241,.16);color:#c7cbff;}
    label{display:block;font-size:10px;color:#8e9ab8;margin:8px 0 3px;text-transform:uppercase;letter-spacing:.04em;}
    input,select,textarea{width:100%;padding:6px 8px;font-size:12px;border-radius:8px;border:1px solid #26304a;background:#141a2a;color:#e8ecf7;box-sizing:border-box;font-family:inherit;}
    .shots{display:flex;gap:5px;overflow-x:auto;padding-bottom:4px;}
    .shots img{height:52px;width:52px;object-fit:cover;border-radius:8px;border:2px solid transparent;cursor:pointer;flex:none;background:#222;}
    .shots img.on{border-color:#6366f1;}
    .row{display:flex;gap:7px;} .row>div{flex:1;min-width:0;}
    .go{width:100%;margin-top:11px;padding:9px 0;border:none;border-radius:10px;cursor:pointer;font-weight:600;font-size:12.5px;
      background:linear-gradient(135deg,#6366f1,#8b5cf6);color:#fff;}
    .go:disabled{opacity:.6;cursor:default;}
    .msg{font-size:11px;margin:7px 0 0;min-height:13px;color:#8e9ab8;}
    .msg.ok{color:#4ade80;} .msg.err{color:#f87171;}
    .chip{font-size:10px;color:#c7cbff;background:rgba(99,102,241,.16);border-radius:999px;padding:2px 7px;}
  \`;
  root.appendChild(css);

  const wrap = document.createElement('div');
  wrap.innerHTML = \`
    <button class="fab" title="Synq With Us — clip করো">🔖</button>
    <div class="panel">
      <div class="hd"><b>Synq Clip</b><span class="chip" id="ghPlat"></span><button class="x">✕</button></div>
      <div class="tabs">
        <button class="tab on" data-kind="idea">🛍 Product</button>
        <button class="tab" data-kind="competitor">🏴 Competitor</button>
        <button class="tab" data-kind="swipe">🎬 Content</button>
      </div>
      <div class="shots" id="ghShots"></div>
      <label>Title</label><input id="ghTitle" />
      <label>Brand</label><select id="ghBrand"></select>
      <div class="row">
        <div id="ghPriceWrap"><label>Price</label><input id="ghPrice" type="number" step="0.01" /></div>
        <div id="ghCcyWrap"><label>Currency</label><select id="ghCcy"></select></div>
        <div id="ghTypeWrap"><label>Type</label>
          <select id="ghType">
            <option value="ad">Ad</option><option value="organic">Organic post</option>
            <option value="landing">Landing page</option><option value="product">Product page</option>
            <option value="creative">Creative</option>
          </select>
        </div>
      </div>
      <p class="msg" id="ghConv"></p>
      <div id="ghNicheWrap"><label>Niche</label><input id="ghNiche" placeholder="kids toys, gadgets…" /></div>
      <label>Note</label><textarea id="ghNote" rows="2"></textarea>
      <label>Tags (কমা দিয়ে)</label><input id="ghTags" placeholder="winner, hook, ugc" />
      <button class="go" id="ghGo">Synq করো</button>
      <p class="msg" id="ghMsg"></p>
    </div>\`;
  root.appendChild(wrap);

  const $ = (id) => root.getElementById(id);
  const panel = root.querySelector('.panel');
  const fab = root.querySelector('.fab');
  let page = {}, chosen = null, kind = 'idea', loaded = false, fx = { BDT: 1 };
  const CCY = ['BDT','USD','PKR','INR','CNY','EUR','GBP','AED','SAR','MYR','THB','SGD','AUD','CAD','TRY','IDR','VND','JPY','KRW','NPR','LKR'];

  function conv() {
    const p = Number($('ghPrice').value), c = $('ghCcy').value || 'BDT', rate = fx[c] || 1;
    if (!Number.isFinite(p) || p <= 0) { $('ghConv').textContent = ''; return; }
    $('ghConv').textContent = c === 'BDT' ? ('৳ ' + p) : (p + ' ' + c + ' ≈ ৳ ' + Math.round(p * rate));
  }

  function setKind(k) {
    kind = k;
    root.querySelectorAll('.tab').forEach((t) => t.classList.toggle('on', t.dataset.kind === k));
    $('ghTypeWrap').style.display = k === 'swipe' ? 'block' : 'none';
    $('ghPriceWrap').style.display = k === 'idea' ? 'block' : 'none';
    $('ghCcyWrap').style.display = k === 'idea' ? 'block' : 'none';
    $('ghNicheWrap').style.display = k === 'competitor' ? 'block' : 'none';
    conv();
  }
  root.querySelectorAll('.tab').forEach((t) => (t.onclick = () => setKind(t.dataset.kind)));
  root.querySelector('.x').onclick = () => panel.classList.remove('on');

  async function load() {
    const r = await send({ type: 'gh-scrape' });
    if (!r.ok) { $('ghMsg').textContent = r.error; $('ghMsg').className = 'msg err'; return; }
    if (!r.hasToken) {
      $('ghMsg').textContent = 'আগে extension আইকনে ক্লিক করে login করো।';
      $('ghMsg').className = 'msg err';
    }
    page = r.page || {};
    $('ghPlat').textContent = page.platform || 'web';
    $('ghTitle').value = page.title || document.title;
    $('ghNote').value = (page.selection || page.description || '').slice(0, 500);
    if (page.price) $('ghPrice').value = page.price;
    const cs = $('ghCcy');
    cs.innerHTML = '';
    CCY.forEach((c) => { const o = document.createElement('option'); o.value = c; o.textContent = c; cs.appendChild(o); });
    cs.value = (page.currency && CCY.indexOf(String(page.currency).toUpperCase()) >= 0) ? String(page.currency).toUpperCase() : 'BDT';
    cs.onchange = conv;
    $('ghPrice').oninput = conv;
    if (page.is_page) setKind('competitor'); else if (!page.is_product && page.platform !== 'web') setKind('swipe');

    const shots = $('ghShots');
    shots.innerHTML = '';
    (page.images || []).forEach((src, i) => {
      const im = document.createElement('img');
      im.src = src; im.onerror = () => im.remove();
      if (i === 0) { im.classList.add('on'); chosen = src; }
      im.onclick = () => { shots.querySelectorAll('img').forEach((x) => x.classList.remove('on')); im.classList.add('on'); chosen = src; };
      shots.appendChild(im);
    });

    const m = await send({ type: 'gh-meta' });
    const b = $('ghBrand');
    b.innerHTML = '';
    if (m.ok) {
      if (m.meta.fx) fx = Object.assign(fx, m.meta.fx);
      conv();
      (m.meta.brands || []).forEach((x) => {
        const o = document.createElement('option'); o.value = x.id; o.textContent = x.name; b.appendChild(o);
      });
      b.value = r.brandId || m.meta.default_brand_id || (m.meta.brands && m.meta.brands[0] ? m.meta.brands[0].id : '');
    } else {
      $('ghMsg').textContent = m.error; $('ghMsg').className = 'msg err';
    }
    loaded = true;
  }

  fab.onclick = async () => {
    panel.classList.toggle('on');
    if (panel.classList.contains('on') && !loaded) await load();
    else if (panel.classList.contains('on')) {
      const sel = (window.getSelection() + '').trim();
      if (sel) $('ghNote').value = sel.slice(0, 2000);
    }
  };

  chrome.runtime.onMessage.addListener((msg) => {
    if (msg && msg.type === 'gh-toggle') fab.onclick();
  });

  $('ghGo').onclick = async () => {
    const btn = $('ghGo');
    btn.disabled = true;
    $('ghMsg').textContent = 'সেভ হচ্ছে…'; $('ghMsg').className = 'msg';
    const extra = [];
    if (page.sku) extra.push('SKU: ' + page.sku);
    if ($('ghPrice').value) extra.push('Listed: ' + $('ghPrice').value + ' ' + $('ghCcy').value);
    (page.variants || []).forEach((v) => extra.push(v.name + ': ' + v.values.join(', ')));
    if (page.followers) extra.push('Followers: ' + page.followers);
    const note = [$('ghNote').value.trim(), extra.join(' | ')].filter(Boolean).join('\\n');
    const payload = {
      kind: kind,
      brand_id: $('ghBrand').value || null,
      title: $('ghTitle').value.trim(),
      name: $('ghTitle').value.trim(),
      url: page.url || location.href,
      image_url: chosen,
      images: (page.images || []).slice(0, 8),
      note: note || null,
      price: $('ghPrice').value ? Number($('ghPrice').value) : null,
      currency: $('ghCcy').value || 'BDT',
      status: 'voting',
      niche: $('ghNiche').value.trim() || null,
      handle: page.handle || null,
      followers: page.followers || null,
      tags: $('ghTags').value.split(',').map((s) => s.trim()).filter(Boolean),
      platform: page.platform,
      asset_type: $('ghType').value,
      competitor_name: page.handle || page.siteName || page.host,
      competitor_url: page.url || location.href
    };
    const r = await send({ type: 'gh-save', payload: payload });
    if (r.ok) {
      $('ghMsg').textContent = 'সেভ হয়েছে ✅'; $('ghMsg').className = 'msg ok';
      setTimeout(() => panel.classList.remove('on'), 800);
    } else {
      $('ghMsg').textContent = r.error; $('ghMsg').className = 'msg err';
    }
    btn.disabled = false;
  };
})();
`;

const OPTIONS_HTML = `<!doctype html>
<html lang="bn"><head><meta charset="utf-8" /><link rel="stylesheet" href="popup.css" />
<style>body{width:460px}</style></head>
<body>
<header><div class="brandmark">S</div><div><strong>Synq With Us — Settings</strong><small id="acct">account, server ও token</small></div></header>
<main class="pad">
  <label>Server URL</label>
  <input id="base" />
  <label>Email or username</label>
  <input id="email" type="text" placeholder="you@company.com / yourname" autocomplete="username" />
  <label>Password</label>
  <input id="password" type="password" placeholder="••••••••" autocomplete="current-password" />
  <button id="login" class="primary block">Login করে token নাও</button>
  <label>Capture token</label>
  <input id="token" placeholder="login করলে অটো বসবে" />
  <button id="save" class="primary block">সেভ করো</button>
  <button id="test" class="primary block" style="background:#26304a">Connection টেস্ট করো</button>
  <button id="logout" class="primary block" style="background:#26304a">Logout</button>
  <p id="msg" class="msg"></p>
</main>
<script type="module" src="options.js"></script>
</body></html>`;

const OPTIONS_JS = `
import { DEFAULTS } from './config.js';

async function readJson(r) {
  const text = await r.text().catch(() => '');
  const head = text.slice(0, 40).trim().toLowerCase();
  if (head.startsWith('<')) {
    throw new Error('Server URL ঠিক নেই — এই ঠিকানা HTML ফেরত দিচ্ছে (login/preview page)। Published app URL দাও।');
  }
  try { return text ? JSON.parse(text) : {}; } catch (e) { return {}; }
}

const $ = (id) => document.getElementById(id);

function normBase(v) {
  let b = String(v || '').trim().replace(/\\/+$/, '');
  if (!b) return DEFAULTS.base;
  if (!/^https?:\\/\\//i.test(b)) b = 'https://' + b;
  // Editor preview hosts are auth-gated (they return an HTML login page), so
  // fall back to the real app URL baked in at download time.
  if (/lovableproject\\.com|id-preview/i.test(b)) return DEFAULTS.base;
  return b;
}
const baseUrl = () => { const b = normBase($('base').value); $('base').value = b; return b; };

chrome.storage.sync.get(['base', 'token', 'email'], (s) => {
  $('base').value = normBase(s.base || DEFAULTS.base);
  $('token').value = s.token || DEFAULTS.token;
  $('email').value = s.email || '';
  $('acct').textContent = s.email ? ('Logged in — ' + s.email) : 'logged out';
});

$('save').onclick = async () => {
  await chrome.storage.sync.set({ base: baseUrl(), token: $('token').value.trim() });
  $('msg').textContent = 'সেভ হয়েছে ✅';
  $('msg').className = 'msg ok';
};

$('login').onclick = async () => {
  $('msg').textContent = 'Login হচ্ছে…';
  $('msg').className = 'msg';
  try {
    const r = await fetch(baseUrl() + '/api/public/hub/capture', {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ action: 'login', email: $('email').value.trim(), password: $('password').value })
    });
    const j = await readJson(r);
    if (!r.ok || j.error) throw new Error(j.error || ('HTTP ' + r.status));
    $('token').value = j.token;
    await chrome.storage.sync.set({ base: baseUrl(), token: j.token, email: j.email || $('email').value.trim(), brandId: j.default_brand_id || '' });
    $('password').value = '';
    $('acct').textContent = 'Logged in — ' + (j.email || '');
    $('msg').textContent = 'Login হয়েছে ✅ — ' + (j.brands || []).length + ' brand';
    $('msg').className = 'msg ok';
  } catch (e) {
    $('msg').textContent = String(e.message || e);
    $('msg').className = 'msg err';
  }
};

$('logout').onclick = async () => {
  try {
    await fetch(baseUrl() + '/api/public/hub/capture', {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ action: 'logout', token: $('token').value.trim() })
    });
  } catch (e) { /* ignore */ }
  await chrome.storage.sync.remove(['token', 'email']);
  $('token').value = '';
  $('acct').textContent = 'logged out';
  $('msg').textContent = 'Logout হয়েছে';
  $('msg').className = 'msg ok';
};

$('test').onclick = async () => {
  $('msg').textContent = 'টেস্ট হচ্ছে…';
  $('msg').className = 'msg';
  try {
    const r = await fetch(baseUrl() + '/api/public/hub/capture', {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ token: $('token').value.trim(), action: 'meta' })
    });
    const j = await readJson(r);
    if (j && j.code === 'invalid_token') {
      await chrome.storage.sync.remove(['token', 'email']);
      $('token').value = '';
      $('acct').textContent = 'logged out';
      throw new Error('Session শেষ — আবার login করো');
    }
    if (!r.ok || j.error) throw new Error(j.error || ('HTTP ' + r.status));
    $('msg').textContent = 'ঠিক আছে ✅ — ' + (j.brands || []).length + ' brand পাওয়া গেছে';
    $('msg').className = 'msg ok';
  } catch (e) {
    $('msg').textContent = String(e.message || e);
    $('msg').className = 'msg err';
  }
};
`;

const README = (origin: string) => `# Synq With Us — Chrome / Edge extension

## Install (1 মিনিট)
1. এই zip টা যেকোনো ফোল্ডারে **extract** করো।
2. Chrome-এ যাও: chrome://extensions
3. উপরে ডানে **Developer mode** ON করো।
4. **Load unpacked** চাপো → extract করা ফোল্ডারটা select করো।
5. Toolbar-এ **Synq** আইকনে ক্লিক → তোমার ERP **email/username + password** দিয়ে **Login** করো। (token লাগবে না — auto তৈরি হয়।)

Server: ${origin}

## Login
- একই email/password যেটা দিয়ে ERP-তে ঢোকো।
- Login করলে তোমার brand list অটো আসে; শেষ ব্যবহৃত brand মনে থাকে।
- Logout করলে ঐ device-এর token বাতিল হয়ে যায়।

## ব্যবহার
- যেকোনো product page-এ আইকনে ক্লিক → **Idea** → সেভ → Product Pipeline-এ চলে আসবে (vote/rating সহ)।
- Facebook / Instagram / TikTok ad বা ভালো লাগা content-এ → **Swipe** → Rivals-এর Swipe file-এ সেভ হবে, rival page auto তৈরি হবে।
- কোনো rival-এর page-এ → **Rival** → Competitor registry-তে যোগ হবে।
- যেকোনো পেজের ডানপাশে ছোট **🔖 clip** আইকন — ক্লিক করলেই brand সিলেক্ট করে সরাসরি সেভ (Product / Content / Page)।
- Instagram / Facebook / TikTok profile-এ থাকলে **Page** মোড auto সিলেক্ট হয় (handle + follower সহ)।
- Product page-এ JSON-LD থেকে দাম, currency, SKU ও color/size variant অটো ধরে।
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
    { name: "content.js", data: CONTENT_JS },
    { name: "popup.html", data: POPUP_HTML },
    { name: "popup.css", data: POPUP_CSS },
    { name: "popup.js", data: POPUP_JS },
    { name: "options.html", data: OPTIONS_HTML },
    { name: "options.js", data: OPTIONS_JS },
    { name: "icon128.png", data: b64ToBytes(ICON_B64) },
    { name: "README.md", data: README(origin) },
  ];
}
