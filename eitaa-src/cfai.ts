// Extra Cloudflare accounts for Workers AI. The free plan allows ~10,000 neurons a day per account; when the Worker's own binding hits its limit,
// the agents keep working through the REST API of the accounts added here (token + account id, stored encrypted). Owner-only.
import { dec, enc } from "./crypto";
import { UserRow, clearSession, setSession } from "./db";
import { Env } from "./env";
import { MODELS } from "./providers";
import * as tg from "./tg";
import { Btn, TgCallback, TgMessage, ikb } from "./tg";
import { esc } from "./util";

export interface CfAcc { id: string; token: string }           // token decrypted
type Stored = { id: string; t: string }[];
const KEY = "ea_cfacc", MAX = 3, API = "https://api.cloudflare.com/client/v4";
let cache: { at: number; list: CfAcc[] } | null = null;

async function raw(env: Env): Promise<Stored> {
  const r = await env.DB.prepare("SELECT value FROM settings WHERE key=?").bind(KEY).first<{ value: string }>().catch(() => null);
  try { const j = JSON.parse(r?.value || "[]"); return Array.isArray(j) ? j : []; } catch { return []; }
}
async function put(env: Env, list: Stored): Promise<void> {
  await env.DB.prepare("INSERT INTO settings(key,value) VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value").bind(KEY, JSON.stringify(list)).run();
  cache = null;
}
/** Usable accounts (decrypted), cached for a minute. */
export async function cfAccounts(env: Env): Promise<CfAcc[]> {
  if (cache && Date.now() - cache.at < 60_000) return cache.list;
  const out: CfAcc[] = [];
  for (const s of await raw(env)) { const token = await dec(env.SECRET_KEY, s.t); if (token) out.push({ id: s.id, token }); }
  cache = { at: Date.now(), list: out };
  return out;
}
export const cfBase = (acc: string) => `${API}/accounts/${acc}/ai/v1`;

const cf = async (token: string, path: string, init?: RequestInit): Promise<any> => {
  const r = await fetch(API + path, { ...init, headers: { authorization: `Bearer ${token}`, "content-type": "application/json" } });
  return { status: r.status, j: await r.json().catch(() => ({})) as any };
};
const mask = (id: string) => `${id.slice(0, 4)}…${id.slice(-4)}`;

/** Checks the token and a one-word model call. ok=true even when the daily quota of that account is already used up (the token itself is fine). */
export async function testAccount(token: string, acc: string): Promise<{ ok: boolean; note: string }> {
  const r = await fetch(`${cfBase(acc)}/chat/completions`, { method: "POST", headers: { authorization: `Bearer ${token}`, "content-type": "application/json" }, body: JSON.stringify({ model: MODELS[0].model, max_tokens: 5, messages: [{ role: "user", content: "say ok" }] }) });
  if (r.ok) return { ok: true, note: "" };
  const j: any = await r.json().catch(() => ({}));
  const msg = String(j?.errors?.[0]?.message || j?.error?.message || `HTTP ${r.status}`).slice(0, 160);
  if (r.status === 429 || /neurons|allocation|quota|limit/i.test(msg)) return { ok: true, note: "سهمیه‌ی امروز این حساب پر است، ولی توکن درست است" };
  if (r.status === 401 || r.status === 403) return { ok: false, note: "توکن معتبر نیست یا دسترسی «Workers AI» ندارد (" + msg + ")" };
  if (r.status === 404 || /account/i.test(msg)) return { ok: false, note: "شناسه‌ی حساب (Account ID) درست نیست (" + msg + ")" };
  return { ok: false, note: msg };
}

export async function home(env: Env, uid: number): Promise<void> {
  const list = await raw(env);
  const rows: Btn[][] = list.map((a) => [[`🧪 ${mask(a.id)}`, `cf:t:${a.id}`], ["🗑 حذف", `cf:d:${a.id}`]] as Btn[]);
  if (list.length < MAX) rows.push([["➕ افزودن حساب کلودفلر", "cf:add:0"]]);
  await tg.send(env, uid, `<b>☁️ حساب‌های کلودفلر برای هوش مصنوعی</b>\n\nوقتی سهمیه‌ی رایگان Workers AI همین Worker تمام شود، ربات خودکار از حساب‌های اینجا استفاده می‌کند تا کارها نایستد.\n${list.length ? "\nحساب‌ها:\n" + list.map((a) => "• " + mask(a.id)).join("\n") : "\nهنوز حسابی اضافه نشده."}\n\n🔐 توکن‌ها رمزنگاری‌شده ذخیره می‌شوند.`, ikb(rows));
}

