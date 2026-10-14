/* Run: npm install --no-save playwright && npx playwright install chromium
 * Then: node tests/browser-smoke.cjs
 * The runtime may alternatively expose Playwright via CODEX_PRIMARY_RUNTIME_NODE_MODULES.
 * Fixtures/screenshots are written to the OS temporary directory, never committed audio.
 */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { pathToFileURL } = require('node:url');
const { spawn } = require('node:child_process');
const { chromium } = require(require.resolve('playwright', { paths: [__dirname, process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES].filter(Boolean) }));
const root = path.resolve(__dirname, '..');
const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'orch-mix-test-'));

function wav(name, seconds, hz, bits = 16) {
  const rate = 8000, bytes = bits / 8, count = Math.round(seconds * rate);
  const b = Buffer.alloc(44 + count * bytes);
  b.write('RIFF'); b.writeUInt32LE(b.length - 8, 4); b.write('WAVEfmt ', 8); b.writeUInt32LE(16, 16);
  b.writeUInt16LE(1, 20); b.writeUInt16LE(1, 22); b.writeUInt32LE(rate, 24); b.writeUInt32LE(rate * bytes, 28);
  b.writeUInt16LE(bytes, 32); b.writeUInt16LE(bits, 34); b.write('data', 36); b.writeUInt32LE(count * bytes, 40);
  for (let i = 0; i < count; i++) {
    const value = hz ? Math.round(.08 * Math.sin(i * hz * Math.PI * 2 / rate) * (2 ** (bits - 1) - 1)) : 0;
    b.writeIntLE(value, 44 + i * bytes, bytes);
  }
  const location = path.join(temp, name); fs.mkdirSync(path.dirname(location), { recursive: true }); fs.writeFileSync(location, b); return location;
}

async function checkOrchestra(page, count) {
  assert.equal(await page.locator('.instrument').count(), count);
  assert.equal(await page.locator('#orchestra-map .orchestra-region').count(), count);
  assert.equal(await page.locator('#orchestra-map .orchestra-region').evaluateAll(regions => regions.every(region => region.querySelector('polygon'))), true);
  assert.equal(await page.locator('#orchestra-map .orchestra-region').evaluateAll(regions => regions.every(region => region.textContent.trim())), true);
  const map = await page.locator('#orchestra-map').boundingBox();
  const controls = await page.locator('#instrument-cards').boundingBox();
  assert.ok(map && controls && controls.y >= map.y + map.height - 1, 'The mixer is below the orchestra map');
}

async function saveSettings(page, filename) {
  const downloadPromise = page.waitForEvent('download'); await page.locator('#save-button').click();
  const download = await downloadPromise; const savedPath = path.join(temp, filename || download.suggestedFilename());
  await download.saveAs(savedPath);
  return { savedPath, session: JSON.parse(fs.readFileSync(savedPath)) };
}

