// تست محلی ورکر با D1 شبیه‌سازی‌شده (SQLite) و Workers AI / Telegram شبیه‌سازی‌شده
// اجرا: node test/worker.test.mjs   (Node 22+)
import { DatabaseSync } from 'node:sqlite';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import worker from '../src/index.js';
import { parseMessages, resolvePost, explainError } from '../src/eitaa.js';

// ---------- D1 mock ----------
function makeD1() {
  const db = new DatabaseSync(':memory:');
  const wrap = (sql, params = []) => ({
    bind: (...p) => wrap(sql, p),
    run: async () => {
      const r = db.prepare(sql).run(...params);
      return { success: true, meta: { changes: Number(r.changes), last_row_id: Number(r.lastInsertRowid) } };
    },
    first: async () => db.prepare(sql).get(...params) ?? null,
    all: async () => ({ results: db.prepare(sql).all(...params).map((r) => ({ ...r })), success: true }),
  });
  return {
    prepare: (s) => wrap(s),
    batch: async (stmts) => {
      const out = [];
      for (const s of stmts) out.push(await s.run());
      return out;
    },
    raw: db,
  };
}

// ---------- fixtures ----------
const DDG_HTML = `<div class="result results_links"><h2 class="result__title"><a rel="nofollow" class="result__a" href="//duckduckgo.com/l/?uddg=https%3A%2F%2Fexample.com%2Farticle1&amp;rut=abc">Dollar price <b>today</b></a></h2><a class="result__snippet" href="//duckduckgo.com/l/?uddg=https%3A%2F%2Fexample.com%2Farticle1&amp;rut=abc">The dollar is at <b>100</b> today.</a></div>
<div class="result"><a class="result__a" href="https://duckduckgo.com/y.js?ad_provider=x">ad</a></div>`;
const BING_HTML = `<ol><li class="b_algo"><h2><a href="https://www.bing.com/ck/a?!&amp;&amp;p=xyz&amp;u=a1aHR0cHM6Ly9leGFtcGxlLm9yZy9wYWdl&amp;ntb=1">Example Page</a></h2><div class="b_caption"><p>Snippet text here</p></div></li></ol>`;
const PAGE_HTML = `<html><head><title>My Article</title><style>.x{}</style></head><body><nav>menu</nav><article><h1>Heading</h1><p>${'Hello world. '.repeat(120)}</p><script>var x=1</script></article><footer>foot</footer></body></html>`;
const TINY_JPEG_B64 = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3, 4, 5, 0xff, 0xd9]).toString('base64');

const NOW_ISO = new Date().toISOString();
const msgHtml = (id, inner, text) => `<div class="etme_widget_message_wrap"><div class="etme_widget_message" data-post="srcchan/${id}">${inner}${text ? `<div class="etme_widget_message_text js-message_text">${text}</div>` : ''}<span class="etme_widget_message_meta"><time datetime="${NOW_ISO}">x</time></span></div></div>`;
let mirrMsgs = [], cfMode = 'ok'; const cfCalls = [];
const mh = (id, text, img) => `<div class="etme_widget_message_wrap"><div class="etme_widget_message" data-post="mirrchan/${id}">${img ? `<a class="etme_widget_message_photo_wrap" style="background-image:url('https://cdn.eitaa.test/m${id}.jpg')"></a>` : ''}<div class="etme_widget_message_text js-message_text">${text}</div><span class="etme_widget_message_meta"><time datetime="${NOW_ISO}">x</time></span></div></div>`;
const mirrPage = () => '<html><head><title>Mirr - Eitaa</title></head><body>' + mirrMsgs.map((m) => mh(m[0], m[1], m[2])).join('') + '</body></html>';
const SRC_PAGE = '<html><head><title>Src - Eitaa</title></head><body>' +
  msgHtml(1, '', 'فقط متن ساده برای تست') +
  msgHtml(2, `<a class="etme_widget_message_photo_wrap" href="https://eitaa.com/srcchan/2" style="width:453px;background-image:url('https://cdn.eitaa.test/p2.jpg')"></a>`, 'عکس خبر ورزشی امروز\n🆔 @srcchan') +
  msgHtml(3, `<div class="etme_widget_message_video_player"><a class="etme_widget_message_video_wrap"><video src="https://cdn.eitaa.test/v3.mp4" class="etme_widget_message_video js-message_video" poster="https://cdn.eitaa.test/t3.jpg"></video></a></div>`, 'ویدیوی ورزشی') +
  msgHtml(4, `<a class="etme_widget_message_video_thumb" style="background-image:url('https://cdn.eitaa.test/t4.jpg')"></a>`, 'ویدیوی بزرگ بدون لینک') +
  '</body></html>';

// ---------- global mocks ----------
let tgCalls = [];
let topicSeq = 0, msgSeq = 0, eitaaDeleteOk = true;
let ddgMode = 'ok'; // ok | empty
const eitaaCalls = [];
globalThis.fetch = async (url, init = {}) => {
  url = String(url);
  if (url.startsWith('https://api.telegram.org/file/')) return new Response(new Uint8Array([1, 2, 3, 4, 5, 6]));
  if (url.startsWith('https://api.telegram.org/bot')) {
    const method = url.split('/').pop();
    let payload = {};
    if (typeof init.body === 'string') payload = JSON.parse(init.body);
    else if (init.body instanceof FormData) payload = Object.fromEntries([...init.body.entries()].map(([k, v]) => [k, v instanceof Blob ? `<blob ${v.size}>` : v]));
    tgCalls.push({ method, payload });
    if (method === 'getFile') return Response.json({ ok: true, result: { file_path: 'photos/file_1.jpg', file_size: 1000 } });
    if (method === 'getMe') return Response.json({ ok: true, result: { username: 'testbot', first_name: 'Test' } });
    if (method === 'getWebhookInfo') return Response.json({ ok: true, result: { url: '' } });
    if (method === 'getChat') return Response.json({ ok: true, result: { is_forum: true } });
    if (method === 'getChatMember') return Response.json({ ok: true, result: { status: 'administrator', can_manage_topics: true, can_delete_messages: true } });
    if (method === 'createForumTopic') return Response.json({ ok: true, result: { message_thread_id: 500 + ++topicSeq } });
    return Response.json({ ok: true, result: { message_id: 5000 + ++msgSeq } });
  }
  if (url.startsWith('https://eitaayar.ir/api/bot')) {
    const method = url.split('/').pop();
    let form = {};
    if (init.body instanceof FormData) form = Object.fromEntries([...init.body.entries()].map(([k, v]) => [k, v instanceof Blob ? '<blob>' : v]));
    eitaaCalls.push({ method, form, at: tgCalls.length });
    if (method === 'deleteMessage' && !eitaaDeleteOk) return Response.json({ ok: false, description: 'method not found' });
    if (method === 'getMe') return Response.json({ ok: true, result: { username: 'acc_eitaa' } });
    return Response.json({ ok: true, result: { message_id: 77 } });
  }
  if (url === 'https://eitaa.com/mirrchan') return new Response(mirrPage(), { headers: { 'content-type': 'text/html' } });
  if (url.startsWith('https://api.cloudflare.com/client/v4/accounts/') && url.endsWith('/chat/completions')) { cfCalls.push({ url, auth: init.headers.authorization }); return Response.json(cfMode === 'ok' ? { choices: [{ message: { role: 'assistant', content: 'ok' } }] } : { errors: [{ message: 'bad' }] }, { status: cfMode === 'ok' ? 200 : 403 }); }
  if (url === 'https://api.cloudflare.com/client/v4/user/tokens/verify') return Response.json({ result: { status: 'active' } });
  if (url === 'https://api.cloudflare.com/client/v4/accounts') return Response.json({ result: [{ id: 'a'.repeat(32) }] });
  if (url === 'https://eitaa.com/srcchan') return new Response(SRC_PAGE, { headers: { 'content-type': 'text/html' } });
  if (url.startsWith('https://cdn.eitaa.test/')) return new Response(new Uint8Array(url.endsWith('.mp4') ? 5000 : 3000).fill(7), { headers: { 'content-type': url.endsWith('.mp4') ? 'video/mp4' : 'image/jpeg' } });
  if (url.startsWith('https://eitaa.com')) return new Response('busy', { status: 503 });
  if (url.startsWith('https://html.duckduckgo.com')) return new Response(ddgMode === 'ok' ? DDG_HTML : '<html>anomaly</html>');
  if (url.startsWith('https://www.bing.com/search')) return new Response(BING_HTML);
  if (url.startsWith('https://example.com/article1')) return new Response(PAGE_HTML, { headers: { 'content-type': 'text/html; charset=utf-8' } });
  return new Response('not mocked: ' + url, { status: 404 });
};

const aiCalls = [];
const aiQueue = [];
const env = {
  DB: makeD1(),
  TELEGRAM_TOKEN: '123:abc',
  WEBHOOK_SECRET: 'sec',
  OWNER_ID: '1000',
  BRAND_NAME: 'تست‌بات',
  WORKER_URL: 'https://w.example.workers.dev',
  AI: {
    run: async (model, input) => {
      aiCalls.push({ model, input });
      const next = aiQueue.shift();
      if (next instanceof Error) throw next;
      if (typeof next === 'function') return next(model, input);
      if (next !== undefined) return next;
      // پیش‌فرض هوشمند
      if (model.includes('flux')) return { image: TINY_JPEG_B64 };
      if (model.includes('whisper')) return { text: 'سلام این یک پیام صوتی است' };
      const last = input.messages[input.messages.length - 1];
      const txt = typeof last.content === 'string' ? last.content : JSON.stringify(last.content);
      if (input.tools && /search tool/.test(txt)) return { choices: [{ message: { content: '', tool_calls: [{ id: 't1', type: 'function', function: { name: 'web_search', arguments: '{"query":"x"}' } }] } }] };
      if (/image_url/.test(txt) && /color/.test(txt)) return { choices: [{ message: { content: 'Red' } }] };
      return { choices: [{ message: { content: 'پاسخ پیش‌فرض' } }] };
    },
  },
};

let uid = 100;
const U = (id, name = 'Ali', username = 'ali') => ({ id, first_name: name, username });
async function send(part, from = U(2000), chat = null, updateId = null) {
  const update = { update_id: updateId ?? ++uid, message: { message_id: uid, from, chat: chat || { id: from.id, type: 'private' }, date: 0, ...part } };
  const res = await worker.fetch(new Request('https://w.example.workers.dev/telegram', { method: 'POST', headers: { 'x-telegram-bot-api-secret-token': 'sec', 'content-type': 'application/json' }, body: JSON.stringify(update) }), env);
  return { res, update };
}
const sent = (chatId) => tgCalls.filter((c) => c.method === 'sendMessage' && (chatId == null || c.payload.chat_id === chatId));
const reset = () => {
  tgCalls = [];
  aiCalls.length = 0;
  aiQueue.length = 0;
  ddgMode = 'ok';
};
const dbq = (sql, ...p) => env.DB.raw.prepare(sql).all(...p);

// ---------- runner ----------
const tests = [];
const test = (name, fn) => tests.push([name, fn]);

