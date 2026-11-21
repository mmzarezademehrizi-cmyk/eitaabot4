// The council: two agents — «ناظر» (supervisor) and «دستیار» (assistant) — talk in the group's council topic about errors and lessons,
// give each other orders (delete / correct a post, edit lessons) and ask the owner when they need a decision.
// Telegram bots cannot read each other's messages, so the conversation runs inside the Worker and each line is posted through that agent's own bot.
import { PostRow, now } from "./db";
import { Env } from "./env";
import { Role, getGroup, kvDel, kvGet, kvSet, markGroup, roleName, roleToken, saveGroup, sayAs } from "./group";
import { ChatMsg, ToolDef, chatJson, chatTools } from "./llm";
import { replacePost, removePost } from "./manage";
import { getLessons, addLesson } from "./review";
import * as tg from "./tg";
import { ikb } from "./tg";
import { esc, jalaliLong } from "./util";

const MAX_TURNS = 6, MAX_SAYS = 5, MAX_ACTIONS = 3;
const DAY_CAP = 10, GAP_S = 300;

export async function enqueue(env: Env, uid: number, kind: string, payload: unknown = ""): Promise<void> {
  await env.DB.prepare("INSERT INTO ea_events(user_id,kind,payload,status,created_at) VALUES(?,?,?,'new',?)").bind(uid, kind, typeof payload === "string" ? payload : JSON.stringify(payload), now()).run();
}
const dayKey = (uid: number) => `cc:${uid}:${new Date(Date.now() + 12600_000).toISOString().slice(0, 10)}`;

// ------------------------------------------------------------------ tools
const T = (name: string, description: string, properties: Record<string, unknown>, required: string[] = []): ToolDef => ({ type: "function", function: { name, description, parameters: { type: "object", properties, required } } });
const TOOLS: ToolDef[] = [
  T("say", "Say something to the other agent in the council chat (Persian, max 3 short sentences).", { text: { type: "string" } }, ["text"]),
  T("ask_owner", "Ask the OWNER (a human) for a decision, opinion or help. Only when really needed; one clear question, with suggested options.", { question: { type: "string" } }, ["question"]),
  T("delete_post", "Delete a post: removes the group copy and tries to remove it from Eitaa.", { id: { type: "integer" }, reason: { type: "string" } }, ["id", "reason"]),
  T("fix_post", "Correct a post: the old one is deleted and the corrected text is re-published (group first, then supervisor review, then Eitaa).", { id: { type: "integer" }, text: { type: "string", description: "the FULL corrected text including the owner's signature" }, reason: { type: "string" } }, ["id", "text", "reason"]),
  T("lesson_add", "Save a new general lesson (rule) so the mistake never repeats.", { rule: { type: "string" } }, ["rule"]),
  T("lesson_edit", "Rewrite an existing lesson by its id (make it clearer or merge duplicates).", { id: { type: "integer" }, rule: { type: "string" } }, ["id", "rule"]),
  T("lesson_delete", "Delete a wrong, duplicated or outdated lesson by its id.", { id: { type: "integer" }, reason: { type: "string" } }, ["id"]),
  T("set_review", "Turn the supervisor's pre-publication review on or off.", { on: { type: "boolean" } }, ["on"]),
  T("finish", "End the council session (nothing more to say or do).", {}),
];

const COMMON = "You are one of two AI agents that run quality control for a Persian-language Eitaa channel owned by a human (\"the owner\"). The conversation happens in a Telegram group chat the owner can read. " +
  "Write Persian, warm but sharp and concrete; max 3 short sentences per message; no filler, no repeating what was already said. " +
  "Ground every claim in the CONTEXT below (post ids, lesson ids). Never invent ids. Use tools to act — saying you will do something is not doing it. " +
  "Eitaa cannot edit a message: an edit = delete the old post + publish the corrected one (fix_post does exactly that). Prefer fix_post over delete_post; never touch a post that is fine. " +
  "Lessons must be general, imperative, ≤160 chars, no duplicates. At most " + MAX_ACTIONS + " post actions per session. If nothing needs doing: one short sentence, then finish. ";
