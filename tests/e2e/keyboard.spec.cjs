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
  await expect(page.locator('#sender-host')).toHaveValue(/^\[\[GK2:\d+\]\]GK1\.K\./);
  const wire = await page.locator('#sender-host').inputValue(); expect(wire).not.toContain(text);
  await page.getByRole('button', { name: 'Send encrypted message', exact: true }).click();
  await page.getByRole('button', { name: 'Copy message for receiver' }).click();
  await expect(receiver.getByLabel('Decoded message', { exact: true })).toHaveText(text);
  await expect(receiver.locator('#key-area')).toBeHidden();
  await expect(page.locator('#receiver-host')).toHaveValue('');
  await receiver.getByRole('button', { name: 'Private reply' }).click();
  await receiver.getByLabel('Private message', { exact: true }).fill('See you there.');
  await receiver.getByRole('button', { name: 'Encrypt & insert' }).click();
  await expect(page.locator('#receiver-host')).toHaveValue(/^\[\[GK2:\d+\]\]GK1\./);
  await page.getByRole('button', { name: 'Send encrypted reply', exact: true }).click();
  await page.getByRole('button', { name: 'Copy message for sender' }).click();
  await expect(sender.getByLabel('Decoded message', { exact: true })).toHaveText('See you there.');
  await expect(sender.locator('#draft')).toHaveValue('');
  await sender.locator('#reply').click();
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
  await sender.locator('#encrypt').click(); await expect(page.locator('#sender-host')).toHaveValue(/^\[\[GK2:\d+\]\]GK1\./);
  await page.locator('#send').click(); await page.getByRole('button', { name: 'Copy message for receiver' }).click();
  await expect(receiver.locator('#read-error')).not.toBeEmpty(); await expect(receiver.locator('#read-text')).toBeEmpty();
  await configure(receiver); await page.getByRole('button', { name: 'Copy message for receiver' }).click();
  await expect(receiver.locator('#read-text')).toHaveText('<img src=x onerror=alert(1)>'); await expect(receiver.locator('#read-text img')).toHaveCount(0);
});
test('encodings require no key and cannot be mistaken for private encryption', async ({ page }) => {
  await page.goto('/secure/index.html'); await page.locator('#mode-pill').click();
  await expect(page.locator('#modes-panel')).toBeVisible();
  await page.locator('[data-mode="binary"]').click(); await page.locator('#draft').fill('Hi');
  await expect(page.locator('#encrypt')).toHaveText(/Encode & insert/); await expect(page.locator('#mode-label')).toContainText('NOT PRIVATE');
  await page.locator('#encrypt').click(); await expect(page.locator('#status')).toContainText('Anyone can decode');
});
test('Shift is one-shot, then Caps Lock, and emoji are visible in the draft', async ({ page }) => {
  await page.goto('/secure/index.html');
  await page.getByRole('button', { name: 'Shift', exact: true }).click();
  for (const letter of ['A', 'm', 'a', 'r']) await page.getByRole('button', { name: letter.toLowerCase(), exact: true }).click();
  await expect(page.locator('#draft')).toHaveValue('Amar');
  await page.locator('#draft').fill('');
  await page.getByRole('button', { name: 'Shift', exact: true }).click();
  await page.getByRole('button', { name: 'Shift', exact: true }).click();
  for (const letter of ['a', 'm', 'a', 'r']) await page.getByRole('button', { name: letter, exact: true }).click();
  await expect(page.locator('#draft')).toHaveValue('AMAR');
  await page.getByRole('button', { name: 'Caps lock on' }).click();
  await page.getByRole('button', { name: 'a', exact: true }).click();
  await page.getByRole('button', { name: 'Emoji keyboard' }).click();
  await page.getByRole('button', { name: '🌱', exact: true }).click();
  await expect(page.locator('#draft')).toHaveValue('AMARa🌱');
  await page.getByRole('button', { name: 'Backspace', exact: true }).click();
  await expect(page.locator('#draft')).toHaveValue('AMARa');
  await page.getByRole('button', { name: 'Emoji keyboard' }).click();
  await page.getByRole('button', { name: 'Numbers and symbols' }).click();
  await page.getByRole('button', { name: 'More symbols' }).click();
  await page.getByRole('button', { name: '€', exact: true }).click();
  await expect(page.locator('#draft')).toHaveValue('AMARa€');
});
test('adjacent encrypted inserts open from one copy', async ({ page }) => {
  await page.goto('/'); const sender = page.frameLocator('#sender'), receiver = page.frameLocator('#receiver');
  await configure(sender); await configure(receiver);
  for (const [index, message] of ['First 🌱', 'Second বাংলা'].entries()) {
    await sender.locator('#draft').fill(message); await sender.locator('#encrypt').click();
    await expect.poll(async () => ((await page.locator('#sender-host').inputValue()).match(/\[\[GK2:\d+\]\]/g) ?? []).length).toBe(index + 1);
  }
  const copied = await page.locator('#sender-host').inputValue();
  expect(copied.match(/\[\[GK2:\d+\]\]/g)).toHaveLength(2);
  await page.locator('#send').click(); await page.getByRole('button', { name: 'Copy message for receiver' }).click();
  await expect(receiver.locator('#read-text')).toHaveText('First 🌱\n\nSecond বাংলা');
});
test('a framed message can be encrypted again and unwrapped with a bounded depth', async ({ page }) => {
  await page.goto('/'); const sender = page.frameLocator('#sender'), receiver = page.frameLocator('#receiver');
  await configure(sender); await configure(receiver);
  await sender.locator('#draft').fill('Two layers.'); await sender.locator('#encrypt').click();
  await expect(page.locator('#sender-host')).toHaveValue(/^\[\[GK2:/);
  await page.locator('#send').click(); await page.getByRole('button', { name: 'Copy message for receiver' }).click();
  await expect(receiver.locator('#read-text')).toHaveText('Two layers.');
  await receiver.locator('#reply').click();
  await receiver.locator('#paste-draft').click();
  await expect(receiver.locator('#draft')).toHaveValue(/^\[\[GK2:\d+\]\]GK1\./);
  await receiver.locator('#encrypt').click(); await expect(page.locator('#receiver-host')).toHaveValue(/^\[\[GK2:/);
  await page.locator('#send-reply').click();
  await page.getByRole('button', { name: 'Copy message for sender' }).click();
  await expect(sender.locator('#read-text')).toHaveText('Two layers.');
});
test('one tampered frame rejects the entire copied batch', async ({ page }) => {
  const { seal, unb64, b64 } = await import('../../secure/core.mjs');
  const { frameMessage } = await import('../../secure/framing.mjs');
  await page.goto('/'); const receiver = page.frameLocator('#receiver'); await configure(receiver);
  const good = await seal('Do not reveal even this first message.', KEY);
  const damaged = (await seal('Tampered second message.', KEY)).split('.');
  const cipher = unb64(damaged[4]); cipher[0] ^= 1; damaged[4] = b64(cipher);
  const copy = frameMessage(good) + frameMessage(damaged.join('.'));
  await page.evaluate(text => document.querySelector('#receiver').contentWindow.postMessage({ source: 'gachlagan-preview', op: 'clipboard', text }, location.origin), copy);
  await expect(receiver.locator('#read-error')).not.toBeEmpty();
  await expect(receiver.locator('#read-text')).toBeEmpty();
});
test('settings mode picker opens within the keyboard and saves a public mode', async ({ page }) => {
  await page.goto('/secure/index.html'); await page.locator('#settings').click();
  await expect(page.locator('#key-area')).toBeHidden();
  await page.locator('#method-picker').click();
  await expect(page.locator('#modes-panel')).toBeVisible();
  await page.locator('[data-mode="base32"]').click();
  await expect(page.locator('#settings-panel')).toBeVisible();
  await expect(page.locator('#method-choice')).toContainText('Base32');
  await page.locator('#save-settings').click();
  await expect(page.locator('#mode-label')).toContainText('BASE32');
});
test('settings and mode close buttons cancel changes and return to the prior panel', async ({ page }) => {
  await page.goto('/secure/index.html');
  await page.locator('#settings').click();
  await page.locator('#method-picker').click();
  await page.locator('[data-mode="hex"]').click();
  await expect(page.locator('#method-choice')).toContainText('Hexadecimal');
  await page.locator('#close-settings').click();
  await expect(page.locator('#compose-panel')).toBeVisible();
  await expect(page.locator('#mode-label')).toContainText('AES-256-GCM');
  await page.locator('#settings').click();
  await expect(page.locator('#method-choice')).toContainText('Private');
  await page.locator('#method-picker').click();
  await page.locator('#close-modes').click();
  await expect(page.locator('#settings-panel')).toBeVisible();
});
test('Avro keys produce a visible Bangla draft; backspace edits the phonetic token', async ({ page }) => {
  await page.goto('/secure/index.html');
  await page.getByRole('button', { name: 'Change typing language' }).click();
  for (const key of ['a','m','i']) await page.getByRole('button', { name: key, exact: true }).click();
  await expect(page.locator('#draft')).toHaveValue('আমি');
  await page.getByRole('button', { name: 'Emoji keyboard' }).click();
  await page.getByRole('button', { name: '❤️', exact: true }).click();
  await expect(page.locator('#draft')).toHaveValue('আমি❤️');
  await page.getByRole('button', { name: 'Backspace', exact: true }).click();
  await expect(page.locator('#draft')).toHaveValue('আমি');
  await page.getByRole('button', { name: 'Backspace', exact: true }).click(); await expect(page.locator('#draft')).toHaveValue('আম');
});
test('backspace removes a selection and repeats while held', async ({ page }) => {
  await page.goto('/secure/index.html');
  const draft = page.locator('#draft'), erase = page.getByRole('button', { name: 'Backspace', exact: true });
  await draft.fill('select all of this');
  await draft.evaluate(field => field.select());
  await erase.click();
  await expect(draft).toHaveValue('');

  await draft.fill('hold-to-delete');
  const box = await erase.boundingBox();
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.waitForTimeout(700);
  await page.mouse.up();
  expect((await draft.inputValue()).length).toBeLessThan('hold-to-delete'.length - 2);

  await draft.fill('');
  await page.getByRole('button', { name: 'Change typing language' }).click();
  for (const key of ['a', 'm', 'i']) await page.getByRole('button', { name: key, exact: true }).click();
  await expect(draft).toHaveValue('আমি');
  await draft.evaluate(field => field.select());
  await erase.click();
  await expect(draft).toHaveValue('');
});
test('normal typing backspace removes the host app selection and repeats while held', async ({ page }) => {
  await page.goto('/');
  const keyboard = page.frameLocator('#sender'), host = page.locator('#sender-host');
  await keyboard.locator('#plain-mode').click();
  await host.evaluate(field => { field.value = 'selected host text'; field.select(); });
  const erase = keyboard.getByRole('button', { name: 'Backspace', exact: true });
  await erase.click();
  await expect(host).toHaveValue('');

  await host.evaluate(field => { field.value = 'repeat in host'; field.setSelectionRange(field.value.length, field.value.length); });
  const box = await erase.boundingBox();
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.waitForTimeout(700);
  await page.mouse.up();
  expect((await host.inputValue()).length).toBeLessThan('repeat in host'.length - 2);
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
  const sender = page.frameLocator('#sender'); await sender.locator('#encrypt').click(); await expect(page.locator('#sender-host')).toHaveValue(/^\[\[GK2:\d+\]\]GK1\./);
  expect(requests).toEqual([]);
  for (const frame of page.frames()) expect(await frame.evaluate(() => ({ local: localStorage.length, session: sessionStorage.length }))).toEqual({ local: 0, session: 0 });
});
test('keyboard is accessible and fits narrow mobile viewports', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 600 }); await page.goto('/secure/index.html');
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(320);
  expect(await page.locator('#key-area').evaluate(element => element.getBoundingClientRect().top)).toBeLessThan(190);
  for (const panel of ['compose', 'settings', 'modes']) {
    if (panel === 'settings') await page.locator('#settings').click();
    if (panel === 'modes') await page.locator('#method-picker').click();
    const results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).analyze();
    expect(results.violations, `${panel} accessibility`).toEqual([]);
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(320);
  }
});
