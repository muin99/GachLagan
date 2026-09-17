import { checkSecret, checkText, decode, encode, parseEnvelope, MAX_BYTES, MAX_WIRE } from './core.mjs';
import { native, request } from './bridge.mjs';
const $ = id => document.getElementById(id);
let secret = '', method = 'secure', panel = 'compose', language = 'en', shift = false, symbols = false;
let plainMode = false, busy = false, epoch = 0, rawDraft = '', pendingWire = '', lastWire = '', autoRead = true;
let activeField = $('draft'), expiry;
const utf8 = new TextEncoder();
function status(text, error = false) { $('status').textContent = text; $('status').classList.toggle('error', error); }
function touch() { clearTimeout(expiry); expiry = setTimeout(() => lock('Locked after 60 seconds without activity.'), 60000); }
function show(which) {
  panel = which;
  for (const name of ['compose', 'read', 'settings']) $(name + '-panel').hidden = name !== which;
  $('key-area').hidden = which === 'read';
  $('compose-tab').classList.toggle('active', which === 'compose');
  activeField = which === 'settings' ? $('shared-key') : $('draft');
}
function updateMode() {
  document.body.classList.toggle('encoding', method !== 'secure');
  $('mode-label').textContent = method === 'secure' ? 'AES-256-GCM' : `${method.toUpperCase()} · NOT PRIVATE`;
  $('encrypt-label').textContent = method === 'secure' ? 'Encrypt & insert' : 'Encode & insert';
  $('draft-label').textContent = plainMode ? 'NORMAL TYPING · VISIBLE TO APP' : 'PRIVATE DRAFT';
  $('plain-mode').textContent = plainMode ? 'Back to private ↗' : 'Normal typing ↗';
  $('draft').disabled = plainMode; $('encrypt').hidden = plainMode;
  $('draft').placeholder = plainMode ? 'Keys now type directly into your app.' : 'Say it only to them…';
}
function renderDraft() {
  $('draft').value = language === 'bn' ? window.OmicronLab.Avro.Phonetic.parse(rawDraft) : rawDraft;
  $('draft').scrollTop = $('draft').scrollHeight;
}
function setBusy(value) { busy = value; $('encrypt').disabled = value; $('read-clipboard').disabled = value; $('read-copied').disabled = value; $('draft').readOnly = value; }
async function insert() {
  if (busy || plainMode) return;
  if (method === 'secure' && !secret) { show('settings'); status('Add the same shared key on both phones first.'); return; }
  const text = $('draft').value, current = epoch;
  try {
    checkText(text); setBusy(true); status(method === 'secure' ? 'Encrypting on this device…' : 'Encoding on this device…');
    const wire = method === 'secure' ? await request('seal', { text, secret }) : encode(text, method);
    if (current !== epoch) return;
    await request('insert', { text: wire });
    if (current !== epoch) return;
    rawDraft = ''; renderDraft();
    status(method === 'secure' ? 'Ciphertext inserted. Send it with your chat app.' : 'Encoded text inserted. Anyone can decode this.');
  } catch (error) { if (current === epoch) status(error.message, true); }
  finally { if (current === epoch) setBusy(false); }
}
async function read(wire, automatic = false) {
  if (busy || (automatic && !autoRead)) return;
  if (typeof wire !== 'string' || wire.length > MAX_WIRE) { if (!automatic) status('Clipboard message is too large.', true); return; }
  wire = wire.trim();
  if (!/^(GK1|GE1)\./.test(wire)) { if (!automatic) { show('read'); $('read-error').textContent = 'Copy a complete GK1 encrypted or GE1 encoded message first.'; } return; }
  if (automatic && wire === lastWire && panel === 'read') return;
  const current = epoch;
  if (wire.startsWith('GK1.') && !secret) {
    try {
      setBusy(true);
      const saved = await request('loadKey');
      if (current !== epoch) return;
      if (saved) { checkSecret(saved); secret = saved; }
      else { pendingWire = wire; show('settings'); status('Copied message found. Enter your shared key to read it.'); return; }
    } catch (error) {
      if (current === epoch) { pendingWire = wire; show('settings'); status('Saved key unavailable. Enter your shared key to read it.', true); }
      return;
    } finally { if (current === epoch) setBusy(false); }
  }
  show('read'); $('read-text').textContent = ''; $('read-error').textContent = ''; $('reply').hidden = true;
  $('reader-title').textContent = 'Opening your message…';
  try {
    setBusy(true);
    let text, encoded = wire.startsWith('GE1.');
    if (encoded) text = decode(wire).text;
    else { parseEnvelope(wire); text = await request('open', { wire, secret }); }
    if (current !== epoch) return;
    $('read-text').textContent = text;
    $('reader-title').textContent = encoded ? 'Decoded, not private.' : 'Just between you.';
    $('reader-meta').textContent = encoded ? 'Encoding only · no key required' : 'Decrypted here · authentication checked';
    $('reply').hidden = false; lastWire = wire; pendingWire = '';
    status(encoded ? 'Anyone with this encoding can read the message.' : 'Plaintext stays inside this keyboard.'); touch();
  } catch (error) {
    if (current === epoch) { $('reader-title').textContent = 'Couldn’t open this message.'; $('reader-meta').textContent = 'No plaintext has been revealed.'; $('read-error').textContent = error.message; }
  } finally { if (current === epoch) setBusy(false); }
}
function clearReader() { $('read-text').textContent = ''; $('read-error').textContent = ''; $('reply').hidden = true; $('reader-title').textContent = 'Read between the lines.'; $('reader-meta').textContent = 'Copy a message, then open it here.'; }
function lock(message = 'Locked. Your key and private text were cleared from this session.') {
  ++epoch; secret = ''; rawDraft = ''; pendingWire = ''; lastWire = ''; plainMode = false;
  $('shared-key').value = ''; $('show-key').checked = false; $('shared-key').type = 'password';
  clearTimeout(expiry); clearReader(); renderDraft(); setBusy(false); show('compose'); updateMode(); status(message);
  request('lock').catch(() => {});
}
function keys() {
  const rows = symbols ? ['1234567890', '@#$%&*-+=', '.,?!:;/()'] : ['qwertyuiop', 'asdfghjkl', 'zxcvbnm'];
  $('key-area').replaceChildren();
  rows.forEach((row, index) => {
    const line = document.createElement('div'); line.className = 'key-row' + (index === 1 ? ' inset' : '');
    if (index === 2) line.append(key('⇧', 'Shift', () => { shift = !shift; keys(); }, 'wide'));
    for (const c of row) line.append(key(shift && !symbols ? c.toUpperCase() : c, c, () => type(shift && !symbols ? c.toUpperCase() : c)));
    if (index === 2) line.append(key('⌫', 'Backspace', backspace, 'wide'));
    $('key-area').append(line);
  });
  const bottom = document.createElement('div'); bottom.className = 'key-row';
  bottom.append(key(symbols ? 'ABC' : '123', 'Numbers and symbols', () => { symbols = !symbols; keys(); }, 'wide small'));
  bottom.append(key(language === 'en' ? 'বাংলা' : 'EN', 'Change typing language', () => {
    // Commit the existing transliteration before changing input language.
    rawDraft = $('draft').value; language = language === 'en' ? 'bn' : 'en'; keys();
  }, 'wide small'));
  bottom.append(key('space', 'Space', () => type(' '), 'space'));
  bottom.append(key('↵', 'New line', () => type('\n'), 'wide return')); $('key-area').append(bottom);
}
function key(label, name, action, extra = '') {
  const button = document.createElement('button'); button.className = `key ${extra}`; button.textContent = label; button.setAttribute('aria-label', name);
  button.addEventListener('pointerdown', e => e.preventDefault()); button.addEventListener('click', () => { touch(); action(); }); return button;
}
function type(value) {
  if (busy) return;
  if (panel === 'settings') {
    const field = $('shared-key'), start = field.selectionStart ?? field.value.length, end = field.selectionEnd ?? start;
    field.value = field.value.slice(0, start) + value + field.value.slice(end); field.setSelectionRange(start + value.length, start + value.length); return;
  }
  if (plainMode) { request('plain', { text: value }).catch(e => status(e.message, true)); return; }
  if (utf8.encode(rawDraft + value).length > MAX_BYTES) { status('Your draft is at the 4,096-byte limit.', true); return; }
  if (language === 'bn') { rawDraft += value; renderDraft(); }
  else {
    const field = $('draft'), start = field.selectionStart ?? rawDraft.length, end = field.selectionEnd ?? start;
    rawDraft = field.value.slice(0, start) + value + field.value.slice(end); renderDraft(); field.setSelectionRange(start + value.length, start + value.length);
  }
}
function backspace() {
  if (busy) return;
  if (plainMode && panel !== 'settings') { request('backspace').catch(e => status(e.message, true)); return; }
  const field = panel === 'settings' ? $('shared-key') : $('draft');
  if (panel !== 'settings' && language === 'bn') { rawDraft = [...rawDraft].slice(0, -1).join(''); renderDraft(); return; }
  let start = field.selectionStart ?? field.value.length, end = field.selectionEnd ?? start;
  if (start === end && start > 0) {
    const segments = [...new Intl.Segmenter(undefined, { granularity: 'grapheme' }).segment(field.value.slice(0, start))]; start = segments.at(-1)?.index ?? 0;
  }
  field.value = field.value.slice(0, start) + field.value.slice(end); field.setSelectionRange(start, start);
  if (panel !== 'settings') rawDraft = field.value;
}
$('draft').addEventListener('input', () => { rawDraft = $('draft').value; touch(); });
$('draft').addEventListener('keydown', e => {
  if (language !== 'bn') return;
  if (e.key.length === 1 || e.key === 'Backspace' || e.key === 'Enter') { e.preventDefault(); e.key === 'Backspace' ? backspace() : type(e.key === 'Enter' ? '\n' : e.key); }
});
$('encrypt').onclick = insert;
$('settings').onclick = $('mode-pill').onclick = () => { if (busy) return; $('shared-key').value = secret; show('settings'); };
$('compose-tab').onclick = () => { clearReader(); show('compose'); };
$('close-settings').onclick = () => { $('shared-key').value = ''; show('compose'); };
$('lock').onclick = () => lock();
$('reply').onclick = () => { clearReader(); plainMode = false; method = 'secure'; $('method').value = 'secure'; updateMode(); show('compose'); };
$('plain-mode').onclick = () => {
  if (busy) return;
  if (!plainMode && rawDraft) { status('Encrypt your draft or use Lock to clear it before switching to normal typing.', true); return; }
  plainMode = !plainMode; rawDraft = ''; renderDraft(); updateMode();
  status(plainMode ? 'Normal typing is visible to the app. Private drafts stay in Private mode.' : 'Your words stay here until you encrypt.');
};
$('method').onchange = () => {
  const secure = $('method').value === 'secure'; $('key-settings').hidden = !secure;
  $('method-help').textContent = secure ? 'Authenticated encryption. Both people need the same key.' : $('method').value === 'morse' ? 'Not private. English letters are decoded in UPPERCASE. Bangla is not supported by Morse.' : 'Not private. Anyone can decode this, without a key.';
};
$('generate').onclick = async () => { const current = epoch; try { const value = await request('generate'); if (current !== epoch) return; $('shared-key').value = value; status('New random key generated. Show it to your friend in person.'); } catch (e) { if (current === epoch) status(e.message, true); } };
$('show-key').onchange = () => { $('shared-key').type = $('show-key').checked ? 'text' : 'password'; };
$('paste-key').onclick = async () => { const current = epoch; try { const value = await request('clipboard'); if (current !== epoch) return; checkSecret(value); $('shared-key').value = value; } catch (e) { if (current === epoch) status(e.message, true); } };
$('restore-key').onclick = async () => { const current = epoch; try { const value = await request('loadKey'); if (current !== epoch) return; if (!value) throw new Error('No key saved on this device.'); $('shared-key').value = value; status('Saved key loaded. Tap Use these settings to unlock.'); } catch (e) { if (current === epoch) status(e.message, true); } };
$('forget-key').onclick = async () => { try { await request('forgetKey'); $('remember').checked = false; status('Saved key removed. The active session key remains until you lock.'); } catch (e) { status(e.message, true); } };
$('save-settings').onclick = async () => {
  let current = epoch;
  try {
    const nextMethod = $('method').value, value = $('shared-key').value;
    if (nextMethod === 'secure') checkSecret(value);
    if ($('remember').checked && nextMethod === 'secure') await request('saveKey', { secret: value });
    if (current !== epoch) return;
    current = ++epoch; method = nextMethod; secret = value; autoRead = $('auto-read').checked;
    await request('autoRead', { enabled: autoRead, method });
    if (current !== epoch) return;
    $('shared-key').value = ''; $('show-key').checked = false; $('shared-key').type = 'password';
    plainMode = false; updateMode(); show('compose'); touch(); status(method === 'secure' ? 'Key ready. Type privately, then encrypt.' : 'Encoding selected. This mode does not protect secrets.');
    if (pendingWire) await read(pendingWire);
  } catch (error) { if (current === epoch) status(error.message, true); }
};
const readClipboard = async () => { try { await read(await request('clipboard')); } catch (e) { status('Clipboard access unavailable. Allow access in system settings, then try again.', true); } };
$('read-clipboard').onclick = readClipboard;
$('read-copied').onclick = readClipboard;
$('next-keyboard').onclick = () => { lock(); request('next').catch(e => status(e.message, true)); };
window.gachlaganClipboard = wire => read(wire, true);
window.gachlaganLock = () => lock('Locked when the keyboard was hidden.');
window.gachlaganHardwareKey = value => value === '\b' ? backspace() : type(value);
document.addEventListener('visibilitychange', () => { if (document.hidden) lock(); });
window.addEventListener('pagehide', () => lock());
document.addEventListener('pointerdown', touch, { passive: true });
document.addEventListener('keydown', touch);
// The preview uses an explicit same-origin simulated clipboard; native builds have no parent.
if (!native) {
  $('remember-row').hidden = true; $('restore-key').hidden = true; $('forget-key').hidden = true;
  window.addEventListener('message', e => {
    if (e.origin !== window.location.origin || e.source !== window.parent || e.data?.source !== 'gachlagan-preview') return;
    if (e.data.op === 'clipboard') read(e.data.text, true);
  });
}
keys(); updateMode(); touch();
if (native) request('loadSettings').then(settings => {
  if (!settings || !['secure', 'binary', 'hex', 'octal', 'base64', 'morse'].includes(settings.method)) return;
  method = settings.method; autoRead = Boolean(settings.autoRead); $('method').value = method; $('auto-read').checked = autoRead;
  $('method').onchange(); updateMode();
}).catch(() => status('Settings unavailable. Private mode remains selected.'));
