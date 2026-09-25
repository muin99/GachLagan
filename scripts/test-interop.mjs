import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdir } from 'node:fs/promises';
import { seal, open, generateKey } from '../secure/core.mjs';
await mkdir('artifacts/java', { recursive: true });
execFileSync('javac', ['-d', 'artifacts/java', 'mobile/android/app/src/main/java/com/gachlagan/keyboard/MessageCrypto.java', 'tests/native/CryptoHarness.java']);
execFileSync('swiftc', ['mobile/ios/SWKeyboard/MessageCrypto.swift', 'tests/native/main.swift', '-o', 'artifacts/crypto-swift']);
function native(binary, args, op, text, key) {
  const input = [op, Buffer.from(text).toString('base64'), Buffer.from(key).toString('base64')].join('\t') + '\n';
  const result = execFileSync(binary, args, { input, encoding: 'utf8' }).trim();
  if (result === 'ERROR') throw new Error('Authentication or validation failed');
  return Buffer.from(result, 'base64').toString('utf8');
}
const implementations = {
  WebCrypto: { seal, open },
  AndroidJCA: { seal: (t,k) => native('java', ['-cp', 'artifacts/java', 'CryptoHarness'], 'seal', t,k), open: (t,k) => native('java', ['-cp', 'artifacts/java', 'CryptoHarness'], 'open',t,k) },
  AppleCryptoKit: { seal: (t,k) => native('./artifacts/crypto-swift', [], 'seal',t,k), open: (t,k) => native('./artifacts/crypto-swift', [], 'open',t,k) }
};
let checks = 0;
for (const key of [generateKey(), 'river lantern mango purple railway', 'বাংলা পাসফ্রেজ cafe\u0301 🌱']) {
  for (const [senderName, sender] of Object.entries(implementations)) {
    const message = 'আমি বাংলায় কথা বলি 👨‍👩‍👧‍👦\n<script>not executable</script>\u0000';
    const wire = await sender.seal(message, key);
    for (const [receiverName, receiver] of Object.entries(implementations)) {
      assert.equal(await receiver.open(wire, key.normalize('NFC')), message, `${senderName} -> ${receiverName}`); checks++;
      const parts = wire.split('.'); parts[3] = parts[3][0] === 'A' ? 'B' + parts[3].slice(1) : 'A' + parts[3].slice(1);
      await assert.rejects(async () => receiver.open(parts.join('.'), key)); checks++;
    }
  }
}
console.log(`${checks} interoperability/authentication checks passed across Web Crypto, Android JCA, and Apple CryptoKit/CommonCrypto (macOS execution).`);
