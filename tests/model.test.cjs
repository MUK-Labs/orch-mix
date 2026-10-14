'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const model = require('../app/model.js');

function session(overrides = {}) {
  return {
    version: 1, title: 'Beethoven rehearsal', excerpt: { start: 12, duration: 30 },
    tracks: [{ id: 'fl', name: 'Flutes', family: 'woodwinds', file: 'flute.wav', referenceDb: 0 }],
    ...overrides
  };
}

test('recognizes OMA sections, dataset filenames and additional families', () => {
  assert.equal(model.inferTrack('oma-hkm-08-vl1.mp3', 0).name, 'Violins I');
  assert.equal(model.inferTrack('oma-hkm-12-kb.wav', 11).family, 'strings');
  assert.equal(model.inferTrack('Violin_2.flac', 1).name, 'Violins II');
  assert.equal(model.inferTrack({ name: 'English_Horn.wav' }, 2).family, 'woodwinds');
  assert.equal(model.inferTrack('Harp_1.wav', 3).family, 'percussion');
  assert.equal(model.inferTrack('Trombone_3.wav', 4).family, 'brass');
  assert.equal(model.inferTrack('coranglais.flac', 5).family, 'woodwinds');
  assert.equal(model.inferTrack('untunedpercussion.flac', 6).family, 'percussion');
  assert.equal(model.inferTrack('Piccolo.flac', 7).name, 'Piccolo');
  assert.equal(model.inferTrack('Bass.flac', 8).name, 'Double basses');
  assert.equal(model.inferTrack('Bass_Clarinet.flac', 9).name, 'Bass clarinet');
  assert.equal(model.inferTrack('Bass_Drum.flac', 10).family, 'percussion');
  assert.notEqual(model.inferTrack('Flute.wav', 0).id, model.inferTrack('Flute.wav', 1).id);
  assert.equal(model.inferTrack('constructor.wav', 0).id, 'track-1');
  assert.equal(model.DEFAULT_TRACKS.length, 12);
});

test('audio detection uses a File name and rejects misleading suffixes', () => {
  for (const ext of ['WAV', 'mp3', 'flac', 'ogg', 'm4a', 'aif', 'aiff', 'opus', 'webm']) {
    assert.equal(model.isAudioFile({ name: 'stem.' + ext }), true);
  }
  assert.equal(model.isAudioFile('stem.wav.exe'), false);
  assert.equal(model.isAudioFile('stem.json'), false);
  assert.equal(model.isAudioFile(null), false);
});

test('matches exact names first, reports ambiguous basenames and missing files', () => {
  const a = { name: 'flute.wav', webkitRelativePath: 'Set/A/flute.wav' };
  const b = { name: 'flute.wav', webkitRelativePath: 'Set/B/flute.wav' };
  const result = model.findFiles([
    { id: 'a', file: 'Set/A/flute.wav' },
    { id: 'b', file: 'flute.wav' },
    { id: 'c', file: 'missing.wav' }
  ], [a, b]);
  assert.equal(result.matches.length, 1);
  assert.equal(result.matches[0].file, a);
  assert.equal(result.ambiguous[0].id, 'b');
  assert.equal(result.missing[0].id, 'c');
  assert.deepEqual(result.ambiguous[0].candidates, ['Set/A/flute.wav', 'Set/B/flute.wav']);
});

test('case-insensitive fallback never guesses between files', () => {
  const lower = { name: 'flute.wav' }, upper = { name: 'FLUTE.WAV' };
  assert.equal(model.findFiles([{ file: 'flute.wav' }], [lower, upper]).matches[0].file, lower);
  assert.equal(model.findFiles([{ file: 'Flute.wav' }], [lower, upper]).ambiguous.length, 1);
  assert.equal(model.findFiles([{ file: 'Flute.wav' }], [lower]).matches[0].file, lower);
  assert.equal(model.findFiles([{ file: 'Set/flute.wav' }], [lower]).missing.length, 1);
});

