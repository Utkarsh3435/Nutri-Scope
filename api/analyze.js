// DELETE ANY "export const config" LINES IF YOU SEE THEM!
// This is a standard Node.js function.

export default async function handler(req, res) {
  // 1. SAFETY NET: Wrap everything in a Try/Catch so it NEVER crashes (500)
  try {
    // Basic Checks
    if (req.method !== "POST") {
      return res.status(200).json({ result: "SYSTEM ERROR: Method not allowed" });
    }

    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      return res.status(200).json({ result: "SYSTEM ERROR: API Key is missing in Vercel Settings" });
    }

    const { prompt } = req.body;
    
    // 2. USE THE MODEL FROM YOUR SCREENSHOT
    // gemini-2.5-flash-lite showed usage, so we trust it.
    const model = "gemini-2.5-flash-lite";

    console.log(`[Backend] Connecting to ${model}...`);

    // 3. CALL GOOGLE
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] })
      }
    );

    // 4. HANDLE RESPONSE (Even if it fails, we send it as text)
    if (response.ok) {
      const data = await response.json();
      const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
      
      if (text) return res.status(200).json({ result: text });
      return res.status(200).json({ result: "SYSTEM ERROR: AI returned empty text." });
    }

    // Capture Google's specific error message
    const errorText = await response.text();
    let cleanError = errorText;
    try {
      cleanError = JSON.parse(errorText).error.message;
    } catch (e) {}

    // 5. STOP THE BOUNCE: Send 200 OK with the error message
    return res.status(200).json({ result: `SYSTEM ERROR: ${cleanError}` });

  } catch (error) {
    // 6. CATCH CRITICAL CRASHES (Like "fetch is not defined")
    console.error("Critical Crash:", error);
    return res.status(200).json({ result: `CRITICAL CRASH: ${error.message}` });
  }
}