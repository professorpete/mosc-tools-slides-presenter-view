const $ = (id) => document.getElementById(id);
chrome.storage.sync.get({ bridge: '', token: '', followEditor: false }, (v) => { $('bridge').value = v.bridge; $('token').value = v.token; $('followEditor').checked = !!v.followEditor; });
$('save').addEventListener('click', () => {
  const bridge = $('bridge').value.trim().replace(/\/macros\/u\/\d+\/s\//, '/macros/s/').replace(/\/+$/, '');
  chrome.storage.sync.set({ bridge, token: $('token').value.trim(), followEditor: $('followEditor').checked }, () => { $('save').textContent = 'Saved'; setTimeout(() => { $('save').textContent = 'Save'; }, 1200); });
});
function showStatus() {
  chrome.storage.local.get({ status: null }, ({ status }) => {
    const el = $('status'); if (!status) return;
    const t = new Date(status.at).toLocaleTimeString();
    el.className = status.ok ? 'ok' : 'bad';
    el.textContent = `${t}  slide ${status.slide}  (${status.view || 'present'})\n` + (status.ok ? 'sent to bridge ✓' : 'FAILED: ' + status.error);
  });
}
showStatus(); setInterval(showStatus, 1000);
