export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });
  
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return res.status(500).json({ error: "API Key missing in Vercel Settings" });

  const { prompt } = req.body;

  // STRATEGY: Mumbai is working! We just need valid model names.
  // 1. Lite (Fastest)
  // 2. Standard (Backup)
  const models = ["gemini-2.5-flash-lite", "gemini-2.5-flash"];
  
  let lastError = "Unknown Error";

  for (const model of models) {
    try {
      console.log(`[Backend] Trying ${model} from Mumbai...`);

      const response = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] })
        }
      );

      // SUCCESS
      if (response.ok) {
        const data = await response.json();
        const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
        return res.status(200).json({ result: text });
      }

      // FAILURE
      const errorText = await response.text();
      console.error(`[Backend] ${model} Failed:`, errorText);
      lastError = errorText;

    } catch (e) {
      console.error(`[Backend] Network Error:`, e);
      lastError = e.message;
    }
  }

  // If both fail, send the error to your phone
  return res.status(500).json({ 
    error: `Analysis Failed. Google says: ${lastError}` 
  });
}