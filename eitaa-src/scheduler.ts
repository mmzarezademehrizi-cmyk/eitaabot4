// Delivery of posts: called right away for "send now" and from the cron tick for scheduled ones.
import { agentTick } from "./agent";
import { dec } from "./crypto";
import { ChannelRow, PostRow, UserRow, now } from "./db";
import * as eitaa from "./eitaa";
import { Env, eitaaWeb } from "./env";
import { getGroup, getPub, markGroup, postToGroup, removeFromGroup, report, setVerdict } from "./group";
import { reviewText } from "./review";
import { enqueue } from "./council";
import { extFor, fetchBytes } from "./source";
import * as tg from "./tg";
import { requestMirror } from "./mirror";
import { Btn, ikb } from "./tg";
import { esc, fmtDt } from "./util";

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const MAX_IMG = 15 * 1024 * 1024;
const MAX_VIDEO = 45 * 1024 * 1024;   // Worker memory is 128 MB; larger videos fail with a clear message

/** Posts made by the agent carry `src_url` (an image on the source channel's CDN); the rest come from Telegram files. */
async function fileBytes(env: Env, p: PostRow): Promise<{ bytes: Uint8Array; name: string }> {
  if (p.src_url) {
    const isVideo = /\.(mp4|mov|webm|mkv)$/i.test(p.file_name) || /\.(mp4|mov|webm)(\?|$)/i.test(p.src_url);
    const f = await fetchBytes(p.src_url, isVideo ? MAX_VIDEO : MAX_IMG, eitaaWeb(env) + "/");
    return { bytes: f.bytes, name: isVideo ? (p.file_name || "video.mp4") : p.file_name || `image.${extFor(f.type, p.src_url)}` };
  }
  return { bytes: await tg.download(env, p.file_id), name: p.file_name || "file" };
}

/** Image size from the file header (JPEG/PNG/WebP/GIF); null when unknown. */
export function imageSize(b: Uint8Array): { w: number; h: number } | null {
  if (b.length > 24 && b[0] === 0x89 && b[1] === 0x50) return { w: (b[16] << 24) | (b[17] << 16) | (b[18] << 8) | b[19], h: (b[20] << 24) | (b[21] << 16) | (b[22] << 8) | b[23] };
  if (b.length > 10 && b[0] === 0x47 && b[1] === 0x49) return { w: b[6] | (b[7] << 8), h: b[8] | (b[9] << 8) };
  if (b.length > 30 && b[0] === 0x52 && b[8] === 0x57) {                                   // RIFF....WEBP
    const k = String.fromCharCode(b[12], b[13], b[14], b[15]);
    if (k === "VP8X") return { w: 1 + (b[24] | (b[25] << 8) | (b[26] << 16)), h: 1 + (b[27] | (b[28] << 8) | (b[29] << 16)) };
    if (k === "VP8 ") return { w: (b[26] | (b[27] << 8)) & 0x3fff, h: (b[28] | (b[29] << 8)) & 0x3fff };
    if (k === "VP8L") return { w: 1 + (((b[22] & 0x3f) << 8) | b[21]), h: 1 + (((b[24] & 0xf) << 10) | (b[23] << 2) | ((b[22] & 0xc0) >> 6)) };
  }
  if (b.length > 4 && b[0] === 0xff && b[1] === 0xd8) {                                      // JPEG: walk the segments to the SOF marker
    let i = 2;
    while (i + 9 < b.length) {
      if (b[i] !== 0xff) { i++; continue; }
      const m = b[i + 1];
      if (m >= 0xc0 && m <= 0xcf && m !== 0xc4 && m !== 0xc8 && m !== 0xcc) return { h: (b[i + 5] << 8) | b[i + 6], w: (b[i + 7] << 8) | b[i + 8] };
      i += 2 + ((b[i + 2] << 8) | b[i + 3]);
    }
  }
  return null;
}
/** A reason (Persian) why this media must not be published as is; null when it looks fine. Unknown formats pass. */
export function mediaProblem(bytes: Uint8Array, name: string): string | null {
  const isVideo = /\.(mp4|mov|webm|m4v|mkv)$/i.test(name), isImg = /\.(jpe?g|png|webp|gif)$/i.test(name);
  if (bytes.length < 1500) return isVideo ? "فایل ویدیو ناقص یا خراب است" : "فایل خیلی کوچک یا خراب است";
  if (isImg) { const z = imageSize(bytes); if (z && (z.w < 160 || z.h < 160)) return `عکس خیلی کوچک است (${z.w}×${z.h}) و کیفیتش پایین است`; }
  return null;
}
export async function loadMedia(env: Env, p: PostRow): Promise<{ bytes: Uint8Array; name: string }> {
  let last: Error = new Error("دانلود نشد");
  for (let i = 0; i < 3; i++) {
    try { return await fileBytes(env, p); } catch (e) { last = e as Error; if (i < 2) await sleep(1500 * (i + 1)); }
  }
  throw last;
}

