#!/usr/bin/env python3
"""Build the M00 workflow to canonical source/action crosswalk for M13-T01."""
import json
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SOURCE = Path("/private/tmp/m13-construction-manager-source")
MATRIX = ROOT / "docs/reports/M00/feature-matrix.json"
COVERAGE = ROOT / "docs/frontend/full-product-coverage.md"
INDEX = ROOT / "docs/frontend/original-action-component-index.json"
TRIGGERS = ROOT / "docs/frontend/original-interaction-trigger-candidates.jsonl"
OUTPUT = ROOT / "docs/frontend/original-workflow-source-crosswalk.json"

# These are route-to-workflow cross-references from the M00 workflow names and
# canonical page purposes. They are explicit review mappings, not proof that
# every source interaction in the page implements the full workflow.
WORKFLOW_ROUTES = {
    "WF-001": ["/m/log/report", "/projects/[id]/workflow/reports", "/projects/[id]/workflow/reports/[reportId]", "/projects/[id]/workflow/reports/[reportId]/edit"],
    "WF-002": ["/m/photos", "/projects/[id]/field-data", "/projects/[id]/drawings/progress"],
    "WF-003": ["/m/log/expense", "/m/simple/expense", "/projects/[id]/expenses"],
    "WF-004": ["/m/log/material", "/m/simple/material", "/projects/[id]/field-submissions", "/projects/[id]/materials"],
    "WF-005": ["/sync", "/m/sync", "/offline"],
    "WF-006": ["/projects/[id]/boq"],
    "WF-007": ["/projects/[id]/boq", "/projects/[id]/rate-library"],
    "WF-008": ["/rate-catalogs", "/projects/[id]/rate-library", "/projects/[id]/boq", "/admin/rate-catalogs"],
    # Snapshot controls are rendered by BoqVersionsTab on the Variation Orders
    # page; the planning revision route is Gantt-owned. IPC detail also reads
    # a snapshot diff for the selected baseline.
    "WF-009": ["/projects/[id]/variations", "/projects/[id]/variations/[voId]", "/projects/[id]/ipc/[ipcId]"],
    "WF-010": ["/projects/[id]/ipc", "/projects/[id]/ipc/[ipcId]", "/projects/[id]/ipc/[ipcId]/worksheets"],
    "WF-011": ["/projects/[id]/ipc", "/projects/[id]/ipc/[ipcId]", "/projects/[id]/ipc/[ipcId]/worksheets"],
    "WF-012": ["/projects/[id]/ipc", "/projects/[id]/ipc/[ipcId]", "/projects/[id]/ipc/[ipcId]/worksheets"],
    "WF-013": ["/projects/[id]/tax-summary", "/finance", "/projects/[id]/accounting"],
    "WF-014": ["/projects/[id]/materials", "/projects/[id]/vendors"],
    "WF-015": ["/projects/[id]/materials", "/projects/[id]/vendors"],
    "WF-016": ["/inventory", "/projects/[id]/materials", "/projects/[id]/materials/stock-alerts"],
    "WF-017": ["/inventory", "/projects/[id]/materials"],
    "WF-018": ["/projects/[id]/equipment", "/projects/[id]/equipment/utilization"],
    "WF-019": ["/projects/[id]/equipment", "/projects/[id]/equipment/utilization"],
    "WF-020": ["/projects/[id]/equipment", "/projects/[id]/equipment/utilization"],
    "WF-021": ["/team", "/hr-organization", "/projects/[id]/hr", "/projects/[id]/hr/team", "/projects/[id]/hr/hierarchy"],
    "WF-022": ["/projects/[id]/hr", "/projects/[id]/hr/team", "/m/log"],
    "WF-023": ["/projects/[id]/hr", "/projects/[id]/hr/team", "/projects/[id]/expenses"],
    "WF-024": ["/projects/[id]", "/projects/[id]/accounting", "/projects/[id]/payments", "/finance", "/projects/[id]/dashboard"],
    "WF-025": ["/finance", "/projects/[id]/accounting"],
    "WF-026": ["/finance", "/projects/[id]/accounting"],
    "WF-027": ["/drawings", "/projects/[id]/drawings"],
    "WF-028": ["/drawings", "/projects/[id]/drawings", "/projects/[id]/pdf-canvas"],
    "WF-029": ["/drawings", "/projects/[id]/drawings", "/projects/[id]/pdf-canvas/render"],
    "WF-030": ["/projects/[id]/drawings", "/projects/[id]/pdf-canvas", "/projects/[id]/pdf-canvas/render"],
    "WF-031": ["/projects/[id]/drawings/progress", "/projects/[id]/pdf-canvas", "/projects/[id]/boq"],
    "WF-032": ["/projects/[id]/gantt", "/projects/[id]/planning-dashboard"],
    "WF-033": ["/projects/[id]/gantt", "/projects/[id]/planning-dashboard"],
    "WF-034": ["/projects/[id]/gantt", "/projects/[id]/planning-dashboard"],
    "WF-035": ["/projects/[id]/gantt", "/projects/[id]/gantt/[versionId]/pdf-designer"],
    "WF-036": ["/projects/[id]/ipc/[ipcId]/worksheets", "/worksheet-lab", "/projects/[id]/boq"],
    "WF-037": ["/projects/[id]/ipc/[ipcId]/worksheets", "/worksheet-lab", "/projects/[id]/boq"],
    "WF-038": ["/finance", "/projects/[id]/accounting"],
    "WF-039": ["/projects/[id]/rfis", "/projects/[id]/submittals", "/projects/[id]/workflow/rfi"],
    "WF-040": ["/my-access", "/projects/[id]/workflow/program/my-tasks", "/projects/[id]/hr/hierarchy"],
    "WF-041": ["/dashboard", "/projects/[id]/dashboard", "/projects/[id]/planning-dashboard"],
}

