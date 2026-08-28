/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import express from "express";
import path from "path";
import multer from "multer";
import dotenv from "dotenv";
import { GoogleGenAI, Type } from "@google/genai";

dotenv.config();

const app = express();
const PORT = 3000;

// Configure multer for memory storage with 25MB limit
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 25 * 1024 * 1024, // 25 MB limit for standard endpoint
  },
});

// Bunny CDN Storage Credentials
const BUNNY_STORAGE_ZONE_NAME = process.env.BUNNY_STORAGE_ZONE_NAME || "textiha";
const BUNNY_STORAGE_HOST = process.env.BUNNY_STORAGE_HOST || "storage.bunnycdn.com";
const BUNNY_STORAGE_ACCESS_KEY =
  process.env.BUNNY_STORAGE_ACCESS_KEY || "7adab3c5-b140-49c4-b6f18533b001-0b2c-49d0";
const BUNNY_PULL_ZONE_URL =
  process.env.BUNNY_PULL_ZONE_URL || "https://textiha.b-cdn.net";

// Helper to get GoogleGenAI instance using user-provided key or server fallback
function getAiClient(userKey?: string): GoogleGenAI {
  const apiKey = (userKey && userKey.trim()) || process.env.GEMINI_API_KEY || process.env.VITE_GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error(
      "No Gemini API key provided. Please sign in and enter your personal Gemini API key (or set GEMINI_API_KEY in environment variables)."
    );
  }
  return new GoogleGenAI({
    apiKey: apiKey.trim(),
    httpOptions: {
      headers: {
        "User-Agent": "aistudio-build",
      },
    },
  });
}

// Shared transcription processor using Gemini 2.5 Flash
async function processTranscriptionWithGemini(
  activeKey: string,
  buffer: Buffer,
  mimeType: string,
  languagePrompt: string
) {
  const ai = getAiClient(activeKey);
  const base64Audio = buffer.toString("base64");

  const systemInstruction = `You are a world-class professional audiovisual transcriber specializing in Algerian Darija (the colloquial Algerian dialect of Arabic).
Algerian Darija is characterized by spontaneous code-switching between Arabic, French, and English in everyday spoken conversation.

Your job is to transcribe the provided audio/video with SUB-SECOND MILLISECOND PRECISION to generate accurate subtitles (captions).

CRITICAL TRANSCRIPTION & TIMING RULES:
1. STRICT VERBATIM — NO TRANSLATION:
   - Transcribe strictly verbatim as spoken. NEVER translate into Standard Arabic, French, or English.
2. LINGUISTIC SCRIPT RULE (Franco-Arabic & English Code-Switching):
   - Algerian Darija words MUST be written in standard ARABIC script (e.g., "اليوم راني", "خاوتي", "واش راك", "بزاف").
   - French and English words MUST be written in LATIN script (e.g., "l'équipe", "tuto", "magnifique", "weekend", "c'est parti").
   - Transcribe hybrid sentences naturally (e.g. "سلام l'équipe اليوم راني في Alger centre").
3. ACCURATE START & END TIMESTAMPS (NO EARLY OR GHOST SUBTITLES):
   - Subtitle segments MUST ONLY appear at the exact millisecond the speaker begins vocalizing that specific phrase.
   - If the audio begins with silence, background noise, music, or breathing before speech, DO NOT start the first subtitle at 0.0s! Start it at the exact moment speech sounds begin (e.g. 1.84s).
   - Subtitle segments MUST DISAPPEAR immediately when the speaker stops talking. Do NOT extend subtitle duration into pauses, silences, or musical transitions.
   - Do NOT repeat earlier words in subsequent segments unless the speaker actually repeated them out loud.
4. CONCISE SHORT PHRASES (2 to 5 WORDS PER SEGMENT):
   - Break speech into concise, fast subtitle segments (duration 1.2s to 3.0s, approx 2 to 5 words). Short subtitle segments guarantee exact synchronization with fast spoken Darija.
5. STRICT CHRONOLOGICAL ORDER:
   - Segments MUST be sorted in strictly ascending chronological order (seg[N].start < seg[N].end <= seg[N+1].start).
   - Never overlap timestamps.

Format the response strictly as a JSON array matching the schema.`;

  const userPrompt = `Transcribe this audiovisual file verbatim into timed subtitle segments.
Ensure each segment starts exactly when speech begins and disappears when speech pauses/stops.
${languagePrompt ? `Additional user instructions: ${languagePrompt}` : ""}`;

  const response = await ai.models.generateContent({
    model: "gemini-2.5-flash",
    contents: [
      {
        inlineData: {
          data: base64Audio,
          mimeType: mimeType || "audio/mp3",
        },
      },
      {
        text: userPrompt,
      },
    ],
    config: {
      systemInstruction,
      responseMimeType: "application/json",
      responseSchema: {
        type: Type.ARRAY,
        description: "List of subtitle segments with timestamps.",
        items: {
          type: Type.OBJECT,
          properties: {
            start: {
              type: Type.NUMBER,
              description: "Precise start timestamp in seconds (e.g. 1.45). Must match exact voice onset.",
            },
            end: {
              type: Type.NUMBER,
              description: "Precise end timestamp in seconds (e.g. 3.20). Must match exact voice offset.",
            },
            text: {
              type: Type.STRING,
              description: "Verbatim transcription in hybrid Arabic and Latin script.",
            },
            translation: {
              type: Type.STRING,
              description: "Empty string.",
            },
          },
          required: ["start", "end", "text", "translation"],
        },
      },
    },
  });

  const responseText = response.text;
  if (!responseText) {
    throw new Error("Empty response received from Gemini API.");
  }

  const rawSegments: any[] = JSON.parse(responseText.trim());

  // Clean, validate and sanitize timestamps
  const sanitized = rawSegments
    .filter((s) => s && typeof s.text === "string" && s.text.trim().length > 0)
    .map((s) => {
      let start = typeof s.start === "number" ? s.start : parseFloat(s.start) || 0;
      let end = typeof s.end === "number" ? s.end : parseFloat(s.end) || start + 1.5;
      if (end <= start) end = start + 1.2;
      return {
        start: parseFloat(start.toFixed(2)),
        end: parseFloat(end.toFixed(2)),
        text: s.text.trim(),
        translation: "",
      };
    })
    .sort((a, b) => a.start - b.start);

  return sanitized;
}

