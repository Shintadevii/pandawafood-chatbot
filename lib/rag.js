"use strict";
// Mesin RAG: membaca data/products.csv, memahami maksud pertanyaan
// (kategori, batas harga, urutan), lalu memilih produk paling relevan.
const fs = require("fs");
const path = require("path");

// ---------- parser CSV yang benar (koma & kutip di dalam sel aman) ----------
function parseCSV(text) {
  const rows = []; let row = [], cell = "", q = false;
  text = text.replace(/^\uFEFF/, "");
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) {
      if (c === '"' && text[i + 1] === '"') { cell += '"'; i++; }
      else if (c === '"') q = false;
      else cell += c;
    } else if (c === '"') q = true;
    else if (c === ",") { row.push(cell); cell = ""; }
    else if (c === "\n" || c === "\r") {
      if (c === "\r" && text[i + 1] === "\n") i++;
      row.push(cell); cell = "";
      if (row.some(x => x !== "")) rows.push(row);
      row = [];
    } else cell += c;
  }
  if (cell !== "" || row.length) { row.push(cell); if (row.some(x => x !== "")) rows.push(row); }
  return rows;
}

// ---------- normalisasi teks ----------
const SYN = {
  kripik: "keripik", chips: "keripik", krupuk: "kerupuk", apple: "apel",
  cookie: "cookies", kukis: "cookies", stroberi: "strawberry", strawberi: "strawberry",
  sirsat: "sirsak", cider: "cuka", vinegar: "cuka", pir: "pear", sayuran: "sayur",
  cemilan: "camilan", snack: "camilan"
};
const STOP = new Set(("ada apa aja saja yang berapa harga di dan untuk mau cari tolong dong kak min admin ya " +
  "dengan atau ini itu bisa ga gak tidak sih deh banget buat dari ke pada lagi punya jual dijual beli produk " +
  "toko kamu anda saya aku mohon minta tahu tau info informasi tentang soal rekomendasi rekomendasikan saran " +
  "enak bagus oleh khas batu malang kota rp rupiah ribu rb buah murah termurah terlaris laris paling terbaik " +
  "favorit populer best seller bestseller semua seluruh katalog daftar list apakah gimana bagaimana mana lebih " +
  "dijual menjual jualan ukuran pilihan ready stok stock tersedia kalau kalo jadi sama lain lainnya juga masih sudah udah nih").split(" "));

function norm(s) {
  return String(s || "").toLowerCase()
    .replace(/(\d+)\s*(gram|gr|g)\b/g, "$1gr")
    .replace(/(\d+)\s*(kilo|kg)\b/g, "$1kg")
    .replace(/(\d+)\s*(mililiter|ml)\b/g, "$1ml")
    .replace(/(\d+)\s*(liter|ltr|l)\b/g, "$1l")
    .replace(/[^a-z0-9\s]/g, " ").replace(/\s+/g, " ").trim();
}
function mapTok(t) {
  if (t.length > 5 && t.endsWith("nya")) t = t.slice(0, -3);
  return SYN[t] || t;
}
function tokenize(s) {
  return norm(s).split(" ").filter(Boolean).map(mapTok)
    .filter(t => t.length > 1 && !STOP.has(t) && !(/^\d{4,}$/.test(t)));
}

// ---------- harga ----------
function toNum(raw) {
  raw = String(raw).replace(/[.,]+$/, "");
  if (/^\d{1,3}(\.\d{3})+$/.test(raw)) return Number(raw.replace(/\./g, ""));
  return parseFloat(raw.replace(",", "."));
}
function money(raw, unit) {
  const n = toNum(raw); unit = (unit || "").toLowerCase();
  if (unit === "juta" || unit === "jt") return n * 1e6;
  if (unit === "ribu" || unit === "rb" || unit === "k") return n * 1e3;
  return n < 1000 ? n * 1000 : n;
}
const NUM = "(?:rp\\.?\\s*)?(\\d[\\d.,]*)\\s*(ribu|rb|k|juta|jt)?\\b";
const MAX_RE = new RegExp("(?:\\b(?:di\\s?bawah|kurang\\s+dari|maks(?:imal|imum)?|max|budget|under)|<=?)\\s*" + NUM, "i");
const MIN_RE = new RegExp("(?:\\b(?:di\\s?atas|lebih\\s+dari|minimal|min|above)|>=?)\\s*" + NUM, "i");
const BARE_RE = /(?:rp\.?\s*(\d[\d.,]*)|(\d[\d.,]*)\s*(ribu|rb|k)\b)/i;

