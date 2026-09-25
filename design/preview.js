'use strict';
const frames = { sender: document.getElementById('sender'), receiver: document.getElementById('receiver') };
const PUBLIC_DEMO_KEY = 'GKKEY1.AAECAwQFBgcICQoLDA0ODxAREhMUFRYXGBkaGxwdHh8';
const last = { sender: '', receiver: '' };
window.addEventListener('message', event => {
  if (event.origin !== location.origin || event.data?.source !== 'gachlagan') return;
  const side = Object.keys(frames).find(name => frames[name].contentWindow === event.source);
  if (!side) return;
  const host = document.getElementById(side + '-host');
  if (event.data.op === 'insert' || event.data.op === 'plain') host.value += event.data.text;
  else if (event.data.op === 'backspace') {
    let start = host.selectionStart ?? host.value.length, end = host.selectionEnd ?? start;
    if (start === end && start > 0) {
      const last = [...new Intl.Segmenter(undefined, { granularity: 'grapheme' }).segment(host.value.slice(0, start))].at(-1);
      start = last?.index ?? 0;
    }
    host.value = host.value.slice(0, start) + host.value.slice(end);
    host.setSelectionRange(start, start);
  }
});
function send(side) {
  const host = document.getElementById(side + '-host'), text = host.value;
  if (!text) return;
  const other = side === 'sender' ? 'receiver' : 'sender';
  for (const target of [side, other]) {
    const container = document.getElementById(target + '-messages'); container.replaceChildren();
    const bubble = document.createElement('div'); bubble.className = 'bubble encrypted ' + (target === side ? 'outgoing' : 'incoming'); bubble.textContent = text;
    container.append(bubble);
    if (target === other) {
      const copy = document.createElement('button'); copy.className = 'copy-button'; copy.textContent = 'Copy message'; copy.setAttribute('aria-label', 'Copy message for ' + other);
      copy.onclick = () => { last[other] = text; frames[other].contentWindow.postMessage({ source: 'gachlagan-preview', op: 'clipboard', text }, location.origin); copy.textContent = 'Copied to demo clipboard ✓'; };
      container.append(copy);
    }
    container.parentElement.scrollTop = container.parentElement.scrollHeight;
  }
  host.value = '';
}
document.getElementById('send').onclick = () => send('sender');
document.getElementById('send-reply').onclick = () => send('receiver');
document.getElementById('demo').onclick = () => {
  for (const frame of Object.values(frames)) {
    const doc = frame.contentDocument;
    doc.getElementById('settings').click(); doc.getElementById('shared-key').value = PUBLIC_DEMO_KEY;
    doc.getElementById('auto-read').checked = true; doc.getElementById('save-settings').click();
  }
  const draft = frames.sender.contentDocument.getElementById('draft'); draft.value = 'Meet me at the bookshop. 6 pm?'; draft.dispatchEvent(new Event('input', { bubbles: true }));
  document.getElementById('demo').textContent = 'Demo keys ready · try Encrypt & insert ↗';
};
