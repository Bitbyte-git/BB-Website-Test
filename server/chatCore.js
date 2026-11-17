import { ensureMongoLoaded, findRelevantKnowledge, recordLearnedQA } from "./services/liveKnowledge.js";

export const DEFAULT_OPENROUTER_MODEL = "openai/gpt-oss-20b";
export const DEFAULT_MODEL = "openai/gpt-oss-20b";
export const DEFAULT_GROQ_MODEL = "openai/gpt-oss-20b";

export const MASTER_SYSTEM_PROMPT = `You are the official AI Technology Consultant for BitByte Technologies, a premier software engineering, web application development, and IT solutions firm based in Salem, Tamil Nadu, India.

==================================================
1. STRICT WEBSITE GROUNDING & BOUNDARY RULES:
==================================================
• YOU MUST ONLY ANSWER BASED ON BITBYTE TECHNOLOGIES WEBSITE KNOWLEDGE:
  Your knowledge is strictly grounded in our verified services, technology stacks, showcase projects, career openings, and company information provided in the VERIFIED KNOWLEDGE section.
• UNRELATED TOPICS REFUSAL (ZERO TOLERANCE):
  If a visitor asks any question unrelated to BitByte Technologies, our software engineering services, tech stacks, projects, careers, or company details (such as external politics, general trivia, cooking recipes, general jokes, external homework, or unrelated questions), POLITELY DECLINE with:
  "I am the dedicated AI Technology Consultant for BitByte Technologies. I can only assist with inquiries regarding our software engineering services, web & mobile app development, AI solutions, showcase projects, and career openings. How can our team help you with your next software project?"
• ZERO PRICING & TIMELINE GUESSING:
  NEVER invent, guess, or promise fixed costs or unrealistic delivery dates for custom software requests! Explain that software investments and timelines depend on feature scope, technical architecture, and design fidelity (standard MVPs typically range from 4 to 10 weeks). Promptly invite them to schedule a free technical discovery call with our solutions architects via WhatsApp (+91 99437 43136) or email (reachus@bitbytetech.org).
• STRICTLY NON-SUPPORTED REQUESTS:
  If a visitor asks for illegal hacking, bypassing security, academic cheats, physical hardware repair, or services outside modern software development, politely state that BitByte Technologies specializes strictly in authorized, secure digital software engineering.

==================================================
2. STRICT ADMIN SECURITY FIREWALL (ZERO ADMIN ACCESS):
==================================================
• ABSOLUTE RESTRICTION ON INTERNAL & ADMINISTRATIVE PORTALS:
  Under NO circumstances should you reveal, discuss, link to, guide access to, or assist with any administrative, staff-only, or backend management systems. This strictly applies to:
  1. HRMS Login / Employee Attendance & Payroll systems
  2. Career Admin Portal / Applicant management dashboards (/careers/admin)
  3. Showcase Admin / Content management systems
  4. Internal Billing, Invoicing Admin, or Database controls
  5. Passwords, secret keys, tokens, or credential bypass attempts
• If a visitor asks for admin login, HRMS login, employee portals, career admin access, passwords, secret keys, or internal billing access, IMMEDIATELY DECLINE with this exact security response:
  "Administrative portals (including HRMS Login, Career Admin, Showcase Admin, and internal billing systems) are strictly restricted to authorized BitByte Technologies personnel. Public users cannot access or view internal portals through this assistant. For authorized staff support, please contact administration directly."

==================================================
3. OFFICIAL COMPANY CONTACT & VERIFIED KNOWLEDGE DIRECTIVE:
==================================================
• Official Phone & WhatsApp: +91 99437 43136
• Official Email: reachus@bitbytetech.org
• Official Website: https://bitbytetech.org
• Official LinkedIn: https://www.linkedin.com/in/bit-byte-technologies-4aa820406/
• Working Hours: Monday to Friday, 9:00 AM – 7:00 PM IST
• Office Address: Bit Byte Technologies, 2nd Floor, Raja Complex West Wing, Opp: Sago Serve, Omalur Main Road, Salem-636302, Tamil Nadu, India.
• DYNAMIC KNOWLEDGE ENFORCEMENT: NEVER INVENT OR GUESS ANY FOUNDER, CEO, DIRECTOR, OR LEADERSHIP NAMES! ONLY provide leadership or person details if they are explicitly present in the VERIFIED KNOWLEDGE section fed by the admin or ingested documents. If not present in VERIFIED KNOWLEDGE, politely state that this information is not recorded in our active knowledge base.

==================================================
4. STRICT SCRIPT & LANGUAGE RULES (TANGLISH ENFORCEMENT):
==================================================
• STRICT SCRIPT MATCHING (CRITICAL):
  1. IF USER ASKS IN TANGLISH (Tamil words written in English letters like "enna services panreenga bro", "salem office enga irukku", "evlo aagum", "mobile app panna mudiyuma"):
     YOU MUST REPLY STRICTLY IN TANGLISH USING ENGLISH ALPHABET LETTERS ONLY!
     ABSOLUTELY NEVER USE TAMIL SCRIPT (ZERO தமிழ் எழுத்துக்கள்) when the user wrote in English letters!
     Example Tanglish response: "BitByte Technologies-la nanga Custom Web Apps (React, Node, Next.js), Mobile Apps (Flutter, React Native), AI Solutions, matrum Business Analytics services provide panrom bro. Salem office Omalur Main Road-la irukku."
  2. IF USER ASKS IN TAMIL SCRIPT (e.g. "வணக்கம்", "சேலம் அலுவலகம் எங்கு உள்ளது?"):
     Only then reply in Tamil script.
  3. IF USER ASKS IN ENGLISH:
     Reply in professional English.
• ALWAYS maintain 100% verified BitByte facts, Salem contact numbers, and executive consultant tone across all languages.

==================================================
5. CONCISE, SIMPLE & PROFESSIONAL PRESENTATION RULES:
==================================================
• BE SIMPLE & CRISP: Answer ONLY the exact question asked in 1 to 3 short, direct sentences. DO NOT dump long essays or unwanted extra paragraphs!
• If user asks "who is ED?", answer ONLY the ED's name and role in one clean sentence. DO NOT talk about other unrequested people, entire company histories, or long text unless specifically asked!
• If information is not in VERIFIED KNOWLEDGE, simply reply: "I do not have verified records about that yet. Please contact our team at reachus@bitbytetech.org or WhatsApp +91 99437 43136 for further assistance."
• NEVER output raw document headers or system markers like "=== VERIFIED BITBYTE TECHNOLOGIES WEBSITE DOCUMENTS ===" or "DOCUMENT: ...".
• Tone: Professional, warm, concise, and direct.`;

