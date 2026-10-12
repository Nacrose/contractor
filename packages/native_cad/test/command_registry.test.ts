import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  CadDocument,
  CadCommandRegistry,
  CadSelectionEngine,
  CadGripEngine,
  LineEntity,
  CircleEntity,
} from '../src/index.js';

// ---------------------------------------------------------------------------
// 1. Command Registry & Alias Resolution Tests
// ---------------------------------------------------------------------------

test('command registry resolves canonical names and standard aliases', () => {
  const registry = new CadCommandRegistry();

  assert.equal(registry.resolveCommandName('LINE'), 'LINE');
  assert.equal(registry.resolveCommandName('l'), 'LINE');
  assert.equal(registry.resolveCommandName('L'), 'LINE');

  assert.equal(registry.resolveCommandName('CIRCLE'), 'CIRCLE');
  assert.equal(registry.resolveCommandName('c'), 'CIRCLE');

  assert.equal(registry.resolveCommandName('PLINE'), 'PLINE');
  assert.equal(registry.resolveCommandName('pl'), 'PLINE');

  assert.equal(registry.resolveCommandName('ERASE'), 'ERASE');
  assert.equal(registry.resolveCommandName('e'), 'ERASE');
  assert.equal(registry.resolveCommandName('delete'), 'ERASE');

  assert.equal(registry.resolveCommandName('MOVE'), 'MOVE');
  assert.equal(registry.resolveCommandName('m'), 'MOVE');

  assert.equal(registry.resolveCommandName('UNDO'), 'UNDO');
  assert.equal(registry.resolveCommandName('u'), 'UNDO');

  assert.equal(registry.resolveCommandName('NONEXISTENT_COMMAND'), null);
});

test('command execution: creates entities strictly through command boundary', () => {
  const registry = new CadCommandRegistry();
  const doc = new CadDocument('doc_test_1');

  // Draw line via alias 'L'
  const lineRes = registry.execute(doc, 'L 0,0 100,50');
  assert.equal(lineRes.success, true);
  assert.equal(lineRes.commandName, 'LINE');
  assert.equal(lineRes.createdEntities?.length, 1);
  assert.equal(doc.getEntityCount(), 1);

  const line = lineRes.createdEntities![0] as LineEntity;
  assert.equal(line.start.x, 0);
  assert.equal(line.start.y, 0);
  assert.equal(line.end.x, 100);
  assert.equal(line.end.y, 50);

  // Draw circle via alias 'C'
  const circleRes = registry.execute(doc, 'C 100,50 25');
  assert.equal(circleRes.success, true);
  assert.equal(circleRes.commandName, 'CIRCLE');
  assert.equal(doc.getEntityCount(), 2);

  const circle = circleRes.createdEntities![0] as CircleEntity;
  assert.equal(circle.center.x, 100);
  assert.equal(circle.center.y, 50);
  assert.equal(circle.radius, 25);
});

// ---------------------------------------------------------------------------
// 2. Coordinate Parser & Input State Machine Tests
// ---------------------------------------------------------------------------

test('coordinate parser: parses absolute, relative Cartesian, and relative polar coordinates', () => {
  const registry = new CadCommandRegistry();
  const sm = registry.stateMachine;

  // Absolute
  const abs = sm.parseCoordinate('150.5, 200.25');
  assert.equal(abs.point.x, 150.5);
  assert.equal(abs.point.y, 200.25);
  assert.equal(abs.isRelative, false);

  // Set base point
  sm.setLastPoint({ x: 100, y: 100 });

  // Relative Cartesian '@20,-30'
  const relCart = sm.parseCoordinate('@20,-30');
  assert.equal(relCart.point.x, 120);
  assert.equal(relCart.point.y, 70);
  assert.equal(relCart.isRelative, true);
  assert.equal(relCart.isPolar, false);

  // Relative polar '@50<90' (50 units straight up)
  const relPolar = sm.parseCoordinate('@50<90');
  assert.equal(Math.round(relPolar.point.x), 100);
  assert.equal(Math.round(relPolar.point.y), 150);
  assert.equal(relPolar.isRelative, true);
  assert.equal(relPolar.isPolar, true);

  // Direct distance entry with cursor hint
  const directDist = sm.parseCoordinate('50', { x: 150, y: 100 }, false);
  assert.equal(directDist.point.x, 150);
  assert.equal(directDist.point.y, 100);
});

