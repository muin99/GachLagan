import { _android as android, expect } from '@playwright/test';
import { readFile, mkdir } from 'node:fs/promises';
import assert from 'node:assert/strict';
import { open as openReference } from '../secure/core.mjs';
const [device] = await android.devices();
if (!device || !device.serial().startsWith('emulator-')) throw new Error('Start an Android emulator. This test changes its keyboard and installs a debug APK.');
device.setDefaultTimeout(20000);
const pkg = 'com.gachlagan.keyboard', ime = pkg + '/.SecureKeyboardService';
const previousIme = (await device.shell('settings get secure default_input_method')).toString().trim();
const previousHardware = (await device.shell('settings get secure show_ime_with_hard_keyboard')).toString().trim();
async function hostNode(label) {
  let node;
  for (let attempt = 0; attempt < 5 && !node; attempt++) {
    await device.shell('uiautomator dump /sdcard/gachlagan-test-ui.xml');
    const xml = (await device.shell('cat /sdcard/gachlagan-test-ui.xml')).toString();
    node = [...xml.matchAll(/<node\b[^>]+>/g)].map(m => m[0]).find(n => n.includes('content-desc="' + label + '"') || new RegExp('text="' + label + '"', 'i').test(n));
    if (!node) await new Promise(resolve => setTimeout(resolve, 1000));
  }
  if (!node) throw new Error('Host test control missing: ' + label);
  const text = /\btext="([^"]*)"/.exec(node)?.[1] ?? '';
  const bounds = /bounds="\[(\d+),(\d+)\]\[(\d+),(\d+)\]"/.exec(node).slice(1).map(Number);
  return { text, x: Math.round((bounds[0] + bounds[2]) / 2), y: Math.round((bounds[1] + bounds[3]) / 2) };
}
async function tapHost(label) { const node = await hostNode(label); await device.shell(`input tap ${node.x} ${node.y}`); }
await mkdir('artifacts', { recursive: true });
try {
  console.log('Android E2E: install and start test host');
  await device.installApk(await readFile('mobile/android/app/build/outputs/apk/debug/app-debug.apk'));
  await device.shell('input keyevent KEYCODE_WAKEUP'); await device.shell('wm dismiss-keyguard');
  await device.shell('settings put secure show_ime_with_hard_keyboard 1');
  await device.shell('ime enable ' + ime); await device.shell('ime set ' + ime);
  await device.shell('am start -n ' + pkg + '/.HostTestActivity');
  await tapHost('Host message');
  // Start with an empty, host-owned clipboard so a previous test's valid
  // ciphertext cannot legitimately trigger auto-read while configuring.
  await tapHost('Copy received message');
  const web = await device.webView({ pkg }); const page = await web.page();
  page.setDefaultTimeout(20000);
  await page.locator('#settings').waitFor();
  await page.locator('#lock').click();
  console.log('Android E2E: configure generated shared key');
  const errors = []; page.on('pageerror', error => errors.push(error.message));
  const key = 'GKKEY1.AAECAwQFBgcICQoLDA0ODxAREhMUFRYXGBkaGxwdHh8';
  await page.locator('#settings').click(); await page.locator('#shared-key').fill(key);
  await page.locator('#remember').check(); await page.locator('#auto-read').check(); await page.locator('#save-settings').click();
  await expect(page.locator('#status')).toContainText('Key ready');
  console.log('Android E2E: private draft and ciphertext insertion');
  const text = 'Private draft বাংলা 🌱'; await page.locator('#draft').fill(text);
  const before = await hostNode('Host message');
  assert.ok(!before.text.includes(text), 'Private draft leaked into host editor');
  await expect(page.locator('#draft')).toHaveValue(text);
  await page.locator('#encrypt').click(); await expect(page.locator('#status')).toContainText('Ciphertext inserted');
  const host = await hostNode('Host message');
  assert.match(host.text, /^GK1\.K\./); assert.ok(!host.text.includes(text));
  await tapHost('Copy received message');
  await expect(page.locator('#read-text')).toHaveText(text);
  console.log('Android E2E: clipboard decryption passed; checking key storage');
  await expect(page.locator('#key-area')).toBeHidden();
  assert.equal((await hostNode('Host message')).text, host.text, 'Decryption changed host editor');
  await page.locator('#lock').click(); await expect(page.locator('#read-text')).toBeEmpty();
  await tapHost('Copy received message');
  await expect(page.locator('#read-text')).toHaveText(text);
  await expect(page.locator('#settings-panel')).toBeHidden();
  await page.locator('#lock').click();
  await page.locator('#settings').click(); await expect(page.locator('#shared-key')).toHaveValue('');
  await page.locator('#restore-key').click(); await expect(page.locator('#shared-key')).toHaveValue(key);
  const vault = (await device.shell('run-as ' + pkg + ' cat shared_prefs/vault.xml')).toString();
  assert.ok(!vault.includes(key)); assert.ok(!vault.includes(text)); assert.ok(vault.includes('wrapped'));
  await page.locator('#forget-key').click(); await expect(page.locator('#status')).toContainText('Saved key removed');
  await page.locator('#shared-key').fill(''); await page.locator('#restore-key').click(); await expect(page.locator('#status')).toContainText('No key saved');
  console.log('Android E2E: protected storage passed; checking native Unicode passphrase');
  await tapHost('Clear host message'); await tapHost('Copy received message'); await page.locator('#lock').click();
  await page.locator('#settings').click();
  const passphrase = 'বাংলা পাসফ্রেজ cafe\u0301 🌱';
  await page.locator('#shared-key').fill(passphrase); await page.locator('#save-settings').click();
  await expect(page.locator('#compose-panel')).toBeVisible();
  console.log('Android E2E: passphrase configured');
  await page.locator('#draft').fill('Unicode passphrase on Android 🔐'); await page.locator('#encrypt').click();
  await expect(page.locator('#status')).toContainText('Ciphertext inserted', { timeout: 15000 });
  const passwordWire = (await hostNode('Host message')).text;
  assert.match(passwordWire, /^GK1\.P\./);
  assert.equal(await openReference(passwordWire, passphrase.normalize('NFC')), 'Unicode passphrase on Android 🔐');
  await tapHost('Copy received message'); await expect(page.locator('#read-text')).toHaveText('Unicode passphrase on Android 🔐', { timeout: 15000 });
  await page.locator('#reply').click();
  await page.locator('#draft').fill('clear when hidden');
  await device.shell('input keyevent KEYCODE_BACK'); await tapHost('Host message');
  await expect(page.locator('#draft')).toHaveValue('');
  assert.deepEqual(errors, []);
  console.log('Android emulator E2E passed: compact visible draft, ciphertext-only host insertion, one-copy decryption, automatic saved-key unlock, Android Keystore persistence/deletion, native Unicode passphrase interoperability, and hide-to-lock.');
} finally {
  if (previousIme && previousIme !== 'null') await device.shell('ime set ' + previousIme);
  if (previousHardware !== 'null') await device.shell('settings put secure show_ime_with_hard_keyboard ' + previousHardware);
  await device.close();
}
