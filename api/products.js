const RAGEngine = require("../lib/rag");
const rag = new RAGEngine();

module.exports = (req, res) => {
  res.setHeader("Cache-Control", "s-maxage=3600, stale-while-revalidate");
  res.status(200).json({
    products: rag.products.map(({ nama, kategori, harga, deskripsi, rating, terjual, link, gambar, soldNum, ratingNum }) =>
      ({ nama, kategori, harga, deskripsi, rating, terjual, link, gambar, soldNum, ratingNum }))
  });
};
