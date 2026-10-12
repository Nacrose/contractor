import test from 'node:test';
import assert from 'node:assert/strict';
import {
  RbacVisibilityEngine,
  ResponsiveLayoutEngine,
  ExportDeterminismEngine,
  AccessibilityKeyboardEngine,
  LocalizationFormatter,
  UserRole,
  UiAction,
} from '../src/index.js';

test('RbacVisibilityEngine: verifies role permissions matrix strictly matches across runtimes', () => {
  const superAdminActions = RbacVisibilityEngine.getAllowedActions('SUPERADMIN');
  assert.equal(superAdminActions.length, 7);
  assert.ok(RbacVisibilityEngine.isActionAllowed('SUPERADMIN', 'EDIT_BOQ'));
  assert.ok(RbacVisibilityEngine.isActionAllowed('SUPERADMIN', 'APPROVE_IPC'));

  // Site Engineer: can capture site photos, post muster rolls, but CANNOT edit BoQ or approve IPC
  assert.ok(RbacVisibilityEngine.isActionAllowed('SITE_ENGINEER', 'CAPTURE_SITE_PHOTO'));
  assert.ok(RbacVisibilityEngine.isActionAllowed('SITE_ENGINEER', 'POST_MUSTER_ROLL'));
  assert.equal(RbacVisibilityEngine.isActionAllowed('SITE_ENGINEER', 'EDIT_BOQ'), false);
  assert.equal(RbacVisibilityEngine.isActionAllowed('SITE_ENGINEER', 'APPROVE_IPC'), false);

  // Quantity Surveyor: can edit BoQ and export PDF, but CANNOT post muster roll or edit schedule network
  assert.ok(RbacVisibilityEngine.isActionAllowed('QUANTITY_SURVEYOR', 'EDIT_BOQ'));
  assert.equal(RbacVisibilityEngine.isActionAllowed('QUANTITY_SURVEYOR', 'POST_MUSTER_ROLL'), false);
  assert.equal(RbacVisibilityEngine.isActionAllowed('QUANTITY_SURVEYOR', 'EDIT_SCHEDULE_NETWORK'), false);

  // Accountant: can approve IPC, but CANNOT edit schedule network
  assert.ok(RbacVisibilityEngine.isActionAllowed('ACCOUNTANT', 'APPROVE_IPC'));
  assert.equal(RbacVisibilityEngine.isActionAllowed('ACCOUNTANT', 'EDIT_SCHEDULE_NETWORK'), false);

  // Client Viewer: strictly read-only
  assert.ok(RbacVisibilityEngine.isActionAllowed('CLIENT_VIEWER', 'VIEW_PROJECT'));
  assert.ok(RbacVisibilityEngine.isActionAllowed('CLIENT_VIEWER', 'EXPORT_PDF_REPORT'));
  assert.equal(RbacVisibilityEngine.isActionAllowed('CLIENT_VIEWER', 'EDIT_BOQ'), false);
  assert.equal(RbacVisibilityEngine.isActionAllowed('CLIENT_VIEWER', 'APPROVE_IPC'), false);
  assert.equal(RbacVisibilityEngine.isActionAllowed('CLIENT_VIEWER', 'CAPTURE_SITE_PHOTO'), false);
});

test('ResponsiveLayoutEngine: adapts layout fluidly from 360dp mobile to 3840px 4K', () => {
  // 1. Compact mobile (360dp)
  const mobile = ResponsiveLayoutEngine.resolveLayout(360);
  assert.equal(mobile.breakpoint, 'COMPACT_MOBILE');
  assert.equal(mobile.navigationStyle, 'BOTTOM_NAV');
  assert.equal(mobile.canvasColumns, 1);
  assert.equal(mobile.showPropertyInspector, false);

  // 2. Tablet (768px)
  const tablet = ResponsiveLayoutEngine.resolveLayout(768);
  assert.equal(tablet.breakpoint, 'TABLET');
  assert.equal(tablet.navigationStyle, 'COLLAPSIBLE_RAIL');
  assert.equal(tablet.canvasColumns, 2);
  assert.equal(tablet.showPropertyInspector, false);

  // 3. Desktop (1440px)
  const desktop = ResponsiveLayoutEngine.resolveLayout(1440);
  assert.equal(desktop.breakpoint, 'DESKTOP');
  assert.equal(desktop.navigationStyle, 'EXPANDABLE_DRAWER');
  assert.equal(desktop.canvasColumns, 3);
  assert.equal(desktop.showPropertyInspector, true);

  // 4. Ultra-wide 4K (3840px)
  const ultrawide = ResponsiveLayoutEngine.resolveLayout(3840);
  assert.equal(ultrawide.breakpoint, 'ULTRAWIDE_4K');
  assert.equal(ultrawide.navigationStyle, 'MULTI_COLUMN_DOCK');
  assert.equal(ultrawide.canvasColumns, 4);
  assert.equal(ultrawide.showPropertyInspector, true);
});

