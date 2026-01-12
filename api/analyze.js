export default async function handler(req, res) {
  // 1. Basic Security
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return res.status(500).json({ error: "Server Error: API Key missing" });

  const { prompt } = req.body;

  // 2. THE SNIPER STRATEGY
  // We target ONLY the model with the highest rate limit (10 RPM).
  // No loops. No waiting. This prevents Vercel timeouts.
  const model = "gemini-2.5-flash-lite";

  try {
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] })
      }
    );

    // 3. Precise Error Handling
    if (!response.ok) {
      const errorText = await response.text();
      console.error(`Gemini Error (${response.status}):`, errorText);
      
      if (response.status === 429) {
        return res.status(429).json({ error: "Server busy (Rate Limit). Please try again in 5 seconds." });
      }
      return res.status(response.status).json({ error: "AI Error", details: errorText });
    }

    // 4. Success!
    const data = await response.json();
    const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
    
    return res.status(200).json({ result: text });

  } catch (error) {
    console.error("Internal Server Error:", error);
    return res.status(500).json({ error: "Connection to Google failed" });
  }
}