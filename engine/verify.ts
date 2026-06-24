// The Tripwire pipeline. It is a verifier, not a generator: the buggy code, the
// candidate patch, and the guard test are all provided by the scenario, and this
// module EXECUTES them to decide ship / hold / reject. Nothing here is asserted;
// every signal comes from really running a function built from source.

import type {
  ConfidenceFactor,
  Fn,
  Scenario,
  SignalRow,
  TestCase,
  Verdict,
} from "./types.js";

function build(signature: string, body: string): Fn {
  // Real evaluation: the implementation under test is compiled from its source
  // and called for real. This is how "red on the bug, green on the fix" is
  // proven by execution rather than claimed.
  return new Function(signature, body) as Fn;
}

function passes(fn: Fn, test: TestCase): boolean {
  try {
    return test.assert(fn);
  } catch {
    return false;
  }
}

const SHIP_KILL_FLOOR = 0.7; // mutation kill-rate below this is not ship-worthy

export function verify(s: Scenario): Verdict {
  const buggy = build(s.signature, s.buggy);
  const candidate = build(s.signature, s.candidate);

  // 1. The existing (weak) suite. The failure mode is that it stays green on the
  //    bug, which is exactly why "tests pass" cannot mean "fix correct".
  const existingGreenOnBuggy = s.existingTests.every((t) => passes(buggy, t));
  const existingGreenOnCandidate = s.existingTests.every((t) => passes(candidate, t));

  // 2. The manufactured guard, proven by execution.
  const proofRedOnBug = !passes(buggy, s.proofGuard);
  const proofGreenOnFix = passes(candidate, s.proofGuard);
  const probe = s.proofGuard.probe
    ? s.proofGuard.probe(buggy)
    : { expected: "", received: "" };

  // 3. Regression guards: behaviour that must not break.
  const regressionsGreenOnCandidate = s.regressionGuards.every((t) => passes(candidate, t));
  const brokenRegression = s.regressionGuards.find((t) => !passes(candidate, t));

  // 4. Mutation: can the guard suite actually catch small changes to the patch?
  const guardSuite = [s.proofGuard, ...s.regressionGuards];
  const baselinePass = guardSuite.filter((t) => passes(candidate, t));
  let mutTotal = 0;
  let mutKilled = 0;
  const survivors: string[] = [];
  for (const op of s.mutationOps) {
    const mutated = op.apply(s.candidate);
    if (mutated === s.candidate) continue; // op did not apply; not a real mutant
    mutTotal++;
    let killed = false;
    try {
      const mutant = build(s.signature, mutated);
      // killed if any test that passed on the patch now fails on the mutant
      killed = baselinePass.some((t) => !passes(mutant, t));
    } catch {
      killed = true; // a mutant that will not even compile is detectably broken
    }
    if (killed) mutKilled++;
    else survivors.push(op.name);
  }
  const killRate = mutTotal ? mutKilled / mutTotal : 0;
  const blastRadius = s.diff.filter((l) => l.startsWith("+") || l.startsWith("-")).length;

  // 5. Decision. Rules first (legible and auditable); confidence is a separate
  //    mechanism-derived number, never a population statistic.
  let decision: Verdict["decision"];
  let reason: string;
  if (!existingGreenOnCandidate) {
    decision = "REJECT";
    reason = "The candidate patch does not even pass the existing suite.";
  } else if (proofRedOnBug && proofGreenOnFix && !regressionsGreenOnCandidate) {
    decision = "REJECT";
    reason = `The patch fixes the reported bug, but a regression guard now fails (${brokenRegression?.name}): it breaks adjacent behaviour.`;
  } else if (
    proofRedOnBug &&
    proofGreenOnFix &&
    regressionsGreenOnCandidate &&
    killRate >= SHIP_KILL_FLOOR
  ) {
    decision = "SHIP";
    reason =
      "The bug is reproduced, the patch fixes it, every regression guard holds, and the guard survives mutation. Safe to auto-merge.";
  } else if (proofRedOnBug && !proofGreenOnFix) {
    decision = "HOLD";
    reason =
      "The patch passes every existing test, but the guard I wrote still fails. This fix is plausible, not correct.";
  } else {
    decision = "HOLD";
    reason =
      "Signals conflict or the guard is inconclusive (weak mutation coverage). I do not know enough to auto-merge; deferring to a human.";
  }

  // 6. Confidence the patch is SAFE TO SHIP, decomposed so the UI shows the
  //    mechanism, not a magic number.
  // A verifier should never claim certainty, so this is capped below 1.0 and the
  // surviving mutants always leave residual doubt. It is a mechanism score, not a
  // calibrated population probability, and the UI shows the whole breakdown.
  const factors: ConfidenceFactor[] = [];
  let c = 0.4;
  const add = (label: string, delta: number, note: string) => {
    c += delta;
    factors.push({ label, delta: +delta.toFixed(3), note });
  };
  add(
    "reproduction confirmed",
    proofRedOnBug ? 0.12 : -0.25,
    proofRedOnBug ? "the guard fails on the buggy code" : "could not reproduce the bug with a guard",
  );
  add(
    "guard discriminates",
    proofGreenOnFix ? 0.12 : -0.3,
    proofGreenOnFix ? "the guard passes on the patch" : "the guard still fails on the patch",
  );
  add(
    "regressions hold",
    regressionsGreenOnCandidate ? 0.1 : -0.3,
    regressionsGreenOnCandidate ? "no regression guard broke" : "a regression guard broke",
  );
  add(
    "mutation coverage",
    killRate * 0.2,
    `the guard suite killed ${mutKilled} of ${mutTotal} mutants`,
  );
  add("blast radius", -Math.min(0.1, blastRadius * 0.015), `${blastRadius} changed lines`);
  const confidence = Math.max(0, Math.min(0.95, +c.toFixed(2)));

  const signals: SignalRow[] = [
    { label: "existing suite green on the bug", value: existingGreenOnBuggy ? "yes (the trap)" : "no", ok: existingGreenOnBuggy },
    { label: "existing suite green on the patch", value: existingGreenOnCandidate ? "yes" : "no", ok: existingGreenOnCandidate },
    { label: "guard red on the bug", value: proofRedOnBug ? "yes" : "no", ok: proofRedOnBug },
    { label: "guard green on the patch", value: proofGreenOnFix ? "yes" : "no", ok: proofGreenOnFix },
    { label: "regression guards hold", value: regressionsGreenOnCandidate ? "yes" : "no", ok: regressionsGreenOnCandidate },
    { label: "mutation kill-rate", value: `${mutKilled}/${mutTotal}`, ok: killRate >= SHIP_KILL_FLOOR },
  ];

  // The single assertion line the UI animates red-to-green.
  const assertionLine = `expect(cartTotal(cart)).toBe(${probe.expected})`;

  return {
    id: s.id,
    title: s.title,
    incident: s.incident,
    file: s.file,
    line: s.line,
    rootCause: s.rootCause,
    diff: s.diff,
    decision,
    reason,
    confidence,
    confidenceFactors: factors,
    guard: {
      source: s.proofGuard.name,
      assertionLine,
      expected: probe.expected,
      receivedOnBuggy: probe.received,
      redOnBug: proofRedOnBug,
      greenOnFix: proofGreenOnFix,
    },
    signals,
    mutation: { total: mutTotal, killed: mutKilled, survivors },
    existingTestCount: s.existingTests.length,
    generatedAt: new Date().toISOString(),
  };
}
