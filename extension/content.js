/* Presenter View Follow — content script.
   Watches the Google Slides URL for the slide that is on screen and reports changes to the extension.
   Present mode:  https://docs.google.com/presentation/d/<deck>/present?slide=id.<slideId>   (query or hash)
   Editor:        https://docs.google.com/presentation/d/<deck>/edit#slide=id.<slideId>       (only if enabled in the popup)
   The slide param changes ONLY when Google moves to another slide — never on a build/animation click. */
(() => {
  let last = '';
  let followEditor = false;
  chrome.storage.sync.get({ followEditor: false }, (v) => { followEditor = !!v.followEditor; });
  chrome.storage.onChanged.addListener((ch) => { if (ch.followEditor) followEditor = !!ch.followEditor.newValue; });

  function read() {
    const m = location.pathname.match(/\/presentation\/d\/([^/]+)\/([a-z]*)/);
    if (!m) return null;
    const deck = m[1], view = m[2] || '';
    if (view === 'edit' && !followEditor) return null;
    const src = location.search + location.hash;
    const sm = src.match(/[?#&]slide=id\.([^&#]+)/);
    if (!sm) return null;
    return { deck, slide: decodeURIComponent(sm[1]), view };
  }
  function tick() {
    const cur = read(); if (!cur) return;
    const key = cur.deck + '|' + cur.slide;
    if (key === last) return;
    last = key;
    try { chrome.runtime.sendMessage({ type: 'slide', ...cur }); } catch (e) { /* extension reloaded — page reload fixes it */ }
  }
  tick();
  setInterval(tick, 250);                       // Google updates the URL with replaceState, which fires no event
  window.addEventListener('hashchange', tick);
  window.addEventListener('popstate', tick);
})();
