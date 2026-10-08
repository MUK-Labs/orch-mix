(function (root, factory) {
  'use strict';
  const layout = factory();
  if (typeof module === 'object' && module.exports) module.exports = layout;
  if (root) root.OrchLayout = layout;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  const ROWS = ['front', 'middle', 'back', 'rear'];
  const FAMILY_ROWS = { strings: 'front', woodwinds: 'middle', brass: 'back', percussion: 'rear' };
  const ROW_WEIGHTS = { front: 1.5, middle: 1.1, back: 1, rear: 0.85 };
  const INSTRUMENTS = [
    'vln1', 'vln2', 'vla', 'vc', 'cb',
    'picc', 'fl', 'ob', 'eh', 'cl', 'bcl', 'bn', 'cbn',
    'hn', 'trp', 'tbn', 'tuba',
    'harp', 'timp', 'perc', 'bd'
  ];
  const MAX_PER_ROW = 8;

  function instrumentRank(track) {
    // Imported filenames have generated IDs such as vln1-8 and fl-1.
    const id = String(track.id || '').toLowerCase().replace(/[-_]\d+$/, '');
    const rank = INSTRUMENTS.indexOf(id);
    return rank === -1 ? INSTRUMENTS.length : rank;
  }

  function validNumber(value, fallback, min, max) {
    return typeof value === 'number' && Number.isFinite(value) && value >= min && value <= max ? value : fallback;
  }

  function compare(a, b) {
    const orderA = validNumber(a.seat && a.seat.order, instrumentRank(a), -1000, 1000);
    const orderB = validNumber(b.seat && b.seat.order, instrumentRank(b), -1000, 1000);
    if (orderA !== orderB) return orderA - orderB;
    const rank = instrumentRank(a) - instrumentRank(b);
    if (rank) return rank;
    // Code-point comparison is locale-independent, so a saved set seats identically.
    const left = String(a.id), right = String(b.id);
    const leftPart = /^(.*?)(\d+)$/.exec(left), rightPart = /^(.*?)(\d+)$/.exec(right);
    if (leftPart && rightPart && leftPart[1] === rightPart[1]) {
      const leftNumber = Number(leftPart[2]), rightNumber = Number(rightPart[2]);
      if (Number.isSafeInteger(leftNumber) && Number.isSafeInteger(rightNumber) && leftNumber !== rightNumber) return leftNumber - rightNumber;
    }
    return left < right ? -1 : left > right ? 1 : 0;
  }

  function point(radius, angle) {
    return [500 + 480 * radius * Math.cos(angle), 520 + 500 * radius * Math.sin(angle)];
  }

  function polygon(inner, outer, start, end) {
    const segments = Math.max(2, Math.ceil((end - start) / (Math.PI / 60)));
    const points = [];
    for (let i = 0; i <= segments; i += 1) points.push(point(outer, start + (end - start) * i / segments));
    for (let i = segments; i >= 0; i -= 1) points.push(point(inner, start + (end - start) * i / segments));
    return points;
  }

  function calculate(tracks) {
    if (!Array.isArray(tracks) || !tracks.length) return [];
    const bands = [];
    for (const row of ROWS) {
      const members = tracks.filter(track => {
        const requested = track.seat && track.seat.row;
        return (ROWS.includes(requested) ? requested : FAMILY_ROWS[track.family] || 'front') === row;
      }).sort(compare);
      // Only occupied rows consume space. Crowded rows divide into balanced
      // concentric bands, preserving left-to-right order within each band.
      const count = Math.ceil(members.length / MAX_PER_ROW);
      let consumed = 0;
      for (let i = 0; i < count; i += 1) {
        const size = Math.ceil((members.length - consumed) / (count - i));
        bands.push({ row, tracks: members.slice(consumed, consumed + size), weight: ROW_WEIGHTS[row] });
        consumed += size;
      }
    }
    const weightSum = bands.reduce((sum, band) => sum + band.weight, 0);
    const result = [];
    // Equal-area radial allocation gives the front string band generous space,
    // while keeping a clear area around the conductor at (500, 520).
    const innerSquare = 0.2 * 0.2;
    const area = 1 - innerSquare;
    let allocated = 0;
    for (const [bandIndex, band] of bands.entries()) {
      const inner = Math.sqrt(innerSquare + area * allocated / weightSum) + (bandIndex ? 0.006 : 0);
      allocated += band.weight;
      const outer = Math.sqrt(innerSquare + area * allocated / weightSum) - (bandIndex < bands.length - 1 ? 0.006 : 0);
      const weights = band.tracks.map(track => validNumber(track.seat && track.seat.weight, 1, 0.25, 4));
      const total = weights.reduce((sum, value) => sum + value, 0);
      // Reserve a minimum angle before distributing the remainder by weight.
      // This prevents low-weight stems becoming slivers in an eight-part band.
      const minimum = band.tracks.length > 1 ? 0.18 : 0;
      const remainder = Math.PI - minimum * band.tracks.length;
      const halfGap = Math.min(0.02, 3 / (480 * inner));
      let angle = Math.PI;
      for (const [index, track] of band.tracks.entries()) {
        const width = minimum + remainder * weights[index] / total;
        const start = angle + halfGap;
        const end = angle + width - halfGap;
        const [x, y] = point((inner + outer) / 2, (start + end) / 2);
        result.push({ id: track.id, points: polygon(inner, outer, start, end), label: { x, y }, row: band.row });
        angle += width;
      }
    }
    return result;
  }

  return Object.freeze({ calculate });
});
