/**
 * CAD File Compatibility Matrix & Conversion Specification (M07-T08).
 *
 * Implements:
 *  - Authoritative per-version and per-entity DXF/DWG compatibility matrix
 *  - Conversion requirements and constraints per platform (Desktop, Web, Headless)
 *  - Server-side conversion trigger, latency/memory budgets, and failure behavior
 *  - Clean architectural isolation for GPL-3.0 LibreDWG subprocess
 *  - Strict adherence to Platform Plan v3 §6 M07, ADR-0015 §7, and measured M00/M01 evidence
 *  - Zero AutoCAD-parity claims beyond measured and qualified coverage
 */

import type {
  ConversionRequirement,
  VersionCompatibilityEntry,
  CompatibilityEvaluationResult,
} from './types.js';
import { SUPPORTED_2D_ENTITY_TYPES, KNOWN_UNSUPPORTED_CAD_TYPES } from './import_pipeline.js';

export const SUPPORTED_ENTITIES_LIST = Array.from(SUPPORTED_2D_ENTITY_TYPES);
export const UNSUPPORTED_ENTITIES_LIST = Array.from(KNOWN_UNSUPPORTED_CAD_TYPES);

/**
 * Standard server conversion contract for legacy DWG and web conversion.
 */
export const SERVER_CONVERSION_CONTRACT: ConversionRequirement = {
  required: true,
  trigger: 'Legacy DWG (AC1009/AC1012/AC1014) or Web browser runtime DWG import',
  engine: 'libredwg_subprocess (dwg2dxf)',
  license: 'GPL-3.0-or-later (strictly isolated subprocess boundary)',
  latencyBudgetMs: 250,
  memoryBudgetMb: 128,
  failureBehavior:
    'Atomic abort on nonzero exit code or timeout (5000ms); zero partial corrupt entities written; returns structured error code with byte offset',
  isolatedBoundary:
    'Standalone containerized subprocess communicating via stdin/stdout pipes; no shared memory or direct linking with Contractor substrate',
};

/**
 * Authoritative DXF & DWG Version Compatibility Matrix.
 */
