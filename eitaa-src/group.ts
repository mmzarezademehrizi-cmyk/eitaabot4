// The Telegram group: every post is shown here BEFORE it goes to Eitaa, one single "manage" button under each post,
// topics (مطالب / گزارشات / چت / آموخته‌ها), and the supervisor (ناظر) bot that writes the reports.
import { dec, enc } from "./crypto";
import { now } from "./db";
import { Env } from "./env";
import * as tg from "./tg";
import { esc } from "./util";

export interface GroupCfg {
  chat: string;
  forum: boolean;
  topics: { posts?: number; reports?: number; chat?: number; lessons?: number; council?: number; all?: number };
  review: boolean;          // supervisor on/off
  title?: string;
}
export const TOPIC_NAMES: Record<keyof GroupCfg["topics"], string> = { posts: "📝 مطالب", reports: "🚨 گزارشات", chat: "💬 چت با ایجنت", lessons: "🧠 آموخته‌ها", council: "🤝 شورا (ناظر و دستیار)", all: "📚 تمام پست‌ها" };

// ------------------------------------------------------------------ small key/value store (table ea_kv)
export async function kvGet(env: Env, k: string): Promise<string | null> {
  const r = await env.DB.prepare("SELECT v FROM ea_kv WHERE k=?").bind(k).first<{ v: string }>();
  return r ? r.v : null;
}
export async function kvSet(env: Env, k: string, v: string): Promise<void> {
  await env.DB.prepare("INSERT INTO ea_kv(k,v) VALUES(?,?) ON CONFLICT(k) DO UPDATE SET v=excluded.v").bind(k, v).run();
}
export const kvDel = (env: Env, k: string) => env.DB.prepare("DELETE FROM ea_kv WHERE k=?").bind(k).run();

export async function getGroup(env: Env, uid: number): Promise<GroupCfg | null> {
  const v = await kvGet(env, `grp:${uid}`);
  if (!v) return null;
  try { const g = JSON.parse(v) as GroupCfg; return g && g.chat ? { ...g, review: g.review !== false, topics: g.topics || {}, forum: !!g.forum } : null; } catch { return null; }
}
export async function saveGroup(env: Env, uid: number, g: GroupCfg): Promise<void> {
  await kvSet(env, `grp:${uid}`, JSON.stringify(g));
  await kvSet(env, `grpchat:${g.chat}`, String(uid));
}
export async function dropGroup(env: Env, uid: number): Promise<void> {
  const g = await getGroup(env, uid);
  if (g) await kvDel(env, `grpchat:${g.chat}`);
  await kvDel(env, `grp:${uid}`);
}
/** Which user owns this Telegram group (null when it is not a registered post group). */
export async function groupOwner(env: Env, chatId: number | string): Promise<number | null> {
  const v = await kvGet(env, `grpchat:${chatId}`);
  return v ? Number(v) : null;
}

// ------------------------------------------------------------------ bots
export async function botUsername(env: Env): Promise<string> {
  const cached = await kvGet(env, "main_bot_username");
  if (cached) return cached;
  const s = await env.DB.prepare("SELECT value FROM settings WHERE key='bot_username'").first<{ value: string }>().catch(() => null);
  let name = s?.value || "";
  if (!name) { try { name = (await tg.tg<{ username?: string }>(env, "getMe")).username || ""; } catch { /* offline */ } }
  if (name) await kvSet(env, "main_bot_username", name);
  return name;
}
export const manageKb = async (env: Env, postId: number, label = "⚙️ مدیریت پست") => {
  const u = await botUsername(env);
  return u ? { inline_keyboard: [[{ text: label, url: `https://t.me/${u}?start=ea_p${postId}` }]] } : undefined;
};