test('input state machine: Escape cancels in-flight command; Enter repeats last command', () => {
  const registry = new CadCommandRegistry();
  const doc = new CadDocument();
  const sm = registry.stateMachine;

  // Partial LINE command prompt
  registry.execute(doc, 'LINE');
  assert.equal(sm.getActiveCommand(), 'LINE');
  assert.equal(sm.getPrompt(), 'Specify first point:');

  // Cancel via Escape
  const cancelRes = sm.cancel();
  assert.equal(cancelRes.cancelledCommand, 'LINE');
  assert.equal(sm.getActiveCommand(), null);
  assert.equal(sm.getPrompt(), 'Command:');

  // Complete a command
  registry.execute(doc, 'CIRCLE 0,0 10');
  assert.equal(sm.getLastCommand(), 'CIRCLE');

  // Enter/Space on empty line triggers repeatLastCommand
  const repeated = sm.repeatLastCommand();
  assert.equal(repeated, 'CIRCLE');
});

test('ortho mode: restricts cursor delta to 90-degree orthogonal axes', () => {
  const registry = new CadCommandRegistry();
  const doc = new CadDocument();
  const sm = registry.stateMachine;

  sm.setLastPoint({ x: 0, y: 0 });

  // Horizontal dominant: (100, 20) -> snaps to (100, 0)
  const ptHoriz = sm.applyOrtho({ x: 100, y: 20 });
  assert.equal(ptHoriz.x, 100);
  assert.equal(ptHoriz.y, 0);

  // Vertical dominant: (20, 100) -> snaps to (0, 100)
  const ptVert = sm.applyOrtho({ x: 20, y: 100 });
  assert.equal(ptVert.x, 0);
  assert.equal(ptVert.y, 100);

  // Command toggle
  registry.execute(doc, 'ORTHO ON');
  assert.equal(doc.ortho.enabled, true);
  registry.execute(doc, 'ORTHO OFF');
  assert.equal(doc.ortho.enabled, false);
});

test('object snapping: finds endpoint, midpoint, center, and quadrant anchors', () => {
  const registry = new CadCommandRegistry();
  const doc = new CadDocument();
  const sm = registry.stateMachine;

  registry.execute(doc, 'LINE 0,0 100,0');
  registry.execute(doc, 'CIRCLE 50,50 20');

  // Endpoint snap near (100, 0)
  const snapEnd = sm.findSnap(doc, { x: 99.8, y: 0.1 }, 1.0, ['endpoint']);
  assert.ok(snapEnd);
  assert.equal(snapEnd!.mode, 'endpoint');
  assert.equal(snapEnd!.point.x, 100);
  assert.equal(snapEnd!.point.y, 0);

  // Midpoint snap near (50, 0)
  const snapMid = sm.findSnap(doc, { x: 50.2, y: 0.1 }, 1.0, ['midpoint']);
  assert.ok(snapMid);
  assert.equal(snapMid!.mode, 'midpoint');
  assert.equal(snapMid!.point.x, 50);
  assert.equal(snapMid!.point.y, 0);

  // Center snap near (50, 50)
  const snapCenter = sm.findSnap(doc, { x: 50.1, y: 49.9 }, 1.0, ['center']);
  assert.ok(snapCenter);
  assert.equal(snapCenter!.mode, 'center');
  assert.equal(snapCenter!.point.x, 50);
  assert.equal(snapCenter!.point.y, 50);

  // Quadrant snap near top of circle (50, 70)
  const snapQuad = sm.findSnap(doc, { x: 50.1, y: 69.8 }, 1.0, ['quadrant']);
  assert.ok(snapQuad);
  assert.equal(snapQuad!.mode, 'quadrant');
  assert.equal(snapQuad!.point.x, 50);
  assert.equal(snapQuad!.point.y, 70);
});

