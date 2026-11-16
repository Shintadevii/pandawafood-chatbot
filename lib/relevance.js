"use strict";
// Penyaring pesan masuk WhatsApp: apakah pesan ini menyangkut produk / toko Pandawafood?
// Dipakai gateway agar chat pribadi biasa (teman, keluarga, notifikasi) tidak dibalas bot.
const PRODUCT_WORDS = new RegExp("\\b(" + [
  // nama toko & platform
  "pandawa", "pandawafood", "shopee", "katalog", "ongkir", "produk", "oleh[- ]?oleh",
  // kategori & produk
  "keripik", "kripik", "kerupuk", "krupuk", "dodol", "jenang", "cookies", "kue", "brownies",
  "cuka", "camilan", "cemilan", "rambak",
  // buah & sayur
  "apel", "apple", "jeruk", "jambu", "mangga", "nanas", "melon", "pear", "salak", "alpukat",
  "nangka", "sirsak", "pisang", "kiwi", "durian", "strawberry", "stroberi", "lemon",
  "kentang", "wortel", "brokoli", "sayur", "buah"
].join("|") + ")\\b", "i");

function isRelevant(text) {
  return PRODUCT_WORDS.test(String(text || ""));
}

module.exports = { isRelevant };