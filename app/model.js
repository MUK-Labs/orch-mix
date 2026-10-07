(function (root, factory) {
  'use strict';
  const model = factory();
  if (typeof module === 'object' && module.exports) module.exports = model;
  if (root) root.OrchModel = model;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  const DEFAULT_TRACKS = Object.freeze([
    { id: 'vln1', name: 'Violins I', family: 'strings' },
    { id: 'vln2', name: 'Violins II', family: 'strings' },
    { id: 'vla', name: 'Violas', family: 'strings' },
    { id: 'vc', name: 'Cellos', family: 'strings' },
    { id: 'cb', name: 'Double basses', family: 'strings' },
    { id: 'fl', name: 'Flutes', family: 'woodwinds' },
    { id: 'ob', name: 'Oboes', family: 'woodwinds' },
    { id: 'cl', name: 'Clarinets', family: 'woodwinds' },
    { id: 'bn', name: 'Bassoons', family: 'woodwinds' },
    { id: 'hn', name: 'Horns', family: 'brass' },
    { id: 'trp', name: 'Trumpets', family: 'brass' },
    { id: 'timp', name: 'Timpani', family: 'percussion' }
  ].map(Object.freeze));

  const FAMILIES = Object.freeze(['strings', 'woodwinds', 'brass', 'percussion']);
  const AUDIO_PATTERN = /\.(wav|mp3|flac|ogg|m4a|aif|aiff|opus|webm)$/i;
  const RESERVED_IDS = new Set(['constructor', 'prototype', '__proto__']);

  function baseName(path) {
    return String(path).replace(/\\/g, '/').split('/').pop();
  }

  function sourceName(file) {
    if (typeof file === 'string') return file;
    return file && typeof file.name === 'string' ? file.name : '';
  }

  function isAudioFile(file) {
    return AUDIO_PATTERN.test(sourceName(file));
  }

  function instrument(id) {
    return DEFAULT_TRACKS.find(track => track.id === id);
  }

  function inferTrack(filename, index) {
    const original = sourceName(filename);
    const stem = baseName(original).replace(/\.[^.]+$/, '');
    const words = stem.normalize('NFKD').replace(/[\u0300-\u036f]/g, '')
      .replace(/([a-z])([A-Z])/g, '$1 $2').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
    let match;
    // The published Operation Beethoven files have fixed section numbers.
    const oma = /^oma hkm (0?[1-9]|1[0-2])(?: |$)/.exec(words);
    if (oma) {
      const omaOrder = ['fl', 'ob', 'cl', 'bn', 'hn', 'trp', 'timp', 'vln1', 'vln2', 'vla', 'vc', 'cb'];
      match = instrument(omaOrder[Number(oma[1]) - 1]);
    }
    const specificInstruments = [
      [/\b(?:piccolos?|ottavino)\b/, { id: 'picc', name: 'Piccolo', family: 'woodwinds' }],
      [/\b(?:coranglais|cor anglais|english horn|englischhorn)\b/, { id: 'eh', name: 'Cor anglais', family: 'woodwinds' }],
      [/\b(?:bassclarinet|bass clarinet|bassklarinette)\b/, { id: 'bcl', name: 'Bass clarinet', family: 'woodwinds' }],
      [/\b(?:contrabassoons?|contra bassoons?|kontrafagott)\b/, { id: 'cbn', name: 'Contrabassoon', family: 'woodwinds' }],
      [/\b(?:bassdrum|bass drum|grosse trommel)\b/, { id: 'bd', name: 'Bass drum', family: 'percussion' }],
      [/\buntunedpercussion\b|\buntuned percussion\b/, { id: 'perc', name: 'Untuned percussion', family: 'percussion' }]
    ];
    if (!match) {
      const specific = specificInstruments.find(([pattern]) => pattern.test(words));
      if (specific) match = specific[1];
    }
    const patterns = [
      [/\b(?:double bass(?:es)?|contrabass(?:es)?|kontrabass|kontrabasse|bassi|bass|cb|kb)\b/, 'cb'],
      [/\b(?:violins?|violinen?|violino|vln|vl)\s*(?:2|ii|second)\b|\bsecond violins?\b/, 'vln2'],
      [/\b(?:violins?|violinen?|violino|vln|vl)(?:\s*(?:1|i|first))?\b|\bfirst violins?\b/, 'vln1'],
      [/\b(?:violas?|bratschen?|vla|va)\b/, 'vla'],
      [/\b(?:violoncellos?|violoncelli|cellos?|celli|vc)\b/, 'vc'],
      [/\b(?:bassoons?|contrabassoons?|fagott[ioe]?|fagotte|fag|fg|bn)\b/, 'bn'],
      [/\b(?:clarinets?|clarinetti|klarinetten?|cl|kl)\b/, 'cl'],
      [/\b(?:oboes?|oboi|oboen?|english horn|cor anglais|ob)\b/, 'ob'],
      [/\b(?:flutes?|flauti|floten?|piccolos?|fl)\b/, 'fl'],
      [/\b(?:trumpets?|trompeten?|trombe|trp|tpt|tr)\b/, 'trp'],
      [/\b(?:horns?|horner|corni|hn|hr)\b/, 'hn'],
      [/\b(?:timpani|pauken?|kettledrums?|timp|pk)\b/, 'timp']
    ];
    if (!match) {
      const found = patterns.find(([pattern]) => pattern.test(words));
      if (found) match = instrument(found[1]);
    }
    if (!match && /\b(?:trombones?|posaunen?|tbns?|tb|tbn)\b/.test(words)) {
      match = { id: 'tbn', name: 'Trombones', family: 'brass' };
    }
    if (!match && /\b(?:tubas?|tu)\b/.test(words)) {
      match = { id: 'tuba', name: 'Tuba', family: 'brass' };
    }
    if (!match && /\b(?:harps?|harfen?|arpa|hp)\b/.test(words)) {
      match = { id: 'harp', name: 'Harp', family: 'percussion' };
    }
    if (!match && /\b(?:percussion|tunedpercussion|schlagwerk|drums?|cymbals?|becken|triangle|tambourine|tam tam|glockenspiel|xylophone)\b/.test(words)) {
      match = { id: 'perc', name: 'Percussion', family: 'percussion' };
    }
    const position = Number.isInteger(index) && index >= 0 ? index + 1 : 1;
    if (!match) {
      match = { id: 'track', name: stem.replace(/[_-]+/g, ' ').trim().slice(0, 100) || 'Track ' + position, family: 'strings' };
    }
    return { id: match.id + '-' + position, name: match.name, family: match.family, file: original };
  }

  function localPath(value, label) {
    if (typeof value !== 'string' || value.length < 1 || value.length > 1024 || value !== value.trim()) {
      throw new Error(label + ' must be a nonempty relative audio filename (maximum 1024 characters).');
    }
    if (/^[\\/]|[\\:\u0000-\u001f\u007f]/.test(value) || value.split('/').some(part => !part || part === '.' || part === '..')) {
      throw new Error(label + ' must be local and relative: URLs, absolute paths and traversal are not accepted.');
    }
    // Prevent escaped traversal/URL syntax from being misinterpreted by future consumers.
    let decoded = value;
    for (let pass = 0; pass < 3; pass += 1) {
      let next;
      try { next = decodeURIComponent(decoded); } catch (_) { break; }
      if (next === decoded) break;
      if (/^[\\/]|[\\:\u0000-\u001f\u007f]/.test(next) || next.split('/').some(part => !part || part === '.' || part === '..')) {
        throw new Error(label + ' contains an encoded unsafe path.');
      }
      decoded = next;
    }
    if (!isAudioFile(value)) throw new Error(label + ' must name a supported audio file.');
    return value;
  }

  function boundedText(value, label, max) {
    if (typeof value !== 'string' || !value.trim() || value.trim().length > max || /[\u0000-\u001f\u007f]/.test(value)) {
      throw new Error(label + ' must be a nonempty text of at most ' + max + ' characters.');
    }
    return value.trim();
  }

  function finiteNumber(value, label, min, max) {
    if (typeof value !== 'number' || !Number.isFinite(value) || value < min || value > max) {
      throw new Error(label + ' must be a number between ' + min + ' and ' + max + '.');
    }
    return value;
  }

  function validateSession(json) {
    let session = json;
    if (typeof json === 'string') {
      try { session = JSON.parse(json); } catch (_) { throw new Error('The session file is not valid JSON.'); }
    }
    if (!session || typeof session !== 'object' || Array.isArray(session)) throw new Error('A session must be an object.');
    if (session.version !== 1) throw new Error('Only session version 1 is supported.');
    const title = boundedText(session.title, 'Session title', 200);
    const excerpt = session.excerpt;
    if (!excerpt || typeof excerpt !== 'object' || Array.isArray(excerpt)) throw new Error('The session needs excerpt start and duration.');
    const start = finiteNumber(excerpt.start, 'Excerpt start', 0, Number.MAX_SAFE_INTEGER);
    const duration = finiteNumber(excerpt.duration, 'Excerpt duration', 1, 120);
    if (!Array.isArray(session.tracks) || session.tracks.length < 1 || session.tracks.length > 48) {
      throw new Error('A session must have between 1 and 48 tracks.');
    }
    const ids = new Set();
    const tracks = session.tracks.map((track, index) => {
      const label = 'Track ' + (index + 1);
      if (!track || typeof track !== 'object' || Array.isArray(track)) throw new Error(label + ' must be an object.');
      if (typeof track.id !== 'string' || !/^[a-zA-Z][a-zA-Z0-9_-]{0,79}$/.test(track.id) || RESERVED_IDS.has(track.id)) {
        throw new Error(label + ' needs an ID beginning with a letter and using only letters, numbers, hyphens or underscores.');
      }
      if (ids.has(track.id)) throw new Error('Duplicate track ID: ' + track.id);
      ids.add(track.id);
      if (!FAMILIES.includes(track.family)) throw new Error(label + ' has an unsupported instrument family.');
      return {
        id: track.id,
        name: boundedText(track.name, label + ' name', 100),
        family: track.family,
        file: localPath(track.file, label + ' file'),
        referenceDb: finiteNumber(track.referenceDb === undefined ? 0 : track.referenceDb, label + ' reference level', -48, 12)
      };
    });
    return { version: 1, title, excerpt: { start, duration }, tracks };
  }

  function findFiles(manifestTracks, fileList) {
    const files = Array.from(fileList || []);
    const matches = [], missing = [], ambiguous = [];
    for (const track of manifestTracks || []) {
      const wanted = localPath(track.file, 'Track file');
      // A path-bearing manifest entry needs the folder picker; do not silently
      // substitute an identically named file from a different directory.
      const withPath = wanted.includes('/');
      const candidates = files.map(file => ({
        file,
        key: withPath ? String(file.webkitRelativePath || '') : baseName(sourceName(file))
      }));
      let found = candidates.filter(item => item.key === wanted);
      if (!found.length) found = candidates.filter(item => item.key.toLowerCase() === wanted.toLowerCase());
      if (found.length === 1) matches.push({ ...track, file: found[0].file });
      else if (!found.length) missing.push({ ...track });
      else ambiguous.push({ ...track, candidates: found.map(item => item.file.webkitRelativePath || item.file.name) });
    }
    return { matches, missing, ambiguous };
  }

  function makeSession(title, tracks, excerpt) {
    return validateSession({
      version: 1,
      title,
      excerpt: { start: 0, duration: 30, ...(excerpt || {}) },
      tracks: Array.from(tracks || []).map(track => {
        const file = track.file;
        return {
          id: track.id,
          name: track.name,
          family: track.family,
          file: typeof file === 'string' ? file : file && (file.webkitRelativePath || file.name),
          referenceDb: track.referenceDb === undefined ? 0 : track.referenceDb
        };
      })
    });
  }

  function mapValue(map, id) {
    if (map instanceof Map) return map.get(id);
    return map && Object.prototype.hasOwnProperty.call(map, id) ? map[id] : undefined;
  }

  function scoreBalance(actualDbMap, referenceDbMap, activeIds) {
    const ids = activeIds || (actualDbMap instanceof Map ? Array.from(actualDbMap.keys()) : Object.keys(actualDbMap || {}));
    const deviations = [];
    for (const id of new Set(ids)) {
      const actual = mapValue(actualDbMap, id), reference = mapValue(referenceDbMap, id);
      if (typeof actual === 'number' && typeof reference === 'number' && Number.isFinite(actual) && Number.isFinite(reference)) {
        deviations.push([id, actual - reference]);
      }
    }
    if (!deviations.length) return { errors: {}, meanAbsoluteError: null, score: null, count: 0, commonOffset: null };
    const commonOffset = deviations.reduce((sum, entry) => sum + entry[1], 0) / deviations.length;
    const relative = deviations.map(([id, offset]) => [id, offset - commonOffset]);
    const meanAbsoluteError = relative.reduce((sum, entry) => sum + Math.abs(entry[1]), 0) / relative.length;
    return {
      errors: Object.fromEntries(relative),
      meanAbsoluteError,
      score: Math.round(Math.max(0, 100 * (1 - meanAbsoluteError / 12))),
      count: deviations.length,
      commonOffset
    };
  }

  function randomizedOffsets(ids, random) {
    const rng = random || Math.random;
    const unique = Array.from(new Set(ids || []));
    const values = unique.map(() => {
      const sample = rng();
      const bounded = Number.isFinite(sample) ? Math.max(0, Math.min(1, sample)) : 0.5;
      return Math.round((bounded * 18 - 9) * 2) / 2;
    });
    if (values.length === 1 && Math.abs(values[0]) < 3) values[0] = 3;
    if (values.length > 1 && Math.max(...values) - Math.min(...values) < 4) {
      values[0] = -3;
      values[values.length - 1] = 3;
    }
    return Object.fromEntries(unique.map((id, index) => [id, values[index]]));
  }

  return Object.freeze({ DEFAULT_TRACKS, FAMILIES, inferTrack, isAudioFile, findFiles, validateSession, makeSession, scoreBalance, randomizedOffsets });
});
