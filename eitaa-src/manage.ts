// Post management from the group's single "⚙️ مدیریت پست" button, and the group / supervisor settings screen.
import { extract } from "./bot";
import { dec } from "./crypto";
import { PostRow, UserRow, clearSession, getUser, now, setSession } from "./db";
import * as eitaa from "./eitaa";
import { Env, adminIds } from "./env";
import { Role, clearRoleBot, dropGroup, getGroup, getPub, kvGet, lessonNote, removeFromGroup, report, roleToken, saveGroup, sendCopy, setRoleBot, setVerdict } from "./group";
import { addLesson, learnFromEdit, learnFromError } from "./review";
import { answerAsk, enqueue } from "./council";
import { syncAll } from "./allposts";
import { doctorNow } from "./doctor";
import { siteLink } from "./web";
import { loadMedia } from "./scheduler";
import * as tg from "./tg";
import { Btn, TgCallback, TgMessage, ikb } from "./tg";
import { esc, fmtDt, normDigits, parseWhen } from "./util";

type Ctx = { env: Env; wait: (p: Promise<unknown>) => void };
const MAX_CAPTION = 1000;
const back = (id: number): Btn[] => [["↩️ برگشت", `pm:back:${id}`]];

const getPost = (env: Env, id: number) => env.DB.prepare("SELECT * FROM ea_posts WHERE id=?").bind(id).first<PostRow & { eitaa_message_id?: string }>();
const ACTIVE = new Set(["pending", "sending", "sent", "held", "failed", "draft"]);
const STATUS: Record<string, string> = { pending: "⏳ در صف ارسال", sending: "⏳ در حال ارسال", sent: "✅ در ایتا منتشر شده", held: "⏸ نگه‌داشته شد (در ایتا نیست)", failed: "❌ ارسال ناموفق", draft: "📝 پیش‌نویس", deleted: "🗑 حذف شده", replaced: "♻️ جایگزین شده", canceled: "🚫 لغو شده" };

// ------------------------------------------------------------------ the manage screen
export async function open(c: Ctx, u: UserRow, postId: number): Promise<void> {
  const { env } = c;
  await clearSession(env, u.id);
  const p = await getPost(env, postId);
  if (!p || p.user_id !== u.id) return void (await tg.send(env, u.id, "این پست پیدا نشد یا مال شما نیست."));
  try {
    let file = null;
    if (p.kind === "file") { try { file = await loadMedia(env, p); } catch { /* preview without the file */ } }
    await sendCopy(env, { chat: u.id }, p, file);
  } catch (e) { await tg.send(env, u.id, `<i>(پیش‌نمایش پست ممکن نشد: ${esc((e as Error).message)})</i>\n${esc(p.text.slice(0, 1500))}`); }
  const pub = await getPub(env, p.id);
  const next = pub?.note?.startsWith("replaced_by:") ? Number(pub.note.split(":")[1]) : 0;
  const st = `${STATUS[p.status] || p.status}${p.status === "held" || p.status === "failed" ? `\n<i>${esc(p.error)}</i>` : ""}`;
  if (!ACTIVE.has(p.status)) {
    return void (await tg.send(env, u.id, `<b>پست #${p.id}</b>\n${st}${next ? "\nنسخه‌ی جدید: #" + next : ""}`, next ? ikb([[["📄 باز کردن نسخه‌ی جدید", `pm:open:${next}`]]]) : undefined));
  }
  await tg.send(env, u.id, `<b>پست #${p.id}</b> · ${st}\n\nچه کاری می‌خواهید انجام دهید؟`, ikb([
    [["🚩 گزارش خطا", `pm:err:${p.id}`], ["✏️ تصحیح", `pm:fix:${p.id}`]],
    [["🗑 حذف پیام", `pm:del:${p.id}`], ["🖼 افزودن عکس/ویدیو و ارسال مجدد", `pm:media:${p.id}`]],
    ...(p.status === "sent" || p.status === "sending" ? [] : [[["⏰ تغییر زمان ارسال", `pm:time:${p.id}`] as Btn]]),
  ]));
}