export async function onCallback(env: Env, u: UserRow, q: TgCallback, act: string, arg: string): Promise<void> {
  await tg.answer(env, q.id);
  if (act === "home") return home(env, u.id);
  if (act === "add") {
    if ((await raw(env)).length >= MAX) return void (await tg.send(env, u.id, `حداکثر ${MAX} حساب.`));
    await setSession(env, u.id, "cf_tok", {});
    return void (await tg.send(env, u.id, "🔑 <b>توکن API کلودفلر</b> را بفرستید.\n\nساخت: dash.cloudflare.com ← My Profile ← API Tokens ← Create Token ← قالب <b>«Workers AI»</b> (یا Custom با Account · Workers AI · Read).\nدسترسی «Account Settings: Read» هم بدهید تا شناسه‌ی حساب خودکار پیدا شود.\n\n🧹 پیام شما بعد از خواندن پاک می‌شود. لغو: /cancel"));
  }
  const list = await raw(env);
  if (act === "d") { await put(env, list.filter((a) => a.id !== arg)); return void (await tg.send(env, u.id, "🗑 حذف شد.")); }
  if (act === "t") {
    const a = list.find((x) => x.id === arg); if (!a) return;
    const r = await testAccount(await dec(env.SECRET_KEY, a.t), a.id);
    return void (await tg.send(env, u.id, r.ok ? `✅ حساب ${mask(a.id)} کار می‌کند.${r.note ? "\n" + esc(r.note) : ""}` : `❌ ${esc(r.note)}`));
  }
}

async function save(env: Env, u: UserRow, token: string, acc: string): Promise<void> {
  const t = await testAccount(token, acc);
  if (!t.ok) { await setSession(env, u.id, "cf_acc", { t: await enc(env.SECRET_KEY, token) }); return void (await tg.send(env, u.id, `❌ ${esc(t.note)}\n\nشناسه‌ی حساب (Account ID) را درست بفرستید (در داشبورد کلودفلر، سمت راست صفحه‌ی Workers & Pages). لغو: /cancel`)); }
  const list = (await raw(env)).filter((a) => a.id !== acc);
  list.push({ id: acc, t: await enc(env.SECRET_KEY, token) });
  await put(env, list.slice(-MAX));
  await clearSession(env, u.id);
  await tg.send(env, u.id, `✅ حساب ${mask(acc)} اضافه شد.${t.note ? "\n" + esc(t.note) : ""}\nاز این پس اگر سهمیه‌ی Worker پر شود، از این حساب استفاده می‌شود.`);
}

export async function onMessage(env: Env, u: UserRow, state: string, d: Record<string, any>, m: TgMessage): Promise<void> {
  const text = (m.text || "").trim();
  if (state === "cf_tok") {
    await tg.del(env, u.id, m.message_id);
    if (!/^[A-Za-z0-9_-]{30,80}$/.test(text)) return void (await tg.send(env, u.id, "قالب توکن درست نیست؛ دوباره بفرستید یا /cancel."));
    const v = await cf(text, "/user/tokens/verify");
    if (v.status !== 200 || v.j?.result?.status !== "active") return void (await tg.send(env, u.id, "❌ کلودفلر این توکن را نپذیرفت (غیرفعال یا اشتباه). دوباره بفرستید یا /cancel."));
    const a = await cf(text, "/accounts");
    const ids: string[] = a.status === 200 ? (a.j?.result || []).map((x: any) => String(x.id)) : [];
    if (ids.length === 1) return save(env, u, text, ids[0]);
    await setSession(env, u.id, "cf_acc", { t: await enc(env.SECRET_KEY, text) });
    return void (await tg.send(env, u.id, `✅ توکن معتبر است. ${ids.length > 1 ? "چند حساب دارد؛ " : "شناسه‌ی حساب خودکار پیدا نشد؛ "}<b>Account ID</b> (۳۲ حرف) را بفرستید.\nلغو: /cancel`));
  }
  if (state === "cf_acc") {
    await tg.del(env, u.id, m.message_id);
    if (!/^[0-9a-f]{32}$/i.test(text)) return void (await tg.send(env, u.id, "Account ID باید ۳۲ حرف (۰-۹ و a-f) باشد. دوباره بفرستید یا /cancel."));
    const token = await dec(env.SECRET_KEY, String(d.t || ""));
    if (!token) { await clearSession(env, u.id); return void (await tg.send(env, u.id, "نشست منقضی شد؛ از اول شروع کنید.")); }
    return save(env, u, token, text.toLowerCase());
  }
}