test('ExportDeterminismEngine: formats CSV deterministically with proper escaping', () => {
  const rows = [
    ['Item No', 'Description', 'Quantity', 'Rate', 'Amount'],
    ['1.01', 'Earthwork excavation in foundation, including 10m lead', 150.5, 450, 67725],
    ['1.02', 'PCC 1:2:4 with 20mm crushed stone "Grade M15"', 45.2, 8500, 384200],
  ];

  const csv = ExportDeterminismEngine.verifyDeterministicCsv(rows);
  assert.ok(csv.includes('"Earthwork excavation in foundation, including 10m lead"'));
  assert.ok(csv.includes('"PCC 1:2:4 with 20mm crushed stone ""Grade M15"""'));
  assert.ok(csv.includes('\r\n'));
});

test('AccessibilityKeyboardEngine: verifies standard canvas keyboard shortcuts and contrast', () => {
  // Undo & Redo
  assert.equal(AccessibilityKeyboardEngine.resolveShortcut('z', true, false), 'UNDO');
  assert.equal(AccessibilityKeyboardEngine.resolveShortcut('z', true, true), 'REDO');
  assert.equal(AccessibilityKeyboardEngine.resolveShortcut('y', true, false), 'REDO');

  // Save & Find
  assert.equal(AccessibilityKeyboardEngine.resolveShortcut('s', true, false), 'SAVE');
  assert.equal(AccessibilityKeyboardEngine.resolveShortcut('f', true, false), 'FIND');

  // Navigation
  assert.equal(AccessibilityKeyboardEngine.resolveShortcut('Escape', false, false), 'CANCEL_OR_DESELECT');
  assert.equal(AccessibilityKeyboardEngine.resolveShortcut('Tab', false, false), 'FOCUS_NEXT_CELL');

  // WCAG 2.1 AA Contrast Ratios
  // High contrast (black on white)
  const highContrast = AccessibilityKeyboardEngine.checkContrastRatio(1.0, 0.0);
  assert.ok(highContrast.passesWcagAA);
  assert.ok(highContrast.ratio >= 4.5);

  // Low contrast (gray on light gray)
  const lowContrast = AccessibilityKeyboardEngine.checkContrastRatio(0.6, 0.5);
  assert.equal(lowContrast.passesWcagAA, false);
});

test('LocalizationFormatter: formats South Asian currency with lakhs and crores', () => {
  // 1,00,000.00 NPR = 10,000,000 paisa
  const oneLakh = LocalizationFormatter.formatSouthAsianCurrency(10000000n, 'NPR');
  assert.equal(oneLakh, 'रू 1,00,000.00');

  // 12,34,56,789.50 NPR = 1,234,567,8950 paisa
  const croreAmount = LocalizationFormatter.formatSouthAsianCurrency(12345678950n, 'NPR');
  assert.equal(croreAmount, 'रू 12,34,56,789.50');

  // Negative currency value
  const negativeAmount = LocalizationFormatter.formatSouthAsianCurrency(-5000000n, 'NPR');
  assert.equal(negativeAmount, '-रू 50,000.00');

  // USD format with South Asian grouping
  const usdAmount = LocalizationFormatter.formatSouthAsianCurrency(15000000n, 'USD');
  assert.equal(usdAmount, '$ 1,50,000.00');
});

test('LocalizationFormatter: translates construction domain terminology to Nepali', () => {
  assert.equal(LocalizationFormatter.translate('project_name', 'ne'), 'आयोजनाको नाम');
  assert.equal(LocalizationFormatter.translate('boq_item', 'ne'), 'बिल अफ क्वान्टिटी विवरण');
  assert.equal(LocalizationFormatter.translate('measurement_sheet', 'ne'), 'नापी किताब (Measurement Sheet)');
  assert.equal(LocalizationFormatter.translate('ipc_billing', 'ne'), 'अन्तरिम भुक्तानी प्रमाणपत्र (IPC)');
  assert.equal(LocalizationFormatter.translate('muster_roll', 'ne'), 'ज्याला मस्टर रोल');
  assert.equal(LocalizationFormatter.translate('retention_money', 'ne'), 'धरौटी कट्टी (५%)');
  assert.equal(LocalizationFormatter.translate('value_added_tax', 'ne'), 'मूल्य अभिवृद्धि कर (१३%)');

  // Fallback to English
  assert.equal(LocalizationFormatter.translate('project_name', 'en'), 'Project Name');
  assert.equal(LocalizationFormatter.translate('retention_money', 'en'), 'Retention Money (5%)');
});
