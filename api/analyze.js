export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const apiKey = process.env.GEMINI_API_KEY;
  const { prompt } = req.body;

  if (!apiKey) return res.status(500).json({ error: "Server Error: API Key missing" });

  // STRATEGY: Triple Fallback
  // We add 'gemini-3-flash' as the final safety net.
  const models = [
    "gemini-2.5-flash-lite", // 1. Fast & Cheap
    "gemini-2.5-flash",      // 2. Standard Backup
    "gemini-3-flash"         // 3. The "Secret Weapon" (Separate Traffic Lane)
  ];

  for (const model of models) {
    try {
      console.log(`[Backend] Attempting: ${model}...`);

      const response = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] })
        }
      );

      // RATE LIMIT (429) -> Immediate Switch
      if (response.status === 429) {
        console.warn(`[Backend] ${model} blocked (429). Switching...`);
        continue; 
      }

      // OTHER ERRORS (Like 503 Overloaded) -> Immediate Switch
      if (!response.ok) {
        const errorText = await response.text();
        console.error(`[Backend] ${model} failed (${response.status}):`, errorText);
        // If 404 (Not Found), switch. If 500+ (Server Error), switch.
        continue; 
      }

      // SUCCESS
      const data = await response.json();
      const text = data.candidates?.[0]?.content?.parts?.[0]?.text;

      if (text) {
        return res.status(200).json({ result: text });
      }

    } catch (error) {
      console.error(`[Backend] Connection error for ${model}:`, error);
    }
  }

  // If ALL 3 fail, we finally give up
  return res.status(429).json({ 
    error: "System busy. Please wait 10s and try again." 
  });
}