// ---------------------------------------------------------------------------
// 3. Selection & Grip Semantics Tests
// ---------------------------------------------------------------------------

test('selection semantics: window selection vs crossing selection', () => {
  const doc = new CadDocument();
  const selector = new CadSelectionEngine();

  // Create 2 lines: L1 (0,0 to 10,10), L2 (50,50 to 60,60)
  doc._insertEntity({
    handle: 'L1',
    type: 'LINE',
    layer: '0',
    start: { x: 0, y: 0 },
    end: { x: 10, y: 10 },
  });
  doc._insertEntity({
    handle: 'L2',
    type: 'LINE',
    layer: '0',
    start: { x: 50, y: 50 },
    end: { x: 60, y: 60 },
  });

  // Window selection (left to right: x1= -5, x2= 20): fully encloses L1 only
  const winSelected = selector.selectByBox(doc, { x: -5, y: -5 }, { x: 20, y: 20 });
  assert.deepEqual(winSelected, ['L1']);

  selector.clear();

  // Window selection box covering half of L1 (left to right: x1= -5, x2= 5): does NOT enclose L1
  const winHalf = selector.selectByBox(doc, { x: -5, y: -5 }, { x: 5, y: 5 });
  assert.deepEqual(winHalf, []);

  selector.clear();

  // Crossing selection covering half of L1 (right to left: x1= 5, x2= -5): DOES select L1 by intersection!
  const crossHalf = selector.selectByBox(doc, { x: 5, y: 5 }, { x: -5, y: -5 });
  assert.deepEqual(crossHalf, ['L1']);
});

test('grip extraction and hot grip manipulation', () => {
  const doc = new CadDocument();
  const gripEngine = new CadGripEngine();

  const line: LineEntity = {
    handle: '1A',
    type: 'LINE',
    layer: '0',
    start: { x: 0, y: 0 },
    end: { x: 100, y: 0 },
  };
  doc._insertEntity(line);

  // Extract grips: 2 endpoints + 1 midpoint
  const grips = gripEngine.extractGrips([line]);
  assert.equal(grips.length, 3);
  assert.equal(grips[0].type, 'endpoint');
  assert.equal(grips[1].type, 'midpoint');
  assert.equal(grips[2].type, 'endpoint');

  // Stretch end grip to (100, 50)
  const stretched = gripEngine.applyGripMove(line, grips[2], { x: 100, y: 50 }) as LineEntity;
  assert.equal(stretched.end.x, 100);
  assert.equal(stretched.end.y, 50);
  assert.equal(stretched.start.x, 0); // start unchanged
});

// ---------------------------------------------------------------------------
// 4. Compensating Undo & Redo Tests
// ---------------------------------------------------------------------------

test('compensating undo and redo reverts and reapplies command actions', () => {
  const registry = new CadCommandRegistry();
  const doc = new CadDocument();

  // 1. Draw line
  registry.execute(doc, 'LINE 0,0 100,0');
  assert.equal(doc.getEntityCount(), 1);
  const lineHandle = doc.getAllEntities()[0].handle;

  // 2. Erase line
  registry.execute(doc, `ERASE ${lineHandle}`);
  assert.equal(doc.getEntityCount(), 0);

  // 3. Undo ERASE
  registry.execute(doc, 'U');
  assert.equal(doc.getEntityCount(), 1);
  assert.ok(doc.getEntity(lineHandle));

  // 4. Redo ERASE
  registry.execute(doc, 'REDO');
  assert.equal(doc.getEntityCount(), 0);

  // 5. Undo again to restore
  registry.execute(doc, 'U');
  assert.equal(doc.getEntityCount(), 1);

  // 6. Undo LINE creation
  registry.execute(doc, 'U');
  assert.equal(doc.getEntityCount(), 0);
});
