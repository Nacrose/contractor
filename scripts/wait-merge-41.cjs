#!/usr/bin/env node
/**
 * Wait for all check-runs on PR #36 head to complete, then merge (merge commit).
 * Merges on CHECK-RUN conclusions only (Task 15 lesson).
 * Usage: GH_TOKEN=... node scripts/wait-merge-36.cjs [maxSeconds]
 */
const https = require("https");

const TOKEN = process.env.GH_TOKEN;
const PR = 41;
const BRANCH = "plan-amend-m04-task-level";
const MAX_S = Number(process.argv[2] || 480);

function api(path, method = "GET", body = null) {
  return new Promise((resolve, reject) => {
    const req = https.request(
      { hostname: "api.github.com", path, method,
        headers: { "User-Agent": "merge-bot", Authorization: "token " + TOKEN,
          Accept: "application/vnd.github+json", "Content-Type": "application/json" } },
      (res) => {
        let d = "";
        res.on("data", (c) => (d += c));
        res.on("end", () => {
          let j = null; try { j = d ? JSON.parse(d) : null; } catch { j = d; }
          resolve({ status: res.statusCode, body: j });
        });
      }
    );
    req.on("error", reject);
    req.end(body ? JSON.stringify(body) : null);
  });
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

(async () => {
  const t0 = Date.now();
  let sha = null;
  while (Date.now() - t0 < MAX_S * 1000) {
    if (!sha) {
      const pr = await api(`/repos/Nacrose/contractor/pulls/${PR}`);
      if (pr.status !== 200) { console.log("PR fetch", pr.status, JSON.stringify(pr.body).slice(0, 200)); process.exit(1); }
      if (pr.body.state !== "open") { console.log("PR not open:", pr.body.state, "merged:", pr.body.merged_at); process.exit(0); }
      sha = pr.body.head.sha;
    }
    const runs = await api(`/repos/Nacrose/contractor/commits/${sha}/check-runs?per_page=100`);
    const list = runs.body?.check_runs ?? [];
    if (list.length > 0) {
      const pending = list.filter((c) => c.status !== "completed");
      const failed = list.filter((c) => c.status === "completed" && !["success", "skipped", "neutral"].includes(c.conclusion));
      console.log(`[${Math.round((Date.now() - t0) / 1000)}s] runs=${list.length} pending=${pending.length} failed=${failed.length} :: ${list.map((c) => `${c.name}:${c.status === "completed" ? c.conclusion : c.status}`).join(", ")}`);
      if (failed.length > 0) { console.log("CI FAILED:", failed.map((c) => c.name).join(", ")); process.exit(2); }
      if (pending.length === 0) {
        const m = await api(`/repos/Nacrose/contractor/pulls/${PR}/merge`, "PUT", { merge_method: "merge", commit_title: `Merge pull request #${PR} from Nacrose/${BRANCH}` });
        console.log("MERGE:", m.status, m.status === 200 ? `sha=${m.body.sha}` : JSON.stringify(m.body).slice(0, 300));
        if (m.status === 200) {
          const ref = await api(`/repos/Nacrose/contractor/git/refs/heads/${BRANCH}`, "DELETE");
          console.log("BRANCH DELETE:", ref.status);
        }
        process.exit(m.status === 200 ? 0 : 3);
      }
    } else {
      console.log(`[${Math.round((Date.now() - t0) / 1000)}s] no check-runs yet (sha ${sha?.slice(0, 7)})`);
    }
    await sleep(30_000);
  }
  console.log("TIMEOUT: CI still running after", MAX_S, "s — rerun to continue waiting");
  process.exit(4);
})().catch((e) => { console.error("ERR", e.message); process.exit(1); });
