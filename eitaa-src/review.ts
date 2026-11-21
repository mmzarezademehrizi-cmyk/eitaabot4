// The supervisor's brain: rule checks + an LLM proof-reader, automatic fixing, and learning from reported errors (lessons).
import { now } from "./db";
import { Env } from "./env";
import { chatJson } from "./llm";
import { cutSignature, isSigLine, stripHandles } from "./source";

// ------------------------------------------------------------------ lessons
export async function getLessons(env: Env, uid: number, n = 12): Promise<string[]> {
  return (await env.DB.prepare("SELECT rule FROM ea_lessons WHERE user_id=? ORDER BY id DESC LIMIT ?").bind(uid, n).all<{ rule: string }>()).results.map((r) => r.rule);
}
export async function addLesson(env: Env, uid: number, rule: string, source: string): Promise<boolean> {
  rule = rule.replace(/\s+/g, " ").trim().slice(0, 300);
  if (rule.length < 6) return false;
  const dup = await env.DB.prepare("SELECT id FROM ea_lessons WHERE user_id=? AND rule=?").bind(uid, rule).first();
  if (dup) return false;
  await env.DB.prepare("INSERT INTO ea_lessons(user_id,rule,source,created_at) VALUES(?,?,?,?)").bind(uid, rule, source.slice(0, 300), now()).run();
  await env.DB.prepare("DELETE FROM ea_lessons WHERE user_id=? AND id NOT IN (SELECT id FROM ea_lessons WHERE user_id=? ORDER BY id DESC LIMIT 40)").bind(uid, uid).run();
  return true;
}
export const lessonBlock = (ls: string[]) => (ls.length ? `OWNER'S LESSONS (mistakes he reported; never repeat them):\n${ls.map((l) => "- " + l).join("\n")}\n` : "");

// ------------------------------------------------------------------ rule checks
export interface Issue { code: "empty" | "handle" | "link" | "promo" | "cut" | "garbage" | "media" | "llm"; msg: string; major: boolean }