SERVICE_HINTS = {
    "WF-001": ["dailyReport", "fieldSubmission"], "WF-002": ["fieldPhotos", "fieldSubmission"],
    "WF-003": ["fieldSubmission", "expense", "pettyCash"], "WF-004": ["fieldSubmission", "material", "partner"],
    "WF-005": ["project.list", "notification.list", "dailyReport.listReports", "fieldSubmission", "punchList", "chat", "partner.subcontractorOptions"],
    "WF-006": ["boq."], "WF-007": ["rate", "norm", "boq."], "WF-008": ["rate", "marketRate", "profile"],
    "WF-009": ["boqVersion", "boq.", "variationOrder."], "WF-010": ["ipc."], "WF-011": ["ipc."], "WF-012": ["ipc.", "price", "adjust"],
    "WF-013": ["tax", "vat", "finance."], "WF-014": ["requisition", "purchaseOrder", "material."],
    "WF-015": ["purchaseOrder"], "WF-016": ["material."], "WF-017": ["material.transfer", "transfer"],
    "WF-018": ["equipment."], "WF-019": ["equipment.", "fuel"], "WF-020": ["equipment."],
    "WF-021": ["hr.", "staffRole", "workforce", "person"], "WF-022": ["attendance", "leave", "fieldSubmission"],
    "WF-023": ["payroll", "attendance", "finance."], "WF-024": ["finance.", "projectOps.payment", "projectCost."],
    "WF-025": ["guarantee", "finance."], "WF-026": ["fiscal", "finance."],
    "WF-027": ["document.", "drawing"], "WF-028": ["drawing", "pdf"], "WF-029": ["drawing", "pdf", "export"],
    "WF-030": ["drawing", "pdf"], "WF-031": ["boq.", "drawing", "takeoff"],
    "WF-032": ["gantt."], "WF-033": ["gantt."], "WF-034": ["gantt."], "WF-035": ["gantt."],
    "WF-036": ["boq.", "ipc."], "WF-037": ["boq.", "ipc."], "WF-038": ["finance.", "partner."],
    "WF-039": ["rfi.", "submittal"], "WF-040": ["responsibility", "delegation", "dailyProgram", "peopleAccess.myAccess", "peopleAccess.catalog", "project."],
    "WF-041": ["dashboard.", "finance.", "accounting.dayBook", "gantt."],
}
SOURCE_OPERATION_SUPPLEMENTS = {
    # Imported child component hooks on the hierarchy route are represented in
    # the trigger sidecar but are not direct page hooks in the component index.
    "WF-040": {
        "responsibilityHandover.accountOptions [Query]",
        "responsibilityHandover.discoverAssignments [Query]",
        "responsibilityHandover.pendingItems [Query]",
    },
    "WF-041": {"GET /api/dashboard"},
    "WF-013": {
        "vatRegister.actionAccess [Query]",
        "vatRegister.getPurchaseRegister [Query]",
        "vatRegister.getSalesRegister [Query]",
        "vatRegister.getVatReturnSchedule10 [Query]",
        "vatRegister.createDirectVatBill [Mutation]",
        "vatRegister.attachScannedBill [Mutation]",
    },
    "WF-014": {
        "requisition.create [Mutation]", "requisition.checkBudgetVariance [Query]",
        "requisition.getDetails [Query]", "requisition.getBudgetVariance [Query]",
        "requisition.approvePr [Mutation]", "requisition.rejectPr [Mutation]",
        "requisition.generatePOs [Mutation]",
    },
    "WF-015": {
        "vendorBill.list [Query]", "vendorBill.checkDuplicate [Query]",
        "vendorBill.getThreeWayMatchData [Query]", "vendorBill.create [Mutation]",
        "vendorBill.recordPayment [Mutation]", "purchaseOrder.openBillablePOs [Query]",
        "purchaseOrder.create [Mutation]", "purchaseOrder.delete [Mutation]",
        "requisition.list [Query]", "requisition.getDetails [Query]",
        "requisition.generatePOs [Mutation]",
    },
    "WF-016": {
        "material.createGateEntry [Mutation]",
        "material.createBulkReceive [Mutation]",
        "material.createTransaction [Mutation]",
        "purchaseOrder.list [Query]", "storeLocation.list [Query]",
        "partner.listPartners [Query]",
    },
    "WF-024": {
        "projectCost.list [Query]", "projectCost.stats [Query]",
        "projectCost.create [Mutation]", "projectCost.delete [Mutation]",
        "projectCost.exportCsv [Query]",
        "accounting.dayBook [Query]", "accounting.getLedgerSource [Query]",
        "accounting.updateLedgerEntry [Mutation]",
        "accounting.reverseLedgerEntry [Mutation]",
        "accounting.attachLedgerFile [Mutation]",
        "accounting.logJournalEntry [Mutation]",
        "projectOps.payment.create [Mutation]", "paymentCategory.create [Mutation]",
        "finance.createHeadOfficeExpense [Mutation]",
        "finance.orgBankAccounts [Query]", "finance.createBankAccount [Mutation]",
        "finance.orgPayables [Query]", "finance.orgSettleMultiBill [Mutation]",
        "externalExport.getPendingVoucherCounts [Query]",
        "externalExport.getVouchersForReconciliation [Query]",
        "externalExport.exportTallyXml [Mutation]",
        "externalExport.exportSwastikCsv [Mutation]",
        "externalExport.reconcileVouchers [Mutation]",
    },
    "WF-025": {
        "bankGuarantee.list [Query]", "bankGuarantee.portfolioAlerts [Query]",
        "bankGuarantee.create [Mutation]", "bankGuarantee.update [Mutation]",
        "bankGuarantee.extend [Mutation]", "bankGuarantee.release [Mutation]",
        "bankGuarantee.delete [Mutation]", "bankGuarantee.linkToProject [Mutation]",
        "bankGuarantee.unlinkFromProject [Mutation]",
    },
    "WF-038": {
        "jvPartner.getAgreement [Query]", "jvPartner.saveAgreement [Mutation]",
        "jvPartner.recordPayout [Mutation]", "jvPartner.deletePayout [Mutation]",
    },
}

