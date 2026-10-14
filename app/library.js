(function (root, factory) {
  'use strict';
  const Library = factory(root);
  if (typeof module === 'object' && module.exports) module.exports = Library;
  if (root) root.OrchLibrary = Library;
})(typeof globalThis !== 'undefined' ? globalThis : this, function (root) {
  'use strict';
  const DATABASE = 'orch-mix-local-library';
  const STORE = 'folders';
  const AUDIO = /\.(wav|mp3|flac|ogg|m4a|aif|aiff|opus|webm)$/i;
  const MANIFEST = /\.orchmix\.json$/i;
  const MAX_ENTRIES = 2048, MAX_FILES = 160, MAX_DEPTH = 8, MAX_FOLDERS = 100;
  const MEMORY_WARNING = 'The browser could not save the piece library. These folders are available for this tab only; use the local server in Chrome or Edge and allow browser storage to remember them.';

  function error(message, code) { const result = new Error(message); result.code = code; return result; }
  function validName(name) { return typeof name === 'string' && name.length > 0 && !/[\/\\\u0000-\u001f\u007f]/.test(name) && name !== '.' && name !== '..'; }
  function metadata(record, permission) {
    return { id: record.id, name: record.name, title: record.title || record.name, permission: permission || 'prompt' };
  }
  async function permission(handle) {
    try { return await handle.queryPermission({ mode: 'read' }); }
    catch (_) { return 'prompt'; }
  }
  async function collectFiles(handle) {
    const files = []; let visited = 0;
    if (!validName(handle.name)) throw error('The selected folder has an unsupported name.', 'folder');
    async function walk(directory, path, depth) {
      for await (const [name, child] of directory.entries()) {
        if (++visited > MAX_ENTRIES) throw error('This folder contains too many entries. Select just one piece and one microphone folder.', 'limit');
        if (!validName(name)) throw error('A folder entry has an unsupported name.', 'folder');
        const relative = path + '/' + name;
        // Hidden folders contain neither the intended stems nor a session.
        if (name.startsWith('.')) continue;
        if (child.kind === 'directory') {
          if (depth >= MAX_DEPTH) throw error('The folder is nested too deeply. Select the folder immediately containing this piece.', 'limit');
          await walk(child, relative, depth + 1);
        } else if (child.kind === 'file' && (AUDIO.test(name) || MANIFEST.test(name))) {
          if (files.length >= MAX_FILES) throw error('This folder contains too many audio or session files. Select just one piece and one microphone folder.', 'limit');
          const file = await child.getFile();
          // FileSystemFileHandle files have no relative path. Add the same path
          // shape that the existing webkitdirectory loader already understands.
          Object.defineProperty(file, 'webkitRelativePath', { value: relative, configurable: true });
          files.push(file);
        }
      }
    }
    await walk(handle, handle.name, 0);
    files.sort((a, b) => a.webkitRelativePath.localeCompare(b.webkitRelativePath));
    return files;
  }

  class Library {
    constructor(options) {
      const settings = options || {};
      this._picker = Object.prototype.hasOwnProperty.call(settings, 'showDirectoryPicker') ? settings.showDirectoryPicker : typeof root.showDirectoryPicker === 'function' ? root.showDirectoryPicker.bind(root) : null;
      try { this._indexedDB = Object.prototype.hasOwnProperty.call(settings, 'indexedDB') ? settings.indexedDB : root.indexedDB; }
      catch (_) { this._indexedDB = null; }
      this._records = new Map(); this._database = null; this._ready = null;
      this._memoryOnly = !this._indexedDB; this.warning = ''; this.persistent = false;
    }
    get supported() { return typeof this._picker === 'function'; }
    _storageFailed() { this._memoryOnly = true; this.persistent = false; this.warning = MEMORY_WARNING; }
    async _open() {
      if (this._memoryOnly) { this._storageFailed(); return null; }
      if (this._database) return this._database;
      try {
        this._database = await new Promise((resolve, reject) => {
          const request = this._indexedDB.open(DATABASE, 1);
          request.onupgradeneeded = () => { if (!request.result.objectStoreNames.contains(STORE)) request.result.createObjectStore(STORE, { keyPath: 'id' }); };
          request.onerror = () => reject(request.error || new Error('Storage unavailable'));
          request.onblocked = () => reject(new Error('Storage is busy'));
          request.onsuccess = () => {
            if (this._memoryOnly) { request.result.close(); return; }
            request.result.onversionchange = () => { request.result.close(); this._database = null; this._storageFailed(); };
            resolve(request.result);
          };
        });
        this.persistent = true;
        return this._database;
      } catch (_) { this._storageFailed(); return null; }
    }
    async _transaction(mode, operation) {
      const database = await this._open();
      if (!database) return undefined;
      try {
        return await new Promise((resolve, reject) => {
          const transaction = database.transaction(STORE, mode);
          let request;
          transaction.oncomplete = () => resolve(request && request.result);
          transaction.onerror = () => reject(transaction.error || new Error('Storage unavailable'));
          transaction.onabort = () => reject(transaction.error || new Error('Storage unavailable'));
          request = operation(transaction.objectStore(STORE));
        });
      } catch (_) { this._storageFailed(); return undefined; }
    }
    async _initialize() {
      if (!this._ready) this._ready = (async () => {
        const records = await this._transaction('readonly', store => store.getAll());
        for (const record of records || []) {
          if (record && typeof record.id === 'string' && validName(record.name) && record.handle?.kind === 'directory') this._records.set(record.id, record);
        }
      })();
      await this._ready;
    }
    async list() {
      await this._initialize();
      return Promise.all([...this._records.values()].sort((a, b) => (a.title || a.name).localeCompare(b.title || b.name)).map(async record => metadata(record, await permission(record.handle))));
    }
    async available() { return (await this.list()).filter(entry => entry.permission === 'granted'); }
    async add() {
      if (!this.supported) throw error('Remembered folders need Chrome or Edge. You can still open audio with the regular folder picker.', 'unsupported');
      // This must happen before storage access or other asynchronous work so the
      // browser still sees the click that authorized the directory picker.
      const handle = await this._picker({ id: 'orch-mix-pieces', mode: 'read' });
      await this._initialize();
      for (const record of this._records.values()) {
        try {
          if (await handle.isSameEntry(record.handle)) {
            // Refresh the stored handle after the user has re-picked a folder.
            record.handle = handle;
            await this._transaction('readwrite', store => store.put(record));
            return metadata(record, await permission(handle));
          }
        } catch (_) { /* A removed folder must not prevent adding a new one. */ }
      }
      if (this._records.size >= MAX_FOLDERS) throw error('The library holds up to 100 piece folders. Remove one before adding another.', 'limit');
      const id = root.crypto && typeof root.crypto.randomUUID === 'function' ? root.crypto.randomUUID() : 'folder-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2);
      const record = { id, name: handle.name, title: handle.name, handle, addedAt: Date.now() };
      if (!validName(record.name) || handle.kind !== 'directory') throw error('Select a valid piece folder.', 'folder');
      this._records.set(id, record);
      await this._transaction('readwrite', store => store.put(record));
      return metadata(record, await permission(handle));
    }
    async read(id, options) {
      // Startup list() warms this cache. With a cached handle, requestPermission
      // is invoked before the first await and stays tied to the initiating click.
      let record = this._records.get(id);
      if (!record) { await this._initialize(); record = this._records.get(id); }
      if (!record) throw error('This piece folder is no longer in the library. Add it again.', 'missing');
      let access;
      if (options?.requestPermission === true) {
        try { access = await record.handle.requestPermission({ mode: 'read' }); }
        catch (_) { throw error('Folder access needs a click. Select the piece and use Open saved piece to reconnect it.', 'permission'); }
      } else access = await permission(record.handle);
      if (access !== 'granted') throw error('Folder access is not granted. Select the piece and use Open saved piece to reconnect it.', 'permission');
      try { return { entry: metadata(record, access), files: await collectFiles(record.handle) }; }
      catch (cause) {
        if (typeof cause.code === 'string') throw cause;
        if (cause.name === 'NotAllowedError' || cause.name === 'SecurityError') throw error('Folder access expired. Select the piece and use Open saved piece to reconnect it.', 'permission');
        if (cause.name === 'NotFoundError') throw error('The saved folder or a file has moved. Remove this library entry and add its new folder.', 'missing');
        throw error('Could not read this piece folder: ' + (cause.message || 'the folder is unavailable'), 'read');
      }
    }
    async setTitle(id, title) {
      await this._initialize(); const record = this._records.get(id);
      if (!record) return;
      if (typeof title !== 'string' || !title.trim() || title.trim().length > 200 || /[\u0000-\u001f\u007f]/.test(title)) throw error('The piece title must contain 1–200 characters.', 'title');
      record.title = title.trim(); await this._transaction('readwrite', store => store.put(record));
    }
    async remove(id) {
      await this._initialize(); this._records.delete(id);
      await this._transaction('readwrite', store => store.delete(id));
    }
  }
  return Library;
});
