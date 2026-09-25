import { checkSecret, checkText, decode, encode, parseEnvelope, ENCODING_MODES, MAX_BYTES, MAX_WIRE } from './core.mjs';
import { frameMessage, isRecognized, parseMessages } from './framing.mjs';
import { native, request } from './bridge.mjs';
const $ = id => document.getElementById(id);
let secret = '', method = 'secure', panel = 'compose', language = 'en', shift = 0, symbols = false, symbolAlt = false, emojiOpen = false;
let plainMode = false, busy = false, epoch = 0, rawDraft = '', pendingWire = '', lastWire = '', autoRead = true;
let settingsKeypad = false, modeReturn = 'compose', expiry;
const utf8 = new TextEncoder();
const MODES = [
  ['secure', 'Private · AES-256-GCM', 'Authenticated encryption · shared key'],
  ['binary', 'Binary', 'UTF-8 bytes · 0 and 1'], ['octal', 'Octal', 'UTF-8 bytes · base 8'],
  ['decimal', 'Decimal', 'UTF-8 bytes · base 10'], ['hex', 'Hexadecimal', 'UTF-8 bytes · base 16'],
  ['base32', 'Base32', 'RFC 4648 alphabet'], ['base64', 'Base64url', 'URL-safe alphabet'],
  ['base64classic', 'Base64', 'Standard padded alphabet'], ['percent', 'Percent', 'URL-style byte escapes'],
  ['rot13', 'ROT13', 'Latin letters only; other text unchanged'], ['morse', 'Morse', 'English letters and punctuation']
];
function status(text, error = false) { $('status').textContent = text; $('status').classList.toggle('error', error); }
function touch() { clearTimeout(expiry); expiry = setTimeout(() => lock('Locked after 60 seconds without activity.'), 60000); }
function show(which) {
  if (which !== 'settings') settingsKeypad = false;
  panel = which;
  for (const name of ['compose', 'read', 'settings', 'modes']) $(name + '-panel').hidden = name !== which;
  $('key-area').hidden = which === 'read' || which === 'modes' || (which === 'settings' && !settingsKeypad);
  $('keypad-done').hidden = !settingsKeypad;
  document.body.classList.toggle('settings-keypad', which === 'settings' && settingsKeypad);
}
function openSettings() { settingsKeypad = false; $('shared-key').value = secret; show('settings'); }
function methodChanged() {
  const selected = $('method').value, secure = selected === 'secure';
  $('method-choice').textContent = MODES.find(([value]) => value === selected)?.[1] ?? MODES[0][1];
  for (const option of $('mode-options').children) option.setAttribute('aria-pressed', String(option.dataset.mode === selected));
  $('key-settings').hidden = !secure;
  $('method-help').textContent = secure ? 'Generated 256-bit keys are fast. Passphrases take longer to resist guessing.' : selected === 'morse' ? 'Public. Morse uppercases English and does not support Bangla.' : 'Public conversion. Anyone can decode it without a key.';
}
function openModes(from) { modeReturn = from; show('modes'); }
function updateMode() {
  document.body.classList.toggle('encoding', method !== 'secure');
  $('mode-label').textContent = method === 'secure' ? 'AES-256-GCM' : `${method.toUpperCase()} · NOT PRIVATE`;
  $('encrypt-label').textContent = method === 'secure' ? 'Encrypt & insert' : 'Encode & insert';
  $('draft-label').textContent = plainMode ? 'NORMAL TYPING · VISIBLE TO APP' : 'PRIVATE DRAFT';
  $('plain-mode').textContent = plainMode ? 'Back to private ↗' : 'Normal typing ↗';
  $('draft').disabled = plainMode; $('encrypt').hidden = plainMode; $('paste-draft').hidden = plainMode;
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
    await request('insert', { text: frameMessage(wire) });
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
  if (!isRecognized(wire)) { if (!automatic) { show('read'); $('read-error').textContent = 'Copy a complete Gachlagan message first.'; } return; }
  if (automatic && wire === lastWire && panel === 'read') return;
  let messages;
  try { messages = parseMessages(wire); }
  catch (error) { show('read'); clearReader(); $('read-error').textContent = error.message; return; }
  const current = epoch;
  if (messages.some(message => message.startsWith('GK1.')) && !secret) {
    try {
      setBusy(true);
      const saved = await request('loadKey');
      if (current !== epoch) return;
      if (saved) { checkSecret(saved); secret = saved; }
      else { pendingWire = wire; openSettings(); status('Copied message found. Enter your shared key to read it.'); return; }
    } catch (error) {
      if (current === epoch) { pendingWire = wire; openSettings(); status('Saved key unavailable. Enter your shared key to read it.', true); }
      return;
    } finally { if (current === epoch) setBusy(false); }
  }
  show('read'); $('read-text').textContent = ''; $('read-error').textContent = ''; $('reply').hidden = true;
  $('reader-title').textContent = 'Opening your message…';
  try {
    setBusy(true);
    let encrypted = false, openedCount = 0;
    async function openGroup(group, depth = 0) {
      if (depth >= 3) throw new Error('This message has too many encryption layers.');
      const result = [];
      for (const item of group) {
        if (++openedCount > 16) throw new Error('Too many messages in this copy.');
        const secured = item.startsWith('GK1.');
        encrypted ||= secured;
        if (secured) parseEnvelope(item);
        const text = secured ? await request('open', { wire: item, secret }) : decode(item).text;
        if (current !== epoch) return [];
        if (/^\[\[(GK2|GE2):/.test(text)) result.push(...await openGroup(parseMessages(text), depth + 1));
        else result.push(text);
      }
      return result;
    }
    const texts = await openGroup(messages);
    if (current !== epoch) return;
    $('read-text').textContent = texts.join('\n\n');
    $('reader-title').textContent = texts.length > 1 ? `${texts.length} messages opened.` : encrypted ? 'Just between you.' : 'Decoded, not private.';
    $('reader-meta').textContent = encrypted ? 'Decrypted here · each message authenticated' : 'Encoding only · no key required';
    $('reply').hidden = false; lastWire = wire; pendingWire = '';
    status(encrypted ? 'Plaintext stays inside this keyboard.' : 'Anyone with this encoding can read the message.'); touch();
  } catch (error) {
    if (current === epoch) { $('reader-title').textContent = 'Couldn’t open this message.'; $('reader-meta').textContent = 'No plaintext has been revealed.'; $('read-error').textContent = error.message; }
  } finally { if (current === epoch) setBusy(false); }
}
function clearReader() { $('read-text').textContent = ''; $('read-error').textContent = ''; $('reply').hidden = true; $('reader-title').textContent = 'Read between the lines.'; $('reader-meta').textContent = 'Copy a message, then open it here.'; }
function lock(message = 'Locked. Your key and private text were cleared from this session.') {
  ++epoch; secret = ''; rawDraft = ''; pendingWire = ''; lastWire = ''; plainMode = false; shift = 0; emojiOpen = false; symbols = false; symbolAlt = false;
  $('shared-key').value = ''; $('show-key').checked = false; $('shared-key').type = 'password';
  clearTimeout(expiry); clearReader(); renderDraft(); setBusy(false); show('compose'); keys(); updateMode(); status(message);
  request('lock').catch(() => {});
}
function keys() {
  const rows = emojiOpen ? [
    ['😀', '😃', '😄', '😁', '😅', '😂', '🙂', '🙃'],
    ['❤️', '😍', '😢', '😭', '😎', '🤔', '👀', '🔥'],
    ['👍', '👎', '🙏', '🎉', '🔐', '🌱', '✨', '💬']
  ] : symbols ? symbolAlt ? ['~`|•√π÷×£€', '©®™✓[]{}\\^', '_:;"\'!?'] : ['1234567890', '@#$%&*-+=', '.,?!:;/()'] : ['qwertyuiop', 'asdfghjkl', 'zxcvbnm'];
  $('key-area').replaceChildren();
  rows.forEach((row, index) => {
    const line = document.createElement('div'); line.className = 'key-row' + (index === 1 ? ' inset' : '');
    if (index === 2 && symbols) line.append(key(symbolAlt ? '123' : '#+=', 'More symbols', () => { symbolAlt = !symbolAlt; keys(); }, 'wide small'));
    else if (index === 2 && !emojiOpen) {
      const button = key(shift === 2 ? '⇪' : '⇧', shift === 2 ? 'Caps lock on' : 'Shift', () => { shift = (shift + 1) % 3; keys(); }, 'wide shift' + (shift ? ' selected' : ''));
      button.setAttribute('aria-pressed', String(shift > 0)); line.append(button);
    }
    for (const c of row) line.append(key(shift && !symbols && !emojiOpen ? c.toUpperCase() : c, c, () => type(shift && !symbols && !emojiOpen ? c.toUpperCase() : c), emojiOpen ? 'emoji' : ''));
    if (index === 2) line.append(key('⌫', 'Backspace', backspace, 'wide', true));
    $('key-area').append(line);
  });
  const bottom = document.createElement('div'); bottom.className = 'key-row';
  bottom.append(key(symbols ? 'ABC' : '123', 'Numbers and symbols', () => { symbols = !symbols; symbolAlt = false; emojiOpen = false; keys(); }, 'wide small'));
  bottom.append(key(language === 'en' ? 'বাংলা' : 'EN', 'Change typing language', () => {
    // Commit the existing transliteration before changing input language.
    rawDraft = $('draft').value; language = language === 'en' ? 'bn' : 'en'; keys();
  }, 'wide small'));
  bottom.append(key(emojiOpen ? 'ABC' : '☺', 'Emoji keyboard', () => { emojiOpen = !emojiOpen; symbols = false; symbolAlt = false; keys(); }, 'wide small'));
  bottom.append(key('space', 'Space', () => type(' '), 'space'));
  bottom.append(key('↵', 'New line', () => type('\n'), 'wide return')); $('key-area').append(bottom);
}
function key(label, name, action, extra = '', repeats = false) {
  const button = document.createElement('button'); button.className = `key ${extra}`; button.textContent = label; button.setAttribute('aria-label', name);
  if (!repeats) {
    button.addEventListener('pointerdown', e => e.preventDefault());
    button.addEventListener('click', () => { touch(); action(); });
    return button;
  }
  let delay, interval, handledPointer = false;
  const stop = () => { clearTimeout(delay); clearInterval(interval); };
  button.addEventListener('pointerdown', e => {
    if (e.button !== 0 || handledPointer) return;
    e.preventDefault(); handledPointer = true; button.setPointerCapture?.(e.pointerId);
    touch(); action();
    delay = setTimeout(() => { action(); interval = setInterval(action, 55); }, 360);
  });
  for (const event of ['pointerup', 'pointercancel', 'lostpointercapture']) button.addEventListener(event, () => { stop(); queueMicrotask(() => { handledPointer = false; }); });
  // Keyboard activation has no preceding pointerdown. Pointer-generated clicks
  // are already handled above so a tap deletes exactly once.
  button.addEventListener('click', e => { if (!handledPointer && e.detail === 0) { touch(); action(); } });
  return button;
}
function type(value) {
  if (busy) return;
  const oneShot = shift === 1 && /^[A-Z]$/.test(value) && !symbols && !emojiOpen;
  const finishShift = () => { if (oneShot) { shift = 0; keys(); } };
  if (panel === 'settings') {
    const field = $('shared-key'), start = field.selectionStart ?? field.value.length, end = field.selectionEnd ?? start;
    field.value = field.value.slice(0, start) + value + field.value.slice(end); field.setSelectionRange(start + value.length, start + value.length); finishShift(); return;
  }
  if (plainMode) { request('plain', { text: value }).catch(e => status(e.message, true)); finishShift(); return; }
  if (utf8.encode(rawDraft + value).length > MAX_BYTES) { status('Your draft is at the 4,096-byte limit.', true); return; }
  if (language === 'bn') { rawDraft += value; renderDraft(); }
  else {
    const field = $('draft'), start = field.selectionStart ?? rawDraft.length, end = field.selectionEnd ?? start;
    rawDraft = field.value.slice(0, start) + value + field.value.slice(end); renderDraft(); field.setSelectionRange(start + value.length, start + value.length);
  }
  finishShift();
}
function backspace() {
  if (busy) return;
  if (plainMode && panel !== 'settings') { request('backspace').catch(e => status(e.message, true)); return; }
  const field = panel === 'settings' ? $('shared-key') : $('draft');
  let start = field.selectionStart ?? field.value.length, end = field.selectionEnd ?? start;
  if (start !== end) {
    field.value = field.value.slice(0, start) + field.value.slice(end); field.setSelectionRange(start, start);
    if (panel !== 'settings') rawDraft = field.value;
    return;
  }
  if (panel !== 'settings' && language === 'bn') {
    const segments = [...new Intl.Segmenter(undefined, { granularity: 'grapheme' }).segment(rawDraft)];
    rawDraft = rawDraft.slice(0, segments.at(-1)?.index ?? 0); renderDraft(); return;
  }
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
$('settings').onclick = () => { if (!busy) openSettings(); };
$('mode-pill').onclick = () => { if (!busy) openModes('compose'); };
$('method-picker').onclick = () => openModes('settings');
$('close-modes').onclick = () => show(modeReturn);
$('shared-key').addEventListener('focus', () => {
  if (panel !== 'settings') return;
  settingsKeypad = true; show('settings');
  requestAnimationFrame(() => {
    const container = $('settings-panel'), field = $('shared-key');
    container.scrollTop += field.getBoundingClientRect().top - container.getBoundingClientRect().top - 25;
  });
});
$('keypad-done').onclick = () => { $('shared-key').blur(); settingsKeypad = false; show('settings'); };
$('close-settings').onclick = () => { $('shared-key').value = ''; show('compose'); };
$('lock').onclick = () => lock();
$('reply').onclick = () => { clearReader(); plainMode = false; method = 'secure'; $('method').value = 'secure'; methodChanged(); updateMode(); show('compose'); };
$('plain-mode').onclick = () => {
  if (busy) return;
  if (!plainMode && rawDraft) { status('Encrypt your draft or use Lock to clear it before switching to normal typing.', true); return; }
  plainMode = !plainMode; rawDraft = ''; renderDraft(); updateMode();
  status(plainMode ? 'Normal typing is visible to the app. Private drafts stay in Private mode.' : 'Your words stay here until you encrypt.');
};
$('paste-draft').onclick = async () => {
  if (busy || plainMode) return;
  if (rawDraft) { status('Encrypt or clear your current draft before pasting another message.', true); return; }
  const current = epoch;
  try {
    const copied = (await request('clipboard')).trim();
    if (current !== epoch) return;
    for (const item of parseMessages(copied)) item.startsWith('GK1.') ? parseEnvelope(item) : decode(item);
    checkText(copied);
    rawDraft = copied; language = 'en'; emojiOpen = false; symbols = false; symbolAlt = false; shift = 0; keys(); renderDraft();
    status('Ciphertext is in your private draft. Encrypt & insert to add a layer.');
  } catch (error) { if (current === epoch) status(error.message, true); }
};
for (const [value, label, detail] of MODES) {
  const button = document.createElement('button'); button.type = 'button'; button.className = 'mode-option';
  button.dataset.mode = value; button.setAttribute('aria-label', label); button.setAttribute('aria-pressed', 'false');
  const title = document.createElement('strong'); title.textContent = label;
  const subtitle = document.createElement('span'); subtitle.textContent = detail;
  button.append(title, subtitle); $('mode-options').append(button);
  button.onclick = async () => {
    $('method').value = value; methodChanged();
    if (modeReturn === 'compose' && (value !== 'secure' || secret)) {
      method = value; updateMode(); show('compose');
      try { await request('autoRead', { enabled: autoRead, method }); }
      catch (error) { status(error.message, true); }
    } else show('settings');
  };
}
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
    plainMode = false; methodChanged(); updateMode(); show('compose'); touch(); status(method === 'secure' ? 'Key ready. Type privately, then encrypt.' : 'Encoding selected. This mode does not protect secrets.');
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
    if (e.data.op === 'clipboard') { window.gachlaganPreviewClipboard = e.data.text; read(e.data.text, true); }
  });
}
keys(); methodChanged(); updateMode(); touch();
if (native) request('loadSettings').then(settings => {
  if (!settings || !['secure', ...ENCODING_MODES].includes(settings.method)) return;
  method = settings.method; autoRead = Boolean(settings.autoRead); $('method').value = method; $('auto-read').checked = autoRead;
  methodChanged(); updateMode();
}).catch(() => status('Settings unavailable. Private mode remains selected.'));
