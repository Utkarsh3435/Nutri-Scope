export default async function handler(req, res) {
  const { code } = req.query;

  if (!code) return res.status(400).json({ error: "No barcode" });

  try {
    const r = await fetch(
      `https://world.openfoodfacts.org/api/v0/product/${code}.json`
    );
    const data = await r.json();
    res.status(200).json(data);
  } catch (e) {
    res.status(500).json({ error: "Food API failed" });
  }
}