test('schema.sql مطابق SCHEMA داخل کد است', async () => {
  const sql = fs.readFileSync(new URL('../schema.sql', import.meta.url), 'utf8');
  const fresh = new DatabaseSync(':memory:');
  fresh.exec(sql);
  const t1 = fresh.prepare("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name").all().map((r) => r.name);
  await worker.fetch(new Request('https://w.example.workers.dev/health'), env);
  await send({ text: '/id' });
  const t2 = dbq("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name").map((r) => r.name).filter((n) => !n.startsWith('sqlite_'));
  assert.deepEqual(t1.filter((n) => !n.startsWith('sqlite_')), t2);
});

test('webhook secret اشتباه رد می‌شود', async () => {
  const res = await worker.fetch(new Request('https://w.example.workers.dev/telegram', { method: 'POST', headers: { 'x-telegram-bot-api-secret-token': 'bad' }, body: '{}' }), env);
  assert.equal(res.status, 403);
});

test('/start پیام خوش‌آمد با نام برند', async () => {
  reset();
  await send({ text: '/start' });
  const m = sent(2000);
  assert.equal(m.length, 1);
  assert.match(m[0].payload.text, /تست‌بات/);
  assert.equal(aiCalls.length, 0);
});

test('گفتگوی عادی + جستجوی وب (tool loop) + HTML', async () => {
  reset();
  aiQueue.push({ choices: [{ message: { content: '', tool_calls: [{ id: 'c1', type: 'function', function: { name: 'web_search', arguments: '{"query":"dollar price"}' } }] } }] });
  aiQueue.push({ choices: [{ message: { content: 'قیمت **۱۰۰** است. منبع: [مثال](https://example.com/article1)' } }] });
  await send({ text: 'قیمت دلار امروز چنده؟' });
  assert.equal(aiCalls.length, 2);
  const second = aiCalls[1].input.messages;
  const toolMsg = second.find((m) => m.role === 'tool');
  assert.ok(toolMsg, 'tool message فرستاده نشد');
  assert.match(toolMsg.content, /example\.com\/article1/);
  assert.match(toolMsg.content, /Dollar price today/);
  assert.ok(!/y\.js/.test(toolMsg.content), 'تبلیغ فیلتر نشد');
  const asst = second.find((m) => m.role === 'assistant' && m.tool_calls);
  assert.equal(asst.tool_calls[0].function.arguments, '{"query":"dollar price"}');
  const out = sent(2000).pop().payload;
  assert.equal(out.parse_mode, 'HTML');
  assert.match(out.text, /<b>۱۰۰<\/b>/);
  assert.match(out.text, /<a href="https:\/\/example.com\/article1">مثال<\/a>/);
  const rows = dbq("SELECT role FROM messages WHERE chat_id=2000 ORDER BY id");
  assert.deepEqual(rows.map((r) => r.role), ['user', 'assistant']);
});

test('حافظه گفتگو در پیام بعدی به مدل داده می‌شود', async () => {
  reset();
  await send({ text: 'ادامه بده' });
  const msgs = aiCalls[0].input.messages;
  assert.equal(msgs[0].role, 'system');
  assert.ok(msgs.some((m) => m.role === 'assistant' && /۱۰۰/.test(m.content)));
  assert.match(msgs[0].content, /Current date/);
});

test('dedupe: update_id تکراری دوباره پردازش نمی‌شود', async () => {
  reset();
  const first = await send({ text: 'سلام' }, U(2001, 'Reza', 'reza'));
  const n = sent(2001).length;
  assert.equal(n, 1);
  await send({ text: 'سلام' }, U(2001, 'Reza', 'reza'), null, first.update.update_id);
  assert.equal(sent(2001).length, 1);
});

test('عکس: به مدل به‌صورت image_url ارسال می‌شود', async () => {
  reset();
  await send({ photo: [{ file_id: 'a', width: 90, height: 90 }, { file_id: 'b', width: 800, height: 600 }, { file_id: 'c', width: 1280, height: 960 }], caption: 'این چیه؟' });
  const content = aiCalls[0].input.messages.at(-1).content;
  assert.ok(Array.isArray(content));
  assert.equal(content[0].text, 'این چیه؟');
  assert.match(content[1].image_url.url, /^data:image\/jpeg;base64,/);
  const getFile = tgCalls.find((c) => c.method === 'getFile');
  assert.equal(getFile.payload.file_id, 'b'); // بزرگ‌ترین ≤۱۱۰۰
  const saved = dbq("SELECT content FROM messages WHERE role='user' ORDER BY id DESC LIMIT 1")[0].content;
  assert.ok(!/base64/.test(saved));
});

test('ساخت تصویر با tool (فرمت قدیمی tool_calls) + sendPhoto + سهمیه', async () => {
  reset();
  aiQueue.push({ response: '', tool_calls: [{ name: 'generate_image', arguments: { prompt: 'a cat astronaut on the moon, cinematic' } }] });
  aiQueue.push(() => ({ image: TINY_JPEG_B64 })); // خروجی flux
  aiQueue.push({ response: 'تصویر آماده شد 🎨' });
  await send({ text: '/image گربه فضانورد' });
  assert.equal(aiCalls[1].model.includes('flux'), true);
  const photo = tgCalls.find((c) => c.method === 'sendPhoto');
  assert.ok(photo, 'sendPhoto صدا زده نشد');
  assert.match(photo.payload.photo, /<blob \d+>/);
  assert.equal(dbq('SELECT imgs_today FROM users WHERE id=2000')[0].imgs_today, 1);
  const note = dbq("SELECT content FROM messages WHERE role='assistant' ORDER BY id DESC LIMIT 1")[0].content;
  assert.match(note, /a cat astronaut/);
});

test('سهمیه‌ی تصویر: وقتی تمام شده به مدل QUOTA برمی‌گردد', async () => {
  reset();
  env.DB.raw.prepare("UPDATE users SET imgs_today=3 WHERE id=2000").run();
  aiQueue.push({ choices: [{ message: { content: '', tool_calls: [{ id: 'g', type: 'function', function: { name: 'generate_image', arguments: '{"prompt":"x"}' } }] } }] });
  aiQueue.push({ choices: [{ message: { content: 'سهمیه تمام شده' } }] });
  await send({ text: 'یه عکس بکش' });
  assert.ok(!tgCalls.some((c) => c.method === 'sendPhoto'));
  const tool = aiCalls[1].input.messages.find((m) => m.role === 'tool');
  assert.match(tool.content, /^QUOTA/);
});

test('سهمیه‌ی پیام روزانه', async () => {
  reset();
  env.DB.raw.prepare("INSERT INTO settings(key,value) VALUES('limits', ?1) ON CONFLICT(key) DO UPDATE SET value=?1").run(JSON.stringify({ free: { label: 'رایگان', msgs: 1, images: 1 } }));
  await send({ text: 'یک' }, U(3000, 'Q', 'q'));
  await send({ text: 'دو' }, U(3000, 'Q', 'q'));
  const m = sent(3000);
  assert.equal(m.length, 2);
  assert.match(m[1].payload.text, /سهمیه پیام امروز/);
  assert.equal(aiCalls.length, 1);
  env.DB.raw.prepare("DELETE FROM settings WHERE key='limits'").run();
});

test('/grant پلن + اعلان به کاربر + محدودیت‌ها', async () => {
  reset();
  await send({ text: '/grant 3000 pro 30' }, U(1000, 'Owner', 'owner'));
  const row = dbq('SELECT plan, plan_until FROM users WHERE id=3000')[0];
  assert.equal(row.plan, 'pro');
  assert.ok(row.plan_until > Date.now() / 1000);
  assert.ok(sent(3000).some((c) => /فعال شد/.test(c.payload.text)));
  await send({ text: 'پیام دوباره' }, U(3000, 'Q', 'q'));
  assert.ok(aiCalls.length >= 1); // حالا اجازه دارد
});

test('دستورات مالک برای کاربر عادی کار نمی‌کند', async () => {
  reset();
  await send({ text: '/grant 2000 vip 30' }, U(2000));
  assert.notEqual(dbq('SELECT plan FROM users WHERE id=2000')[0].plan, 'vip');
});

test('کاربر مسدود نادیده گرفته می‌شود', async () => {
  reset();
  await send({ text: '/ban 2001' }, U(1000, 'Owner', 'owner'));
  tgCalls = [];
  await send({ text: 'هی' }, U(2001, 'Reza', 'reza'));
  assert.equal(sent(2001).length, 0);
  await send({ text: '/unban 2001' }, U(1000, 'Owner', 'owner'));
});

test('خطای سهمیه‌ی Workers AI → پیام مناسب + اطلاع به مالک (یک بار)', async () => {
  reset();
  aiQueue.push(new Error('4006: you have used up your daily free allocation of 10,000 neurons'));
  await send({ text: 'سلام' }, U(2002, 'Sara', 'sara'));
  assert.match(sent(2002).pop().payload.text, /ظرفیت هوش مصنوعی/);
  assert.equal(sent(1000).filter((c) => /سهمیه رایگان/.test(c.payload.text)).length, 1);
  aiQueue.push(new Error('4006: you have used up your daily free allocation'));
  await send({ text: 'باز هم' }, U(2002, 'Sara', 'sara'));
  assert.equal(sent(1000).filter((c) => /سهمیه رایگان/.test(c.payload.text)).length, 1);
});

test('خطای مدل اصلی → فالبک بدون ابزار', async () => {
  reset();
  aiQueue.push(new Error('schema validation: tools not supported'));
  aiQueue.push({ choices: [{ message: { content: 'جواب بدون ابزار' } }] });
  await send({ text: 'تست فالبک' }, U(2003, 'Nima', 'nima'));
  assert.equal(aiCalls.length, 2);
  assert.ok(aiCalls[0].input.tools && !aiCalls[1].input.tools);
  assert.match(sent(2003).pop().payload.text, /جواب بدون ابزار/);
});

test('خطای مدل برای عکس → فالبک بینایی (Llama 4 Scout)', async () => {
  reset();
  aiQueue.push(new Error('bad image format'));
  aiQueue.push({ choices: [{ message: { content: 'از مدل دوم' } }] });
  await send({ photo: [{ file_id: 'p', width: 800, height: 600 }], caption: 'چیه' }, U(2004, 'Z', 'z'));
  assert.match(aiCalls[1].model, /llama-4-scout/);
  assert.match(sent(2004).pop().payload.text, /از مدل دوم/);
});

test('پیام صوتی → Whisper → متن', async () => {
  reset();
  await send({ voice: { file_id: 'v', duration: 3, file_size: 1000 } }, U(2005, 'V', 'v'));
  assert.ok(aiCalls[0].model.includes('whisper'));
  assert.match(JSON.stringify(aiCalls[1].input.messages.at(-1)), /پیام صوتی/);
});