// ------------------------------------------------------------------ removing / replacing
/** Removes the group copy and (best effort) the Eitaa message. Eitaayar's API documents no delete method, so Eitaa deletion may be impossible. */
export async function removePost(env: Env, p: PostRow & { eitaa_message_id?: string }, status: "deleted" | "replaced" | "canceled"): Promise<{ eitaa: "removed" | "manual" | "none"; error: string }> {
  await removeFromGroup(env, p.id);
  let eitaaRes: "removed" | "manual" | "none" = "none", error = "";
  if (p.status === "sent") {
    const user = await getUser(env, p.user_id), ch = await env.DB.prepare("SELECT chat_id FROM ea_channels WHERE id=?").bind(p.channel_id).first<{ chat_id: string }>();
    const token = user ? await dec(env.SECRET_KEY, user.eitaa_token_enc) : "";
    if (token && ch) { const r = await eitaa.deleteMessage(env, token, ch.chat_id, p.eitaa_message_id || ""); eitaaRes = r.ok ? "removed" : "manual"; error = r.error; }
    else eitaaRes = "manual";
  }
  await env.DB.prepare("UPDATE ea_posts SET status=? WHERE id=?").bind(status, p.id).run();
  return { eitaa: eitaaRes, error };
}
const eitaaNote = async (env: Env, p: PostRow & { eitaa_message_id?: string }, r: { eitaa: string; error: string }): Promise<string> => {
  if (r.eitaa !== "manual") return "";
  const ch = await env.DB.prepare("SELECT chat_id, title FROM ea_channels WHERE id=?").bind(p.channel_id).first<{ chat_id: string; title: string }>();
  return `\n\n⚠️ ایتایار در API خود «حذف پیام» ندارد، پس نسخه‌ی قبلی هنوز در ایتا مانده${p.eitaa_message_id ? ` (پیام ${esc(p.eitaa_message_id)})` : ""}${ch ? ` — لطفاً آن را در کانال «${esc(ch.title)}» دستی حذف کنید` : ""}.${r.error ? `\n<i>${esc(r.error.slice(0, 120))}</i>` : ""}`;
};

type Patch = Partial<Pick<PostRow, "text" | "kind" | "file_id" | "file_name" | "src_url">> & { keepJob?: boolean };
/** Creates the replacement post (same channel/options), removes the old one, and lets the cron deliver the new one: group first, then the supervisor, then Eitaa. */
export async function replacePost(env: Env, old: PostRow & { eitaa_message_id?: string }, patch: Patch): Promise<{ id: number; note: string }> {
  const n = { ...old, ...patch };
  const r = await env.DB.prepare("INSERT INTO ea_posts(user_id,channel_id,kind,text,file_id,file_name,title,silent,pin,view_delete,run_at,status,created_at,src_url,job_id,error) VALUES(?,?,?,?,?,?,?,?,?,?,?,'pending',?,?,?,'')")
    .bind(old.user_id, old.channel_id, n.kind, n.text, n.file_id, n.file_name, old.title, old.silent, old.pin, old.view_delete, now(), now(), n.src_url, patch.keepJob ? old.job_id : null).run();
  const id = r.meta.last_row_id as number;
  const rm = await removePost(env, old, "replaced");
  await setVerdict(env, old.id, old.user_id, "replaced", `replaced_by:${id}`);
  return { id, note: await eitaaNote(env, old, rm) };
}

