"use client";

import { useEffect, useState } from "react";
import type { Verdict } from "../engine/types";
import shipJson from "../verdicts/ship.json";
import holdJson from "../verdicts/hold.json";
import rejectJson from "../verdicts/reject.json";

const V = {
  ship: shipJson as unknown as Verdict,
  hold: holdJson as unknown as Verdict,
  reject: rejectJson as unknown as Verdict,
};
type Id = keyof typeof V;
const ORDER: Id[] = ["ship", "hold", "reject"];

export default function Page() {
  const [id, setId] = useState<Id>("ship");
  const [nonce, setNonce] = useState(0);
  const [phase, setPhase] = useState<"bug" | "fix">("bug");
  const v = V[id];

  // The one animation on the page: the guard's value resolving from the buggy
  // result to the result on the patch. Re-runs on scenario change and replay.
  useEffect(() => {
    setPhase("bug");
    const t = setTimeout(() => setPhase("fix"), 1150);
    return () => clearTimeout(t);
  }, [id, nonce]);

  const dec = v.decision.toLowerCase();
  const pass = phase === "fix" && v.guard.greenOnFix;
  const shown = phase === "bug" ? v.guard.receivedOnBuggy : v.guard.receivedOnFix;
  const survivors = v.mutation.survivors;

  return (
    <main className="page">
      <div className="card">
        <header>
          <div className="kicker">Tripwire · auto-fix verdict</div>
          <h1 className="incident">{v.incident}</h1>
          <div className="meta">
            <span className="mono">
              {v.file}:{v.line}
            </span>{" "}
            · an agent proposed a fix · {v.existingTestCount} existing tests passed
          </div>
        </header>

        <section className="grid">
          <aside className="context">
            <div className="panel">
              <div className="panel-label">Diagnosis</div>
              <div className="ctx-file">
                {v.file}:{v.line}
              </div>
              <p className="ctx-text">{v.rootCause}</p>
            </div>
            <div className="panel">
              <div className="panel-label">Proposed fix</div>
              <pre className="code diff">
                {v.diff.map((l, i) => (
                  <div key={i} className={l.startsWith("+") ? "add" : l.startsWith("-") ? "del" : ""}>
                    {l}
                  </div>
                ))}
              </pre>
            </div>
          </aside>

          <div className="panel guard">
            <div className="panel-label">Guard · the test the existing suite never had</div>
            <pre className="code guard-src">{v.guard.source}</pre>
            <div className={`assertion ${pass ? "pass" : "fail"}`}>
              <span className="run">cartTotal([$10.10, $10.10])</span>
              <span className="arrow">→</span>
              <span className="value value-anim" key={`${id}-${phase}-${nonce}`}>
                {shown}
              </span>
              <span className="cmp">expected {v.guard.expected}</span>
              <span className="badge">{pass ? "PASS" : "FAIL"}</span>
            </div>
            <div className="guard-caption">
              Fails on the buggy code.{" "}
              {v.guard.greenOnFix ? "Passes on the patch." : "Still fails on the patch."} The guard
              suite killed {v.mutation.killed} of {v.mutation.total} mutants.
              {survivors.length > 0 && (
                <span className="survivors">
                  {" "}
                  {survivors.length} equivalent mutant{survivors.length > 1 ? "s" : ""} survived (
                  {survivors.join(", ")}).
                </span>
              )}
            </div>
          </div>
        </section>

        <div className="verdict">
          <div className={`chip ${dec}`}>{v.decision}</div>
          <div>
            <p className="reason">{v.reason}</p>
            <div className="conf-row">
              <span className="conf-label">confidence it is safe to ship</span>
              <span className="conf-num">{v.confidence.toFixed(2)}</span>
            </div>
            <div className="bar">
              <div className="fill" style={{ width: `${Math.round(v.confidence * 100)}%` }} />
            </div>
            <ul className="factors">
              {v.confidenceFactors.map((f, i) => (
                <li key={i}>
                  <span>
                    {f.label} — {f.note}
                  </span>
                  <span className={`v ${f.delta >= 0 ? "pos" : "neg"}`}>
                    {f.delta >= 0 ? "+" : ""}
                    {f.delta}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        </div>

        <div className="controls">
          <div className="switch">
            {ORDER.map((o) => (
              <button key={o} className={o === id ? "active" : ""} onClick={() => setId(o)}>
                {o}
              </button>
            ))}
          </div>
          <button className="replay" onClick={() => setNonce((n) => n + 1)}>
            Replay
          </button>
        </div>
        <div className="signature">
          every number regenerated by `npm run verdict` from real test execution, not a mockup
        </div>
      </div>
    </main>
  );
}
