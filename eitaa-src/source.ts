// Reading PUBLIC Eitaa channels through their web preview page, plus text cleaning (removing the source channel's signature).
// The parser is deliberately tolerant: it understands the Telegram-widget style markup (`*_widget_message_*` classes and
// `data-post="channel/ID"`) that web previews of this family use. Use the bot's "🔬 تست منبع" button to verify a source.
import { Env, eitaaWeb } from "./env";
import { normDigits } from "./util";

export interface SrcMsg { source: string; id: string; text: string; ts: number | null; image: string; video: boolean; videoUrl: string; sticker: boolean }
export interface FetchResult { ok: boolean; status: number; messages: SrcMsg[]; title: string; note: string; snippet: string; hint?: string }

const ENT: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " ", laquo: "«", raquo: "»", hellip: "…", zwnj: "‌" };
export const unescapeHtml = (s: string): string =>
  s.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, e: string) => {
    if (e[0] === "#") { const n = e[1].toLowerCase() === "x" ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10); try { return String.fromCodePoint(n); } catch { return m; } }
    return ENT[e.toLowerCase()] ?? m;
  });

export function htmlToText(html: string): string {
  const t = unescapeHtml(html
    .replace(/<br\s*\/?>/gi, "\n").replace(/<\/(p|div|li)>/gi, "\n").replace(/<[^>]+>/g, ""))
    .replace(/ /g, " ").replace(/[ \t]+\n/g, "\n").replace(/\n{3,}/g, "\n\n");
  return t.trim();
}

const escRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** Loose normalisation for matching: Arabic letters -> Persian, digits -> latin, no diacritics/ZWNJ, lower case. */
export const norm = (s: string): string =>
  normDigits(s).replace(/ي/g, "ی").replace(/ك/g, "ک").replace(/[ً-ٟـ‌‏‎]/g, "").toLowerCase();