async function sendOnce(env: Env, token: string, p: PostRow, ch: ChannelRow, file: { bytes: Uint8Array; name: string } | null): Promise<string> {
  const o: eitaa.PostOpts = { title: p.title || undefined, silent: !!p.silent, pin: !!p.pin, viewDelete: p.view_delete || undefined };
  const res = p.kind === "text" || !file ? await eitaa.sendMessage(env, token, ch.chat_id, p.text, o) : await eitaa.sendFile(env, token, ch.chat_id, file.name, file.bytes, p.text, o);
  const id = res && (res.message_id ?? res.id ?? res.result?.message_id);
  return id ? String(id) : "";
}

const handlesOf = (s: string) => [...(s || "").matchAll(/@([A-Za-z0-9_]{4,})/g)].map((m) => m[1]);

/** Holds a post back (nothing is sent to Eitaa) and tells the owner why — in the group's reports topic and in private, with the buttons to decide. */
async function hold(env: Env, p: PostRow, why: string[], kind: "review" | "media"): Promise<void> {
  const reason = why.join(" · ").slice(0, 300);
  await env.DB.prepare("UPDATE ea_posts SET status='held', error=? WHERE id=?").bind(reason, p.id).run();
  await removeFromGroup(env, p.id);
  await setVerdict(env, p.id, p.user_id, kind === "media" ? "held_media" : "held", reason);
  const preview = esc((p.text || (p.kind === "file" ? "📎 " + p.file_name : "")).slice(0, 220));
  const head = kind === "media" ? "⚠️ رسانه‌ی پست آماده نیست" : "🛑 ناظر پست را نگه داشت";
  const msg = `${head} · #${p.id}\n\n${why.map((x) => "• " + esc(x)).join("\n")}\n\n<i>${preview}</i>\n\nچیزی در ایتا ارسال نشد. تصمیم با شماست 👇`;
  const rows: Btn[][] = [[["✏️ تصحیح", `pm:fix:${p.id}`], ["🖼 افزودن عکس/ویدیو", `pm:media:${p.id}`]], [[kind === "media" ? "📝 ارسال فقط متن" : "🚀 ارسال با همین وضعیت", `pm:force:${p.id}`], ["🗑 حذف", `pm:del:${p.id}`]]];
  await report(env, p.user_id, msg, undefined, false);
  await tg.send(env, p.user_id, msg, ikb(rows));
  if (kind === "review") await enqueue(env, p.user_id, "held", { id: p.id, problems: why }).catch(() => null);
}

/** The supervised path: the post goes to the group first, the supervisor reviews it, and only then it is allowed to reach Eitaa. */
async function gate(env: Env, p: PostRow, ch: ChannelRow, file: { bytes: Uint8Array; name: string } | null): Promise<PostRow | null> {
  const grp = await getGroup(env, p.user_id);
  if (!grp) return p;
  try { await postToGroup(env, p.user_id, p.id, p, file); }
  catch (e) { await tg.send(env, p.user_id, `⚠️ ارسال پست #${p.id} به گروه ناموفق بود (${esc((e as Error).message)}). ربات باید در گروه ادمین باشد. پست بدون نمایش در گروه ادامه می‌یابد.`); }
  const pub = await getPub(env, p.id);
  if (!grp.review || pub?.verdict === "forced") return p;
  const job = p.job_id ? await env.DB.prepare("SELECT instruction, footer FROM agent_jobs WHERE id=?").bind(p.job_id).first<{ instruction: string; footer: string }>() : null;
  const ownLine = job?.footer || (ch.chat_id && !/^-?\d+$/.test(ch.chat_id) ? "@" + ch.chat_id.replace(/^@/, "") : "");
  const own = [...handlesOf(ownLine), ch.chat_id.replace(/^@/, "")].filter(Boolean);
  const r = await reviewText(env, p.user_id, p.text, { own, ownLine, task: job?.instruction || "", hasMedia: p.kind === "file" || !!p.src_url, agent: !!p.job_id });
  if (r.action === "hold") { await hold(env, { ...p, text: r.text }, r.problems.length ? r.problems : ["ایراد نامشخص"], "review"); return null; }
  if (r.action === "fixed") {
    await env.DB.prepare("UPDATE ea_posts SET text=? WHERE id=?").bind(r.text, p.id).run();
    const q = { ...p, text: r.text };
    await removeFromGroup(env, p.id);
    try { await postToGroup(env, p.user_id, p.id, q, file); } catch { /* group copy is informational */ }
    await setVerdict(env, p.id, p.user_id, "fixed", r.problems.join(" · "));
    await enqueue(env, p.user_id, "fixed", { id: p.id, problems: r.problems }).catch(() => null);
    await report(env, p.user_id, `🛡 <b>ناظر</b> · پست #${p.id} ایراد داشت و اصلاح شد (نسخه‌ی قبلی از گروه پاک شد؛ نسخه‌ی درست اول در گروه، بعد در ایتا):\n${r.problems.map((x) => "• " + esc(x)).join("\n") || "• اصلاح جزئی"}`);
    return q;
  }
  await setVerdict(env, p.id, p.user_id, "ok");
  if (r.problems.length) await report(env, p.user_id, `🛡 <b>ناظر</b> · پست #${p.id} با یادداشت تأیید شد:\n${r.problems.map((x) => "• " + esc(x)).join("\n")}`);
  return p;
}

