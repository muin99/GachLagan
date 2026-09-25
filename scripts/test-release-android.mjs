// Emulator-only UI test of the exact signed APK, without WebView inspection.
import { spawnSync } from 'node:child_process';
import assert from 'node:assert/strict';
import { join } from 'node:path';
const adb = join(process.env.ANDROID_HOME, 'platform-tools/adb');
const serial = process.env.ANDROID_SERIAL;
assert.ok(serial?.startsWith('emulator-'), 'Set ANDROID_SERIAL to a disposable emulator.');
const apk = process.argv[2];
assert.ok(apk, 'Supply the signed release APK path.');
const pkg = 'com.gachlagan.keyboard';
const ime = `${pkg}/.SecureKeyboardService`;
function command(args, allowFailure = false) {
  const result = spawnSync(adb, ['-s', serial, ...args], { encoding: 'utf8' });
  if (!allowFailure) assert.equal(result.status, 0, result.stderr || result.stdout);
  return result;
}
const shell = args => command(['shell', ...args]).stdout.trim();
const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
const decode = value => value.replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');
function nodes() {
  shell(['uiautomator', 'dump', '/sdcard/gachlagan-release-ui.xml']);
  const xml = shell(['cat', '/sdcard/gachlagan-release-ui.xml']);
  return [...xml.matchAll(/<node\b[^>]+>/g)].map(([tag]) => Object.fromEntries([...tag.matchAll(/([\w-]+)="([^"]*)"/g)].map(([, key, value]) => [key, decode(value)])));
}
async function find(label, predicate) {
  for (let attempt = 0; attempt < 6; attempt++) {
    const found = nodes().find(predicate || (n => n['content-desc'] === label || n.text === label));
    if (found) return found;
    await pause(300);
  }
  throw new Error(`UI element missing: ${label}`);
}
async function tap(label) {
  const node = await find(label);
  const [x1, y1, x2, y2] = node.bounds.match(/\d+/g).map(Number);
  assert.ok(x2 > x1 && y2 > y1, `Invisible UI element: ${label}`);
  shell(['input', 'tap', String(Math.round((x1 + x2) / 2)), String(Math.round((y1 + y2) / 2))]);
}
const previousIme = shell(['settings', 'get', 'secure', 'default_input_method']);
const previousHardware = shell(['settings', 'get', 'secure', 'show_ime_with_hard_keyboard']);
try {
  console.log('Install exact signed APK and independent test host.');
  command(['install', '-r', apk]);
  command(['install', '-r', 'mobile/android/releaseHost/build/outputs/apk/debug/releaseHost-debug.apk']);
  assert.notEqual(command(['shell', 'run-as', pkg, 'true'], true).status, 0, 'Release must not be debuggable.');
  shell(['input', 'keyevent', 'KEYCODE_WAKEUP']);
  shell(['wm', 'dismiss-keyguard']);
  shell(['settings', 'put', 'secure', 'show_ime_with_hard_keyboard', '1']);
  shell(['ime', 'enable', ime]); shell(['ime', 'set', ime]);
  shell(['am', 'start', '-n', 'com.gachlagan.releasehost/com.gachlagan.keyboard.HostTestActivity']);
  await tap('Host message'); await tap('Copy received message');
  await tap('Keyboard settings'); await tap('Generate key');
  // Generating the key does not focus the password field or require a paste.
  await tap('Use these settings');
  await tap('Shift');
  for (const letter of ['a', 'm', 'a', 'r']) await tap(letter);
  assert.equal((await find('Private message')).text, 'Amar');
  assert.ok(!(await find('Host message')).text.includes('Amar'), 'Draft leaked into host.');
  await tap('Encrypt & insert');
  const first = (await find('Host message')).text;
  assert.match(first, /^\[\[GK2:\d+\]\]GK1\.K\./);
  assert.ok(!first.includes('Amar'));
  for (const letter of ['h', 'i']) await tap(letter);
  await tap('Encrypt & insert');
  const combined = (await find('Host message')).text;
  assert.equal((combined.match(/\[\[GK2:/g) || []).length, 2);
  await tap('Copy received message');
  await find('decrypted batch', n => (n.text || '').includes('Amar') && (n.text || '').includes('hi'));
  assert.equal((await find('Host message')).text, combined);
  const pid = shell(['pidof', pkg]);
  assert.ok(!shell(['cat', '/proc/net/unix']).includes(`webview_devtools_remote_${pid}`), 'Release WebView exposes debugging.');
  console.log('Signed APK passed: install, private visible draft, one-shot Shift, two ciphertext inserts, automatic clipboard decryption, unchanged host, and disabled debugging.');
  command(['install', '-r', apk]);
  console.log('Reinstall/update with the same release signing identity passed.');
} finally {
  if (previousIme && previousIme !== 'null') shell(['ime', 'set', previousIme]);
  if (previousHardware === 'null') shell(['settings', 'delete', 'secure', 'show_ime_with_hard_keyboard']);
  else shell(['settings', 'put', 'secure', 'show_ime_with_hard_keyboard', previousHardware]);
}
