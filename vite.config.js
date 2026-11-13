import dns from "node:dns";

try {
  dns.setServers(["8.8.8.8", "1.1.1.1"]);
} catch {}

import react from "@vitejs/plugin-react";
import { defineConfig, loadEnv } from "vite";
import careerApplyHandler from "./api/career-apply.js";
import careerApplicationsHandler from "./api/career-applications.js";
import careerResumeHandler from "./api/career-resume.js";
import adminKnowledgeHandler from "./api/admin-knowledge.js";
import { DEFAULT_MODEL, DEFAULT_GROQ_MODEL, createChatReply } from "./server/chatCore.js";

function readRequestBody(req) {
  return new Promise((resolve, reject) => {
    let body = "";

    req.on("data", (chunk) => {
      body += chunk;
    });

    req.on("end", () => {
      resolve(body);
    });

    req.on("error", reject);
  });
}

function sendJson(res, statusCode, payload) {
  res.statusCode = statusCode;
  res.setHeader("Content-Type", "application/json");
  res.end(JSON.stringify(payload));
}

function applyServerEnv(env, names) {
  names.forEach((name) => {
    if (process.env[name] === undefined && env[name] !== undefined) {
      process.env[name] = env[name];
    }
  });
}

function attachApiHelpers(req, res) {
  const requestUrl = new URL(req.url || "/", "http://localhost");
  req.query = Object.fromEntries(requestUrl.searchParams.entries());
  res.req = req;

  res.status = (statusCode) => {
    res.statusCode = statusCode;
    return res;
  };

  res.json = (payload) => {
    if (!res.headersSent) {
      res.setHeader("Content-Type", "application/json");
    }
    res.end(JSON.stringify(payload));
    return res;
  };
}

function bitbyteLocalChatApi() {
  return {
    name: "bitbyte-local-chat-api",
    configureServer(server) {
      const env = loadEnv(server.config.mode, process.cwd(), "");

      server.middlewares.use("/api/chat", async (req, res) => {
        if (req.method !== "POST") {
          res.setHeader("Allow", "POST");
          sendJson(res, 405, { error: "Method not allowed" });
          return;
        }

        let message = "";
        let history = [];

        try {
          const rawBody = await readRequestBody(req);
          const body = rawBody ? JSON.parse(rawBody) : {};
          message = typeof body.message === "string" ? body.message.trim() : "";
          history = Array.isArray(body.history) ? body.history : [];
        } catch {
          sendJson(res, 400, { error: "Invalid JSON body" });
          return;
        }

        if (!message) {
          sendJson(res, 400, { error: "Message is required" });
          return;
        }

        try {
          const apiKey =
            process.env.OPENROUTER_API_KEY ||
            env.OPENROUTER_API_KEY ||
            process.env.GROQ_API_KEY ||
            env.GROQ_API_KEY;
          const model =
            process.env.OPENROUTER_MODEL ||
            env.OPENROUTER_MODEL ||
            process.env.VITE_OPENROUTER_MODEL ||
            env.VITE_OPENROUTER_MODEL ||
            process.env.VITE_GROQ_MODEL ||
            env.VITE_GROQ_MODEL ||
            process.env.GROQ_MODEL ||
            env.GROQ_MODEL ||
            DEFAULT_MODEL ||
            DEFAULT_GROQ_MODEL;

          const result = await createChatReply(message, apiKey, { model, history });
          sendJson(res, 200, {
            success: true,
            reply: result.reply,
            sources: result.sources || [],
          });
        } catch (error) {
          server.config.logger.error(`AI local chat error: ${error.message}`);
          sendJson(res, 500, {
            success: false,
            error: "Unable to generate a response right now",
          });
        }
      });
    },
  };
}

