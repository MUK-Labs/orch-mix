'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const model = require('../app/model.js');
const layout = require('../app/layout.js');

function area(points) {
  return Math.abs(points.reduce((sum, [x, y], i) => {
    const next = points[(i + 1) % points.length];
    return sum + x * next[1] - next[0] * y;
  }, 0)) / 2;
}

function inside([x, y], points) {
  let contained = false;
  for (let i = 0, j = points.length - 1; i < points.length; j = i++) {
    const [ax, ay] = points[i], [bx, by] = points[j];
    if ((ay > y) !== (by > y) && x < (bx - ax) * (y - ay) / (by - ay) + ax) contained = !contained;
  }
  return contained;
}

function cross(a, b, c) {
  return (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);
}

function overlaps(a, b) {
  if (inside(a[0], b) || inside(b[0], a)) return true;
  for (let i = 0; i < a.length; i += 1) {
    for (let j = 0; j < b.length; j += 1) {
      const p = a[i], q = a[(i + 1) % a.length], r = b[j], s = b[(j + 1) % b.length];
      if (cross(p, q, r) * cross(p, q, s) < -1e-7 && cross(r, s, p) * cross(r, s, q) < -1e-7) return true;
    }
  }
  return false;
}

function checkGeometry(tracks) {
  const regions = layout.calculate(tracks);
  assert.equal(regions.length, tracks.length);
  assert.equal(new Set(regions.map(region => region.id)).size, tracks.length);
  for (const region of regions) {
    assert.ok(region.points.length >= 4);
    assert.ok(area(region.points) > 1000, 'region has useful area: ' + region.id);
    assert.ok(inside([region.label.x, region.label.y], region.points), 'label inside region: ' + region.id);
    for (const [x, y] of region.points) {
      assert.ok(Number.isFinite(x) && Number.isFinite(y));
      assert.ok(x >= 15 && x <= 985 && y >= 10 && y <= 530, 'point inside viewBox');
    }
  }
  for (let i = 0; i < regions.length; i += 1) {
    for (let j = i + 1; j < regions.length; j += 1) {
      assert.equal(overlaps(regions[i].points, regions[j].points), false, regions[i].id + ' overlaps ' + regions[j].id);
    }
  }
  assert.deepEqual(layout.calculate([...tracks].reverse()), regions, 'file picker order does not change seating');
  return regions;
}

test('empty layout is empty and a solo stem uses the available fan', () => {
  assert.deepEqual(layout.calculate([]), []);
  const [solo] = checkGeometry([{ id: 'fl', family: 'woodwinds' }]);
  assert.equal(solo.row, 'middle');
  assert.ok(area(solo.points) > 330000);
  assert.ok(Math.min(...solo.points.map(point => point[0])) < 30);
  assert.ok(Math.max(...solo.points.map(point => point[0])) > 970);
});

test('the normal orchestra follows family rows and conventional left-to-right order', () => {
  const regions = checkGeometry(model.DEFAULT_TRACKS);
  assert.deepEqual(regions.map(region => region.id), model.DEFAULT_TRACKS.map(track => track.id));
  assert.deepEqual(regions.map(region => region.row), ['front', 'front', 'front', 'front', 'front', 'middle', 'middle', 'middle', 'middle', 'back', 'back', 'rear']);
  for (const row of model.SEAT_ROWS) {
    const members = regions.filter(region => region.row === row);
    assert.deepEqual(members.map(region => region.label.x), members.map(region => region.label.x).sort((a, b) => a - b));
  }
});

test('inferred IDs retain instrument ordering and numeric section suffix order', () => {
  const tracks = [
    { id: 'cb-4', family: 'strings' }, { id: 'vln1-10', family: 'strings' },
    { id: 'vln2-1', family: 'strings' }, { id: 'vln1-2', family: 'strings' }
  ];
  assert.deepEqual(layout.calculate(tracks).map(region => region.id), ['vln1-2', 'vln1-10', 'vln2-1', 'cb-4']);
});

test('absent families leave no empty seating bands', () => {
  const strings = model.DEFAULT_TRACKS.filter(track => track.family === 'strings');
  const winds = strings.map(track => ({ ...track, family: 'woodwinds' }));
  const a = checkGeometry(strings), b = checkGeometry(winds);
  assert.deepEqual(a.map(region => region.points), b.map(region => region.points));
  assert.ok(a.reduce((sum, region) => sum + area(region.points), 0) > 330000);
});

test('48 stems use nonoverlapping usable regions even in one family', () => {
  const tracks = Array.from({ length: 48 }, (_, index) => ({ id: 'vln1-' + index, family: 'strings' }));
  const regions = checkGeometry(tracks);
  // Six bands of eight: the next band's first label returns to the left.
  assert.ok(regions[8].label.x < regions[7].label.x);
  assert.ok(regions[16].label.x < regions[15].label.x);
  checkGeometry(tracks.map((track, index) => ({ ...track, family: model.FAMILIES[index % 4] })));
});

test('validated seating overrides alter row, order and relative width', () => {
  const tracks = [
    { id: 'fl', family: 'woodwinds', seat: { row: 'front', order: -1, weight: 4 } },
    { id: 'vln1', family: 'strings', seat: { row: 'front', order: 4, weight: 0.25 } },
    { id: 'harp', family: 'percussion', seat: { row: 'front', order: 1 } }
  ];
  const regions = checkGeometry(tracks);
  assert.deepEqual(regions.map(region => region.id), ['fl', 'harp', 'vln1']);
  assert.ok(regions.every(region => region.row === 'front'));
  assert.ok(area(regions[0].points) > area(regions[1].points));
  assert.ok(area(regions[1].points) > area(regions[2].points));
  assert.deepEqual(tracks[0].seat, { row: 'front', order: -1, weight: 4 });
});
