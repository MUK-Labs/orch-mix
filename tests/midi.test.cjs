'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const OrchMidi = require('../app/midi.js');

class FakePort extends EventTarget {
  constructor(id, name = 'nanoKONTROL2', manufacturer = 'KORG') {
    super(); Object.assign(this, { id, name, manufacturer, state: 'connected', closed: 0 });
  }
  message(data) { const event = new Event('midimessage'); event.data = data; this.dispatchEvent(event); }
  close() { this.closed += 1; return Promise.resolve(this); }
}

function fixture(saved) {
  const values = new Map(saved ? [[OrchMidi.STORAGE_KEY, JSON.stringify(saved)]] : []);
  const storage = { getItem: key => values.get(key) || null, setItem: (key, value) => values.set(key, value) };
  const port = new FakePort('port-1');
  const access = new EventTarget();
  access.inputs = new Map([[port.id, port]]);
  // Any output access would fail the input-only contract.
  Object.defineProperty(access, 'outputs', { get() { throw new Error('Do not access MIDI outputs'); } });
  const calls = [], received = [], actions = [], states = [];
  const navigator = {
    requestMIDIAccess: async options => { calls.push(options); return access; },
    permissions: { query: async () => ({ state: 'granted' }) }
  };
  const options = { navigator, storage, onValue: value => received.push(value), onAction: action => actions.push(action), onChange: state => states.push(state) };
  return { values, storage, port, access, calls, received, actions, states, navigator, options };
}

test('learns one input-only CC per slot without moving audio during learning, and filters messages', async () => {
  const f = fixture(), midi = new OrchMidi(f.options);
  await midi.ready;
  assert.equal(f.calls.length, 0);
  assert.equal(await midi.connect(), true);
  assert.deepEqual(f.calls, [{ sysex: false }]);
  assert.equal(midi.learn(0), true);
  for (const data of [[0x90, 60, 127], [0xb0, 123, 0], [0xf8], [0xb0, 4, 128], [0xb0, 4]]) f.port.message(data);
  assert.equal(midi.state.learning, 0);
  f.port.message([0xb2, 4, 72]);
  assert.equal(midi.state.learning, null);
  assert.equal(midi.state.mappings[0].channel, 2);
  assert.deepEqual(f.received, []);
  f.port.message([0xb0, 4, 80]);
  f.port.message([0xb2, 5, 80]);
  f.port.message([0xb2, 4, 0]);
  f.port.message([0xb2, 4, 127]);
  assert.deepEqual(f.received, [{ slot: 0, value: 0 }, { slot: 0, value: 127 }]);
  midi.learn(15); f.port.message([0xb2, 4, 60]);
  assert.equal(midi.state.mappings[0], null);
  assert.equal(midi.state.mappings[15].controller, 4);
  f.port.message([0xb2, 4, 81]);
  assert.deepEqual(f.received.at(-1), { slot: 15, value: 81 });
  assert.equal(f.received.length, 3);
  midi.clear(15);
  assert.equal(midi.state.mappings[15], null);
  assert.throws(() => midi.learn(16), /between 0 and 15/);
  assert.throws(() => midi.clear(16), /between 0 and 15/);
});

test('learns and independently routes all 16 faders and knobs', async () => {
  const f = fixture(), midi = new OrchMidi(f.options);
  await midi.ready; await midi.connect();
  assert.equal(OrchMidi.SLOT_COUNT, 16);
  // Distinct ordinary CCs, as sent by eight faders and eight absolute knobs.
  const controllers = [0, 1, 2, 3, 4, 5, 6, 7, 16, 17, 18, 19, 20, 21, 22, 23];
  controllers.forEach((controller, slot) => {
    midi.learn(slot); f.port.message([0xb0, controller, 64]);
  });
  assert.equal(midi.state.mappings.length, 16);
  assert.deepEqual(midi.state.mappings.map(mapping => mapping.controller), controllers);
  assert.deepEqual(f.received, []);
  controllers.forEach((controller, slot) => f.port.message([0xb0, controller, slot * 8]));
  assert.deepEqual(f.received, controllers.map((_, slot) => ({ slot, value: slot * 8 })));
});

