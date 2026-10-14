'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const instruments = require('../app/instruments.js');
const layout = require('../app/layout.js');
const model = require('../app/model.js');
const beethoven = require('../examples/beethoven-operation.orchmix.json');
const mozart = require('../examples/mozart-spheres.orchmix.json');
const tchaikovsky = require('../examples/tchaikovsky-spheres.orchmix.json');

function inside(point, polygon) {
  let isInside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const a = polygon[i], b = polygon[j];
    if ((a[1] > point[1]) !== (b[1] > point[1]) && point[0] < (b[0] - a[0]) * (point[1] - a[1]) / (b[1] - a[1]) + a[0]) isInside = !isInside;
  }
  return isInside;
}

function overlaps(a, b) {
  return a.x < b.x + b.width && a.x + a.width > b.x && a.y < b.y + b.height && a.y + a.height > b.y;
}

test('recognizes specific instruments without turning a cor anglais into a brass horn', () => {
  for (const [name, expected] of [['Violone', 'bass'], ['Cor anglais', 'oboe'], ['Bass clarinet', 'clarinet'], ['Contrabassoon', 'bassoon'], ['Harp', 'harp'], ['Piccolo', 'flute'], ['Viola', 'viola'], ['Trombone 3', 'trombone']]) {
    assert.equal(instruments.infer({ name }), expected);
  }
  assert.equal(instruments.infer({ id: 'vln1-12', name: 'Custom name' }), 'violin');
  assert.equal(instruments.infer({ id: 'vln1', instrument: 'harp' }), 'harp');
  assert.equal(instruments.infer({ family: 'woodwinds', name: 'Unknown' }), 'flute');
  assert.equal(instruments.infer({ family: 'percussion', instrument: '__proto__' }), 'percussion');
});

test('templates distinguish credited musicians from estimated positions and unknown string divisions', () => {
  assert.deepEqual(beethoven, require('../examples/beethoven-layout.json'));
  assert.equal(beethoven.tracks.reduce((sum, track) => sum + track.players, 0), 25);
  assert.ok(beethoven.tracks.every(track => track.playersBasis === 'confirmed'));
  assert.deepEqual(mozart.tracks.filter(track => track.family === 'strings').map(track => track.players), [6, 6, 4, 3, 2]);
  assert.ok(mozart.tracks.every(track => track.playersBasis === 'estimate'));
  for (const track of tchaikovsky.tracks.filter(track => /^(vln|vla|vc|perc)/.test(track.id))) {
    assert.equal(track.players, undefined, track.id);
    assert.equal(instruments.countCaption(track), 'Player count unknown');
  }
  for (const session of [beethoven, mozart, tchaikovsky]) assert.deepEqual(model.validateSession(session), session);
});

test('all template player glyphs fit their polygons, avoid labels and do not overlap', () => {
  for (const session of [beethoven, mozart, tchaikovsky]) {
    const compact = session.tracks.length > 24;
    for (const area of layout.calculate(session.tracks)) {
      const track = session.tracks.find(item => item.id === area.id);
      const placed = instruments.placements(area, track, { compact });
      assert.equal(placed.shown, track.players || 1, track.id);
      const boxes = placed.icons.map(icon => ({ x: icon.x, y: icon.y, width: icon.size * 0.75, height: icon.size }));
      const label = { x: area.label.x - (compact ? 17 : 69), y: area.label.y - (compact ? 13 : 18), width: compact ? 34 : 138, height: compact ? 29 : 53 };
      for (const [index, box] of boxes.entries()) {
        for (const dx of [0, 0.5, 1]) for (const dy of [0, 0.5, 1]) assert.ok(inside([box.x + box.width * dx, box.y + box.height * dy], area.points), track.id);
        assert.equal(overlaps(box, label), false, track.id + ' label');
        for (const other of boxes.slice(index + 1)) assert.equal(overlaps(box, other), false, track.id + ' glyph');
      }
      if (track.playersBasis === 'estimate') assert.equal(placed.badge.text, '≈' + track.players);
      if (!track.players) assert.equal(placed.badge.text, '?');
    }
  }
});

test('dense regions retain an explicit total rather than suggesting that fewer musicians play', () => {
  const tracks = Array.from({ length: 48 }, (_, index) => ({ id: 'vln1-' + index, name: 'Violins', family: 'strings', players: 80, playersBasis: 'confirmed' }));
  for (const area of layout.calculate(tracks)) {
    const placed = instruments.placements(area, tracks[0], { compact: true });
    assert.ok(placed.shown <= 80);
    if (placed.shown < 80) assert.equal(placed.badge && placed.badge.text, '×80', area.id);
  }
  assert.equal(instruments.countCaption({ players: 6 }), '6 players · estimated');
  assert.equal(instruments.countCaption({ players: 1, playersBasis: 'confirmed' }), '1 player · confirmed');
});

test('SVG renderer creates only local path symbols and never treats metadata as markup', () => {
  const doc = { createElementNS(ns, tag) { return { ns, tag, attributes: {}, children: [], setAttribute(key, value) { this.attributes[key] = value; }, append(child) { this.children.push(child); } }; } };
  const track = { ...beethoven.tracks[0], name: '<script>not markup</script>' };
  const area = layout.calculate(beethoven.tracks).find(item => item.id === track.id);
  const result = instruments.render(area, track, doc);
  assert.equal(result.attributes['data-count'], '4');
  assert.equal(result.children.filter(child => child.tag === 'g').length, 4);
  assert.equal(result.attributes['aria-hidden'], 'true');
  assert.ok(result.children.every(child => ['g', 'text'].includes(child.tag)));
  assert.equal(JSON.stringify(result).includes('<script>'), false);
});
