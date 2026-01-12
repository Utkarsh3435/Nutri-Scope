export default async function handler(req, res) {
  // 1. Basic Setup
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });
  
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return res.status(500).json({ error: "API Key missing in Vercel Settings" });

  const { prompt } = req.body;
  
  // 2. Target the best model
  const model = "gemini-2.5-flash-lite";
  let lastError = "Unknown Error";

  // 3. RETRY LOGIC (Try 3 times with 1-second delays)
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      console.log(`[Attempt ${attempt}] Calling ${model}...`);
      
      const response = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] })
        }
      );

      // If Success
      if (response.ok) {
        const data = await response.json();
        const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
        return res.status(200).json({ result: text });
      }

      // If Failed, capture the REAL reason
      const errorText = await response.text();
      console.error(`Attempt ${attempt} Failed:`, errorText);
      
      // Save the error message to show you
      try {
        const errorJson = JSON.parse(errorText);
        lastError = errorJson.error.message;
      } catch {
        lastError = errorText; 
      }

      // Wait 1 second before retrying (unless it's the last attempt)
      if (attempt < 3) await new Promise(r => setTimeout(r, 1000));

    } catch (e) {
      console.error(`Attempt ${attempt} Network Error:`, e);
      lastError = e.message;
    }
  }

  // 4. If all 3 attempts fail, send the REAL error to the frontend
  return res.status(500).json({ 
    error: `Google Error: ${lastError}` 
  });
}