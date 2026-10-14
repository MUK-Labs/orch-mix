'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const Library = require('../app/library.js');

function file(name, contents = 'bytes') {
  return { kind: 'file', name, reads: 0, async getFile() { this.reads++; return new File([contents], name); } };
}
function directory(name, children = [], identity = name) {
  return {
    kind: 'directory', name, identity, permission: 'granted', prompts: 0,
    async *entries() { for (const child of children) yield [child.name, child]; },
    async queryPermission(options) { assert.deepEqual(options, { mode: 'read' }); return this.permission; },
    async requestPermission(options) { assert.deepEqual(options, { mode: 'read' }); this.prompts++; return this.permission = this.nextPermission || 'granted'; },
    async isSameEntry(other) { return this.identity === other.identity; }
  };
}
function indexedDB() {
  const records = new Map(); let opens = 0;
  return {
    records, get opens() { return opens; },
    open() {
      opens++;
      const request = {};
      queueMicrotask(() => {
        request.result = {
          objectStoreNames: { contains: () => true }, close() {},
          transaction() {
            const transaction = { objectStore() {
              const run = value => { const result = { result: value }; queueMicrotask(() => transaction.oncomplete()); return result; };
              return {
                getAll: () => run([...records.values()].map(record => ({ ...record }))),
                put: record => { records.set(record.id, { ...record }); return run(record.id); },
                delete: id => { records.delete(id); return run(undefined); }
              };
            } };
            return transaction;
          }
        };
        request.onsuccess();
      });
      return request;
    }
  };
}

test('directory picker runs before storage and cancellation changes nothing', async () => {
  const database = indexedDB(); let picked = 0;
  const library = new Library({ indexedDB: database, showDirectoryPicker: () => {
    picked++; assert.equal(database.opens, 0);
    return Promise.reject(new DOMException('cancelled', 'AbortError'));
  } });
  const operation = library.add();
  assert.equal(picked, 1);
  await assert.rejects(operation, { name: 'AbortError' });
  assert.equal(database.records.size, 0);
});

test('remembers folder handles and titles across instances without storing audio', async () => {
  const stem = file('Flute.wav'), folder = directory('Mozart', [stem]);
  const database = indexedDB();
  const first = new Library({ indexedDB: database, showDirectoryPicker: async () => folder });
  const entry = await first.add();
  await first.setTitle(entry.id, 'Mozart · Symphony No. 40');
  assert.equal(first.persistent, true);
  assert.equal(first.warning, '');
  assert.equal(stem.reads, 0);
  assert.deepEqual(Object.keys(database.records.get(entry.id)).sort(), ['addedAt', 'handle', 'id', 'name', 'title']);
  const reopened = new Library({ indexedDB: database, showDirectoryPicker: async () => folder });
  assert.deepEqual(await reopened.list(), [{ ...entry, title: 'Mozart · Symphony No. 40' }]);
  await reopened.remove(entry.id);
  assert.equal((await reopened.list()).length, 0);
  assert.equal(database.records.size, 0);
  assert.equal(stem.reads, 0);
});

test('re-picking the same folder updates its handle without duplicate entries', async () => {
  const first = directory('Piece'), second = directory('Piece'); let folder = first;
  const library = new Library({ indexedDB: indexedDB(), showDirectoryPicker: async () => folder });
  const a = await library.add();
  await library.setTitle(a.id, 'Saved title'); folder = second;
  const b = await library.add();
  assert.equal(a.id, b.id);
  assert.equal(b.title, 'Saved title');
  assert.equal((await library.list()).length, 1);
});

test('reads current files with nested relative paths and only relevant extensions', async () => {
  const ignored = file('download-record.json'), hidden = file('.hidden.wav');
  const folder = directory('Piece', [file('piece.orchmix.json', '{}'), ignored, hidden,
    directory('StereoMix', [file('Violin.wav'), file('Oboe.FLAC'), file('notes.md')])]);
  const library = new Library({ indexedDB: indexedDB(), showDirectoryPicker: async () => folder });
  const entry = await library.add();
  const result = await library.read(entry.id);
  assert.deepEqual(result.files.map(value => value.webkitRelativePath).sort(), ['Piece/StereoMix/Oboe.FLAC', 'Piece/StereoMix/Violin.wav', 'Piece/piece.orchmix.json']);
  assert.equal(await result.files.find(value => value.name === 'Violin.wav').text(), 'bytes');
  assert.equal(ignored.reads, 0); assert.equal(hidden.reads, 0);
});

test('permission checks and available list never prompt; explicit read requests immediately', async () => {
  const folder = directory('Piece', [file('Flute.wav')]);
  const library = new Library({ indexedDB: indexedDB(), showDirectoryPicker: async () => folder });
  const entry = await library.add(); folder.permission = 'prompt';
  assert.equal((await library.list())[0].permission, 'prompt');
  assert.deepEqual(await library.available(), []);
  await assert.rejects(library.read(entry.id), { code: 'permission' });
  assert.equal(folder.prompts, 0);
  const read = library.read(entry.id, { requestPermission: true });
  assert.equal(folder.prompts, 1);
  assert.equal((await read).files.length, 1);
  assert.equal((await library.available()).length, 1);
  folder.nextPermission = 'denied';
  await assert.rejects(library.read(entry.id, { requestPermission: true }), { code: 'permission' });
});

test('storage errors retain a usable current-tab library and expose an honest warning', async () => {
  const folder = directory('Piece', [file('Flute.wav')]);
  const library = new Library({ indexedDB: { open() { throw new DOMException('blocked', 'SecurityError'); } }, showDirectoryPicker: async () => folder });
  const entry = await library.add();
  assert.equal(library.persistent, false);
  assert.match(library.warning, /this tab only/);
  assert.equal((await library.read(entry.id)).files.length, 1);
  assert.equal((await library.list()).length, 1);
  await library.remove(entry.id);
  assert.equal((await library.list()).length, 0);
});

test('unsupported pickers and missing or moved folders give recoverable errors', async () => {
  const unsupported = new Library({ indexedDB: null, showDirectoryPicker: null });
  assert.equal(unsupported.supported, false);
  await assert.rejects(unsupported.add(), { code: 'unsupported' });
  await assert.rejects(unsupported.read('unknown'), { code: 'missing' });
  const folder = directory('Moved');
  folder.entries = async function* () { throw new DOMException('gone', 'NotFoundError'); };
  const library = new Library({ indexedDB: indexedDB(), showDirectoryPicker: async () => folder });
  const entry = await library.add();
  await assert.rejects(library.read(entry.id), { code: 'missing' });
});

test('folder traversal is bounded even for unrelated files and deeply nested trees', async () => {
  const crowded = directory('Big folder', Array.from({ length: 2049 }, (_, n) => file('note-' + n + '.txt')));
  const library = new Library({ indexedDB: indexedDB(), showDirectoryPicker: async () => crowded });
  const entry = await library.add();
  await assert.rejects(library.read(entry.id), { code: 'limit' });
  let nested = directory('leaf', [file('Flute.wav')]);
  for (let i = 0; i < 9; i++) nested = directory('folder-' + i, [nested]);
  const deep = new Library({ indexedDB: indexedDB(), showDirectoryPicker: async () => nested });
  const deepEntry = await deep.add();
  await assert.rejects(deep.read(deepEntry.id), { code: 'limit' });
});