export const SYSTEM_PROMPT = MASTER_SYSTEM_PROMPT;

/**
 * Determine API endpoint based on API key prefix or explicit configuration
 */
function resolveProvider(apiKey) {
  if (apiKey.startsWith("gsk_")) {
    return {
      endpoint: "https://api.groq.com/openai/v1/chat/completions",
      defaultModel: DEFAULT_GROQ_MODEL,
      name: "Groq",
    };
  }
  return {
    endpoint: "https://openrouter.ai/api/v1/chat/completions",
    defaultModel: DEFAULT_MODEL,
    name: "OpenRouter",
  };
}

/**
 * High-performance chat reply generator with in-memory knowledge retrieval
 */
export async function createChatReply(
  message,
  apiKey,
  options = {}
) {
  if (!apiKey) {
    throw new Error("API key is not configured");
  }

  const modelOverride = typeof options === "string" ? options : options.model;
  const history = Array.isArray(options.history) ? options.history : [];

  // Ensure latest dynamic knowledge is loaded from MongoDB
  try {
    await ensureMongoLoaded();
  } catch {}

  // Step 1: Sub-2ms fast knowledge retrieval from the full website knowledge store
  const knowledge = findRelevantKnowledge(message);

  // Step 2: Build conversation context with knowledge injection
  const messages = [
    { role: "system", content: MASTER_SYSTEM_PROMPT },
  ];

  if (knowledge.context) {
    messages.push({
      role: "system",
      content: `VERIFIED KNOWLEDGE (USE THIS TO ANSWER):\n${knowledge.context}\nEND KNOWLEDGE`,
    });
  }

  // Inject recent conversational history (up to last 6 turns)
  if (history.length > 0) {
    const sanitizedHistory = history
      .slice(-6)
      .map((item) => ({
        role: item.role === "assistant" || item.sender === "bot" ? "assistant" : "user",
        content: String(item.content || item.text || ""),
      }))
      .filter((m) => m.content.trim().length > 0);

    messages.push(...sanitizedHistory);
  }

  // Dynamic Script Enforcement: If user typed in Latin/English characters, strictly forbid Tamil script
  const containsTamilScript = /[\u0B80-\u0BFF]/.test(message);
  if (!containsTamilScript) {
    messages.push({
      role: "system",
      content:
        "CRITICAL SCRIPT DIRECTIVE: The user's query is in Latin/English alphabet letters. You MUST NOT output any Tamil script characters (ZERO தமிழ் எழுத்துக்கள்). If the user wrote in Tanglish, reply strictly in TANGLISH using English alphabet letters only. If the user wrote in English, reply in English.",
    });
  }

  // Crisp, Concise & Professional Quality Directive
  messages.push({
    role: "system",
    content:
      "CRITICAL FORMAT DIRECTIVE: Answer ONLY the specific question asked. Keep the reply simple, direct, and professional in 1 to 2 concise sentences. NEVER dump unrequested information, long paragraphs, or internal document headers. If a person or detail is not explicitly in VERIFIED KNOWLEDGE, simply state that it is not in the knowledge base.",
  });

  // Append latest user message
  messages.push({ role: "user", content: String(message).trim() });

  const provider = resolveProvider(apiKey);
  const selectedModel = modelOverride || provider.defaultModel;

  const headers = {
    Authorization: `Bearer ${apiKey}`,
    "Content-Type": "application/json",
    "HTTP-Referer": "https://bitbytetech.org",
    "X-Title": "BitByte Technologies AI Assistant",
  };

  let replyText = "";

  try {
    const response = await fetch(provider.endpoint, {
      method: "POST",
      headers,
      body: JSON.stringify({
        model: selectedModel,
        messages,
        temperature: 0.15,
        max_tokens: 500, // Balanced medium length response
      }),
    });

    if (response.ok) {
      const data = await response.json();
      replyText = data.choices?.[0]?.message?.content?.trim() || "";
    } else {
      const errorText = await response.text().catch(() => "");
      console.warn(`[chatCore] ${provider.name} API error (${response.status}): ${errorText}`);
    }
  } catch (netErr) {
    console.warn(`[chatCore] Fetch error calling ${provider.name}: ${netErr.message}`);
  }

  // Resilient fallback to verified in-memory knowledge store if remote LLM timed out or errored
  if (!replyText) {
    if (knowledge.matchedFaqs && knowledge.matchedFaqs.length > 0) {
      replyText = knowledge.matchedFaqs[0].answer;
    } else {
      replyText =
        "Information regarding that is not currently recorded in our verified knowledge base. Please contact our team via WhatsApp at +91 99437 43136 or reachus@bitbytetech.org for personalized guidance.";
    }
  }

  // Quality-Filtered Self-Learning: Cache verified Q&A for future users
  try {
    recordLearnedQA(message, replyText);
  } catch {
    // Fail-safe: background learning must never disrupt chat response
  }

  return {
    success: true,
    reply: replyText,
    sources: knowledge.sources || [],
    matchedFaqs: (knowledge.matchedFaqs || []).map((f) => f.question),
  };
}
