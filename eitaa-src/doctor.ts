// The doctor: every ~10 minutes it checks the system for each user with a group, repairs what it can by itself and reports what it cannot.
// Checks: topics exist · main bot is admin · supervisor/assistant bots are in the group (and admin) · stuck / transiently failed posts · council errors · Eitaa channel ids.
import { now } from "./db";
import { Env } from "./env";
import { ensureTopics, getGroup, kvDel, kvGet, kvSet, report, roleName, roleToken, Role } from "./group";
import { esc } from "./util";
import * as tg from "./tg";

const TRANSIENT = /نیمه‌کاره|timeout|پاسخ نداد|network|fetch|HTTP 5\d\d|50\d|rate|too many|429|flood|temporar/i;

/** Says a problem once per `hours` (never spams). */
async function once(env: Env, uid: number, code: string, hours = 6): Promise<boolean> {
  const k = `doc:${uid}:${code}`, last = Number((await kvGet(env, k)) || 0);
  if (now() - last < hours * 3600) return false;
  await kvSet(env, k, String(now())); return true;
}

export interface Finding { fixed: string[]; problems: string[] }

export async function diagnose(env: Env, uid: number, manual = false): Promise<Finding> {
  const out: Finding = { fixed: [], problems: [] };
  const cfg = await getGroup(env, uid);
  if (!cfg) { out.problems.push("گروهی ثبت نشده (در گروه /eagroup بفرستید)"); return out; }

  // 1) the main bot's rights
  try {
    const me = await tg.tg<{ id: number }>(env, "getMe");
    const m = await tg.tg<{ status: string; can_delete_messages?: boolean; can_manage_topics?: boolean }>(env, "getChatMember", { chat_id: cfg.chat, user_id: me.id });
    if (m.status !== "administrator" && m.status !== "creator") out.problems.push("ربات اصلی در گروه ادمین نیست (حذف پیام و تاپیک کار نمی‌کند)");
    else if (m.status === "administrator" && m.can_delete_messages === false) out.problems.push("ربات اصلی اجازه‌ی «حذف پیام‌ها» ندارد");
    else if (m.status === "administrator" && cfg.forum && m.can_manage_topics === false) out.problems.push("ربات اصلی اجازه‌ی «مدیریت تاپیک‌ها» ندارد");
  } catch (e) { out.problems.push(`گروه در دسترس ربات نیست: ${(e as Error).message}`); }

  // 2) topics (auto-repair)
  try { const made = await ensureTopics(env, uid); if (made.length) out.fixed.push(`تاپیک ساخته شد: ${made.join("، ")}`); } catch { /* reported by the send errors */ }

  // 3) the two agents' bots
  for (const role of ["sup", "asst"] as Role[]) {
    const tok = await roleToken(env, uid, role);
    if (!tok) continue;
    try {
      const me = await tg.tgWith<{ id: number }>(env, tok, "getMe");
      const m = await tg.tgWith<{ status: string }>(env, tok, "getChatMember", { chat_id: cfg.chat, user_id: me.id });
      if (["left", "kicked"].includes(m.status)) out.problems.push(`${roleName(role)} در گروه نیست؛ آن را دوباره عضو و ادمین کنید (تا آن موقع با ربات اصلی حرف می‌زند)`);
      else if (m.status !== "administrator" && m.status !== "creator") out.problems.push(`${roleName(role)} در گروه ادمین نیست`);
    } catch (e) { out.problems.push(`توکن ${roleName(role)} کار نمی‌کند (${(e as Error).message}) — در بخش گروه توکن تازه بدهید`); }
  }

  // 4) posts: stuck / transiently failed ones are re-queued once
  const stuck = await env.DB.prepare("UPDATE ea_posts SET status='pending', run_at=?, error='' WHERE user_id=? AND status='sending' AND claimed_at < ?").bind(now(), uid, now() - 600).run();
  if (stuck.meta.changes) out.fixed.push(`${stuck.meta.changes} پست گیرکرده دوباره در صف ارسال گذاشته شد`);
  const failed = (await env.DB.prepare("SELECT id, error FROM ea_posts WHERE user_id=? AND status='failed' AND id > (SELECT COALESCE(MAX(id),0)-30 FROM ea_posts WHERE user_id=?) ORDER BY id").bind(uid, uid).all<{ id: number; error: string }>()).results;
  let retried = 0; const hard: Record<string, number[]> = {};
  for (const f of failed) {
    if (TRANSIENT.test(f.error || "") && !(await kvGet(env, `docretry:${f.id}`))) {
      await kvSet(env, `docretry:${f.id}`, String(now()));
      await env.DB.prepare("UPDATE ea_posts SET status='pending', run_at=?, error='' WHERE id=? AND status='failed'").bind(now(), f.id).run(); retried++;
    } else {
      const key = /chat not found/i.test(f.error || "") ? "شناسه‌ی کانال ایتایار درست نیست (کانال ← 🧪 آزمایش اتصال)" : /token|unauthorized|401|403/i.test(f.error || "") ? "توکن ایتایار نامعتبر است" : "";
      if (key) (hard[key] ||= []).push(f.id);
    }
  }
  if (retried) out.fixed.push(`${retried} پست ناموفق (خطای موقت) دوباره امتحان می‌شود`);
  for (const [k, ids] of Object.entries(hard)) out.problems.push(`${k} — پست‌های ${ids.slice(0, 6).map((i) => "#" + i).join("، ")}`);

  // 5) the council
  const cerr = await kvGet(env, `ccerr:${uid}`);
  if (cerr) out.problems.push(`شورا آخرین بار نتوانست حرف بزند: ${cerr.slice(0, 160)}`);
  const sayerr = await kvGet(env, `sayerr:${uid}`);
  if (sayerr) { out.problems.push(`ارسال پیام به گروه ناموفق بود: ${sayerr.slice(0, 160)}`); if (!manual) await kvDel(env, `sayerr:${uid}`); }
  return out;
}

