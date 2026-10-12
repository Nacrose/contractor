import test from "node:test";
import assert from "node:assert/strict";
import {
  ingestMaterialDeliverySubmission,
  reviewMaterialDeliveryByOffice,
  computeMaterialReconciliation,
  type MaterialDeliverySubmissionInput,
} from "../src/material_delivery.js";

const sampleInput: MaterialDeliverySubmissionInput = {
  clientUuid: "mrr-client-uuid-0001",
  projectId: "proj-alphatower",
  deliveryDate: "2026-10-12",
  supplierName: "Shivam Cement Ltd.",
  challanNumber: "CH-889912",
  vehicleNumber: "BA 2 KHA 4455",
  items: [
    {
      materialCode: "MAT-CEM-OPC",
      materialName: "OPC Cement 50kg Bags",
      quantity: 500,
      unit: "bags",
      remarks: "Batch #44A",
    },
    {
      materialCode: "MAT-STEEL-12MM",
      materialName: "TMT Rebar 12mm",
      quantity: 3.5,
      unit: "tons",
      remarks: "FE 500D Grade",
    },
  ],
  receiptPhotoIds: ["photo-challan-01", "photo-truck-02"],
  remarks: "Delivered to North Gate unloading yard",
  submittedBy: "user-site-engineer-1",
  submittedAt: "2026-10-12T09:30:00.000Z",
};

test("MRR ingestion: lands in 'pending' review status without premature inventory reconciliation", () => {
  const entity = ingestMaterialDeliverySubmission({
    input: sampleInput,
    serverSeq: 101,
    serverReceivedAt: "2026-10-12T09:30:05.120Z",
  });

  assert.equal(entity.reviewStatus, "pending");
  assert.equal(entity.reconciledInventory, false);
  assert.equal(entity.reconciliationRunId, undefined);
  assert.equal(entity.items.length, 2);
  assert.equal(entity.originalDelivery.supplierName, "Shivam Cement Ltd.");
  assert.equal(entity.originalDelivery.items.length, 2);
  assert.equal(entity.durableReceipt.immutable, true);
  assert.equal(entity.auditTrail.length, 1);
  assert.equal(entity.auditTrail[0].action, "submit");
});

test("MRR office review: 'accept' marks delivery accepted and reconciles inventory server-side", () => {
  const entity = ingestMaterialDeliverySubmission({
    input: sampleInput,
    serverSeq: 102,
    serverReceivedAt: "2026-10-12T09:35:00.000Z",
  });

  const reviewed = reviewMaterialDeliveryByOffice({
    delivery: entity,
    reviewerId: "user-pm-office-1",
    reviewerRole: "project_manager",
    action: "accept",
    reviewedAt: "2026-10-12T11:00:00.000Z",
    reviewNotes: "Challan verified against PO #1029.",
  });

  assert.equal(reviewed.reviewStatus, "accepted");
  assert.equal(reviewed.reconciledInventory, true);
  assert.ok(reviewed.reconciliationRunId?.startsWith("recon-proj-alphatower-"));
  assert.equal(reviewed.reconciliationResults?.length, 2);
  assert.equal(reviewed.reconciliationResults?.[0].reconciliationStatus, "balanced");
  assert.equal(reviewed.auditTrail.length, 2);
  assert.equal(reviewed.auditTrail[1].action, "office_accept");
});

test("anti-self-review: field submitter cannot approve/review their own MRR delivery", () => {
  const entity = ingestMaterialDeliverySubmission({
    input: sampleInput,
    serverSeq: 103,
    serverReceivedAt: "2026-10-12T09:40:00.000Z",
  });

  assert.throws(
    () => {
      reviewMaterialDeliveryByOffice({
        delivery: entity,
        reviewerId: "user-site-engineer-1", // Same as submittedBy
        reviewerRole: "project_manager",
        action: "accept",
        reviewedAt: "2026-10-12T09:45:00.000Z",
      });
    },
    /submitter cannot self-review their own material delivery/,
  );
});

test("MRR office review: 'adjust' preserves original submission and calculates reconciliation discrepancies", () => {
  const entity = ingestMaterialDeliverySubmission({
    input: sampleInput,
    serverSeq: 104,
    serverReceivedAt: "2026-10-12T10:00:00.000Z",
  });

  // Office adjusts cement from 500 bags to 480 bags due to 20 torn/damaged bags
  const adjusted = reviewMaterialDeliveryByOffice({
    delivery: entity,
    reviewerId: "user-store-mgr-1",
    reviewerRole: "store_manager",
    action: "adjust",
    reviewedAt: "2026-10-12T11:30:00.000Z",
    reviewNotes: "20 cement bags rejected due to moisture damage on transit.",
    adjustedItems: [
      {
        materialCode: "MAT-CEM-OPC",
        materialName: "OPC Cement 50kg Bags",
        quantity: 480,
        unit: "bags",
        remarks: "480 bags accepted; 20 bags returned",
      },
      {
        materialCode: "MAT-STEEL-12MM",
        materialName: "TMT Rebar 12mm",
        quantity: 3.5,
        unit: "tons",
      },
    ],
  });

  assert.equal(adjusted.reviewStatus, "adjusted");
  assert.equal(adjusted.reconciledInventory, true);
  // Active items reflect the adjusted accepted quantities
  assert.equal(adjusted.items[0].quantity, 480);
  // Original delivery snapshot is completely intact
  assert.equal(adjusted.originalDelivery.items[0].quantity, 500);

  // Reconciliation results identify the discrepancy
  const recon = adjusted.reconciliationResults;
  assert.ok(recon);
  assert.equal(recon![0].materialCode, "MAT-CEM-OPC");
  assert.equal(recon![0].deliveredQuantity, 500);
  assert.equal(recon![0].acceptedQuantity, 480);
  assert.equal(recon![0].reconciliationStatus, "discrepancy");
  assert.ok(recon![0].discrepancyNote?.includes("Difference: -20"));

  // Audit trail captures diff
  const adjustAudit = adjusted.auditTrail[1];
  assert.equal(adjustAudit.action, "office_adjust");
  assert.ok(adjustAudit.changes?.items);
});

test("validation: non-positive item quantity or invalid date format is rejected fail-closed", () => {
  assert.throws(
    () => {
      ingestMaterialDeliverySubmission({
        input: { ...sampleInput, deliveryDate: "invalid-date" },
        serverSeq: 105,
        serverReceivedAt: "2026-10-12T10:05:00.000Z",
      });
    },
    /deliveryDate must follow YYYY-MM-DD format/,
  );

  assert.throws(
    () => {
      ingestMaterialDeliverySubmission({
        input: {
          ...sampleInput,
          items: [{ materialCode: "MAT-1", materialName: "Sand", quantity: 0, unit: "cum" }],
        },
        serverSeq: 106,
        serverReceivedAt: "2026-10-12T10:06:00.000Z",
      });
    },
    /has non-positive quantity/,
  );
});
