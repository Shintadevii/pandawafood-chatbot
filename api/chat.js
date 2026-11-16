const { answer } = require("../lib/chat");

module.exports = async (req, res) => {
  res.setHeader("Cache-Control", "no-store");
  if (req.method !== "POST") return res.status(405).json({ error: "Gunakan metode POST" });
  let body = req.body;
  if (typeof body === "string") { try { body = JSON.parse(body); } catch { body = {}; } }
  body = body || {};
  const message = String(body.message || "").trim().slice(0, 500);
  if (!message) return res.status(400).json({ error: "Pesan kosong", reply: "Tulis pertanyaanmu dulu ya." });
  try {
    const out = await answer({ message, history: Array.isArray(body.history) ? body.history.slice(-6) : [], channel: "web" });
    res.status(200).json(out);
  } catch (err) {
    console.error("[api/chat]", err);
    res.status(500).json({ error: "Gangguan server", reply: "Asisten sedang mengalami gangguan. Coba kirim ulang sebentar lagi." });
  }
};
