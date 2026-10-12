/**
 * CAD Revision Checks, Atomic Group Operations, and Conflict Resolution (M07-T07).
 *
 * Implements:
 *  - Entity-level revision tracking and stale writer detection
 *  - Atomic group operation validation (all-or-nothing execution)
 *  - Atomic topology validation (rejection of partial topology-breaking groups)
 *  - Intent preservation for conflict review (never silent last-write-wins)
 *  - Explicit conflict resolution review workflows (Overwrite, Rebase, Discard)
 *  - Conformance with Platform Plan v3 §5.4 CAD row
 */

import type {
  CadEntity,
  LineEntity,
  LwPolylineEntity,
  Point2D,
  CadGroupOperation,
  CadConflictRecord,
  GroupOperationResult,
  EntityMutationSpec,
} from './types.js';
import { CadDocument } from './cad_document.js';
import { validatePolygon, calculatePolygonAreaWithHoles } from './topology.js';

export class CadRevisionEngine {
  /**
   * Applies an atomic group operation with revision preconditions and topology validation.
   * If any precondition fails or topology is broken, the entire group is rejected atomically
   * and a conflict record is created with author intent preserved for review.
   */
  static applyGroupOperation(
    doc: CadDocument,
    op: CadGroupOperation
  ): GroupOperationResult {
    const conflictingHandles: string[] = [];
    const expectedRevisions: Record<string, number> = {};
    const actualRevisions: Record<string, number> = {};

    // 1. Precondition Check: Stale Writer Detection
    for (const mutation of op.mutations) {
      if (mutation.action === 'UPDATE' || mutation.action === 'DELETE') {
        const existing = doc.getEntity(mutation.handle);
        if (!existing) {
          const conflict: CadConflictRecord = {
            conflictId: `conf_${Math.random().toString(36).slice(2, 9)}`,
            operationId: op.id,
            authorId: op.authorId,
            timestamp: Date.now(),
            reason: 'ENTITY_NOT_FOUND',
            conflictingHandles: [mutation.handle],
            expectedRevisions: {},
            actualRevisions: {},
            rejectedMutations: op.mutations,
            status: 'PENDING_REVIEW',
          };
          doc.conflictRecords.push(conflict);
          return {
            success: false,
            operationId: op.id,
            affectedHandles: [],
            conflict,
          };
        }

        const currRev = existing.revision ?? 1;
        if (
          mutation.expectedRevision !== undefined &&
          mutation.expectedRevision !== currRev
        ) {
          conflictingHandles.push(mutation.handle);
          expectedRevisions[mutation.handle] = mutation.expectedRevision;
          actualRevisions[mutation.handle] = currRev;
        }
      }
    }

    if (conflictingHandles.length > 0) {
      // Stale writer detected! Reject operation atomically and preserve intent
      const conflict: CadConflictRecord = {
        conflictId: `conf_${Math.random().toString(36).slice(2, 9)}`,
        operationId: op.id,
        authorId: op.authorId,
        timestamp: Date.now(),
        reason: 'STALE_WRITER_CONFLICT',
        conflictingHandles,
        expectedRevisions,
        actualRevisions,
        rejectedMutations: op.mutations,
        status: 'PENDING_REVIEW',
      };
      doc.conflictRecords.push(conflict);
      return {
        success: false,
        operationId: op.id,
        affectedHandles: [],
        conflict,
      };
    }

    // 2. Atomic Topology Validation (if requested)
    if (op.requiresTopologyValidation && op.topologyValidationScope) {
      const topologyErrors: string[] = [];
      const scratchMap = new Map<string, CadEntity>();

      // Populate scratch map with current entities
      for (const e of doc.getAllEntities()) {
        scratchMap.set(e.handle, JSON.parse(JSON.stringify(e)));
      }

      // Apply mutations in scratch space
      for (const m of op.mutations) {
        if (m.action === 'DELETE') {
          scratchMap.delete(m.handle);
        } else if (m.action === 'UPDATE' && m.entity) {
          scratchMap.set(m.handle, JSON.parse(JSON.stringify(m.entity)));
        } else if (m.action === 'CREATE' && m.entity) {
          scratchMap.set(m.handle, JSON.parse(JSON.stringify(m.entity)));
        }
      }

      // Reconstruct contour vertices from scope handles
      const contourVertices: Point2D[] = [];
      for (const h of op.topologyValidationScope.contourHandles) {
        const ent = scratchMap.get(h);
        if (!ent) {
          topologyErrors.push(`Contour boundary entity handle ${h} is missing`);
          continue;
        }
        if (ent.type === 'LINE') {
          const l = ent as LineEntity;
          contourVertices.push({ ...l.start }, { ...l.end });
        } else if (ent.type === 'LWPOLYLINE') {
          const p = ent as LwPolylineEntity;
          contourVertices.push(...p.vertices.map((v) => ({ ...v })));
        }
      }

      // Validate outer boundary polygon
      if (contourVertices.length >= 3) {
        const validation = validatePolygon(contourVertices);
        if (!validation.isValid) {
          topologyErrors.push(
            validation.error || 'Invalid non-closed or degenerate boundary contour'
          );
        }
      } else {
        topologyErrors.push('Contour does not contain sufficient vertices (minimum 3 required)');
      }

      if (topologyErrors.length > 0) {
        // Topology violation! Reject group atomically; NO partial mutation applied
        const conflict: CadConflictRecord = {
          conflictId: `conf_${Math.random().toString(36).slice(2, 9)}`,
          operationId: op.id,
          authorId: op.authorId,
          timestamp: Date.now(),
          reason: 'TOPOLOGY_VIOLATION',
          conflictingHandles: op.mutations.map((m) => m.handle),
          expectedRevisions: {},
          actualRevisions: {},
          rejectedMutations: op.mutations,
          topologyErrors,
          status: 'PENDING_REVIEW',
        };
        doc.conflictRecords.push(conflict);
        return {
          success: false,
          operationId: op.id,
          affectedHandles: [],
          conflict,
        };
      }
    }

    // 3. Atomic Commit: All checks passed, apply mutations to document
    const affectedHandles: string[] = [];
    const now = Date.now();

    for (const m of op.mutations) {
      if (m.action === 'DELETE') {
        doc._removeEntity(m.handle);
        affectedHandles.push(m.handle);
      } else if (m.action === 'UPDATE' && m.entity) {
        const entityToUpdate = { ...m.entity, updatedBy: op.authorId, updatedAt: now };
        doc._updateEntity(entityToUpdate);
        affectedHandles.push(m.handle);
      } else if (m.action === 'CREATE' && m.entity) {
        const entityToInsert = { ...m.entity, updatedBy: op.authorId, updatedAt: now };
        doc._insertEntity(entityToInsert);
        affectedHandles.push(m.handle);
      }
    }

    return {
      success: true,
      operationId: op.id,
      appliedDocumentRevision: doc.revision,
      affectedHandles,
    };
  }

