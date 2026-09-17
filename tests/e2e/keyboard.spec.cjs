const { test, expect } = require('@playwright/test');
const AxeBuilder = require('@axe-core/playwright').default;
const KEY = 'GKKEY1.AAECAwQFBgcICQoLDA0ODxAREhMUFRYXGBkaGxwdHh8';
async function configure(frame, secret = KEY) {
  await frame.getByRole('button', { name: 'Keyboard settings', exact: true }).click();
  await frame.getByLabel('Your shared key or passphrase', { exact: true }).fill(secret);
  await frame.getByLabel('Automatically read copied').check();
  await frame.getByRole('button', { name: 'Use these settings' }).click();
  await expect(frame.locator('#compose-panel')).toBeVisible();
}
test('visible private draft -> encrypt -> host ciphertext -> copy -> full reader -> reply', async ({ page }) => {
  await page.goto('/');
  const sender = page.frameLocator('#sender'), receiver = page.frameLocator('#receiver');
  await configure(sender); await configure(receiver);
  const text = 'আমি বাংলায় কথা বলি 🌱 Meet at 6?';
  await sender.getByLabel('Private message', { exact: true }).fill(text);
  await expect(sender.getByLabel('Private message', { exact: true })).toHaveValue(text);
  await expect(page.locator('#sender-host')).toHaveValue('');
  await sender.getByRole('button', { name: 'Encrypt & insert' }).click();
  await expect(page.locator('#sender-host')).toHaveValue(/^GK1\.K\./);
  const wire = await page.locator('#sender-host').inputValue(); expect(wire).not.toContain(text);
  await page.getByRole('button', { name: 'Send encrypted message', exact: true }).click();
  await page.getByRole('button', { name: 'Copy message for receiver' }).click();
  await expect(receiver.getByLabel('Decoded message', { exact: true })).toHaveText(text);
  await expect(receiver.locator('#key-area')).toBeHidden();
  await expect(page.locator('#receiver-host')).toHaveValue('');
  await receiver.getByRole('button', { name: 'Private reply' }).click();
  await receiver.getByLabel('Private message', { exact: true }).fill('See you there.');
  await receiver.getByRole('button', { name: 'Encrypt & insert' }).click();
  await expect(page.locator('#receiver-host')).toHaveValue(/^GK1\./);
  await page.getByRole('button', { name: 'Send encrypted reply', exact: true }).click();
  await page.getByRole('button', { name: 'Copy message for sender' }).click();
  await expect(sender.getByLabel('Decoded message', { exact: true })).toHaveText('See you there.');
  await expect(sender.locator('#draft')).toHaveValue('');
  await sender.locator('#compose-tab').click();
  await page.getByRole('button', { name: 'Copy message for sender' }).click();
  await expect(sender.getByLabel('Decoded message', { exact: true })).toHaveText('See you there.');
});
test('copy opens a recognized message without Read mode; missing key prompts once', async ({ page }) => {
  await page.goto('/');
  const sender = page.frameLocator('#sender'), receiver = page.frameLocator('#receiver');
  await expect(receiver.locator('#auto-read')).toBeChecked();
  await expect(receiver.locator('#read-tab')).toHaveCount(0);
  await configure(sender);
  await sender.locator('#draft').fill('One copy is enough.');
  await sender.locator('#encrypt').click();
  await page.locator('#send').click();
  await page.getByRole('button', { name: 'Copy message for receiver' }).click();
  await expect(receiver.locator('#settings-panel')).toBeVisible();
  await receiver.locator('#shared-key').fill(KEY);
  await receiver.locator('#save-settings').click();
  await expect(receiver.locator('#read-text')).toHaveText('One copy is enough.');
});
test('automatic clipboard reading can be disabled in settings', async ({ page }) => {
  await page.goto('/');
  const sender = page.frameLocator('#sender'), receiver = page.frameLocator('#receiver');
  await configure(sender); await configure(receiver);
  await receiver.locator('#settings').click();
  await receiver.locator('#auto-read').uncheck();
  await receiver.locator('#save-settings').click();
  await sender.locator('#draft').fill('Do not auto-open.');
  await sender.locator('#encrypt').click();
  await page.locator('#send').click();
  await page.getByRole('button', { name: 'Copy message for receiver' }).click();
  await page.waitForTimeout(250);
  await expect(receiver.locator('#compose-panel')).toBeVisible();
  await expect(receiver.locator('#read-text')).toBeEmpty();
});
test('wrong key fails closed and user-supplied HTML renders only as text', async ({ page }) => {
  await page.goto('/'); const sender = page.frameLocator('#sender'), receiver = page.frameLocator('#receiver');
  await configure(sender); await configure(receiver, 'a completely different shared passphrase');
  await sender.locator('#draft').fill('<img src=x onerror=alert(1)>');
  await sender.locator('#encrypt').click(); await expect(page.locator('#sender-host')).toHaveValue(/^GK1\./);
  await page.locator('#send').click(); await page.getByRole('button', { name: 'Copy message for receiver' }).click();
  await expect(receiver.locator('#read-error')).not.toBeEmpty(); await expect(receiver.locator('#read-text')).toBeEmpty();
  await configure(receiver); await page.getByRole('button', { name: 'Copy message for receiver' }).click();
  await expect(receiver.locator('#read-text')).toHaveText('<img src=x onerror=alert(1)>'); await expect(receiver.locator('#read-text img')).toHaveCount(0);
});
test('encodings require no key and cannot be mistaken for private encryption', async ({ page }) => {
  await page.goto('/secure/index.html'); await page.locator('#settings').click(); await page.locator('#method').selectOption('binary');
  await expect(page.locator('#method-help')).toContainText('Not private');
  await page.locator('#save-settings').click(); await page.locator('#draft').fill('Hi');
  await expect(page.locator('#encrypt')).toHaveText(/Encode & insert/); await expect(page.locator('#mode-label')).toContainText('NOT PRIVATE');
  await page.locator('#encrypt').click(); await expect(page.locator('#status')).toContainText('Anyone can decode');
});
test('Avro keys produce a visible Bangla draft; backspace edits the phonetic token', async ({ page }) => {
  await page.goto('/secure/index.html');
  await page.getByRole('button', { name: 'Change typing language' }).click();
  for (const key of ['a','m','i']) await page.getByRole('button', { name: key, exact: true }).click();
  await expect(page.locator('#draft')).toHaveValue('আমি');
  await page.getByRole('button', { name: 'Backspace', exact: true }).click(); await expect(page.locator('#draft')).toHaveValue('আম');
});
test('locking and inactivity clear private drafts and keys; in-flight encryption cannot insert', async ({ page }) => {
  await page.goto('/'); const sender = page.frameLocator('#sender'); await configure(sender);
  await sender.locator('#draft').fill('erase me'); await sender.locator('#lock').click(); await expect(sender.locator('#draft')).toHaveValue('');
  await sender.locator('#draft').fill('new private text'); await sender.locator('#encrypt').click(); await expect(sender.locator('#settings-panel')).toBeVisible();
  await expect(sender.locator('#shared-key')).toHaveValue('');
  await sender.locator('#shared-key').fill('river lantern mango purple railway'); await sender.locator('#save-settings').click();
  await sender.locator('#draft').fill('never insert after lock');
  await page.locator('#sender').evaluate(frame => {
    const keyboard = frame.contentDocument;
    keyboard.querySelector('#encrypt').click(); keyboard.querySelector('#lock').click();
  });
  await page.waitForTimeout(800); await expect(page.locator('#sender-host')).toHaveValue('');
  await page.clock.install(); await sender.locator('#draft').fill('expires'); await page.clock.fastForward(61000); await expect(sender.locator('#draft')).toHaveValue('');
});
test('no network requests after load, and no secrets in web storage', async ({ page }) => {
  await page.goto('/'); await page.getByRole('button', { name: 'Set up a demo' }).click();
  const requests = []; page.on('request', request => requests.push(request.url()));
  const sender = page.frameLocator('#sender'); await sender.locator('#encrypt').click(); await expect(page.locator('#sender-host')).toHaveValue(/^GK1\./);
  expect(requests).toEqual([]);
  for (const frame of page.frames()) expect(await frame.evaluate(() => ({ local: localStorage.length, session: sessionStorage.length }))).toEqual({ local: 0, session: 0 });
});
test('keyboard is accessible and fits narrow mobile viewports', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 600 }); await page.goto('/secure/index.html');
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(320);
  expect(await page.locator('#key-area').evaluate(element => element.getBoundingClientRect().top)).toBeLessThan(190);
  const results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).analyze(); expect(results.violations).toEqual([]);
});