export type Role = "sup" | "asst";
const ROLE_FA: Record<Role, string> = { sup: "🛡 ناظر", asst: "🧭 دستیار" };
export const roleName = (r: Role | "owner" | "main") => (r === "sup" || r === "asst" ? ROLE_FA[r] : r === "owner" ? "👤 شما" : "🤖 ربات");
export async function roleToken(env: Env, uid: number, role: Role): Promise<string> {
  const v = await kvGet(env, `${role}:${uid}`);
  if (v) { const t = await dec(env.SECRET_KEY, v); if (t) return t; }
  return (role === "sup" ? env.SUPERVISOR_TOKEN : env.ASSISTANT_TOKEN) || "";
}
export const supToken = (env: Env, uid: number) => roleToken(env, uid, "sup");
export async function setRoleBot(env: Env, uid: number, role: Role, token: string): Promise<{ ok: boolean; name: string; error: string; inGroup: boolean | null }> {
  let me: { username?: string; id: number };
  try { me = await tg.tgWith(env, token, "getMe"); } catch (e) { return { ok: false, name: "", error: (e as Error).message, inGroup: null }; }
  await kvSet(env, `${role}:${uid}`, await enc(env.SECRET_KEY, token));
  await kvSet(env, `${role}name:${uid}`, me.username || "");
  const g = await getGroup(env, uid);
  let inGroup: boolean | null = null;
  if (g) { try { const m = await tg.tgWith<{ status: string }>(env, token, "getChatMember", { chat_id: g.chat, user_id: me.id }); inGroup = !["left", "kicked"].includes(m.status); } catch { inGroup = false; } }
  return { ok: true, name: me.username || "", error: "", inGroup };
}
export const setSupervisor = (env: Env, uid: number, token: string) => setRoleBot(env, uid, "sup", token);
export async function clearRoleBot(env: Env, uid: number, role: Role): Promise<void> { await kvDel(env, `${role}:${uid}`); await kvDel(env, `${role}name:${uid}`); }
export const clearSupervisor = (env: Env, uid: number) => clearRoleBot(env, uid, "sup");