USER_DECISIONS = {
    "WF-010": "Contractor creates each IPC and a separate workbook; full GridCraft edits it; Contractor consumes only a validated Summary of Payment.",
    "WF-011": "Deduction and advance-recovery calculations stay in GridCraft workbook sheets; app ingestion is limited to the validated Summary of Payment.",
    "WF-012": "Price-adjustment summary/calculation stay in GridCraft; preserve M00 partial source status and ingest only Summary of Payment.",
    "WF-036": "Workbook editing uses the full GridCraft app; Contractor does not embed a separate editable worksheet surface for IPCs.",
    "WF-037": "Excel-compatible round-trip is qualified through the separate GridCraft workbook; preserve original data and fail closed on unproven round-trip fidelity.",
}
FIELD_WORKFLOWS = {"WF-001", "WF-002", "WF-003", "WF-004", "WF-005"}
COMMERCIAL_WORKFLOWS = {"WF-006", "WF-007", "WF-008", "WF-009"}
TAX_MATERIALS_WORKFLOWS = {"WF-013", "WF-014", "WF-015", "WF-016", "WF-017"}
EQUIPMENT_WORKFLOWS = {"WF-018", "WF-019", "WF-020"}
WORKFORCE_FINANCE_WORKFLOWS = {"WF-021", "WF-022", "WF-023", "WF-024", "WF-025", "WF-026"}
DRAWING_PLANNING_WORKFLOWS = {"WF-027", "WF-028", "WF-029", "WF-030", "WF-031", "WF-032", "WF-033", "WF-034", "WF-035"}
COMPLETION_WORKFLOWS = {"WF-038", "WF-039", "WF-040", "WF-041"}
# Stable trigger IDs that have been followed from the rendered control through
# its source handler. Keep this list deliberately narrower than the indexed
# candidate set: inclusion means source behavior was reviewed, not runtime
# parity was accepted. Evidence lives in the linked M13 reconciliation reports.
IPC_REVIEWED_TRIGGERS = {
    "TRIGGER-0A11FC0C6A59", "TRIGGER-27818C545EEB", "TRIGGER-1DB6CCB24286",
    "TRIGGER-D67AA39CC9B7", "TRIGGER-04AC43923638", "TRIGGER-EE2AF38FDE6F",
    "TRIGGER-A68E4F96FDAE", "TRIGGER-7D8ED9A4EF29", "TRIGGER-CDC0053D7775",
    "TRIGGER-996E4159F385", "TRIGGER-F568B9FF5A62", "TRIGGER-698410CA6A2C",
    "TRIGGER-4354716F93F7", "TRIGGER-A276C14EF416",
}
EQUIPMENT_REVIEWED_TRIGGERS = {
    "TRIGGER-DC9604592B07", "TRIGGER-BA0CD062C13B", "TRIGGER-567340D7370A",
    "TRIGGER-37BBD120CF25", "TRIGGER-65A0A3AED373", "TRIGGER-1C45C28218B4",
    "TRIGGER-1F0F9C94B216", "TRIGGER-9BCF1C2C7E6E",
}
VAT_REVIEWED_TRIGGERS = {
    "TRIGGER-A748EE47C9C7", "TRIGGER-2E2F9FBCDE13",
    "TRIGGER-A9F7B01C5CB4", "TRIGGER-53800EB34444", "TRIGGER-40E8A4799F33",
    "TRIGGER-151655B7ECA5", "TRIGGER-ACF5DE43CA7A", "TRIGGER-DE420D493651",
    "TRIGGER-7A56EDD417E3", "TRIGGER-340C332803EE", "TRIGGER-569882970C48",
    "TRIGGER-BE7A2543397A", "TRIGGER-C50998176D18", "TRIGGER-16E7CA075FC9",
    "TRIGGER-68ADB1FCD9DA", "TRIGGER-B0FB9B02ED37", "TRIGGER-46CEC8ED5116",
    "TRIGGER-DCC44A905C1A", "TRIGGER-2D238EFD117D", "TRIGGER-665E4F45ABD0",
    "TRIGGER-D4987F38B54F", "TRIGGER-F77786F208F7", "TRIGGER-E1C57CB7B6DE",
    "TRIGGER-2B9BD11B050B", "TRIGGER-3AA9369409FB", "TRIGGER-E37ABED78062",
    "TRIGGER-7DCBBE18FDEF", "TRIGGER-2C20B8EA48FC", "TRIGGER-F79CDF6A3E81",
    "TRIGGER-4CE0697A0A60", "TRIGGER-BE07EE5912F7", "TRIGGER-2F8ED7A4F1CA",
    "TRIGGER-A78C8F4A17C9", "TRIGGER-39EABE339B8B", "TRIGGER-E5F58A5D7E0A",
    "TRIGGER-D5917B862844", "TRIGGER-649F7C8A1434", "TRIGGER-C466708B7F0A",
    "TRIGGER-DABD0601B936", "TRIGGER-42D3043C0254", "TRIGGER-DBF1B62ADB3F",
    "TRIGGER-7C6589A62DAD", "TRIGGER-999AF5D68606", "TRIGGER-F8181DEEC4A0",
    "TRIGGER-45F9443D604D", "TRIGGER-84E11783BDC5", "TRIGGER-69F943F1091C",
    "TRIGGER-5914322B341C", "TRIGGER-12A4B851A5E1", "TRIGGER-392809AEC4CC",
    "TRIGGER-B3263C578856", "TRIGGER-2336F296FC0D", "TRIGGER-C8B092CB0657",
    "TRIGGER-A02A795AEF46", "TRIGGER-27BC58B748BD", "TRIGGER-3DA76707B22F",
    "TRIGGER-E4A5D3B39FC9", "TRIGGER-CF638D8C5CE3", "TRIGGER-5056B872126D",
    "TRIGGER-FCEF9B784C8B", "TRIGGER-1A3C3EFCBDFD", "TRIGGER-7CB4C3328829",
    "TRIGGER-22784AE8AFA1", "TRIGGER-31BE01206D2B", "TRIGGER-E9BEEA67A857",
    "TRIGGER-E427877F0D8F", "TRIGGER-CB9C0E2A3D48", "TRIGGER-1D417F19092A",
    "TRIGGER-149394838EF3", "TRIGGER-241FA6A5CCFB", "TRIGGER-3B4025A30487",
    "TRIGGER-9BF8C85EFF31", "TRIGGER-8B21873C8FC8", "TRIGGER-27EFEAB13971",
    "TRIGGER-5513BC1AD961", "TRIGGER-E32EDE3597D6", "TRIGGER-41FED2084C8E",
    "TRIGGER-591F4EB6BC15", "TRIGGER-E643C8974FC5", "TRIGGER-CA0585C2FC34",
    "TRIGGER-4F443993E2BC", "TRIGGER-04756615E5EA", "TRIGGER-89CA61915698",
    "TRIGGER-2D5C22018AF5", "TRIGGER-27B028C5FBB4", "TRIGGER-BE108C3E59A2",
    "TRIGGER-877B051F3B5D", "TRIGGER-CD9C46996DEF", "TRIGGER-A2795EEDF4C4",
    "TRIGGER-5FBAF8D5C67A", "TRIGGER-BD86A048AF8B", "TRIGGER-7340A3E4E132",
}
PURCHASE_ORDER_UI_REVIEWED_TRIGGERS = {
    "TRIGGER-C371070D0D25", "TRIGGER-B4D905B3F2F9", "TRIGGER-916A1F2451EA",
    "TRIGGER-06702EEA4DAC", "TRIGGER-1CEAC5B7E6D8", "TRIGGER-0A98910111F0",
    "TRIGGER-8B80735EFC0B", "TRIGGER-A3A0FCC2BA3E", "TRIGGER-5B375F68F741",
    "TRIGGER-28F7EB25D6D6", "TRIGGER-DC311CDA5065", "TRIGGER-09FD4677CBA6",
    "TRIGGER-5AB652736AEE", "TRIGGER-1479403C5E8A", "TRIGGER-FCE513CA15B3",
    "TRIGGER-A936523C7F14", "TRIGGER-7BE93A0AFCE4", "TRIGGER-72B0F16C4841",
    "TRIGGER-7E6E50ABA01F", "TRIGGER-5D0D64A548E0", "TRIGGER-91E04D674721",
    "TRIGGER-691F5E67CF08", "TRIGGER-8D4AC0208CAE", "TRIGGER-68DDEE86917B",
    "TRIGGER-CF608D17EAB4", "TRIGGER-9BF954046F55", "TRIGGER-0A70DF880A9E",
    "TRIGGER-074C57508207", "TRIGGER-28E210EC74E5", "TRIGGER-68B0003BB5FC",
    "TRIGGER-40CF9538BF69", "TRIGGER-530049FC2A4E", "TRIGGER-7D57B4B1A6F9",
    "TRIGGER-87A011539AAB", "TRIGGER-B9DE337B8B58", "TRIGGER-C5449F778C8A",
    "TRIGGER-4B9495C8E2D0", "TRIGGER-43A40B8408C9", "TRIGGER-B6324B03A52D",
    "TRIGGER-B658EC100104", "TRIGGER-130A403710F6",
}
INWARD_DELIVERY_REVIEWED_TRIGGERS = {
    "TRIGGER-DB81FD134E5B", "TRIGGER-43297AE3B6DF", "TRIGGER-F0506E5E71E7",
    "TRIGGER-72EE8BC2AE75", "TRIGGER-57D73704655D", "TRIGGER-F636BDA93462",
    "TRIGGER-FA6E2C3C3EDB", "TRIGGER-EBD4F448024D", "TRIGGER-A71C026F49BC",
    "TRIGGER-8F8F74B115CF", "TRIGGER-3285DF5A1A58", "TRIGGER-043EC5664D0E",
    "TRIGGER-BCD673738F12", "TRIGGER-F72EF5046666", "TRIGGER-B276033AFE5C",
    "TRIGGER-36C78624E557", "TRIGGER-C57A07876836", "TRIGGER-0A6E1952FA90",
    "TRIGGER-4E0224D9118C", "TRIGGER-B036C0D228C9", "TRIGGER-150578C09032",
    "TRIGGER-BA3553905460", "TRIGGER-D9084474C3FA", "TRIGGER-81C82BCF6FDA",
    "TRIGGER-7E718A66FC34", "TRIGGER-6D739EBCC0F8", "TRIGGER-17CCCEAA6E2A",
    "TRIGGER-38A7156415EF", "TRIGGER-9907FBE266C7", "TRIGGER-0BA80A1B6A08",
    "TRIGGER-4D58F438EF67", "TRIGGER-57BE3494D7B9", "TRIGGER-5B24EC8B7B54",
    "TRIGGER-A4F07311546C", "TRIGGER-EA65F9C65160", "TRIGGER-4183E96B0AFF",
}
MATERIAL_TRANSACTION_REVIEWED_TRIGGERS = {
    "TRIGGER-87296E85AF7B", "TRIGGER-3FD1DAC83666", "TRIGGER-6CBAA2CB3CBB",
    "TRIGGER-54B50CC4BE82", "TRIGGER-0C551D1E70ED", "TRIGGER-B074D732248E",
    "TRIGGER-0F5A133153EC", "TRIGGER-39CC67AAAFB9", "TRIGGER-348409D839A7",
    "TRIGGER-8F2607E7E979", "TRIGGER-275BF63A3466", "TRIGGER-3BCE216F05D2",
    "TRIGGER-3C63C5349C3F", "TRIGGER-6AA08D75FABE", "TRIGGER-C3F64BE2A925",
    "TRIGGER-4FFDDE6911A2", "TRIGGER-14A32A715CF4", "TRIGGER-722CF4D398BB",
    "TRIGGER-A3C79ECC4CF6", "TRIGGER-80F18B50C6E8", "TRIGGER-A10F76423D4B",
    "TRIGGER-F73A3C839DAF", "TRIGGER-630D302E0CD1", "TRIGGER-8B8759738A4B",
}
BOQ_VERSION_REVIEWED_TRIGGERS = {
    "TRIGGER-F14D6523985F", "TRIGGER-71B0E7A01082", "TRIGGER-36F13A858CDC",
    "TRIGGER-017A47B74357", "TRIGGER-138F80DC4953", "TRIGGER-6D216F1E99C9",
}
BOQ_ITEM_REVIEWED_TRIGGERS = {
    "TRIGGER-EAF23A01937F", "TRIGGER-1998DB7344D9", "TRIGGER-81DDE2B1EE4A",
    "TRIGGER-C06F1EFC6E55", "TRIGGER-5E15163DB887",
}
RATE_ANALYSIS_REVIEWED_TRIGGERS = {
    "TRIGGER-A2B025FE25FC", "TRIGGER-B979DC32E0C9", "TRIGGER-B3AC961395C5",
    "TRIGGER-C7DD504DC818", "TRIGGER-BEC1AD0CD5BD", "TRIGGER-25326B7B97B1",
}
RATE_PROFILE_REVIEWED_TRIGGERS = {
    "TRIGGER-B91D32C59628", "TRIGGER-F6A5AA529D38", "TRIGGER-9499BC675885",
    "TRIGGER-6F74FFB4BB45",
}
VARIATION_ORDER_REVIEWED_TRIGGERS = {
    "TRIGGER-628518F1BB88", "TRIGGER-0B74FB1AD490", "TRIGGER-DF05F79A9F31",
    "TRIGGER-A6C23BC29477", "TRIGGER-791450CABBB6", "TRIGGER-98B8F794AA82",
    "TRIGGER-C6A6DA29D436",
}
HANDOVER_REVIEWED_TRIGGERS = {
    "TRIGGER-82C3A2BAF5AE", "TRIGGER-5F8A8B03C6DC", "TRIGGER-7F3173223ADF",
    "TRIGGER-9656A043C87D", "TRIGGER-01FAD93F5D39", "TRIGGER-BD0B4703148B",
    "TRIGGER-7FF82FBC88F8", "TRIGGER-16D21EDDDF6B", "TRIGGER-E91808C24762",
    "TRIGGER-F22901221A11", "TRIGGER-B38B26A28EA4", "TRIGGER-357F0099599C",
    "TRIGGER-AD4A7F89916F", "TRIGGER-EFA2D8B3C464", "TRIGGER-8F962CA7BF0B",
    "TRIGGER-81923AAD264F", "TRIGGER-FE6475A54A29", "TRIGGER-7E1D4FC80E3F",
}
HANDOVER_MY_TASKS_REVIEWED_TRIGGERS = {
    "TRIGGER-0186CA25FFD2", "TRIGGER-5CFB8DB4A5CD", "TRIGGER-B07BE401825D",
    "TRIGGER-9D0A55DE3BB4", "TRIGGER-480DA02FE40B", "TRIGGER-CB0DC7C2D9F5",
    "TRIGGER-04860F834927", "TRIGGER-CA3BDCDFD65A", "TRIGGER-9B3C981B92BA",
    "TRIGGER-DC28ECDC49A6", "TRIGGER-AE8B71BFA76D", "TRIGGER-6286A652A3CC",
    "TRIGGER-04A3391ABA1E",
}
MY_ACCESS_REVIEWED_TRIGGERS = {
    "TRIGGER-2C664B8129E3", "TRIGGER-C17FCB1D0FA4",
    "TRIGGER-15FC9E72FF20", "TRIGGER-31435AE658F1",
}
DASHBOARD_REVIEWED_TRIGGERS = {
    "TRIGGER-411DC4973510", "TRIGGER-DDB36BDCA5D0",
    "TRIGGER-ECE6AF337ECD", "TRIGGER-FBAC827BFFF1",
    "TRIGGER-D991132AC94B", "TRIGGER-010C5CF7DFFE",
    "TRIGGER-80A4706EB42A", "TRIGGER-2F2D8B83FC9A",
    "TRIGGER-AD196927821A",
    "TRIGGER-EF1999667A41", "TRIGGER-F76C2E527C07", "TRIGGER-15A5F26D4086",
    "TRIGGER-BD93B1C75FC9", "TRIGGER-21E13CFD5C6D", "TRIGGER-8B5866ACBFAF",
    "TRIGGER-194E4D31C1AB", "TRIGGER-E1882D799ECF", "TRIGGER-253461056C2F",
    "TRIGGER-814A2AF88617", "TRIGGER-203A8103B686", "TRIGGER-F71C8A446E3E",
    "TRIGGER-5DE1F1541D26", "TRIGGER-E1BF273DACD1", "TRIGGER-81652519CD81",
    "TRIGGER-E3E265BFE082", "TRIGGER-D2BB7F275340", "TRIGGER-BD39F906727A",
    "TRIGGER-37C0252549E9",
}
PROJECT_COST_DASHBOARD_REVIEWED_TRIGGERS = {
    "TRIGGER-D7B9131F93E2", "TRIGGER-065A1CCE15D9", "TRIGGER-64EF6DD6FEE2",
    "TRIGGER-A0C5C807230A", "TRIGGER-5A65F748D7A6", "TRIGGER-3C75699AA07B",
    "TRIGGER-0385AA83C1D8", "TRIGGER-E59B859111E3", "TRIGGER-12A677E02E98",
    "TRIGGER-1055A60A441C", "TRIGGER-ADEE960DC6BC", "TRIGGER-60B7C4A8560A",
    "TRIGGER-F25128A552A7", "TRIGGER-3962B363A92B", "TRIGGER-B4D42F8C8195",
    "TRIGGER-CCAA2D0153E6", "TRIGGER-82E8E4B99BE3", "TRIGGER-025C4A917A18",
    "TRIGGER-B6CB98A21D2D", "TRIGGER-9AB9C64CF3C2", "TRIGGER-09C20715B6E5",
    "TRIGGER-37247E9DA002", "TRIGGER-FDD1CB106F5D", "TRIGGER-1EE0128243AE",
    "TRIGGER-D6ABCD365183",
    "TRIGGER-F580285C3874", "TRIGGER-4A66A7EA93BC", "TRIGGER-358D44B66F20",
    "TRIGGER-2ADF5394E4CC", "TRIGGER-E90C4F5D5873", "TRIGGER-351783F47848",
    "TRIGGER-0C3655D8196D", "TRIGGER-1B9E66BC0F44", "TRIGGER-94A8D74A7563",
    "TRIGGER-345226314A25", "TRIGGER-5D90E737600B", "TRIGGER-591A493D646D",
    "TRIGGER-0D26B1C55294", "TRIGGER-F7FE57794FF4", "TRIGGER-6B5CBE94E918",
    "TRIGGER-7C8CB45B34E4", "TRIGGER-3309C4360146", "TRIGGER-C275FD6FC179",
    "TRIGGER-B7A880C6EF97", "TRIGGER-5A1DC0AC0AFA", "TRIGGER-54806A382B38",
    "TRIGGER-8CDD23EC64CA", "TRIGGER-D8EBE3D55A61", "TRIGGER-415BF96FCAE8",
    "TRIGGER-7E67AA76E0FE",
}

