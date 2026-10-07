(function () {
  'use strict';
  const M = window.OrchModel;
  const $ = id => document.getElementById(id);
  const engine = new window.OrchAudioEngine();
  const state = {
    tracks: [], loaded: false, demo: false, challenge: false, revealed: false,
    referenceListening: false, refs: {}, offsets: {}, controls: {}, muted: new Set(), solo: new Set(),
    activeIds: [], title: '', excerpt: { start: 0, duration: 30 }, cards: new Map(),
    files: [], pending: [], manifest: null, loading: false, loop: true
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
  function applyGains() {
    if (!state.loaded) return;
    for (const t of state.tracks) {
      const silent = !state.referenceListening && (state.muted.has(t.id) || (state.solo.size && !state.solo.has(t.id)));
      engine.setGain(t.id, silent ? -100 : state.referenceListening ? state.refs[t.id] : currentGain(t));
      state.cards.get(t.id)?.element.classList.toggle('muted', Boolean(silent));
    }
  }
  function renderReadouts() {
    $('set-reference').disabled = !state.loaded || state.referenceListening || state.muted.size > 0 || state.solo.size > 0;
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
      ui.wheel.disabled = !state.loaded || state.referenceListening;
      ui.mute.classList.toggle('active', state.muted.has(t.id));
      ui.mute.setAttribute('aria-pressed', String(state.muted.has(t.id)));
      ui.solo.classList.toggle('active', state.solo.has(t.id));
      ui.solo.setAttribute('aria-pressed', String(state.solo.has(t.id)));
    }
    $('score').hidden = !result;
    if (result) $('score').textContent = result.count < 2 ? 'Not enough active parts' : result.score + '% · ' + result.meanAbsoluteError.toFixed(1) + ' dB mean error';
  }
  function positionTracks(tracks) {
    const result = new Map();
    const rows = { strings: [74, 20, 80], woodwinds: [44, 21, 79], brass: [15, 27, 65], percussion: [13, 86, 86] };
    for (const family of M.FAMILIES) {
      const group = tracks.filter(t => t.family === family);
      let [y, min, max] = rows[family];
      if (group.length > 1 && family === 'percussion') { min = 70; max = 93; }
      if (group.length > 3 && family === 'brass') { min = 15; max = 63; }
      group.forEach((t, i) => {
        const x = group.length === 1 ? (min + max) / 2 : min + (max - min) * i / (group.length - 1);
        const arc = family === 'strings' ? 7 * (1 - Math.abs(i - (group.length - 1) / 2) / Math.max(1, (group.length - 1) / 2)) : 0;
        result.set(t.id, { x, y: y + arc });
      });
    }
    return result;
  }
  function renderStage() {
    const tracks = state.loaded ? state.tracks : M.DEFAULT_TRACKS;
    const positions = positionTracks(tracks);
    const many = tracks.length > 16 || M.FAMILIES.some(f => tracks.filter(t => t.family === f).length > (f === 'percussion' ? 2 : 6));
    $('stage').classList.toggle('many', many);
    $('instrument-cards').replaceChildren(); state.cards.clear();
    const sorted = [...tracks].sort((a, b) => M.FAMILIES.indexOf(a.family) - M.FAMILIES.indexOf(b.family));
    for (const t of sorted) {
      const el = document.createElement('div'); el.className = 'instrument ' + t.family; el.dataset.track = t.id;
      const pos = positions.get(t.id); el.style.setProperty('--x', pos.x + '%'); el.style.setProperty('--y', pos.y + '%');
      const label = document.createElement('p'); label.className = 'instrument-label'; label.textContent = t.name; label.title = t.name;
      const controls = document.createElement('div'); controls.className = 'instrument-controls';
      const dynamics = document.createElement('div'); dynamics.className = 'dynamics'; dynamics.setAttribute('aria-hidden', 'true');
      for (const text of ['ff', 'mf', 'pp']) { const span = document.createElement('span'); span.textContent = text; dynamics.append(span); }
      const wrap = document.createElement('div'); wrap.className = 'wheel-wrap';
      const wheel = document.createElement('input'); wheel.type = 'range'; wheel.className = 'wheel'; wheel.min = state.challenge ? '-18' : '-48'; wheel.max = state.challenge ? '18' : '12'; wheel.step = '.5'; wheel.value = state.controls[t.id] ?? 0; wheel.disabled = !state.loaded;
      wheel.setAttribute('aria-label', t.name + ' balance');
      wheel.addEventListener('input', () => { state.controls[t.id] = Number(wheel.value); if (state.loaded) { applyGains(); renderReadouts(); } });
      wheel.addEventListener('wheel', event => { if (wheel.disabled || event.ctrlKey) return; event.preventDefault(); wheel.value = clamp(Number(wheel.value) + (event.deltaY < 0 ? .5 : -.5), Number(wheel.min), Number(wheel.max)); wheel.dispatchEvent(new Event('input')); }, { passive: false });
      wrap.append(wheel);
      const buttons = document.createElement('div'); buttons.className = 'track-buttons';
      const solo = document.createElement('button'); solo.textContent = 'S'; solo.setAttribute('aria-label', 'Solo ' + t.name); solo.title = 'Solo ' + t.name;
      const mute = document.createElement('button'); mute.textContent = 'M'; mute.setAttribute('aria-label', 'Mute ' + t.name); mute.title = 'Mute ' + t.name;
      for (const [button, set] of [[solo, state.solo], [mute, state.muted]]) {
        button.disabled = !state.loaded;
        button.addEventListener('click', () => { if (state.referenceListening) return; if (set.has(t.id)) set.delete(t.id); else set.add(t.id); applyGains(); renderReadouts(); });
      }
      buttons.append(solo, mute); controls.append(dynamics, wrap, buttons);
      const value = document.createElement('p'); value.className = 'instrument-value';
      const bar = document.createElement('div'); bar.className = 'energy-bar'; bar.setAttribute('aria-hidden', 'true'); bar.append(document.createElement('i'));
      el.append(label, controls, value, bar); $('instrument-cards').append(el); state.cards.set(t.id, { element: el, wheel, value, solo, mute });
    }
    renderReadouts();
  }
  function refreshMode() {
    document.body.classList.toggle('loaded', state.loaded);
    document.body.classList.toggle('challenge', state.challenge);
    document.body.classList.toggle('revealed', state.revealed);
    $('welcome').hidden = state.loaded;
    $('explore-mode').classList.toggle('active', !state.challenge); $('explore-mode').setAttribute('aria-pressed', String(!state.challenge));
    $('challenge-mode').classList.toggle('active', state.challenge); $('challenge-mode').setAttribute('aria-pressed', String(state.challenge));
    $('challenge-mode').disabled = !state.loaded || state.activeIds.length < 2;
    $('set-reference').hidden = state.challenge; $('set-reference').disabled = !state.loaded;
    $('scramble-button').hidden = !state.challenge; $('reveal-button').hidden = !state.challenge;
    $('reveal-button').textContent = state.revealed ? 'Hide comparison' : 'Reveal balance';
    $('reference-button').setAttribute('aria-pressed', String(state.referenceListening));
    $('reference-button').textContent = state.referenceListening ? 'Back to your mix' : 'Listen to reference';
    $('reference-button').style.color = state.referenceListening ? 'var(--cream)' : '';
    $('mode-label').textContent = state.challenge ? 'BALANCE CHALLENGE' : 'EXPLORATION';
    $('exercise-instruction').textContent = state.challenge ? 'Recover the reference by ear. The wheels start with hidden offsets.' : 'Turn a wheel. Follow a voice. Hear the whole.';
    for (const id of ['play-button', 'restart-button', 'seek', 'reference-button', 'reset-button']) $(id).disabled = !state.loaded;
    $('save-button').disabled = !state.loaded || state.demo;
    $('reset-button').textContent = state.challenge ? 'Show reference solution' : 'Reset to reference';
    renderReadouts();
  }
  function finishLoad(tracks, info, title, excerpt, demo) {
    state.tracks = tracks; state.loaded = true; state.demo = Boolean(demo); state.title = title; state.excerpt = excerpt;
    state.refs = Object.fromEntries(tracks.map(t => [t.id, t.referenceDb || 0])); state.controls = { ...state.refs };
    state.challenge = false; state.revealed = false; state.referenceListening = false; state.offsets = {};
    state.muted.clear(); state.solo.clear();
    state.activeIds = tracks.filter(t => info.tracks.find(i => i.id === t.id)?.active !== false).map(t => t.id);
    $('piece-title').textContent = title;
    $('piece-subtitle').textContent = demo ? 'Generated counterpoint · a sound demo for trying the controls' : 'Local recording · ' + tracks.length + ' parts · excerpt from ' + fmt(excerpt.start);
    $('track-count').textContent = tracks.length + ' parts · ' + state.activeIds.length + ' active in excerpt';
    $('excerpt-label').textContent = demo ? 'GENERATED DEMO' : 'EXCERPT ' + fmt(excerpt.start) + ' – ' + fmt(excerpt.start + info.duration);
    $('time-total').textContent = fmt(info.duration); $('seek').max = info.duration; $('seek').value = 0;
    engine.setMaster(Number($('master-volume').value)); engine.setLoop(state.loop);
    renderStage(); refreshMode(); applyGains();
    status(info.warnings?.length ? info.warnings.join(' ') : 'Ready. Press play and follow the sound.');
  }
  function setLoading(value) {
    state.loading = value;
    for (const id of ['load-button', 'pick-files', 'pick-folder', 'pick-session', 'demo-button', 'library-button', 'welcome-load']) $(id).disabled = value;
    $('load-button').disabled = value || !state.pending.some(t => t.selected);
    $('load-progress').hidden = !value;
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
    try { if (engine.isPlaying) engine.pause(); else await engine.play(); updateTransport(); }
    catch (error) { status(error.message, true); }
  }
  function updateTransport() { $('play-button').textContent = engine.isPlaying ? 'Ⅱ' : '▶'; $('play-button').setAttribute('aria-label', engine.isPlaying ? 'Pause' : 'Play'); }
  function challenge() {
    if (!state.loaded || state.activeIds.length < 2) return;
    state.challenge = true; state.revealed = false; state.referenceListening = false;
    state.offsets = M.randomizedOffsets(state.tracks.map(t => t.id)); state.controls = Object.fromEntries(state.tracks.map(t => [t.id, 0]));
    state.muted.clear(); state.solo.clear(); renderStage(); applyGains(); refreshMode();
    status('Balance the active parts. You can compare with the reference at any time.');
  }
  function explore() {
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
      row.append(include, filename, name, family, reference); $('file-list').append(row);
    }
    $('load-button').disabled = state.loading || !state.pending.some(t => t.selected);
  }
  function chooseFiles(fileList) {
    state.files = Array.from(fileList).filter(file => M.isAudioFile(file));
    if (!state.files.length) { state.pending = []; renderFileList(); $('load-message').textContent = 'No supported audio found. Extract ZIP / TAR archives before selecting the audio.'; return; }
    if (state.manifest) {
      const found = M.findFiles(state.manifest.tracks, state.files);
      if (found.missing.length || found.ambiguous.length) {
        state.pending = [];
        $('load-message').textContent = [found.missing.length ? 'Missing: ' + found.missing.map(t => t.file).join(', ') : '', found.ambiguous.length ? 'Ambiguous filenames: ' + found.ambiguous.map(t => t.file).join(', ') : '', 'Choose the original folder for saved relative paths.'].filter(Boolean).join('\n'); renderFileList(); return;
      }
      state.pending = found.matches.map(t => ({ ...t, selected: true })); $('load-message').textContent = 'Session matched. Reference levels have been restored.';
    } else {
      if (state.files.length > 120) { state.pending = []; renderFileList(); $('load-message').textContent = 'This folder contains many recordings. Choose one piece and one microphone folder, or select the individual stems.'; return; }
      state.pending = state.files.map((file, i) => ({ ...M.inferTrack(file.name, i), file, referenceDb: 0, selected: !/(?:^|[_\s-])(mix(?:ture)?|tutti|reference|master|full|scales?|solos?)(?:[_\s.-]|$)/i.test(file.name) }));
      const names = state.files.map(f => f.name.toLowerCase()); const duplicates = names.filter((n, i) => names.indexOf(n) !== i);
      if (duplicates.length) { state.pending.forEach(t => { if (duplicates.includes(t.file.name.toLowerCase())) t.selected = false; }); }
      if (!$('session-title').value) $('session-title').value = state.files[0].webkitRelativePath?.split('/')[0] || 'My orchestra';
      $('load-message').textContent = duplicates.length ? 'Repeated filenames found. Choose ONE microphone folder (for example Tree or StereoMix), or select only the intended tracks below.' : 'Check the instruments and exclude any full mix. Reference dB defaults to the original stem level.';
    }
    renderFileList();
  }
  async function openSession(file) {
    if (!file) return;
    try {
      if (file.size > 1024 * 1024) throw new Error('Session JSON must be smaller than 1 MB. Audio is loaded separately.');
      state.manifest = M.validateSession(await file.text());
      $('session-title').value = state.manifest.title; $('excerpt-start').value = state.manifest.excerpt.start; $('excerpt-duration').value = state.manifest.excerpt.duration;
      state.pending = []; $('load-message').textContent = 'Settings loaded. Choose the matching audio files or the original folder.';
      if (state.files.length) chooseFiles(state.files); else renderFileList();
    } catch (error) { $('load-message').textContent = error.message; }
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
      const settings = M.makeSession(state.title, state.tracks.map(t => ({ ...t, referenceDb: state.refs[t.id] })), state.excerpt);
      const url = URL.createObjectURL(new Blob([JSON.stringify(settings, null, 2) + '\n'], { type: 'application/json' }));
      const a = document.createElement('a'); a.href = url; a.download = state.title.replace(/[^a-z0-9_-]/gi, '-').slice(0, 80) + '.orchmix.json'; a.click(); setTimeout(() => URL.revokeObjectURL(url), 2000);
      status('Session settings saved. Keep the audio files; you will select them again when reopening.');
    } catch (error) { status(error.message, true); }
  }
  function openLibrary() {
    if (state.loading) return;
    engine.pause(); updateTransport(); state.manifest = null; state.pending = []; state.files = [];
    $('session-title').value = ''; $('load-message').textContent = ''; $('audio-files').value = ''; $('audio-folder').value = ''; $('session-file').value = ''; renderFileList(); openDialog('library-dialog');
  }
  $('library-button').addEventListener('click', openLibrary); $('welcome-load').addEventListener('click', openLibrary);
  $('sources-button').addEventListener('click', () => openDialog('sources-dialog')); $('help-button').addEventListener('click', () => openDialog('help-dialog'));
  document.querySelectorAll('[data-close]').forEach(button => button.addEventListener('click', () => { if (!state.loading) $(button.dataset.close).close(); }));
  $('library-dialog').addEventListener('cancel', e => { if (state.loading) e.preventDefault(); });
  $('demo-button').addEventListener('click', demo); $('play-button').addEventListener('click', togglePlay);
  $('restart-button').addEventListener('click', () => { engine.seek(0); updateTransport(); });
  $('seek').addEventListener('input', e => { engine.seek(Number(e.target.value)); });
  $('master-volume').addEventListener('input', e => { engine.setMaster(Number(e.target.value)); $('master-value').textContent = e.target.value + ' dB'; });
  $('loop-button').addEventListener('click', () => { state.loop = !state.loop; engine.setLoop(state.loop); $('loop-button').classList.toggle('active', state.loop); $('loop-button').setAttribute('aria-pressed', String(state.loop)); });
  $('reference-button').addEventListener('click', () => { state.referenceListening = !state.referenceListening; applyGains(); refreshMode(); });
    $('set-reference').addEventListener('click', () => { if (state.referenceListening || state.muted.size || state.solo.size) return; state.refs = actualGains(); applyGains(); status('Your current balance is now the reference. Save session settings to keep it.'); });
  $('challenge-mode').addEventListener('click', () => { if (!state.challenge) challenge(); }); $('scramble-button').addEventListener('click', challenge); $('explore-mode').addEventListener('click', explore);
  $('reveal-button').addEventListener('click', () => { state.revealed = !state.revealed; state.referenceListening = false; state.muted.clear(); state.solo.clear(); applyGains(); refreshMode(); if (state.revealed) status('Comparison uses relative balance across active parts; a common volume offset is ignored.'); });
  $('reset-button').addEventListener('click', () => {
    state.controls = Object.fromEntries(state.tracks.map(t => [t.id, state.challenge ? -state.offsets[t.id] : state.refs[t.id]]));
    state.muted.clear(); state.solo.clear(); state.referenceListening = false; if (state.challenge) state.revealed = true;
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
        for (const [id, ui] of state.cards) { const value = engine.isPlaying ? Math.min(1, Math.sqrt(levels[id] || 0) * 2.5) : 0; ui.element.style.setProperty('--energy', value.toFixed(3)); }
        if (document.activeElement !== $('seek')) $('seek').value = engine.currentTime;
        $('time-current').textContent = fmt(engine.currentTime); updateTransport();
      }
    }
    requestAnimationFrame(animate);
  }
  renderStage(); refreshMode(); requestAnimationFrame(animate);
})();
