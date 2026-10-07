'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
require('../app/audio-engine.js');

class FakeNode {
  constructor() {
    this.gain = { value: 1, setTargetAtTime(value) { this.value = value; } };
    this.disconnected = false;
  }
  connect() {}
  disconnect() { this.disconnected = true; }
  getFloatTimeDomainData(samples) { samples.fill(0.25); }
  start(when, offset) { this.startArgs = [when, offset]; }
  stop(when) { this.stopAt = when; }
}
class FakeContext {
  constructor() { this.currentTime = 0; this.sampleRate = 48000; this.destination = {}; this.sources = []; }
  createGain() { return new FakeNode(); }
  createAnalyser() { return new FakeNode(); }
  createBufferSource() { const node = new FakeNode(); this.sources.push(node); return node; }
  createBuffer(channels, length, sampleRate) {
    const data = Array.from({ length: channels }, () => new Float32Array(length));
    return { numberOfChannels: channels, length, sampleRate, duration: length / sampleRate,
      getChannelData: channel => data[channel] };
  }
  async resume() {}
  async close() {}
}
global.AudioContext = FakeContext;

function wav({ bits = 16, encoding = 1, channels = 1, frames = 8000, sampleRate = 8000, extensible = false, sample = () => 0.25 } = {}) {
  const fmtSize = extensible ? 40 : 16;
  const dataOffset = 12 + 8 + fmtSize + 8;
  const dataSize = frames * channels * bits / 8;
  const bytes = Buffer.alloc(dataOffset + dataSize);
  bytes.write('RIFF'); bytes.writeUInt32LE(bytes.length - 8, 4); bytes.write('WAVE', 8);
  bytes.write('fmt ', 12); bytes.writeUInt32LE(fmtSize, 16);
  bytes.writeUInt16LE(extensible ? 0xfffe : encoding, 20);
  bytes.writeUInt16LE(channels, 22); bytes.writeUInt32LE(sampleRate, 24);
  bytes.writeUInt32LE(sampleRate * channels * bits / 8, 28);
  bytes.writeUInt16LE(channels * bits / 8, 32); bytes.writeUInt16LE(bits, 34);
  if (extensible) {
    bytes.writeUInt16LE(22, 36); bytes.writeUInt16LE(bits, 38); bytes.writeUInt32LE(encoding, 44);
    Buffer.from([0, 0, 16, 0, 128, 0, 0, 170, 0, 56, 155, 113]).copy(bytes, 48);
  }
  bytes.write('data', dataOffset - 8); bytes.writeUInt32LE(dataSize, dataOffset - 4);
  for (let frame = 0; frame < frames; frame++) for (let channel = 0; channel < channels; channel++) {
    const offset = dataOffset + (frame * channels + channel) * bits / 8;
    const value = sample(frame, channel);
    if (encoding === 3) bytes.writeFloatLE(value, offset);
    else if (bits === 16) bytes.writeInt16LE(Math.round(value * 32768), offset);
    else if (bits === 24) bytes.writeIntLE(Math.round(value * 8388608), offset, 3);
    else bytes.writeInt32LE(Math.round(value * 2147483648), offset);
  }
  const blob = new Blob([bytes]); blob.name = 'test.wav';
  return { blob, bytes, dataOffset };
}

test('PCM16/24/32 and extensible float32 preserve amplitude, channels and excerpt sample position', async () => {
  for (const configuration of [ { bits: 16 }, { bits: 24 }, { bits: 32 }, { bits: 32, encoding: 3, extensible: true } ]) {
    const { blob, dataOffset } = wav({ ...configuration, channels: 2,
      sample: (frame, channel) => channel === 0 ? (frame < 2000 ? -0.5 : 0.25) : -0.75 });
    const reads = [];
    const file = { name: blob.name, size: blob.size, slice(start, end) { reads.push([start, end]); return blob.slice(start, end); } };
    const info = await OrchAudioHelpers.parseWav(file);
    const decoded = await OrchAudioHelpers.decodeWavExcerpt(new FakeContext(), file, info, 0.25, 0.1, 0);
    assert.equal(decoded.buffer.length, 800);
    assert.equal(decoded.buffer.getChannelData(0)[0], 0.25);
    assert.equal(decoded.buffer.getChannelData(1)[0], -0.75);
    const read = reads.at(-1);
    assert.equal(read[0], dataOffset + 2000 * info.blockAlign);
    assert.equal(read[1] - read[0], 800 * info.blockAlign);
    assert.ok(read[1] - read[0] < file.size / 2, 'only selected audio range is read');
  }
});