/** Claims the post (pending -> sending) so two ticks can never send the same post twice, then sends with retries. */
/** `quiet` = the caller (live chat) reports the outcome itself, so no Telegram notices are sent. */
export async function deliver(env: Env, postId: number, quiet = false): Promise<void> {
  const claim = await env.DB.prepare("UPDATE ea_posts SET status='sending', claimed_at=? WHERE id=? AND status='pending'").bind(now(), postId).run();
  if (!claim.meta.changes) return;
  let p = (await env.DB.prepare("SELECT * FROM ea_posts WHERE id=?").bind(postId).first<PostRow>())!;
  const user = await env.DB.prepare("SELECT * FROM ea_users WHERE id=?").bind(p.user_id).first<UserRow>();
  const ch = await env.DB.prepare("SELECT * FROM ea_channels WHERE id=?").bind(p.channel_id).first<ChannelRow>();
  const fail = async (msg: string) => {
    await env.DB.prepare("UPDATE ea_posts SET status='failed', error=? WHERE id=?").bind(msg.slice(0, 300), p.id).run();
    await markGroup(env, p.id, "❌ ناموفق");
    if (!quiet) await tg.send(env, p.user_id, `❌ ارسال پست #${p.id} ناموفق بود:\n${esc(msg)}${ch ? `\n\n🆔 شناسه‌ی کانالِ ارسال‌شده: <code>${esc(ch.chat_id)}</code>` : ""}`, { inline_keyboard: [[{ text: "🔁 ارسال مجدد", callback_data: `sp:rt:${p.id}` }], ...(p.channel_id ? [[{ text: "🧪 آزمایش/تغییر شناسه‌ی کانال", callback_data: `ch:v:${p.channel_id}` }]] : [])] });
  };
  if (!user || !ch) return fail("کاربر یا کانال دیگر وجود ندارد.");
  const token = await dec(env.SECRET_KEY, user.eitaa_token_enc);
  if (!token) return fail("توکن ایتایار ثبت نشده یا نامعتبر است. آن را دوباره در «برنامه‌های متصل» ثبت کنید.");

  // media first: a post whose photo/video is missing or broken is HELD (never silently published without it)
  let file: { bytes: Uint8Array; name: string } | null = null;
  if (p.kind === "file") {
    try { file = await loadMedia(env, p); }
    catch (e) {
      if (p.src_url) return hold(env, p, [`دانلود عکس/ویدیوی منبع ناموفق بود (${(e as Error).message})`], "media");
      return fail((e as Error).message);
    }
    const bad = p.src_url ? mediaProblem(file.bytes, file.name) : null;
    if (bad) return hold(env, p, [bad], "media");
  }
  const g = await gate(env, p, ch, file);
  if (!g) return;
  p = g;

  let last = "";
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const mid = await sendOnce(env, token, p, ch, file);
      await env.DB.prepare("UPDATE ea_posts SET status='sent', sent_at=?, eitaa_message_id=?, error='' WHERE id=?").bind(now(), mid, p.id).run();
      await requestMirror(env, p.channel_id, 90);
      await markGroup(env, p.id, "✅ در ایتا");
      if (!quiet) await tg.send(env, p.user_id, `✅ پست #${p.id} در 🟠 «${esc(ch.title)}» ارسال شد.`);
      return;
    } catch (e) {
      last = (e as Error).message;
      if (!(e instanceof eitaa.EitaaNetworkError) || attempt === 2) break;
      await sleep(2000 * (attempt + 1));
    }
  }
  await fail(last || "خطای نامشخص");
}

/** Cron tick (every minute). Small batches keep each invocation inside the free-plan limits. */
export async function tick(env: Env): Promise<void> {
  const t = now();
  await env.DB.prepare("UPDATE ea_posts SET status='failed', error='ارسال نیمه‌کاره ماند؛ لطفاً دوباره زمان‌بندی کنید.' WHERE status='sending' AND claimed_at < ?").bind(t - 900).run();
  const due = (await env.DB.prepare("SELECT id FROM ea_posts WHERE status='pending' AND run_at<=? ORDER BY run_at LIMIT 3").bind(t).all<{ id: number }>()).results;
  for (const d of due) {
    try { await deliver(env, d.id); } catch (e) { console.error("deliver failed", d.id, (e as Error).message); }
  }
  try { await agentTick(env); } catch (e) { console.error("agent tick failed", (e as Error).message); }
}

export const describe = (p: PostRow) => `#${p.id} · ${fmtDt(p.run_at)}`;