const rupiah = n => "Rp" + String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, ".");

function parseSold(s) {
  const m = String(s || "").toUpperCase().match(/([\d.,]+)\s*(RB|JT)?/);
  if (!m) return 0;
  const n = parseFloat(m[1].replace(",", "."));
  return m[2] === "RB" ? n * 1e3 : m[2] === "JT" ? n * 1e6 : n;
}

// kata pemicu kategori (dipakai untuk menyaring kandidat)
const CATS = [
  { cats: ["Keripik Buah", "Keripik Sayur"], re: /\bkeripik\b/ },
  { cats: ["Dodol & Jenang"], re: /\b(dodol|jenang)\b/ },
  { cats: ["Kerupuk Buah"], re: /\bkerupuk\b/ },
  { cats: ["Cookies & Kue"], re: /\b(cookies|kue|brownies)\b/ },
  { cats: ["Cuka Apel & Minuman"], re: /\b(cuka|minuman|sari|teh)\b/ },
  { cats: ["Buah Segar"], re: /\bbuah segar\b/ },
  { cats: ["Sayur Segar"], re: /\bsayur segar\b/ }
];

class RAGEngine {
  constructor(csvPath, options = {}) {
    this.csvPath = csvPath || path.join(__dirname, "..", "data", "products.csv");
    this.topK = options.topK || Number(process.env.RAG_TOP_K || 10);
    this.products = [];
    this.load();
  }

  load() {
    if (!fs.existsSync(this.csvPath)) { console.warn("[RAG] CSV tidak ditemukan:", this.csvPath); return; }
    const rows = parseCSV(fs.readFileSync(this.csvPath, "utf-8"));
    const head = rows[0].map(h => h.trim().toLowerCase());
    this.products = rows.slice(1).map(r => {
      const o = {}; head.forEach((h, i) => { o[h] = (r[i] || "").trim(); });
      o.harga = Number(o.harga) || 0;
      o.soldNum = parseSold(o.terjual);
      o.ratingNum = parseFloat(o.rating) || 0;
      o._name = new Set(tokenize(o.nama));
      o._meta = new Set(tokenize(o.kategori + " " + o.deskripsi));
      return o;
    }).filter(p => p.nama && p.harga);
    console.log(`[RAG] ${this.products.length} produk dimuat`);
  }

  shortName(nama) { return nama.split(" / ").slice(0, 2).join(" / ").slice(0, 120); }

  // ---- memahami pertanyaan ----
  parse(query) {
    let text = String(query || "").toLowerCase(), m;
    let maxPrice = null, minPrice = null;
    if ((m = text.match(MAX_RE))) { maxPrice = money(m[1], m[2]); text = text.replace(m[0], " "); }
    if ((m = text.match(MIN_RE))) { minPrice = money(m[1], m[2]); text = text.replace(m[0], " "); }
    if (maxPrice == null && minPrice == null && (m = text.match(BARE_RE))) {
      maxPrice = m[1] != null ? money(m[1]) : money(m[2], m[3]);
      text = text.replace(m[0], " ");
    }
    let sort = null;
    if (/\b(termurah|paling murah|murah)\b/.test(text)) sort = "price_asc";
    if (/\b(termahal|paling mahal)\b/.test(text)) sort = "price_desc";
    if (/\b(terlaris|paling laris|laris|best ?seller|populer|favorit|paling banyak (terjual|dibeli))\b/.test(text)) sort = "sold";
    if (/\b(rating tertinggi|terbaik|paling bagus)\b/.test(text)) sort = "rating";
    const overview = /\b(semua|seluruh|katalog|daftar produk|list produk|jual apa|dijual|menjual|jualan|ada apa|produk apa|menu)\b/.test(text);
    const joined = norm(text).split(" ").map(mapTok).join(" ");
    return { tokens: tokenize(text), joined, maxPrice, minPrice, sort, overview };
  }

