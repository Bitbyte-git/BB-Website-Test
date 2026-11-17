import dns from "node:dns";
dns.setServers(["8.8.8.8", "1.1.1.1"]);
import dotenv from "dotenv";
dotenv.config();

import {
  bulkPersistLearnedQAToMongo,
  deleteLearnedQAFromMongo,
  getLearnedQAFromMongo,
  loadLearnedQAFromMongo,
  persistLearnedQAToMongo,
} from "../services/liveKnowledge.js";
import { createChatReply, DEFAULT_MODEL, DEFAULT_GROQ_MODEL } from "../server/chatCore.js";

function getBearerToken(req) {
  return req.headers.authorization?.replace(/^Bearer\s+/i, "").trim() || "";
}

function isAuthorized(req) {
  const adminSecret = process.env.CAREER_ADMIN_SECRET;
  if (!adminSecret) return false;
  return getBearerToken(req) === adminSecret;
}

function setCorsHeaders(req, res) {
  const requestOrigin = req.headers.origin || "";
  res.setHeader("Access-Control-Allow-Origin", requestOrigin || "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, DELETE, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Authorization, Content-Type");
}

function sendJson(res, statusCode, payload) {
  res.statusCode = statusCode;
  res.setHeader("Content-Type", "application/json");
  res.setHeader("Cache-Control", "no-store");
  res.end(JSON.stringify(payload));
}

async function readBody(req) {
  if (req.body && typeof req.body === "object") {
    return req.body;
  }
  return new Promise((resolve, reject) => {
    let body = "";
    req.on("data", (chunk) => {
      body += chunk;
    });
    req.on("end", () => {
      try {
        resolve(body ? JSON.parse(body) : {});
      } catch {
        resolve({});
      }
    });
    req.on("error", reject);
  });
}

/**
 * Parse uploaded file contents into Q&A entries
 */