DAY_BOOK_REVIEWED_TRIGGERS = {
    "TRIGGER-FDD9A7132ABB", "TRIGGER-4E259335A0D8", "TRIGGER-27764AC2BD19",
    "TRIGGER-30E046D189F8", "TRIGGER-A8AAFBE54C67", "TRIGGER-25EC199BF41B",
    "TRIGGER-29EF5FD7315D", "TRIGGER-85BA4EF32514", "TRIGGER-882D3BA4B1E3",
    "TRIGGER-B311ADAE730C", "TRIGGER-AAE70D432CF5", "TRIGGER-99F95C9B08B2",
    "TRIGGER-151C05849E6E", "TRIGGER-9EF906CF98A6", "TRIGGER-45025787647F",
    "TRIGGER-9349694AE9F2", "TRIGGER-A076BF4389E2", "TRIGGER-FAA7EED3AB36",
    "TRIGGER-4013CE5AF348", "TRIGGER-8060A397DDFA", "TRIGGER-EFE0B3915B64",
    "TRIGGER-BEE3CE7CFEEF", "TRIGGER-FBDFF27226D5", "TRIGGER-2D936557691F",
    "TRIGGER-87A609836ACD", "TRIGGER-E0CDDE290B01", "TRIGGER-C8B98ABFCEB1",
    "TRIGGER-A90B6399CA26", "TRIGGER-C1BEF844D4DC", "TRIGGER-22F3ABF4046B",
    "TRIGGER-E14D9F968F1A", "TRIGGER-EFB45BD348AA", "TRIGGER-CB8C57520244",
    "TRIGGER-2BA300308256", "TRIGGER-D00CDD39E559", "TRIGGER-76B0B8302701",
    "TRIGGER-4084B3BB38F2", "TRIGGER-DBA4CDD7E631", "TRIGGER-3B1AE7BFE053",
    "TRIGGER-BEEE0DDB6460", "TRIGGER-66EFA0AD0914", "TRIGGER-E2BFEBF57B80",
    "TRIGGER-8F45EDBC8BBD", "TRIGGER-F705EF29B314", "TRIGGER-AD6480D48C39",
    "TRIGGER-D483E781BC65", "TRIGGER-B4CAF7F607F1", "TRIGGER-9A9EC5838F4A",
}

FINANCE_ROUTE_NAV_REVIEWED_TRIGGERS = {
    "TRIGGER-ADC823E9BCAA", "TRIGGER-781FDB47C4A5",
}

ORG_BANK_ACCOUNT_REVIEWED_TRIGGERS = {
    "TRIGGER-2FB31DCE534E", "TRIGGER-D99E477E72F9", "TRIGGER-95147E24E767",
    "TRIGGER-ECD1C4CC38A8", "TRIGGER-440E045FC87E", "TRIGGER-7180CD5FF89A",
    "TRIGGER-E9119DFDD216", "TRIGGER-5194D10CE2C1", "TRIGGER-09338892FE9A",
    "TRIGGER-16F114FAC1D6", "TRIGGER-1B22D6F7DFAD", "TRIGGER-06E63FF364B9",
}

ORG_PAYABLES_REVIEWED_TRIGGERS = {
    "TRIGGER-E4F9B46F138D", "TRIGGER-A01D02BC6FDD", "TRIGGER-D40B776D662F",
    "TRIGGER-329538EB6678", "TRIGGER-EE713F197E53", "TRIGGER-E95BC5E8B292",
    "TRIGGER-B5029AD4397D", "TRIGGER-9FC2A564B620", "TRIGGER-3FD166C1125E",
    "TRIGGER-3C601B438290", "TRIGGER-371153107A66", "TRIGGER-261C2190DB37",
    "TRIGGER-B8BF53930C2E", "TRIGGER-3CA5955426DE", "TRIGGER-53BF1A38AA58",
    "TRIGGER-0BCD3511848C", "TRIGGER-145E2642011B", "TRIGGER-5418CB8AF6AD",
    "TRIGGER-994B155015DB",
}