(async () => {
  const browser = await chromium.launch({ headless: true, executablePath: process.env.ORCH_TEST_CHROME || undefined, args: ['--autoplay-policy=no-user-gesture-required'] });
  const context = await browser.newContext({ viewport: { width: 1440, height: 1060 }, acceptDownloads: true });
  const page = await context.newPage();
  const errors = [], remote = [];
  page.on('pageerror', e => errors.push(e.message));
  page.on('request', r => { if (/^https?:/.test(r.url()) && !/^http:\/\/127\.0\.0\.1:/.test(r.url())) remote.push(r.url()); });
  let server;
  try {
    await page.goto(pathToFileURL(path.join(root, 'index.html')).href);
    await page.locator('#demo-button').click();
    await page.waitForFunction(() => document.body.classList.contains('loaded'));
    await checkOrchestra(page, 12);
    const fluteArea = page.locator('.orchestra-region[data-track="fl"]');
    const fluteLevel = await page.locator('.instrument[data-track="fl"] .wheel').inputValue();
    await fluteArea.click();
    assert.equal(await page.getByRole('button', { name: 'Mute Flutes', exact: true }).getAttribute('aria-pressed'), 'true');
    assert.equal(await page.locator('.instrument[data-track="fl"] .wheel').inputValue(), fluteLevel);
    await fluteArea.press('Enter');
    assert.equal(await page.getByRole('button', { name: 'Mute Flutes', exact: true }).getAttribute('aria-pressed'), 'false');
    assert.equal(await page.locator('.instrument[data-track="fl"] .wheel').inputValue(), fluteLevel);
    await page.locator('#play-button').click();
    await page.waitForFunction(() => [...document.querySelectorAll('.instrument')].some(e => Number(e.style.getPropertyValue('--energy')) > .01));
    await page.waitForFunction(() => Number(document.querySelector('.orchestra-region[data-track="vln1"]').style.getPropertyValue('--energy')) > .01);
    await page.screenshot({ path: path.join(temp, 'desktop-demo.png'), fullPage: true });
    await page.getByRole('button', { name: 'Mute Violins I', exact: true }).click();
    assert.equal(await page.locator('#set-reference').isDisabled(), true);
    await page.waitForFunction(() => Number(document.querySelector('.orchestra-region[data-track="vln1"]').style.getPropertyValue('--energy')) < .005);
    await page.getByRole('button', { name: 'Mute Violins I', exact: true }).click();
    await page.locator('#reference-button').click();
    assert.equal(await page.locator('#set-reference').isDisabled(), true);
    await page.locator('#reference-button').click();
    await page.locator('#challenge-mode').click();
    assert.equal(await page.locator('.wheel').evaluateAll(es => es.every(e => Number(e.value) === 0)), true);
    assert.equal(await page.locator('.instrument-value').first().textContent(), 'LISTEN & ADJUST');
    await page.locator('.wheel').first().evaluate(el => { el.value = 5; el.dispatchEvent(new Event('input')); });
    await page.locator('#reveal-button').click();
    assert.match(await page.locator('#score').textContent(), /%/);
    await page.locator('#reset-button').click();
    assert.match(await page.locator('#score').textContent(), /^100%/);
    await page.locator('#scramble-button').click();
    assert.equal(await page.locator('#score').isHidden(), true);
    await page.locator('#explore-mode').click();
    const files = [wav('Violin_1.wav', 2, 440), wav('Flute.wav', 3, 660, 24), wav('Timpani.wav', 2, 0)];
    await page.locator('#library-button').click();
    await page.locator('#audio-files').setInputFiles(files);
    await page.locator('#session-title').fill('Local fixture piece');
    await page.locator('#excerpt-start').fill('0.25'); await page.locator('#excerpt-duration').fill('1.5');
    await page.locator('#load-button').click();
    await page.waitForFunction(() => !document.querySelector('#library-dialog').open);
    await checkOrchestra(page, 3);
    assert.equal(await page.locator('#orchestra-map .orchestra-region.brass').count(), 0);
    assert.match(await page.locator('#track-count').textContent(), /2 active/);
    assert.equal(Number(await page.locator('#seek').getAttribute('max')), 1.5);
    await page.locator('.wheel').first().evaluate(el => { el.value = -4; el.dispatchEvent(new Event('input')); });
    await page.locator('#set-reference').click();
    const { savedPath, session } = await saveSettings(page);
    assert.equal(session.tracks[0].referenceDb, -4); assert.equal(session.tracks.length, 3);
    assert.equal(session.tracks[0].file, 'Violin_1.wav'); assert.ok(fs.statSync(savedPath).size < 3000);
    await page.locator('#library-button').click(); await page.locator('#session-file').setInputFiles(savedPath);
    await page.locator('#audio-files').setInputFiles(files); await page.locator('#load-button').click();
    await page.waitForFunction(() => !document.querySelector('#library-dialog').open);
    assert.equal(await page.locator('.wheel').first().inputValue(), '-4');
    await page.locator('#play-button').click(); await page.locator('#loop-button').click();
    await page.waitForFunction(() => document.querySelector('#play-button').getAttribute('aria-label') === 'Play', { timeout: 5000 });
    await page.locator('#library-button').click(); await page.locator('#audio-files').setInputFiles(files);
    await page.locator('#excerpt-start').fill('999'); await page.locator('#load-button').click();
    await page.waitForFunction(() => document.querySelector('#load-message').textContent.includes('after the end'));
    assert.equal(await page.locator('#play-button').isDisabled(), true);
    await page.getByRole('button', { name: 'Close audio loader' }).click();
    await page.locator('#demo-button').click(); await page.waitForFunction(() => document.body.classList.contains('loaded'));

    // A manifest is discovered inside the selected folder; its files remain
    // relative to that manifest's own directory, even when a parent is picked.
    const collection = path.join(temp, 'collection');
    wav('collection/chamber/stems/violin.wav', 2, 330);
    wav('collection/chamber/stems/oboe.wav', 2, 440);
    wav('collection/chamber/stems/harp.wav', 2, 550);
    const folderSession = {
      version: 1, title: 'Chamber seating fixture', excerpt: { start: 0, duration: 1.5 },
      tracks: [
        { id: 'vln', name: 'Chamber violin', family: 'strings', file: 'stems/violin.wav', referenceDb: -2, seat: { row: 'front', order: 2, weight: 2 } },
        { id: 'ob', name: 'Solo oboe', family: 'woodwinds', file: 'stems/oboe.wav', referenceDb: -3, seat: { row: 'middle', order: 1, weight: 1 } },
        { id: 'hp', name: 'Harp', family: 'percussion', file: 'stems/harp.wav', referenceDb: -4, seat: { row: 'front', order: 1, weight: .5 } }
      ]
    };
    const folderManifest = path.join(collection, 'chamber', 'chamber.orchmix.json');
    fs.writeFileSync(folderManifest, JSON.stringify(folderSession));
    await page.locator('#library-button').click();
    await page.locator('#audio-folder').setInputFiles(collection);
    await page.waitForFunction(() => document.querySelector('#session-title').value === 'Chamber seating fixture' && !document.querySelector('#load-button').disabled);
    await page.locator('#load-button').click();
    await page.waitForFunction(() => !document.querySelector('#library-dialog').open);
    await checkOrchestra(page, 3);
    assert.equal(await page.locator('.orchestra-region.brass').count(), 0);
    assert.equal(await page.locator('.orchestra-region[data-track="hp"]').count(), 1);
    const roundTrip = await saveSettings(page, 'chamber-saved.orchmix.json');
    assert.deepEqual(roundTrip.session.tracks, folderSession.tracks);
    await page.locator('#library-button').click();
    await page.locator('#session-file').setInputFiles(roundTrip.savedPath);
    await page.locator('#audio-folder').setInputFiles(collection);
    await page.waitForFunction(() => !document.querySelector('#load-button').disabled);
    // Replace a matched folder while keeping the explicit JSON: a cached
    // directory from the first selection must not prevent a new match.
    const replacementCollection = path.join(temp, 'replacement-collection');
    fs.cpSync(collection, replacementCollection, { recursive: true });
    await page.locator('#audio-folder').setInputFiles(replacementCollection);
    await page.waitForFunction(() => !document.querySelector('#load-button').disabled && document.querySelector('#file-list').textContent.includes('replacement-collection/chamber/stems/violin.wav'));
    await page.locator('#load-button').click();
    await page.waitForFunction(() => !document.querySelector('#library-dialog').open);
    assert.equal(await page.locator('.instrument[data-track="ob"] .wheel').inputValue(), '-3');

    // Never guess between manifests, or fall back to auto-inference after an
    // invalid manifest. Choosing one explicit JSON resolves the ambiguity.
    fs.writeFileSync(path.join(collection, 'chamber', 'another.orchmix.json'), JSON.stringify(folderSession));
    await page.locator('#library-button').click();
    await page.locator('#audio-folder').setInputFiles(collection);
    await page.waitForFunction(() => /multiple|more than one|2 .*?(?:session|manifest)|choose one/i.test(document.querySelector('#load-message').textContent));
    assert.equal(await page.locator('#load-button').isDisabled(), true);
    await page.locator('#session-file').setInputFiles(folderManifest);
    await page.waitForFunction(() => !document.querySelector('#load-button').disabled);
    await page.locator('#load-button').click();
    await page.waitForFunction(() => !document.querySelector('#library-dialog').open);

    // Older exports included the selected root folder in each file path.
    // Loading that JSON from its original folder still works; new exports are portable.
    const legacyFolder = path.join(temp, 'legacy-performance');
    fs.cpSync(path.join(collection, 'chamber', 'stems'), path.join(legacyFolder, 'stems'), { recursive: true });
    const legacySession = { ...folderSession, title: 'Legacy folder fixture', tracks: folderSession.tracks.map(track => ({ ...track, file: 'legacy-performance/' + track.file })) };
    fs.writeFileSync(path.join(legacyFolder, 'legacy.orchmix.json'), JSON.stringify(legacySession));
    await page.locator('#library-button').click(); await page.locator('#audio-folder').setInputFiles(legacyFolder);
    await page.waitForFunction(() => document.querySelector('#session-title').value === 'Legacy folder fixture' && !document.querySelector('#load-button').disabled);
    await page.locator('#load-button').click(); await page.waitForFunction(() => !document.querySelector('#library-dialog').open);
    await checkOrchestra(page, 3);
    const legacyRoundTrip = await saveSettings(page, 'legacy-portable.orchmix.json');
    assert.deepEqual(legacyRoundTrip.session.tracks, folderSession.tracks);
    const invalidFolder = path.join(temp, 'invalid-manifest');
    wav('invalid-manifest/violin.wav', 2, 330);
    fs.writeFileSync(path.join(invalidFolder, 'bad.orchmix.json'), '{bad JSON');
    await page.locator('#library-button').click();
    await page.locator('#audio-folder').setInputFiles(invalidFolder);
    await page.waitForFunction(() => /not valid JSON|invalid JSON/i.test(document.querySelector('#load-message').textContent));
    assert.equal(await page.locator('#load-button').isDisabled(), true);
    await page.getByRole('button', { name: 'Close audio loader' }).click();

    // The largest supported instrumentation still renders one region and one
    // control per stem, with the mixer scrolling independently on small screens.
    const largeFolder = path.join(temp, 'large-orchestra');
    const families = ['strings', 'woodwinds', 'brass', 'percussion'];
    const largeSession = { version: 1, title: '48 part fixture', excerpt: { start: 0, duration: 1 }, tracks: [] };
    for (let index = 0; index < 48; index++) {
      const file = 'part-' + index + '.wav'; wav('large-orchestra/' + file, 1, 220 + index * 10);
      largeSession.tracks.push({ id: 'p' + index, name: 'Part ' + (index + 1), family: families[index % 4], file, referenceDb: -12 });
    }
    fs.writeFileSync(path.join(largeFolder, 'large.orchmix.json'), JSON.stringify(largeSession));
    await page.locator('#library-button').click(); await page.locator('#audio-folder').setInputFiles(largeFolder);
    await page.waitForFunction(() => !document.querySelector('#load-button').disabled);
    await page.locator('#load-button').click(); await page.waitForFunction(() => !document.querySelector('#library-dialog').open);
    await checkOrchestra(page, 48);
    await page.screenshot({ path: path.join(temp, 'desktop-48.png'), fullPage: true });
    await page.setViewportSize({ width: 390, height: 844 });
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), true);
    await checkOrchestra(page, 48);
    await page.screenshot({ path: path.join(temp, 'mobile-48.png'), fullPage: true });
    await page.reload(); await page.locator('#demo-button').click();
    await page.waitForFunction(() => document.body.classList.contains('loaded') && document.querySelectorAll('.instrument').length === 12);
    await checkOrchestra(page, 12);
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), true);
    await page.screenshot({ path: path.join(temp, 'mobile-demo.png'), fullPage: true });
    assert.deepEqual(remote, []);
    assert.deepEqual(errors, []);

    // Exercise the optional server; recordings and .git are never exposed.
    server = spawn(process.env.CODEX_PRIMARY_RUNTIME_PYTHON || 'python3', ['scripts/serve.py', '--no-browser', '--port', '18765'], { cwd: root, stdio: 'ignore' });
    for (let i = 0; i < 50; i++) {
      try { if ((await fetch('http://127.0.0.1:18765/')).ok) break; } catch (_) { /* wait for server */ }
      await new Promise(resolve => setTimeout(resolve, 50));
    }
    for (const pathname of ['.git/config', 'local-audio/test.wav', 'docs/', 'app/', 'README.md']) {
      assert.equal((await fetch('http://127.0.0.1:18765/' + pathname)).status, 404);
    }
    await page.goto('http://127.0.0.1:18765/'); await page.locator('#demo-button').click();
    await page.waitForFunction(() => document.body.classList.contains('loaded'));
    await checkOrchestra(page, 12); assert.deepEqual(errors, []); assert.deepEqual(remote, []);
    console.log('PASS: file:// and localhost; responsive orchestra polygons and separate mixer; pointer/keyboard polygon mute preserves fader levels; energy and mute fade; hidden challenge/reveal/solution; local PCM16/24 excerpts; silent-part exclusion; explicit and folder-manifest settings/seat round-trips; relative nested paths; explicit folder replacement; legacy path migration; multiple/invalid manifest blockers; 48-part layout; playback end; error recovery; mobile width; no external requests; server audio exclusion.');
    console.log('Screenshots and generated fixtures: ' + temp);
  } finally { if (server) server.kill(); await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