// Global CORS handling for Vercel, previews, and custom domains
app.use((req, res, next) => {
  res.header("Access-Control-Allow-Origin", "*");
  res.header("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS");
  res.header(
    "Access-Control-Allow-Headers",
    "Origin, X-Requested-With, Content-Type, Accept, Authorization, x-gemini-api-key"
  );
  if (req.method === "OPTIONS") {
    return res.sendStatus(200);
  }
  next();
});

// Enable JSON body parsing for settings, etc.
app.use(express.json({ limit: "50mb" }));

// 1. Health check endpoint (matches both /api/health and /health)
app.get(["/api/health", "/health"], (req, res) => {
  const hasServerKey = Boolean(process.env.GEMINI_API_KEY || process.env.VITE_GEMINI_API_KEY);
  res.json({
    status: "ok",
    message: "Algerian Darija Subtitle Builder Server is running.",
    serverKeyConfigured: hasServerKey,
    bunnyCdnConfigured: Boolean(BUNNY_STORAGE_ACCESS_KEY && BUNNY_STORAGE_ZONE_NAME),
  });
});

// 2. Bunny CDN Configuration Endpoint for Direct Browser Uploads
app.get(["/api/bunny-config", "/bunny-config"], (req, res) => {
  res.json({
    enabled: true,
    storageZone: BUNNY_STORAGE_ZONE_NAME,
    storageHost: BUNNY_STORAGE_HOST,
    accessKey: BUNNY_STORAGE_ACCESS_KEY,
    pullZoneUrl: BUNNY_PULL_ZONE_URL,
  });
});

// 3. Validate user API key endpoint
app.post(["/api/validate-key", "/validate-key"], async (req, res) => {
  try {
    const rawKey = req.body?.apiKey || (req.headers["x-gemini-api-key"] as string);
    if (!rawKey || !rawKey.trim()) {
      return res.status(400).json({ valid: false, error: "API key is required" });
    }
    const ai = getAiClient(rawKey.trim());
    const response = await ai.models.generateContent({
      model: "gemini-2.5-flash",
      contents: [{ text: "ping" }],
    });
    if (response && response.text) {
      return res.json({ valid: true, message: "Gemini API key is valid and active." });
    }
    return res.json({ valid: true, message: "Gemini API key validated." });
  } catch (err: any) {
    console.error("API Key validation error:", err);
    return res.status(400).json({
      valid: false,
      error: err.message || "Invalid Gemini API key or quota exceeded.",
    });
  }
});

// 4. Transcription endpoint for standard uploads (< 25 MB)
app.post(["/api/transcribe", "/transcribe"], upload.single("audio"), async (req, res) => {
  try {
    const userApiKey =
      (req.headers["x-gemini-api-key"] as string) ||
      req.body?.geminiApiKey ||
      (req.headers.authorization?.startsWith("Bearer ") ? req.headers.authorization.substring(7) : undefined);

    const serverKey = process.env.GEMINI_API_KEY || process.env.VITE_GEMINI_API_KEY;
    const activeKey = userApiKey || serverKey;

    if (!activeKey) {
      return res.status(400).json({
        error:
          "Missing Gemini API Key. Please sign in and connect your free Gemini API key in the top bar to process your audio.",
      });
    }

    if (!req.file) {
      return res.status(400).json({ error: "No audio file provided. Please upload an audio/video file." });
    }

    const languagePrompt = req.body.prompt || "";
    const mimeType = req.file.mimetype || "audio/mp3";

    const segments = await processTranscriptionWithGemini(
      activeKey,
      req.file.buffer,
      mimeType,
      languagePrompt
    );

    return res.json({ segments });
  } catch (error: any) {
    console.error("Transcription error:", error);
    return res.status(500).json({
      error: error.message || "Failed to transcribe audio. Please check your API key and file format.",
    });
  }
});

