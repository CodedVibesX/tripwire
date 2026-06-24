// Regenerates every verdict by really running the tests and mutations, then
// writes one JSON artifact per scenario into verdicts/. The deployed app renders
// those artifacts; it never runs code at view time. This is the falsifiability
// the README sells: clone it, change a bug, run `npm run verdict`, watch it move.
//
//   npm run verdict          regenerate verdicts/*.json
//   npm run verdict:check    regenerate in memory and fail if a decision drifts

import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { SCENARIOS } from "./scenarios.js";
import { verify } from "./verify.js";

const here = dirname(fileURLToPath(import.meta.url));
const outDir = join(here, "..", "verdicts");

const EXPECTED: Record<string, string> = { ship: "SHIP", hold: "HOLD", reject: "REJECT" };
const check = process.argv.includes("--check");

mkdirSync(outDir, { recursive: true });

let failed = false;
const pad = (s: string, n: number) => (s + " ".repeat(n)).slice(0, n);

console.log("\n  Tripwire: regenerating verdicts from real execution\n");
for (const scenario of SCENARIOS) {
  const v = verify(scenario);
  if (!check) {
    writeFileSync(join(outDir, `${v.id}.json`), JSON.stringify(v, null, 2) + "\n", "utf8");
  }
  const want = EXPECTED[v.id];
  const drift = want && want !== v.decision;
  if (drift) failed = true;
  const mark = drift ? "DRIFT" : "ok";
  console.log(
    `  ${pad(v.id, 7)} ${pad(v.decision, 7)} conf ${v.confidence.toFixed(2)}  ` +
      `mut ${v.mutation.killed}/${v.mutation.total}  guard ${v.guard.redOnBug ? "red-on-bug" : "----"}/${v.guard.greenOnFix ? "green-on-fix" : "red-on-fix"}  [${mark}]`,
  );
}
console.log("");
if (check && failed) {
  console.error("  A decision drifted from its expected value.\n");
  process.exit(1);
}
if (!check) console.log(`  wrote ${SCENARIOS.length} verdicts to verdicts/\n`);
