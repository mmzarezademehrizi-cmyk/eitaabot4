// The channel mirror: every channel added to the bot gets its own topic in the group (named like the channel) that shows the channel's messages
// exactly as they are on Eitaa. The public channel page is read every 30 minutes (and ~90 s after the bot itself posts): new messages are added,
// edited ones are edited, deleted ones are removed from the copy. Needs the channel's public username (the numeric Eitaayar id has no public page).
import { now } from "./db";
import { Env } from "./env";
import { GroupCfg, getGroup, kvDel, kvGet, kvSet, report, sendCopy } from "./group";
import { SrcMsg, fetchBytes, fetchChannel } from "./source";
import * as tg from "./tg";
import { esc } from "./util";
import { eitaaWeb } from "./env";

export interface ChanRow { id: number; user_id: number; title: string; chat_id: string }
const EVERY = 30 * 60, MAX_IMG = 15 * 1024 * 1024, MAX_VIDEO = 45 * 1024 * 1024;

const fnv = (s: string): string => { let h = 0x811c9dc5; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193); } return (h >>> 0).toString(36); };
export const msgHash = (m: SrcMsg): string => fnv(`${m.text}\u0001${m.image || m.videoUrl ? 1 : 0}\u0001${m.video ? 1 : 0}`);

/** The channel's public username: its id when that is a username, else the one the owner gave for the mirror. */
export async function usernameOf(env: Env, ch: ChanRow): Promise<string> {
  const c = (ch.chat_id || "").replace(/^@/, "");
  if (c && !/^-?\d+$/.test(c) && !/joinchat/i.test(c)) return c;
  return (await kvGet(env, `chuser:${ch.id}`)) || "";
}
export const mirrorOn = async (env: Env, id: number): Promise<boolean> => !(await kvGet(env, `mirroroff:${id}`));
export const requestMirror = async (env: Env, channelId: number, delay = 90): Promise<void> => { await kvSet(env, `mirr:due:${channelId}`, String(now() + delay)).catch(() => null); };

async function topicFor(env: Env, uid: number, cfg: GroupCfg, ch: ChanRow, fresh = false): Promise<number> {
  if (!cfg.forum) return 0;
  const k = `mt:${ch.id}`;
  if (!fresh) { const v = Number((await kvGet(env, k)) || 0); if (v) return v; }
  try {
    const id = (await tg.tg<{ message_thread_id: number }>(env, "createForumTopic", { chat_id: cfg.chat, name: `🪞 ${ch.title}`.slice(0, 120) })).message_thread_id;
    await kvSet(env, k, String(id)); return id;
  } catch { return 0; }
}
const gone = (m: string) => /thread.*not found|topic.*(deleted|closed|not found)|TOPIC_/i.test(m);

async function load(env: Env, m: SrcMsg, kind: "image" | "video"): Promise<{ bytes: Uint8Array; name: string }> {
  const base = eitaaWeb(env) + "/";
  if (kind === "video") { const f = await fetchBytes(m.videoUrl, MAX_VIDEO, base); return { bytes: f.bytes, name: "video.mp4" }; }
  const f = await fetchBytes(m.image, MAX_IMG, base);
  const ext = /png/i.test(f.type) ? "png" : /webp/i.test(f.type) || m.sticker ? "webp" : /gif/i.test(f.type) ? "gif" : "jpg";
  return { bytes: f.bytes, name: `image.${ext}` };
}
const linkKb = (env: Env, name: string, id: string) => ({ inline_keyboard: [[{ text: "🔗 اصل پیام در ایتا", url: `${eitaaWeb(env)}/${name}/${id}` }]] });

