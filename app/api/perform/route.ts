// Alza Perform: everything a manager, review admin or executive does with reviews goes through here,
// so nobody can read a review they shouldn't. Reviews never reach the browser straight from the database.
// POST { clientId, action, ... }:
//   list                         reviews you can see, who's coming up, and (executives) team summaries
//   get { id }                   one review with prep: your check-in notes, last goals, past reviews
//   start { personId, kind }     start a review early, an extra review, or an improvement plan
//   save { id, patch }           save as you go (only while it's open)
//   ai { id, op, ... }           help with wording: polish, sort (talk it through) or translate
//   finalize { id, how }         lock it and share it: a link to the employee, or in person
//   delivered { id }             mark an in-person review as delivered
//   amend { id, note }           reopen a finalized review as a new version
//   remind { id }                email the manager now
//   sendSelf { id }              send the employee their self-assessment now
//   cancel { id }                cancel a review
//   settings { settings }        save the schedule, templates and who sees what (Ben and review admins)
import { NextResponse } from "next/server";
import { logUsage, underLimit } from "@/lib/ai";
import {
  addDays, cleanPerform, daysUntil, docOf, Goal, GoalStatus, iso, Lang, negativeReviews, newId, newReview, newToken, nextDue,
  PIP_TEMPLATE, PipIssue, Review, stageOf, templateById, first,
} from "@/lib/perform";
import { trSrc } from "@/lib/perform";
import { allReviews, canEdit, canOpen, ensureManagerAccess, getReview, suggestGoals, launchEmail, loadCtx, log, managerEmail, nudgeEmail, polish, putReview, roleOf, roster, send, sendSelf, shareEmail, sortTalk, sync, translate } from "@/lib/performserver";
import { admin, caller, SERVER_LIVE } from "@/lib/server";
import type { TeamLog } from "@/lib/team";

const json = (b: object, status = 200) => NextResponse.json(b, { status, headers: { "Cache-Control": "no-store" } });
const s = (v: unknown, n: number) => (typeof v === "string" ? v.replace(/\r/g, "").slice(0, n) : "");
const ID = /^[a-z0-9_-]{1,24}$/i;

