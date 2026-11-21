// The personal website: the bot hands every user a private link (/site); the page then manages everything through this JSON API.
import APP from "./app.html";
import { enqueue, ownerSpoke, answerAsk } from "./council";
import { now } from "./db";
import { Env } from "./env";
import { clearRoleBot, getGroup, kvDel, kvGet, kvSet, roleToken, saveGroup, setRoleBot, setVerdict, Role } from "./group";
import { learnFromFix, removePost, replacePost } from "./manage";
import { addLesson } from "./review";

export const appPage = (): Response => new Response(APP, { headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-store", "x-frame-options": "DENY", "referrer-policy": "no-referrer" } });

const sha = async (s: string) => [...new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s)))].map((b) => b.toString(16).padStart(2, "0")).join("");
const TTL = 7 * 86400;

/** A fresh private link (7 days). The token travels in the URL fragment, so it never reaches server logs. */
export async function siteLink(env: Env, uid: number): Promise<string> {
  const base = (env.WORKER_URL || "").replace(/\/$/, "");
  if (!base) return "❌ آدرس Worker (WORKER_URL) تنظیم نشده است؛ نصب را با setup.mjs دوباره اجرا کنید.";
  const raw = crypto.getRandomValues(new Uint8Array(24));
  const token = btoa(String.fromCharCode(...raw)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  await kvSet(env, `web:${await sha(token)}`, JSON.stringify({ uid, exp: now() + TTL }));
  return `🌐 <b>سایت شخصی شما</b>\n\n${base}/app#k=${token}\n\n🔐 این لینک فقط مخصوص شماست (۷ روز اعتبار)؛ به کسی ندهید. لینک تازه: /site`;
}

const J = (o: unknown, status = 200) => new Response(JSON.stringify(o), { status, headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" } });

async function auth(env: Env, request: Request): Promise<number | null> {
  const t = (request.headers.get("authorization") || "").replace(/^Bearer\s+/i, "").trim();
  if (!/^[\w-]{20,}$/.test(t)) return null;
  const key = `web:${await sha(t)}`, v = await kvGet(env, key);
  if (!v) return null;
  try { const o = JSON.parse(v) as { uid: number; exp: number }; if (o.exp > now()) return o.uid; } catch { /* fall through */ }
  await kvDel(env, key);
  return null;
}

const ROLE_OK = (r: unknown): r is Role => r === "sup" || r === "asst";

export async function api(env: Env, request: Request, path: string): Promise<Response> {
  const uid = await auth(env, request);
  if (uid === null) return J({ error: "unauthorized" }, 401);
  const url = new URL(request.url), post = request.method === "POST";
  let body: any = {};
  if (post) { try { body = await request.json(); } catch { body = {}; } }
  const db = env.DB, int = (x: unknown) => Math.trunc(Number(x));

  if (path === "state") {
    const u = await db.prepare("SELECT id, name, username FROM ea_users WHERE id=?").bind(uid).first<{ id: number; name: string; username: string }>();
    const g = await getGroup(env, uid);
    const n = async (sql: string) => ((await db.prepare(sql).bind(uid).first<{ n: number }>())?.n) || 0;
    const bot = async (r: Role) => ({ has: !!(await roleToken(env, uid, r)), name: (await kvGet(env, `${r}name:${uid}`)) || "" });
    return J({
      user: u || { id: uid, name: "", username: "" },
      group: g ? { title: g.title || g.chat, chat: g.chat, forum: g.forum, review: g.review } : null,
      sup: await bot("sup"), asst: await bot("asst"),
      counts: { sent: await n("SELECT COUNT(*) n FROM ea_posts WHERE user_id=? AND status='sent'"), held: await n("SELECT COUNT(*) n FROM ea_posts WHERE user_id=? AND status='held'"), lessons: await n("SELECT COUNT(*) n FROM ea_lessons WHERE user_id=?"), asks: await n("SELECT COUNT(*) n FROM ea_asks WHERE user_id=? AND status='open'") },
    });
  }

  if (path === "posts") {
    const st = url.searchParams.get("status") || "", q = (url.searchParams.get("q") || "").slice(0, 60), lim = Math.min(int(url.searchParams.get("limit") || 60) || 60, 100);
    const rows = await db.prepare(`SELECT p.id, p.kind, p.text, p.status, p.sent_at, p.created_at, p.error, p.job_id, p.file_name, c.title channel, COALESCE(u.verdict,'') verdict FROM ea_posts p LEFT JOIN ea_channels c ON c.id=p.channel_id LEFT JOIN ea_pubs u ON u.post_id=p.id WHERE p.user_id=?1 ${st ? "AND p.status=?2" : "AND ?2=?2"} ${q ? "AND p.text LIKE ?3" : "AND ?3=?3"} AND p.status NOT IN ('replaced','deleted','canceled') ORDER BY p.id DESC LIMIT ${lim}`).bind(uid, st || "x", q ? `%${q.replace(/[%_]/g, "")}%` : "x").all();
    return J({ posts: rows.results });
  }
  let m = path.match(/^post\/(\d+)\/(delete|edit|send|time)$/);
  if (m && post) {
    const id = Number(m[1]);
    const p = await db.prepare("SELECT * FROM ea_posts WHERE id=? AND user_id=?").bind(id, uid).first<any>();
    if (!p || !["sent", "held", "pending", "failed"].includes(p.status)) return J({ error: "این پست قابل تغییر نیست" }, 400);
    if (m[2] === "delete") { const r = await removePost(env, p, "deleted"); await setVerdict(env, id, uid, "deleted"); return J({ ok: true, message: r.eitaa === "manual" ? "از گروه حذف شد؛ ایتایار حذف پیام ندارد، نسخه‌ی ایتا را دستی حذف کنید" : r.eitaa === "removed" ? "از گروه و ایتا حذف شد" : "حذف شد" }); }
    if (m[2] === "time") {
      if (p.status === "sent" || p.status === "sending") return J({ error: "این پست قبلاً ارسال شده" }, 400);
      const t = Math.trunc(Number(body.run_at));
      if (!t || t < now() - 60) return J({ error: "زمان باید در آینده باشد" }, 400);
      await db.prepare(p.status === "held" ? "UPDATE ea_posts SET run_at=? WHERE id=?" : "UPDATE ea_posts SET status='pending', run_at=?, error='' WHERE id=?").bind(t, id).run();
      return J({ ok: true, message: p.status === "held" ? "زمان ثبت شد؛ پست هنوز نگه‌داشته است" : "زمان ارسال تغییر کرد" });
    }
    if (m[2] === "send") {
      if (p.status !== "held") return J({ error: "این پست نگه‌داشته نشده" }, 400);
      if (p.kind === "file" && (await db.prepare("SELECT verdict FROM ea_pubs WHERE post_id=?").bind(id).first<{ verdict: string }>())?.verdict === "held_media") {
        if (!String(p.text).trim()) return J({ error: "متنی ندارد؛ از ربات رسانه‌ی تازه بدهید" }, 400);
        await db.prepare("UPDATE ea_posts SET kind='text', file_id='', src_url='', file_name='' WHERE id=?").bind(id).run();
      }
      await setVerdict(env, id, uid, "forced");
      await db.prepare("UPDATE ea_posts SET status='pending', run_at=?, error='' WHERE id=?").bind(now(), id).run();
      return J({ ok: true, message: "در صف ارسال قرار گرفت" });
    }
    const text = String(body.text || "").trim();
    if (!text) return J({ error: "متن خالی است" }, 400);
    if (p.kind === "file" && text.length > 1000) return J({ error: "متن همراه رسانه حداکثر ۱۰۰۰ نویسه است" }, 400);
    if (text === String(p.text).trim()) return J({ error: "متن تغییری نکرده" }, 400);
    const r = await replacePost(env, p, { text, keepJob: false });
    const learned = await learnFromFix(env, uid, p, text);
    return J({ ok: true, id: r.id, message: `پست جدید #${r.id} ساخته شد${r.note ? "؛ نسخه‌ی قبلی ایتا را دستی حذف کنید" : ""}${learned ? " · درس تازه: " + learned : ""}` });
  }

  if (path === "lessons") return J({ lessons: (await db.prepare("SELECT id, rule, source, created_at FROM ea_lessons WHERE user_id=? ORDER BY id DESC LIMIT 100").bind(uid).all()).results });
  if (path === "lesson" && post) {
    const rule = String(body.rule || "").replace(/\s+/g, " ").trim().slice(0, 300);
    if (body.op === "add") return J({ ok: rule.length >= 6 && (await addLesson(env, uid, rule, "owner")) });
    if (body.op === "edit") { if (rule.length < 6) return J({ error: "قانون خیلی کوتاه است" }, 400); await db.prepare("UPDATE ea_lessons SET rule=? WHERE id=? AND user_id=?").bind(rule, int(body.id), uid).run(); return J({ ok: true }); }
    if (body.op === "delete") { await db.prepare("DELETE FROM ea_lessons WHERE id=? AND user_id=?").bind(int(body.id), uid).run(); return J({ ok: true }); }
    return J({ error: "bad op" }, 400);
  }

  if (path === "council") {
    const messages = (await db.prepare("SELECT role, text, created_at FROM ea_council WHERE user_id=? ORDER BY id DESC LIMIT 60").bind(uid).all()).results.reverse();
    const asks = (await db.prepare("SELECT id, role, question, answer, status, created_at FROM ea_asks WHERE user_id=? ORDER BY id DESC LIMIT 8").bind(uid).all()).results;
    return J({ messages, asks });
  }
  if (path === "council/say" && post) { const t = String(body.text || "").trim().slice(0, 600); if (t) await ownerSpoke(env, uid, t); return J({ ok: true }); }
  if (path === "council/run" && post) { await enqueue(env, uid, "manual", {}); return J({ ok: true, message: "جلسه درخواست شد؛ تا یک دقیقه‌ی دیگر شروع می‌شود" }); }
  if (path === "ask" && post) {
    if (body.skip) { await db.prepare("UPDATE ea_asks SET status='skipped' WHERE id=? AND user_id=? AND status='open'").bind(int(body.id), uid).run(); return J({ ok: true }); }
    const t = String(body.answer || "").trim();
    return J({ ok: !!t && (await answerAsk(env, uid, int(body.id), t)) });
  }

  if (path === "jobs") return J({ jobs: (await db.prepare("SELECT id, name, instruction, times, enabled, last_info FROM agent_jobs WHERE user_id=? ORDER BY id DESC LIMIT 50").bind(uid).all()).results });
  if (path === "job" && post) {
    const id = int(body.id), own = await db.prepare("SELECT id, enabled FROM agent_jobs WHERE id=? AND user_id=?").bind(id, uid).first<{ id: number; enabled: number }>();
    if (!own) return J({ error: "یافت نشد" }, 404);
    if (body.op === "toggle") await db.prepare("UPDATE agent_jobs SET enabled=? WHERE id=?").bind(own.enabled ? 0 : 1, id).run();
    else if (body.op === "run") await db.prepare("UPDATE agent_jobs SET run_now=1, enabled=1 WHERE id=?").bind(id).run();
    else if (body.op === "delete") { await db.prepare("DELETE FROM agent_jobs WHERE id=?").bind(id).run(); await db.prepare("DELETE FROM agent_seen WHERE job_id=?").bind(id).run(); }
    else if (body.op === "edit") { const ins = String(body.instruction || "").trim().slice(0, 2000); if (ins.length < 5) return J({ error: "دستور خیلی کوتاه است" }, 400); await db.prepare("UPDATE agent_jobs SET instruction=? WHERE id=?").bind(ins, id).run(); }
    return J({ ok: true });
  }

  if (path === "settings" && post) {
    const g = await getGroup(env, uid);
    if (typeof body.review === "boolean" && g) { g.review = body.review; await saveGroup(env, uid, g); }
    if (ROLE_OK(body.role)) {
      if (body.clear) await clearRoleBot(env, uid, body.role);
      else if (body.token) {
        const t = String(body.token).trim();
        if (!/^\d{6,}:[A-Za-z0-9_-]{20,}$/.test(t)) return J({ error: "قالب توکن درست نیست" }, 400);
        const r = await setRoleBot(env, uid, body.role, t);
        if (!r.ok) return J({ error: "تلگرام توکن را نپذیرفت: " + r.error }, 400);
        return J({ ok: true, message: `ثبت شد: @${r.name}${r.inGroup === false ? " — هنوز در گروه نیست" : ""}` });
      }
    }
    return J({ ok: true });
  }
  return J({ error: "not found" }, 404);
}
