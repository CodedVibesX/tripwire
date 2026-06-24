// The shapes Tripwire produces. Every number a verdict shows is computed by the
// pipeline in verify.ts from real test execution, never hand-written.

export type Fn = (...args: any[]) => any;

export interface TestCase {
  name: string;
  // returns true if the implementation under test passes this test
  assert: (fn: Fn) => boolean;
  // optional human-readable probe (expected vs received) for the UI's hero line
  probe?: (fn: Fn) => { expected: string; received: string };
}

export interface MutationOp {
  name: string;
  apply: (src: string) => string; // returns possibly-unchanged source
}

export interface Scenario {
  id: string;
  title: string; // short verdict headline
  incident: string; // plain-English failure
  file: string;
  line: number;
  rootCause: string;
  signature: string; // params of the function under test, e.g. "items"
  buggy: string; // body of the original (buggy) implementation
  candidate: string; // body of the candidate patch the agent proposed
  diff: string[]; // display-only diff lines (each prefixed + or -)
  existingTests: TestCase[]; // the weak suite that stays green on the bug
  proofGuard: TestCase; // the discriminating test the suite never had
  regressionGuards: TestCase[]; // behaviour that must not break
  mutationOps: MutationOp[];
}

export type Decision = "SHIP" | "HOLD" | "REJECT";

export interface ConfidenceFactor {
  label: string;
  delta: number;
  note: string;
}

export interface SignalRow {
  label: string;
  value: string;
  ok: boolean;
}

export interface Verdict {
  id: string;
  title: string;
  incident: string;
  file: string;
  line: number;
  rootCause: string;
  diff: string[];
  decision: Decision;
  reason: string;
  confidence: number; // 0..1, confidence the patch is safe to auto-merge
  confidenceFactors: ConfidenceFactor[];
  guard: {
    source: string;
    assertionLine: string;
    expected: string;
    receivedOnBuggy: string;
    receivedOnFix: string;
    redOnBug: boolean; // guard fails on the buggy code (reproduction confirmed)
    greenOnFix: boolean; // guard passes on the candidate (headline fixed)
  };
  signals: SignalRow[];
  mutation: { total: number; killed: number; survivors: string[] };
  existingTestCount: number;
  generatedAt: string;
}