/** Cheap, deterministic checks. `own` = handles that belong to the owner (his channel / signature) and are therefore fine. */
export function ruleIssues(text: string, own: string[], opts: { media: boolean; agent: boolean }): Issue[] {
  const out: Issue[] = [];
  const t = text.trim(), keep = new Set(own.map((x) => x.toLowerCase().replace(/^@/, "")));
  if (!t && !opts.media) out.push({ code: "empty", msg: "متن پست خالی است", major: true });
  if (!opts.agent) return out;                                       // posts he wrote himself: only technical problems
  const foreign = [...t.matchAll(/(^|[^A-Za-z0-9_.])@([A-Za-z0-9_]{4,})/g)].map((m) => m[2]).filter((h) => !keep.has(h.toLowerCase()));
  if (foreign.length) out.push({ code: "handle", msg: `آیدی کانال دیگر در متن مانده: @${foreign[0]}`, major: true });
  const links = [...t.matchAll(/(?:https?:\/\/|www\.)[^\s]+/gi)].map((m) => m[0]).filter((u) => ![...keep].some((h) => u.toLowerCase().includes(h)));
  if (links.length) out.push({ code: "link", msg: `لینک خارجی در متن مانده: ${links[0].slice(0, 60)}`, major: true });
  const lines = t.split("\n").map((l) => l.trim()).filter(Boolean);
  const tail = lines.slice(-2).filter((l) => ![...keep].some((h) => l.toLowerCase().includes(h)));
  if (tail.some((l) => isSigLine(l))) out.push({ code: "promo", msg: "آخر متن شبیه امضا/تبلیغ کانال دیگری است", major: true });
  if (/(…|\.\.\.)\s*$/.test(t) || /(ادامه\s*(مطلب|ی\s*مطلب|خبر)|بیشتر\s*بخوانید)\s*$/.test(t)) out.push({ code: "cut", msg: "متن ناقص/نیمه‌کاره به نظر می‌رسد (…)", major: false });
  if (/(\bundefined\b|\bnull\b|\[object|{{|}}|\[(?:text|link|متن|لینک)\])/i.test(t)) out.push({ code: "garbage", msg: "متن شامل نشانه‌ی خراب (undefined/قالب خالی) است", major: true });
  return out;
}

/** Deterministic repair of what the rule checks found. */
export function ruleFix(text: string, own: string[]): string {
  const keep = own.map((x) => x.toLowerCase().replace(/^@/, ""));
  const isOwn = (l: string) => keep.some((h) => l.toLowerCase().includes(h));
  let lines = text.split("\n");
  const ownTail: string[] = [];
  while (lines.length && (isOwn(lines[lines.length - 1]) || !lines[lines.length - 1].trim())) ownTail.unshift(lines.pop()!);    // his signature stays
  lines = cutSignature(lines.map((l) => l.replace(/[ \t]+$/g, "")), "", "");
  let body = stripHandles(lines.join("\n"), keep);
  body = body.replace(/[ \t]+\n/g, "\n").replace(/\n{3,}/g, "\n\n").trim();
  const sig = ownTail.join("\n").trim();
  return sig ? `${body}\n\n${sig}`.trim() : body;
}

// ------------------------------------------------------------------ LLM proof-reader
export interface Verdict { ok: boolean; major: boolean; problems: string[]; fixed: string | null }

const REVIEW_SYS =
  "You are the strict supervisor/proof-reader of a Persian content channel. You receive ONE post (about to be published) and must judge it. " +
  "Check: (1) leftover signature/@id/link/promotion of ANOTHER channel or site, anywhere (especially the last lines); (2) broken, cut-off or garbled sentences; (3) advertising or giveaway content; " +
  "(4) text that contradicts today's date or the stated task; (5) repeated lines, stray symbols, template placeholders; (6) anything unprofessional. " +
  "The owner's OWN signature lines (given below) are correct and must be kept exactly. Do not rewrite good text; do not translate; keep Persian typography. " +
  "Think step by step but briefly: first fill \"notes\" (max 4 short strings: what you checked and found, line by line for the last 3 lines), THEN decide. A single leftover @id or link line at the end is ALWAYS a problem. When unsure whether a line is the owner's own, compare it with the owner's signature given below. "+
  "Reply JSON only: {\"notes\":[string],\"ok\":boolean,\"major\":boolean,\"problems\":[short Persian strings],\"fixed_text\":string|null}. " +
  "major=true when publishing it as-is would embarrass the owner. fixed_text = the full corrected text (with the owner's signature) when YOU can fix it by editing the text, else null. If everything is fine: {\"ok\":true,\"major\":false,\"problems\":[],\"fixed_text\":null}.";

export async function llmReview(env: Env, text: string, o: { own: string; task: string; lessons: string[]; hasMedia: boolean; agent: boolean }): Promise<Verdict | null> {
  const user = `${lessonBlock(o.lessons)}TODAY (Tehran): ${new Date(Date.now() + 12600_000).toISOString().slice(0, 10)}\nTASK THE POST WAS MADE FOR: ${o.task.slice(0, 400) || "(written by the owner)"}\nOWNER'S OWN SIGNATURE/HANDLES: ${o.own || "(none)"}\n` +
    `${o.agent ? "" : "NOTE: the owner wrote this himself: flag only clear technical errors, never his style or opinions.\n"}${o.hasMedia ? "(the post has a photo/video attached; you cannot see it)\n" : ""}\nPOST:\n"""\n${text.slice(0, 3000)}\n"""`;
  try {
    const j = await chatJson(env, REVIEW_SYS, user, 1100);
    const problems = (Array.isArray(j.problems) ? j.problems : []).map((x: unknown) => String(x).slice(0, 160)).filter(Boolean).slice(0, 5);
    const fixed = typeof j.fixed_text === "string" && j.fixed_text.trim() && j.fixed_text.trim() !== text.trim() ? j.fixed_text.trim().slice(0, 3900) : null;
    const ok = j.ok === true && problems.length === 0;
    return { ok, major: !ok && j.major === true, problems, fixed };
  } catch { return null; }          // no model available: the rule checks alone decide
}

export interface ReviewResult { action: "ok" | "fixed" | "hold"; text: string; problems: string[]; llm: boolean }

/** The whole supervision of one post: rules -> LLM -> repair -> re-check. Never throws. */
export async function reviewText(env: Env, uid: number, text: string, o: { own: string[]; ownLine: string; task: string; hasMedia: boolean; agent: boolean }): Promise<ReviewResult> {
  const lessons = await getLessons(env, uid);
  const seen: string[] = [];
  let cur = text;
  let issues = ruleIssues(cur, o.own, { media: o.hasMedia, agent: o.agent });
  let fixedAny = false;
  if (issues.some((i) => i.code !== "empty" && i.code !== "cut")) {                                  // repairable by rules
    seen.push(...issues.map((i) => i.msg));
    const f = ruleFix(cur, o.own);
    if (f && f !== cur) { cur = f; fixedAny = true; }
    issues = ruleIssues(cur, o.own, { media: o.hasMedia, agent: o.agent });
  }
  const v = await llmReview(env, cur, { own: o.ownLine, task: o.task, lessons, hasMedia: o.hasMedia, agent: o.agent });
  if (v && !v.ok) {
    seen.push(...v.problems);
    if (v.fixed) {
      const again = ruleIssues(v.fixed, o.own, { media: o.hasMedia, agent: o.agent });
      if (!again.some((i) => i.major)) { cur = v.fixed; fixedAny = true; issues = again; }
    }
    if (!fixedAny || (v.major && !v.fixed)) {
      if (v.major) return { action: "hold", text: cur, problems: [...new Set([...seen, ...issues.map((i) => i.msg)])].slice(0, 6), llm: true };
    }
  }
  const major = issues.filter((i) => i.major);
  if (major.length) return { action: "hold", text: cur, problems: [...new Set([...seen, ...major.map((i) => i.msg)])].slice(0, 6), llm: !!v };
  return { action: fixedAny ? "fixed" : "ok", text: cur, problems: [...new Set(seen)].slice(0, 6), llm: !!v };
}

// ------------------------------------------------------------------ reported errors -> lesson + fix
export interface LearnResult { rule: string; fixed: string | null; why: string }
export async function learnFromError(env: Env, uid: number, postText: string, error: string, hasMedia: boolean, ownLine: string): Promise<LearnResult> {
  const sys = "You are the editor of a Persian content channel. The owner reports an error in a published/pending post. " +
    "1) Turn it into ONE short, general, reusable rule (Persian, imperative, max 160 chars) that prevents the same mistake in future posts — not about this one post only. " +
    "2) If the error can be fixed by editing the TEXT, give the full corrected text (keep the owner's own signature lines exactly; change nothing else). If it is about the photo/video, or you cannot fix it by editing text, fixed_text=null and say why in one Persian sentence. " +
    "Reply JSON only: {\"rule\":string,\"fixed_text\":string|null,\"why\":string}.";
  const user = `OWNER'S SIGNATURE: ${ownLine || "(none)"}\n${hasMedia ? "(the post has a photo/video)\n" : ""}REPORTED ERROR: ${error.slice(0, 600)}\n\nPOST TEXT:\n"""\n${postText.slice(0, 3000)}\n"""`;
  const j = await chatJson(env, sys, user, 1100);
  const fixed = typeof j.fixed_text === "string" && j.fixed_text.trim() && j.fixed_text.trim() !== postText.trim() ? j.fixed_text.trim().slice(0, 3900) : null;
  return { rule: String(j.rule || "").slice(0, 300), fixed, why: String(j.why || "").slice(0, 300) };
}

// ------------------------------------------------------------------ learning from the owner's own correction
/** The owner changed the text of a post by hand: what general rule does the change teach? Deterministic part first (leftover @ids / links / signature lines
 *  that he removed), then the model for anything subtler. Returns null when nothing general can be learned. */
export async function learnFromEdit(env: Env, uid: number, before: string, after: string, ownLine: string): Promise<string | null> {
  const norm = (l: string) => l.replace(/\s+/g, " ").trim();
  const A = new Set(after.split("\n").map(norm)), removed = before.split("\n").map(norm).filter((l) => l && !A.has(l));
  const sigLeft = removed.filter((l) => /@[A-Za-z0-9_]{4,}|https?:\/\/|www\./i.test(l) || isSigLine(l));
  let rule: string | null = sigLeft.length ? "آیدی (@…)، لینک، نام و امضای کانال‌های دیگر را در هر جای متن (به‌ویژه آخر آن) کامل پاک کن؛ فقط امضای خود مالک بماند." : null;
  if (before.trim() === after.trim()) return null;
  try {
    const j = await chatJson(env, "You compare the BEFORE and AFTER versions of a Persian channel post that the owner corrected by hand. If the change reveals a GENERAL, reusable editing rule (leftover signature/id/link of another channel, wrong wording style, date format, emoji use, length, repeated phrases, etc.) write it as ONE short Persian imperative sentence (max 160 chars) that prevents the same mistake in future posts. Ignore pure content changes of this single post. Reply JSON only: {\"rule\": string|null}.",
      `OWNER'S SIGNATURE: ${ownLine || "(none)"}\n\nBEFORE:\n"""\n${before.slice(0, 2200)}\n"""\n\nAFTER:\n"""\n${after.slice(0, 2200)}\n"""`, 500);
    if (typeof j.rule === "string" && j.rule.trim().length >= 8) rule = j.rule.trim().slice(0, 200);
  } catch { /* no model: the deterministic rule (if any) stands */ }
  return rule;
}