test('ابزار remember و /memory و /forget', async () => {
  reset();
  aiQueue.push({ choices: [{ message: { content: '', tool_calls: [{ id: 'r', type: 'function', function: { name: 'remember', arguments: '{"fact":"نام کاربر علی است"}' } }] } }] });
  aiQueue.push({ choices: [{ message: { content: 'باشه' } }] });
  await send({ text: 'من علی هستم' }, U(2006, 'Ali', 'ali6'));
  assert.equal(dbq('SELECT fact FROM facts WHERE user_id=2006').length, 1);
  await send({ text: '/memory' }, U(2006, 'Ali', 'ali6'));
  assert.match(sent(2006).pop().payload.text, /نام کاربر علی است/);
  await send({ text: 'سوال بعدی' }, U(2006, 'Ali', 'ali6'));
  assert.match(aiCalls.at(-1).input.messages[0].content, /نام کاربر علی است/);
  await send({ text: '/forget' }, U(2006, 'Ali', 'ali6'));
  assert.equal(dbq('SELECT * FROM facts WHERE user_id=2006').length, 0);
  assert.equal(dbq('SELECT * FROM messages WHERE chat_id=2006').length, 0);
});

test('خلاصه‌سازی حافظه وقتی تاریخچه طولانی شود', async () => {
  reset();
  const ins = env.DB.raw.prepare('INSERT INTO messages(chat_id,role,content,ts) VALUES(?1,?2,?3,0)');
  for (let i = 0; i < 44; i++) ins.run(2007, i % 2 ? 'assistant' : 'user', 'پیام شماره ' + i);
  aiQueue.push({ choices: [{ message: { content: 'جواب' } }] });
  aiQueue.push({ choices: [{ message: { content: 'خلاصه: کاربر درباره‌ی اعداد حرف زد' } }] });
  await send({ text: 'آخرین' }, U(2007, 'S', 's7'));
  const s = dbq('SELECT summary FROM summaries WHERE chat_id=2007')[0];
  assert.match(s.summary, /خلاصه/);
  assert.ok(dbq('SELECT COUNT(*) c FROM messages WHERE chat_id=2007')[0].c <= 20);
  reset();
  await send({ text: 'بعدی' }, U(2007, 'S', 's7'));
  assert.match(aiCalls[0].input.messages[0].content, /خلاصه: کاربر/);
});

test('گروه: بدون منشن نادیده، با منشن پاسخ با reply', async () => {
  reset();
  env.DB.raw.prepare("INSERT INTO settings(key,value) VALUES('bot_username','testbot') ON CONFLICT(key) DO UPDATE SET value='testbot'").run();
  const g = { id: -500, type: 'supergroup' };
  await send({ text: 'سلام بچه‌ها' }, U(2008, 'G', 'g8'), g);
  assert.equal(sent(-500).length, 0);
  await send({ text: '@testbot قیمت چیه؟' }, U(2008, 'G', 'g8'), g);
  const m = sent(-500);
  assert.equal(m.length, 1);
  assert.ok(m[0].payload.reply_parameters);
  assert.match(aiCalls[0].input.messages.at(-1).content, /^\[G\]: قیمت چیه؟/);
});

test('فایل متنی به عنوان ورودی', async () => {
  reset();
  await send({ document: { file_id: 'd', file_name: 'a.py', mime_type: 'text/x-python', file_size: 100 }, caption: 'بررسی کن' }, U(2009, 'D', 'd9'));
  assert.match(aiCalls[0].input.messages.at(-1).content, /فایل ضمیمه: a\.py/);
});

test('جستجو: DDG خالی → Bing (دیکد لینک ردیابی) ', async () => {
  reset();
  ddgMode = 'empty';
  aiQueue.push({ choices: [{ message: { content: '', tool_calls: [{ id: 's', type: 'function', function: { name: 'web_search', arguments: '{"query":"q"}' } }] } }] });
  aiQueue.push({ choices: [{ message: { content: 'ok' } }] });
  await send({ text: 'جستجو کن' }, U(2010, 'B', 'b10'));
  const tool = aiCalls[1].input.messages.find((m) => m.role === 'tool').content;
  assert.match(tool, /via bing/);
  assert.match(tool, /https:\/\/example\.org\/page/);
});

test('read_webpage: متن مقاله استخراج می‌شود', async () => {
  reset();
  aiQueue.push({ choices: [{ message: { content: '', tool_calls: [{ id: 'p', type: 'function', function: { name: 'read_webpage', arguments: '{"url":"https://example.com/article1"}' } }] } }] });
  aiQueue.push({ choices: [{ message: { content: 'ok' } }] });
  await send({ text: 'این لینک رو بخون' }, U(2011, 'R', 'r11'));
  const tool = aiCalls[1].input.messages.find((m) => m.role === 'tool').content;
  assert.match(tool, /Title: My Article/);
  assert.match(tool, /Hello world/);
  assert.ok(!/menu|foot|var x=1/.test(tool));
});

test('پنل مدیریت: /panel → توکن → API', async () => {
  reset();
  await send({ text: '/panel' }, U(1000, 'Owner', 'owner'));
  const link = sent(1000).pop().payload.text;
  const tok = link.match(/\/admin\?t=([a-f0-9]+)/)[1];
  const api = (p, body, t = tok) => worker.fetch(new Request('https://w.example.workers.dev/admin/api/' + p, { method: body ? 'POST' : 'GET', headers: { authorization: 'Bearer ' + t, 'content-type': 'application/json' }, body: body ? JSON.stringify(body) : undefined }), env);
  assert.equal((await api('stats', null, 'wrong')).status, 401);
  const st = await (await api('stats')).json();
  assert.ok(st.users >= 5);
  const users = await (await api('users?q=ali')).json();
  assert.ok(users.users.length >= 1);
  assert.equal((await (await api('user', { id: 2000, plan: 'vip', days: 10 })).json()).ok, true);
  assert.equal(dbq('SELECT plan FROM users WHERE id=2000')[0].plan, 'vip');
  assert.equal((await api('user', { id: 2000, plan: 'nope' })).status, 400);
  assert.equal((await (await api('settings', { extra_prompt: 'همیشه مودب باش', contact: '@sales', limits: JSON.stringify({ pro: { label: 'P', msgs: 5, images: 1 } }) })).json()).ok, true);
  assert.equal((await api('settings', { limits: '{bad' })).status, 400);
  const s = await (await api('settings')).json();
  assert.equal(s.extra_prompt, 'همیشه مودب باش');
  assert.match(s.limits, /"free"/);
  const bc = await (await api('broadcast', { text: 'سلام همگانی', offset: 0 })).json();
  assert.ok(bc.sent >= 5);
  assert.equal(bc.next, null);
  // پنل HTML
  const page = await worker.fetch(new Request('https://w.example.workers.dev/admin'), env);
  assert.equal(page.status, 200);
  assert.match(await page.text(), /پنل مدیریت — تست‌بات/);
  env.DB.raw.prepare("DELETE FROM settings WHERE key='limits'").run();
});

test('cron: وب‌هوک ثبت می‌شود و نام ربات ذخیره می‌شود', async () => {
  reset();
  const waits = [];
  await worker.scheduled({}, env, { waitUntil: (p) => waits.push(p) });
  await Promise.all(waits);
  const setWh = tgCalls.find((c) => c.method === 'setWebhook');
  assert.equal(setWh.payload.url, 'https://w.example.workers.dev/telegram');
  assert.equal(setWh.payload.secret_token, 'sec');
  assert.ok(tgCalls.some((c) => c.method === 'setMyCommands'));
  assert.equal(dbq("SELECT value FROM settings WHERE key='bot_username'")[0].value, 'testbot');
});

test('صفحه‌ی اصلی: برند + لینک ربات + پلن‌ها', async () => {
  const res = await worker.fetch(new Request('https://w.example.workers.dev/'), env);
  const h = await res.text();
  assert.match(h, /تست‌بات/);
  assert.match(h, /https:\/\/t\.me\/testbot/);
  assert.match(h, /پلن‌ها/);
  assert.equal((await worker.fetch(new Request('https://w.example.workers.dev/nope'), env)).status, 404);
});

test('/boot با کلید درست', async () => {
  const bad = await worker.fetch(new Request('https://w.example.workers.dev/boot?k=x'), env);
  assert.equal(bad.status, 403);
  const ok = await (await worker.fetch(new Request('https://w.example.workers.dev/boot?k=sec'), env)).json();
  assert.equal(ok.ok, true);
  assert.equal(ok.bot, 'testbot');
});

test('/diag برای مالک گزارش می‌دهد', async () => {
  reset();
  await send({ text: '/diag' }, U(1000, 'Owner', 'owner'));
  const rep = sent(1000).pop().payload.text;
  assert.match(rep, /✅ دیتابیس/);
  assert.match(rep, /✅ مدل متنی/);
  assert.match(rep, /✅ فراخوانی ابزار/);
  assert.match(rep, /✅ بینایی/);
  assert.match(rep, /✅ جستجوی وب/);
  assert.match(rep, /✅ ساخت تصویر/);
});

// ---------- ماژول ایتا ----------
const OWNER = U(1000, 'Owner', 'owner');
const cbq = async (data, from = OWNER) => {
  const update = { update_id: ++uid, callback_query: { id: 'cb' + uid, from, data, message: { message_id: uid, chat: { id: from.id, type: 'private' }, date: 0 } } };
  await worker.fetch(new Request('https://w.example.workers.dev/telegram', { method: 'POST', headers: { 'x-telegram-bot-api-secret-token': 'sec', 'content-type': 'application/json' }, body: JSON.stringify(update) }), env);
};
const texts = (id) => sent(id).map((c) => c.payload.text);

test('ایتا: کاربر پلن‌رایگان اشتراک ندارد، مالک دارد', async () => {
  reset();
  await send({ text: '/eitaa' }, U(3999, 'Free', 'free'));
  assert.ok(texts(3999).some((t) => t.includes('اشتراک فعال ندارید')), texts(3999).join('|'));
  await send({ text: '/ai' }, U(3999, 'Free', 'free'));
  reset();
  await send({ text: '/eitaa' }, OWNER);
  const w = sent(1000).find((c) => c.payload.reply_markup && c.payload.reply_markup.keyboard);
  assert.ok(w && JSON.stringify(w.payload.reply_markup.keyboard).includes('بازگشت به هوش مصنوعی'));
  assert.ok(w.payload.text.includes('از منوی پایین شروع کنید'));
});

test('ایتا: در حالت ایتا پیام‌ها به هوش مصنوعی نمی‌رسند؛ بازگشت کار می‌کند', async () => {
  reset();
  await send({ text: 'یک سوال معمولی' }, OWNER);
  assert.equal(aiCalls.length, 0, JSON.stringify(aiCalls.map((c) => c.input.messages.slice(-1))));
  assert.ok(texts(1000).some((t) => t.includes('از منوی پایین')));
  reset();
  await send({ text: '🔙 بازگشت به هوش مصنوعی' }, OWNER);
  assert.ok(sent(1000).some((c) => c.payload.reply_markup && c.payload.reply_markup.remove_keyboard));
  assert.equal(dbq("SELECT value FROM settings WHERE key='eamode:1000'").length, 0);
  reset();
  await send({ text: 'سلام، حالت عادی' }, OWNER);
  assert.ok(aiCalls.length >= 1);
});

