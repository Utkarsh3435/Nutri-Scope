export default async function handler(req, res) {
  // 1. Basic Setup
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });
  
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return res.status(500).json({ error: "API Key missing in Vercel Settings" });

  const { prompt } = req.body;

  // STRATEGY: Try the 'Lite' model first (Fastest), then '3.0' (Newest)
  const models = ["gemini-2.5-flash-lite", "gemini-3-flash"];
  
  let lastError = "Unknown Error";

  for (const model of models) {
    try {
      console.log(`[Backend] Trying ${model} from ${process.env.VERCEL_REGION || "Unknown Region"}...`);

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

      // FAILURE - Capture the specific message
      const errorText = await response.text();
      console.error(`[Backend] ${model} Failed:`, errorText);

      // Try to parse the JSON error to get the readable message
      try {
        const errObj = JSON.parse(errorText);
        lastError = `${model}: ${errObj.error.message}`;
      } catch {
        lastError = `${model}: ${errorText}`;
      }

    } catch (e) {
      console.error(`[Backend] Network Error:`, e);
      lastError = e.message;
    }
  }

  // If both fail, send the SPECIFIC error to your phone
  return res.status(500).json({ 
    error: lastError 
  });
}