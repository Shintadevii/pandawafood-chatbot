// Uji cepat pencarian RAG tanpa memanggil AI: npm run test:rag
const RAG = require("../lib/rag");
const rag = new RAG();
const queries = [
  "keripik apel di bawah 20 ribu", "dodol apa saja", "apel manalagi 1kg", "cuka apel 250ml",
  "yang paling laris apa", "buah segar termurah", "kerupuk buah kiwi", "kripik nangka 100 gram",
  "oleh-oleh apa saja yang dijual", "pizza", "snack sehat di atas 50rb"
];
for (const q of queries) {
  const r = rag.search(q);
  console.log(`\n> ${q}  (${r.length} hasil)`);
  r.slice(0, 4).forEach(p => console.log(`   - ${rag.shortName(p.nama).slice(0, 62)} | ${p.kategori} | Rp${p.harga} | ${p.terjual || "-"}`));
}