test('ایتا: توکن، کانال، پست زمان‌بندی، ایجنت، و ارسال با کران', async () => {
  reset();
  await send({ text: '/eitaa' }, OWNER);
  await send({ text: '🔌 برنامه‌های متصل' }, OWNER);
  await cbq('tk:set');

  await send({ text: '12345:ABCDEFGH' }, OWNER);
  assert.ok(texts(1000).some((t) => t.includes('توکن ایتایار ثبت شد')), JSON.stringify(eitaaCalls));
  assert.equal(dbq('SELECT eitaa_account a FROM ea_users WHERE id=1000')[0].a, 'acc_eitaa');
  assert.notEqual(dbq('SELECT eitaa_token_enc t FROM ea_users WHERE id=1000')[0].t, '12345:ABCDEFGH');
  await send({ text: '📣 کانال‌ها' }, OWNER);
  await cbq('ch:add');
  await send({ text: '@mychannel' }, OWNER);
  await send({ text: 'کانال من' }, OWNER).catch(() => {});
  const ch = dbq('SELECT * FROM ea_channels WHERE user_id=1000');
  assert.equal(ch.length, 1, texts(1000).join('|'));
  // ایجنت: اجرای فوری با مدل شبیه‌سازی‌شده
  env.DB.raw.prepare("INSERT INTO agent_jobs(user_id,channel_id,name,instruction,times,footer,approve,enabled,run_now,last_key,attempts,created_at) VALUES(1000,?,'t','یک متن کوتاه خودت بنویس','[]','🆔 @mychannel',0,1,1,'',0,0)").run(ch[0].id);
  aiQueue.push({ choices: [{ message: { content: '', tool_calls: [{ id: 'a1', type: 'function', function: { name: 'post_to_channel', arguments: JSON.stringify({ text: 'روز خوش' }) } }] } }] });
  reset();
  aiQueue.push({ choices: [{ message: { content: '', tool_calls: [{ id: 'a1', type: 'function', function: { name: 'post_to_channel', arguments: JSON.stringify({ text: 'روز خوش' }) } }] } }] });
  const run = async () => { const w = []; await worker.scheduled({}, env, { waitUntil: (p) => w.push(p) }); await Promise.all(w); };
  await run();
  const posts = dbq('SELECT * FROM ea_posts WHERE job_id IS NOT NULL');
  assert.equal(posts.length, 1);
  assert.ok(posts[0].text.endsWith('🆔 @mychannel') && posts[0].text.startsWith('روز خوش'));
  await run();                                          // تیک بعدی پست آماده را تحویل می‌دهد
  assert.equal(dbq('SELECT status s FROM ea_posts WHERE id=?', posts[0].id)[0].s, 'sent');
  assert.ok(eitaaCalls.some((c) => c.method === 'sendMessage' && String(c.form.text).startsWith('روز خوش')));
});

test('ایتا: خواندن عکس و ویدیو از صفحه‌ی کانال منبع', async () => {
  const m = parseMessages(SRC_PAGE, 'srcchan', 'https://eitaa.com');
  assert.equal(m.length, 4);
  assert.equal(m[0].image, '');
  assert.equal(m[1].image, 'https://cdn.eitaa.test/p2.jpg');
  assert.equal(m[2].videoUrl, 'https://cdn.eitaa.test/v3.mp4');
  assert.equal(m[2].video, true);
  assert.equal(m[3].videoUrl, '');
  assert.equal(m[3].video, true);
  assert.equal(m[3].image, 'https://cdn.eitaa.test/t4.jpg');
});

test('ایتا: from_ref خودکار عکس/ویدیو را هم همراه می‌آورد', async () => {
  const st = { refs: new Map([
    ['c/1', { text: 'متن', image: '', sticker: false, video: '', hasVideo: false }],
    ['c/2', { text: 'عکس', image: 'https://x/p.jpg', sticker: false, video: '', hasVideo: false }],
    ['c/3', { text: 'ویدیو', image: 'https://x/t.jpg', sticker: false, video: 'https://x/v.mp4', hasVideo: true }],
    ['c/4', { text: '', image: 'https://x/s.webp', sticker: true, video: '', hasVideo: false }],
    ['c/5', { text: 'ب'.repeat(1200), image: 'https://x/p.jpg', sticker: false, video: '', hasVideo: false }],
  ]) };
  assert.equal(resolvePost(st, { from_ref: 'c/1' }, 'امضا').kind, 'none');
  const img = resolvePost(st, { from_ref: 'c/2' }, 'امضا');
  assert.equal(img.kind, 'image'); assert.equal(img.media, 'https://x/p.jpg'); assert.ok(img.text.endsWith('امضا'));
  const vid = resolvePost(st, { from_ref: 'c/3' }, 'امضا');
  assert.equal(vid.kind, 'video'); assert.equal(vid.media, 'https://x/v.mp4');
  const stk = resolvePost(st, { image_ref: 'c/4' }, 'امضا');
  assert.equal(stk.kind, 'sticker'); assert.equal(stk.text, '');
  assert.equal(resolvePost(st, { from_ref: 'c/5' }, '').overflow, true);
});

test('ایتا: ایجنت پست عکس‌دار و ویدیویی را با رسانه به کانال می‌فرستد', async () => {
  reset(); eitaaCalls.length = 0;
  const chId = dbq('SELECT id FROM ea_channels WHERE user_id=1000')[0].id;
  env.DB.raw.prepare('DELETE FROM agent_seen').run();
  env.DB.raw.prepare("INSERT INTO agent_jobs(user_id,channel_id,name,instruction,times,footer,approve,enabled,run_now,last_key,attempts,created_at) VALUES(1000,?,'m','از @srcchan دو مطلب ورزشی بیاور','[]','🆔 @mychannel',0,1,1,'',0,0)").run(chId);
  const call = (id, args) => ({ choices: [{ message: { content: '', tool_calls: [{ id, type: 'function', function: { name: 'post_to_channel', arguments: JSON.stringify(args) } }] } }] });
  aiQueue.push({ choices: [{ message: { content: '', tool_calls: [{ id: 'r', type: 'function', function: { name: 'read_channel', arguments: JSON.stringify({ channel: 'srcchan' }) } }] } }] });
  aiQueue.push((model, input) => {
    const out = JSON.parse(input.messages.filter((x) => x.role === 'tool').pop().content);
    const photo = out.posts.find((p) => p.image), video = out.posts.find((p) => p.video);
    assert.ok(photo && video, JSON.stringify(out));
    return { choices: [{ message: { content: '', tool_calls: [
      { id: 'p1', type: 'function', function: { name: 'post_to_channel', arguments: JSON.stringify({ from_ref: photo.ref }) } },
      { id: 'p2', type: 'function', function: { name: 'post_to_channel', arguments: JSON.stringify({ from_ref: video.ref }) } }] } }] };   // بدون image_ref / video_ref
  });
  const run = async () => { const w = []; await worker.scheduled({}, env, { waitUntil: (p) => w.push(p) }); await Promise.all(w); };
  await run();
  const posts = dbq("SELECT * FROM ea_posts WHERE job_id IS NOT NULL AND src_url!='' ORDER BY id");
  assert.equal(posts.length, 2);
  assert.equal(posts[0].src_url, 'https://cdn.eitaa.test/p2.jpg');
  assert.equal(posts[1].src_url, 'https://cdn.eitaa.test/v3.mp4');
  assert.ok(posts.every((p) => p.kind === 'file' && p.text.endsWith('🆔 @mychannel') && !p.text.includes('@srcchan')));
  env.DB.raw.prepare("UPDATE ea_posts SET run_at=0 WHERE job_id IS NOT NULL").run();
  await run();
  const files = eitaaCalls.filter((c) => c.method === 'sendFile');
  assert.equal(files.length, 2, JSON.stringify(eitaaCalls.map((c) => c.method)));
  assert.ok(String(files[0].form.caption).includes('عکس خبر'));
});

test('ایتا: آرگومان خراب مدل ترمیم می‌شود و ابزارها فرمت OpenAI دارند', async () => {
  const { cleanArgs } = await import('../src/eitaa.js');
  assert.equal(cleanArgs('{"channel": "abc"}{"x":1}'), '{"channel":"abc"}');
  assert.equal(cleanArgs('{"a":"}"}  trailing'), '{"a":"}"}');
  assert.equal(cleanArgs(''), '{}');
  assert.equal(cleanArgs({ q: 1 }), '{"q":1}');
  assert.equal(cleanArgs('نه JSON'), '{}');
});

test('ایتا: مدل اول خطا بدهد مدل بعدی جواب می‌دهد و خطای مدل منسوخ کنار می‌رود', async () => {
  reset(); eitaaCalls.length = 0;
  const chId = dbq('SELECT id FROM ea_channels WHERE user_id=1000')[0].id;
  env.DB.raw.prepare('DELETE FROM agent_seen').run();
  env.DB.raw.prepare("INSERT INTO agent_jobs(user_id,channel_id,name,instruction,times,footer,approve,enabled,run_now,last_key,attempts,created_at) VALUES(1000,?,'fb','یک متن کوتاه خودت بنویس','[]','🆔 @mychannel',0,1,1,'',0,0)").run(chId);
  aiQueue.push(new Error('5028: @cf/x was deprecated on 2026-05-30'));
  aiQueue.push({ response: '', tool_calls: [{ name: 'post_to_channel', arguments: { text: 'متن از مدل دوم' } }] });   // قالب بومی Workers AI
  const w = []; await worker.scheduled({}, env, { waitUntil: (p) => w.push(p) }); await Promise.all(w);
  const posts = dbq("SELECT text FROM ea_posts WHERE text LIKE 'متن از مدل دوم%'");
  assert.equal(posts.length, 1);
});

test('ایتا: پاسخ خالی مدل → تلاش دوباره؛ و wantedCounts حداقل/حداکثر را می‌خواند', async () => {
  const { wantedCounts } = await import('../src/eitaa.js');
  assert.deepEqual(wantedCounts('هر روز حداکثر 20 تا محتوا بزاری و حداقل 10 تا محتوا بزاری'), { min: 10, max: 20 });
  assert.deepEqual(wantedCounts('دو مطلب بیاور'), { min: 0, max: 0 });
  reset(); eitaaCalls.length = 0;
  const chId = dbq('SELECT id FROM ea_channels WHERE user_id=1000')[0].id;
  env.DB.raw.prepare('DELETE FROM agent_seen').run();
  env.DB.raw.prepare("INSERT INTO agent_jobs(user_id,channel_id,name,instruction,times,footer,approve,enabled,run_now,last_key,attempts,created_at) VALUES(1000,?,'em','یک متن کوتاه خودت بنویس','[]','🆔 @mychannel',0,1,1,'',0,1)").run(chId);
  aiQueue.push({ choices: [{ message: { content: '' } }] });                       // پاسخ خالی
  aiQueue.push({ choices: [{ message: { content: [{ type: 'text', text: '' }], tool_calls: [{ id: 'e1', type: 'function', function: { name: 'post_to_channel', arguments: '{"text":"متن بعد از تلاش دوباره"}' } }] } }] });
  const w = []; await worker.scheduled({}, env, { waitUntil: (p) => w.push(p) }); await Promise.all(w);
  assert.equal(dbq("SELECT text FROM ea_posts WHERE text LIKE 'متن بعد از تلاش دوباره%'").length, 1);
});


