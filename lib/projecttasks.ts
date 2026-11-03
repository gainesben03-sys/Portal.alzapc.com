// Project steps with an owner and a due date become tasks, so they land on that person's list
// (Ben's "You owe", or a manager's "Needs you") with the usual reminders. Checking one off checks the other.

import { Action, ADVISOR, Person, Project } from "./data";

const isBen = (p?: Person) => !!p && (p.name === ADVISOR.name || (!!p.email && !!ADVISOR.email && p.email.toLowerCase() === ADVISOR.email.toLowerCase()));
const newId = () => `a${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;

/**
 * Bring the tasks in line with a project's steps after an edit.
 * Returns the updated project (steps carry their task id) and the full actions list.
 */
export function syncStepTasks(next: Project, prev: Project | undefined, actions: Action[], by: { name: string; advisor: boolean; person?: Person }): { project: Project; actions: Action[]; created: Action[]; forBen: Action[] } {
  const now = new Date().toISOString();
  const out = [...actions];
  const created: Action[] = [];
  const idx = (id?: string) => (id ? out.findIndex((a) => a.id === id) : -1);
  const log = (text: string) => ({ at: now, by: by.name, text });

  const steps = next.steps.map((s) => {
    const i = idx(s.actionId);
    if (!s.owner || !s.due) {
      // unassigned: close out the task it had
      if (i >= 0) closeOut(i);
      return { ...s, actionId: undefined };
    }
    const side: Action["side"] = isBen(s.owner) ? "alza" : "client";
    const owner = side === "alza" ? ADVISOR : s.owner;
    if (i >= 0) {
      const a = out[i];
      const status: Action["status"] = s.done ? "completed" : a.status === "completed" ? "not_started" : a.status;
      const changed = a.title !== s.text || a.due !== s.due || a.owner.name !== owner.name || a.status !== status || a.side !== side;
      if (changed)
        out[i] = {
          ...a,
          title: s.text,
          due: s.due,
          owner,
          side,
          status,
          completedAt: status === "completed" ? a.completedAt ?? now : undefined,
          history: [...a.history, log(a.owner.name !== owner.name ? `Reassigned to ${owner.name}` : status !== a.status ? (status === "completed" ? "Checked off on the project" : "Reopened on the project") : "Updated from the project")],
        };
      return s;
    }
    const a: Action = {
      id: newId() + created.length,
      clientId: next.clientId,
      side,
      kind: side === "alza" ? "document" : "todo",
      title: s.text,
      detail: `A step in "${next.name}".`,
      owner,
      due: s.due,
      status: s.done ? "completed" : "not_started",
      completedAt: s.done ? now : undefined,
      projectId: next.id,
      attachments: [],
      history: [log(`Added from the project "${next.name}" and assigned to ${owner.name}`)],
      requestedBy: side === "alza" && !by.advisor ? by.person : undefined,
    };
    out.push(a);
    created.push(a);
    return { ...s, actionId: a.id };
  });

  // steps that were removed
  for (const old of prev?.steps ?? []) if (old.actionId && !next.steps.some((s) => s.id === old.id)) {
    const i = idx(old.actionId);
    if (i >= 0) closeOut(i);
  }

  function closeOut(i: number) {
    const a = out[i];
    if (a.status === "completed") return;
    // only Ben can delete; for everyone else the task is closed with a note
    if (by.advisor) out.splice(i, 1);
    else out[i] = { ...a, status: "completed", completedAt: now, history: [...a.history, log("Removed from the project")] };
  }

  const cur = steps.find((s) => !s.done);
  return { project: { ...next, steps, nextMilestone: cur?.text ?? next.nextMilestone }, actions: out, created, forBen: created.filter((a) => a.side === "alza") };
}

/** After tasks change anywhere, check off (or reopen) the project steps they belong to. */
export function stepsFromTasks<S extends { projects: Project[]; actions: Action[] }>(s: S): S {
  let changed = false;
  const byId = new Map(s.actions.map((a) => [a.id, a]));
  const projects = s.projects.map((p) => {
    let touched = false;
    const steps = p.steps.map((st) => {
      const a = st.actionId ? byId.get(st.actionId) : undefined;
      if (!a) return st;
      const done = a.status === "completed";
      if (done === st.done) return st;
      touched = true;
      return { ...st, done, doneAt: done ? a.completedAt ?? new Date().toISOString() : undefined };
    });
    if (!touched) return p;
    changed = true;
    const cur = steps.find((x) => !x.done);
    return { ...p, steps, nextMilestone: cur?.text ?? p.nextMilestone };
  });
  return changed ? { ...s, projects } : s;
}

/** Who can change a project: Ben always; for a project the client started, an executive or the person who started it. */
export function canEditProject(p: Project, v: { advisor: boolean; access?: string; email?: string }): boolean {
  if (v.advisor) return true;
  if (!p.createdBy) return false; // Ben's projects are his to change
  if (v.access === "exec") return true;
  return !!p.createdBy?.email && !!v.email && p.createdBy.email.toLowerCase() === v.email.toLowerCase();
}