const PROMPT: Record<Role, string> = {
  sup: COMMON + "YOU ARE «ناظر» (the supervisor): you inspect every post before it reaches Eitaa. In the council you REPORT honestly what happened (errors you found, what you fixed or held, what you were unsure about), what you LEARNED (propose precise lessons) and where you might be wrong. You follow the assistant's orders unless one would clearly harm the owner — then object with a reason. Ask the assistant for his opinion on your lessons.",
  asst: COMMON + "YOU ARE «دستیار» (the assistant): the coordinating brain and the supervisor's boss. You answer what the supervisor reports: give a real opinion (agree, challenge, refine), clean up the lessons (merge duplicates, make vague ones precise, delete wrong ones), and ORDER the supervisor to act when needed (use the tools yourself and say what you ordered). When a decision needs the human (policy, taste, risk, missing information) use ask_owner — one clear question with suggested answers; do not ask what you can decide. When the owner has spoken, address him directly and act on it.",
};

// ------------------------------------------------------------------ context
async function context(env: Env, uid: number, events: string[]): Promise<string> {
  const g = await getGroup(env, uid);
  const lessons = (await env.DB.prepare("SELECT id, rule FROM ea_lessons WHERE user_id=? ORDER BY id DESC LIMIT 30").bind(uid).all<{ id: number; rule: string }>()).results;
  const posts = (await env.DB.prepare("SELECT p.id, p.status, p.kind, substr(p.text,1,90) t, COALESCE(u.verdict,'') v, COALESCE(u.note,'') n FROM ea_posts p LEFT JOIN ea_pubs u ON u.post_id=p.id WHERE p.user_id=? ORDER BY p.id DESC LIMIT 12").bind(uid).all<{ id: number; status: string; kind: string; t: string; v: string; n: string }>()).results;
  const hist = (await env.DB.prepare("SELECT role, text FROM ea_council WHERE user_id=? ORDER BY id DESC LIMIT 8").bind(uid).all<{ role: string; text: string }>()).results.reverse();
  const asks = (await env.DB.prepare("SELECT id, question, answer, status FROM ea_asks WHERE user_id=? ORDER BY id DESC LIMIT 4").bind(uid).all<{ id: number; question: string; answer: string; status: string }>()).results;
  const t = new Date();
  return `\n\nCONTEXT\nToday (Tehran): ${jalaliLong(Math.floor(t.getTime() / 1000))}\nSupervisor review before Eitaa: ${g?.review === false ? "OFF" : "ON"}\n` +
    `LESSONS (id: rule):\n${lessons.length ? lessons.map((l) => `${l.id}: ${l.rule}`).join("\n") : "(none yet)"}\n` +
    `RECENT POSTS (id status verdict note | text):\n${posts.length ? posts.map((p) => `#${p.id} ${p.status}${p.kind === "file" ? " +media" : ""} ${p.v}${p.n ? " «" + p.n.slice(0, 80) + "»" : ""} | ${p.t.replace(/\s+/g, " ")}`).join("\n") : "(none)"}\n` +
    `OWNER QUESTIONS:\n${asks.length ? asks.map((a) => `#${a.id} [${a.status}] ${a.question.slice(0, 120)}${a.answer ? " → OWNER ANSWERED: " + a.answer.slice(0, 200) : ""}`).join("\n") : "(none)"}\n` +
    `EARLIER COUNCIL CHAT:\n${hist.length ? hist.map((h) => `${roleName(h.role as Role)}: ${h.text.slice(0, 200)}`).join("\n") : "(none)"}\n` +
    `WHY THIS SESSION:\n${events.join("\n").slice(0, 1800)}`;
}

const logLine = (env: Env, uid: number, role: string, text: string) => env.DB.prepare("INSERT INTO ea_council(user_id,role,text,created_at) VALUES(?,?,?,?)").bind(uid, role, text.slice(0, 1500), now()).run();
export const councilSay = async (env: Env, uid: number, role: Role | "owner", text: string) => { await logLine(env, uid, role, text); if (role !== "owner") await sayAs(env, uid, role, "council", esc(text)); };

// ------------------------------------------------------------------ actions
async function getPost(env: Env, uid: number, id: number) { return env.DB.prepare("SELECT * FROM ea_posts WHERE id=? AND user_id=?").bind(id, uid).first<PostRow & { eitaa_message_id?: string }>(); }

