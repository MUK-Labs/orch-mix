/* Run with the same Playwright/ORCH_TEST_CHROME setup as browser-smoke.cjs.
 * These tests use synthetic local WAVs and mocked browser directory/MIDI APIs.
 * They verify the real app integration, not a physical controller or OS picker.
 */
'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { pathToFileURL } = require('node:url');
const { chromium } = require(require.resolve('playwright', { paths: [__dirname, process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES].filter(Boolean) }));
const root = path.resolve(__dirname, '..');
const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'orch-features-test-'));

// Browser mocks are deliberately installed before app modules. IndexedDB stores
// handle references just as its native structured-clone support would, with a
// small localStorage backing so reload exercises app startup and reconnection.
function installBrowserFixtures() {
  const tracks = [
    ['vln1', 'Violins I', 'strings', 4], ['vln2', 'Violins II', 'strings', 4],
    ['vla', 'Violas', 'strings', 2], ['vc', 'Cellos', 'strings', 2],
    ['cb', 'Double basses', 'strings', 1], ['fl', 'Flute', 'woodwinds', 1],
    ['ob', 'Oboes', 'woodwinds', 2], ['cl', 'Clarinets', 'woodwinds', 2],
    ['bn', 'Bassoons', 'woodwinds', 2], ['hn', 'Horns', 'brass', 2],
    ['trp', 'Trumpets', 'brass', 2], ['timp', 'Timpani', 'percussion', 1]
  ].map(([id, name, family, players]) => ({ id, name, family, players, playersBasis: 'confirmed', file: id + '.wav', referenceDb: -3 }));
  const test = window.__orchTest = {
    pick: 'first-piece', permissions: {}, requestedPermissions: [], reads: [],
    loads: [], plays: [], gains: {}, midiRequests: [], folders: {},
    titles: ['First Secret Symphony', 'Second Secret Overture']
  };
  function wav(name, seconds, index) {
    const rate = 8000, frames = Math.floor(seconds * rate), buffer = new ArrayBuffer(44 + frames * 2);
    const view = new DataView(buffer);
    function ascii(offset, text) { [...text].forEach((char, i) => view.setUint8(offset + i, char.charCodeAt(0))); }
    ascii(0, 'RIFF'); view.setUint32(4, buffer.byteLength - 8, true); ascii(8, 'WAVEfmt ');
    view.setUint32(16, 16, true); view.setUint16(20, 1, true); view.setUint16(22, 1, true);
    view.setUint32(24, rate, true); view.setUint32(28, rate * 2, true); view.setUint16(32, 2, true); view.setUint16(34, 16, true);
    ascii(36, 'data'); view.setUint32(40, frames * 2, true);
    for (let i = 0; i < frames; i++) view.setInt16(44 + i * 2, Math.round(2000 * Math.sin(i * (220 + index * 17) * Math.PI * 2 / rate)), true);
    return new File([buffer], name, { type: 'audio/wav' });
  }
  function folder(name, title, seconds, broken = false, pieceTracks = tracks) {
    return {
      name, kind: 'directory',
      async queryPermission() { return test.permissions[name] || 'granted'; },
      async requestPermission() { test.requestedPermissions.push(name); return test.permissions[name] || 'granted'; },
      async isSameEntry(other) { return name === other.name; },
      async *entries() {
        if (test.permissions[name] === 'denied') throw new DOMException('Denied', 'NotAllowedError');
        if (test.missing === name) throw new DOMException('Moved', 'NotFoundError');
        test.reads.push(name);
        const manifest = { version: 1, title, excerpt: { start: 0, duration: 5 }, tracks: pieceTracks };
        yield ['piece.orchmix.json', { kind: 'file', getFile: async () => new File([broken ? '{bad JSON' : JSON.stringify(manifest)], 'piece.orchmix.json', { type: 'application/json' }) }];
        for (const [index, track] of pieceTracks.entries()) {
          // One shorter track makes random-start selection use common duration.
          yield [track.file, { kind: 'file', getFile: async () => wav(track.file, seconds - (index === 11 ? 2 : 0), index) }];
        }
      }
    };
  }
  test.folders['first-piece'] = folder('first-piece', test.titles[0], 32);
  test.folders['second-piece'] = folder('second-piece', test.titles[1], 48);
  test.folders['broken-piece'] = folder('broken-piece', 'Never reveal this broken title', 32, true);
  test.folders['many-parts'] = folder('many-parts', 'Twenty-part MIDI fixture', 12, false,
    Array.from({ length: 20 }, (_, index) => ({
      id: 'part-' + (index + 1), name: 'Part ' + (index + 1), family: 'strings',
      file: 'part-' + (index + 1) + '.wav', referenceDb: -3,
      seat: { row: 'front', order: index, weight: 1 }
    })));
  Object.defineProperty(window, 'showDirectoryPicker', { configurable: true, value: async () => test.folders[test.pick] });
  const storageKey = 'orchmix.test.library-handles';
  function readRecords() {
    return JSON.parse(localStorage.getItem(storageKey) || '[]').map(record => ({ ...record, handle: test.folders[record.handleName] }));
  }
  function writeRecords(records) {
    localStorage.setItem(storageKey, JSON.stringify(records.map(({ handle, ...record }) => ({ ...record, handleName: handle.name }))));
  }
  Object.defineProperty(window, 'indexedDB', { configurable: true, value: {
    open() {
      const request = {};
      queueMicrotask(() => {
        request.result = {
          objectStoreNames: { contains: () => true }, close() {},
          transaction() {
            const transaction = { objectStore() {
              const done = value => { const result = { result: value }; queueMicrotask(() => transaction.oncomplete()); return result; };
              return {
                getAll: () => done(readRecords()),
                put: record => { const records = readRecords().filter(old => old.id !== record.id); records.push(record); writeRecords(records); return done(record.id); },
                delete: id => { writeRecords(readRecords().filter(record => record.id !== id)); return done(undefined); }
              };
            } };
            return transaction;
          }
        };
        request.onsuccess();
      });
      return request;
    }
  } });

  const port = new EventTarget();
  Object.assign(port, { id: 'test-nanokontrol', name: 'nanoKONTROL2', manufacturer: 'KORG', state: 'connected', close: async () => {} });
  const access = new EventTarget(); access.inputs = new Map([[port.id, port]]);
  Object.defineProperty(access, 'outputs', { get() { throw new Error('The app must only receive MIDI'); } });
  test.sendMidi = data => { const event = new Event('midimessage'); event.data = new Uint8Array(data); port.dispatchEvent(event); };
  Object.defineProperty(navigator, 'requestMIDIAccess', { configurable: true, value: async options => { test.midiRequests.push(options); return access; } });
  Object.defineProperty(navigator, 'permissions', { configurable: true, value: { query: async () => ({ state: 'granted' }) } });

  // Observe real engine calls to verify the first playback is already silent.
  let Engine;
  Object.defineProperty(window, 'OrchAudioEngine', { configurable: true, get: () => Engine, set: Original => {
    Engine = class extends Original {
      constructor(...args) { super(...args); test.engine = this; }
      async load(entries, options) { test.loads.push({ ids: entries.map(entry => entry.id), ...options, onProgress: undefined }); return super.load(entries, options); }
      setGain(id, gain) { test.gains[id] = gain; return super.setGain(id, gain); }
      async play() { test.plays.push({ ...test.gains }); return super.play(); }
    };
  } });
}

