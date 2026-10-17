# GridCraft IPC workbook qualification

Status: **T14 fails the available GridCraft save-cycle evidence and remains open.** This report contains package structure and aggregate differences only; it omits workbook names, cell contents, identifiers and hashes.

## Evidence

A local input/output pair was compared with [`compare_xlsx_preservation.py`](../../scripts/compare_xlsx_preservation.py). The output workbook's Open XML application metadata identifies GridCraft. Its saved copy preserves the 105 worksheet names and the total formula-cell count, but it changes 18,253 formula expressions and 3,532 cached formula results, and adds 143 formula-error cells. It also loses 11 embedded media parts, changes 10 others, reduces picture objects from 21 to 10, shape objects from 6 to 2, and group objects from 7 to 0. The structural diff flags changed layout signatures on all 105 worksheets, 140,819 changed cell-style references and all three drawing payloads for review. It removes 1,533 defined-name records and adds 1,529 (net four fewer), and 12 package parts are missing. External-link part count and content are unchanged.

The strict comparator passes when the input is compared with an identical copy and fails this GridCraft-stamped output. The workbook contents themselves were not printed or modified during comparison.

## Qualification boundary

The output metadata does not identify a GridCraft build, and the artifact pair does not include a launch/save/reopen log. This proves a preservation failure in the available save output, but it does not bind that failure to the currently installed GridCraft release. It does not establish calculation freshness for any changed cached result. Repeat the same comparison on a disposable representative workbook under a recorded GridCraft build, then independently reopen it and verify formula dependencies, rendered images/shapes and saved results. T14 is not passed until that run preserves or explicitly bounds all required workbook features and binds freshness evidence to the exact saved bytes.

The IPC payment publication gate remains closed. The 26 passing IPC unit tests cover Contractor's workbook-copy and revision-store invariants; they do not qualify GridCraft's workbook preservation or calculation engine.