export async function POST(req: Request) {
  if (!SERVER_LIVE) return json({ ok: false, reason: "demo" }, 404);
  const who = await caller(req);
  if (!who) return json({ ok: false, reason: "signin" }, 401);
  let b: Record<string, unknown>;
  try {
    b = await req.json();
  } catch {
    return json({ ok: false, reason: "bad_request" }, 400);
  }
  const clientId = String(b.clientId ?? "");
  if (!who.advisor && !who.memberOf.includes(clientId)) return json({ ok: false, reason: "forbidden" }, 403);
  const db = admin();
  const x = await loadCtx(db, clientId);
  if (!x) return json({ ok: false, reason: "not_found" }, 404);
  if (!x.cfg.modules?.perform) return json({ ok: false, reason: "off" }, 403);
  const role = roleOf(who, x);
  const by = who.name || who.email;
  const action = String(b.action ?? "");

  if (action === "settings") {
    if (!role.admin) return json({ ok: false, reason: "forbidden" }, 403);
    const perform = cleanPerform(b.settings);
    await db.from("clients").update({ config: { ...x.cfg, perform } }).eq("id", clientId);
    return json({ ok: true, settings: perform });
  }

  if (action === "list") {
    await sync(x).catch(() => undefined);
    const [people, reviews] = await Promise.all([roster(db, clientId), allReviews(db, clientId)]);
    const mine = (email: string) => people.filter((p) => p.active !== false && (p.managerEmail || "").toLowerCase() === email);
    const visiblePeople = role.admin ? people.filter((p) => p.active !== false) : mine(role.email);
    const visible = reviews.filter((r) => canOpen(r, role, x.s));
    const today = iso(new Date());
    const upcoming = visiblePeople.flatMap((p) => nextDue({ ...p, active: true }, x.s, today, 1).filter((d) => daysUntil(d.due, today) <= 150 && !reviews.some((r) => r.personId === p.id && r.kind === d.kind && Math.abs(daysUntil(r.due, d.due)) < 45)).map((d) => ({ ...d, name: p.name, title: p.title, managerName: p.managerName })));
    // team summaries for executives (and admins): counts only, no names or words
    const insight = role.exec || role.admin
      ? Object.values(
          reviews.filter((r) => r.status !== "cancelled" && r.kind !== "pip" && r.due >= addDays(today, -365)).reduce((acc, r) => {
            const k = r.managerEmail;
            const a = (acc[k] ??= { manager: r.managerName, total: 0, done: 0, overdue: 0, waiting: 0, below: 0, meets: 0, above: 0 });
            a.total++;
            const st = stageOf(r, x.s);
            if (st === "done") a.done++;
            if (st === "overdue") a.overdue++;
            if (st === "waiting") a.waiting++;
            if (r.overall && ["final", "shared", "done"].includes(r.status)) {
              const mid = r.template.scale === 5 ? 3 : 2;
              if (r.overall < mid) a.below++;
              else if (r.overall === mid) a.meets++;
              else a.above++;
            }
            return acc;
          }, {} as Record<string, { manager: string; total: number; done: number; overdue: number; waiting: number; below: number; meets: number; above: number }>)
        )
      : [];
    const pipFlags = role.admin ? [...new Set(reviews.map((r) => r.personId))].filter((pid) => negativeReviews(reviews, pid).length >= x.s.pipAfter && !reviews.some((r) => r.personId === pid && r.kind === "pip" && r.status !== "cancelled" && r.createdAt > negativeReviews(reviews, pid)[0].createdAt)) : [];
    return json({
      ok: true,
      role: { admin: role.admin, exec: role.exec, ben: role.ben, email: role.email },
      settings: role.admin ? x.s : { ...x.s, admins: [] },
      reviews: visible,
      upcoming,
      people: visiblePeople.map((p) => ({ id: p.id, name: p.name, title: p.title, managerName: p.managerName, managerEmail: (p.managerEmail || "").toLowerCase(), hireDate: p.hireDate, department: p.department, hasEmail: !!p.email })),
      insight,
      pipFlags,
      users: role.admin ? ((await db.from("members").select("name, email, access").eq("client_id", clientId)).data ?? []).map((u) => ({ name: String(u.name), email: String(u.email).toLowerCase(), access: String(u.access) })) : [],
    });
  }

  // HR launches a round: pick people, a template and a due date. Each review goes to that person's manager.
  if (action === "launch") {
    if (!role.admin) return json({ ok: false, reason: "forbidden" }, 403);
    const ids = new Set((Array.isArray(b.personIds) ? b.personIds : []).map(String).slice(0, 1000));
    const today = iso(new Date());
    const due = /^\d{4}-\d{2}-\d{2}$/.test(String(b.due ?? "")) && String(b.due) > today ? String(b.due) : addDays(today, 30);
    const self = b.self === "now" || b.self === "skip" ? b.self : "before";
    const t = templateById(x.s, String(b.template ?? "") || x.s.template);
    const [people, all] = await Promise.all([roster(db, clientId), allReviews(db, clientId)]);
    const created: Review[] = [];
    const skipped: { name: string; why: string }[] = [];
    let selfSent = 0;
    for (const p of people) {
      if (!ids.has(p.id)) continue;
      if (p.active === false) { skipped.push({ name: p.name, why: "no longer on the roster" }); continue; }
      if (!p.managerEmail) { skipped.push({ name: p.name, why: "no manager on the roster" }); continue; }
      if (all.some((r) => r.personId === p.id && r.status === "open" && r.kind !== "pip")) { skipped.push({ name: p.name, why: "already has a review open" }); continue; }
      const last = all.filter((r) => r.personId === p.id && ["final", "shared", "done"].includes(r.status)).sort((a, c) => (a.due < c.due ? 1 : -1))[0];
      const start = last?.periodEnd ?? (p.hireDate && p.hireDate > addDays(due, -365) ? p.hireDate : addDays(due, -365));
      let r = newReview({ ...p, active: true }, clientId, { kind: "cycle", due, periodStart: start, periodEnd: due }, t, by);
      r = log({ ...r, ...(self === "skip" ? { noSelf: true } : {}) }, by, "Launched by HR");
      await putReview(db, r);
      if (self === "now" && x.s.selfAssess) {
        const o = await sendSelf(x, r, by, p.email);
        if (o.ok) { selfSent++; r = o.review; }
      }
      created.push(r);
    }
    // managers who aren't on the Alza Hub yet get Manager access, so the review email's link works
    const added = await ensureManagerAccess(db, clientId, created.map((r) => ({ email: r.managerEmail, name: r.managerName }))).catch(() => [] as string[]);
    let managers = 0;
    if (b.notify !== false) {
      const byMgr = new Map<string, Review[]>();
      for (const r of created) byMgr.set(r.managerEmail, [...(byMgr.get(r.managerEmail) ?? []), r]);
      const note = !x.s.selfAssess || self === "skip" ? "" : self === "now" ? "Your team just got a few short questions to answer first. You'll see their answers when you open each review." : `Your team will get a few short questions ${x.s.selfDaysBefore} days before the due date. You'll see their answers when you open each review.`;
      for (const [to, rs] of byMgr) if ((await send(x, to, launchEmail(x, rs[0].managerName, rs, note))).ok) managers++;
    }
    return json({ ok: true, created: created.length, skipped, selfSent, managers, added });
  }

  // HR nudges managers: one email each, listing everything they still owe.
  if (action === "remindAll") {
    if (!role.admin) return json({ ok: false, reason: "forbidden" }, 403);
    const only = Array.isArray(b.ids) ? new Set(b.ids.map(String)) : null;
    const open = (await allReviews(db, clientId)).filter((r) => r.status === "open" && (!only || only.has(r.id)) && ["not_started", "in_progress", "overdue"].includes(stageOf(r, x.s)));
    const byMgr = new Map<string, Review[]>();
    for (const r of open) if (r.managerEmail) byMgr.set(r.managerEmail, [...(byMgr.get(r.managerEmail) ?? []), r]);
    let sent = 0;
    for (const [to, rs] of byMgr) {
      const m = await send(x, to, nudgeEmail(x, rs[0].managerName, rs));
      if (m.ok) { sent++; for (const r of rs) await putReview(db, log(r, by, `Reminder sent to ${r.managerName}`)); }
    }
    return json({ ok: true, managers: sent, reviews: open.length });
  }

  if (action === "start") {
    const people = await roster(db, clientId);
    const p = people.find((q) => q.id === String(b.personId ?? ""));
    if (!p || p.active === false) return json({ ok: false, reason: "not_found" }, 404);
    if (!role.admin && (p.managerEmail || "").toLowerCase() !== role.email) return json({ ok: false, reason: "forbidden" }, 403);
    const kind = b.kind === "pip" ? "pip" : b.kind === "intro" ? "intro" : b.kind === "cycle" ? "cycle" : "adhoc";
    const today = iso(new Date());
    const due = kind === "pip" ? today : nextDue({ ...p, active: true }, x.s, today, 2).find((d) => d.kind === (kind === "adhoc" ? "cycle" : kind))?.due ?? addDays(today, 14);
    const t = kind === "pip" ? PIP_TEMPLATE : templateById(x.s, kind === "intro" ? x.s.intro.template : String(b.template ?? "") || x.s.template);
    const all = await allReviews(db, clientId);
    const last = all.filter((r) => r.personId === p.id && ["final", "shared", "done"].includes(r.status)).sort((a, c) => (a.due < c.due ? 1 : -1))[0];
    let r = newReview({ ...p, active: true }, clientId, { kind, due, periodStart: last?.periodEnd ?? p.hireDate ?? addDays(today, -365), periodEnd: today }, t, by);
    if (kind === "pip" && last) {
      // start from the manager's own words on the last review, never from anything new
      const words = (last.written.work || last.answers.work || last.written.improve || last.answers.improve || last.written.stop || "").trim();
      if (words) r = { ...r, pip: { ...r.pip!, issues: [{ id: newId(), what: words, expected: "", support: "" }] } };
    }
    await putReview(db, r);
    const added = await ensureManagerAccess(db, clientId, [{ email: r.managerEmail, name: r.managerName }]).catch(() => [] as string[]);
    return json({ ok: true, review: r, added });
  }

  const r = await getReview(db, String(b.id ?? ""), clientId);
  if (!r) return json({ ok: false, reason: "not_found" }, 404);
  if (!canOpen(r, role, x.s)) return json({ ok: false, reason: "forbidden" }, 403);

  if (action === "get") {
    const all = await allReviews(db, clientId);
    const past = all.filter((q) => q.personId === r.personId && q.id !== r.id && ["final", "shared", "done"].includes(q.status)).sort((a, c) => (a.due < c.due ? 1 : -1));
    // check-in notes: only the person's manager and Ben ever see these
    let notes: { date: string; notes: string }[] = [];
    if (role.ben || r.managerEmail === role.email) {
      const { data } = await db.from("checkins").select("data").eq("client_id", clientId);
      notes = (data ?? []).map((d) => d.data as TeamLog).filter((t) => t.personId === r.personId && t.kind === "checkin" && t.date >= r.periodStart && t.date <= addDays(r.periodEnd, 1) && t.notes?.trim()).sort((a, c) => (a.date < c.date ? -1 : 1)).map((t) => ({ date: t.date, notes: t.notes.slice(0, 600) }));
    }
    const people = await roster(db, clientId);
    const p = people.find((q) => q.id === r.personId);
    return json({
      ok: true, review: r, canEdit: canEdit(r, role), admin: role.admin, notes,
      prevGoals: past[0]?.goals ?? [], past: past.slice(0, 5).map((q) => ({ id: q.id, kind: q.kind, due: q.due, overall: q.overall, scale: q.template.scale })),
      negatives: negativeReviews(all, r.personId).length, hasEmail: !!p?.email, company: x.company,
    });
  }
  if (!canEdit(r, role)) return json({ ok: false, reason: "forbidden" }, 403);

  if (action === "save") {
    if (r.status !== "open") return json({ ok: false, reason: "locked" }, 409);
    const p = (b.patch ?? {}) as Partial<Review>;
    const next: Review = { ...r };
    const ids = new Set([...r.template.rate.map((q) => q.id), ...r.template.ask.map((q) => q.id)]);
    const max = r.template.scale;
    if (p.ratings) next.ratings = Object.fromEntries(Object.entries(p.ratings).filter(([k, v]) => ids.has(k) && Number.isInteger(v) && v >= 1 && v <= max));
    if (p.rateNotes) next.rateNotes = Object.fromEntries(Object.entries(p.rateNotes).filter(([k]) => ids.has(k)).map(([k, v]) => [k, s(v, 1000)]));
    if (p.overall !== undefined) next.overall = Number.isInteger(p.overall) && p.overall! >= 1 && p.overall! <= max ? p.overall : undefined;
    if (p.answers) next.answers = Object.fromEntries(Object.entries(p.answers).filter(([k]) => ids.has(k)).map(([k, v]) => [k, s(v, 4000)]));
    if (p.written) next.written = Object.fromEntries(Object.entries(p.written).filter(([k]) => ids.has(k)).map(([k, v]) => [k, s(v, 4000)]));
    if (Array.isArray(p.goals)) next.goals = p.goals.slice(0, 8).map((g) => ({ id: ID.test(String(g.id)) ? g.id : newId(), text: s(g.text, 300), measure: s(g.measure, 300), by: s(g.by, 40), status: (["not_started", "in_progress", "done", "deferred", "na"].includes(g.status) ? g.status : "not_started") as GoalStatus })) as Goal[];
    if (p.goalUpdates) next.goalUpdates = Object.fromEntries(Object.entries(p.goalUpdates).slice(0, 12).map(([k, v]) => [k, { status: (["not_started", "in_progress", "done", "deferred", "na"].includes(v?.status) ? v.status : "in_progress") as GoalStatus, note: s(v?.note, 500) }]));
    if (p.lang) next.lang = p.lang === "es" ? "es" : "en";
    if (p.translated !== undefined) next.translated = p.translated && (p.translated.lang === "es" || p.translated.lang === "en") ? { lang: p.translated.lang, src: s(p.translated.src, 40), written: Object.fromEntries(Object.entries(p.translated.written ?? {}).map(([k, v]) => [k, s(v, 4000)])), goals: (p.translated.goals ?? []).slice(0, 8).map((g) => ({ id: String(g.id), text: s(g.text, 400), measure: s(g.measure, 400) })), ...(p.translated.pip ? { pip: { issues: (p.translated.pip.issues ?? []).slice(0, 8).map((i) => ({ id: String(i.id), what: s(i.what, 2000), expected: s(i.expected, 2000), support: s(i.support, 2000) })), outcome: s(p.translated.pip.outcome, 1000) } } : {}) } : undefined;
    if (p.pip && r.kind === "pip") {
      next.pip = {
        issues: (p.pip.issues ?? []).slice(0, 8).map((i: PipIssue) => ({ id: ID.test(String(i.id)) ? i.id : newId(), what: s(i.what, 2000), expected: s(i.expected, 2000), support: s(i.support, 2000) })),
        start: /^\d{4}-\d{2}-\d{2}$/.test(String(p.pip.start)) ? p.pip.start : r.pip!.start,
        length: [30, 60, 90].includes(Number(p.pip.length)) ? (Number(p.pip.length) as 30 | 60 | 90) : r.pip!.length,
        checkins: (p.pip.checkins ?? []).slice(0, 8).map((c) => ({ date: /^\d{4}-\d{2}-\d{2}$/.test(String(c.date)) ? c.date : r.pip!.start, note: s(c.note, 1000), done: !!c.done })),
        outcome: s(p.pip.outcome, 1000) || r.pip!.outcome,
        // only Ben or a review admin can say HR has reviewed the plan
        hrReviewed: role.admin ? !!p.pip.hrReviewed : r.pip!.hrReviewed,
      };
    }
    await putReview(db, next);
    return json({ ok: true, review: next });
  }

  if (action === "ai") {
    if (!x.s.ai) return json({ ok: false, reason: "off" }, 403);
    if (!role.ben && !(await underLimit(db, role.email, "perform"))) return json({ ok: false, reason: "limit" }, 429);
    const op = String(b.op ?? "");
    const lang: Lang = b.lang === "es" ? "es" : b.lang === "en" ? "en" : r.lang;
    const asks = r.template.ask.map((q) => ({ id: q.id, q: q.name.en }));
    let out: object;
    if (op === "polish") out = await polish({ firstName: first(r.name), asks, answers: (b.answers as Record<string, string>) ?? r.answers, tone: String(b.tone ?? ""), voice: String(b.voice ?? ""), lang });
    else if (op === "sort") out = await sortTalk({ firstName: first(r.name), asks, transcript: s(b.transcript, 8000), lang });
    else if (op === "translate") out = await translate(Object.fromEntries(Object.entries((b.fields as Record<string, string>) ?? {}).slice(0, 40).map(([k, v]) => [k, s(v, 3000)])), b.to === "es" ? "es" : "en");
    else if (op === "goals") {
      const feedback = r.template.ask.map((q) => ({ q: q.name.en, a: (r.written[q.id] ?? r.answers[q.id] ?? "").trim() })).filter((f) => f.a)
        .concat(r.template.rate.filter((q) => r.rateNotes[q.id]?.trim()).map((q) => ({ q: `${q.name.en} (rating note)`, a: r.rateNotes[q.id] })));
      if (!feedback.length) return json({ ok: false, reason: "empty" }, 400);
      const low = r.template.rate.filter((q) => { const v = r.ratings[q.id]; return v && (r.template.scale === 5 ? v <= 2 : v <= 1); }).map((q) => q.name.en);
      const prev = (await allReviews(db, clientId)).filter((q) => q.personId === r.personId && q.id !== r.id && ["final", "shared", "done"].includes(q.status)).sort((a, c) => (a.due < c.due ? 1 : -1))[0];
      out = await suggestGoals({ firstName: first(r.name), feedback: feedback.map((f) => ({ q: f.q, a: s(f.a, 2000) })), lowAreas: low, prevGoals: (prev?.goals ?? []).map((g) => g.text).filter(Boolean), lang });
    }
    else return json({ ok: false, reason: "bad_request" }, 400);
    await logUsage(db, { email: role.email, clientId, kind: "perform", ref: r.id, meta: { op } });
    return json(out);
  }

  if (action === "finalize") {
    if (r.status !== "open") return json({ ok: false, reason: "locked" }, 409);
    if (r.kind === "pip" && !r.pip?.hrReviewed) return json({ ok: false, reason: "hr_review" }, 409);
    if (r.translated?.src && r.translated.lang === r.lang && r.translated.src !== trSrc(r)) return json({ ok: false, reason: "tr_stale" }, 409);
    const how = b.how === "person" ? "person" : "link";
    const at = new Date().toISOString();
    let next: Review = { ...r, status: "shared", finalAt: at, finalBy: by, share: { how, at, ...(how === "link" ? { token: newToken() } : {}) } };
    if (how === "link") {
      const p = (await roster(db, clientId)).find((q) => q.id === r.personId);
      const m = await send(x, (p?.email || "").trim().toLowerCase(), shareEmail(x, next, next.share!.token!));
      if (!m.ok) return json({ ok: false, reason: m.reason === "no_email" ? "no_email" : "send" }, 400);
      next = log(next, by, `Finalized and sent to ${first(r.name)}`);
    } else next = log(next, by, "Finalized, to go over in person");
    await putReview(db, next);
    return json({ ok: true, review: next, doc: docOf(next, x.company) });
  }
  if (action === "delivered") {
    if (r.status !== "shared" || r.share?.how !== "person") return json({ ok: false, reason: "bad_request" }, 400);
    const at = new Date().toISOString();
    const next = log({ ...r, status: "done", share: { ...r.share, deliveredAt: at } }, by, "Delivered in person");
    await putReview(db, next);
    return json({ ok: true, review: next });
  }
  if (action === "amend") {
    if (!["final", "shared", "done"].includes(r.status)) return json({ ok: false, reason: "bad_request" }, 400);
    const note = s(b.note, 300).trim() || "Reopened for a change";
    const next = log({ ...r, status: "open", share: undefined, versions: [...(r.versions ?? []), { at: new Date().toISOString(), by, note }] }, by, `Reopened as a new version: ${note}`);
    await putReview(db, next);
    return json({ ok: true, review: next });
  }
  if (action === "remind") {
    const m = await send(x, r.managerEmail, managerEmail(x, r, daysUntil(r.due)));
    if (m.ok) await putReview(db, log(r, by, `Reminder sent to ${r.managerName}`));
    return json({ ok: m.ok, reason: m.reason });
  }
  if (action === "sendSelf") {
    const p = (await roster(db, clientId)).find((q) => q.id === r.personId);
    const out = await sendSelf(x, r, by, p?.email);
    return json(out, out.ok ? 200 : 400);
  }
  if (action === "cancel") {
    if (!role.admin) return json({ ok: false, reason: "forbidden" }, 403);
    const next = log({ ...r, status: "cancelled" }, by, "Cancelled");
    await putReview(db, next);
    return json({ ok: true, review: next });
  }
  return json({ ok: false, reason: "bad_request" }, 400);
}


