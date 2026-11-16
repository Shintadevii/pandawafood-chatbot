"use strict";
// Gateway WhatsApp lokal. Memakai otak chatbot yang SAMA dengan website (../lib/chat.js)
// sehingga jawaban di WhatsApp dan di website berasal dari data/products.csv yang sama.
const path = require("path");
require("dotenv").config({ path: path.join(__dirname, "..", ".env") });
const { Client, LocalAuth } = require("whatsapp-web.js");
const qrcode = require("qrcode-terminal");
const { answer } = require("../lib/chat");
const { isRelevant } = require("../lib/relevance");

// ---------- pengaman: bot TIDAK membalas semua orang ----------
const TRIGGER = String(process.env.WA_TRIGGER ?? "/pandawa").trim().toLowerCase();
const ALLOWED = (process.env.WA_ALLOWED || "").split(",")
  .map(s => s.replace(/\D/g, "")).filter(Boolean)
  .map(n => (n.startsWith("0") ? "62" + n.slice(1) : n));

// WA_REPLY_ALL=true  : bot membalas siapa saja, TAPI hanya pesan yang menyangkut produk/toko
// WA_ONLY_RELEVANT=false : matikan penyaring (bot membalas semua pesan; tidak disarankan)
const REPLY_ALL = String(process.env.WA_REPLY_ALL || "").toLowerCase() === "true";
const ONLY_RELEVANT = String(process.env.WA_ONLY_RELEVANT || "true").toLowerCase() !== "false";

if (!REPLY_ALL && !TRIGGER && ALLOWED.length === 0) {
  console.error("Atur WA_REPLY_ALL, WA_ALLOWED, atau WA_TRIGGER di .env dulu. Tanpa itu bot tidak membalas siapa pun.");
  process.exit(1);
}
console.log(`Mode: ${REPLY_ALL ? (ONLY_RELEVANT ? "balas semua, hanya topik produk/toko" : "balas SEMUA pesan") : "terbatas"} | Trigger: ${TRIGGER || "(mati)"} | Nomor diizinkan: ${ALLOWED.length}`);

// ---------- riwayat percakapan per pengirim (20 menit) ----------
const sessions = new Map();
const TTL = 20 * 60 * 1000;
function getHistory(id) {
  const s = sessions.get(id);
  if (!s || Date.now() - s.t > TTL) { sessions.delete(id); return []; }
  return s.msgs;
}
function pushHistory(id, user, bot) {
  const msgs = [...getHistory(id), { role: "user", content: user }, { role: "assistant", content: bot }].slice(-6);
  sessions.set(id, { msgs, t: Date.now() });
}
const sleep = ms => new Promise(r => setTimeout(r, ms));
const mask = n => (n.length > 6 ? n.slice(0, 4) + "xxxx" + n.slice(-3) : n);

const client = new Client({
  authStrategy: new LocalAuth({ clientId: "pandawafood" }),
  puppeteer: {
    headless: true,
    args: ["--no-sandbox", "--disable-setuid-sandbox", "--disable-dev-shm-usage", "--disable-gpu"]
  }
});

client.on("qr", qr => {
  console.log("\nScan QR ini: WhatsApp > Perangkat tertaut > Tautkan perangkat\n");
  qrcode.generate(qr, { small: true });
});
client.on("authenticated", () => console.log("Autentikasi berhasil."));
client.on("loading_screen", (persen, pesan) => console.log(`Memuat WhatsApp Web: ${persen}% ${pesan}`));
client.on("change_state", s => console.log("Status koneksi:", s));
client.on("auth_failure", m => console.error("Autentikasi gagal:", m));
client.on("ready", () => console.log("Bot WhatsApp siap. Tekan Ctrl+C untuk berhenti."));
client.on("disconnected", r => console.log("WhatsApp terputus:", r));

client.on("message", async msg => {
  try {
    if (msg.fromMe || !msg.body || msg.isStatus) return;
    if (!(msg.from.endsWith("@c.us") || msg.from.endsWith("@lid"))) return; // abaikan grup & status

    let number = msg.from.split("@")[0];
    try { const c = await msg.getContact(); if (c && c.number) number = c.number; } catch (_) {}

    const body = msg.body.trim();
    const rawId = msg.from.split("@")[0];
    const hasTrigger = TRIGGER && body.toLowerCase().startsWith(TRIGGER);
    const question = hasTrigger ? body.slice(TRIGGER.length).trim() : body;

    const byRule = hasTrigger || ALLOWED.includes(number) || ALLOWED.includes(rawId);
    // percakapan yang sedang berjalan (20 menit) tetap dibalas agar "berapa harganya?" / "makasih" nyambung
    const inSession = getHistory(msg.from).length > 0;
    const byTopic = REPLY_ALL && (!ONLY_RELEVANT || inSession || isRelevant(question));

    if (!byRule && !byTopic) {
      console.log(`[diabaikan] ${mask(number)}: bukan topik produk/toko`);
      return;
    }
    if (!question) { await msg.reply(`Tulis pertanyaannya setelah ${TRIGGER}, contoh: ${TRIGGER} keripik apel di bawah 20 ribu`); return; }

    console.log(`[masuk ${mask(number)}] ${question}`);
    try { (await msg.getChat()).sendStateTyping(); } catch (_) {}
    const out = await answer({ message: question, history: getHistory(msg.from), channel: "wa" });
    await sleep(800 + Math.random() * 1200);
    await msg.reply(out.reply);
    pushHistory(msg.from, question, out.reply);
    console.log(`[balas ${out.source}] ${out.reply.slice(0, 80).replace(/\n/g, " ")}...`);
  } catch (err) {
    console.error("Error memproses pesan:", err);
    try { await msg.reply("Asisten sedang mengalami gangguan. Coba lagi sebentar ya."); } catch (_) {}
  }
});

client.initialize();

async function shutdown(sig) {
  console.log(`\n${sig}: menutup bot...`);
  try { await client.destroy(); } catch (_) {}
  process.exit(0);
}
process.on("SIGINT", () => shutdown("SIGINT"));
process.on("SIGTERM", () => shutdown("SIGTERM"));