async function act(env: Env, uid: number, role: Role, name: string, a: any, st: { actions: number; waiting: boolean; done: boolean; says: number }): Promise<string> {
  const int = (x: unknown) => Math.trunc(Number(x));
  switch (name) {
    case "say": {
      const text = String(a.text || "").trim();
      if (!text) return "empty";
      if (st.says >= MAX_SAYS) return "too many messages; finish";
      st.says++; await councilSay(env, uid, role, text); return "sent";
    }
    case "finish": st.done = true; return "ok";
    case "ask_owner": {
      const q = String(a.question || "").trim().slice(0, 700);
      if (!q) return "empty question";
      if ((await env.DB.prepare("SELECT COUNT(*) n FROM ea_asks WHERE user_id=? AND status='open'").bind(uid).first<{ n: number }>())!.n >= 3) return "there are already 3 open questions; wait for the owner";
      const id = (await env.DB.prepare("INSERT INTO ea_asks(user_id,role,question,created_at) VALUES(?,?,?,?)").bind(uid, role, q, now()).run()).meta.last_row_id as number;
      await logLine(env, uid, role, `❓ (از مالک) ${q}`);
      await sayAs(env, uid, role, "council", `❓ <b>از شما:</b> ${esc(q)}\n\n<i>همین‌جا یا از ربات پاسخ دهید.</i>`);
      await tg.send(env, uid, `❓ <b>${roleName(role)} از شما کمک می‌خواهد</b>\n\n${esc(q)}`, ikb([[["💬 پاسخ دادن", `as:ans:${id}`], ["⏭ نادیده", `as:skip:${id}`]]]));
      st.waiting = true; return `asked (#${id}); the session ends until the owner answers`;
    }
    case "delete_post": case "fix_post": {
      if (st.actions >= MAX_ACTIONS) return "action limit reached";
      const p = await getPost(env, uid, int(a.id));
      if (!p) return "no such post";
      if (!["pending", "held", "sent", "failed"].includes(p.status)) return `post is ${p.status}; cannot act`;
      st.actions++;
      if (name === "delete_post") {
        const r = await removePost(env, p, "deleted");
        await markGroup(env, p.id, "🗑").catch(() => null);
        const line = `🗑 پست #${p.id} حذف شد (${String(a.reason || "").slice(0, 120)})${r.eitaa === "manual" ? " — ⚠️ از ایتا باید دستی حذف شود" : r.eitaa === "removed" ? " — از ایتا هم پاک شد" : ""}`;
        await logLine(env, uid, role, line); await sayAs(env, uid, role, "reports", esc(line)); return line;
      }
      const text = String(a.text || "").trim();
      if (!text || (p.kind === "file" && text.length > 1000)) return "invalid text (empty, or >1000 chars for a media post)";
      const r = await replacePost(env, p, { text, keepJob: true });
      const line = `✏️ پست #${p.id} اصلاح شد ← پست جدید #${r.id} (${String(a.reason || "").slice(0, 120)})${r.note ? " — ⚠️ نسخه‌ی قبلی در ایتا دستی حذف شود" : ""}`;
      await logLine(env, uid, role, line); await sayAs(env, uid, role, "reports", esc(line)); return line;
    }
    case "lesson_add": {
      const ok = await addLesson(env, uid, String(a.rule || ""), `council:${role}`);
      return ok ? "lesson saved" : "not saved (too short or duplicate)";
    }
    case "lesson_edit": {
      const rule = String(a.rule || "").replace(/\s+/g, " ").trim().slice(0, 300);
      if (rule.length < 6) return "rule too short";
      const r = await env.DB.prepare("UPDATE ea_lessons SET rule=? WHERE id=? AND user_id=?").bind(rule, int(a.id), uid).run();
      return r.meta.changes ? "lesson updated" : "no such lesson";
    }
    case "lesson_delete": {
      const r = await env.DB.prepare("DELETE FROM ea_lessons WHERE id=? AND user_id=?").bind(int(a.id), uid).run();
      return r.meta.changes ? "lesson deleted" : "no such lesson";
    }
    case "set_review": {
      const g = await getGroup(env, uid);
      if (!g) return "no group";
      g.review = !!a.on; await saveGroup(env, uid, g); return `review ${g.review ? "ON" : "OFF"}`;
    }
  }
  return "unknown tool";
}

