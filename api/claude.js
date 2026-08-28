// Serverless proxy so your Anthropic API key stays on the server, never in the browser.
// Set ANTHROPIC_API_KEY (required) and optionally CLAUDE_MODEL in Vercel > Settings > Environment Variables.
export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.status(405).json({ error: "Method not allowed" });
    return;
  }
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) {
    res.status(500).json({ error: "Missing ANTHROPIC_API_KEY environment variable" });
    return;
  }
  try {
    const body = req.body || {};
    // The proxy picks the model so you can change it without touching the app code.
    body.model = process.env.CLAUDE_MODEL || "claude-sonnet-4-5";

    const r = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": key,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify(body),
    });
    const data = await r.json();
    res.status(r.status).json(data);
  } catch (e) {
    res.status(500).json({ error: "Proxy request failed", detail: String(e) });
  }
}
