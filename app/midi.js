(function (root, factory) {
  'use strict';
  const Midi = factory(root);
  if (typeof module === 'object' && module.exports) module.exports = Midi;
  if (root) root.OrchMidi = Midi;
})(typeof globalThis !== 'undefined' ? globalThis : this, function (root) {
  'use strict';

  const STORAGE_KEY = 'orchmix.midi.v1';
  const SLOT_COUNT = 16;
  const ACTIONS = Object.freeze(['playPause', 'allOff', 'randomInstrument']);
  const noop = function () {};
  const text = value => typeof value === 'string' ? value.slice(0, 300) : '';
  const validSlot = value => Number.isInteger(value) && value >= 0 && value < SLOT_COUNT;
  const emptyActions = () => Object.fromEntries(ACTIONS.map(action => [action, null]));

  function readMapping(value) {
    if (!value || typeof value !== 'object' || Array.isArray(value) ||
      !Number.isInteger(value.channel) || value.channel < 0 || value.channel > 15 ||
      !Number.isInteger(value.controller) || value.controller < 0 || value.controller > 119 ||
      typeof value.portId !== 'string' || !value.portId || value.portId.length > 300) return null;
    return {
      portId: value.portId, name: text(value.name), manufacturer: text(value.manufacturer),
      channel: value.channel, controller: value.controller
    };
  }

  function listen(target, event, callback) {
    target.addEventListener(event, callback);
    return () => target.removeEventListener(event, callback);
  }

  class OrchMidi {
    constructor(options = {}) {
      this._navigator = options.navigator || root.navigator || {};
      this._onChange = typeof options.onChange === 'function' ? options.onChange : noop;
      this._onValue = typeof options.onValue === 'function' ? options.onValue : noop;
      this._onAction = typeof options.onAction === 'function' ? options.onAction : noop;
      this._storage = null;
      this._storageAvailable = true;
      try {
        this._storage = Object.prototype.hasOwnProperty.call(options, 'storage') ? options.storage : root.localStorage;
        if (!this._storage) this._storageAvailable = false;
      } catch (_) { this._storageAvailable = false; }
      this._enabled = false;
      this._mappings = Array(SLOT_COUNT).fill(null);
      this._actionMappings = emptyActions();
      this._learning = null;
      this._learningAction = null;
      this._access = null;
      this._removeStateListener = null;
      this._ports = new Map();
      this._connecting = null;
      this._generation = 0;
      this._error = '';
      this._readSettings();
      // A saved preference alone never triggers a new browser permission prompt.
      this.ready = Promise.resolve().then(() => this._restore());
    }

    get state() {
      return {
        supported: typeof this._navigator.requestMIDIAccess === 'function',
        enabled: this._enabled,
        connected: Boolean(this._access),
        connecting: Boolean(this._connecting),
        learning: this._learning,
        learningAction: this._learningAction,
        mappings: this._mappings.map(mapping => mapping ? { ...mapping } : null),
        actionMappings: Object.fromEntries(ACTIONS.map(action => [action,
          this._actionMappings[action] ? { ...this._actionMappings[action] } : null])),
        inputs: Array.from(this._ports.keys(), port => ({
          id: text(port.id), name: text(port.name) || 'MIDI input', manufacturer: text(port.manufacturer)
        })),
        error: this._error,
        storageAvailable: this._storageAvailable
      };
    }

    _emit() { this._onChange(this.state); }

    _readSettings() {
      if (!this._storage) return;
      let raw;
      try { raw = this._storage.getItem(STORAGE_KEY); }
      catch (_) { this._storageAvailable = false; return; }
      try {
        if (!raw || raw.length > 20000) return;
        const value = JSON.parse(raw);
        if (!value || value.version !== 1) return;
        this._enabled = value.enabled === true;
        if (Array.isArray(value.mappings)) {
          this._mappings = Array.from({ length: SLOT_COUNT }, (_, index) => readMapping(value.mappings[index]));
        }
        if (value.actionMappings && typeof value.actionMappings === 'object' && !Array.isArray(value.actionMappings)) {
          for (const action of ACTIONS) this._actionMappings[action] = readMapping(value.actionMappings[action]);
        }
      } catch (_) {
        // A corrupt preference must not prevent audio or a fresh MIDI setup.
      }
    }

    _saveSettings() {
      if (!this._storage) return;
      try {
        this._storage.setItem(STORAGE_KEY, JSON.stringify({
          version: 1, enabled: this._enabled, mappings: this._mappings, actionMappings: this._actionMappings
        }));
        this._storageAvailable = true;
      } catch (_) { this._storageAvailable = false; }
    }

    async _restore() {
      if (!this._enabled || !this.state.supported || !this._navigator.permissions) {
        this._emit();
        return false;
      }
      const generation = this._generation;
      try {
        const result = await this._navigator.permissions.query({ name: 'midi', sysex: false });
        if (generation === this._generation && this._enabled && result.state === 'granted') return this.connect();
      } catch (_) {
        // Not every browser supports querying this permission. The explicit
        // Connect button is the safe fallback, without an automatic prompt.
      }
      this._emit();
      return false;
    }

    connect() {
      if (this._access) return Promise.resolve(true);
      if (this._connecting) return this._connecting;
      if (!this.state.supported) {
        this._error = 'Web MIDI is unavailable here. Open Orch Mix over HTTPS or localhost in a browser with Web MIDI support, such as desktop Chrome or Edge.';
        this._emit();
        return Promise.resolve(false);
      }
      const generation = ++this._generation;
      this._error = '';
      // requestMIDIAccess is called synchronously from Connect's user gesture.
      let request;
      try { request = this._navigator.requestMIDIAccess({ sysex: false }); }
      catch (error) { request = Promise.reject(error); }
      const pending = Promise.resolve(request).then(access => {
        if (generation !== this._generation) return false;
        this._access = access;
        this._enabled = true;
        this._removeStateListener = listen(access, 'statechange', () => this._syncInputs());
        this._syncInputs();
        this._saveSettings();
        return true;
      }).catch(error => {
        if (generation !== this._generation) return false;
        this._error = error && (error.name === 'NotAllowedError' || error.name === 'SecurityError')
          ? 'MIDI access was not allowed. Allow MIDI in this browser’s site settings, then connect again.'
          : 'MIDI could not connect. Check the controller and browser, then try again.';
        return false;
      }).finally(() => {
        if (this._connecting === pending) this._connecting = null;
        this._emit();
      });
      this._connecting = pending;
      this._emit();
      return pending;
    }

    _syncInputs() {
      if (!this._access) return;
      const connected = new Set(Array.from(this._access.inputs.values()).filter(port => port.state === 'connected'));
      for (const [port, remove] of this._ports) {
        if (!connected.has(port)) {
          remove();
          this._ports.delete(port);
        }
      }
      for (const port of connected) {
        if (this._ports.has(port)) continue;
        const remove = listen(port, 'midimessage', event => this._message(port, event.data));
        this._ports.set(port, remove);
        // Listening opens a MIDIInput implicitly in the Web MIDI API. No output
        // port is opened or inspected, and no controller data is sent.
      }
      this._emit();
    }

    _matchesPort(mapping, port) {
      if (mapping.portId === port.id) return true;
      const inputs = Array.from(this._ports.keys());
      // A stable ID wins. A changed ID can use a unique exact name/manufacturer
      // pair, but never guess between two identical connected controllers.
      if (inputs.some(input => input.id === mapping.portId) || !mapping.name) return false;
      const same = inputs.filter(input => text(input.name) === mapping.name && text(input.manufacturer) === mapping.manufacturer);
      return same.length === 1 && same[0] === port;
    }

    _message(port, data) {
      if (!this._access || !this._ports.has(port) || !data || data.length !== 3) return;
      const [status, controller, value] = data;
      // Learn ordinary 7-bit CC only. Notes, clock, pitch bend, system messages,
      // and CC120–127 channel-mode commands cannot accidentally become controls.
      if (!Number.isInteger(status) || status < 0xb0 || status > 0xbf ||
        !Number.isInteger(controller) || controller < 0 || controller > 119 ||
        !Number.isInteger(value) || value < 0 || value > 127) return;
      const channel = status & 0x0f;
      if (this._learning !== null || this._learningAction !== null) {
        // Button releases must not finish learning an action. Every positive
        // value counts as a press, including controllers that send 127 only.
        if (this._learningAction !== null && value === 0) return;
        const slot = this._learning;
        const action = this._learningAction;
        const matches = mapping => mapping && mapping.channel === channel &&
          mapping.controller === controller && this._matchesPort(mapping, port);
        this._mappings = this._mappings.map(mapping => matches(mapping) ? null : mapping);
        for (const key of ACTIONS) if (matches(this._actionMappings[key])) this._actionMappings[key] = null;
        const mapping = { portId: text(port.id), name: text(port.name), manufacturer: text(port.manufacturer), channel, controller };
        if (action !== null) this._actionMappings[action] = mapping;
        else this._mappings[slot] = mapping;
        this._learning = null;
        this._learningAction = null;
        this._saveSettings();
        this._emit();
        // Learning assigns a control; it does not move audio or trigger actions.
        return;
      }
      this._mappings.forEach((mapping, slot) => {
        if (mapping && mapping.channel === channel && mapping.controller === controller && this._matchesPort(mapping, port)) {
          this._onValue({ slot, value });
        }
      });
      if (value === 0) return;
      for (const action of ACTIONS) {
        const mapping = this._actionMappings[action];
        if (mapping && mapping.channel === channel && mapping.controller === controller && this._matchesPort(mapping, port)) {
          this._onAction({ action, value });
        }
      }
    }

    learn(slot) {
      if (!validSlot(slot)) throw new RangeError(`A MIDI control slot must be between 0 and ${SLOT_COUNT - 1}.`);
      if (!this._access) {
        this._error = 'Connect MIDI before learning a fader or knob.';
        this._emit();
        return false;
      }
      this._learning = slot;
      this._learningAction = null;
      this._error = '';
      this._emit();
      return true;
    }

    learnAction(action) {
      if (!ACTIONS.includes(action)) throw new RangeError('Unknown MIDI action.');
      if (!this._access) {
        this._error = 'Connect MIDI before learning an action button.';
        this._emit();
        return false;
      }
      this._learning = null;
      this._learningAction = action;
      this._error = '';
      this._emit();
      return true;
    }

    cancelLearn() {
      this._learning = null;
      this._learningAction = null;
      this._emit();
    }

    clear(slot) {
      if (slot !== undefined && !validSlot(slot)) throw new RangeError(`A MIDI control slot must be between 0 and ${SLOT_COUNT - 1}.`);
      if (slot === undefined) {
        this._mappings = Array(SLOT_COUNT).fill(null);
        this._actionMappings = emptyActions();
      }
      else this._mappings[slot] = null;
      this._learning = null;
      this._learningAction = null;
      this._saveSettings();
      this._emit();
    }

    clearAction(action) {
      if (!ACTIONS.includes(action)) throw new RangeError('Unknown MIDI action.');
      this._actionMappings[action] = null;
      this._learning = null;
      this._learningAction = null;
      this._saveSettings();
      this._emit();
    }

    disconnect() {
      this._generation += 1;
      this._connecting = null;
      this._learning = null;
      this._learningAction = null;
      this._enabled = false;
      this._error = '';
      if (this._removeStateListener) this._removeStateListener();
      this._removeStateListener = null;
      for (const [port, remove] of this._ports) {
        remove();
        try { Promise.resolve(port.close()).catch(noop); } catch (_) { /* unplugged */ }
      }
      this._ports.clear();
      this._access = null;
      this._saveSettings();
      this._emit();
    }
  }

  OrchMidi.SLOT_COUNT = SLOT_COUNT;
  OrchMidi.ACTIONS = ACTIONS;
  OrchMidi.STORAGE_KEY = STORAGE_KEY;
  return OrchMidi;
});