async function savedOption(page, name) {
  return page.locator('#saved-pieces option').filter({ hasText: name }).getAttribute('value');
}
async function openSaved(page, name) {
  if (await page.locator('#library-dialog').evaluate(dialog => dialog.open)) await page.getByRole('button', { name: 'Close audio loader' }).click();
  const id = await savedOption(page, name);
  assert.ok(id, 'Saved piece is present in the dropdown: ' + name);
  await page.locator('#saved-pieces').selectOption(id);
  await page.locator('#open-saved').click();
  await page.waitForFunction(() => document.body.classList.contains('loaded') && !document.querySelector('#open-saved').disabled);
}
async function allMuted(page) {
  return page.locator('.instrument .track-buttons button[aria-label^="Mute "]').evaluateAll(buttons => buttons.length > 0 && buttons.every(button => button.getAttribute('aria-pressed') === 'true'));
}
async function trackSelection(page) {
  return page.locator('.instrument .track-buttons button').evaluateAll(buttons => buttons.map(button => button.getAttribute('aria-pressed')));
}
async function audibleTracks(page) {
  return page.locator('.orchestra-region[data-track]').evaluateAll(regions => regions.map(region => region.dataset.track).filter(id => window.__orchTest.gains[id] > -100).sort());
}

(async () => {
  const browser = await chromium.launch({ headless: true, executablePath: process.env.ORCH_TEST_CHROME || undefined, args: ['--autoplay-policy=no-user-gesture-required'] });
  const context = await browser.newContext({ viewport: { width: 1440, height: 1060 } });
  await context.addInitScript(installBrowserFixtures);
  const page = await context.newPage();
  const errors = [], remote = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('request', request => { if (/^https?:/.test(request.url())) remote.push(request.url()); });
  try {
    await page.goto(pathToFileURL(path.join(root, 'index.html')).href);
    await page.locator('#remember-folder').click();
    await page.waitForFunction(() => [...document.querySelector('#saved-pieces').options].some(option => /first-piece|First Secret/.test(option.textContent)));
    await openSaved(page, /first-piece|First Secret/);
    assert.equal(await page.locator('#piece-title').textContent(), 'First Secret Symphony');
    assert.equal(await page.locator('.instrument').count(), 12);
    assert.equal(await page.locator('.player-icon').count(), 25);
    assert.equal(await page.locator('.region-musicians[data-basis="confirmed"]').count(), 12);

    const levels = await page.locator('.wheel').evaluateAll(inputs => inputs.map(input => input.value));
    await page.locator('#all-off').click();
    assert.equal(await allMuted(page), true);
    const violin = page.locator('.orchestra-region[data-track="vln1"]');
    await violin.click();
    assert.equal(await page.getByRole('button', { name: 'Mute Violins I', exact: true }).getAttribute('aria-pressed'), 'false');
    assert.deepEqual(await page.locator('.wheel').evaluateAll(inputs => inputs.map(input => input.value)), levels);
    await violin.press('Space');
    assert.equal(await allMuted(page), true);
    assert.deepEqual(await page.locator('.wheel').evaluateAll(inputs => inputs.map(input => input.value)), levels);

    await page.locator('#midi-toggle').click();
    await page.locator('#midi-connect').click();
    await page.waitForFunction(() => document.querySelector('#midi-status').textContent.includes('nanoKONTROL2'));
    const firstStrip = page.locator('.instrument').nth(0), ninthStrip = page.locator('.instrument').nth(8);
    await firstStrip.locator('.midi-learn').click();
    await page.evaluate(() => window.__orchTest.sendMidi([0xb0, 0, 64]));
    assert.equal(await firstStrip.locator('.wheel').inputValue(), levels[0], 'Learning must not move a fader');
    await page.evaluate(() => window.__orchTest.sendMidi([0xb0, 0, 127]));
    assert.equal(await firstStrip.locator('.wheel').inputValue(), '12');
    assert.equal(await allMuted(page), true, 'Hardware gain changes must preserve mute');
    assert.deepEqual(await page.locator('#midi-bank option').allTextContents(), ['1–12']);
    await ninthStrip.locator('.midi-learn').click();
    await page.evaluate(() => window.__orchTest.sendMidi([0xb0, 16, 64]));
    assert.equal(await ninthStrip.locator('.wheel').inputValue(), levels[8]);
    await page.evaluate(() => window.__orchTest.sendMidi([0xb0, 16, 0]));
    assert.equal(await ninthStrip.locator('.wheel').inputValue(), '-48');
    assert.equal(await firstStrip.locator('.wheel').inputValue(), '12');
    assert.equal(await allMuted(page), true);
    assert.deepEqual(await page.evaluate(() => window.__orchTest.midiRequests), [{ sysex: false }]);

    await page.evaluate(() => { window.__orchTest.pick = 'second-piece'; });
    await page.locator('#remember-folder').click();
    await page.waitForFunction(() => [...document.querySelector('#saved-pieces').options].some(option => /second-piece|Second Secret/.test(option.textContent)));
    await page.reload();
    await page.waitForFunction(() => document.querySelectorAll('#saved-pieces option[value]:not([value=""])').length === 2);
    await page.waitForFunction(() => window.__orchTest.midiRequests.length === 1);
    await openSaved(page, /first-piece|First Secret/);
    await page.evaluate(() => window.__orchTest.sendMidi([0xb0, 0, 127]));
    assert.equal(await page.locator('.instrument').first().locator('.wheel').inputValue(), '12', 'Mapping resumes after reload without relearning');
    await page.evaluate(() => window.__orchTest.sendMidi([0xb0, 16, 0]));
    assert.equal(await page.locator('.instrument').nth(8).locator('.wheel').inputValue(), '-48', 'Knob mapping resumes after reload without relearning');

    await page.locator('#random-duration').fill('5');
    await page.evaluate(() => { Math.random = () => .999; window.__orchTest.loads.length = 0; window.__orchTest.plays.length = 0; });
    await page.locator('#random-excerpt').click();
    await page.waitForFunction(() => !document.querySelector('#reveal-piece').hidden && document.querySelector('#play-button').getAttribute('aria-label') === 'Pause');
    assert.equal(await allMuted(page), true);
    assert.equal(await page.locator('#saved-picker').isHidden(), true);
    assert.equal(await page.locator('#reveal-piece').isVisible(), true);
    const visibleText = await page.locator('body').innerText();
    assert.equal(visibleText.includes('First Secret Symphony') || visibleText.includes('Second Secret Overture'), false, 'The guessing screen must hide all piece titles');
    const randomLoad = await page.evaluate(() => window.__orchTest.loads.at(-1));
    assert.equal(randomLoad.durationSeconds, 5);
    assert.equal(randomLoad.startSeconds, 41, 'The last available whole-second start uses the shortest 46-second stem, not the other 48-second stems');
    const firstPlay = await page.evaluate(() => window.__orchTest.plays[0]);
    assert.equal(Object.keys(firstPlay).length, 12);
    assert.equal(Object.values(firstPlay).every(gain => gain <= -100), true, 'All instruments are muted before the first playback call');
    const mysteryLevels = await page.locator('.wheel').evaluateAll(inputs => inputs.map(input => input.value));
    await violin.click();
    assert.equal(await page.getByRole('button', { name: 'Mute Violins I', exact: true }).getAttribute('aria-pressed'), 'false');
    assert.deepEqual(await page.locator('.wheel').evaluateAll(inputs => inputs.map(input => input.value)), mysteryLevels);
    await page.screenshot({ path: path.join(temp, 'desktop-mystery.png'), fullPage: true });
    await page.locator('#reveal-piece').click();
    assert.match(await page.locator('#piece-title').textContent(), /^(First Secret Symphony|Second Secret Overture)$/);
    for (const selector of ['#pick-files', '#pick-folder', '#pick-session']) assert.equal(await page.locator(selector).isEnabled(), true, 'Revealing the answer restores the normal audio pickers');
    assert.equal(await page.locator('#saved-pieces option:checked').textContent(), await page.locator('#piece-title').textContent());
    assert.equal(await page.getByRole('button', { name: 'Mute Violins I', exact: true }).getAttribute('aria-pressed'), 'false');
    assert.equal(await page.getByRole('button', { name: 'Mute Violins II', exact: true }).getAttribute('aria-pressed'), 'true', 'Revealing the answer must leave other parts muted');

    await page.setViewportSize({ width: 390, height: 844 });
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), true);
    await page.screenshot({ path: path.join(temp, 'mobile-features.png'), fullPage: true });
    await page.setViewportSize({ width: 1440, height: 1060 });

    // Expired permissions and moved folders retain a usable app and never
    // remove the saved entry. Reconnecting the same entry recovers normally.
    const firstId = await savedOption(page, /first-piece|First Secret/);
    await page.locator('#saved-pieces').selectOption(firstId);
    await page.evaluate(() => { window.__orchTest.permissions['first-piece'] = 'denied'; });
    await page.locator('#open-saved').click();
    await page.waitForFunction(() => /access|permission|reconnect/i.test(document.querySelector('#status').textContent));
    assert.equal(await page.locator('#remember-folder').isEnabled(), true);
    assert.ok(await savedOption(page, /first-piece|First Secret/));
    await page.evaluate(() => { window.__orchTest.permissions['first-piece'] = 'granted'; window.__orchTest.missing = 'first-piece'; });
    await page.locator('#open-saved').click();
    await page.waitForFunction(() => /moved|unavailable|could not/i.test(document.querySelector('#status').textContent));
    await page.evaluate(() => { window.__orchTest.missing = null; });
    await openSaved(page, /first-piece|First Secret/);
    assert.equal(await page.locator('#piece-title').textContent(), 'First Secret Symphony');

    const readsBeforeDenied = await page.evaluate(() => window.__orchTest.reads.length);
    await page.evaluate(() => { window.__orchTest.permissions['first-piece'] = 'denied'; window.__orchTest.permissions['second-piece'] = 'prompt'; });
    await page.locator('#random-excerpt').click();
    await page.waitForFunction(() => /allow folder access/i.test(document.querySelector('#status').textContent));
    assert.equal(await page.evaluate(() => window.__orchTest.reads.length), readsBeforeDenied, 'Random selection must not read inaccessible folders or prompt unexpectedly');
    assert.equal(await page.locator('#reveal-piece').isHidden(), true);
    assert.equal(await page.locator('#remember-folder').isEnabled(), true);
    await page.evaluate(() => { window.__orchTest.permissions = {}; window.__orchTest.pick = 'broken-piece'; });
    await page.locator('#remember-folder').click();
    await page.waitForFunction(() => [...document.querySelector('#saved-pieces').options].some(option => option.textContent === 'broken-piece'));
    await page.evaluate(() => { Math.random = () => 0; });
    await page.locator('#random-excerpt').click();
    await page.waitForFunction(() => /Could not open a random excerpt/.test(document.querySelector('#status').textContent));
    const failureStatus = await page.locator('#status').textContent();
    assert.equal(/broken-piece|piece\.orchmix\.json|Never reveal/.test(failureStatus), false, 'Random errors must not expose the selected filename or answer');
    assert.equal(await page.locator('#reveal-piece').isHidden(), true);
    await page.locator('#saved-pieces').selectOption(await savedOption(page, 'broken-piece'));
    await page.locator('#forget-folder').click();
    await page.waitForFunction(() => document.querySelectorAll('#saved-pieces option[value]:not([value=""])').length === 2);
    await page.locator('#random-excerpt').click();
    await page.waitForFunction(() => !document.querySelector('#reveal-piece').hidden && document.querySelector('#play-button').getAttribute('aria-label') === 'Pause');
    assert.equal(await allMuted(page), true, 'A valid random round still works after failed rounds');
    await page.evaluate(() => { window.__orchTest.permissions['first-piece'] = 'denied'; window.__orchTest.permissions['second-piece'] = 'prompt'; });
    await page.locator('#random-excerpt').click();
    await page.waitForFunction(() => /allow folder access/i.test(document.querySelector('#status').textContent));
    assert.equal(await page.locator('#piece-title').textContent(), 'What is the piece?', 'Failure to choose the next mystery must not reveal the previous answer');
    assert.equal(await page.locator('#saved-picker').isHidden(), true);
    assert.equal(await page.locator('#reveal-piece').isVisible(), true);
    assert.equal(await page.locator('#play-button').isEnabled(), true);
    assert.equal(await page.locator('#library-button').isDisabled(), true);

    // Exercise both halves of a 16-control bank and a short final bank.
    await page.locator('#reveal-piece').click();
    await page.evaluate(() => { window.__orchTest.permissions = {}; window.__orchTest.pick = 'many-parts'; });
    await page.locator('#remember-folder').click();
    await page.waitForFunction(() => [...document.querySelector('#saved-pieces').options].some(option => /many-parts|Twenty-part/.test(option.textContent)));
    await openSaved(page, /many-parts|Twenty-part/);
    assert.equal(await page.locator('.instrument').count(), 20);
    assert.deepEqual(await page.locator('#midi-bank option').allTextContents(), ['1–16', '17–20']);
    const control16 = page.locator('.instrument').nth(15);
    await control16.locator('.midi-learn').click();
    await page.evaluate(() => window.__orchTest.sendMidi([0xb0, 23, 64]));
    assert.equal(await control16.locator('.wheel').inputValue(), '-3', 'Learning the last knob leaves its gain unchanged');
    await page.evaluate(() => {
      window.__orchTest.sendMidi([0xb0, 0, 127]);
      window.__orchTest.sendMidi([0xb0, 16, 0]);
      window.__orchTest.sendMidi([0xb0, 23, 127]);
    });
    assert.equal(await page.locator('.instrument').nth(0).locator('.wheel').inputValue(), '12');
    assert.equal(await page.locator('.instrument').nth(8).locator('.wheel').inputValue(), '-48');
    assert.equal(await control16.locator('.wheel').inputValue(), '12');
    await page.locator('#all-off').click();
    await page.locator('#midi-bank').selectOption('1');
    await page.evaluate(() => window.__orchTest.sendMidi([0xb0, 0, 0]));
    assert.equal(await page.locator('.instrument').nth(16).locator('.wheel').inputValue(), '-48', 'Control 1 reaches channel 17 in bank 2');
    const secondBankLevels = await page.locator('.wheel').evaluateAll(inputs => inputs.map(input => input.value));
    await page.evaluate(() => {
      window.__orchTest.sendMidi([0xb0, 16, 127]);
      window.__orchTest.sendMidi([0xb0, 23, 0]);
    });
    assert.deepEqual(await page.locator('.wheel').evaluateAll(inputs => inputs.map(input => input.value)), secondBankLevels, 'Unoccupied control positions do nothing in the last bank');
    assert.equal(await allMuted(page), true);
    await page.screenshot({ path: path.join(temp, 'midi-16-controls.png'), fullPage: true });
    await page.reload();
    await page.waitForFunction(() => window.__orchTest.midiRequests.length === 1);
    await openSaved(page, /many-parts|Twenty-part/);
    await page.evaluate(() => window.__orchTest.sendMidi([0xb0, 23, 0]));
    assert.equal(await page.locator('.instrument').nth(15).locator('.wheel').inputValue(), '-48', 'Control 16 survives reloading the app');

    // Global button actions have their own learned CCs, independent of all
    // sixteen volume controls and of the selected volume-control bank.
    if (await page.locator('#midi-learn-playPause').isHidden()) await page.locator('#midi-toggle').click();
    const beforeActionLearn = await trackSelection(page);
    const actionLevels = await page.locator('.wheel').evaluateAll(inputs => inputs.map(input => input.value));
    for (const [action, controller] of [['playPause', 40], ['allOff', 41], ['randomInstrument', 42]]) {
      await page.locator('#midi-learn-' + action).click();
      await page.evaluate(cc => window.__orchTest.sendMidi([0xb0, cc, 127]), controller);
      assert.equal(await page.locator('#play-button').getAttribute('aria-label'), 'Play', 'Learning a button action must not start playback');
      assert.deepEqual(await trackSelection(page), beforeActionLearn, 'Learning a button action must not change the selected instruments');
    }
    await page.evaluate(() => [40, 41, 42].forEach(cc => window.__orchTest.sendMidi([0xb0, cc, 0])));
    assert.equal(await page.locator('#play-button').getAttribute('aria-label'), 'Play', 'Zero-valued transport releases do nothing');
    assert.deepEqual(await trackSelection(page), beforeActionLearn, 'Zero-valued instrument button releases do nothing');
    assert.deepEqual(await page.locator('.wheel').evaluateAll(inputs => inputs.map(input => input.value)), actionLevels);

    const rapidTransport = await page.evaluate(async () => {
      const engine = window.__orchTest.engine, context = engine._context;
      const originalResume = context.resume;
      let releaseResume;
      const waitingForResume = new Promise(resolve => { releaseResume = resolve; });
      context.resume = () => waitingForResume;
      try {
        window.__orchTest.sendMidi([0xb0, 40, 127]);
        window.__orchTest.sendMidi([0xb0, 40, 127]);
        releaseResume();
        await new Promise(resolve => setTimeout(resolve, 0));
        return { playing: engine.isPlaying, position: engine.currentTime };
      } finally { context.resume = originalResume; }
    });
    assert.equal(rapidTransport.playing, false, 'A second transport press cancels a start still awaiting AudioContext.resume');
    assert.equal(rapidTransport.position, 0, 'Cancelling a pending start does not advance the excerpt');

    await page.locator('#seek').fill('2');
    await page.evaluate(() => window.__orchTest.sendMidi([0xb0, 40, 1]));
    await page.waitForFunction(() => window.__orchTest.engine.isPlaying && window.__orchTest.engine.currentTime >= 2.1);
    await page.evaluate(() => window.__orchTest.sendMidi([0xb0, 40, 127]));
    await page.waitForFunction(() => !window.__orchTest.engine.isPlaying);
    const pausedAt = await page.evaluate(() => window.__orchTest.engine.currentTime);
    assert.ok(pausedAt >= 2.1, 'Start/stop pauses at the current position');
    await page.evaluate(() => window.__orchTest.sendMidi([0xb0, 40, 0]));
    assert.equal(await page.evaluate(() => window.__orchTest.engine.currentTime), pausedAt, 'Release does not resume or rewind');
    await page.evaluate(() => window.__orchTest.sendMidi([0xb0, 40, 127]));
    await page.waitForFunction(paused => window.__orchTest.engine.isPlaying && window.__orchTest.engine.currentTime > paused, pausedAt);
    await page.evaluate(() => window.__orchTest.sendMidi([0xb0, 40, 127]));
    await page.waitForFunction(() => !window.__orchTest.engine.isPlaying);

    await page.getByRole('button', { name: 'Mute Part 2', exact: true }).click();
    await page.getByRole('button', { name: 'Solo Part 1', exact: true }).click();
    const selectiveMix = await trackSelection(page);
    await page.locator('#midi-bank').selectOption('1');
    await page.evaluate(() => window.__orchTest.sendMidi([0xb0, 41, 127]));
    assert.equal(await allMuted(page), true, 'All-off action works even on a later volume-control bank');
    assert.equal(await page.locator('#all-off').getAttribute('aria-pressed'), 'true');
    await page.evaluate(() => window.__orchTest.sendMidi([0xb0, 41, 0]));
    assert.equal(await allMuted(page), true, 'All-off release does not restore instruments');
    await page.evaluate(() => window.__orchTest.sendMidi([0xb0, 41, 1]));
    assert.deepEqual(await trackSelection(page), selectiveMix, 'A second press restores the previous mute and solo selection');
    assert.equal(await page.locator('#all-off').getAttribute('aria-pressed'), 'false');
    assert.deepEqual(await audibleTracks(page), ['part-1']);

    let audible = await audibleTracks(page);
    for (let count = audible.length; count < 20; count++) {
      // Exercise the screen button once as well as the learned hardware action.
      if (count === 1) await page.locator('#random-instrument').click();
      else await page.evaluate(() => window.__orchTest.sendMidi([0xb0, 42, 127]));
      const next = await audibleTracks(page);
      assert.equal(next.length, audible.length + 1, 'Random instrument adds exactly one inaudible stem');
      assert.equal(audible.every(id => next.includes(id)), true, 'Previously audible instruments stay audible, including a soloed part');
      audible = next;
    }
    await page.evaluate(() => window.__orchTest.sendMidi([0xb0, 42, 127]));
    assert.deepEqual(await audibleTracks(page), audible, 'Random instrument is a no-op once every stem is audible');
    assert.deepEqual(await page.locator('.wheel').evaluateAll(inputs => inputs.map(input => input.value)), actionLevels, 'Button actions never alter fader levels');
    await page.locator('#all-off').click();
    await page.evaluate(() => window.__orchTest.sendMidi([0xb0, 42, 0]));
    assert.equal(await allMuted(page), true, 'Random-instrument release never adds a part');
    await page.evaluate(() => window.__orchTest.sendMidi([0xb0, 42, 1]));
    assert.equal((await audibleTracks(page)).length, 1);
    await page.evaluate(() => window.__orchTest.sendMidi([0xb0, 41, 127]));
    assert.equal(await allMuted(page), true);
    await page.evaluate(() => window.__orchTest.sendMidi([0xb0, 41, 127]));
    assert.equal((await audibleTracks(page)).length, 1, 'Random selection invalidates a stale all-off restore snapshot');
    await page.screenshot({ path: path.join(temp, 'midi-button-actions.png'), fullPage: true });
    await page.setViewportSize({ width: 390, height: 844 });
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), true, 'The MIDI action controls fit a narrow screen');
    await page.screenshot({ path: path.join(temp, 'midi-button-actions-mobile.png'), fullPage: true });
    await page.setViewportSize({ width: 1440, height: 1060 });

    await page.reload();
    await page.waitForFunction(() => window.__orchTest.midiRequests.length === 1);
    await openSaved(page, /many-parts|Twenty-part/);
    await page.evaluate(() => window.__orchTest.sendMidi([0xb0, 41, 127]));
    assert.equal(await allMuted(page), true, 'All-off mapping survives reload');
    await page.evaluate(() => window.__orchTest.sendMidi([0xb0, 42, 127]));
    assert.equal((await audibleTracks(page)).length, 1, 'Random-instrument mapping survives reload');
    await page.evaluate(() => window.__orchTest.sendMidi([0xb0, 40, 127]));
    await page.waitForFunction(() => window.__orchTest.engine.isPlaying);
    await page.evaluate(() => window.__orchTest.sendMidi([0xb0, 40, 127]));
    await page.waitForFunction(() => !window.__orchTest.engine.isPlaying);
    await page.evaluate(() => window.__orchTest.sendMidi([0xb0, 23, 127]));
    assert.equal(await page.locator('.instrument').nth(15).locator('.wheel').inputValue(), '12', 'Learning global actions preserves volume-control mappings');
    await page.evaluate(() => window.__orchTest.sendMidi([0xb0, 41, 127]));
    assert.equal(await allMuted(page), true);
    await openSaved(page, /first-piece|First Secret/);
    await page.evaluate(() => window.__orchTest.sendMidi([0xb0, 41, 127]));
    assert.equal(await allMuted(page), true);
    await page.evaluate(() => window.__orchTest.sendMidi([0xb0, 41, 127]));
    assert.equal((await audibleTracks(page)).length, 12, 'Changing the piece discards the previous piece\'s restore snapshot');

    await page.locator('#random-duration').fill('5');
    await page.locator('#random-excerpt').click();
    await page.waitForFunction(() => !document.querySelector('#reveal-piece').hidden && window.__orchTest.engine.isPlaying);
    assert.equal(await allMuted(page), true);
    await page.evaluate(() => window.__orchTest.sendMidi([0xb0, 42, 127]));
    assert.equal((await audibleTracks(page)).length, 1, 'A learned button can introduce the first part of a mystery excerpt');
    assert.equal(await page.locator('#piece-title').textContent(), 'What is the piece?');
    assert.equal(await page.locator('#saved-picker').isHidden(), true, 'Adding a random instrument never reveals the mystery answer');
    await page.evaluate(() => window.__orchTest.sendMidi([0xb0, 40, 127]));
    await page.waitForFunction(() => !window.__orchTest.engine.isPlaying);
    assert.deepEqual(remote, []);
    assert.deepEqual(errors, []);
    console.log('PASS: remembered folders and titles survive reload; real local WAV load; common-duration random start; concealed answer; first playback fully muted; polygon/keyboard toggles preserve levels; answer reveal preserves mute; 25 musician symbols; 16-control MIDI learn, independent faders/knobs, bank switching, short final bank and automatic restoration; learned global play/pause, all-off/restore and random-instrument actions, zero-release handling, solo-preserving random selection and reload persistence; permission/moved-folder/invalid-session recovery; responsive width; no external requests.');
    console.log('Feature screenshots: ' + temp);
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