// ---------- گروه، ناظر، دکمه‌های مدیریت ----------
const GROUP = { id: -100500, type: 'supergroup', title: 'گروه پست‌ها' };
const runCron = async () => { const w = []; await worker.scheduled({}, env, { waitUntil: (p) => w.push(p) }); await Promise.all(w); };
const gsent = () => tgCalls.filter((c) => c.method === 'sendMessage' && String(c.payload.chat_id) === String(GROUP.id));
const tgOf = (m) => tgCalls.filter((c) => c.method === m);
const verdict = (o) => aiQueue.push({ choices: [{ message: { content: JSON.stringify(o) } }] });
const insPost = (text, extra = {}) => {
  const ch = dbq('SELECT id FROM ea_channels WHERE user_id=1000')[0].id;
  const r = env.DB.raw.prepare("INSERT INTO ea_posts(user_id,channel_id,kind,text,file_id,file_name,title,silent,pin,view_delete,run_at,status,created_at,src_url,job_id) VALUES(1000,?,?,?,?,?,'',0,0,0,0,'pending',1,?,?)")
    .run(ch, extra.kind || 'text', text, '', extra.name || '', extra.src || '', extra.job ?? null);
  return Number(r.lastInsertRowid);
};

test('ایتا: /eagroup گروه و چهار تاپیک را می‌سازد و فقط برای دارندگان اشتراک کار می‌کند', async () => {
  reset();
  await send({ text: '/eagroup' }, U(3999, 'Free', 'free'), GROUP);
  assert.equal(dbq("SELECT * FROM ea_kv WHERE k LIKE 'grp:%'").length, 0);
  await send({ text: '/eagroup' }, OWNER, GROUP);
  assert.equal(tgOf('createForumTopic').length, 6);
  const cfg = JSON.parse(dbq("SELECT v FROM ea_kv WHERE k='grp:1000'")[0].v);
  assert.equal(cfg.chat, String(GROUP.id)); assert.equal(cfg.forum, true); assert.ok(cfg.topics.posts && cfg.topics.reports && cfg.topics.chat && cfg.topics.lessons && cfg.topics.council && cfg.topics.all);
  assert.ok(gsent().some((c) => c.payload.message_thread_id === cfg.topics.posts));
});

test('ایتا: پست اول به گروه (تاپیک مطالب با یک دکمه) می‌رود، ناظر تأیید می‌کند، بعد ایتا', async () => {
  reset(); eitaaCalls.length = 0;
  const cfg = JSON.parse(dbq("SELECT v FROM ea_kv WHERE k='grp:1000'")[0].v);
  const id = insPost('خبر خوب امروز');
  verdict({ ok: true, major: false, problems: [], fixed_text: null });
  await runCron();
  const g = gsent().find((c) => c.payload.message_thread_id === cfg.topics.posts && c.payload.text === 'خبر خوب امروز');
  assert.ok(g, JSON.stringify(gsent().map((c) => c.payload.text)));
  const btn = g.payload.reply_markup.inline_keyboard;
  assert.equal(btn.length, 1); assert.equal(btn[0].length, 1);
  assert.ok(btn[0][0].url.endsWith(`?start=ea_p${id}`), btn[0][0].url);
  const e = eitaaCalls.find((c) => c.method === 'sendMessage' && c.form.text === 'خبر خوب امروز');
  assert.ok(e, 'ایتا ارسال نشد');
  assert.ok(g && e.at > tgCalls.indexOf(g), 'باید اول در گروه می‌آمد');
  assert.equal(dbq('SELECT status s, eitaa_message_id m FROM ea_posts WHERE id=?', id)[0].s, 'sent');
  assert.ok(tgOf('editMessageReplyMarkup').some((c) => JSON.stringify(c.payload.reply_markup).includes('در ایتا')));
});

test('ایتا: ناظر امضای کانال دیگر را پاک می‌کند، نسخه‌ی بد را از گروه برمی‌دارد و نسخه‌ی درست را اول در گروه بعد در ایتا می‌فرستد', async () => {
  reset(); eitaaCalls.length = 0;
  const ch = dbq('SELECT id FROM ea_channels WHERE user_id=1000')[0].id;
  env.DB.raw.prepare("INSERT INTO agent_jobs(user_id,channel_id,name,instruction,times,footer,approve,enabled,run_now,last_key,attempts,created_at) VALUES(1000,?,'rv','از @srcchan خبر بیاور','[]','🆔 @mychannel',0,0,0,'',0,1)").run(ch);
  const jobId = Number(dbq('SELECT MAX(id) m FROM agent_jobs')[0].m);
  const id = insPost('متن خبر کامل است.\n\n📣 کانال خبری دیگر\n@otherchan\n\n🆔 @mychannel', { job: jobId });
  verdict({ ok: true, major: false, problems: [], fixed_text: null });
  await runCron();
  const row = dbq('SELECT text, status FROM ea_posts WHERE id=?', id)[0];
  assert.equal(row.status, 'sent');
  assert.ok(!row.text.includes('otherchan') && !row.text.includes('کانال خبری دیگر'), row.text);
  assert.ok(row.text.endsWith('🆔 @mychannel') && row.text.startsWith('متن خبر کامل است.'), row.text);
  assert.ok(tgOf('deleteMessage').length >= 1, 'نسخه‌ی بد باید از گروه پاک می‌شد');
  const copies = gsent().filter((c) => c.payload.message_thread_id === JSON.parse(dbq("SELECT v FROM ea_kv WHERE k='grp:1000'")[0].v).topics.posts && String(c.payload.text).startsWith('متن خبر کامل است.'));
  assert.equal(copies.length, 2);
  assert.ok(!copies[1].payload.text.includes('otherchan'));
  assert.ok(gsent().some((c) => String(c.payload.text).includes('ناظر') && String(c.payload.text).includes(`#${id}`)));
  const e = eitaaCalls.find((c) => c.method === 'sendMessage' && String(c.form.text).startsWith('متن خبر کامل است.'));
  assert.ok(e && !String(e.form.text).includes('otherchan'));
});

test('ایتا: ناظر ایراد اساسی بدون راه‌حل را نگه می‌دارد؛ چیزی به ایتا نمی‌رود و به مالک خبر می‌دهد', async () => {
  reset(); eitaaCalls.length = 0;
  const id = insPost('متن مشکوک و ناقص');
  verdict({ ok: false, major: true, problems: ['متن با موضوع نمی‌خواند'], fixed_text: null });
  await runCron();
  assert.equal(dbq('SELECT status s FROM ea_posts WHERE id=?', id)[0].s, 'held');
  assert.equal(eitaaCalls.filter((c) => c.method === 'sendMessage').length, 0);
  assert.ok(tgOf('deleteMessage').length >= 1);
  const dm = sent(1000).find((c) => String(c.payload.text).includes('نگه داشت') && JSON.stringify(c.payload.reply_markup).includes(`pm:force:${id}`));
  assert.ok(dm, JSON.stringify(sent(1000).map((c) => c.payload.text)));
  // ارسال با همین وضعیت
  reset(); eitaaCalls.length = 0;
  await cbq(`pm:force:${id}`);
  await runCron();
  assert.equal(dbq('SELECT status s FROM ea_posts WHERE id=?', id)[0].s, 'sent');
  assert.ok(eitaaCalls.some((c) => c.method === 'sendMessage' && c.form.text === 'متن مشکوک و ناقص'));
});

test('ایتا: رسانه‌ی دانلودنشدنی پست را نگه می‌دارد (بی‌صدا فقط‌متن نمی‌فرستد)', async () => {
  reset(); eitaaCalls.length = 0;
  const id = insPost('خبر با ویدیو', { kind: 'file', name: 'video.mp4', src: 'https://cdn.unreachable.test/v.mp4' });
  await runCron();
  assert.equal(dbq('SELECT status s FROM ea_posts WHERE id=?', id)[0].s, 'held');
  assert.equal(eitaaCalls.filter((c) => c.method === 'sendMessage' || c.method === 'sendFile').length, 0);
  assert.ok(sent(1000).some((c) => JSON.stringify(c.payload.reply_markup).includes('ارسال فقط متن')));
  reset(); eitaaCalls.length = 0;
  await cbq(`pm:force:${id}`);
  await runCron();
  assert.ok(eitaaCalls.some((c) => c.method === 'sendMessage' && c.form.text === 'خبر با ویدیو'));
});

test('ایتا: /start ea_p<id> پست را نشان می‌دهد با چهار دکمه؛ گزارش خطا ← قانون یاد می‌گیرد و پست اصلاح‌شده دوباره می‌رود', async () => {
  reset(); eitaaCalls.length = 0;
  const id = insPost('متن اول با ایراد');
  verdict({ ok: true, major: false, problems: [], fixed_text: null });
  await runCron();
  reset(); eitaaCalls.length = 0;
  await send({ text: `/start ea_p${id}` }, OWNER);
  const menu = sent(1000).find((c) => String(c.payload.text).includes('چه کاری می‌خواهید'));
  assert.ok(menu, JSON.stringify(sent(1000).map((c) => c.payload.text)));
  const labels = menu.payload.reply_markup.inline_keyboard.flat().map((b) => b.text).join('|');
  for (const w of ['گزارش خطا', 'تصحیح', 'حذف پیام', 'افزودن عکس/ویدیو و ارسال مجدد']) assert.ok(labels.includes(w), labels);
  assert.ok(sent(1000).some((c) => c.payload.text === 'متن اول با ایراد'), 'اول خود پست فرستاده می‌شود');
  await cbq(`pm:err:${id}`);
  assert.ok(sent(1000).some((c) => String(c.payload.text).includes('خطا را بنویسید') && JSON.stringify(c.payload.reply_markup).includes('برگشت')));
  aiQueue.push({ choices: [{ message: { content: JSON.stringify({ rule: 'متن را همیشه با نقطه تمام کن', fixed_text: 'متن اول درست شد.', why: '' }) } }] });
  verdict({ ok: true, major: false, problems: [], fixed_text: null });
  await send({ text: 'آخر متن نقطه ندارد' }, OWNER);
  assert.equal(dbq("SELECT rule FROM ea_lessons WHERE user_id=1000").length >= 1, true);
  assert.equal(dbq('SELECT status s FROM ea_posts WHERE id=?', id)[0].s, 'replaced');
  assert.ok(eitaaCalls.some((c) => c.method === 'deleteMessage'), 'حذف نسخه‌ی قبلی از ایتا تلاش می‌شود');
  await runCron();
  const nw = dbq("SELECT * FROM ea_posts WHERE text='متن اول درست شد.'")[0];
  assert.ok(nw && nw.status === 'sent');
  assert.ok(eitaaCalls.some((c) => c.method === 'sendMessage' && c.form.text === 'متن اول درست شد.'));
  assert.ok(gsent().some((c) => c.payload.text === 'متن اول درست شد.'));
  // قانون یادگرفته‌شده به ایجنت می‌رسد
  const { _lessons } = { _lessons: dbq('SELECT rule FROM ea_lessons').map((r) => r.rule) };
  assert.ok(_lessons.includes('متن را همیشه با نقطه تمام کن'));
});

