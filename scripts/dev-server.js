// Server lokal sederhana untuk mencoba website + API tanpa akun Vercel.
// Jalankan: npm run dev  -> http://localhost:3000
try { require("dotenv").config(); } catch (_) {}
const http = require("http");
const fs = require("fs");
const path = require("path");

const routes = { "/api/chat": require("../api/chat"), "/api/products": require("../api/products") };
const MIME = { ".html": "text/html; charset=utf-8", ".css": "text/css", ".js": "text/javascript", ".png": "image/png", ".svg": "image/svg+xml", ".ico": "image/x-icon" };
const PUBLIC = path.join(__dirname, "..", "public");

http.createServer((req, res) => {
  const url = req.url.split("?")[0];
  res.status = c => { res.statusCode = c; return res; };
  res.json = o => { res.setHeader("Content-Type", "application/json; charset=utf-8"); res.end(JSON.stringify(o)); };
  if (routes[url]) {
    let raw = "";
    req.on("data", d => (raw += d));
    req.on("end", () => { try { req.body = raw ? JSON.parse(raw) : {}; } catch { req.body = {}; } routes[url](req, res); });
    return;
  }
  const file = path.join(PUBLIC, url === "/" ? "index.html" : url);
  if (!file.startsWith(PUBLIC) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) { res.statusCode = 404; return res.end("Tidak ditemukan"); }
  res.setHeader("Content-Type", MIME[path.extname(file)] || "application/octet-stream");
  fs.createReadStream(file).pipe(res);
}).listen(process.env.PORT || 3000, () => console.log("Buka http://localhost:" + (process.env.PORT || 3000)));
