export default async function handler(req, res) {
  // 1. Basic Setup
  if (req.method !== "POST") return res.status(200).json({ result: "Error: Method not allowed" });
  
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return res.status(200).json({ result: "Error: API Key missing in Vercel Settings" });

  const { prompt } = req.body;

  // STRATEGY: Use ONLY the models from your screenshots
  const models = [
    "gemini-2.5-flash-lite", // Primary
    "gemini-2.5-flash",      // Backup
    "gemini-1.5-flash"       // Last Resort
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
        
        if (text) {
          return res.status(200).json({ result: text });
        } else {
          // If Google returns 200 but empty text (Safety filter blocked it)
          console.warn(`[Backend] ${model} returned empty text (Safety Filter?)`);
          lastError = "AI blocked response (Safety Filter)";
          continue;
        }
      }

      // FAILURE
      const errorText = await response.text();
      console.warn(`[Backend] ${model} failed (${response.status})`);
      
      try {
        const errJson = JSON.parse(errorText);
        lastError = errJson.error.message;
      } catch {
        lastError = errorText;
      }

    } catch (e) {
      console.error(`[Backend] Network Error on ${model}:`, e);
      lastError = e.message;
    }
  }

  // --- THE TRICK ---
  // Instead of sending 500 (which crashes your App), we send 200 (Success).
  // But we put the ERROR message inside the result text.
  // This forces your App to show the error in the "Ingredients" box.
  return res.status(200).json({ 
    result: `SYSTEM ERROR: ${lastError}` 
  });
}