test('malformed, unsupported and excessively large WAV requests fail before audio allocations', async () => {
  const { bytes } = wav();
  bytes.writeUInt32LE(0xffffffff, 4);
  await assert.rejects(OrchAudioHelpers.parseWav(new Blob([bytes])), /truncated/);
  const invalid = wav().bytes;
  invalid.writeUInt16LE(8, 34);
  await assert.rejects(OrchAudioHelpers.parseWav(new Blob([invalid])), /Unsupported WAV encoding/);
  const { blob } = wav();
  const info = await OrchAudioHelpers.parseWav(blob);
  await assert.rejects(OrchAudioHelpers.decodeWavExcerpt(new FakeContext(), blob, info, 0, 1,
    OrchAudioHelpers.MEMORY_BUDGET), /512 MiB/);
});

test('mixed lengths have one shared range, silent tracks are identified, and failures clear the engine', async () => {
  const engine = new OrchAudioEngine();
  const progress = [];
  const report = await engine.load([{ id: 'vln1', file: wav().blob },
    { id: 'fl', file: wav({ frames: 4000, sample: () => 0 }).blob }],
  { startSeconds: 0.1, durationSeconds: 1, onProgress: value => progress.push(value) });
  assert.equal(report.duration, 0.4);
  assert.equal(report.tracks[0].active, true);
  assert.equal(report.tracks[1].active, false);
  assert.equal(report.tracks[1].peak, 0);
  assert.equal(progress.at(-1).fraction, 1);
  assert.equal(report.warnings.length, 2);
  await assert.rejects(engine.load([{ id: 'bad', file: wav().blob }], { startSeconds: 2 }), /after the end/);
  assert.equal(engine.duration, 0);
  assert.equal(engine._tracks.size, 0);
  assert.equal(engine._loading, false);
  engine.dispose();
});

test('all sources start on one clock, seek together, mute to exact zero, and disconnect on stop', async () => {
  const engine = new OrchAudioEngine();
  await engine.load([{ id: 'a', file: wav().blob }, { id: 'b', file: wav().blob }]);
  await engine.play();
  const [a, b] = engine._sources;
  assert.deepEqual(a.startArgs, b.startArgs);
  assert.deepEqual(a.startArgs, [0.04, 0]);
  engine._context.currentTime = 0.24;
  assert.ok(Math.abs(engine.currentTime - 0.2) < 1e-10);
  engine.seek(0.5);
  assert.equal(a.disconnected, true);
  assert.equal(b.disconnected, true);
  assert.equal(engine._sources[0].startArgs[1], 0.5);
  assert.deepEqual(engine._sources[0].startArgs, engine._sources[1].startArgs);
  engine.setGain('a', -100);
  assert.equal(engine._tracks.get('a').gain.gain.value, 0);
  engine.setGain('b', 0);
  assert.equal(engine._tracks.get('b').gain.gain.value, 1);
  engine.stop();
  assert.equal(engine.currentTime, 0);
  assert.equal(engine.isPlaying, false);
  assert.equal(engine._sources.length, 0);
  engine.dispose();
});

test('pause cancels a play request while AudioContext.resume is pending', async () => {
  const engine = new OrchAudioEngine();
  await engine.load([{ id: 'a', file: wav().blob }]);
  let resume;
  engine._context.resume = () => new Promise(resolve => { resume = resolve; });
  const pendingPlay = engine.play();
  engine.pause();
  resume();
  await pendingPlay;
  assert.equal(engine.isPlaying, false);
  assert.equal(engine._sources.length, 0);
  engine.dispose();
});

test('float WAV non-finite samples are silenced and reported', async () => {
  const engine = new OrchAudioEngine();
  const report = await engine.load([{ id: 'a', file: wav({ bits: 32, encoding: 3,
    sample: frame => frame === 0 ? NaN : 0.25 }).blob }]);
  assert.ok(report.warnings.some(warning => /1 invalid floating-point/.test(warning)));
  assert.equal(engine._tracks.get('a').buffer.getChannelData(0)[0], 0);
  engine.dispose();
});
