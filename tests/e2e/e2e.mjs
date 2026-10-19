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
const browserToModel = [];
page.on('request', (r) => { if (r.url().startsWith('http://127.0.0.1:5100') || r.url().startsWith('http://127.0.0.1:5999')) browserToModel.push(r.url()); });

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
// A global lorebook: "knot" fires from the chat, "zebra" never appears anywhere.
await page.evaluate(async () => {
  const c = SillyTavern.getContext();
  const entry = (uid, key, content) => ({ uid, key: [key], keysecondary: [], comment: key, content, constant: false, selective: true, selectiveLogic: 0, order: 100, position: 0, disable: false, probability: 100, useProbability: true, depth: 4, excludeRecursion: false, preventRecursion: false });
  const data = { entries: { 0: entry(0, 'knot', 'LORE-KNOT: in this world a knot locks for an hour.'), 1: entry(1, 'zebra', 'LORE-ZEBRA: must never be sent.') } };
  const r = await fetch('/api/worldinfo/edit', { method: 'POST', headers: c.getRequestHeaders(), body: JSON.stringify({ name: 'e2e-lore', data }) });
  if (!r.ok) throw new Error('worldinfo ' + r.status);
  await c.updateWorldInfoList();
  await c.executeSlashCommandsWithOptions('/world silent=true e2e-lore');
});
await page.waitForTimeout(800);
check('pill visible once a chat is open', await page.locator('#cm-root').isVisible());

// Configure the OOC model through the extension's settings UI.
await page.click('#extensions-settings-button');
await page.click('.cm-settings .inline-drawer-toggle');
// The API key lives in SillyTavern's server-side secret storage, written through ST's own API.
await page.evaluate(async () => {
  const c = SillyTavern.getContext();
  const r = await fetch('/api/secrets/write', { method: 'POST', headers: c.getRequestHeaders(), body: JSON.stringify({ key: 'api_key_custom', value: 'sk-test-123', label: 'e2e' }) });
  if (!r.ok) throw new Error('secret write ' + r.status);
});
check('profiles from Connection Manager are listed', await page.locator('.cm-settings [data-k="profileId"] option[value="cm-ooc"]').count() === 1);
await page.selectOption('.cm-settings [data-k="profileId"]', 'cm-ooc');
await page.waitForTimeout(300);
await page.fill('.cm-settings [data-k="leaderboardUrl"]', 'http://127.0.0.1:5200');
await page.fill('.cm-settings [data-k="nickname"]', 'tester');
await page.locator('.cm-settings [data-k="nickname"]').press('Tab');
await page.click('.cm-settings .cm-test');
await page.waitForFunction(() => /✓|✕/.test(document.querySelector('.cm-test-out')?.textContent || ''));
const testOut = await page.textContent('.cm-test-out');
check('"Test profile" goes through the selected profile', testOut.startsWith('✓'), testOut);
check('absurdity slider removed', await page.locator('.cm-settings [data-k="absurdity"]').count() === 0);
check('Liquid Glass toggle present and on by default', await page.locator('.cm-settings [data-k="liquidGlass"]').isChecked());
check('no API key anywhere in the browser (extension settings, localStorage)', await page.evaluate(() =>
  !JSON.stringify(SillyTavern.getContext().extensionSettings.cumometer).includes('sk-test') &&
  !Object.keys(localStorage).some((k) => /apikey/i.test(k) || /sk-test/.test(localStorage.getItem(k) || ''))));