test('action learning ignores releases and routes every nonzero press without using fader slots', async () => {
  const f = fixture(), midi = new OrchMidi(f.options);
  await midi.ready; await midi.connect();
  assert.deepEqual(OrchMidi.ACTIONS, ['playPause', 'allOff', 'randomInstrument']);
  OrchMidi.ACTIONS.forEach((action, index) => {
    assert.equal(midi.learnAction(action), true);
    assert.equal(midi.state.learning, null);
    f.port.message([0xb2, 40 + index, 0]);
    assert.equal(midi.state.learningAction, action);
    assert.equal(midi.state.actionMappings[action], null);
    f.port.message([0xb2, 40 + index, 127]);
    assert.equal(midi.state.learningAction, null);
    assert.equal(midi.state.actionMappings[action].controller, 40 + index);
  });
  assert.deepEqual(f.actions, []);
  assert.deepEqual(f.received, []);
  assert.deepEqual(midi.state.mappings, Array(16).fill(null));
  const expected = [];
  OrchMidi.ACTIONS.forEach((action, index) => {
    f.port.message([0xb0, 40 + index, 127]); // Different MIDI channel.
    f.port.message([0xb2, 40 + index, 0]);
    for (const value of [1, 127, 127]) {
      f.port.message([0xb2, 40 + index, value]);
      expected.push({ action, value });
    }
    f.port.message([0xb2, 40 + index, 0]);
  });
  assert.deepEqual(f.actions, expected);
  assert.deepEqual(f.received, []);
});

test('relearning moves duplicate CCs between actions and faders without triggering either', async () => {
  const f = fixture(), midi = new OrchMidi(f.options);
  await midi.ready; await midi.connect();
  midi.learn(15); f.port.message([0xb0, 23, 64]);
  midi.learnAction('playPause'); f.port.message([0xb0, 23, 127]);
  assert.equal(midi.state.mappings[15], null);
  assert.equal(midi.state.actionMappings.playPause.controller, 23);
  midi.learnAction('allOff'); f.port.message([0xb0, 23, 127]);
  assert.equal(midi.state.actionMappings.playPause, null);
  assert.equal(midi.state.actionMappings.allOff.controller, 23);
  midi.learn(8); f.port.message([0xb0, 23, 0]);
  assert.equal(midi.state.actionMappings.allOff, null);
  assert.equal(midi.state.mappings[8].controller, 23);
  // The same controller number on another MIDI channel remains independent.
  midi.learnAction('randomInstrument'); f.port.message([0xb1, 23, 127]);
  assert.equal(midi.state.mappings[8].controller, 23);
  assert.deepEqual(f.actions, []);
  assert.deepEqual(f.received, []);
  f.port.message([0xb0, 23, 0]);
  f.port.message([0xb1, 23, 1]);
  assert.deepEqual(f.received, [{ slot: 8, value: 0 }]);
  assert.deepEqual(f.actions, [{ action: 'randomInstrument', value: 1 }]);
});

test('action learning is exclusive with fader learning and clear operations cancel pending learning', async () => {
  const f = fixture(), midi = new OrchMidi(f.options);
  await midi.ready;
  assert.equal(midi.learnAction('playPause'), false);
  assert.match(midi.state.error, /Connect MIDI/);
  assert.throws(() => midi.learnAction('unknown'), /Unknown MIDI action/);
  assert.throws(() => midi.clearAction('unknown'), /Unknown MIDI action/);
  await midi.connect();
  midi.learn(0); midi.learnAction('playPause');
  assert.equal(midi.state.learning, null);
  assert.equal(midi.state.learningAction, 'playPause');
  midi.learn(15);
  assert.equal(midi.state.learning, 15);
  assert.equal(midi.state.learningAction, null);
  f.port.message([0xb0, 23, 64]);
  midi.learnAction('allOff'); midi.cancelLearn();
  assert.equal(midi.state.learningAction, null);
  f.port.message([0xb0, 41, 127]);
  assert.equal(midi.state.actionMappings.allOff, null);
  midi.learnAction('allOff'); f.port.message([0xb0, 41, 127]);
  midi.learnAction('playPause'); f.port.message([0xb0, 40, 127]);
  midi.learnAction('randomInstrument'); midi.clearAction('allOff');
  assert.equal(midi.state.learningAction, null);
  assert.equal(midi.state.actionMappings.allOff, null);
  assert.equal(midi.state.actionMappings.playPause.controller, 40);
  assert.equal(midi.state.mappings[15].controller, 23);
  midi.clear(15);
  assert.equal(midi.state.actionMappings.playPause.controller, 40);
  midi.learn(2); midi.clear();
  assert.equal(midi.state.learning, null);
  assert.deepEqual(midi.state.mappings, Array(16).fill(null));
  assert.deepEqual(midi.state.actionMappings, { playPause: null, allOff: null, randomInstrument: null });
  const saved = JSON.parse(f.values.get(OrchMidi.STORAGE_KEY));
  assert.deepEqual(saved.actionMappings, midi.state.actionMappings);
  f.port.message([0xb0, 40, 127]);
  assert.deepEqual(f.actions, []);
});

