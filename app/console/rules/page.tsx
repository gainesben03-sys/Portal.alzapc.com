"use client";

import { AlzaNav, AlzaTopbar, useGuard } from "@/components/ui";
import { DEFAULT_RULES, Rules } from "@/lib/data";
import { useStore } from "@/lib/store";

export default function RulesPage() {
  const ok = useGuard("advisor");
  const { rules, setRules, getClient, clients } = useStore();
  if (!ok) return null;

  const set = (k: keyof Rules, v: number | boolean) => setRules({ ...rules, [k]: v });
  const num = (k: keyof Rules) => (
    <input
      className="f"
      type="number"
      min={1}
      max={30}
      value={rules[k] as number}
      onChange={(e) => set(k, Math.max(1, Number(e.target.value) || 1))}
    />
  );

  return (
    <>
      <AlzaTopbar />
      <AlzaNav />
      <main className="wrap">
        <h1>Reminder rules</h1>
        <p className="muted" style={{ marginTop: 6 }}>
          Default policy for every client action. All counts are business days. Changes apply right away across the
          console and client workspaces.
        </p>

        <div className="card section">
          <div className="rule">
            {num("friendlyBefore")}
            <div>
              <b>Friendly reminder</b>
              <div className="tiny muted">days before the due date, to the owner</div>
            </div>
          </div>
          <div className="rule">
            <input type="checkbox" checked={rules.dueDay} onChange={(e) => set("dueDay", e.target.checked)} />
            <div>
              <b>Due-date reminder</b>
              <div className="tiny muted">on the due date, to the owner</div>
            </div>
          </div>
          <div className="rule">
            {num("overdueNotice")}
            <div>
              <b>Overdue notice</b>
              <div className="tiny muted">days after the due date, to the owner</div>
            </div>
          </div>
          <div className="rule">
            {num("escalateAfter")}
            <div>
              <b>Escalation</b>
              <div className="tiny muted">days overdue, to the client's escalation contact</div>
            </div>
          </div>
          <div className="rule">
            {num("blockerAfter")}
            <div>
              <b>Blocker flag</b>
              <div className="tiny muted">days overdue, highlighted on your console</div>
            </div>
          </div>
        </div>

        <div className="section-head section">
          <h2>Escalation contacts</h2>
        </div>
        <div className="card">
          {clients.map((b) => getClient(b.id)!).map((c) => (
            <div className="row" key={c.id}>
              <div className="grow title">{c.name}</div>
              <div className="small muted">
                {c.escalation.name}, {c.escalation.role}
              </div>
            </div>
          ))}
        </div>

        <button className="btn ghost" style={{ marginTop: 14 }} onClick={() => setRules(DEFAULT_RULES)}>
          Restore defaults
        </button>
      </main>
    </>
  );
}
