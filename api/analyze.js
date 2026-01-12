export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return res.status(500).json({ error: "API Key missing" });

  const { prompt } = req.body;

  // STRATEGY: Use the NEWEST model only.
  // 'gemini-3-flash' is often less congested than 2.5 on shared IPs.
  const model = "gemini-3-flash";

  try {
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] })
      }
    );

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`Gemini 3.0 Error:`, errorText);
      
      // If we still get a 429, it means the IP is truly dead.
      if (response.status === 429) {
        return res.status(429).json({ 
          error: "Server IP blocked by Google. Please change Vercel Region to 'Mumbai' in Settings." 
        });
      }
      return res.status(response.status).json({ error: "AI Error", details: errorText });
    }

    const data = await response.json();
    const text = data.candidates?.[0]?.content?.parts?.[0]?.text;

    return res.status(200).json({ result: text });

  } catch (error) {
    console.error("Server Error:", error);
    return res.status(500).json({ error: "Connection Failed" });
  }
}