// ------------------------------------------------------------------ one session
/** One agent turn. Native function calling first; when that fails (model without tool support, bad output, timeout) the same turn is asked as plain JSON. */
const KNOWN = new Set(TOOLS.map((t) => t.function.name));
const usable = (m: ChatMsg | null): boolean => !!m && (((m.content || "").trim().length >= 3) || (m.tool_calls || []).some((c) => KNOWN.has(c.function.name) && c.function.name !== "finish"));
async function turn(env: Env, messages: ChatMsg[], system: string, user: string): Promise<{ m: ChatMsg | null; err: string }> {
  let err = "";
  try { const m = await chatTools(env, messages, TOOLS, 40_000, 900); if (usable(m)) return { m, err: "" }; err = "پاسخ بدون ابزار/متن"; } catch (e) { err = (e as Error).message; }
  try {                                                                              // same turn as plain JSON
    const list = TOOLS.map((t) => `- ${t.function.name}: ${t.function.description} args=${JSON.stringify(t.function.parameters.properties)}`).join("\n");
    const j = await chatJson(env, system + "\nTOOLS YOU CAN CALL:\n" + list + "\nReply JSON: {\"calls\":[{\"tool\":\"say\",\"args\":{\"text\":\"...\"}}]} — one to three calls; ALWAYS start with a say call; use {\"tool\":\"finish\",\"args\":{}} when done.", user, 900);
    const calls = (Array.isArray(j.calls) ? j.calls : []).filter((c: any) => c && typeof c.tool === "string").slice(0, 3)
      .map((c: any, i: number) => ({ id: `j${i}`, type: "function" as const, function: { name: c.tool, arguments: JSON.stringify(c.args && typeof c.args === "object" ? c.args : {}) } }));
    const m = { role: "assistant", content: typeof j.text === "string" ? j.text : null, tool_calls: calls } as ChatMsg;
    if (usable(m)) return { m, err: "" };
  } catch (e) { err = `${err} | ${(e as Error).message}`; }
  try {                                                                              // last model attempt: one plain sentence, no tools at all
    const j = await chatJson(env, system.slice(0, 3500) + "\nIgnore tools now. Reply JSON {\"text\": string}: 1-3 Persian sentences from you to the other agent / the owner about the situation.", user, 500);
    const t = typeof j.text === "string" ? j.text.trim() : "";
    if (t.length >= 3) return { m: { role: "assistant", content: t } as ChatMsg, err: "" };
  } catch (e) { err = `${err} | ${(e as Error).message}`; }
  return { m: null, err: err.slice(0, 400) };
}

export async function runSession(env: Env, uid: number, events: string[], first: Role = "sup", fallback = ""): Promise<{ turns: number; says: number; error: string }> {
  const ctx = await context(env, uid, events);
  const st = { actions: 0, waiting: false, done: false, says: 0 };
  const transcript: string[] = [];
  let role: Role = first, idle = 0, turns = 0, error = "";
  for (; turns < MAX_TURNS && !st.done && !st.waiting; turns++, role = role === "sup" ? "asst" : "sup") {
    const other = role === "sup" ? "assistant" : "supervisor";
    const sys = PROMPT[role] + ctx;
    const usr = `${transcript.length ? "SESSION SO FAR:\n" + transcript.join("\n") : "The session starts now."}\n\nYour turn (${role === "sup" ? "supervisor" : "assistant"}). Speak to the ${other} with say, act with the other tools, or finish.`;
    const r = await turn(env, [{ role: "system", content: sys }, { role: "user", content: usr }], sys, usr);
    if (!r.m) { if (/quota|limit|neurons|allocation|429|4006|timeout|timed out|abort|fetch|network|HTTP \d|capacity|unavailable|overloaded|سهمیه|محدودیت|موجودی|در دسترس نیست|پاسخ نداد|کلید API|هیچ سرویس/i.test(r.err)) error = r.err; break; }   // a real outage is reported; "the model said nothing useful" is not
    const m = r.m;
    const before = st.says + st.actions;
    if (!m.tool_calls?.length) {
      const txt = (m.content || "").trim();
      if (txt) await act(env, uid, role, "say", { text: txt }, st).then((r) => transcript.push(`${roleName(role)}: ${txt}`));
    }
    for (const c of m.tool_calls || []) {
      let a: any = {}; try { a = JSON.parse(c.function.arguments || "{}"); } catch { /* keep {} */ }
      const out = await act(env, uid, role, c.function.name, a, st).catch((e) => `error: ${(e as Error).message}`);
      transcript.push(c.function.name === "say" ? `${roleName(role)}: ${String(a.text || "")}` : `${roleName(role)} → ${c.function.name}(${JSON.stringify(a).slice(0, 220)}) ⇒ ${out}`);
    }
    if (st.says + st.actions === before) { if (++idle >= 2) break; } else idle = 0;
  }
  if (!error && !st.says && !st.waiting) {                                           // the model gave nothing usable: speak anyway, from the facts (no AI), so the owner is never left with silence
    await act(env, uid, first, "say", { text: fallback || "🛡 جلسه برگزار شد؛ مورد تازه‌ای برای گزارش نبود ✅" }, st).catch(() => null);
  }
  return { turns, says: st.says, error };
}