// 5. Transcription endpoint for Bunny CDN Direct Uploads (Large Files: 25 MB - 500 MB+)
app.post(["/api/transcribe-bunny", "/transcribe-bunny"], async (req, res) => {
  let uploadedPath = "";
  try {
    const userApiKey =
      (req.headers["x-gemini-api-key"] as string) ||
      req.body?.geminiApiKey ||
      (req.headers.authorization?.startsWith("Bearer ") ? req.headers.authorization.substring(7) : undefined);

    const serverKey = process.env.GEMINI_API_KEY || process.env.VITE_GEMINI_API_KEY;
    const activeKey = userApiKey || serverKey;

    if (!activeKey) {
      return res.status(400).json({
        error:
          "Missing Gemini API Key. Please sign in and connect your free Gemini API key in the top bar to process your audio.",
      });
    }

    const { storagePath, mimeType, prompt } = req.body;
    if (!storagePath) {
      return res.status(400).json({ error: "Missing Bunny CDN storagePath in request payload." });
    }
    uploadedPath = storagePath;

    // Fetch the file from Bunny Storage
    const downloadUrl = `https://${BUNNY_STORAGE_HOST}/${BUNNY_STORAGE_ZONE_NAME}/${storagePath}`;
    console.log(`Fetching large media from Bunny CDN: ${downloadUrl}`);

    const fileResponse = await fetch(downloadUrl, {
      headers: {
        AccessKey: BUNNY_STORAGE_ACCESS_KEY,
      },
    });

    if (!fileResponse.ok) {
      throw new Error(
        `Failed to retrieve file from Bunny CDN storage (HTTP ${fileResponse.status}). Please check storage credentials.`
      );
    }

    const arrayBuffer = await fileResponse.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    // Process transcription with Gemini
    const resolvedMime = mimeType || "audio/mp3";
    const segments = await processTranscriptionWithGemini(
      activeKey,
      buffer,
      resolvedMime,
      prompt || ""
    );

    // Asynchronously delete temporary file from Bunny CDN to keep storage clean
    fetch(downloadUrl, {
      method: "DELETE",
      headers: {
        AccessKey: BUNNY_STORAGE_ACCESS_KEY,
      },
    }).catch((delErr) => {
      console.warn("Could not delete temp file from Bunny CDN:", delErr);
    });

    return res.json({ segments });
  } catch (error: any) {
    console.error("Bunny CDN transcription error:", error);

    // Attempt cleanup on error as well
    if (uploadedPath) {
      const deleteUrl = `https://${BUNNY_STORAGE_HOST}/${BUNNY_STORAGE_ZONE_NAME}/${uploadedPath}`;
      fetch(deleteUrl, {
        method: "DELETE",
        headers: {
          AccessKey: BUNNY_STORAGE_ACCESS_KEY,
        },
      }).catch(() => {});
    }

    return res.status(500).json({
      error:
        error.message ||
        "Failed to transcribe large media from Bunny CDN. Please check your Gemini API key.",
    });
  }
});

// Global Express Error Handler
app.use((err: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
  console.error("Unhandled Express Error:", err);
  if (err instanceof multer.MulterError) {
    if (err.code === "LIMIT_FILE_SIZE") {
      return res.status(413).json({
        error: "The uploaded file exceeds the 25 MB limit. Please compress the file or extract the audio to MP3.",
      });
    }
    return res.status(400).json({
      error: `File upload error: ${err.message}`,
    });
  }
  res.status(err.status || 500).json({
    error: err.message || "A server error occurred while processing the request.",
  });
});

// Export app for Vercel serverless integration
export default app;

// Setup Vite Dev Server / Static Hosting for standalone / Cloud Run container execution
async function startServer() {
  if (process.env.NODE_ENV !== "production") {
    console.log("Starting server in DEVELOPMENT mode with Vite Middleware...");
    const { createServer: createViteServer } = await import("vite");
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    console.log("Starting server in PRODUCTION mode...");
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on port ${PORT}`);
  });
}

// Only start standalone HTTP server if not running in a serverless environment (Vercel / Lambda)
const isServerless = Boolean(
  process.env.VERCEL ||
  process.env.NOW_REGION ||
  process.env.AWS_LAMBDA_FUNCTION_NAME ||
  process.env.VERCEL_ENV
);

if (!isServerless) {
  startServer();
}