const render = (f: Finding) =>
  `🩺 <b>گزارش سلامت</b>${f.fixed.length ? "\n\n🔧 <b>خودکار تعمیر شد:</b>\n" + f.fixed.map((x) => "• " + esc(x)).join("\n") : ""}${f.problems.length ? "\n\n⚠️ <b>نیاز به شما:</b>\n" + f.problems.map((x) => "• " + esc(x)).join("\n") : ""}`;

/** Cron entry (every ~10 minutes): quiet unless something was repaired or still needs the owner. */
export async function doctorTick(env: Env): Promise<void> {
  const last = Number((await kvGet(env, "doctor:last")) || 0);
  if (now() - last < 600) return;
  await kvSet(env, "doctor:last", String(now()));
  const users = (await env.DB.prepare("SELECT k FROM ea_kv WHERE k LIKE 'grp:%'").all<{ k: string }>()).results.map((r) => Number(r.k.slice(4)));
  for (const uid of users) {
    try {
      const f = await diagnose(env, uid);
      const sig = f.problems.join("|");
      const newProblems = f.problems.length ? await once(env, uid, "p:" + sig.slice(0, 120), 6) : false;
      if (f.fixed.length || newProblems) await report(env, uid, render({ fixed: f.fixed, problems: newProblems ? f.problems : [] }), undefined, f.problems.length > 0 && newProblems);
    } catch (e) { console.error("doctor", (e as Error).message); }
  }
}
/** The owner asked: full report, always. */
export async function doctorNow(env: Env, uid: number): Promise<string> {
  const f = await diagnose(env, uid, true);
  return f.fixed.length || f.problems.length ? render(f) : "🩺 <b>گزارش سلامت</b>\n\n✅ همه‌چیز سالم است: گروه، تاپیک‌ها، ربات‌ها و صف ارسال.";
}
