// GK1 is a versioned envelope, not a new cipher. Primitives come from Web Crypto,
// Android JCA, or Apple CryptoKit/CommonCrypto. See docs/SECURITY.md.
export const MAX_BYTES = 4096;
export const MAX_WIRE = 40000;
export const ITERATIONS = 600000;
const utf8 = new TextEncoder();
const decoder = new TextDecoder('utf-8', { fatal: true });
export function b64(bytes) {
  return btoa(String.fromCharCode(...bytes)).replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/, '');
}
export function unb64(text) {
  if (typeof text !== 'string' || !/^[A-Za-z0-9_-]+$/.test(text) || text.length % 4 === 1) throw new Error('Invalid message format.');
  const bytes = Uint8Array.from(atob(text.replaceAll('-', '+').replaceAll('_', '/')), c => c.charCodeAt(0));
  if (b64(bytes) !== text) throw new Error('Invalid message format.');
  return bytes;
}
export function checkText(text) {
  if (typeof text !== 'string' || !text.length || utf8.encode(text).length > MAX_BYTES || !text.isWellFormed()) throw new Error('Write a message of 1–4,096 UTF-8 bytes.');
}
export function checkSecret(secret) {
  if (typeof secret !== 'string') throw new Error('Set a shared key first.');
  if (secret.startsWith('GKKEY1.')) {
    if (secret.length !== 50 || unb64(secret.slice(7)).length !== 32) throw new Error('That shared key is incomplete.');
    return 'K';
  }
  if (!secret.isWellFormed() || [...secret.normalize('NFC')].length < 16 || utf8.encode(secret.normalize('NFC')).length > 256) {
    throw new Error('Use a long shared passphrase: 16+ characters, at most 256 UTF-8 bytes.');
  }
  return 'P';
}
export function generateKey() { return 'GKKEY1.' + b64(crypto.getRandomValues(new Uint8Array(32))); }
export function parseEnvelope(wire) {
  if (typeof wire !== 'string' || wire.length > MAX_WIRE) throw new Error('Message is too large.');
  const parts = wire.trim().split('.');
  if (parts.length !== 5 || parts[0] !== 'GK1' || !['K', 'P'].includes(parts[1])) throw new Error('Not a supported encrypted message. Copy the entire GK1 message.');
  const salt = unb64(parts[2]), nonce = unb64(parts[3]), ciphertext = unb64(parts[4]);
  if (salt.length !== 16 || nonce.length !== 12 || ciphertext.length < 17 || ciphertext.length > MAX_BYTES + 16) throw new Error('The encrypted message is incomplete or too large.');
  return { kind: parts[1], salt, nonce, ciphertext, aad: utf8.encode(parts.slice(0, 4).join('.')) };
}
async function derive(secret, salt, kind) {
  if (checkSecret(secret) !== kind) throw new Error('This message needs a different type of shared key.');
  const raw = kind === 'K' ? unb64(secret.slice(7)) : utf8.encode(secret.normalize('NFC'));
  try {
    const material = await crypto.subtle.importKey('raw', raw, kind === 'K' ? 'HKDF' : 'PBKDF2', false, ['deriveKey']);
    const parameters = kind === 'K'
      ? { name: 'HKDF', hash: 'SHA-256', salt, info: utf8.encode('Gachlagan/GK1/A256GCM') }
      : { name: 'PBKDF2', hash: 'SHA-256', salt, iterations: ITERATIONS };
    return await crypto.subtle.deriveKey(parameters, material, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
  } finally { raw.fill(0); }
}
export async function seal(text, secret) {
  checkText(text);
  const kind = checkSecret(secret), salt = crypto.getRandomValues(new Uint8Array(16)), nonce = crypto.getRandomValues(new Uint8Array(12));
  const header = ['GK1', kind, b64(salt), b64(nonce)].join('.');
  const key = await derive(secret, salt, kind), plain = utf8.encode(text);
  try {
    const cipher = await crypto.subtle.encrypt({ name: 'AES-GCM', iv: nonce, additionalData: utf8.encode(header), tagLength: 128 }, key, plain);
    return header + '.' + b64(new Uint8Array(cipher));
  } finally { plain.fill(0); }
}
export async function open(wire, secret) {
  const { kind, salt, nonce, ciphertext, aad } = parseEnvelope(wire);
  const key = await derive(secret, salt, kind);
  let plain;
  try {
    plain = new Uint8Array(await crypto.subtle.decrypt({ name: 'AES-GCM', iv: nonce, additionalData: aad, tagLength: 128 }, key, ciphertext));
    return decoder.decode(plain);
  } catch { throw new Error('Cannot unlock: the key is different or this message was changed.'); }
  finally { plain?.fill(0); }
}
const MORSE = Object.fromEntries('A .-|B -...|C -.-.|D -..|E .|F ..-.|G --.|H ....|I ..|J .---|K -.-|L .-..|M --|N -.|O ---|P .--.|Q --.-|R .-.|S ...|T -|U ..-|V ...-|W .--|X -..-|Y -.--|Z --..|0 -----|1 .----|2 ..---|3 ...--|4 ....-|5 .....|6 -....|7 --...|8 ---..|9 ----.|. .-.-.-|, --..--|? ..--..|! -.-.--|: ---...|; -.-.-.|- -....-|/ -..-.|@ .--.-.|= -...-|+ .-.-.|( -.--.|) -.--.-'.split('|').map(s => s.split(' ')));
const INVERSE_MORSE = Object.fromEntries(Object.entries(MORSE).map(([k, v]) => [v, k]));
const bases = { binary: [2, 8], octal: [8, 3], hex: [16, 2] };
export function encode(text, mode) {
  checkText(text);
  let body;
  if (mode === 'morse') {
    if ([...text.toUpperCase()].some(c => c !== ' ' && !MORSE[c])) throw new Error('Morse supports English letters, numbers, spaces, and common punctuation. Use binary or hex for Bangla.');
    body = [...text.toUpperCase()].map(c => c === ' ' ? '/' : MORSE[c]).join(' ');
  } else if (bases[mode]) {
    const [base, width] = bases[mode];
    body = [...utf8.encode(text)].map(b => b.toString(base).padStart(width, '0')).join(' ');
  } else if (mode === 'base64') body = b64(utf8.encode(text));
  else throw new Error('Unknown encoding.');
  return `GE1.${mode}.${body}`;
}
export function decode(wire) {
  if (typeof wire !== 'string' || wire.length > MAX_WIRE) throw new Error('Message is too large.');
  const match = /^GE1\.(binary|octal|hex|base64|morse)\.([\s\S]+)$/.exec(wire.trim());
  if (!match) throw new Error('Copy the complete GE1 encoded message.');
  const [, mode, body] = match;
  let text;
  if (mode === 'morse') {
    text = body.split(' ').map(code => {
      if (code === '/') return ' ';
      if (!INVERSE_MORSE[code]) throw new Error('Invalid Morse code.');
      return INVERSE_MORSE[code];
    }).join('');
  } else {
    let bytes;
    if (mode === 'base64') bytes = unb64(body);
    else {
      const [base, width] = bases[mode], valid = { binary: /^[01]+$/, octal: /^[0-7]+$/, hex: /^[0-9a-f]+$/ }[mode];
      const tokens = body.split(' ');
      if (tokens.length > MAX_BYTES || tokens.some(t => t.length !== width || !valid.test(t) || parseInt(t, base) > 255)) throw new Error('Invalid encoded bytes.');
      bytes = Uint8Array.from(tokens, t => parseInt(t, base));
    }
    text = decoder.decode(bytes);
  }
  checkText(text);
  return { text, mode };
}