/** After the owner corrected a post by hand: learn the general rule from the change and tell the lessons topic. Returns the rule (or ""). */
export async function learnFromFix(env: Env, uid: number, old: PostRow, newText: string): Promise<string> {
  try {
    const own = (await env.DB.prepare("SELECT footer FROM agent_jobs WHERE id=?").bind(old.job_id || 0).first<{ footer: string }>())?.footer || "";
    const rule = await learnFromEdit(env, uid, old.text, newText, own);
    if (rule && (await addLesson(env, uid, rule, "تصحیح دستی پست #" + old.id))) { await lessonNote(env, uid, `📌 <b>درس تازه</b> (از تصحیح دستی پست #${old.id})\n${esc(rule)}`); return rule; }
  } catch { /* learning is best effort */ }
  return "";
}

// ------------------------------------------------------------------ callbacks
export async function onCallback(c: Ctx, u: UserRow, q: TgCallback, act: string, arg: string): Promise<void> {
  const { env } = c, id = Number(arg);
  await tg.answer(env, q.id);
  if (act === "open" || act === "back") return open(c, u, id);
  const p = await getPost(env, id);
  if (!p || p.user_id !== u.id) return void (await tg.send(env, u.id, "این پست پیدا نشد."));
  if (!ACTIVE.has(p.status)) return open(c, u, id);
  switch (act) {
    case "err": await setSession(env, u.id, "pm_err", { id }); return void (await tg.send(env, u.id, "🚩 لطفاً خطا را بنویسید (مثلاً: «آخر متن آیدی کانال دیگری مانده» یا «تاریخ اشتباه است»).\nاز روی آن یک قانون یاد می‌گیرم تا تکرار نشود و اگر بشود درستش می‌کنم.", ikb([back(id)])));
    case "fix": await setSession(env, u.id, "pm_fix", { id }); return void (await tg.send(env, u.id, "✏️ متن و/یا عکس و ویدیوی جدید را بفرستید تا جایگزین شود.\n• فقط متن ← رسانه‌ی قبلی می‌ماند\n• فقط عکس/ویدیو ← متن قبلی می‌ماند\n• هر دو (عکس/ویدیو با کپشن) ← هر دو عوض می‌شود", ikb([back(id)])));
    case "time": await setSession(env, u.id, "pm_time", { id }); return void (await tg.send(env, u.id, `⏰ زمان تازه‌ی ارسال پست #${id} را بنویسید.\nمثال: «امروز 21:30»، «فردا 09:00»، «+2 ساعت»، «+30 دقیقه» یا «1405/09/01 20:30»\nزمان فعلی: ${fmtDt(p.run_at)}\nبرای «همین الان» بنویسید: الان`, ikb([back(id)])));
    case "media": await setSession(env, u.id, "pm_media", { id }); return void (await tg.send(env, u.id, "🖼 عکس یا ویدیو را بفرستید. پیام قبلی پاک می‌شود و پست جدید (با همان متن و این رسانه) بارگذاری می‌شود.", ikb([back(id)])));
    case "del": return void (await tg.send(env, u.id, `🗑 پست #${id} حذف شود؟${p.status === "sent" ? "\n(از گروه پاک می‌شود؛ حذف از ایتا بستگی به پشتیبانی ایتایار دارد)" : ""}`, ikb([[["✅ بله، حذف کن", `pm:dy:${id}`], ["↩️ برگشت", `pm:back:${id}`]]])));
    case "dy": {
      const r = await removePost(env, p, "deleted");
      await setVerdict(env, id, u.id, "deleted");
      return void (await tg.send(env, u.id, `🗑 پست #${id} حذف شد.${r.eitaa === "removed" ? " (از ایتا هم پاک شد)" : ""}${await eitaaNote(env, p, r)}`));
    }
    case "force": {
      const media = (await getPub(env, id))?.verdict === "held_media";
      if (p.status !== "held") return void (await tg.send(env, u.id, "این پست در حال حاضر نگه‌داشته نشده است."));
      if (media && p.kind === "file") {
        if (!p.text.trim()) return void (await tg.send(env, u.id, "این پست متنی ندارد؛ از «🖼 افزودن عکس/ویدیو» یا «✏️ تصحیح» استفاده کنید."));
        await env.DB.prepare("UPDATE ea_posts SET kind='text', file_id='', src_url='', file_name='' WHERE id=?").bind(id).run();
      }
      await setVerdict(env, id, u.id, "forced");
      await env.DB.prepare("UPDATE ea_posts SET status='pending', run_at=?, error='' WHERE id=?").bind(now(), id).run();
      return void (await tg.send(env, u.id, `🚀 پست #${id} ${media ? "فقط با متن " : ""}در صف ارسال قرار گرفت (تا یک دقیقه‌ی دیگر).`));
    }
  }
}