test('legacy sixteen-slot settings gain empty actions and persist all three new mappings', async () => {
  const mappings = Array.from({ length: 16 }, (_, controller) => ({
    portId: 'port-1', name: 'nanoKONTROL2', manufacturer: 'KORG', channel: 0, controller
  }));
  const f = fixture({ version: 1, enabled: false, mappings });
  const midi = new OrchMidi(f.options);
  await midi.ready;
  assert.deepEqual(midi.state.mappings, mappings);
  assert.deepEqual(midi.state.actionMappings, { playPause: null, allOff: null, randomInstrument: null });
  await midi.connect();
  OrchMidi.ACTIONS.forEach((action, index) => {
    midi.learnAction(action); f.port.message([0xb0, 40 + index, 127]);
  });
  const saved = JSON.parse(f.values.get(OrchMidi.STORAGE_KEY));
  assert.equal(saved.version, 1);
  assert.deepEqual(saved.mappings, mappings);
  assert.deepEqual(saved.actionMappings, midi.state.actionMappings);
  midi.disconnect();
  const restored = new OrchMidi(f.options);
  await restored.ready; await restored.connect();
  assert.deepEqual(restored.state.mappings, mappings);
  assert.deepEqual(restored.state.actionMappings, saved.actionMappings);
  f.port.message([0xb0, 42, 127]);
  assert.deepEqual(f.actions, [{ action: 'randomInstrument', value: 127 }]);
});

test('restores legacy eight-slot preferences and pads new controls without changing learned CCs', async () => {
  const mappings = Array.from({ length: 8 }, (_, index) => index === 3 ? null : {
    portId: 'port-1', name: 'nanoKONTROL2', manufacturer: 'KORG', channel: 2, controller: index
  });
  const f = fixture({ version: 1, enabled: false, mappings });
  const midi = new OrchMidi(f.options);
  await midi.ready;
  assert.equal(f.calls.length, 0);
  assert.deepEqual(midi.state.mappings, [...mappings, ...Array(8).fill(null)]);
  await midi.connect();
  midi.learn(15); f.port.message([0xb2, 23, 64]);
  const saved = JSON.parse(f.values.get(OrchMidi.STORAGE_KEY));
  assert.equal(OrchMidi.STORAGE_KEY, 'orchmix.midi.v1');
  assert.equal(saved.version, 1);
  assert.equal(saved.mappings.length, 16);
  assert.deepEqual(saved.mappings.slice(0, 8), mappings);
  assert.deepEqual(saved.mappings.slice(8, 15), Array(7).fill(null));
  assert.equal(saved.mappings[15].controller, 23);
});

test('persists learned controls and restores only already granted permission', async () => {
  const f = fixture(), original = new OrchMidi(f.options);
  await original.ready; await original.connect();
  original.learn(15); f.port.message([0xb0, 12, 90]);
  const restored = new OrchMidi(f.options);
  assert.equal(await restored.ready, true);
  assert.equal(f.calls.length, 2);
  assert.equal(restored.state.mappings[15].controller, 12);
  assert.equal(restored.state.connected, true);
  f.navigator.permissions.query = async () => ({ state: 'prompt' });
  const needsPrompt = new OrchMidi(f.options);
  assert.equal(await needsPrompt.ready, false);
  assert.equal(f.calls.length, 2);
  f.navigator.permissions.query = async () => { throw new TypeError('Unsupported permission name'); };
  await new OrchMidi(f.options).ready;
  assert.equal(f.calls.length, 2);
});