export function parseMessages(html: string, source: string, base: string): SrcMsg[] {
  const marks: { at: number; id: string }[] = [];
  const re = /data-post=["']([^"']+)["']/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html))) marks.push({ at: m.index, id: m[1] });
  const out: SrcMsg[] = [];
  const abs = (u: string) => { try { return new URL(unescapeHtml(u), base + "/").toString(); } catch { return ""; } };
  for (let i = 0; i < marks.length; i++) {
    const block = html.slice(marks[i].at, i + 1 < marks.length ? marks[i + 1].at : html.length);
    if (/service_message/.test(block.slice(0, 400))) continue;
    const id = marks[i].id.split("/").pop() || "";
    if (!/^\d+$/.test(id)) continue;
    let text = "";
    const tre = /<div[^>]+class=["']([^"']*_widget_message_text[^"']*)["'][^>]*>([\s\S]*?)<\/div>/gi;
    let tm: RegExpExecArray | null;
    while ((tm = tre.exec(block))) if (!/reply/.test(tm[1])) text = htmlToText(tm[2]);
    const dt = block.match(/<time[^>]+datetime=["']([^"']+)["']/i);
    const ts = dt && !isNaN(Date.parse(dt[1])) ? Math.floor(Date.parse(dt[1]) / 1000) : null;
    const bgOf = (tag: string) => { const m = tag.match(/background-image:\s*url\(\s*(?:&quot;|&#0?39;|['"])?([^'")&]+(?:&amp;[^'")&]+)*)(?:&quot;|&#0?39;|['"])?\s*\)/i); return m ? m[1] : ""; };
    const cls = (tag: string) => (tag.match(/class=["']([^"']*)["']/i) || ["", ""])[1];
    // every tag that carries a background image / <img>, classified by its class name
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
      if (/video/i.test(c) && /thumb|wrap|player|_video/i.test(c)) { const u = bgOf(tag) || (tag.match(/\s(?:src|data-src)=["']([^"']+)["']/i) || [])[1] || ""; if (u && !thumb) thumb = abs(u); const dv = tag.match(/data-(?:video|src|href)=["']([^"']+\.(?:mp4|webm|mov)[^"']*)["']/i); if (dv && !videoUrl) videoUrl = abs(dv[1]); continue; }
      if (/photo|image|pic|_media|grouped/i.test(c) && !/sticker/i.test(c)) {
        const u = bgOf(tag) || (tm2[1].toLowerCase() === "img" ? (tag.match(/\s(?:src|data-src)=["']([^"']+)["']/i) || [])[1] || "" : "");
        if (u && !image) image = abs(u);
      }
    }
    if (!image && !videoUrl && !thumb) {      // last resort: the first background image of the message that is not a sticker / avatar
      for (const tag of block.matchAll(/<[^>]+background-image[^>]*>/gi)) {
        if (/user_photo|avatar|sticker/i.test(cls(tag[0]))) continue;
        const u = bgOf(tag[0]); if (u) { image = abs(u); break; }
      }
    }
    // stickers: the static .webp is in data-webp (or the background image of the *_sticker element)
    let sticker = false;
    if (!image && !videoUrl && !thumb) {
      const wp = block.match(/data-webp=["']([^"']+)["']/i);
      let su = wp ? wp[1] : "";
      if (!su) for (const tag of block.matchAll(/<[^>]+class=["'][^"']*_sticker[^"']*["'][^>]*>/gi)) {
        const bg = bgOf(tag[0]) || (tag[0].match(/(?:src|data-src)=["']([^"']+\.webp[^"']*)["']/i) || [])[1];
        if (bg) { su = bg; break; }
      }
      if (su) { image = abs(su); sticker = true; }
    }
    const video = !!videoUrl || /_widget_message_video|<video[\s>]|video_thumb|round_video/i.test(block);
    if (video && !image) image = thumb;       // a video we cannot download (no src) is still shown through its thumbnail
    if (!text && !image && !videoUrl) continue;
    out.push({ source, id, text, ts, image, video, videoUrl, sticker });
  }
  return out;
}

export function pageTitle(html: string): string {
  const mt = html.match(/<meta[^>]+property=["']og:title["'][^>]+content=["']([^"']*)["']/i) || html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  return mt ? unescapeHtml(mt[1]).replace(/\s[-–|]\s*(?:Eitaa|ایتا)\s*$/i, "").trim().slice(0, 100) : "";
}

async function getPage(url: string): Promise<{ status: number; html: string }> {
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), 15_000);
  try {
    const r = await fetch(url, { headers: { "user-agent": "Mozilla/5.0 (compatible; MedyasBot/1.0)", "accept-language": "fa,en;q=0.8" }, redirect: "follow", signal: ctl.signal });
    return { status: r.status, html: r.status === 200 ? (await r.text()).slice(0, 600_000) : "" };
  } finally { clearTimeout(timer); }
}

export async function fetchChannel(env: Env, source: string): Promise<FetchResult> {
  const base = eitaaWeb(env), name = source.replace(/^@/, "");
  let last: FetchResult = { ok: false, status: 0, messages: [], title: "", note: "", snippet: "" };
  for (const path of [`/${name}`, `/s/${name}`]) {
    try {
      const { status, html } = await getPage(`${base}${path}`);
      if (status === 404) { last = { ...last, status, note: "کانال پیدا نشد (۴۰۴)" }; continue; }
      if (status !== 200) { last = { ...last, status, note: `پاسخ HTTP ${status}` }; continue; }
      const messages = parseMessages(html, name, base);
      last = { ok: messages.length > 0, status, messages, title: pageTitle(html),
        note: messages.length ? "" : "صفحه باز شد ولی پیامی در آن شناسایی نشد (کانال عمومی نیست یا ساختار صفحه فرق دارد)",
        hint: `background-image:${(html.match(/background-image/gi) || []).length} video:${(html.match(/<video/gi) || []).length} img:${(html.match(/<img/gi) || []).length}`,
        snippet: htmlToText(html.replace(/<(script|style)[\s\S]*?<\/\1>/gi, "")).slice(0, 400) };
      if (messages.length) return last;
    } catch (e) { last = { ...last, note: `خطای شبکه: ${(e as Error).message}` }; }
  }
  return last;
}

/** Download an image (or small file) from a URL with a size cap. */
export async function fetchBytes(url: string, maxBytes: number, referer?: string): Promise<{ bytes: Uint8Array; type: string }> {
  const r = await fetch(url, { headers: { "user-agent": "Mozilla/5.0 (compatible; MedyasBot/1.0)", ...(referer ? { referer } : {}) }, redirect: "follow" });
  if (!r.ok) throw new Error(`دانلود فایل منبع ناموفق بود (HTTP ${r.status})`);
  const len = parseInt(r.headers.get("content-length") || "0", 10);
  if (len > maxBytes) throw new Error("حجم فایل منبع زیاد است");
  const buf = new Uint8Array(await r.arrayBuffer());
  if (buf.length > maxBytes) throw new Error("حجم فایل منبع زیاد است");
  return { bytes: buf, type: r.headers.get("content-type") || "" };
}
export const extFor = (type: string, url: string): string => {
  const t = type.toLowerCase();
  if (t.includes("png")) return "png"; if (t.includes("webp")) return "webp"; if (t.includes("gif")) return "gif"; if (t.includes("jpeg") || t.includes("jpg")) return "jpg";
  const m = url.split("?")[0].match(/\.(jpe?g|png|webp|gif)$/i);
  return m ? m[1].toLowerCase().replace("jpeg", "jpg") : "jpg";
};

// ------------------------------------------------------------------ cleaning
const PLATFORM_LINK = /(eitaa\.(com|ir)|t\.me|telegram\.(me|org)|ble\.ir|rubika\.ir|instagram\.com|wa\.me|chat\.whatsapp\.com|igap\.net|gap\.im|splus\.ir|sapp\.ir|soroush|youtube\.com|youtu\.be|aparat\.com|twitter\.com|x\.com|linkedin\.com|bit\.ly|tinyurl\.com)\b/i;
const PROMO = /(عضو\s*(شوید|شو|بشید|شین)|عضویت|ورود\s*به\s*(کانال|گروه)|لینک\s*(کانال|گروه|ورود)|(کانال|گروه|پیج|صفحه)\s*(ما|رسمی|اصلی|مان)|ما\s*را\s*(در\s*\S+\s*)?(دنبال|همراهی)|مارا\s*دنبال|دنبال\s*کنید|\bjoin\b|\bsubscribe\b|فالو\s*کنید|ارتباط\s*با\s*(ما|ادمین)|تبلیغات|سفارش\s*تبلیغ|بیشتر\s*بخوانید|ادامه\s*(مطلب|ی\s*مطلب|خبر)|برای\s*(دیدن|خواندن|مشاهده|مطالعه)[^\n]{0,40}(کلیک|لینک|کانال)|کلیک\s*کنید|ثبت\s*نام\s*کنید|دانلود\s*کنید)/i;
const SIG_EMOJI_LINE = /^[\s\p{Extended_Pictographic}️‍🆔📢📣🔰🌐📲🔗👇👈⬇️➡️•\-–—|:]*[\s\S]*$/u;
const SEPARATOR = /^[\s\-_=~*•·.─━═▬➖〰⎯┄┈┅━➰✦✧❖◾◽⚡️⭐️🔸🔹🔻▪️▫️■□◆◇♦️—–|\\\/:]{3,}$/u;
const HANDLE_G = /(^|[^A-Za-z0-9_.])@[A-Za-z0-9_]{4,}(?![A-Za-z0-9_])/g;
const URL_G = /(?:https?:\/\/|www\.)[^\s<>"'،؛»]+/gi;
const SIG_HINT = /(کانال|گروه|پیج|ایتا|تلگرام|بله|روبیکا|اینستاگرام|آپارات|لینک|عضو|دنبال|همراه|رسمی|مرجع|پایگاه|خبرگزاری|channel|telegram|instagram|eitaa|join|follow)/i;

const words = (s: string): string[] => norm(s).replace(/[\p{P}\p{S}]+/gu, " ").split(/\s+/).filter((w) => w.length >= 3);
const compact = (s: string): string => norm(s).replace(/[\s\p{P}\p{S}]+/gu, "");

/** A line that only identifies/promotes a channel (a signature), judged generously: it is at the END of a post, so a false positive costs little. */
const isSigLine = (line: string, title = "", source = ""): boolean => {
  const bare = line.replace(/[\s\p{P}\p{S}‌‏]+/gu, "");
  if (!bare) return true;                                             // only decoration / emoji / separators
  if (SEPARATOR.test(line.trim())) return true;
  if (line.length > 110) return false;                                // a real sentence is never a signature
  const noUrl = line.replace(URL_G, "").replace(/@[A-Za-z0-9_.]+/g, "").replace(/[\s\p{P}\p{S}‌‏]+/gu, "");
  const hasRef = /@[A-Za-z0-9_.]{3,}/.test(line) || PLATFORM_LINK.test(line) || URL_G.test(line);
  URL_G.lastIndex = 0;
  const restWords = line.replace(URL_G, " ").replace(/@[A-Za-z0-9_.]+/g, " ").split(/[\s\p{P}\p{S}]+/u).filter((w) => w.length > 1).length;
  URL_G.lastIndex = 0;
  if (hasRef && (restWords <= 4 || SIG_HINT.test(line)) && (noUrl.length <= 60 || SIG_HINT.test(line))) return true;   // a sentence with 5+ real words that merely mentions an @id is content, not a signature
  if (PROMO.test(line) && line.length <= 90) return true;
  const c = compact(line), t = compact(title), s = compact(source);
  if (t.length >= 3 && c.includes(t) && c.length <= t.length + 24) return true;
  if (s.length >= 4 && c.includes(s) && c.length <= s.length + 24) return true;
  const tw = words(title);                                            // fuzzy: most of the title's words appear in a short line
  if (tw.length >= 2 && line.length <= 70) { const lw = new Set(words(line)); if (tw.filter((w) => lw.has(w)).length / tw.length >= 0.6) return true; }
  if (/^[\s\p{Extended_Pictographic}️‍🆔📢📣🔰🌐📲🔗👇👈]+/u.test(line) && line.length <= 70 && SIG_HINT.test(line) && SIG_EMOJI_LINE.test(line)) return true;
  return false;
};

/** Removes every @handle and link from a text except those listed in `keep` (lower case, without @) — nothing from a source channel may survive. */
export function stripHandles(text: string, keep: string[] = []): string {
  const k = new Set(keep.map((x) => x.toLowerCase().replace(/^@/, "")));
  let t = text.replace(URL_G, (u) => (k.size && [...k].some((h) => u.toLowerCase().includes(h)) ? u : ""))
    .replace(HANDLE_G, (m, pre: string) => (k.has(m.slice(pre.length + 1).toLowerCase()) ? m : pre));
  t = t.split("\n").map((l) => l.replace(/[ \t]{2,}/g, " ").replace(/[ \t]+$/g, "")).join("\n");
  return t;
}

/** Cuts the signature block of a post: a separator + short tail, then any trailing signature-like lines, and a leading handle line. */
export function cutSignature(lines: string[], title: string, source: string): string[] {
  const total = lines.join("\n").length;
  for (let i = Math.max(1, lines.length - 6); i < lines.length; i++) {          // "—— separator ——  + up to 4 short lines" at the end
    if (SEPARATOR.test(lines[i].trim()) && lines.slice(0, i).join("\n").trim().length >= total * 0.4 && lines.slice(i + 1).join("\n").length <= 260 && lines.slice(i + 1).some((l) => isSigLine(l, title, source) || SIG_HINT.test(l))) { lines = lines.slice(0, i); break; }
  }
  while (lines.length > 1 && isSigLine(lines[lines.length - 1], title, source)) lines.pop();
  if (lines.length === 1 && lines[0].trim() && isSigLine(lines[0], title, source) && !lines[0].replace(/[\s\p{P}\p{S}]+/gu, "")) lines = [];
  while (lines.length > 1 && isSigLine(lines[0], title, source) && lines[0].length < 80 && (/@|\/\/|eitaa|ایتا/i.test(lines[0]) || !lines[0].replace(/[\s\p{P}\p{S}]+/gu, "") || PROMO.test(lines[0]))) lines.shift();
  return lines;
}

/** Removes the source channel's handle/link everywhere and its signature block at the end (and a stray handle line at the start). */
export function cleanText(text: string, source: string, title = ""): string {
  let t = text
    .replace(new RegExp(`https?://(?:www\\.)?eitaa\\.com/(?:s/)?${escRe(source)}\\S*`, "gi"), "")
    .replace(new RegExp(`@${escRe(source)}(?![A-Za-z0-9_])`, "gi"), "");
  let lines = t.split("\n").map((l) => l.replace(/[ \t]+$/g, ""));
  lines = cutSignature(lines, title, source);
  t = stripHandles(lines.join("\n"));                                           // other channels' handles/links inside the body are promotion too
  lines = cutSignature(t.split("\n"), title, source);                           // a second pass: removing a handle can expose a bare signature line
  return lines.join("\n").replace(/[ \t]+\n/g, "\n").replace(/\n{3,}/g, "\n\n").trim();
}
export { isSigLine };
