// eitaa-src/util.ts
var TEHRAN_OFFSET_S = 3.5 * 3600;
var esc = (s) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
function normDigits(s) {
  return s.replace(/[۰-۹]/g, (d) => String(d.charCodeAt(0) - 1776)).replace(/[٠-٩]/g, (d) => String(d.charCodeAt(0) - 1632));
}
var BREAKS = [-61, 9, 38, 199, 426, 686, 756, 818, 1111, 1181, 1210, 1635, 2060, 2097, 2192, 2262, 2324, 2394, 2456, 3178];
var div = (a, b) => ~~(a / b);
var mod = (a, b) => a - ~~(a / b) * b;
function jalCal(jy) {
  const bl = BREAKS.length, gy = jy + 621;
  let leapJ = -14, jp = BREAKS[0], jm, jump = 0;
  for (let i = 1; i < bl; i += 1) {
    jm = BREAKS[i];
    jump = jm - jp;
    if (jy < jm) break;
    leapJ = leapJ + div(jump, 33) * 8 + div(mod(jump, 33), 4);
    jp = jm;
  }
  let n = jy - jp;
  leapJ = leapJ + div(n, 33) * 8 + div(mod(n, 33) + 3, 4);
  if (mod(jump, 33) === 4 && jump - n === 4) leapJ += 1;
  const leapG = div(gy, 4) - div((div(gy, 100) + 1) * 3, 4) - 150;
  const march = 20 + leapJ - leapG;
  if (jump - n < 6) n = n - jump + div(jump + 4, 33) * 33;
  let leap = mod(mod(n + 1, 33) - 1, 4);
  if (leap === -1) leap = 4;
  return { leap, gy, march };
}
function g2d(gy, gm, gd) {
  let d = div((gy + div(gm - 8, 6) + 100100) * 1461, 4) + div(153 * mod(gm + 9, 12) + 2, 5) + gd - 34840408;
  d = d - div(div(gy + 100100 + div(gm - 8, 6), 100) * 3, 4) + 752;
  return d;
}
function d2g(jdn) {
  let j = 4 * jdn + 139361631;
  j = j + div(div(4 * jdn + 183187720, 146097) * 3, 4) * 4 - 3908;
  const i = div(mod(j, 1461), 4) * 5 + 308;
  const gd = div(mod(i, 153), 5) + 1, gm = mod(div(i, 153), 12) + 1, gy = div(j, 1461) - 100100 + div(8 - gm, 6);
  return { gy, gm, gd };
}
function j2d(jy, jm, jd) {
  const r = jalCal(jy);
  return g2d(r.gy, 3, r.march) + (jm - 1) * 31 - div(jm, 7) * (jm - 7) + jd - 1;
}
function toJalali(gy, gm, gd) {
  const jdn = g2d(gy, gm, gd);
  let jy = d2g(jdn).gy - 621;
  const r = jalCal(jy);
  const jdn1f = g2d(jy + 621, 3, r.march);
  let k = jdn - jdn1f, jm, jd;
  if (k >= 0) {
    if (k <= 185) {
      jm = 1 + div(k, 31);
      jd = mod(k, 31) + 1;
      return { jy, jm, jd };
    }
    k -= 186;
  } else {
    jy -= 1;
    k += 179;
    if (r.leap === 1) k += 1;
  }
  jm = 7 + div(k, 30);
  jd = mod(k, 30) + 1;
  return { jy, jm, jd };
}
function toGregorian(jy, jm, jd) {
  return d2g(j2d(jy, jm, jd));
}
function isValidJalali(y, m, d) {
  if (m < 1 || m > 12 || d < 1) return false;
  const g = toGregorian(y, m, d);
  const back2 = toJalali(g.gy, g.gm, g.gd);
  return back2.jy === y && back2.jm === m && back2.jd === d;
}
function toLocal(epoch) {
  const t = new Date((epoch + TEHRAN_OFFSET_S) * 1e3);
  return { y: t.getUTCFullYear(), mo: t.getUTCMonth() + 1, d: t.getUTCDate(), h: t.getUTCHours(), mi: t.getUTCMinutes() };
}
var fromLocal = (l) => Math.floor(Date.UTC(l.y, l.mo - 1, l.d, l.h, l.mi) / 1e3) - TEHRAN_OFFSET_S;
function fmtDt(epoch) {
  if (!epoch) return "-";
  const l = toLocal(epoch), j = toJalali(l.y, l.mo, l.d), p = (n) => String(n).padStart(2, "0");
  return `${j.jy}/${p(j.jm)}/${p(j.jd)} - ${p(l.h)}:${p(l.mi)}`;
}
function parseWhen(text, nowEpoch = Math.floor(Date.now() / 1e3)) {
  const t = normDigits(text).replace(/،/g, " ").replace(/\u200c/g, " ").replace(/\s+/g, " ").trim();
  let at = null;
  let m = t.match(/^\+ ?(\d{1,5}) ?(دقیقه|ساعت|m|h)?$/);
  if (m) {
    const n = parseInt(m[1], 10);
    at = nowEpoch + (m[2] === "\u0633\u0627\u0639\u062A" || m[2] === "h" ? n * 3600 : n * 60);
  } else if (m = t.match(/^(امروز|فردا|پس ?فردا)? ?(\d{1,2}):(\d{2})$/)) {
    const h = parseInt(m[2], 10), mi = parseInt(m[3], 10);
    if (h > 23 || mi > 59) return null;
    const n = toLocal(nowEpoch);
    at = fromLocal({ ...n, h, mi });
    const w = m[1];
    if (w === "\u0641\u0631\u062F\u0627") at += 86400;
    else if (w && w.startsWith("\u067E\u0633")) at += 2 * 86400;
    else if (!w && at <= nowEpoch) at += 86400;
  } else if (m = t.match(/^(\d{4})[/-](\d{1,2})[/-](\d{1,2}) (\d{1,2}):(\d{2})$/)) {
    const [y, mo, d, h, mi] = m.slice(1).map((x) => parseInt(x, 10));
    if (h > 23 || mi > 59) return null;
    let gy, gm, gd;
    if (y >= 1300 && y < 1700) {
      if (!isValidJalali(y, mo, d)) return null;
      ({ gy, gm, gd } = toGregorian(y, mo, d));
    } else {
      const probe = new Date(Date.UTC(y, mo - 1, d));
      if (probe.getUTCFullYear() !== y || probe.getUTCMonth() !== mo - 1 || probe.getUTCDate() !== d) return null;
      [gy, gm, gd] = [y, mo, d];
    }
    at = fromLocal({ y: gy, mo: gm, d: gd, h, mi });
  } else return null;
  return at < nowEpoch + 30 ? null : at;
}
function normalizeChatId(raw2) {
  const t = normDigits(raw2).trim();
  if (t.includes("joinchat")) return t;
  const m = t.match(/eitaa\.com\/([^/?\s]+)/);
  return (m ? m[1] : t).replace(/^@/, "").trim();
}
var b64 = (u) => btoa(String.fromCharCode(...u));
var unb64 = (s) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));
var JALALI_MONTHS = ["\u0641\u0631\u0648\u0631\u062F\u06CC\u0646", "\u0627\u0631\u062F\u06CC\u0628\u0647\u0634\u062A", "\u062E\u0631\u062F\u0627\u062F", "\u062A\u06CC\u0631", "\u0645\u0631\u062F\u0627\u062F", "\u0634\u0647\u0631\u06CC\u0648\u0631", "\u0645\u0647\u0631", "\u0622\u0628\u0627\u0646", "\u0622\u0630\u0631", "\u062F\u06CC", "\u0628\u0647\u0645\u0646", "\u0627\u0633\u0641\u0646\u062F"];
var WEEKDAYS = ["\u06CC\u06A9\u0634\u0646\u0628\u0647", "\u062F\u0648\u0634\u0646\u0628\u0647", "\u0633\u0647\u200C\u0634\u0646\u0628\u0647", "\u0686\u0647\u0627\u0631\u0634\u0646\u0628\u0647", "\u067E\u0646\u062C\u0634\u0646\u0628\u0647", "\u062C\u0645\u0639\u0647", "\u0634\u0646\u0628\u0647"];
var toFa = (s) => String(s).replace(/\d/g, (d) => "\u06F0\u06F1\u06F2\u06F3\u06F4\u06F5\u06F6\u06F7\u06F8\u06F9"[+d]);
var pad2 = (n) => String(n).padStart(2, "0");
function jalaliLong(epoch) {
  const l = toLocal(epoch), j = toJalali(l.y, l.mo, l.d);
  const wd = WEEKDAYS[new Date(Date.UTC(l.y, l.mo - 1, l.d)).getUTCDay()];
  return `${wd} ${toFa(j.jd)} ${JALALI_MONTHS[j.jm - 1]} ${toFa(j.jy)}`;
}
function slotKey(epoch) {
  const l = toLocal(epoch);
  return `${l.y}-${pad2(l.mo)}-${pad2(l.d)} ${pad2(l.h)}:${pad2(l.mi)}`;
}
function atTime(epoch, hhmm) {
  const [h, mi] = hhmm.split(":").map((x) => parseInt(x, 10));
  return fromLocal({ ...toLocal(epoch), h, mi });
}
function mentionsDay(text, epoch) {
  const t = normDigits(text).replace(/[‌‏‎]/g, " ").replace(/\s+/g, " ");
  const l = toLocal(epoch), j = toJalali(l.y, l.mo, l.d);
  const sep = "[/\\-.]", p = (n) => `0?${n}`;
  const num = new RegExp(`(?:^|\\D)(?:${j.jy}${sep}${p(j.jm)}${sep}${p(j.jd)}|${p(j.jd)}${sep}${p(j.jm)}${sep}${j.jy}|${l.y}${sep}${p(l.mo)}${sep}${p(l.d)}|${p(l.d)}${sep}${p(l.mo)}${sep}${l.y})(?:\\D|$)`);
  if (num.test(t)) return true;
  const name = new RegExp(`(?:^|\\D)${p(j.jd)} ?${JALALI_MONTHS[j.jm - 1]}(?:\\s|$|\\D)`);
  return name.test(t);
}
function mentionsOtherDate(text, epoch) {
  const t = normDigits(text);
  const re = /(?:^|\D)(1[34]\d{2}|20\d{2})[/\-.](\d{1,2})[/\-.](\d{1,2})(?:\D|$)/g;
  let m, any = false;
  while (m = re.exec(t)) {
    any = true;
    const probe = `${m[1]}/${m[2]}/${m[3]}`;
    if (mentionsDay(probe, epoch)) return false;
  }
  return any;
}

// eitaa-src/crypto.ts
async function key(secret) {
  const h = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(secret));
  return crypto.subtle.importKey("raw", h, "AES-GCM", false, ["encrypt", "decrypt"]);
}
async function enc(secret, plain) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = new Uint8Array(await crypto.subtle.encrypt({ name: "AES-GCM", iv }, await key(secret), new TextEncoder().encode(plain)));
  const out = new Uint8Array(12 + ct.length);
  out.set(iv);
  out.set(ct, 12);
  return b64(out);
}
async function dec(secret, blob) {
  if (!blob) return "";
  try {
    const raw2 = unb64(blob);
    const pt = await crypto.subtle.decrypt({ name: "AES-GCM", iv: raw2.slice(0, 12) }, await key(secret), raw2.slice(12));
    return new TextDecoder().decode(pt);
  } catch {
    return "";
  }
}

// eitaa-src/db.ts
var now = () => Math.floor(Date.now() / 1e3);
async function getSession(env, uid) {
  const r = await env.DB.prepare("SELECT state, data FROM ea_sessions WHERE user_id=?").bind(uid).first();
  if (!r) return { state: "", data: {} };
  try {
    return { state: r.state, data: JSON.parse(r.data) };
  } catch {
    return { state: r.state, data: {} };
  }
}
async function setSession(env, uid, state, data = {}) {
  await env.DB.prepare("INSERT INTO ea_sessions(user_id,state,data,updated_at) VALUES(?,?,?,?) ON CONFLICT(user_id) DO UPDATE SET state=excluded.state,data=excluded.data,updated_at=excluded.updated_at").bind(uid, state, JSON.stringify(data), now()).run();
}
var clearSession = (env, uid) => setSession(env, uid, "", {});
async function touchUser(env, id, name, username) {
  await env.DB.prepare("INSERT INTO ea_users(id,name,username,created_at) VALUES(?,?,?,?) ON CONFLICT(id) DO UPDATE SET name=excluded.name, username=excluded.username").bind(id, name.slice(0, 100), (username || "").slice(0, 64), now()).run();
  return await env.DB.prepare("SELECT * FROM ea_users WHERE id=?").bind(id).first();
}
var getUser = (env, id) => env.DB.prepare("SELECT * FROM ea_users WHERE id=?").bind(id).first();
var getChannel = (env, id) => env.DB.prepare("SELECT * FROM ea_channels WHERE id=?").bind(id).first();
var userChannels = async (env, uid) => (await env.DB.prepare("SELECT * FROM ea_channels WHERE user_id=? ORDER BY id").bind(uid).all()).results;
var getJob = (env, id) => env.DB.prepare("SELECT * FROM agent_jobs WHERE id=?").bind(id).first();
var userJobs = async (env, uid) => (await env.DB.prepare("SELECT * FROM agent_jobs WHERE user_id=? ORDER BY id").bind(uid).all()).results;

// eitaa-src/env.ts
var tgBase = (e) => (e.TG_API_BASE || "https://api.telegram.org").replace(/\/$/, "");
var eitaaBase = (e) => (e.EITAA_API_BASE || "https://eitaayar.ir/api").replace(/\/$/, "");
var eitaaWeb = (e) => (e.EITAA_WEB_BASE || "https://eitaa.com").replace(/\/$/, "");
var adminIds = (e) => (e.ADMIN_IDS || "").split(/[,\s]+/).filter((x) => /^\d+$/.test(x)).map(Number);

// eitaa-src/eitaa.ts
var EitaaError = class extends Error {
};
var EitaaNetworkError = class extends EitaaError {
};
function eitaaUrl(env, token, method) {
  const base = eitaaBase(env).replace(/\/+$/, "").replace(/\/bot$/i, "");
  const t = token.trim().replace(/^bot/i, "");
  return `${base}/bot${t}/${method}`;
}
async function call(env, token, method, form) {
  const raw2 = token.trim().replace(/^bot/i, "");
  const clean = (m) => m.split(raw2).join("***").split(token).join("***");
  let r;
  try {
    r = await fetch(eitaaUrl(env, token, method), { method: "POST", body: form });
  } catch (e) {
    throw new EitaaNetworkError(clean(`${e.name}: ${e.message}`));
  }
  let j;
  try {
    j = await r.json();
  } catch {
    throw new EitaaError(`\u067E\u0627\u0633\u062E \u0646\u0627\u0645\u0639\u062A\u0628\u0631 \u0627\u0632 \u0627\u06CC\u062A\u0627\u06CC\u0627\u0631 (HTTP ${r.status})`);
  }
  if (!j || typeof j !== "object" || !j.ok) {
    throw new EitaaError(explainError(clean(String(j && (j.description || j.message || j.error) || `HTTP ${r.status}`))));
  }
  return j.result ?? j;
}
function explainError(raw2) {
  const m = raw2.toLowerCase();
  if (/chat not found|chat_id|wrong chat|peer/.test(m))
    return `${raw2}

\u{1F50E} \u06CC\u0639\u0646\u06CC \u0627\u06CC\u062A\u0627\u06CC\u0627\u0631 \u0627\u06CC\u0646 \u06A9\u0627\u0646\u0627\u0644 \u0631\u0627 \u0628\u0627 \u0634\u0646\u0627\u0633\u0647\u200C\u06CC \u0630\u062E\u06CC\u0631\u0647\u200C\u0634\u062F\u0647 \u0646\u0645\u06CC\u200C\u0634\u0646\u0627\u0633\u062F. \u0628\u0631\u0631\u0633\u06CC \u06A9\u0646\u06CC\u062F:
\u06F1) \u06A9\u0627\u0646\u0627\u0644 \u062F\u0631 \u067E\u0646\u0644 \u0627\u06CC\u062A\u0627\u06CC\u0627\u0631 (\u0628\u062E\u0634 \xAB\u06A9\u0627\u0646\u0627\u0644\u200C\u0647\u0627\xBB) \u062B\u0628\u062A \u0634\u062F\u0647 \u0628\u0627\u0634\u062F\u061B
\u06F2) \u0634\u0646\u0627\u0633\u0647 \u0631\u0627 \u0647\u0645\u0627\u0646\u200C\u0637\u0648\u0631 \u06A9\u0647 \u062F\u0631 \u067E\u0646\u0644 \u0627\u06CC\u062A\u0627\u06CC\u0627\u0631 \u0645\u06CC\u200C\u0628\u06CC\u0646\u06CC\u062F \u0628\u062F\u0647\u06CC\u062F (\u0639\u062F\u062F \u0634\u0646\u0627\u0633\u0647\u200C\u06CC \u06A9\u0627\u0646\u0627\u0644\u060C \u06CC\u0627 \u0646\u0627\u0645 \u06A9\u0627\u0631\u0628\u0631\u06CC \u062F\u0642\u06CC\u0642 \u0628\u062F\u0648\u0646 @)\u061B
\u06F3) \u062D\u0633\u0627\u0628 \u0627\u06CC\u062A\u0627\u06CC\u0627\u0631 (\u0635\u0627\u062D\u0628 \u062A\u0648\u06A9\u0646) \u062F\u0631 \u06A9\u0627\u0646\u0627\u0644 \u0627\u062F\u0645\u06CC\u0646 \u0628\u0627\u0634\u062F.
\u062F\u0631 \u0631\u0628\u0627\u062A: \xAB\u06A9\u0627\u0646\u0627\u0644\u200C\u0647\u0627\xBB \u2190 \u06A9\u0627\u0646\u0627\u0644 \u2190 \xAB\u270F\uFE0F \u062A\u063A\u06CC\u06CC\u0631 \u0634\u0646\u0627\u0633\u0647\xBB \u06CC\u0627 \xAB\u{1F9EA} \u0622\u0632\u0645\u0627\u06CC\u0634 \u0627\u062A\u0635\u0627\u0644\xBB.`;
  if (/unauthorized|invalid token|token|forbidden|401|403/.test(m))
    return `${raw2}

\u{1F50E} \u062A\u0648\u06A9\u0646 \u0627\u06CC\u062A\u0627\u06CC\u0627\u0631 \u0646\u0627\u0645\u0639\u062A\u0628\u0631 \u06CC\u0627 \u0645\u0646\u0642\u0636\u06CC \u0627\u0633\u062A\u061B \u0627\u0632 \xAB\u0628\u0631\u0646\u0627\u0645\u0647\u200C\u0647\u0627\u06CC \u0645\u062A\u0635\u0644\xBB \u062A\u0648\u06A9\u0646 \u062A\u0627\u0632\u0647 \u062B\u0628\u062A \u06A9\u0646\u06CC\u062F.`;
  if (/not enough rights|administrator|admin|rights/.test(m))
    return `${raw2}

\u{1F50E} \u062D\u0633\u0627\u0628 \u0627\u06CC\u062A\u0627\u06CC\u0627\u0631 \u062F\u0631 \u0627\u06CC\u0646 \u06A9\u0627\u0646\u0627\u0644 \u0627\u062F\u0645\u06CC\u0646 (\u0628\u0627 \u0627\u062C\u0627\u0632\u0647\u200C\u06CC \u0627\u0631\u0633\u0627\u0644 \u067E\u06CC\u0627\u0645) \u0646\u06CC\u0633\u062A.`;
  if (/too many|429|flood/.test(m)) return `${raw2}

\u{1F50E} \u0645\u062D\u062F\u0648\u062F\u06CC\u062A \u0646\u0631\u062E \u0627\u0631\u0633\u0627\u0644\u061B \u0686\u0646\u062F \u062F\u0642\u06CC\u0642\u0647 \u0628\u0639\u062F \u062F\u0648\u0628\u0627\u0631\u0647 \u062A\u0644\u0627\u0634 \u0645\u06CC\u200C\u0634\u0648\u062F.`;
  return raw2;
}
function opts(form, o) {
  if (o.title) form.set("title", o.title);
  if (o.silent) form.set("disable_notification", "1");
  if (o.pin) form.set("pin", "1");
  if (o.viewDelete) form.set("viewCountForDelete", String(o.viewDelete));
}
var getMe = (env, token) => call(env, token, "getMe", new FormData());
function sendMessage(env, token, chatId, text, o = {}) {
  const f = new FormData();
  f.set("chat_id", chatId);
  f.set("text", text);
  opts(f, o);
  return call(env, token, "sendMessage", f);
}
function sendFile(env, token, chatId, name, bytes, caption, o = {}) {
  const f = new FormData();
  f.set("chat_id", chatId);
  if (caption) f.set("caption", caption);
  opts(f, o);
  f.set("file", new Blob([bytes.slice().buffer]), name);
  return call(env, token, "sendFile", f).catch((e) => {
    if (e instanceof EitaaNetworkError || !/method|not\s*found|unknown|invalid/i.test(e.message) || /chat|token/i.test(e.message)) throw e;
    return call(env, token, "sendDocument", f);
  });
}
async function deleteMessage(env, token, chatId, messageId) {
  if (!messageId) return { ok: false, error: "\u0634\u0646\u0627\u0633\u0647\u200C\u06CC \u067E\u06CC\u0627\u0645 \u062F\u0631 \u0627\u06CC\u062A\u0627 \u0630\u062E\u06CC\u0631\u0647 \u0646\u0634\u062F\u0647 \u0627\u0633\u062A" };
  const f = new FormData();
  f.set("chat_id", chatId);
  f.set("message_id", messageId);
  try {
    await call(env, token, "deleteMessage", f);
    return { ok: true, error: "" };
  } catch (e) {
    return { ok: false, error: e.message };
  }
}
var GENERIC = /* @__PURE__ */ new Set(["", "eitaa", "\u0627\u06CC\u062A\u0627", "\u067E\u06CC\u0627\u0645 \u0631\u0633\u0627\u0646 \u0627\u06CC\u062A\u0627", "\u067E\u06CC\u0627\u0645\u200C\u0631\u0633\u0627\u0646 \u0627\u06CC\u062A\u0627", "eitaa messenger"]);
var unesc = (s) => s.replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#0?39;/g, "'");
function meta(page, prop) {
  for (const re of [
    new RegExp(`<meta[^>]+(?:property|name)=["']${prop}["'][^>]+content=["']([^"']*)["']`, "i"),
    new RegExp(`<meta[^>]+content=["']([^"']*)["'][^>]+(?:property|name)=["']${prop}["']`, "i")
  ]) {
    const m = page.match(re);
    if (m) return unesc(m[1]).trim();
  }
  return "";
}
function parseChatPage(page, isInvite) {
  let title = meta(page, "og:title");
  if (!title) {
    const m = page.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
    title = m ? unesc(m[1]).trim() : "";
  }
  title = title.split(/\s[-–|]\s*(?:Eitaa|ایتا)\s*$/i)[0].trim();
  const desc = meta(page, "og:description") || meta(page, "description");
  if (GENERIC.has(title.toLowerCase())) return { exists: false, kind: "unknown", title: "", desc: "" };
  const text = page.replace(/<[^>]+>/g, " "), low = text.toLowerCase();
  const kind = text.includes("\u0645\u0634\u062A\u0631\u06A9") || low.includes("subscriber") || low.includes("followers") ? "channel" : text.includes("\u0639\u0636\u0648") || low.includes("members") ? "group" : isInvite ? "private" : "unknown";
  return { exists: true, kind, title: title.slice(0, 100), desc: desc.slice(0, 200) };
}
async function lookupChat(env, chatId) {
  const none = { exists: null, kind: "unknown", title: "", desc: "" };
  const cid = chatId.trim(), invite = cid.includes("joinchat");
  let url;
  if (invite) url = `${eitaaWeb(env)}/joinchat/${cid.replace(/\/$/, "").split("joinchat/").pop().split("?")[0]}`;
  else if (/^[A-Za-z0-9_.]{3,64}$/.test(cid) && !/^\d+$/.test(cid)) url = `${eitaaWeb(env)}/${cid}`;
  else return none;
  try {
    const r = await fetch(url, { headers: { "user-agent": "Mozilla/5.0" }, redirect: "follow" });
    if (r.status === 404) return { ...none, exists: false };
    if (r.status !== 200) return none;
    return parseChatPage(await r.text(), invite);
  } catch {
    return none;
  }
}

// eitaa-src/tg.ts
var ikb = (rows) => ({ inline_keyboard: rows.map((r) => r.map(([text, callback_data]) => ({ text, callback_data }))) });
var TgError = class extends Error {
};
async function tgWith(env, token, method, body = {}) {
  const form = body instanceof FormData;
  const r = await fetch(`${tgBase(env)}/bot${token}/${method}`, {
    method: "POST",
    ...form ? {} : { headers: { "content-type": "application/json" } },
    body: form ? body : JSON.stringify(body)
  });
  const j = await r.json().catch(() => ({}));
  if (!j.ok) throw new TgError(String(j.description || `HTTP ${r.status}`).split(token).join("***"));
  return j.result;
}
async function tg(env, method, body = {}) {
  const rd = env.EA_REDIRECT;
  if (rd && body.chat_id === rd.from) body = { ...body, chat_id: rd.chat, ...rd.thread && method.startsWith("send") ? { message_thread_id: rd.thread } : {} };
  return tgWith(env, env.BOT_TOKEN, method, body);
}
async function send(env, chat, text, kb) {
  try {
    const m = await tg(env, "sendMessage", { chat_id: chat, text: text.slice(0, 4e3), parse_mode: "HTML", reply_markup: kb, disable_web_page_preview: true });
    return m.message_id;
  } catch {
    return null;
  }
}
async function edit(env, chat, mid, text, kb) {
  try {
    await tg(env, "editMessageText", { chat_id: chat, message_id: mid, text: text.slice(0, 4e3), parse_mode: "HTML", reply_markup: kb });
  } catch {
  }
}
async function answer(env, id, text = "", alert = false) {
  try {
    await tg(env, "answerCallbackQuery", { callback_query_id: id, text, show_alert: alert });
  } catch {
  }
}
async function del(env, chat, mid) {
  try {
    await tg(env, "deleteMessage", { chat_id: chat, message_id: mid });
  } catch {
  }
}
async function download(env, fileId) {
  const f = await tg(env, "getFile", { file_id: fileId });
  if (!f.file_path) throw new TgError("\u0641\u0627\u06CC\u0644 \u062F\u0631 \u062A\u0644\u06AF\u0631\u0627\u0645 \u067E\u06CC\u062F\u0627 \u0646\u0634\u062F");
  const r = await fetch(`${tgBase(env)}/file/bot${env.BOT_TOKEN}/${f.file_path}`);
  if (!r.ok) throw new TgError(`\u062F\u0627\u0646\u0644\u0648\u062F \u0641\u0627\u06CC\u0644 \u0627\u0632 \u062A\u0644\u06AF\u0631\u0627\u0645 \u0646\u0627\u0645\u0648\u0641\u0642 \u0628\u0648\u062F (HTTP ${r.status})`);
  return new Uint8Array(await r.arrayBuffer());
}
async function typing(env, chat) {
  try {
    await tg(env, "sendChatAction", { chat_id: chat, action: "typing" });
  } catch {
  }
}

// eitaa-src/cfai.ts
var KEY = "ea_cfacc";
var MAX = 3;
var API = "https://api.cloudflare.com/client/v4";
var cache = null;
async function raw(env) {
  const r = await env.DB.prepare("SELECT value FROM settings WHERE key=?").bind(KEY).first().catch(() => null);
  try {
    const j = JSON.parse(r?.value || "[]");
    return Array.isArray(j) ? j : [];
  } catch {
    return [];
  }
}
async function put(env, list) {
  await env.DB.prepare("INSERT INTO settings(key,value) VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value").bind(KEY, JSON.stringify(list)).run();
  cache = null;
}
async function cfAccounts(env) {
  if (cache && Date.now() - cache.at < 6e4) return cache.list;
  const out = [];
  for (const s of await raw(env)) {
    const token = await dec(env.SECRET_KEY, s.t);
    if (token) out.push({ id: s.id, token });
  }
  cache = { at: Date.now(), list: out };
  return out;
}
var cfBase = (acc) => `${API}/accounts/${acc}/ai/v1`;
var cf = async (token, path, init) => {
  const r = await fetch(API + path, { ...init, headers: { authorization: `Bearer ${token}`, "content-type": "application/json" } });
  return { status: r.status, j: await r.json().catch(() => ({})) };
};
var mask = (id) => `${id.slice(0, 4)}\u2026${id.slice(-4)}`;
async function testAccount(token, acc) {
  const r = await fetch(`${cfBase(acc)}/chat/completions`, { method: "POST", headers: { authorization: `Bearer ${token}`, "content-type": "application/json" }, body: JSON.stringify({ model: MODELS[0].model, max_tokens: 5, messages: [{ role: "user", content: "say ok" }] }) });
  if (r.ok) return { ok: true, note: "" };
  const j = await r.json().catch(() => ({}));
  const msg = String(j?.errors?.[0]?.message || j?.error?.message || `HTTP ${r.status}`).slice(0, 160);
  if (r.status === 429 || /neurons|allocation|quota|limit/i.test(msg)) return { ok: true, note: "\u0633\u0647\u0645\u06CC\u0647\u200C\u06CC \u0627\u0645\u0631\u0648\u0632 \u0627\u06CC\u0646 \u062D\u0633\u0627\u0628 \u067E\u0631 \u0627\u0633\u062A\u060C \u0648\u0644\u06CC \u062A\u0648\u06A9\u0646 \u062F\u0631\u0633\u062A \u0627\u0633\u062A" };
  if (r.status === 401 || r.status === 403) return { ok: false, note: "\u062A\u0648\u06A9\u0646 \u0645\u0639\u062A\u0628\u0631 \u0646\u06CC\u0633\u062A \u06CC\u0627 \u062F\u0633\u062A\u0631\u0633\u06CC \xABWorkers AI\xBB \u0646\u062F\u0627\u0631\u062F (" + msg + ")" };
  if (r.status === 404 || /account/i.test(msg)) return { ok: false, note: "\u0634\u0646\u0627\u0633\u0647\u200C\u06CC \u062D\u0633\u0627\u0628 (Account ID) \u062F\u0631\u0633\u062A \u0646\u06CC\u0633\u062A (" + msg + ")" };
  return { ok: false, note: msg };
}
async function home(env, uid) {
  const list = await raw(env);
  const rows = list.map((a) => [[`\u{1F9EA} ${mask(a.id)}`, `cf:t:${a.id}`], ["\u{1F5D1} \u062D\u0630\u0641", `cf:d:${a.id}`]]);
  if (list.length < MAX) rows.push([["\u2795 \u0627\u0641\u0632\u0648\u062F\u0646 \u062D\u0633\u0627\u0628 \u06A9\u0644\u0648\u062F\u0641\u0644\u0631", "cf:add:0"]]);
  await send(env, uid, `<b>\u2601\uFE0F \u062D\u0633\u0627\u0628\u200C\u0647\u0627\u06CC \u06A9\u0644\u0648\u062F\u0641\u0644\u0631 \u0628\u0631\u0627\u06CC \u0647\u0648\u0634 \u0645\u0635\u0646\u0648\u0639\u06CC</b>

\u0648\u0642\u062A\u06CC \u0633\u0647\u0645\u06CC\u0647\u200C\u06CC \u0631\u0627\u06CC\u06AF\u0627\u0646 Workers AI \u0647\u0645\u06CC\u0646 Worker \u062A\u0645\u0627\u0645 \u0634\u0648\u062F\u060C \u0631\u0628\u0627\u062A \u062E\u0648\u062F\u06A9\u0627\u0631 \u0627\u0632 \u062D\u0633\u0627\u0628\u200C\u0647\u0627\u06CC \u0627\u06CC\u0646\u062C\u0627 \u0627\u0633\u062A\u0641\u0627\u062F\u0647 \u0645\u06CC\u200C\u06A9\u0646\u062F \u062A\u0627 \u06A9\u0627\u0631\u0647\u0627 \u0646\u0627\u06CC\u0633\u062A\u062F.
${list.length ? "\n\u062D\u0633\u0627\u0628\u200C\u0647\u0627:\n" + list.map((a) => "\u2022 " + mask(a.id)).join("\n") : "\n\u0647\u0646\u0648\u0632 \u062D\u0633\u0627\u0628\u06CC \u0627\u0636\u0627\u0641\u0647 \u0646\u0634\u062F\u0647."}

\u{1F510} \u062A\u0648\u06A9\u0646\u200C\u0647\u0627 \u0631\u0645\u0632\u0646\u06AF\u0627\u0631\u06CC\u200C\u0634\u062F\u0647 \u0630\u062E\u06CC\u0631\u0647 \u0645\u06CC\u200C\u0634\u0648\u0646\u062F.`, ikb(rows));
}
async function onCallback(env, u, q, act2, arg) {
  await answer(env, q.id);
  if (act2 === "home") return home(env, u.id);
  if (act2 === "add") {
    if ((await raw(env)).length >= MAX) return void await send(env, u.id, `\u062D\u062F\u0627\u06A9\u062B\u0631 ${MAX} \u062D\u0633\u0627\u0628.`);
    await setSession(env, u.id, "cf_tok", {});
    return void await send(env, u.id, "\u{1F511} <b>\u062A\u0648\u06A9\u0646 API \u06A9\u0644\u0648\u062F\u0641\u0644\u0631</b> \u0631\u0627 \u0628\u0641\u0631\u0633\u062A\u06CC\u062F.\n\n\u0633\u0627\u062E\u062A: dash.cloudflare.com \u2190 My Profile \u2190 API Tokens \u2190 Create Token \u2190 \u0642\u0627\u0644\u0628 <b>\xABWorkers AI\xBB</b> (\u06CC\u0627 Custom \u0628\u0627 Account \xB7 Workers AI \xB7 Read).\n\u062F\u0633\u062A\u0631\u0633\u06CC \xABAccount Settings: Read\xBB \u0647\u0645 \u0628\u062F\u0647\u06CC\u062F \u062A\u0627 \u0634\u0646\u0627\u0633\u0647\u200C\u06CC \u062D\u0633\u0627\u0628 \u062E\u0648\u062F\u06A9\u0627\u0631 \u067E\u06CC\u062F\u0627 \u0634\u0648\u062F.\n\n\u{1F9F9} \u067E\u06CC\u0627\u0645 \u0634\u0645\u0627 \u0628\u0639\u062F \u0627\u0632 \u062E\u0648\u0627\u0646\u062F\u0646 \u067E\u0627\u06A9 \u0645\u06CC\u200C\u0634\u0648\u062F. \u0644\u063A\u0648: /cancel");
  }
  const list = await raw(env);
  if (act2 === "d") {
    await put(env, list.filter((a) => a.id !== arg));
    return void await send(env, u.id, "\u{1F5D1} \u062D\u0630\u0641 \u0634\u062F.");
  }
  if (act2 === "t") {
    const a = list.find((x) => x.id === arg);
    if (!a) return;
    const r = await testAccount(await dec(env.SECRET_KEY, a.t), a.id);
    return void await send(env, u.id, r.ok ? `\u2705 \u062D\u0633\u0627\u0628 ${mask(a.id)} \u06A9\u0627\u0631 \u0645\u06CC\u200C\u06A9\u0646\u062F.${r.note ? "\n" + esc(r.note) : ""}` : `\u274C ${esc(r.note)}`);
  }
}
async function save(env, u, token, acc) {
  const t = await testAccount(token, acc);
  if (!t.ok) {
    await setSession(env, u.id, "cf_acc", { t: await enc(env.SECRET_KEY, token) });
    return void await send(env, u.id, `\u274C ${esc(t.note)}

\u0634\u0646\u0627\u0633\u0647\u200C\u06CC \u062D\u0633\u0627\u0628 (Account ID) \u0631\u0627 \u062F\u0631\u0633\u062A \u0628\u0641\u0631\u0633\u062A\u06CC\u062F (\u062F\u0631 \u062F\u0627\u0634\u0628\u0648\u0631\u062F \u06A9\u0644\u0648\u062F\u0641\u0644\u0631\u060C \u0633\u0645\u062A \u0631\u0627\u0633\u062A \u0635\u0641\u062D\u0647\u200C\u06CC Workers & Pages). \u0644\u063A\u0648: /cancel`);
  }
  const list = (await raw(env)).filter((a) => a.id !== acc);
  list.push({ id: acc, t: await enc(env.SECRET_KEY, token) });
  await put(env, list.slice(-MAX));
  await clearSession(env, u.id);
  await send(env, u.id, `\u2705 \u062D\u0633\u0627\u0628 ${mask(acc)} \u0627\u0636\u0627\u0641\u0647 \u0634\u062F.${t.note ? "\n" + esc(t.note) : ""}
\u0627\u0632 \u0627\u06CC\u0646 \u067E\u0633 \u0627\u06AF\u0631 \u0633\u0647\u0645\u06CC\u0647\u200C\u06CC Worker \u067E\u0631 \u0634\u0648\u062F\u060C \u0627\u0632 \u0627\u06CC\u0646 \u062D\u0633\u0627\u0628 \u0627\u0633\u062A\u0641\u0627\u062F\u0647 \u0645\u06CC\u200C\u0634\u0648\u062F.`);
}
async function onMessage(env, u, state, d, m) {
  const text = (m.text || "").trim();
  if (state === "cf_tok") {
    await del(env, u.id, m.message_id);
    if (!/^[A-Za-z0-9_-]{30,80}$/.test(text)) return void await send(env, u.id, "\u0642\u0627\u0644\u0628 \u062A\u0648\u06A9\u0646 \u062F\u0631\u0633\u062A \u0646\u06CC\u0633\u062A\u061B \u062F\u0648\u0628\u0627\u0631\u0647 \u0628\u0641\u0631\u0633\u062A\u06CC\u062F \u06CC\u0627 /cancel.");
    const v = await cf(text, "/user/tokens/verify");
    if (v.status !== 200 || v.j?.result?.status !== "active") return void await send(env, u.id, "\u274C \u06A9\u0644\u0648\u062F\u0641\u0644\u0631 \u0627\u06CC\u0646 \u062A\u0648\u06A9\u0646 \u0631\u0627 \u0646\u067E\u0630\u06CC\u0631\u0641\u062A (\u063A\u06CC\u0631\u0641\u0639\u0627\u0644 \u06CC\u0627 \u0627\u0634\u062A\u0628\u0627\u0647). \u062F\u0648\u0628\u0627\u0631\u0647 \u0628\u0641\u0631\u0633\u062A\u06CC\u062F \u06CC\u0627 /cancel.");
    const a = await cf(text, "/accounts");
    const ids = a.status === 200 ? (a.j?.result || []).map((x) => String(x.id)) : [];
    if (ids.length === 1) return save(env, u, text, ids[0]);
    await setSession(env, u.id, "cf_acc", { t: await enc(env.SECRET_KEY, text) });
    return void await send(env, u.id, `\u2705 \u062A\u0648\u06A9\u0646 \u0645\u0639\u062A\u0628\u0631 \u0627\u0633\u062A. ${ids.length > 1 ? "\u0686\u0646\u062F \u062D\u0633\u0627\u0628 \u062F\u0627\u0631\u062F\u061B " : "\u0634\u0646\u0627\u0633\u0647\u200C\u06CC \u062D\u0633\u0627\u0628 \u062E\u0648\u062F\u06A9\u0627\u0631 \u067E\u06CC\u062F\u0627 \u0646\u0634\u062F\u061B "}<b>Account ID</b> (\u06F3\u06F2 \u062D\u0631\u0641) \u0631\u0627 \u0628\u0641\u0631\u0633\u062A\u06CC\u062F.
\u0644\u063A\u0648: /cancel`);
  }
  if (state === "cf_acc") {
    await del(env, u.id, m.message_id);
    if (!/^[0-9a-f]{32}$/i.test(text)) return void await send(env, u.id, "Account ID \u0628\u0627\u06CC\u062F \u06F3\u06F2 \u062D\u0631\u0641 (\u06F0-\u06F9 \u0648 a-f) \u0628\u0627\u0634\u062F. \u062F\u0648\u0628\u0627\u0631\u0647 \u0628\u0641\u0631\u0633\u062A\u06CC\u062F \u06CC\u0627 /cancel.");
    const token = await dec(env.SECRET_KEY, String(d.t || ""));
    if (!token) {
      await clearSession(env, u.id);
      return void await send(env, u.id, "\u0646\u0634\u0633\u062A \u0645\u0646\u0642\u0636\u06CC \u0634\u062F\u061B \u0627\u0632 \u0627\u0648\u0644 \u0634\u0631\u0648\u0639 \u06A9\u0646\u06CC\u062F.");
    }
    return save(env, u, token, text.toLowerCase());
  }
}

// eitaa-src/providers.ts
var MODELS = [
  { model: "@cf/meta/llama-3.3-70b-instruct-fp8-fast", name: "Llama 3.3 70B" },
  { model: "@cf/meta/llama-4-scout-17b-16e-instruct", name: "Llama 4 Scout" }
];
var AI;
var getAi = () => AI;
var envOf = (env, name) => (env[name] || "").trim();
var cache2 = null;
async function cools(env) {
  if (cache2 && Date.now() - cache2.at < 15e3) return cache2.map;
  const rows = (await env.DB.prepare("SELECT key, value FROM settings WHERE key LIKE 'ea_cool:%'").all()).results;
  cache2 = { at: Date.now(), map: new Map(rows.map((r) => [r.key, r.value])) };
  return cache2.map;
}
async function llmChain(env) {
  AI = env.AI;
  if (envOf(env, "LLM_TEST_BASE")) return [{ id: "test", name: "test", model: "test-model", base: envOf(env, "LLM_TEST_BASE"), key: envOf(env, "LLM_TEST_KEY"), json: true }];
  if (!env.AI) return [];
  const extra = env.EA_MODEL ? [{ model: env.EA_MODEL, name: "AI" }] : [];
  const m = await cools(env), t = Math.floor(Date.now() / 1e3);
  const cool = (id) => parseInt(m.get(`ea_cool:${id}`) || "0", 10) > t;
  const own = [...extra, ...MODELS.filter((x) => x.model !== env.EA_MODEL)].map((x) => ({ id: x.model, name: x.name, model: x.model, json: false }));
  const more = [];
  for (const a of await cfAccounts(env).catch(() => [])) for (const x of MODELS) more.push({ id: `cf:${a.id}:${x.model}`, name: `${x.name} (\u062D\u0633\u0627\u0628 ${a.id.slice(0, 4)}\u2026)`, model: x.model, base: cfBase(a.id), key: a.token, json: false });
  return [...own, ...more].sort((a, b) => Number(cool(a.id)) - Number(cool(b.id)));
}
var llmReady = async (env) => (await llmChain(env)).length > 0;
async function markCooldown(env, id, seconds) {
  await env.DB.prepare("INSERT INTO settings(key,value) VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value").bind(`ea_cool:${id}`, String(Math.floor(Date.now() / 1e3) + seconds)).run();
  cache2 = null;
}

// eitaa-src/llm.ts
function httpReason(status) {
  if (status === 401 || status === 403) return "\u06A9\u0644\u06CC\u062F API \u0646\u0627\u0645\u0639\u062A\u0628\u0631 \u0627\u0633\u062A \u06CC\u0627 \u062F\u0633\u062A\u0631\u0633\u06CC \u0646\u062F\u0627\u0631\u062F";
  if (status === 402) return "\u0645\u0648\u062C\u0648\u062F\u06CC/\u0627\u0639\u062A\u0628\u0627\u0631 \u062D\u0633\u0627\u0628 \u062A\u0645\u0627\u0645 \u0634\u062F\u0647 \u0627\u0633\u062A";
  if (status === 404) return "\u0645\u062F\u0644 \u06CC\u0627 \u0622\u062F\u0631\u0633 API \u067E\u06CC\u062F\u0627 \u0646\u0634\u062F (\u0646\u0627\u0645 \u0645\u062F\u0644 \u0631\u0627 \u0628\u0631\u0631\u0633\u06CC \u06A9\u0646\u06CC\u062F)";
  if (status === 429) return "\u0633\u0647\u0645\u06CC\u0647 \u06CC\u0627 \u0645\u062D\u062F\u0648\u062F\u06CC\u062A \u062A\u0639\u062F\u0627\u062F \u062F\u0631\u062E\u0648\u0627\u0633\u062A \u067E\u0631 \u0634\u062F\u0647 \u0627\u0633\u062A";
  if (status >= 500) return "\u0633\u0631\u0648\u06CC\u0633 \u0645\u0648\u0642\u062A\u0627\u064B \u062F\u0631 \u062F\u0633\u062A\u0631\u0633 \u0646\u06CC\u0633\u062A";
  return `\u062E\u0637\u0627\u06CC HTTP ${status}`;
}
var sleep = (ms) => new Promise((r) => setTimeout(r, ms));
function cleanArgs(raw2) {
  if (raw2 && typeof raw2 === "object") return JSON.stringify(raw2);
  const s = String(raw2 ?? "").trim();
  if (!s) return "{}";
  try {
    const v = JSON.parse(s);
    return JSON.stringify(v && typeof v === "object" ? v : {});
  } catch {
  }
  const start2 = s.indexOf("{");
  if (start2 >= 0) {
    let depth = 0, inStr = false, esc3 = false;
    for (let i = start2; i < s.length; i++) {
      const ch = s[i];
      if (inStr) {
        if (esc3) esc3 = false;
        else if (ch === "\\") esc3 = true;
        else if (ch === '"') inStr = false;
        continue;
      }
      if (ch === '"') inStr = true;
      else if (ch === "{") depth++;
      else if (ch === "}" && --depth === 0) {
        try {
          return JSON.stringify(JSON.parse(s.slice(start2, i + 1)));
        } catch {
          break;
        }
      }
    }
  }
  return "{}";
}
async function viaBinding(cfg, body) {
  const ai = getAi();
  if (!ai) throw new Error("\u0627\u062A\u0635\u0627\u0644 Workers AI (binding) \u0641\u0639\u0627\u0644 \u0646\u06CC\u0633\u062A");
  const all = body.messages;
  const nameOf = new Map(all.flatMap((m) => (m.tool_calls || []).map((c) => [c.id, c.function.name])));
  const msgs = all.map((m) => m.tool_calls ? { role: "assistant", content: m.content || "", tool_calls: m.tool_calls.map((c) => ({ id: c.id, type: "function", function: { name: c.function.name, arguments: cleanArgs(c.function.arguments) } })) } : m.role === "tool" ? { role: "tool", tool_call_id: m.tool_call_id, name: nameOf.get(m.tool_call_id || "") || m.name || "tool", content: String(m.content ?? "") } : m);
  const run = (tools) => ai.run(cfg.model, { messages: msgs, max_tokens: body.max_tokens, temperature: body.temperature, ...tools ? { tools } : {} });
  let r;
  try {
    try {
      r = await run(body.tools);
    } catch (e) {
      if (!body.tools || !/tools|function/i.test(String(e.message)) || /8007.*arguments/i.test(String(e.message))) throw e;
      r = await run(body.tools.map((t) => t.function));
    }
  } catch (e) {
    const t = String(e.message || e);
    const quota = /limit|quota|neurons|capacity|4006|allocation/i.test(t);
    throw Object.assign(new Error(quota ? httpReason(429) : `Workers AI: ${t.slice(0, 120)}`), quota ? { status: 429 } : /deprecated|5028|not found|no such model/i.test(t) ? { status: 404 } : {});
  }
  if (r?.choices?.[0]?.message) return r;
  const rawCalls = r?.tool_calls || r?.result?.tool_calls || [];
  const calls = rawCalls.map((c, i) => ({ id: c.id || `cf_${Date.now().toString(36)}_${i}`, type: "function", function: { name: c.name || c.function?.name, arguments: cleanArgs(c.arguments ?? c.function?.arguments) } }));
  const text = r?.response ?? r?.result?.response;
  return { choices: [{ message: { role: "assistant", content: typeof text === "string" ? text.replace(/<think>[\s\S]*?<\/think>/gi, "").trim() : null, ...calls.length ? { tool_calls: calls } : {} } }] };
}
async function callOne(cfg, body, timeoutMs = 45e3) {
  if (!cfg.base) return viaBinding(cfg, body);
  for (let attempt = 0; attempt < 2; attempt++) {
    const ctl = new AbortController();
    const timer = setTimeout(() => ctl.abort(), timeoutMs);
    try {
      const r = await fetch(`${cfg.base}/chat/completions`, {
        method: "POST",
        signal: ctl.signal,
        headers: { "content-type": "application/json", authorization: `Bearer ${cfg.key}` },
        body: JSON.stringify({ model: cfg.model, ...body })
      });
      if (!r.ok) {
        console.error("llm http", cfg.id, r.status);
        if ((r.status === 429 || r.status >= 500) && attempt === 0) {
          await sleep(4e3);
          continue;
        }
        throw Object.assign(new Error(httpReason(r.status)), { status: r.status });
      }
      const j = await r.json();
      if (j?.error) throw new Error(String(j.error.message || "\u062E\u0637\u0627\u06CC \u0646\u0627\u0645\u0634\u062E\u0635 \u0627\u0632 \u0633\u0631\u0648\u06CC\u0633").slice(0, 160));
      return j;
    } catch (e) {
      if (e.name === "AbortError") {
        if (attempt === 0 && timeoutMs >= 3e4) continue;
        throw new Error("\u067E\u0627\u0633\u062E \u0646\u062F\u0627\u062F (timeout)");
      }
      throw e;
    } finally {
      clearTimeout(timer);
    }
  }
  throw new Error("\u067E\u0627\u0633\u062E \u0646\u062F\u0627\u062F");
}
async function viaChain(env, fn) {
  const chain = await llmChain(env);
  if (!chain.length) throw new Error("\u0647\u0646\u0648\u0632 \u0647\u06CC\u0686 \u0633\u0631\u0648\u06CC\u0633 \u0647\u0648\u0634 \u0645\u0635\u0646\u0648\u0639\u06CC \u062A\u0646\u0638\u06CC\u0645 \u0646\u0634\u062F\u0647 \u0627\u0633\u062A");
  const errs = [];
  for (const cfg of chain) {
    try {
      return await fn(cfg);
    } catch (e) {
      errs.push(`${cfg.name}: ${e.message}`);
      const st = e.status;
      if (st === 429) await markCooldown(env, cfg.id, 10 * 60).catch(() => {
      });
      else if (st === 404) await markCooldown(env, cfg.id, 6 * 3600).catch(() => {
      });
      else if (st === 402 || st === 401 || st === 403) await markCooldown(env, cfg.id, 30 * 60).catch(() => {
      });
      else if (st && st >= 500) await markCooldown(env, cfg.id, 2 * 60).catch(() => {
      });
    }
  }
  throw new Error(errs.join(" | "));
}
function chatJson(env, system, user, maxTokens = 1500) {
  return viaChain(env, async (cfg) => {
    const j = await callOne(cfg, {
      temperature: 0.2,
      max_tokens: maxTokens,
      ...cfg.json ? { response_format: { type: "json_object" } } : {},
      messages: [{ role: "system", content: system + "\nReply with a single JSON object and nothing else." }, { role: "user", content: user }]
    });
    const content = j?.choices?.[0]?.message?.content || "";
    const m = content.match(/\{[\s\S]*\}/);
    if (!m) throw new Error("\u067E\u0627\u0633\u062E \u0642\u0627\u0628\u0644\u200C\u0641\u0647\u0645 \u0646\u0628\u0648\u062F");
    try {
      return JSON.parse(m[0]);
    } catch {
      throw new Error("\u067E\u0627\u0633\u062E \u0642\u0627\u0628\u0644\u200C\u0641\u0647\u0645 \u0646\u0628\u0648\u062F");
    }
  });
}
var textOf = (c) => typeof c === "string" ? c : Array.isArray(c) ? c.map((x) => typeof x === "string" ? x : x?.text || "").join("") : "";
function chatTools(env, messages, tools, timeoutMs = 45e3, maxTokens = 900) {
  return viaChain(env, async (cfg) => {
    const msgs = messages;
    const j = await callOne(cfg, { temperature: 0.3, max_tokens: maxTokens, messages: msgs, tools, tool_choice: "auto" }, timeoutMs);
    const m = j?.choices?.[0]?.message;
    if (!m) throw new Error("\u067E\u0627\u0633\u062E \u0646\u0627\u0645\u0639\u062A\u0628\u0631");
    const calls = (m.tool_calls || []).filter((c) => c.function?.name || c.name).map((c, i) => ({ id: c.id || `call_${Date.now().toString(36)}_${i}`, type: "function", function: { name: c.function?.name || c.name, arguments: cleanArgs(c.function?.arguments ?? c.arguments) } }));
    return { role: "assistant", content: textOf(m.content ?? m.reasoning_content).replace(/<think>[\s\S]*?<\/think>/gi, "").trim() || null, ...calls.length ? { tool_calls: calls } : {} };
  });
}

// eitaa-src/source.ts
var ENT = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " ", laquo: "\xAB", raquo: "\xBB", hellip: "\u2026", zwnj: "\u200C" };
var unescapeHtml = (s) => s.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, e) => {
  if (e[0] === "#") {
    const n = e[1].toLowerCase() === "x" ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
    try {
      return String.fromCodePoint(n);
    } catch {
      return m;
    }
  }
  return ENT[e.toLowerCase()] ?? m;
});
function htmlToText(html) {
  const t = unescapeHtml(html.replace(/<br\s*\/?>/gi, "\n").replace(/<\/(p|div|li)>/gi, "\n").replace(/<[^>]+>/g, "")).replace(/ /g, " ").replace(/[ \t]+\n/g, "\n").replace(/\n{3,}/g, "\n\n");
  return t.trim();
}
var escRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
var norm = (s) => normDigits(s).replace(/ي/g, "\u06CC").replace(/ك/g, "\u06A9").replace(/[ً-ٟـ‌‏‎]/g, "").toLowerCase();
function parseMessages(html, source, base) {
  const marks = [];
  const re = /data-post=["']([^"']+)["']/g;
  let m;
  while (m = re.exec(html)) marks.push({ at: m.index, id: m[1] });
  const out = [];
  const abs = (u) => {
    try {
      return new URL(unescapeHtml(u), base + "/").toString();
    } catch {
      return "";
    }
  };
  for (let i = 0; i < marks.length; i++) {
    const block = html.slice(marks[i].at, i + 1 < marks.length ? marks[i + 1].at : html.length);
    if (/service_message/.test(block.slice(0, 400))) continue;
    const id = marks[i].id.split("/").pop() || "";
    if (!/^\d+$/.test(id)) continue;
    let text = "";
    const tre = /<div[^>]+class=["']([^"']*_widget_message_text[^"']*)["'][^>]*>([\s\S]*?)<\/div>/gi;
    let tm;
    while (tm = tre.exec(block)) if (!/reply/.test(tm[1])) text = htmlToText(tm[2]);
    const dt = block.match(/<time[^>]+datetime=["']([^"']+)["']/i);
    const ts = dt && !isNaN(Date.parse(dt[1])) ? Math.floor(Date.parse(dt[1]) / 1e3) : null;
    const bgOf = (tag) => {
      const m2 = tag.match(/background-image:\s*url\(\s*(?:&quot;|&#0?39;|['"])?([^'")&]+(?:&amp;[^'")&]+)*)(?:&quot;|&#0?39;|['"])?\s*\)/i);
      return m2 ? m2[1] : "";
    };
    const cls = (tag) => (tag.match(/class=["']([^"']*)["']/i) || ["", ""])[1];
    let image = "", thumb = "", videoUrl = "";
    for (const tm2 of block.matchAll(/<(a|div|i|span|img|video|source)\b[^>]*>/gi)) {
      const tag = tm2[0], c = cls(tag);
      if (/user_photo|userpic|avatar|_via|link_preview|emoji/i.test(c)) continue;
      if (tm2[1].toLowerCase() === "video" || tm2[1].toLowerCase() === "source") {
        const src = tag.match(/\s(?:src|data-src)=["']([^"']+)["']/i);
        if (src && !videoUrl && (tm2[1].toLowerCase() === "video" || /video|mp4|webm|mov/i.test(src[1] + tag))) videoUrl = abs(src[1]);
        const poster = tag.match(/\sposter=["']([^"']+)["']/i);
        if (poster && !thumb) thumb = abs(poster[1]);
        continue;
      }
      if (/video/i.test(c) && /thumb|wrap|player|_video/i.test(c)) {
        const u = bgOf(tag) || (tag.match(/\s(?:src|data-src)=["']([^"']+)["']/i) || [])[1] || "";
        if (u && !thumb) thumb = abs(u);
        const dv = tag.match(/data-(?:video|src|href)=["']([^"']+\.(?:mp4|webm|mov)[^"']*)["']/i);
        if (dv && !videoUrl) videoUrl = abs(dv[1]);
        continue;
      }
      if (/photo|image|pic|_media|grouped/i.test(c) && !/sticker/i.test(c)) {
        const u = bgOf(tag) || (tm2[1].toLowerCase() === "img" ? (tag.match(/\s(?:src|data-src)=["']([^"']+)["']/i) || [])[1] || "" : "");
        if (u && !image) image = abs(u);
      }
    }
    if (!image && !videoUrl && !thumb) {
      for (const tag of block.matchAll(/<[^>]+background-image[^>]*>/gi)) {
        if (/user_photo|avatar|sticker/i.test(cls(tag[0]))) continue;
        const u = bgOf(tag[0]);
        if (u) {
          image = abs(u);
          break;
        }
      }
    }
    let sticker = false;
    if (!image && !videoUrl && !thumb) {
      const wp = block.match(/data-webp=["']([^"']+)["']/i);
      let su = wp ? wp[1] : "";
      if (!su) for (const tag of block.matchAll(/<[^>]+class=["'][^"']*_sticker[^"']*["'][^>]*>/gi)) {
        const bg = bgOf(tag[0]) || (tag[0].match(/(?:src|data-src)=["']([^"']+\.webp[^"']*)["']/i) || [])[1];
        if (bg) {
          su = bg;
          break;
        }
      }
      if (su) {
        image = abs(su);
        sticker = true;
      }
    }
    const video = !!videoUrl || /_widget_message_video|<video[\s>]|video_thumb|round_video/i.test(block);
    if (video && !image) image = thumb;
    if (!text && !image && !videoUrl) continue;
    out.push({ source, id, text, ts, image, video, videoUrl, sticker });
  }
  return out;
}
function pageTitle(html) {
  const mt = html.match(/<meta[^>]+property=["']og:title["'][^>]+content=["']([^"']*)["']/i) || html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  return mt ? unescapeHtml(mt[1]).replace(/\s[-–|]\s*(?:Eitaa|ایتا)\s*$/i, "").trim().slice(0, 100) : "";
}
async function getPage(url) {
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), 15e3);
  try {
    const r = await fetch(url, { headers: { "user-agent": "Mozilla/5.0 (compatible; MedyasBot/1.0)", "accept-language": "fa,en;q=0.8" }, redirect: "follow", signal: ctl.signal });
    return { status: r.status, html: r.status === 200 ? (await r.text()).slice(0, 6e5) : "" };
  } finally {
    clearTimeout(timer);
  }
}
async function fetchChannel(env, source) {
  const base = eitaaWeb(env), name = source.replace(/^@/, "");
  let last = { ok: false, status: 0, messages: [], title: "", note: "", snippet: "" };
  for (const path of [`/${name}`, `/s/${name}`]) {
    try {
      const { status, html } = await getPage(`${base}${path}`);
      if (status === 404) {
        last = { ...last, status, note: "\u06A9\u0627\u0646\u0627\u0644 \u067E\u06CC\u062F\u0627 \u0646\u0634\u062F (\u06F4\u06F0\u06F4)" };
        continue;
      }
      if (status !== 200) {
        last = { ...last, status, note: `\u067E\u0627\u0633\u062E HTTP ${status}` };
        continue;
      }
      const messages = parseMessages(html, name, base);
      last = {
        ok: messages.length > 0,
        status,
        messages,
        title: pageTitle(html),
        note: messages.length ? "" : "\u0635\u0641\u062D\u0647 \u0628\u0627\u0632 \u0634\u062F \u0648\u0644\u06CC \u067E\u06CC\u0627\u0645\u06CC \u062F\u0631 \u0622\u0646 \u0634\u0646\u0627\u0633\u0627\u06CC\u06CC \u0646\u0634\u062F (\u06A9\u0627\u0646\u0627\u0644 \u0639\u0645\u0648\u0645\u06CC \u0646\u06CC\u0633\u062A \u06CC\u0627 \u0633\u0627\u062E\u062A\u0627\u0631 \u0635\u0641\u062D\u0647 \u0641\u0631\u0642 \u062F\u0627\u0631\u062F)",
        hint: `background-image:${(html.match(/background-image/gi) || []).length} video:${(html.match(/<video/gi) || []).length} img:${(html.match(/<img/gi) || []).length}`,
        snippet: htmlToText(html.replace(/<(script|style)[\s\S]*?<\/\1>/gi, "")).slice(0, 400)
      };
      if (messages.length) return last;
    } catch (e) {
      last = { ...last, note: `\u062E\u0637\u0627\u06CC \u0634\u0628\u06A9\u0647: ${e.message}` };
    }
  }
  return last;
}
async function fetchBytes(url, maxBytes, referer) {
  const r = await fetch(url, { headers: { "user-agent": "Mozilla/5.0 (compatible; MedyasBot/1.0)", ...referer ? { referer } : {} }, redirect: "follow" });
  if (!r.ok) throw new Error(`\u062F\u0627\u0646\u0644\u0648\u062F \u0641\u0627\u06CC\u0644 \u0645\u0646\u0628\u0639 \u0646\u0627\u0645\u0648\u0641\u0642 \u0628\u0648\u062F (HTTP ${r.status})`);
  const len = parseInt(r.headers.get("content-length") || "0", 10);
  if (len > maxBytes) throw new Error("\u062D\u062C\u0645 \u0641\u0627\u06CC\u0644 \u0645\u0646\u0628\u0639 \u0632\u06CC\u0627\u062F \u0627\u0633\u062A");
  const buf = new Uint8Array(await r.arrayBuffer());
  if (buf.length > maxBytes) throw new Error("\u062D\u062C\u0645 \u0641\u0627\u06CC\u0644 \u0645\u0646\u0628\u0639 \u0632\u06CC\u0627\u062F \u0627\u0633\u062A");
  return { bytes: buf, type: r.headers.get("content-type") || "" };
}
var extFor = (type, url) => {
  const t = type.toLowerCase();
  if (t.includes("png")) return "png";
  if (t.includes("webp")) return "webp";
  if (t.includes("gif")) return "gif";
  if (t.includes("jpeg") || t.includes("jpg")) return "jpg";
  const m = url.split("?")[0].match(/\.(jpe?g|png|webp|gif)$/i);
  return m ? m[1].toLowerCase().replace("jpeg", "jpg") : "jpg";
};
var PLATFORM_LINK = /(eitaa\.(com|ir)|t\.me|telegram\.(me|org)|ble\.ir|rubika\.ir|instagram\.com|wa\.me|chat\.whatsapp\.com|igap\.net|gap\.im|splus\.ir|sapp\.ir|soroush|youtube\.com|youtu\.be|aparat\.com|twitter\.com|x\.com|linkedin\.com|bit\.ly|tinyurl\.com)\b/i;
var PROMO = /(عضو\s*(شوید|شو|بشید|شین)|عضویت|ورود\s*به\s*(کانال|گروه)|لینک\s*(کانال|گروه|ورود)|(کانال|گروه|پیج|صفحه)\s*(ما|رسمی|اصلی|مان)|ما\s*را\s*(در\s*\S+\s*)?(دنبال|همراهی)|مارا\s*دنبال|دنبال\s*کنید|\bjoin\b|\bsubscribe\b|فالو\s*کنید|ارتباط\s*با\s*(ما|ادمین)|تبلیغات|سفارش\s*تبلیغ|بیشتر\s*بخوانید|ادامه\s*(مطلب|ی\s*مطلب|خبر)|برای\s*(دیدن|خواندن|مشاهده|مطالعه)[^\n]{0,40}(کلیک|لینک|کانال)|کلیک\s*کنید|ثبت\s*نام\s*کنید|دانلود\s*کنید)/i;
var SIG_EMOJI_LINE = /^[\s\p{Extended_Pictographic}️‍🆔📢📣🔰🌐📲🔗👇👈⬇️➡️•\-–—|:]*[\s\S]*$/u;
var SEPARATOR = /^[\s\-_=~*•·.─━═▬➖〰⎯┄┈┅━➰✦✧❖◾◽⚡️⭐️🔸🔹🔻▪️▫️■□◆◇♦️—–|\\\/:]{3,}$/u;
var HANDLE_G = /(^|[^A-Za-z0-9_.])@[A-Za-z0-9_]{4,}(?![A-Za-z0-9_])/g;
var URL_G = /(?:https?:\/\/|www\.)[^\s<>"'،؛»]+/gi;
var SIG_HINT = /(کانال|گروه|پیج|ایتا|تلگرام|بله|روبیکا|اینستاگرام|آپارات|لینک|عضو|دنبال|همراه|رسمی|مرجع|پایگاه|خبرگزاری|channel|telegram|instagram|eitaa|join|follow)/i;
var words = (s) => norm(s).replace(/[\p{P}\p{S}]+/gu, " ").split(/\s+/).filter((w) => w.length >= 3);
var compact = (s) => norm(s).replace(/[\s\p{P}\p{S}]+/gu, "");
var isSigLine = (line, title = "", source = "") => {
  const bare = line.replace(/[\s\p{P}\p{S}‌‏]+/gu, "");
  if (!bare) return true;
  if (SEPARATOR.test(line.trim())) return true;
  if (line.length > 110) return false;
  const noUrl = line.replace(URL_G, "").replace(/@[A-Za-z0-9_.]+/g, "").replace(/[\s\p{P}\p{S}‌‏]+/gu, "");
  const hasRef = /@[A-Za-z0-9_.]{3,}/.test(line) || PLATFORM_LINK.test(line) || URL_G.test(line);
  URL_G.lastIndex = 0;
  const restWords = line.replace(URL_G, " ").replace(/@[A-Za-z0-9_.]+/g, " ").split(/[\s\p{P}\p{S}]+/u).filter((w) => w.length > 1).length;
  URL_G.lastIndex = 0;
  if (hasRef && (restWords <= 4 || SIG_HINT.test(line)) && (noUrl.length <= 60 || SIG_HINT.test(line))) return true;
  if (PROMO.test(line) && line.length <= 90) return true;
  const c = compact(line), t = compact(title), s = compact(source);
  if (t.length >= 3 && c.includes(t) && c.length <= t.length + 24) return true;
  if (s.length >= 4 && c.includes(s) && c.length <= s.length + 24) return true;
  const tw = words(title);
  if (tw.length >= 2 && line.length <= 70) {
    const lw = new Set(words(line));
    if (tw.filter((w) => lw.has(w)).length / tw.length >= 0.6) return true;
  }
  if (/^[\s\p{Extended_Pictographic}️‍🆔📢📣🔰🌐📲🔗👇👈]+/u.test(line) && line.length <= 70 && SIG_HINT.test(line) && SIG_EMOJI_LINE.test(line)) return true;
  return false;
};
function stripHandles(text, keep = []) {
  const k = new Set(keep.map((x) => x.toLowerCase().replace(/^@/, "")));
  let t = text.replace(URL_G, (u) => k.size && [...k].some((h) => u.toLowerCase().includes(h)) ? u : "").replace(HANDLE_G, (m, pre) => k.has(m.slice(pre.length + 1).toLowerCase()) ? m : pre);
  t = t.split("\n").map((l) => l.replace(/[ \t]{2,}/g, " ").replace(/[ \t]+$/g, "")).join("\n");
  return t;
}
function cutSignature(lines, title, source) {
  const total = lines.join("\n").length;
  for (let i = Math.max(1, lines.length - 6); i < lines.length; i++) {
    if (SEPARATOR.test(lines[i].trim()) && lines.slice(0, i).join("\n").trim().length >= total * 0.4 && lines.slice(i + 1).join("\n").length <= 260 && lines.slice(i + 1).some((l) => isSigLine(l, title, source) || SIG_HINT.test(l))) {
      lines = lines.slice(0, i);
      break;
    }
  }
  while (lines.length > 1 && isSigLine(lines[lines.length - 1], title, source)) lines.pop();
  if (lines.length === 1 && lines[0].trim() && isSigLine(lines[0], title, source) && !lines[0].replace(/[\s\p{P}\p{S}]+/gu, "")) lines = [];
  while (lines.length > 1 && isSigLine(lines[0], title, source) && lines[0].length < 80 && (/@|\/\/|eitaa|ایتا/i.test(lines[0]) || !lines[0].replace(/[\s\p{P}\p{S}]+/gu, "") || PROMO.test(lines[0]))) lines.shift();
  return lines;
}
function cleanText(text, source, title = "") {
  let t = text.replace(new RegExp(`https?://(?:www\\.)?eitaa\\.com/(?:s/)?${escRe(source)}\\S*`, "gi"), "").replace(new RegExp(`@${escRe(source)}(?![A-Za-z0-9_])`, "gi"), "");
  let lines = t.split("\n").map((l) => l.replace(/[ \t]+$/g, ""));
  lines = cutSignature(lines, title, source);
  t = stripHandles(lines.join("\n"));
  lines = cutSignature(t.split("\n"), title, source);
  return lines.join("\n").replace(/[ \t]+\n/g, "\n").replace(/\n{3,}/g, "\n\n").trim();
}

// eitaa-src/review.ts
async function getLessons(env, uid, n = 12) {
  return (await env.DB.prepare("SELECT rule FROM ea_lessons WHERE user_id=? ORDER BY id DESC LIMIT ?").bind(uid, n).all()).results.map((r) => r.rule);
}
async function addLesson(env, uid, rule, source) {
  rule = rule.replace(/\s+/g, " ").trim().slice(0, 300);
  if (rule.length < 6) return false;
  const dup = await env.DB.prepare("SELECT id FROM ea_lessons WHERE user_id=? AND rule=?").bind(uid, rule).first();
  if (dup) return false;
  await env.DB.prepare("INSERT INTO ea_lessons(user_id,rule,source,created_at) VALUES(?,?,?,?)").bind(uid, rule, source.slice(0, 300), now()).run();
  await env.DB.prepare("DELETE FROM ea_lessons WHERE user_id=? AND id NOT IN (SELECT id FROM ea_lessons WHERE user_id=? ORDER BY id DESC LIMIT 40)").bind(uid, uid).run();
  return true;
}
var lessonBlock = (ls) => ls.length ? `OWNER'S LESSONS (mistakes he reported; never repeat them):
${ls.map((l) => "- " + l).join("\n")}
` : "";
function ruleIssues(text, own, opts2) {
  const out = [];
  const t = text.trim(), keep = new Set(own.map((x) => x.toLowerCase().replace(/^@/, "")));
  if (!t && !opts2.media) out.push({ code: "empty", msg: "\u0645\u062A\u0646 \u067E\u0633\u062A \u062E\u0627\u0644\u06CC \u0627\u0633\u062A", major: true });
  if (!opts2.agent) return out;
  const foreign = [...t.matchAll(/(^|[^A-Za-z0-9_.])@([A-Za-z0-9_]{4,})/g)].map((m) => m[2]).filter((h) => !keep.has(h.toLowerCase()));
  if (foreign.length) out.push({ code: "handle", msg: `\u0622\u06CC\u062F\u06CC \u06A9\u0627\u0646\u0627\u0644 \u062F\u06CC\u06AF\u0631 \u062F\u0631 \u0645\u062A\u0646 \u0645\u0627\u0646\u062F\u0647: @${foreign[0]}`, major: true });
  const links = [...t.matchAll(/(?:https?:\/\/|www\.)[^\s]+/gi)].map((m) => m[0]).filter((u) => ![...keep].some((h) => u.toLowerCase().includes(h)));
  if (links.length) out.push({ code: "link", msg: `\u0644\u06CC\u0646\u06A9 \u062E\u0627\u0631\u062C\u06CC \u062F\u0631 \u0645\u062A\u0646 \u0645\u0627\u0646\u062F\u0647: ${links[0].slice(0, 60)}`, major: true });
  const lines = t.split("\n").map((l) => l.trim()).filter(Boolean);
  const tail = lines.slice(-2).filter((l) => ![...keep].some((h) => l.toLowerCase().includes(h)));
  if (tail.some((l) => isSigLine(l))) out.push({ code: "promo", msg: "\u0622\u062E\u0631 \u0645\u062A\u0646 \u0634\u0628\u06CC\u0647 \u0627\u0645\u0636\u0627/\u062A\u0628\u0644\u06CC\u063A \u06A9\u0627\u0646\u0627\u0644 \u062F\u06CC\u06AF\u0631\u06CC \u0627\u0633\u062A", major: true });
  if (/(…|\.\.\.)\s*$/.test(t) || /(ادامه\s*(مطلب|ی\s*مطلب|خبر)|بیشتر\s*بخوانید)\s*$/.test(t)) out.push({ code: "cut", msg: "\u0645\u062A\u0646 \u0646\u0627\u0642\u0635/\u0646\u06CC\u0645\u0647\u200C\u06A9\u0627\u0631\u0647 \u0628\u0647 \u0646\u0638\u0631 \u0645\u06CC\u200C\u0631\u0633\u062F (\u2026)", major: false });
  if (/(\bundefined\b|\bnull\b|\[object|{{|}}|\[(?:text|link|متن|لینک)\])/i.test(t)) out.push({ code: "garbage", msg: "\u0645\u062A\u0646 \u0634\u0627\u0645\u0644 \u0646\u0634\u0627\u0646\u0647\u200C\u06CC \u062E\u0631\u0627\u0628 (undefined/\u0642\u0627\u0644\u0628 \u062E\u0627\u0644\u06CC) \u0627\u0633\u062A", major: true });
  return out;
}
function ruleFix(text, own) {
  const keep = own.map((x) => x.toLowerCase().replace(/^@/, ""));
  const isOwn = (l) => keep.some((h) => l.toLowerCase().includes(h));
  let lines = text.split("\n");
  const ownTail = [];
  while (lines.length && (isOwn(lines[lines.length - 1]) || !lines[lines.length - 1].trim())) ownTail.unshift(lines.pop());
  lines = cutSignature(lines.map((l) => l.replace(/[ \t]+$/g, "")), "", "");
  let body = stripHandles(lines.join("\n"), keep);
  body = body.replace(/[ \t]+\n/g, "\n").replace(/\n{3,}/g, "\n\n").trim();
  const sig = ownTail.join("\n").trim();
  return sig ? `${body}

${sig}`.trim() : body;
}
var REVIEW_SYS = `You are the strict supervisor/proof-reader of a Persian content channel. You receive ONE post (about to be published) and must judge it. Check: (1) leftover signature/@id/link/promotion of ANOTHER channel or site, anywhere (especially the last lines); (2) broken, cut-off or garbled sentences; (3) advertising or giveaway content; (4) text that contradicts today's date or the stated task; (5) repeated lines, stray symbols, template placeholders; (6) anything unprofessional. The owner's OWN signature lines (given below) are correct and must be kept exactly. Do not rewrite good text; do not translate; keep Persian typography. Think step by step but briefly: first fill "notes" (max 4 short strings: what you checked and found, line by line for the last 3 lines), THEN decide. A single leftover @id or link line at the end is ALWAYS a problem. When unsure whether a line is the owner's own, compare it with the owner's signature given below. Reply JSON only: {"notes":[string],"ok":boolean,"major":boolean,"problems":[short Persian strings],"fixed_text":string|null}. major=true when publishing it as-is would embarrass the owner. fixed_text = the full corrected text (with the owner's signature) when YOU can fix it by editing the text, else null. If everything is fine: {"ok":true,"major":false,"problems":[],"fixed_text":null}.`;
async function llmReview(env, text, o) {
  const user = `${lessonBlock(o.lessons)}TODAY (Tehran): ${new Date(Date.now() + 126e5).toISOString().slice(0, 10)}
TASK THE POST WAS MADE FOR: ${o.task.slice(0, 400) || "(written by the owner)"}
OWNER'S OWN SIGNATURE/HANDLES: ${o.own || "(none)"}
${o.agent ? "" : "NOTE: the owner wrote this himself: flag only clear technical errors, never his style or opinions.\n"}${o.hasMedia ? "(the post has a photo/video attached; you cannot see it)\n" : ""}
POST:
"""
${text.slice(0, 3e3)}
"""`;
  try {
    const j = await chatJson(env, REVIEW_SYS, user, 1100);
    const problems = (Array.isArray(j.problems) ? j.problems : []).map((x) => String(x).slice(0, 160)).filter(Boolean).slice(0, 5);
    const fixed = typeof j.fixed_text === "string" && j.fixed_text.trim() && j.fixed_text.trim() !== text.trim() ? j.fixed_text.trim().slice(0, 3900) : null;
    const ok = j.ok === true && problems.length === 0;
    return { ok, major: !ok && j.major === true, problems, fixed };
  } catch {
    return null;
  }
}
async function reviewText(env, uid, text, o) {
  const lessons = await getLessons(env, uid);
  const seen = [];
  let cur = text;
  let issues = ruleIssues(cur, o.own, { media: o.hasMedia, agent: o.agent });
  let fixedAny = false;
  if (issues.some((i) => i.code !== "empty" && i.code !== "cut")) {
    seen.push(...issues.map((i) => i.msg));
    const f = ruleFix(cur, o.own);
    if (f && f !== cur) {
      cur = f;
      fixedAny = true;
    }
    issues = ruleIssues(cur, o.own, { media: o.hasMedia, agent: o.agent });
  }
  const v = await llmReview(env, cur, { own: o.ownLine, task: o.task, lessons, hasMedia: o.hasMedia, agent: o.agent });
  if (v && !v.ok) {
    seen.push(...v.problems);
    if (v.fixed) {
      const again = ruleIssues(v.fixed, o.own, { media: o.hasMedia, agent: o.agent });
      if (!again.some((i) => i.major)) {
        cur = v.fixed;
        fixedAny = true;
        issues = again;
      }
    }
    if (!fixedAny || v.major && !v.fixed) {
      if (v.major) return { action: "hold", text: cur, problems: [.../* @__PURE__ */ new Set([...seen, ...issues.map((i) => i.msg)])].slice(0, 6), llm: true };
    }
  }
  const major = issues.filter((i) => i.major);
  if (major.length) return { action: "hold", text: cur, problems: [.../* @__PURE__ */ new Set([...seen, ...major.map((i) => i.msg)])].slice(0, 6), llm: !!v };
  return { action: fixedAny ? "fixed" : "ok", text: cur, problems: [...new Set(seen)].slice(0, 6), llm: !!v };
}
async function learnFromError(env, uid, postText, error, hasMedia, ownLine) {
  const sys = `You are the editor of a Persian content channel. The owner reports an error in a published/pending post. 1) Turn it into ONE short, general, reusable rule (Persian, imperative, max 160 chars) that prevents the same mistake in future posts \u2014 not about this one post only. 2) If the error can be fixed by editing the TEXT, give the full corrected text (keep the owner's own signature lines exactly; change nothing else). If it is about the photo/video, or you cannot fix it by editing text, fixed_text=null and say why in one Persian sentence. Reply JSON only: {"rule":string,"fixed_text":string|null,"why":string}.`;
  const user = `OWNER'S SIGNATURE: ${ownLine || "(none)"}
${hasMedia ? "(the post has a photo/video)\n" : ""}REPORTED ERROR: ${error.slice(0, 600)}

POST TEXT:
"""
${postText.slice(0, 3e3)}
"""`;
  const j = await chatJson(env, sys, user, 1100);
  const fixed = typeof j.fixed_text === "string" && j.fixed_text.trim() && j.fixed_text.trim() !== postText.trim() ? j.fixed_text.trim().slice(0, 3900) : null;
  return { rule: String(j.rule || "").slice(0, 300), fixed, why: String(j.why || "").slice(0, 300) };
}
async function learnFromEdit(env, uid, before, after, ownLine) {
  const norm2 = (l) => l.replace(/\s+/g, " ").trim();
  const A = new Set(after.split("\n").map(norm2)), removed = before.split("\n").map(norm2).filter((l) => l && !A.has(l));
  const sigLeft = removed.filter((l) => /@[A-Za-z0-9_]{4,}|https?:\/\/|www\./i.test(l) || isSigLine(l));
  let rule = sigLeft.length ? "\u0622\u06CC\u062F\u06CC (@\u2026)\u060C \u0644\u06CC\u0646\u06A9\u060C \u0646\u0627\u0645 \u0648 \u0627\u0645\u0636\u0627\u06CC \u06A9\u0627\u0646\u0627\u0644\u200C\u0647\u0627\u06CC \u062F\u06CC\u06AF\u0631 \u0631\u0627 \u062F\u0631 \u0647\u0631 \u062C\u0627\u06CC \u0645\u062A\u0646 (\u0628\u0647\u200C\u0648\u06CC\u0698\u0647 \u0622\u062E\u0631 \u0622\u0646) \u06A9\u0627\u0645\u0644 \u067E\u0627\u06A9 \u06A9\u0646\u061B \u0641\u0642\u0637 \u0627\u0645\u0636\u0627\u06CC \u062E\u0648\u062F \u0645\u0627\u0644\u06A9 \u0628\u0645\u0627\u0646\u062F." : null;
  if (before.trim() === after.trim()) return null;
  try {
    const j = await chatJson(
      env,
      'You compare the BEFORE and AFTER versions of a Persian channel post that the owner corrected by hand. If the change reveals a GENERAL, reusable editing rule (leftover signature/id/link of another channel, wrong wording style, date format, emoji use, length, repeated phrases, etc.) write it as ONE short Persian imperative sentence (max 160 chars) that prevents the same mistake in future posts. Ignore pure content changes of this single post. Reply JSON only: {"rule": string|null}.',
      `OWNER'S SIGNATURE: ${ownLine || "(none)"}

BEFORE:
"""
${before.slice(0, 2200)}
"""

AFTER:
"""
${after.slice(0, 2200)}
"""`,
      500
    );
    if (typeof j.rule === "string" && j.rule.trim().length >= 8) rule = j.rule.trim().slice(0, 200);
  } catch {
  }
  return rule;
}

// eitaa-src/agent.ts
var MAX_STEPS = 9;
var MAX_CHANNELS_PER_RUN = 5;
var MAX_POSTS_PER_RUN = 20;
var RETRY_WINDOW_S = 120 * 60;
var STALE_S = 3 * 3600;
var RUN_BUDGET_MS = 1e5;
var parseJson = (s, d) => {
  try {
    return s ? JSON.parse(s) : d;
  } catch {
    return d;
  }
};
function parseTimes(text) {
  const t = normDigits(text).replace(/،/g, " ");
  if (/(^|\s)(الان|همین ?الان|now)(\s|$)/i.test(t)) return "now";
  const out = /* @__PURE__ */ new Set();
  for (const m of t.matchAll(/(?<!\d)(\d{1,2})[:٫.](\d{2})(?!\d)/g)) {
    const h = +m[1], mi = +m[2];
    if (h > 23 || mi > 59) return null;
    out.add(`${pad2(h)}:${pad2(mi)}`);
  }
  return out.size && out.size <= 8 ? [...out].sort() : null;
}
function describeSchedule(j) {
  if (j.once_at) return `\u06CC\u06A9\u200C\u0628\u0627\u0631\u060C ${fmtDt(j.once_at)}`;
  const times = parseJson(j.times, []), days = parseJson(j.days, null);
  if (!times.length) return "\u0641\u0642\u0637 \u0628\u0627 \u062F\u06A9\u0645\u0647\u200C\u06CC \xAB\u0627\u062C\u0631\u0627 \u0627\u0644\u0627\u0646\xBB";
  const d = days && days.length && days.length < 7 ? days.map((x) => WEEKDAYS[x]).join("\u060C ") : "\u0647\u0631 \u0631\u0648\u0632";
  return `${d}\u060C \u0633\u0627\u0639\u062A ${times.join(" \u0648 ")} (\u0648\u0642\u062A \u062A\u0647\u0631\u0627\u0646)`;
}
async function planJob(env, instruction) {
  const t = now(), l = toLocal(t);
  let r;
  try {
    r = await planWithModel(env, instruction, t, l);
  } catch {
    const tm = parseTimes(instruction);
    return {
      name: instruction.replace(/@\S+/g, "").trim().slice(0, 30) || "\u0627\u06CC\u062C\u0646\u062A",
      times: Array.isArray(tm) ? tm : [],
      days: null,
      onceAt: null,
      summary: "\u0628\u0631\u0646\u0627\u0645\u0647 \u0628\u0627 \u0642\u0648\u0627\u0646\u06CC\u0646 \u0633\u0627\u062F\u0647 \u062E\u0648\u0627\u0646\u062F\u0647 \u0634\u062F: " + (Array.isArray(tm) ? `\u0633\u0627\u0639\u062A ${tm.join(" \u0648 ")} \u0647\u0631 \u0631\u0648\u0632.` : "\u0628\u062F\u0648\u0646 \u0632\u0645\u0627\u0646 \u0645\u0634\u062E\u0635 (\u0641\u0642\u0637 \xAB\u0627\u062C\u0631\u0627 \u0627\u0644\u0627\u0646\xBB).")
    };
  }
  if (!r) return null;
  return planFrom(r, t);
}
var planWithModel = (env, instruction, t, l) => chatJson(
  env,
  `You read a Persian task description for a channel-content agent and extract its schedule. Reply with a JSON object only: {"name": short Persian title (max 30 chars), "times": array of "HH:MM" 24h Tehran times the task runs each day (empty array if no time is stated), "days": null if every day, otherwise array of weekday numbers 0=Sunday,1=Monday,...,6=Saturday (Saturday=\u0634\u0646\u0628\u0647, Friday=\u062C\u0645\u0639\u0647), "once": null, or "YYYY-MM-DD HH:MM" (Gregorian, Tehran time) if the task is a ONE-TIME task (e.g. "tomorrow at 9", "today 18:00"), "summary": one Persian sentence saying exactly what the agent will do}. Now in Tehran: ${l.y}-${pad2(l.mo)}-${pad2(l.d)} ${pad2(l.h)}:${pad2(l.mi)} (${jalaliLong(t)}).`,
  instruction,
  600
);
function planFrom(r, t) {
  const times = Array.isArray(r.times) ? parseTimes(r.times.join(" ")) : null;
  const days = Array.isArray(r.days) ? r.days.map(Number).filter((x) => x >= 0 && x <= 6) : null;
  let onceAt = null;
  const om = typeof r.once === "string" ? r.once.match(/^(\d{4})-(\d{2})-(\d{2})[ T](\d{1,2}):(\d{2})/) : null;
  if (om) {
    onceAt = fromLocal({ y: +om[1], mo: +om[2], d: +om[3], h: +om[4], mi: +om[5] });
    if (onceAt < t + 30) onceAt = t + 60;
  }
  return {
    name: String(r.name || "\u0627\u06CC\u062C\u0646\u062A").slice(0, 40),
    times: onceAt || !Array.isArray(times) ? [] : times,
    days: days && days.length ? days : null,
    onceAt,
    summary: String(r.summary || "").slice(0, 400)
  };
}
function dueSlot(j, t) {
  if (j.run_now) return { key: `manual-${t}`, epoch: t, kind: "manual" };
  if (j.once_at) return !j.last_key && j.once_at <= t ? { key: "once", epoch: j.once_at, kind: "once" } : null;
  const times = parseJson(j.times, []), days = parseJson(j.days, null);
  const l = toLocal(t);
  if (days && days.length && !days.includes(new Date(Date.UTC(l.y, l.mo - 1, l.d)).getUTCDay())) return null;
  for (const hhmm of times) {
    const epoch = atTime(t, hhmm), key2 = slotKey(epoch);
    if (epoch <= t && key2 > j.last_key) return { key: key2, epoch, kind: "daily" };
  }
  return null;
}
async function agentTick(env) {
  if (!await llmReady(env)) return;
  const t = now();
  const jobs = (await env.DB.prepare("SELECT * FROM agent_jobs WHERE enabled=1 AND (retry_at IS NULL OR retry_at<=?) ORDER BY id LIMIT 200").bind(t).all()).results;
  let ran = 0;
  for (const j of jobs) {
    const slot = dueSlot(j, t);
    if (!slot) continue;
    if (slot.kind === "daily" && j.attempts === 0 && t - slot.epoch > STALE_S) {
      await env.DB.prepare("UPDATE agent_jobs SET last_key=? WHERE id=?").bind(slot.key, j.id).run();
      continue;
    }
    if (ran >= 2) break;
    ran++;
    try {
      await runJob(env, j, slot, t);
    } catch (e) {
      console.error("agent job failed", j.id, e.message);
    }
  }
}
async function runJob(env, j, slot, t) {
  const claim = await env.DB.prepare("UPDATE agent_jobs SET retry_at=?, attempts=attempts+1, run_now=0 WHERE id=? AND (retry_at IS NULL OR retry_at<=?) AND attempts=?").bind(t + 300, j.id, t, j.attempts).run();
  if (!claim.meta.changes) return;
  const final = slot.kind === "manual" || j.attempts + 1 >= 3 || t - slot.epoch > RETRY_WINDOW_S;
  let res;
  try {
    res = await runAgent(env, j, slot, final);
  } catch (e) {
    res = { summary: e.message, posts: 0, retryMin: null, error: true };
  }
  const retry = !final && res.retryMin ? Math.min(Math.max(res.retryMin, 2), 30) : 0;
  const info = `${fmtDt(now())} \u2014 ${res.posts} \u067E\u0633\u062A \u2014 ${res.summary}`.slice(0, 500);
  if (retry) {
    await env.DB.prepare("UPDATE agent_jobs SET retry_at=?, last_info=? WHERE id=?").bind(now() + retry * 60, info, j.id).run();
  } else {
    await env.DB.prepare(`UPDATE agent_jobs SET ${slot.kind === "manual" ? "" : "last_key=?, "}retry_at=NULL, attempts=0, last_info=?${slot.kind === "once" ? ", enabled=0" : ""} WHERE id=?`).bind(...slot.kind === "manual" ? [info, j.id] : [slot.key, info, j.id]).run();
  }
  if (!retry && (res.posts === 0 || res.error || slot.kind === "manual"))
    await send(env, j.user_id, `\u{1F916} <b>${esc(j.name || "\u0627\u06CC\u062C\u0646\u062A")}</b>
${res.error ? "\u274C " : ""}${esc(res.summary)}${res.posts ? `
\u{1F4DD} ${res.posts} \u067E\u0633\u062A \u0633\u0627\u062E\u062A\u0647 \u0634\u062F.` : ""}`);
  if (retry) console.log("agent retry", j.id, retry);
}
var PREVIEW = 260;
var PREVIEW_FULL = 1e3;
var MAX_POSTS_SHOWN = 12;
var MAX_AGE_S = 3 * 86400;
async function readChannel(env, st, a, jobId, maxChannels) {
  const cid = normalizeChatId(String(a.channel || "")).replace(/^@/, "");
  if (!/^[A-Za-z0-9_.]{3,64}$/.test(cid) || /^\d+$/.test(cid)) return { error: "invalid channel username" };
  if (!st.channels.has(cid) && st.channels.size >= maxChannels) return { error: `at most ${maxChannels} channels per run` };
  let r = st.channels.get(cid);
  if (!r) {
    r = await fetchChannel(env, cid);
    st.channels.set(cid, r);
  }
  if (!r.ok) return { error: r.note || "could not read channel (is it public?)" };
  const limit = Math.min(Math.max(parseInt(a.limit, 10) || MAX_POSTS_SHOWN, 1), 20), cut = a.full ? PREVIEW_FULL : PREVIEW, t = now();
  const seen = jobId === null ? /* @__PURE__ */ new Set() : new Set((await env.DB.prepare("SELECT k FROM agent_seen WHERE job_id=?").bind(jobId).all()).results.map((x) => x.k));
  let hidden = 0;
  const posts = [];
  for (const m of r.messages.slice().reverse()) {
    const ref = `${cid}/${m.id}`;
    if (seen.has(ref) || m.ts !== null && t - m.ts > MAX_AGE_S) {
      hidden++;
      continue;
    }
    const text = cleanText(m.text, cid, r.title);
    st.refs.set(ref, { image: m.image, text, sticker: m.sticker, video: m.videoUrl, hasVideo: m.video });
    if (posts.length >= limit) continue;
    const d = m.ts ? toLocal(m.ts) : null;
    posts.push({ ref, ...d ? { date: `${d.y}-${pad2(d.mo)}-${pad2(d.d)} ${pad2(d.h)}:${pad2(d.mi)}` } : {}, text: text.slice(0, cut) + (text.length > cut ? "\u2026" : ""), ...m.videoUrl ? { video: 1 } : m.video ? { video_thumb_only: 1 } : m.image && !m.sticker ? { image: 1 } : {}, ...m.sticker ? { sticker: 1 } : {} });
  }
  return { channel: cid, posts, ...hidden ? { hidden_old_or_used: hidden } : {} };
}
function resolvePost(st, a, footer) {
  let text = String(a.text || "").trim();
  const fromRef = a.from_ref ? String(a.from_ref) : "", imageRef = a.image_ref ? String(a.image_ref) : "", videoRef = a.video_ref ? String(a.video_ref) : "";
  const src = fromRef ? st.refs.get(fromRef) : void 0;
  if (fromRef && !src) return { error: "unknown from_ref (use a ref from read_channel)" };
  if (fromRef && !text) text = src.text;
  let media = "", kind = "none";
  const take = (ref) => {
    const r = st.refs.get(ref);
    if (!r) return false;
    if (r.hasVideo && !r.video) return false;
    if (r.video) {
      media = r.video;
      kind = "video";
      return true;
    }
    if (r.image) {
      media = r.image;
      kind = r.sticker ? "sticker" : "image";
      return true;
    }
    return false;
  };
  if (videoRef && !take(videoRef)) return { error: "video_ref has no downloadable video" };
  if (!media && imageRef && !take(imageRef)) return { error: "image_ref has no image/sticker" };
  if (!media && fromRef) take(fromRef);
  if (fromRef && src.hasVideo && !src.video && !a.text) return { error: "this source post is a VIDEO that cannot be downloaded: skip it (do not forward only its text/thumbnail)" };
  if (kind === "sticker") text = "";
  if (!text && !media) return { error: "empty post" };
  const full = text ? text + (footer ? `

${footer}` : "") : "";
  if (full.length > 3900) return { error: "text too long (max ~3900)" };
  return { text: full, media, kind, refs: [fromRef, imageRef, videoRef].filter(Boolean), overflow: !!media && kind !== "sticker" && full.length > 1e3 };
}
var MEDIA_NAME = { sticker: "sticker.webp", video: "video.mp4", image: "", none: "" };
async function insertResolved(env, b, p) {
  const ins = async (kind, text, name, src, runAt, link = "") => (await env.DB.prepare("INSERT INTO ea_posts(user_id,channel_id,kind,text,file_id,file_name,title,silent,pin,view_delete,run_at,status,created_at,src_url,job_id,error) VALUES(?,?,?,?,'',?,'',0,0,0,?,?,?,?,?,?)").bind(b.userId, b.channelId, kind, text, name, runAt, b.status, now(), src, b.jobId, link).run()).meta.last_row_id;
  if (p.kind === "none") return [await ins("text", p.text, "", "", b.runAt)];
  if (p.overflow) {
    const first = await ins("file", "", MEDIA_NAME[p.kind], p.media, b.runAt);
    return [first, await ins("text", p.text, "", "", b.runAt + 30, `follows:${first}`)];
  }
  return [await ins("file", p.text, MEDIA_NAME[p.kind], p.media, b.runAt)];
}
var POST_PARAMS = {
  text: { type: "string", description: "post text; omit when forwarding a source post via from_ref" },
  from_ref: { type: "string", description: "ref of a source post: its full cleaned text is used as-is" },
  image_ref: { type: "string", description: "optional: ref of another post whose image/sticker to attach (from_ref already brings its own photo/video automatically)" },
  video_ref: { type: "string", description: "optional: ref of a post whose video to attach" }
};
var TOOLS = (final) => [
  { type: "function", function: {
    name: "read_channel",
    description: "Latest unused posts of a PUBLIC Eitaa channel (@id), newest first, short previews. image/video/sticker=1 flags media.",
    parameters: { type: "object", properties: { channel: { type: "string" }, full: { type: "boolean", description: "longer previews (only if you must rewrite)" } }, required: ["channel"] }
  } },
  { type: "function", function: {
    name: "post_to_channel",
    description: "Publish to the owner's channel (his signature is appended by the system). Call it ONCE per post, all posts in the same step.",
    parameters: { type: "object", properties: { ...POST_PARAMS, delay_minutes: { type: "integer", description: "0-720; spread several posts" } } }
  } },
  ...final ? [] : [{ type: "function", function: {
    name: "retry_later",
    description: "The needed content does not exist YET (e.g. today's post not published). Retry the whole task later. Only if nothing was published.",
    parameters: { type: "object", properties: { minutes: { type: "integer", description: "5-30" }, reason: { type: "string" } }, required: ["minutes", "reason"] }
  } }]
];
var AD_RE = /تبلیغ|قرعه.?کشی|جایزه|تخفیف|فروش ویژه|ثبت.?نام|سفارش|خرید|کد تخفیف|عضو شوید|لینک عضویت|join|https?:\/\/t\.me|بنر/i;
var STOP = new Set("\u0627\u0632 \u062F\u0631 \u0628\u0647 \u0628\u0627 \u06A9\u0647 \u0631\u0627 \u0627\u06CC\u0646 \u0622\u0646 \u0628\u0631\u0627\u06CC \u0648 \u06CC\u0627 \u0647\u0631 \u0631\u0648\u0632 \u0633\u0627\u0639\u062A \u0635\u0628\u062D \u0638\u0647\u0631 \u0634\u0628 \u06A9\u0627\u0646\u0627\u0644 \u06A9\u0627\u0646\u0627\u0644\u0645 \u06A9\u0627\u0646\u0627\u0644\u200C\u0647\u0627\u06CC \u0645\u0637\u0644\u0628 \u0645\u0637\u0627\u0644\u0628 \u067E\u0633\u062A \u0628\u06CC\u0627\u0648\u0631 \u0628\u06AF\u0630\u0627\u0631 \u0628\u0630\u0627\u0631 \u0628\u06AF\u06CC\u0631 \u062F\u0631\u0628\u0627\u0631\u0647 \u0645\u0641\u06CC\u062F \u0628\u0627\u0634\u062F \u0646\u0628\u0627\u0634\u062F \u062A\u0628\u0644\u06CC\u063A \u0627\u0645\u0631\u0648\u0632 \u062A\u0627\u0631\u06CC\u062E \u0647\u0645\u0627\u0646 \u062F\u0642\u06CC\u0642\u0627 \u062F\u0642\u06CC\u0642\u0627\u064B \u0686\u0646\u062F \u06CC\u06A9 \u062F\u0648 \u0633\u0647 \u0628\u0627\u0631 \u0628\u0639\u062F \u0642\u0628\u0644 \u062E\u0648\u062F\u062A \u0628\u0646\u0648\u06CC\u0633".split(/\s+/));
var words2 = (t) => normDigits(t).replace(/[^\p{L}\p{N}\s]/gu, " ").split(/\s+/).filter((w) => w.length >= 3 && !STOP.has(w));
async function heuristicRun(env, j, t, why = "") {
  const lead = /سهمیه|نیمه‌شب|محدود/.test(why) || !why ? "\u0633\u0647\u0645\u06CC\u0647\u200C\u06CC \u0647\u0648\u0634 \u0645\u0635\u0646\u0648\u0639\u06CC \u062A\u0645\u0627\u0645 \u0628\u0648\u062F" : `\u0647\u0648\u0634 \u0645\u0635\u0646\u0648\u0639\u06CC \u062E\u0637\u0627 \u062F\u0627\u062F (${why.replace(/\s+/g, " ").slice(0, 160)})`;
  const instr = j.instruction, srcs = [...new Set([...instr.matchAll(/@([A-Za-z0-9_.]{3,64})/g)].map((m) => m[1]))].filter((c) => c.toLowerCase() !== "").slice(0, MAX_CHANNELS_PER_RUN);
  if (!srcs.length) return { summary: `${lead} \u0648 \u0627\u06CC\u0646 \u06A9\u0627\u0631 \u0645\u0646\u0628\u0639 \u0645\u0634\u062E\u0635\u06CC (@\u06A9\u0627\u0646\u0627\u0644) \u0646\u062F\u0627\u0631\u062F \u06A9\u0647 \u0628\u0627 \u0642\u0648\u0627\u0646\u06CC\u0646 \u0633\u0627\u062F\u0647 \u0627\u0646\u062C\u0627\u0645 \u0634\u0648\u062F.`, posts: 0, retryMin: null, error: true };
  const wc = wantedCounts(instr), want = wc.max || 1;
  const needDate = /تاریخ/.test(instr), topic = new Set(words2(instr.replace(/@\S+/g, "")));
  const st = { channels: /* @__PURE__ */ new Map(), refs: /* @__PURE__ */ new Map() };
  const cands = [];
  const recent = (await env.DB.prepare("SELECT text FROM ea_posts WHERE job_id=? AND created_at>? AND status IN ('pending','draft','sending','sent')").bind(j.id, t - 3 * 86400).all()).results;
  const recentNorm = new Set(recent.map((r) => norm(r.text).replace(/\s+/g, " ").slice(0, 120)));
  for (const c of srcs) {
    const res = await readChannel(env, st, { channel: c, limit: 20 }, j.id, MAX_CHANNELS_PER_RUN);
    for (const p of res.posts || []) {
      const r = st.refs.get(p.ref);
      if (r.sticker || AD_RE.test(r.text) || r.text.length < 40 && !r.image && !r.video) continue;
      if (needDate && !(mentionsDay(r.text, t) && !mentionsOtherDate(r.text, t))) continue;
      const hit = words2(r.text).filter((w) => topic.has(w)).length;
      if (!needDate && topic.size > 2 && hit === 0) continue;
      cands.push({ ref: p.ref, score: hit + Math.min(r.text.length, 600) / 600, r });
    }
  }
  cands.sort((a, b) => b.score - a.score);
  let n = 0;
  for (const c of cands) {
    if (n >= want) break;
    const q = resolvePost(st, { from_ref: c.ref }, j.footer);
    if ("error" in q) continue;
    const sig = norm(q.text).replace(/\s+/g, " ").slice(0, 120);
    if (recentNorm.has(sig)) continue;
    recentNorm.add(sig);
    const draft = !!j.approve;
    const ids = await insertResolved(env, { userId: j.user_id, channelId: j.channel_id, jobId: j.id, status: draft ? "draft" : "pending", runAt: now() + n * 20 * 60 }, q);
    await env.DB.prepare("INSERT OR IGNORE INTO agent_seen(job_id,k,seen_at) VALUES(?,?,?)").bind(j.id, c.ref, now()).run();
    if (draft) await send(env, j.user_id, `\u{1F4DD} <b>\u067E\u06CC\u0634\u200C\u0646\u0648\u06CC\u0633 \u0627\u06CC\u062C\u0646\u062A \xAB${esc(j.name)}\xBB</b> (#${ids[0]})${q.kind !== "none" ? q.kind === "video" ? " \u{1F3AC}" : " \u{1F5BC}" : ""}

${esc(q.text.slice(0, 1500))}`, ikb([[["\u2705 \u0627\u0646\u062A\u0634\u0627\u0631", `ag:go:${ids[0]}`], ["\u{1F5D1} \u062D\u0630\u0641", `ag:no:${ids[0]}`]]]));
    n++;
  }
  return { summary: n ? `${lead}\u061B \u0628\u0627 \u0645\u0648\u062A\u0648\u0631 \u0642\u0627\u0646\u0648\u0646\u200C\u0645\u062D\u0648\u0631 ${n} \u067E\u0633\u062A \u0627\u0646\u062A\u062E\u0627\u0628 \u0634\u062F.` : `${lead} \u0648 \u0645\u0637\u0644\u0628 \u0645\u0646\u0627\u0633\u0628\u06CC \u0647\u0645 \u0628\u0627 \u0642\u0648\u0627\u0646\u06CC\u0646 \u0633\u0627\u062F\u0647 \u067E\u06CC\u062F\u0627 \u0646\u0634\u062F.`, posts: n, retryMin: null };
}
function wantedCounts(instr) {
  const t = normDigits(instr);
  const mn = t.match(/حداقل\s*(\d{1,2})/), mx = t.match(/حداکثر\s*(\d{1,2})/) || t.match(/(\d{1,2})\s*(?:تا)?\s*(?:مطلب|پست|محتوا|خبر|مورد)/);
  const max = Math.min(mx ? +mx[1] : mn ? Math.max(+mn[1], 1) : 0, MAX_POSTS_PER_RUN), min = Math.min(mn ? +mn[1] : 0, max || MAX_POSTS_PER_RUN);
  return { min, max };
}
async function runAgent(env, j, slot, final) {
  const ch = await getChannel(env, j.channel_id);
  if (!ch || ch.user_id !== j.user_id) return { summary: "\u06A9\u0627\u0646\u0627\u0644 \u0645\u0642\u0635\u062F \u062F\u06CC\u06AF\u0631 \u0648\u062C\u0648\u062F \u0646\u062F\u0627\u0631\u062F.", posts: 0, retryMin: null, error: true };
  const t0 = Date.now(), t = now(), l = toLocal(t);
  const recent = (await env.DB.prepare("SELECT text FROM ea_posts WHERE job_id=? AND created_at>? AND status IN ('pending','draft','sending','sent') ORDER BY id DESC LIMIT 6").bind(j.id, t - 3 * 86400).all()).results;
  const state = { diag: [], posts: 0, retryMin: null, summary: "", done: false, channels: /* @__PURE__ */ new Map(), refs: /* @__PURE__ */ new Map() };
  const recentNorm = new Set(recent.map((r) => norm(r.text).replace(/\s+/g, " ").slice(0, 120)));
  const want = wantedCounts(j.instruction);
  const lessons = await getLessons(env, j.user_id);
  const system = `You run a task for an Eitaa channel owner. Reply/write in Persian. Use tools; be brief.
TASK:
${j.instruction}

Today (Tehran): ${jalaliLong(t)} | ${l.y}-${pad2(l.mo)}-${pad2(l.d)} ${pad2(l.h)}:${pad2(l.mi)}
Rules: read only channels named in the task. Never invent posts. To forward a source post use post_to_channel(from_ref) \u2014 never retype it; to rewrite, write text yourself (no source names/@ids/links). Skip ads/giveaways/off-topic. No near-duplicates of RECENT. "N posts" = maximum; fewer is fine unless a minimum is stated. ` + (want.max ? `Publish ${want.min ? `at least ${want.min} and ` : ""}at most ${want.max} posts in this run (read more channels/posts if needed to reach the minimum; never repost the same content). ` : "") + `Spread several posts through the day with delay_minutes (0-720). If the task needs a source channel it does not name, say so in one Persian sentence instead of guessing. A required date must be today's; a source post showing another date is unacceptable. ` + (final ? "LAST attempt: if no suitable source post exists, write the post yourself per the task and publish it. " : "If the needed content does not exist yet and you published nothing, call retry_later. ") + `QUALITY: pick only complete, useful, recent, on-topic posts; skip cut-off texts ("\u2026", "\u0627\u062F\u0627\u0645\u0647 \u0645\u0637\u0644\u0628"), teasers that only point to a link/another channel, ads, duplicates of each other, and posts with video_thumb_only (their video is not available). Never leave any source channel's name, @id, link, "join us"/"\u0639\u0636\u0648 \u0634\u0648\u06CC\u062F" line or signature in a post (the system adds the owner's signature itself). Keep a source post's wording; rewrite only when the task asks. When done with nothing to publish, answer with one short Persian sentence explaining why.
` + lessonBlock(lessons) + `RECENT:
${recent.length ? recent.map((r) => `- ${r.text.replace(/\s+/g, " ").slice(0, 70)}`).join("\n") : "(none)"}`;
  let postedThisStep = 0;
  const exec = async (name, a) => {
    switch (name) {
      case "read_channel": {
        const r = await readChannel(env, state, a, j.id, MAX_CHANNELS_PER_RUN);
        state.diag.push(r?.error ? `@${a.channel}: ${r.error}` : `@${a.channel}: ${r?.posts?.length ?? 0} \u067E\u0633\u062A \u062A\u0627\u0632\u0647 (${r?.hidden ?? 0} \u0645\u0648\u0631\u062F \u0642\u0628\u0644\u0627\u064B \u0627\u0633\u062A\u0641\u0627\u062F\u0647 \u0634\u062F\u0647/\u0642\u062F\u06CC\u0645\u06CC)`);
        return r;
      }
      case "post_to_channel": {
        if (state.posts >= MAX_POSTS_PER_RUN) return { error: "post limit for this run reached" };
        const p = resolvePost(state, a, j.footer);
        if ("error" in p) return p;
        const sig = norm(p.text).replace(/\s+/g, " ").slice(0, 120);
        if (sig && recentNorm.has(sig)) return { error: "duplicate of something already published" };
        const delay = Math.min(Math.max(parseInt(a.delay_minutes, 10) || 0, 0), 720), draft = !!j.approve;
        const ids = await insertResolved(env, { userId: j.user_id, channelId: j.channel_id, jobId: j.id, status: draft ? "draft" : "pending", runAt: now() + delay * 60 }, p);
        const postId = ids[0];
        recentNorm.add(sig);
        state.posts++;
        postedThisStep++;
        const keys = [...new Set(p.refs)].filter((k) => /^[A-Za-z0-9_.]+\/\d+$/.test(k));
        if (keys.length) await env.DB.batch(keys.map((k) => env.DB.prepare("INSERT OR IGNORE INTO agent_seen(job_id,k,seen_at) VALUES(?,?,?)").bind(j.id, k, now())));
        if (draft) await send(env, j.user_id, `\u{1F4DD} <b>\u067E\u06CC\u0634\u200C\u0646\u0648\u06CC\u0633 \u0627\u06CC\u062C\u0646\u062A \xAB${esc(j.name)}\xBB</b> (#${postId})${p.kind === "video" ? " \u{1F3AC}" : p.kind !== "none" ? " \u{1F5BC}" : ""}

${esc(p.text.slice(0, 1500))}`, ikb([[["\u2705 \u0627\u0646\u062A\u0634\u0627\u0631", `ag:go:${postId}`], ["\u{1F5D1} \u062D\u0630\u0641", `ag:no:${postId}`]]]));
        return { ok: true, post_id: postId, media: p.kind };
      }
      case "retry_later": {
        if (final) return { error: "not allowed in the last attempt \u2014 publish now" };
        if (state.posts) return { error: "you already published in this run" };
        state.retryMin = Math.min(Math.max(parseInt(a.minutes, 10) || 10, 5), 30);
        state.summary = String(a.reason || "").slice(0, 300);
        state.done = true;
        return { ok: true };
      }
    }
    return { error: `unknown tool ${name}` };
  };
  const messages = [{ role: "system", content: system }, { role: "user", content: "Go." }];
  const tools = TOOLS(final);
  let empties = 0;
  for (let step = 0; step < MAX_STEPS && !state.done; step++) {
    if (Date.now() - t0 > RUN_BUDGET_MS) {
      state.summary ||= "\u0632\u0645\u0627\u0646 \u0627\u062C\u0631\u0627 \u062A\u0645\u0627\u0645 \u0634\u062F.";
      break;
    }
    let m;
    try {
      m = await chatTools(env, messages, tools, 45e3, 1600);
    } catch (e) {
      if (!state.posts) return heuristicRun(env, j, t, e.message);
      throw e;
    }
    messages.push(m);
    if (!m.tool_calls?.length) {
      const txt = (m.content || "").trim();
      if (txt) {
        if (want.min && state.posts < want.min && state.posts > 0 && step < MAX_STEPS - 1 && empties++ < 1) {
          messages.push({ role: "user", content: `You published ${state.posts}; the task needs at least ${want.min}. Read more posts/channels and publish more now.` });
          continue;
        }
        state.summary ||= txt.slice(0, 400);
        break;
      }
      if (empties++ < 1) {
        messages.push({ role: "user", content: "Your reply was empty. Call a tool now (read_channel / post_to_channel), or explain in one Persian sentence why nothing can be done." });
        continue;
      }
      if (!state.posts) return heuristicRun(env, j, t, "\u0645\u062F\u0644 \u067E\u0627\u0633\u062E \u062E\u0627\u0644\u06CC \u062F\u0627\u062F");
      break;
    }
    postedThisStep = 0;
    for (const c of m.tool_calls) {
      let out;
      try {
        out = await exec(c.function.name, JSON.parse(c.function.arguments || "{}"));
      } catch (e) {
        out = { error: e.message };
      }
      messages.push({ role: "tool", tool_call_id: c.id, content: JSON.stringify(out).slice(0, 12e3) });
    }
    if (postedThisStep > 0) {
      if (want.min && state.posts < want.min && step < MAX_STEPS - 1) continue;
      state.done = true;
      state.summary ||= `${state.posts} \u067E\u0633\u062A \u0633\u0627\u062E\u062A\u0647 \u0634\u062F.`;
    }
  }
  if (!state.posts && !state.retryMin && !state.summary) {
    const h = await heuristicRun(env, j, t, "\u0645\u062F\u0644 \u06A9\u0627\u0631\u06CC \u0627\u0646\u062C\u0627\u0645 \u0646\u062F\u0627\u062F");
    if (h.posts) return h;
    state.summary = `\u06A9\u0627\u0631\u06CC \u0627\u0646\u062C\u0627\u0645 \u0646\u0634\u062F. ${state.diag.length ? "\u0628\u0631\u0631\u0633\u06CC: " + state.diag.join(" | ") : "\u0647\u06CC\u0686 \u06A9\u0627\u0646\u0627\u0644 \u0645\u0646\u0628\u0639\u06CC \u062E\u0648\u0627\u0646\u062F\u0647 \u0646\u0634\u062F (\u062F\u0631 \u062F\u0633\u062A\u0648\u0631 \u0627\u06CC\u062C\u0646\u062A \u06CC\u06A9 @\u0646\u0627\u0645_\u06A9\u0627\u0646\u0627\u0644 \u0628\u0646\u0648\u06CC\u0633\u06CC\u062F)."}`;
  } else if (!state.posts && state.summary && state.diag.length) state.summary += ` (${state.diag.join(" | ")})`;
  if (!state.summary) state.summary = "\u0627\u0646\u062C\u0627\u0645 \u0634\u062F.";
  return { summary: state.summary, posts: state.posts, retryMin: state.retryMin };
}

// eitaa-src/agentui.ts
var MAX_JOBS = 5;
var GUIDE = "\u270D\uFE0F <b>\u0628\u0647 \u0627\u06CC\u062C\u0646\u062A \u0628\u06AF\u0648\u06CC\u06CC\u062F \u0686\u0647 \u06A9\u0627\u0631\u06CC \u0627\u0646\u062C\u0627\u0645 \u062F\u0647\u062F</b> (\u0628\u0627 \u0632\u0628\u0627\u0646 \u0633\u0627\u062F\u0647\u060C \u0647\u0631 \u0686\u0647 \u0645\u06CC\u200C\u062E\u0648\u0627\u0647\u06CC\u062F):\n\n\u2022 <i>\u0647\u0631 \u0631\u0648\u0632 \u0633\u0627\u0639\u062A \u06F7 \u0635\u0628\u062D \u0627\u0632 \u06A9\u0627\u0646\u0627\u0644 @goodmorning_ch \u067E\u06CC\u0627\u0645 \u0635\u0628\u062D\u200C\u0628\u062E\u06CC\u0631 \u0627\u0645\u0631\u0648\u0632 \u0631\u0627 (\u0647\u0645\u0627\u0646 \u06A9\u0647 \u062A\u0627\u0631\u06CC\u062E \u0627\u0645\u0631\u0648\u0632 \u062F\u0627\u0631\u062F) \u062F\u0631 \u06A9\u0627\u0646\u0627\u0644\u0645 \u0628\u06AF\u0630\u0627\u0631</i>\n\u2022 <i>\u0631\u0648\u0632\u06CC \u06F3 \u0628\u0627\u0631\u060C \u0633\u0627\u0639\u062A \u06F9 \u0648 \u06F1\u06F4 \u0648 \u06F2\u06F0\u060C \u0627\u0632 \u06A9\u0627\u0646\u0627\u0644\u200C\u0647\u0627\u06CC @a \u0648 @b \u062F\u0648 \u0645\u0637\u0644\u0628 \u0645\u0641\u06CC\u062F \u062F\u0631\u0628\u0627\u0631\u0647\u200C\u06CC \u0648\u0631\u0632\u0634 \u0628\u06CC\u0627\u0648\u0631\u061B \u062A\u0628\u0644\u06CC\u063A \u0646\u0628\u0627\u0634\u062F</i>\n\u2022 <i>\u0647\u0631 \u0634\u0628 \u0633\u0627\u0639\u062A \u06F2\u06F1 \u06CC\u06A9 \u062C\u0645\u0644\u0647\u200C\u06CC \u0627\u0646\u06AF\u06CC\u0632\u0634\u06CC \u06A9\u0648\u062A\u0627\u0647 \u062E\u0648\u062F\u062A \u0628\u0646\u0648\u06CC\u0633 \u0648 \u0628\u06AF\u0630\u0627\u0631</i>\n\n\u0633\u0627\u0639\u062A\u060C \u0631\u0648\u0632 \u0648 \u06A9\u0627\u0646\u0627\u0644\u200C\u0647\u0627\u06CC \u0645\u0646\u0628\u0639 \u0631\u0627 \u062F\u0627\u062E\u0644 \u0647\u0645\u06CC\u0646 \u0645\u062A\u0646 \u0628\u0646\u0648\u06CC\u0633\u06CC\u062F. (\u0641\u0642\u0637 \u06A9\u0627\u0646\u0627\u0644\u200C\u0647\u0627\u06CC <b>\u0639\u0645\u0648\u0645\u06CC</b> \u0627\u06CC\u062A\u0627 \u062E\u0648\u0627\u0646\u062F\u0647 \u0645\u06CC\u200C\u0634\u0648\u0646\u062F.)\n\u0644\u063A\u0648: /cancel";
async function home2(env, u) {
  const ready = await llmReady(env);
  if (!ready) return void await send(env, u.id, "\u23F3 \u0627\u06CC\u062C\u0646\u062A \u0647\u0648\u0634\u0645\u0646\u062F \u0647\u0646\u0648\u0632 \u0641\u0639\u0627\u0644 \u0646\u0634\u062F\u0647 \u0627\u0633\u062A (\u0628\u0627\u06CC\u0646\u062F\u06CC\u0646\u06AF AI \u062F\u0631 wrangler.jsonc \u0641\u0639\u0627\u0644 \u0646\u06CC\u0633\u062A).");
  const jobs = await userJobs(env, u.id);
  const rows = jobs.map((j) => [[`${j.enabled ? "\u{1F7E2}" : "\u26AA\uFE0F"} ${j.name || "\u0627\u06CC\u062C\u0646\u062A " + j.id}`.slice(0, 40), `ag:v:${j.id}`]]);
  if (jobs.length < MAX_JOBS) rows.push([["\u2795 \u0627\u06CC\u062C\u0646\u062A \u062C\u062F\u06CC\u062F", "ag:new"]]);
  await send(env, u.id, jobs.length ? "<b>\u{1F916} \u0627\u06CC\u062C\u0646\u062A\u200C\u0647\u0627\u06CC \u0634\u0645\u0627</b>" : "\u{1F916} <b>\u0627\u06CC\u062C\u0646\u062A \u0647\u0648\u0634\u0645\u0646\u062F</b>\n\u06A9\u0627\u0631\u06CC \u06A9\u0647 \u0645\u06CC\u200C\u062E\u0648\u0627\u0647\u06CC\u062F \u062E\u0648\u062F\u06A9\u0627\u0631 \u0627\u0646\u062C\u0627\u0645 \u0634\u0648\u062F \u0631\u0627 \u0628\u0647 \u0632\u0628\u0627\u0646 \u0633\u0627\u062F\u0647 \u0628\u06AF\u0648\u06CC\u06CC\u062F\u061B \u0627\u06CC\u062C\u0646\u062A \u062F\u0631 \u0633\u0627\u0639\u062A \u062A\u0639\u06CC\u06CC\u0646\u200C\u0634\u062F\u0647 \u0622\u0646 \u0631\u0627 \u0627\u0646\u062C\u0627\u0645 \u0645\u06CC\u200C\u062F\u0647\u062F.", ikb(rows));
}
var view = async (env, j) => {
  const ch = await getChannel(env, j.channel_id);
  return {
    text: `<b>\u{1F916} ${esc(j.name || "\u0627\u06CC\u062C\u0646\u062A")}</b> ${j.enabled ? "\u{1F7E2} \u0641\u0639\u0627\u0644" : "\u26AA\uFE0F \u063A\u06CC\u0631\u0641\u0639\u0627\u0644"}

\u{1F4E3} \u06A9\u0627\u0646\u0627\u0644 \u0645\u0642\u0635\u062F: ${esc(ch?.title || "\u061F")}
\u23F0 ${esc(describeSchedule(j))}
\u2705 \u062A\u0623\u06CC\u06CC\u062F \u062F\u0633\u062A\u06CC \u0642\u0628\u0644 \u0627\u0632 \u0627\u0646\u062A\u0634\u0627\u0631: ${j.approve ? "\u0631\u0648\u0634\u0646" : "\u062E\u0627\u0645\u0648\u0634"}
\u{1F58B} \u0627\u0645\u0636\u0627: ${j.footer ? "\n<code>" + esc(j.footer.slice(0, 200)) + "</code>" : "\u0646\u062F\u0627\u0631\u062F"}

\u{1F4DD} \u062F\u0633\u062A\u0648\u0631:
${esc(j.instruction.slice(0, 700))}` + (j.last_info ? `

\u{1F558} \u0622\u062E\u0631\u06CC\u0646 \u0627\u062C\u0631\u0627: ${esc(j.last_info)}` : ""),
    kb: ikb([
      [["\u25B6\uFE0F \u0627\u062C\u0631\u0627 \u0627\u0644\u0627\u0646", `ag:run:${j.id}`], [j.enabled ? "\u23F8 \u062A\u0648\u0642\u0641" : "\u25B6\uFE0F \u0641\u0639\u0627\u0644\u200C\u0633\u0627\u0632\u06CC", `ag:tg:${j.id}`]],
      [["\u270F\uFE0F \u062F\u0633\u062A\u0648\u0631", `ag:ed:${j.id}`], ["\u23F0 \u0632\u0645\u0627\u0646\u200C\u0647\u0627", `ag:tm:${j.id}`], ["\u{1F58B} \u0627\u0645\u0636\u0627", `ag:ft:${j.id}`]],
      [[`\u2705 \u062A\u0623\u06CC\u06CC\u062F \u062F\u0633\u062A\u06CC: ${j.approve ? "\u0631\u0648\u0634\u0646" : "\u062E\u0627\u0645\u0648\u0634"}`, `ag:ap:${j.id}`]],
      [["\u{1F5D1} \u062D\u0630\u0641", `ag:del:${j.id}`]]
    ])
  };
};
async function show(env, uid, j, mid) {
  const v = await view(env, j);
  if (mid) await edit(env, uid, mid, v.text, v.kb);
  else await send(env, uid, v.text, v.kb);
}
async function askInstruction(env, uid, data) {
  await setSession(env, uid, "ag_instr", data);
  await send(env, uid, GUIDE);
}
async function confirm(env, uid, d) {
  const plan = d.plan, ch = await getChannel(env, d.channel_id);
  const sched = describeSchedule({ times: JSON.stringify(plan.times), days: plan.days ? JSON.stringify(plan.days) : null, once_at: plan.onceAt });
  await setSession(env, uid, "ag_confirm", d);
  await send(
    env,
    uid,
    `<b>\u{1F916} ${esc(plan.name)}</b>

${esc(plan.summary)}

\u{1F4E3} \u06A9\u0627\u0646\u0627\u0644 \u0645\u0642\u0635\u062F: ${esc(ch?.title || "\u061F")}
\u23F0 ${esc(sched)}
\u{1F58B} \u0627\u0645\u0636\u0627: ${d.footer ? "\n<code>" + esc(d.footer) + "</code>" : "\u0646\u062F\u0627\u0631\u062F"}

${/@[A-Za-z0-9_]{4,}/.test(String(d.instruction || "")) || /خودت\s*(بنویس|تولید)|بنویس/.test(String(d.instruction || "")) ? "" : "\n\u26A0\uFE0F \u062F\u0631 \u062F\u0633\u062A\u0648\u0631 \u0647\u06CC\u0686 \u06A9\u0627\u0646\u0627\u0644 \u0645\u0646\u0628\u0639\u06CC (\u0645\u062B\u0644 @\u0646\u0627\u0645_\u06A9\u0627\u0646\u0627\u0644) \u0646\u0646\u0648\u0634\u062A\u0647\u200C\u0627\u06CC\u062F\u061B \u0627\u06CC\u062C\u0646\u062A \u0646\u0645\u06CC\u200C\u062F\u0627\u0646\u062F \u0627\u0632 \u06A9\u062C\u0627 \u0645\u062D\u062A\u0648\u0627 \u0628\u0631\u062F\u0627\u0631\u062F. \u0628\u0647\u062A\u0631 \u0627\u0633\u062A \xAB\u270F\uFE0F \u062A\u063A\u06CC\u06CC\u0631 \u062F\u0633\u062A\u0648\u0631\xBB \u0628\u0632\u0646\u06CC\u062F \u0648 @\u06A9\u0627\u0646\u0627\u0644 \u0645\u0646\u0628\u0639 \u0631\u0627 \u0628\u0646\u0648\u06CC\u0633\u06CC\u062F.\n"}
\u0628\u0631\u0627\u06CC \u0633\u0627\u062E\u062A \u062A\u0623\u06CC\u06CC\u062F \u06A9\u0646\u06CC\u062F \u{1F447}`,
    ikb([[["\u2705 \u0633\u0627\u062E\u062A \u0627\u06CC\u062C\u0646\u062A", "ag:mk"], ["\u270F\uFE0F \u062A\u063A\u06CC\u06CC\u0631 \u062F\u0633\u062A\u0648\u0631", "ag:redo"]], [["\u274C \u0644\u063A\u0648", "ag:x"]]])
  );
}
async function createJob(env, uid, d) {
  const plan = d.plan, t = now();
  const r = await env.DB.prepare("INSERT INTO agent_jobs(user_id,channel_id,name,instruction,times,days,once_at,footer,last_key,created_at) VALUES(?,?,?,?,?,?,?,?,?,?)").bind(
    uid,
    d.channel_id,
    plan.name,
    d.instruction,
    JSON.stringify(plan.times),
    plan.days ? JSON.stringify(plan.days) : null,
    plan.onceAt,
    d.footer || "",
    plan.onceAt ? "" : slotKey(t),
    t
  ).run();
  return await getJob(env, r.meta.last_row_id);
}
var WHEN_HELP = "\u23F0 \u0633\u0627\u0639\u062A \u0627\u062C\u0631\u0627 \u0631\u0627 \u0628\u0641\u0631\u0633\u062A\u06CC\u062F (\u0648\u0642\u062A \u062A\u0647\u0631\u0627\u0646)\u060C \u0645\u062B\u0644\u0627\u064B <code>07:00</code> \u06CC\u0627 <code>09:00 14:00 20:00</code> (\u0647\u0631 \u0631\u0648\u0632).\n\u0628\u0631\u0627\u06CC \u06CC\u06A9\u200C\u0628\u0627\u0631 \u0627\u062C\u0631\u0627 \u0647\u0645\u06CC\u0646 \u0627\u0644\u0627\u0646: <code>\u0627\u0644\u0627\u0646</code>";
async function onText(c, user, admin, state, d, text) {
  const { env } = c, uid = user.id;
  switch (state) {
    case "ag_instr": {
      if (text.length < 10) return void await send(env, uid, "\u062F\u0633\u062A\u0648\u0631 \u062E\u06CC\u0644\u06CC \u06A9\u0648\u062A\u0627\u0647 \u0627\u0633\u062A\u061B \u06A9\u0645\u06CC \u06A9\u0627\u0645\u0644\u200C\u062A\u0631 \u0628\u0646\u0648\u06CC\u0633\u06CC\u062F (\u06CC\u0627 /cancel).");
      if (text.length > 2e3) return void await send(env, uid, "\u062F\u0633\u062A\u0648\u0631 \u0628\u06CC\u0634 \u0627\u0632 \u06F2\u06F0\u06F0\u06F0 \u0646\u0648\u06CC\u0633\u0647 \u0627\u0633\u062A\u061B \u06A9\u0648\u062A\u0627\u0647\u200C\u062A\u0631\u0634 \u06A9\u0646\u06CC\u062F.");
      d.instruction = text;
      await setSession(env, uid, "ag_footer", d);
      return void await send(env, uid, "\u{1F58B} <b>\u0627\u0645\u0636\u0627\u06CC \u062B\u0627\u0628\u062A \u067E\u0627\u06CC\u06CC\u0646 \u0647\u0631 \u067E\u0633\u062A</b> \u0631\u0627 \u0628\u0641\u0631\u0633\u062A\u06CC\u062F (\u0645\u062B\u0644\u0627\u064B \u0622\u06CC\u062F\u06CC \u0648 \u0645\u0639\u0631\u0641\u06CC \u06A9\u0627\u0646\u0627\u0644 \u062E\u0648\u062F\u062A\u0627\u0646). \u062F\u0642\u06CC\u0642\u0627\u064B \u0647\u0645\u0627\u0646\u200C\u0637\u0648\u0631 \u06A9\u0647 \u0628\u0646\u0648\u06CC\u0633\u06CC\u062F \u0632\u06CC\u0631 \u0647\u0631 \u067E\u0633\u062A \u06AF\u0630\u0627\u0634\u062A\u0647 \u0645\u06CC\u200C\u0634\u0648\u062F.\n\u0628\u062F\u0648\u0646 \u0627\u0645\u0636\u0627: <code>-</code>");
    }
    case "ag_footer": {
      d.footer = text === "-" ? "" : text.slice(0, 500);
      await send(env, uid, "\u{1F50E} \u062F\u0631 \u062D\u0627\u0644 \u062A\u062D\u0644\u06CC\u0644 \u062F\u0633\u062A\u0648\u0631\u2026");
      let plan = null, why = "\u067E\u0627\u0633\u062E \u0642\u0627\u0628\u0644\u200C\u0641\u0647\u0645\u06CC \u0646\u06AF\u0631\u0641\u062A\u0645";
      try {
        plan = await planJob(env, String(d.instruction));
      } catch (e) {
        why = e.message;
      }
      if (!plan) {
        await setSession(env, uid, "ag_footer", d);
        return void await send(env, uid, `\u274C ${esc(why)}.
\u0645\u0634\u06A9\u0644 \u06A9\u0647 \u0628\u0631\u0637\u0631\u0641 \u0634\u062F\u060C \u062F\u0648\u0628\u0627\u0631\u0647 \u0627\u0645\u0636\u0627 \u0631\u0627 (\u06CC\u0627 <code>-</code>) \u0628\u0641\u0631\u0633\u062A\u06CC\u062F \u062A\u0627 \u062A\u0644\u0627\u0634 \u06A9\u0646\u0645. \u0644\u063A\u0648: /cancel`);
      }
      d.plan = plan;
      if (!plan.times.length && !plan.onceAt) {
        await setSession(env, uid, "ag_when", d);
        return void await send(env, uid, "\u062F\u0631 \u062F\u0633\u062A\u0648\u0631\u062A\u0627\u0646 \u0633\u0627\u0639\u062A\u06CC \u067E\u06CC\u062F\u0627 \u0646\u06A9\u0631\u062F\u0645.\n" + WHEN_HELP);
      }
      return confirm(env, uid, d);
    }
    case "ag_when": {
      const t = parseTimes(text);
      if (!t) return void await send(env, uid, "\u274C \u0633\u0627\u0639\u062A \u0646\u0627\u0645\u0639\u062A\u0628\u0631 \u0627\u0633\u062A.\n" + WHEN_HELP);
      if (t === "now") d.plan.onceAt = now() + 60;
      else {
        d.plan.times = t;
        d.plan.onceAt = null;
      }
      return confirm(env, uid, d);
    }
    case "ag_e_instr":
    case "ag_e_footer":
    case "ag_e_times": {
      const j = await getJob(env, d.job_id);
      if (!j || j.user_id !== uid) return void await clearSession(env, uid);
      if (state === "ag_e_instr") {
        if (text.length < 10 || text.length > 2e3) return void await send(env, uid, "\u062F\u0633\u062A\u0648\u0631 \u0628\u0627\u06CC\u062F \u0628\u06CC\u0646 \u06F1\u06F0 \u062A\u0627 \u06F2\u06F0\u06F0\u06F0 \u0646\u0648\u06CC\u0633\u0647 \u0628\u0627\u0634\u062F.");
        await env.DB.prepare("UPDATE agent_jobs SET instruction=? WHERE id=?").bind(text, j.id).run();
      } else if (state === "ag_e_footer") {
        await env.DB.prepare("UPDATE agent_jobs SET footer=? WHERE id=?").bind(text === "-" ? "" : text.slice(0, 500), j.id).run();
      } else {
        const t = parseTimes(text);
        if (!t) return void await send(env, uid, "\u274C \u0633\u0627\u0639\u062A \u0646\u0627\u0645\u0639\u062A\u0628\u0631 \u0627\u0633\u062A.\n" + WHEN_HELP);
        if (t === "now") await env.DB.prepare("UPDATE agent_jobs SET once_at=?, times='[]', days=NULL, last_key='', enabled=1 WHERE id=?").bind(now() + 60, j.id).run();
        else await env.DB.prepare("UPDATE agent_jobs SET times=?, days=NULL, once_at=NULL, last_key=?, attempts=0, retry_at=NULL WHERE id=?").bind(JSON.stringify(t), slotKey(now()), j.id).run();
      }
      await clearSession(env, uid);
      return show(env, uid, await getJob(env, j.id));
    }
  }
}
async function onCallback2(c, user, admin, q, act2, arg, s) {
  const { env } = c, uid = user.id, mid = q.message?.message_id;
  const ans = (t = "", alert = false) => answer(env, q.id, t, alert);
  if (!await llmReady(env)) return ans("\u0627\u06CC\u062C\u0646\u062A \u0647\u0646\u0648\u0632 \u0641\u0639\u0627\u0644 \u0646\u0634\u062F\u0647 \u0627\u0633\u062A.", true);
  if (act2 === "new") {
    await ans();
    const list = await userChannels(env, uid);
    if (!user.eitaa_token_enc) return void await send(env, uid, "\u0627\u0628\u062A\u062F\u0627 \u0627\u0632 \xAB\u0628\u0631\u0646\u0627\u0645\u0647\u200C\u0647\u0627\u06CC \u0645\u062A\u0635\u0644\xBB \u062A\u0648\u06A9\u0646 \u0627\u06CC\u062A\u0627\u06CC\u0627\u0631 \u0631\u0627 \u062B\u0628\u062A \u06A9\u0646\u06CC\u062F.");
    if (!list.length) return void await send(env, uid, "\u0627\u0628\u062A\u062F\u0627 \u0627\u0632 \xAB\u06A9\u0627\u0646\u0627\u0644\u200C\u0647\u0627\xBB \u06A9\u0627\u0646\u0627\u0644 \u062E\u0648\u062F\u062A\u0627\u0646 \u0631\u0627 \u0627\u0636\u0627\u0641\u0647 \u06A9\u0646\u06CC\u062F.");
    if ((await userJobs(env, uid)).length >= MAX_JOBS) return void await send(env, uid, `\u062D\u062F\u0627\u06A9\u062B\u0631 ${MAX_JOBS} \u0627\u06CC\u062C\u0646\u062A \u0645\u062C\u0627\u0632 \u0627\u0633\u062A.`);
    if (list.length === 1) return askInstruction(env, uid, { channel_id: list[0].id });
    return void await send(env, uid, "\u0627\u06CC\u062C\u0646\u062A \u062F\u0631 \u06A9\u062F\u0627\u0645 \u06A9\u0627\u0646\u0627\u0644 \u0634\u0645\u0627 \u067E\u0633\u062A \u0628\u06AF\u0630\u0627\u0631\u062F\u061F", ikb(list.map((ch) => [[`\u{1F7E0} ${ch.title}`.slice(0, 40), `ag:nc:${ch.id}`]])));
  }
  if (act2 === "nc") {
    await ans();
    const ch = await getChannel(env, Number(arg));
    return ch && ch.user_id === uid ? askInstruction(env, uid, { channel_id: ch.id }) : void 0;
  }
  if (act2 === "x") {
    await clearSession(env, uid);
    await ans("\u0644\u063A\u0648 \u0634\u062F.");
    return void (mid && await edit(env, uid, mid, "\u0644\u063A\u0648 \u0634\u062F."));
  }
  if (act2 === "redo") {
    await ans();
    return askInstruction(env, uid, { channel_id: s.data.channel_id });
  }
  if (act2 === "mk") {
    if (s.state !== "ag_confirm" || !s.data.plan) return ans("\u0627\u06CC\u0646 \u067E\u06CC\u0634\u200C\u0646\u0648\u06CC\u0633 \u0645\u0646\u0642\u0636\u06CC \u0634\u062F\u0647\u061B \u062F\u0648\u0628\u0627\u0631\u0647 \xAB\u0627\u06CC\u062C\u0646\u062A \u062C\u062F\u06CC\u062F\xBB \u0628\u0632\u0646\u06CC\u062F.", true);
    if ((await userJobs(env, uid)).length >= MAX_JOBS) return ans(`\u062D\u062F\u0627\u06A9\u062B\u0631 ${MAX_JOBS} \u0627\u06CC\u062C\u0646\u062A \u0645\u062C\u0627\u0632 \u0627\u0633\u062A.`, true);
    const j2 = await createJob(env, uid, s.data);
    await clearSession(env, uid);
    await ans("\u0633\u0627\u062E\u062A\u0647 \u0634\u062F \u2705");
    if (mid) await edit(env, uid, mid, "\u2705 \u0627\u06CC\u062C\u0646\u062A \u0633\u0627\u062E\u062A\u0647 \u0634\u062F.");
    return show(env, uid, j2);
  }
  if (act2 === "go" || act2 === "no") {
    const pid = Number(arg);
    const r = act2 === "go" ? await env.DB.prepare("UPDATE ea_posts SET status='pending', run_at=? WHERE id=? AND user_id=? AND status='draft'").bind(now(), pid, uid).run() : await env.DB.prepare("UPDATE ea_posts SET status='canceled' WHERE id=? AND user_id=? AND status='draft'").bind(pid, uid).run();
    if (r.meta.changes) {
      if (act2 === "go") await env.DB.prepare("UPDATE ea_posts SET status='pending', run_at=?, error='' WHERE error=? AND user_id=? AND status='draft'").bind(now() + 30, `follows:${pid}`, uid).run();
      else await env.DB.prepare("UPDATE ea_posts SET status='canceled' WHERE error=? AND user_id=? AND status='draft'").bind(`follows:${pid}`, uid).run();
    }
    await ans(r.meta.changes ? act2 === "go" ? "\u062F\u0631 \u0635\u0641 \u0627\u0646\u062A\u0634\u0627\u0631 \u0642\u0631\u0627\u0631 \u06AF\u0631\u0641\u062A." : "\u062D\u0630\u0641 \u0634\u062F." : "\u0642\u0627\u0628\u0644 \u062A\u063A\u06CC\u06CC\u0631 \u0646\u06CC\u0633\u062A.");
    if (mid && r.meta.changes) await edit(env, uid, mid, act2 === "go" ? `\u{1F680} \u067E\u0633\u062A #${pid} \u062F\u0631 \u0635\u0641 \u0627\u0646\u062A\u0634\u0627\u0631 \u0627\u0633\u062A\u2026` : `\u{1F5D1} \u067E\u06CC\u0634\u200C\u0646\u0648\u06CC\u0633 #${pid} \u062D\u0630\u0641 \u0634\u062F.`);
    return;
  }
  const j = await getJob(env, Number(arg));
  if (!j || j.user_id !== uid) return ans();
  switch (act2) {
    case "v":
      await ans();
      return show(env, uid, j);
    case "run":
      await env.DB.prepare("UPDATE agent_jobs SET run_now=1 WHERE id=?").bind(j.id).run();
      await ans("\u062F\u0631 \u0635\u0641 \u0627\u062C\u0631\u0627 \u0642\u0631\u0627\u0631 \u06AF\u0631\u0641\u062A.");
      return void await send(env, uid, "\u25B6\uFE0F \u0627\u06CC\u062C\u0646\u062A \u062A\u0627 \u062D\u062F\u0627\u06A9\u062B\u0631 \u06CC\u06A9 \u062F\u0642\u06CC\u0642\u0647\u200C\u06CC \u062F\u06CC\u06AF\u0631 \u0627\u062C\u0631\u0627 \u0645\u06CC\u200C\u0634\u0648\u062F \u0648 \u0646\u062A\u06CC\u062C\u0647 \u0631\u0627 \u0647\u0645\u06CC\u0646\u200C\u062C\u0627 \u0645\u06CC\u200C\u0641\u0631\u0633\u062A\u062F.");
    case "tg":
      await env.DB.prepare("UPDATE agent_jobs SET enabled=?, last_key=?, retry_at=NULL, attempts=0 WHERE id=?").bind(j.enabled ? 0 : 1, j.once_at ? j.last_key : slotKey(now()), j.id).run();
      await ans(j.enabled ? "\u0645\u062A\u0648\u0642\u0641 \u0634\u062F." : "\u0641\u0639\u0627\u0644 \u0634\u062F.");
      return show(env, uid, await getJob(env, j.id), mid);
    case "ap":
      await env.DB.prepare("UPDATE agent_jobs SET approve=? WHERE id=?").bind(j.approve ? 0 : 1, j.id).run();
      await ans();
      return show(env, uid, await getJob(env, j.id), mid);
    case "ed":
      await ans();
      await setSession(env, uid, "ag_e_instr", { job_id: j.id });
      return void await send(env, uid, "\u270F\uFE0F \u062F\u0633\u062A\u0648\u0631 \u062C\u062F\u06CC\u062F \u0631\u0627 \u0628\u0641\u0631\u0633\u062A\u06CC\u062F (\u062C\u0627\u06CC\u06AF\u0632\u06CC\u0646 \u062F\u0633\u062A\u0648\u0631 \u0641\u0639\u0644\u06CC \u0645\u06CC\u200C\u0634\u0648\u062F). \u0644\u063A\u0648: /cancel");
    case "ft":
      await ans();
      await setSession(env, uid, "ag_e_footer", { job_id: j.id });
      return void await send(env, uid, "\u{1F58B} \u0627\u0645\u0636\u0627\u06CC \u062C\u062F\u06CC\u062F \u0631\u0627 \u0628\u0641\u0631\u0633\u062A\u06CC\u062F. \u062D\u0630\u0641 \u0627\u0645\u0636\u0627: <code>-</code>");
    case "tm":
      await ans();
      await setSession(env, uid, "ag_e_times", { job_id: j.id });
      return void await send(env, uid, WHEN_HELP);
    case "del":
      await ans();
      return void await send(env, uid, `\u0627\u06CC\u062C\u0646\u062A \xAB${esc(j.name)}\xBB \u062D\u0630\u0641 \u0634\u0648\u062F\u061F`, ikb([[["\u2705 \u0628\u0644\u0647\u060C \u062D\u0630\u0641", `ag:dy:${j.id}`], ["\u062E\u06CC\u0631", `ag:v:${j.id}`]]]));
    case "dy":
      await env.DB.batch([
        env.DB.prepare("UPDATE ea_posts SET status='canceled' WHERE job_id=? AND status IN ('pending','draft')").bind(j.id),
        env.DB.prepare("DELETE FROM agent_seen WHERE job_id=?").bind(j.id),
        env.DB.prepare("DELETE FROM agent_jobs WHERE id=?").bind(j.id)
      ]);
      await ans("\u062D\u0630\u0641 \u0634\u062F.");
      return void (mid && await edit(env, uid, mid, "\u{1F5D1} \u0627\u06CC\u062C\u0646\u062A \u062D\u0630\u0641 \u0634\u062F."));
  }
}

// eitaa-src/group.ts
var TOPIC_NAMES = { posts: "\u{1F4DD} \u0645\u0637\u0627\u0644\u0628", reports: "\u{1F6A8} \u06AF\u0632\u0627\u0631\u0634\u0627\u062A", chat: "\u{1F4AC} \u0686\u062A \u0628\u0627 \u0627\u06CC\u062C\u0646\u062A", lessons: "\u{1F9E0} \u0622\u0645\u0648\u062E\u062A\u0647\u200C\u0647\u0627", council: "\u{1F91D} \u0634\u0648\u0631\u0627 (\u0646\u0627\u0638\u0631 \u0648 \u062F\u0633\u062A\u06CC\u0627\u0631)", all: "\u{1F4DA} \u062A\u0645\u0627\u0645 \u067E\u0633\u062A\u200C\u0647\u0627" };
async function kvGet(env, k) {
  const r = await env.DB.prepare("SELECT v FROM ea_kv WHERE k=?").bind(k).first();
  return r ? r.v : null;
}
async function kvSet(env, k, v) {
  await env.DB.prepare("INSERT INTO ea_kv(k,v) VALUES(?,?) ON CONFLICT(k) DO UPDATE SET v=excluded.v").bind(k, v).run();
}
var kvDel = (env, k) => env.DB.prepare("DELETE FROM ea_kv WHERE k=?").bind(k).run();
async function getGroup(env, uid) {
  const v = await kvGet(env, `grp:${uid}`);
  if (!v) return null;
  try {
    const g = JSON.parse(v);
    return g && g.chat ? { ...g, review: g.review !== false, topics: g.topics || {}, forum: !!g.forum } : null;
  } catch {
    return null;
  }
}
async function saveGroup(env, uid, g) {
  await kvSet(env, `grp:${uid}`, JSON.stringify(g));
  await kvSet(env, `grpchat:${g.chat}`, String(uid));
}
async function dropGroup(env, uid) {
  const g = await getGroup(env, uid);
  if (g) await kvDel(env, `grpchat:${g.chat}`);
  await kvDel(env, `grp:${uid}`);
}
async function groupOwner(env, chatId) {
  const v = await kvGet(env, `grpchat:${chatId}`);
  return v ? Number(v) : null;
}
async function botUsername(env) {
  const cached = await kvGet(env, "main_bot_username");
  if (cached) return cached;
  const s = await env.DB.prepare("SELECT value FROM settings WHERE key='bot_username'").first().catch(() => null);
  let name = s?.value || "";
  if (!name) {
    try {
      name = (await tg(env, "getMe")).username || "";
    } catch {
    }
  }
  if (name) await kvSet(env, "main_bot_username", name);
  return name;
}
var manageKb = async (env, postId, label = "\u2699\uFE0F \u0645\u062F\u06CC\u0631\u06CC\u062A \u067E\u0633\u062A") => {
  const u = await botUsername(env);
  return u ? { inline_keyboard: [[{ text: label, url: `https://t.me/${u}?start=ea_p${postId}` }]] } : void 0;
};
var ROLE_FA = { sup: "\u{1F6E1} \u0646\u0627\u0638\u0631", asst: "\u{1F9ED} \u062F\u0633\u062A\u06CC\u0627\u0631" };
var roleName = (r) => r === "sup" || r === "asst" ? ROLE_FA[r] : r === "owner" ? "\u{1F464} \u0634\u0645\u0627" : "\u{1F916} \u0631\u0628\u0627\u062A";
async function roleToken(env, uid, role) {
  const v = await kvGet(env, `${role}:${uid}`);
  if (v) {
    const t = await dec(env.SECRET_KEY, v);
    if (t) return t;
  }
  return (role === "sup" ? env.SUPERVISOR_TOKEN : env.ASSISTANT_TOKEN) || "";
}
var supToken = (env, uid) => roleToken(env, uid, "sup");
async function setRoleBot(env, uid, role, token) {
  let me;
  try {
    me = await tgWith(env, token, "getMe");
  } catch (e) {
    return { ok: false, name: "", error: e.message, inGroup: null };
  }
  await kvSet(env, `${role}:${uid}`, await enc(env.SECRET_KEY, token));
  await kvSet(env, `${role}name:${uid}`, me.username || "");
  const g = await getGroup(env, uid);
  let inGroup = null;
  if (g) {
    try {
      const m = await tgWith(env, token, "getChatMember", { chat_id: g.chat, user_id: me.id });
      inGroup = !["left", "kicked"].includes(m.status);
    } catch {
      inGroup = false;
    }
  }
  return { ok: true, name: me.username || "", error: "", inGroup };
}
async function clearRoleBot(env, uid, role) {
  await kvDel(env, `${role}:${uid}`);
  await kvDel(env, `${role}name:${uid}`);
}
async function setupGroup(env, uid, chatId, title) {
  const prev = await getGroup(env, uid);
  let forum = false, adminOk = false, note = "";
  try {
    forum = !!(await tg(env, "getChat", { chat_id: chatId })).is_forum;
  } catch (e) {
    note += `
\u26A0\uFE0F ${esc(e.message)}`;
  }
  try {
    const me = await tg(env, "getMe");
    const m = await tg(env, "getChatMember", { chat_id: chatId, user_id: me.id });
    adminOk = m.status === "administrator" || m.status === "creator";
    if (adminOk && forum && m.status === "administrator" && m.can_manage_topics === false) note += "\n\u26A0\uFE0F \u062F\u0633\u062A\u0631\u0633\u06CC \xAB\u0645\u062F\u06CC\u0631\u06CC\u062A \u062A\u0627\u067E\u06CC\u06A9\u200C\u0647\u0627\xBB \u0631\u0627 \u0628\u0647 \u0631\u0628\u0627\u062A \u0628\u062F\u0647\u06CC\u062F.";
    if (adminOk && m.status === "administrator" && m.can_delete_messages === false) note += "\n\u26A0\uFE0F \u062F\u0633\u062A\u0631\u0633\u06CC \xAB\u062D\u0630\u0641 \u067E\u06CC\u0627\u0645\u200C\u0647\u0627\xBB \u0631\u0627 \u0647\u0645 \u0628\u062F\u0647\u06CC\u062F (\u0628\u0631\u0627\u06CC \u067E\u0627\u06A9\u200C\u06A9\u0631\u062F\u0646 \u067E\u0633\u062A\u200C\u0647\u0627\u06CC \u0627\u06CC\u0631\u0627\u062F\u06CC).";
  } catch {
  }
  if (!adminOk) note += "\n\u26A0\uFE0F \u0631\u0628\u0627\u062A \u0631\u0627 \u062F\u0631 \u06AF\u0631\u0648\u0647 \xAB\u0627\u062F\u0645\u06CC\u0646\xBB \u06A9\u0646\u06CC\u062F (\u062D\u0630\u0641 \u067E\u06CC\u0627\u0645 \u0648 \u0645\u062F\u06CC\u0631\u06CC\u062A \u062A\u0627\u067E\u06CC\u06A9 \u0644\u0627\u0632\u0645 \u0627\u0633\u062A).";
  const cfg = { chat: String(chatId), forum, topics: prev && prev.chat === String(chatId) ? prev.topics : {}, review: prev?.review ?? true, title };
  if (forum) {
    for (const key2 of Object.keys(TOPIC_NAMES)) {
      if (cfg.topics[key2]) continue;
      try {
        cfg.topics[key2] = (await tg(env, "createForumTopic", { chat_id: chatId, name: TOPIC_NAMES[key2] })).message_thread_id;
      } catch (e) {
        note += `
\u26A0\uFE0F \u0633\u0627\u062E\u062A \u062A\u0627\u067E\u06CC\u06A9 \xAB${TOPIC_NAMES[key2]}\xBB \u0646\u0634\u062F: ${esc(e.message)}`;
      }
    }
  } else note += "\n\u{1F4A1} \u062A\u0627\u067E\u06CC\u06A9\u200C\u0647\u0627 \u0641\u0639\u0627\u0644 \u0646\u06CC\u0633\u062A\u0646\u062F\u061B \u0647\u0645\u0647 \u0686\u06CC\u0632 \u062F\u0631 \u0647\u0645\u06CC\u0646 \u06AF\u0631\u0648\u0647 \u0645\u06CC\u200C\u0622\u06CC\u062F. \u0628\u0631\u0627\u06CC \u062A\u0627\u067E\u06CC\u06A9: \u062A\u0646\u0638\u06CC\u0645\u0627\u062A \u06AF\u0631\u0648\u0647 \u2190 \xABTopics\xBB \u0631\u0627 \u0631\u0648\u0634\u0646 \u06A9\u0646\u06CC\u062F \u0648 \u062F\u0648\u0628\u0627\u0631\u0647 <code>/eagroup</code> \u0628\u0641\u0631\u0633\u062A\u06CC\u062F.";
  if (prev && prev.chat !== cfg.chat) await kvDel(env, `grpchat:${prev.chat}`);
  await saveGroup(env, uid, cfg);
  const say = (key2, text) => sendTo(env, env.BOT_TOKEN, cfg, key2, text).catch(() => null);
  await say("posts", "\u{1F4DD} <b>\u0645\u0637\u0627\u0644\u0628</b>\n\u0647\u0631 \u067E\u0633\u062A\u06CC \u06A9\u0647 \u0642\u0631\u0627\u0631 \u0627\u0633\u062A \u062F\u0631 \u0627\u06CC\u062A\u0627 \u0645\u0646\u062A\u0634\u0631 \u0634\u0648\u062F\u060C \u0627\u0648\u0644 \u0627\u06CC\u0646\u200C\u062C\u0627 \u0645\u06CC\u200C\u0622\u06CC\u062F\u061B \u0632\u06CC\u0631 \u0647\u0631 \u067E\u0633\u062A \u06CC\u06A9 \u062F\u06A9\u0645\u0647\u200C\u06CC \xAB\u2699\uFE0F \u0645\u062F\u06CC\u0631\u06CC\u062A \u067E\u0633\u062A\xBB \u0627\u0633\u062A \u06A9\u0647 \u0634\u0645\u0627 \u0631\u0627 \u0628\u0647 \u0631\u0628\u0627\u062A \u0645\u06CC\u200C\u0628\u0631\u062F (\u06AF\u0632\u0627\u0631\u0634 \u062E\u0637\u0627\u060C \u062A\u0635\u062D\u06CC\u062D\u060C \u062D\u0630\u0641\u060C \u0627\u0641\u0632\u0648\u062F\u0646 \u0639\u06A9\u0633/\u0648\u06CC\u062F\u06CC\u0648).");
  await say("reports", "\u{1F6A8} <b>\u06AF\u0632\u0627\u0631\u0634\u0627\u062A</b>\n\u06AF\u0632\u0627\u0631\u0634 \u0646\u0627\u0638\u0631 \u062F\u0631\u0628\u0627\u0631\u0647\u200C\u06CC \u0627\u06CC\u0631\u0627\u062F\u0647\u0627\u06CC \u067E\u0633\u062A\u200C\u0647\u0627\u060C \u0627\u0635\u0644\u0627\u062D\u200C\u0647\u0627\u06CC \u062E\u0648\u062F\u06A9\u0627\u0631 \u0648 \u067E\u0633\u062A\u200C\u0647\u0627\u06CC\u06CC \u06A9\u0647 \u0627\u0631\u0633\u0627\u0644 \u0646\u0634\u062F\u0646\u062F \u0627\u06CC\u0646\u062C\u0627 \u0645\u06CC\u200C\u0622\u06CC\u062F.");
  await say("chat", "\u{1F4AC} <b>\u0686\u062A \u0628\u0627 \u0627\u06CC\u062C\u0646\u062A</b>\n\u0627\u06CC\u0646\u062C\u0627 \u0645\u062B\u0644 \xAB\u06AF\u0641\u062A\u06AF\u0648 \u0628\u0627 \u0627\u06CC\u062C\u0646\u062A\xBB \u062F\u0631 \u0631\u0628\u0627\u062A \u0645\u06CC\u200C\u062A\u0648\u0627\u0646\u06CC\u062F \u062F\u0633\u062A\u0648\u0631 \u0628\u062F\u0647\u06CC\u062F (\u0641\u0642\u0637 \u067E\u06CC\u0627\u0645 \u0634\u0645\u0627 \u067E\u0627\u0633\u062E \u062F\u0627\u062F\u0647 \u0645\u06CC\u200C\u0634\u0648\u062F).");
  await say("council", "\u{1F91D} <b>\u0634\u0648\u0631\u0627</b>\n\u0627\u06CC\u0646\u062C\u0627 \xAB\u0646\u0627\u0638\u0631\xBB \u0648 \xAB\u062F\u0633\u062A\u06CC\u0627\u0631\xBB \u062F\u0631\u0628\u0627\u0631\u0647\u200C\u06CC \u0627\u06CC\u0631\u0627\u062F\u0647\u0627 \u0648 \u0622\u0645\u0648\u062E\u062A\u0647\u200C\u0647\u0627 \u0628\u0627 \u0647\u0645 \u06AF\u0641\u062A\u06AF\u0648 \u0645\u06CC\u200C\u06A9\u0646\u0646\u062F\u060C \u0628\u0647 \u0647\u0645 \u062F\u0633\u062A\u0648\u0631 \u0645\u06CC\u200C\u062F\u0647\u0646\u062F \u0648 \u0647\u0631 \u0648\u0642\u062A \u06A9\u0645\u06A9 \u06CC\u0627 \u0646\u0638\u0631 \u0634\u0645\u0627 \u0631\u0627 \u0628\u062E\u0648\u0627\u0647\u0646\u062F \u0627\u06CC\u0646\u062C\u0627 (\u0648 \u062F\u0631 \u0631\u0628\u0627\u062A) \u0645\u06CC\u200C\u067E\u0631\u0633\u0646\u062F. \u0647\u0631 \u067E\u06CC\u0627\u0645\u06CC \u06A9\u0647 \u0634\u0645\u0627 \u0627\u06CC\u0646\u062C\u0627 \u0628\u0646\u0648\u06CC\u0633\u06CC\u062F \u0628\u0647 \u0622\u0646\u200C\u0647\u0627 \u0645\u06CC\u200C\u0631\u0633\u062F.");
  await say("all", "\u{1F4DA} <b>\u062A\u0645\u0627\u0645 \u067E\u0633\u062A\u200C\u0647\u0627</b>\n\u0646\u0633\u062E\u0647\u200C\u06CC \u0647\u0645\u0647\u200C\u06CC \u067E\u0633\u062A\u200C\u0647\u0627\u06CC \u0633\u0627\u062E\u062A\u0647\u200C\u0634\u062F\u0647 (\u0627\u0631\u0633\u0627\u0644\u200C\u0634\u062F\u0647 \u0648 \u0627\u0631\u0633\u0627\u0644\u200C\u0646\u0634\u062F\u0647) \u0627\u06CC\u0646\u062C\u0627 \u062C\u0645\u0639 \u0645\u06CC\u200C\u0634\u0648\u062F. \u067E\u0633\u062A\u06CC \u06A9\u0647 \u0628\u0647 \u0627\u06CC\u062A\u0627 \u0631\u0633\u06CC\u062F\u0647 \u0628\u0627\u0634\u062F\u060C \u062F\u0631 \u0622\u062E\u0631 \u0645\u062A\u0646\u0634 \xAB\u2705 \u0627\u0631\u0633\u0627\u0644 \u0634\u062F\xBB \u0645\u06CC\u200C\u062E\u0648\u0631\u062F\u061B \u0628\u0642\u06CC\u0647 \u0648\u0636\u0639\u06CC\u062A\u0634\u0627\u0646 (\u23F3 \u062F\u0631 \u0627\u0646\u062A\u0638\u0627\u0631 / \u{1F6D1} \u0646\u06AF\u0647\u200C\u062F\u0627\u0634\u062A\u0647 / \u274C \u0646\u0627\u0645\u0648\u0641\u0642) \u0631\u0627 \u0646\u0634\u0627\u0646 \u0645\u06CC\u200C\u062F\u0647\u0646\u062F.");
  await say("lessons", "\u{1F9E0} <b>\u0622\u0645\u0648\u062E\u062A\u0647\u200C\u0647\u0627</b>\n\u0647\u0631 \u062E\u0637\u0627\u06CC\u06CC \u06A9\u0647 \u06AF\u0632\u0627\u0631\u0634 \u06A9\u0646\u06CC\u062F \u0628\u0647 \u06CC\u06A9 \u0642\u0627\u0646\u0648\u0646 \u062A\u0628\u062F\u06CC\u0644 \u0645\u06CC\u200C\u0634\u0648\u062F \u0648 \u0627\u06CC\u0646\u062C\u0627 \u062B\u0628\u062A \u0645\u06CC\u200C\u0634\u0648\u062F \u062A\u0627 \u062A\u06A9\u0631\u0627\u0631 \u0646\u0634\u0648\u062F.");
  return `\u2705 \u0627\u06CC\u0646 \u06AF\u0631\u0648\u0647 \u0628\u0647\u200C\u0639\u0646\u0648\u0627\u0646 \u06AF\u0631\u0648\u0647 \u067E\u0633\u062A\u200C\u0647\u0627 \u062B\u0628\u062A \u0634\u062F.
${forum ? "\u062A\u0627\u067E\u06CC\u06A9\u200C\u0647\u0627: " + (Object.keys(cfg.topics).length ? "\u0633\u0627\u062E\u062A\u0647 \u0634\u062F" : "\u0633\u0627\u062E\u062A\u0647 \u0646\u0634\u062F") : "\u0628\u062F\u0648\u0646 \u062A\u0627\u067E\u06CC\u06A9"}${note}`;
}
function topicOf(cfg, key2) {
  const t = cfg.topics[key2];
  return t ? { message_thread_id: t } : {};
}
var threadGone = (m) => /thread.*not found|topic.*(deleted|closed|not found)|TOPIC_/i.test(m);
async function makeTopic(env, uid, cfg, key2) {
  if (!cfg.forum) return 0;
  try {
    const id = (await tg(env, "createForumTopic", { chat_id: cfg.chat, name: TOPIC_NAMES[key2] })).message_thread_id;
    cfg.topics[key2] = id;
    await saveGroup(env, uid, cfg);
    return id;
  } catch {
    return 0;
  }
}
async function ensureTopics(env, uid) {
  const cfg = await getGroup(env, uid);
  const made = [];
  if (!cfg || !cfg.forum) return made;
  for (const key2 of Object.keys(TOPIC_NAMES)) {
    if (!cfg.topics[key2] && await makeTopic(env, uid, cfg, key2)) made.push(TOPIC_NAMES[key2]);
  }
  return made;
}
async function sendTo(env, token, cfg, key2, text, kb, uid = 0) {
  const go = async () => (await tgWith(env, token, "sendMessage", { chat_id: cfg.chat, text: text.slice(0, 4e3), parse_mode: "HTML", disable_web_page_preview: true, ...kb ? { reply_markup: kb } : {}, ...topicOf(cfg, key2) })).message_id;
  try {
    return await go();
  } catch (e) {
    if (cfg.topics[key2] && threadGone(e.message)) {
      const u = uid || await groupOwner(env, cfg.chat) || 0;
      delete cfg.topics[key2];
      if (u && await makeTopic(env, u, cfg, key2)) return await go();
      return await go();
    }
    throw e;
  }
}
async function report(env, uid, text, kb, dm = false) {
  const cfg = await getGroup(env, uid);
  if (cfg) {
    const sup = await supToken(env, uid);
    for (const token of sup ? [sup, env.BOT_TOKEN] : [env.BOT_TOKEN]) {
      try {
        await sendTo(env, token, cfg, "reports", text, kb, uid);
        break;
      } catch {
      }
    }
  }
  if (dm || !cfg) await send(env, uid, text, kb);
}
async function lessonNote(env, uid, text) {
  const cfg = await getGroup(env, uid);
  if (cfg) await sendTo(env, env.BOT_TOKEN, cfg, "lessons", text, void 0, uid).catch(() => null);
}
var mediaKind = (name) => /\.(jpe?g|png|webp)$/i.test(name) ? "photo" : /\.(mp4|mov|webm|m4v)$/i.test(name) ? "video" : "document";
async function sendCopy(env, dest, p, file, kb) {
  const base = { chat_id: dest.chat, ...dest.thread ? { message_thread_id: dest.thread } : {}, ...kb ? { reply_markup: kb } : {} };
  if (p.kind === "text" || !file && !p.file_id) {
    return (await tgWith(env, env.BOT_TOKEN, "sendMessage", { ...base, text: (p.text || "\u2026").slice(0, 4e3), disable_web_page_preview: true })).message_id;
  }
  const name = file?.name || p.file_name || "file";
  const types = [mediaKind(name)];
  if (types[0] !== "document") types.push("document");
  let last = new Error("send failed");
  for (const type of types) {
    try {
      const caption = (p.text || "").slice(0, 1e3);
      if (file) {
        const f = new FormData();
        for (const [k, v] of Object.entries(base)) f.set(k, typeof v === "object" ? JSON.stringify(v) : String(v));
        if (caption) f.set("caption", caption);
        f.set(type, new Blob([file.bytes.slice().buffer]), name);
        return (await tgWith(env, env.BOT_TOKEN, `send${type[0].toUpperCase()}${type.slice(1)}`, f)).message_id;
      }
      return (await tgWith(env, env.BOT_TOKEN, `send${type[0].toUpperCase()}${type.slice(1)}`, { ...base, [type]: p.file_id, ...caption ? { caption } : {} })).message_id;
    } catch (e) {
      last = e;
    }
  }
  throw last;
}
async function postToGroup(env, uid, postId, p, file) {
  const cfg = await getGroup(env, uid);
  if (!cfg) return 0;
  const mid = await sendCopy(env, { chat: cfg.chat, thread: cfg.topics.posts }, p, file, await manageKb(env, postId, "\u2699\uFE0F \u0645\u062F\u06CC\u0631\u06CC\u062A \u067E\u0633\u062A \xB7 \u23F3"));
  await env.DB.prepare("INSERT INTO ea_pubs(post_id,user_id,grp_chat,grp_msg,verdict,note,updated_at) VALUES(?,?,?,?,'','',?) ON CONFLICT(post_id) DO UPDATE SET grp_chat=excluded.grp_chat, grp_msg=excluded.grp_msg, updated_at=excluded.updated_at").bind(postId, uid, cfg.chat, mid, now()).run();
  return mid;
}
async function markGroup(env, postId, label) {
  const r = await env.DB.prepare("SELECT grp_chat, grp_msg FROM ea_pubs WHERE post_id=?").bind(postId).first();
  if (!r || !r.grp_msg) return;
  const kb = await manageKb(env, postId, `\u2699\uFE0F \u0645\u062F\u06CC\u0631\u06CC\u062A \u067E\u0633\u062A \xB7 ${label}`);
  if (kb) await tg(env, "editMessageReplyMarkup", { chat_id: r.grp_chat, message_id: r.grp_msg, reply_markup: kb }).catch(() => null);
}
async function removeFromGroup(env, postId) {
  const r = await env.DB.prepare("SELECT grp_chat, grp_msg FROM ea_pubs WHERE post_id=?").bind(postId).first();
  if (r && r.grp_msg) {
    await tg(env, "deleteMessage", { chat_id: r.grp_chat, message_id: r.grp_msg }).catch(() => null);
    await env.DB.prepare("UPDATE ea_pubs SET grp_msg=0 WHERE post_id=?").bind(postId).run();
  }
}
async function setVerdict(env, postId, uid, verdict, note = "") {
  await env.DB.prepare("INSERT INTO ea_pubs(post_id,user_id,verdict,note,updated_at) VALUES(?,?,?,?,?) ON CONFLICT(post_id) DO UPDATE SET verdict=excluded.verdict, note=excluded.note, updated_at=excluded.updated_at").bind(postId, uid, verdict, note.slice(0, 400), now()).run();
}
var getPub = (env, postId) => env.DB.prepare("SELECT * FROM ea_pubs WHERE post_id=?").bind(postId).first();
async function sayAs(env, uid, role, key2, text, kb) {
  const cfg = await getGroup(env, uid);
  if (!cfg) return false;
  const own = role === "main" ? "" : await roleToken(env, uid, role);
  let why = "";
  if (own) {
    try {
      await sendTo(env, own, cfg, key2, text, kb, uid);
      return true;
    } catch (e) {
      why = `${roleName(role)}: ${e.message}`;
    }
  }
  try {
    await sendTo(env, env.BOT_TOKEN, cfg, key2, role === "main" ? text : `<b>${roleName(role)}</b>
${text}`, kb, uid);
    return true;
  } catch (e) {
    await kvSet(env, `sayerr:${uid}`, `${why ? why + " | " : ""}\u0631\u0628\u0627\u062A \u0627\u0635\u0644\u06CC: ${e.message}`.slice(0, 300)).catch(() => null);
    return false;
  }
}

// eitaa-src/allposts.ts
var LIVE = ["pending", "draft", "held", "failed", "sending", "sent"];
function statusLine(p) {
  switch (p.status) {
    case "sent":
      return `\u2705 \u0627\u0631\u0633\u0627\u0644 \u0634\u062F \u0628\u0647 \u0627\u06CC\u062A\u0627${p.sent_at ? " \xB7 " + fmtDt(p.sent_at) : ""}`;
    case "pending":
    case "sending":
      return `\u23F3 \u0647\u0646\u0648\u0632 \u0627\u0631\u0633\u0627\u0644 \u0646\u0634\u062F\u0647 \xB7 \u0632\u0645\u0627\u0646 \u0627\u0631\u0633\u0627\u0644: ${fmtDt(p.run_at)}`;
    case "draft":
      return "\u{1F4DD} \u067E\u06CC\u0634\u200C\u0646\u0648\u06CC\u0633 \xB7 \u0627\u0631\u0633\u0627\u0644 \u0646\u0634\u062F\u0647";
    case "held":
      return `\u{1F6D1} \u0646\u06AF\u0647\u200C\u062F\u0627\u0634\u062A\u0647 \u0634\u062F\u060C \u0627\u0631\u0633\u0627\u0644 \u0646\u0634\u062F\u0647${p.error ? " \u2014 " + p.error.slice(0, 120) : ""}`;
    case "failed":
      return `\u274C \u0627\u0631\u0633\u0627\u0644 \u0646\u0634\u062F${p.error ? " \u2014 " + p.error.split("\n")[0].slice(0, 120) : ""}`;
    case "deleted":
      return "\u{1F5D1} \u062D\u0630\u0641 \u0634\u062F";
    case "replaced":
      return "\u267B\uFE0F \u062C\u0627\u06CC\u06AF\u0632\u06CC\u0646 \u0634\u062F (\u0646\u0633\u062E\u0647\u200C\u06CC \u0627\u0635\u0644\u0627\u062D\u200C\u0634\u062F\u0647 \u0633\u0627\u062E\u062A\u0647 \u0634\u062F)";
    case "canceled":
      return "\u{1F6AB} \u0644\u063A\u0648 \u0634\u062F";
    default:
      return p.status;
  }
}
var withLine = (text, line, media) => {
  const max = (media ? 1e3 : 4e3) - line.length - 2;
  const t = (text || "").trim();
  return `${t.length > max ? t.slice(0, Math.max(0, max - 1)) + "\u2026" : t}${t ? "\n\n" : ""}${line}`;
};
async function syncAll(env, uid, limit = 4) {
  const cfg = await getGroup(env, uid);
  if (!cfg) return 0;
  if (cfg.forum && !cfg.topics.all && !await makeTopic(env, uid, cfg, "all")) return 0;
  const rows = (await env.DB.prepare("SELECT p.*, k.v kv FROM ea_posts p LEFT JOIN ea_kv k ON k.k='al:'||p.id WHERE p.user_id=? ORDER BY p.id DESC LIMIT 120").bind(uid).all()).results.reverse();
  let ops = 0;
  for (const p of rows) {
    if (ops >= limit) break;
    const [mid, st] = (p.kv || "").split("|");
    const state = `${p.status}:${(p.error || "").length}`;
    if (st && st.startsWith("err")) {
      if (now() - Number(st.split(":")[1] || 0) < 900) continue;
    } else if (p.kv && st === state) continue;
    if (!p.kv && !LIVE.includes(p.status)) continue;
    const media = p.kind === "file";
    const line = statusLine(p), kb = await manageKb(env, p.id, "\u2699\uFE0F \u0645\u062F\u06CC\u0631\u06CC\u062A \u067E\u0633\u062A");
    const text = withLine(p.text, line, media);
    ops++;
    try {
      if (mid && Number(mid) > 0) {
        try {
          await tg(env, media ? "editMessageCaption" : "editMessageText", { chat_id: cfg.chat, message_id: Number(mid), ...media ? { caption: text } : { text, disable_web_page_preview: true }, ...kb ? { reply_markup: kb } : {} });
        } catch (e) {
          if (!/not modified/i.test(e.message)) throw e;
        }
        await kvSet(env, `al:${p.id}`, `${mid}|${state}`);
      } else {
        let file = null, note = "";
        if (media && p.src_url) {
          try {
            file = await loadMedia(env, p);
          } catch {
            note = "\n\u{1F4CE} (\u0631\u0633\u0627\u0646\u0647\u200C\u06CC \u0627\u06CC\u0646 \u067E\u0633\u062A \u0628\u0627\u0631\u06AF\u06CC\u0631\u06CC \u0646\u0634\u062F)";
          }
        }
        const newId = await sendCopy(env, { chat: cfg.chat, thread: cfg.topics.all }, { kind: file || p.file_id ? p.kind : "text", text: text + note, file_id: p.file_id, file_name: p.file_name }, file, kb);
        await kvSet(env, `al:${p.id}`, `${newId}|${state}`);
      }
    } catch (e) {
      const gone2 = /message to edit not found|message can't be edited|MESSAGE_ID_INVALID/i.test(e.message);
      await kvSet(env, `al:${p.id}`, gone2 ? `0|resend` : `${mid || 0}|err:${now()}`);
      console.error("allposts", p.id, e.message);
    }
  }
  return ops;
}
async function syncAllUsers(env) {
  const users = (await env.DB.prepare("SELECT k FROM ea_kv WHERE k LIKE 'grp:%'").all()).results.map((r) => Number(r.k.slice(4)));
  for (const uid of users) {
    try {
      await syncAll(env, uid);
    } catch (e) {
      console.error("syncAll", e.message);
    }
  }
}

// eitaa-src/doctor.ts
var TRANSIENT = /نیمه‌کاره|timeout|پاسخ نداد|network|fetch|HTTP 5\d\d|50\d|rate|too many|429|flood|temporar/i;
async function once(env, uid, code, hours = 6) {
  const k = `doc:${uid}:${code}`, last = Number(await kvGet(env, k) || 0);
  if (now() - last < hours * 3600) return false;
  await kvSet(env, k, String(now()));
  return true;
}
async function diagnose(env, uid, manual = false) {
  const out = { fixed: [], problems: [] };
  const cfg = await getGroup(env, uid);
  if (!cfg) {
    out.problems.push("\u06AF\u0631\u0648\u0647\u06CC \u062B\u0628\u062A \u0646\u0634\u062F\u0647 (\u062F\u0631 \u06AF\u0631\u0648\u0647 /eagroup \u0628\u0641\u0631\u0633\u062A\u06CC\u062F)");
    return out;
  }
  try {
    const me = await tg(env, "getMe");
    const m = await tg(env, "getChatMember", { chat_id: cfg.chat, user_id: me.id });
    if (m.status !== "administrator" && m.status !== "creator") out.problems.push("\u0631\u0628\u0627\u062A \u0627\u0635\u0644\u06CC \u062F\u0631 \u06AF\u0631\u0648\u0647 \u0627\u062F\u0645\u06CC\u0646 \u0646\u06CC\u0633\u062A (\u062D\u0630\u0641 \u067E\u06CC\u0627\u0645 \u0648 \u062A\u0627\u067E\u06CC\u06A9 \u06A9\u0627\u0631 \u0646\u0645\u06CC\u200C\u06A9\u0646\u062F)");
    else if (m.status === "administrator" && m.can_delete_messages === false) out.problems.push("\u0631\u0628\u0627\u062A \u0627\u0635\u0644\u06CC \u0627\u062C\u0627\u0632\u0647\u200C\u06CC \xAB\u062D\u0630\u0641 \u067E\u06CC\u0627\u0645\u200C\u0647\u0627\xBB \u0646\u062F\u0627\u0631\u062F");
    else if (m.status === "administrator" && cfg.forum && m.can_manage_topics === false) out.problems.push("\u0631\u0628\u0627\u062A \u0627\u0635\u0644\u06CC \u0627\u062C\u0627\u0632\u0647\u200C\u06CC \xAB\u0645\u062F\u06CC\u0631\u06CC\u062A \u062A\u0627\u067E\u06CC\u06A9\u200C\u0647\u0627\xBB \u0646\u062F\u0627\u0631\u062F");
  } catch (e) {
    out.problems.push(`\u06AF\u0631\u0648\u0647 \u062F\u0631 \u062F\u0633\u062A\u0631\u0633 \u0631\u0628\u0627\u062A \u0646\u06CC\u0633\u062A: ${e.message}`);
  }
  try {
    const made = await ensureTopics(env, uid);
    if (made.length) out.fixed.push(`\u062A\u0627\u067E\u06CC\u06A9 \u0633\u0627\u062E\u062A\u0647 \u0634\u062F: ${made.join("\u060C ")}`);
  } catch {
  }
  for (const role of ["sup", "asst"]) {
    const tok = await roleToken(env, uid, role);
    if (!tok) continue;
    try {
      const me = await tgWith(env, tok, "getMe");
      const m = await tgWith(env, tok, "getChatMember", { chat_id: cfg.chat, user_id: me.id });
      if (["left", "kicked"].includes(m.status)) out.problems.push(`${roleName(role)} \u062F\u0631 \u06AF\u0631\u0648\u0647 \u0646\u06CC\u0633\u062A\u061B \u0622\u0646 \u0631\u0627 \u062F\u0648\u0628\u0627\u0631\u0647 \u0639\u0636\u0648 \u0648 \u0627\u062F\u0645\u06CC\u0646 \u06A9\u0646\u06CC\u062F (\u062A\u0627 \u0622\u0646 \u0645\u0648\u0642\u0639 \u0628\u0627 \u0631\u0628\u0627\u062A \u0627\u0635\u0644\u06CC \u062D\u0631\u0641 \u0645\u06CC\u200C\u0632\u0646\u062F)`);
      else if (m.status !== "administrator" && m.status !== "creator") out.problems.push(`${roleName(role)} \u062F\u0631 \u06AF\u0631\u0648\u0647 \u0627\u062F\u0645\u06CC\u0646 \u0646\u06CC\u0633\u062A`);
    } catch (e) {
      out.problems.push(`\u062A\u0648\u06A9\u0646 ${roleName(role)} \u06A9\u0627\u0631 \u0646\u0645\u06CC\u200C\u06A9\u0646\u062F (${e.message}) \u2014 \u062F\u0631 \u0628\u062E\u0634 \u06AF\u0631\u0648\u0647 \u062A\u0648\u06A9\u0646 \u062A\u0627\u0632\u0647 \u0628\u062F\u0647\u06CC\u062F`);
    }
  }
  const stuck = await env.DB.prepare("UPDATE ea_posts SET status='pending', run_at=?, error='' WHERE user_id=? AND status='sending' AND claimed_at < ?").bind(now(), uid, now() - 600).run();
  if (stuck.meta.changes) out.fixed.push(`${stuck.meta.changes} \u067E\u0633\u062A \u06AF\u06CC\u0631\u06A9\u0631\u062F\u0647 \u062F\u0648\u0628\u0627\u0631\u0647 \u062F\u0631 \u0635\u0641 \u0627\u0631\u0633\u0627\u0644 \u06AF\u0630\u0627\u0634\u062A\u0647 \u0634\u062F`);
  const failed = (await env.DB.prepare("SELECT id, error FROM ea_posts WHERE user_id=? AND status='failed' AND id > (SELECT COALESCE(MAX(id),0)-30 FROM ea_posts WHERE user_id=?) ORDER BY id").bind(uid, uid).all()).results;
  let retried = 0;
  const hard = {};
  for (const f of failed) {
    if (TRANSIENT.test(f.error || "") && !await kvGet(env, `docretry:${f.id}`)) {
      await kvSet(env, `docretry:${f.id}`, String(now()));
      await env.DB.prepare("UPDATE ea_posts SET status='pending', run_at=?, error='' WHERE id=? AND status='failed'").bind(now(), f.id).run();
      retried++;
    } else {
      const key2 = /chat not found/i.test(f.error || "") ? "\u0634\u0646\u0627\u0633\u0647\u200C\u06CC \u06A9\u0627\u0646\u0627\u0644 \u0627\u06CC\u062A\u0627\u06CC\u0627\u0631 \u062F\u0631\u0633\u062A \u0646\u06CC\u0633\u062A (\u06A9\u0627\u0646\u0627\u0644 \u2190 \u{1F9EA} \u0622\u0632\u0645\u0627\u06CC\u0634 \u0627\u062A\u0635\u0627\u0644)" : /token|unauthorized|401|403/i.test(f.error || "") ? "\u062A\u0648\u06A9\u0646 \u0627\u06CC\u062A\u0627\u06CC\u0627\u0631 \u0646\u0627\u0645\u0639\u062A\u0628\u0631 \u0627\u0633\u062A" : "";
      if (key2) (hard[key2] ||= []).push(f.id);
    }
  }
  if (retried) out.fixed.push(`${retried} \u067E\u0633\u062A \u0646\u0627\u0645\u0648\u0641\u0642 (\u062E\u0637\u0627\u06CC \u0645\u0648\u0642\u062A) \u062F\u0648\u0628\u0627\u0631\u0647 \u0627\u0645\u062A\u062D\u0627\u0646 \u0645\u06CC\u200C\u0634\u0648\u062F`);
  for (const [k, ids] of Object.entries(hard)) out.problems.push(`${k} \u2014 \u067E\u0633\u062A\u200C\u0647\u0627\u06CC ${ids.slice(0, 6).map((i) => "#" + i).join("\u060C ")}`);
  const cerr = await kvGet(env, `ccerr:${uid}`);
  if (cerr) out.problems.push(`\u0634\u0648\u0631\u0627 \u0622\u062E\u0631\u06CC\u0646 \u0628\u0627\u0631 \u0646\u062A\u0648\u0627\u0646\u0633\u062A \u062D\u0631\u0641 \u0628\u0632\u0646\u062F: ${cerr.slice(0, 160)}`);
  const sayerr = await kvGet(env, `sayerr:${uid}`);
  if (sayerr) {
    out.problems.push(`\u0627\u0631\u0633\u0627\u0644 \u067E\u06CC\u0627\u0645 \u0628\u0647 \u06AF\u0631\u0648\u0647 \u0646\u0627\u0645\u0648\u0641\u0642 \u0628\u0648\u062F: ${sayerr.slice(0, 160)}`);
    if (!manual) await kvDel(env, `sayerr:${uid}`);
  }
  return out;
}
var render = (f) => `\u{1FA7A} <b>\u06AF\u0632\u0627\u0631\u0634 \u0633\u0644\u0627\u0645\u062A</b>${f.fixed.length ? "\n\n\u{1F527} <b>\u062E\u0648\u062F\u06A9\u0627\u0631 \u062A\u0639\u0645\u06CC\u0631 \u0634\u062F:</b>\n" + f.fixed.map((x) => "\u2022 " + esc(x)).join("\n") : ""}${f.problems.length ? "\n\n\u26A0\uFE0F <b>\u0646\u06CC\u0627\u0632 \u0628\u0647 \u0634\u0645\u0627:</b>\n" + f.problems.map((x) => "\u2022 " + esc(x)).join("\n") : ""}`;
async function doctorTick(env) {
  const last = Number(await kvGet(env, "doctor:last") || 0);
  if (now() - last < 600) return;
  await kvSet(env, "doctor:last", String(now()));
  const users = (await env.DB.prepare("SELECT k FROM ea_kv WHERE k LIKE 'grp:%'").all()).results.map((r) => Number(r.k.slice(4)));
  for (const uid of users) {
    try {
      const f = await diagnose(env, uid);
      const sig = f.problems.join("|");
      const newProblems = f.problems.length ? await once(env, uid, "p:" + sig.slice(0, 120), 6) : false;
      if (f.fixed.length || newProblems) await report(env, uid, render({ fixed: f.fixed, problems: newProblems ? f.problems : [] }), void 0, f.problems.length > 0 && newProblems);
    } catch (e) {
      console.error("doctor", e.message);
    }
  }
}
async function doctorNow(env, uid) {
  const f = await diagnose(env, uid, true);
  return f.fixed.length || f.problems.length ? render(f) : "\u{1FA7A} <b>\u06AF\u0632\u0627\u0631\u0634 \u0633\u0644\u0627\u0645\u062A</b>\n\n\u2705 \u0647\u0645\u0647\u200C\u0686\u06CC\u0632 \u0633\u0627\u0644\u0645 \u0627\u0633\u062A: \u06AF\u0631\u0648\u0647\u060C \u062A\u0627\u067E\u06CC\u06A9\u200C\u0647\u0627\u060C \u0631\u0628\u0627\u062A\u200C\u0647\u0627 \u0648 \u0635\u0641 \u0627\u0631\u0633\u0627\u0644.";
}

// eitaa-src/app.html
var app_default = `<!doctype html>
<html lang="fa" dir="rtl">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<meta name="robots" content="noindex,nofollow">
<meta name="theme-color" content="#0b0d12">
<title>\u067E\u0646\u0644 \u0627\u06CC\u062C\u0646\u062A \u0627\u06CC\u062A\u0627</title>
<style>
:root{--bg:#0b0d12;--bg2:#0f121a;--card:#131722;--card2:#171c29;--line:#222838;--text:#e9edf5;--mut:#8a93a8;--acc:#7c5cff;--acc2:#20d3c2;--ok:#34d399;--warn:#fbbf24;--bad:#f87171;--r:16px;--sh:0 10px 30px rgba(0,0,0,.35)}
@media (prefers-color-scheme:light){:root:not([data-theme=dark]){--bg:#f4f6fb;--bg2:#fff;--card:#fff;--card2:#f7f8fc;--line:#e4e8f1;--text:#161a24;--mut:#667089;--sh:0 10px 30px rgba(30,40,80,.08)}}
:root[data-theme=light]{--bg:#f4f6fb;--bg2:#fff;--card:#fff;--card2:#f7f8fc;--line:#e4e8f1;--text:#161a24;--mut:#667089;--sh:0 10px 30px rgba(30,40,80,.08)}
*{box-sizing:border-box;-webkit-tap-highlight-color:transparent}
html,body{margin:0;background:var(--bg);color:var(--text);font:15px/1.7 "Vazirmatn","Segoe UI",Tahoma,system-ui,sans-serif}
body{min-height:100vh;background:radial-gradient(900px 500px at 85% -10%,rgba(124,92,255,.16),transparent 60%),radial-gradient(700px 400px at -10% 110%,rgba(32,211,194,.10),transparent 60%),var(--bg)}
button,input,textarea,select{font:inherit;color:inherit}
.app{max-width:1080px;margin:0 auto;padding:0 16px 96px}
header{position:sticky;top:0;z-index:20;margin:0 -16px;padding:12px 16px;display:flex;align-items:center;gap:12px;background:color-mix(in srgb,var(--bg) 82%,transparent);backdrop-filter:blur(14px);border-bottom:1px solid var(--line)}
.logo{width:34px;height:34px;border-radius:11px;background:linear-gradient(135deg,var(--acc),var(--acc2));display:grid;place-items:center;box-shadow:0 6px 18px rgba(124,92,255,.4)}
.logo svg{width:18px;height:18px;stroke:#fff}
header h1{font-size:16px;margin:0;font-weight:700}header small{color:var(--mut);display:block;font-size:12px;margin-top:-4px}
.sp{flex:1}.dot{width:8px;height:8px;border-radius:50%;background:var(--ok);box-shadow:0 0 0 4px rgba(52,211,153,.15)}
nav{position:fixed;inset:auto 0 0 0;z-index:30;display:flex;justify-content:space-around;gap:2px;padding:8px 8px calc(8px + env(safe-area-inset-bottom));background:color-mix(in srgb,var(--bg2) 90%,transparent);backdrop-filter:blur(16px);border-top:1px solid var(--line)}
nav button{flex:1;background:none;border:0;border-radius:12px;padding:6px 2px;color:var(--mut);display:flex;flex-direction:column;align-items:center;gap:2px;font-size:11px;cursor:pointer;position:relative}
nav button svg{width:21px;height:21px;stroke:currentColor;fill:none;stroke-width:1.8;stroke-linecap:round;stroke-linejoin:round}
nav button.on{color:var(--text)}nav button.on svg{stroke:url(#g)}
nav button.on::after{content:"";position:absolute;top:-9px;width:22px;height:3px;border-radius:3px;background:linear-gradient(90deg,var(--acc),var(--acc2))}
nav .badge{position:absolute;top:2px;right:calc(50% - 20px);background:var(--bad);color:#fff;border-radius:9px;font-size:10px;padding:0 5px;min-width:16px;text-align:center}
@media(min-width:860px){nav{position:sticky;top:61px;inset:auto;margin:14px 0 0;border:1px solid var(--line);border-radius:18px;padding:6px;background:var(--card);gap:6px}nav button{flex-direction:row;justify-content:center;gap:8px;font-size:13px;padding:10px}nav button.on{background:var(--card2)}nav button.on::after{display:none}.app{padding-bottom:40px}}
main{padding-top:18px;display:grid;gap:14px}
.grid{display:grid;gap:12px;grid-template-columns:repeat(auto-fit,minmax(150px,1fr))}
.card{background:var(--card);border:1px solid var(--line);border-radius:var(--r);padding:16px;box-shadow:var(--sh)}
.card h3{margin:0 0 10px;font-size:14px;color:var(--mut);font-weight:600;display:flex;align-items:center;gap:8px}
.stat b{display:block;font-size:28px;line-height:1.2;background:linear-gradient(135deg,var(--text),var(--mut));-webkit-background-clip:text;background-clip:text;color:transparent}
.stat span{color:var(--mut);font-size:12.5px}
.row{display:flex;align-items:center;gap:10px;flex-wrap:wrap}.col{display:grid;gap:10px}
.btn{border:1px solid var(--line);background:var(--card2);padding:8px 14px;border-radius:12px;cursor:pointer;font-size:13px;transition:.15s}
.btn:hover{border-color:var(--acc)}.btn:active{transform:scale(.97)}
.btn.pri{background:linear-gradient(135deg,var(--acc),#5a7bff);border-color:transparent;color:#fff;box-shadow:0 8px 20px rgba(124,92,255,.35)}
.btn.bad{color:var(--bad)}.btn.sm{padding:5px 10px;font-size:12px;border-radius:10px}.btn:disabled{opacity:.5}
.chip{border:1px solid var(--line);background:transparent;padding:5px 12px;border-radius:99px;font-size:12.5px;color:var(--mut);cursor:pointer}.chip.on{color:var(--text);background:var(--card2);border-color:var(--acc)}
input,textarea,select{width:100%;background:var(--bg2);border:1px solid var(--line);border-radius:12px;padding:10px 12px;outline:none;transition:.15s}
input:focus,textarea:focus{border-color:var(--acc);box-shadow:0 0 0 3px rgba(124,92,255,.18)}textarea{resize:vertical;min-height:110px;line-height:1.8}
.badge2{font-size:11.5px;padding:2px 9px;border-radius:99px;border:1px solid var(--line);color:var(--mut);white-space:nowrap}
.s-sent{color:var(--ok);border-color:rgba(52,211,153,.35);background:rgba(52,211,153,.08)}.s-held,.s-failed{color:var(--bad);border-color:rgba(248,113,113,.35);background:rgba(248,113,113,.08)}.s-pending,.s-sending{color:var(--warn);border-color:rgba(251,191,36,.35);background:rgba(251,191,36,.08)}
.post{display:grid;gap:8px}.post .t{white-space:pre-wrap;word-break:break-word;display:-webkit-box;-webkit-line-clamp:4;-webkit-box-orient:vertical;overflow:hidden;color:var(--text)}.post .t.open{-webkit-line-clamp:unset}
.mut{color:var(--mut);font-size:12.5px}
.chat{display:grid;gap:10px}.msg{display:flex;gap:10px;align-items:flex-start}
.av{flex:none;width:34px;height:34px;border-radius:12px;display:grid;place-items:center;font-size:17px;background:var(--card2);border:1px solid var(--line)}
.bub{background:var(--card2);border:1px solid var(--line);border-radius:4px 16px 16px 16px;padding:9px 13px;max-width:100%;white-space:pre-wrap;word-break:break-word}
.msg .who{font-size:11.5px;color:var(--mut);margin-bottom:2px}
.msg.owner .bub{background:linear-gradient(135deg,rgba(124,92,255,.22),rgba(32,211,194,.12));border-color:rgba(124,92,255,.4)}
.ask{border:1px solid rgba(251,191,36,.4);background:rgba(251,191,36,.07);border-radius:14px;padding:12px;display:grid;gap:8px}
.sw{position:relative;width:44px;height:26px;flex:none;border-radius:99px;background:var(--line);border:0;cursor:pointer;transition:.2s}.sw::after{content:"";position:absolute;top:3px;right:3px;width:20px;height:20px;border-radius:50%;background:#fff;transition:.2s}.sw.on{background:linear-gradient(135deg,var(--acc),var(--acc2))}.sw.on::after{right:21px}
.modal{position:fixed;inset:0;z-index:50;background:rgba(5,7,12,.6);backdrop-filter:blur(6px);display:grid;place-items:end center;padding:0}
@media(min-width:700px){.modal{place-items:center;padding:20px}}
.sheet{width:min(560px,100%);max-height:92vh;overflow:auto;background:var(--card);border:1px solid var(--line);border-radius:22px 22px 0 0;padding:20px;display:grid;gap:12px;box-shadow:var(--sh);animation:up .22s ease}
@media(min-width:700px){.sheet{border-radius:22px}}
@keyframes up{from{transform:translateY(24px);opacity:0}to{transform:none;opacity:1}}
.toast{position:fixed;inset:auto 0 88px;display:grid;place-items:center;z-index:80;pointer-events:none}.toast div{background:var(--text);color:var(--bg);padding:9px 16px;border-radius:99px;font-size:13px;box-shadow:var(--sh);animation:up .2s}
.empty{text-align:center;color:var(--mut);padding:34px 10px}
.lock{min-height:100vh;display:grid;place-items:center;padding:24px;text-align:center}.lock .card{max-width:420px}
.skeleton{height:70px;border-radius:14px;background:linear-gradient(90deg,var(--card),var(--card2),var(--card));background-size:200% 100%;animation:sh 1.3s infinite}@keyframes sh{to{background-position:-200% 0}}
</style>
</head>
<body>
<svg width="0" height="0" style="position:absolute"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#7c5cff"/><stop offset="1" stop-color="#20d3c2"/></linearGradient></defs></svg>
<div id="root"></div>
<script>
(function(){
'use strict';
var API='/app/api/', TOKEN='', S={tab:'home',st:null,filter:'',q:'',data:{}}, timer=null;
try{var m=location.hash.match(/k=([\\w-]+)/);if(m){TOKEN=m[1];try{localStorage.setItem('ea_tk',TOKEN)}catch(e){}history.replaceState(null,'',location.pathname)}else{try{TOKEN=localStorage.getItem('ea_tk')||''}catch(e){}}}catch(e){}
var ICON={home:'<path d="M3 11l9-8 9 8"/><path d="M5 10v10h14V10"/>',posts:'<rect x="4" y="3" width="16" height="18" rx="3"/><path d="M8 8h8M8 12h8M8 16h5"/>',brain:'<path d="M9 4a3 3 0 00-3 3 3 3 0 00-2 5 3 3 0 002 5 3 3 0 006 0V7a3 3 0 00-3-3z"/><path d="M15 4a3 3 0 013 3 3 3 0 012 5 3 3 0 01-2 5 3 3 0 01-3 2"/>',council:'<path d="M4 5h16v10H9l-5 4z"/><path d="M8 9h8M8 12h5"/>',bot:'<rect x="4" y="8" width="16" height="11" rx="3"/><path d="M12 4v4M9 13h.01M15 13h.01"/>',cog:'<circle cx="12" cy="12" r="3"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3M5 5l2 2M17 17l2 2M19 5l-2 2M7 17l-2 2"/>'};
var ic=function(n){return '<svg viewBox="0 0 24 24">'+ICON[n]+'</svg>'};
function h(tag,a){var e=document.createElement(tag);a=a||{};for(var k in a){if(k==='class')e.className=a[k];else if(k==='html')e.innerHTML=a[k];else if(k.slice(0,2)==='on')e.addEventListener(k.slice(2),a[k]);else if(a[k]!==false&&a[k]!=null)e.setAttribute(k,a[k])}
for(var i=2;i<arguments.length;i++){var c=arguments[i];if(c==null||c===false)continue;if(Array.isArray(c))c.forEach(function(x){x!=null&&e.append(x.nodeType?x:document.createTextNode(x))});else e.append(c.nodeType?c:document.createTextNode(c))}return e}
function api(path,opt){opt=opt||{};return fetch(API+path,{method:opt.body?'POST':'GET',headers:{authorization:'Bearer '+TOKEN,'content-type':'application/json'},body:opt.body?JSON.stringify(opt.body):undefined}).then(function(r){if(r.status===401){lock();throw new Error('auth')}return r.json()})}
function toast(t){var x=h('div',{class:'toast'},h('div',{},t));document.body.append(x);setTimeout(function(){x.remove()},2200)}
var FA={sent:'\u0627\u0631\u0633\u0627\u0644\u200C\u0634\u062F\u0647',held:'\u0646\u06AF\u0647\u200C\u062F\u0627\u0634\u062A\u0647',pending:'\u062F\u0631 \u0635\u0641',sending:'\u062F\u0631 \u062D\u0627\u0644 \u0627\u0631\u0633\u0627\u0644',failed:'\u0646\u0627\u0645\u0648\u0641\u0642',deleted:'\u062D\u0630\u0641\u200C\u0634\u062F\u0647',replaced:'\u062C\u0627\u06CC\u06AF\u0632\u06CC\u0646\u200C\u0634\u062F\u0647',canceled:'\u0644\u063A\u0648',draft:'\u067E\u06CC\u0634\u200C\u0646\u0648\u06CC\u0633'};
function ago(ts){if(!ts)return'';var d=Math.floor(Date.now()/1000)-ts;if(d<60)return'\u0644\u062D\u0638\u0627\u062A\u06CC \u067E\u06CC\u0634';if(d<3600)return Math.floor(d/60)+' \u062F\u0642\u06CC\u0642\u0647 \u067E\u06CC\u0634';if(d<86400)return Math.floor(d/3600)+' \u0633\u0627\u0639\u062A \u067E\u06CC\u0634';return Math.floor(d/86400)+' \u0631\u0648\u0632 \u067E\u06CC\u0634'}
function lock(){clearInterval(timer);document.getElementById('root').replaceChildren(h('div',{class:'lock'},h('div',{class:'card col'},h('div',{class:'logo',style:'margin:0 auto',html:'<svg viewBox="0 0 24 24" fill="none" stroke-width="2"><rect x="5" y="11" width="14" height="9" rx="2"/><path d="M8 11V8a4 4 0 018 0v3"/></svg>'}),h('h2',{style:'margin:0'},'\u062F\u0633\u062A\u0631\u0633\u06CC \u0644\u0627\u0632\u0645 \u0627\u0633\u062A'),h('div',{class:'mut'},'\u0644\u06CC\u0646\u06A9 \u0634\u0645\u0627 \u0645\u0646\u0642\u0636\u06CC \u0634\u062F\u0647 \u06CC\u0627 \u0646\u0627\u0645\u0639\u062A\u0628\u0631 \u0627\u0633\u062A. \u062F\u0631 \u0631\u0628\u0627\u062A \u0628\u0641\u0631\u0633\u062A\u06CC\u062F ',h('b',{},'/site'),' \u06CC\u0627 \u0627\u0632 \xAB\u{1F465} \u06AF\u0631\u0648\u0647 \u0648 \u0646\u0627\u0638\u0631 \u2190 \u{1F310} \u0633\u0627\u06CC\u062A \u0645\u0646\xBB \u0644\u06CC\u0646\u06A9 \u062A\u0627\u0632\u0647 \u0628\u06AF\u06CC\u0631\u06CC\u062F.'))))}
function modal(title,body,actions){var m=h('div',{class:'modal',onclick:function(e){if(e.target===m)m.remove()}},h('div',{class:'sheet'},h('h3',{style:'margin:0'},title),body,h('div',{class:'row'},actions)));document.body.append(m);return m}
function confirmBox(t,fn){var m;m=modal(t,h('span'),[h('button',{class:'btn bad',onclick:function(){m.remove();fn()}},'\u0628\u0644\u0647'),h('button',{class:'btn',onclick:function(){m.remove()}},'\u0627\u0646\u0635\u0631\u0627\u0641')])}

function shell(){
  var tabs=[['home','\u0646\u0645\u0627\u06CC \u06A9\u0644\u06CC','home'],['posts','\u067E\u0633\u062A\u200C\u0647\u0627','posts'],['lessons','\u0622\u0645\u0648\u062E\u062A\u0647\u200C\u0647\u0627','brain'],['council','\u0634\u0648\u0631\u0627','council'],['jobs','\u0627\u06CC\u062C\u0646\u062A\u200C\u0647\u0627','bot'],['settings','\u062A\u0646\u0638\u06CC\u0645\u0627\u062A','cog']];
  var st=S.st||{};var open=(st.counts&&st.counts.asks)||0;
  var nav=h('nav',{},tabs.map(function(t){return h('button',{class:S.tab===t[0]?'on':'',onclick:function(){S.tab=t[0];render()},html:ic(t[2])+'<span>'+t[1]+'</span>'+(t[0]==='council'&&open?'<i class="badge">'+open+'</i>':'')})}));
  return h('div',{class:'app'},h('header',{},h('div',{class:'logo',html:'<svg viewBox="0 0 24 24" fill="none" stroke-width="2"><path d="M12 3l2.5 5.5L20 9l-4 4 1 6-5-3-5 3 1-6-4-4 5.5-.5z"/></svg>'}),h('div',{},h('h1',{},'\u0627\u06CC\u062C\u0646\u062A \u0627\u06CC\u062A\u0627'),h('small',{},st.user?st.user.name:'')),h('div',{class:'sp'}),h('span',{class:'dot'})),nav,h('main',{id:'view'}))}
function render(){var r=document.getElementById('root');if(!document.getElementById('view')||!r.querySelector('nav')){r.replaceChildren(shell())}else{r.replaceChildren(shell())}load()}
function view(el){var v=document.getElementById('view');v.replaceChildren.apply(v,[].concat(el))}
function skel(){view([h('div',{class:'skeleton'}),h('div',{class:'skeleton'}),h('div',{class:'skeleton'})])}

function load(){
  var t=S.tab;
  api('state').then(function(st){S.st=st;var open=st.counts.asks;var b=document.querySelector('nav .badge');
    if(t==='home')return Promise.all([api('posts?limit=5'),api('council')]).then(function(r){S.data.recent=r[0].posts;S.data.council=r[1];draw()});
    if(t==='posts')return api('posts?status='+encodeURIComponent(S.filter)+'&q='+encodeURIComponent(S.q)).then(function(r){S.data.posts=r.posts;draw()});
    if(t==='lessons')return api('lessons').then(function(r){S.data.lessons=r.lessons;draw()});
    if(t==='council')return api('council').then(function(r){S.data.council=r;draw()});
    if(t==='jobs')return api('jobs').then(function(r){S.data.jobs=r.jobs;draw()});
    draw()}).catch(function(e){console.error('ea',e);if(e.message!=='auth')view(h('div',{class:'empty'},'\u062E\u0637\u0627 \u062F\u0631 \u0628\u0627\u0631\u06AF\u0630\u0627\u0631\u06CC\u061B \u062F\u0648\u0628\u0627\u0631\u0647 \u062A\u0644\u0627\u0634 \u06A9\u0646\u06CC\u062F.'))})}
function draw(){var f={home:vHome,posts:vPosts,lessons:vLessons,council:vCouncil,jobs:vJobs,settings:vSettings}[S.tab];view(f())}

function badge(s){return h('span',{class:'badge2 s-'+s},FA[s]||s)}
function bubble(m){var meta={sup:['\u{1F6E1}','\u0646\u0627\u0638\u0631'],asst:['\u{1F9ED}','\u062F\u0633\u062A\u06CC\u0627\u0631'],owner:['\u{1F464}','\u0634\u0645\u0627']}[m.role]||['\u{1F916}',m.role];return h('div',{class:'msg '+(m.role==='owner'?'owner':'')},h('div',{class:'av'},meta[0]),h('div',{},h('div',{class:'who'},meta[1]+' \xB7 '+ago(m.created_at)),h('div',{class:'bub'},m.text)))}

function vHome(){var st=S.st,c=st.counts,rec=S.data.recent||[],co=S.data.council||{messages:[],asks:[]};
  var out=[h('div',{class:'grid'},[['\u0627\u0631\u0633\u0627\u0644\u200C\u0634\u062F\u0647',c.sent],['\u0646\u06AF\u0647\u200C\u062F\u0627\u0634\u062A\u0647',c.held],['\u0622\u0645\u0648\u062E\u062A\u0647\u200C\u0647\u0627',c.lessons],['\u0633\u0624\u0627\u0644 \u0628\u06CC\u200C\u067E\u0627\u0633\u062E',c.asks]].map(function(x){return h('div',{class:'card stat'},h('b',{},String(x[1])),h('span',{},x[0]))}))];
  if(!st.group)out.push(h('div',{class:'card col'},h('h3',{},'\u{1F465} \u06AF\u0631\u0648\u0647 \u0645\u062A\u0635\u0644 \u0646\u06CC\u0633\u062A'),h('div',{class:'mut'},'\u062F\u0631 \u06AF\u0631\u0648\u0647 \u062A\u0644\u06AF\u0631\u0627\u0645 (Topics \u0631\u0648\u0634\u0646\u060C \u0631\u0628\u0627\u062A \u0627\u062F\u0645\u06CC\u0646) \u062F\u0633\u062A\u0648\u0631 /eagroup \u0631\u0627 \u0628\u0641\u0631\u0633\u062A\u06CC\u062F \u062A\u0627 \u067E\u0633\u062A\u200C\u0647\u0627 \u0627\u0648\u0644 \u062F\u0631 \u06AF\u0631\u0648\u0647 \u0628\u06CC\u0627\u06CC\u0646\u062F \u0648 \u0646\u0627\u0638\u0631 \u0628\u0631\u0631\u0633\u06CC \u06A9\u0646\u062F.')));
  var open=(co.asks||[]).filter(function(a){return a.status==='open'});open.forEach(function(a){out.push(askCard(a))});
  out.push(h('div',{class:'card'},h('h3',{},'\u{1F91D} \u0622\u062E\u0631\u06CC\u0646 \u06AF\u0641\u062A\u06AF\u0648\u06CC \u0634\u0648\u0631\u0627'),h('div',{class:'chat'},(co.messages||[]).slice(-4).map(bubble)),!(co.messages||[]).length&&h('div',{class:'mut'},'\u0647\u0646\u0648\u0632 \u06AF\u0641\u062A\u06AF\u0648\u06CC\u06CC \u0646\u0628\u0648\u062F\u0647.')));
  out.push(h('div',{class:'card col'},h('h3',{},'\u{1F4DD} \u0622\u062E\u0631\u06CC\u0646 \u067E\u0633\u062A\u200C\u0647\u0627'),rec.length?rec.map(postCard):h('div',{class:'mut'},'\u067E\u0633\u062A\u06CC \u0646\u06CC\u0633\u062A.')));
  return out}
function askCard(a){var inp=h('input',{placeholder:'\u067E\u0627\u0633\u062E \u0634\u0645\u0627\u2026'});return h('div',{class:'ask'},h('b',{},'\u2753 '+(a.role==='asst'?'\u062F\u0633\u062A\u06CC\u0627\u0631':'\u0646\u0627\u0638\u0631')+' \u0627\u0632 \u0634\u0645\u0627 \u06A9\u0645\u06A9 \u0645\u06CC\u200C\u062E\u0648\u0627\u0647\u062F'),h('div',{},a.question),h('div',{class:'row'},inp,h('button',{class:'btn pri sm',onclick:function(){if(!inp.value.trim())return;api('ask',{body:{id:a.id,answer:inp.value}}).then(function(){toast('\u067E\u0627\u0633\u062E \u0628\u0647 \u0634\u0648\u0631\u0627 \u0631\u0633\u06CC\u062F');load()})}},'\u0627\u0631\u0633\u0627\u0644'),h('button',{class:'btn sm',onclick:function(){api('ask',{body:{id:a.id,skip:true}}).then(load)}},'\u0646\u0627\u062F\u06CC\u062F\u0647')))}

function postCard(p){
  var t=h('div',{class:'t',onclick:function(){t.classList.toggle('open')}},p.text||(p.kind==='file'?'\u{1F4CE} '+(p.file_name||'\u0641\u0627\u06CC\u0644'):'(\u0628\u062F\u0648\u0646 \u0645\u062A\u0646)'));
  var acts=[];
  if(['sent','held','pending','failed'].indexOf(p.status)>=0){
    acts.push(h('button',{class:'btn sm',onclick:function(){editPost(p)}},'\u270F\uFE0F \u0648\u06CC\u0631\u0627\u06CC\u0634'));
    if(p.status==='held')acts.push(h('button',{class:'btn sm',onclick:function(){api('post/'+p.id+'/send',{body:{}}).then(function(r){toast(r.message||'\u062F\u0631 \u0635\u0641 \u0642\u0631\u0627\u0631 \u06AF\u0631\u0641\u062A');load()})}},'\u{1F680} \u0627\u0631\u0633\u0627\u0644'));
    if(p.status!=='sent')acts.push(h('button',{class:'btn sm',onclick:function(){timePost(p)}},'\u23F0 \u0632\u0645\u0627\u0646'));
    acts.push(h('button',{class:'btn sm bad',onclick:function(){confirmBox('\u067E\u0633\u062A #'+p.id+' \u062D\u0630\u0641 \u0634\u0648\u062F\u061F',function(){api('post/'+p.id+'/delete',{body:{}}).then(function(r){toast(r.message||'\u062D\u0630\u0641 \u0634\u062F');load()})})}},'\u{1F5D1} \u062D\u0630\u0641'))}
  return h('div',{class:'card post'},h('div',{class:'row'},badge(p.status),p.kind==='file'?h('span',{class:'badge2'},'\u{1F4CE} \u0631\u0633\u0627\u0646\u0647'):null,p.verdict==='fixed'?h('span',{class:'badge2'},'\u270F\uFE0F \u0627\u0635\u0644\u0627\u062D \u0646\u0627\u0638\u0631'):null,h('span',{class:'mut'},'#'+p.id+' \xB7 '+(p.channel||'')+' \xB7 '+ago(p.sent_at||p.created_at))),t,p.error&&p.status!=='sent'?h('div',{class:'mut'},'\u26A0\uFE0F '+p.error):null,acts.length?h('div',{class:'row'},acts):null)}
function timePost(p){var inp=h('input',{type:'datetime-local'});var m=modal('\u0632\u0645\u0627\u0646 \u0627\u0631\u0633\u0627\u0644 \u067E\u0633\u062A #'+p.id,h('div',{class:'col'},h('div',{class:'mut'},'\u0632\u0645\u0627\u0646 \u062A\u0627\u0632\u0647\u200C\u06CC \u0627\u0631\u0633\u0627\u0644 (\u0628\u0647 \u0648\u0642\u062A \u062F\u0633\u062A\u06AF\u0627\u0647 \u0634\u0645\u0627)'),inp),[h('button',{class:'btn pri',onclick:function(){var t=inp.value?Math.floor(new Date(inp.value).getTime()/1000):0;if(!t){toast('\u0632\u0645\u0627\u0646 \u0631\u0627 \u0627\u0646\u062A\u062E\u0627\u0628 \u06A9\u0646\u06CC\u062F');return}api('post/'+p.id+'/time',{body:{run_at:t}}).then(function(r){m.remove();toast(r.message||'\u062B\u0628\u062A \u0634\u062F');load()})}},'\u062B\u0628\u062A'),h('button',{class:'btn',onclick:function(){m.remove()}},'\u0628\u0633\u062A\u0646')])}
function editPost(p){var ta=h('textarea',{},p.text);var m=modal('\u0648\u06CC\u0631\u0627\u06CC\u0634 \u067E\u0633\u062A #'+p.id,h('div',{class:'col'},h('div',{class:'mut'},'\u0627\u06CC\u062A\u0627 \u0648\u06CC\u0631\u0627\u06CC\u0634 \u067E\u06CC\u0627\u0645 \u0631\u0627 \u067E\u0634\u062A\u06CC\u0628\u0627\u0646\u06CC \u0646\u0645\u06CC\u200C\u06A9\u0646\u062F\u061B \u067E\u06CC\u0627\u0645 \u0642\u0628\u0644\u06CC \u062D\u0630\u0641 \u0648 \u067E\u0633\u062A \u062F\u0631\u0633\u062A\u200C\u0634\u062F\u0647 \u062F\u0648\u0628\u0627\u0631\u0647 \u0627\u0631\u0633\u0627\u0644 \u0645\u06CC\u200C\u0634\u0648\u062F (\u0627\u0648\u0644 \u06AF\u0631\u0648\u0647\u060C \u0628\u0639\u062F \u0646\u0627\u0638\u0631\u060C \u0628\u0639\u062F \u0627\u06CC\u062A\u0627).'),ta,p.kind==='file'?h('div',{class:'mut'},'\u0628\u0631\u0627\u06CC \u0639\u0648\u0636\u200C\u06A9\u0631\u062F\u0646 \u0639\u06A9\u0633/\u0648\u06CC\u062F\u06CC\u0648 \u0627\u0632 \u062F\u06A9\u0645\u0647\u200C\u06CC \xAB\u0645\u062F\u06CC\u0631\u06CC\u062A \u067E\u0633\u062A\xBB \u062F\u0631 \u06AF\u0631\u0648\u0647 \u0627\u0633\u062A\u0641\u0627\u062F\u0647 \u06A9\u0646\u06CC\u062F. (\u0645\u062A\u0646 \u0647\u0645\u0631\u0627\u0647 \u0631\u0633\u0627\u0646\u0647 \u062D\u062F\u0627\u06A9\u062B\u0631 \u06F1\u06F0\u06F0\u06F0 \u0646\u0648\u06CC\u0633\u0647)'):null),[h('button',{class:'btn pri',onclick:function(){api('post/'+p.id+'/edit',{body:{text:ta.value}}).then(function(r){m.remove();toast(r.message||r.error||'\u0627\u0646\u062C\u0627\u0645 \u0634\u062F');load()})}},'\u0630\u062E\u06CC\u0631\u0647 \u0648 \u0627\u0631\u0633\u0627\u0644 \u0645\u062C\u062F\u062F'),h('button',{class:'btn',onclick:function(){m.remove()}},'\u0627\u0646\u0635\u0631\u0627\u0641')])}
function vPosts(){var chips=[['','\u0647\u0645\u0647'],['sent','\u0627\u0631\u0633\u0627\u0644\u200C\u0634\u062F\u0647'],['held','\u0646\u06AF\u0647\u200C\u062F\u0627\u0634\u062A\u0647'],['pending','\u062F\u0631 \u0635\u0641'],['failed','\u0646\u0627\u0645\u0648\u0641\u0642']];var q=h('input',{placeholder:'\u062C\u0633\u062A\u062C\u0648 \u062F\u0631 \u0645\u062A\u0646 \u067E\u0633\u062A\u200C\u0647\u0627\u2026',value:S.q});q.addEventListener('keydown',function(e){if(e.key==='Enter'){S.q=q.value;load()}});
  return [h('div',{class:'col'},q,h('div',{class:'row'},chips.map(function(c){return h('button',{class:'chip '+(S.filter===c[0]?'on':''),onclick:function(){S.filter=c[0];load()}},c[1])}))),(S.data.posts||[]).length?(S.data.posts).map(postCard):h('div',{class:'empty'},'\u067E\u0633\u062A\u06CC \u067E\u06CC\u062F\u0627 \u0646\u0634\u062F.')]}

function vLessons(){var L=S.data.lessons||[];var inp=h('input',{placeholder:'\u0642\u0627\u0646\u0648\u0646 \u062A\u0627\u0632\u0647\u2026 \u0645\u062B\u0644\u0627\u064B \xAB\u0622\u062E\u0631 \u0645\u062A\u0646 \u0622\u06CC\u062F\u06CC \u06A9\u0627\u0646\u0627\u0644 \u062F\u06CC\u06AF\u0631 \u0646\u06AF\u0630\u0627\u0631\xBB'});
  var add=function(){if(inp.value.trim().length<6)return toast('\u0642\u0627\u0646\u0648\u0646 \u062E\u06CC\u0644\u06CC \u06A9\u0648\u062A\u0627\u0647 \u0627\u0633\u062A');api('lesson',{body:{op:'add',rule:inp.value}}).then(function(r){toast(r.ok?'\u0627\u0636\u0627\u0641\u0647 \u0634\u062F':'\u062A\u06A9\u0631\u0627\u0631\u06CC \u06CC\u0627 \u0646\u0627\u0645\u0639\u062A\u0628\u0631');load()})};inp.addEventListener('keydown',function(e){if(e.key==='Enter')add()});
  return [h('div',{class:'card col'},h('h3',{},'\u{1F9E0} \u0622\u0645\u0648\u062E\u062A\u0647\u200C\u0647\u0627'),h('div',{class:'mut'},'\u0647\u0631\u0686\u0647 \u0627\u06CC\u062C\u0646\u062A\u200C\u0647\u0627 \u06CC\u0627\u062F \u06AF\u0631\u0641\u062A\u0647\u200C\u0627\u0646\u062F. \u0645\u06CC\u200C\u062A\u0648\u0627\u0646\u06CC\u062F \u0647\u0631 \u0642\u0627\u0646\u0648\u0646 \u0631\u0627 \u0648\u06CC\u0631\u0627\u06CC\u0634 \u06CC\u0627 \u062D\u0630\u0641 \u06A9\u0646\u06CC\u062F \u06CC\u0627 \u0642\u0627\u0646\u0648\u0646 \u062A\u0627\u0632\u0647 \u0628\u062F\u0647\u06CC\u062F\u061B \u062F\u0631 \u067E\u0631\u0627\u0645\u067E\u062A \u0627\u06CC\u062C\u0646\u062A \u0648 \u0628\u0631\u0631\u0633\u06CC \u0646\u0627\u0638\u0631 \u062F\u06CC\u062F\u0647 \u0645\u06CC\u200C\u0634\u0648\u062F.'),h('div',{class:'row'},inp,h('button',{class:'btn pri',onclick:add},'\u0627\u0641\u0632\u0648\u062F\u0646'))),
    L.length?L.map(function(l){return h('div',{class:'card row'},h('div',{style:'flex:1;min-width:200px'},h('div',{},l.rule),h('div',{class:'mut'},(l.source&&l.source.indexOf('council')===0?'\u{1F91D} \u0634\u0648\u0631\u0627':l.source==='owner'?'\u{1F464} \u0634\u0645\u0627':'\u{1F6A9} \u06AF\u0632\u0627\u0631\u0634 \u062E\u0637\u0627')+' \xB7 '+ago(l.created_at))),h('button',{class:'btn sm',onclick:function(){var ta=h('textarea',{style:'min-height:80px'},l.rule);var m=modal('\u0648\u06CC\u0631\u0627\u06CC\u0634 \u0642\u0627\u0646\u0648\u0646',ta,[h('button',{class:'btn pri',onclick:function(){api('lesson',{body:{op:'edit',id:l.id,rule:ta.value}}).then(function(){m.remove();load()})}},'\u0630\u062E\u06CC\u0631\u0647'),h('button',{class:'btn',onclick:function(){m.remove()}},'\u0627\u0646\u0635\u0631\u0627\u0641')])}},'\u270F\uFE0F'),h('button',{class:'btn sm bad',onclick:function(){api('lesson',{body:{op:'delete',id:l.id}}).then(function(){toast('\u0641\u0631\u0627\u0645\u0648\u0634 \u0634\u062F');load()})}},'\u{1F5D1}'))}):h('div',{class:'empty'},'\u0647\u0646\u0648\u0632 \u0686\u06CC\u0632\u06CC \u06CC\u0627\u062F \u0646\u06AF\u0631\u0641\u062A\u0647\u200C\u0627\u0646\u062F.')]}

function vCouncil(){var co=S.data.council||{messages:[],asks:[]};var inp=h('input',{placeholder:'\u0628\u0647 \u0646\u0627\u0638\u0631 \u0648 \u062F\u0633\u062A\u06CC\u0627\u0631 \u0628\u06AF\u0648\u06CC\u06CC\u062F\u2026'});
  var say=function(){if(!inp.value.trim())return;api('council/say',{body:{text:inp.value}}).then(function(){inp.value='';toast('\u0628\u0647 \u0634\u0648\u0631\u0627 \u0631\u0633\u06CC\u062F\u061B \u062A\u0627 \u06CC\u06A9 \u062F\u0642\u06CC\u0642\u0647\u200C\u06CC \u062F\u06CC\u06AF\u0631 \u067E\u0627\u0633\u062E \u0645\u06CC\u200C\u062F\u0647\u0646\u062F');load()})};inp.addEventListener('keydown',function(e){if(e.key==='Enter')say()});
  var open=(co.asks||[]).filter(function(a){return a.status==='open'}).map(askCard);
  return [].concat(open,[h('div',{class:'card col'},h('div',{class:'row'},h('h3',{style:'margin:0;flex:1'},'\u{1F91D} \u0634\u0648\u0631\u0627\u06CC \u0646\u0627\u0638\u0631 \u0648 \u062F\u0633\u062A\u06CC\u0627\u0631'),h('button',{class:'btn sm',onclick:function(){api('council/run',{body:{}}).then(function(r){toast(r.message||'\u062C\u0644\u0633\u0647 \u062F\u0631\u062E\u0648\u0627\u0633\u062A \u0634\u062F')})}},'\u062C\u0644\u0633\u0647\u200C\u06CC \u062A\u0627\u0632\u0647')),h('div',{class:'chat'},(co.messages||[]).length?co.messages.map(bubble):h('div',{class:'empty'},'\u0647\u0646\u0648\u0632 \u062C\u0644\u0633\u0647\u200C\u0627\u06CC \u0646\u0628\u0648\u062F\u0647. \u0628\u0627 \u0647\u0631 \u062E\u0637\u0627 \u06CC\u0627 \u0647\u0631 \u0631\u0648\u0632 \u06CC\u06A9 \u0628\u0627\u0631 \u062E\u0648\u062F\u06A9\u0627\u0631 \u0628\u0631\u06AF\u0632\u0627\u0631 \u0645\u06CC\u200C\u0634\u0648\u062F.')),h('div',{class:'row'},inp,h('button',{class:'btn pri',onclick:say},'\u0627\u0631\u0633\u0627\u0644')))])}

function vJobs(){var J=S.data.jobs||[];if(!J.length)return h('div',{class:'empty'},'\u0627\u06CC\u062C\u0646\u062A\u06CC \u0646\u062F\u0627\u0631\u06CC\u062F. \u062F\u0631 \u0631\u0628\u0627\u062A \u0627\u0632 \xAB\u{1F916} \u0627\u06CC\u062C\u0646\u062A\xBB \u06CC\u06A9\u06CC \u0628\u0633\u0627\u0632\u06CC\u062F.');
  return J.map(function(j){return h('div',{class:'card col'},h('div',{class:'row'},h('b',{style:'flex:1'},j.name||('\u0627\u06CC\u062C\u0646\u062A #'+j.id)),h('button',{class:'sw '+(j.enabled?'on':''),onclick:function(){api('job',{body:{op:'toggle',id:j.id}}).then(load)}})),h('div',{class:'mut',style:'white-space:pre-wrap'},j.instruction),h('div',{class:'mut'},'\u23F0 '+(j.times||'\u2014')+(j.last_info?' \xB7 '+j.last_info:'')),h('div',{class:'row'},h('button',{class:'btn sm',onclick:function(){api('job',{body:{op:'run',id:j.id}}).then(function(){toast('\u062A\u0627 \u06CC\u06A9 \u062F\u0642\u06CC\u0642\u0647\u200C\u06CC \u062F\u06CC\u06AF\u0631 \u0627\u062C\u0631\u0627 \u0645\u06CC\u200C\u0634\u0648\u062F')})}},'\u25B6 \u0627\u062C\u0631\u0627 \u06A9\u0646'),h('button',{class:'btn sm',onclick:function(){var ta=h('textarea',{},j.instruction);var m=modal('\u0648\u06CC\u0631\u0627\u06CC\u0634 \u062F\u0633\u062A\u0648\u0631 \u0627\u06CC\u062C\u0646\u062A',ta,[h('button',{class:'btn pri',onclick:function(){api('job',{body:{op:'edit',id:j.id,instruction:ta.value}}).then(function(){m.remove();load()})}},'\u0630\u062E\u06CC\u0631\u0647'),h('button',{class:'btn',onclick:function(){m.remove()}},'\u0627\u0646\u0635\u0631\u0627\u0641')])}},'\u270F\uFE0F \u062F\u0633\u062A\u0648\u0631'),h('button',{class:'btn sm bad',onclick:function(){confirmBox('\u0627\u06CC\u0646 \u0627\u06CC\u062C\u0646\u062A \u062D\u0630\u0641 \u0634\u0648\u062F\u061F',function(){api('job',{body:{op:'delete',id:j.id}}).then(load)})}},'\u{1F5D1}')))})}

function botBox(role,fa,info){var inp=h('input',{placeholder:'\u062A\u0648\u06A9\u0646 \u0631\u0628\u0627\u062A '+fa+' (\u0627\u0632 BotFather)',dir:'ltr'});return h('div',{class:'col'},h('div',{class:'row'},h('b',{},(role==='sup'?'\u{1F6E1} ':'\u{1F9ED} ')+fa),h('span',{class:'mut'},info.has?'\u2705 '+(info.name?'@'+info.name:'\u062B\u0628\u062A \u0634\u062F\u0647'):'\u0631\u0628\u0627\u062A \u062C\u062F\u0627 \u0646\u062F\u0627\u0631\u062F (\u0647\u0645\u06CC\u0646 \u0631\u0628\u0627\u062A \u0645\u06CC\u200C\u0646\u0648\u06CC\u0633\u062F)')),h('div',{class:'row'},inp,h('button',{class:'btn pri sm',onclick:function(){api('settings',{body:{role:role,token:inp.value}}).then(function(r){toast(r.message||r.error||'\u0627\u0646\u062C\u0627\u0645 \u0634\u062F');load()})}},'\u062B\u0628\u062A'),info.has?h('button',{class:'btn sm bad',onclick:function(){api('settings',{body:{role:role,clear:true}}).then(load)}},'\u062D\u0630\u0641'):null))}
function vSettings(){var st=S.st,g=st.group;
  return [h('div',{class:'card col'},h('h3',{},'\u{1F465} \u06AF\u0631\u0648\u0647'),g?h('div',{},'\u2705 '+(g.title||g.chat)+(g.forum?' \xB7 \u062A\u0627\u067E\u06CC\u06A9\u200C\u0647\u0627':' \xB7 \u0628\u062F\u0648\u0646 \u062A\u0627\u067E\u06CC\u06A9')):h('div',{class:'mut'},'\u0645\u062A\u0635\u0644 \u0646\u06CC\u0633\u062A. \u062F\u0631 \u06AF\u0631\u0648\u0647 \u0628\u0641\u0631\u0633\u062A\u06CC\u062F /eagroup'),g&&h('div',{class:'row'},h('b',{style:'flex:1'},'\u0628\u0631\u0631\u0633\u06CC \u0646\u0627\u0638\u0631 \u067E\u06CC\u0634 \u0627\u0632 \u0627\u06CC\u062A\u0627'),h('button',{class:'sw '+(g.review?'on':''),onclick:function(){api('settings',{body:{review:!g.review}}).then(load)}}))),
    h('div',{class:'card col'},h('h3',{},'\u{1F916} \u0631\u0628\u0627\u062A\u200C\u0647\u0627\u06CC \u06AF\u0631\u0648\u0647'),botBox('sup','\u0646\u0627\u0638\u0631',st.sup),h('hr',{style:'border:0;border-top:1px solid var(--line);width:100%'}),botBox('asst','\u062F\u0633\u062A\u06CC\u0627\u0631',st.asst),h('div',{class:'mut'},'\u0647\u0631 \u0631\u0628\u0627\u062A \u0631\u0627 \u062F\u0631 BotFather \u0628\u0633\u0627\u0632\u06CC\u062F\u060C \u062A\u0648\u06A9\u0646 \u0631\u0627 \u0627\u06CC\u0646\u062C\u0627 \u0628\u062F\u0647\u06CC\u062F \u0648 \u062F\u0631 \u06AF\u0631\u0648\u0647 \u0627\u062F\u0645\u06CC\u0646 \u06A9\u0646\u06CC\u062F.')),
    h('div',{class:'card row'},h('b',{style:'flex:1'},'\u0638\u0627\u0647\u0631'),h('button',{class:'btn sm',onclick:function(){var d=document.documentElement,c=d.getAttribute('data-theme')==='light'?'dark':'light';d.setAttribute('data-theme',c);try{localStorage.setItem('ea_th',c)}catch(e){}}},'\u062A\u06CC\u0631\u0647 / \u0631\u0648\u0634\u0646'),h('button',{class:'btn sm bad',onclick:function(){try{localStorage.removeItem('ea_tk')}catch(e){}TOKEN='';lock()}},'\u062E\u0631\u0648\u062C'))]}

try{var th=localStorage.getItem('ea_th');if(th)document.documentElement.setAttribute('data-theme',th)}catch(e){}
if(!TOKEN)lock();else{render();timer=setInterval(function(){if(!document.hidden&&!document.querySelector('.modal')&&document.activeElement&&document.activeElement.tagName!=='INPUT'&&document.activeElement.tagName!=='TEXTAREA')load()},25000)}
})();
<\/script>
</body>
</html>
`;

// eitaa-src/web.ts
var appPage = () => new Response(app_default, { headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-store", "x-frame-options": "DENY", "referrer-policy": "no-referrer" } });
var sha = async (s) => [...new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s)))].map((b) => b.toString(16).padStart(2, "0")).join("");
var TTL = 7 * 86400;
async function siteLink(env, uid) {
  const base = (env.WORKER_URL || "").replace(/\/$/, "");
  if (!base) return "\u274C \u0622\u062F\u0631\u0633 Worker (WORKER_URL) \u062A\u0646\u0638\u06CC\u0645 \u0646\u0634\u062F\u0647 \u0627\u0633\u062A\u061B \u0646\u0635\u0628 \u0631\u0627 \u0628\u0627 setup.mjs \u062F\u0648\u0628\u0627\u0631\u0647 \u0627\u062C\u0631\u0627 \u06A9\u0646\u06CC\u062F.";
  const raw2 = crypto.getRandomValues(new Uint8Array(24));
  const token = btoa(String.fromCharCode(...raw2)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  await kvSet(env, `web:${await sha(token)}`, JSON.stringify({ uid, exp: now() + TTL }));
  return `\u{1F310} <b>\u0633\u0627\u06CC\u062A \u0634\u062E\u0635\u06CC \u0634\u0645\u0627</b>

${base}/app#k=${token}

\u{1F510} \u0627\u06CC\u0646 \u0644\u06CC\u0646\u06A9 \u0641\u0642\u0637 \u0645\u062E\u0635\u0648\u0635 \u0634\u0645\u0627\u0633\u062A (\u06F7 \u0631\u0648\u0632 \u0627\u0639\u062A\u0628\u0627\u0631)\u061B \u0628\u0647 \u06A9\u0633\u06CC \u0646\u062F\u0647\u06CC\u062F. \u0644\u06CC\u0646\u06A9 \u062A\u0627\u0632\u0647: /site`;
}
var J = (o, status = 200) => new Response(JSON.stringify(o), { status, headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" } });
async function auth(env, request) {
  const t = (request.headers.get("authorization") || "").replace(/^Bearer\s+/i, "").trim();
  if (!/^[\w-]{20,}$/.test(t)) return null;
  const key2 = `web:${await sha(t)}`, v = await kvGet(env, key2);
  if (!v) return null;
  try {
    const o = JSON.parse(v);
    if (o.exp > now()) return o.uid;
  } catch {
  }
  await kvDel(env, key2);
  return null;
}
var ROLE_OK = (r) => r === "sup" || r === "asst";
async function api(env, request, path) {
  const uid = await auth(env, request);
  if (uid === null) return J({ error: "unauthorized" }, 401);
  const url = new URL(request.url), post = request.method === "POST";
  let body = {};
  if (post) {
    try {
      body = await request.json();
    } catch {
      body = {};
    }
  }
  const db = env.DB, int = (x) => Math.trunc(Number(x));
  if (path === "state") {
    const u = await db.prepare("SELECT id, name, username FROM ea_users WHERE id=?").bind(uid).first();
    const g = await getGroup(env, uid);
    const n = async (sql) => (await db.prepare(sql).bind(uid).first())?.n || 0;
    const bot = async (r) => ({ has: !!await roleToken(env, uid, r), name: await kvGet(env, `${r}name:${uid}`) || "" });
    return J({
      user: u || { id: uid, name: "", username: "" },
      group: g ? { title: g.title || g.chat, chat: g.chat, forum: g.forum, review: g.review } : null,
      sup: await bot("sup"),
      asst: await bot("asst"),
      counts: { sent: await n("SELECT COUNT(*) n FROM ea_posts WHERE user_id=? AND status='sent'"), held: await n("SELECT COUNT(*) n FROM ea_posts WHERE user_id=? AND status='held'"), lessons: await n("SELECT COUNT(*) n FROM ea_lessons WHERE user_id=?"), asks: await n("SELECT COUNT(*) n FROM ea_asks WHERE user_id=? AND status='open'") }
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
    const p = await db.prepare("SELECT * FROM ea_posts WHERE id=? AND user_id=?").bind(id, uid).first();
    if (!p || !["sent", "held", "pending", "failed"].includes(p.status)) return J({ error: "\u0627\u06CC\u0646 \u067E\u0633\u062A \u0642\u0627\u0628\u0644 \u062A\u063A\u06CC\u06CC\u0631 \u0646\u06CC\u0633\u062A" }, 400);
    if (m[2] === "delete") {
      const r2 = await removePost(env, p, "deleted");
      await setVerdict(env, id, uid, "deleted");
      return J({ ok: true, message: r2.eitaa === "manual" ? "\u0627\u0632 \u06AF\u0631\u0648\u0647 \u062D\u0630\u0641 \u0634\u062F\u061B \u0627\u06CC\u062A\u0627\u06CC\u0627\u0631 \u062D\u0630\u0641 \u067E\u06CC\u0627\u0645 \u0646\u062F\u0627\u0631\u062F\u060C \u0646\u0633\u062E\u0647\u200C\u06CC \u0627\u06CC\u062A\u0627 \u0631\u0627 \u062F\u0633\u062A\u06CC \u062D\u0630\u0641 \u06A9\u0646\u06CC\u062F" : r2.eitaa === "removed" ? "\u0627\u0632 \u06AF\u0631\u0648\u0647 \u0648 \u0627\u06CC\u062A\u0627 \u062D\u0630\u0641 \u0634\u062F" : "\u062D\u0630\u0641 \u0634\u062F" });
    }
    if (m[2] === "time") {
      if (p.status === "sent" || p.status === "sending") return J({ error: "\u0627\u06CC\u0646 \u067E\u0633\u062A \u0642\u0628\u0644\u0627\u064B \u0627\u0631\u0633\u0627\u0644 \u0634\u062F\u0647" }, 400);
      const t = Math.trunc(Number(body.run_at));
      if (!t || t < now() - 60) return J({ error: "\u0632\u0645\u0627\u0646 \u0628\u0627\u06CC\u062F \u062F\u0631 \u0622\u06CC\u0646\u062F\u0647 \u0628\u0627\u0634\u062F" }, 400);
      await db.prepare(p.status === "held" ? "UPDATE ea_posts SET run_at=? WHERE id=?" : "UPDATE ea_posts SET status='pending', run_at=?, error='' WHERE id=?").bind(t, id).run();
      return J({ ok: true, message: p.status === "held" ? "\u0632\u0645\u0627\u0646 \u062B\u0628\u062A \u0634\u062F\u061B \u067E\u0633\u062A \u0647\u0646\u0648\u0632 \u0646\u06AF\u0647\u200C\u062F\u0627\u0634\u062A\u0647 \u0627\u0633\u062A" : "\u0632\u0645\u0627\u0646 \u0627\u0631\u0633\u0627\u0644 \u062A\u063A\u06CC\u06CC\u0631 \u06A9\u0631\u062F" });
    }
    if (m[2] === "send") {
      if (p.status !== "held") return J({ error: "\u0627\u06CC\u0646 \u067E\u0633\u062A \u0646\u06AF\u0647\u200C\u062F\u0627\u0634\u062A\u0647 \u0646\u0634\u062F\u0647" }, 400);
      if (p.kind === "file" && (await db.prepare("SELECT verdict FROM ea_pubs WHERE post_id=?").bind(id).first())?.verdict === "held_media") {
        if (!String(p.text).trim()) return J({ error: "\u0645\u062A\u0646\u06CC \u0646\u062F\u0627\u0631\u062F\u061B \u0627\u0632 \u0631\u0628\u0627\u062A \u0631\u0633\u0627\u0646\u0647\u200C\u06CC \u062A\u0627\u0632\u0647 \u0628\u062F\u0647\u06CC\u062F" }, 400);
        await db.prepare("UPDATE ea_posts SET kind='text', file_id='', src_url='', file_name='' WHERE id=?").bind(id).run();
      }
      await setVerdict(env, id, uid, "forced");
      await db.prepare("UPDATE ea_posts SET status='pending', run_at=?, error='' WHERE id=?").bind(now(), id).run();
      return J({ ok: true, message: "\u062F\u0631 \u0635\u0641 \u0627\u0631\u0633\u0627\u0644 \u0642\u0631\u0627\u0631 \u06AF\u0631\u0641\u062A" });
    }
    const text = String(body.text || "").trim();
    if (!text) return J({ error: "\u0645\u062A\u0646 \u062E\u0627\u0644\u06CC \u0627\u0633\u062A" }, 400);
    if (p.kind === "file" && text.length > 1e3) return J({ error: "\u0645\u062A\u0646 \u0647\u0645\u0631\u0627\u0647 \u0631\u0633\u0627\u0646\u0647 \u062D\u062F\u0627\u06A9\u062B\u0631 \u06F1\u06F0\u06F0\u06F0 \u0646\u0648\u06CC\u0633\u0647 \u0627\u0633\u062A" }, 400);
    if (text === String(p.text).trim()) return J({ error: "\u0645\u062A\u0646 \u062A\u063A\u06CC\u06CC\u0631\u06CC \u0646\u06A9\u0631\u062F\u0647" }, 400);
    const r = await replacePost(env, p, { text, keepJob: false });
    const learned = await learnFromFix(env, uid, p, text);
    return J({ ok: true, id: r.id, message: `\u067E\u0633\u062A \u062C\u062F\u06CC\u062F #${r.id} \u0633\u0627\u062E\u062A\u0647 \u0634\u062F${r.note ? "\u061B \u0646\u0633\u062E\u0647\u200C\u06CC \u0642\u0628\u0644\u06CC \u0627\u06CC\u062A\u0627 \u0631\u0627 \u062F\u0633\u062A\u06CC \u062D\u0630\u0641 \u06A9\u0646\u06CC\u062F" : ""}${learned ? " \xB7 \u062F\u0631\u0633 \u062A\u0627\u0632\u0647: " + learned : ""}` });
  }
  if (path === "lessons") return J({ lessons: (await db.prepare("SELECT id, rule, source, created_at FROM ea_lessons WHERE user_id=? ORDER BY id DESC LIMIT 100").bind(uid).all()).results });
  if (path === "lesson" && post) {
    const rule = String(body.rule || "").replace(/\s+/g, " ").trim().slice(0, 300);
    if (body.op === "add") return J({ ok: rule.length >= 6 && await addLesson(env, uid, rule, "owner") });
    if (body.op === "edit") {
      if (rule.length < 6) return J({ error: "\u0642\u0627\u0646\u0648\u0646 \u062E\u06CC\u0644\u06CC \u06A9\u0648\u062A\u0627\u0647 \u0627\u0633\u062A" }, 400);
      await db.prepare("UPDATE ea_lessons SET rule=? WHERE id=? AND user_id=?").bind(rule, int(body.id), uid).run();
      return J({ ok: true });
    }
    if (body.op === "delete") {
      await db.prepare("DELETE FROM ea_lessons WHERE id=? AND user_id=?").bind(int(body.id), uid).run();
      return J({ ok: true });
    }
    return J({ error: "bad op" }, 400);
  }
  if (path === "council") {
    const messages = (await db.prepare("SELECT role, text, created_at FROM ea_council WHERE user_id=? ORDER BY id DESC LIMIT 60").bind(uid).all()).results.reverse();
    const asks = (await db.prepare("SELECT id, role, question, answer, status, created_at FROM ea_asks WHERE user_id=? ORDER BY id DESC LIMIT 8").bind(uid).all()).results;
    return J({ messages, asks });
  }
  if (path === "council/say" && post) {
    const t = String(body.text || "").trim().slice(0, 600);
    if (t) await ownerSpoke(env, uid, t);
    return J({ ok: true });
  }
  if (path === "council/run" && post) {
    await enqueue(env, uid, "manual", {});
    return J({ ok: true, message: "\u062C\u0644\u0633\u0647 \u062F\u0631\u062E\u0648\u0627\u0633\u062A \u0634\u062F\u061B \u062A\u0627 \u06CC\u06A9 \u062F\u0642\u06CC\u0642\u0647\u200C\u06CC \u062F\u06CC\u06AF\u0631 \u0634\u0631\u0648\u0639 \u0645\u06CC\u200C\u0634\u0648\u062F" });
  }
  if (path === "ask" && post) {
    if (body.skip) {
      await db.prepare("UPDATE ea_asks SET status='skipped' WHERE id=? AND user_id=? AND status='open'").bind(int(body.id), uid).run();
      return J({ ok: true });
    }
    const t = String(body.answer || "").trim();
    return J({ ok: !!t && await answerAsk(env, uid, int(body.id), t) });
  }
  if (path === "jobs") return J({ jobs: (await db.prepare("SELECT id, name, instruction, times, enabled, last_info FROM agent_jobs WHERE user_id=? ORDER BY id DESC LIMIT 50").bind(uid).all()).results });
  if (path === "job" && post) {
    const id = int(body.id), own = await db.prepare("SELECT id, enabled FROM agent_jobs WHERE id=? AND user_id=?").bind(id, uid).first();
    if (!own) return J({ error: "\u06CC\u0627\u0641\u062A \u0646\u0634\u062F" }, 404);
    if (body.op === "toggle") await db.prepare("UPDATE agent_jobs SET enabled=? WHERE id=?").bind(own.enabled ? 0 : 1, id).run();
    else if (body.op === "run") await db.prepare("UPDATE agent_jobs SET run_now=1, enabled=1 WHERE id=?").bind(id).run();
    else if (body.op === "delete") {
      await db.prepare("DELETE FROM agent_jobs WHERE id=?").bind(id).run();
      await db.prepare("DELETE FROM agent_seen WHERE job_id=?").bind(id).run();
    } else if (body.op === "edit") {
      const ins = String(body.instruction || "").trim().slice(0, 2e3);
      if (ins.length < 5) return J({ error: "\u062F\u0633\u062A\u0648\u0631 \u062E\u06CC\u0644\u06CC \u06A9\u0648\u062A\u0627\u0647 \u0627\u0633\u062A" }, 400);
      await db.prepare("UPDATE agent_jobs SET instruction=? WHERE id=?").bind(ins, id).run();
    }
    return J({ ok: true });
  }
  if (path === "settings" && post) {
    const g = await getGroup(env, uid);
    if (typeof body.review === "boolean" && g) {
      g.review = body.review;
      await saveGroup(env, uid, g);
    }
    if (ROLE_OK(body.role)) {
      if (body.clear) await clearRoleBot(env, uid, body.role);
      else if (body.token) {
        const t = String(body.token).trim();
        if (!/^\d{6,}:[A-Za-z0-9_-]{20,}$/.test(t)) return J({ error: "\u0642\u0627\u0644\u0628 \u062A\u0648\u06A9\u0646 \u062F\u0631\u0633\u062A \u0646\u06CC\u0633\u062A" }, 400);
        const r = await setRoleBot(env, uid, body.role, t);
        if (!r.ok) return J({ error: "\u062A\u0644\u06AF\u0631\u0627\u0645 \u062A\u0648\u06A9\u0646 \u0631\u0627 \u0646\u067E\u0630\u06CC\u0631\u0641\u062A: " + r.error }, 400);
        return J({ ok: true, message: `\u062B\u0628\u062A \u0634\u062F: @${r.name}${r.inGroup === false ? " \u2014 \u0647\u0646\u0648\u0632 \u062F\u0631 \u06AF\u0631\u0648\u0647 \u0646\u06CC\u0633\u062A" : ""}` });
      }
    }
    return J({ ok: true });
  }
  return J({ error: "not found" }, 404);
}

// eitaa-src/manage.ts
var MAX_CAPTION = 1e3;
var back = (id) => [["\u21A9\uFE0F \u0628\u0631\u06AF\u0634\u062A", `pm:back:${id}`]];
var getPost = (env, id) => env.DB.prepare("SELECT * FROM ea_posts WHERE id=?").bind(id).first();
var ACTIVE = /* @__PURE__ */ new Set(["pending", "sending", "sent", "held", "failed", "draft"]);
var STATUS = { pending: "\u23F3 \u062F\u0631 \u0635\u0641 \u0627\u0631\u0633\u0627\u0644", sending: "\u23F3 \u062F\u0631 \u062D\u0627\u0644 \u0627\u0631\u0633\u0627\u0644", sent: "\u2705 \u062F\u0631 \u0627\u06CC\u062A\u0627 \u0645\u0646\u062A\u0634\u0631 \u0634\u062F\u0647", held: "\u23F8 \u0646\u06AF\u0647\u200C\u062F\u0627\u0634\u062A\u0647 \u0634\u062F (\u062F\u0631 \u0627\u06CC\u062A\u0627 \u0646\u06CC\u0633\u062A)", failed: "\u274C \u0627\u0631\u0633\u0627\u0644 \u0646\u0627\u0645\u0648\u0641\u0642", draft: "\u{1F4DD} \u067E\u06CC\u0634\u200C\u0646\u0648\u06CC\u0633", deleted: "\u{1F5D1} \u062D\u0630\u0641 \u0634\u062F\u0647", replaced: "\u267B\uFE0F \u062C\u0627\u06CC\u06AF\u0632\u06CC\u0646 \u0634\u062F\u0647", canceled: "\u{1F6AB} \u0644\u063A\u0648 \u0634\u062F\u0647" };
async function open(c, u, postId) {
  const { env } = c;
  await clearSession(env, u.id);
  const p = await getPost(env, postId);
  if (!p || p.user_id !== u.id) return void await send(env, u.id, "\u0627\u06CC\u0646 \u067E\u0633\u062A \u067E\u06CC\u062F\u0627 \u0646\u0634\u062F \u06CC\u0627 \u0645\u0627\u0644 \u0634\u0645\u0627 \u0646\u06CC\u0633\u062A.");
  try {
    let file = null;
    if (p.kind === "file") {
      try {
        file = await loadMedia(env, p);
      } catch {
      }
    }
    await sendCopy(env, { chat: u.id }, p, file);
  } catch (e) {
    await send(env, u.id, `<i>(\u067E\u06CC\u0634\u200C\u0646\u0645\u0627\u06CC\u0634 \u067E\u0633\u062A \u0645\u0645\u06A9\u0646 \u0646\u0634\u062F: ${esc(e.message)})</i>
${esc(p.text.slice(0, 1500))}`);
  }
  const pub = await getPub(env, p.id);
  const next = pub?.note?.startsWith("replaced_by:") ? Number(pub.note.split(":")[1]) : 0;
  const st = `${STATUS[p.status] || p.status}${p.status === "held" || p.status === "failed" ? `
<i>${esc(p.error)}</i>` : ""}`;
  if (!ACTIVE.has(p.status)) {
    return void await send(env, u.id, `<b>\u067E\u0633\u062A #${p.id}</b>
${st}${next ? "\n\u0646\u0633\u062E\u0647\u200C\u06CC \u062C\u062F\u06CC\u062F: #" + next : ""}`, next ? ikb([[["\u{1F4C4} \u0628\u0627\u0632 \u06A9\u0631\u062F\u0646 \u0646\u0633\u062E\u0647\u200C\u06CC \u062C\u062F\u06CC\u062F", `pm:open:${next}`]]]) : void 0);
  }
  await send(env, u.id, `<b>\u067E\u0633\u062A #${p.id}</b> \xB7 ${st}

\u0686\u0647 \u06A9\u0627\u0631\u06CC \u0645\u06CC\u200C\u062E\u0648\u0627\u0647\u06CC\u062F \u0627\u0646\u062C\u0627\u0645 \u062F\u0647\u06CC\u062F\u061F`, ikb([
    [["\u{1F6A9} \u06AF\u0632\u0627\u0631\u0634 \u062E\u0637\u0627", `pm:err:${p.id}`], ["\u270F\uFE0F \u062A\u0635\u062D\u06CC\u062D", `pm:fix:${p.id}`]],
    [["\u{1F5D1} \u062D\u0630\u0641 \u067E\u06CC\u0627\u0645", `pm:del:${p.id}`], ["\u{1F5BC} \u0627\u0641\u0632\u0648\u062F\u0646 \u0639\u06A9\u0633/\u0648\u06CC\u062F\u06CC\u0648 \u0648 \u0627\u0631\u0633\u0627\u0644 \u0645\u062C\u062F\u062F", `pm:media:${p.id}`]],
    ...p.status === "sent" || p.status === "sending" ? [] : [[["\u23F0 \u062A\u063A\u06CC\u06CC\u0631 \u0632\u0645\u0627\u0646 \u0627\u0631\u0633\u0627\u0644", `pm:time:${p.id}`]]]
  ]));
}
async function removePost(env, p, status) {
  await removeFromGroup(env, p.id);
  let eitaaRes = "none", error = "";
  if (p.status === "sent") {
    const user = await getUser(env, p.user_id), ch = await env.DB.prepare("SELECT chat_id FROM ea_channels WHERE id=?").bind(p.channel_id).first();
    const token = user ? await dec(env.SECRET_KEY, user.eitaa_token_enc) : "";
    if (token && ch) {
      const r = await deleteMessage(env, token, ch.chat_id, p.eitaa_message_id || "");
      eitaaRes = r.ok ? "removed" : "manual";
      error = r.error;
    } else eitaaRes = "manual";
  }
  await env.DB.prepare("UPDATE ea_posts SET status=? WHERE id=?").bind(status, p.id).run();
  return { eitaa: eitaaRes, error };
}
var eitaaNote = async (env, p, r) => {
  if (r.eitaa !== "manual") return "";
  const ch = await env.DB.prepare("SELECT chat_id, title FROM ea_channels WHERE id=?").bind(p.channel_id).first();
  return `

\u26A0\uFE0F \u0627\u06CC\u062A\u0627\u06CC\u0627\u0631 \u062F\u0631 API \u062E\u0648\u062F \xAB\u062D\u0630\u0641 \u067E\u06CC\u0627\u0645\xBB \u0646\u062F\u0627\u0631\u062F\u060C \u067E\u0633 \u0646\u0633\u062E\u0647\u200C\u06CC \u0642\u0628\u0644\u06CC \u0647\u0646\u0648\u0632 \u062F\u0631 \u0627\u06CC\u062A\u0627 \u0645\u0627\u0646\u062F\u0647${p.eitaa_message_id ? ` (\u067E\u06CC\u0627\u0645 ${esc(p.eitaa_message_id)})` : ""}${ch ? ` \u2014 \u0644\u0637\u0641\u0627\u064B \u0622\u0646 \u0631\u0627 \u062F\u0631 \u06A9\u0627\u0646\u0627\u0644 \xAB${esc(ch.title)}\xBB \u062F\u0633\u062A\u06CC \u062D\u0630\u0641 \u06A9\u0646\u06CC\u062F` : ""}.${r.error ? `
<i>${esc(r.error.slice(0, 120))}</i>` : ""}`;
};
async function replacePost(env, old, patch) {
  const n = { ...old, ...patch };
  const r = await env.DB.prepare("INSERT INTO ea_posts(user_id,channel_id,kind,text,file_id,file_name,title,silent,pin,view_delete,run_at,status,created_at,src_url,job_id,error) VALUES(?,?,?,?,?,?,?,?,?,?,?,'pending',?,?,?,'')").bind(old.user_id, old.channel_id, n.kind, n.text, n.file_id, n.file_name, old.title, old.silent, old.pin, old.view_delete, now(), now(), n.src_url, patch.keepJob ? old.job_id : null).run();
  const id = r.meta.last_row_id;
  const rm = await removePost(env, old, "replaced");
  await setVerdict(env, old.id, old.user_id, "replaced", `replaced_by:${id}`);
  return { id, note: await eitaaNote(env, old, rm) };
}
async function learnFromFix(env, uid, old, newText) {
  try {
    const own = (await env.DB.prepare("SELECT footer FROM agent_jobs WHERE id=?").bind(old.job_id || 0).first())?.footer || "";
    const rule = await learnFromEdit(env, uid, old.text, newText, own);
    if (rule && await addLesson(env, uid, rule, "\u062A\u0635\u062D\u06CC\u062D \u062F\u0633\u062A\u06CC \u067E\u0633\u062A #" + old.id)) {
      await lessonNote(env, uid, `\u{1F4CC} <b>\u062F\u0631\u0633 \u062A\u0627\u0632\u0647</b> (\u0627\u0632 \u062A\u0635\u062D\u06CC\u062D \u062F\u0633\u062A\u06CC \u067E\u0633\u062A #${old.id})
${esc(rule)}`);
      return rule;
    }
  } catch {
  }
  return "";
}
async function onCallback3(c, u, q, act2, arg) {
  const { env } = c, id = Number(arg);
  await answer(env, q.id);
  if (act2 === "open" || act2 === "back") return open(c, u, id);
  const p = await getPost(env, id);
  if (!p || p.user_id !== u.id) return void await send(env, u.id, "\u0627\u06CC\u0646 \u067E\u0633\u062A \u067E\u06CC\u062F\u0627 \u0646\u0634\u062F.");
  if (!ACTIVE.has(p.status)) return open(c, u, id);
  switch (act2) {
    case "err":
      await setSession(env, u.id, "pm_err", { id });
      return void await send(env, u.id, "\u{1F6A9} \u0644\u0637\u0641\u0627\u064B \u062E\u0637\u0627 \u0631\u0627 \u0628\u0646\u0648\u06CC\u0633\u06CC\u062F (\u0645\u062B\u0644\u0627\u064B: \xAB\u0622\u062E\u0631 \u0645\u062A\u0646 \u0622\u06CC\u062F\u06CC \u06A9\u0627\u0646\u0627\u0644 \u062F\u06CC\u06AF\u0631\u06CC \u0645\u0627\u0646\u062F\u0647\xBB \u06CC\u0627 \xAB\u062A\u0627\u0631\u06CC\u062E \u0627\u0634\u062A\u0628\u0627\u0647 \u0627\u0633\u062A\xBB).\n\u0627\u0632 \u0631\u0648\u06CC \u0622\u0646 \u06CC\u06A9 \u0642\u0627\u0646\u0648\u0646 \u06CC\u0627\u062F \u0645\u06CC\u200C\u06AF\u06CC\u0631\u0645 \u062A\u0627 \u062A\u06A9\u0631\u0627\u0631 \u0646\u0634\u0648\u062F \u0648 \u0627\u06AF\u0631 \u0628\u0634\u0648\u062F \u062F\u0631\u0633\u062A\u0634 \u0645\u06CC\u200C\u06A9\u0646\u0645.", ikb([back(id)]));
    case "fix":
      await setSession(env, u.id, "pm_fix", { id });
      return void await send(env, u.id, "\u270F\uFE0F \u0645\u062A\u0646 \u0648/\u06CC\u0627 \u0639\u06A9\u0633 \u0648 \u0648\u06CC\u062F\u06CC\u0648\u06CC \u062C\u062F\u06CC\u062F \u0631\u0627 \u0628\u0641\u0631\u0633\u062A\u06CC\u062F \u062A\u0627 \u062C\u0627\u06CC\u06AF\u0632\u06CC\u0646 \u0634\u0648\u062F.\n\u2022 \u0641\u0642\u0637 \u0645\u062A\u0646 \u2190 \u0631\u0633\u0627\u0646\u0647\u200C\u06CC \u0642\u0628\u0644\u06CC \u0645\u06CC\u200C\u0645\u0627\u0646\u062F\n\u2022 \u0641\u0642\u0637 \u0639\u06A9\u0633/\u0648\u06CC\u062F\u06CC\u0648 \u2190 \u0645\u062A\u0646 \u0642\u0628\u0644\u06CC \u0645\u06CC\u200C\u0645\u0627\u0646\u062F\n\u2022 \u0647\u0631 \u062F\u0648 (\u0639\u06A9\u0633/\u0648\u06CC\u062F\u06CC\u0648 \u0628\u0627 \u06A9\u067E\u0634\u0646) \u2190 \u0647\u0631 \u062F\u0648 \u0639\u0648\u0636 \u0645\u06CC\u200C\u0634\u0648\u062F", ikb([back(id)]));
    case "time":
      await setSession(env, u.id, "pm_time", { id });
      return void await send(env, u.id, `\u23F0 \u0632\u0645\u0627\u0646 \u062A\u0627\u0632\u0647\u200C\u06CC \u0627\u0631\u0633\u0627\u0644 \u067E\u0633\u062A #${id} \u0631\u0627 \u0628\u0646\u0648\u06CC\u0633\u06CC\u062F.
\u0645\u062B\u0627\u0644: \xAB\u0627\u0645\u0631\u0648\u0632 21:30\xBB\u060C \xAB\u0641\u0631\u062F\u0627 09:00\xBB\u060C \xAB+2 \u0633\u0627\u0639\u062A\xBB\u060C \xAB+30 \u062F\u0642\u06CC\u0642\u0647\xBB \u06CC\u0627 \xAB1405/09/01 20:30\xBB
\u0632\u0645\u0627\u0646 \u0641\u0639\u0644\u06CC: ${fmtDt(p.run_at)}
\u0628\u0631\u0627\u06CC \xAB\u0647\u0645\u06CC\u0646 \u0627\u0644\u0627\u0646\xBB \u0628\u0646\u0648\u06CC\u0633\u06CC\u062F: \u0627\u0644\u0627\u0646`, ikb([back(id)]));
    case "media":
      await setSession(env, u.id, "pm_media", { id });
      return void await send(env, u.id, "\u{1F5BC} \u0639\u06A9\u0633 \u06CC\u0627 \u0648\u06CC\u062F\u06CC\u0648 \u0631\u0627 \u0628\u0641\u0631\u0633\u062A\u06CC\u062F. \u067E\u06CC\u0627\u0645 \u0642\u0628\u0644\u06CC \u067E\u0627\u06A9 \u0645\u06CC\u200C\u0634\u0648\u062F \u0648 \u067E\u0633\u062A \u062C\u062F\u06CC\u062F (\u0628\u0627 \u0647\u0645\u0627\u0646 \u0645\u062A\u0646 \u0648 \u0627\u06CC\u0646 \u0631\u0633\u0627\u0646\u0647) \u0628\u0627\u0631\u06AF\u0630\u0627\u0631\u06CC \u0645\u06CC\u200C\u0634\u0648\u062F.", ikb([back(id)]));
    case "del":
      return void await send(env, u.id, `\u{1F5D1} \u067E\u0633\u062A #${id} \u062D\u0630\u0641 \u0634\u0648\u062F\u061F${p.status === "sent" ? "\n(\u0627\u0632 \u06AF\u0631\u0648\u0647 \u067E\u0627\u06A9 \u0645\u06CC\u200C\u0634\u0648\u062F\u061B \u062D\u0630\u0641 \u0627\u0632 \u0627\u06CC\u062A\u0627 \u0628\u0633\u062A\u06AF\u06CC \u0628\u0647 \u067E\u0634\u062A\u06CC\u0628\u0627\u0646\u06CC \u0627\u06CC\u062A\u0627\u06CC\u0627\u0631 \u062F\u0627\u0631\u062F)" : ""}`, ikb([[["\u2705 \u0628\u0644\u0647\u060C \u062D\u0630\u0641 \u06A9\u0646", `pm:dy:${id}`], ["\u21A9\uFE0F \u0628\u0631\u06AF\u0634\u062A", `pm:back:${id}`]]]));
    case "dy": {
      const r = await removePost(env, p, "deleted");
      await setVerdict(env, id, u.id, "deleted");
      return void await send(env, u.id, `\u{1F5D1} \u067E\u0633\u062A #${id} \u062D\u0630\u0641 \u0634\u062F.${r.eitaa === "removed" ? " (\u0627\u0632 \u0627\u06CC\u062A\u0627 \u0647\u0645 \u067E\u0627\u06A9 \u0634\u062F)" : ""}${await eitaaNote(env, p, r)}`);
    }
    case "force": {
      const media = (await getPub(env, id))?.verdict === "held_media";
      if (p.status !== "held") return void await send(env, u.id, "\u0627\u06CC\u0646 \u067E\u0633\u062A \u062F\u0631 \u062D\u0627\u0644 \u062D\u0627\u0636\u0631 \u0646\u06AF\u0647\u200C\u062F\u0627\u0634\u062A\u0647 \u0646\u0634\u062F\u0647 \u0627\u0633\u062A.");
      if (media && p.kind === "file") {
        if (!p.text.trim()) return void await send(env, u.id, "\u0627\u06CC\u0646 \u067E\u0633\u062A \u0645\u062A\u0646\u06CC \u0646\u062F\u0627\u0631\u062F\u061B \u0627\u0632 \xAB\u{1F5BC} \u0627\u0641\u0632\u0648\u062F\u0646 \u0639\u06A9\u0633/\u0648\u06CC\u062F\u06CC\u0648\xBB \u06CC\u0627 \xAB\u270F\uFE0F \u062A\u0635\u062D\u06CC\u062D\xBB \u0627\u0633\u062A\u0641\u0627\u062F\u0647 \u06A9\u0646\u06CC\u062F.");
        await env.DB.prepare("UPDATE ea_posts SET kind='text', file_id='', src_url='', file_name='' WHERE id=?").bind(id).run();
      }
      await setVerdict(env, id, u.id, "forced");
      await env.DB.prepare("UPDATE ea_posts SET status='pending', run_at=?, error='' WHERE id=?").bind(now(), id).run();
      return void await send(env, u.id, `\u{1F680} \u067E\u0633\u062A #${id} ${media ? "\u0641\u0642\u0637 \u0628\u0627 \u0645\u062A\u0646 " : ""}\u062F\u0631 \u0635\u0641 \u0627\u0631\u0633\u0627\u0644 \u0642\u0631\u0627\u0631 \u06AF\u0631\u0641\u062A (\u062A\u0627 \u06CC\u06A9 \u062F\u0642\u06CC\u0642\u0647\u200C\u06CC \u062F\u06CC\u06AF\u0631).`);
    }
  }
}
async function onMessage2(c, u, state, d, m) {
  const { env } = c, id = Number(d.id);
  const p = await getPost(env, id);
  if (!p || p.user_id !== u.id || !ACTIVE.has(p.status)) {
    await clearSession(env, u.id);
    return void await send(env, u.id, "\u0627\u06CC\u0646 \u067E\u0633\u062A \u062F\u06CC\u06AF\u0631 \u0642\u0627\u0628\u0644 \u062A\u063A\u06CC\u06CC\u0631 \u0646\u06CC\u0633\u062A.");
  }
  const text = (m.text || "").trim();
  if (state === "pm_time") {
    if (p.status === "sent" || p.status === "sending") {
      await clearSession(env, u.id);
      return void await send(env, u.id, "\u0627\u06CC\u0646 \u067E\u0633\u062A \u0642\u0628\u0644\u0627\u064B \u0627\u0631\u0633\u0627\u0644 \u0634\u062F\u0647\u061B \u0632\u0645\u0627\u0646\u0634 \u0642\u0627\u0628\u0644 \u062A\u063A\u06CC\u06CC\u0631 \u0646\u06CC\u0633\u062A.");
    }
    const asPlus = normDigits(text).replace(/^(\d+) ?(ساعت|دقیقه) دیگر$/, "+$1 $2");
    const t = /^(الان|همین الان|فوری)$/.test(text) ? now() : parseWhen(asPlus);
    if (!t) return void await send(env, u.id, "\u0632\u0645\u0627\u0646 \u0631\u0627 \u0646\u0641\u0647\u0645\u06CC\u062F\u0645 \u{1F615} \u0645\u062B\u0644\u0627\u064B \u0628\u0646\u0648\u06CC\u0633\u06CC\u062F \xAB\u0641\u0631\u062F\u0627 09:00\xBB\u060C \xAB+2 \u0633\u0627\u0639\u062A\xBB \u06CC\u0627 \xAB1405/09/01 20:30\xBB.", ikb([back(id)]));
    if (t < now() - 60) return void await send(env, u.id, "\u0627\u06CC\u0646 \u0632\u0645\u0627\u0646 \u06AF\u0630\u0634\u062A\u0647 \u0627\u0633\u062A\u061B \u0632\u0645\u0627\u0646 \u0622\u06CC\u0646\u062F\u0647 \u0628\u0646\u0648\u06CC\u0633\u06CC\u062F \u06CC\u0627 \xAB\u0627\u0644\u0627\u0646\xBB.", ikb([back(id)]));
    await clearSession(env, u.id);
    if (p.status === "held") {
      await env.DB.prepare("UPDATE ea_posts SET run_at=? WHERE id=?").bind(t, id).run();
      return void await send(env, u.id, `\u23F0 \u0632\u0645\u0627\u0646 \u0627\u0631\u0633\u0627\u0644 \u067E\u0633\u062A #${id} \u0634\u062F ${fmtDt(t)}.
\u0648\u0644\u06CC \u067E\u0633\u062A \u0647\u0646\u0648\u0632 \xAB\u0646\u06AF\u0647\u200C\u062F\u0627\u0634\u062A\u0647\xBB \u0627\u0633\u062A\u061B \u0628\u0631\u0627\u06CC \u0627\u0631\u0633\u0627\u0644\u060C \u0627\u0632 \u062F\u06A9\u0645\u0647\u200C\u06CC \xAB\u0627\u0631\u0633\u0627\u0644 \u0628\u0627 \u0647\u0645\u06CC\u0646 \u0648\u0636\u0639\u06CC\u062A\xBB \u06CC\u0627 \xAB\u062A\u0635\u062D\u06CC\u062D\xBB \u0627\u0633\u062A\u0641\u0627\u062F\u0647 \u06A9\u0646\u06CC\u062F.`);
    }
    await env.DB.prepare("UPDATE ea_posts SET status='pending', run_at=?, error='' WHERE id=?").bind(t, id).run();
    return void await send(env, u.id, `\u23F0 \u067E\u0633\u062A #${id} \u0628\u0631\u0627\u06CC ${fmtDt(t)} \u0632\u0645\u0627\u0646\u200C\u0628\u0646\u062F\u06CC \u0634\u062F.`);
  }
  if (state === "pm_err") {
    if (!text) return void await send(env, u.id, "\u062E\u0637\u0627 \u0631\u0627 \u0628\u0627 \u0645\u062A\u0646 \u0628\u0646\u0648\u06CC\u0633\u06CC\u062F.", ikb([back(id)]));
    await clearSession(env, u.id);
    const wait = await send(env, u.id, "\u{1F50E} \u062F\u0631 \u062D\u0627\u0644 \u0628\u0631\u0631\u0633\u06CC \u062E\u0637\u0627\u2026");
    const own = (await env.DB.prepare("SELECT footer FROM agent_jobs WHERE id=?").bind(p.job_id || 0).first())?.footer || "";
    let lesson = "", fixed = null, why = "";
    try {
      const r2 = await learnFromError(env, u.id, p.text, text, p.kind === "file", own);
      lesson = r2.rule;
      fixed = r2.fixed;
      why = r2.why;
    } catch {
      lesson = `\u0627\u0632 \u0627\u06CC\u0646 \u062E\u0637\u0627 \u062C\u0644\u0648\u06AF\u06CC\u0631\u06CC \u06A9\u0646: ${text.slice(0, 200)}`;
      why = "\u0645\u062F\u0644 \u0647\u0648\u0634 \u0645\u0635\u0646\u0648\u0639\u06CC \u0627\u0644\u0627\u0646 \u062F\u0631 \u062F\u0633\u062A\u0631\u0633 \u0646\u0628\u0648\u062F\u061B \u062E\u0637\u0627 \u0641\u0642\u0637 \u062B\u0628\u062A \u0634\u062F.";
    }
    const learned2 = lesson ? await addLesson(env, u.id, lesson, text) : false;
    if (learned2) await lessonNote(env, u.id, `\u{1F4CC} <b>\u062F\u0631\u0633 \u062A\u0627\u0632\u0647</b> (\u0627\u0632 \u06AF\u0632\u0627\u0631\u0634 \u067E\u0633\u062A #${id})
${esc(lesson)}`);
    await enqueue(env, u.id, "reported_error", { id, error: text.slice(0, 300), lesson, fixed: !!fixed }).catch(() => null);
    await report(env, u.id, `\u{1F6A9} <b>\u06AF\u0632\u0627\u0631\u0634 \u062E\u0637\u0627</b> \xB7 \u067E\u0633\u062A #${id}
${esc(text.slice(0, 300))}${lesson ? `

\u{1F9E0} \u06CC\u0627\u062F \u06AF\u0631\u0641\u062A\u0645: ${esc(lesson)}` : ""}`);
    if (fixed && (p.kind === "text" || fixed.length <= MAX_CAPTION)) {
      const r2 = await replacePost(env, p, { text: fixed, keepJob: true });
      const msg2 = `\u2705 \u062E\u0637\u0627 \u0627\u0635\u0644\u0627\u062D \u0634\u062F \u0648 \u067E\u0633\u062A \u062C\u062F\u06CC\u062F #${r2.id} \u0633\u0627\u062E\u062A\u0647 \u0634\u062F.
\u0627\u0648\u0644 \u062F\u0631 \u06AF\u0631\u0648\u0647\u060C \u0628\u0639\u062F \u0627\u0632 \u0628\u0631\u0631\u0633\u06CC \u0646\u0627\u0638\u0631 \u062F\u0631 \u0627\u06CC\u062A\u0627 \u0645\u0646\u062A\u0634\u0631 \u0645\u06CC\u200C\u0634\u0648\u062F (\u062A\u0627 \u06CC\u06A9 \u062F\u0642\u06CC\u0642\u0647).${lesson ? `

\u{1F9E0} \u06CC\u0627\u062F \u06AF\u0631\u0641\u062A\u0645: ${esc(lesson)}` : ""}${r2.note}`;
      if (wait) await edit(env, u.id, wait, msg2);
      else await send(env, u.id, msg2);
      return;
    }
    const msg = `\u{1F615} \u0646\u062A\u0648\u0627\u0646\u0633\u062A\u0645 \u062E\u0648\u062F\u06A9\u0627\u0631 \u062F\u0631\u0633\u062A\u0634 \u06A9\u0646\u0645${why ? `: ${esc(why)}` : "."}
\u067E\u0633\u062A \u062C\u062F\u06CC\u062F\u06CC \u0627\u0631\u0633\u0627\u0644 \u0646\u0634\u062F \u0648 \u067E\u0633\u062A \u0642\u0628\u0644\u06CC \u062F\u0633\u062A\u200C\u0646\u062E\u0648\u0631\u062F\u0647 \u0645\u0627\u0646\u062F.${lesson ? `

\u{1F9E0} \u0648\u0644\u06CC \u06CC\u0627\u062F \u06AF\u0631\u0641\u062A\u0645: ${esc(lesson)}` : ""}

\u062E\u0648\u062F\u062A\u0627\u0646 \u062A\u0635\u0645\u06CC\u0645 \u0628\u06AF\u06CC\u0631\u06CC\u062F \u{1F447}`;
    const kb = ikb([[["\u270F\uFE0F \u062A\u0635\u062D\u06CC\u062D", `pm:fix:${id}`], ["\u{1F5BC} \u0627\u0641\u0632\u0648\u062F\u0646 \u0639\u06A9\u0633/\u0648\u06CC\u062F\u06CC\u0648", `pm:media:${id}`]], [["\u{1F5D1} \u062D\u0630\u0641 \u067E\u06CC\u0627\u0645", `pm:del:${id}`]]]);
    if (wait) await edit(env, u.id, wait, msg, kb);
    else await send(env, u.id, msg, kb);
    return;
  }
  const r = extract(m);
  if ("error" in r) return void await send(env, u.id, "\u274C " + r.error, ikb([back(id)]));
  let patch;
  if (state === "pm_fix") {
    if (r.kind === "text") patch = { text: r.text };
    else patch = { kind: "file", file_id: r.file_id, file_name: r.file_name, src_url: "", text: r.text || p.text };
  } else {
    if (r.kind === "text") return void await send(env, u.id, "\u06CC\u06A9 \u0639\u06A9\u0633 \u06CC\u0627 \u0648\u06CC\u062F\u06CC\u0648 \u0628\u0641\u0631\u0633\u062A\u06CC\u062F (\u0646\u0647 \u0645\u062A\u0646).", ikb([back(id)]));
    patch = { kind: "file", file_id: r.file_id, file_name: r.file_name, src_url: "", text: p.text };
  }
  const finalKind = patch.kind || p.kind, finalText = patch.text ?? p.text;
  if (finalKind === "file" && finalText.length > MAX_CAPTION) return void await send(env, u.id, `\u274C \u0645\u062A\u0646 \u0647\u0645\u0631\u0627\u0647 \u0639\u06A9\u0633/\u0648\u06CC\u062F\u06CC\u0648 \u062D\u062F\u0627\u06A9\u062B\u0631 ${MAX_CAPTION} \u0646\u0648\u06CC\u0633\u0647 \u0627\u0633\u062A (\u0627\u0644\u0627\u0646 ${finalText.length}). \u0645\u062A\u0646 \u06A9\u0648\u062A\u0627\u0647\u200C\u062A\u0631\u06CC \u0628\u0641\u0631\u0633\u062A\u06CC\u062F.`, ikb([back(id)]));
  if (!finalText.trim() && finalKind === "text") return void await send(env, u.id, "\u0645\u062A\u0646 \u062E\u0627\u0644\u06CC \u0627\u0633\u062A.", ikb([back(id)]));
  await clearSession(env, u.id);
  const res = await replacePost(env, p, patch);
  const learned = state === "pm_fix" && patch.text !== void 0 && patch.text.trim() !== p.text.trim() ? await learnFromFix(env, u.id, p, patch.text) : "";
  await send(env, u.id, `\u267B\uFE0F \u067E\u06CC\u0627\u0645 \u0642\u0628\u0644\u06CC \u06A9\u0646\u0627\u0631 \u0631\u0641\u062A \u0648 \u067E\u0633\u062A \u062C\u062F\u06CC\u062F #${res.id} \u0633\u0627\u062E\u062A\u0647 \u0634\u062F.
\u0627\u0648\u0644 \u062F\u0631 \u06AF\u0631\u0648\u0647\u060C \u0628\u0639\u062F \u0627\u0632 \u0628\u0631\u0631\u0633\u06CC \u0646\u0627\u0638\u0631 \u062F\u0631 \u0627\u06CC\u062A\u0627 \u0645\u0646\u062A\u0634\u0631 \u0645\u06CC\u200C\u0634\u0648\u062F (\u062A\u0627 \u06CC\u06A9 \u062F\u0642\u06CC\u0642\u0647).${learned ? `

\u{1F9E0} \u0627\u0632 \u062A\u0635\u062D\u06CC\u062D \u0634\u0645\u0627 \u06CC\u0627\u062F \u06AF\u0631\u0641\u062A\u0645: ${esc(learned)}` : ""}${res.note}`);
}
var GUIDE2 = "<b>\u{1F4D6} \u0627\u062A\u0635\u0627\u0644 \u06AF\u0631\u0648\u0647</b>\n\n1\uFE0F\u20E3 \u06CC\u06A9 \u06AF\u0631\u0648\u0647 \u062A\u0644\u06AF\u0631\u0627\u0645 \u0628\u0633\u0627\u0632\u06CC\u062F \u0648 \u062F\u0631 \u062A\u0646\u0638\u06CC\u0645\u0627\u062A \u0622\u0646 \xABTopics\xBB (\u062A\u0627\u067E\u06CC\u06A9) \u0631\u0627 \u0631\u0648\u0634\u0646 \u06A9\u0646\u06CC\u062F.\n2\uFE0F\u20E3 \u0647\u0645\u06CC\u0646 \u0631\u0628\u0627\u062A \u0631\u0627 \u0639\u0636\u0648 \u06AF\u0631\u0648\u0647 \u0648 <b>\u0627\u062F\u0645\u06CC\u0646</b> \u06A9\u0646\u06CC\u062F (\xAB\u0645\u062F\u06CC\u0631\u06CC\u062A \u062A\u0627\u067E\u06CC\u06A9\u200C\u0647\u0627\xBB \u0648 \xAB\u062D\u0630\u0641 \u067E\u06CC\u0627\u0645\u200C\u0647\u0627\xBB \u0644\u0627\u0632\u0645 \u0627\u0633\u062A).\n3\uFE0F\u20E3 \u062F\u0627\u062E\u0644 \u06AF\u0631\u0648\u0647 \u0628\u0641\u0631\u0633\u062A\u06CC\u062F: <code>/eagroup</code>\n\n\u062A\u0627\u067E\u06CC\u06A9\u200C\u0647\u0627\u06CC \xAB\u0645\u0637\u0627\u0644\u0628\xBB\u060C \xAB\u06AF\u0632\u0627\u0631\u0634\u0627\u062A\xBB\u060C \xAB\u0686\u062A \u0628\u0627 \u0627\u06CC\u062C\u0646\u062A\xBB\u060C \xAB\u0622\u0645\u0648\u062E\u062A\u0647\u200C\u0647\u0627\xBB \u0648 \xAB\u0634\u0648\u0631\u0627\xBB \u0633\u0627\u062E\u062A\u0647 \u0645\u06CC\u200C\u0634\u0648\u062F.\n\n\u{1F6E1} <b>\u0631\u0628\u0627\u062A \u0646\u0627\u0638\u0631</b> \u0648 \u{1F9ED} <b>\u0631\u0628\u0627\u062A \u062F\u0633\u062A\u06CC\u0627\u0631</b> (\u0627\u062E\u062A\u06CC\u0627\u0631\u06CC): \u062F\u0631 BotFather \u062F\u0648 \u0631\u0628\u0627\u062A \u062C\u062F\u06CC\u062F \u0628\u0633\u0627\u0632\u06CC\u062F\u060C \u062A\u0648\u06A9\u0646 \u0647\u0631\u06A9\u062F\u0627\u0645 \u0631\u0627 \u0627\u0632 \u062F\u06A9\u0645\u0647\u200C\u06CC \xAB\u062B\u0628\u062A \u2026\xBB \u0628\u062F\u0647\u06CC\u062F \u0648 \u0647\u0631 \u062F\u0648 \u0631\u0627 \u062F\u0631 \u06AF\u0631\u0648\u0647 \u0627\u062F\u0645\u06CC\u0646 \u06A9\u0646\u06CC\u062F. \u062F\u0631 \u062A\u0627\u067E\u06CC\u06A9 \xAB\u0634\u0648\u0631\u0627\xBB \u0628\u0627 \u0646\u0627\u0645 \u062E\u0648\u062F\u0634\u0627\u0646 \u0628\u0627 \u0647\u0645 \u06AF\u0641\u062A\u06AF\u0648 \u0645\u06CC\u200C\u06A9\u0646\u0646\u062F. (\u0628\u062F\u0648\u0646 \u0622\u0646\u200C\u0647\u0627\u060C \u0647\u0645\u06CC\u0646 \u0631\u0628\u0627\u062A \u0628\u0627 \u0628\u0631\u0686\u0633\u0628 \u0646\u0642\u0634\u0634\u0627\u0646 \u0645\u06CC\u200C\u0646\u0648\u06CC\u0633\u062F.)\n\n\u{1F310} <b>\u0633\u0627\u06CC\u062A \u0634\u062E\u0635\u06CC</b>: \u062F\u06A9\u0645\u0647\u200C\u06CC \xAB\u{1F310} \u0633\u0627\u06CC\u062A \u0645\u0646\xBB \u06CC\u06A9 \u0644\u06CC\u0646\u06A9 \u0645\u062E\u0635\u0648\u0635 \u0634\u0645\u0627 \u0645\u06CC\u200C\u062F\u0647\u062F\u061B \u0647\u0645\u0647\u200C\u06CC \u06A9\u0627\u0631\u0647\u0627 \u0627\u0632 \u0622\u0646\u062C\u0627 \u0647\u0645 \u0634\u062F\u0646\u06CC \u0627\u0633\u062A.";
var ROLES = { sup: { fa: "\u0646\u0627\u0638\u0631", icon: "\u{1F6E1}" }, asst: { fa: "\u062F\u0633\u062A\u06CC\u0627\u0631", icon: "\u{1F9ED}" } };
async function home3(env, u) {
  const g = await getGroup(env, u.id);
  const bot = async (r) => ({ has: !!await roleToken(env, u.id, r), name: await kvGet(env, `${r}name:${u.id}`) });
  const sup = await bot("sup"), asst = await bot("asst");
  const n = (await env.DB.prepare("SELECT COUNT(*) n FROM ea_lessons WHERE user_id=?").bind(u.id).first())?.n || 0;
  const asks = (await env.DB.prepare("SELECT COUNT(*) n FROM ea_asks WHERE user_id=? AND status='open'").bind(u.id).first())?.n || 0;
  const line = (r, b) => `${ROLES[r].icon} ${ROLES[r].fa}: ${b.has ? "\u2705" + (b.name ? " @" + esc(b.name) : "") : "\u0631\u0628\u0627\u062A \u062C\u062F\u0627 \u0646\u062F\u0627\u0631\u062F (\u0647\u0645\u06CC\u0646 \u0631\u0628\u0627\u062A \u0645\u06CC\u200C\u0646\u0648\u06CC\u0633\u062F)"}`;
  const t = `<b>\u{1F465} \u06AF\u0631\u0648\u0647\u060C \u0646\u0627\u0638\u0631 \u0648 \u062F\u0633\u062A\u06CC\u0627\u0631</b>

\u{1F465} \u06AF\u0631\u0648\u0647: ${g ? `\u2705 ${esc(g.title || g.chat)}${g.forum ? " \xB7 \u062A\u0627\u067E\u06CC\u06A9\u200C\u0647\u0627 " + (g.topics.council && g.topics.all ? "\u2705" : "\u26A0\uFE0F \u0628\u0631\u0627\u06CC \u0633\u0627\u062E\u062A \u062A\u0627\u067E\u06CC\u06A9\u200C\u0647\u0627\u06CC \u0646\u0627\u0642\u0635\u060C \xAB\u{1FA7A} \u0628\u0631\u0631\u0633\u06CC \u0648 \u062A\u0639\u0645\u06CC\u0631\xBB \u0631\u0627 \u0628\u0632\u0646\u06CC\u062F") : " \xB7 \u0628\u062F\u0648\u0646 \u062A\u0627\u067E\u06CC\u06A9"}` : "\u274C \u0645\u062A\u0635\u0644 \u0646\u06CC\u0633\u062A"}
\u{1F6E1} \u0628\u0631\u0631\u0633\u06CC \u0646\u0627\u0638\u0631 \u067E\u06CC\u0634 \u0627\u0632 \u0627\u06CC\u062A\u0627: ${g ? g.review ? "\u0631\u0648\u0634\u0646" : "\u062E\u0627\u0645\u0648\u0634" : "\u2014"}
${line("sup", sup)}
${line("asst", asst)}
\u{1F9E0} \u0622\u0645\u0648\u062E\u062A\u0647\u200C\u0647\u0627: ${n}${asks ? `
\u2753 \u0633\u0624\u0627\u0644 \u0628\u06CC\u200C\u067E\u0627\u0633\u062E: ${asks}` : ""}`;
  const rows = [[["\u{1F310} \u0633\u0627\u06CC\u062A \u0645\u0646", "gp:site"], ["\u{1F4D6} \u0631\u0627\u0647\u0646\u0645\u0627", "gp:help"]], [["\u{1F9E0} \u0622\u0645\u0648\u062E\u062A\u0647\u200C\u0647\u0627", "gp:les"], ["\u{1F91D} \u062C\u0644\u0633\u0647\u200C\u06CC \u0634\u0648\u0631\u0627", "gp:run"]], [["\u{1FA7A} \u0628\u0631\u0631\u0633\u06CC \u0648 \u062A\u0639\u0645\u06CC\u0631", "gp:doc"], ["\u{1F4DA} \u0647\u0645\u06AF\u0627\u0645\u200C\u0633\u0627\u0632\u06CC \u062A\u0645\u0627\u0645 \u067E\u0633\u062A\u200C\u0647\u0627", "gp:all"]], ...adminIds(env).includes(u.id) ? [[["\u2601\uFE0F \u062D\u0633\u0627\u0628\u200C\u0647\u0627\u06CC \u06A9\u0644\u0648\u062F\u0641\u0644\u0631 (\u0647\u0648\u0634 \u0645\u0635\u0646\u0648\u0639\u06CC)", "cf:home:0"]]] : []];
  if (g) rows.push([[g.review ? "\u{1F6E1} \u062E\u0627\u0645\u0648\u0634\u200C\u06A9\u0631\u062F\u0646 \u0628\u0631\u0631\u0633\u06CC" : "\u{1F6E1} \u0631\u0648\u0634\u0646\u200C\u06A9\u0631\u062F\u0646 \u0628\u0631\u0631\u0633\u06CC", "gp:rev"], ["\u{1F50C} \u0642\u0637\u0639 \u06AF\u0631\u0648\u0647", "gp:off"]]);
  rows.push([[sup.has ? "\u{1F511} \u062A\u063A\u06CC\u06CC\u0631 \u0646\u0627\u0638\u0631" : "\u{1F511} \u062B\u0628\u062A \u0631\u0628\u0627\u062A \u0646\u0627\u0638\u0631", "gp:sup"], [asst.has ? "\u{1F511} \u062A\u063A\u06CC\u06CC\u0631 \u062F\u0633\u062A\u06CC\u0627\u0631" : "\u{1F511} \u062B\u0628\u062A \u0631\u0628\u0627\u062A \u062F\u0633\u062A\u06CC\u0627\u0631", "gp:asst"]]);
  const del2 = [];
  if (sup.has) del2.push(["\u{1F5D1} \u062D\u0630\u0641 \u0646\u0627\u0638\u0631", "gp:supdel"]);
  if (asst.has) del2.push(["\u{1F5D1} \u062D\u0630\u0641 \u062F\u0633\u062A\u06CC\u0627\u0631", "gp:asstdel"]);
  if (del2.length) rows.push(del2);
  await send(env, u.id, t, ikb(rows));
}
var lessonKb = (id) => ikb([[["\u270F\uFE0F \u0648\u06CC\u0631\u0627\u06CC\u0634", `gp:le:${id}`], ["\u{1F5D1} \u0641\u0631\u0627\u0645\u0648\u0634 \u06A9\u0646", `gp:ld:${id}`]]]);
async function onGroupCallback(c, u, q, act2, arg) {
  const { env } = c;
  await answer(env, q.id);
  const g = await getGroup(env, u.id);
  switch (act2) {
    case "help":
      return void await send(env, u.id, GUIDE2);
    case "site":
      return void await send(env, u.id, await siteLink(env, u.id));
    case "run":
      await enqueue(env, u.id, "manual", {});
      return void await send(env, u.id, "\u{1F91D} \u062C\u0644\u0633\u0647\u200C\u06CC \u0634\u0648\u0631\u0627 \u062F\u0631\u062E\u0648\u0627\u0633\u062A \u0634\u062F\u061B \u062A\u0627 \u06CC\u06A9 \u062F\u0642\u06CC\u0642\u0647\u200C\u06CC \u062F\u06CC\u06AF\u0631 \u062F\u0631 \u062A\u0627\u067E\u06CC\u06A9 \xAB\u0634\u0648\u0631\u0627\xBB \u0634\u0631\u0648\u0639 \u0645\u06CC\u200C\u0634\u0648\u062F.");
    case "doc":
      await send(env, u.id, "\u{1FA7A} \u062F\u0631 \u062D\u0627\u0644 \u0628\u0631\u0631\u0633\u06CC\u2026");
      return void await send(env, u.id, await doctorNow(env, u.id));
    case "all": {
      if (!g) return void await send(env, u.id, "\u0627\u0628\u062A\u062F\u0627 \u06AF\u0631\u0648\u0647 \u0631\u0627 \u0645\u062A\u0635\u0644 \u06A9\u0646\u06CC\u062F.");
      const n = await syncAll(env, u.id, 6);
      return void await send(env, u.id, `\u{1F4DA} ${n ? n + " \u067E\u0633\u062A \u0628\u0647 \u062A\u0627\u067E\u06CC\u06A9 \xAB\u062A\u0645\u0627\u0645 \u067E\u0633\u062A\u200C\u0647\u0627\xBB \u0631\u0641\u062A/\u0628\u0647\u200C\u0631\u0648\u0632 \u0634\u062F\u061B \u0628\u0642\u06CC\u0647 \u062E\u0648\u062F\u06A9\u0627\u0631 \u062F\u0631 \u062F\u0642\u06CC\u0642\u0647\u200C\u0647\u0627\u06CC \u0628\u0639\u062F \u0645\u06CC\u200C\u0631\u0633\u0646\u062F." : "\u0647\u0645\u0647\u200C\u06CC \u067E\u0633\u062A\u200C\u0647\u0627 \u062F\u0631 \u062A\u0627\u067E\u06CC\u06A9 \xAB\u062A\u0645\u0627\u0645 \u067E\u0633\u062A\u200C\u0647\u0627\xBB \u0628\u0647\u200C\u0631\u0648\u0632 \u0627\u0633\u062A."}`);
    }
    case "rev":
      if (g) {
        g.review = !g.review;
        await saveGroup(env, u.id, g);
      }
      return home3(env, u);
    case "off":
      await dropGroup(env, u.id);
      return void await send(env, u.id, "\u{1F50C} \u06AF\u0631\u0648\u0647 \u0642\u0637\u0639 \u0634\u062F\u061B \u067E\u0633\u062A\u200C\u0647\u0627 \u0645\u0633\u062A\u0642\u06CC\u0645 \u0628\u0647 \u0627\u06CC\u062A\u0627 \u0645\u06CC\u200C\u0631\u0648\u0646\u062F.");
    case "sup":
    case "asst":
      await setSession(env, u.id, "gp_bot", { role: act2 });
      return void await send(env, u.id, `\u{1F511} \u062A\u0648\u06A9\u0646 \u0631\u0628\u0627\u062A ${ROLES[act2].fa} \u0631\u0627 \u0628\u0641\u0631\u0633\u062A\u06CC\u062F (\u0627\u0632 BotFather).
\u{1F9F9} \u067E\u06CC\u0627\u0645 \u0634\u0645\u0627 \u0628\u0639\u062F \u0627\u0632 \u062E\u0648\u0627\u0646\u062F\u0646 \u067E\u0627\u06A9 \u0645\u06CC\u200C\u0634\u0648\u062F. \u0644\u063A\u0648: /cancel`);
    case "supdel":
    case "asstdel":
      await clearRoleBot(env, u.id, act2 === "supdel" ? "sup" : "asst");
      return home3(env, u);
    case "les": {
      const rows = (await env.DB.prepare("SELECT id, rule FROM ea_lessons WHERE user_id=? ORDER BY id DESC LIMIT 20").bind(u.id).all()).results;
      await send(env, u.id, `\u{1F9E0} <b>\u0622\u0645\u0648\u062E\u062A\u0647\u200C\u0647\u0627</b> (${rows.length})
\u0647\u0631 \u0642\u0627\u0646\u0648\u0646 \u0631\u0627 \u0645\u06CC\u200C\u062A\u0648\u0627\u0646\u06CC\u062F \u0648\u06CC\u0631\u0627\u06CC\u0634 \u06CC\u0627 \u062D\u0630\u0641 \u06A9\u0646\u06CC\u062F.`, ikb([[["\u2795 \u0627\u0641\u0632\u0648\u062F\u0646 \u0642\u0627\u0646\u0648\u0646", "gp:ln"]]]));
      for (const r of rows) await send(env, u.id, `\u{1F9E0} ${esc(r.rule)}`, lessonKb(r.id));
      return;
    }
    case "ln":
      await setSession(env, u.id, "gp_led", { id: 0 });
      return void await send(env, u.id, "\u2795 \u0645\u062A\u0646 \u0642\u0627\u0646\u0648\u0646 \u062C\u062F\u06CC\u062F \u0631\u0627 \u0628\u0646\u0648\u06CC\u0633\u06CC\u062F (\u06A9\u0648\u062A\u0627\u0647 \u0648 \u06A9\u0644\u06CC\u060C \u0645\u062B\u0644\u0627\u064B \xAB\u0622\u062E\u0631 \u0645\u062A\u0646\u060C \u0622\u06CC\u062F\u06CC \u06A9\u0627\u0646\u0627\u0644 \u062F\u06CC\u06AF\u0631 \u0646\u06AF\u0630\u0627\u0631\xBB).\n\u0644\u063A\u0648: /cancel");
    case "le": {
      const r = await env.DB.prepare("SELECT rule FROM ea_lessons WHERE id=? AND user_id=?").bind(Number(arg), u.id).first();
      if (!r) return void await send(env, u.id, "\u0627\u06CC\u0646 \u0642\u0627\u0646\u0648\u0646 \u067E\u06CC\u062F\u0627 \u0646\u0634\u062F.");
      await setSession(env, u.id, "gp_led", { id: Number(arg) });
      return void await send(env, u.id, `\u270F\uFE0F \u0645\u062A\u0646 \u0641\u0639\u0644\u06CC:
<i>${esc(r.rule)}</i>

\u0645\u062A\u0646 \u062C\u062F\u06CC\u062F \u0631\u0627 \u0628\u0646\u0648\u06CC\u0633\u06CC\u062F.
\u0644\u063A\u0648: /cancel`);
    }
    case "ld":
      await env.DB.prepare("DELETE FROM ea_lessons WHERE id=? AND user_id=?").bind(Number(arg), u.id).run();
      if (q.message) await edit(env, u.id, q.message.message_id, "\u{1F5D1} \u0641\u0631\u0627\u0645\u0648\u0634 \u0634\u062F.");
      return;
  }
}
async function gotLesson(c, u, d, text) {
  const { env } = c, rule = text.replace(/\s+/g, " ").trim().slice(0, 300);
  if (rule.length < 6) return void await send(env, u.id, "\u0642\u0627\u0646\u0648\u0646 \u062E\u06CC\u0644\u06CC \u06A9\u0648\u062A\u0627\u0647 \u0627\u0633\u062A\u061B \u06A9\u0645\u06CC \u0648\u0627\u0636\u062D\u200C\u062A\u0631 \u0628\u0646\u0648\u06CC\u0633\u06CC\u062F.");
  await clearSession(env, u.id);
  if (d.id) {
    await env.DB.prepare("UPDATE ea_lessons SET rule=? WHERE id=? AND user_id=?").bind(rule, Number(d.id), u.id).run();
    return void await send(env, u.id, "\u2705 \u0642\u0627\u0646\u0648\u0646 \u0628\u0647\u200C\u0631\u0648\u0632 \u0634\u062F.", lessonKb(Number(d.id)));
  }
  await addLesson(env, u.id, rule, "owner");
  await send(env, u.id, "\u2705 \u0642\u0627\u0646\u0648\u0646 \u0627\u0636\u0627\u0641\u0647 \u0634\u062F\u061B \u0627\u0632 \u0627\u06CC\u0646 \u0628\u0647 \u0628\u0639\u062F \u0627\u06CC\u062C\u0646\u062A \u0648 \u0646\u0627\u0638\u0631 \u0631\u0639\u0627\u06CC\u062A\u0634 \u0645\u06CC\u200C\u06A9\u0646\u0646\u062F.");
}
async function gotBotToken(c, u, m, text, role) {
  const { env } = c;
  await del(env, u.id, m.message_id);
  const token = text.trim();
  if (!/^\d{6,}:[A-Za-z0-9_-]{20,}$/.test(token)) return void await send(env, u.id, "\u274C \u0642\u0627\u0644\u0628 \u062A\u0648\u06A9\u0646 \u062F\u0631\u0633\u062A \u0646\u06CC\u0633\u062A (\u0645\u062B\u0644 123456:ABC\u2026). \u062F\u0648\u0628\u0627\u0631\u0647 \u0628\u0641\u0631\u0633\u062A\u06CC\u062F \u06CC\u0627 /cancel.");
  const r = await setRoleBot(env, u.id, role, token);
  if (!r.ok) return void await send(env, u.id, `\u274C \u062A\u0644\u06AF\u0631\u0627\u0645 \u062A\u0648\u06A9\u0646 \u0631\u0627 \u0646\u067E\u0630\u06CC\u0631\u0641\u062A: ${esc(r.error)}`);
  await clearSession(env, u.id);
  await send(env, u.id, `\u2705 \u0631\u0628\u0627\u062A ${ROLES[role].fa} \u062B\u0628\u062A \u0634\u062F: @${esc(r.name)}${r.inGroup === false ? "\n\u26A0\uFE0F \u0647\u0646\u0648\u0632 \u062F\u0631 \u06AF\u0631\u0648\u0647 \u0646\u06CC\u0633\u062A\u061B \u0622\u0646 \u0631\u0627 \u0628\u0647 \u06AF\u0631\u0648\u0647 \u0627\u0636\u0627\u0641\u0647 \u0648 \u0627\u062F\u0645\u06CC\u0646 \u06A9\u0646\u06CC\u062F (\u062A\u0627 \u0622\u0646 \u0645\u0648\u0642\u0639 \u0647\u0645\u06CC\u0646 \u0631\u0628\u0627\u062A \u0628\u0647 \u0646\u0627\u0645 \u0627\u0648 \u0645\u06CC\u200C\u0646\u0648\u06CC\u0633\u062F)." : r.inGroup ? "\n\u2705 \u062F\u0631 \u06AF\u0631\u0648\u0647 \u0639\u0636\u0648 \u0627\u0633\u062A." : "\n\u0628\u0639\u062F \u0627\u0632 \u0627\u062A\u0635\u0627\u0644 \u06AF\u0631\u0648\u0647\u060C \u0622\u0646 \u0631\u0627 \u062F\u0631 \u06AF\u0631\u0648\u0647 \u0627\u062F\u0645\u06CC\u0646 \u06A9\u0646\u06CC\u062F."}`);
}
async function onAskCallback(c, u, q, act2, arg) {
  const { env } = c, id = Number(arg);
  await answer(env, q.id);
  if (act2 === "skip") {
    await env.DB.prepare("UPDATE ea_asks SET status='skipped' WHERE id=? AND user_id=? AND status='open'").bind(id, u.id).run();
    return void await send(env, u.id, "\u23ED \u0646\u0627\u062F\u06CC\u062F\u0647 \u06AF\u0631\u0641\u062A\u0647 \u0634\u062F.");
  }
  const a = await env.DB.prepare("SELECT question FROM ea_asks WHERE id=? AND user_id=? AND status='open'").bind(id, u.id).first();
  if (!a) return void await send(env, u.id, "\u0627\u06CC\u0646 \u0633\u0624\u0627\u0644 \u062F\u06CC\u06AF\u0631 \u0628\u0627\u0632 \u0646\u06CC\u0633\u062A.");
  await setSession(env, u.id, "as_ans", { id });
  await send(env, u.id, `\u{1F4AC} \u067E\u0627\u0633\u062E\u062A\u0627\u0646 \u0631\u0627 \u0628\u0646\u0648\u06CC\u0633\u06CC\u062F:

<i>${esc(a.question)}</i>

\u0644\u063A\u0648: /cancel`);
}
async function gotAnswer(c, u, d, text) {
  await clearSession(c.env, u.id);
  const ok = await answerAsk(c.env, u.id, Number(d.id), text);
  await send(c.env, u.id, ok ? "\u2705 \u067E\u0627\u0633\u062E \u0634\u0645\u0627 \u0628\u0647 \u0634\u0648\u0631\u0627 \u0631\u0633\u06CC\u062F\u061B \u0646\u0627\u0638\u0631 \u0648 \u062F\u0633\u062A\u06CC\u0627\u0631 \u062A\u0627 \u06CC\u06A9 \u062F\u0642\u06CC\u0642\u0647\u200C\u06CC \u062F\u06CC\u06AF\u0631 \u0631\u0648\u06CC \u0622\u0646 \u06A9\u0627\u0631 \u0645\u06CC\u200C\u06A9\u0646\u0646\u062F." : "\u0627\u06CC\u0646 \u0633\u0624\u0627\u0644 \u062F\u06CC\u06AF\u0631 \u0628\u0627\u0632 \u0646\u06CC\u0633\u062A.");
}

// eitaa-src/council.ts
var MAX_TURNS = 6;
var MAX_SAYS = 5;
var MAX_ACTIONS = 3;
var DAY_CAP = 10;
var GAP_S = 300;
async function enqueue(env, uid, kind, payload = "") {
  await env.DB.prepare("INSERT INTO ea_events(user_id,kind,payload,status,created_at) VALUES(?,?,?,'new',?)").bind(uid, kind, typeof payload === "string" ? payload : JSON.stringify(payload), now()).run();
}
var dayKey = (uid) => `cc:${uid}:${new Date(Date.now() + 126e5).toISOString().slice(0, 10)}`;
var T = (name, description, properties, required = []) => ({ type: "function", function: { name, description, parameters: { type: "object", properties, required } } });
var TOOLS2 = [
  T("say", "Say something to the other agent in the council chat (Persian, max 3 short sentences).", { text: { type: "string" } }, ["text"]),
  T("ask_owner", "Ask the OWNER (a human) for a decision, opinion or help. Only when really needed; one clear question, with suggested options.", { question: { type: "string" } }, ["question"]),
  T("delete_post", "Delete a post: removes the group copy and tries to remove it from Eitaa.", { id: { type: "integer" }, reason: { type: "string" } }, ["id", "reason"]),
  T("fix_post", "Correct a post: the old one is deleted and the corrected text is re-published (group first, then supervisor review, then Eitaa).", { id: { type: "integer" }, text: { type: "string", description: "the FULL corrected text including the owner's signature" }, reason: { type: "string" } }, ["id", "text", "reason"]),
  T("lesson_add", "Save a new general lesson (rule) so the mistake never repeats.", { rule: { type: "string" } }, ["rule"]),
  T("lesson_edit", "Rewrite an existing lesson by its id (make it clearer or merge duplicates).", { id: { type: "integer" }, rule: { type: "string" } }, ["id", "rule"]),
  T("lesson_delete", "Delete a wrong, duplicated or outdated lesson by its id.", { id: { type: "integer" }, reason: { type: "string" } }, ["id"]),
  T("set_review", "Turn the supervisor's pre-publication review on or off.", { on: { type: "boolean" } }, ["on"]),
  T("finish", "End the council session (nothing more to say or do).", {})
];
var COMMON = 'You are one of two AI agents that run quality control for a Persian-language Eitaa channel owned by a human ("the owner"). The conversation happens in a Telegram group chat the owner can read. Write Persian, warm but sharp and concrete; max 3 short sentences per message; no filler, no repeating what was already said. Ground every claim in the CONTEXT below (post ids, lesson ids). Never invent ids. Use tools to act \u2014 saying you will do something is not doing it. Eitaa cannot edit a message: an edit = delete the old post + publish the corrected one (fix_post does exactly that). Prefer fix_post over delete_post; never touch a post that is fine. Lessons must be general, imperative, \u2264160 chars, no duplicates. At most ' + MAX_ACTIONS + " post actions per session. If nothing needs doing: one short sentence, then finish. ";
var PROMPT = {
  sup: COMMON + "YOU ARE \xAB\u0646\u0627\u0638\u0631\xBB (the supervisor): you inspect every post before it reaches Eitaa. In the council you REPORT honestly what happened (errors you found, what you fixed or held, what you were unsure about), what you LEARNED (propose precise lessons) and where you might be wrong. You follow the assistant's orders unless one would clearly harm the owner \u2014 then object with a reason. Ask the assistant for his opinion on your lessons.",
  asst: COMMON + "YOU ARE \xAB\u062F\u0633\u062A\u06CC\u0627\u0631\xBB (the assistant): the coordinating brain and the supervisor's boss. You answer what the supervisor reports: give a real opinion (agree, challenge, refine), clean up the lessons (merge duplicates, make vague ones precise, delete wrong ones), and ORDER the supervisor to act when needed (use the tools yourself and say what you ordered). When a decision needs the human (policy, taste, risk, missing information) use ask_owner \u2014 one clear question with suggested answers; do not ask what you can decide. When the owner has spoken, address him directly and act on it."
};
async function context(env, uid, events) {
  const g = await getGroup(env, uid);
  const lessons = (await env.DB.prepare("SELECT id, rule FROM ea_lessons WHERE user_id=? ORDER BY id DESC LIMIT 30").bind(uid).all()).results;
  const posts = (await env.DB.prepare("SELECT p.id, p.status, p.kind, substr(p.text,1,90) t, COALESCE(u.verdict,'') v, COALESCE(u.note,'') n FROM ea_posts p LEFT JOIN ea_pubs u ON u.post_id=p.id WHERE p.user_id=? ORDER BY p.id DESC LIMIT 12").bind(uid).all()).results;
  const hist = (await env.DB.prepare("SELECT role, text FROM ea_council WHERE user_id=? ORDER BY id DESC LIMIT 8").bind(uid).all()).results.reverse();
  const asks = (await env.DB.prepare("SELECT id, question, answer, status FROM ea_asks WHERE user_id=? ORDER BY id DESC LIMIT 4").bind(uid).all()).results;
  const t = /* @__PURE__ */ new Date();
  return `

CONTEXT
Today (Tehran): ${jalaliLong(Math.floor(t.getTime() / 1e3))}
Supervisor review before Eitaa: ${g?.review === false ? "OFF" : "ON"}
LESSONS (id: rule):
${lessons.length ? lessons.map((l) => `${l.id}: ${l.rule}`).join("\n") : "(none yet)"}
RECENT POSTS (id status verdict note | text):
${posts.length ? posts.map((p) => `#${p.id} ${p.status}${p.kind === "file" ? " +media" : ""} ${p.v}${p.n ? " \xAB" + p.n.slice(0, 80) + "\xBB" : ""} | ${p.t.replace(/\s+/g, " ")}`).join("\n") : "(none)"}
OWNER QUESTIONS:
${asks.length ? asks.map((a) => `#${a.id} [${a.status}] ${a.question.slice(0, 120)}${a.answer ? " \u2192 OWNER ANSWERED: " + a.answer.slice(0, 200) : ""}`).join("\n") : "(none)"}
EARLIER COUNCIL CHAT:
${hist.length ? hist.map((h) => `${roleName(h.role)}: ${h.text.slice(0, 200)}`).join("\n") : "(none)"}
WHY THIS SESSION:
${events.join("\n").slice(0, 1800)}`;
}
var logLine = (env, uid, role, text) => env.DB.prepare("INSERT INTO ea_council(user_id,role,text,created_at) VALUES(?,?,?,?)").bind(uid, role, text.slice(0, 1500), now()).run();
var councilSay = async (env, uid, role, text) => {
  await logLine(env, uid, role, text);
  if (role !== "owner") await sayAs(env, uid, role, "council", esc(text));
};
async function getPost2(env, uid, id) {
  return env.DB.prepare("SELECT * FROM ea_posts WHERE id=? AND user_id=?").bind(id, uid).first();
}
async function act(env, uid, role, name, a, st) {
  const int = (x) => Math.trunc(Number(x));
  switch (name) {
    case "say": {
      const text = String(a.text || "").trim();
      if (!text) return "empty";
      if (st.says >= MAX_SAYS) return "too many messages; finish";
      st.says++;
      await councilSay(env, uid, role, text);
      return "sent";
    }
    case "finish":
      st.done = true;
      return "ok";
    case "ask_owner": {
      const q = String(a.question || "").trim().slice(0, 700);
      if (!q) return "empty question";
      if ((await env.DB.prepare("SELECT COUNT(*) n FROM ea_asks WHERE user_id=? AND status='open'").bind(uid).first()).n >= 3) return "there are already 3 open questions; wait for the owner";
      const id = (await env.DB.prepare("INSERT INTO ea_asks(user_id,role,question,created_at) VALUES(?,?,?,?)").bind(uid, role, q, now()).run()).meta.last_row_id;
      await logLine(env, uid, role, `\u2753 (\u0627\u0632 \u0645\u0627\u0644\u06A9) ${q}`);
      await sayAs(env, uid, role, "council", `\u2753 <b>\u0627\u0632 \u0634\u0645\u0627:</b> ${esc(q)}

<i>\u0647\u0645\u06CC\u0646\u200C\u062C\u0627 \u06CC\u0627 \u0627\u0632 \u0631\u0628\u0627\u062A \u067E\u0627\u0633\u062E \u062F\u0647\u06CC\u062F.</i>`);
      await send(env, uid, `\u2753 <b>${roleName(role)} \u0627\u0632 \u0634\u0645\u0627 \u06A9\u0645\u06A9 \u0645\u06CC\u200C\u062E\u0648\u0627\u0647\u062F</b>

${esc(q)}`, ikb([[["\u{1F4AC} \u067E\u0627\u0633\u062E \u062F\u0627\u062F\u0646", `as:ans:${id}`], ["\u23ED \u0646\u0627\u062F\u06CC\u062F\u0647", `as:skip:${id}`]]]));
      st.waiting = true;
      return `asked (#${id}); the session ends until the owner answers`;
    }
    case "delete_post":
    case "fix_post": {
      if (st.actions >= MAX_ACTIONS) return "action limit reached";
      const p = await getPost2(env, uid, int(a.id));
      if (!p) return "no such post";
      if (!["pending", "held", "sent", "failed"].includes(p.status)) return `post is ${p.status}; cannot act`;
      st.actions++;
      if (name === "delete_post") {
        const r2 = await removePost(env, p, "deleted");
        await markGroup(env, p.id, "\u{1F5D1}").catch(() => null);
        const line2 = `\u{1F5D1} \u067E\u0633\u062A #${p.id} \u062D\u0630\u0641 \u0634\u062F (${String(a.reason || "").slice(0, 120)})${r2.eitaa === "manual" ? " \u2014 \u26A0\uFE0F \u0627\u0632 \u0627\u06CC\u062A\u0627 \u0628\u0627\u06CC\u062F \u062F\u0633\u062A\u06CC \u062D\u0630\u0641 \u0634\u0648\u062F" : r2.eitaa === "removed" ? " \u2014 \u0627\u0632 \u0627\u06CC\u062A\u0627 \u0647\u0645 \u067E\u0627\u06A9 \u0634\u062F" : ""}`;
        await logLine(env, uid, role, line2);
        await sayAs(env, uid, role, "reports", esc(line2));
        return line2;
      }
      const text = String(a.text || "").trim();
      if (!text || p.kind === "file" && text.length > 1e3) return "invalid text (empty, or >1000 chars for a media post)";
      const r = await replacePost(env, p, { text, keepJob: true });
      const line = `\u270F\uFE0F \u067E\u0633\u062A #${p.id} \u0627\u0635\u0644\u0627\u062D \u0634\u062F \u2190 \u067E\u0633\u062A \u062C\u062F\u06CC\u062F #${r.id} (${String(a.reason || "").slice(0, 120)})${r.note ? " \u2014 \u26A0\uFE0F \u0646\u0633\u062E\u0647\u200C\u06CC \u0642\u0628\u0644\u06CC \u062F\u0631 \u0627\u06CC\u062A\u0627 \u062F\u0633\u062A\u06CC \u062D\u0630\u0641 \u0634\u0648\u062F" : ""}`;
      await logLine(env, uid, role, line);
      await sayAs(env, uid, role, "reports", esc(line));
      return line;
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
      g.review = !!a.on;
      await saveGroup(env, uid, g);
      return `review ${g.review ? "ON" : "OFF"}`;
    }
  }
  return "unknown tool";
}
var KNOWN = new Set(TOOLS2.map((t) => t.function.name));
var usable = (m) => !!m && ((m.content || "").trim().length >= 3 || (m.tool_calls || []).some((c) => KNOWN.has(c.function.name) && c.function.name !== "finish"));
async function turn(env, messages, system, user) {
  let err = "";
  try {
    const m = await chatTools(env, messages, TOOLS2, 4e4, 900);
    if (usable(m)) return { m, err: "" };
    err = "\u067E\u0627\u0633\u062E \u0628\u062F\u0648\u0646 \u0627\u0628\u0632\u0627\u0631/\u0645\u062A\u0646";
  } catch (e) {
    err = e.message;
  }
  try {
    const list = TOOLS2.map((t) => `- ${t.function.name}: ${t.function.description} args=${JSON.stringify(t.function.parameters.properties)}`).join("\n");
    const j = await chatJson(env, system + "\nTOOLS YOU CAN CALL:\n" + list + '\nReply JSON: {"calls":[{"tool":"say","args":{"text":"..."}}]} \u2014 one to three calls; ALWAYS start with a say call; use {"tool":"finish","args":{}} when done.', user, 900);
    const calls = (Array.isArray(j.calls) ? j.calls : []).filter((c) => c && typeof c.tool === "string").slice(0, 3).map((c, i) => ({ id: `j${i}`, type: "function", function: { name: c.tool, arguments: JSON.stringify(c.args && typeof c.args === "object" ? c.args : {}) } }));
    const m = { role: "assistant", content: typeof j.text === "string" ? j.text : null, tool_calls: calls };
    if (usable(m)) return { m, err: "" };
  } catch (e) {
    err = `${err} | ${e.message}`;
  }
  try {
    const j = await chatJson(env, system.slice(0, 3500) + '\nIgnore tools now. Reply JSON {"text": string}: 1-3 Persian sentences from you to the other agent / the owner about the situation.', user, 500);
    const t = typeof j.text === "string" ? j.text.trim() : "";
    if (t.length >= 3) return { m: { role: "assistant", content: t }, err: "" };
  } catch (e) {
    err = `${err} | ${e.message}`;
  }
  return { m: null, err: err.slice(0, 400) };
}
async function runSession(env, uid, events, first = "sup", fallback = "") {
  const ctx = await context(env, uid, events);
  const st = { actions: 0, waiting: false, done: false, says: 0 };
  const transcript = [];
  let role = first, idle = 0, turns = 0, error = "";
  for (; turns < MAX_TURNS && !st.done && !st.waiting; turns++, role = role === "sup" ? "asst" : "sup") {
    const other = role === "sup" ? "assistant" : "supervisor";
    const sys = PROMPT[role] + ctx;
    const usr = `${transcript.length ? "SESSION SO FAR:\n" + transcript.join("\n") : "The session starts now."}

Your turn (${role === "sup" ? "supervisor" : "assistant"}). Speak to the ${other} with say, act with the other tools, or finish.`;
    const r = await turn(env, [{ role: "system", content: sys }, { role: "user", content: usr }], sys, usr);
    if (!r.m) {
      if (/quota|limit|neurons|allocation|429|4006|timeout|timed out|abort|fetch|network|HTTP \d|capacity|unavailable|overloaded|سهمیه|محدودیت|موجودی|در دسترس نیست|پاسخ نداد|کلید API|هیچ سرویس/i.test(r.err)) error = r.err;
      break;
    }
    const m = r.m;
    const before = st.says + st.actions;
    if (!m.tool_calls?.length) {
      const txt = (m.content || "").trim();
      if (txt) await act(env, uid, role, "say", { text: txt }, st).then((r2) => transcript.push(`${roleName(role)}: ${txt}`));
    }
    for (const c of m.tool_calls || []) {
      let a = {};
      try {
        a = JSON.parse(c.function.arguments || "{}");
      } catch {
      }
      const out = await act(env, uid, role, c.function.name, a, st).catch((e) => `error: ${e.message}`);
      transcript.push(c.function.name === "say" ? `${roleName(role)}: ${String(a.text || "")}` : `${roleName(role)} \u2192 ${c.function.name}(${JSON.stringify(a).slice(0, 220)}) \u21D2 ${out}`);
    }
    if (st.says + st.actions === before) {
      if (++idle >= 2) break;
    } else idle = 0;
  }
  if (!error && !st.says && !st.waiting) {
    await act(env, uid, first, "say", { text: fallback || "\u{1F6E1} \u062C\u0644\u0633\u0647 \u0628\u0631\u06AF\u0632\u0627\u0631 \u0634\u062F\u061B \u0645\u0648\u0631\u062F \u062A\u0627\u0632\u0647\u200C\u0627\u06CC \u0628\u0631\u0627\u06CC \u06AF\u0632\u0627\u0631\u0634 \u0646\u0628\u0648\u062F \u2705" }, st).catch(() => null);
  }
  return { turns, says: st.says, error };
}
var describeEvent = (e) => {
  let p = {};
  try {
    p = JSON.parse(e.payload);
  } catch {
    p = { text: e.payload };
  }
  switch (e.kind) {
    case "held":
      return `Supervisor HELD post #${p.id} (not sent to Eitaa): ${(p.problems || []).join("; ")}`;
    case "fixed":
      return `Supervisor auto-FIXED post #${p.id} before publishing: ${(p.problems || []).join("; ")}`;
    case "reported_error":
      return `OWNER reported an error on post #${p.id}: \xAB${p.error}\xBB. Lesson saved: ${p.lesson || "(none)"}. ${p.fixed ? "It was fixed and re-published." : "It could not be fixed automatically."}`;
    case "owner_answer":
      return `OWNER ANSWERED the question #${p.id} (\xAB${p.question}\xBB): \xAB${p.answer}\xBB. Act on it now.`;
    case "owner_note":
      return `OWNER wrote in the council chat: \xAB${p.text}\xBB. Answer him and act.`;
    case "digest":
      return `Periodic review: the supervisor summarises what he learned; the assistant cleans the lessons (merge duplicates, sharpen vague ones, delete wrong ones).`;
    default:
      return `Manual session requested by the owner${p.text ? ": " + p.text : ""}.`;
  }
};
var factLine = (e) => {
  let p = {};
  try {
    p = JSON.parse(e.payload);
  } catch {
    p = { text: e.payload };
  }
  switch (e.kind) {
    case "held":
      return `\u067E\u0633\u062A #${p.id} \u0631\u0627 \u0646\u06AF\u0647 \u062F\u0627\u0634\u062A\u0645 \u0648 \u0628\u0647 \u0627\u06CC\u062A\u0627 \u0646\u0641\u0631\u0633\u062A\u0627\u062F\u0645: ${(p.problems || []).join("\u061B ")}`;
    case "fixed":
      return `\u067E\u0633\u062A #${p.id} \u0631\u0627 \u067E\u06CC\u0634 \u0627\u0632 \u0627\u0646\u062A\u0634\u0627\u0631 \u0627\u0635\u0644\u0627\u062D \u06A9\u0631\u062F\u0645: ${(p.problems || []).join("\u061B ")}`;
    case "reported_error":
      return `\u062E\u0637\u0627\u06CC \u06AF\u0632\u0627\u0631\u0634\u200C\u0634\u062F\u0647\u200C\u06CC \u067E\u0633\u062A #${p.id} \u062B\u0628\u062A \u0634\u062F${p.lesson ? " \u0648 \u062F\u0631\u0633\u0634 \u0631\u0627 \u06CC\u0627\u062F \u06AF\u0631\u0641\u062A\u0645: " + p.lesson : ""}${p.fixed ? " (\u0627\u0635\u0644\u0627\u062D \u0648 \u062F\u0648\u0628\u0627\u0631\u0647 \u0645\u0646\u062A\u0634\u0631 \u0634\u062F)" : ""}.`;
    case "owner_answer":
      return `\u067E\u0627\u0633\u062E \u0634\u0645\u0627 \u0628\u0647 \u0633\u0624\u0627\u0644 #${p.id} \u062B\u0628\u062A \u0634\u062F \u0648 \u0637\u0628\u0642 \u0622\u0646 \u0639\u0645\u0644 \u0645\u06CC\u200C\u06A9\u0646\u0645.`;
    case "owner_note":
      return `\u067E\u06CC\u0627\u0645 \u0634\u0645\u0627 \u0631\u0627 \u062F\u0631\u06CC\u0627\u0641\u062A \u06A9\u0631\u062F\u0645: \xAB${String(p.text || "").slice(0, 160)}\xBB. \u062F\u0633\u062A\u06CC\u0627\u0631 \u0648 \u0645\u0646 \u0628\u0631\u0631\u0633\u06CC \u0645\u06CC\u200C\u06A9\u0646\u06CC\u0645.`;
    case "digest":
      return "\u0645\u0631\u0648\u0631 \u062F\u0648\u0631\u0647\u200C\u0627\u06CC \u0627\u0646\u062C\u0627\u0645 \u0634\u062F\u061B \u0622\u0645\u0648\u062E\u062A\u0647\u200C\u0647\u0627 \u0628\u0631\u0631\u0633\u06CC \u0634\u062F\u0646\u062F \u0648 \u0645\u0648\u0631\u062F \u062A\u0627\u0632\u0647\u200C\u0627\u06CC \u0646\u0628\u0648\u062F.";
    default:
      return `\u062C\u0644\u0633\u0647\u200C\u06CC \u062F\u0633\u062A\u06CC: \u0641\u0639\u0644\u0627\u064B \u0645\u0648\u0631\u062F \u0628\u0627\u0632\u06CC \u0628\u0631\u0627\u06CC \u06AF\u0632\u0627\u0631\u0634 \u0646\u062F\u0627\u0631\u0645 \u0648 \u0647\u0645\u0647\u200C\u0686\u06CC\u0632 \u0639\u0627\u062F\u06CC \u0627\u0633\u062A \u2705${p.text ? " \u2014 \u062F\u0631\u062E\u0648\u0627\u0633\u062A \u0634\u0645\u0627: \xAB" + String(p.text).slice(0, 120) + "\xBB" : ""}`;
  }
};
async function processCouncil(env) {
  const t = now();
  if (t % 3600 < 60) await scheduleDigests(env);
  const row = await env.DB.prepare("SELECT user_id FROM ea_events WHERE status='new' ORDER BY id LIMIT 1").first();
  if (!row) return;
  const uid = row.user_id;
  const evs = (await env.DB.prepare("SELECT id, kind, payload FROM ea_events WHERE user_id=? AND status='new' ORDER BY id LIMIT 12").bind(uid).all()).results;
  const ids = evs.map((e) => e.id).join(",");
  const mark = (s) => env.DB.prepare(`UPDATE ea_events SET status=? WHERE id IN (${ids})`).bind(s).run();
  if (!await getGroup(env, uid)) return void await mark("skipped");
  const urgent = evs.some((e) => e.kind.startsWith("owner") || e.kind === "manual");
  const used = Number(await kvGet(env, dayKey(uid)) || 0), last = Number(await kvGet(env, `cclast:${uid}`) || 0);
  if (used >= (urgent ? DAY_CAP * 3 : DAY_CAP)) return void await mark("skipped");
  if (!urgent && t - last < GAP_S) return;
  await mark("running");
  await kvSet(env, dayKey(uid), String(used + 1));
  await kvSet(env, `cclast:${uid}`, String(t));
  try {
    const first = evs.every((e) => e.kind === "owner_answer" || e.kind === "owner_note") ? "asst" : "sup";
    const r = await runSession(env, uid, evs.map(describeEvent), first, "\u{1F6E1} " + evs.map(factLine).join("\n"));
    await mark("done");
    if (r.error) await councilFailed(env, uid, r.error, urgent);
    else await kvDel(env, `ccerr:${uid}`);
  } catch (e) {
    console.error("council failed", e.message);
    await mark("failed");
    await councilFailed(env, uid, e.message, urgent);
  }
}
async function councilFailed(env, uid, why, urgent) {
  await kvSet(env, `ccerr:${uid}`, why.slice(0, 300));
  const last = Number(await kvGet(env, `ccerrsay:${uid}`) || 0);
  if (!urgent && now() - last < 3600) return;
  await kvSet(env, `ccerrsay:${uid}`, String(now()));
  const quota = /quota|limit|neurons|429|10000|capacity|تعداد|سهمیه/i.test(why);
  const text = `\u26A0\uFE0F <b>\u0634\u0648\u0631\u0627 \u0646\u062A\u0648\u0627\u0646\u0633\u062A \u0635\u062D\u0628\u062A \u06A9\u0646\u062F</b>
${esc(why.slice(0, 300))}

${quota ? "\u0628\u0647\u200C\u0646\u0638\u0631 \u0645\u06CC\u200C\u0631\u0633\u062F \u0633\u0647\u0645\u06CC\u0647\u200C\u06CC \u0631\u0627\u06CC\u06AF\u0627\u0646 \u0647\u0648\u0634 \u0645\u0635\u0646\u0648\u0639\u06CC \u0627\u0645\u0631\u0648\u0632 \u062A\u0645\u0627\u0645 \u0634\u062F\u0647\u061B \u0628\u0639\u062F \u0627\u0632 \u0646\u06CC\u0645\u0647\u200C\u0634\u0628 (\u0633\u0627\u0639\u062A \u06F0\u06F3:\u06F3\u06F0 \u062A\u0647\u0631\u0627\u0646) \u062E\u0648\u062F\u0634 \u062F\u0648\u0628\u0627\u0631\u0647 \u06A9\u0627\u0631 \u0645\u06CC\u200C\u06A9\u0646\u062F. " : "\u0631\u0628\u0627\u062A \u062E\u0648\u062F\u0634 \u0686\u0646\u062F \u062F\u0642\u06CC\u0642\u0647\u200C\u06CC \u062F\u06CC\u06AF\u0631 \u062F\u0648\u0628\u0627\u0631\u0647 \u062A\u0644\u0627\u0634 \u0645\u06CC\u200C\u06A9\u0646\u062F. "}\u0627\u06AF\u0631 \u0627\u062F\u0627\u0645\u0647 \u062F\u0627\u0634\u062A\u060C \xAB\u{1FA7A} \u0628\u0631\u0631\u0633\u06CC \u0633\u0644\u0627\u0645\u062A\xBB \u0631\u0627 \u062F\u0631 /panel \u06CC\u0627 \u0628\u062E\u0634 \u06AF\u0631\u0648\u0647 \u0628\u0632\u0646\u06CC\u062F.`;
  if (!await sayAs(env, uid, "main", "council", text)) await send(env, uid, text);
  if (urgent) await send(env, uid, text);
}
async function scheduleDigests(env) {
  const users = (await env.DB.prepare("SELECT k FROM ea_kv WHERE k LIKE 'grp:%'").all()).results.map((r) => Number(r.k.slice(4)));
  for (const uid of users) {
    const n = (await env.DB.prepare("SELECT COUNT(*) n FROM ea_lessons WHERE user_id=?").bind(uid).first()).n;
    const last = await kvGet(env, `ccdig:${uid}`) || "0:0";
    const [ts, cnt] = last.split(":").map(Number);
    if (n >= 3 && n !== cnt && now() - ts > 86400) {
      await kvSet(env, `ccdig:${uid}`, `${now()}:${n}`);
      await enqueue(env, uid, "digest");
    }
  }
}
async function answerAsk(env, uid, askId, answer2) {
  const a = await env.DB.prepare("SELECT * FROM ea_asks WHERE id=? AND user_id=? AND status='open'").bind(askId, uid).first();
  if (!a) return false;
  await env.DB.prepare("UPDATE ea_asks SET status='answered', answer=? WHERE id=?").bind(answer2.slice(0, 1e3), askId).run();
  await logLine(env, uid, "owner", answer2);
  await enqueue(env, uid, "owner_answer", { id: askId, question: a.question.slice(0, 200), answer: answer2.slice(0, 600) });
  return true;
}
async function ownerSpoke(env, uid, text) {
  const open2 = await env.DB.prepare("SELECT id FROM ea_asks WHERE user_id=? AND status='open' ORDER BY id DESC LIMIT 1").bind(uid).first();
  if (open2 && await answerAsk(env, uid, open2.id, text)) return;
  await logLine(env, uid, "owner", text);
  await enqueue(env, uid, "owner_note", { text: text.slice(0, 600) });
}

// eitaa-src/mirror.ts
var EVERY = 30 * 60;
var MAX_IMG = 15 * 1024 * 1024;
var MAX_VIDEO = 45 * 1024 * 1024;
var fnv = (s) => {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0).toString(36);
};
var msgHash = (m) => fnv(`${m.text}${m.image || m.videoUrl ? 1 : 0}${m.video ? 1 : 0}`);
async function usernameOf(env, ch) {
  const c = (ch.chat_id || "").replace(/^@/, "");
  if (c && !/^-?\d+$/.test(c) && !/joinchat/i.test(c)) return c;
  return await kvGet(env, `chuser:${ch.id}`) || "";
}
var mirrorOn = async (env, id) => !await kvGet(env, `mirroroff:${id}`);
var requestMirror = async (env, channelId, delay = 90) => {
  await kvSet(env, `mirr:due:${channelId}`, String(now() + delay)).catch(() => null);
};
async function topicFor(env, uid, cfg, ch, fresh = false) {
  if (!cfg.forum) return 0;
  const k = `mt:${ch.id}`;
  if (!fresh) {
    const v = Number(await kvGet(env, k) || 0);
    if (v) return v;
  }
  try {
    const id = (await tg(env, "createForumTopic", { chat_id: cfg.chat, name: `\u{1FA9E} ${ch.title}`.slice(0, 120) })).message_thread_id;
    await kvSet(env, k, String(id));
    return id;
  } catch {
    return 0;
  }
}
var gone = (m) => /thread.*not found|topic.*(deleted|closed|not found)|TOPIC_/i.test(m);
async function load(env, m, kind) {
  const base = eitaaWeb(env) + "/";
  if (kind === "video") {
    const f2 = await fetchBytes(m.videoUrl, MAX_VIDEO, base);
    return { bytes: f2.bytes, name: "video.mp4" };
  }
  const f = await fetchBytes(m.image, MAX_IMG, base);
  const ext = /png/i.test(f.type) ? "png" : /webp/i.test(f.type) || m.sticker ? "webp" : /gif/i.test(f.type) ? "gif" : "jpg";
  return { bytes: f.bytes, name: `image.${ext}` };
}
var linkKb = (env, name, id) => ({ inline_keyboard: [[{ text: "\u{1F517} \u0627\u0635\u0644 \u067E\u06CC\u0627\u0645 \u062F\u0631 \u0627\u06CC\u062A\u0627", url: `${eitaaWeb(env)}/${name}/${id}` }]] });
async function syncChannel(env, ch, budget = 5) {
  const cfg = await getGroup(env, ch.user_id);
  if (!cfg) return { ops: 0, done: true, error: "" };
  const name = await usernameOf(env, ch);
  if (!name) return { ops: 0, done: true, error: "\u0646\u0627\u0645 \u06A9\u0627\u0631\u0628\u0631\u06CC \u0639\u0645\u0648\u0645\u06CC \u06A9\u0627\u0646\u0627\u0644 \u0631\u0627 \u0646\u0645\u06CC\u200C\u062F\u0627\u0646\u0645" };
  const res = await fetchChannel(env, name);
  if (!res.ok) return { ops: 0, done: false, error: res.note || "\u0635\u0641\u062D\u0647\u200C\u06CC \u0639\u0645\u0648\u0645\u06CC \u06A9\u0627\u0646\u0627\u0644 \u062E\u0648\u0627\u0646\u062F\u0647 \u0646\u0634\u062F" };
  const msgs = res.messages.slice().sort((a, b) => Number(a.id) - Number(b.id));
  const rows = (await env.DB.prepare("SELECT src_id, tg_msg, hash, has_media FROM ea_mirror WHERE channel_id=?").bind(ch.id).all()).results;
  const byId = new Map(rows.map((r) => [r.src_id, r]));
  let thread = await topicFor(env, ch.user_id, cfg, ch), ops = 0;
  const dest = () => ({ chat: cfg.chat, thread: thread || void 0 });
  const del2 = async (mid) => {
    await tg(env, "deleteMessage", { chat_id: cfg.chat, message_id: mid }).catch(() => null);
  };
  const post = async (m) => {
    let file = null, note = "";
    const wantVideo = !!m.videoUrl, wantImage = !!m.image;
    try {
      if (wantVideo) file = await load(env, m, "video");
      else if (wantImage) file = await load(env, m, "image");
    } catch (e) {
      if (wantVideo && wantImage) {
        try {
          file = await load(env, m, "image");
          note = "\n\u{1F39E} (\u0648\u06CC\u062F\u06CC\u0648 \u0628\u0632\u0631\u06AF/\u0646\u0627\u0642\u0627\u0628\u0644\u200C\u062F\u0627\u0646\u0644\u0648\u062F \u0628\u0648\u062F\u061B \u0641\u0642\u0637 \u062A\u0635\u0648\u06CC\u0631)";
        } catch {
        }
      }
      if (!file) note = "\n\u{1F4CE} (\u0631\u0633\u0627\u0646\u0647\u200C\u06CC \u0627\u06CC\u0646 \u067E\u06CC\u0627\u0645 \u0628\u0627\u0631\u06AF\u06CC\u0631\u06CC \u0646\u0634\u062F \u2014 \u0627\u0632 \xAB\u0627\u0635\u0644 \u067E\u06CC\u0627\u0645\xBB \u0628\u0628\u06CC\u0646\u06CC\u062F)";
    }
    const text = ((m.text || "") + note).trim();
    const kb = linkKb(env, name, m.id);
    const attempt = () => sendCopy(env, dest(), { kind: file ? "file" : "text", text: file ? text.slice(0, 1e3) : text || "\u2026", file_id: "", file_name: file?.name || "" }, file, kb);
    try {
      return { id: await attempt(), media: !!file };
    } catch (e) {
      if (gone(e.message)) {
        thread = await topicFor(env, ch.user_id, cfg, ch, true);
        return { id: await attempt(), media: !!file };
      }
      throw e;
    }
  };
  const minId = msgs.length ? Number(msgs[0].id) : 0, ids = new Set(msgs.map((m) => Number(m.id)));
  let pendingWork = false;
  for (const r of rows) {
    if (r.src_id >= minId && !ids.has(r.src_id)) {
      if (ops >= budget) {
        pendingWork = true;
        break;
      }
      ops++;
      if (r.tg_msg) await del2(r.tg_msg);
      await env.DB.prepare("DELETE FROM ea_mirror WHERE channel_id=? AND src_id=?").bind(ch.id, r.src_id).run();
    }
  }
  for (const m of msgs) {
    const sid = Number(m.id), row = byId.get(sid), h = msgHash(m);
    if (row && row.hash === h) continue;
    if (ops >= budget) {
      pendingWork = true;
      break;
    }
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
            await tg(env, media ? "editMessageCaption" : "editMessageText", { chat_id: cfg.chat, message_id: row.tg_msg, ...media ? { caption: (m.text || "").slice(0, 1e3) } : { text: (m.text || "\u2026").slice(0, 4e3), disable_web_page_preview: true }, reply_markup: linkKb(env, name, m.id) });
            done = true;
          } catch (e) {
            if (/not modified/i.test(e.message)) done = true;
          }
        }
        if (done) await env.DB.prepare("UPDATE ea_mirror SET hash=?, updated_at=? WHERE channel_id=? AND src_id=?").bind(h, now(), ch.id, sid).run();
        else {
          if (row.tg_msg) await del2(row.tg_msg);
          const p = await post(m);
          await env.DB.prepare("UPDATE ea_mirror SET tg_msg=?, hash=?, has_media=?, updated_at=? WHERE channel_id=? AND src_id=?").bind(p.id, h, p.media ? 1 : 0, now(), ch.id, sid).run();
        }
      }
    } catch (e) {
      console.error("mirror", ch.id, m.id, e.message);
      await kvSet(env, `mirr:err:${ch.id}`, e.message.slice(0, 200));
    }
  }
  return { ops, done: !pendingWork, error: "" };
}
async function syncMirrors(env) {
  const t = now();
  const users = (await env.DB.prepare("SELECT k FROM ea_kv WHERE k LIKE 'grp:%'").all()).results.map((r) => Number(r.k.slice(4)));
  let best = null;
  for (const uid of users) {
    const chans = (await env.DB.prepare("SELECT id, user_id, title, chat_id FROM ea_channels WHERE user_id=?").bind(uid).all()).results;
    for (const ch2 of chans) {
      if (!await mirrorOn(env, ch2.id) || !await usernameOf(env, ch2)) continue;
      const last = Number(await kvGet(env, `mirr:last:${ch2.id}`) || 0), due = Number(await kvGet(env, `mirr:due:${ch2.id}`) || 0);
      const wait = Number(await kvGet(env, `mirr:wait:${ch2.id}`) || 0);
      if (wait > t) continue;
      const score = !last ? 1e9 : due && due <= t ? 1e8 + (t - due) : t - last >= EVERY ? t - last : 0;
      if (score > 0 && (!best || score > best.score)) best = { ch: ch2, score };
    }
  }
  if (!best) return;
  const { ch } = best;
  try {
    const r = await syncChannel(env, ch);
    if (r.error) {
      await kvSet(env, `mirr:wait:${ch.id}`, String(t + 900));
      if (!await kvGet(env, `mirr:errsay:${ch.id}`)) {
        await kvSet(env, `mirr:errsay:${ch.id}`, String(t));
        await report(env, ch.user_id, `\u{1FA9E} \u0622\u06CC\u0646\u0647\u200C\u06CC \u06A9\u0627\u0646\u0627\u0644 \xAB${esc(ch.title)}\xBB \u0633\u0627\u062E\u062A\u0647 \u0646\u0634\u062F: ${esc(r.error)}
\u06A9\u0627\u0646\u0627\u0644 \u0628\u0627\u06CC\u062F \u0639\u0645\u0648\u0645\u06CC \u0628\u0627\u0634\u062F \u0648 \u0646\u0627\u0645 \u06A9\u0627\u0631\u0628\u0631\u06CC\u200C\u0627\u0634 \u062F\u0631\u0633\u062A \u062B\u0628\u062A \u0634\u0648\u062F (\u06A9\u0627\u0646\u0627\u0644\u200C\u0647\u0627 \u2190 \u06A9\u0627\u0646\u0627\u0644 \u2190 \u{1F517} \u0646\u0627\u0645 \u06A9\u0627\u0631\u0628\u0631\u06CC \u0628\u0631\u0627\u06CC \u0622\u06CC\u0646\u0647).`, void 0, false);
      }
      return;
    }
    await kvDel(env, `mirr:errsay:${ch.id}`);
    if (r.done) {
      await kvSet(env, `mirr:last:${ch.id}`, String(t));
      await kvDel(env, `mirr:due:${ch.id}`);
    }
  } catch (e) {
    console.error("syncMirrors", e.message);
    await kvSet(env, `mirr:wait:${ch.id}`, String(t + 300));
  }
}

// eitaa-src/scheduler.ts
var sleep2 = (ms) => new Promise((r) => setTimeout(r, ms));
var MAX_IMG2 = 15 * 1024 * 1024;
var MAX_VIDEO2 = 45 * 1024 * 1024;
async function fileBytes(env, p) {
  if (p.src_url) {
    const isVideo = /\.(mp4|mov|webm|mkv)$/i.test(p.file_name) || /\.(mp4|mov|webm)(\?|$)/i.test(p.src_url);
    const f = await fetchBytes(p.src_url, isVideo ? MAX_VIDEO2 : MAX_IMG2, eitaaWeb(env) + "/");
    return { bytes: f.bytes, name: isVideo ? p.file_name || "video.mp4" : p.file_name || `image.${extFor(f.type, p.src_url)}` };
  }
  return { bytes: await download(env, p.file_id), name: p.file_name || "file" };
}
function imageSize(b) {
  if (b.length > 24 && b[0] === 137 && b[1] === 80) return { w: b[16] << 24 | b[17] << 16 | b[18] << 8 | b[19], h: b[20] << 24 | b[21] << 16 | b[22] << 8 | b[23] };
  if (b.length > 10 && b[0] === 71 && b[1] === 73) return { w: b[6] | b[7] << 8, h: b[8] | b[9] << 8 };
  if (b.length > 30 && b[0] === 82 && b[8] === 87) {
    const k = String.fromCharCode(b[12], b[13], b[14], b[15]);
    if (k === "VP8X") return { w: 1 + (b[24] | b[25] << 8 | b[26] << 16), h: 1 + (b[27] | b[28] << 8 | b[29] << 16) };
    if (k === "VP8 ") return { w: (b[26] | b[27] << 8) & 16383, h: (b[28] | b[29] << 8) & 16383 };
    if (k === "VP8L") return { w: 1 + ((b[22] & 63) << 8 | b[21]), h: 1 + ((b[24] & 15) << 10 | b[23] << 2 | (b[22] & 192) >> 6) };
  }
  if (b.length > 4 && b[0] === 255 && b[1] === 216) {
    let i = 2;
    while (i + 9 < b.length) {
      if (b[i] !== 255) {
        i++;
        continue;
      }
      const m = b[i + 1];
      if (m >= 192 && m <= 207 && m !== 196 && m !== 200 && m !== 204) return { h: b[i + 5] << 8 | b[i + 6], w: b[i + 7] << 8 | b[i + 8] };
      i += 2 + (b[i + 2] << 8 | b[i + 3]);
    }
  }
  return null;
}
function mediaProblem(bytes, name) {
  const isVideo = /\.(mp4|mov|webm|m4v|mkv)$/i.test(name), isImg = /\.(jpe?g|png|webp|gif)$/i.test(name);
  if (bytes.length < 1500) return isVideo ? "\u0641\u0627\u06CC\u0644 \u0648\u06CC\u062F\u06CC\u0648 \u0646\u0627\u0642\u0635 \u06CC\u0627 \u062E\u0631\u0627\u0628 \u0627\u0633\u062A" : "\u0641\u0627\u06CC\u0644 \u062E\u06CC\u0644\u06CC \u06A9\u0648\u0686\u06A9 \u06CC\u0627 \u062E\u0631\u0627\u0628 \u0627\u0633\u062A";
  if (isImg) {
    const z = imageSize(bytes);
    if (z && (z.w < 160 || z.h < 160)) return `\u0639\u06A9\u0633 \u062E\u06CC\u0644\u06CC \u06A9\u0648\u0686\u06A9 \u0627\u0633\u062A (${z.w}\xD7${z.h}) \u0648 \u06A9\u06CC\u0641\u06CC\u062A\u0634 \u067E\u0627\u06CC\u06CC\u0646 \u0627\u0633\u062A`;
  }
  return null;
}
async function loadMedia(env, p) {
  let last = new Error("\u062F\u0627\u0646\u0644\u0648\u062F \u0646\u0634\u062F");
  for (let i = 0; i < 3; i++) {
    try {
      return await fileBytes(env, p);
    } catch (e) {
      last = e;
      if (i < 2) await sleep2(1500 * (i + 1));
    }
  }
  throw last;
}
async function sendOnce(env, token, p, ch, file) {
  const o = { title: p.title || void 0, silent: !!p.silent, pin: !!p.pin, viewDelete: p.view_delete || void 0 };
  const res = p.kind === "text" || !file ? await sendMessage(env, token, ch.chat_id, p.text, o) : await sendFile(env, token, ch.chat_id, file.name, file.bytes, p.text, o);
  const id = res && (res.message_id ?? res.id ?? res.result?.message_id);
  return id ? String(id) : "";
}
var handlesOf = (s) => [...(s || "").matchAll(/@([A-Za-z0-9_]{4,})/g)].map((m) => m[1]);
async function hold(env, p, why, kind) {
  const reason = why.join(" \xB7 ").slice(0, 300);
  await env.DB.prepare("UPDATE ea_posts SET status='held', error=? WHERE id=?").bind(reason, p.id).run();
  await removeFromGroup(env, p.id);
  await setVerdict(env, p.id, p.user_id, kind === "media" ? "held_media" : "held", reason);
  const preview = esc((p.text || (p.kind === "file" ? "\u{1F4CE} " + p.file_name : "")).slice(0, 220));
  const head = kind === "media" ? "\u26A0\uFE0F \u0631\u0633\u0627\u0646\u0647\u200C\u06CC \u067E\u0633\u062A \u0622\u0645\u0627\u062F\u0647 \u0646\u06CC\u0633\u062A" : "\u{1F6D1} \u0646\u0627\u0638\u0631 \u067E\u0633\u062A \u0631\u0627 \u0646\u06AF\u0647 \u062F\u0627\u0634\u062A";
  const msg = `${head} \xB7 #${p.id}

${why.map((x) => "\u2022 " + esc(x)).join("\n")}

<i>${preview}</i>

\u0686\u06CC\u0632\u06CC \u062F\u0631 \u0627\u06CC\u062A\u0627 \u0627\u0631\u0633\u0627\u0644 \u0646\u0634\u062F. \u062A\u0635\u0645\u06CC\u0645 \u0628\u0627 \u0634\u0645\u0627\u0633\u062A \u{1F447}`;
  const rows = [[["\u270F\uFE0F \u062A\u0635\u062D\u06CC\u062D", `pm:fix:${p.id}`], ["\u{1F5BC} \u0627\u0641\u0632\u0648\u062F\u0646 \u0639\u06A9\u0633/\u0648\u06CC\u062F\u06CC\u0648", `pm:media:${p.id}`]], [[kind === "media" ? "\u{1F4DD} \u0627\u0631\u0633\u0627\u0644 \u0641\u0642\u0637 \u0645\u062A\u0646" : "\u{1F680} \u0627\u0631\u0633\u0627\u0644 \u0628\u0627 \u0647\u0645\u06CC\u0646 \u0648\u0636\u0639\u06CC\u062A", `pm:force:${p.id}`], ["\u{1F5D1} \u062D\u0630\u0641", `pm:del:${p.id}`]]];
  await report(env, p.user_id, msg, void 0, false);
  await send(env, p.user_id, msg, ikb(rows));
  if (kind === "review") await enqueue(env, p.user_id, "held", { id: p.id, problems: why }).catch(() => null);
}
async function gate(env, p, ch, file) {
  const grp = await getGroup(env, p.user_id);
  if (!grp) return p;
  try {
    await postToGroup(env, p.user_id, p.id, p, file);
  } catch (e) {
    await send(env, p.user_id, `\u26A0\uFE0F \u0627\u0631\u0633\u0627\u0644 \u067E\u0633\u062A #${p.id} \u0628\u0647 \u06AF\u0631\u0648\u0647 \u0646\u0627\u0645\u0648\u0641\u0642 \u0628\u0648\u062F (${esc(e.message)}). \u0631\u0628\u0627\u062A \u0628\u0627\u06CC\u062F \u062F\u0631 \u06AF\u0631\u0648\u0647 \u0627\u062F\u0645\u06CC\u0646 \u0628\u0627\u0634\u062F. \u067E\u0633\u062A \u0628\u062F\u0648\u0646 \u0646\u0645\u0627\u06CC\u0634 \u062F\u0631 \u06AF\u0631\u0648\u0647 \u0627\u062F\u0627\u0645\u0647 \u0645\u06CC\u200C\u06CC\u0627\u0628\u062F.`);
  }
  const pub = await getPub(env, p.id);
  if (!grp.review || pub?.verdict === "forced") return p;
  const job = p.job_id ? await env.DB.prepare("SELECT instruction, footer FROM agent_jobs WHERE id=?").bind(p.job_id).first() : null;
  const ownLine = job?.footer || (ch.chat_id && !/^-?\d+$/.test(ch.chat_id) ? "@" + ch.chat_id.replace(/^@/, "") : "");
  const own = [...handlesOf(ownLine), ch.chat_id.replace(/^@/, "")].filter(Boolean);
  const r = await reviewText(env, p.user_id, p.text, { own, ownLine, task: job?.instruction || "", hasMedia: p.kind === "file" || !!p.src_url, agent: !!p.job_id });
  if (r.action === "hold") {
    await hold(env, { ...p, text: r.text }, r.problems.length ? r.problems : ["\u0627\u06CC\u0631\u0627\u062F \u0646\u0627\u0645\u0634\u062E\u0635"], "review");
    return null;
  }
  if (r.action === "fixed") {
    await env.DB.prepare("UPDATE ea_posts SET text=? WHERE id=?").bind(r.text, p.id).run();
    const q = { ...p, text: r.text };
    await removeFromGroup(env, p.id);
    try {
      await postToGroup(env, p.user_id, p.id, q, file);
    } catch {
    }
    await setVerdict(env, p.id, p.user_id, "fixed", r.problems.join(" \xB7 "));
    await enqueue(env, p.user_id, "fixed", { id: p.id, problems: r.problems }).catch(() => null);
    await report(env, p.user_id, `\u{1F6E1} <b>\u0646\u0627\u0638\u0631</b> \xB7 \u067E\u0633\u062A #${p.id} \u0627\u06CC\u0631\u0627\u062F \u062F\u0627\u0634\u062A \u0648 \u0627\u0635\u0644\u0627\u062D \u0634\u062F (\u0646\u0633\u062E\u0647\u200C\u06CC \u0642\u0628\u0644\u06CC \u0627\u0632 \u06AF\u0631\u0648\u0647 \u067E\u0627\u06A9 \u0634\u062F\u061B \u0646\u0633\u062E\u0647\u200C\u06CC \u062F\u0631\u0633\u062A \u0627\u0648\u0644 \u062F\u0631 \u06AF\u0631\u0648\u0647\u060C \u0628\u0639\u062F \u062F\u0631 \u0627\u06CC\u062A\u0627):
${r.problems.map((x) => "\u2022 " + esc(x)).join("\n") || "\u2022 \u0627\u0635\u0644\u0627\u062D \u062C\u0632\u0626\u06CC"}`);
    return q;
  }
  await setVerdict(env, p.id, p.user_id, "ok");
  if (r.problems.length) await report(env, p.user_id, `\u{1F6E1} <b>\u0646\u0627\u0638\u0631</b> \xB7 \u067E\u0633\u062A #${p.id} \u0628\u0627 \u06CC\u0627\u062F\u062F\u0627\u0634\u062A \u062A\u0623\u06CC\u06CC\u062F \u0634\u062F:
${r.problems.map((x) => "\u2022 " + esc(x)).join("\n")}`);
  return p;
}
async function deliver(env, postId, quiet = false) {
  const claim = await env.DB.prepare("UPDATE ea_posts SET status='sending', claimed_at=? WHERE id=? AND status='pending'").bind(now(), postId).run();
  if (!claim.meta.changes) return;
  let p = await env.DB.prepare("SELECT * FROM ea_posts WHERE id=?").bind(postId).first();
  const user = await env.DB.prepare("SELECT * FROM ea_users WHERE id=?").bind(p.user_id).first();
  const ch = await env.DB.prepare("SELECT * FROM ea_channels WHERE id=?").bind(p.channel_id).first();
  const fail = async (msg) => {
    await env.DB.prepare("UPDATE ea_posts SET status='failed', error=? WHERE id=?").bind(msg.slice(0, 300), p.id).run();
    await markGroup(env, p.id, "\u274C \u0646\u0627\u0645\u0648\u0641\u0642");
    if (!quiet) await send(env, p.user_id, `\u274C \u0627\u0631\u0633\u0627\u0644 \u067E\u0633\u062A #${p.id} \u0646\u0627\u0645\u0648\u0641\u0642 \u0628\u0648\u062F:
${esc(msg)}${ch ? `

\u{1F194} \u0634\u0646\u0627\u0633\u0647\u200C\u06CC \u06A9\u0627\u0646\u0627\u0644\u0650 \u0627\u0631\u0633\u0627\u0644\u200C\u0634\u062F\u0647: <code>${esc(ch.chat_id)}</code>` : ""}`, { inline_keyboard: [[{ text: "\u{1F501} \u0627\u0631\u0633\u0627\u0644 \u0645\u062C\u062F\u062F", callback_data: `sp:rt:${p.id}` }], ...p.channel_id ? [[{ text: "\u{1F9EA} \u0622\u0632\u0645\u0627\u06CC\u0634/\u062A\u063A\u06CC\u06CC\u0631 \u0634\u0646\u0627\u0633\u0647\u200C\u06CC \u06A9\u0627\u0646\u0627\u0644", callback_data: `ch:v:${p.channel_id}` }]] : []] });
  };
  if (!user || !ch) return fail("\u06A9\u0627\u0631\u0628\u0631 \u06CC\u0627 \u06A9\u0627\u0646\u0627\u0644 \u062F\u06CC\u06AF\u0631 \u0648\u062C\u0648\u062F \u0646\u062F\u0627\u0631\u062F.");
  const token = await dec(env.SECRET_KEY, user.eitaa_token_enc);
  if (!token) return fail("\u062A\u0648\u06A9\u0646 \u0627\u06CC\u062A\u0627\u06CC\u0627\u0631 \u062B\u0628\u062A \u0646\u0634\u062F\u0647 \u06CC\u0627 \u0646\u0627\u0645\u0639\u062A\u0628\u0631 \u0627\u0633\u062A. \u0622\u0646 \u0631\u0627 \u062F\u0648\u0628\u0627\u0631\u0647 \u062F\u0631 \xAB\u0628\u0631\u0646\u0627\u0645\u0647\u200C\u0647\u0627\u06CC \u0645\u062A\u0635\u0644\xBB \u062B\u0628\u062A \u06A9\u0646\u06CC\u062F.");
  let file = null;
  if (p.kind === "file") {
    try {
      file = await loadMedia(env, p);
    } catch (e) {
      if (p.src_url) return hold(env, p, [`\u062F\u0627\u0646\u0644\u0648\u062F \u0639\u06A9\u0633/\u0648\u06CC\u062F\u06CC\u0648\u06CC \u0645\u0646\u0628\u0639 \u0646\u0627\u0645\u0648\u0641\u0642 \u0628\u0648\u062F (${e.message})`], "media");
      return fail(e.message);
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
      await markGroup(env, p.id, "\u2705 \u062F\u0631 \u0627\u06CC\u062A\u0627");
      if (!quiet) await send(env, p.user_id, `\u2705 \u067E\u0633\u062A #${p.id} \u062F\u0631 \u{1F7E0} \xAB${esc(ch.title)}\xBB \u0627\u0631\u0633\u0627\u0644 \u0634\u062F.`);
      return;
    } catch (e) {
      last = e.message;
      if (!(e instanceof EitaaNetworkError) || attempt === 2) break;
      await sleep2(2e3 * (attempt + 1));
    }
  }
  await fail(last || "\u062E\u0637\u0627\u06CC \u0646\u0627\u0645\u0634\u062E\u0635");
}
async function tick(env) {
  const t = now();
  await env.DB.prepare("UPDATE ea_posts SET status='failed', error='\u0627\u0631\u0633\u0627\u0644 \u0646\u06CC\u0645\u0647\u200C\u06A9\u0627\u0631\u0647 \u0645\u0627\u0646\u062F\u061B \u0644\u0637\u0641\u0627\u064B \u062F\u0648\u0628\u0627\u0631\u0647 \u0632\u0645\u0627\u0646\u200C\u0628\u0646\u062F\u06CC \u06A9\u0646\u06CC\u062F.' WHERE status='sending' AND claimed_at < ?").bind(t - 900).run();
  const due = (await env.DB.prepare("SELECT id FROM ea_posts WHERE status='pending' AND run_at<=? ORDER BY run_at LIMIT 3").bind(t).all()).results;
  for (const d of due) {
    try {
      await deliver(env, d.id);
    } catch (e) {
      console.error("deliver failed", d.id, e.message);
    }
  }
  try {
    await agentTick(env);
  } catch (e) {
    console.error("agent tick failed", e.message);
  }
}

// eitaa-src/chat.ts
var MAX_STEPS2 = 6;
var BUDGET_MS = 42e3;
var STEP_TIMEOUT_MS = 2e4;
var HIST_KEEP = 6;
var INTRO = "\u{1F4AC} <b>\u06AF\u0641\u062A\u06AF\u0648\u06CC \u0632\u0646\u062F\u0647 \u0628\u0627 \u0627\u06CC\u062C\u0646\u062A</b>\n\n\u0647\u0631 \u0686\u0647 \u0645\u06CC\u200C\u062E\u0648\u0627\u0647\u06CC\u062F \u0628\u0646\u0648\u06CC\u0633\u06CC\u062F\u061B \u0647\u0645\u0627\u0646 \u0644\u062D\u0638\u0647 \u0627\u0646\u062C\u0627\u0645 \u0645\u06CC\u200C\u062F\u0647\u062F \u0648 \u0646\u062A\u06CC\u062C\u0647\u200C\u06CC \u0648\u0627\u0642\u0639\u06CC \u0631\u0627 \u0645\u06CC\u200C\u06AF\u0648\u06CC\u062F. \u0645\u062B\u0644\u0627\u064B:\n\u2022 <i>\u0628\u0631\u0627\u06CC \u062A\u0633\u062A \u06CC\u06A9 \xAB\u0633\u0644\u0627\u0645\xBB \u062A\u0648\u06CC \u06A9\u0627\u0646\u0627\u0644\u0645 \u0628\u0641\u0631\u0633\u062A</i>\n\u2022 <i>\u0627\u0632 \u06A9\u0627\u0646\u0627\u0644 @name \u0622\u062E\u0631\u06CC\u0646 \u067E\u0633\u062A\u200C\u0647\u0627 \u0631\u0627 \u0646\u0634\u0627\u0646\u0645 \u0628\u062F\u0647</i>\n\u2022 <i>\u0627\u0632 @name \u06CC\u06A9 \u0627\u0633\u062A\u06CC\u06A9\u0631 \u062A\u0642\u0648\u06CC\u0645 \u067E\u06CC\u062F\u0627 \u06A9\u0646 \u0648 \u0628\u0641\u0631\u0633\u062A</i>\n\u2022 <i>\u0641\u0631\u062F\u0627 \u0633\u0627\u0639\u062A \u06F9 \u0627\u06CC\u0646 \u0645\u062A\u0646 \u0631\u0627 \u0628\u06AF\u0630\u0627\u0631: \u2026</i>\n\n\u062E\u0631\u0648\u062C: /cancel \u06CC\u0627 \u0647\u0631 \u062F\u06A9\u0645\u0647\u200C\u06CC \u0645\u0646\u0648.";
async function start(env, u) {
  if (!await llmReady(env)) return void await send(env, u.id, "\u23F3 \u0627\u06CC\u062C\u0646\u062A \u0647\u0646\u0648\u0632 \u0641\u0639\u0627\u0644 \u0646\u0634\u062F\u0647 \u0627\u0633\u062A (\u0628\u0627\u06CC\u0646\u062F\u06CC\u0646\u06AF AI \u062F\u0631 wrangler.jsonc \u0641\u0639\u0627\u0644 \u0646\u06CC\u0633\u062A).");
  if (!u.eitaa_token_enc) return void await send(env, u.id, "\u0627\u0628\u062A\u062F\u0627 \u0627\u0632 \xAB\u0628\u0631\u0646\u0627\u0645\u0647\u200C\u0647\u0627\u06CC \u0645\u062A\u0635\u0644\xBB \u062A\u0648\u06A9\u0646 \u0627\u06CC\u062A\u0627\u06CC\u0627\u0631 \u0631\u0627 \u062B\u0628\u062A \u06A9\u0646\u06CC\u062F.");
  if (!(await userChannels(env, u.id)).length) return void await send(env, u.id, "\u0627\u0628\u062A\u062F\u0627 \u0627\u0632 \xAB\u06A9\u0627\u0646\u0627\u0644\u200C\u0647\u0627\xBB \u06A9\u0627\u0646\u0627\u0644 \u062E\u0648\u062F\u062A\u0627\u0646 \u0631\u0627 \u0627\u0636\u0627\u0641\u0647 \u06A9\u0646\u06CC\u062F.");
  await setSession(env, u.id, "chat", { hist: [], last_mid: 0, busy_until: 0 });
  await send(env, u.id, INTRO);
}
var TOOLS3 = [
  { type: "function", function: {
    name: "read_channel",
    description: "Latest posts of a PUBLIC Eitaa channel (@id), newest first, short previews (ref, text; image/sticker=1).",
    parameters: { type: "object", properties: { channel: { type: "string" } }, required: ["channel"] }
  } },
  { type: "function", function: {
    name: "send_to_me",
    description: 'Show/send something to HIM in this Telegram chat (NOT to any channel): use for "show me / send me / \u0628\u0631\u0627\u0645 \u0628\u0641\u0631\u0633\u062A / \u0646\u0634\u0627\u0646\u0645 \u0628\u062F\u0647". Pass from_ref (full post text) and/or image_ref, or your own text.',
    parameters: { type: "object", properties: { text: { type: "string" }, from_ref: { type: "string" }, image_ref: { type: "string" }, video_ref: { type: "string" } } }
  } },
  { type: "function", function: {
    name: "post_to_channel",
    description: 'PUBLISH to one of HIS OWN channels NOW, only when he explicitly asks to post/publish/send something into his channel (\u06A9\u0627\u0646\u0627\u0644\u0645). Never for "send me". The text must be real post content, never an instruction (real result is returned). To forward a source post pass from_ref: the system copies its full text AND its photo/video automatically (video_ref/image_ref only to take media from another post; for a sticker omit text).',
    parameters: { type: "object", properties: { text: { type: "string" }, from_ref: { type: "string" }, image_ref: { type: "string" }, video_ref: { type: "string" }, channel_id: { type: "integer", description: "optional if he has one channel" } } }
  } },
  { type: "function", function: {
    name: "schedule_post",
    description: 'Schedule a text post. when: "18:30", "\u0641\u0631\u062F\u0627 09:00", "+45" (minutes), "1405/07/20 18:30" (Tehran).',
    parameters: { type: "object", properties: { text: { type: "string" }, when: { type: "string" }, channel_id: { type: "integer" } }, required: ["text", "when"] }
  } }
];
async function turn2(c, user, m, text, data) {
  const { env } = c, uid = user.id, t0 = Date.now();
  if (!text) return void await send(env, uid, "\u062F\u0631 \u06AF\u0641\u062A\u06AF\u0648 \u0641\u0639\u0644\u0627\u064B \u0641\u0642\u0637 \u067E\u06CC\u0627\u0645 \u0645\u062A\u0646\u06CC \u0645\u06CC\u200C\u0641\u0647\u0645\u0645. (\u0628\u0631\u0627\u06CC \u0627\u0631\u0633\u0627\u0644 \u0641\u0627\u06CC\u0644 \u0627\u0632 \xAB\u270D\uFE0F \u067E\u0633\u062A \u062C\u062F\u06CC\u062F\xBB \u0627\u0633\u062A\u0641\u0627\u062F\u0647 \u06A9\u0646\u06CC\u062F.)");
  if (m.message_id <= (data.last_mid || 0)) return;
  if ((data.busy_until || 0) > now()) return void await send(env, uid, "\u23F3 \u0647\u0646\u0648\u0632 \u062F\u0627\u0631\u0645 \u067E\u06CC\u0627\u0645 \u0642\u0628\u0644\u06CC \u0631\u0627 \u0627\u0646\u062C\u0627\u0645 \u0645\u06CC\u200C\u062F\u0647\u0645\u061B \u0686\u0646\u062F \u062B\u0627\u0646\u06CC\u0647 \u0635\u0628\u0631 \u06A9\u0646\u06CC\u062F.");
  await setSession(env, uid, "chat", { ...data, last_mid: m.message_id, busy_until: now() + 70 });
  await typing(env, uid);
  const mid = await send(env, uid, "\u{1F914} \u2026");
  const show2 = (t) => mid ? edit(env, uid, mid, t) : Promise.resolve();
  const chans = await userChannels(env, uid);
  const st = { channels: /* @__PURE__ */ new Map(), refs: /* @__PURE__ */ new Map() };
  const tnow = now(), l = toLocal(tnow);
  const system = `LIVE CHAT RULES. You are the live assistant of an Eitaa channel owner; chat in Persian, briefly. Act with tools immediately when he clearly asks (send, test message, read a channel, forward a sticker\u2026); ask ONE short question only if something essential is missing. IMPORTANT: "\u0628\u0631\u0627\u0645/\u0648\u0627\u0633\u0645/\u0628\u0647\u0645/\u0646\u0634\u0627\u0646\u0645 \u0628\u062F\u0647/\u0628\u0647 \u0645\u0646 \u0628\u0641\u0631\u0633\u062A" = show it to HIM in this chat \u2192 read_channel then send_to_me. Use post_to_channel ONLY when he clearly says to put/post/send into HIS channel (\u06A9\u0627\u0646\u0627\u0644\u0645\u060C \u062A\u0648\u06CC \u06A9\u0627\u0646\u0627\u0644 \u0645\u0646). A channel he merely names (@x) is a source to read, not a destination. Post exactly the text he asks, no signature unless asked. Only PUBLIC channels he names can be read (no global search). Use from_ref/image_ref to forward posts instead of retyping. Today (Tehran): ${jalaliLong(tnow)} | ${l.y}-${pad2(l.mo)}-${pad2(l.d)} ${pad2(l.h)}:${pad2(l.mi)}
HIS CHANNELS: ${chans.map((x) => `id=${x.id} \xAB${x.title}\xBB (@${x.chat_id})`).join("; ")}`;
  const hist = Array.isArray(data.hist) ? data.hist : [];
  const messages = [{ role: "system", content: system }, ...hist.map((h) => ({ role: h.r === "u" ? "user" : "assistant", content: h.t })), { role: "user", content: text }];
  const pick = (id) => {
    if (id === void 0 || id === null || id === "") return chans.length === 1 ? chans[0] : "specify channel_id (he has several channels: ask him which one)";
    return chans.find((x) => x.id === Number(id)) || "unknown channel_id";
  };
  const insert = async (ch, kind, body, file, name, runAt) => (await env.DB.prepare("INSERT INTO ea_posts(user_id,channel_id,kind,text,file_id,file_name,title,silent,pin,view_delete,run_at,status,created_at,src_url) VALUES(?,?,?,?,'',?,'',0,0,0,?,'pending',?,?)").bind(uid, ch.id, kind, body, name, runAt, now(), file).run()).meta.last_row_id;
  const toMe = /(واسم|برام|برایم|بهم|نشانم|نشونم|به من|برای من|بفرست برام)/.test(text) && !/(کانالم|کانال من|کانال خودم|داخل کانال من|توی کانال من)/.test(text);
  const tools = toMe ? TOOLS3.filter((x) => x.function.name !== "post_to_channel" && x.function.name !== "schedule_post") : TOOLS3;
  const notes = [];
  const exec = async (name, a) => {
    switch (name) {
      case "read_channel": {
        await show2(`\u{1F50E} \u062F\u0631 \u062D\u0627\u0644 \u062E\u0648\u0627\u0646\u062F\u0646 @${esc(String(a.channel || ""))}\u2026`);
        return readChannel(env, st, a, null, 4);
      }
      case "send_to_me": {
        const p = resolvePost(st, a, "");
        if ("error" in p) return { status: "failed", error: p.error };
        const caption = p.text.slice(0, 1e3);
        try {
          if (p.kind === "sticker") await tg(env, "sendSticker", { chat_id: uid, sticker: p.media });
          else if (p.kind === "video") await tg(env, "sendVideo", { chat_id: uid, video: p.media, caption });
          else if (p.kind === "image") await tg(env, "sendPhoto", { chat_id: uid, photo: p.media, caption });
          else await send(env, uid, esc(p.text));
          if (p.kind !== "none" && p.kind !== "sticker" && p.text.length > 1e3) await send(env, uid, esc(p.text));
        } catch (e) {
          if (p.text) await send(env, uid, esc(p.text) + (p.media ? `

\u{1F517} ${esc(p.media)}` : ""));
          else return { status: "failed", error: e.message };
        }
        notes.push("\u{1F4E8} \u0628\u0631\u0627\u06CC \u0634\u0645\u0627 \u0641\u0631\u0633\u062A\u0627\u062F\u0647 \u0634\u062F.");
        return { status: "sent_to_user" };
      }
      case "post_to_channel": {
        const ch = pick(a.channel_id);
        if (typeof ch === "string") return { status: "failed", error: ch };
        const p = resolvePost(st, a, "");
        if ("error" in p) return { status: "failed", error: p.error };
        await show2(`\u{1F4E4} \u062F\u0631 \u062D\u0627\u0644 \u0627\u0631\u0633\u0627\u0644 \u0628\u0647 \xAB${esc(ch.title)}\xBB\u2026`);
        const ids = await insertResolved(env, { userId: uid, channelId: ch.id, jobId: null, status: "pending", runAt: now() }, p);
        for (const id of ids) await deliver(env, id, true);
        const rs = (await env.DB.prepare(`SELECT status, error FROM ea_posts WHERE id IN (${ids.join(",")})`).all()).results;
        const bad = rs.find((x) => x.status !== "sent");
        const r = bad || rs[0];
        const ok = !bad && rs.length > 0;
        notes.push(ok ? `\u2705 ${p.kind === "sticker" ? "\u0627\u0633\u062A\u06CC\u06A9\u0631" : p.kind === "video" ? "\u0648\u06CC\u062F\u06CC\u0648" : p.kind === "image" ? "\u0639\u06A9\u0633" : "\u067E\u06CC\u0627\u0645"} \u062F\u0631 \xAB${esc(ch.title)}\xBB \u0627\u0631\u0633\u0627\u0644 \u0634\u062F.` : `\u274C \u0627\u0631\u0633\u0627\u0644 \u0628\u0647 \xAB${esc(ch.title)}\xBB \u0646\u0634\u062F: ${esc(r?.error || "\u062E\u0637\u0627\u06CC \u0646\u0627\u0645\u0634\u062E\u0635")}`);
        return ok ? { status: "sent" } : { status: "failed", error: r?.error || "unknown error" };
      }
      case "schedule_post": {
        const ch = pick(a.channel_id);
        if (typeof ch === "string") return { status: "failed", error: ch };
        const at = parseWhen(String(a.when || ""));
        const body = String(a.text || "").trim();
        if (at === null) return { status: "failed", error: "invalid or past time; use 18:30, \u0641\u0631\u062F\u0627 09:00, +45, 1405/07/20 18:30" };
        if (!body || body.length > 3900) return { status: "failed", error: "empty or too long text" };
        await insert(ch, "text", body, "", "", at);
        notes.push(`\u23F0 \u0628\u0631\u0627\u06CC ${fmtDt(at)} (\u0648\u0642\u062A \u062A\u0647\u0631\u0627\u0646) \u062F\u0631 \xAB${esc(ch.title)}\xBB \u0632\u0645\u0627\u0646\u200C\u0628\u0646\u062F\u06CC \u0634\u062F.`);
        return { status: "scheduled" };
      }
    }
    return { error: `unknown tool ${name}` };
  };
  let answer2 = "", failedWhy = "";
  try {
    for (let step = 0; step < MAX_STEPS2; step++) {
      if (Date.now() - t0 > BUDGET_MS) {
        answer2 = "\u23F1 \u0632\u0645\u0627\u0646 \u0627\u06CC\u0646 \u062F\u0631\u062E\u0648\u0627\u0633\u062A \u062A\u0645\u0627\u0645 \u0634\u062F\u061B \u0627\u06AF\u0631 \u06A9\u0627\u0631 \u06A9\u0627\u0645\u0644 \u0646\u0634\u062F \u062F\u0648\u0628\u0627\u0631\u0647 \u0628\u06AF\u0648\u06CC\u06CC\u062F.";
        break;
      }
      const r = await chatTools(env, messages, tools, STEP_TIMEOUT_MS, 700);
      messages.push(r);
      if (!r.tool_calls?.length) {
        answer2 = esc((r.content || "").trim());
        break;
      }
      let onlyActions = true;
      for (const call2 of r.tool_calls) {
        if (call2.function.name === "read_channel") onlyActions = false;
        let out;
        try {
          out = await exec(call2.function.name, JSON.parse(call2.function.arguments || "{}"));
        } catch (e) {
          out = { error: e.message };
        }
        messages.push({ role: "tool", tool_call_id: call2.id, content: JSON.stringify(out).slice(0, 12e3) });
      }
      if (onlyActions && notes.length) {
        answer2 = (r.content ? esc(r.content.trim()) + "\n" : "") + notes.join("\n");
        break;
      }
    }
  } catch (e) {
    failedWhy = e.message;
  }
  const final = failedWhy ? `\u274C ${esc(failedWhy)}` : (notes.length && !answer2.includes(notes[0]) ? [answer2, ...notes] : [answer2 || "\u0627\u0646\u062C\u0627\u0645 \u0634\u062F."]).filter(Boolean).join("\n");
  if (mid) await edit(env, uid, mid, final.slice(0, 4e3));
  else await send(env, uid, final);
  const keep = [...hist, { r: "u", t: text.slice(0, 300) }, { r: "a", t: (failedWhy ? `(\u062E\u0637\u0627: ${failedWhy})` : notes.length ? notes.join(" ") : answer2).replace(/<[^>]+>/g, "").slice(0, 300) }].slice(-HIST_KEEP);
  const cur = await getSession(env, uid);
  if (cur.state === "chat") await setSession(env, uid, "chat", { hist: keep, last_mid: m.message_id, busy_until: 0 });
}

// eitaa-src/bot.ts
var B = { NEW: "\u270D\uFE0F \u067E\u0633\u062A \u062C\u062F\u06CC\u062F", SCHED: "\u23F0 \u0632\u0645\u0627\u0646\u200C\u0628\u0646\u062F\u06CC\u200C\u0634\u062F\u0647\u200C\u0647\u0627", AGENT: "\u{1F916} \u0627\u06CC\u062C\u0646\u062A \u0647\u0648\u0634\u0645\u0646\u062F", CHAT: "\u{1F4AC} \u06AF\u0641\u062A\u06AF\u0648 \u0628\u0627 \u0627\u06CC\u062C\u0646\u062A", CHAN: "\u{1F4E3} \u06A9\u0627\u0646\u0627\u0644\u200C\u0647\u0627", APPS: "\u{1F50C} \u0628\u0631\u0646\u0627\u0645\u0647\u200C\u0647\u0627\u06CC \u0645\u062A\u0635\u0644", GROUP: "\u{1F465} \u06AF\u0631\u0648\u0647 \u0648 \u0646\u0627\u0638\u0631", ME: "\u{1F464} \u062D\u0633\u0627\u0628 \u0645\u0646", HELP: "\u{1F4A1} \u0631\u0627\u0647\u0646\u0645\u0627", ADMIN: "\u{1F6E0} \u0645\u062F\u06CC\u0631\u06CC\u062A", BACK: "\u{1F519} \u0628\u0627\u0632\u06AF\u0634\u062A \u0628\u0647 \u0647\u0648\u0634 \u0645\u0635\u0646\u0648\u0639\u06CC" };
var MENU = new Set(Object.values(B));
var MAX_FILE = 20 * 1024 * 1024;
var MAX_CHANNELS = 20;
var mainKb = (admin) => ({
  keyboard: [[{ text: B.NEW }, { text: B.SCHED }], [{ text: B.CHAT }, { text: B.AGENT }], [{ text: B.CHAN }, { text: B.APPS }], [{ text: B.GROUP }, { text: B.ME }, { text: B.HELP }], [{ text: B.BACK }, ...admin ? [{ text: B.ADMIN }] : []]],
  resize_keyboard: true
});
var isAdmin = (env, uid) => adminIds(env).includes(uid);
var hasAccess = (u, admin, env) => admin || !!env?.EA_ACCESS || !!u.expires_at && u.expires_at > now();
var NO_ACCESS = "\u{1F512} \u0627\u0634\u062A\u0631\u0627\u06A9 \u0641\u0639\u0627\u0644 \u0646\u062F\u0627\u0631\u06CC\u062F.\n\u0628\u0631\u0627\u06CC \u0641\u0639\u0627\u0644\u200C\u0633\u0627\u0632\u06CC \u0628\u0627 \u0645\u062F\u06CC\u0631 \u062A\u0645\u0627\u0633 \u0628\u06AF\u06CC\u0631\u06CC\u062F.";
async function handleUpdate(c, u) {
  if (u.callback_query) return onCallback4(c, u.callback_query);
  if (u.message && u.message.chat.type === "private" && u.message.from) return onMessage3(c, u.message);
}
async function onMessage3(c, m) {
  const { env } = c, uid = m.from.id, admin = isAdmin(env, uid);
  const user = await touchUser(env, uid, m.from.first_name || "", m.from.username || "");
  if (user.banned && !admin) return void await send(env, uid, "\u26D4\uFE0F \u062F\u0633\u062A\u0631\u0633\u06CC \u0634\u0645\u0627 \u0645\u0633\u062F\u0648\u062F \u0634\u062F\u0647 \u0627\u0633\u062A.");
  const text = (m.text || "").trim();
  if (text.startsWith("/")) {
    const [cmd, ...args] = text.split(/\s+/);
    switch (cmd.split("@")[0].toLowerCase()) {
      case "/start": {
        const pm = (args[0] || "").match(/^ea_p(\d+)$/);
        if (pm) {
          if (!hasAccess(user, admin, env)) return void await send(env, uid, NO_ACCESS);
          return open(c, user, Number(pm[1]));
        }
        await clearSession(env, uid);
        return void await send(env, uid, welcome(env, user, admin), mainKb(admin));
      }
      case "/cancel":
        await clearSession(env, uid);
        return void await send(env, uid, "\u0644\u063A\u0648 \u0634\u062F.", mainKb(admin));
      case "/site":
        return void await send(env, uid, await siteLink(env, uid));
      case "/help":
        return void await send(env, uid, HELP, mainKb(admin));
      default:
        if (admin) {
          const r = await adminCmd(env, cmd.toLowerCase(), args);
          if (r) return void await send(env, uid, r);
        }
    }
    return void await send(env, uid, "\u062F\u0633\u062A\u0648\u0631 \u0646\u0627\u0645\u0639\u062A\u0628\u0631 \u0627\u0633\u062A. /help");
  }
  if (MENU.has(text)) {
    await clearSession(env, uid);
    return menu(c, user, admin, text);
  }
  const s = await getSession(env, uid);
  if (!hasAccess(user, admin, env) && s.state) {
    await clearSession(env, uid);
    return void await send(env, uid, NO_ACCESS);
  }
  switch (s.state) {
    case "token":
      return gotToken(c, user, m, text);
    case "gp_bot":
      return gotBotToken(c, user, m, text, s.data.role === "asst" ? "asst" : "sup");
    case "gp_led":
      return gotLesson(c, user, s.data, text);
    case "as_ans":
      return gotAnswer(c, user, s.data, text);
    case "cf_tok":
    case "cf_acc":
      return isAdmin(c.env, user.id) ? onMessage(c.env, user, s.state, s.data, m) : void 0;
    case "pm_err":
    case "pm_fix":
    case "pm_media":
    case "pm_time":
      return onMessage2(c, user, s.state, s.data, m);
    case "chan_id":
      return gotChanId(c, user, text);
    case "chan_title":
      return gotChanTitle(c, user, s.data, text);
    case "chan_rename":
      return gotRename(c, user, s.data, text);
    case "chan_chid": {
      const cid = normalizeChatId(text);
      if (!cid || /\s/.test(cid)) return void await send(c.env, user.id, "\u0634\u0646\u0627\u0633\u0647 \u0645\u0639\u062A\u0628\u0631 \u0646\u06CC\u0633\u062A. \u062F\u0648\u0628\u0627\u0631\u0647 \u0628\u0641\u0631\u0633\u062A\u06CC\u062F (\u06CC\u0627 /cancel).");
      const oldCh = await c.env.DB.prepare("SELECT chat_id FROM ea_channels WHERE id=? AND user_id=?").bind(s.data.channel_id, user.id).first();
      if (oldCh && /^[A-Za-z][A-Za-z0-9_.]{2,63}$/.test(oldCh.chat_id) && /^-?\d+$/.test(cid) && !await kvGet(c.env, `chuser:${s.data.channel_id}`)) await kvSet(c.env, `chuser:${s.data.channel_id}`, oldCh.chat_id);
      await c.env.DB.prepare("UPDATE ea_channels SET chat_id=? WHERE id=? AND user_id=?").bind(cid, s.data.channel_id, user.id).run();
      await clearSession(c.env, user.id);
      return void await send(c.env, user.id, "\u2705 \u0634\u0646\u0627\u0633\u0647 \u062A\u063A\u06CC\u06CC\u0631 \u06A9\u0631\u062F. \xAB\u06A9\u0627\u0646\u0627\u0644\u200C\u0647\u0627\xBB \u2190 \u06A9\u0627\u0646\u0627\u0644 \u2190 \xAB\u{1F9EA} \u0622\u0632\u0645\u0627\u06CC\u0634 \u0627\u062A\u0635\u0627\u0644\xBB \u0631\u0627 \u0628\u0632\u0646\u06CC\u062F.", mainKb(isAdmin(c.env, user.id)));
    }
    case "chan_user": {
      const un = normalizeChatId(text);
      if (!/^[A-Za-z][A-Za-z0-9_.]{2,63}$/.test(un)) return void await send(c.env, user.id, "\u0646\u0627\u0645 \u06A9\u0627\u0631\u0628\u0631\u06CC \u0645\u0639\u062A\u0628\u0631 \u0646\u06CC\u0633\u062A (\u0641\u0642\u0637 \u062D\u0631\u0648\u0641 \u0627\u0646\u06AF\u0644\u06CC\u0633\u06CC/\u0639\u062F\u062F/_). \u062F\u0648\u0628\u0627\u0631\u0647 \u0628\u0641\u0631\u0633\u062A\u06CC\u062F \u06CC\u0627 /cancel.");
      await kvSet(c.env, `chuser:${s.data.channel_id}`, un);
      await kvDel(c.env, `mirr:wait:${s.data.channel_id}`);
      await requestMirror(c.env, s.data.channel_id, 0);
      await clearSession(c.env, user.id);
      return void await send(c.env, user.id, `\u2705 \u062B\u0628\u062A \u0634\u062F: eitaa.com/${esc(un)}
\u0622\u06CC\u0646\u0647\u200C\u06CC \u06A9\u0627\u0646\u0627\u0644 \u062A\u0627 \u06CC\u06A9 \u062F\u0642\u06CC\u0642\u0647\u200C\u06CC \u062F\u06CC\u06AF\u0631 \u062F\u0631 \u06AF\u0631\u0648\u0647 \u0633\u0627\u062E\u062A\u0647 \u0645\u06CC\u200C\u0634\u0648\u062F.`, mainKb(isAdmin(c.env, user.id)));
    }
    case "np_content":
      return gotContent(c, user, s.data, m);
    case "np_title":
      return gotNpField(c, user, s.data, "title", text);
    case "np_view":
      return gotNpField(c, user, s.data, "view", text);
    case "np_when":
      return gotWhen(c, user, s.data, text);
  }
  if (s.state === "chat") return turn2(c, user, m, text, s.data);
  if (s.state.startsWith("ag_")) return onText(c, user, admin, s.state, s.data, text);
  await send(env, uid, "\u0627\u0632 \u0645\u0646\u0648\u06CC \u067E\u0627\u06CC\u06CC\u0646 \u0627\u0633\u062A\u0641\u0627\u062F\u0647 \u06A9\u0646\u06CC\u062F.", mainKb(admin));
}
async function menu(c, user, admin, text) {
  const { env } = c, uid = user.id;
  if (text === B.HELP) return void await send(env, uid, HELP, mainKb(admin));
  if (text === B.ADMIN) return admin ? adminPanel(env, uid) : void 0;
  if (!hasAccess(user, admin, env)) return void await send(env, uid, NO_ACCESS);
  switch (text) {
    case B.NEW:
      return newPost(c, user);
    case B.SCHED:
      return scheduled(env, uid);
    case B.AGENT:
      return home2(env, user);
    case B.CHAT:
      return start(env, user);
    case B.CHAN:
      return channels(env, uid);
    case B.APPS:
      return apps(env, user);
    case B.GROUP:
      return home3(env, user);
    case B.ME:
      return account(env, user, admin);
  }
}
var welcome = (env, u, admin) => `\u0633\u0644\u0627\u0645 ${esc(u.name || "")} \u{1F44B}

\u2728 \u067E\u0633\u062A \u0641\u0648\u0631\u06CC\u060C \u0632\u0645\u0627\u0646\u200C\u0628\u0646\u062F\u06CC\u200C\u0634\u062F\u0647 \u0648 \u0627\u06CC\u062C\u0646\u062A \u0647\u0648\u0634\u0645\u0646\u062F \u0628\u0631\u0627\u06CC \u06A9\u0627\u0646\u0627\u0644\u200C\u0647\u0627\u06CC <b>\u0627\u06CC\u062A\u0627</b>\u060C \u0627\u0632 \u0647\u0645\u06CC\u0646\u200C\u062C\u0627.

` + (hasAccess(u, admin, env) ? "\u0627\u0632 \u0645\u0646\u0648\u06CC \u067E\u0627\u06CC\u06CC\u0646 \u0634\u0631\u0648\u0639 \u06A9\u0646\u06CC\u062F \u{1F447}" : NO_ACCESS);
var HELP = "<b>\u{1F4A1} \u0631\u0627\u0647\u0646\u0645\u0627</b>\n\n1\uFE0F\u20E3 <b>\u0628\u0631\u0646\u0627\u0645\u0647\u200C\u0647\u0627\u06CC \u0645\u062A\u0635\u0644</b>: \u062A\u0648\u06A9\u0646 \u0627\u06CC\u062A\u0627\u06CC\u0627\u0631 \u0631\u0627 \u062B\u0628\u062A \u06A9\u0646\u06CC\u062F\n2\uFE0F\u20E3 <b>\u06A9\u0627\u0646\u0627\u0644\u200C\u0647\u0627</b>: \u06A9\u0627\u0646\u0627\u0644 \u0631\u0627 \u0627\u0636\u0627\u0641\u0647 \u06A9\u0646\u06CC\u062F (\u062D\u0633\u0627\u0628 \u06CC\u0627 \u0631\u0628\u0627\u062A \u0628\u0627\u06CC\u062F \u062F\u0631 \u06A9\u0627\u0646\u0627\u0644 \u0627\u062F\u0645\u06CC\u0646 \u0628\u0627\u0634\u062F)\n3\uFE0F\u20E3 <b>\u067E\u0633\u062A \u062C\u062F\u06CC\u062F</b>: \u06A9\u0627\u0646\u0627\u0644 \u0631\u0627 \u0627\u0646\u062A\u062E\u0627\u0628 \u0648 \u0645\u062A\u0646 \u06CC\u0627 \u0641\u0627\u06CC\u0644 (\u062A\u0627 \u06F2\u06F0 \u0645\u06AF\u0627\u0628\u0627\u06CC\u062A) \u0631\u0627 \u0628\u0641\u0631\u0633\u062A\u06CC\u062F\u061B \u0633\u067E\u0633 \u0627\u0631\u0633\u0627\u0644 \u06CC\u0627 \u0632\u0645\u0627\u0646\u200C\u0628\u0646\u062F\u06CC\n\n\u{1F465} <b>\u06AF\u0631\u0648\u0647 \u0648 \u0646\u0627\u0638\u0631</b>: \u067E\u0633\u062A\u200C\u0647\u0627 \u0627\u0648\u0644 \u062F\u0631 \u06AF\u0631\u0648\u0647 \u062A\u0644\u06AF\u0631\u0627\u0645 \u0634\u0645\u0627 (\u0628\u0627 \u062A\u0627\u067E\u06CC\u06A9) \u0645\u06CC\u200C\u0622\u06CC\u0646\u062F\u060C \u0646\u0627\u0638\u0631 \u0628\u0631\u0631\u0633\u06CC \u0645\u06CC\u200C\u06A9\u0646\u062F \u0648 \u0628\u0639\u062F \u062F\u0631 \u0627\u06CC\u062A\u0627 \u0645\u0646\u062A\u0634\u0631 \u0645\u06CC\u200C\u0634\u0648\u0646\u062F\u061B \u0632\u06CC\u0631 \u0647\u0631 \u067E\u0633\u062A \u06CC\u06A9 \u062F\u06A9\u0645\u0647\u200C\u06CC \u0645\u062F\u06CC\u0631\u06CC\u062A \u0627\u0633\u062A\n\u{1F4AC} <b>\u06AF\u0641\u062A\u06AF\u0648 \u0628\u0627 \u0627\u06CC\u062C\u0646\u062A</b>: \u0632\u0646\u062F\u0647 \u0628\u0627 \u0627\u06CC\u062C\u0646\u062A \u062D\u0631\u0641 \u0628\u0632\u0646\u06CC\u062F\u061B \u0647\u0645\u0627\u0646 \u0644\u062D\u0638\u0647 \u06A9\u0627\u0631 \u0631\u0627 \u0627\u0646\u062C\u0627\u0645 \u0645\u06CC\u200C\u062F\u0647\u062F \u0648 \u0646\u062A\u06CC\u062C\u0647 \u0631\u0627 \u0645\u06CC\u200C\u06AF\u0648\u06CC\u062F\n\u{1F916} <b>\u0627\u06CC\u062C\u0646\u062A \u0647\u0648\u0634\u0645\u0646\u062F</b>: \u0628\u0627 \u0632\u0628\u0627\u0646 \u0633\u0627\u062F\u0647 \u0628\u06AF\u0648\u06CC\u06CC\u062F \u0686\u0647 \u06A9\u0627\u0631\u06CC \u0648 \u0686\u0647 \u0633\u0627\u0639\u062A\u06CC \u0627\u0646\u062C\u0627\u0645 \u0634\u0648\u062F (\u0645\u062B\u0644\u0627\u064B \u0627\u0632 \u06A9\u0627\u0646\u0627\u0644\u200C\u0647\u0627\u06CC \u0639\u0645\u0648\u0645\u06CC \u0645\u062D\u062A\u0648\u0627 \u0628\u06CC\u0627\u0648\u0631\u062F \u06CC\u0627 \u0647\u0631 \u0635\u0628\u062D \u067E\u06CC\u0627\u0645 \u0635\u0628\u062D\u200C\u0628\u062E\u06CC\u0631 \u0628\u06AF\u0630\u0627\u0631\u062F)\n\n\u23F1 \u0646\u0645\u0648\u0646\u0647 \u0632\u0645\u0627\u0646: <code>18:30</code> \xB7 <code>\u0641\u0631\u062F\u0627 09:00</code> \xB7 <code>+45</code> \xB7 <code>1405/07/20 18:30</code>";
async function apps(env, u) {
  const has = !!u.eitaa_token_enc;
  const rows = [[[has ? "\u{1F511} \u062A\u063A\u06CC\u06CC\u0631 \u062A\u0648\u06A9\u0646 \u0627\u06CC\u062A\u0627\u06CC\u0627\u0631" : "\u{1F511} \u062B\u0628\u062A \u062A\u0648\u06A9\u0646 \u0627\u06CC\u062A\u0627\u06CC\u0627\u0631", "tk:set"]]];
  if (has) rows.push([["\u{1F5D1} \u062D\u0630\u0641 \u062A\u0648\u06A9\u0646 \u0627\u06CC\u062A\u0627\u06CC\u0627\u0631", "tk:del"]]);
  await send(env, u.id, `<b>\u{1F50C} \u0628\u0631\u0646\u0627\u0645\u0647\u200C\u0647\u0627\u06CC \u0645\u062A\u0635\u0644</b>

\u{1F7E0} \u0627\u06CC\u062A\u0627\u06CC\u0627\u0631: ${has ? "\u2705 \u0645\u062A\u0635\u0644" + (u.eitaa_account ? ` (${esc(u.eitaa_account)})` : "") : "\u274C \u0645\u062A\u0635\u0644 \u0646\u06CC\u0633\u062A"}`, ikb(rows));
}
async function gotToken(c, u, m, text) {
  const { env } = c;
  await del(env, u.id, m.message_id);
  const token = text.replace(/^bot/i, "").trim();
  if (!/^[A-Za-z0-9:_\-]{8,200}$/.test(token)) return void await send(env, u.id, "\u274C \u0642\u0627\u0644\u0628 \u062A\u0648\u06A9\u0646 \u062F\u0631\u0633\u062A \u0646\u06CC\u0633\u062A. \u062F\u0648\u0628\u0627\u0631\u0647 \u0628\u0641\u0631\u0633\u062A\u06CC\u062F (\u06CC\u0627 /cancel).");
  let me;
  try {
    me = await getMe(env, token);
  } catch (e) {
    return void await send(env, u.id, `\u274C \u0627\u06CC\u062A\u0627\u06CC\u0627\u0631 \u062A\u0648\u06A9\u0646 \u0631\u0627 \u0646\u067E\u0630\u06CC\u0631\u0641\u062A: ${esc(e.message)}
\u062F\u0648\u0628\u0627\u0631\u0647 \u0628\u0641\u0631\u0633\u062A\u06CC\u062F (\u06CC\u0627 /cancel).`);
  }
  const account2 = String(me?.username || me?.first_name || me?.name || "").slice(0, 60);
  await env.DB.prepare("UPDATE ea_users SET eitaa_token_enc=?, eitaa_account=? WHERE id=?").bind(await enc(env.SECRET_KEY, token), account2, u.id).run();
  await clearSession(env, u.id);
  await send(env, u.id, "\u2705 \u062A\u0648\u06A9\u0646 \u0627\u06CC\u062A\u0627\u06CC\u0627\u0631 \u062B\u0628\u062A \u0634\u062F \u{1F389}", mainKb(isAdmin(env, u.id)));
}
async function channels(env, uid) {
  const list = await userChannels(env, uid);
  await send(
    env,
    uid,
    list.length ? "<b>\u{1F4E3} \u06A9\u0627\u0646\u0627\u0644\u200C\u0647\u0627\u06CC \u0634\u0645\u0627</b>" : "\u{1F4ED} \u0647\u0646\u0648\u0632 \u06A9\u0627\u0646\u0627\u0644\u06CC \u0627\u0636\u0627\u0641\u0647 \u0646\u06A9\u0631\u062F\u0647\u200C\u0627\u06CC\u062F.",
    ikb([...list.map((ch) => [[`\u{1F7E0} ${ch.title}`.slice(0, 40), `ch:v:${ch.id}`]]), [["\u{1F7E0} \u0627\u0641\u0632\u0648\u062F\u0646 \u06A9\u0627\u0646\u0627\u0644 \u0627\u06CC\u062A\u0627", "ch:add"]]])
  );
}
async function gotChanId(c, u, text) {
  const { env } = c, cid = normalizeChatId(text);
  if (!cid || cid.length < 3 || /\s/.test(cid)) return void await send(env, u.id, "\u0622\u06CC\u062F\u06CC \u06CC\u0627 \u0644\u06CC\u0646\u06A9 \u0645\u0639\u062A\u0628\u0631 \u0646\u06CC\u0633\u062A. \u062F\u0648\u0628\u0627\u0631\u0647 \u0628\u0641\u0631\u0633\u062A\u06CC\u062F (\u06CC\u0627 /cancel).");
  if ((await userChannels(env, u.id)).some((x) => x.chat_id.toLowerCase() === cid.toLowerCase()))
    return void await send(env, u.id, "\u0627\u06CC\u0646 \u06A9\u0627\u0646\u0627\u0644 \u0642\u0628\u0644\u0627\u064B \u0627\u0636\u0627\u0641\u0647 \u0634\u062F\u0647 \u0627\u0633\u062A.");
  const info = await lookupChat(env, cid);
  if (info.exists === false) return void await send(env, u.id, "\u274C \u0686\u0646\u06CC\u0646 \u06A9\u0627\u0646\u0627\u0644\u06CC \u062F\u0631 \u0627\u06CC\u062A\u0627 \u067E\u06CC\u062F\u0627 \u0646\u0634\u062F. \u0622\u06CC\u062F\u06CC \u0631\u0627 \u0628\u0631\u0631\u0633\u06CC \u06A9\u0646\u06CC\u062F (\u06CC\u0627 /cancel).");
  if (info.title) return saveChannel(c, u, cid, info.title);
  await setSession(env, u.id, "chan_title", { chat_id: cid });
  await send(env, u.id, "\u0646\u0627\u0645 \u0646\u0645\u0627\u06CC\u0634\u06CC \u0628\u0631\u0627\u06CC \u0627\u06CC\u0646 \u06A9\u0627\u0646\u0627\u0644 \u0631\u0627 \u0628\u0641\u0631\u0633\u062A\u06CC\u062F (\u0641\u0642\u0637 \u0628\u0631\u0627\u06CC \u062E\u0648\u062F\u062A\u0627\u0646):");
}
async function gotChanTitle(c, u, d, text) {
  if (!text) return;
  await saveChannel(c, u, String(d.chat_id), text.slice(0, 100));
}
async function saveChannel(c, u, chatId, title) {
  const { env } = c;
  if ((await userChannels(env, u.id)).length >= MAX_CHANNELS) {
    await clearSession(env, u.id);
    return void await send(env, u.id, `\u062D\u062F\u0627\u06A9\u062B\u0631 ${MAX_CHANNELS} \u06A9\u0627\u0646\u0627\u0644 \u0645\u062C\u0627\u0632 \u0627\u0633\u062A.`);
  }
  await env.DB.prepare("INSERT INTO ea_channels(user_id,chat_id,title,platform,created_at) VALUES(?,?,?,?,?)").bind(u.id, chatId, title, "eitaa", now()).run();
  await clearSession(env, u.id);
  await send(env, u.id, `\u2705 \u06A9\u0627\u0646\u0627\u0644 \xAB${esc(title)}\xBB \u0627\u0636\u0627\u0641\u0647 \u0634\u062F.
\u{1F4CC} \u06CC\u0627\u062F\u062A\u0627\u0646 \u0628\u0627\u0634\u062F \u062D\u0633\u0627\u0628 \u0627\u06CC\u062A\u0627\u06CC\u0627\u0631 \u0628\u0627\u06CC\u062F \u062F\u0631 \u0627\u06CC\u0646 \u06A9\u0627\u0646\u0627\u0644 \u0627\u062F\u0645\u06CC\u0646 \u0628\u0627\u0634\u062F.`, mainKb(isAdmin(env, u.id)));
}
async function gotRename(c, u, d, text) {
  if (!text) return;
  await c.env.DB.prepare("UPDATE ea_channels SET title=? WHERE id=? AND user_id=?").bind(text.slice(0, 100), d.channel_id, u.id).run();
  await clearSession(c.env, u.id);
  await send(c.env, u.id, "\u2705 \u0646\u0627\u0645 \u062A\u063A\u06CC\u06CC\u0631 \u06A9\u0631\u062F.", mainKb(isAdmin(c.env, u.id)));
}
async function newPost(c, u) {
  const { env } = c;
  const list = await userChannels(env, u.id);
  if (!list.length) return void await send(env, u.id, u.eitaa_token_enc ? "\u0627\u0628\u062A\u062F\u0627 \u0627\u0632 \xAB\u06A9\u0627\u0646\u0627\u0644\u200C\u0647\u0627\xBB \u06CC\u06A9 \u06A9\u0627\u0646\u0627\u0644 \u0627\u0636\u0627\u0641\u0647 \u06A9\u0646\u06CC\u062F." : "\u0627\u0628\u062A\u062F\u0627 \u0627\u0632 \xAB\u0628\u0631\u0646\u0627\u0645\u0647\u200C\u0647\u0627\u06CC \u0645\u062A\u0635\u0644\xBB \u062A\u0648\u06A9\u0646 \u0627\u06CC\u062A\u0627\u06CC\u0627\u0631 \u0631\u0627 \u0648\u0635\u0644 \u0648 \u0627\u0632 \xAB\u06A9\u0627\u0646\u0627\u0644\u200C\u0647\u0627\xBB \u06CC\u06A9 \u06A9\u0627\u0646\u0627\u0644 \u0627\u0636\u0627\u0641\u0647 \u06A9\u0646\u06CC\u062F.");
  if (list.length === 1) return askContent(env, u.id, list[0]);
  await send(env, u.id, "\u062F\u0631 \u06A9\u062F\u0627\u0645 \u06A9\u0627\u0646\u0627\u0644\u061F", ikb(list.map((ch) => [[`\u{1F7E0} ${ch.title}`.slice(0, 40), `np:c:${ch.id}`]])));
}
async function askContent(env, uid, ch) {
  if (!(await getUser(env, uid))?.eitaa_token_enc) return void await send(env, uid, "\u0627\u0628\u062A\u062F\u0627 \u0627\u0632 \xAB\u0628\u0631\u0646\u0627\u0645\u0647\u200C\u0647\u0627\u06CC \u0645\u062A\u0635\u0644\xBB \u062A\u0648\u06A9\u0646 \u0627\u06CC\u062A\u0627\u06CC\u0627\u0631 \u0631\u0627 \u062B\u0628\u062A \u06A9\u0646\u06CC\u062F.");
  await setSession(env, uid, "np_content", { channel_id: ch.id, silent: 0, pin: 0, view: 0, title: "" });
  await send(env, uid, `\u{1F7E0} \u06A9\u0627\u0646\u0627\u0644: <b>${esc(ch.title)}</b>
\u270D\uFE0F \u0645\u062A\u0646 \u06CC\u0627 \u0641\u0627\u06CC\u0644 (\u0639\u06A9\u0633\u060C \u0648\u06CC\u062F\u06CC\u0648\u060C \u0633\u0646\u062F\u060C \u0635\u062F\u0627\u061B \u062A\u0627 \u06F2\u06F0 \u0645\u06AF\u0627\u0628\u0627\u06CC\u062A) \u0631\u0627 \u0628\u0641\u0631\u0633\u062A\u06CC\u062F. \u0644\u063A\u0648: /cancel`);
}
function extract(m) {
  const cap = (m.caption || "").trim();
  if (m.photo?.length) {
    const p = m.photo[m.photo.length - 1];
    return fileOf(p.file_id, "photo.jpg", p.file_size, cap);
  }
  for (const [key2, def] of [["video", "video.mp4"], ["document", "file"], ["audio", "audio.mp3"], ["voice", "voice.ogg"], ["animation", "animation.mp4"]]) {
    const f = m[key2];
    if (f) return fileOf(f.file_id, f.file_name || def, f.file_size, cap);
  }
  if (m.sticker) return { error: "\u0627\u0633\u062A\u06CC\u06A9\u0631 \u067E\u0634\u062A\u06CC\u0628\u0627\u0646\u06CC \u0646\u0645\u06CC\u200C\u0634\u0648\u062F." };
  if (m.text) return { kind: "text", text: m.text.trim(), file_id: "", file_name: "" };
  return { error: "\u0627\u06CC\u0646 \u0646\u0648\u0639 \u067E\u06CC\u0627\u0645 \u067E\u0634\u062A\u06CC\u0628\u0627\u0646\u06CC \u0646\u0645\u06CC\u200C\u0634\u0648\u062F\u061B \u0645\u062A\u0646 \u06CC\u0627 \u0641\u0627\u06CC\u0644 \u0628\u0641\u0631\u0633\u062A\u06CC\u062F." };
}
var fileOf = (id, name, size, cap) => size && size > MAX_FILE ? { error: "\u062D\u062C\u0645 \u0641\u0627\u06CC\u0644 \u0628\u06CC\u0634 \u0627\u0632 \u06F2\u06F0 \u0645\u06AF\u0627\u0628\u0627\u06CC\u062A \u0627\u0633\u062A (\u0645\u062D\u062F\u0648\u062F\u06CC\u062A \u0631\u0628\u0627\u062A\u200C\u0647\u0627\u06CC \u062A\u0644\u06AF\u0631\u0627\u0645)." } : { kind: "file", text: cap, file_id: id, file_name: name };
async function gotContent(c, u, d, m) {
  const r = extract(m);
  if ("error" in r) return void await send(c.env, u.id, "\u274C " + r.error);
  const data = { ...d, kind: r.kind, text: r.text, file_id: r.file_id, file_name: r.file_name };
  await setSession(c.env, u.id, "np_menu", data);
  await showMenu(c.env, u.id, data);
}
var onoff = (v) => v ? "\u0631\u0648\u0634\u0646" : "\u062E\u0627\u0645\u0648\u0634";
async function showMenu(env, uid, d, mid) {
  const ch = await getChannel(env, d.channel_id);
  const preview = d.kind === "file" ? `\u{1F4CE} ${esc(d.file_name)}${d.text ? "\n" + esc(d.text.slice(0, 300)) : ""}` : esc(String(d.text).slice(0, 400));
  const t = `<b>\u{1F440} \u067E\u06CC\u0634\u200C\u0646\u0645\u0627\u06CC\u0634</b> (\u{1F7E0} ${esc(ch?.title || "?")})

${preview}${d.title ? `

\u{1F3F7} \u0639\u0646\u0648\u0627\u0646: ${esc(d.title)}` : ""}`;
  const rows = [
    [["\u{1F680} \u0627\u0631\u0633\u0627\u0644 \u0627\u0644\u0627\u0646", "np:now"], ["\u23F0 \u0632\u0645\u0627\u0646\u200C\u0628\u0646\u062F\u06CC", "np:sch"]],
    [[`\u{1F515} \u0628\u06CC\u200C\u0635\u062F\u0627: ${onoff(d.silent)}`, "np:silent"], [`\u{1F4CC} \u067E\u06CC\u0646: ${onoff(d.pin)}`, "np:pin"]],
    [["\u{1F3F7} \u0639\u0646\u0648\u0627\u0646", "np:title"], [`\u{1F441} \u062D\u0630\u0641 \u067E\u0633 \u0627\u0632 \u0628\u0627\u0632\u062F\u06CC\u062F: ${d.view || "\u062E\u0627\u0645\u0648\u0634"}`, "np:view"]]
  ];
  rows.push([["\u274C \u0644\u063A\u0648", "np:x"]]);
  if (mid) await edit(env, uid, mid, t, ikb(rows));
  else await send(env, uid, t, ikb(rows));
}
async function gotNpField(c, u, d, field, text) {
  if (field === "view") {
    const n = parseInt(text.replace(/[۰-۹]/g, (x) => String(x.charCodeAt(0) - 1776)), 10);
    if (isNaN(n) || n < 0 || n > 1e6) return void await send(c.env, u.id, "\u06CC\u06A9 \u0639\u062F\u062F \u0628\u0641\u0631\u0633\u062A\u06CC\u062F (\u06F0 = \u062E\u0627\u0645\u0648\u0634).");
    d.view = n;
  } else d.title = text.slice(0, 100);
  await setSession(c.env, u.id, "np_menu", d);
  await showMenu(c.env, u.id, d);
}
async function createPost(env, uid, d, runAt) {
  const r = await env.DB.prepare("INSERT INTO ea_posts(user_id,channel_id,kind,text,file_id,file_name,title,silent,pin,view_delete,run_at,status,created_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,'pending',?)").bind(uid, d.channel_id, d.kind, d.text || "", d.file_id || "", d.file_name || "", d.title || "", d.silent ? 1 : 0, d.pin ? 1 : 0, d.view || 0, runAt, now()).run();
  return r.meta.last_row_id;
}
async function gotWhen(c, u, d, text) {
  const at = parseWhen(text);
  if (at === null) return void await send(c.env, u.id, "\u274C \u0632\u0645\u0627\u0646 \u0646\u0627\u0645\u0639\u062A\u0628\u0631 \u06CC\u0627 \u06AF\u0630\u0634\u062A\u0647 \u0627\u0633\u062A. \u0646\u0645\u0648\u0646\u0647: <code>\u0641\u0631\u062F\u0627 09:00</code> \u06CC\u0627 <code>+45</code>");
  const id = await createPost(c.env, u.id, d, at);
  await clearSession(c.env, u.id);
  await send(c.env, u.id, `\u2705 \u067E\u0633\u062A #${id} \u0628\u0631\u0627\u06CC ${fmtDt(at)} (\u0648\u0642\u062A \u062A\u0647\u0631\u0627\u0646) \u0632\u0645\u0627\u0646\u200C\u0628\u0646\u062F\u06CC \u0634\u062F.`, mainKb(isAdmin(c.env, u.id)));
}
async function scheduled(env, uid) {
  const rows = (await env.DB.prepare("SELECT * FROM ea_posts WHERE user_id=? AND status='pending' ORDER BY run_at LIMIT 10").bind(uid).all()).results;
  if (!rows.length) return void await send(env, uid, "\u067E\u0633\u062A \u0632\u0645\u0627\u0646\u200C\u0628\u0646\u062F\u06CC\u200C\u0634\u062F\u0647\u200C\u0627\u06CC \u0646\u062F\u0627\u0631\u06CC\u062F.");
  for (const p of rows) {
    const preview = p.kind === "file" ? `\u{1F4CE} ${p.file_name}` : p.text.slice(0, 80);
    await send(env, uid, `\u23F0 #${p.id} \xB7 ${fmtDt(p.run_at)}
${esc(preview)}`, ikb([[["\u{1F5D1} \u0644\u063A\u0648", `sp:del:${p.id}`]]]));
  }
}
async function account(env, u, admin) {
  const n = (await userChannels(env, u.id)).length;
  await send(env, u.id, `<b>\u{1F464} \u062D\u0633\u0627\u0628 \u0645\u0646</b>

\u{1F194} \u0634\u0646\u0627\u0633\u0647: <code>${u.id}</code>
\u{1F48E} \u0627\u0634\u062A\u0631\u0627\u06A9: ${admin ? "\u0645\u062F\u06CC\u0631" : u.expires_at && u.expires_at > now() ? "\u062A\u0627 " + fmtDt(u.expires_at) : "\u063A\u06CC\u0631\u0641\u0639\u0627\u0644"}
\u{1F7E0} \u062A\u0648\u06A9\u0646 \u0627\u06CC\u062A\u0627\u06CC\u0627\u0631: ${u.eitaa_token_enc ? "\u2705" : "\u274C"}
\u{1F4E3} \u06A9\u0627\u0646\u0627\u0644\u200C\u0647\u0627: ${n}`);
}
async function adminPanel(env, uid) {
  const chain = await llmChain(env);
  await send(env, uid, await adminCmd(env, "/stats", []) + `

\u{1F9E0} \u0647\u0648\u0634 \u0645\u0635\u0646\u0648\u0639\u06CC \u0627\u06CC\u062C\u0646\u062A: ${chain.length ? "\u2705 " + chain.map((x) => x.name).join(" \u2190 ") : "\u274C \u0628\u0627\u06CC\u0646\u062F\u06CC\u0646\u06AF AI \u062F\u0631 wrangler.jsonc \u0641\u0639\u0627\u0644 \u0646\u06CC\u0633\u062A"}

<code>/grant ID DAYS</code> \xB7 <code>/ban ID</code> \xB7 <code>/unban ID</code> \xB7 <code>/stats</code> \xB7 <code>/src \u0646\u0627\u0645_\u06A9\u0627\u0646\u0627\u0644</code>`);
}
async function adminCmd(env, cmd, a) {
  const id = parseInt(a[0] || "", 10);
  switch (cmd) {
    case "/stats": {
      const g = async (q) => (await env.DB.prepare(q).first()).n;
      return `\u{1F4CA} \u06A9\u0627\u0631\u0628\u0631\u0627\u0646: ${await g("SELECT COUNT(*) n FROM ea_users")} \xB7 \u0641\u0639\u0627\u0644: ${await g(`SELECT COUNT(*) n FROM ea_users WHERE expires_at>${now()}`)}
\u067E\u0633\u062A\u200C\u0647\u0627 \u2014 \u062F\u0631 \u0627\u0646\u062A\u0638\u0627\u0631: ${await g("SELECT COUNT(*) n FROM ea_posts WHERE status='pending'")} \xB7 \u0627\u0631\u0633\u0627\u0644\u200C\u0634\u062F\u0647: ${await g("SELECT COUNT(*) n FROM ea_posts WHERE status='sent'")} \xB7 \u0646\u0627\u0645\u0648\u0641\u0642: ${await g("SELECT COUNT(*) n FROM ea_posts WHERE status='failed'")}`;
    }
    case "/grant": {
      const days = parseInt(a[1] || "", 10);
      if (!id || !days || days < 1 || days > 3650) return "\u0627\u0633\u062A\u0641\u0627\u062F\u0647: /grant ID DAYS";
      const u = await getUser(env, id);
      if (!u) return "\u0627\u06CC\u0646 \u06A9\u0627\u0631\u0628\u0631 \u0647\u0646\u0648\u0632 \u0631\u0628\u0627\u062A \u0631\u0627 \u0628\u0627\u0632 \u0646\u06A9\u0631\u062F\u0647 \u0627\u0633\u062A.";
      const base = u.expires_at && u.expires_at > now() ? u.expires_at : now();
      const until = base + days * 86400;
      await env.DB.prepare("UPDATE ea_users SET expires_at=? WHERE id=?").bind(until, id).run();
      await send(env, id, `\u2705 \u0627\u0634\u062A\u0631\u0627\u06A9 \u0634\u0645\u0627 \u062A\u0627 ${fmtDt(until)} \u0641\u0639\u0627\u0644 \u0634\u062F.`);
      return `\u2705 ${id} \u062A\u0627 ${fmtDt(until)} \u0641\u0639\u0627\u0644 \u0634\u062F.`;
    }
    case "/src": {
      const name = normalizeChatId(a[0] || "");
      if (!name) return "\u0627\u0633\u062A\u0641\u0627\u062F\u0647: /src channelname";
      const r = await fetchChannel(env, name);
      const m = r.messages[r.messages.length - 1];
      return `\u{1F52C} ${esc(name)} \u2014 HTTP ${r.status} \u2014 \u067E\u06CC\u0627\u0645\u200C\u0647\u0627\u06CC \u0634\u0646\u0627\u0633\u0627\u06CC\u06CC\u200C\u0634\u062F\u0647: ${r.messages.length} (\u0639\u06A9\u0633: ${r.messages.filter((x) => x.image && !x.sticker && !x.video).length}\u060C \u0648\u06CC\u062F\u06CC\u0648: ${r.messages.filter((x) => x.video).length}\u060C \u0627\u0633\u062A\u06CC\u06A9\u0631: ${r.messages.filter((x) => x.sticker).length})${r.title ? `
\u0639\u0646\u0648\u0627\u0646: ${esc(r.title)}` : ""}${r.note ? `
\u26A0\uFE0F ${esc(r.note)}` : ""}${r.hint ? `
\u{1F50E} ${esc(r.hint)}` : ""}` + (() => {
        const mm = r.messages.slice().reverse().find((x) => x.videoUrl || x.image);
        return mm ? `
\u{1F39E} \u0631\u0633\u0627\u0646\u0647\u200C\u06CC #${mm.id}: ${esc(mm.videoUrl || mm.image)}` : "";
      })() + (m ? `

\u0622\u062E\u0631\u06CC\u0646 \u067E\u06CC\u0627\u0645 (#${m.id}${m.videoUrl || m.video ? " \u{1F3AC}" : m.image ? " \u{1F5BC}" : ""}):
${esc(cleanText(m.text, name, r.title).slice(0, 500))}` : `

\u0646\u0645\u0648\u0646\u0647\u200C\u06CC \u0645\u062A\u0646 \u0635\u0641\u062D\u0647:
${esc(r.snippet)}`);
    }
    case "/ban":
    case "/unban": {
      if (!id) return `\u0627\u0633\u062A\u0641\u0627\u062F\u0647: ${cmd} ID`;
      await env.DB.prepare("UPDATE ea_users SET banned=? WHERE id=?").bind(cmd === "/ban" ? 1 : 0, id).run();
      return cmd === "/ban" ? `\u26D4\uFE0F ${id} \u0645\u0633\u062F\u0648\u062F \u0634\u062F.` : `\u2705 ${id} \u0622\u0632\u0627\u062F \u0634\u062F.`;
    }
  }
  return "";
}
async function onCallback4(c, q) {
  const { env } = c, uid = q.from.id, admin = isAdmin(env, uid), mid = q.message?.message_id;
  const user = await touchUser(env, uid, q.from.first_name || "", q.from.username || "");
  if (user.banned && !admin || !hasAccess(user, admin, env)) return answer(env, q.id, "\u062F\u0633\u062A\u0631\u0633\u06CC \u0646\u062F\u0627\u0631\u06CC\u062F.", true);
  const [kind, act2, arg] = (q.data || "").split(":");
  const s = await getSession(env, uid);
  if (kind === "tk") {
    await answer(env, q.id);
    if (act2 === "set") {
      await setSession(env, uid, "token", {});
      return void await send(env, uid, "\u{1F511} \u062A\u0648\u06A9\u0646 \u0627\u06CC\u062A\u0627\u06CC\u0627\u0631 \u0631\u0627 \u0628\u0641\u0631\u0633\u062A\u06CC\u062F\n\u{1F9F9} \u067E\u06CC\u0627\u0645 \u0634\u0645\u0627 \u0628\u0639\u062F \u0627\u0632 \u062E\u0648\u0627\u0646\u062F\u0646 \u067E\u0627\u06A9 \u0645\u06CC\u200C\u0634\u0648\u062F. \u0644\u063A\u0648: /cancel");
    }
    if (act2 === "del") {
      await env.DB.prepare("UPDATE ea_users SET eitaa_token_enc='', eitaa_account='' WHERE id=?").bind(uid).run();
      return void await send(env, uid, "\u{1F5D1} \u062A\u0648\u06A9\u0646 \u062D\u0630\u0641 \u0634\u062F.");
    }
  }
  if (kind === "pm") return onCallback3(c, user, q, act2, arg);
  if (kind === "as") return onAskCallback(c, user, q, act2, arg);
  if (kind === "gp") return onGroupCallback(c, user, q, act2, arg);
  if (kind === "cf") {
    if (!isAdmin(env, uid)) return void await answer(env, q.id, "\u0641\u0642\u0637 \u0645\u0627\u0644\u06A9");
    return onCallback(env, user, q, act2, arg);
  }
  if (kind === "ag") return onCallback2(c, user, admin, q, act2, arg, s);
  if (kind === "ch") {
    await answer(env, q.id);
    if (act2 === "add") {
      await setSession(env, uid, "chan_id", {});
      return void await send(env, uid, "\u0634\u0646\u0627\u0633\u0647\u200C\u06CC \u06A9\u0627\u0646\u0627\u0644 \u0631\u0627 \u0647\u0645\u0627\u0646\u200C\u0637\u0648\u0631 \u06A9\u0647 <b>\u062F\u0631 \u067E\u0646\u0644 \u0627\u06CC\u062A\u0627\u06CC\u0627\u0631 (\u06A9\u0627\u0646\u0627\u0644\u200C\u0647\u0627)</b> \u0645\u06CC\u200C\u0628\u06CC\u0646\u06CC\u062F \u0628\u0641\u0631\u0633\u062A\u06CC\u062F:\n\u2022 \u0639\u062F\u062F \u0634\u0646\u0627\u0633\u0647\u200C\u06CC \u06A9\u0627\u0646\u0627\u0644\u060C \u06CC\u0627\n\u2022 \u0646\u0627\u0645 \u06A9\u0627\u0631\u0628\u0631\u06CC \u062F\u0642\u06CC\u0642 \u0628\u062F\u0648\u0646 @ (\u0645\u062B\u0627\u0644: <code>mychannel</code>)\n\n\u26A0\uFE0F \u06A9\u0627\u0646\u0627\u0644 \u0628\u0627\u06CC\u062F \u062F\u0631 \u067E\u0646\u0644 \u0627\u06CC\u062A\u0627\u06CC\u0627\u0631 \u062B\u0628\u062A \u0648 \u062D\u0633\u0627\u0628 \u0627\u06CC\u062A\u0627\u06CC\u0627\u0631 \u062F\u0631 \u0622\u0646 \u0627\u062F\u0645\u06CC\u0646 \u0628\u0627\u0634\u062F. \u0628\u0639\u062F \u0627\u0632 \u0627\u0641\u0632\u0648\u062F\u0646\u060C \u062D\u062A\u0645\u0627\u064B \xAB\u{1F9EA} \u0622\u0632\u0645\u0627\u06CC\u0634 \u0627\u062A\u0635\u0627\u0644\xBB \u0631\u0627 \u0628\u0632\u0646\u06CC\u062F.");
    }
    const ch = await getChannel(env, Number(arg));
    if (!ch || ch.user_id !== uid) return;
    if (act2 === "v") {
      const un = await usernameOf(env, ch), on = await mirrorOn(env, ch.id), grp = await getGroup(env, uid);
      const mirror = !grp ? "\u{1FA9E} \u0622\u06CC\u0646\u0647: \u06AF\u0631\u0648\u0647 \u0645\u062A\u0635\u0644 \u0646\u06CC\u0633\u062A" : !un ? "\u{1FA9E} \u0622\u06CC\u0646\u0647: \u0646\u0627\u0645 \u06A9\u0627\u0631\u0628\u0631\u06CC \u0639\u0645\u0648\u0645\u06CC \u06A9\u0627\u0646\u0627\u0644 \u0644\u0627\u0632\u0645 \u0627\u0633\u062A" : `\u{1FA9E} \u0622\u06CC\u0646\u0647 \u062F\u0631 \u06AF\u0631\u0648\u0647: ${on ? "\u0631\u0648\u0634\u0646 \u2705" : "\u062E\u0627\u0645\u0648\u0634"} \xB7 eitaa.com/${esc(un)}`;
      return void await send(env, uid, `<b>${esc(ch.title)}</b>
<code>${esc(ch.chat_id)}</code>
${mirror}`, ikb([
        [["\u{1F9EA} \u0622\u0632\u0645\u0627\u06CC\u0634 \u0627\u062A\u0635\u0627\u0644", `ch:t:${ch.id}`]],
        [["\u270F\uFE0F \u062A\u063A\u06CC\u06CC\u0631 \u0634\u0646\u0627\u0633\u0647", `ch:id:${ch.id}`], ["\u270F\uFE0F \u062A\u063A\u06CC\u06CC\u0631 \u0646\u0627\u0645", `ch:rn:${ch.id}`]],
        [[on ? "\u{1FA9E} \u062E\u0627\u0645\u0648\u0634\u200C\u06A9\u0631\u062F\u0646 \u0622\u06CC\u0646\u0647" : "\u{1FA9E} \u0631\u0648\u0634\u0646\u200C\u06A9\u0631\u062F\u0646 \u0622\u06CC\u0646\u0647", `ch:mr:${ch.id}`], ["\u{1F517} \u0646\u0627\u0645 \u06A9\u0627\u0631\u0628\u0631\u06CC \u0628\u0631\u0627\u06CC \u0622\u06CC\u0646\u0647", `ch:un:${ch.id}`]],
        ...grp && un ? [[["\u{1F504} \u0647\u0645\u06AF\u0627\u0645\u200C\u0633\u0627\u0632\u06CC \u0647\u0645\u06CC\u0646 \u062D\u0627\u0644\u0627", `ch:sy:${ch.id}`]]] : [],
        [["\u{1F5D1} \u062D\u0630\u0641", `ch:del:${ch.id}`]]
      ]));
    }
    if (act2 === "mr") {
      if (await mirrorOn(env, ch.id)) await kvSet(env, `mirroroff:${ch.id}`, "1");
      else await kvDel(env, `mirroroff:${ch.id}`);
      return void await send(env, uid, await mirrorOn(env, ch.id) ? "\u{1FA9E} \u0622\u06CC\u0646\u0647 \u0631\u0648\u0634\u0646 \u0634\u062F." : "\u{1FA9E} \u0622\u06CC\u0646\u0647 \u062E\u0627\u0645\u0648\u0634 \u0634\u062F (\u062A\u0627\u067E\u06CC\u06A9 \u0648 \u067E\u06CC\u0627\u0645\u200C\u0647\u0627\u06CC \u0642\u0628\u0644\u06CC \u0645\u06CC\u200C\u0645\u0627\u0646\u0646\u062F).");
    }
    if (act2 === "un") {
      await setSession(env, uid, "chan_user", { channel_id: ch.id });
      return void await send(env, uid, "\u0646\u0627\u0645 \u06A9\u0627\u0631\u0628\u0631\u06CC \u0639\u0645\u0648\u0645\u06CC \u06A9\u0627\u0646\u0627\u0644 \u0631\u0627 \u062F\u0631 \u0627\u06CC\u062A\u0627 \u0628\u0641\u0631\u0633\u062A\u06CC\u062F (\u0645\u062B\u0627\u0644: <code>mychannel</code> \u06CC\u0627 \u0644\u06CC\u0646\u06A9 <code>eitaa.com/mychannel</code>).\n\u0622\u06CC\u0646\u0647\u200C\u06CC \u06AF\u0631\u0648\u0647 \u0627\u0632 \u0635\u0641\u062D\u0647\u200C\u06CC \u0639\u0645\u0648\u0645\u06CC \u0647\u0645\u06CC\u0646 \u06A9\u0627\u0646\u0627\u0644 \u062E\u0648\u0627\u0646\u062F\u0647 \u0645\u06CC\u200C\u0634\u0648\u062F. \u0644\u063A\u0648: /cancel");
    }
    if (act2 === "sy") {
      await requestMirror(env, ch.id, 0);
      await kvDel(env, `mirr:wait:${ch.id}`);
      return void await send(env, uid, "\u{1F504} \u0647\u0645\u06AF\u0627\u0645\u200C\u0633\u0627\u0632\u06CC \u0622\u06CC\u0646\u0647 \u062A\u0627 \u06CC\u06A9 \u062F\u0642\u06CC\u0642\u0647\u200C\u06CC \u062F\u06CC\u06AF\u0631 \u0634\u0631\u0648\u0639 \u0645\u06CC\u200C\u0634\u0648\u062F.");
    }
    if (act2 === "t") {
      const u = await getUser(env, uid);
      if (!u?.eitaa_token_enc) return void await send(env, uid, "\u0627\u0628\u062A\u062F\u0627 \u0627\u0632 \xAB\u0628\u0631\u0646\u0627\u0645\u0647\u200C\u0647\u0627\u06CC \u0645\u062A\u0635\u0644\xBB \u062A\u0648\u06A9\u0646 \u0627\u06CC\u062A\u0627\u06CC\u0627\u0631 \u0631\u0627 \u062B\u0628\u062A \u06A9\u0646\u06CC\u062F.");
      try {
        await sendMessage(env, await dec(env.SECRET_KEY, u.eitaa_token_enc), ch.chat_id, "\u2705 \u0622\u0632\u0645\u0627\u06CC\u0634 \u0627\u062A\u0635\u0627\u0644 \u0631\u0628\u0627\u062A\u061B \u0627\u06CC\u0646 \u067E\u06CC\u0627\u0645 \u0631\u0627 \u0645\u06CC\u200C\u062A\u0648\u0627\u0646\u06CC\u062F \u062D\u0630\u0641 \u06A9\u0646\u06CC\u062F.");
        return void await send(env, uid, `\u2705 \u0627\u062A\u0635\u0627\u0644 \u0628\u0647 \xAB${esc(ch.title)}\xBB \u062F\u0631\u0633\u062A \u0627\u0633\u062A\u061B \u06CC\u06A9 \u067E\u06CC\u0627\u0645 \u0622\u0632\u0645\u0627\u06CC\u0634\u06CC \u062F\u0631 \u06A9\u0627\u0646\u0627\u0644 \u0641\u0631\u0633\u062A\u0627\u062F\u0647 \u0634\u062F.`);
      } catch (e) {
        return void await send(env, uid, `\u274C \u0627\u0631\u0633\u0627\u0644 \u0622\u0632\u0645\u0627\u06CC\u0634\u06CC \u0628\u0647 \xAB${esc(ch.title)}\xBB \u0646\u0627\u0645\u0648\u0641\u0642 \u0628\u0648\u062F:
${esc(e.message)}

\u{1F194} \u0634\u0646\u0627\u0633\u0647\u200C\u06CC \u0627\u0631\u0633\u0627\u0644\u200C\u0634\u062F\u0647: <code>${esc(ch.chat_id)}</code>`, ikb([[["\u270F\uFE0F \u062A\u063A\u06CC\u06CC\u0631 \u0634\u0646\u0627\u0633\u0647", `ch:id:${ch.id}`]]]));
      }
    }
    if (act2 === "id") {
      await setSession(env, uid, "chan_chid", { channel_id: ch.id });
      return void await send(env, uid, "\u0634\u0646\u0627\u0633\u0647\u200C\u06CC \u062F\u0631\u0633\u062A \u06A9\u0627\u0646\u0627\u0644 \u0631\u0627 \u0628\u0641\u0631\u0633\u062A\u06CC\u062F (\u0639\u062F\u062F \u0634\u0646\u0627\u0633\u0647 \u06CC\u0627 \u0646\u0627\u0645 \u06A9\u0627\u0631\u0628\u0631\u06CC \u0628\u062F\u0648\u0646 @\u060C \u0645\u0637\u0627\u0628\u0642 \u067E\u0646\u0644 \u0627\u06CC\u062A\u0627\u06CC\u0627\u0631):");
    }
    if (act2 === "rn") {
      await setSession(env, uid, "chan_rename", { channel_id: ch.id });
      return void await send(env, uid, "\u0646\u0627\u0645 \u062C\u062F\u06CC\u062F \u0631\u0627 \u0628\u0641\u0631\u0633\u062A\u06CC\u062F:");
    }
    if (act2 === "del") return void await send(env, uid, `\xAB${esc(ch.title)}\xBB \u062D\u0630\u0641 \u0634\u0648\u062F\u061F (\u067E\u0633\u062A\u200C\u0647\u0627\u06CC \u0632\u0645\u0627\u0646\u200C\u0628\u0646\u062F\u06CC\u200C\u0634\u062F\u0647 \u0648 \u0627\u06CC\u062C\u0646\u062A\u200C\u0647\u0627\u06CC \u0622\u0646 \u0647\u0645 \u062D\u0630\u0641 \u0645\u06CC\u200C\u0634\u0648\u0646\u062F)`, ikb([[["\u2705 \u0628\u0644\u0647\u060C \u062D\u0630\u0641", `ch:dy:${ch.id}`], ["\u062E\u06CC\u0631", "ch:no:0"]]]));
    if (act2 === "dy") {
      await env.DB.batch([env.DB.prepare("UPDATE ea_posts SET status='canceled' WHERE channel_id=? AND status IN ('pending','draft')").bind(ch.id), env.DB.prepare("DELETE FROM agent_jobs WHERE channel_id=?").bind(ch.id), env.DB.prepare("DELETE FROM ea_channels WHERE id=?").bind(ch.id)]);
      return void await send(env, uid, "\u{1F5D1} \u062D\u0630\u0641 \u0634\u062F.");
    }
    return;
  }
  if (kind === "sp" && act2 === "rt") {
    const r = await env.DB.prepare("UPDATE ea_posts SET status='pending', run_at=?, error='' WHERE id=? AND user_id=? AND status='failed'").bind(now(), Number(arg), uid).run();
    await answer(env, q.id, r.meta.changes ? "\u062F\u0648\u0628\u0627\u0631\u0647 \u062F\u0631 \u0635\u0641 \u0642\u0631\u0627\u0631 \u06AF\u0631\u0641\u062A." : "\u0642\u0627\u0628\u0644 \u0627\u0631\u0633\u0627\u0644 \u0645\u062C\u062F\u062F \u0646\u06CC\u0633\u062A.");
    return;
  }
  if (kind === "sp" && act2 === "del") {
    const r = await env.DB.prepare("UPDATE ea_posts SET status='canceled' WHERE id=? AND user_id=? AND status='pending'").bind(Number(arg), uid).run();
    await answer(env, q.id, r.meta.changes ? "\u0644\u063A\u0648 \u0634\u062F." : "\u0642\u0627\u0628\u0644 \u0644\u063A\u0648 \u0646\u06CC\u0633\u062A.");
    if (mid && r.meta.changes) await edit(env, uid, mid, `\u{1F5D1} \u067E\u0633\u062A #${arg} \u0644\u063A\u0648 \u0634\u062F.`);
    return;
  }
  if (kind === "np") {
    if (act2 === "c") {
      await answer(env, q.id);
      const ch = await getChannel(env, Number(arg));
      return ch && ch.user_id === uid ? askContent(env, uid, ch) : void 0;
    }
    if (act2 === "x") {
      await clearSession(env, uid);
      await answer(env, q.id, "\u0644\u063A\u0648 \u0634\u062F.");
      return void (mid && await edit(env, uid, mid, "\u0644\u063A\u0648 \u0634\u062F."));
    }
    if (s.state !== "np_menu" && s.state !== "np_when") return answer(env, q.id, "\u0627\u06CC\u0646 \u067E\u06CC\u0634\u200C\u0646\u0648\u06CC\u0633 \u0645\u0646\u0642\u0636\u06CC \u0634\u062F\u0647\u061B \u062F\u0648\u0628\u0627\u0631\u0647 \xAB\u067E\u0633\u062A \u062C\u062F\u06CC\u062F\xBB \u0628\u0632\u0646\u06CC\u062F.", true);
    const d = s.data;
    if (act2 === "silent" || act2 === "pin") {
      d[act2] = d[act2] ? 0 : 1;
      await setSession(env, uid, "np_menu", d);
      await answer(env, q.id);
      return mid ? showMenu(env, uid, d, mid) : void 0;
    }
    if (act2 === "title") {
      await answer(env, q.id);
      await setSession(env, uid, "np_title", d);
      return void await send(env, uid, "\u0639\u0646\u0648\u0627\u0646 \u067E\u0633\u062A \u0631\u0627 \u0628\u0641\u0631\u0633\u062A\u06CC\u062F:");
    }
    if (act2 === "view") {
      await answer(env, q.id);
      await setSession(env, uid, "np_view", d);
      return void await send(env, uid, "\u067E\u0633 \u0627\u0632 \u0686\u0646\u062F \u0628\u0627\u0632\u062F\u06CC\u062F \u067E\u0633\u062A \u062D\u0630\u0641 \u0634\u0648\u062F\u061F \u0639\u062F\u062F \u0628\u0641\u0631\u0633\u062A\u06CC\u062F (\u06F0 = \u062E\u0627\u0645\u0648\u0634):");
    }
    if (act2 === "sch") {
      await answer(env, q.id);
      await setSession(env, uid, "np_when", d);
      return void await send(env, uid, "\u23F0 \u0632\u0645\u0627\u0646 \u0627\u0646\u062A\u0634\u0627\u0631 (\u0648\u0642\u062A \u062A\u0647\u0631\u0627\u0646):\n<code>18:30</code> \xB7 <code>\u0641\u0631\u062F\u0627 09:00</code> \xB7 <code>+45</code> \xB7 <code>1405/07/20 18:30</code>\n\u0644\u063A\u0648: /cancel");
    }
    if (act2 === "now") {
      const id = await createPost(env, uid, d, now());
      await clearSession(env, uid);
      await answer(env, q.id, "\u062F\u0631 \u062D\u0627\u0644 \u0627\u0631\u0633\u0627\u0644\u2026");
      if (d.kind === "file") {
        if (mid) await edit(env, uid, mid, `\u{1F680} \u067E\u0633\u062A #${id} \u062F\u0631 \u0635\u0641 \u0627\u0631\u0633\u0627\u0644 \u0642\u0631\u0627\u0631 \u06AF\u0631\u0641\u062A (\u062D\u062F\u0627\u06A9\u062B\u0631 \u062A\u0627 \u06CC\u06A9 \u062F\u0642\u06CC\u0642\u0647\u200C\u06CC \u062F\u06CC\u06AF\u0631 \u0627\u0631\u0633\u0627\u0644 \u0645\u06CC\u200C\u0634\u0648\u062F)\u2026`);
      } else {
        if (mid) await edit(env, uid, mid, `\u{1F680} \u067E\u0633\u062A #${id} \u062F\u0631 \u062D\u0627\u0644 \u0627\u0631\u0633\u0627\u0644\u2026`);
        c.wait(deliver(env, id));
      }
    }
  }
}

// eitaa-src/schema.ts
var SCHEMA = [
  "CREATE TABLE IF NOT EXISTS ea_users (\n  id INTEGER PRIMARY KEY,\n  name TEXT NOT NULL DEFAULT '',\n  username TEXT NOT NULL DEFAULT '',\n  eitaa_token_enc TEXT NOT NULL DEFAULT '',\n  eitaa_account TEXT NOT NULL DEFAULT '',\n  expires_at INTEGER,\n  banned INTEGER NOT NULL DEFAULT 0,\n  created_at INTEGER NOT NULL\n)",
  "CREATE TABLE IF NOT EXISTS ea_channels (\n  id INTEGER PRIMARY KEY AUTOINCREMENT,\n  user_id INTEGER NOT NULL,\n  chat_id TEXT NOT NULL,\n  title TEXT NOT NULL,\n  platform TEXT NOT NULL DEFAULT 'eitaa',\n  created_at INTEGER NOT NULL\n)",
  "CREATE INDEX IF NOT EXISTS idx_channels_user ON ea_channels(user_id)",
  "CREATE TABLE IF NOT EXISTS ea_posts (\n  id INTEGER PRIMARY KEY AUTOINCREMENT,\n  user_id INTEGER NOT NULL,\n  channel_id INTEGER NOT NULL,\n  kind TEXT NOT NULL,\n  text TEXT NOT NULL DEFAULT '',\n  file_id TEXT NOT NULL DEFAULT '',\n  file_name TEXT NOT NULL DEFAULT '',\n  title TEXT NOT NULL DEFAULT '',\n  silent INTEGER NOT NULL DEFAULT 0,\n  pin INTEGER NOT NULL DEFAULT 0,\n  view_delete INTEGER NOT NULL DEFAULT 0,\n  run_at INTEGER NOT NULL,\n  status TEXT NOT NULL DEFAULT 'pending',\n  error TEXT NOT NULL DEFAULT '',\n  eitaa_message_id TEXT NOT NULL DEFAULT '',\n  claimed_at INTEGER,\n  created_at INTEGER NOT NULL,\n  sent_at INTEGER,\n  src_url TEXT NOT NULL DEFAULT '',\n  job_id INTEGER\n)",
  "CREATE INDEX IF NOT EXISTS idx_posts_due ON ea_posts(status, run_at)",
  "CREATE INDEX IF NOT EXISTS idx_posts_user ON ea_posts(user_id, status)",
  "CREATE TABLE IF NOT EXISTS ea_sessions (\n  user_id INTEGER PRIMARY KEY,\n  state TEXT NOT NULL DEFAULT '',\n  data TEXT NOT NULL DEFAULT '{}',\n  updated_at INTEGER NOT NULL\n)",
  "CREATE TABLE IF NOT EXISTS agent_jobs (\n  id INTEGER PRIMARY KEY AUTOINCREMENT,\n  user_id INTEGER NOT NULL,\n  channel_id INTEGER NOT NULL,            \n  name TEXT NOT NULL DEFAULT '',\n  instruction TEXT NOT NULL,              \n  times TEXT NOT NULL DEFAULT '[]',       \n  days TEXT,                              \n  once_at INTEGER,                        \n  footer TEXT NOT NULL DEFAULT '',        \n  approve INTEGER NOT NULL DEFAULT 0,     \n  enabled INTEGER NOT NULL DEFAULT 1,\n  run_now INTEGER NOT NULL DEFAULT 0,     \n  last_key TEXT NOT NULL DEFAULT '',      \n  retry_at INTEGER,                       \n  attempts INTEGER NOT NULL DEFAULT 0,\n  last_info TEXT NOT NULL DEFAULT '',\n  created_at INTEGER NOT NULL\n)",
  "CREATE INDEX IF NOT EXISTS idx_agent_user ON agent_jobs(user_id)",
  "CREATE TABLE IF NOT EXISTS agent_seen (\n  job_id INTEGER NOT NULL,\n  k TEXT NOT NULL,                        \n  seen_at INTEGER NOT NULL,\n  PRIMARY KEY (job_id, k)\n)",
  "CREATE TABLE IF NOT EXISTS ea_kv (\n  k TEXT PRIMARY KEY,\n  v TEXT NOT NULL DEFAULT ''\n)",
  "CREATE TABLE IF NOT EXISTS ea_pubs (\n  post_id INTEGER PRIMARY KEY,\n  user_id INTEGER NOT NULL,\n  grp_chat TEXT NOT NULL DEFAULT '',\n  grp_msg INTEGER NOT NULL DEFAULT 0,\n  verdict TEXT NOT NULL DEFAULT '',\n  note TEXT NOT NULL DEFAULT '',\n  updated_at INTEGER NOT NULL DEFAULT 0\n)",
  "CREATE TABLE IF NOT EXISTS ea_lessons (\n  id INTEGER PRIMARY KEY AUTOINCREMENT,\n  user_id INTEGER NOT NULL,\n  rule TEXT NOT NULL,\n  source TEXT NOT NULL DEFAULT '',\n  created_at INTEGER NOT NULL\n)",
  "CREATE INDEX IF NOT EXISTS idx_lessons_user ON ea_lessons(user_id)",
  "CREATE TABLE IF NOT EXISTS ea_events (\n  id INTEGER PRIMARY KEY AUTOINCREMENT,\n  user_id INTEGER NOT NULL,\n  kind TEXT NOT NULL,\n  payload TEXT NOT NULL DEFAULT '',\n  status TEXT NOT NULL DEFAULT 'new',\n  created_at INTEGER NOT NULL\n)",
  "CREATE TABLE IF NOT EXISTS ea_council (\n  id INTEGER PRIMARY KEY AUTOINCREMENT,\n  user_id INTEGER NOT NULL,\n  role TEXT NOT NULL,\n  text TEXT NOT NULL,\n  created_at INTEGER NOT NULL\n)",
  "CREATE TABLE IF NOT EXISTS ea_asks (\n  id INTEGER PRIMARY KEY AUTOINCREMENT,\n  user_id INTEGER NOT NULL,\n  role TEXT NOT NULL DEFAULT 'sup',\n  question TEXT NOT NULL,\n  answer TEXT NOT NULL DEFAULT '',\n  status TEXT NOT NULL DEFAULT 'open',\n  created_at INTEGER NOT NULL\n)",
  "CREATE INDEX IF NOT EXISTS idx_council_user ON ea_council(user_id)",
  "CREATE TABLE IF NOT EXISTS ea_mirror (\n  channel_id INTEGER NOT NULL,\n  src_id INTEGER NOT NULL,\n  tg_msg INTEGER NOT NULL DEFAULT 0,\n  hash TEXT NOT NULL DEFAULT '',\n  has_media INTEGER NOT NULL DEFAULT 0,\n  updated_at INTEGER NOT NULL,\n  PRIMARY KEY (channel_id, src_id)\n)"
];

// eitaa-src/entry.ts
function adapt(host, access) {
  return {
    ...host,
    BOT_TOKEN: host.TELEGRAM_TOKEN,
    SECRET_KEY: host.EITAA_SECRET_KEY || `ea:${host.WEBHOOK_SECRET || host.TELEGRAM_TOKEN}`,
    WEBHOOK_SECRET: host.WEBHOOK_SECRET || "",
    ADMIN_IDS: String(host.OWNER_ID || ""),
    EA_ACCESS: access,
    EA_MODEL: host.MODEL || "@cf/google/gemma-4-26b-a4b-it"
  };
}
async function ensureSchema(host) {
  await host.DB.batch(SCHEMA.map((s) => host.DB.prepare(s)));
}
async function handle(host, access, update, wait) {
  await handleUpdate({ env: adapt(host, access), wait }, update);
}
async function cron(host) {
  await tick(adapt(host, true));
  try {
    await syncAllUsers(adapt(host, true));
  } catch (e) {
    console.error("allposts failed", e.message);
  }
  try {
    await syncMirrors(adapt(host, true));
  } catch (e) {
    console.error("mirror failed", e.message);
  }
  try {
    await doctorTick(adapt(host, true));
  } catch (e) {
    console.error("doctor failed", e.message);
  }
  try {
    await processCouncil(adapt(host, true));
  } catch (e) {
    console.error("council tick failed", e.message);
  }
}
var webPage = () => appPage();
async function webApi(host, request, path) {
  return api(adapt(host, true), request, path);
}
async function handleGroup(host, update, wait, hasAccess2) {
  const m = update.message;
  if (!m || !m.from || m.chat.type === "private") return false;
  const env = adapt(host, true), text = (m.text || "").trim();
  const say = (t) => tg(env, "sendMessage", { chat_id: m.chat.id, text: t, parse_mode: "HTML", disable_web_page_preview: true, ...m.message_thread_id ? { message_thread_id: m.message_thread_id } : {} }).catch(() => null);
  const cmd = /^\/(eagroup|eaoff)(?:@\w+)?(?:\s|$)/i.exec(text);
  if (cmd) {
    if (!await hasAccess2(m.from.id)) return true;
    await touchUser(env, m.from.id, m.from.first_name || "", m.from.username || "");
    if (cmd[1].toLowerCase() === "eaoff") {
      const g2 = await getGroup(env, m.from.id);
      if (g2 && g2.chat === String(m.chat.id)) {
        await dropGroup(env, m.from.id);
        await say("\u{1F50C} \u0627\u06CC\u0646 \u06AF\u0631\u0648\u0647 \u062F\u06CC\u06AF\u0631 \u06AF\u0631\u0648\u0647 \u067E\u0633\u062A\u200C\u0647\u0627 \u0646\u06CC\u0633\u062A.");
      }
      return true;
    }
    await say(await setupGroup(env, m.from.id, m.chat.id, m.chat.title || ""));
    return true;
  }
  const owner = await groupOwner(env, m.chat.id);
  if (owner === null) return false;
  const g = await getGroup(env, owner);
  if (!g || m.from.id !== owner || !text || text.startsWith("/") || !(g.topics.chat || g.topics.council) || ![g.topics.chat, g.topics.council].includes(m.message_thread_id)) return true;
  const last = Number(await kvGet(env, `gmlast:${m.chat.id}`) || 0);
  if (m.message_id <= last) return true;
  await kvSet(env, `gmlast:${m.chat.id}`, String(m.message_id));
  if (g.topics.council && m.message_thread_id === g.topics.council) {
    await ownerSpoke(env, owner, text);
    return true;
  }
  const user = await touchUser(env, owner, m.from.first_name || "", m.from.username || "");
  if (!user.eitaa_token_enc || !(await userChannels(env, owner)).length) {
    await say("\u0627\u0628\u062A\u062F\u0627 \u062F\u0631 \u0631\u0628\u0627\u062A \u062A\u0648\u06A9\u0646 \u0627\u06CC\u062A\u0627\u06CC\u0627\u0631 \u0631\u0627 \u062B\u0628\u062A \u0648 \u06CC\u06A9 \u06A9\u0627\u0646\u0627\u0644 \u0627\u0636\u0627\u0641\u0647 \u06A9\u0646\u06CC\u062F.");
    return true;
  }
  const before = await getSession(env, owner);
  const renv = { ...env, EA_REDIRECT: { from: owner, chat: m.chat.id, thread: m.message_thread_id || 0 } };
  try {
    await turn2({ env: renv, wait }, user, m, text, {});
  } finally {
    await setSession(env, owner, before.state, before.data);
  }
  return true;
}
export {
  SCHEMA,
  adapt,
  chatJson,
  cleanArgs,
  cleanText,
  cron,
  ensureSchema,
  explainError,
  handle,
  handleGroup,
  parseMessages,
  resolvePost,
  wantedCounts,
  webApi,
  webPage
};
