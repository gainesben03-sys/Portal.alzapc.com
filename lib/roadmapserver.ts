// HR Roadmap, daily: start items on their start date, send reminders before them, and line up
// next year's copy of anything finished. Reminder timing and recipients come from each company's settings.
import type { SupabaseClient } from "@supabase/supabase-js";
import { loadCtx, mail } from "./complianceserver";
import { addDays, daysUntil, fmtRange, isRoadmap, nextCopy, roadmapFor, RoadmapProject, todayISO, tplById } from "./roadmap";
import { advisorEmails, pushTo } from "./push";
import { PORTAL_URL, sendEmail } from "./server";

type DB = SupabaseClient;

export async function roadmapCron(db: DB, log: string[]) {
  const day = todayISO();
  const { data: rows } = await db.from("projects").select("id, client_id, data").not("data->roadmap", "is", null).limit(3000);
  const byClient = new Map<string, RoadmapProject[]>();
  for (const r of rows ?? []) {
    const p = { ...(r.data as RoadmapProject), id: r.id as string, clientId: r.client_id as string };
    if (isRoadmap(p)) byClient.set(p.clientId, [...(byClient.get(p.clientId) ?? []), p]);
  }
  const ben = await advisorEmails(db);
  for (const [clientId, items] of byClient) {
    const x = await loadCtx(db, clientId);
    if (!x) continue;
    const s = roadmapFor(x.cfg.roadmap);
    const { data: execs } = s.toExecs ? await db.from("members").select("email").eq("client_id", clientId).eq("access", "exec") : { data: [] };
    const put = async (p: RoadmapProject) => { const { id, ...data } = p; await db.from("projects").update({ data }).eq("id", id); };

    for (const p0 of items) {
      let p = p0;
      // finished elsewhere (e.g. the Projects page): line up the next one
      if (p.status === "done") {
        if (!p.roadmap.next && p.roadmap.repeat !== "none") {
          const c = nextCopy(p);
          if (c) {
            const { id, ...data } = c;
            await db.from("projects").insert({ id, client_id: clientId, created_by: "roadmap@portal", data });
            await put({ ...p, roadmap: { ...p.roadmap, next: c.id } });
            log.push(`roadmap: next ${c.name} for ${x.company} on ${c.roadmap.start}`);
          }
        }
        continue;
      }
      // its day has come
      if (p.status === "planned" && p.roadmap.start <= day) {
        p = { ...p, status: "active", startedAt: new Date().toISOString(), milestoneDue: p.roadmap.end };
        await put(p);
        log.push(`roadmap: started ${p.name} for ${x.company}`);
      }
      // which reminder, if any, is due today (only the closest one; skipped ones are marked so they never pile up)
      const sent = new Set(p.roadmap.sent ?? []);
      let key = "";
      let why = "";
      const before = s.remind.filter((n) => day >= addDays(p.roadmap.start, -n) && day < p.roadmap.start && !sent.has(String(n)));
      if (before.length) {
        const n = Math.min(...before);
        before.forEach((b) => sent.add(String(b)));
        key = String(n);
        why = `starts in ${daysUntil(p.roadmap.start, day)} days`;
      } else if (s.dueDay && day >= p.roadmap.end && !sent.has("due") && daysUntil(day, p.roadmap.end) <= 3) {
        key = "due";
        why = "is due today";
      } else if (s.overdueWeekly && day > p.roadmap.end && daysUntil(day, p.roadmap.end) % 7 === 0 && !sent.has(`late-${day}`)) {
        key = `late-${day}`;
        why = `is ${daysUntil(day, p.roadmap.end)} days overdue`;
      }
      if (!key) continue;
      sent.add(key);
      const to = [...new Set([
        ...(s.toOwner && p.roadmap.owner?.email ? [p.roadmap.owner.email] : []),
        ...(s.toBen ? ben : []),
        ...((execs ?? []) as { email: string }[]).map((e) => e.email),
        ...s.extra,
      ].map((e) => e.toLowerCase()).filter(Boolean))];
      await put({ ...p, roadmap: { ...p.roadmap, sent: [...sent].slice(-40) } });
      if (!to.length) continue;
      const open = p.steps.filter((st) => !st.done);
      const url = `${PORTAL_URL}/c/${clientId}/roadmap?item=${p.id}`;
      const t = tplById(p.roadmap.tpl);
      const m = mail(x.brand, `${p.name} ${why}`, [
        `On your HR Roadmap for ${fmtRange(p.roadmap.start, p.roadmap.end)}${p.roadmap.owner ? `, owned by ${p.roadmap.owner.name}` : ""}.`,
        open.length ? `Next up: ${open.slice(0, 3).map((st) => st.text).join("; ")}${open.length > 3 ? ` and ${open.length - 3} more` : ""}.` : "Every step is checked off. Mark it done when you're finished.",
        t?.link ? `When you're ready, ${t.link.label.toLowerCase()} from the Alza Hub.` : "",
      ].filter(Boolean), { label: "Open it", url });
      await sendEmail({ to, subject: `HR Roadmap: ${p.name} ${why}`, html: m.html, text: m.text, ...x.sender });
      await pushTo(db, to, "reminders", { title: `${p.name} ${why}`, body: open[0] ? `Next: ${open[0].text}` : "Ready to mark done", url: `/c/${clientId}/roadmap?item=${p.id}`, tag: `rm-${p.id}` });
      log.push(`roadmap: reminded ${to.length} about ${p.name} (${key})`);
    }
  }
}