// ------------------------------------------------------------------ scheduler hook (called every minute)
const describeEvent = (e: { kind: string; payload: string }): string => {
  let p: any = {}; try { p = JSON.parse(e.payload); } catch { p = { text: e.payload }; }
  switch (e.kind) {
    case "held": return `Supervisor HELD post #${p.id} (not sent to Eitaa): ${(p.problems || []).join("; ")}`;
    case "fixed": return `Supervisor auto-FIXED post #${p.id} before publishing: ${(p.problems || []).join("; ")}`;
    case "reported_error": return `OWNER reported an error on post #${p.id}: «${p.error}». Lesson saved: ${p.lesson || "(none)"}. ${p.fixed ? "It was fixed and re-published." : "It could not be fixed automatically."}`;
    case "owner_answer": return `OWNER ANSWERED the question #${p.id} («${p.question}»): «${p.answer}». Act on it now.`;
    case "owner_note": return `OWNER wrote in the council chat: «${p.text}». Answer him and act.`;
    case "digest": return `Periodic review: the supervisor summarises what he learned; the assistant cleans the lessons (merge duplicates, sharpen vague ones, delete wrong ones).`;
    default: return `Manual session requested by the owner${p.text ? ": " + p.text : ""}.`;
  }
};

const factLine = (e: { kind: string; payload: string }): string => {
  let p: any = {}; try { p = JSON.parse(e.payload); } catch { p = { text: e.payload }; }
  switch (e.kind) {
    case "held": return `پست #${p.id} را نگه داشتم و به ایتا نفرستادم: ${(p.problems || []).join("؛ ")}`;
    case "fixed": return `پست #${p.id} را پیش از انتشار اصلاح کردم: ${(p.problems || []).join("؛ ")}`;
    case "reported_error": return `خطای گزارش‌شده‌ی پست #${p.id} ثبت شد${p.lesson ? " و درسش را یاد گرفتم: " + p.lesson : ""}${p.fixed ? " (اصلاح و دوباره منتشر شد)" : ""}.`;
    case "owner_answer": return `پاسخ شما به سؤال #${p.id} ثبت شد و طبق آن عمل می‌کنم.`;
    case "owner_note": return `پیام شما را دریافت کردم: «${String(p.text || "").slice(0, 160)}». دستیار و من بررسی می‌کنیم.`;
    case "digest": return "مرور دوره‌ای انجام شد؛ آموخته‌ها بررسی شدند و مورد تازه‌ای نبود.";
    default: return `جلسه‌ی دستی: فعلاً مورد بازی برای گزارش ندارم و همه‌چیز عادی است ✅${p.text ? " — درخواست شما: «" + String(p.text).slice(0, 120) + "»" : ""}`;
  }
};

export async function processCouncil(env: Env): Promise<void> {
  const t = now();
  if (t % 3600 < 60) await scheduleDigests(env);
  const row = await env.DB.prepare("SELECT user_id FROM ea_events WHERE status='new' ORDER BY id LIMIT 1").first<{ user_id: number }>();
  if (!row) return;
  const uid = row.user_id;
  const evs = (await env.DB.prepare("SELECT id, kind, payload FROM ea_events WHERE user_id=? AND status='new' ORDER BY id LIMIT 12").bind(uid).all<{ id: number; kind: string; payload: string }>()).results;
  const ids = evs.map((e) => e.id).join(",");
  const mark = (s: string) => env.DB.prepare(`UPDATE ea_events SET status=? WHERE id IN (${ids})`).bind(s).run();
  if (!(await getGroup(env, uid))) return void (await mark("skipped"));
  const urgent = evs.some((e) => e.kind.startsWith("owner") || e.kind === "manual");
  const used = Number((await kvGet(env, dayKey(uid))) || 0), last = Number((await kvGet(env, `cclast:${uid}`)) || 0);
  if (used >= (urgent ? DAY_CAP * 3 : DAY_CAP)) return void (await mark("skipped"));      // free-plan budget: the council never burns the daily AI quota
  if (!urgent && t - last < GAP_S) return;                                                  // batch quick successive events into one session
  await mark("running");
  await kvSet(env, dayKey(uid), String(used + 1)); await kvSet(env, `cclast:${uid}`, String(t));
  try {
    const first: Role = evs.every((e) => e.kind === "owner_answer" || e.kind === "owner_note") ? "asst" : "sup";
    const r = await runSession(env, uid, evs.map(describeEvent), first, "🛡 " + evs.map(factLine).join("\n"));
    await mark("done");
    if (r.error) await councilFailed(env, uid, r.error, urgent);
    else await kvDel(env, `ccerr:${uid}`);
  } catch (e) { console.error("council failed", (e as Error).message); await mark("failed"); await councilFailed(env, uid, (e as Error).message, urgent); }
}