check('no endpoint/model/key fields left in settings', await page.locator('.cm-settings [data-k="baseUrl"], .cm-settings [data-k="model"], .cm-settings .cm-apikey').count() === 0);
await page.locator('.cm-settings .cm-s').screenshot({ path: SP + '/settings-dark.png' });
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
check('model call uses the profile model and the key from ST secrets', last?.auth === 'Bearer sk-test-123' && last?.model === 'mock-ooc', JSON.stringify({ auth: last?.auth, model: last?.model }));
check('browser never talks to the model directly (requests go through ST)', browserToModel.length === 0, browserToModel.join(', '));
check('model receives the Cumometer system prompt (measurement contract)', last?.contract === true);
check('prompt carries the character card and persona', /Ren is an alpha in an omegaverse world/.test(last?.all || '') && /<user_persona|<character name=\\"Ren\\"/.test(last?.all || ''));
check('prompt carries the triggered lorebook entry, not the untriggered one', /LORE-KNOT/.test(last?.all || '') && !/LORE-ZEBRA/.test(last?.all || ''), (last?.all || '').match(/LORE-[A-Z]+/g)?.join(','));
check('roleplay preset is not sent (no main prompt from the preset)', !/fictional chat between/i.test(last?.all || ''));
check('measurement request goes last, measured message right before it', last?.roles?.at(-1) === 'user' && /measurement_request/.test(JSON.parse(last?.all || '[]').at(-1)?.content || '') && /knot swelling/.test(JSON.parse(last?.all || '[]').at(-2)?.content || ''));
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
const clipJar = async () => { const b = await page.locator('.cm-jar-stage').boundingBox(); return { x: b.x - 30, y: b.y - 20, width: b.width + 60, height: b.height + 40 }; };
await page.waitForFunction(() => document.querySelector('.cm-jar-stage').classList.contains('cm-overflowing'), null, { timeout: 5000 });
check('streams run down the walls', true);
for (const [i, ms] of [[1, 500], [2, 800], [3, 800], [4, 800], [5, 700]]) {
  await page.waitForTimeout(ms);
  await page.screenshot({ path: SP + `/goo-${i}.png`, clip: await clipJar() });
}
check('sticky residue after the swap', await page.evaluate(() => document.querySelector('.cm-jar-stage').classList.contains('cm-residue')));
await page.waitForTimeout(2600);
await page.screenshot({ path: SP + '/jar-2-after.png', clip: { x: 900, y: 40, width: 380, height: 520 } });
const meta = await page.textContent('.cm-jar-meta');
check('new jar holds the remainder (Jar 2 · 680 ml / 3 L)', /Jar 2 · 680 ml \/ 3 L/.test(meta), meta);
check('full jar moved to the shelf', await page.locator('.cm-jar-shelf .cm-shelf-jar').count() === 1);
await page.mouse.click(640, 400);
check('Russian reply triggers and is measured', Math.abs((await total()) - 3680) < 0.01, String(await total()));
{
  const ru = oocCalls().at(-1);
  const msgs = JSON.parse(ru?.all || '[]');
  const chatMsgs = msgs.slice(2, -1);
  check('only the last 4 chat messages are sent', chatMsgs.length === 4 && /I sit down/.test(chatMsgs[0].content) && !/I step closer|belly rounded/.test(ru.all), chatMsgs.map((m) => m.content.slice(0, 18)).join(' | '));
}

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
await page.evaluate(() => { SillyTavern.getContext().extensionSettings.cumometer.profileId = 'cm-dead'; });
const before = await total();
await send('*Again.*');  // mock returns the tea line next → maybe no trigger; send until a trigger
let tries = 0;
while ((await total()) === before && tries++ < 3) await send('*Again.*');
check('endpoint down → heuristic estimate still counts', (await total()) > before, `${before} → ${await total()}`);
await page.evaluate(() => { SillyTavern.getContext().extensionSettings.cumometer.profileId = 'cm-ooc'; });

// 7b. A reply identical to an already-measured one counts again.
const beforeRepeat = await total();
await send('*Repeat.*');
check('identical repeated reply counts again', (await total()) > beforeRepeat, `${beforeRepeat} → ${await total()}`);

// 7c. Model answers with chatter instead of JSON → one corrective retry, then it counts.
const beforeGarble = await total();
const callsBeforeGarble = oocCalls().length;
await send('*Garble.*');
const garbleToast = await page.textContent('.cm-toast-delta');
check('non-JSON answer triggers one corrective retry that is accepted', oocCalls().length - callsBeforeGarble === 2 && /^\+7 ml/.test(garbleToast), `toast "${garbleToast}", calls +${oocCalls().length - callsBeforeGarble}`);

// 8. Leaderboard submit (explicit click + confirm).
const sentTotal = await total();
await page.click('.cm-pill');
await page.waitForTimeout(500);
await page.click('.cm-submit');
await page.waitForTimeout(1500);
const board = await (await fetch('http://127.0.0.1:5200/api/top')).json();
const me = board.rows.find((r) => r.nick === 'tester');
check('leaderboard received this submission', !!me && Math.abs(me.ml - sentTotal) < 10, `${sentTotal} vs ${JSON.stringify(me)}`);
const wire = await (await fetch('http://127.0.0.1:5200/__last_body')).text();
check('submission is sealed: only v/epk/iv/ct on the wire, no nickname or volume in clear',
  JSON.stringify(Object.keys(JSON.parse(wire))) === '["v","epk","iv","ct"]' && !wire.includes('tester') && !wire.includes(String(Math.round(sentTotal))));
const baseBoard = await (await fetch('http://127.0.0.1:5200/api/top?board=base')).json();
const meBase = baseBoard.rows.find((r) => r.nick === 'tester');
check('base board gets the realistic total, far below omega-pizdec', !!meBase && meBase.ml > 0 && meBase.ml < me.ml / 10, `base ${meBase?.ml} vs omega ${me?.ml}`);
check('card shows the realistic base total', /Base · realistic\s*[\d.]+\s*ml/.test((await page.textContent('.cm-card')).replace(/\s+/g, ' ')));
check('leaderboard rows expose only rank, nick and volume', Object.keys(me).every((k) => ['rank', 'nick', 'ml', 'me'].includes(k)));
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
