(function (root, factory) {
  'use strict';
  const instruments = factory();
  if (typeof module === 'object' && module.exports) module.exports = instruments;
  if (root) root.OrchInstruments = instruments;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  // Original line drawings. All symbols share a 24 × 32 drawing space.
  // The symbols describe instruments, never the identity of their players.
  const PATHS = Object.freeze({
    violin: ['M11 2h2v10h-2z M10 2c-3 0-3 4 0 4 M9 12c-5-2-7 5-3 7-6 7 0 12 6 11 6 1 12-4 6-11 4-2 2-9-3-7 M12 11v17 M8 22h8'],
    viola: ['M11 2h2v10h-2z M10 2c-3 0-3 4 0 4 M9 12c-6-2-8 5-4 7-6 7 0 12 7 11 7 1 13-4 7-11 4-2 2-9-4-7 M12 11v17 M8 22h8'],
    cello: ['M11 2h2v9h-2z M10 2c-3 0-3 4 0 4 M9 11c-6-1-7 5-4 7-6 6-1 10 7 10s13-4 7-10c3-2 2-8-4-7 M12 10v21 M7 21h10'],
    bass: ['M10 2h3v8h-3z M10 2c-4-1-4 4-1 4 M9 10l-4 4 1 5c-6 8 0 10 6 10s12-2 6-10l1-5-4-4 M12 9v22 M7 22h10 M10 5h3 M10 7h3'],
    flute: ['M3 27 19 3l3 2L6 29z M7 23l3 2 M10 19l3 2 M13 15l3 2 M16 11l3 2 M18 7l3 2'],
    oboe: ['M11 2h2v6l1 16 3 5H7l3-5 1-16z M10 12h4 M10 16h4 M10 20h4 M9 24h6'],
    clarinet: ['M11 2h3l-1 6 1 16 4 6H6l4-6V8z M10 10h4 M10 15h4 M10 20h4 M9 25h6'],
    bassoon: ['M7 30 17 4l3 1L11 30z M5 28 9 15l3 1 M12 15l1-6-4-2-2 3 M14 13l3 1 M12 18l3 1 M10 23l3 1'],
    horn: ['M16 11c-12-5-18 11-9 16 9 6 17-7 9-11-7-4-12 6-5 8 4 1 6-5 2-6 M16 18l5-8-1-5-7 4 3 3 M5 15 3 8h4 M6 15l6 4'],
    trumpet: ['M3 11h12l7-5v16l-7-5H6c-5 0-5 8 0 8h8c4 0 4-8 0-8 M4 13H1 M9 11V7 M13 11V7 M8 7h2 M12 7h2 M8 17v4 M12 17v4'],
    trombone: ['M3 10h11l8-5v15l-8-5H5 M3 12H1 M6 15v12c0 5 6 5 6 0V15 M8 15v12 M6 24h6'],
    tuba: ['M9 9 5 2h14l-4 7v16c0 8-13 8-13 0V15c0-5 10-5 10 0v10c0 3-6 3-6 0V16 M9 9h6 M6 17h9 M8 17v-5 M11 17v-5 M14 17v-5'],
    harp: ['M3 3c7-3 9 3 18 3L7 30H3z M3 3v27h4 M7 5v21 M11 6v14 M15 7v6'],
    timpani: ['M2 12c0-5 20-5 20 0s-20 5-20 0 M2 12c1 17 19 17 20 0 M6 23l-2 7 M18 23l2 7 M7 3l5 6 M18 2l-5 7'],
    percussion: ['M3 14c0-5 18-5 18 0s-18 5-18 0 M3 14v11c0 5 18 5 18 0V14 M4 17l4 10 4-9 4 9 4-10 M3 3l13 8 M21 3 9 11']
  });

  const ID_TYPES = Object.freeze({ vln1: 'violin', vln2: 'violin', vla: 'viola', vc: 'cello', cb: 'bass', picc: 'flute', fl: 'flute', ob: 'oboe', eh: 'oboe', cl: 'clarinet', bcl: 'clarinet', bn: 'bassoon', cbn: 'bassoon', hn: 'horn', trp: 'trumpet', tbn: 'trombone', tuba: 'tuba', harp: 'harp', timp: 'timpani', perc: 'percussion', bd: 'percussion' });

  function infer(track) {
    if (track && Object.prototype.hasOwnProperty.call(PATHS, track.instrument)) return track.instrument;
    const id = String(track && track.id || '').toLowerCase().replace(/[-_]\d+$/, '');
    if (ID_TYPES[id]) return ID_TYPES[id];
    const words = String(track && track.name || '').normalize('NFKD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
    const patterns = [
      [/bass clarinet|bassklarinette/, 'clarinet'], [/bassoon|fagott/, 'bassoon'],
      [/double bass|contrabass|kontrabass|violone|^bass(?:es)?$/, 'bass'],
      [/violin|violino/, 'violin'], [/viola|bratsche/, 'viola'], [/cello|celli/, 'cello'],
      [/flute|flote|piccolo/, 'flute'], [/oboe|cor anglais|coranglais|english horn|englischhorn/, 'oboe'],
      [/clarinet|klarinette/, 'clarinet'], [/trombone|posaune/, 'trombone'],
      [/trumpet|trompete|trombe/, 'trumpet'], [/horn|corni/, 'horn'], [/tuba/, 'tuba'],
      [/harp|harfe|arpa/, 'harp'], [/timpani|pauke|kettledrum/, 'timpani']
    ];
    const found = patterns.find(([pattern]) => pattern.test(words));
    return found ? found[1] : ({ strings: 'violin', woodwinds: 'flute', brass: 'horn' }[track && track.family] || 'percussion');
  }

  function playerCount(track) {
    return track && Number.isInteger(track.players) && track.players >= 1 && track.players <= 80 ? track.players : null;
  }

  function countCaption(track) {
    const count = playerCount(track);
    if (count === null) return 'Player count unknown';
    return count + (count === 1 ? ' player' : ' players') + (track.playersBasis === 'confirmed' ? ' · confirmed' : ' · estimated');
  }

  function inside(point, polygon) {
    let result = false;
    for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
      const a = polygon[i], b = polygon[j];
      if ((a[1] > point[1]) !== (b[1] > point[1]) && point[0] < (b[0] - a[0]) * (point[1] - a[1]) / (b[1] - a[1]) + a[0]) result = !result;
    }
    return result;
  }

  function fits(box, polygon, label) {
    // Include edge midpoints: a curved inner boundary can cross a box even
    // when its corners lie inside the annular region.
    for (const dx of [0, 0.5, 1]) {
      for (const dy of [0, 0.5, 1]) {
        if (!inside([box.x + dx * box.width, box.y + dy * box.height], polygon)) return false;
      }
    }
    return !label || box.x + box.width < label.x || box.x > label.x + label.width || box.y + box.height < label.y || box.y > label.y + label.height;
  }

  function placements(area, track, options) {
    const count = playerCount(track), needed = count === null ? 1 : count;
    const estimated = count !== null && track.playersBasis !== 'confirmed';
    const compact = !!(options && options.compact);
    const reserved = { x: area.label.x - (compact ? 17 : 69), y: area.label.y - (compact ? 13 : 18), width: compact ? 34 : 138, height: compact ? 29 : 53 };
    const xs = area.points.map(p => p[0]), ys = area.points.map(p => p[1]);
    const bounds = { left: Math.min(...xs) + 4, right: Math.max(...xs) - 4, top: Math.min(...ys) + 4, bottom: Math.max(...ys) - 4 };
    let chosen = [], badge = null;
    let bestSize = 0;
    for (const size of [30, 26, 22, 18, 15]) {
      const width = size * 0.75, height = size, step = Math.max(4, size / 3);
      const candidates = [];
      for (let y = bounds.top; y + height <= bounds.bottom; y += step) {
        for (let x = bounds.left; x + width <= bounds.right; x += step) {
          const cell = { x, y, width, height };
          if (fits(cell, area.points, reserved)) candidates.push(cell);
        }
      }
      candidates.sort((a, b) => {
        const distance = cell => Math.hypot((cell.x + cell.width / 2 - area.label.x) * 0.7, cell.y + cell.height / 2 - area.label.y);
        return distance(a) - distance(b) || a.y - b.y || a.x - b.x;
      });
      const packed = [];
      for (const cell of candidates) {
        if (packed.every(other => cell.x + cell.width + 4 <= other.x || cell.x >= other.x + other.width + 4 || cell.y + cell.height + 3 <= other.y || cell.y >= other.y + other.height + 3)) packed.push(cell);
        if (packed.length === needed) break;
      }
      if (packed.length > chosen.length) { chosen = packed; bestSize = size; }
      if (chosen.length === needed) break;
    }
    const badgeText = count === null ? '?' : estimated ? '≈' + count : chosen.length < count ? '×' + count : '';
    if (badgeText) {
      const width = Math.max(10, badgeText.length * 7), height = 12;
      const badges = [];
      for (let y = bounds.top; y + height <= bounds.bottom; y += 4) {
        for (let x = bounds.left; x + width <= bounds.right; x += 4) {
          const box = { x, y, width, height };
          if (fits(box, area.points, reserved)) badges.push(box);
        }
      }
      const target = chosen[0] || { x: area.label.x, y: area.label.y };
      const clear = (box, cell) => box.x + box.width + 2 < cell.x || box.x > cell.x + cell.width + 2 || box.y + box.height + 2 < cell.y || box.y > cell.y + cell.height + 2;
      const collisions = box => chosen.filter(cell => !clear(box, cell)).length;
      badges.sort((a, b) => collisions(a) - collisions(b) || Math.hypot(a.x - target.x, a.y - target.y) - Math.hypot(b.x - target.x, b.y - target.y));
      if (badges.length) {
        const box = badges[0];
        chosen = chosen.filter(cell => clear(box, cell));
        badge = { x: box.x + width / 2, y: box.y + 10, text: badgeText };
      }
    }
    const icons = chosen.map(cell => ({ x: cell.x, y: cell.y, size: bestSize }));
    return { icons, count, shown: icons.length, badge };
  }

  function render(area, track, doc, options) {
    const document = doc || globalThis.document;
    const node = (name, attributes, text) => {
      const element = document.createElementNS('http://www.w3.org/2000/svg', name);
      for (const [key, value] of Object.entries(attributes || {})) element.setAttribute(key, String(value));
      if (text !== undefined) element.textContent = text;
      return element;
    };
    const type = infer(track), layout = placements(area, track, options);
    const group = node('g', { class: 'region-musicians', 'aria-hidden': 'true', 'pointer-events': 'none', 'data-instrument': type, 'data-basis': layout.count === null ? 'unknown' : track.playersBasis === 'confirmed' ? 'confirmed' : 'estimate', 'data-count': layout.count === null ? 'unknown' : layout.count, 'data-shown': layout.shown });
    for (const icon of layout.icons) {
      const glyph = node('g', { class: 'player-icon', transform: 'translate(' + icon.x + ' ' + icon.y + ') scale(' + icon.size / 32 + ')', fill: 'none', stroke: 'currentColor', 'stroke-width': 1.6, 'stroke-linecap': 'round', 'stroke-linejoin': 'round' });
      for (const path of PATHS[type]) glyph.append(node('path', { d: path }));
      group.append(glyph);
    }
    if (layout.badge) group.append(node('text', { x: layout.badge.x, y: layout.badge.y, class: 'player-count', 'text-anchor': 'middle', fill: 'currentColor', 'font-size': 10, 'font-weight': 700 }, layout.badge.text));
    return group;
  }

  return Object.freeze({ infer, countCaption, placements, render });
});
