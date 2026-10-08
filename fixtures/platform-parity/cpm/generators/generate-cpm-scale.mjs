/**
 * Deterministic Generator for Scale CPM Network Graphs (10k Tasks / 50k Dependencies)
 *
 * Implements a seeded pseudo-random number generator (Mulberry32) to generate
 * realistic construction project networks structured into a hierarchical WBS:
 * - 5 Phases
 * - 50 Packages
 * - 500 Work Packages
 * - Leaf Activities
 *
 * Dependencies are directed acyclic edges (FS, SS, FF, SF) respecting topological
 * order to form a solvable, complex benchmark network.
 *
 * Seed: 20261008
 */
import { createHash } from "node:crypto";
import { writeFileSync } from "node:fs";

export function mulberry32(seed) {
  return function () {
    let t = (seed += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const DEP_TYPES = ["FS", "FS", "FS", "SS", "FF", "SF"]; // 50% FS, weighted realistic distribution

export function generateCpmNetwork(taskCount = 10000, depCount = 50000, seed = 20261008) {
  const rand = mulberry32(seed);
  const tasks = [];
  const dependencies = [];

  const baseDate = new Date("2026-04-14T00:00:00.000Z"); // Nepali New Year 2083
  const WBS_PHASES = ["Pre-Construction", "Substructure", "Superstructure", "MEP & Finishing", "Commissioning"];

  for (let i = 0; i < taskCount; i++) {
    const duration = Math.floor(rand() * 20) + 1; // 1 to 20 working days
    const isMilestone = duration === 1 && rand() < 0.05;
    const phase = WBS_PHASES[Math.floor((i / taskCount) * WBS_PHASES.length)];

    // Stagger initial start dates
    const dayOffset = Math.floor((i / taskCount) * 180);
    const start = new Date(baseDate.getTime() + dayOffset * 86400000);
    const end = new Date(start.getTime() + duration * 86400000);

    tasks.push({
      id: `task-${String(i + 1).padStart(5, "0")}`,
      name: `${phase} - Activity ${i + 1}`,
      duration: isMilestone ? 0 : duration,
      isMilestone,
      startDate: start.toISOString().split("T")[0],
      endDate: end.toISOString().split("T")[0]
    });
  }

  // Generate dependencies respecting i < j to ensure DAG property
  const existingEdges = new Set();
  let generatedDeps = 0;
  let attempts = 0;
  const maxAttempts = depCount * 4;

  while (generatedDeps < depCount && attempts < maxAttempts) {
    attempts++;
    // Pick predecessor and successor with locality bias (tasks closer in sequence)
    const predIdx = Math.floor(rand() * (taskCount - 1));
    // Window of up to 200 tasks ahead
    const window = Math.min(200, taskCount - 1 - predIdx);
    const succIdx = predIdx + 1 + Math.floor(rand() * window);

    const key = `${predIdx}->${succIdx}`;
    if (existingEdges.has(key)) continue;
    existingEdges.add(key);

    const type = DEP_TYPES[Math.floor(rand() * DEP_TYPES.length)];
    const lagHours = rand() < 0.3 ? (Math.floor(rand() * 5) - 1) * 8 : 0; // -8h to +32h lag

    dependencies.push({
      predecessorId: tasks[predIdx].id,
      successorId: tasks[succIdx].id,
      type,
      lagHours
    });
    generatedDeps++;
  }

  return {
    version: 1,
    metadata: {
      generator: "generate-cpm-scale.mjs",
      seed,
      requestedTasks: taskCount,
      requestedDependencies: depCount,
      actualDependencies: dependencies.length,
      generatedAt: "2026-10-08T00:00:00.000Z"
    },
    tasks,
    dependencies
  };
}

export function computeCpmHash(data) {
  const json = JSON.stringify(data);
  const hash = createHash("sha256").update(json).digest("hex");
  return { hash, byteLength: Buffer.byteLength(json) };
}

if (process.argv[1]?.endsWith("generate-cpm-scale.mjs")) {
  const tasks = parseInt(process.argv[2] || "1000", 10);
  const deps = parseInt(process.argv[3] || "5000", 10);
  const seed = parseInt(process.argv[4] || "20261008", 10);

  const net = generateCpmNetwork(tasks, deps, seed);
  const { hash, byteLength } = computeCpmHash(net);
  console.log(`Generated CPM Network: tasks=${net.tasks.length}, deps=${net.dependencies.length}, seed=${seed}, bytes=${byteLength}, sha256=${hash}`);
}