// ------------------------------------------------------------------ text/media answers
export async function onMessage(c: Ctx, u: UserRow, state: string, d: Record<string, any>, m: TgMessage): Promise<void> {
  const { env } = c, id = Number(d.id);
  const p = await getPost(env, id);
  if (!p || p.user_id !== u.id || !ACTIVE.has(p.status)) { await clearSession(env, u.id); return void (await tg.send(env, u.id, "این پست دیگر قابل تغییر نیست.")); }
  const text = (m.text || "").trim();

  if (state === "pm_time") {
    if (p.status === "sent" || p.status === "sending") { await clearSession(env, u.id); return void (await tg.send(env, u.id, "این پست قبلاً ارسال شده؛ زمانش قابل تغییر نیست.")); }
    const asPlus = normDigits(text).replace(/^(\d+) ?(ساعت|دقیقه) دیگر$/, "+$1 $2");
    const t = /^(الان|همین الان|فوری)$/.test(text) ? now() : parseWhen(asPlus);
    if (!t) return void (await tg.send(env, u.id, "زمان را نفهمیدم 😕 مثلاً بنویسید «فردا 09:00»، «+2 ساعت» یا «1405/09/01 20:30».", ikb([back(id)])));
    if (t < now() - 60) return void (await tg.send(env, u.id, "این زمان گذشته است؛ زمان آینده بنویسید یا «الان».", ikb([back(id)])));
    await clearSession(env, u.id);
    if (p.status === "held") {                                                  // the supervisor's hold stays: only the planned time changes
      await env.DB.prepare("UPDATE ea_posts SET run_at=? WHERE id=?").bind(t, id).run();
      return void (await tg.send(env, u.id, `⏰ زمان ارسال پست #${id} شد ${fmtDt(t)}.\nولی پست هنوز «نگه‌داشته» است؛ برای ارسال، از دکمه‌ی «ارسال با همین وضعیت» یا «تصحیح» استفاده کنید.`));
    }
    await env.DB.prepare("UPDATE ea_posts SET status='pending', run_at=?, error='' WHERE id=?").bind(t, id).run();
    return void (await tg.send(env, u.id, `⏰ پست #${id} برای ${fmtDt(t)} زمان‌بندی شد.`));
  }

  if (state === "pm_err") {
    if (!text) return void (await tg.send(env, u.id, "خطا را با متن بنویسید.", ikb([back(id)])));
    await clearSession(env, u.id);
    const wait = await tg.send(env, u.id, "🔎 در حال بررسی خطا…");
    const own = (await env.DB.prepare("SELECT footer FROM agent_jobs WHERE id=?").bind(p.job_id || 0).first<{ footer: string }>())?.footer || "";
    let lesson = "", fixed: string | null = null, why = "";
    try {
      const r = await learnFromError(env, u.id, p.text, text, p.kind === "file", own);
      lesson = r.rule; fixed = r.fixed; why = r.why;
    } catch { lesson = `از این خطا جلوگیری کن: ${text.slice(0, 200)}`; why = "مدل هوش مصنوعی الان در دسترس نبود؛ خطا فقط ثبت شد."; }
    const learned = lesson ? await addLesson(env, u.id, lesson, text) : false;
    if (learned) await lessonNote(env, u.id, `📌 <b>درس تازه</b> (از گزارش پست #${id})\n${esc(lesson)}`);
    await enqueue(env, u.id, "reported_error", { id, error: text.slice(0, 300), lesson, fixed: !!fixed }).catch(() => null);
    await report(env, u.id, `🚩 <b>گزارش خطا</b> · پست #${id}\n${esc(text.slice(0, 300))}${lesson ? `\n\n🧠 یاد گرفتم: ${esc(lesson)}` : ""}`);
    if (fixed && (p.kind === "text" || fixed.length <= MAX_CAPTION)) {
      const r = await replacePost(env, p, { text: fixed, keepJob: true });
      const msg = `✅ خطا اصلاح شد و پست جدید #${r.id} ساخته شد.\nاول در گروه، بعد از بررسی ناظر در ایتا منتشر می‌شود (تا یک دقیقه).${lesson ? `\n\n🧠 یاد گرفتم: ${esc(lesson)}` : ""}${r.note}`;
      if (wait) await tg.edit(env, u.id, wait, msg); else await tg.send(env, u.id, msg);
      return;
    }
    const msg = `😕 نتوانستم خودکار درستش کنم${why ? `: ${esc(why)}` : "."}\nپست جدیدی ارسال نشد و پست قبلی دست‌نخورده ماند.${lesson ? `\n\n🧠 ولی یاد گرفتم: ${esc(lesson)}` : ""}\n\nخودتان تصمیم بگیرید 👇`;
    const kb = ikb([[["✏️ تصحیح", `pm:fix:${id}`], ["🖼 افزودن عکس/ویدیو", `pm:media:${id}`]], [["🗑 حذف پیام", `pm:del:${id}`]]]);
    if (wait) await tg.edit(env, u.id, wait, msg, kb); else await tg.send(env, u.id, msg, kb);
    return;
  }

  const r = extract(m);
  if ("error" in r) return void (await tg.send(env, u.id, "❌ " + r.error, ikb([back(id)])));
  let patch: Patch;
  if (state === "pm_fix") {
    if (r.kind === "text") patch = { text: r.text };                                                       // media stays
    else patch = { kind: "file", file_id: r.file_id, file_name: r.file_name, src_url: "", text: r.text || p.text };
  } else {
    if (r.kind === "text") return void (await tg.send(env, u.id, "یک عکس یا ویدیو بفرستید (نه متن).", ikb([back(id)])));
    patch = { kind: "file", file_id: r.file_id, file_name: r.file_name, src_url: "", text: p.text };
  }
  const finalKind = patch.kind || p.kind, finalText = patch.text ?? p.text;
  if (finalKind === "file" && finalText.length > MAX_CAPTION) return void (await tg.send(env, u.id, `❌ متن همراه عکس/ویدیو حداکثر ${MAX_CAPTION} نویسه است (الان ${finalText.length}). متن کوتاه‌تری بفرستید.`, ikb([back(id)])));
  if (!finalText.trim() && finalKind === "text") return void (await tg.send(env, u.id, "متن خالی است.", ikb([back(id)])));
  await clearSession(env, u.id);
  const res = await replacePost(env, p, patch);
  const learned = state === "pm_fix" && patch.text !== undefined && patch.text.trim() !== p.text.trim() ? await learnFromFix(env, u.id, p, patch.text) : "";
  await tg.send(env, u.id, `♻️ پیام قبلی کنار رفت و پست جدید #${res.id} ساخته شد.\nاول در گروه، بعد از بررسی ناظر در ایتا منتشر می‌شود (تا یک دقیقه).${learned ? `\n\n🧠 از تصحیح شما یاد گرفتم: ${esc(learned)}` : ""}${res.note}`);
}

