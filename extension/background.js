/* Presenter View Follow — background. Sends each slide change to the Apps Script bridge (action=setCurrent). */
const DEFAULTS = { bridge: '', token: '', followEditor: false };
let lastKey = '';

async function report(msg) {
  const cfg = await chrome.storage.sync.get(DEFAULTS);
  const status = { at: Date.now(), deck: msg.deck, slide: msg.slide, view: msg.view, ok: false, error: '' };
  if (!/^https:\/\/script\.google\.com\/macros\/s\/[^/]+\/exec$/.test(cfg.bridge || '') || !cfg.token) {
    status.error = 'Bridge URL / token not set — click the extension icon';
    await chrome.storage.local.set({ status }); return;
  }
  const url = `${cfg.bridge}?action=setCurrent&token=${encodeURIComponent(cfg.token)}&deck=${encodeURIComponent(msg.deck)}&slide=${encodeURIComponent(msg.slide)}&from=ext`;
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const r = await fetch(url, { redirect: 'follow', cache: 'no-store', credentials: 'omit' });
      const text = await r.text();
      let j = null; try { j = JSON.parse(text); } catch { /* Google "Sorry" page etc. */ }
      if (j && j.ok) { status.ok = true; status.error = ''; break; }
      status.error = j ? (j.error || 'bridge refused') : `HTTP ${r.status} (not JSON — deployment not authorized or transient Google error)`;
    } catch (e) { status.error = e.message || String(e); }
    await new Promise(res => setTimeout(res, 800 * (attempt + 1)));
  }
  await chrome.storage.local.set({ status });
}

chrome.runtime.onMessage.addListener((msg, sender) => {
  if (!msg || msg.type !== 'slide') return;
  const key = msg.deck + '|' + msg.slide;
  if (key === lastKey) return;                  // several frames can report the same slide
  lastKey = key;
  report(msg);
});