/** The council could not speak: say WHY (never silence), once per hour unless the owner asked for it. */
async function councilFailed(env: Env, uid: number, why: string, urgent: boolean): Promise<void> {
  await kvSet(env, `ccerr:${uid}`, why.slice(0, 300));
  const last = Number((await kvGet(env, `ccerrsay:${uid}`)) || 0);
  if (!urgent && now() - last < 3600) return;
  await kvSet(env, `ccerrsay:${uid}`, String(now()));
  const quota = /quota|limit|neurons|429|10000|capacity|تعداد|سهمیه/i.test(why);
  const text = `⚠️ <b>شورا نتوانست صحبت کند</b>\n${esc(why.slice(0, 300))}\n\n${quota ? "به‌نظر می‌رسد سهمیه‌ی رایگان هوش مصنوعی امروز تمام شده؛ بعد از نیمه‌شب (ساعت ۰۳:۳۰ تهران) خودش دوباره کار می‌کند. " : "ربات خودش چند دقیقه‌ی دیگر دوباره تلاش می‌کند. "}اگر ادامه داشت، «🩺 بررسی سلامت» را در /panel یا بخش گروه بزنید.`;
  if (!(await sayAs(env, uid, "main", "council", text))) await tg.send(env, uid, text);
  if (urgent) await tg.send(env, uid, text);
}

async function scheduleDigests(env: Env): Promise<void> {
  const users = (await env.DB.prepare("SELECT k FROM ea_kv WHERE k LIKE 'grp:%'").all<{ k: string }>()).results.map((r) => Number(r.k.slice(4)));
  for (const uid of users) {
    const n = (await env.DB.prepare("SELECT COUNT(*) n FROM ea_lessons WHERE user_id=?").bind(uid).first<{ n: number }>())!.n;
    const last = (await kvGet(env, `ccdig:${uid}`)) || "0:0";
    const [ts, cnt] = last.split(":").map(Number);
    if (n >= 3 && n !== cnt && now() - ts > 86400) { await kvSet(env, `ccdig:${uid}`, `${now()}:${n}`); await enqueue(env, uid, "digest"); }
  }
}

// ------------------------------------------------------------------ the owner answers
export async function answerAsk(env: Env, uid: number, askId: number, answer: string): Promise<boolean> {
  const a = await env.DB.prepare("SELECT * FROM ea_asks WHERE id=? AND user_id=? AND status='open'").bind(askId, uid).first<{ id: number; question: string; role: string }>();
  if (!a) return false;
  await env.DB.prepare("UPDATE ea_asks SET status='answered', answer=? WHERE id=?").bind(answer.slice(0, 1000), askId).run();
  await logLine(env, uid, "owner", answer);
  await enqueue(env, uid, "owner_answer", { id: askId, question: a.question.slice(0, 200), answer: answer.slice(0, 600) });
  return true;
}
/** The owner writes in the council topic: it answers the newest open question, or is a remark the agents must react to. */
export async function ownerSpoke(env: Env, uid: number, text: string): Promise<void> {
  const open = await env.DB.prepare("SELECT id FROM ea_asks WHERE user_id=? AND status='open' ORDER BY id DESC LIMIT 1").bind(uid).first<{ id: number }>();
  if (open && (await answerAsk(env, uid, open.id, text))) return;
  await logLine(env, uid, "owner", text);
  await enqueue(env, uid, "owner_note", { text: text.slice(0, 600) });
}
export const botsStatus = async (env: Env, uid: number) => ({ sup: !!(await roleToken(env, uid, "sup")), asst: !!(await roleToken(env, uid, "asst")) });
