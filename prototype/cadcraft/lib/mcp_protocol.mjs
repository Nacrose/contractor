/**
 * CADCraft Headless MCP Protocol & Tool Inventory (v0.3.0).
 * Pinned per ADR-0015 and docs/vendor/ARTCRAFT.md.
 *
 * Implements the MCP (Model Context Protocol) JSON-RPC 2.0 interface
 * provided by upstream `apps/cadcraft-cli --mcp` and `crates/mcp`.
 */

export const CADCRAFT_VERSION = "0.3.0";
export const CADCRAFT_COMMIT = "a1c49b0712d93e1f0e4b8686d1a58bc9a803cf82";
export const CADCRAFT_UPSTREAM_URL = "https://github.com/storytold/cadcraft";
export const ACADRUST_VERSION = "0.6.1";
export const ACADRUST_CRATES_IO_LATEST = "0.6.3";

/**
 * CADCraft MCP Tool Inventory specification.
 */
export const CADCRAFT_MCP_TOOLS = [
  {
    name: "open_drawing",
    description: "Loads a 2D/3D CAD drawing file (DXF or DWG) into the headless document session.",
    inputSchema: {
      type: "object",
      properties: {
        path: { type: "string", description: "Absolute or relative path to DXF or DWG file" },
        format: { type: "string", enum: ["auto", "dxf", "dwg"], default: "auto" },
        targetVersion: { type: "string", description: "Target AutoCAD version code (e.g. AC1015, AC1032)" },
      },
      required: ["path"],
    },
    outputSchema: {
      type: "object",
      properties: {
        documentId: { type: "string" },
        format: { type: "string" },
        version: { type: "string" },
        entityCount: { type: "integer" },
        layerCount: { type: "integer" },
        blockCount: { type: "integer" },
        extents: {
          type: "object",
          properties: {
            min: { type: "array", items: { type: "number" } },
            max: { type: "array", items: { type: "number" } },
          },
        },
      },
      required: ["documentId", "format", "version", "entityCount"],
    },
  },
  {
    name: "export_drawing",
    description: "Serializes the active in-memory CAD database to a disk file as DXF or native DWG via acadrust.",
    inputSchema: {
      type: "object",
      properties: {
        documentId: { type: "string", description: "Active document ID" },
        outputPath: { type: "string", description: "Target file path" },
        format: { type: "string", enum: ["dxf", "dwg"], default: "dxf" },
        dwgVersion: {
          type: "string",
          enum: ["AC1015", "AC1018", "AC1021", "AC1024", "AC1027", "AC1032"],
          default: "AC1032",
          description: "Target DWG format version for acadrust writer",
        },
      },
      required: ["documentId", "outputPath"],
    },
    outputSchema: {
      type: "object",
      properties: {
        bytesWritten: { type: "integer" },
        format: { type: "string" },
        version: { type: "string" },
        checksumSha256: { type: "string" },
      },
      required: ["bytesWritten", "format"],
    },
  },
  {
    name: "query_entities",
    description: "Performs spatial and attribute queries over the drawing entity database using the R-tree index.",
    inputSchema: {
      type: "object",
      properties: {
        documentId: { type: "string" },
        layer: { type: "string", description: "Filter by layer name (e.g. 'WALLS')" },
        type: { type: "string", description: "Filter by entity type (LINE, CIRCLE, ARC, LWPOLYLINE, HATCH, INSERT, DIMENSION)" },
        bbox: {
          type: "object",
          properties: {
            minX: { type: "number" },
            minY: { type: "number" },
            maxX: { type: "number" },
            maxY: { type: "number" },
          },
        },
        handle: { type: "string", description: "Lookup by hex handle ID" },
      },
      required: ["documentId"],
    },
    outputSchema: {
      type: "object",
      properties: {
        matchedCount: { type: "integer" },
        entities: { type: "array", items: { type: "object" } },
      },
      required: ["matchedCount", "entities"],
    },
  },
  {
    name: "detect_snaps",
    description: "Finds geometric snap anchors (endpoint, midpoint, center, intersection, quadrant) near a 2D query point.",
    inputSchema: {
      type: "object",
      properties: {
        documentId: { type: "string" },
        point: {
          type: "object",
          properties: { x: { type: "number" }, y: { type: "number" } },
          required: ["x", "y"],
        },
        screenTolerancePx: { type: "number", default: 14 },
        worldTolerance: { type: "number", default: 0.05 },
        modes: {
          type: "array",
          items: { type: "string", enum: ["endpoint", "midpoint", "center", "intersection", "quadrant"] },
        },
      },
      required: ["documentId", "point"],
    },
    outputSchema: {
      type: "object",
      properties: {
        snapped: { type: "boolean" },
        snapPoint: {
          type: "object",
          properties: { x: { type: "number" }, y: { type: "number" } },
        },
        snapMode: { type: "string" },
        distance: { type: "number" },
        targetHandle: { type: "string" },
      },
      required: ["snapped"],
    },
  },
  {
    name: "calculate_area",
    description: "Calculates exact 2D polygon area, perimeter, and hole topology over selected boundary entities.",
    inputSchema: {
      type: "object",
      properties: {
        documentId: { type: "string" },
        entityHandles: { type: "array", items: { type: "string" } },
        tolerance: { type: "number", default: 0.001 },
      },
      required: ["documentId", "entityHandles"],
    },
    outputSchema: {
      type: "object",
      properties: {
        grossArea: { type: "number" },
        deductionsArea: { type: "number" },
        netArea: { type: "number" },
        perimeter: { type: "number" },
        holesCount: { type: "integer" },
        isValid: { type: "boolean" },
      },
      required: ["netArea", "perimeter", "isValid"],
    },
  },
  {
    name: "execute_command",
    description: "Dispatches an AutoCAD-compatible command line instruction (e.g. 'LINE 0,0 10,10' or 'ERASE 4F').",
    inputSchema: {
      type: "object",
      properties: {
        documentId: { type: "string" },
        command: { type: "string", description: "Command string or alias" },
        args: { type: "array", items: { type: "string" } },
      },
      required: ["documentId", "command"],
    },
    outputSchema: {
      type: "object",
      properties: {
        success: { type: "boolean" },
        modifiedEntities: { type: "array", items: { type: "string" } },
        prompt: { type: "string" },
      },
      required: ["success"],
    },
  },
  {
    name: "check_dwg_fidelity",
    description: "Runs open -> save -> reopen byte and entity differential comparison using acadrust DWG engine.",
    inputSchema: {
      type: "object",
      properties: {
        inputDwgPath: { type: "string" },
        targetVersion: { type: "string", default: "AC1032" },
      },
      required: ["inputDwgPath"],
    },
    outputSchema: {
      type: "object",
      properties: {
        inputVersion: { type: "string" },
        outputVersion: { type: "string" },
        sourceEntities: { type: "integer" },
        roundtrippedEntities: { type: "integer" },
        fidelityPercent: { type: "number" },
        divergences: { type: "array", items: { type: "string" } },
      },
      required: ["inputVersion", "outputVersion", "fidelityPercent"],
    },
  },
];

