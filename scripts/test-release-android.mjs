// Emulator smoke test for the exact signed public APK.
import { spawnSync } from 'node:child_process';
import assert from 'node:assert/strict';
import { join } from 'node:path';

const adb = join(process.env.ANDROID_HOME, 'platform-tools/adb');
const serial = process.env.ANDROID_SERIAL;
const apk = process.argv[2];
assert.ok(serial?.startsWith('emulator-'), 'Set ANDROID_SERIAL to a disposable emulator.');
assert.ok(apk, 'Supply the signed release APK path.');
const pkg = 'com.gachlagan.keyboard';
const ime = `${pkg}/.SecureKeyboardService`;
function command(args, allowFailure = false) {
  const result = spawnSync(adb, ['-s', serial, ...args], { encoding: 'utf8' });
  if (!allowFailure) assert.equal(result.status, 0, result.stderr || result.stdout);
  return result;
}
const shell = args => command(['shell', ...args]).stdout.trim();

const previousIme = shell(['settings', 'get', 'secure', 'default_input_method']);
try {
  console.log('Install and inspect the exact signed release APK.');
  command(['install', '-r', apk]);
  assert.notEqual(command(['shell', 'run-as', pkg, 'true'], true).status, 0, 'Release must not be debuggable.');
  assert.ok(shell(['ime', 'list', '-a']).includes(ime), 'Signed APK did not register its keyboard service.');
  shell(['ime', 'enable', ime]);
  shell(['ime', 'set', ime]);
  assert.equal(shell(['settings', 'get', 'secure', 'default_input_method']), ime);
  const dump = shell(['pm', 'dump', pkg]);
  assert.match(dump, /versionCode=4\b/);
  assert.match(dump, /versionName=2\.0\.1\b/);
  assert.match(dump, /SecureKeyboardService/);
  command(['install', '-r', apk]);
  assert.equal(shell(['settings', 'get', 'secure', 'default_input_method']), ime);
  console.log('Signed APK passed install, package/version, non-debuggable, IME registration/selection, and same-signature update checks.');
} finally {
  if (previousIme && previousIme !== 'null') shell(['ime', 'set', previousIme]);
}