test('session validation rejects remote, absolute and traversing audio paths', () => {
  const unsafe = ['https://example.com/flute.wav', '//server/flute.wav', '/tmp/flute.wav', 'C:\\Music\\flute.wav', '../flute.wav', 'a/../flute.wav', 'a\\..\\flute.wav', 'a/%2e%2e/flute.wav', 'a/%252e%252e/flute.wav', 'a//flute.wav', 'flute.wav\u0000', 'flute.json'];
  for (const file of unsafe) {
    const value = session();
    value.tracks[0].file = file;
    assert.throws(() => model.validateSession(value), undefined, file);
  }
  const good = session();
  good.tracks[0].file = 'Beethoven 4/Flöte 1.WAV';
  assert.equal(model.validateSession(good).tracks[0].file, good.tracks[0].file);
});

test('validates numeric bounds, unique IDs, family and bounded labels', () => {
  for (const referenceDb of [NaN, Infinity, -Infinity, -49, 13, '0', null]) {
    const value = session(); value.tracks[0].referenceDb = referenceDb;
    assert.throws(() => model.validateSession(value));
  }
  for (const duration of [0, 121, NaN, Infinity]) {
    assert.throws(() => model.validateSession(session({ excerpt: { start: 0, duration } })));
  }
  for (const id of ['constructor', '__proto__', 'a/b', '', 'x'.repeat(81)]) {
    const value = session(); value.tracks[0].id = id;
    assert.throws(() => model.validateSession(value));
  }
  const duplicate = session(); duplicate.tracks.push({ ...duplicate.tracks[0] });
  assert.throws(() => model.validateSession(duplicate), /Duplicate/);
  const wrongFamily = session(); wrongFamily.tracks[0].family = 'other';
  assert.throws(() => model.validateSession(wrongFamily));
  assert.throws(() => model.validateSession(session({ title: 'x'.repeat(201) })));
  assert.throws(() => model.validateSession(session({ tracks: [] })));
  assert.throws(() => model.validateSession(session({ tracks: Array(49).fill(session().tracks[0]) })));
  assert.throws(() => model.validateSession('{broken json'));
  assert.deepEqual(model.validateSession(JSON.stringify(session())), session());
});

test('exports metadata without mutating or retaining local audio objects', () => {
  const file = { name: 'flute.wav', webkitRelativePath: 'Beethoven/flute.wav', privateBytes: 'never export' };
  const track = { id: 'fl', name: 'Flutes', family: 'woodwinds', file, referenceDb: -3, buffer: 'never export' };
  const result = model.makeSession('My session', [track], { start: 2, duration: 45 });
  assert.equal(result.tracks[0].file, 'Beethoven/flute.wav');
  assert.equal(result.tracks[0].referenceDb, -3);
  assert.equal(track.file, file);
  assert.equal(JSON.stringify(result).includes('never export'), false);
  assert.equal(result.excerpt.start, 2);
});

test('optional seating is validated without changing existing version-one sessions', () => {
  assert.deepEqual(model.validateSession(session()), session());
  for (const row of ['front', 'middle', 'back', 'rear']) {
    const value = session();
    value.tracks[0].seat = { row, order: -1000, weight: 0.25, arbitrarySvg: '<path>' };
    assert.deepEqual(model.validateSession(value).tracks[0].seat, { row, order: -1000, weight: 0.25 });
  }
  const upper = session();
  upper.tracks[0].seat = { row: 'front', order: 1000, weight: 4 };
  assert.deepEqual(model.validateSession(upper).tracks[0].seat, upper.tracks[0].seat);
  for (const seat of [null, [], 'front', {}, { row: 'stage' }, { row: 'front', order: NaN }, { row: 'front', order: 1001 }, { row: 'front', order: -1001 }, { row: 'front', order: '2' }, { row: 'front', weight: Infinity }, { row: 'front', weight: 0.24 }, { row: 'front', weight: 4.1 }, { row: 'front', weight: null }]) {
    const value = session(); value.tracks[0].seat = seat;
    assert.throws(() => model.validateSession(value), undefined, JSON.stringify(seat));
  }
});

test('seat settings survive local file matching and settings-only session export', () => {
  const value = session();
  value.tracks[0].seat = { row: 'back', order: -2, weight: 1.5 };
  const file = { name: 'flute.wav', privateBytes: 'never export' };
  const matched = model.findFiles(model.validateSession(value).tracks, [file]);
  assert.deepEqual(matched.matches[0].seat, value.tracks[0].seat);
  const saved = model.makeSession(value.title, matched.matches, value.excerpt);
  assert.deepEqual(saved, value);
  assert.notEqual(saved.tracks[0].seat, value.tracks[0].seat);
  assert.equal(JSON.stringify(saved).includes('never export'), false);
});

