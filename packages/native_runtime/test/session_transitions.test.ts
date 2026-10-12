import test from 'node:test';
import assert from 'node:assert/strict';
import {
  DeepLinkRouter,
  SessionTransitionBridge,
  WebRuntimeHealthMonitor,
  DeepLinkTarget,
} from '../src/index.js';

test('DeepLinkRouter: formats and parses native URIs and web URLs across all 4 engineering engines', () => {
  const targets: DeepLinkTarget[] = [
    {
      engine: 'BOQ',
      organizationId: 'org-nepal-infra',
      projectId: 'proj-ktm-road',
      entityType: 'item',
      entityId: 'boq-item-102',
    },
    {
      engine: 'CAD',
      organizationId: 'org-nepal-infra',
      projectId: 'proj-ktm-road',
      entityType: 'drawing',
      entityId: 'dwg-bridge-elev',
      viewport: { zoom: 2.5, panX: 120.5, panY: -80.0, activeLayerOrSheet: 'BEAMS_REBAR' },
    },
    {
      engine: 'TAKEOFF',
      organizationId: 'org-nepal-infra',
      projectId: 'proj-ktm-road',
      entityType: 'sheet',
      entityId: 'sheet-ground-floor',
      viewport: { zoom: 1.0, panX: 0, panY: 0 },
    },
    {
      engine: 'SCHEDULE',
      organizationId: 'org-nepal-infra',
      projectId: 'proj-ktm-road',
      entityType: 'task',
      entityId: 'cpm-task-44',
    },
  ];

  for (const original of targets) {
    // 1. Format Native URI
    const nativeUri = DeepLinkRouter.formatNativeUri(original);
    assert.ok(nativeUri.startsWith('contractor://projects/proj-ktm-road/'));

    // 2. Parse Native URI
    const parsedNative = DeepLinkRouter.parse(nativeUri);
    assert.equal(parsedNative.engine, original.engine);
    assert.equal(parsedNative.organizationId, original.organizationId);
    assert.equal(parsedNative.projectId, original.projectId);
    assert.equal(parsedNative.entityType, original.entityType);
    assert.equal(parsedNative.entityId, original.entityId);
    if (original.viewport) {
      assert.equal(parsedNative.viewport?.zoom, original.viewport.zoom);
      assert.equal(parsedNative.viewport?.panX, original.viewport.panX);
      assert.equal(parsedNative.viewport?.panY, original.viewport.panY);
      assert.equal(parsedNative.viewport?.activeLayerOrSheet, original.viewport.activeLayerOrSheet);
    }

    // 3. Format Web URL
    const webUrl = DeepLinkRouter.formatWebUrl(original);
    assert.ok(webUrl.startsWith('https://app.contractor.com/projects/proj-ktm-road/'));

    // 4. Parse Web URL
    const parsedWeb = DeepLinkRouter.parse(webUrl);
    assert.equal(parsedWeb.engine, original.engine);
    assert.equal(parsedWeb.entityId, original.entityId);
  }
});

test('DeepLinkRouter: rejects malformed links or links without organization tenancy', () => {
  // Missing tenancy
  assert.throws(
    () => {
      DeepLinkRouter.parse('contractor://projects/p-1/boq/item/100');
    },
    (err: any) => {
      assert.ok(err.message.includes('missing mandatory organization tenancy'));
      return true;
    }
  );

  // Invalid path structure
  assert.throws(
    () => {
      DeepLinkRouter.parse('contractor://random/path?org=org-1');
    },
    (err: any) => {
      assert.ok(err.message.includes('Invalid deep link structure'));
      return true;
    }
  );
});

test('SessionTransitionBridge: creates, signs and single-use redeems transition tickets with viewport preservation', () => {
  const bridge = new SessionTransitionBridge('secret_test_key', 30000);

  const ticket = bridge.createTicket({
    token: 'jwt_mock_bearer_token_xyz',
    organizationId: 'org-nepal-infra',
    projectId: 'proj-01',
    userRole: 'PROJECT_MANAGER',
    targetRoute: '/projects/proj-01/cad/dwg-1',
    viewport: { zoom: 3.0, panX: 50, panY: 75, activeLayerOrSheet: 'STRUCTURAL' },
  });

  assert.ok(ticket.ticketId.startsWith('tkt_'));
  assert.ok(ticket.signature.startsWith('sig_'));
  assert.equal(ticket.userRole, 'PROJECT_MANAGER');
  assert.equal(ticket.viewport?.zoom, 3.0);

  // Redeem ticket
  const redeemed = bridge.redeemTicket(ticket.ticketId);
  assert.equal(redeemed.token, 'jwt_mock_bearer_token_xyz');
  assert.equal(redeemed.projectId, 'proj-01');
  assert.equal(redeemed.viewport?.panX, 50);

  // Second redemption must fail (single-use guarantee)
  assert.throws(
    () => {
      bridge.redeemTicket(ticket.ticketId);
    },
    (err: any) => {
      assert.ok(err.message.includes('Invalid or already redeemed'));
      return true;
    }
  );
});

test('SessionTransitionBridge: rejects expired tickets fail-closed', () => {
  const bridge = new SessionTransitionBridge('secret_test_key', -1000); // Already expired

  const ticket = bridge.createTicket({
    token: 'jwt_mock_token',
    organizationId: 'org-01',
    projectId: 'p-01',
    userRole: 'ESTIMATOR',
    targetRoute: '/boq',
  });

  assert.throws(
    () => {
      bridge.redeemTicket(ticket.ticketId);
    },
    (err: any) => {
      assert.ok(err.message.includes('has expired'));
      return true;
    }
  );
});

test('WebRuntimeHealthMonitor: triggers instant fallback route upon web runtime failure', () => {
  const monitor = new WebRuntimeHealthMonitor();

  monitor.registerFallback('/projects/p1/gantt', '/legacy/projects/p1/gantt');
  monitor.registerFallback('/projects/p1/boq', '/legacy/projects/p1/boq');

  assert.equal(monitor.isFallbackActive(), false);

  // Simulate Wasm/Canvas context error on Flutter Web route
  const fallbackTarget = monitor.reportRuntimeFault(
    '/projects/p1/gantt',
    new Error('WebGL Canvas Context Lost: Error creating WebAssembly engine instance.')
  );

  assert.equal(fallbackTarget, '/legacy/projects/p1/gantt');
  assert.equal(monitor.isFallbackActive(), true);

  // Reset after recovery
  monitor.resetHealth();
  assert.equal(monitor.isFallbackActive(), false);
});
