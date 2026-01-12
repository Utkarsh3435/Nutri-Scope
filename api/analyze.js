export default async function handler(req, res) {
  // 1. Basic Setup
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });
  
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return res.status(500).json({ error: "API Key missing in Vercel Settings" });

  const { prompt } = req.body;

  // STRATEGY: Use ONLY the models visible in your "Gemini API Usage" screenshot.
  // We skip 'gemini-3-flash' because it is throwing 404s.
  const models = [
    "gemini-2.5-flash-lite", // Primary: Shows 4/10 usage in your screenshot
    "gemini-2.5-flash",      // Backup: Shows 0/5 usage
    "gemini-1.5-flash"       // Safety: Old reliable (often works even if not listed)
  ];
  
  let lastError = "Unknown Error";

  for (const model of models) {
    try {
      console.log(`[Backend] Connecting to ${model}...`);

      const response = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] })
        }
      );

      // SUCCESS!
      if (response.ok) {
        const data = await response.json();
        const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
        return res.status(200).json({ result: text });
      }

      // FAILURE - Log it and try the next one
      const errorText = await response.text();
      console.warn(`[Backend] ${model} failed (${response.status}). Trying next...`);
      
      // Keep the detailed error to show you if all fail
      try {
        const errJson = JSON.parse(errorText);
        lastError = `${model}: ${errJson.error.message}`;
      } catch {
        lastError = `${model}: ${errorText}`;
      }

    } catch (e) {
      console.error(`[Backend] Network Error on ${model}:`, e);
      lastError = e.message;
    }
  }

  // If ALL 3 fail, return the EXACT error from Google
  return res.status(500).json({ 
    error: `Analysis Failed. Google Error: ${lastError}` 
  });
}