  score(p, tokens) {
    let s = 0;
    for (const t of tokens) {
      if (p._name.has(t)) s += 5;
      else if (p._meta.has(t)) s += 3;
      else if (t.length >= 4) {
        for (const w of p._name) if (w.length >= 4 && (w.startsWith(t) || t.startsWith(w))) { s += 2; break; }
      }
    }
    return s;
  }

  rank(items, q) {
    const by = {
      price_asc: (a, b) => a.p.harga - b.p.harga,
      price_desc: (a, b) => b.p.harga - a.p.harga,
      sold: (a, b) => b.p.soldNum - a.p.soldNum,
      rating: (a, b) => b.p.ratingNum - a.p.ratingNum || b.p.soldNum - a.p.soldNum
    }[q.sort];
    return items.sort((a, b) => by ? (by(a, b) || b.score - a.score)
                                   : (b.score - a.score || b.p.soldNum - a.p.soldNum)).map(x => x.p);
  }

  overview() {
    const byCat = {};
    for (const p of this.products) (byCat[p.kategori] = byCat[p.kategori] || []).push(p);
    return Object.values(byCat).flatMap(list => list.sort((a, b) => b.soldNum - a.soldNum).slice(0, 2));
  }

  search(query, k = this.topK) {
    const q = this.parse(query);
    let cands = this.products;
    if (q.maxPrice != null) cands = cands.filter(p => p.harga <= q.maxPrice);
    if (q.minPrice != null) cands = cands.filter(p => p.harga >= q.minPrice);
    const trig = CATS.filter(c => c.re.test(q.joined));
    if (trig.length) { const names = new Set(trig.flatMap(c => c.cats)); cands = cands.filter(p => names.has(p.kategori)); }
    const hasFilter = q.maxPrice != null || q.minPrice != null || trig.length > 0 || q.sort;
    if (q.overview) k = Math.max(k, 16);

    if (!q.tokens.length) {
      if (q.overview && !hasFilter) return this.overview();
      if (!hasFilter) return [];
      return this.rank(cands.map(p => ({ p, score: 0 })), q).slice(0, k);
    }
    const scored = cands.map(p => ({ p, score: this.score(p, q.tokens) })).filter(x => x.score > 0);
    return this.rank(scored, q).slice(0, k);
  }

  summary() {
    const cnt = {}; let lo = Infinity, hi = 0;
    for (const p of this.products) { cnt[p.kategori] = (cnt[p.kategori] || 0) + 1; lo = Math.min(lo, p.harga); hi = Math.max(hi, p.harga); }
    const cats = Object.entries(cnt).map(([c, n]) => `${c} (${n})`).join(", ");
    return `Ringkasan katalog: ${this.products.length} produk. Kategori: ${cats}. Harga mulai ${rupiah(lo)} sampai ${rupiah(hi)}.`;
  }

  buildContext(query) {
    const products = this.search(query);
    const lines = products.map(p =>
      `• ${this.shortName(p.nama)} | kategori: ${p.kategori} | harga: ${rupiah(p.harga)} | rating: ${p.rating || "-"} | terjual: ${p.terjual || "-"} | link: ${p.link}` +
      (p.deskripsi ? ` | catatan toko: ${p.deskripsi}` : ""));
    const text = `${this.summary()}\n\nProduk yang cocok dengan pertanyaan (${products.length}):\n` + (lines.join("\n") || "(tidak ada)");
    return { text, products };
  }
}

module.exports = RAGEngine;
module.exports.rupiah = rupiah;
