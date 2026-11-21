// Entry points used by the AI bot (src/index.js). Eitaa features live here: channels, scheduled posts, agents, live chat.
import { handleUpdate } from "./bot";
import * as chat from "./chat";
import { getSession, setSession, touchUser, userChannels } from "./db";
import { dropGroup, getGroup, groupOwner, kvGet, kvSet, setupGroup } from "./group";
import * as tg from "./tg";
import { Env } from "./env";
import { tick } from "./scheduler";
import { processCouncil, ownerSpoke } from "./council";
import { syncAllUsers } from "./allposts";
import { doctorTick } from "./doctor";
import { syncMirrors } from "./mirror";
import * as web from "./web";
import { TgUpdate } from "./tg";
import { SCHEMA } from "./schema";

export { SCHEMA };
export { parseMessages } from "./source";
export { resolvePost, wantedCounts } from "./agent";
export { cleanArgs } from "./llm";
export { cleanText } from "./source";
export type HostEnv = Record<string, any>;

/** Adapter: the AI bot's env (TELEGRAM_TOKEN, OWNER_ID, WEBHOOK_SECRET…) -> this module's env. */
export function adapt(host: HostEnv, access: boolean): Env {
  return {
    ...host,
    BOT_TOKEN: host.TELEGRAM_TOKEN,
    SECRET_KEY: host.EITAA_SECRET_KEY || `ea:${host.WEBHOOK_SECRET || host.TELEGRAM_TOKEN}`,
    WEBHOOK_SECRET: host.WEBHOOK_SECRET || "",
    ADMIN_IDS: String(host.OWNER_ID || ""),
    EA_ACCESS: access,
    EA_MODEL: host.MODEL || "@cf/google/gemma-4-26b-a4b-it",
  } as Env;
}

export async function ensureSchema(host: HostEnv): Promise<void> {
  await host.DB.batch(SCHEMA.map((s) => host.DB.prepare(s)));
}

export async function handle(host: HostEnv, access: boolean, update: TgUpdate, wait: (p: Promise<unknown>) => void): Promise<void> {
  await handleUpdate({ env: adapt(host, access), wait }, update);
}

export async function cron(host: HostEnv): Promise<void> {
  await tick(adapt(host, true));
  try { await syncAllUsers(adapt(host, true)); } catch (e) { console.error("allposts failed", (e as Error).message); }
  try { await syncMirrors(adapt(host, true)); } catch (e) { console.error("mirror failed", (e as Error).message); }
  try { await doctorTick(adapt(host, true)); } catch (e) { console.error("doctor failed", (e as Error).message); }
  try { await processCouncil(adapt(host, true)); } catch (e) { console.error("council tick failed", (e as Error).message); }
}

export const webPage = () => web.appPage();
export async function webApi(host: HostEnv, request: Request, path: string): Promise<Response> { return web.api(adapt(host, true), request, path); }

/**
 * Messages from groups/supergroups. Returns true when the module consumed the update:
 *  - `/eagroup` (register this group for posts + topics) and `/eaoff`, sent by a user who has Eitaa access;
 *  - in a registered group: the owner's messages in the "چت با ایجنت" topic go to the live agent; everything else is ignored (the AI bot stays quiet there).
 */
export async function handleGroup(host: HostEnv, update: TgUpdate, wait: (p: Promise<unknown>) => void, hasAccess: (uid: number) => Promise<boolean>): Promise<boolean> {
  const m = update.message;
  if (!m || !m.from || m.chat.type === "private") return false;
  const env = adapt(host, true), text = (m.text || "").trim();
  const say = (t: string) => tg.tg(env, "sendMessage", { chat_id: m.chat.id, text: t, parse_mode: "HTML", disable_web_page_preview: true, ...(m.message_thread_id ? { message_thread_id: m.message_thread_id } : {}) }).catch(() => null);
  const cmd = /^\/(eagroup|eaoff)(?:@\w+)?(?:\s|$)/i.exec(text);
  if (cmd) {
    if (!(await hasAccess(m.from.id))) return true;
    await touchUser(env, m.from.id, m.from.first_name || "", m.from.username || "");
    if (cmd[1].toLowerCase() === "eaoff") {
      const g = await getGroup(env, m.from.id);
      if (g && g.chat === String(m.chat.id)) { await dropGroup(env, m.from.id); await say("🔌 این گروه دیگر گروه پست‌ها نیست."); }
      return true;
    }
    await say(await setupGroup(env, m.from.id, m.chat.id, m.chat.title || ""));
    return true;
  }
  const owner = await groupOwner(env, m.chat.id);
  if (owner === null) return false;
  const g = await getGroup(env, owner);
  if (!g || m.from.id !== owner || !text || text.startsWith("/") || !(g.topics.chat || g.topics.council) || ![g.topics.chat, g.topics.council].includes(m.message_thread_id)) return true;
  const last = Number((await kvGet(env, `gmlast:${m.chat.id}`)) || 0);
  if (m.message_id <= last) return true;                                       // Telegram re-delivery
  await kvSet(env, `gmlast:${m.chat.id}`, String(m.message_id));
  if (g.topics.council && m.message_thread_id === g.topics.council) { await ownerSpoke(env, owner, text); return true; }   // the owner talks to the council
  const user = await touchUser(env, owner, m.from.first_name || "", m.from.username || "");
  if (!user.eitaa_token_enc || !(await userChannels(env, owner)).length) { await say("ابتدا در ربات توکن ایتایار را ثبت و یک کانال اضافه کنید."); return true; }
  const before = await getSession(env, owner);
  const renv = { ...env, EA_REDIRECT: { from: owner, chat: m.chat.id, thread: m.message_thread_id || 0 } };
  try { await chat.turn({ env: renv, wait }, user, m, text, {}); }
  finally { await setSession(env, owner, before.state, before.data); }         // the private session is not touched by a group chat
  return true;
}
export { explainError } from "./eitaa";
export { chatJson } from "./llm";