/**
 * Headless CADCraft MCP Client Simulator for prototyping.
 */
export class CadCraftMcpClient {
  constructor() {
    this.documents = new Map();
  }

  async callTool(name, args) {
    const toolDef = CADCRAFT_MCP_TOOLS.find((t) => t.name === name);
    if (!toolDef) {
      throw new Error(`Unknown CADCraft MCP tool: ${name}`);
    }

    switch (name) {
      case "open_drawing": {
        const docId = `cad_doc_${Math.random().toString(36).slice(2, 9)}`;
        const isDwg = args.path.toLowerCase().endsWith(".dwg");
        const doc = {
          id: docId,
          path: args.path,
          format: isDwg ? "dwg" : "dxf",
          version: isDwg ? "AC1015" : "AC1032",
          entities: [],
          layers: ["0", "WALLS", "DOORS", "COLUMNS", "GRID", "DIMENSIONS"],
        };
        this.documents.set(docId, doc);
        return {
          documentId: docId,
          format: doc.format,
          version: doc.version,
          entityCount: 142,
          layerCount: doc.layers.length,
          blockCount: 4,
          extents: { min: [0, 0, 0], max: [120, 85, 0] },
        };
      }
      case "export_drawing": {
        return {
          bytesWritten: args.format === "dwg" ? 48290 : 124500,
          format: args.format,
          version: args.dwgVersion || "AC1032",
          checksumSha256: "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
        };
      }
      case "query_entities": {
        return {
          matchedCount: 24,
          entities: [
            { handle: "3A", type: "LINE", layer: "WALLS", start: [0, 0], end: [10, 0] },
            { handle: "3B", type: "LWPOLYLINE", layer: "WALLS", vertices: [[0, 0], [10, 0], [10, 5], [0, 5]], closed: true },
          ],
        };
      }
      case "detect_snaps": {
        const { point } = args;
        const snapped = Math.abs(point.x - 10) < 0.1 && Math.abs(point.y - 0) < 0.1;
        return {
          snapped,
          snapPoint: snapped ? { x: 10, y: 0 } : null,
          snapMode: snapped ? "endpoint" : null,
          distance: snapped ? 0.02 : null,
          targetHandle: snapped ? "3A" : null,
        };
      }
      case "calculate_area": {
        return {
          grossArea: 50.0,
          deductionsArea: 2.5,
          netArea: 47.5,
          perimeter: 30.0,
          holesCount: 1,
          isValid: true,
        };
      }
      case "execute_command": {
        return {
          success: true,
          modifiedEntities: ["4F"],
          prompt: "Command completed.",
        };
      }
      case "check_dwg_fidelity": {
        return {
          inputVersion: "AC1015",
          outputVersion: args.targetVersion || "AC1032",
          sourceEntities: 142,
          roundtrippedEntities: 142,
          fidelityPercent: 99.8,
          divergences: [],
        };
      }
      default:
        throw new Error(`Handler not implemented for ${name}`);
    }
  }
}
