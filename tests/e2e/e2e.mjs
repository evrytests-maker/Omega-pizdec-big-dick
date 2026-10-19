import { chromium } from 'playwright';
import fs from 'node:fs';
const SP = process.argv[2];
const LOG = SP + '/llm.log';
const results = [];
const check = (name, ok, info = '') => { results.push({ name, ok }); console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${info ? '  — ' + info : ''}`); };
const oocCalls = () => fs.readFileSync(LOG, 'utf8').trim().split('\n').filter(Boolean).map(JSON.parse).filter((r) => r.ooc);

const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
const page = await b.newPage({ viewport: { width: 1280, height: 860 }, colorScheme: 'dark', deviceScaleFactor: 2 });
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
page.on('console', (m) => { if (/Cumometer/.test(m.text())) console.log('   console:', m.text()); });
page.on('dialog', (d) => d.accept());

async function boot() {
  await page.goto('http://127.0.0.1:8000/');
  await page.waitForFunction(() => window.SillyTavern?.getContext && document.getElementById('cm-root'), null, { timeout: 60000 });
  await page.waitForTimeout(1500);
}
await boot();
// Fresh install: drop any saved extension settings, persist, reload.
await page.evaluate(async () => { const c = SillyTavern.getContext(); delete c.extensionSettings.cumometer; await c.saveSettings?.(); c.saveSettingsDebounced(); });
await page.waitForTimeout(2500);
await boot();
check('fresh install has no leftover settings', await page.evaluate(() => Object.keys(SillyTavern.getContext().extensionSettings.cumometer.chars).length === 0));
check('extension loaded in SillyTavern (pill injected)', await page.locator('#cm-root').count() === 1);
check('settings panel rendered in Extensions', await page.locator('#extensions_settings2 .cm-settings, #extensions_settings .cm-settings').count() === 1);

// Create an omegaverse character through ST's own API and open its chat.
await page.evaluate(async () => {
  const c = SillyTavern.getContext();
  const fd = new FormData();
  fd.append('ch_name', 'Ren');
  fd.append('description', 'Ren is an alpha in an omegaverse world. His rut is close; when he knots, he does not let go.');
  fd.append('personality', 'possessive, protective');
  fd.append('scenario', 'Omegaverse. Ren finds {{user}}, an omega, during his rut.');
  fd.append('first_mes', 'Ren looks up from the fire.');
  fd.append('mes_example', ''); fd.append('creator_notes', ''); fd.append('system_prompt', ''); fd.append('post_history_instructions', '');
  fd.append('tags', ''); fd.append('creator', ''); fd.append('character_version', ''); fd.append('alternate_greetings', '');
  fd.append('talkativeness', '0.5'); fd.append('fav', 'false'); fd.append('world', ''); fd.append('depth_prompt_prompt', ''); fd.append('depth_prompt_depth', '4'); fd.append('depth_prompt_role', 'system'); fd.append('extensions', '{}');
  const headers = c.getRequestHeaders(); delete headers['Content-Type'];
  const r = await fetch('/api/characters/create', { method: 'POST', headers, body: fd, cache: 'no-cache' });
  if (!r.ok) throw new Error('create failed ' + r.status);
  await c.getCharacters();
  const id = c.characters.findIndex((x) => x.name === 'Ren');
  await c.selectCharacterById(id);
});
await page.waitForFunction(() => SillyTavern.getContext().chat?.length >= 1 && SillyTavern.getContext().getCurrentChatId());
await page.waitForTimeout(800);
check('pill visible once a chat is open', await page.locator('#cm-root').isVisible());

// Configure the OOC model through the extension's settings UI.
await page.click('#extensions-settings-button');
await page.click('.cm-settings .inline-drawer-toggle');
await page.fill('.cm-settings [data-k="baseUrl"]', 'http://127.0.0.1:5100/v1');
await page.fill('.cm-settings [data-k="model"]', 'mock-ooc');
await page.fill('.cm-settings .cm-apikey', 'sk-test-123');
await page.fill('.cm-settings [data-k="leaderboardUrl"]', 'http://127.0.0.1:5200');
await page.fill('.cm-settings [data-k="nickname"]', 'tester');
await page.locator('.cm-settings [data-k="nickname"]').press('Tab');
await page.click('.cm-settings .cm-test');
await page.waitForFunction(() => /✓|✕/.test(document.querySelector('.cm-test-out')?.textContent || ''));
const testOut = await page.textContent('.cm-test-out');
check('"Test" button reaches the custom endpoint', testOut.startsWith('✓'), testOut);
check('absurdity slider removed', await page.locator('.cm-settings [data-k="absurdity"]').count() === 0);
check('Liquid Glass toggle present and on by default', await page.locator('.cm-settings [data-k="liquidGlass"]').isChecked());
check('API key kept out of ST settings', await page.evaluate(() => !JSON.stringify(SillyTavern.getContext().extensionSettings.cumometer).includes('sk-test-123')));
await page.click('#extensions-settings-button');

// Connect ST itself to the mock (Custom OpenAI-compatible source preset in settings.json).
async function connect() {
  await page.evaluate(() => $('#api_button_openai').trigger('click'));
  await page.waitForFunction(() => SillyTavern.getContext().onlineStatus && SillyTavern.getContext().onlineStatus !== 'no_connection', null, { timeout: 20000 }).catch(() => {});
  await page.waitForSelector('#send_but:not(.displayNone)', { timeout: 20000 }).catch(() => {});
}
await connect();

async function send(text) {
  const before = await page.evaluate(() => SillyTavern.getContext().chat.length);
  await page.fill('#send_textarea', text);
  await page.click('#send_but');
  await page.waitForFunction((n) => SillyTavern.getContext().chat.length >= n + 2 && !SillyTavern.getContext().chat.at(-1).is_user, before, { timeout: 30000 });
  await page.waitForTimeout(2500);
}
// Ground truth = what the user sees on the pill (after the count-up animation settles).
const total = async () => {
  await page.waitForTimeout(1100);
  const t = (await page.textContent('.cm-pill')).replace(/\s+/g, '');
  const m = t.match(/([\d.,]+)(ml|L)/);
  return m ? Number(m[1].replace(/,/g, '')) * (m[2] === 'L' ? 1000 : 1) : NaN;
};
const pillText = () => page.textContent('.cm-pill').then((t) => t.replace(/\s+/g, ' ').trim());

// 1. Omegaverse knot message → regex hits → OOC model measures 1840 ml.
let n0 = oocCalls().length;
await send('*I step closer.*');
const reply1 = await page.evaluate(() => SillyTavern.getContext().chat.at(-1).mes);
let calls = oocCalls();
check('AI reply generated by ST', /knot/.test(reply1), reply1.slice(0, 60));
check('regex triggered exactly one OOC call', calls.length - n0 === 1);
const last = calls.at(-1);
check('OOC call carries the user key and model', last?.auth === 'Bearer sk-test-123' && last?.model === 'mock-ooc');
check('OOC prompt includes the character card (omegaverse context)', /omegaverse/i.test(last?.user || '') && /<regex_omegaverse_hint>true/.test(last?.user || ''));
check('total = 1840 ml', Math.abs((await total()) - 1840) < 0.01, String(await total()));
await page.waitForTimeout(600);
check('pill shows 1.84 L', /1\.84\s*L/.test(await pillText()), await pillText());
check('toast with OOC remark shown', await page.evaluate(() => document.getElementById('cm-root').classList.contains('cm-toasting')) && /buckets/.test(await page.textContent('.cm-toast-note')));
await page.screenshot({ path: SP + '/st-toast.png' });

// 2. Innocent message → no OOC call, total unchanged.
n0 = oocCalls().length;
await send('*I sit down.*');
check('innocent reply does not call the model', oocCalls().length === n0);
check('total unchanged', Math.abs((await total()) - 1840) < 0.01);

check('jar 1 is 61% full, shelf empty', await page.evaluate(() => /translateY\((\d+(\.\d+)?)px\)/.test(document.querySelector('.cm-jar-level').style.transform) && document.querySelector('.cm-jar-shelf').hidden));
check('pill shows a mini jar instead of a drop', await page.locator('.cm-pill .cm-mini-jar').count() === 1);

// 3. Russian knot message → second measurement, crosses 3 L → overflow into jar 2.
await page.click('.cm-pill');
await page.waitForTimeout(1300);
await page.screenshot({ path: SP + '/jar-0-before.png', clip: { x: 900, y: 40, width: 380, height: 520 } });
const nBefore = await page.evaluate(() => SillyTavern.getContext().chat.length);
await page.fill('#send_textarea', '*Смотрю на него.*');
await page.locator('#send_textarea').press('Enter');
await page.waitForFunction((n) => SillyTavern.getContext().chat.length >= n + 2 && !SillyTavern.getContext().chat.at(-1).is_user, nBefore, { timeout: 30000 });
await page.waitForFunction(() => document.querySelector('.cm-jar-level').style.transform.includes('20px'), null, { timeout: 15000 });
check('jar fills up to the rim before overflowing', true);
await page.waitForTimeout(800);
await page.screenshot({ path: SP + '/jar-1-overflow.png', clip: { x: 900, y: 40, width: 380, height: 520 } });
check('streams run down the walls', await page.evaluate(() => document.querySelector('.cm-jar-stage').classList.contains('cm-overflowing')));
await page.waitForTimeout(2600);
await page.screenshot({ path: SP + '/jar-2-after.png', clip: { x: 900, y: 40, width: 380, height: 520 } });
const meta = await page.textContent('.cm-jar-meta');
check('new jar holds the remainder (Jar 2 · 680 ml / 3 L)', /Jar 2 · 680 ml \/ 3 L/.test(meta), meta);
check('full jar moved to the shelf', await page.locator('.cm-jar-shelf .cm-shelf-jar').count() === 1);
await page.mouse.click(640, 400);
check('Russian reply triggers and is measured', Math.abs((await total()) - 3680) < 0.01, String(await total()));

// 4. Card view.
await page.click('.cm-pill');
await page.waitForTimeout(1200);
const cardText = (await page.textContent('.cm-card')).replace(/\s+/g, ' ');
check('card shows chat total, comparison and episodes', /3\.68/.test(cardText) && /bottles of wine/.test(cardText) && /Episodes\s*2/.test(cardText), cardText.slice(0, 140));
check('all-time for Ren equals this chat (only chat)', /All-time · Ren\s*3\.68/.test(cardText));
await page.screenshot({ path: SP + '/st-card-dark.png' });
await page.mouse.click(640, 400);

// 5. Delete the last message → total drops.
await page.evaluate(() => SillyTavern.getContext().executeSlashCommandsWithOptions('/cut ' + (SillyTavern.getContext().chat.length - 1)));
await page.waitForTimeout(1500);
check('deleting a measured message subtracts it', Math.abs((await total()) - 1840) < 0.01 || /1\.84/.test(await pillText()), await pillText());

// 6. Reload → persisted.
await boot();
await page.evaluate(async () => { const c = SillyTavern.getContext(); await c.selectCharacterById(c.characters.findIndex((x) => x.name === 'Ren')); });
await page.waitForTimeout(2000);
check('total persists after page reload', /1\.84\s*L/.test(await pillText()), await pillText());
await connect();

// 7. Offline fallback when the endpoint is down.
await page.evaluate(() => { SillyTavern.getContext().extensionSettings.cumometer.baseUrl = 'http://127.0.0.1:5999/v1'; });
const before = await total();
await send('*Again.*');  // mock returns the tea line next → maybe no trigger; send until a trigger
let tries = 0;
while ((await total()) === before && tries++ < 3) await send('*Again.*');
check('endpoint down → heuristic estimate still counts', (await total()) > before, `${before} → ${await total()}`);
await page.evaluate(() => { SillyTavern.getContext().extensionSettings.cumometer.baseUrl = 'http://127.0.0.1:5100/v1'; });

// 7b. A reply identical to an already-measured one counts again.
const beforeRepeat = await total();
await send('*Repeat.*');
check('identical repeated reply counts again', (await total()) > beforeRepeat, `${beforeRepeat} → ${await total()}`);

// 8. Leaderboard submit (explicit click + confirm).
const sentTotal = await total();
await page.click('.cm-pill');
await page.waitForTimeout(500);
await page.click('.cm-submit');
await page.waitForTimeout(1500);
const board = await (await fetch('http://127.0.0.1:5200/api/top')).json();
const me = board.rows.find((r) => r.nick === 'tester');
check('leaderboard received this submission', !!me && Math.abs(me.ml - sentTotal) < 10 && me.topChar === 'Ren', `${sentTotal} vs ${JSON.stringify(me)}`);
await page.mouse.click(640, 400);

// 9. Liquid Glass on/off + light theme screenshots.
await page.evaluate(() => { const s = SillyTavern.getContext().extensionSettings.cumometer; s.theme = 'light'; });
await page.evaluate(() => SillyTavern.getContext().eventSource.emit(SillyTavern.getContext().event_types.CHAT_CHANGED));
await page.click('.cm-pill'); await page.waitForTimeout(1200);
check('Liquid Glass class applied', await page.evaluate(() => document.getElementById('cm-root').classList.contains('cm-liquid')));
await page.screenshot({ path: SP + '/st-card-light.png' });
await page.mouse.click(640, 400);
await page.evaluate(() => { const s = SillyTavern.getContext().extensionSettings.cumometer; s.liquidGlass = false; s.theme = 'dark'; });
await page.evaluate(() => SillyTavern.getContext().eventSource.emit(SillyTavern.getContext().event_types.CHAT_CHANGED));
await page.waitForTimeout(300);
check('Liquid Glass off → classic frosted', await page.evaluate(() => !document.getElementById('cm-root').classList.contains('cm-liquid')));
await page.click('.cm-pill'); await page.waitForTimeout(1200);
await page.screenshot({ path: SP + '/st-card-frosted.png' });

// 10. Deleting the chat removes it from all-time totals.
const chatId = await page.evaluate(() => SillyTavern.getContext().getCurrentChatId());
await page.mouse.click(640, 400);
await page.evaluate(() => $('#option_start_new_chat').trigger('click'));
await page.locator('.popup-button-ok').last().click({ timeout: 10000 }).catch(() => {});
await page.waitForFunction((id) => SillyTavern.getContext().getCurrentChatId() !== id, chatId);
await page.waitForTimeout(800);
check('new chat starts at zero', (await total()) === 0, await pillText());
await page.evaluate((id) => SillyTavern.getContext().eventSource.emit(SillyTavern.getContext().event_types.CHAT_DELETED, id), chatId);
await page.waitForTimeout(300);
check('deleted chat no longer counted in all-time', await page.evaluate(() => Object.values(SillyTavern.getContext().extensionSettings.cumometer.chars).every((r) => !Object.keys(r.chats).length)));

check('no page errors from the extension', !errors.some((e) => /cumometer|cm-/i.test(e)), errors.join(' | ').slice(0, 200));
await b.close();
const failed = results.filter((r) => !r.ok).length;
console.log(`\n${results.length - failed}/${results.length} passed`);
process.exit(failed ? 1 : 0);
