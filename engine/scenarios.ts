// One real bug, three candidate patches. The function under test is a cart total
// with a 5% loyalty discount, expressed in integer cents so the math is exact and
// the verdict can never hinge on float noise.
//
//   correct:  discount the SUBTOTAL once
//   buggy:    discount EACH LINE and floor it, dropping fractional cents per line
//
// The weak existing suite only checks clean single-item carts, so it stays green
// on the bug. That is the trap Tripwire exists to catch.

import type { MutationOp, Scenario, TestCase } from "./types.js";

const money = (c: number) => "$" + (c / 100).toFixed(2);

const SIGNATURE = "items";

// The original implementation that shipped the bug.
const BUGGY = "return items.reduce((s, line) => s + (line - Math.floor(line / 20)), 0);";

// The weak suite: clean carts whose lines are multiples of 20 cents, so flooring
// changes nothing and the suite passes on the bug AND on every candidate.
const EXISTING: TestCase[] = [
  { name: "single item $10.00", assert: (f) => f([1000]) === 950 },
  { name: "single item $20.00", assert: (f) => f([2000]) === 1900 },
  { name: "two clean items $10 + $20", assert: (f) => f([1000, 2000]) === 2850 },
];

// The discriminating guard the suite never had: a multi-item cart with a line
// that carries a fractional cent ($10.10). Correct total is $19.19.
const PROOF: TestCase = {
  name:
    "test('multi-item cart keeps every cent', () => {\n  expect(cartTotal([1010, 1010])).toBe(1919) // $19.19\n})",
  assert: (f) => f([1010, 1010]) === 1919,
  probe: (f) => ({ expected: money(1919), received: money(f([1010, 1010])) }),
};

// Behaviour that must not break for a fix to be safe.
const REGRESSIONS: TestCase[] = [
  { name: "bulk cart 6 x $10.00 = $57.00", assert: (f) => f([1000, 1000, 1000, 1000, 1000, 1000]) === 5700 },
  { name: "empty cart = $0.00", assert: (f) => f([]) === 0 },
  { name: "total never exceeds subtotal", assert: (f) => f([1010, 1010]) <= 2020 },
];

// Hand-picked, committed mutants. Some are genuinely equivalent on these inputs
// (ceil/round of an exact division) and survive; that is reported honestly.
const MUTATIONS: MutationOp[] = [
  { name: "subtract -> add", apply: (s) => s.replace("sub - Math.floor", "sub + Math.floor") },
  { name: "floor -> ceil", apply: (s) => s.replace("Math.floor", "Math.ceil") },
  { name: "floor -> round", apply: (s) => s.replace("Math.floor", "Math.round") },
  { name: "rate /20 -> /19", apply: (s) => s.replace("/ 20", "/ 19") },
  { name: "rate /20 -> /21", apply: (s) => s.replace("/ 20", "/ 21") },
  { name: "sum + line -> - line", apply: (s) => s.replace("s + line", "s - line") },
  { name: "reduce init 0 -> 1", apply: (s) => s.replace(", 0)", ", 1)") },
  { name: "rate /20 -> /40", apply: (s) => s.replace("sub / 20", "sub / 40") },
];

const base = {
  signature: SIGNATURE,
  buggy: BUGGY,
  file: "src/cart/pricing.ts",
  line: 14,
  rootCause:
    "The 5% loyalty discount is floored on each line, so a fractional cent is dropped per line and the error compounds as the cart grows.",
  incident: "Checkout total is off by a cent on multi-item carts",
  existingTests: EXISTING,
  proofGuard: PROOF,
  regressionGuards: REGRESSIONS,
  mutationOps: MUTATIONS,
};

export const SCENARIOS: Scenario[] = [
  {
    ...base,
    id: "ship",
    title: "Safe to auto-merge",
    // Correct fix: discount the subtotal once.
    candidate: "const sub = items.reduce((s, line) => s + line, 0); return sub - Math.floor(sub / 20);",
    diff: [
      "- return items.reduce((s, line) => s + (line - Math.floor(line / 20)), 0);",
      "+ const sub = items.reduce((s, line) => s + line, 0);",
      "+ return sub - Math.floor(sub / 20);",
    ],
  },
  {
    ...base,
    id: "hold",
    title: "Plausible, not correct",
    // Looks reasonable, passes the weak suite, but still computes per line (now
    // with round), so it still misses the real multi-item total.
    candidate: "return items.reduce((s, line) => s + (line - Math.round(line / 20)), 0);",
    diff: [
      "- return items.reduce((s, line) => s + (line - Math.floor(line / 20)), 0);",
      "+ return items.reduce((s, line) => s + (line - Math.round(line / 20)), 0);",
    ],
  },
  {
    ...base,
    id: "reject",
    title: "Breaks bulk carts",
    // Fixes the headline cart, but a stray "bulk bonus" double-applies the
    // discount on carts of more than five items.
    candidate:
      "const sub = items.reduce((s, line) => s + line, 0); let total = sub - Math.floor(sub / 20); if (items.length > 5) total = total - Math.floor(sub / 20); return total;",
    diff: [
      "- return items.reduce((s, line) => s + (line - Math.floor(line / 20)), 0);",
      "+ const sub = items.reduce((s, line) => s + line, 0);",
      "+ let total = sub - Math.floor(sub / 20);",
      "+ if (items.length > 5) total = total - Math.floor(sub / 20);",
      "+ return total;",
    ],
  },
];