// ------------------------------------------------------------------ group + supervisor + assistant settings screen
const GUIDE = "<b>📖 اتصال گروه</b>\n\n1️⃣ یک گروه تلگرام بسازید و در تنظیمات آن «Topics» (تاپیک) را روشن کنید.\n2️⃣ همین ربات را عضو گروه و <b>ادمین</b> کنید («مدیریت تاپیک‌ها» و «حذف پیام‌ها» لازم است).\n3️⃣ داخل گروه بفرستید: <code>/eagroup</code>\n\nتاپیک‌های «مطالب»، «گزارشات»، «چت با ایجنت»، «آموخته‌ها» و «شورا» ساخته می‌شود.\n\n🛡 <b>ربات ناظر</b> و 🧭 <b>ربات دستیار</b> (اختیاری): در BotFather دو ربات جدید بسازید، توکن هرکدام را از دکمه‌ی «ثبت …» بدهید و هر دو را در گروه ادمین کنید. در تاپیک «شورا» با نام خودشان با هم گفتگو می‌کنند. (بدون آن‌ها، همین ربات با برچسب نقششان می‌نویسد.)\n\n🌐 <b>سایت شخصی</b>: دکمه‌ی «🌐 سایت من» یک لینک مخصوص شما می‌دهد؛ همه‌ی کارها از آنجا هم شدنی است.";
const ROLES = { sup: { fa: "ناظر", icon: "🛡" }, asst: { fa: "دستیار", icon: "🧭" } } as const;