test('ایتا: وقتی ایتایار حذف ندارد، به مالک می‌گوید دستی حذف کند؛ حذف پیام، برگشت و جایگزینی با رسانه', async () => {
  reset(); eitaaCalls.length = 0;
  const id = insPost('پست برای حذف');
  verdict({ ok: true, major: false, problems: [], fixed_text: null });
  await runCron();
  reset(); eitaaDeleteOk = false;
  await cbq(`pm:del:${id}`);
  assert.ok(sent(1000).some((c) => JSON.stringify(c.payload.reply_markup).includes(`pm:dy:${id}`) && JSON.stringify(c.payload.reply_markup).includes('برگشت')));
  await cbq(`pm:dy:${id}`);
  assert.equal(dbq('SELECT status s FROM ea_posts WHERE id=?', id)[0].s, 'deleted');
  assert.ok(texts(1000).some((t) => t.includes('دستی حذف کنید')), texts(1000).join('|'));
  assert.ok(tgOf('deleteMessage').length >= 1);
  eitaaDeleteOk = true;
  // افزودن عکس: پیام قبلی کنار می‌رود و پست جدید با همان متن و عکس
  reset(); eitaaCalls.length = 0;
  const id2 = insPost('متن بدون عکس');
  verdict({ ok: true, major: false, problems: [], fixed_text: null });
  await runCron();
  await cbq(`pm:media:${id2}`);
  await send({ photo: [{ file_id: 'ph1', file_unique_id: 'u', file_size: 100 }] }, OWNER);
  const nw = dbq("SELECT * FROM ea_posts WHERE text='متن بدون عکس' AND kind='file'")[0];
  assert.ok(nw, 'پست جدید با رسانه ساخته می‌شود');
  assert.equal(dbq('SELECT status s FROM ea_posts WHERE id=?', id2)[0].s, 'replaced');
  verdict({ ok: true, major: false, problems: [], fixed_text: null });
  await runCron();
  assert.ok(eitaaCalls.some((c) => c.method === 'sendFile' && c.form.caption === 'متن بدون عکس'));
  assert.ok(tgOf('sendPhoto').some((c) => c.payload.chat_id === String(GROUP.id) || c.payload.chat_id === GROUP.id));
});

test('ایتا: چت داخل تاپیک گروه فقط برای مالک کار می‌کند و داخل همان تاپیک جواب می‌دهد', async () => {
  reset();
  const cfg = JSON.parse(dbq("SELECT v FROM ea_kv WHERE k='grp:1000'")[0].v);
  await send({ text: 'سلام ایجنت', message_thread_id: cfg.topics.chat }, U(7777, 'Other', 'other'), GROUP);
  assert.equal(aiCalls.length, 0);
  await send({ text: 'سلام ایجنت', message_thread_id: cfg.topics.chat }, OWNER, GROUP);
  assert.ok(aiCalls.length >= 1);
  assert.ok(gsent().some((c) => c.payload.message_thread_id === cfg.topics.chat), JSON.stringify(tgCalls.map((c) => [c.method, c.payload.chat_id])));
  assert.equal(sent(1000).length, 0);
});

test('ایتا: پاک‌سازی امضا: چند الگوی واقعی (جداکننده، عنوان کانال، آیدی وسط متن، لینک)', async () => {
  const { cleanText } = await import('../src/eitaa.js');
  const T = (s, title = '') => cleanText(s, 'srcchan', title);
  assert.equal(T('خبر مهم امروز\nجزئیات بیشتر\n\n➖➖➖➖➖\n📣 خبرگزاری نمونه\n🆔 @srcchan'), 'خبر مهم امروز\nجزئیات بیشتر');
  assert.equal(T('متن خبر\n\n🔰 کانال خبری نمونه رسمی', 'کانال خبری نمونه'), 'متن خبر');
  assert.equal(T('متن خبر\n\nعضو شوید 👇\nhttps://eitaa.com/joinchat/123'), 'متن خبر');
  assert.equal(T('خبر را از @otherchan بخوانید و ببینید'), 'خبر را از بخوانید و ببینید');
  assert.equal(T('متن\nhttps://t.me/xyz'), 'متن');
  assert.equal(T('این یک جمله‌ی واقعی و بلند است که باید بماند و هیچ امضایی نیست.'), 'این یک جمله‌ی واقعی و بلند است که باید بماند و هیچ امضایی نیست.');
});

test('ایتا: ویدیوی بدون لینک قابل‌دانلود با تصویر بندانگشتی ارسال نمی‌شود', async () => {
  const st = { channels: new Map(), refs: new Map() };
  st.refs.set('c/9', { image: 'https://cdn.eitaa.test/t.jpg', text: 'فیلم', sticker: false, video: '', hasVideo: true });
  const r = resolvePost(st, { from_ref: 'c/9' }, 'امضا');
  assert.ok(r.error, JSON.stringify(r));
});


// ---------- شورا (ناظر + دستیار)، سایت شخصی، ویرایش آموخته‌ها ----------
const calls = (...c) => ({ choices: [{ message: { content: '', tool_calls: c.map(([name, args], i) => ({ id: 'c' + i + Math.random().toString(36).slice(2, 6), type: 'function', function: { name, arguments: JSON.stringify(args) } })) } }] });
const councilMsgs = () => dbq('SELECT role, text FROM ea_council ORDER BY id');

test('شورا: ناظر گزارش می‌دهد، دستیار نظر می‌دهد، آموخته را اصلاح می‌کند و به ناظر دستور حذف پست می‌دهد', async () => {
  reset(); eitaaCalls.length = 0;
  const cfg = JSON.parse(dbq("SELECT v FROM ea_kv WHERE k='grp:1000'")[0].v);
  env.DB.raw.prepare('DELETE FROM ea_events').run();
  const id = insPost('پست غلط برای حذف');
  verdict({ ok: true, major: false, problems: [], fixed_text: null });
  await runCron();                                                         // ارسال می‌شود
  assert.equal(dbq('SELECT status s FROM ea_posts WHERE id=?', id)[0].s, 'sent');
  env.DB.raw.prepare('DELETE FROM ea_events').run(); env.DB.raw.prepare("DELETE FROM ea_kv WHERE k LIKE 'cc%'").run();
  env.DB.raw.prepare("INSERT INTO ea_lessons(user_id,rule,source,created_at) VALUES(1000,'قانون مبهم قدیمی','x',1)").run();
  const lid = dbq("SELECT id FROM ea_lessons WHERE rule='قانون مبهم قدیمی'")[0].id;
  env.DB.raw.prepare("INSERT INTO ea_events(user_id,kind,payload,status,created_at) VALUES(1000,'reported_error',?, 'new',1)").run(JSON.stringify({ id, error: 'تاریخ اشتباه بود', lesson: 'تاریخ را با امروز تطبیق بده', fixed: false }));
  aiQueue.push(calls(['say', { text: 'خطای پست را بررسی کردم؛ تاریخ اشتباه بود.' }], ['lesson_add', { rule: 'تاریخ هر پست باید با امروز بخواند' }]));      // ناظر
  aiQueue.push(calls(['say', { text: 'نظرم: قانون قدیمی مبهم است؛ اصلاحش می‌کنم و پست را حذف کن.' }], ['lesson_edit', { id: lid, rule: 'هیچ پستی با تاریخ گذشته منتشر نشود' }], ['delete_post', { id, reason: 'تاریخ اشتباه' }]));   // دستیار
  aiQueue.push(calls(['say', { text: 'انجام شد.' }], ['finish', {}]));       // ناظر
  await runCron();
  const roles = councilMsgs().map((m) => m.role);
  assert.deepEqual(roles.slice(0, 3), ['sup', 'asst', 'sup'], JSON.stringify(councilMsgs()));
  assert.equal(dbq('SELECT status s FROM ea_posts WHERE id=?', id)[0].s, 'deleted');
  assert.ok(eitaaCalls.some((c) => c.method === 'deleteMessage'));
  assert.equal(dbq('SELECT rule FROM ea_lessons WHERE id=?', lid)[0].rule, 'هیچ پستی با تاریخ گذشته منتشر نشود');
  assert.ok(dbq("SELECT 1 FROM ea_lessons WHERE rule='تاریخ هر پست باید با امروز بخواند'").length === 1);
  const inCouncil = gsent().filter((c) => c.payload.message_thread_id === cfg.topics.council).map((c) => String(c.payload.text));
  assert.ok(inCouncil.some((t) => t.includes('ناظر')) && inCouncil.some((t) => t.includes('دستیار')), JSON.stringify(inCouncil));
});

test('شورا: دستیار از مالک سؤال می‌پرسد (گروه + ربات)، مالک جواب می‌دهد و جلسه ادامه می‌یابد؛ مالک در تاپیک شورا هم می‌تواند حرف بزند', async () => {
  reset();
  const cfg = JSON.parse(dbq("SELECT v FROM ea_kv WHERE k='grp:1000'")[0].v);
  env.DB.raw.prepare('DELETE FROM ea_events').run(); env.DB.raw.prepare("DELETE FROM ea_kv WHERE k LIKE 'cc%'").run(); env.DB.raw.prepare('DELETE FROM ea_asks').run();
  env.DB.raw.prepare("INSERT INTO ea_events(user_id,kind,payload,status,created_at) VALUES(1000,'manual','{}','new',1)").run();
  aiQueue.push(calls(['say', { text: 'گزارش: امروز دو پست اصلاح شد.' }]));
  aiQueue.push(calls(['say', { text: 'یک تصمیم لازم است.' }], ['ask_owner', { question: 'پست‌های دارای لینک خارجی را حذف کنیم یا فقط لینک را برداریم؟' }]));
  await runCron();
  const ask = dbq("SELECT * FROM ea_asks WHERE status='open'")[0];
  assert.ok(ask && ask.role === 'asst');
  assert.ok(sent(1000).some((c) => JSON.stringify(c.payload.reply_markup || '').includes(`as:ans:${ask.id}`)), 'پیام ربات به مالک: ' + JSON.stringify(sent(1000).map((c) => [c.payload.text, c.payload.reply_markup])));
  assert.ok(gsent().some((c) => c.payload.message_thread_id === cfg.topics.council && String(c.payload.text).includes('از شما')), 'پیام در گروه');
  reset();
  await cbq(`as:ans:${ask.id}`);
  await send({ text: 'فقط لینک را بردار' }, OWNER);
  assert.equal(dbq('SELECT status s, answer a FROM ea_asks WHERE id=?', ask.id)[0].a, 'فقط لینک را بردار');
  aiQueue.push(calls(['say', { text: 'ممنون؛ فقط لینک‌ها را برمی‌داریم.' }], ['lesson_add', { rule: 'لینک خارجی را بردار، پست را حذف نکن' }], ['finish', {}]));
  await runCron();
  assert.ok(councilMsgs().some((m) => m.role === 'owner' && m.text === 'فقط لینک را بردار'));
  assert.ok(councilMsgs().some((m) => m.role === 'asst' && m.text.includes('ممنون')));
  assert.equal(dbq("SELECT 1 FROM ea_lessons WHERE rule='لینک خارجی را بردار، پست را حذف نکن'").length, 1);
  // مالک مستقیم در تاپیک شورا
  reset();
  await send({ text: 'امروز دقیق‌تر باشید', message_thread_id: cfg.topics.council }, OWNER, GROUP);
  assert.ok(dbq("SELECT 1 FROM ea_events WHERE kind='owner_note' AND status='new'").length === 1);
  assert.equal(aiCalls.length, 0, 'پیام تاپیک شورا به چت ایجنت نمی‌رود');
});

