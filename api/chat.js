import { DEFAULT_MODEL, createChatReply } from "../server/chatCore.js";

async function parseRequestBody(req) {
  if (req.body) {
    if (typeof req.body === "string") {
      try {
        return JSON.parse(req.body);
      } catch {
        return {};
      }
    }
    return req.body;
  }

  // Fallback for native Node.js HTTP servers (e.g. server.js)
  return new Promise((resolve) => {
    let raw = "";
    req.on("data", (chunk) => {
      raw += chunk;
    });
    req.on("end", () => {
      try {
        resolve(raw ? JSON.parse(raw) : {});
      } catch {
        resolve({});
      }
    });
    req.on("error", () => resolve({}));
  });
}

export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ success: false, error: "Method not allowed" });
  }

  const apiKey =
    process.env.OPENROUTER_API_KEY ||
    process.env.GROQ_API_KEY;

  if (!apiKey) {
    return res.status(500).json({
      success: false,
      error: "AI API key is not configured on the server",
    });
  }

  const body = await parseRequestBody(req);
  const message = typeof body.message === "string" ? body.message.trim() : "";
  const history = Array.isArray(body.history) ? body.history : [];

  if (!message) {
    return res.status(400).json({ success: false, error: "Message is required" });
  }

  try {
    const model =
      process.env.OPENROUTER_MODEL ||
      process.env.VITE_OPENROUTER_MODEL ||
      process.env.VITE_GROQ_MODEL ||
      process.env.GROQ_MODEL ||
      DEFAULT_MODEL;

    const result = await createChatReply(message, apiKey, {
      model,
      history,
    });

    return res.status(200).json({
      success: true,
      reply: result.reply,
      sources: result.sources || [],
    });
  } catch (error) {
    console.error("AI chat error:", error);
    return res.status(500).json({
      success: false,
      error: "Unable to generate a response right now. Please try again later.",
    });
  }
}