// ------------------------------------------------------------------ group setup
export async function setupGroup(env: Env, uid: number, chatId: number, title: string): Promise<string> {
  const prev = await getGroup(env, uid);
  let forum = false, adminOk = false, note = "";
  try { forum = !!(await tg.tg<{ is_forum?: boolean }>(env, "getChat", { chat_id: chatId })).is_forum; } catch (e) { note += `\n⚠️ ${esc((e as Error).message)}`; }
  try {
    const me = await tg.tg<{ id: number }>(env, "getMe");
    const m = await tg.tg<{ status: string; can_manage_topics?: boolean; can_delete_messages?: boolean }>(env, "getChatMember", { chat_id: chatId, user_id: me.id });
    adminOk = m.status === "administrator" || m.status === "creator";
    if (adminOk && forum && m.status === "administrator" && m.can_manage_topics === false) note += "\n⚠️ دسترسی «مدیریت تاپیک‌ها» را به ربات بدهید.";
    if (adminOk && m.status === "administrator" && m.can_delete_messages === false) note += "\n⚠️ دسترسی «حذف پیام‌ها» را هم بدهید (برای پاک‌کردن پست‌های ایرادی).";
  } catch { /* ignore */ }
  if (!adminOk) note += "\n⚠️ ربات را در گروه «ادمین» کنید (حذف پیام و مدیریت تاپیک لازم است).";
  const cfg: GroupCfg = { chat: String(chatId), forum, topics: prev && prev.chat === String(chatId) ? prev.topics : {}, review: prev?.review ?? true, title };
  if (forum) {
    for (const key of Object.keys(TOPIC_NAMES) as (keyof GroupCfg["topics"])[]) {
      if (cfg.topics[key]) continue;
      try { cfg.topics[key] = (await tg.tg<{ message_thread_id: number }>(env, "createForumTopic", { chat_id: chatId, name: TOPIC_NAMES[key] })).message_thread_id; }
      catch (e) { note += `\n⚠️ ساخت تاپیک «${TOPIC_NAMES[key]}» نشد: ${esc((e as Error).message)}`; }
    }
  } else note += "\n💡 تاپیک‌ها فعال نیستند؛ همه چیز در همین گروه می‌آید. برای تاپیک: تنظیمات گروه ← «Topics» را روشن کنید و دوباره <code>/eagroup</code> بفرستید.";
  if (prev && prev.chat !== cfg.chat) await kvDel(env, `grpchat:${prev.chat}`);
  await saveGroup(env, uid, cfg);
  const say = (key: keyof GroupCfg["topics"], text: string) => sendTo(env, env.BOT_TOKEN, cfg, key, text).catch(() => null);
  await say("posts", "📝 <b>مطالب</b>\nهر پستی که قرار است در ایتا منتشر شود، اول این‌جا می‌آید؛ زیر هر پست یک دکمه‌ی «⚙️ مدیریت پست» است که شما را به ربات می‌برد (گزارش خطا، تصحیح، حذف، افزودن عکس/ویدیو).");
  await say("reports", "🚨 <b>گزارشات</b>\nگزارش ناظر درباره‌ی ایرادهای پست‌ها، اصلاح‌های خودکار و پست‌هایی که ارسال نشدند اینجا می‌آید.");
  await say("chat", "💬 <b>چت با ایجنت</b>\nاینجا مثل «گفتگو با ایجنت» در ربات می‌توانید دستور بدهید (فقط پیام شما پاسخ داده می‌شود).");
  await say("council", "🤝 <b>شورا</b>\nاینجا «ناظر» و «دستیار» درباره‌ی ایرادها و آموخته‌ها با هم گفتگو می‌کنند، به هم دستور می‌دهند و هر وقت کمک یا نظر شما را بخواهند اینجا (و در ربات) می‌پرسند. هر پیامی که شما اینجا بنویسید به آن‌ها می‌رسد.");
  await say("all", "📚 <b>تمام پست‌ها</b>\nنسخه‌ی همه‌ی پست‌های ساخته‌شده (ارسال‌شده و ارسال‌نشده) اینجا جمع می‌شود. پستی که به ایتا رسیده باشد، در آخر متنش «✅ ارسال شد» می‌خورد؛ بقیه وضعیتشان (⏳ در انتظار / 🛑 نگه‌داشته / ❌ ناموفق) را نشان می‌دهند.");
  await say("lessons", "🧠 <b>آموخته‌ها</b>\nهر خطایی که گزارش کنید به یک قانون تبدیل می‌شود و اینجا ثبت می‌شود تا تکرار نشود.");
  return `✅ این گروه به‌عنوان گروه پست‌ها ثبت شد.\n${forum ? "تاپیک‌ها: " + (Object.keys(cfg.topics).length ? "ساخته شد" : "ساخته نشد") : "بدون تاپیک"}${note}`;
}

// ------------------------------------------------------------------ sending into the group
function topicOf(cfg: GroupCfg, key: keyof GroupCfg["topics"]): Record<string, unknown> {
  const t = cfg.topics[key];
  return t ? { message_thread_id: t } : {};
}
const threadGone = (m: string) => /thread.*not found|topic.*(deleted|closed|not found)|TOPIC_/i.test(m);
/** Creates a missing topic (or re-creates a deleted one) and stores it. Returns the thread id or 0. */
export async function makeTopic(env: Env, uid: number, cfg: GroupCfg, key: keyof GroupCfg["topics"]): Promise<number> {
  if (!cfg.forum) return 0;
  try {
    const id = (await tg.tg<{ message_thread_id: number }>(env, "createForumTopic", { chat_id: cfg.chat, name: TOPIC_NAMES[key] })).message_thread_id;
    cfg.topics[key] = id; await saveGroup(env, uid, cfg); return id;
  } catch { return 0; }
}
/** Makes sure every topic exists; returns the keys that had to be (re)created. */
export async function ensureTopics(env: Env, uid: number): Promise<string[]> {
  const cfg = await getGroup(env, uid); const made: string[] = [];
  if (!cfg || !cfg.forum) return made;
  for (const key of Object.keys(TOPIC_NAMES) as (keyof GroupCfg["topics"])[]) {
    if (!cfg.topics[key] && (await makeTopic(env, uid, cfg, key))) made.push(TOPIC_NAMES[key]);
  }
  return made;
}
export async function sendTo(env: Env, token: string, cfg: GroupCfg, key: keyof GroupCfg["topics"], text: string, kb?: unknown, uid = 0): Promise<number> {
  const go = async () => (await tg.tgWith<{ message_id: number }>(env, token, "sendMessage", { chat_id: cfg.chat, text: text.slice(0, 4000), parse_mode: "HTML", disable_web_page_preview: true, ...(kb ? { reply_markup: kb } : {}), ...topicOf(cfg, key) })).message_id;
  try { return await go(); }
  catch (e) {
    if (cfg.topics[key] && threadGone((e as Error).message)) {            // the topic was deleted: heal it and retry once
      const u = uid || (await groupOwner(env, cfg.chat)) || 0;
      delete cfg.topics[key];
      if (u && (await makeTopic(env, u, cfg, key))) return await go();
      return await go();                                                  // without a topic: General
    }
    throw e;
  }
}

