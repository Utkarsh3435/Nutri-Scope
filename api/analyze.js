export default async function handler(req, res) {
  // 1. Force a "Success" status (200) even if setup fails, so the App reads the message.
  if (req.method !== "POST") return res.status(200).json({ result: "ERROR: Method not allowed" });
  
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return res.status(200).json({ result: "ERROR: API Key is missing in Vercel Settings" });

  const { prompt } = req.body;

  // STRATEGY: Use the ONE model that showed "4/10" usage in your screenshot.
  // This is the only one we trust right now.
  const model = "gemini-2.5-flash-lite";

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

    // 2. Handling the Response
    if (response.ok) {
      const data = await response.json();
      const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
      
      if (text) {
        return res.status(200).json({ result: text });
      } else {
        return res.status(200).json({ result: "ERROR: AI returned empty text" });
      }
    }

    // 3. FAILURE CASE: Google gave an error (404, 429, etc.)
    const errorText = await response.text();
    console.error(`[Backend] Google Error:`, errorText);
    
    // Parse the error to be readable
    let niceError = errorText;
    try {
      const json = JSON.parse(errorText);
      niceError = json.error.message;
    } catch (e) {}

    // CRITICAL FIX: Send 200 OK. This tricks the App into thinking it found ingredients.
    // It will move to the next screen and display this error message in the text box.
    return res.status(200).json({ result: `SYSTEM ERROR: ${niceError}` });

  } catch (error) {
    console.error("[Backend] Crash:", error);
    // CRITICAL FIX: Even on a server crash, send 200 OK with the error.
    return res.status(200).json({ result: `CRASH ERROR: ${error.message}` });
  }
}