// This line is the magic fix. It moves execution to the Edge network.
export const config = {
  runtime: 'edge',
};

export default async function handler(req) {
  // Edge functions use the standard Web Request/Response API
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), { status: 405 });
  }

  try {
    const { prompt } = await req.json();
    const apiKey = process.env.GEMINI_API_KEY;

    if (!apiKey) {
      return new Response(JSON.stringify({ error: "Server Error: API Key missing" }), { status: 500 });
    }

    // STRATEGY: Try 2.5-flash-lite first, then 3-flash as backup
    const models = ["gemini-2.5-flash-lite", "gemini-3-flash"];

    for (const model of models) {
      try {
        const response = await fetch(
          `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] })
          }
        );

        if (response.status === 429) continue; // Busy? Try next.

        if (!response.ok) {
            console.error(`${model} failed: ${response.status}`);
            continue;
        }

        const data = await response.json();
        const text = data.candidates?.[0]?.content?.parts?.[0]?.text;

        if (text) {
          return new Response(JSON.stringify({ result: text }), {
            status: 200,
            headers: { 'Content-Type': 'application/json' }
          });
        }
      } catch (e) {
        console.error(e);
      }
    }

    return new Response(JSON.stringify({ error: "System busy. Please try again." }), { status: 429 });

  } catch (error) {
    return new Response(JSON.stringify({ error: "Invalid Request" }), { status: 400 });
  }
}