/** A report from the supervisor (its own bot when configured, otherwise the main bot). Never throws. */
export async function report(env: Env, uid: number, text: string, kb?: unknown, dm = false): Promise<void> {
  const cfg = await getGroup(env, uid);
  if (cfg) {
    const sup = await supToken(env, uid);
    for (const token of sup ? [sup, env.BOT_TOKEN] : [env.BOT_TOKEN]) {
      try { await sendTo(env, token, cfg, "reports", text, kb, uid); break; } catch { /* the supervisor may not be in the group yet: fall back */ }
    }
  }
  if (dm || !cfg) await tg.send(env, uid, text, kb as tg.Kb);
}
export async function lessonNote(env: Env, uid: number, text: string): Promise<void> {
  const cfg = await getGroup(env, uid);
  if (cfg) await sendTo(env, env.BOT_TOKEN, cfg, "lessons", text, undefined, uid).catch(() => null);
}

export type CopyPost = { kind: string; text: string; file_id: string; file_name: string };
export const mediaKind = (name: string): "photo" | "video" | "document" =>
  /\.(jpe?g|png|webp)$/i.test(name) ? "photo" : /\.(mp4|mov|webm|m4v)$/i.test(name) ? "video" : "document";

/** Sends a copy of a post to any chat (the group's posts topic, or private). Files: bytes we downloaded, or a Telegram file_id of the main bot. */
export async function sendCopy(env: Env, dest: { chat: string | number; thread?: number }, p: CopyPost, file: { bytes: Uint8Array; name: string } | null, kb?: unknown): Promise<number> {
  const base: Record<string, unknown> = { chat_id: dest.chat, ...(dest.thread ? { message_thread_id: dest.thread } : {}), ...(kb ? { reply_markup: kb } : {}) };
  if (p.kind === "text" || (!file && !p.file_id)) {
    return (await tg.tgWith<{ message_id: number }>(env, env.BOT_TOKEN, "sendMessage", { ...base, text: (p.text || "…").slice(0, 4000), disable_web_page_preview: true })).message_id;
  }
  const name = file?.name || p.file_name || "file";
  const types: ("photo" | "video" | "document")[] = [mediaKind(name)];
  if (types[0] !== "document") types.push("document");                         // some photos/videos are refused as such (size/dimensions): fall back to a document
  let last: Error = new Error("send failed");
  for (const type of types) {
    try {
      const caption = (p.text || "").slice(0, 1000);
      if (file) {
        const f = new FormData();
        for (const [k, v] of Object.entries(base)) f.set(k, typeof v === "object" ? JSON.stringify(v) : String(v));
        if (caption) f.set("caption", caption);
        f.set(type, new Blob([file.bytes.slice().buffer as ArrayBuffer]), name);
        return (await tg.tgWith<{ message_id: number }>(env, env.BOT_TOKEN, `send${type[0].toUpperCase()}${type.slice(1)}`, f)).message_id;
      }
      return (await tg.tgWith<{ message_id: number }>(env, env.BOT_TOKEN, `send${type[0].toUpperCase()}${type.slice(1)}`, { ...base, [type]: p.file_id, ...(caption ? { caption } : {}) })).message_id;
    } catch (e) { last = e as Error; }
  }
  throw last;
}