/** Reads the public page and brings the topic in line with it. Returns the number of Telegram operations used and whether everything is in sync. */
export async function syncChannel(env: Env, ch: ChanRow, budget = 5): Promise<{ ops: number; done: boolean; error: string }> {
  const cfg = await getGroup(env, ch.user_id);
  if (!cfg) return { ops: 0, done: true, error: "" };
  const name = await usernameOf(env, ch);
  if (!name) return { ops: 0, done: true, error: "نام کاربری عمومی کانال را نمی‌دانم" };
  const res = await fetchChannel(env, name);
  if (!res.ok) return { ops: 0, done: false, error: res.note || "صفحه‌ی عمومی کانال خوانده نشد" };
  const msgs = res.messages.slice().sort((a, b) => Number(a.id) - Number(b.id));
  const rows = (await env.DB.prepare("SELECT src_id, tg_msg, hash, has_media FROM ea_mirror WHERE channel_id=?").bind(ch.id).all<{ src_id: number; tg_msg: number; hash: string; has_media: number }>()).results;
  const byId = new Map(rows.map((r) => [r.src_id, r]));
  let thread = await topicFor(env, ch.user_id, cfg, ch), ops = 0;
  const dest = () => ({ chat: cfg.chat, thread: thread || undefined });
  const del = async (mid: number) => { await tg.tg(env, "deleteMessage", { chat_id: cfg.chat, message_id: mid }).catch(() => null); };

  const post = async (m: SrcMsg): Promise<{ id: number; media: boolean }> => {
    let file: { bytes: Uint8Array; name: string } | null = null, note = "";
    const wantVideo = !!m.videoUrl, wantImage = !!m.image;
    try { if (wantVideo) file = await load(env, m, "video"); else if (wantImage) file = await load(env, m, "image"); }
    catch (e) { if (wantVideo && wantImage) { try { file = await load(env, m, "image"); note = "\n🎞 (ویدیو بزرگ/ناقابل‌دانلود بود؛ فقط تصویر)"; } catch { /* text only */ } } if (!file) note = "\n📎 (رسانه‌ی این پیام بارگیری نشد — از «اصل پیام» ببینید)"; }
    const text = ((m.text || "") + note).trim();
    const kb = linkKb(env, name, m.id);
    const attempt = () => sendCopy(env, dest(), { kind: file ? "file" : "text", text: file ? text.slice(0, 1000) : text || "…", file_id: "", file_name: file?.name || "" }, file, kb);
    try { return { id: await attempt(), media: !!file }; }
    catch (e) { if (gone((e as Error).message)) { thread = await topicFor(env, ch.user_id, cfg, ch, true); return { id: await attempt(), media: !!file }; } throw e; }
  };

  const minId = msgs.length ? Number(msgs[0].id) : 0, ids = new Set(msgs.map((m) => Number(m.id)));
  let pendingWork = false;
  for (const r of rows) {                                                        // deleted on Eitaa → remove the copy (only inside the window the page shows)
    if (r.src_id >= minId && !ids.has(r.src_id)) {
      if (ops >= budget) { pendingWork = true; break; }
      ops++; if (r.tg_msg) await del(r.tg_msg);
      await env.DB.prepare("DELETE FROM ea_mirror WHERE channel_id=? AND src_id=?").bind(ch.id, r.src_id).run();
    }
  }
  for (const m of msgs) {
    const sid = Number(m.id), row = byId.get(sid), h = msgHash(m);
    if (row && row.hash === h) continue;
    if (ops >= budget) { pendingWork = true; break; }
    ops++;
    try {
      if (!row) {
        const p = await post(m);
        await env.DB.prepare("INSERT INTO ea_mirror(channel_id,src_id,tg_msg,hash,has_media,updated_at) VALUES(?,?,?,?,?,?) ON CONFLICT(channel_id,src_id) DO UPDATE SET tg_msg=excluded.tg_msg, hash=excluded.hash, has_media=excluded.has_media, updated_at=excluded.updated_at").bind(ch.id, sid, p.id, h, p.media ? 1 : 0, now()).run();
      } else {
        let done = false;
        if (row.tg_msg) {
          try {
            const media = !!row.has_media;
            await tg.tg(env, media ? "editMessageCaption" : "editMessageText", { chat_id: cfg.chat, message_id: row.tg_msg, ...(media ? { caption: (m.text || "").slice(0, 1000) } : { text: (m.text || "…").slice(0, 4000), disable_web_page_preview: true }), reply_markup: linkKb(env, name, m.id) });
            done = true;
          } catch (e) { if (/not modified/i.test((e as Error).message)) done = true; }
        }
        if (done) await env.DB.prepare("UPDATE ea_mirror SET hash=?, updated_at=? WHERE channel_id=? AND src_id=?").bind(h, now(), ch.id, sid).run();
        else {                                                                    // the copy cannot be edited: replace it
          if (row.tg_msg) await del(row.tg_msg);
          const p = await post(m);
          await env.DB.prepare("UPDATE ea_mirror SET tg_msg=?, hash=?, has_media=?, updated_at=? WHERE channel_id=? AND src_id=?").bind(p.id, h, p.media ? 1 : 0, now(), ch.id, sid).run();
        }
      }
    } catch (e) { console.error("mirror", ch.id, m.id, (e as Error).message); await kvSet(env, `mirr:err:${ch.id}`, (e as Error).message.slice(0, 200)); }
  }
  return { ops, done: !pendingWork, error: "" };
}

/** Cron: at most one channel per minute (the most overdue). A channel is due every 30 minutes, ~90 s after the bot posted to it, or while it still has work left. */
export async function syncMirrors(env: Env): Promise<void> {
  const t = now();
  const users = (await env.DB.prepare("SELECT k FROM ea_kv WHERE k LIKE 'grp:%'").all<{ k: string }>()).results.map((r) => Number(r.k.slice(4)));
  let best: { ch: ChanRow; score: number } | null = null;
  for (const uid of users) {
    const chans = (await env.DB.prepare("SELECT id, user_id, title, chat_id FROM ea_channels WHERE user_id=?").bind(uid).all<ChanRow>()).results;
    for (const ch of chans) {
      if (!(await mirrorOn(env, ch.id)) || !(await usernameOf(env, ch))) continue;
      const last = Number((await kvGet(env, `mirr:last:${ch.id}`)) || 0), due = Number((await kvGet(env, `mirr:due:${ch.id}`)) || 0);
      const wait = Number((await kvGet(env, `mirr:wait:${ch.id}`)) || 0);
      if (wait > t) continue;
      const score = !last ? 1e9 : due && due <= t ? 1e8 + (t - due) : t - last >= EVERY ? t - last : 0;
      if (score > 0 && (!best || score > best.score)) best = { ch, score };
    }
  }
  if (!best) return;
  const { ch } = best;
  try {
    const r = await syncChannel(env, ch);
    if (r.error) {
      await kvSet(env, `mirr:wait:${ch.id}`, String(t + 900));                    // do not hammer a page that fails
      if (!(await kvGet(env, `mirr:errsay:${ch.id}`))) {
        await kvSet(env, `mirr:errsay:${ch.id}`, String(t));
        await report(env, ch.user_id, `🪞 آینه‌ی کانال «${esc(ch.title)}» ساخته نشد: ${esc(r.error)}\nکانال باید عمومی باشد و نام کاربری‌اش درست ثبت شود (کانال‌ها ← کانال ← 🔗 نام کاربری برای آینه).`, undefined, false);
      }
      return;
    }
    await kvDel(env, `mirr:errsay:${ch.id}`);
    if (r.done) { await kvSet(env, `mirr:last:${ch.id}`, String(t)); await kvDel(env, `mirr:due:${ch.id}`); }
  } catch (e) { console.error("syncMirrors", (e as Error).message); await kvSet(env, `mirr:wait:${ch.id}`, String(t + 300)); }
}
