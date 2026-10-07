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
  const location = path.join(temp, name); fs.writeFileSync(location, b); return location;
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
    assert.equal(await page.locator('.instrument').count(), 12);
    await page.locator('#play-button').click();
    await page.waitForFunction(() => [...document.querySelectorAll('.instrument')].some(e => Number(e.style.getPropertyValue('--energy')) > .01));
    await page.screenshot({ path: path.join(temp, 'desktop-demo.png'), fullPage: true });
    await page.getByRole('button', { name: 'Mute Violins I', exact: true }).click();
    assert.equal(await page.locator('#set-reference').isDisabled(), true);
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
    assert.equal(await page.locator('.instrument').count(), 3);
    assert.match(await page.locator('#track-count').textContent(), /2 active/);
    assert.equal(Number(await page.locator('#seek').getAttribute('max')), 1.5);
    await page.locator('.wheel').first().evaluate(el => { el.value = -4; el.dispatchEvent(new Event('input')); });
    await page.locator('#set-reference').click();
    const downloadPromise = page.waitForEvent('download'); await page.locator('#save-button').click();
    const download = await downloadPromise; const savedPath = path.join(temp, download.suggestedFilename()); await download.saveAs(savedPath);
    const session = JSON.parse(fs.readFileSync(savedPath));
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
    await page.setViewportSize({ width: 390, height: 844 });
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
    assert.equal(await page.locator('.instrument').count(), 12); assert.deepEqual(errors, []); assert.deepEqual(remote, []);
    console.log('PASS: file:// and localhost; demo playback/meters; hidden challenge/reveal/solution; local PCM16/24 excerpt import; silent-part exclusion; settings round-trip; playback end; error recovery; mobile width; no external requests; server audio exclusion.');
    console.log('Screenshots and generated fixtures: ' + temp);
  } finally { if (server) server.kill(); await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