/** Puts the post into the group's posts topic with the single manage button. Returns the group message id (0 when no group). */
export async function postToGroup(env: Env, uid: number, postId: number, p: CopyPost, file: { bytes: Uint8Array; name: string } | null): Promise<number> {
  const cfg = await getGroup(env, uid);
  if (!cfg) return 0;
  const mid = await sendCopy(env, { chat: cfg.chat, thread: cfg.topics.posts }, p, file, await manageKb(env, postId, "⚙️ مدیریت پست · ⏳"));
  await env.DB.prepare("INSERT INTO ea_pubs(post_id,user_id,grp_chat,grp_msg,verdict,note,updated_at) VALUES(?,?,?,?,'','',?) ON CONFLICT(post_id) DO UPDATE SET grp_chat=excluded.grp_chat, grp_msg=excluded.grp_msg, updated_at=excluded.updated_at")
    .bind(postId, uid, cfg.chat, mid, now()).run();
  return mid;
}
/** Updates the status shown on the manage button ("✅ در ایتا", "⏸ نگه‌داشته" …). */
export async function markGroup(env: Env, postId: number, label: string): Promise<void> {
  const r = await env.DB.prepare("SELECT grp_chat, grp_msg FROM ea_pubs WHERE post_id=?").bind(postId).first<{ grp_chat: string; grp_msg: number }>();
  if (!r || !r.grp_msg) return;
  const kb = await manageKb(env, postId, `⚙️ مدیریت پست · ${label}`);
  if (kb) await tg.tg(env, "editMessageReplyMarkup", { chat_id: r.grp_chat, message_id: r.grp_msg, reply_markup: kb }).catch(() => null);
}
/** Deletes the group copy of a post (the supervisor's "remove it"). */
export async function removeFromGroup(env: Env, postId: number): Promise<void> {
  const r = await env.DB.prepare("SELECT grp_chat, grp_msg FROM ea_pubs WHERE post_id=?").bind(postId).first<{ grp_chat: string; grp_msg: number }>();
  if (r && r.grp_msg) { await tg.tg(env, "deleteMessage", { chat_id: r.grp_chat, message_id: r.grp_msg }).catch(() => null); await env.DB.prepare("UPDATE ea_pubs SET grp_msg=0 WHERE post_id=?").bind(postId).run(); }
}
export async function setVerdict(env: Env, postId: number, uid: number, verdict: string, note = ""): Promise<void> {
  await env.DB.prepare("INSERT INTO ea_pubs(post_id,user_id,verdict,note,updated_at) VALUES(?,?,?,?,?) ON CONFLICT(post_id) DO UPDATE SET verdict=excluded.verdict, note=excluded.note, updated_at=excluded.updated_at")
    .bind(postId, uid, verdict, note.slice(0, 400), now()).run();
}
export const getPub = (env: Env, postId: number) => env.DB.prepare("SELECT * FROM ea_pubs WHERE post_id=?").bind(postId).first<{ post_id: number; user_id: number; grp_chat: string; grp_msg: number; verdict: string; note: string }>();

/** A message from one of the two agents into a topic: through its own bot when it is configured and in the group, otherwise through the main bot with its name in front. */
export async function sayAs(env: Env, uid: number, role: Role | "main", key: keyof GroupCfg["topics"], text: string, kb?: unknown): Promise<boolean> {
  const cfg = await getGroup(env, uid);
  if (!cfg) return false;
  const own = role === "main" ? "" : await roleToken(env, uid, role);
  let why = "";
  if (own) { try { await sendTo(env, own, cfg, key, text, kb, uid); return true; } catch (e) { why = `${roleName(role as Role)}: ${(e as Error).message}`; } }
  try { await sendTo(env, env.BOT_TOKEN, cfg, key, role === "main" ? text : `<b>${roleName(role)}</b>\n${text}`, kb, uid); return true; }
  catch (e) { await kvSet(env, `sayerr:${uid}`, `${why ? why + " | " : ""}ربات اصلی: ${(e as Error).message}`.slice(0, 300)).catch(() => null); return false; }
}
