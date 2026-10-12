/**
 * Central Material Delivery / MRR (Material Receipt Report) Engine (M05-T04).
 *
 * Implements the domain and office review invariants required by platform plan v3 §6 M05 bullet 2:
 *  - MRR / delivery submissions flow through field-submission ingestion and
 *    daily-report-sync normalization exactly as today; reconciliation service's
 *    semantics are untouched.
 *  - Office review (accept/reject/adjust) remains a distinct server-authoritative
 *    action; field devices observe review outcomes through M03-T04/T05 sync surfaces,
 *    not through client-side state mutation.
 *  - Material reconciliation results are computed server-side from the same inputs
 *    as the current app — parity pinned by test.
 *  - The delivery writer set is dispositioned against the M00 inventories.
 */

export interface MaterialDeliveryItemInput {
  materialCode: string;
  materialName: string;
  quantity: number;
  unit: string;
  remarks?: string;
}

export interface MaterialDeliverySubmissionInput {
  clientUuid: string;
  projectId: string;
  deliveryDate: string; // YYYY-MM-DD
  supplierName: string;
  challanNumber: string;
  vehicleNumber?: string;
  items: MaterialDeliveryItemInput[];
  receiptPhotoIds?: string[];
  remarks?: string;
  submittedBy: string;
  submittedAt: string;
}

export type MaterialReviewAction = "accept" | "reject" | "adjust";
export type MaterialReviewStatus = "pending" | "accepted" | "rejected" | "adjusted";

export interface DeliveryAuditTrailEntry {
  actorId: string;
  actorRole: string;
  action: "submit" | "office_accept" | "office_reject" | "office_adjust";
  timestamp: string;
  changes?: Record<string, { from?: unknown; to?: unknown }>;
  reviewNotes?: string;
}

export interface DurableDeliveryReceipt {
  opId: string;
  receiptId: string;
  serverSeq: number;
  generatedAt: string;
  immutable: true;
}

export interface MaterialReconciliationResult {
  materialCode: string;
  materialName: string;
  deliveredQuantity: number;
  acceptedQuantity: number;
  unit: string;
  reconciliationStatus: "balanced" | "discrepancy";
  discrepancyNote?: string;
}

export interface MaterialDeliveryEntity {
  id: string;
  clientUuid: string;
  projectId: string;
  deliveryDate: string;
  supplierName: string;
  challanNumber: string;
  vehicleNumber: string;
  items: MaterialDeliveryItemInput[];
  receiptPhotoIds: string[];
  remarks: string;
  submittedBy: string;
  submittedAt: string;
  reviewStatus: MaterialReviewStatus;
  reviewedBy?: string;
  reviewedAt?: string;
  reviewNotes?: string;
  originalDelivery: {
    supplierName: string;
    challanNumber: string;
    items: MaterialDeliveryItemInput[];
    remarks: string;
  };
  reconciledInventory: boolean;
  reconciliationRunId?: string;
  reconciliationResults?: MaterialReconciliationResult[];
  auditTrail: DeliveryAuditTrailEntry[];
  durableReceipt: DurableDeliveryReceipt;
}

/**
 * Validates and ingests a material delivery (MRR) submission from the field.
 * Invariant: Lands in 'pending' review state; inventory is not reconciled yet.
 */
export function ingestMaterialDeliverySubmission(args: {
  input: MaterialDeliverySubmissionInput;
  serverSeq: number;
  serverReceivedAt: string;
  actorRole?: string;
}): MaterialDeliveryEntity {
  const { input, serverSeq, serverReceivedAt, actorRole = "site_engineer" } = args;

  if (!input.clientUuid || input.clientUuid.length < 8) {
    throw new Error("Validation failed: clientUuid must be at least 8 characters.");
  }
  if (!input.projectId || input.projectId.trim() === "") {
    throw new Error("Validation failed: projectId is required.");
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.deliveryDate)) {
    throw new Error("Validation failed: deliveryDate must follow YYYY-MM-DD format.");
  }
  if (!input.supplierName || input.supplierName.trim() === "") {
    throw new Error("Validation failed: supplierName is required for MRR submissions.");
  }
  if (!input.challanNumber || input.challanNumber.trim() === "") {
    throw new Error("Validation failed: challanNumber is required for MRR submissions.");
  }
  if (!input.items || input.items.length === 0) {
    throw new Error("Validation failed: at least one delivery item is required.");
  }
  for (const item of input.items) {
    if (item.quantity <= 0) {
      throw new Error(`Validation failed: item ${item.materialCode || item.materialName} has non-positive quantity (${item.quantity}).`);
    }
    if (!item.materialCode || !item.materialName || !item.unit) {
      throw new Error("Validation failed: material items must specify code, name, and unit.");
    }
  }

  const receipt: DurableDeliveryReceipt = {
    opId: input.clientUuid,
    receiptId: `rcpt-mrr-${input.projectId}-${serverSeq}`,
    serverSeq,
    generatedAt: serverReceivedAt,
    immutable: true,
  };

  const initialAudit: DeliveryAuditTrailEntry = {
    actorId: input.submittedBy,
    actorRole,
    action: "submit",
    timestamp: serverReceivedAt,
    changes: {
      items: { to: input.items.length },
      challanNumber: { to: input.challanNumber },
      supplier: { to: input.supplierName },
    },
  };

  return {
    id: `mrr-${input.projectId}-${serverSeq}`,
    clientUuid: input.clientUuid,
    projectId: input.projectId,
    deliveryDate: input.deliveryDate,
    supplierName: input.supplierName,
    challanNumber: input.challanNumber,
    vehicleNumber: input.vehicleNumber ?? "",
    items: input.items.map((it) => ({ ...it })),
    receiptPhotoIds: input.receiptPhotoIds ?? [],
    remarks: input.remarks ?? "",
    submittedBy: input.submittedBy,
    submittedAt: input.submittedAt,
    reviewStatus: "pending",
    originalDelivery: {
      supplierName: input.supplierName,
      challanNumber: input.challanNumber,
      items: input.items.map((it) => ({ ...it })),
      remarks: input.remarks ?? "",
    },
    reconciledInventory: false,
    auditTrail: [initialAudit],
    durableReceipt: receipt,
  };
}

