(function () {
  'use strict';
  const M = window.OrchModel;
  const MIDI_SLOTS = window.OrchMidi.SLOT_COUNT;
  const MIDI_ACTION_LABELS = { playPause: 'Play / pause', allOff: 'All off / restore', randomInstrument: 'Random instrument' };
  const $ = id => document.getElementById(id);
  const engine = new window.OrchAudioEngine();
  const library = new window.OrchLibrary();
  let midi, pendingPlay = null;
  const state = {
    tracks: [], loaded: false, demo: false, challenge: false, revealed: false,
    referenceListening: false, refs: {}, offsets: {}, controls: {}, muted: new Set(), solo: new Set(), muteSnapshot: null,
    activeIds: [], title: '', excerpt: { start: 0, duration: 30 }, cards: new Map(), regions: new Map(), selectedId: null,
    files: [], pending: [], manifest: null, manifestBase: '', explicitManifest: false, selectionToken: 0, loading: false, loop: true,
    mystery: false, answerRevealed: false, libraryEntries: [], selectedLibraryId: '', midiBank: 0
  };
  const familyLabels = { strings: 'Strings', woodwinds: 'Woodwinds', brass: 'Brass', percussion: 'Percussion / harp' };
  const fmt = seconds => { const n = Math.max(0, Math.floor(seconds || 0)); return Math.floor(n / 60) + ':' + String(n % 60).padStart(2, '0'); };
  const dbText = n => (n > 0 ? '+' : '') + n.toFixed(1) + ' dB';
  const clamp = (n, min, max) => Math.max(min, Math.min(max, n));
  function status(message, error) { $('status').textContent = message; $('status').style.color = error ? '#efb087' : ''; }
  function openDialog(id) { if (!$(id).open) $(id).showModal(); }
  function currentGain(track) { return clamp(state.challenge ? state.refs[track.id] + state.offsets[track.id] + state.controls[track.id] : state.controls[track.id], -60, 18); }
  function actualGains() { return Object.fromEntries(state.tracks.map(t => [t.id, currentGain(t)])); }
  function score() { return M.scoreBalance(actualGains(), state.refs, state.activeIds); }
  function isSilent(id) { return !state.referenceListening && (state.muted.has(id) || (state.solo.size > 0 && !state.solo.has(id))); }
  function renderInstrumentActions() {
    const allMuted = state.loaded && state.tracks.every(t => isSilent(t.id));
    $('all-off').textContent = allMuted ? state.muteSnapshot ? 'Restore instruments' : 'All on' : 'All off';
    $('all-off').setAttribute('aria-pressed', String(allMuted));
    $('all-off').title = allMuted ? state.muteSnapshot ? 'Restore the instrument selection before All off' : 'Turn all instruments on' : 'Mute all instruments and remember the current selection';
    $('random-instrument').disabled = !state.loaded || state.loading || !state.tracks.some(t => isSilent(t.id));
  }
  function applyGains() {
    if (!state.loaded) return;
    for (const t of state.tracks) {
      const silent = isSilent(t.id);
      engine.setGain(t.id, silent ? -100 : state.referenceListening ? state.refs[t.id] : currentGain(t));
      state.cards.get(t.id)?.element.classList.toggle('muted', Boolean(silent));
      state.regions.get(t.id)?.classList.toggle('muted', Boolean(silent));
      state.regions.get(t.id)?.setAttribute('aria-pressed', String(!silent));
    }
  }
  function renderReadouts() {
    renderInstrumentActions();
    $('set-reference').disabled = !state.loaded || state.loading || state.referenceListening || state.muted.size > 0 || state.solo.size > 0;
    $('set-reference').title = state.referenceListening ? 'Return to your mix before setting a reference' : (state.muted.size || state.solo.size) ? 'Clear mute and solo to set the complete reference mix' : 'Use the current complete mix as the reference';
    const result = state.challenge && state.revealed ? score() : null;
    for (const t of state.tracks) {
      const ui = state.cards.get(t.id);
      if (!ui) continue;
      ui.wheel.value = state.controls[t.id] ?? 0;
      ui.value.className = 'instrument-value';
      if (!state.loaded) ui.value.textContent = '—';
      else if (state.referenceListening) ui.value.textContent = 'REFERENCE';
      else if (state.challenge && !state.revealed) ui.value.textContent = 'LISTEN & ADJUST';
      else if (result) {
        const err = result.errors[t.id];
        ui.value.textContent = err === undefined ? 'SILENT EXCERPT' : Math.abs(err) < .05 ? 'IN BALANCE' : dbText(err) + (err > 0 ? ' · louder' : ' · softer');
        if (err !== undefined) ui.value.classList.add(Math.abs(err) < 1 ? 'error-close' : err > 0 ? 'error-high' : 'error-low');
      } else ui.value.textContent = dbText(currentGain(t));
      ui.value.title = state.challenge && state.revealed ? 'Your gain: ' + dbText(currentGain(t)) + ' · Reference: ' + dbText(state.refs[t.id]) + ' · Displayed error excludes the common volume offset.' : '';
      ui.wheel.setAttribute('aria-valuetext', state.challenge && !state.revealed ? 'Adjustment ' + dbText(Number(ui.wheel.value)) + '; target hidden' : ui.value.textContent);
      ui.wheel.disabled = !state.loaded || state.loading || state.referenceListening;
      ui.mute.disabled = !state.loaded || state.loading;
      ui.solo.disabled = !state.loaded || state.loading || state.referenceListening;
      ui.mute.classList.toggle('active', state.muted.has(t.id));
      ui.mute.setAttribute('aria-pressed', String(state.muted.has(t.id)));
      ui.solo.classList.toggle('active', state.solo.has(t.id));
      ui.solo.setAttribute('aria-pressed', String(state.solo.has(t.id)));
    }
    $('score').hidden = !result;
    if (result) $('score').textContent = result.count < 2 ? 'Not enough active parts' : result.score + '% · ' + result.meanAbsoluteError.toFixed(1) + ' dB mean error';
  }
  function leaveReferenceAndSolo() {
    if (state.referenceListening) { state.muted.clear(); state.solo.clear(); }
    // Turn a solo selection into ordinary mutes before toggling a region.
    // This preserves which other parts can currently be heard.
    if (state.solo.size) {
      for (const t of state.tracks) if (!state.solo.has(t.id)) state.muted.add(t.id);
      state.solo.clear();
    }
    state.referenceListening = false;
  }
  function toggleTrack(id) {
    if (!state.loaded || state.loading) return;
    state.muteSnapshot = null;
    leaveReferenceAndSolo();
    if (state.muted.has(id)) state.muted.delete(id); else state.muted.add(id);
    selectTrack(id, false); applyGains(); refreshMode();
  }
  function allOff() {
    if (!state.loaded || state.loading) return;
    if (state.tracks.every(t => isSilent(t.id))) {
      const previous = state.muteSnapshot;
      state.muted = new Set(previous?.muted || []); state.solo = new Set(previous?.solo || []);
      state.referenceListening = previous?.referenceListening || false;
      state.muteSnapshot = null;
      status(previous ? 'Previous instrument selection restored. Fader levels are unchanged.' : 'All instruments on. Fader levels are unchanged.');
    } else {
      state.muteSnapshot = { muted: new Set(state.muted), solo: new Set(state.solo), referenceListening: state.referenceListening };
      state.referenceListening = false; state.solo.clear();
      state.tracks.forEach(t => state.muted.add(t.id));
      status('All instruments off. Press again to restore the selection, or bring in individual parts.');
    }
    applyGains(); refreshMode();
  }
  function randomInstrument() {
    if (!state.loaded || state.loading) return;
    const candidates = state.tracks.filter(t => isSilent(t.id));
    if (!candidates.length) return;
    const track = candidates[Math.floor(Math.random() * candidates.length)];
    state.muteSnapshot = null;
    leaveReferenceAndSolo(); state.muted.delete(track.id);
    selectTrack(track.id, false); applyGains(); refreshMode();
    status('One more instrument is on. Fader levels are unchanged.');
  }
  function svgNode(tag, attributes, text) {
    const node = document.createElementNS('http://www.w3.org/2000/svg', tag);
    for (const [name, value] of Object.entries(attributes || {})) node.setAttribute(name, value);
    if (text !== undefined) node.textContent = text;
    return node;
  }
  function selectTrack(id, focus) {
    state.selectedId = id;
    for (const [key, ui] of state.cards) ui.element.classList.toggle('selected', key === id);
    for (const [key, region] of state.regions) region.classList.toggle('selected', key === id);
    if (focus) {
      const ui = state.cards.get(id);
      ui?.element.scrollIntoView({ block: 'nearest', inline: 'center', behavior: 'auto' });
      ui?.wheel.focus({ preventScroll: true });
    }
  }
  function renderStage() {
    const tracks = state.loaded ? state.tracks : M.DEFAULT_TRACKS;
    const layout = window.OrchLayout.calculate(tracks);
    const byId = new Map(tracks.map(t => [t.id, t]));
    const sorted = layout.map(area => byId.get(area.id));
    $('instrument-cards').replaceChildren(); state.cards.clear();
    $('orchestra-regions').replaceChildren(); state.regions.clear();
    $('mixer-count').textContent = tracks.length + (tracks.length === 1 ? ' channel' : ' channels');
    $('instrument-cards').style.setProperty('--channels', tracks.length);
    for (const [index, area] of layout.entries()) {
      const t = byId.get(area.id);
      const group = svgNode('g', { class: 'orchestra-region ' + t.family, 'data-track': t.id, role: 'button', tabindex: state.loaded ? 0 : -1, 'aria-label': t.name + ' — sound on / off · ' + window.OrchInstruments.countCaption(t), 'aria-disabled': String(!state.loaded), 'aria-pressed': 'true' });
      group.append(svgNode('title', {}, t.name + ' · ' + window.OrchInstruments.countCaption(t) + ' · click to turn sound on / off'));
      const points = area.points.map(p => p.map(n => n.toFixed(2)).join(',')).join(' ');
      group.append(svgNode('polygon', { points, class: 'region-base' }), svgNode('polygon', { points, class: 'region-light' }));
      const clipId = 'region-clip-' + index;
      const clip = svgNode('clipPath', { id: clipId }); clip.append(svgNode('polygon', { points })); group.append(clip);
      const musicians = window.OrchInstruments.render(area, t, document, { compact: tracks.length > 24 });
      musicians.setAttribute('clip-path', 'url(#' + clipId + ')'); group.append(musicians);
      const labelWrap = svgNode('g', { 'clip-path': 'url(#' + clipId + ')' });
      const label = svgNode('text', { x: area.label.x, y: area.label.y, 'data-x': area.label.x, 'data-y': area.label.y, class: 'region-label', 'aria-hidden': 'true' });
      const name = t.name.length > 23 ? t.name.slice(0, 21) + '…' : t.name;
      // Two lines keep labels legible in the narrower outer sections.
      const words = name.split(' '); let lines = [name];
      if (name.length > 12 && words.length > 1) {
        let first = ''; while (words.length > 1 && first.length < name.length / 2 - 2) first += (first ? ' ' : '') + words.shift();
        lines = [first, words.join(' ')];
      }
      for (const [i, line] of lines.entries()) label.append(svgNode('tspan', { x: area.label.x, dy: i === 0 ? (lines.length > 1 ? -4 : 2) : 15 }, line));
      if (tracks.length > 24) { label.replaceChildren(svgNode('tspan', { x: area.label.x, dy: 4 }, String(index + 1).padStart(2, '0'))); }
      else label.append(svgNode('tspan', { x: area.label.x, dy: 17, class: 'region-number' }, String(index + 1).padStart(2, '0')));
      labelWrap.append(label); group.append(labelWrap); group.classList.toggle('compact', tracks.length > 24);
      const activate = () => toggleTrack(t.id);
      group.addEventListener('click', activate);
      group.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); e.stopPropagation(); activate(); } });
      $('orchestra-regions').append(group); state.regions.set(t.id, group);
    }
    for (const t of sorted) {
      const el = document.createElement('div'); el.className = 'instrument ' + t.family; el.dataset.track = t.id;
      const channel = document.createElement('span'); channel.className = 'channel-number'; channel.textContent = String(sorted.indexOf(t) + 1).padStart(2, '0');
      const label = document.createElement('p'); label.className = 'instrument-label'; label.textContent = t.name; label.title = t.name;
      const controls = document.createElement('div'); controls.className = 'instrument-controls';
      const dynamics = document.createElement('div'); dynamics.className = 'dynamics'; dynamics.setAttribute('aria-hidden', 'true');
      for (const text of ['ff', 'mf', 'pp']) { const span = document.createElement('span'); span.textContent = text; dynamics.append(span); }
      const wrap = document.createElement('div'); wrap.className = 'wheel-wrap';
      const wheel = document.createElement('input'); wheel.type = 'range'; wheel.className = 'wheel fader'; wheel.min = state.challenge ? '-18' : '-48'; wheel.max = state.challenge ? '18' : '12'; wheel.step = '.5'; wheel.value = state.controls[t.id] ?? 0; wheel.disabled = !state.loaded;
      wheel.setAttribute('aria-label', t.name + ' balance');
      wheel.addEventListener('focus', () => selectTrack(t.id, false));
      wheel.addEventListener('input', () => { state.controls[t.id] = Number(wheel.value); if (state.loaded) { applyGains(); renderReadouts(); } });
      wheel.addEventListener('wheel', event => { if (wheel.disabled || event.ctrlKey) return; event.preventDefault(); wheel.value = clamp(Number(wheel.value) + (event.deltaY < 0 ? .5 : -.5), Number(wheel.min), Number(wheel.max)); wheel.dispatchEvent(new Event('input')); }, { passive: false });
      wrap.append(wheel);
      const buttons = document.createElement('div'); buttons.className = 'track-buttons';
      const solo = document.createElement('button'); solo.textContent = 'S'; solo.setAttribute('aria-label', 'Solo ' + t.name); solo.title = 'Solo ' + t.name;
      const mute = document.createElement('button'); mute.textContent = 'M'; mute.setAttribute('aria-label', 'Mute ' + t.name); mute.title = 'Mute ' + t.name;
      solo.disabled = mute.disabled = !state.loaded;
      solo.addEventListener('click', () => { if (state.referenceListening || state.loading) return; state.muteSnapshot = null; if (state.solo.has(t.id)) state.solo.delete(t.id); else state.solo.add(t.id); applyGains(); renderReadouts(); });
      mute.addEventListener('click', () => toggleTrack(t.id));
      buttons.append(solo, mute); controls.append(dynamics, wrap, buttons);
      const value = document.createElement('p'); value.className = 'instrument-value';
      const bar = document.createElement('div'); bar.className = 'energy-bar'; bar.setAttribute('aria-hidden', 'true'); bar.append(document.createElement('i'));
      const learn = document.createElement('button'); learn.className = 'midi-learn'; learn.setAttribute('aria-label', 'MIDI learn ' + t.name);
      learn.addEventListener('click', () => { const index = Array.from(state.cards.keys()).indexOf(t.id); state.midiBank = Math.floor(index / MIDI_SLOTS); midi?.learn(index % MIDI_SLOTS); renderMidi(); });
      el.append(channel, label, controls, value, bar, learn); $('instrument-cards').append(el); state.cards.set(t.id, { element: el, wheel, value, solo, mute, learn });
    }
    $('stage-hint').textContent = 'Click a section to turn it on / off · fader levels stay unchanged';
    sizeMapLabels(); selectTrack(state.selectedId, false); renderReadouts(); renderMidi();
  }
  function sizeMapLabels() {
    const map = $('orchestra-map');
    const scaleX = map.clientWidth ? (map.clientHeight / 540) / (map.clientWidth / 1000) : 1;
    for (const label of map.querySelectorAll('.region-label')) {
      const x = Number(label.dataset.x), y = Number(label.dataset.y);
      label.setAttribute('transform', 'translate(' + x + ' ' + y + ') scale(' + scaleX + ' 1) translate(' + -x + ' ' + -y + ')');
    }
  }
  function refreshMode() {
    document.body.classList.toggle('loaded', state.loaded);
    document.body.classList.toggle('challenge', state.challenge);
    document.body.classList.toggle('revealed', state.revealed);
    $('welcome').hidden = state.loaded;
    $('explore-mode').classList.toggle('active', !state.challenge && !state.mystery); $('explore-mode').setAttribute('aria-pressed', String(!state.challenge && !state.mystery));
    $('challenge-mode').classList.toggle('active', state.challenge); $('challenge-mode').setAttribute('aria-pressed', String(state.challenge));
    $('challenge-mode').disabled = !state.loaded || state.loading || (state.mystery && !state.answerRevealed) || state.activeIds.length < 2;
    $('set-reference').hidden = state.challenge || state.mystery; $('set-reference').disabled = !state.loaded;
    $('reference-button').hidden = state.mystery; $('reset-button').hidden = state.mystery;
    $('reveal-piece').hidden = !state.mystery; $('reveal-piece').disabled = state.answerRevealed || state.loading;
    $('reveal-piece').textContent = state.answerRevealed ? 'Answer revealed' : 'Reveal piece';
    $('scramble-button').hidden = !state.challenge; $('reveal-button').hidden = !state.challenge;
    $('reveal-button').textContent = state.revealed ? 'Hide comparison' : 'Reveal balance';
    $('reference-button').setAttribute('aria-pressed', String(state.referenceListening));
    $('reference-button').textContent = state.referenceListening ? 'Back to your mix' : 'Listen to reference';
    $('reference-button').style.color = state.referenceListening ? 'var(--cream)' : '';
    $('mode-label').textContent = state.mystery ? 'GUESS THE PIECE' : state.challenge ? 'BALANCE CHALLENGE' : 'EXPLORATION';
    $('exercise-instruction').textContent = state.mystery ? 'Bring in one instrument at a time. How soon can you name the piece?' : state.challenge ? 'Recover the reference by ear. The faders start with hidden offsets.' : 'Follow a voice. Shape the balance. Hear the whole.';
    for (const id of ['play-button', 'restart-button', 'seek', 'reference-button', 'reset-button', 'all-off']) $(id).disabled = !state.loaded || state.loading;
    $('save-button').disabled = !state.loaded || state.demo || state.loading || (state.mystery && !state.answerRevealed);
    $('explore-mode').disabled = state.loading;
    for (const id of ['library-button', 'welcome-load', 'pick-files', 'pick-folder', 'pick-session', 'demo-button']) $(id).disabled = state.loading || (state.mystery && !state.answerRevealed);
    for (const id of ['scramble-button', 'reveal-button']) $(id).disabled = state.loading;
    $('reset-button').textContent = state.challenge ? 'Show reference solution' : 'Reset to reference';
    renderReadouts(); renderLibraryControls();
  }
  function renderIdentity() {
    if (!state.loaded) {
      $('piece-title').textContent = 'Mix your orchestra.'; $('piece-subtitle').textContent = 'A seat at the centre of the sound.';
      $('excerpt-label').textContent = 'SELECT AN EXCERPT TO BEGIN'; return;
    }
    const hidden = state.mystery && !state.answerRevealed;
    $('piece-title').textContent = hidden ? 'What is the piece?' : state.title || 'Mix your orchestra.';
    $('piece-subtitle').textContent = hidden ? 'A mystery passage. Start with a single voice.' : state.demo ? 'Generated counterpoint · a sound demo for trying the controls' : 'Local recording · ' + state.tracks.length + ' parts · excerpt from ' + fmt(state.excerpt.start);
    $('excerpt-label').textContent = hidden ? 'MYSTERY EXCERPT' : state.demo ? 'GENERATED DEMO' : 'EXCERPT ' + fmt(state.excerpt.start) + ' – ' + fmt(state.excerpt.start + engine.duration);
  }
  function finishLoad(tracks, info, title, excerpt, demo, mystery) {
    pendingPlay = null;
    state.tracks = tracks; state.loaded = true; state.demo = Boolean(demo); state.title = title; state.excerpt = excerpt;
    state.refs = Object.fromEntries(tracks.map(t => [t.id, t.referenceDb || 0])); state.controls = { ...state.refs };
    state.challenge = false; state.revealed = false; state.referenceListening = false; state.offsets = {};
    state.muted.clear(); state.solo.clear(); state.muteSnapshot = null;
    state.mystery = Boolean(mystery); state.answerRevealed = false; state.midiBank = 0;
    if (state.mystery) tracks.forEach(t => state.muted.add(t.id));
    state.activeIds = tracks.filter(t => info.tracks.find(i => i.id === t.id)?.active !== false).map(t => t.id);
    renderIdentity();
    $('track-count').textContent = tracks.length + ' parts · ' + state.activeIds.length + ' active in excerpt';
    $('time-total').textContent = fmt(info.duration); $('seek').max = info.duration; $('seek').value = 0;
    engine.setMaster(Number($('master-volume').value)); engine.setLoop(state.loop);
    renderStage(); refreshMode(); applyGains();
    status(state.mystery ? 'All parts are off. Click an orchestra section to begin listening.' : info.warnings?.length ? info.warnings.join(' ') : 'Ready. Press play and follow the sound.');
  }
  function setLoading(value) {
    state.loading = value;
    for (const id of ['load-button', 'pick-files', 'pick-folder', 'pick-session', 'demo-button', 'library-button', 'welcome-load']) $(id).disabled = value || (state.mystery && !state.answerRevealed);
    $('load-button').disabled = value || !state.pending.some(t => t.selected);
    $('load-progress').hidden = !value;
    refreshMode(); renderMidi();
  }
  async function demo() {
    if (state.loading) return;
    setLoading(true); engine.stop(); status('Making a small local sound demo…');
    try { const info = await engine.loadDemo(); finishLoad(M.DEFAULT_TRACKS.map(t => ({ ...t, referenceDb: 0 })), info, 'A little counterpoint.', { start: 0, duration: info.duration }, true); }
    catch (error) { state.loaded = false; refreshMode(); status(error.message, true); }
    finally { setLoading(false); }
  }
  async function togglePlay() {
    if (!state.loaded || state.loading) return;
    // A second press can arrive while the audio context is still resuming.
    // Pause cancels that pending start; an older completion cannot clear a new one.
    const request = {};
    try {
      if (engine.isPlaying || pendingPlay) { pendingPlay = null; engine.pause(); }
      else { pendingPlay = request; await engine.play(); }
      updateTransport();
    }
    catch (error) { status(error.message, true); }
    finally { if (pendingPlay === request) pendingPlay = null; }
  }
  function updateTransport() { $('play-button').textContent = engine.isPlaying ? 'Ⅱ' : '▶'; $('play-button').setAttribute('aria-label', engine.isPlaying ? 'Pause' : 'Play'); }
  function challenge() {
    if (!state.loaded || state.loading || (state.mystery && !state.answerRevealed) || state.activeIds.length < 2) return;
    state.mystery = false; renderIdentity();
    state.challenge = true; state.revealed = false; state.referenceListening = false;
    state.offsets = M.randomizedOffsets(state.tracks.map(t => t.id)); state.controls = Object.fromEntries(state.tracks.map(t => [t.id, 0]));
    state.muted.clear(); state.solo.clear(); state.muteSnapshot = null; renderStage(); applyGains(); refreshMode();
    status('Balance the active parts. You can compare with the reference at any time.');
  }
  function explore() {
    if (state.loading) return;
    state.muteSnapshot = null;
    if (state.mystery) { state.mystery = false; renderIdentity(); refreshMode(); setLoading(false); status('Exploration. The current instrument choices and levels are preserved.'); }
    if (!state.challenge) return;
    state.controls = Object.fromEntries(state.tracks.map(t => [t.id, clamp(currentGain(t), -48, 12)]));
    state.challenge = false; state.revealed = false; state.referenceListening = false;
    renderStage(); applyGains(); refreshMode();
  }
  function renderFileList() {
    $('file-list').replaceChildren();
    if (!state.pending.length) { const p = document.createElement('p'); p.className = 'empty-message'; p.textContent = state.manifest ? 'Choose the audio files named in this session.' : 'Your selected instruments will appear here.'; $('file-list').append(p); }
    for (const track of state.pending) {
      const row = document.createElement('div'); row.className = 'file-row'; row.classList.toggle('excluded', !track.selected);
      const include = document.createElement('input'); include.type = 'checkbox'; include.checked = track.selected; include.setAttribute('aria-label', 'Include ' + track.file.name);
      include.addEventListener('change', () => { track.selected = include.checked; row.classList.toggle('excluded', !track.selected); $('load-button').disabled = state.loading || !state.pending.some(t => t.selected); });
      const filename = document.createElement('span'); filename.textContent = track.file.webkitRelativePath || track.file.name; filename.title = filename.textContent;
      const name = document.createElement('input'); name.value = track.name; name.maxLength = 100; name.setAttribute('aria-label', 'Instrument name for ' + track.file.name); name.addEventListener('input', () => { track.name = name.value; });
      const family = document.createElement('select'); family.setAttribute('aria-label', 'Family for ' + track.file.name);
      for (const id of M.FAMILIES) { const opt = document.createElement('option'); opt.value = id; opt.textContent = familyLabels[id]; family.append(opt); } family.value = track.family; family.addEventListener('change', () => { track.family = family.value; });
      const reference = document.createElement('input'); reference.type = 'number'; reference.min = '-48'; reference.max = '12'; reference.step = '.5'; reference.value = track.referenceDb; reference.setAttribute('aria-label', 'Reference dB for ' + track.file.name); reference.title = 'Reference gain in dB; leave at 0 to preserve the source balance'; reference.addEventListener('input', () => { track.referenceDb = Number(reference.value); });
      const seat = document.createElement('select'); seat.setAttribute('aria-label', 'Stage row for ' + track.file.name);
      for (const [id, label] of [['', 'Auto seating'], ['front', 'Front'], ['middle', 'Middle'], ['back', 'Back'], ['rear', 'Rear']]) { const opt = document.createElement('option'); opt.value = id; opt.textContent = label; seat.append(opt); }
      seat.value = track.seat?.row || ''; seat.addEventListener('change', () => { if (seat.value) track.seat = { ...track.seat, row: seat.value }; else delete track.seat; });
      row.append(include, filename, name, family, seat, reference); $('file-list').append(row);
    }
    $('load-button').disabled = state.loading || !state.pending.some(t => t.selected);
  }
  function directoryOf(file) {
    const path = file.webkitRelativePath || '';
    return path.includes('/') ? path.slice(0, path.lastIndexOf('/')) : '';
  }
  function commonDirectory(files) {
    if (!files.length || files.some(file => !file.webkitRelativePath)) return '';
    const parts = files.map(file => directoryOf(file).split('/'));
    return parts[0].filter((part, i) => parts.every(path => path.slice(0, i + 1).join('/') === parts[0].slice(0, i + 1).join('/'))).join('/');
  }
  async function readManifest(file) {
    if (file.size > 1024 * 1024) throw new Error('Session JSON must be smaller than 1 MB. Audio is loaded separately.');
    return M.validateSession(await file.text());
  }
  function showManifest() {
    $('session-title').value = state.manifest.title;
    $('excerpt-start').value = state.manifest.excerpt.start;
    $('excerpt-duration').value = state.manifest.excerpt.duration;
  }
  function resolveManifest() {
    const scoped = base => M.findFiles(state.manifest.tracks.map(t => ({ ...t, file: base ? base + '/' + t.file : t.file })), state.files);
    if (state.manifestBase) {
      const found = scoped(state.manifestBase);
      if (!found.missing.length && !found.ambiguous.length) return found;
      // Older exports included the picker root in every path. Support those
      // only within the selected JSON's folder, then export portable paths.
      const localFiles = state.files.filter(file => file.webkitRelativePath?.startsWith(state.manifestBase + '/'));
      const legacy = M.findFiles(state.manifest.tracks, localFiles);
      return !legacy.missing.length && !legacy.ambiguous.length ? legacy : found;
    }
    const direct = scoped('');
    if (!direct.missing.length && !direct.ambiguous.length) return direct;
    // Standalone JSON may refer to a subfolder. Require one complete matching
    // directory when resolving subfolder paths. Ambiguous matches need a narrower selection.
    const directories = new Set();
    for (const file of state.files) {
      const parts = directoryOf(file).split('/').filter(Boolean);
      for (let i = 1; i <= parts.length; i++) directories.add(parts.slice(0, i).join('/'));
    }
    const matches = [...directories].map(base => ({ base, found: scoped(base) })).filter(({ found }) => !found.missing.length && !found.ambiguous.length);
    if (matches.length === 1) { state.manifestBase = matches[0].base; return matches[0].found; }
    if (matches.length > 1) throw new Error('This session matches more than one folder. Choose only the folder for the intended performance.');
    return direct;
  }
  async function chooseFiles(fileList) {
    const token = ++state.selectionToken;
    const selected = Array.from(fileList);
    state.files = selected.filter(file => M.isAudioFile(file));
    state.pending = []; renderFileList();
    const manifests = selected.filter(file => /\.orchmix\.json$/i.test(file.name));
    state.manifestBase = '';
    if (!state.explicitManifest) state.manifest = null;
    try {
      if (manifests.length > 1 && !state.explicitManifest) throw new Error('Multiple session JSON files found. Use Open session JSON to choose one, or choose a folder containing a single session.');
      if (manifests.length === 1 && !state.explicitManifest) {
        const manifest = await readManifest(manifests[0]);
        if (token !== state.selectionToken) return;
        state.manifest = manifest; state.manifestBase = directoryOf(manifests[0]); showManifest();
      }
    } catch (error) { if (token === state.selectionToken) { state.manifest = null; $('load-message').textContent = error.message; } return; }

    if (!state.files.length) { state.pending = []; renderFileList(); $('load-message').textContent = 'No supported audio found. Extract ZIP / TAR archives before selecting the audio.'; return; }
    if (state.manifest) {
      let found;
      try { found = resolveManifest(); } catch (error) { $('load-message').textContent = error.message; return; }
      if (found.missing.length || found.ambiguous.length) {
        state.pending = [];
        $('load-message').textContent = [found.missing.length ? 'Missing: ' + found.missing.map(t => t.file).join(', ') : '', found.ambiguous.length ? 'Ambiguous filenames: ' + found.ambiguous.map(t => t.file).join(', ') : '', 'Choose the original folder for saved relative paths.'].filter(Boolean).join('\n'); renderFileList(); return;
      }
      state.pending = found.matches.map(t => ({ ...t, selected: true })); $('load-message').textContent = 'Session matched. Instrumentation, seating and reference levels have been restored.';
    } else {
      if (state.files.length > 120) { state.pending = []; renderFileList(); $('load-message').textContent = 'This folder contains many recordings. Choose one piece and one microphone folder, or select the individual stems.'; return; }
      state.pending = state.files.map((file, i) => ({ ...M.inferTrack(file.name, i), file, referenceDb: 0, selected: !/(?:^|[_\s-])(mix(?:ture)?|tutti|reference|master|full|scales?|solos?)(?:[_\s.-]|$)/i.test(file.name) }));
      const names = state.files.map(f => f.name.toLowerCase()); const duplicates = names.filter((n, i) => names.indexOf(n) !== i);
      if (duplicates.length) { state.pending.forEach(t => { if (duplicates.includes(t.file.name.toLowerCase())) t.selected = false; }); }
      if (!$('session-title').value) $('session-title').value = state.files[0].webkitRelativePath?.split('/')[0] || 'My orchestra';
      $('load-message').textContent = duplicates.length ? 'Repeated filenames found. Choose ONE microphone folder (for example Tree or StereoMix), or select only the intended tracks below.' : 'Check the instruments and exclude any full mix. Reference dB defaults to the original stem level.';
    }
    const base = state.manifestBase || commonDirectory(state.pending.map(t => t.file));
    for (const track of state.pending) {
      const path = track.file.webkitRelativePath || track.file.name;
      track.sessionFile = base && path.startsWith(base + '/') ? path.slice(base.length + 1) : path;
    }
    renderFileList();
  }
  async function openSession(file) {
    if (!file) return;
    const token = ++state.selectionToken;
    state.pending = []; renderFileList();
    try {
      const manifest = await readManifest(file);
      if (token !== state.selectionToken) return;
      state.manifest = manifest; state.manifestBase = directoryOf(file); state.explicitManifest = true;
      showManifest(); $('load-message').textContent = 'Settings loaded. Choose the matching audio files or the original folder.';
      if (state.files.length) await chooseFiles(state.files); else renderFileList();
    } catch (error) { if (token === state.selectionToken) { state.manifest = null; state.manifestBase = ''; state.explicitManifest = false; $('load-message').textContent = error.message; } }
  }
  async function loadExcerpt() {
    if (state.loading) return;
    const tracks = state.pending.filter(t => t.selected).map(t => ({ ...t }));
    try {
      const session = M.makeSession($('session-title').value.trim() || 'My orchestra', tracks, { start: Number($('excerpt-start').value), duration: Number($('excerpt-duration').value) });
      setLoading(true); $('load-progress').value = 0; $('load-message').textContent = 'Reading the selected excerpt…'; engine.stop();
      const info = await engine.load(tracks, { startSeconds: session.excerpt.start, durationSeconds: session.excerpt.duration, onProgress: progress => {
        const fraction = typeof progress === 'number' ? progress : progress.fraction ?? ((progress.loaded ?? progress.completed ?? progress.index ?? 0) / (progress.total || tracks.length));
        $('load-progress').value = clamp(fraction, 0, 1);
        if (typeof progress === 'object' && progress.name) $('load-message').textContent = 'Reading ' + progress.name + '…';
      } });
      finishLoad(tracks, info, session.title, session.excerpt, false); $('library-dialog').close();
    } catch (error) {
      if (state.loading) { state.loaded = false; state.tracks = []; renderStage(); refreshMode(); }
      $('load-message').textContent = error.message; status(error.message, true);
    } finally { setLoading(false); }
  }
  function saveSession() {
    if (!state.loaded || state.demo) return;
    try {
      const settings = M.makeSession(state.title, state.tracks.map(t => ({ ...t, file: t.sessionFile || t.file, referenceDb: state.refs[t.id] })), state.excerpt);
      const url = URL.createObjectURL(new Blob([JSON.stringify(settings, null, 2) + '\n'], { type: 'application/json' }));
      const a = document.createElement('a'); a.href = url; a.download = state.title.replace(/[^a-z0-9_-]/gi, '-').slice(0, 80) + '.orchmix.json'; a.click(); setTimeout(() => URL.revokeObjectURL(url), 2000);
      status('Session settings saved. Put the JSON beside the stems; Remember folder keeps that location in your piece list.');
    } catch (error) { status(error.message, true); }
  }
  function resetLoader() {
    state.manifest = null; state.manifestBase = ''; state.explicitManifest = false; state.selectionToken++; state.pending = []; state.files = [];
    $('session-title').value = ''; $('load-message').textContent = ''; $('audio-files').value = ''; $('audio-folder').value = ''; $('session-file').value = '';
    renderFileList();
  }
  function renderLibraryControls() {
    const hidden = state.mystery && !state.answerRevealed;
    $('saved-picker').hidden = hidden; $('hidden-library').hidden = !hidden;
    $('remember-folder').hidden = hidden;
    const select = $('saved-pieces'); select.replaceChildren();
    if (!state.libraryEntries.some(entry => entry.id === state.selectedLibraryId)) state.selectedLibraryId = state.libraryEntries[0]?.id || '';
    if (!state.libraryEntries.length) select.append(new Option('No saved folders yet', ''));
    for (const entry of state.libraryEntries) {
      const suffix = entry.permission === 'granted' ? '' : ' · allow access';
      select.append(new Option((entry.title || entry.name) + suffix, entry.id));
    }
    select.value = state.selectedLibraryId; select.disabled = state.loading || !state.libraryEntries.length;
    $('open-saved').disabled = state.loading || !state.selectedLibraryId;
    $('forget-folder').disabled = state.loading || !state.selectedLibraryId;
    $('remember-folder').disabled = state.loading || !library.supported;
    $('random-excerpt').disabled = state.loading || !state.libraryEntries.length;
    $('random-duration').disabled = state.loading;
    $('library-note').textContent = !library.supported ? 'Remembered folders need desktop Chrome or Edge. You can still use Load stems in this browser.' : library.warning || 'Saved on this browser · open a piece to renew access if requested · keep one .orchmix.json in each folder';
  }
  async function refreshLibrary() {
    try { state.libraryEntries = await library.list(); }
    catch (error) { status('The saved folder list could not be opened. Load stems is still available.', true); }
    renderLibraryControls();
  }
  async function prepareFolder(files) {
    resetLoader(); await chooseFiles(files);
    if (!state.pending.some(t => t.selected)) throw new Error($('load-message').textContent || 'No playable stems found in this folder.');
  }
  async function rememberFolder() {
    if (state.loading) return;
    try {
      const selection = library.add(); // The picker must begin inside this click.
      setLoading(true);
      const entry = await selection; state.selectedLibraryId = entry.id;
      const { files } = await library.read(entry.id);
      await prepareFolder(files);
      if (state.manifest) await library.setTitle(entry.id, state.manifest.title);
      engine.pause(); updateTransport(); openDialog('library-dialog');
      status('Folder remembered. Check the excerpt, then open it.');
    } catch (error) { if (error.name !== 'AbortError') status(error.message, true); }
    finally { await refreshLibrary(); setLoading(false); }
  }
  async function openSaved() {
    if (state.loading || !state.selectedLibraryId) return;
    try {
      const read = library.read(state.selectedLibraryId, { requestPermission: true });
      setLoading(true); status('Opening saved piece…');
      const { entry, files } = await read;
      await prepareFolder(files);
      if (state.manifest) await library.setTitle(entry.id, state.manifest.title);
      await refreshLibrary(); setLoading(false); await loadExcerpt();
    } catch (error) { status(error.message, true); }
    finally { setLoading(false); }
  }
  async function randomExcerpt() {
    if (state.loading) return;
    const wanted = Number($('random-duration').value);
    if (!Number.isFinite(wanted) || wanted < 1 || wanted > 120) { status('Choose an excerpt length between 1 and 120 seconds.', true); return; }
    let replacingAudio = false;
    try {
      const unlocked = engine.unlock(); // Resume audio before the click activation expires.
      setLoading(true); engine.stop(); updateTransport();
      $('piece-title').textContent = 'Choosing a mystery…'; status('Finding a passage in your accessible saved pieces…');
      await unlocked;
      const entries = await library.available();
      if (!entries.length) throw new Error('permission');
      const entry = entries[Math.floor(Math.random() * entries.length)];
      const { files } = await library.read(entry.id);
      await prepareFolder(files);
      if (!state.manifest) throw new Error('manifest');
      const tracks = state.pending.filter(t => t.selected).map(t => ({ ...t }));
      const source = await engine.inspect(tracks);
      const duration = Math.floor(Math.min(wanted, source.duration, source.maxExcerptDuration) * 1000) / 1000;
      if (duration < 1) throw new Error('short');
      const start = Math.floor(Math.random() * (Math.floor(Math.max(0, source.duration - duration)) + 1));
      const excerpt = { start, duration };
      M.makeSession(state.manifest.title, tracks, excerpt);
      replacingAudio = true;
      const info = await engine.load(tracks, { startSeconds: start, durationSeconds: duration });
      state.selectedLibraryId = entry.id;
      finishLoad(tracks, info, state.manifest.title, excerpt, false, true);
      // Mute gains are installed before the sources are ever started.
      try {
        await engine.play(); updateTransport();
        status('The mystery is playing silently. Click a section to bring in its sound.' + (duration < wanted ? ' This excerpt was shortened to fit the piece and memory budget.' : ''));
      } catch (_) { status('The mystery is ready with all parts off. Press Play, then click a section to bring it in.'); }
    } catch (error) {
      if (replacingAudio) { state.loaded = false; state.tracks = []; state.title = ''; state.mystery = false; state.answerRevealed = false; renderStage(); }
      renderIdentity();
      // Source filenames and decoder messages can contain the answer.
      status(error.message === 'permission' ? 'Open a saved piece once to allow folder access, then try Random excerpt again.' : error.message === 'manifest' ? 'Random excerpts need one .orchmix.json in each remembered folder. Save session settings beside the stems first.' : 'Could not open a random excerpt. Open your saved pieces to check their session JSON and audio; long recordings should be PCM WAV.', true);
    } finally { setLoading(false); }
  }
  function renderMidi() {
    if (!midi) return;
    const info = midi.state;
    const count = state.cards.size;
    state.midiBank = clamp(state.midiBank, 0, Math.max(0, Math.ceil(count / MIDI_SLOTS) - 1));
    const bank = $('midi-bank'); bank.replaceChildren();
    for (let i = 0; i < Math.ceil(count / MIDI_SLOTS); i++) bank.append(new Option((i * MIDI_SLOTS + 1) + '–' + Math.min(count, (i + 1) * MIDI_SLOTS), String(i)));
    bank.value = String(state.midiBank); bank.disabled = state.loading;
    $('midi-connect').disabled = !info.supported || info.connecting || info.connected;
    $('midi-connect').textContent = info.connecting ? 'Connecting…' : info.connected ? 'MIDI connected' : 'Connect MIDI';
    $('midi-cancel').hidden = info.learning === null && info.learningAction === null;
    $('midi-clear').disabled = !info.mappings.some(Boolean) && !Object.values(info.actionMappings).some(Boolean);
    $('midi-status').textContent = info.error || (!info.supported ? 'Web MIDI needs a supported browser such as Chrome or Edge on a secure local address.' : info.learningAction !== null ? 'Press a controller button to learn ' + MIDI_ACTION_LABELS[info.learningAction] + '…' : info.learning !== null ? 'Move a fader or knob to learn control ' + (info.learning + 1) + '…' : info.connected ? info.inputs.length ? info.inputs.map(input => input.name).join(', ') : 'MIDI enabled. Plug in your controller.' : 'Connect your controller, then learn a volume control or an action.') + (info.storageAvailable ? '' : ' Mappings cannot be saved in this browser session.');
    for (const [action, label] of Object.entries(MIDI_ACTION_LABELS)) {
      const mapping = info.actionMappings[action], learning = info.learningAction === action;
      const button = $('midi-learn-' + action);
      button.disabled = !info.connected || state.loading;
      button.textContent = learning ? 'Press button…' : mapping ? 'CC ' + mapping.controller + ' · relearn' : 'Learn';
      button.title = mapping ? label + ': MIDI channel ' + (mapping.channel + 1) + ', CC ' + mapping.controller : 'Assign a MIDI button to ' + label;
      $('midi-clear-' + action).disabled = !mapping;
    }
    for (const [index, ui] of Array.from(state.cards.values()).entries()) {
      const slot = index % MIDI_SLOTS, active = Math.floor(index / MIDI_SLOTS) === state.midiBank;
      const map = info.mappings[slot];
      ui.learn.hidden = $('midi-panel').hidden;
      ui.learn.disabled = !info.connected || state.loading;
      ui.learn.textContent = active && info.learning === slot ? 'Move control…' : active && map ? 'CC ' + map.controller + ' · relearn' : active ? 'Learn ' + (slot + 1) : 'Bank ' + (Math.floor(index / MIDI_SLOTS) + 1) + ' · learn';
      ui.learn.title = map ? 'Hardware control ' + (slot + 1) + ', MIDI channel ' + (map.channel + 1) + ', CC ' + map.controller : 'Map a hardware fader or knob to control ' + (slot + 1) + ' in the bank';
      ui.element.classList.toggle('midi-active', active && info.connected && !$('midi-panel').hidden);
    }
  }
  function openLibrary() {
    if (state.loading || (state.mystery && !state.answerRevealed)) return;
    engine.pause(); updateTransport(); resetLoader(); openDialog('library-dialog');
  }
  $('remember-folder').addEventListener('click', rememberFolder);
  $('open-saved').addEventListener('click', openSaved);
  $('saved-pieces').addEventListener('change', e => { state.selectedLibraryId = e.target.value; renderLibraryControls(); });
  $('forget-folder').addEventListener('click', async () => { if (state.loading) return; try { await library.remove(state.selectedLibraryId); await refreshLibrary(); status('Folder removed from the list. The audio files are unchanged.'); } catch (error) { status(error.message, true); } });
  $('random-excerpt').addEventListener('click', randomExcerpt);
  $('reveal-piece').addEventListener('click', () => { state.answerRevealed = true; renderIdentity(); refreshMode(); status('Answer revealed. Your instrument choices and fader levels are unchanged.'); });
  $('all-off').addEventListener('click', allOff);
  $('random-instrument').addEventListener('click', randomInstrument);
  for (const action of Object.keys(MIDI_ACTION_LABELS)) {
    $('midi-learn-' + action).addEventListener('click', () => midi.learnAction(action));
    $('midi-clear-' + action).addEventListener('click', () => midi.clearAction(action));
  }
  $('midi-toggle').addEventListener('click', () => { $('midi-panel').hidden = !$('midi-panel').hidden; $('midi-toggle').setAttribute('aria-expanded', String(!$('midi-panel').hidden)); if ($('midi-panel').hidden) midi.cancelLearn(); renderMidi(); });
  $('midi-connect').addEventListener('click', () => midi.connect());
  $('midi-bank').addEventListener('change', e => { state.midiBank = Number(e.target.value); midi.cancelLearn(); renderMidi(); });
  $('midi-cancel').addEventListener('click', () => midi.cancelLearn());
  $('midi-clear').addEventListener('click', () => midi.clear());
  $('library-button').addEventListener('click', openLibrary); $('welcome-load').addEventListener('click', openLibrary);
  $('sources-button').addEventListener('click', () => openDialog('sources-dialog')); $('help-button').addEventListener('click', () => openDialog('help-dialog'));
  document.querySelectorAll('[data-close]').forEach(button => button.addEventListener('click', () => { if (!state.loading) $(button.dataset.close).close(); }));
  $('library-dialog').addEventListener('cancel', e => { if (state.loading) e.preventDefault(); });
  $('demo-button').addEventListener('click', demo); $('play-button').addEventListener('click', togglePlay);
  $('restart-button').addEventListener('click', () => { engine.seek(0); updateTransport(); });
  $('seek').addEventListener('input', e => { engine.seek(Number(e.target.value)); });
  $('master-volume').addEventListener('input', e => { engine.setMaster(Number(e.target.value)); $('master-value').textContent = e.target.value + ' dB'; });
  $('loop-button').addEventListener('click', () => { state.loop = !state.loop; engine.setLoop(state.loop); $('loop-button').classList.toggle('active', state.loop); $('loop-button').setAttribute('aria-pressed', String(state.loop)); });
  $('reference-button').addEventListener('click', () => { state.muteSnapshot = null; state.referenceListening = !state.referenceListening; applyGains(); refreshMode(); });
    $('set-reference').addEventListener('click', () => { if (state.referenceListening || state.muted.size || state.solo.size) return; state.refs = actualGains(); applyGains(); status('Your current balance is now the reference. Save session settings to keep it.'); });
  $('challenge-mode').addEventListener('click', () => { if (!state.challenge) challenge(); }); $('scramble-button').addEventListener('click', challenge); $('explore-mode').addEventListener('click', explore);
  $('reveal-button').addEventListener('click', () => { state.revealed = !state.revealed; state.referenceListening = false; state.muteSnapshot = null; state.muted.clear(); state.solo.clear(); applyGains(); refreshMode(); if (state.revealed) status('Comparison uses relative balance across active parts; a common volume offset is ignored.'); });
  $('reset-button').addEventListener('click', () => {
    state.controls = Object.fromEntries(state.tracks.map(t => [t.id, state.challenge ? -state.offsets[t.id] : state.refs[t.id]]));
    state.muted.clear(); state.solo.clear(); state.referenceListening = false; state.muteSnapshot = null; if (state.challenge) state.revealed = true;
    applyGains(); refreshMode(); status('Reference balance restored.');
  });
  $('save-button').addEventListener('click', saveSession);
  $('pick-files').addEventListener('click', () => $('audio-files').click()); $('pick-folder').addEventListener('click', () => $('audio-folder').click()); $('pick-session').addEventListener('click', () => $('session-file').click());
  $('audio-files').addEventListener('change', e => chooseFiles(e.target.files)); $('audio-folder').addEventListener('change', e => chooseFiles(e.target.files)); $('session-file').addEventListener('change', e => openSession(e.target.files[0])); $('load-button').addEventListener('click', loadExcerpt);
  const drop = $('drop-zone');
  drop.addEventListener('dragover', event => { event.preventDefault(); if (!state.loading) drop.classList.add('dragover'); }); drop.addEventListener('dragleave', () => drop.classList.remove('dragover'));
  drop.addEventListener('drop', event => { event.preventDefault(); drop.classList.remove('dragover'); if (!state.loading) chooseFiles(event.dataTransfer.files); });
  window.addEventListener('dragover', e => { if (e.dataTransfer.types.includes('Files')) e.preventDefault(); });
  window.addEventListener('drop', e => { if (e.dataTransfer.types.includes('Files')) e.preventDefault(); });
  $('fullscreen-button').addEventListener('click', async () => { try { if (document.fullscreenElement) await document.exitFullscreen(); else await document.documentElement.requestFullscreen(); } catch (_) { status('Fullscreen is unavailable here. You can still maximize the browser window.'); } });
  document.addEventListener('keydown', e => { if (e.code === 'Space' && !/INPUT|SELECT|TEXTAREA|BUTTON/.test(e.target.tagName) && !document.querySelector('dialog[open]')) { e.preventDefault(); togglePlay(); } });
  engine.onended = updateTransport;
  let lastFrame = 0;
  function animate(now) {
    if (now - lastFrame > 45) {
      lastFrame = now;
      if (state.loaded) {
        const levels = engine.levels();
        for (const [id, ui] of state.cards) { const value = engine.isPlaying ? Math.min(1, Math.sqrt(levels[id] || 0) * 2.5) : 0; const energy = value.toFixed(3); ui.element.style.setProperty('--energy', energy); state.regions.get(id)?.style.setProperty('--energy', energy); }
        if (document.activeElement !== $('seek')) $('seek').value = engine.currentTime;
        $('time-current').textContent = fmt(engine.currentTime); updateTransport();
      }
    }
    requestAnimationFrame(animate);
  }
  midi = new window.OrchMidi({ onChange: renderMidi, onAction: ({ action }) => {
    if (!state.loaded || state.loading) return;
    if (action === 'playPause') togglePlay();
    else if (action === 'allOff') allOff();
    else if (action === 'randomInstrument') randomInstrument();
  }, onValue: ({ slot, value }) => {
    if (!state.loaded || state.loading || state.referenceListening) return;
    const [id, ui] = Array.from(state.cards.entries())[state.midiBank * MIDI_SLOTS + slot] || [];
    if (!ui) return;
    const min = Number(ui.wheel.min), max = Number(ui.wheel.max), step = Number(ui.wheel.step);
    state.controls[id] = Math.round((min + value / 127 * (max - min)) / step) * step;
    selectTrack(id, false); applyGains(); renderReadouts();
  } });
  midi.ready.then(() => { if (midi.state.enabled) { $('midi-panel').hidden = false; $('midi-toggle').setAttribute('aria-expanded', 'true'); } renderMidi(); });
  renderStage(); refreshMode(); refreshLibrary();
  new ResizeObserver(sizeMapLabels).observe($('orchestra-map'));
  requestAnimationFrame(animate);
})();
