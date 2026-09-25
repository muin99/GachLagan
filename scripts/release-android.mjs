// Maintainer tooling for a persistent Android release identity on macOS.
// Private keys never enter the repository; passwords are kept in login Keychain.
import { spawnSync } from 'node:child_process';
import { randomBytes, createHash } from 'node:crypto';
import { existsSync, mkdirSync, chmodSync, readFileSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
process.chdir(root);
if (process.platform !== 'darwin') throw new Error('This signing helper uses macOS login Keychain.');
const signingDir = join(homedir(), 'Library/Application Support/GachLagan/release-signing');
const keystore = join(signingDir, 'android-release.p12');
const service = 'com.gachlagan.android.release-signing';
const account = 'android-release';
const alias = 'gachlagan-release';
function run(command, args, options = {}) {
  const result = spawnSync(command, args, { encoding: 'utf8', maxBuffer: 16 * 1024 * 1024, ...options });
  if (result.status !== 0) throw new Error(`${command} failed: ${result.stderr || result.stdout || result.error}`);
  return result.stdout || '';
}
const saved = spawnSync('/usr/bin/security', ['find-generic-password', '-s', service, '-a', account, '-w'], { encoding: 'utf8' });
if (process.argv.includes('--init-key')) {
  if (existsSync(keystore)) {
    if (saved.status !== 0) throw new Error('Keystore exists but its Keychain password is unavailable. Restore access; do not replace the key.');
    console.log('Existing release signing identity preserved.');
    process.exit(0);
  }
  if (saved.status === 0) throw new Error('Keychain identity already exists. Restore its keystore instead of generating a replacement.');
  mkdirSync(signingDir, { recursive: true, mode: 0o700 });
  chmodSync(signingDir, 0o700);
  const password = randomBytes(32).toString('hex');
  // Pass the Keychain command through stdin so the password is not in argv or logs.
  const stored = spawnSync('/usr/bin/security', ['-i'], {
    input: `add-generic-password -s ${service} -a ${account} -w ${password} -T /usr/bin/security\n`, encoding: 'utf8'
  });
  const check = spawnSync('/usr/bin/security', ['find-generic-password', '-s', service, '-a', account, '-w'], { encoding: 'utf8' });
  if (stored.status !== 0 || check.status !== 0 || check.stdout.trim() !== password) throw new Error('Could not store and retrieve the signing password in Keychain.');
  run('keytool', ['-genkeypair', '-keystore', keystore, '-storetype', 'PKCS12', '-alias', alias,
    '-keyalg', 'RSA', '-keysize', '3072', '-validity', '10000', '-dname', 'CN=GachLagan Android Release,O=GachLagan',
    '-storepass:env', 'GACHLAGAN_SIGNING_PASSWORD', '-keypass:env', 'GACHLAGAN_SIGNING_PASSWORD'],
    { env: { ...process.env, GACHLAGAN_SIGNING_PASSWORD: password } });
  chmodSync(keystore, 0o600);
  console.log(`Release keystore created: ${keystore}\nPassword stored in login Keychain as ${service}. Back up both before moving to another Mac.`);
  process.exit(0);
}
if (!existsSync(keystore) || saved.status !== 0) throw new Error('Run npm run release:android -- --init-key once to establish the release identity.');
if (run('git', ['status', '--porcelain']).trim()) throw new Error('Commit or resolve worktree changes before building a traceable release.');
const sdk = process.env.ANDROID_HOME || process.env.ANDROID_SDK_ROOT;
if (!sdk) throw new Error('Set ANDROID_HOME to the installed Android SDK.');
const buildTools = join(sdk, 'build-tools/36.0.0');
const version = JSON.parse(readFileSync('package.json', 'utf8')).version;
const sourceCommit = run('git', ['rev-parse', 'HEAD']).trim();
const tag = `v${version}`;
const output = join(root, 'artifacts/releases', tag);
mkdirSync(output, { recursive: true });
const filename = `GachLagan-${tag}-android.apk`;
const apk = join(output, filename);
if (existsSync(apk)) throw new Error(`Release artifact already exists: ${apk}. Preserve published bytes; use a new version for a new build.`);
run('npm', ['run', 'build:secure'], { stdio: 'inherit' });
run('mobile/android/gradlew', ['-p', 'mobile/android', ':app:assembleRelease', ':app:lintRelease', '--console=plain'], { stdio: 'inherit' });
if (run('git', ['status', '--porcelain']).trim()) throw new Error('Build changed tracked inputs. Review and commit them before signing.');
const unsigned = 'mobile/android/app/build/outputs/apk/release/app-release-unsigned.apk';
const badging = run(join(buildTools, 'aapt'), ['dump', 'badging', unsigned]);
const manifest = run(join(buildTools, 'aapt'), ['dump', 'xmltree', unsigned, 'AndroidManifest.xml']);
if (!badging.includes("package: name='com.gachlagan.keyboard'") || !badging.includes(`versionName='${version}'`)) throw new Error('Unexpected package or version.');
if (/application-debuggable/.test(badging) || /android.permission.INTERNET|HostTestActivity/.test(manifest)) throw new Error('Release contains a debug or network capability.');
if (!/android:allowBackup[^\n]*0x0\b/.test(manifest)) throw new Error('Release must disable backups.');
run(join(buildTools, 'zipalign'), ['-c', '-P', '16', '4', unsigned]);
const signingEnv = { ...process.env, GACHLAGAN_SIGNING_PASSWORD: saved.stdout.trim() };
run(join(buildTools, 'apksigner'), ['sign', '--ks', keystore, '--ks-key-alias', alias,
  '--ks-pass', 'env:GACHLAGAN_SIGNING_PASSWORD', '--key-pass', 'env:GACHLAGAN_SIGNING_PASSWORD',
  '--v4-signing-enabled', 'false', '--out', apk, unsigned], { env: signingEnv });
const verification = run(join(buildTools, 'apksigner'), ['verify', '--verbose', '--print-certs', apk]);
const fingerprint = /Signer #1 certificate SHA-256 digest: ([a-f0-9]+)/i.exec(verification)?.[1];
if (!fingerprint || !/Verified using v2 scheme[^\n]*true/.test(verification)) throw new Error('Release signature did not verify.');
writeFileSync(join(output, 'SIGNING-CERTIFICATE.pem'), run('keytool', ['-exportcert', '-rfc', '-keystore', keystore,
  '-alias', alias, '-storepass:env', 'GACHLAGAN_SIGNING_PASSWORD'], { env: signingEnv }), { flag: 'wx' });
const sha256 = createHash('sha256').update(readFileSync(apk)).digest('hex');
writeFileSync(join(output, 'release.json'), JSON.stringify({ tag, version, sourceCommit, filename, sha256,
  applicationId: 'com.gachlagan.keyboard', versionCode: Number(/versionCode='(\d+)'/.exec(badging)[1]), minAndroid: '8.0',
  signingCertificateSHA256: fingerprint, prerelease: true }, null, 2) + '\n', { flag: 'wx' });
const files = [filename, 'SIGNING-CERTIFICATE.pem', 'release.json'];
writeFileSync(join(output, 'SHA256SUMS'), files.map(name => `${createHash('sha256').update(readFileSync(join(output, name))).digest('hex')}  ${name}`).join('\n') + '\n', { flag: 'wx' });
console.log(verification);
console.log(`Signed release prepared in ${output}\nAPK SHA-256: ${sha256}\nSource: ${sourceCommit}`);
