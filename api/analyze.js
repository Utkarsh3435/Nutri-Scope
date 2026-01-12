export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const apiKey = process.env.GEMINI_API_KEY;
  const { prompt } = req.body;

  if (!apiKey) return res.status(500).json({ error: "Server Error: API Key missing" });

  // STRATEGY: Sibling Swap
  // We use ONLY the models listed in your screenshot.
  const models = [
    "gemini-2.5-flash-lite", // Primary (10 RPM limit)
    "gemini-2.5-flash"       // Backup (5 RPM limit - Separate bucket)
  ];

  for (const model of models) {
    try {
      console.log(`[Backend] Trying model: ${model}...`);

      const response = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] })
        }
      );

      // --- HANDLE RATE LIMIT (429) ---
      if (response.status === 429) {
        console.warn(`[Backend] ${model} hit Rate Limit (429). Switching to backup...`);
        // Don't wait (to avoid Vercel timeout), just try the next model immediately
        continue; 
      }

      if (!response.ok) {
        const errorText = await response.text();
        console.error(`[Backend] ${model} Error (${response.status}):`, errorText);
        // If it's a 404 (Model not found), just try the next one
        if (response.status === 404) continue;
        // For other errors, keep going in case the next model works
        continue;
      }

      // SUCCESS
      const data = await response.json();
      const text = data.candidates?.[0]?.content?.parts?.[0]?.text;

      if (text) {
        return res.status(200).json({ result: text });
      }

    } catch (error) {
      console.error(`[Backend] Connection failed for ${model}:`, error);
    }
  }

  // If ALL models fail
  return res.status(429).json({ 
    error: "Server is highly congested. Please wait 30 seconds." 
  });
}