RECORD_INFLOW_REVIEWED_TRIGGERS = {
    "TRIGGER-0EA64834FD92", "TRIGGER-6D293387EDDF", "TRIGGER-506D325392CE",
    "TRIGGER-E2CF0B4F3083", "TRIGGER-D9FB443615FB", "TRIGGER-460BCDAABB70",
    "TRIGGER-02FFDEE5D542", "TRIGGER-7F72392B09F4", "TRIGGER-26AF39D3B60E",
    "TRIGGER-E464B40DE246", "TRIGGER-F1593B259973", "TRIGGER-23EC3CBDB561",
    "TRIGGER-EEBDAEA8BE9F", "TRIGGER-5E0151A548E1", "TRIGGER-B81FAAA6F1D1",
    "TRIGGER-57E153B3E127", "TRIGGER-A15589469ABA", "TRIGGER-CCCE56FC0E67",
    "TRIGGER-3E259A2438D3", "TRIGGER-1015957E9ED5", "TRIGGER-11DB48B9B71F",
    "TRIGGER-ACC8FA46AE3F", "TRIGGER-7D8AB0E6F65E", "TRIGGER-42E578B0DED2",
}

RECORD_PAYMENT_REVIEWED_TRIGGERS = {
    "TRIGGER-FE8112792D02", "TRIGGER-CC6B8D5D3489", "TRIGGER-09537CD4C142",
    "TRIGGER-6F7C664502F7", "TRIGGER-66F169BCB766", "TRIGGER-BE34DB60FF88",
    "TRIGGER-26B3D1EBB73D", "TRIGGER-9B590978FE4B", "TRIGGER-1F478CB594E9",
    "TRIGGER-E758D719E34D", "TRIGGER-231EACB0A391", "TRIGGER-8C77B75D2EE9",
    "TRIGGER-2BB51B543E55", "TRIGGER-68ECD7CF5665", "TRIGGER-4A45D36F02A7",
    "TRIGGER-E60D202BD277", "TRIGGER-C9A8381C8818", "TRIGGER-C5DE5489AE71",
    "TRIGGER-C8B0FD9A603F", "TRIGGER-707A967201DF", "TRIGGER-42D30C91B318",
    "TRIGGER-68F334F38CEB", "TRIGGER-D86957FFE569", "TRIGGER-0B71CBCFD4E1",
    "TRIGGER-58903390BEB0", "TRIGGER-EF823D945D1C", "TRIGGER-E1609789B27F",
    "TRIGGER-CB5ED3574982", "TRIGGER-825F90297CFD", "TRIGGER-520E6EAF49A9",
    "TRIGGER-B1028DF9EEB8", "TRIGGER-A80F971F8750", "TRIGGER-C3AC79524130",
    "TRIGGER-E429AB5B168B", "TRIGGER-21852CAEE2BA", "TRIGGER-15625F2CCB45",
    "TRIGGER-1A4CA9D7E195", "TRIGGER-CFC43118C47F", "TRIGGER-236FDD34F0CD",
    "TRIGGER-35A16FBB9F84", "TRIGGER-3195199409FD", "TRIGGER-223B8C18C1D3",
    "TRIGGER-48F006BF7DD0", "TRIGGER-37ADE6A781E7", "TRIGGER-4F0C97E64903",
    "TRIGGER-8CE49578AC01", "TRIGGER-A153C5346C72", "TRIGGER-AEB46A1BE45A",
    "TRIGGER-E2ADC476912D", "TRIGGER-26BFC32EA8E9", "TRIGGER-A50DC4F6AB06",
    "TRIGGER-C98CAB68E394", "TRIGGER-1DCD7D8493DE", "TRIGGER-1341B90C9A31",
    "TRIGGER-3D28CD64194D", "TRIGGER-CD805AC4B7FB", "TRIGGER-512AF283B39D",
    "TRIGGER-E6F2663FD827", "TRIGGER-CACC14F13D26", "TRIGGER-A636BC197B7C",
    "TRIGGER-35821C273156", "TRIGGER-B96C6B897EAF", "TRIGGER-A1FAF3B33AC9",
    "TRIGGER-A1FC3C8FDBB0", "TRIGGER-F77A36CA2050", "TRIGGER-7F3F55F8CD92",
    "TRIGGER-400D621EB264", "TRIGGER-1A19ED0DCBE3",
}

DAY_BOOK_INSPECTOR_REVIEWED_TRIGGERS = {
    "TRIGGER-E495AF5A47C8", "TRIGGER-83485AD1C565", "TRIGGER-CEACC6D985D9",
    "TRIGGER-DF4A2080F1D3", "TRIGGER-BE82EB05A8E3", "TRIGGER-FEB50B1D44FF",
    "TRIGGER-C93F65D2F4E6", "TRIGGER-2E28652B4BDC", "TRIGGER-75BA2F7AB633",
    "TRIGGER-A0C3ADD114C6", "TRIGGER-8C60F53ACD49", "TRIGGER-DE8CF25349BC",
    "TRIGGER-FD49FB587675", "TRIGGER-B127C6B2D0A5", "TRIGGER-7FB666587E39",
    "TRIGGER-5FBABA076859", "TRIGGER-881BF59B4224", "TRIGGER-4245C649C6F3",
    "TRIGGER-64F53B1B0FC4", "TRIGGER-5D0ED4CD509E", "TRIGGER-A93C49E8A50B",
    "TRIGGER-6915DBA9A649", "TRIGGER-95F4DE40C3A7", "TRIGGER-6E9A7CCD4D2B",
    "TRIGGER-D4B2BED64456", "TRIGGER-E9B8189C91D4", "TRIGGER-FAF8E76BDCCE",
    "TRIGGER-14FB731373CD", "TRIGGER-BD0D7BE0FE71", "TRIGGER-EA974D65C409",
    "TRIGGER-AA07776D6EC7", "TRIGGER-EB2AFEA3BF7C",
}

EXTERNAL_BOOKKEEPING_REVIEWED_TRIGGERS = {
    "TRIGGER-7ABB2C59451A", "TRIGGER-DEF42D195F60", "TRIGGER-94BFA6AFE12B",
    "TRIGGER-966D8DB45287", "TRIGGER-9AEACBB540D3", "TRIGGER-794C08BB9C85",
    "TRIGGER-7CC817C96CC4", "TRIGGER-AC18715683F0", "TRIGGER-9AABD22CEFC5",
    "TRIGGER-CA9F286C1466", "TRIGGER-C8D15EFFBF2B", "TRIGGER-900C4F38F57B",
    "TRIGGER-9FD6E4CA6DFA", "TRIGGER-BF8CD0521B28", "TRIGGER-B8EF1B68A84F",
    "TRIGGER-78FA86638152", "TRIGGER-3F59640E9235", "TRIGGER-15523A487616",
    "TRIGGER-76F613472C9B", "TRIGGER-A31D58C07C6A", "TRIGGER-99824D6F78D6",
    "TRIGGER-9C67E9D17D49", "TRIGGER-98D33136F935", "TRIGGER-8512AB33943D",
}

JV_COMMISSION_REVIEWED_TRIGGERS = {
    "TRIGGER-BFCFADAB69CD", "TRIGGER-289542342604", "TRIGGER-EA51929781AD",
    "TRIGGER-3605DE9E144F", "TRIGGER-F02AC2B65445", "TRIGGER-B47004B64081",
    "TRIGGER-4AB081EE3B84", "TRIGGER-25F595319256", "TRIGGER-FFE6FBF0C075",
    "TRIGGER-838BF8DFEB5D", "TRIGGER-C58A213DC43D", "TRIGGER-6B53CD901EA8",
    "TRIGGER-99D1C033A7C4", "TRIGGER-E6361C503D1E", "TRIGGER-0681AF484214",
    "TRIGGER-8E61FD7CB4CE", "TRIGGER-78E354CFFBFE", "TRIGGER-BC989FBF86CB",
    "TRIGGER-959B0EAF580E", "TRIGGER-AE408C875B39", "TRIGGER-5669BADB0CD4",
    "TRIGGER-0649025F1069", "TRIGGER-254342C49868", "TRIGGER-B2C014A3EE9E",
    "TRIGGER-C505D9B23C57", "TRIGGER-233C62A84F13", "TRIGGER-5C8CD35C6AAE",
    "TRIGGER-D64B482B85D1",
}