async function parseUploadedFile(fileName, fileType, fileData) {
  const ext = (fileName || "").split(".").pop().toLowerCase();
  const items = [];

  // 1. Excel files (.xlsx, .xls)
  if (ext === "xlsx" || ext === "xls" || fileType?.includes("spreadsheet") || fileType?.includes("excel")) {
    const XLSX = await import("xlsx");
    const buffer = Buffer.from(fileData, "base64");
    const workbook = XLSX.read(buffer, { type: "buffer" });
    
    workbook.SheetNames.forEach((sheetName) => {
      const sheet = workbook.Sheets[sheetName];
      const rows = XLSX.utils.sheet_to_json(sheet, { defval: "" });

      rows.forEach((row) => {
        const keys = Object.keys(row);
        let q = "";
        let a = "";
        let cat = sheetName || "Excel Ingest";

        // Heuristic to identify Question and Answer columns
        for (const k of keys) {
          const lk = k.toLowerCase().trim();
          if (lk.includes("question") || lk.includes("query") || lk.includes("prompt") || lk.includes("title") || lk === "q") {
            q = String(row[k]).trim();
          } else if (lk.includes("answer") || lk.includes("response") || lk.includes("solution") || lk.includes("content") || lk.includes("description") || lk === "a") {
            a = String(row[k]).trim();
          } else if (lk.includes("category") || lk.includes("tag") || lk.includes("topic")) {
            cat = String(row[k]).trim();
          }
        }

        // If no matching header was found, use column 1 as Question and column 2 as Answer
        if (!q && keys.length >= 2) {
          q = String(row[keys[0]]).trim();
          a = String(row[keys[1]]).trim();
        }

        if (q && a && q.length > 2 && a.length > 2) {
          items.push({ question: q, answer: a, category: cat });
        }
      });
    });
  } 
  // 2. CSV files
  else if (ext === "csv" || fileType?.includes("csv")) {
    const text = Buffer.from(fileData, "base64").toString("utf-8");
    const lines = text.split(/\r?\n/).filter(Boolean);
    if (lines.length > 0) {
      const header = lines[0].split(",").map((h) => h.replace(/^["']|["']$/g, "").trim().toLowerCase());
      const qIdx = header.findIndex((h) => h.includes("question") || h.includes("query") || h === "q");
      const aIdx = header.findIndex((h) => h.includes("answer") || h.includes("response") || h.includes("content") || h === "a");

      for (let i = 1; i < lines.length; i++) {
        const cols = lines[i].split(",").map((c) => c.replace(/^["']|["']$/g, "").trim());
        const q = cols[qIdx >= 0 ? qIdx : 0] || "";
        const a = cols[aIdx >= 0 ? aIdx : 1] || "";
        if (q && a && q.length > 2 && a.length > 2) {
          items.push({ question: q, answer: a, category: "CSV Ingest" });
        }
      }
    }
  } 
  // 3. JSON files
  else if (ext === "json" || fileType?.includes("json")) {
    const text = Buffer.from(fileData, "base64").toString("utf-8");
    const parsed = JSON.parse(text);

    if (Array.isArray(parsed)) {
      parsed.forEach((entry) => {
        const q = entry.question || entry.q || entry.query || entry.title || "";
        const a = entry.answer || entry.a || entry.response || entry.content || "";
        const cat = entry.category || entry.tag || "JSON Ingest";
        if (q && a) items.push({ question: String(q).trim(), answer: String(a).trim(), category: String(cat).trim() });
      });
    } else if (typeof parsed === "object") {
      Object.entries(parsed).forEach(([key, val]) => {
        if (typeof val === "string" && key && val) {
          items.push({ question: key.trim(), answer: val.trim(), category: "JSON Ingest" });
        }
      });
    }
  } 
  // 4. Word Documents (.docx, .doc)
  else if (ext === "docx" || ext === "doc" || fileType?.includes("wordprocessingml") || fileType?.includes("msword")) {
    const mammoth = await import("mammoth");
    const buffer = Buffer.from(fileData, "base64");
    const docResult = await mammoth.default.extractRawText({ buffer });
    const text = docResult.value || "";

    // 4.1 Parse Canonical Answer groups (PART C, PART D, etc.)
    const variationSections = text.split(/(?=\n[A-Z0-9][^\n]+—[^\n]+)/);
    for (const sec of variationSections) {
      const canonicalMatch = sec.match(/Canonical answer:\s*([^\n\r]+(?:\n[^\n\r]+)*)/i);
      if (!canonicalMatch) continue;
      const answer = canonicalMatch[1].trim();

      const beforeCanonical = sec.slice(0, canonicalMatch.index);
      const lines = beforeCanonical
        .split(/\r?\n/)
        .map((l) => l.trim())
        .filter((l) => l.length > 3 && !l.startsWith("PART ") && !l.startsWith("The chatbot must") && !l.includes("—"));

      for (const q of lines) {
        if (q.length > 3 && q.toLowerCase() !== answer.toLowerCase()) {
          items.push({
            question: q,
            answer: answer,
            category: "Verified Directory & Team",
          });
        }
      }
    }

    // 4.2 Parse Q1. ... A: ... or Q: ... A: ... (100 FAQs style)
    const qaPattern = /(?:^|\n)\s*(?:Q\d*|Question\s*\d*)\s*[\.:]\s*(.+?)\s*(?:\r?\n)+\s*(?:A|Answer)\s*[\.:]\s*([\s\S]+?)(?=(?:\r?\n)\s*(?:Q\d*|Question\s*\d*)\s*[\.:]|PART|\Z)/gi;
    let match;
    while ((match = qaPattern.exec(text)) !== null) {
      const q = match[1].trim();
      const a = match[2].trim();
      if (q && a && q.toLowerCase() !== a.toLowerCase()) {
        items.push({
          question: q,
          answer: a,
          category: fileName || "100 Business FAQs",
        });
      }
    }

    // 4.3 Standard Q/A block fallback if above didn't catch pairs
    if (items.length === 0) {
      const qaPairs = text.split(/(?=Q:\s*|Question:\s*)/i);
      qaPairs.forEach((block) => {
        const m = block.match(/(?:Q|Question):\s*(.+?)(?:\r?\n)+(?:A|Answer):\s*([\s\S]+)/i);
        if (m) {
          const qClean = m[1].trim();
          const aClean = m[2].trim();
          if (qClean && aClean && qClean.toLowerCase() !== aClean.toLowerCase()) {
            items.push({
              question: qClean,
              answer: aClean,
              category: "Word Document",
            });
          }
        }
      });
    }

    // 4.4 Paragraph fallback
    if (items.length === 0) {
      const paragraphs = text.split(/(?:\r?\n\s*){2,}/).filter((p) => p.trim().length > 30);
      paragraphs.forEach((p, idx) => {
        const lines = p.trim().split(/\r?\n/).filter((l) => l.trim().length > 0);
        const firstLine = lines[0].replace(/^#+\s*/, "").trim();
        const body = lines.slice(1).join("\n").trim() || firstLine;
        items.push({
          question: firstLine.length > 10 ? firstLine : `Information from ${fileName} (Section ${idx + 1})`,
          answer: body,
          category: fileName || "Word Document",
        });
      });
    }
  }
  // 5. Text and Markdown (.txt, .md)
  else {
    const text = Buffer.from(fileData, "base64").toString("utf-8");
    // Check if format has "Q: ... A: ..."
    const qaPairs = text.split(/(?=Q:\s*|Question:\s*)/i);
    let foundPairs = false;

    qaPairs.forEach((block) => {
      const match = block.match(/(?:Q|Question):\s*(.+?)(?:\r?\n)+(?:A|Answer):\s*([\s\S]+)/i);
      if (match) {
        const qClean = match[1].trim();
        const aClean = match[2].trim();
        if (qClean && aClean && qClean.toLowerCase() !== aClean.toLowerCase()) {
          foundPairs = true;
          items.push({
            question: qClean,
            answer: aClean,
            category: "Document Ingest",
          });
        }
      }
    });

    // If not structured with Q/A, split by paragraphs / headings
    if (!foundPairs || items.length === 0) {
      const paragraphs = text.split(/\n\s*\n/).filter((p) => p.trim().length > 30);
      paragraphs.forEach((p, idx) => {
        const lines = p.trim().split("\n");
        const firstLine = lines[0].replace(/^#+\s*/, "").trim();
        const body = lines.slice(1).join("\n").trim() || firstLine;
        items.push({
          question: firstLine.length > 10 ? firstLine : `Information about ${fileName} (Section ${idx + 1})`,
          answer: body,
          category: fileName || "Text Document",
        });
      });
    }
  }

  return items;
}

export default async function adminKnowledgeHandler(req, res) {
  setCorsHeaders(req, res);

  if (req.method === "OPTIONS") {
    res.statusCode = 204;
    res.end();
    return;
  }

  if (!isAuthorized(req)) {
    sendJson(res, 401, { success: false, message: "Unauthorized admin access" });
    return;
  }

  try {
    // GET: List all ingested knowledge
    if (req.method === "GET") {
      const items = await getLearnedQAFromMongo();
      sendJson(res, 200, {
        success: true,
        count: items.length,
        items,
      });
      return;
    }

    // DELETE: Delete specific knowledge
    if (req.method === "DELETE") {
      const url = new URL(req.url, `http://${req.headers.host || "localhost"}`);
      const id = url.searchParams.get("id") || req.query?.id;
      const question = url.searchParams.get("question") || req.query?.question;

      if (!id && !question) {
        sendJson(res, 400, { success: false, message: "Missing id or question parameter" });
        return;
      }

      const ok = await deleteLearnedQAFromMongo(id || question);
      sendJson(res, 200, { success: ok, message: ok ? "Knowledge item deleted" : "Item not found" });
      return;
    }

    // POST: Add new knowledge (Single, Bulk, or File Upload)
    if (req.method === "POST") {
      const body = await readBody(req);
      const action = body.action || "add_qa";

      // 0. Conversational Admin Chat (Chat-based Feed, Delete & Test)
      if (action === "admin_chat") {
        const message = String(body.message || "").trim();
        const history = Array.isArray(body.history) ? body.history : [];

        if (!message) {
          sendJson(res, 400, { success: false, message: "Message is required." });
          return;
        }

        // 1. CHECK FOR REMOVE / DELETE INTENT
        // e.g. "please remove CEO", "delete Rajeshkumar", "forget CEO", "remove fake info about CEO", "delete ED"
        const deleteMatch = message.match(/(?:please\s+)?(?:remove|delete|forget|erase|clear)\s+(?:the\s+|all\s+|fake\s+)?(.+)/i);
        if (deleteMatch && deleteMatch[1]) {
          let target = deleteMatch[1]
            .replace(/\b(?:info|information|details|name|record|records|data|knowledge|from memory|please)\b/gi, "")
            .trim();

          if (!target || target.length < 2) {
            target = deleteMatch[1].trim();
          }

          let deletedCount = 0;
          try {
            const dns = await import("node:dns");
            dns.setServers(["8.8.8.8", "1.1.1.1"]);
            const { MongoClient } = await import("mongodb");
            const client = new MongoClient(process.env.MONGODB_URI);
            await client.connect();
            const db = client.db(process.env.MONGODB_DB_NAME || "BB-Careers-Application");
            const col = db.collection("chatbot_learned_qa");

            const escaped = target.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
            const reg = new RegExp(escaped, "i");

            // Smart Multi-Keyword Query:
            // Match exact phrase OR match all keywords across fields (e.g. "CEO" + "Rajeshkumar")
            const words = target
              .split(/\s+/)
              .map((w) => w.trim())
              .filter((w) => w.length >= 2 && !/^(the|about|of|is|who|our|for)$/i.test(w));

            const orConditions = [
              { question: reg },
              { answer: reg },
              { category: reg },
              { tokens: { $in: [target.toLowerCase()] } },
            ];

            if (words.length > 1) {
              const andConditions = words.map((w) => {
                const wEsc = w.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
                const wReg = new RegExp(wEsc, "i");
                return {
                  $or: [
                    { question: wReg },
                    { answer: wReg },
                    { category: wReg },
                    { tokens: { $in: [w.toLowerCase()] } },
                  ],
                };
              });
              orConditions.push({ $and: andConditions });
            }

            // Also match individual specific names/titles if present (e.g. "Rajeshkumar", "Agilan")
            words.forEach((w) => {
              if (w.length >= 3) {
                const wEsc = w.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
                const wReg = new RegExp(wEsc, "i");
                orConditions.push({ question: wReg }, { answer: wReg });
              }
            });

            const delRes = await col.deleteMany({ $or: orConditions });
            deletedCount = delRes.deletedCount || 0;
            await client.close();
            await loadLearnedQAFromMongo(true);
          } catch (err) {
            console.error("Chat delete error:", err);
          }

          sendJson(res, 200, {
            success: true,
            isAction: true,
            actionType: "delete",
            reply: deletedCount > 0
              ? `🗑️ **Action Executed:** Successfully removed **${deletedCount} knowledge record(s)** matching \`${target}\` from MongoDB and BitByte AI active memory!\n\nThe AI will no longer give that information.`
              : `ℹ️ No stored records found matching \`${target}\` in MongoDB. Active memory is clean.`,
            count: deletedCount,
          });
          return;
        }

        // 2. CHECK FOR FEED / LEARN INTENT
        // e.g. "feed: CEO name is ...", "learn: Salem office hours are ...", "remember: we build Flutter apps", "Q: ... A: ..."
        const isQaFormat = /(?:Q|Question):\s*(.+?)\s*(?:A|Answer):\s*(.+)/i.exec(message);
        const isPrefixCommand = /^(?:feed|learn|remember|add knowledge|add qa|teach)\s*[:\-]\s*(.+)/i.exec(message);

        if (isQaFormat || isPrefixCommand) {
          let q = "";
          let a = "";
          let cat = "Admin Chat Learned";

          if (isQaFormat) {
            q = isQaFormat[1].trim();
            a = isQaFormat[2].trim();
          } else if (isPrefixCommand) {
            const textContent = isPrefixCommand[1].trim();
            const splitColon = textContent.split(/:\s*/);
            if (splitColon.length >= 2) {
              q = splitColon[0].trim();
              a = splitColon.slice(1).join(": ").trim();
            } else {
              q = `Information about ${textContent.slice(0, 40)}`;
              a = textContent;
            }
          }

          if (q && a) {
            const item = { question: q, answer: a, category: cat };
            await persistLearnedQAToMongo(item);
            await loadLearnedQAFromMongo(true);

            sendJson(res, 200, {
              success: true,
              isAction: true,
              actionType: "feed",
              reply: `✅ **Action Executed:** New knowledge learned and permanently saved to MongoDB!\n\n• **Question:** ${q}\n• **Answer:** ${a}\n\n*This knowledge is now live in BitByte AI sub-2ms memory and will be used to answer visitor queries.*`,
              item,
            });
            return;
          }
        }

        // 3. NORMAL CHAT & VERIFICATION QUERY
        try {
          const apiKey =
            process.env.OPENROUTER_API_KEY ||
            process.env.GROQ_API_KEY ||
            process.env.VITE_GROQ_API_KEY;
          const model =
            process.env.GROQ_MODEL ||
            process.env.OPENROUTER_MODEL ||
            DEFAULT_GROQ_MODEL;
          const result = await createChatReply(message, apiKey, { model, history });

          sendJson(res, 200, {
            success: true,
            isAction: false,
            reply: result.reply,
            sources: result.sources || [],
          });
        } catch (err) {
          sendJson(res, 200, {
            success: false,
            error: err.message,
            reply: `AI Engine notice: ${err.message}`,
          });
        }
        return;
      }

      // 1. Single Q&A Feed
      if (action === "add_qa") {
        const { question, answer, category } = body;
        if (!question || !answer) {
          sendJson(res, 400, { success: false, message: "Question and Answer are required." });
          return;
        }

        const item = {
          question: String(question).trim(),
          answer: String(answer).trim(),
          category: String(category || "Manual Knowledge").trim(),
        };

        await persistLearnedQAToMongo(item);
        // Force reload into memory
        await loadLearnedQAFromMongo(true);

        sendJson(res, 200, {
          success: true,
          message: "Knowledge fed to BitByte AI successfully!",
          item,
        });
        return;
      }

      // 2. File Upload Ingest
      if (action === "upload_file") {
        const { fileName, fileType, fileData } = body;
        if (!fileName || !fileData) {
          sendJson(res, 400, { success: false, message: "File name and file content are required." });
          return;
        }

        const items = await parseUploadedFile(fileName, fileType, fileData);

        if (items.length === 0) {
          sendJson(res, 400, {
            success: false,
            message: "No readable Q&A or knowledge content found in the uploaded file.",
          });
          return;
        }

        const savedCount = await bulkPersistLearnedQAToMongo(items);
        await loadLearnedQAFromMongo(true);

        sendJson(res, 200, {
          success: true,
          message: `Successfully fed ${savedCount} knowledge items from ${fileName} to BitByte AI!`,
          count: savedCount,
        });
        return;
      }

      // 3. Force Sync Cache
      if (action === "sync_cache") {
        await loadLearnedQAFromMongo(true);
        sendJson(res, 200, { success: true, message: "BitByte AI knowledge memory re-synchronized!" });
        return;
      }

      sendJson(res, 400, { success: false, message: "Unknown action" });
      return;
    }

    sendJson(res, 405, { success: false, message: "Method not allowed" });
  } catch (error) {
    console.error("Admin Knowledge API Error:", error);
    sendJson(res, 500, { success: false, message: error.message || "Internal server error" });
  }
}

