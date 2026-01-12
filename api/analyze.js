export default async function handler(req, res) {
  // 1. Setup - Fail fast if setup is wrong
  if (req.method !== "POST") return res.status(200).json({ result: "SYSTEM_ERROR: Method not allowed" });
  
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return res.status(200).json({ result: "SYSTEM_ERROR: API Key is missing in Vercel Settings" });

  const { prompt } = req.body;
  const model = "gemini-2.5-flash-lite"; // The exact model from your usage logs

  // 2. The Strict Timer (8 Seconds)
  // Vercel Free Tier kills us at 10s. We must reply before that.
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 8000);

  try {
    console.log(`[Backend] Calling ${model}...`);

    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] }),
        signal: controller.signal // Link the timer
      }
    );

    clearTimeout(timeoutId); // Stop the timer, we got a response!

    // 3. Handle Google's Answer
    if (response.ok) {
      const data = await response.json();
      const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
      
      if (text) {
        return res.status(200).json({ result: text });
      } else {
        return res.status(200).json({ result: "SYSTEM_ERROR: AI returned empty text (Safety Filter?)" });
      }
    }

    // 4. Handle Google Errors (404, 429, etc)
    const errorText = await response.text();
    console.error(`[Backend] Google Error: ${errorText}`);
    
    // Parse the error to make it readable
    let readableError = errorText;
    try {
      const errJson = JSON.parse(errorText);
      readableError = errJson.error.message;
    } catch (e) {}

    // RETURN 200 OK (With error inside) to force App to show it
    return res.status(200).json({ result: `SYSTEM_ERROR: ${readableError}` });

  } catch (error) {
    clearTimeout(timeoutId);
    console.error("[Backend] Crash:", error);

    if (error.name === 'AbortError') {
      return res.status(200).json({ result: "SYSTEM_ERROR: Request Timed Out (Google took too long)" });
    }
    
    return res.status(200).json({ result: `SYSTEM_ERROR: ${error.message}` });
  }
}