export async function home(env: Env, u: UserRow): Promise<void> {
  const g = await getGroup(env, u.id);
  const bot = async (r: Role) => ({ has: !!(await roleToken(env, u.id, r)), name: await kvGet(env, `${r}name:${u.id}`) });
  const sup = await bot("sup"), asst = await bot("asst");
  const n = (await env.DB.prepare("SELECT COUNT(*) n FROM ea_lessons WHERE user_id=?").bind(u.id).first<{ n: number }>())?.n || 0;
  const asks = (await env.DB.prepare("SELECT COUNT(*) n FROM ea_asks WHERE user_id=? AND status='open'").bind(u.id).first<{ n: number }>())?.n || 0;
  const line = (r: Role, b: { has: boolean; name: string | null }) => `${ROLES[r].icon} ${ROLES[r].fa}: ${b.has ? "✅" + (b.name ? " @" + esc(b.name) : "") : "ربات جدا ندارد (همین ربات می‌نویسد)"}`;
  const t = `<b>👥 گروه، ناظر و دستیار</b>\n\n👥 گروه: ${g ? `✅ ${esc(g.title || g.chat)}${g.forum ? " · تاپیک‌ها " + (g.topics.council && g.topics.all ? "✅" : "⚠️ برای ساخت تاپیک‌های ناقص، «🩺 بررسی و تعمیر» را بزنید") : " · بدون تاپیک"}` : "❌ متصل نیست"}\n` +
    `🛡 بررسی ناظر پیش از ایتا: ${g ? (g.review ? "روشن" : "خاموش") : "—"}\n${line("sup", sup)}\n${line("asst", asst)}\n🧠 آموخته‌ها: ${n}${asks ? `\n❓ سؤال بی‌پاسخ: ${asks}` : ""}`;
  const rows: Btn[][] = [[["🌐 سایت من", "gp:site"], ["📖 راهنما", "gp:help"]], [["🧠 آموخته‌ها", "gp:les"], ["🤝 جلسه‌ی شورا", "gp:run"]], [["🩺 بررسی و تعمیر", "gp:doc"], ["📚 همگام‌سازی تمام پست‌ها", "gp:all"]], ...(adminIds(env).includes(u.id) ? [[["☁️ حساب‌های کلودفلر (هوش مصنوعی)", "cf:home:0"] as Btn]] : [])];
  if (g) rows.push([[g.review ? "🛡 خاموش‌کردن بررسی" : "🛡 روشن‌کردن بررسی", "gp:rev"], ["🔌 قطع گروه", "gp:off"]]);
  rows.push([[sup.has ? "🔑 تغییر ناظر" : "🔑 ثبت ربات ناظر", "gp:sup"], [asst.has ? "🔑 تغییر دستیار" : "🔑 ثبت ربات دستیار", "gp:asst"]]);
  const del: Btn[] = []; if (sup.has) del.push(["🗑 حذف ناظر", "gp:supdel"]); if (asst.has) del.push(["🗑 حذف دستیار", "gp:asstdel"]); if (del.length) rows.push(del);
  await tg.send(env, u.id, t, ikb(rows));
}
const lessonKb = (id: number) => ikb([[["✏️ ویرایش", `gp:le:${id}`], ["🗑 فراموش کن", `gp:ld:${id}`]]]);