test('آموخته‌ها از داخل ربات: افزودن، ویرایش، حذف', async () => {
  reset();
  await send({ text: '/eitaa' }, OWNER);
  await cbq('gp:ln');
  await send({ text: 'هر پست باید یک تیتر داشته باشد' }, OWNER);
  const l = dbq("SELECT id FROM ea_lessons WHERE rule='هر پست باید یک تیتر داشته باشد'")[0];
  assert.ok(l);
  await cbq(`gp:le:${l.id}`);
  await send({ text: 'هر پست باید یک تیتر کوتاه داشته باشد' }, OWNER);
  assert.equal(dbq('SELECT rule r FROM ea_lessons WHERE id=?', l.id)[0].r, 'هر پست باید یک تیتر کوتاه داشته باشد');
  await cbq(`gp:ld:${l.id}`);
  assert.equal(dbq('SELECT * FROM ea_lessons WHERE id=?', l.id).length, 0);
});

test('سایت شخصی: لینک از ربات، API با توکن، ویرایش پست = حذف + ارسال درست، آموخته‌ها، شورا', async () => {
  env.WORKER_URL = 'https://w.example.workers.dev';
  reset();
  await send({ text: '/site' }, OWNER);
  const link = texts(1000).join('\n').match(/https:\/\/w\.example\.workers\.dev\/app#k=([\w-]+)/);
  assert.ok(link, texts(1000).join('|'));
  const T = link[1];
  const call = (path, body, token = T) => worker.fetch(new Request('https://w.example.workers.dev/app/api/' + path, { method: body ? 'POST' : 'GET', headers: { authorization: 'Bearer ' + token, 'content-type': 'application/json' }, body: body ? JSON.stringify(body) : undefined }), env).then(async (r) => ({ status: r.status, j: await r.json() }));
  const page = await worker.fetch(new Request('https://w.example.workers.dev/app'), env);
  assert.equal(page.status, 200); assert.ok((await page.text()).includes('پنل ایجنت ایتا'));
  assert.equal((await call('state', null, 'x'.repeat(30))).status, 401);
  assert.equal((await call('state')).j.group.forum, true);
  // آموخته‌ها
  assert.equal((await call('lesson', { op: 'add', rule: 'قانون از سایت' })).j.ok, true);
  const lid = dbq("SELECT id FROM ea_lessons WHERE rule='قانون از سایت'")[0].id;
  await call('lesson', { op: 'edit', id: lid, rule: 'قانون ویرایش‌شده از سایت' });
  assert.equal((await call('lessons')).j.lessons.find((x) => x.id === lid).rule, 'قانون ویرایش‌شده از سایت');
  await call('lesson', { op: 'delete', id: lid });
  assert.equal(dbq('SELECT * FROM ea_lessons WHERE id=?', lid).length, 0);
  // ویرایش پست
  eitaaCalls.length = 0;
  const id = insPost('متن اولیه سایت');
  verdict({ ok: true, major: false, problems: [], fixed_text: null });
  await runCron();
  const list = (await call('posts?status=sent&q=' + encodeURIComponent('اولیه'))).j.posts;
  assert.ok(list.some((p) => p.id === id));
  const r = await call(`post/${id}/edit`, { text: 'متن درست‌شده سایت' });
  assert.ok(r.j.ok, JSON.stringify(r));
  assert.equal(dbq('SELECT status s FROM ea_posts WHERE id=?', id)[0].s, 'replaced');
  assert.ok(eitaaCalls.some((c) => c.method === 'deleteMessage'));
  verdict({ ok: true, major: false, problems: [], fixed_text: null });
  await runCron();
  assert.ok(eitaaCalls.some((c) => c.method === 'sendMessage' && c.form.text === 'متن درست‌شده سایت'));
  // شورا
  assert.equal((await call('council/say', { text: 'سلام شورا' })).j.ok, true);
  assert.ok((await call('council')).j.messages.some((m) => m.text === 'سلام شورا'));
  // ربات‌های ناظر/دستیار
  assert.equal((await call('settings', { role: 'asst', token: 'bad' })).status, 400);
  const ok = await call('settings', { role: 'asst', token: '9876543:ABCDEFGHIJKLMNOPQRSTUVWXYZ' });
  assert.ok(ok.j.ok, JSON.stringify(ok));
  assert.equal((await call('state')).j.asst.has, true);
});

test('خطای chat not found توضیح فارسی می‌گیرد', async () => {
  const t = explainError('Bad Request: chat not found');
  assert.ok(t.startsWith('Bad Request: chat not found') && t.includes('پنل ایتایار') && t.includes('ادمین'));
  assert.equal(explainError('something else'), 'something else');
});

test('تمام پست‌ها: همه‌ی پست‌ها (ارسال‌شده و نشده) در تاپیک خودش می‌آید و وضعیت در آخر متن است', async () => {
  reset(); eitaaCalls.length = 0;
  const cfg = JSON.parse(dbq("SELECT v FROM ea_kv WHERE k='grp:1000'")[0].v);
  env.DB.raw.prepare('DELETE FROM ea_posts').run(); env.DB.raw.prepare("DELETE FROM ea_kv WHERE k LIKE 'al:%'").run();
  const a = insPost('پست ارسال‌شده‌ی من'), b = insPost('پست آینده‌ی من');
  env.DB.raw.prepare('UPDATE ea_posts SET run_at=? WHERE id=?').run(Math.floor(Date.now() / 1000) + 86400, b);
  verdict({ ok: true, major: false, problems: [], fixed_text: null });
  await runCron(); await runCron();
  const inAll = () => gsent().filter((c) => c.payload.message_thread_id === cfg.topics.all).map((c) => String(c.payload.text));
  assert.ok(inAll().some((t) => t.startsWith('پست ارسال‌شده‌ی من') && t.trim().endsWith('') && t.includes('✅ ارسال شد به ایتا')), JSON.stringify(inAll()));
  assert.ok(inAll().some((t) => t.startsWith('پست آینده‌ی من') && t.includes('⏳ هنوز ارسال نشده')), JSON.stringify(inAll()));
  assert.equal(dbq('SELECT COUNT(*) n FROM ea_kv WHERE k LIKE ?', 'al:%')[0].n, 2);
  // وضعیت عوض شود → همان پیام ویرایش می‌شود (نه پیام تازه)
  const before = inAll().length;
  env.DB.raw.prepare("UPDATE ea_posts SET status='held', error='ایراد' WHERE id=?").run(b);
  await runCron();
  assert.equal(inAll().length, before);
  assert.ok(tgOf('editMessageText').some((c) => String(c.payload.text).includes('🛑 نگه‌داشته')), JSON.stringify(tgOf('editMessageText').map((c) => c.payload.text)));
});

test('شورا: اگر فراخوانی ابزار خراب شود همان نوبت با JSON ادامه می‌دهد', async () => {
  reset();
  const cfg = JSON.parse(dbq("SELECT v FROM ea_kv WHERE k='grp:1000'")[0].v);
  env.DB.raw.prepare('DELETE FROM ea_events').run(); env.DB.raw.prepare("DELETE FROM ea_kv WHERE k LIKE 'cc%'").run(); env.DB.raw.prepare('DELETE FROM ea_council').run();
  env.DB.raw.prepare("INSERT INTO ea_events(user_id,kind,payload,status,created_at) VALUES(1000,'manual','{}','new',1)").run();
  aiQueue.push(new Error('tools not supported'));
  verdict({ calls: [{ tool: 'say', args: { text: 'سلام، من ناظر هستم' } }, { tool: 'finish', args: {} }] });
  await runCron();
  assert.ok(councilMsgs().some((m) => m.role === 'sup' && m.text.includes('ناظر هستم')), JSON.stringify(councilMsgs()));
  assert.ok(gsent().some((c) => c.payload.message_thread_id === cfg.topics.council && String(c.payload.text).includes('ناظر هستم')));
});

test('شورا: وقتی هوش مصنوعی اصلاً جواب نمی‌دهد، دلیلش را در تاپیک شورا می‌گوید (بی‌صدا نمی‌ماند)', async () => {
  reset();
  const cfg = JSON.parse(dbq("SELECT v FROM ea_kv WHERE k='grp:1000'")[0].v);
  env.DB.raw.prepare('DELETE FROM ea_events').run(); env.DB.raw.prepare("DELETE FROM ea_kv WHERE k LIKE 'cc%'").run();
  env.DB.raw.prepare("INSERT INTO ea_events(user_id,kind,payload,status,created_at) VALUES(1000,'manual','{}','new',1)").run();
  aiQueue.push(new Error('4006: you have used up your daily free allocation of 10,000 neurons'));
  aiQueue.push(new Error('4006: you have used up your daily free allocation of 10,000 neurons'));
  aiQueue.push(new Error('4006: you have used up your daily free allocation of 10,000 neurons'));
  aiQueue.push(new Error('4006: you have used up your daily free allocation of 10,000 neurons'));
  aiQueue.push(new Error('4006: you have used up your daily free allocation of 10,000 neurons'));
  aiQueue.push(new Error('4006: you have used up your daily free allocation of 10,000 neurons'));
  aiQueue.push(new Error('4006: you have used up your daily free allocation of 10,000 neurons'));
  aiQueue.push(new Error('4006: you have used up your daily free allocation of 10,000 neurons'));
  aiQueue.push(new Error('4006: you have used up your daily free allocation of 10,000 neurons'));
  aiQueue.push(new Error('4006: you have used up your daily free allocation of 10,000 neurons'));
  aiQueue.push(new Error('4006: you have used up your daily free allocation of 10,000 neurons'));
  aiQueue.push(new Error('4006: you have used up your daily free allocation of 10,000 neurons'));
  aiQueue.push(new Error('4006: you have used up your daily free allocation of 10,000 neurons'));
  aiQueue.push(new Error('4006: you have used up your daily free allocation of 10,000 neurons'));
  aiQueue.push(new Error('4006: you have used up your daily free allocation of 10,000 neurons'));
  aiQueue.push(new Error('4006: you have used up your daily free allocation of 10,000 neurons'));
  aiQueue.push(new Error('4006: you have used up your daily free allocation of 10,000 neurons'));
  aiQueue.push(new Error('4006: you have used up your daily free allocation of 10,000 neurons'));
  aiQueue.push(new Error('4006: you have used up your daily free allocation of 10,000 neurons'));
  aiQueue.push(new Error('4006: you have used up your daily free allocation of 10,000 neurons'));
  aiQueue.push(new Error('4006: you have used up your daily free allocation of 10,000 neurons'));
  aiQueue.push(new Error('4006: you have used up your daily free allocation of 10,000 neurons'));
  aiQueue.push(new Error('4006: you have used up your daily free allocation of 10,000 neurons'));
  aiQueue.push(new Error('4006: you have used up your daily free allocation of 10,000 neurons'));
  aiQueue.push(new Error('4006: you have used up your daily free allocation of 10,000 neurons'));
  aiQueue.push(new Error('4006: you have used up your daily free allocation of 10,000 neurons'));
  aiQueue.push(new Error('4006: you have used up your daily free allocation of 10,000 neurons'));
  aiQueue.push(new Error('4006: you have used up your daily free allocation of 10,000 neurons'));
  aiQueue.push(new Error('4006: you have used up your daily free allocation of 10,000 neurons'));
  aiQueue.push(new Error('4006: you have used up your daily free allocation of 10,000 neurons'));
  await runCron();
  const t = gsent().filter((c) => c.payload.message_thread_id === cfg.topics.council).map((c) => String(c.payload.text));
  assert.ok(t.some((x) => x.includes('شورا نتوانست صحبت کند') && x.includes('سهمیه')), JSON.stringify(t));
});

test('دکتر: تاپیک پاک‌شده دوباره ساخته می‌شود و پست نیمه‌کاره خودش دوباره ارسال می‌شود', async () => {
  reset(); eitaaCalls.length = 0;
  const cfg = JSON.parse(dbq("SELECT v FROM ea_kv WHERE k='grp:1000'")[0].v);
  delete cfg.topics.all; env.DB.raw.prepare("UPDATE ea_kv SET v=? WHERE k='grp:1000'").run(JSON.stringify(cfg));
  env.DB.raw.prepare("DELETE FROM ea_kv WHERE k='doctor:last'").run();
  const id = insPost('پست گیرکرده');
  env.DB.raw.prepare("UPDATE ea_posts SET status='sending', claimed_at=1 WHERE id=?").run(id);
  await runCron(); await runCron();
  assert.equal(dbq('SELECT status s FROM ea_posts WHERE id=?', id)[0].s, 'sent');
  assert.ok(JSON.parse(dbq("SELECT v FROM ea_kv WHERE k='grp:1000'")[0].v).topics.all, 'تاپیک تمام پست‌ها ساخته نشد');
  assert.ok(eitaaCalls.some((c) => c.method === 'sendMessage' && c.form.text.startsWith('پست گیرکرده')));
});

test('آینه: کانال در تاپیک خودش با همان نام ساخته می‌شود؛ پیام جدید، ویرایش و حذف در ایتا همگام می‌شود', async () => {
  reset();
  const cfg = JSON.parse(dbq("SELECT v FROM ea_kv WHERE k='grp:1000'")[0].v);
  env.DB.raw.prepare("INSERT INTO ea_channels(user_id,chat_id,title,created_at) VALUES(1000,'mirrchan','کانال آینه',1)").run();
  const chId = dbq("SELECT id FROM ea_channels WHERE chat_id='mirrchan'")[0].id;
  mirrMsgs = [[1, 'پیام اول کانال'], [2, 'پیام دوم با عکس', true]];
  const inTopic = () => { const t = Number(dbq("SELECT v FROM ea_kv WHERE k=?", `mt:${chId}`)[0]?.v || 0); return tgCalls.filter((c) => /^send/.test(c.method) && String(c.payload.message_thread_id) === String(t) && t); };
  await runCron();
  assert.ok(tgOf('createForumTopic').some((c) => c.payload.name.includes('کانال آینه')), JSON.stringify(tgOf('createForumTopic').map((c) => c.payload.name)));
  const first = inTopic();
  assert.equal(first.length, 2, JSON.stringify(first.map((c) => c.method)));
  assert.ok(first.some((c) => c.method === 'sendMessage' && c.payload.text === 'پیام اول کانال' && c.payload.reply_markup.inline_keyboard[0][0].url.endsWith('/mirrchan/1')));
  assert.ok(first.some((c) => c.method !== 'sendMessage'));                                  // عکس
  assert.equal(dbq('SELECT COUNT(*) n FROM ea_mirror WHERE channel_id=?', chId)[0].n, 2);
  // ویرایش پیام ۱ و پیام تازه ۳ و حذف پیام ۲: با درخواست همگام‌سازی (بدون ۳۰ دقیقه صبر)
  mirrMsgs = [[1, 'پیام اول (ویرایش‌شده)'], [3, 'پیام سوم تازه']];
  env.DB.raw.prepare("INSERT INTO ea_kv(k,v) VALUES(?,?) ON CONFLICT(k) DO UPDATE SET v=excluded.v").run(`mirr:due:${chId}`, '1');
  const before = tgCalls.length;
  await runCron();
  const after = tgCalls.slice(before);
  assert.ok(after.some((c) => c.method === 'editMessageText' && c.payload.text === 'پیام اول (ویرایش‌شده)'), JSON.stringify(after.map((c) => c.method)));
  assert.ok(after.some((c) => c.method === 'sendMessage' && c.payload.text === 'پیام سوم تازه'));
  assert.ok(after.some((c) => c.method === 'deleteMessage'), 'پیام حذف‌شده‌ی ایتا باید از آینه برود');
  assert.deepEqual(dbq('SELECT src_id FROM ea_mirror WHERE channel_id=? ORDER BY src_id', chId).map((r) => r.src_id), [1, 3]);
  // بدون تغییر و بدون موعد: هیچ کاری نمی‌کند
  const n2 = tgCalls.length; await runCron();
  assert.equal(tgCalls.slice(n2).filter((c) => /^(send|edit|delete)/.test(c.method) && String(c.payload.message_thread_id) === String(dbq("SELECT v FROM ea_kv WHERE k=?", `mt:${chId}`)[0].v)).length, 0);
});

test('آینه: کانال با شناسه‌ی عددی نام کاربری لازم دارد؛ با نام کاربری ثبت‌شده کار می‌کند', async () => {
  reset();
  env.DB.raw.prepare("INSERT INTO ea_channels(user_id,chat_id,title,created_at) VALUES(1000,'555123','کانال عددی',1)").run();
  const chId = dbq("SELECT id FROM ea_channels WHERE chat_id='555123'")[0].id;
  mirrMsgs = [[1, 'متن']];
  await runCron();
  assert.equal(dbq('SELECT COUNT(*) n FROM ea_mirror WHERE channel_id=?', chId)[0].n, 0);
  await send({ text: 'mirrchan' }, OWNER);                                                // پیام معمولی (نه حالت نام‌کاربری)
  env.DB.raw.prepare("INSERT INTO ea_kv(k,v) VALUES(?,?)").run(`chuser:${chId}`, 'mirrchan');
  await runCron();
  assert.equal(dbq('SELECT COUNT(*) n FROM ea_mirror WHERE channel_id=?', chId)[0].n, 1);
});

test('تغییر زمان ارسال: پست ارسال‌نشده با متن فارسی زمان‌بندی می‌شود', async () => {
  reset();
  const id = insPost('پست برای زمان‌بندی');
  env.DB.raw.prepare('UPDATE ea_posts SET run_at=? WHERE id=?').run(Math.floor(Date.now() / 1000) + 86400 * 3, id);
  await send({ text: `/start ea_p${id}` }, OWNER);
  const kb = JSON.stringify(sent(1000).at(-1).payload.reply_markup);
  assert.ok(kb.includes(`pm:time:${id}`), kb);
  const cb = (data) => cbq(data);
  await cb(`pm:time:${id}`);
  await send({ text: '1 ساعت دیگر' }, OWNER);
  const row = dbq('SELECT run_at, status FROM ea_posts WHERE id=?', id)[0];
  assert.equal(row.status, 'pending');
  assert.ok(Math.abs(row.run_at - (Math.floor(Date.now() / 1000) + 3600)) < 120, String(row.run_at));
});

test('یادگیری از تصحیح دستی: امضای کانال دیگری که مالک پاک کرد قانون می‌شود', async () => {
  reset();
  const id = insPost('خبر امروز\n\n📣 کانال نمونه\n@otherchan');
  const cb = (data) => cbq(data);
  await cb(`pm:fix:${id}`);
  aiQueue.push(new Error('no model'));
  await send({ text: 'خبر امروز' }, OWNER);
  assert.ok(dbq("SELECT rule FROM ea_lessons WHERE source LIKE '%تصحیح دستی%'").some((r) => r.rule.includes('امضای')), JSON.stringify(dbq('SELECT rule, source FROM ea_lessons ORDER BY id DESC LIMIT 3')));
});

test('حساب کلودفلر: افزودن با توکن، رمزنگاری‌شدن و استفاده وقتی binding پر است', async () => {
  reset(); cfCalls.length = 0;
  const cb = (data) => cbq(data);
  await cb('cf:add:0');
  const TOKEN = 'T'.repeat(40);
  await send({ text: TOKEN }, OWNER);
  const saved = dbq("SELECT value FROM settings WHERE key='ea_cfacc'")[0].value;
  assert.ok(saved.includes('a'.repeat(32)) && !saved.includes(TOKEN), 'توکن باید رمزنگاری شود');
  assert.ok(tgOf('deleteMessage').length >= 1, 'پیام توکن باید پاک شود');
  // سهمیه‌ی binding پر → حساب اضافه جواب بدهد
  env.DB.raw.prepare("DELETE FROM settings WHERE key LIKE 'ea_cool:%'").run();
  for (let i = 0; i < 6; i++) aiQueue.push(new Error('4006: you have used up your daily free allocation of 10,000 neurons'));
  const { chatJson } = await import('../src/eitaa.js');
  const r = await chatJson(env, 'reply json', 'x').catch((e) => e);
  assert.ok(cfCalls.some((c) => c.auth === 'Bearer ' + TOKEN), JSON.stringify(cfCalls) + String(r));
});

test('شورا: مدل جواب بی‌مصرف (خالی) بدهد هم هیچ پیام خطایی نمی‌آید و شورا از روی واقعیت‌ها حرف می‌زند', async () => {
  reset();
  const cfg = JSON.parse(dbq("SELECT v FROM ea_kv WHERE k='grp:1000'")[0].v);
  env.DB.raw.prepare('DELETE FROM ea_events').run(); env.DB.raw.prepare("DELETE FROM ea_kv WHERE k LIKE 'cc%'").run(); env.DB.raw.prepare('DELETE FROM ea_council').run();
  env.DB.raw.prepare("INSERT INTO ea_events(user_id,kind,payload,status,created_at) VALUES(1000,'manual','{}','new',1)").run();
  for (let i = 0; i < 20; i++) aiQueue.push({ choices: [{ message: { role: 'assistant', content: '' } }] });
  await runCron();
  const t = gsent().filter((c) => c.payload.message_thread_id === cfg.topics.council).map((c) => String(c.payload.text));
  assert.ok(t.some((x) => x.includes('جلسه‌ی دستی')), JSON.stringify(t));
  assert.ok(!t.some((x) => x.includes('نتوانست صحبت کند')), JSON.stringify(t));
  aiQueue.length = 0;
});

// ---------- اجرا ----------
let failed = 0;
for (const [name, fn] of tests) {
  try {
    await fn();
    console.log('  ✔', name);
  } catch (e) {
    failed++;
    console.log('  ✖', name);
    console.log('     ', String(e.stack || e).split('\n').slice(0, 6).join('\n      '));
  }
}
console.log(`\n${tests.length - failed}/${tests.length} تست موفق`);
process.exit(failed ? 1 : 0);