test('hotplug follows an unambiguous renamed port ID but never guesses between identical devices', async () => {
  const f = fixture(), midi = new OrchMidi(f.options);
  await midi.ready; await midi.connect();
  midi.learn(1); f.port.message([0xb0, 8, 64]);
  midi.learnAction('playPause'); f.port.message([0xb0, 40, 127]);
  f.port.state = 'disconnected';
  f.access.dispatchEvent(new Event('statechange'));
  f.port.message([0xb0, 8, 99]);
  f.port.message([0xb0, 40, 127]);
  assert.equal(f.received.length, 0);
  assert.equal(f.actions.length, 0);
  assert.equal(midi.state.inputs.length, 0);
  const replacement = new FakePort('port-new');
  f.access.inputs.set(replacement.id, replacement);
  f.access.dispatchEvent(new Event('statechange'));
  replacement.message([0xb0, 8, 50]);
  replacement.message([0xb0, 40, 1]);
  assert.deepEqual(f.received, [{ slot: 1, value: 50 }]);
  assert.deepEqual(f.actions, [{ action: 'playPause', value: 1 }]);
  const identical = new FakePort('second-identical');
  f.access.inputs.set(identical.id, identical);
  f.access.dispatchEvent(new Event('statechange'));
  replacement.message([0xb0, 8, 51]); identical.message([0xb0, 8, 52]);
  replacement.message([0xb0, 40, 127]); identical.message([0xb0, 40, 127]);
  assert.equal(f.received.length, 1);
  assert.equal(f.actions.length, 1);
  f.port.state = 'connected';
  f.access.dispatchEvent(new Event('statechange'));
  f.port.message([0xb0, 8, 53]);
  f.port.message([0xb0, 40, 127]);
  assert.deepEqual(f.received[1], { slot: 1, value: 53 });
  assert.deepEqual(f.actions[1], { action: 'playPause', value: 127 });
});

test('disabling MIDI cancels an in-flight permission request and remembers the choice', async () => {
  const f = fixture(); let resolve;
  f.navigator.requestMIDIAccess = () => new Promise(done => { resolve = done; });
  const midi = new OrchMidi(f.options);
  await midi.ready;
  const pending = midi.connect();
  assert.equal(midi.state.connecting, true);
  midi.disconnect(); resolve(f.access);
  assert.equal(await pending, false);
  assert.equal(midi.state.connected, false);
  assert.equal(JSON.parse(f.values.get(OrchMidi.STORAGE_KEY)).enabled, false);
  assert.equal(midi.state.inputs.length, 0);
});

test('unsupported, denied, corrupt and unwritable preferences remain usable and nonfatal', async () => {
  const unsupported = new OrchMidi({ navigator: {}, storage: null });
  await unsupported.ready;
  assert.equal(await unsupported.connect(), false);
  assert.match(unsupported.state.error, /unavailable/);
  const f = fixture();
  f.values.set(OrchMidi.STORAGE_KEY, '{broken');
  f.navigator.requestMIDIAccess = async () => { const error = new Error(); error.name = 'NotAllowedError'; throw error; };
  const denied = new OrchMidi(f.options);
  await denied.ready;
  assert.equal(await denied.connect(), false);
  assert.match(denied.state.error, /not allowed/);
  assert.equal(denied.state.enabled, false);
  f.storage.setItem = () => { throw new Error('Storage disabled'); };
  f.navigator.requestMIDIAccess = async () => f.access;
  assert.equal(await denied.connect(), true);
  denied.learn(0); f.port.message([0xb0, 1, 20]);
  assert.equal(denied.state.storageAvailable, false);
  f.port.message([0xb0, 1, 21]);
  assert.deepEqual(f.received, [{ slot: 0, value: 21 }]);
});

test('disconnect removes listeners, closes inputs and preserves mappings for the next explicit connection', async () => {
  const f = fixture(), midi = new OrchMidi(f.options);
  await midi.ready; await midi.connect();
  midi.learn(2); f.port.message([0xb1, 3, 20]);
  midi.learnAction('allOff'); f.port.message([0xb0, 41, 127]);
  midi.learnAction('randomInstrument');
  midi.disconnect();
  f.port.message([0xb1, 3, 21]);
  f.port.message([0xb0, 41, 127]);
  assert.equal(f.received.length, 0);
  assert.equal(f.actions.length, 0);
  assert.equal(midi.state.learningAction, null);
  assert.equal(f.port.closed, 1);
  assert.equal(midi.state.mappings[2].controller, 3);
  assert.equal(midi.state.enabled, false);
  await midi.connect();
  f.port.message([0xb1, 3, 22]);
  f.port.message([0xb0, 41, 127]);
  assert.deepEqual(f.received, [{ slot: 2, value: 22 }]);
  assert.deepEqual(f.actions, [{ action: 'allOff', value: 127 }]);
});
