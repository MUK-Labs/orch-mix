/* Local-only audio engine. No network requests, dependencies, or audio uploads. */
(function (global) {
  'use strict';

  const MEMORY_BUDGET = 512 * 1024 * 1024;
  const MAX_EXCERPT_SECONDS = 120;
  const MAX_CHANNELS = 32;
  const MAX_COMPRESSED_BYTES = 64 * 1024 * 1024;
  const STANDARD_SUBFORMAT_TAIL = [0, 0, 16, 0, 128, 0, 0, 170, 0, 56, 155, 113];

  function abortError() {
    const error = new Error('This audio load was replaced by a newer one.');
    error.name = 'AbortError';
    return error;
  }

  function fourCC(view, offset) {
    return String.fromCharCode(view.getUint8(offset), view.getUint8(offset + 1),
      view.getUint8(offset + 2), view.getUint8(offset + 3));
  }

  async function readBytes(file, offset, length) {
    if (!Number.isSafeInteger(offset) || !Number.isSafeInteger(length) || offset < 0 ||
        length < 0 || offset + length > file.size) {
      throw new Error('The WAV file is truncated or has invalid chunk sizes.');
    }
    const bytes = await file.slice(offset, offset + length).arrayBuffer();
    if (bytes.byteLength !== length) throw new Error('Could not read the requested audio data.');
    return new DataView(bytes);
  }

  /** Inspect RIFF without reading its audio payload. Chunk lengths never control allocations. */
  async function parseWav(file) {
    if (file.size < 12) throw new Error('This file is too small to be a WAV recording.');
    const header = await readBytes(file, 0, 12);
    const kind = fourCC(header, 0);
    if (kind === 'RF64' || kind === 'BW64') {
      throw new Error('RF64/BW64 WAV is not supported yet. Export an ordinary PCM WAV excerpt first.');
    }
    if (kind === 'RIFX') throw new Error('Big-endian WAV is not supported. Export little-endian PCM WAV.');
    if (kind !== 'RIFF' || fourCC(header, 8) !== 'WAVE') throw new Error('This is not a supported RIFF/WAVE file.');
    const riffEnd = header.getUint32(4, true) + 8;
    if (riffEnd < 12 || riffEnd > file.size) throw new Error('The WAV file is truncated (RIFF size exceeds file size).');
    let offset = 12;
    let format = null;
    let data = null;
    let chunks = 0;
    while (offset + 8 <= riffEnd && (!format || !data)) {
      if (++chunks > 4096) throw new Error('This WAV contains too many metadata chunks. Export a plain PCM WAV.');
      const chunk = await readBytes(file, offset, 8);
      const id = fourCC(chunk, 0);
      const size = chunk.getUint32(4, true);
      const body = offset + 8;
      if (body + size > riffEnd) throw new Error('The WAV file contains a truncated chunk.');
      if (id === 'fmt ') {
        if (size < 16) throw new Error('Invalid WAV format chunk.');
        const fmt = await readBytes(file, body, Math.min(size, 64));
        let encoding = fmt.getUint16(0, true);
        const channels = fmt.getUint16(2, true);
        const sampleRate = fmt.getUint32(4, true);
        const blockAlign = fmt.getUint16(12, true);
        const bits = fmt.getUint16(14, true);
        let validBits = bits;
        if (encoding === 0xfffe) {
          if (size < 40 || fmt.getUint16(16, true) < 22) throw new Error('Invalid extensible WAV format.');
          validBits = fmt.getUint16(18, true) || bits;
          // GUID begins at byte 24; accept only the standard PCM / IEEE-float GUIDs.
          encoding = fmt.getUint32(24, true);
          if (!STANDARD_SUBFORMAT_TAIL.every((value, index) => fmt.getUint8(28 + index) === value)) {
            throw new Error('Unsupported extensible WAV codec. Export PCM16, PCM24, PCM32 or float32 WAV.');
          }
        }
        if (!((encoding === 1 && [16, 24, 32].includes(bits)) || (encoding === 3 && bits === 32))) {
          throw new Error('Unsupported WAV encoding. Export PCM16, PCM24, PCM32 or float32 WAV.');
        }
        if (channels < 1 || channels > MAX_CHANNELS || sampleRate < 8000 || sampleRate > 192000 ||
            validBits < 1 || validBits > bits || blockAlign !== channels * (bits / 8)) {
          throw new Error('Unsupported or invalid WAV channel count, sample rate, or sample layout.');
        }
        format = { encoding, channels, sampleRate, blockAlign, bits, validBits };
      } else if (id === 'data' && !data) {
        data = { offset: body, size };
      }
      offset = body + size + (size % 2);
    }
    if (!format || !data) throw new Error('This WAV is missing its format or audio-data chunk.');
    const frames = Math.floor(data.size / format.blockAlign);
    if (frames < 1) throw new Error('This WAV has no complete audio samples.');
    return { ...format, ...data, frames, duration: frames / format.sampleRate };
  }

  function checkBudget(bytes, context) {
    if (!Number.isFinite(bytes) || bytes > MEMORY_BUDGET) {
      throw new Error(`${context} exceeds the 512 MiB audio-memory budget. Choose a shorter excerpt, fewer tracks, or a lower sample rate.`);
    }
  }

  async function decodeWavExcerpt(context, file, info, start, seconds, heldBytes) {
    const startFrame = Math.floor(start * info.sampleRate);
    const frames = Math.min(Math.ceil(seconds * info.sampleRate), info.frames - startFrame);
    if (frames < 1) throw new Error(`The excerpt starts after the end of “${file.name}”.`);
    const decodedBytes = frames * info.channels * 4;
    const rawBytes = frames * info.blockAlign;
    checkBudget(heldBytes + decodedBytes + rawBytes, `Reading “${file.name}”`);
    const view = await readBytes(file, info.offset + startFrame * info.blockAlign, rawBytes);
    const buffer = context.createBuffer(info.channels, frames, info.sampleRate);
    let repaired = 0;
    const bytesPerSample = info.bits / 8;
    for (let channel = 0; channel < info.channels; channel++) {
      const output = buffer.getChannelData(channel);
      let at = channel * bytesPerSample;
      for (let frame = 0; frame < frames; frame++, at += info.blockAlign) {
        let value;
        if (info.encoding === 3) {
          value = view.getFloat32(at, true);
          if (!Number.isFinite(value)) { value = 0; repaired++; }
        } else if (info.bits === 16) {
          value = view.getInt16(at, true) / 32768;
        } else if (info.bits === 24) {
          const sample = view.getUint8(at) | (view.getUint8(at + 1) << 8) | (view.getUint8(at + 2) << 16);
          value = ((sample << 8) >> 8) / 8388608;
        } else {
          value = view.getInt32(at, true) / 2147483648;
        }
        output[frame] = value;
      }
    }
    return { buffer, bytes: decodedBytes, repaired };
  }

  function compressedDuration(file) {
    return new Promise((resolve, reject) => {
      const audio = new global.Audio();
      const url = global.URL.createObjectURL(file);
      let timeout;
      const done = (error, seconds) => {
        clearTimeout(timeout);
        audio.onloadedmetadata = null;
        audio.onerror = null;
        audio.removeAttribute('src');
        audio.load();
        global.URL.revokeObjectURL(url);
        if (error) reject(error); else resolve(seconds);
      };
      timeout = setTimeout(() => done(new Error('Could not inspect this audio file. Export a PCM WAV and try again.')), 10000);
      audio.preload = 'metadata';
      audio.onloadedmetadata = () => {
        const seconds = audio.duration;
        if (!Number.isFinite(seconds) || seconds <= 0) done(new Error('This audio file has no usable duration metadata. Export a PCM WAV.'));
        else done(null, seconds);
      };
      audio.onerror = () => done(new Error('The browser cannot read this audio format. Export a PCM WAV.'));
      audio.src = url;
    });
  }

  async function inspectSources(entries, options = {}) {
    if (!Array.isArray(entries) || !entries.length) throw new Error('Select at least one audio stem.');
    const ids = new Set();
    const plans = [];
    const assertCurrent = options.assertCurrent || (() => {});
    for (let index = 0; index < entries.length; index++) {
      const { id, file } = entries[index] || {};
      if (typeof id !== 'string' || !id || ids.has(id)) throw new Error('Every stem needs a unique track ID.');
      ids.add(id);
      if (!file || typeof file.slice !== 'function' || !file.size) throw new Error(`No readable audio file for “${id}”.`);
      if (options.onProgress) options.onProgress({ phase: 'inspect', index, total: entries.length,
        fraction: index / (2 * entries.length), id, name: file.name });
      const signature = file.size >= 12 ? await readBytes(file, 0, 12) : null;
      assertCurrent();
      const isWav = /\.wav$/i.test(file.name || '') || (signature &&
        ['RIFF', 'RIFX', 'RF64', 'BW64'].includes(fourCC(signature, 0)));
      const info = isWav ? await parseWav(file) : null;
      let sourceDuration;
      if (info) sourceDuration = info.duration;
      else {
        if (file.size > MAX_COMPRESSED_BYTES) throw new Error(`“${file.name}” is too large for safe compressed decoding. Convert it to PCM WAV; WAV excerpts are read without loading the whole recording.`);
        sourceDuration = await compressedDuration(file);
        if (sourceDuration > MAX_EXCERPT_SECONDS) throw new Error(`“${file.name}” is longer than 120 seconds. Compressed audio requires decoding the whole file; convert it to PCM WAV to load only your selected excerpt.`);
      }
      assertCurrent();
      plans.push({ id, file, info, sourceDuration });
    }
    return plans;
  }

  // Account for already-held decoded stems, the next decode and its temporary
  // input bytes. One-frame allowances cover rounding up at arbitrary offsets.
  function safeExcerptDuration(plans, compressedSampleRate) {
    let duration = Math.min(MAX_EXCERPT_SECONDS, ...plans.map(plan => plan.sourceDuration));
    let heldRate = 0;
    let heldAllowance = 0;
    for (const plan of plans) {
      const channels = plan.info ? plan.info.channels : MAX_CHANNELS;
      const sampleRate = plan.info ? plan.info.sampleRate : compressedSampleRate;
      const decodedRate = channels * sampleRate * 4;
      const decodedAllowance = channels * 4;
      let temporaryRate = 0;
      let temporaryBytes;
      if (plan.info) {
        temporaryRate = sampleRate * plan.info.blockAlign;
        temporaryBytes = plan.info.blockAlign;
      } else {
        temporaryBytes = Math.ceil((plan.sourceDuration + 1) * sampleRate) * MAX_CHANNELS * 4 + plan.file.size;
      }
      const available = MEMORY_BUDGET - heldAllowance - decodedAllowance - temporaryBytes;
      duration = Math.min(duration, Math.max(0, available / (heldRate + decodedRate + temporaryRate)));
      heldRate += decodedRate;
      heldAllowance += decodedAllowance;
    }
    return Math.floor(duration * 1000) / 1000;
  }

  function dbToGain(db) { return Math.pow(10, db / 20); }
  function updateGain(param, value, now, playing) {
    param.cancelScheduledValues(now);
    if (!playing) {
      // A muted mystery excerpt must be silent from its very first sample;
      // approaching zero exponentially before playback can still leak audio.
      param.setValueAtTime(value, now);
    } else {
      param.setTargetAtTime(value, now, 0.015);
      // Exponential smoothing never reaches zero on its own. End the fade
      // after eight time constants; later changes cancel this endpoint above.
      if (value === 0) param.setValueAtTime(0, now + 0.12);
    }
  }
  function clamp(value, min, max) { return Math.max(min, Math.min(max, value)); }
  function finite(value, fallback) { return Number.isFinite(Number(value)) ? Number(value) : fallback; }
  function trackMetadata(id, buffer, duration) {
    let peak = 0;
    const frames = Math.min(buffer.length, Math.ceil(duration * buffer.sampleRate));
    for (let channel = 0; channel < buffer.numberOfChannels; channel++) {
      const samples = buffer.getChannelData(channel);
      for (let frame = 0; frame < frames; frame++) peak = Math.max(peak, Math.abs(samples[frame]));
    }
    return { id, duration, channels: buffer.numberOfChannels, sampleRate: buffer.sampleRate, peak, active: peak > 1e-5 };
  }

  class OrchAudioEngine {
    constructor() {
      this._context = null;
      this._master = null;
      this._masterDb = -12;
      this._tracks = new Map();
      this._duration = 0;
      this._offset = 0;
      this._startedAt = 0;
      this._playing = false;
      this._loop = true;
      this._sources = [];
      this._endTimer = null;
      this._loadGeneration = 0;
      this._playRequest = 0;
      this._loading = false;
      this.onended = null;
    }

    _ensureContext() {
      if (!this._context) {
        const AudioContext = global.AudioContext || global.webkitAudioContext;
        if (!AudioContext) throw new Error('This browser does not support Web Audio. Use a current Chrome, Firefox or Safari.');
        this._context = new AudioContext();
        this._master = this._context.createGain();
        this._master.gain.value = dbToGain(this._masterDb);
        this._master.connect(this._context.destination);
      }
      return this._context;
    }

    get duration() { return this._duration; }
    get isPlaying() { return this._playing; }
    get currentTime() {
      if (!this._playing) return this._offset;
      const time = this._offset + Math.max(0, this._context.currentTime - this._startedAt);
      return this._loop && this._duration ? time % this._duration : Math.min(time, this._duration);
    }

    /** Call directly from a user gesture before asynchronous folder/audio work. */
    async unlock() {
      await this._ensureContext().resume();
    }

    /** Read source durations without replacing the loaded excerpt or reading WAV samples. */
    async inspect(entries, options = {}) {
      const plans = await inspectSources(entries, options);
      const needsCompressedContext = plans.some(plan => !plan.info);
      const sampleRate = needsCompressedContext ? this._ensureContext().sampleRate : 0;
      const maxExcerptDuration = safeExcerptDuration(plans, sampleRate);
      if (maxExcerptDuration < 0.1) {
        throw new Error('These stems exceed the 512 MiB audio-memory budget even for a short excerpt. Convert compressed files to PCM WAV, or use fewer tracks or a lower sample rate.');
      }
      const durations = plans.map(plan => plan.sourceDuration);
      const warnings = [];
      if (Math.max(...durations) - Math.min(...durations) > 0.05) {
        warnings.push('Stem lengths differ. Random excerpts use the shortest stem; check that all files share a common timeline.');
      }
      return {
        duration: Math.min(...durations), maxExcerptDuration, warnings,
        tracks: plans.map(plan => ({ id: plan.id, duration: plan.sourceDuration,
          channels: plan.info ? plan.info.channels : null,
          sampleRate: plan.info ? plan.info.sampleRate : null }))
      };
    }

    _stopSources() {
      clearTimeout(this._endTimer);
      this._endTimer = null;
      for (const source of this._sources) {
        source.onended = null;
        try { source.stop(); } catch (_) { /* A source may already have ended. */ }
        source.disconnect();
      }
      this._sources = [];
    }

    _clear() {
      ++this._playRequest;
      this._stopSources();
      this._playing = false;
      this._offset = 0;
      this._duration = 0;
      for (const track of this._tracks.values()) {
        track.gain.disconnect();
        track.analyser.disconnect();
      }
      this._tracks.clear();
    }

    _install(buffers, duration) {
      this._duration = duration;
      for (const { id, buffer } of buffers) {
        const gain = this._context.createGain();
        const analyser = this._context.createAnalyser();
        analyser.fftSize = 256;
        gain.connect(analyser);
        analyser.connect(this._master);
        this._tracks.set(id, { buffer, gain, analyser, db: 0, meter: new Float32Array(analyser.fftSize) });
      }
    }

    /** Only the selected local Files are read. Nothing is uploaded or fetched. */
    async load(entries, options = {}) {
      const generation = ++this._loadGeneration;
      this._clear();
      this._loading = true;
      const assertCurrent = () => { if (generation !== this._loadGeneration) throw abortError(); };
      const warnings = [];
      const start = Math.max(0, finite(options.startSeconds, 0));
      const requested = clamp(finite(options.durationSeconds, 30), 0.1, MAX_EXCERPT_SECONDS);
      if (finite(options.durationSeconds, 30) > MAX_EXCERPT_SECONDS) warnings.push('Excerpt length was limited to 120 seconds.');
      try {
        const context = this._ensureContext();
        const plans = await inspectSources(entries, { onProgress: options.onProgress, assertCurrent });
        let shortest = Infinity;
        for (const { sourceDuration, file } of plans) {
          if (sourceDuration <= start) throw new Error(`The excerpt starts after the end of “${file.name}”.`);
          shortest = Math.min(shortest, sourceDuration - start);
        }
        const duration = Math.min(requested, shortest);
        if (duration < requested - 0.01) warnings.push(`The common excerpt was shortened to ${duration.toFixed(2)} seconds to fit the shortest stem.`);
        if (Math.max(...plans.map(plan => plan.sourceDuration)) - Math.min(...plans.map(plan => plan.sourceDuration)) > 0.05) {
          warnings.push('Stem lengths differ. All tracks use the same source start time and stop or loop together at the shortest selected range. Check that these files share a common timeline.');
        }
        const buffers = [];
        let heldBytes = 0;
        for (let index = 0; index < plans.length; index++) {
          const plan = plans[index];
          if (options.onProgress) options.onProgress({ phase: 'decode', index, total: plans.length, fraction: 0.5 + index / (2 * plans.length), id: plan.id, name: plan.file.name });
          let buffer;
          if (plan.info) {
            const decoded = await decodeWavExcerpt(context, plan.file, plan.info, start, duration, heldBytes);
            buffer = decoded.buffer;
            if (decoded.repaired) warnings.push(`“${plan.file.name}”: replaced ${decoded.repaired} invalid floating-point samples with silence.`);
          } else {
            // decodeAudioData resamples to this context's rate. Reserve for 32 channels
            // because browser metadata does not reliably expose the channel count.
            const upperFullBytes = Math.ceil((plan.sourceDuration + 1) * context.sampleRate) * MAX_CHANNELS * 4;
            const upperExcerptBytes = Math.ceil(duration * context.sampleRate) * MAX_CHANNELS * 4;
            checkBudget(heldBytes + upperFullBytes + upperExcerptBytes + plan.file.size,
              `Decoding “${plan.file.name}”; convert long compressed recordings to PCM WAV`);
            const raw = await plan.file.arrayBuffer();
            assertCurrent();
            let full;
            try { full = await context.decodeAudioData(raw); }
            catch (_) { throw new Error(`Could not decode “${plan.file.name}”. Export PCM WAV for reliable local playback.`); }
            assertCurrent();
            if (full.numberOfChannels > MAX_CHANNELS || Math.abs(full.duration - plan.sourceDuration) > 1) {
              throw new Error(`“${plan.file.name}” has unexpected audio metadata. Export PCM WAV first.`);
            }
            const offset = Math.floor(start * full.sampleRate);
            const frames = Math.min(Math.ceil(duration * full.sampleRate), full.length - offset);
            if (frames < 1) throw new Error(`The requested excerpt is outside “${plan.file.name}”.`);
            checkBudget(heldBytes + full.length * full.numberOfChannels * 4 + frames * full.numberOfChannels * 4, 'Decoded audio');
            buffer = context.createBuffer(full.numberOfChannels, frames, full.sampleRate);
            for (let channel = 0; channel < full.numberOfChannels; channel++) {
              buffer.getChannelData(channel).set(full.getChannelData(channel).subarray(offset, offset + frames));
            }
            full = null;
          }
          assertCurrent();
          heldBytes += buffer.length * buffer.numberOfChannels * 4;
          buffers.push({ id: plan.id, buffer });
        }
        assertCurrent();
        // A sub-sample metadata discrepancy can only shorten the shared duration.
        const actualDuration = Math.min(duration, ...buffers.map(track => track.buffer.duration));
        this._install(buffers, actualDuration);
        if (options.onProgress) options.onProgress({ phase: 'ready', index: plans.length, total: plans.length, fraction: 1 });
        return { duration: actualDuration, tracks: buffers.map(({ id, buffer }) =>
          trackMetadata(id, buffer, actualDuration)), warnings };
      } catch (error) {
        if (generation === this._loadGeneration) this._clear();
        throw error;
      } finally {
        if (generation === this._loadGeneration) this._loading = false;
      }
    }

    async loadDemo() {
      ++this._loadGeneration;
      this._clear();
      this._loading = false;
      const context = this._ensureContext();
      const duration = 24;
      const sampleRate = 24000;
      const ids = ['vln1', 'vln2', 'vla', 'vc', 'cb', 'fl', 'ob', 'cl', 'bn', 'hn', 'trp', 'timp'];
      const pitches = [72, 67, 60, 48, 36, 79, 74, 67, 48, 55, 60, 36];
      const chord = [0, 0, 5, 5, 7, 7, 0, 0];
      const buffers = ids.map((id, part) => {
        const buffer = context.createBuffer(1, sampleRate * duration, sampleRate);
        const samples = buffer.getChannelData(0);
        for (let frame = 0; frame < samples.length; frame++) {
          const t = frame / sampleRate;
          const beat = Math.floor(t / 0.75);
          const section = Math.floor(t / 3) % chord.length;
          const isWind = part >= 5 && part <= 8;
          const noteDuration = part === 11 ? 1.5 : isWind ? 0.75 : 1.5;
          const local = t % noteDuration;
          const rest = isWind && ((beat + part) % 6 === 0);
          const envelope = rest ? 0 : Math.min(1, local / 0.045) * Math.min(1, (noteDuration - local) / 0.14);
          const melody = isWind ? [0, 2, 4, 7][(beat + part) % 4] : 0;
          const hz = 440 * Math.pow(2, (pitches[part] + chord[section] + melody - 69) / 12);
          const phase = 2 * Math.PI * hz * t;
          const vibrato = part < 5 ? 0.035 * Math.sin(2 * Math.PI * 5.1 * t) : 0;
          const fundamental = Math.sin(phase + vibrato);
          const harmonics = part === 5 ? 0.08 * Math.sin(2 * phase) :
            0.23 * Math.sin(2 * phase) + 0.11 * Math.sin(3 * phase);
          samples[frame] = part === 11 ?
            0.13 * Math.exp(-local * 8) * (Math.sin(phase) + 0.32 * Math.sin(phase * 1.47)) :
            0.065 * envelope * (fundamental + harmonics) * (0.8 + 0.2 * Math.sin(t * 0.8 + part));
        }
        return { id, buffer };
      });
      this._install(buffers, duration);
      return { duration, tracks: buffers.map(({ id, buffer }) => trackMetadata(id, buffer, duration)),
        warnings: ['Generated demonstration tones — not an orchestral recording.'] };
    }

    _schedule() {
      this._stopSources();
      const context = this._context;
      const when = context.currentTime + 0.04;
      this._startedAt = when;
      this._playing = true;
      for (const track of this._tracks.values()) {
        const source = context.createBufferSource();
        source.buffer = track.buffer;
        source.loop = this._loop;
        source.loopStart = 0;
        source.loopEnd = this._duration;
        source.connect(track.gain);
        source.start(when, this._offset);
        if (!this._loop) source.stop(when + this._duration - this._offset);
        this._sources.push(source);
      }
      if (!this._loop) {
        // Use the audio clock, not a wall-clock timeout, to detect the end after
        // browser suspension or a background tab. Timer is only a polling trigger.
        const checkEnd = () => {
          if (!this._playing || this._loop) return;
          if (this.currentTime >= this._duration) {
            this._offset = this._duration;
            this._playing = false;
            this._stopSources();
            if (typeof this.onended === 'function') this.onended();
          } else this._endTimer = setTimeout(checkEnd, 100);
        };
        this._endTimer = setTimeout(checkEnd, 100);
      }
    }

    async play() {
      if (this._loading) throw new Error('Wait for the audio excerpt to finish loading.');
      if (!this._tracks.size) throw new Error('Load audio stems or the generated demo first.');
      if (this._playing) return;
      const generation = this._loadGeneration;
      const request = ++this._playRequest;
      await this._context.resume();
      if (generation !== this._loadGeneration || request !== this._playRequest || !this._tracks.size) return;
      if (this._playing) return;
      if (this._offset >= this._duration) this._offset = 0;
      this._schedule();
    }

    pause() {
      ++this._playRequest;
      this._offset = this.currentTime;
      this._playing = false;
      this._stopSources();
    }

    stop() {
      this.pause();
      this._offset = 0;
    }

    seek(seconds) {
      const playing = this._playing;
      this.pause();
      this._offset = clamp(finite(seconds, 0), 0, this._duration);
      if (playing) {
        if (this._offset >= this._duration && this._loop) this._offset = 0;
        if (this._offset < this._duration) this._schedule();
      }
    }

    setGain(id, db) {
      const track = this._tracks.get(id);
      if (!track) return;
      const value = finite(db, 0);
      track.db = value <= -100 ? -100 : clamp(value, -60, 18);
      updateGain(track.gain.gain, track.db === -100 ? 0 : dbToGain(track.db),
        this._context.currentTime, this._playing);
    }

    setMaster(db) {
      this._masterDb = clamp(finite(db, -12), -60, 6);
      if (this._master) updateGain(this._master.gain, dbToGain(this._masterDb),
        this._context.currentTime, this._playing);
    }

    setLoop(enabled) {
      const next = Boolean(enabled);
      if (next === this._loop) return;
      const playing = this._playing;
      this.pause();
      this._loop = next;
      if (playing && this._offset < this._duration) this._schedule();
    }

    levels() {
      const result = Object.create(null);
      for (const [id, track] of this._tracks) {
        if (!this._playing) { result[id] = 0; continue; }
        track.analyser.getFloatTimeDomainData(track.meter);
        let sum = 0;
        for (const sample of track.meter) sum += sample * sample;
        result[id] = Math.min(1, Math.sqrt(sum / track.meter.length));
      }
      return result;
    }

    dispose() {
      ++this._loadGeneration;
      this._loading = false;
      this._clear();
      if (this._master) this._master.disconnect();
      if (this._context) this._context.close();
      this._context = null;
      this._master = null;
    }
  }

  global.OrchAudioEngine = OrchAudioEngine;
  global.OrchAudioHelpers = Object.freeze({ parseWav, decodeWavExcerpt, MEMORY_BUDGET });
})(typeof window !== 'undefined' ? window : globalThis);
