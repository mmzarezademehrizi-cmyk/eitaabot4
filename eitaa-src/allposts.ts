// «📚 تمام پست‌ها»: a copy of EVERY post (sent or not) in its own group topic. A post that reached Eitaa gets "✅ ارسال شد" at the end of its text;
// the others show their state (⏳ pending / 🛑 held / ❌ failed …). Runs from the cron, a few posts per minute, and keeps the copies up to date.
import { PostRow, now } from "./db";
import { Env } from "./env";
import { getGroup, kvGet, kvSet, makeTopic, manageKb, sendCopy } from "./group";
import { loadMedia } from "./scheduler";
import * as tg from "./tg";
import { esc, fmtDt } from "./util";

type Row = PostRow & { sent_at: number | null; kv: string | null };
const LIVE = ["pending", "draft", "held", "failed", "sending", "sent"];

export function statusLine(p: { status: string; run_at: number; sent_at: number | null; error: string }): string {
  switch (p.status) {
    case "sent": return `✅ ارسال شد به ایتا${p.sent_at ? " · " + fmtDt(p.sent_at) : ""}`;
    case "pending": case "sending": return `⏳ هنوز ارسال نشده · زمان ارسال: ${fmtDt(p.run_at)}`;
    case "draft": return "📝 پیش‌نویس · ارسال نشده";
    case "held": return `🛑 نگه‌داشته شد، ارسال نشده${p.error ? " — " + p.error.slice(0, 120) : ""}`;
    case "failed": return `❌ ارسال نشد${p.error ? " — " + p.error.split("\n")[0].slice(0, 120) : ""}`;
    case "deleted": return "🗑 حذف شد";
    case "replaced": return "♻️ جایگزین شد (نسخه‌ی اصلاح‌شده ساخته شد)";
    case "canceled": return "🚫 لغو شد";
    default: return p.status;
  }
}
const withLine = (text: string, line: string, media: boolean) => {
  const max = (media ? 1000 : 4000) - line.length - 2;
  const t = (text || "").trim();
  return `${t.length > max ? t.slice(0, Math.max(0, max - 1)) + "…" : t}${t ? "\n\n" : ""}${line}`;
};

/** Sends or updates the copies of this user's posts. At most `limit` Telegram operations per call. */
export async function syncAll(env: Env, uid: number, limit = 4): Promise<number> {
  const cfg = await getGroup(env, uid);
  if (!cfg) return 0;
  if (cfg.forum && !cfg.topics.all && !(await makeTopic(env, uid, cfg, "all"))) return 0;
  const rows = (await env.DB.prepare("SELECT p.*, k.v kv FROM ea_posts p LEFT JOIN ea_kv k ON k.k='al:'||p.id WHERE p.user_id=? ORDER BY p.id DESC LIMIT 120").bind(uid).all<Row>()).results.reverse();
  let ops = 0;
  for (const p of rows) {
    if (ops >= limit) break;
    const [mid, st] = (p.kv || "").split("|");
    const state = `${p.status}:${(p.error || "").length}`;
    if (st && st.startsWith("err")) { if (now() - Number(st.split(":")[1] || 0) < 900) continue; }
    else if (p.kv && st === state) continue;
    if (!p.kv && !LIVE.includes(p.status)) continue;
    const media = p.kind === "file";
    const line = statusLine(p), kb = await manageKb(env, p.id, "⚙️ مدیریت پست");
    const text = withLine(p.text, line, media);
    ops++;
    try {
      if (mid && Number(mid) > 0) {
        try { await tg.tg(env, media ? "editMessageCaption" : "editMessageText", { chat_id: cfg.chat, message_id: Number(mid), ...(media ? { caption: text } : { text, disable_web_page_preview: true }), ...(kb ? { reply_markup: kb } : {}) }); }
        catch (e) { if (!/not modified/i.test((e as Error).message)) throw e; }
        await kvSet(env, `al:${p.id}`, `${mid}|${state}`);
      } else {
        let file: { bytes: Uint8Array; name: string } | null = null, note = "";
        if (media && p.src_url) { try { file = await loadMedia(env, p); } catch { note = "\n📎 (رسانه‌ی این پست بارگیری نشد)"; } }
        const newId = await sendCopy(env, { chat: cfg.chat, thread: cfg.topics.all }, { kind: file || p.file_id ? p.kind : "text", text: text + note, file_id: p.file_id, file_name: p.file_name }, file, kb);
        await kvSet(env, `al:${p.id}`, `${newId}|${state}`);
      }
    } catch (e) {
      const gone = /message to edit not found|message can't be edited|MESSAGE_ID_INVALID/i.test((e as Error).message);
      await kvSet(env, `al:${p.id}`, gone ? `0|resend` : `${mid || 0}|err:${now()}`);   // deleted copy: send it again; otherwise do not retry every minute
      console.error("allposts", p.id, (e as Error).message);
    }
  }
  return ops;
}

export async function syncAllUsers(env: Env): Promise<void> {
  const users = (await env.DB.prepare("SELECT k FROM ea_kv WHERE k LIKE 'grp:%'").all<{ k: string }>()).results.map((r) => Number(r.k.slice(4)));
  for (const uid of users) { try { await syncAll(env, uid); } catch (e) { console.error("syncAll", (e as Error).message); } }
}
