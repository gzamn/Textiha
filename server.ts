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

// Configure multer for memory storage
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 35 * 1024 * 1024, // 35 MB limit
  },
});

// Initialize Gemini Client
// We use lazy initialization to handle missing keys gracefully on startup
let aiClient: GoogleGenAI | null = null;

function getAiClient(): GoogleGenAI {
  if (!aiClient) {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      throw new Error("GEMINI_API_KEY environment variable is not defined. Please set it in Settings > Secrets.");
    }
    aiClient = new GoogleGenAI({
      apiKey,
      httpOptions: {
        headers: {
          "User-Agent": "aistudio-build",
        },
      },
    });
  }
  return aiClient;
}

// Enable JSON body parsing for settings, etc.
app.use(express.json({ limit: "10mb" }));

// 1. Health check endpoint
app.get("/api/health", (req, res) => {
  res.json({ status: "ok", message: "Algerian Darija Subtitle Builder Server is running." });
});

// 2. Transcription and Translation endpoint
app.post("/api/transcribe", upload.single("audio"), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: "No audio file provided. Please upload an MP3 file." });
    }

    const languagePrompt = req.body.prompt || "";

    // Convert audio buffer to base64
    const base64Audio = req.file.buffer.toString("base64");
    const mimeType = req.file.mimetype || "audio/mp3";

    const ai = getAiClient();

    const systemInstruction = `You are a professional audiovisual transcriber and expert in North African linguistics, particularly Algerian Darija (the Algerian dialect of Arabic).
Algerian Darija is unique because it heavily blends Arabic, French, and English in everyday spoken conversation.

Your job is to transcribe the provided audio file and create accurate time-stamped video subtitles (captions).

CRITICAL REQUIREMENTS:
1. DO NOT TRANSLATE: Only transcribe exactly what is spoken. Never translate the text into English, French, or standard Arabic.
2. LINGUISTIC SCRIPT RULE:
   - If the words spoken are English or French, they MUST be transcribed in standard LATIN script (e.g., "l'équipe", "absolute beautiful day", "c'est incroyable").
   - If the words spoken are Algerian Darija, they MUST be transcribed in standard ARABIC script (e.g., "اليوم راني", "سلام الخاوة").
   - This results in a beautiful hybrid script representing code-switching exactly as it is spoken (e.g. "سلام l'équipe! اليوم راني في la Casbah d'Alger, absolute beautiful day!").
3. TEMPORAL ACCURACY & WORD TIMING PRECISION:
   - Listen to the audio with extreme sub-second precision. Align timestamps directly to speech phoneme onset (start) and offset (end).
   - Do NOT start the first subtitle segment at 0.0 unless the voice literally begins at 0.0 seconds. 
   - Accurately detect any silent or music intro in the audio. If speech starts at e.g., 2.35 seconds, the first segment MUST have a start timestamp of exactly 2.35.
   - Split speech into concise, short subtitle segments of 1.5 to 3.5 seconds each (approx 2 to 5 words). Short phrases provide far higher word timing accuracy and sync smoothly with fast speech.
   - Strip out silent pauses between phrases — do NOT extend segment duration over long silences.
   - Ensure consecutive segment timestamps are strictly sequential and do not overlap.

Format the response STRICTLY as a JSON array of subtitle segments based on the requested schema.`;

    const userPrompt = `Please transcribe this audio file.
Follow the linguistic script rule strictly: Arabic script for Algerian Darija, Latin script for English/French.
Do NOT translate; transcribe verbatim. Align with exact start and end timestamps.
${languagePrompt ? `Additional custom guidelines from user: ${languagePrompt}` : ""}`;

    // Make the API call to gemini-3.5-flash
    const response = await ai.models.generateContent({
      model: "gemini-3.5-flash",
      contents: [
        {
          inlineData: {
            data: base64Audio,
            mimeType,
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
                description: "Start timestamp in seconds (decimal, e.g. 1.25). Must be highly accurate.",
              },
              end: {
                type: Type.NUMBER,
                description: "End timestamp in seconds (decimal, e.g. 4.60). Must be highly accurate.",
              },
              text: {
                type: Type.STRING,
                description: "Transcription in hybrid Arabic (for Darija) and Latin (for English/French) scripts.",
              },
              translation: {
                type: Type.STRING,
                description: "Always return an empty string since translation is disabled.",
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

    // Parse and return the JSON
    const segments = JSON.parse(responseText.trim());
    return res.json({ segments });
  } catch (error: any) {
    console.error("Transcription error:", error);
    return res.status(500).json({
      error: error.message || "Failed to transcribe audio. Please check your API key and file format.",
    });
  }
});

// Global Express Error Handler
app.use((err: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
  console.error("Unhandled Express Error:", err);
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

// Only listen directly if not running as a Vercel serverless function
if (!process.env.VERCEL) {
  startServer();
}