test('balance score measures relationships independently of master level', () => {
  const reference = { strings: -2, winds: -4, brass: -7 };
  const actual = { strings: 0, winds: -2, brass: -5 };
  assert.equal(model.scoreBalance(actual, reference).score, 100);
  const wrong = model.scoreBalance({ a: 3, b: -3 }, { a: 0, b: 0 });
  assert.deepEqual(wrong.errors, { a: 3, b: -3 });
  assert.equal(wrong.meanAbsoluteError, 3);
  assert.equal(wrong.score, 75);
  assert.equal(model.scoreBalance({ a: 8, b: 2 }, { a: 0, b: 0 }).score, wrong.score);
  assert.equal(model.scoreBalance({ a: 100, b: -100 }, { a: 0, b: 0 }).score, 0);
});

test('score ignores inactive and invalid entries and safely handles no observations', () => {
  const empty = model.scoreBalance({}, {}, []);
  assert.equal(empty.count, 0);
  assert.equal(empty.score, null);
  assert.equal(empty.meanAbsoluteError, null);
  const result = model.scoreBalance({ a: 3, b: 200, c: NaN }, { a: 0, b: 0, c: 0 }, ['a', 'c', 'missing']);
  assert.deepEqual(result.errors, { a: 0 });
  assert.equal(result.count, 1);
  assert.equal(model.scoreBalance(new Map([['a', 4], ['b', 0]]), new Map([['a', 0], ['b', 0]])).score, 83);
});

test('randomized offsets remain bounded and avoid a trivial shared offset', () => {
  const ids = ['fl', 'ob', 'cl', 'bn'];
  for (const sample of [0, 0.5, 1, NaN]) {
    const result = model.randomizedOffsets(ids, () => sample);
    const values = Object.values(result);
    assert.equal(values.length, ids.length);
    assert.ok(values.every(value => value >= -9 && value <= 9 && Number.isFinite(value)));
    assert.ok(Math.max(...values) - Math.min(...values) >= 4);
  }
  assert.deepEqual(model.randomizedOffsets([]), {});
});

test('player counts and instrument types survive file matching and session export', () => {
  const value = session();
  Object.assign(value.tracks[0], { instrument: 'flute', players: 2, playersBasis: 'confirmed' });
  const matched = model.findFiles(model.validateSession(value).tracks, [{ name: 'flute.wav' }]);
  assert.deepEqual(model.makeSession(value.title, matched.matches, value.excerpt), value);
  delete value.tracks[0].playersBasis;
  assert.equal(model.validateSession(value).tracks[0].playersBasis, 'estimate');
  delete value.tracks[0].players;
  assert.equal('players' in model.validateSession(value).tracks[0], false);
  // A display weight is never interpreted as a headcount.
  value.tracks[0].seat = { row: 'middle', weight: 1.5 };
  assert.equal('players' in model.validateSession(value).tracks[0], false);
});

test('counts reject fractional or invented confidence values and unsafe symbols', () => {
  for (const players of [0, -1, 1.5, 81, Infinity, NaN, '2', null]) {
    const value = session(); value.tracks[0].players = players;
    assert.throws(() => model.validateSession(value), /whole number/);
  }
  for (const playersBasis of ['documented', 'unknown', '', null]) {
    const value = session(); Object.assign(value.tracks[0], { players: 1, playersBasis });
    assert.throws(() => model.validateSession(value), /playersBasis/);
  }
  const orphan = session(); orphan.tracks[0].playersBasis = 'confirmed';
  assert.throws(() => model.validateSession(orphan), /player count/);
  for (const instrument of ['url(javascript:alert(1))', '<svg>', 'constructor', null]) {
    const value = session(); value.tracks[0].instrument = instrument;
    assert.throws(() => model.validateSession(value), /instrument icon/);
  }
  for (const instrument of model.INSTRUMENT_TYPES) {
    const value = session(); value.tracks[0].instrument = instrument;
    assert.equal(model.validateSession(value).tracks[0].instrument, instrument);
  }
});