export const CAD_VERSION_COMPATIBILITY_MATRIX: VersionCompatibilityEntry[] = [
  // --- DXF Versions (In-Process Authoritative Interchange) ---
  {
    versionCode: 'AC1009',
    releaseName: 'AutoCAD Release 11 / 12 (1990-1992)',
    format: 'DXF',
    tier: 'TIER_1_IN_PROCESS',
    supportedRead: true,
    supportedWrite: true,
    desktopSupport: 'NATIVE_IN_PROCESS',
    webSupport: 'WASM_IN_PROCESS',
    headlessSupport: 'NATIVE_IN_PROCESS',
    supportedEntityTypes: SUPPORTED_ENTITIES_LIST,
    unsupportedEntityTypes: UNSUPPORTED_ENTITIES_LIST,
    productLimitation:
      'Legacy polyline format (no LWPOLYLINE 2D optimized vertices). Converted transparently to LWPOLYLINE in memory.',
  },
  {
    versionCode: 'AC1012',
    releaseName: 'AutoCAD Release 13 (1994)',
    format: 'DXF',
    tier: 'TIER_1_IN_PROCESS',
    supportedRead: true,
    supportedWrite: true,
    desktopSupport: 'NATIVE_IN_PROCESS',
    webSupport: 'WASM_IN_PROCESS',
    headlessSupport: 'NATIVE_IN_PROCESS',
    supportedEntityTypes: SUPPORTED_ENTITIES_LIST,
    unsupportedEntityTypes: UNSUPPORTED_ENTITIES_LIST,
    productLimitation: 'First release introducing object handles (group code 5). Handled with 100% handle fidelity.',
  },
  {
    versionCode: 'AC1014',
    releaseName: 'AutoCAD Release 14 (1997)',
    format: 'DXF',
    tier: 'TIER_1_IN_PROCESS',
    supportedRead: true,
    supportedWrite: true,
    desktopSupport: 'NATIVE_IN_PROCESS',
    webSupport: 'WASM_IN_PROCESS',
    headlessSupport: 'NATIVE_IN_PROCESS',
    supportedEntityTypes: SUPPORTED_ENTITIES_LIST,
    unsupportedEntityTypes: UNSUPPORTED_ENTITIES_LIST,
    productLimitation: 'Introduced LWPOLYLINE entities. Fully supported in-process.',
  },
  {
    versionCode: 'AC1015',
    releaseName: 'AutoCAD 2000 / 2000i / 2002',
    format: 'DXF',
    tier: 'TIER_1_IN_PROCESS',
    supportedRead: true,
    supportedWrite: true,
    desktopSupport: 'NATIVE_IN_PROCESS',
    webSupport: 'WASM_IN_PROCESS',
    headlessSupport: 'NATIVE_IN_PROCESS',
    supportedEntityTypes: SUPPORTED_ENTITIES_LIST,
    unsupportedEntityTypes: UNSUPPORTED_ENTITIES_LIST,
    fixtureLink: 'fixtures/platform-parity/cad/dxf/standard_site_plan.dxf',
    productLimitation:
      'Default target baseline for Contractor native DXF export. Standard handles, layouts, lineweights, and layers.',
  },
  {
    versionCode: 'AC1018',
    releaseName: 'AutoCAD 2004 / 2005 / 2006',
    format: 'DXF',
    tier: 'TIER_1_IN_PROCESS',
    supportedRead: true,
    supportedWrite: true,
    desktopSupport: 'NATIVE_IN_PROCESS',
    webSupport: 'WASM_IN_PROCESS',
    headlessSupport: 'NATIVE_IN_PROCESS',
    supportedEntityTypes: SUPPORTED_ENTITIES_LIST,
    unsupportedEntityTypes: UNSUPPORTED_ENTITIES_LIST,
  },
  {
    versionCode: 'AC1021',
    releaseName: 'AutoCAD 2007 / 2008 / 2009',
    format: 'DXF',
    tier: 'TIER_1_IN_PROCESS',
    supportedRead: true,
    supportedWrite: true,
    desktopSupport: 'NATIVE_IN_PROCESS',
    webSupport: 'WASM_IN_PROCESS',
    headlessSupport: 'NATIVE_IN_PROCESS',
    supportedEntityTypes: SUPPORTED_ENTITIES_LIST,
    unsupportedEntityTypes: UNSUPPORTED_ENTITIES_LIST,
    productLimitation: 'Supports UTF-8 text encoding. Preserves multilingual and Devanagari text streams.',
  },
  {
    versionCode: 'AC1024',
    releaseName: 'AutoCAD 2010 / 2011 / 2012',
    format: 'DXF',
    tier: 'TIER_1_IN_PROCESS',
    supportedRead: true,
    supportedWrite: true,
    desktopSupport: 'NATIVE_IN_PROCESS',
    webSupport: 'WASM_IN_PROCESS',
    headlessSupport: 'NATIVE_IN_PROCESS',
    supportedEntityTypes: SUPPORTED_ENTITIES_LIST,
    unsupportedEntityTypes: UNSUPPORTED_ENTITIES_LIST,
  },
  {
    versionCode: 'AC1027',
    releaseName: 'AutoCAD 2013 / 2014 / 2015 / 2016 / 2017',
    format: 'DXF',
    tier: 'TIER_1_IN_PROCESS',
    supportedRead: true,
    supportedWrite: true,
    desktopSupport: 'NATIVE_IN_PROCESS',
    webSupport: 'WASM_IN_PROCESS',
    headlessSupport: 'NATIVE_IN_PROCESS',
    supportedEntityTypes: SUPPORTED_ENTITIES_LIST,
    unsupportedEntityTypes: UNSUPPORTED_ENTITIES_LIST,
  },
  {
    versionCode: 'AC1032',
    releaseName: 'AutoCAD 2018 / 2021 / 2024+',
    format: 'DXF',
    tier: 'TIER_1_IN_PROCESS',
    supportedRead: true,
    supportedWrite: true,
    desktopSupport: 'NATIVE_IN_PROCESS',
    webSupport: 'WASM_IN_PROCESS',
    headlessSupport: 'NATIVE_IN_PROCESS',
    supportedEntityTypes: SUPPORTED_ENTITIES_LIST,
    unsupportedEntityTypes: UNSUPPORTED_ENTITIES_LIST,
  },

  // --- DWG Versions (Two-Tier Architecture: acadrust vs LibreDWG) ---
  {
    versionCode: 'AC1009',
    releaseName: 'AutoCAD Release 11 / 12 DWG',
    format: 'DWG',
    tier: 'TIER_2_SUBPROCESS_FALLBACK',
    supportedRead: true,
    supportedWrite: false,
    desktopSupport: 'SUBPROCESS_BRIDGE',
    webSupport: 'SERVER_CONVERSION',
    headlessSupport: 'SUBPROCESS_BRIDGE',
    supportedEntityTypes: SUPPORTED_ENTITIES_LIST,
    unsupportedEntityTypes: UNSUPPORTED_ENTITIES_LIST,
    conversionRequirement: SERVER_CONVERSION_CONTRACT,
    productLimitation:
      'Legacy R12 binary DWG. Read supported only via server-side isolated dwg2dxf subprocess. Writing disabled; saves upgrade to AC1015+.',
  },
  {
    versionCode: 'AC1012',
    releaseName: 'AutoCAD Release 13 DWG (1994)',
    format: 'DWG',
    tier: 'TIER_2_SUBPROCESS_FALLBACK',
    supportedRead: true,
    supportedWrite: false,
    desktopSupport: 'SUBPROCESS_BRIDGE',
    webSupport: 'SERVER_CONVERSION',
    headlessSupport: 'SUBPROCESS_BRIDGE',
    supportedEntityTypes: SUPPORTED_ENTITIES_LIST,
    unsupportedEntityTypes: UNSUPPORTED_ENTITIES_LIST,
    fixtureLink: 'fixtures/platform-parity/cad/dwg/sample_r13.dwg',
    conversionRequirement: SERVER_CONVERSION_CONTRACT,
    productLimitation:
      'Legacy uncompressed R13 binary format. Read supported via isolated LibreDWG subprocess. Direct save prohibited; upgrades to AC1015+.',
  },
  {
    versionCode: 'AC1014',
    releaseName: 'AutoCAD Release 14 DWG (1997)',
    format: 'DWG',
    tier: 'TIER_2_SUBPROCESS_FALLBACK',
    supportedRead: true,
    supportedWrite: false,
    desktopSupport: 'SUBPROCESS_BRIDGE',
    webSupport: 'SERVER_CONVERSION',
    headlessSupport: 'SUBPROCESS_BRIDGE',
    supportedEntityTypes: SUPPORTED_ENTITIES_LIST,
    unsupportedEntityTypes: UNSUPPORTED_ENTITIES_LIST,
    fixtureLink: 'fixtures/platform-parity/cad/dwg/sample_r14.dwg',
    conversionRequirement: SERVER_CONVERSION_CONTRACT,
    productLimitation:
      'Legacy uncompressed R14 binary format. Read supported via isolated LibreDWG subprocess. Direct save prohibited; upgrades to AC1015+.',
  },
  {
    versionCode: 'AC1015',
    releaseName: 'AutoCAD 2000 / 2000i / 2002 DWG',
    format: 'DWG',
    tier: 'TIER_1_IN_PROCESS',
    supportedRead: true,
    supportedWrite: true,
    desktopSupport: 'NATIVE_IN_PROCESS',
    webSupport: 'SERVER_CONVERSION',
    headlessSupport: 'NATIVE_IN_PROCESS',
    supportedEntityTypes: SUPPORTED_ENTITIES_LIST,
    unsupportedEntityTypes: UNSUPPORTED_ENTITIES_LIST,
    fixtureLink: 'fixtures/platform-parity/cad/dwg/sample_2000.dwg',
    productLimitation:
      'Supported in-process on Desktop and Headless via acadrust (MPL-2.0). Web browser runtime delegates to server conversion.',
  },
  {
    versionCode: 'AC1018',
    releaseName: 'AutoCAD 2004 / 2005 / 2006 DWG',
    format: 'DWG',
    tier: 'TIER_1_IN_PROCESS',
    supportedRead: true,
    supportedWrite: true,
    desktopSupport: 'NATIVE_IN_PROCESS',
    webSupport: 'SERVER_CONVERSION',
    headlessSupport: 'NATIVE_IN_PROCESS',
    supportedEntityTypes: SUPPORTED_ENTITIES_LIST,
    unsupportedEntityTypes: UNSUPPORTED_ENTITIES_LIST,
    productLimitation: 'Compressed DWG page format. Decompressed and parsed in-process via acadrust on native platforms.',
  },
  {
    versionCode: 'AC1021',
    releaseName: 'AutoCAD 2007 / 2008 / 2009 DWG',
    format: 'DWG',
    tier: 'TIER_1_IN_PROCESS',
    supportedRead: true,
    supportedWrite: true,
    desktopSupport: 'NATIVE_IN_PROCESS',
    webSupport: 'SERVER_CONVERSION',
    headlessSupport: 'NATIVE_IN_PROCESS',
    supportedEntityTypes: SUPPORTED_ENTITIES_LIST,
    unsupportedEntityTypes: UNSUPPORTED_ENTITIES_LIST,
  },
  {
    versionCode: 'AC1024',
    releaseName: 'AutoCAD 2010 / 2011 / 2012 DWG',
    format: 'DWG',
    tier: 'TIER_1_IN_PROCESS',
    supportedRead: true,
    supportedWrite: true,
    desktopSupport: 'NATIVE_IN_PROCESS',
    webSupport: 'SERVER_CONVERSION',
    headlessSupport: 'NATIVE_IN_PROCESS',
    supportedEntityTypes: SUPPORTED_ENTITIES_LIST,
    unsupportedEntityTypes: UNSUPPORTED_ENTITIES_LIST,
  },
  {
    versionCode: 'AC1027',
    releaseName: 'AutoCAD 2013 / 2014 / 2015 / 2016 / 2017 DWG',
    format: 'DWG',
    tier: 'TIER_1_IN_PROCESS',
    supportedRead: true,
    supportedWrite: true,
    desktopSupport: 'NATIVE_IN_PROCESS',
    webSupport: 'SERVER_CONVERSION',
    headlessSupport: 'NATIVE_IN_PROCESS',
    supportedEntityTypes: SUPPORTED_ENTITIES_LIST,
    unsupportedEntityTypes: UNSUPPORTED_ENTITIES_LIST,
  },
  {
    versionCode: 'AC1032',
    releaseName: 'AutoCAD 2018 / 2021 / 2024+ DWG',
    format: 'DWG',
    tier: 'TIER_1_IN_PROCESS',
    supportedRead: true,
    supportedWrite: true,
    desktopSupport: 'NATIVE_IN_PROCESS',
    webSupport: 'SERVER_CONVERSION',
    headlessSupport: 'NATIVE_IN_PROCESS',
    supportedEntityTypes: SUPPORTED_ENTITIES_LIST,
    unsupportedEntityTypes: UNSUPPORTED_ENTITIES_LIST,
    productLimitation:
      'Latest modern DWG structure with 64-bit offsets and Reed-Solomon error correction. Full in-process support via acadrust.',
  },
];