GUARANTEE_FINANCE_REVIEWED_TRIGGERS = {
    "TRIGGER-AD9D7CF6CF40", "TRIGGER-AA8753F79BAF", "TRIGGER-F2C866CE0895",
    "TRIGGER-AF9DBA8D7C06", "TRIGGER-91583E49D1ED", "TRIGGER-7B0DC4A7EA8C",
    "TRIGGER-9205D769877D", "TRIGGER-64E2D94589F5", "TRIGGER-4255939A244D",
    "TRIGGER-966ABC9C2C8F", "TRIGGER-5A035E7AC6C5", "TRIGGER-C1A1E2A80C3D",
    "TRIGGER-12899EF35507", "TRIGGER-A831323A5FF1", "TRIGGER-A2E232F6BC26",
    "TRIGGER-0764F7CF4FD9", "TRIGGER-6F7B09BE680F", "TRIGGER-1258940F384F",
    "TRIGGER-554DB93C5F57", "TRIGGER-CE20B22C130B", "TRIGGER-B1D5BC49A27E",
    "TRIGGER-576935BDBE0B", "TRIGGER-94A562A3EB12", "TRIGGER-A56C457ACBE7",
    "TRIGGER-3B5706183890", "TRIGGER-02BA76E48A6B", "TRIGGER-F367FEBC8D0B",
    "TRIGGER-B63E0BA5ACEA", "TRIGGER-13B6B9E14E53", "TRIGGER-CEE87C313385",
    "TRIGGER-41F6A55C90F1", "TRIGGER-E375F7D18517", "TRIGGER-B74915DF0F93",
    "TRIGGER-D572D9BAACCA", "TRIGGER-58D628BAAE92", "TRIGGER-A780D393C821",
    "TRIGGER-6B111692FC3B", "TRIGGER-73B94252DED6", "TRIGGER-FEDEC965572D",
    "TRIGGER-93FBCC730E24", "TRIGGER-1A6DF04ED67A", "TRIGGER-C21CFFFD1652",
    "TRIGGER-EE67FF8B5529", "TRIGGER-2F5DE577DC7A", "TRIGGER-5308D32B6C12",
    "TRIGGER-7CB3EADFB4CE", "TRIGGER-9B2BFE7E07B6", "TRIGGER-35D2C858A67F",
    "TRIGGER-1DE0EB7DF0BA", "TRIGGER-0C20BC082CF1", "TRIGGER-F55AC7107E07",
    "TRIGGER-72EE74C17034", "TRIGGER-21BBDAD08442", "TRIGGER-026F0DA0CD14",
    "TRIGGER-CD58CAE4B148", "TRIGGER-C9F4270512BC", "TRIGGER-56D7D790F165",
    "TRIGGER-D9E440E6BE9A", "TRIGGER-9256340EBB7C", "TRIGGER-D3A8F9B77D52",
    "TRIGGER-99732ECF473B", "TRIGGER-601D7F68F3C3", "TRIGGER-5553894A6576",
    "TRIGGER-1F00B62FCD8A",
}
REVIEWED_TRIGGERS_BY_WORKFLOW = {
    "WF-001": {
        "TRIGGER-7BDEED88E412", "TRIGGER-67DA9E9618FF", "TRIGGER-BE59F25879E8",
        "TRIGGER-D8A70A80562B", "TRIGGER-CF8330109CD8", "TRIGGER-DBB14792E9FB",
        "TRIGGER-2C860AB9C728", "TRIGGER-436BA22CADBA", "TRIGGER-67DCC90776A7",
    },
    **{workflow_id: IPC_REVIEWED_TRIGGERS for workflow_id in ("WF-010", "WF-011", "WF-012")},
    **{workflow_id: EQUIPMENT_REVIEWED_TRIGGERS for workflow_id in ("WF-018", "WF-019", "WF-020")},
    "WF-013": VAT_REVIEWED_TRIGGERS,
    "WF-014": {
        "TRIGGER-E1DF0B61E3E7", "TRIGGER-70C5DD70614F", "TRIGGER-54CCF2A06430",
        "TRIGGER-D83D41F3FC2B", "TRIGGER-3F8EFCD0A66B", "TRIGGER-AC7BA879E9C3",
        "TRIGGER-EAC25DD75AA4", "TRIGGER-6943A49DC2A7", "TRIGGER-5056FDF32C83",
        "TRIGGER-068A50CFD856", "TRIGGER-A98DD881BD60", "TRIGGER-9F7149E3165D",
        "TRIGGER-7C321F3CCA37", "TRIGGER-E8DEFC28A0E2",
    },
    "WF-015": PURCHASE_ORDER_UI_REVIEWED_TRIGGERS,
    "WF-016": INWARD_DELIVERY_REVIEWED_TRIGGERS | MATERIAL_TRANSACTION_REVIEWED_TRIGGERS,
    "WF-009": BOQ_VERSION_REVIEWED_TRIGGERS | VARIATION_ORDER_REVIEWED_TRIGGERS,
    "WF-006": BOQ_ITEM_REVIEWED_TRIGGERS,
    "WF-007": RATE_ANALYSIS_REVIEWED_TRIGGERS,
    "WF-008": RATE_PROFILE_REVIEWED_TRIGGERS,
    "WF-017": {
        "TRIGGER-9A6B3C859E69", "TRIGGER-D9346EA9F06E", "TRIGGER-E432F3F3EDEB",
        "TRIGGER-85BB3BF22449", "TRIGGER-8E44C8B59904", "TRIGGER-842BE67AE68F",
        "TRIGGER-3C237593FDBE", "TRIGGER-E6F608699D18", "TRIGGER-FD2052CFC435",
        "TRIGGER-9FFF9BB421CA", "TRIGGER-EF439838F4C1", "TRIGGER-508D05085F32",
        "TRIGGER-384576D431E6", "TRIGGER-00DDAB0064FC", "TRIGGER-37BB12FF0D68",
        "TRIGGER-CFE26C3FCA70", "TRIGGER-B2A27D1834F5",
    },
    "WF-040": HANDOVER_REVIEWED_TRIGGERS | HANDOVER_MY_TASKS_REVIEWED_TRIGGERS | MY_ACCESS_REVIEWED_TRIGGERS,
    "WF-041": DASHBOARD_REVIEWED_TRIGGERS,
    "WF-024": PROJECT_COST_DASHBOARD_REVIEWED_TRIGGERS | DAY_BOOK_REVIEWED_TRIGGERS | FINANCE_ROUTE_NAV_REVIEWED_TRIGGERS | ORG_BANK_ACCOUNT_REVIEWED_TRIGGERS | ORG_PAYABLES_REVIEWED_TRIGGERS | RECORD_INFLOW_REVIEWED_TRIGGERS | RECORD_PAYMENT_REVIEWED_TRIGGERS | DAY_BOOK_INSPECTOR_REVIEWED_TRIGGERS | EXTERNAL_BOOKKEEPING_REVIEWED_TRIGGERS,
    "WF-025": GUARANTEE_FINANCE_REVIEWED_TRIGGERS,
    "WF-038": JV_COMMISSION_REVIEWED_TRIGGERS,
}
UI_HOOK = re.compile(r"trpc\.((?:[A-Za-z0-9_]+\.)*[A-Za-z0-9_]+)\.(?:useQuery|useMutation)\b")
ORPHAN_UI_WORKFLOW_OVERRIDES = {
    # Explicit source-to-workflow assignments prevent shared hooks such as
    # `project.get`, `material.list` and `hr.*` from creating false ownership.
    "src/app/(app)/finance/components/org-inventory-tab.tsx": {"WF-016"},
    "src/app/(app)/projects/[id]/hr/components/advances-ledger-tab.tsx": {"WF-023"},
    "src/app/(app)/projects/[id]/hr/components/daily-attendance-tab.tsx": {"WF-022"},
    "src/app/(app)/projects/[id]/hr/components/leaves-tab.tsx": {"WF-022"},
    "src/app/(app)/projects/[id]/hr/components/muster-roll-tab.tsx": {"WF-022"},
    "src/app/(app)/projects/[id]/hr/components/payroll-management-tab.tsx": {"WF-023"},
    "src/app/(app)/projects/[id]/hr/dialogs/payroll-allocation-dialog.tsx": {"WF-023"},
    "src/components/organization-employment-manager.tsx": {"WF-021"},
    "src/app/(app)/projects/[id]/materials/components/store-locations-tab.tsx": {"WF-016"},
    "src/app/(app)/projects/[id]/materials/components/inter-site-transfers-tab.tsx": {"WF-017"},
    "src/app/(app)/projects/[id]/materials/components/materials-transactions-tab.tsx": {"WF-016"},
    "src/app/(app)/projects/[id]/materials/components/vendor-bills-tab.tsx": {"WF-015"},
    "src/components/inventory/transfer-acknowledgement-dialog.tsx": {"WF-017"},
    "src/components/inventory/reconciliation-report.tsx": {"WF-016"},
    "src/components/inventory/procurement-lookahead-widget.tsx": {"WF-014", "WF-033"},
    "src/components/people-access/access-review-report.tsx": {"WF-040"},
    "src/components/dashboard/cross-project-financials-card.tsx": {"WF-024", "WF-041"},
}
ORPHAN_UI_REVIEWED_TRIGGER_IDS_BY_SOURCE = {
    "src/app/(app)/projects/[id]/materials/components/vendor-bills-tab.tsx": {
        "TRIGGER-A81EE16258F6", "TRIGGER-A15FA3A71BEB", "TRIGGER-546F4B0AB9C7",
        "TRIGGER-0237AA6EE309", "TRIGGER-3569226276AD", "TRIGGER-8F7DC3423654",
        "TRIGGER-3D7585B28622", "TRIGGER-B8A4CD1C96A4", "TRIGGER-71B79C56DC62",
        "TRIGGER-62D66D840D62", "TRIGGER-1EED725945D2", "TRIGGER-47E82B480472",
        "TRIGGER-B82BED1D1F26", "TRIGGER-ED1319C84A3D", "TRIGGER-F96250CC996C",
        "TRIGGER-42B877B08E0E", "TRIGGER-8E31F1FDF6E8", "TRIGGER-BD4413D71D5C",
        "TRIGGER-C03324C49911", "TRIGGER-556A25E0EF3A", "TRIGGER-48AB251A2D65",
        "TRIGGER-31EF2E6C4C28", "TRIGGER-26F3BF60998F", "TRIGGER-DC0892653E16",
    },
}