export async function onGroupCallback(c: Ctx, u: UserRow, q: TgCallback, act: string, arg: string): Promise<void> {
  const { env } = c;
  await tg.answer(env, q.id);
  const g = await getGroup(env, u.id);
  switch (act) {
    case "help": return void (await tg.send(env, u.id, GUIDE));
    case "site": return void (await tg.send(env, u.id, await siteLink(env, u.id)));
    case "run": await enqueue(env, u.id, "manual", {}); return void (await tg.send(env, u.id, "🤝 جلسه‌ی شورا درخواست شد؛ تا یک دقیقه‌ی دیگر در تاپیک «شورا» شروع می‌شود."));
    case "doc": await tg.send(env, u.id, "🩺 در حال بررسی…"); return void (await tg.send(env, u.id, await doctorNow(env, u.id)));
    case "all": { if (!g) return void (await tg.send(env, u.id, "ابتدا گروه را متصل کنید.")); const n = await syncAll(env, u.id, 6); return void (await tg.send(env, u.id, `📚 ${n ? n + " پست به تاپیک «تمام پست‌ها» رفت/به‌روز شد؛ بقیه خودکار در دقیقه‌های بعد می‌رسند." : "همه‌ی پست‌ها در تاپیک «تمام پست‌ها» به‌روز است."}`)); }
    case "rev": if (g) { g.review = !g.review; await saveGroup(env, u.id, g); } return home(env, u);
    case "off": await dropGroup(env, u.id); return void (await tg.send(env, u.id, "🔌 گروه قطع شد؛ پست‌ها مستقیم به ایتا می‌روند."));
    case "sup": case "asst": await setSession(env, u.id, "gp_bot", { role: act }); return void (await tg.send(env, u.id, `🔑 توکن ربات ${ROLES[act].fa} را بفرستید (از BotFather).\n🧹 پیام شما بعد از خواندن پاک می‌شود. لغو: /cancel`));
    case "supdel": case "asstdel": await clearRoleBot(env, u.id, act === "supdel" ? "sup" : "asst"); return home(env, u);
    case "les": {
      const rows = (await env.DB.prepare("SELECT id, rule FROM ea_lessons WHERE user_id=? ORDER BY id DESC LIMIT 20").bind(u.id).all<{ id: number; rule: string }>()).results;
      await tg.send(env, u.id, `🧠 <b>آموخته‌ها</b> (${rows.length})\nهر قانون را می‌توانید ویرایش یا حذف کنید.`, ikb([[["➕ افزودن قانون", "gp:ln"]]]));
      for (const r of rows) await tg.send(env, u.id, `🧠 ${esc(r.rule)}`, lessonKb(r.id));
      return;
    }
    case "ln": await setSession(env, u.id, "gp_led", { id: 0 }); return void (await tg.send(env, u.id, "➕ متن قانون جدید را بنویسید (کوتاه و کلی، مثلاً «آخر متن، آیدی کانال دیگر نگذار»).\nلغو: /cancel"));
    case "le": {
      const r = await env.DB.prepare("SELECT rule FROM ea_lessons WHERE id=? AND user_id=?").bind(Number(arg), u.id).first<{ rule: string }>();
      if (!r) return void (await tg.send(env, u.id, "این قانون پیدا نشد."));
      await setSession(env, u.id, "gp_led", { id: Number(arg) });
      return void (await tg.send(env, u.id, `✏️ متن فعلی:\n<i>${esc(r.rule)}</i>\n\nمتن جدید را بنویسید.\nلغو: /cancel`));
    }
    case "ld": await env.DB.prepare("DELETE FROM ea_lessons WHERE id=? AND user_id=?").bind(Number(arg), u.id).run(); if (q.message) await tg.edit(env, u.id, q.message.message_id, "🗑 فراموش شد."); return;
  }
}
export async function gotLesson(c: Ctx, u: UserRow, d: Record<string, any>, text: string): Promise<void> {
  const { env } = c, rule = text.replace(/\s+/g, " ").trim().slice(0, 300);
  if (rule.length < 6) return void (await tg.send(env, u.id, "قانون خیلی کوتاه است؛ کمی واضح‌تر بنویسید."));
  await clearSession(env, u.id);
  if (d.id) { await env.DB.prepare("UPDATE ea_lessons SET rule=? WHERE id=? AND user_id=?").bind(rule, Number(d.id), u.id).run(); return void (await tg.send(env, u.id, "✅ قانون به‌روز شد.", lessonKb(Number(d.id)))); }
  await addLesson(env, u.id, rule, "owner");
  await tg.send(env, u.id, "✅ قانون اضافه شد؛ از این به بعد ایجنت و ناظر رعایتش می‌کنند.");
}
export async function gotBotToken(c: Ctx, u: UserRow, m: TgMessage, text: string, role: Role): Promise<void> {
  const { env } = c;
  await tg.del(env, u.id, m.message_id);
  const token = text.trim();
  if (!/^\d{6,}:[A-Za-z0-9_-]{20,}$/.test(token)) return void (await tg.send(env, u.id, "❌ قالب توکن درست نیست (مثل 123456:ABC…). دوباره بفرستید یا /cancel."));
  const r = await setRoleBot(env, u.id, role, token);
  if (!r.ok) return void (await tg.send(env, u.id, `❌ تلگرام توکن را نپذیرفت: ${esc(r.error)}`));
  await clearSession(env, u.id);
  await tg.send(env, u.id, `✅ ربات ${ROLES[role].fa} ثبت شد: @${esc(r.name)}${r.inGroup === false ? "\n⚠️ هنوز در گروه نیست؛ آن را به گروه اضافه و ادمین کنید (تا آن موقع همین ربات به نام او می‌نویسد)." : r.inGroup ? "\n✅ در گروه عضو است." : "\nبعد از اتصال گروه، آن را در گروه ادمین کنید."}`);
}