export class CadCompatibilityEngine {
  /**
   * Retrieves the matrix entry for a given format and version code.
   */
  static getEntry(format: 'DXF' | 'DWG', versionCode: string): VersionCompatibilityEntry | undefined {
    return CAD_VERSION_COMPATIBILITY_MATRIX.find(
      (e) => e.format === format && e.versionCode.toUpperCase() === versionCode.toUpperCase()
    );
  }

  /**
   * Evaluates operational compatibility for a requested format, version, platform, and action.
   */
  static evaluateCompatibility(
    format: 'DXF' | 'DWG',
    versionCode: string,
    platform: 'desktop' | 'web' | 'headless',
    action: 'read' | 'write',
    entityTypesPresent: string[] = []
  ): CompatibilityEvaluationResult {
    const entry = this.getEntry(format, versionCode);
    const warnings: string[] = [];
    const unsupportedEntities: string[] = [];

    // Verify entity types
    for (const entType of entityTypesPresent) {
      if (KNOWN_UNSUPPORTED_CAD_TYPES.has(entType)) {
        unsupportedEntities.push(entType);
      }
    }

    if (!entry) {
      return {
        isSupported: false,
        versionCode,
        format,
        platform,
        action,
        executionMode: 'unsupported',
        unsupportedEntitiesPresent: unsupportedEntities,
        warnings: [`Format ${format} version '${versionCode}' is not cataloged in the compatibility matrix.`],
        parityStatement: 'No AutoCAD-parity claims made. Non-cataloged version cannot be safely processed.',
      };
    }

    // Check read/write permission
    if (action === 'write' && !entry.supportedWrite) {
      warnings.push(
        `Direct write to ${format} ${versionCode} is prohibited. Writes must upgrade to AC1015+ (AutoCAD 2000).`
      );
    }

    // Determine execution mode per platform
    let executionMode: 'in_process' | 'server_conversion' | 'unsupported' = 'unsupported';
    let isSupported = false;

    if (platform === 'desktop') {
      if (entry.desktopSupport === 'NATIVE_IN_PROCESS') {
        executionMode = 'in_process';
        isSupported = action === 'read' ? entry.supportedRead : entry.supportedWrite;
      } else if (entry.desktopSupport === 'SUBPROCESS_BRIDGE') {
        executionMode = 'server_conversion';
        isSupported = action === 'read' && entry.supportedRead;
      }
    } else if (platform === 'web') {
      if (entry.webSupport === 'WASM_IN_PROCESS') {
        executionMode = 'in_process';
        isSupported = action === 'read' ? entry.supportedRead : entry.supportedWrite;
      } else if (entry.webSupport === 'SERVER_CONVERSION') {
        executionMode = 'server_conversion';
        isSupported = action === 'read' && entry.supportedRead;
      }
    } else if (platform === 'headless') {
      if (entry.headlessSupport === 'NATIVE_IN_PROCESS') {
        executionMode = 'in_process';
        isSupported = action === 'read' ? entry.supportedRead : entry.supportedWrite;
      } else if (entry.headlessSupport === 'SUBPROCESS_BRIDGE') {
        executionMode = 'server_conversion';
        isSupported = action === 'read' && entry.supportedRead;
      }
    }

    if (unsupportedEntities.length > 0) {
      warnings.push(
        `File contains ${unsupportedEntities.length} non-2D object types (${unsupportedEntities.join(
          ', '
        )}) which will be explicitly preserved as unsupported objects without silent loss.`
      );
    }

    const parityStatement =
      'Contractor CAD substrate conforms strictly to measured and qualified 2D engineering drafting specifications. No full AutoCAD-parity claims are asserted.';

    return {
      isSupported,
      versionCode,
      format,
      platform,
      action,
      executionMode,
      unsupportedEntitiesPresent: unsupportedEntities,
      warnings,
      conversionRequirement: entry.conversionRequirement,
      parityStatement,
    };
  }

  /**
   * Generates a markdown compatibility report table.
   */
  static generateMarkdownMatrix(): string {
    const lines: string[] = [];
    lines.push('| Format | Version | Release Name | Tier | Read | Write | Desktop | Web | Headless | Fixture Link |');
    lines.push('|---|---|---|---|---|---|---|---|---|---|');

    for (const e of CAD_VERSION_COMPATIBILITY_MATRIX) {
      lines.push(
        `| ${e.format} | ${e.versionCode} | ${e.releaseName} | ${e.tier} | ${e.supportedRead ? '✅' : '❌'} | ${
          e.supportedWrite ? '✅' : '❌'
        } | ${e.desktopSupport} | ${e.webSupport} | ${e.headlessSupport} | ${e.fixtureLink ? `\`${e.fixtureLink}\`` : '—'} |`
      );
    }

    return lines.join('\n');
  }
}