function bitbyteLocalCareerApi() {
  return {
    name: "bitbyte-local-career-api",
    configureServer(server) {
      const env = loadEnv(server.config.mode, process.cwd(), "");
      applyServerEnv(env, [
        "MONGODB_URI",
        "MONGODB_DB_NAME",
        "CAREER_ADMIN_SECRET",
        "CAREER_ADMIN_ALLOWED_ORIGIN",
        "CAREER_RESUME_DOWNLOAD_TOKEN",
        "CAREER_APPLY_ALLOWED_ORIGIN",
        "GROQ_API_KEY",
        "GROQ_MODEL",
        "OPENROUTER_API_KEY",
        "OPENROUTER_MODEL",
      ]);

      server.middlewares.use("/api/career-applications", async (req, res) => {
        attachApiHelpers(req, res);
        await careerApplicationsHandler(req, res);
      });

      server.middlewares.use("/api/career-apply", async (req, res) => {
        attachApiHelpers(req, res);
        await careerApplyHandler(req, res);
      });

      server.middlewares.use("/api/career-resume", async (req, res) => {
        attachApiHelpers(req, res);
        await careerResumeHandler(req, res);
      });

      server.middlewares.use("/api/admin-knowledge", async (req, res) => {
        attachApiHelpers(req, res);
        await adminKnowledgeHandler(req, res);
      });
    },
  };
}

function visitorCounterDevProxy(mode) {
  const env = loadEnv(mode, process.cwd(), "");
  const visitorCounterApi =
    env.VITE_COUNTER_API_URL || env.VITE_VISITOR_COUNTER_API;

  if (!visitorCounterApi) return undefined;

  try {
    const apiUrl = new URL(visitorCounterApi);

    return {
      "/__visitor-counter": {
        target: apiUrl.origin,
        changeOrigin: true,
        secure: true,
        rewrite: () => `${apiUrl.pathname}${apiUrl.search}`,
      },
    };
  } catch {
    return undefined;
  }
}

function groqChatDevProxy(mode) {
  const env = loadEnv(mode, process.cwd(), "");
  const groqChatApi = env.VITE_GROQ_API_URL || env.VITE_CHAT_API_URL;

  if (!groqChatApi) return undefined;

  try {
    const apiUrl = new URL(groqChatApi);

    return {
      "/__groq-chat": {
        target: apiUrl.origin,
        changeOrigin: true,
        secure: true,
        rewrite: () => `${apiUrl.pathname}${apiUrl.search}`,
      },
    };
  } catch {
    return undefined;
  }
}

function buildDevProxy(mode) {
  return {
    ...visitorCounterDevProxy(mode),
    ...groqChatDevProxy(mode),
  };
}

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => ({
  plugins: [react(), bitbyteLocalChatApi(), bitbyteLocalCareerApi()],
  server: {
    port: 5174,
    proxy: buildDevProxy(mode),
  },
  optimizeDeps: {
    include: ["react", "react-dom"],
  },
  build: {
    assetsInlineLimit: 2048,
    chunkSizeWarningLimit: 700,
    cssCodeSplit: true,
    modulePreload: {
      polyfill: false,
    },
    sourcemap: false,
    target: "es2020",
    rollupOptions: {
      output: {
        assetFileNames: "assets/[name]-[hash][extname]",
        chunkFileNames: "assets/[name]-[hash].js",
        entryFileNames: "assets/[name]-[hash].js",
        manualChunks(id) {
          if (id.includes("vite/preload-helper")) return "preload-helper";
          if (
            id.includes("/src/i18n") ||
            id.includes("/src/defaultTranslations")
          )
            return "translations";
          if (id.includes("pdfmake")) return "pdfmake";
          if (id.includes("@splinetool")) return "spline";
          if (id.includes("framer-motion")) return "motion";
          if (id.includes("lucide-react")) return "icons";
          if (
            id.includes("node_modules/react") ||
            id.includes("node_modules/react-dom") ||
            id.includes("node_modules/scheduler")
          )
            return "react-vendor";
          if (id.includes("node_modules")) return "vendor";
          if (
            id.includes("/src/components/WebDevelopment") ||
            id.includes("/src/components/CustomWebApplications")
          )
            return "services-web";
          if (
            id.includes("/src/components/DigitalMarketing") ||
            id.includes("/src/components/BusinessAnalytics")
          )
            return "services-growth";
          if (id.includes("/src/components/CareersPage")) return "careers";
          if (
            id.includes("/src/components/Founder") ||
            id.includes("/src/components/BitByteHero")
          )
            return "cinematic";
          return undefined;
        },
      },
    },
  },
}));