def main():
    source_matrix = json.loads(MATRIX.read_text())
    source_workflows = {item["workflow"]: item for item in source_matrix["workflows"]}
    index = json.loads(INDEX.read_text())
    trigger_records = [json.loads(line) for line in TRIGGERS.read_text().splitlines()]
    triggers_by_route = {}
    for trigger in trigger_records:
        triggers_by_route.setdefault(trigger["routeId"], []).append(trigger)
    routes_by_path = {route["originalRoute"]: route for route in index["routes"]}
    reachable_ui_files = {route["routeSource"] for route in index["routes"]}
    for route in index["routes"]:
        for action in route["reachableProcedureCandidates"]:
            reachable_ui_files.update(action.get("uiSourceFiles", []))
    reachable_ui_files.update(
        trigger["sourceFile"] for trigger in trigger_records
        if trigger.get("scopeType") != "unreferenced-ui"
    )
    orphan_triggers_by_source = {}
    for trigger in trigger_records:
        if trigger.get("scopeType") == "unreferenced-ui":
            orphan_triggers_by_source.setdefault(trigger["sourceFile"], []).append(trigger)
    unreferenced_ui = []
    for component in index.get("unreferencedUiComponentsWithHooks", []):
        candidates = sorted(
            orphan_triggers_by_source.get(component["sourceFile"], []),
            key=lambda item: item["actionId"],
        )
        reviewed_ids = ORPHAN_UI_REVIEWED_TRIGGER_IDS_BY_SOURCE.get(component["sourceFile"], set())
        candidate_ids = {item["actionId"] for item in candidates}
        if not reviewed_ids <= candidate_ids:
            raise SystemExit(
                f"reviewed orphan trigger IDs not found for {component['sourceFile']}: "
                + ", ".join(sorted(reviewed_ids - candidate_ids))
            )
        unreferenced_ui.append({
            **component,
            "triggerCandidates": candidates,
            "sourceReviewedTriggerIds": sorted(reviewed_ids),
            "sourceReviewState": (
                "form and payment handlers traced; component is unreferenced from mapped routes and runtime availability is unverified"
                if reviewed_ids else
                "source component is not reachable from indexed routes or shared layouts; runtime availability is unverified"
            ),
        })
    coverage = COVERAGE.read_text()
    route_rows = {
        path: {"routeId": route_id, "destination": destination.strip(), "packet": packet.strip(), "status": status.strip()}
        for route_id, path, destination, packet, status in re.findall(
            r"\|\s*`(ROUTE-\d+)`\s*\|\s*`([^`]+)`\s*\|\s*([^|]+)\|\s*([^|]+)\|\s*([^|]+)\|",
            coverage,
        )
    }
    workflow_rows = re.findall(
        r"\|\s*`(WF-\d+)`\s*\|\s*([^|]+)\|\s*([^|]+)\|\s*([^|]+)\|\s*([^|]+)\|",
        coverage,
    )
    packet_by_id = {workflow_id: packet.strip() for workflow_id, _, _, packet, _ in workflow_rows}
    result = []
    for workflow_id, path_list in WORKFLOW_ROUTES.items():
        # The M00 matrix currently has stable order but no WF IDs. Match on
        # coverage title, which is checked below for uniqueness/presence.
        coverage_row = next((row for row in workflow_rows if row[0] == workflow_id), None)
        if not coverage_row:
            raise SystemExit(f"missing workflow coverage row: {workflow_id}")
        title = coverage_row[1].strip()
        original = source_workflows.get(title)
        if not original:
            raise SystemExit(f"M00 title not found in source matrix: {title}")
        route_records = []
        hook_actions = []
        trigger_actions = []
        for route_path in path_list:
            route_ref = route_rows.get(route_path)
            indexed_route = routes_by_path.get(route_path)
            if route_ref:
                route_records.append({
                    **route_ref,
                    "sourcePage": indexed_route.get("routeSource") if indexed_route else None,
                    "reachableActionIds": sorted(
                        action["actionId"] for action in indexed_route["reachableProcedureCandidates"]
                    ) if indexed_route else [],
                    "triggerCandidateIds": sorted(
                        action["actionId"] for action in triggers_by_route.get(indexed_route["routeId"], [])
                    ) if indexed_route else [],
                })
            if not indexed_route:
                continue
            hints = SERVICE_HINTS[workflow_id]
            for action in indexed_route["reachableProcedureCandidates"]:
                procedure = action["candidateDefinition"]
                if any(hint.casefold() in procedure.casefold() for hint in hints):
                    hook_actions.append(action)
            for action in triggers_by_route.get(indexed_route["routeId"], []):
                linked = action.get("candidateMutationHooks", [])
                if any(any(hint.casefold() in hook.casefold() for hint in hints) for hook in linked):
                    trigger_actions.append(action)
        unique_actions = {action["actionId"]: action for action in hook_actions}
        ipc_reviewed_actions = sorted(
            action["actionId"]
            for route_path in path_list
            if (indexed_route := routes_by_path.get(route_path))
            for action in indexed_route["reachableProcedureCandidates"]
            if action["candidateDefinition"].startswith(("ipc.", "worksheet."))
        ) if workflow_id in USER_DECISIONS else []
        workflow_trigger_ids = {
            action["actionId"] for route_path in path_list
            if (indexed_route := routes_by_path.get(route_path))
            for action in triggers_by_route.get(indexed_route["routeId"], [])
        }
        reviewed_trigger_ids = sorted(REVIEWED_TRIGGERS_BY_WORKFLOW.get(workflow_id, set()))
        missing_reviewed_triggers = sorted(set(reviewed_trigger_ids) - workflow_trigger_ids)
        if missing_reviewed_triggers:
            raise SystemExit(
                f"reviewed trigger IDs not reachable from {workflow_id} routes: "
                + ", ".join(missing_reviewed_triggers)
            )
        engine_files = sorted(set(re.findall(r"(?:src|tests)/[A-Za-z0-9_./-]+\.(?:ts|tsx|js|jsx)", original.get("engine", ""))))
        test_files = sorted(set(re.findall(r"(?:src|tests)/[A-Za-z0-9_./-]+\.(?:ts|tsx|js|jsx)", original.get("tests", ""))))
        service_hints = SERVICE_HINTS[workflow_id]
        outbox_actions = [
            action for action in index["offlineModel"]["fieldOutboxWrites"]
            if any(hint.casefold() in action["procedure"].casefold() for hint in service_hints)
        ]
        if workflow_id == "WF-005":
            outbox_actions = index["offlineModel"]["fieldOutboxWrites"]
        linked_source_files = {route["sourcePage"] for route in route_records if route.get("sourcePage")}
        for action in unique_actions.values():
            linked_source_files.update(action.get("uiSourceFiles", []))
            if action.get("serverSource"):
                linked_source_files.add(action["serverSource"]["sourceFile"])
        service_hints = SERVICE_HINTS[workflow_id]
        orphaned_ui = [
            component for component in unreferenced_ui
            if (
                workflow_id in ORPHAN_UI_WORKFLOW_OVERRIDES[component["sourceFile"]]
                if component["sourceFile"] in ORPHAN_UI_WORKFLOW_OVERRIDES
                else any(
                    any(hint.casefold() in hook.casefold() for hint in service_hints)
                    for hook in component["hooks"]
                )
            )
        ]
        result.append({
            "workflowId": workflow_id,
            "name": title,
            "domain": original.get("domain"),
            "description": original.get("description"),
            "originalStatus": original.get("status"),
            "parityType": original.get("parityType"),
            "platforms": original.get("platforms"),
            "sourceEngineFiles": [{"path": item, "presentInCanonicalCommit": (SOURCE / item).is_file()} for item in engine_files],
            "sourceTestFiles": [{"path": item, "presentInCanonicalCommit": (SOURCE / item).is_file()} for item in test_files],
            "declaredSourceFilesNotLinkedFromMappedRoutes": sorted(
                item for item in engine_files
                if (SOURCE / item).is_file() and item not in linked_source_files
            ),
            "unreferencedUiComponentsWithRelatedHooks": orphaned_ui,
            "unreferencedUiTriggerCandidateIds": sorted({
                action["actionId"]
                for component in orphaned_ui
                for action in component.get("triggerCandidates", [])
            }),
            "m13Packet": packet_by_id[workflow_id],
            "canonicalRoutes": route_records,
            "sourceActionIds": sorted(unique_actions),
            "sourceOperations": sorted(
                {action["hook"] for action in unique_actions.values()}
                | SOURCE_OPERATION_SUPPLEMENTS.get(workflow_id, set())
            ),
            "outboxActionIds": [action["actionId"] for action in outbox_actions],
            "outboxOperations": [action["procedure"] for action in outbox_actions],
            "offlineReadPaths": index["offlineModel"]["persistedReadQueryPaths"] if workflow_id == "WF-005" else [],
            "triggerActionIdsWithMutationCandidates": sorted({action["actionId"] for action in trigger_actions}),
            "serverSourceFiles": sorted({action["serverSource"]["sourceFile"] for action in unique_actions.values() if action.get("serverSource")}),
            "permissionReviewState": "candidate guards are in the source action index; effective permissions require T01 review",
            "offlinePolicies": sorted({action["offlinePolicy"] for action in unique_actions.values()}),
            "userDirectedDisposition": USER_DECISIONS.get(workflow_id),
            "sourceReviewedActionIds": ipc_reviewed_actions,
            "sourceReviewedTriggerIds": reviewed_trigger_ids,
            "sourceReviewState": (
                "daily-report mobile draft/send and office create/status/delete triggers reviewed; remaining form/attachment paths and runtime remain unverified"
                if workflow_id == "WF-001" else
                "IPC/worksheet procedure permissions and user-directed disposition reviewed; selected register/detail triggers reviewed; remaining route triggers and GridCraft runtime remain unverified"
                if workflow_id in USER_DECISIONS else
                "field capture, office review gates and outbox/offline policy reviewed; detailed form controls and full module lifecycle remain unverified"
                if workflow_id in FIELD_WORKFLOWS else
                "core BOQ/rate/snapshot routes and permission contracts reviewed; detailed controls, full catalog lifecycle and runtime remain unverified"
                if workflow_id in COMMERCIAL_WORKFLOWS else
                "purchase-order service boundaries reviewed; vendor bill and payment controls are in an unreferenced materials component"
                if workflow_id == "WF-015" else
                "inventory route/source transactions reviewed; store management, organization inventory and physical-count reconciliation screens are unreferenced from mapped routes"
                if workflow_id == "WF-016" else
                "transfer dialog fields, mode, submit, dismiss and success callbacks reviewed; transfer list, GRN receipt and cancellation controls are in unreferenced components and are not reachable from the mapped routes"
                if workflow_id == "WF-017" else
                "handover manager, selected My Tasks controls and My Access delegation-visibility path traced to source handlers and server guards; remaining route/shared controls and runtime are unverified"
                if workflow_id == "WF-040" else
                "Finance route navigation, bank accounts/payables, project-cost widgets, Day Book, Money In/Out and inspector/edit-dialog controls traced through source handlers and ledger guards; other finance controls and runtime remain unverified"
                if workflow_id == "WF-024" else
                "organization guarantee register, create/edit form, extension dialog, view handoff, conversion, project link/unlink, release and deletion controls traced to source operations; remaining finance controls and runtime remain unverified"
                if workflow_id == "WF-025" else
                "JV agreement and commission payout controls on organization finance traced through IPC basis, project grants, delegation and ledger mutations; remaining JV and runtime paths remain unverified"
                if workflow_id == "WF-038" else
                "tax, procurement, stock and transfer server permissions/transitions reviewed; selected direct VAT bill/attachment triggers reviewed; remaining UI paths and transaction acceptance remain unverified"
                if workflow_id in TAX_MATERIALS_WORKFLOWS else
                "BOQ/version and variation-order service/permission boundaries reviewed; selected snapshot and VO lifecycle triggers reviewed; remaining BOQ/rate controls and runtime remain unverified"
                if workflow_id == "WF-009" else
                "BOQ item create/edit/delete/duplicate service guards reviewed; principal hierarchy controls source-reviewed; import/export, remaining controls and runtime remain unverified"
                if workflow_id == "WF-006" else
                "rate-analysis batch, ingredient and copy controls source-reviewed; distinct from contractual BOQ rate editing; catalog/profile controls and runtime remain unverified"
                if workflow_id == "WF-007" else
                "rate-profile preview selection, protected-rate replacement and fingerprint-bound apply controls reviewed; catalogs and runtime remain unverified"
                if workflow_id == "WF-008" else
                "organization employment actions are in an unreferenced component and do not currently form a mapped employee lifecycle"
                if workflow_id == "WF-021" else
                "attendance, leave and muster-roll components are unreferenced from the mapped routes; server endpoints do not establish a navigable workflow"
                if workflow_id == "WF-022" else
                "advances, payroll management and payroll-allocation controls are in unreferenced components; calculation and approval journeys remain unmapped"
                if workflow_id == "WF-023" else
                "global dashboard tab and conditional error controls plus its permission-filtered REST/query sources traced; project dashboard controls and runtime remain open"
                if workflow_id in ("WF-024", "WF-041") else
                "equipment router composition, permission and transaction boundaries reviewed; selected fuel, spot-hire and rental billing triggers reviewed; remaining control mapping and runtime remain unverified"
                if workflow_id in EQUIPMENT_WORKFLOWS else
                "workforce, accounting, payroll and fiscal-lock source boundaries reviewed; full control mapping and runtime remain unverified"
                if workflow_id in WORKFORCE_FINANCE_WORKFLOWS else
                "drawing, takeoff, scheduling, calendar and import source boundaries reviewed; full trigger mapping and runtime remain unverified"
                if workflow_id in DRAWING_PLANNING_WORKFLOWS else
                "JV, RFI/submittal, responsibility handover and dashboard source boundaries reviewed; full trigger mapping and runtime remain unverified"
                if workflow_id in COMPLETION_WORKFLOWS else
                "candidate crosswalk only; source action semantics require review"
            ),
            "sourceReviewReference": (
                "docs/reports/M13/ipc-source-action-reconciliation.md"
                if workflow_id in USER_DECISIONS else
                "docs/reports/M13/field-and-sync-source-action-reconciliation.md"
                if workflow_id in FIELD_WORKFLOWS else
                "docs/reports/M13/commercial-source-action-reconciliation.md"
                if workflow_id in COMMERCIAL_WORKFLOWS else
                "docs/reports/M13/tax-procurement-inventory-source-action-reconciliation.md"
                if workflow_id in TAX_MATERIALS_WORKFLOWS else
                "docs/reports/M13/equipment-source-action-reconciliation.md"
                if workflow_id in EQUIPMENT_WORKFLOWS else
                "docs/reports/M13/workforce-and-finance-source-action-reconciliation.md"
                if workflow_id in WORKFORCE_FINANCE_WORKFLOWS else
                "docs/reports/M13/drawings-and-planning-source-action-reconciliation.md"
                if workflow_id in DRAWING_PLANNING_WORKFLOWS else
                "docs/reports/M13/completion-workflows-source-action-reconciliation.md"
                if workflow_id in COMPLETION_WORKFLOWS else None
            ),
            "reviewState": "M00-to-route/service crosswalk candidate; not parity or runtime acceptance evidence",
        })
    OUTPUT.write_text(json.dumps({
        "sourceCommit": index["source"]["commit"],
        "sourceMatrix": "docs/reports/M00/feature-matrix.json",
        "workflowCount": len(result),
        "limitations": [
            "Route and service links are explicit review candidates; shared route services can serve more than one workflow.",
            "M00 engine/test entries are compared for file existence only; existence does not prove execution or current behavior.",
            "A present M00 engine file absent from mapped route/action source links may be a server lifecycle, orphaned UI module or incomplete route mapping; it is retained for review.",
            "Unreferenced UI components with matching service hooks are candidates only; they may be intentionally dormant, legacy or omitted from the route graph.",
            "User-directed IPC/GridCraft dispositions supersede only the listed source editing/import outcomes.",
        ],
        "workflows": result,
    }, indent=2, sort_keys=True) + "\n")
    print(f"wrote {OUTPUT} with {len(result)} workflow crosswalk rows")


if __name__ == "__main__":
    main()