  /**
   * Retrieves pending conflicts awaiting human review.
   */
  static getPendingConflicts(doc: CadDocument): CadConflictRecord[] {
    return doc.conflictRecords.filter((c) => c.status === 'PENDING_REVIEW');
  }

  /**
   * Resolves a pending conflict with explicit human sign-off.
   */
  static resolveConflict(
    doc: CadDocument,
    conflictId: string,
    resolution: 'OVERWRITE' | 'REBASE' | 'DISCARD'
  ): GroupOperationResult {
    const conflict = doc.conflictRecords.find((c) => c.conflictId === conflictId);
    if (!conflict) {
      throw new Error(`Conflict record with id '${conflictId}' not found`);
    }

    if (resolution === 'DISCARD') {
      conflict.status = 'RESOLVED_DISCARD';
      return {
        success: true,
        operationId: conflict.operationId,
        affectedHandles: [],
      };
    }

    if (resolution === 'OVERWRITE') {
      // Force apply the author's rejected intent
      conflict.status = 'RESOLVED_OVERWRITE';
      const now = Date.now();
      const affectedHandles: string[] = [];

      for (const m of conflict.rejectedMutations) {
        if (m.action === 'DELETE') {
          doc._removeEntity(m.handle);
          affectedHandles.push(m.handle);
        } else if (m.action === 'UPDATE' && m.entity) {
          doc._updateEntity({ ...m.entity, updatedBy: conflict.authorId, updatedAt: now });
          affectedHandles.push(m.handle);
        } else if (m.action === 'CREATE' && m.entity) {
          doc._insertEntity({ ...m.entity, updatedBy: conflict.authorId, updatedAt: now });
          affectedHandles.push(m.handle);
        }
      }

      return {
        success: true,
        operationId: conflict.operationId,
        appliedDocumentRevision: doc.revision,
        affectedHandles,
      };
    }

    if (resolution === 'REBASE') {
      conflict.status = 'RESOLVED_REBASE';
      // Re-query latest revisions and re-attempt
      const rebasedMutations: EntityMutationSpec[] = conflict.rejectedMutations.map((m) => {
        const current = doc.getEntity(m.handle);
        return {
          ...m,
          expectedRevision: current?.revision,
        };
      });

      const rebasedOp: CadGroupOperation = {
        id: `${conflict.operationId}_rebased`,
        name: `Rebased ${conflict.operationId}`,
        authorId: conflict.authorId,
        baseDocumentRevision: doc.revision,
        mutations: rebasedMutations,
      };

      return this.applyGroupOperation(doc, rebasedOp);
    }

    throw new Error(`Unsupported resolution mode: ${resolution}`);
  }
}