// ------------------------------------------------------------------ the agents' questions to the owner
export async function onAskCallback(c: Ctx, u: UserRow, q: TgCallback, act: string, arg: string): Promise<void> {
  const { env } = c, id = Number(arg);
  await tg.answer(env, q.id);
  if (act === "skip") { await env.DB.prepare("UPDATE ea_asks SET status='skipped' WHERE id=? AND user_id=? AND status='open'").bind(id, u.id).run(); return void (await tg.send(env, u.id, "⏭ نادیده گرفته شد.")); }
  const a = await env.DB.prepare("SELECT question FROM ea_asks WHERE id=? AND user_id=? AND status='open'").bind(id, u.id).first<{ question: string }>();
  if (!a) return void (await tg.send(env, u.id, "این سؤال دیگر باز نیست."));
  await setSession(env, u.id, "as_ans", { id });
  await tg.send(env, u.id, `💬 پاسختان را بنویسید:\n\n<i>${esc(a.question)}</i>\n\nلغو: /cancel`);
}
export async function gotAnswer(c: Ctx, u: UserRow, d: Record<string, any>, text: string): Promise<void> {
  await clearSession(c.env, u.id);
  const ok = await answerAsk(c.env, u.id, Number(d.id), text);
  await tg.send(c.env, u.id, ok ? "✅ پاسخ شما به شورا رسید؛ ناظر و دستیار تا یک دقیقه‌ی دیگر روی آن کار می‌کنند." : "این سؤال دیگر باز نیست.");
}
