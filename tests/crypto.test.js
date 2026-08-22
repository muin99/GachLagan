const test = require('node:test');
const assert = require('node:assert/strict');
const core = import('../secure/core.mjs');
const pass = 'river lantern mango purple railway';
test('generated keys are 256 bits, canonical, and unique', async () => {
  const { generateKey, checkSecret, unb64 } = await core;
  const keys = new Set(Array.from({ length: 100 }, generateKey)); assert.equal(keys.size, 100);
  for (const key of keys) { assert.equal(checkSecret(key), 'K'); assert.equal(unb64(key.slice(7)).length, 32); }
});
test('Unicode, Bangla, emoji, whitespace, and HTML round-trip without interpretation', async () => {
  const { generateKey, seal, open } = await core; const key = generateKey();
  for (const message of ['ami', 'আমি বাংলায় কথা বলি 💚', '👨‍👩‍👧‍👦\n\t ', '<script>alert(1)</script>', 'e\u0301\u0000', 'x'.repeat(4096)]) {
    const wire = await seal(message, key); assert.equal(await open(wire, key), message); assert.ok(!wire.includes(message));
  }
});
test('passphrase round-trip and canonical Unicode normalization', async () => {
  const { seal, open } = await core;
  const wire = await seal('secret', pass); assert.equal(await open(wire, pass), 'secret');
  const decomposed = 'cafe\u0301 river lantern mango railway';
  assert.equal(await open(await seal('same key', decomposed), decomposed.normalize('NFC')), 'same key');
});
test('same plaintext and key use fresh salts, nonces, and ciphertext', async () => {
  const { generateKey, seal } = await core; const key = generateKey();
  const messages = await Promise.all(Array.from({ length: 40 }, () => seal('same message', key)));
  for (const part of [2, 3, 4]) assert.equal(new Set(messages.map(w => w.split('.')[part])).size, 40);
});
test('wrong key and mutations of every encrypted envelope field fail closed', async () => {
  const { generateKey, seal, open, unb64, b64 } = await core; const key = generateKey(), wire = await seal('never reveal this', key);
  await assert.rejects(open(wire, generateKey()), /Cannot unlock/);
  for (const index of [2, 3, 4]) {
    const parts = wire.split('.'), bytes = unb64(parts[index]); bytes[0] ^= 1; parts[index] = b64(bytes);
    await assert.rejects(open(parts.join('.'), key), /Cannot unlock/);
  }
  for (const corrupt of [wire.replace('GK1', 'GK2'), wire.replace('.K.', '.P.'), wire + '.extra', wire.slice(0, -6)]) await assert.rejects(open(corrupt, key));
});
test('strict bounds reject empty, malformed UTF-8, oversized inputs and weak secrets', async () => {
  const { seal, open, generateKey, checkSecret, unb64 } = await core; const key = generateKey();
  for (const value of ['', 'x'.repeat(4097), '\ud800']) await assert.rejects(seal(value, key));
  for (const bad of ['short', 'GKKEY1.A', 'GKKEY1.' + 'a'.repeat(43), 'x'.repeat(257)]) assert.throws(() => checkSecret(bad));
  for (const bad of ['=', 'a', 'AA=', 'AB', '<script>']) assert.throws(() => unb64(bad));
  await assert.rejects(open('GK1.'.padEnd(40001, 'x'), key), /large/);
});
test('binary, octal, hex and base64 preserve Unicode; Morse is explicitly uppercase', async () => {
  const { encode, decode } = await core;
  for (const mode of ['binary', 'octal', 'hex', 'base64']) assert.equal(decode(encode('বাংলা 🌱\n hello!', mode)).text, 'বাংলা 🌱\n hello!');
  assert.equal(decode(encode('Hi,  Rafi! 6 pm?', 'morse')).text, 'HI,  RAFI! 6 PM?');
  assert.throws(() => encode('বাংলা', 'morse'), /Bangla/);
  for (const wire of ['GE1.octal.400', 'GE1.hex.ff', 'GE1.binary.011', 'GE1.morse..x', 'GE1.hex.00  gg']) assert.throws(() => decode(wire));
});