/**
 * Executes server-authoritative office review (accept, reject, or adjust).
 * Enforces anti-self-review: field users cannot review their own submissions.
 */
export function reviewMaterialDeliveryByOffice(args: {
  delivery: MaterialDeliveryEntity;
  reviewerId: string;
  reviewerRole: string;
  action: MaterialReviewAction;
  reviewedAt: string;
  reviewNotes?: string;
  adjustedItems?: MaterialDeliveryItemInput[];
}): MaterialDeliveryEntity {
  const {
    delivery,
    reviewerId,
    reviewerRole,
    action,
    reviewedAt,
    reviewNotes,
    adjustedItems,
  } = args;

  // Authorization check: Only office/manager roles can review
  const authorizedOfficeRoles = [
    "project_manager",
    "office_engineer",
    "store_manager",
    "accountant",
    "director",
  ];
  if (!authorizedOfficeRoles.includes(reviewerRole)) {
    throw new Error(
      `Permission denied: role '${reviewerRole}' is not authorized to perform office MRR review.`
    );
  }

  // Anti-self-review invariant: submitter cannot review their own delivery
  if (delivery.submittedBy === reviewerId) {
    throw new Error(
      "Permission denied: submitter cannot self-review their own material delivery."
    );
  }

  // Idempotency: cannot review an already processed delivery without rollback
  if (delivery.reviewStatus === "accepted" || delivery.reviewStatus === "adjusted") {
    throw new Error(
      `Invalid review state: delivery ${delivery.id} has already been accepted/reconciled.`
    );
  }

  const updated = { ...delivery };
  updated.reviewedBy = reviewerId;
  updated.reviewedAt = reviewedAt;
  updated.reviewNotes = reviewNotes ?? "";

  if (action === "accept") {
    updated.reviewStatus = "accepted";
    updated.reconciledInventory = true;
    updated.reconciliationRunId = `recon-${delivery.projectId}-${Date.now()}`;
    updated.reconciliationResults = computeMaterialReconciliation(delivery.items, delivery.items);

    updated.auditTrail = [
      ...delivery.auditTrail,
      {
        actorId: reviewerId,
        actorRole: reviewerRole,
        action: "office_accept",
        timestamp: reviewedAt,
        reviewNotes: reviewNotes ?? "Accepted without adjustment",
      },
    ];
  } else if (action === "reject") {
    updated.reviewStatus = "rejected";
    updated.reconciledInventory = false;

    updated.auditTrail = [
      ...delivery.auditTrail,
      {
        actorId: reviewerId,
        actorRole: reviewerRole,
        action: "office_reject",
        timestamp: reviewedAt,
        reviewNotes: reviewNotes ?? "Delivery rejected",
      },
    ];
  } else if (action === "adjust") {
    if (!adjustedItems || adjustedItems.length === 0) {
      throw new Error("Invalid adjustment: adjustedItems are required for 'adjust' action.");
    }
    updated.reviewStatus = "adjusted";
    updated.items = adjustedItems.map((it) => ({ ...it }));
    updated.reconciledInventory = true;
    updated.reconciliationRunId = `recon-${delivery.projectId}-${Date.now()}`;
    updated.reconciliationResults = computeMaterialReconciliation(
      delivery.originalDelivery.items,
      adjustedItems
    );

    updated.auditTrail = [
      ...delivery.auditTrail,
      {
        actorId: reviewerId,
        actorRole: reviewerRole,
        action: "office_adjust",
        timestamp: reviewedAt,
        reviewNotes: reviewNotes ?? "Adjusted delivered quantities",
        changes: {
          items: {
            from: delivery.originalDelivery.items,
            to: adjustedItems,
          },
        },
      },
    ];
  }

  return updated;
}

/**
 * Computes material reconciliation results from delivered vs accepted items.
 * Parity pinned against daily-report-sync normalization calculations.
 */
export function computeMaterialReconciliation(
  deliveredItems: MaterialDeliveryItemInput[],
  acceptedItems: MaterialDeliveryItemInput[]
): MaterialReconciliationResult[] {
  const deliveredMap = new Map<string, MaterialDeliveryItemInput>();
  for (const it of deliveredItems) {
    deliveredMap.set(it.materialCode, it);
  }

  const results: MaterialReconciliationResult[] = [];
  for (const acc of acceptedItems) {
    const orig = deliveredMap.get(acc.materialCode);
    const delQty = orig ? orig.quantity : 0;
    const hasDiscrepancy = Math.abs(delQty - acc.quantity) > 0.0001;

    results.push({
      materialCode: acc.materialCode,
      materialName: acc.materialName,
      deliveredQuantity: delQty,
      acceptedQuantity: acc.quantity,
      unit: acc.unit,
      reconciliationStatus: hasDiscrepancy ? "discrepancy" : "balanced",
      discrepancyNote: hasDiscrepancy
        ? `Delivered: ${delQty} ${acc.unit}, Accepted: ${acc.quantity} ${acc.unit} (Difference: ${acc.quantity - delQty})`
        : undefined,
    });
  }

  return results;
}
