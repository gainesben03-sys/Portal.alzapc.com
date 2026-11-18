// The executive report as plain text with light markdown, turned into Word by lib/docx. Safe in the browser.
import { iso } from "./perform";
import { AGREE, MIN_GROUP, type Summary, type Survey } from "./pulse";

export function reportText(s: Survey, sum: Summary, company: string): string {
  const a = s.analysis;
  const L: string[] = [];
  L.push(`# ${s.title}: Executive Report`);
  L.push(`${company} · ${sum.n} of ${s.invited} responded (${s.invited ? Math.round((100 * sum.n) / s.invited) : 0}%) · ${s.privacy === "anonymous" ? "Anonymous" : "Confidential"} · closed ${s.closedAt ? iso(new Date(s.closedAt)) : ""}`);
  if (a) {
    L.push("## Executive summary", a.headline, a.says, a.suggests, `**What we can't conclude:** ${a.cantConclude}`, `**What to consider:** ${a.consider}`);
  }
  L.push("## Results by area");
  if (sum.engagement !== undefined) L.push(`- **Engagement:** ${sum.engagement}% favorable${sum.prev?.engagement !== undefined ? ` (was ${sum.prev.engagement}%)` : ""}`);
  if (sum.enps !== undefined) L.push(`- **eNPS:** ${sum.enps > 0 ? "+" : ""}${sum.enps}${sum.prev?.enps !== undefined ? ` (was ${sum.prev.enps})` : ""}`);
  for (const c of sum.cats) L.push(`- **${c.name}:** ${c.fav}% favorable${c.prev !== undefined ? ` (was ${c.prev}%)` : ""}`);
  if (a) {
    if (a.strengths.length) L.push("## Key strengths", ...a.strengths.map((y) => `- ${y}`));
    if (a.concerns.length) L.push("## Areas of concern", ...a.concerns.map((y) => `- ${y}`));
    if (a.themes.length) {
      L.push("## What employees are saying");
      for (const t of a.themes) L.push(`**${t.name}** (${t.count} comments, ${t.sentiment})`, t.summary, ...t.quotes.map((q) => `- "${q}"`));
    }
    const acts = s.actions.length ? s.actions.map((y) => `- **${y.priority === "high" ? "High" : y.priority === "med" ? "Medium" : "Low"}:** ${y.action}${y.owner ? `, owner ${y.owner}` : ""}${y.due ? `, due ${y.due}` : ""}${y.metric ? `. Measure: ${y.metric}` : ""}`) : a.actions.map((y) => `- **${y.priority === "high" ? "High" : y.priority === "med" ? "Medium" : "Low"}:** ${y.action} (${y.timing}). Measure: ${y.metric}`);
    L.push("## Recommended action plan", ...acts);
    if (a.quickWins.length) L.push("## Quick wins", ...a.quickWins.map((y) => `- ${y}`));
    if (a.questions.length) L.push("## Questions for leadership", ...a.questions.map((y, i) => `${i + 1}. ${y}`));
    if (a.followUp) L.push("## Follow-up", a.followUp);
  }
  L.push("## About this survey", `Results only show for groups of ${MIN_GROUP} or more. ${s.privacy === "anonymous" ? "Answers are anonymous and can't be traced to a person." : "Answers are confidential: HR sees individual answers, leaders see combined results."} Written comments have names removed.`);
  L.push(`Scale: ${AGREE.join(", ")}. Favorable = Agree or Strongly agree.`);
  return L.join("\n");
}

