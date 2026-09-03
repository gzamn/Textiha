/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import express from "express";
import path from "path";
import multer from "multer";
import dotenv from "dotenv";
import { GoogleGenAI, Type } from "@google/genai";
import { execFile } from "child_process";
import { promisify } from "util";
import fs from "fs";
import os from "os";

const execFileAsync = promisify(execFile);

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

// Algorithmic Timing Verification & Refinement Function on server
function serverRefineTimings(rawSegments: any[]): any[] {
  if (!Array.isArray(rawSegments) || rawSegments.length === 0) return [];

  const sanitized = rawSegments
    .filter((s) => s && typeof s.text === "string" && s.text.trim().length > 0)
    .map((s) => {
      const start = typeof s.start === "number" ? s.start : parseFloat(s.start) || 0;
      let end = typeof s.end === "number" ? s.end : parseFloat(s.end) || start + 1.5;

      const cleanText = s.text.trim();
      const wordCount = cleanText.split(/\s+/).filter(Boolean).length;

      // Ensure subtitle duration is comfortable to read (at least ~0.7s or ~0.25s per word)
      const minDuration = Math.max(0.7, wordCount * 0.25);
      if (end <= start || end - start < minDuration) {
        end = start + minDuration;
      }

      return {
        start: parseFloat(start.toFixed(2)),
        end: parseFloat(end.toFixed(2)),
        text: cleanText,
        translation: typeof s.translation === "string" ? s.translation : "",
      };
    })
    .sort((a, b) => a.start - b.start);

  const refined: any[] = [];
  for (let i = 0; i < sanitized.length; i++) {
    const seg = sanitized[i];
    if (refined.length > 0) {
      const prev = refined[refined.length - 1];
      if (seg.start < prev.end) {
        // Fix overlap: respect the first word onset of the current segment,
        // clamp previous segment's end to current segment's start
        prev.end = seg.start;
        if (prev.end <= prev.start + 0.3) {
          prev.end = parseFloat((prev.start + 0.3).toFixed(2));
          seg.start = prev.end;
        }
      } else {
        // If there is a small gap (<= 0.30s) in continuous speech, extend previous caption to bridge it smoothly
        const gap = seg.start - prev.end;
        if (gap > 0 && gap <= 0.30) {
          prev.end = seg.start;
        }
        // If gap > 0.30s (silence / pause), leave it blank as requested
      }
    }

    if (seg.end <= seg.start) {
      seg.end = parseFloat((seg.start + 0.8).toFixed(2));
    }

    refined.push(seg);
  }

  return refined;
}

// Shared transcription processor using Gemini models
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

Your primary duty is to transcribe the provided audio with HIGH ACCURACY and SUB-SECOND PRECISE TIMESTAMPS (0.01s precision).

MANDATORY SCRIPT RULE (STRICT ENFORCEMENT):
1. LATIN SCRIPT FOR ALL FRENCH & ENGLISH WORDS:
   - Any and all French words, English words, technical terms, loanwords, brand names, and modern expressions MUST be written in Latin script with correct French/English spelling.
   - NEVER transliterate French or English words into Arabic script (e.g. NEVER write "نورمال", "ميرسي", "بروجي", "فيديو", "ديفلوبور", "ماركتينغ", "ويكاند", "ليكيب", "فوالا", "سي بون").
   - You MUST write: "normal", "merci", "projet", "vidéo", "développeur", "marketing", "weekend", "l'équipe", "voilà", "c'est bon", "startup", "application", "business", "design", "client", "service", "meeting", "code", "call", "link", etc.
2. ARABIC SCRIPT FOR ARABIC & DARIJA WORDS:
   - All pure Arabic and Algerian Darija words, prefixes, verbs, and particles MUST be written in standard Arabic script (e.g., "اليوم راني", "واش راك", "بزاف", "علابالي", "خاوتي", "كاش جديد", "هكذا", "كيما", "حاب", "نروح", "درنا", "شاف").
3. HYBRID SENTENCE EXAMPLES:
   - "سلام l'équipe اليوم راني رايح ندير un nouveau projet في web development"
   - "هذا le problème بزاف simple، غير نديروا update لـ l'application و c'est bon"
   - "شكراً merci beaucoup خاوتي، نتلاقاو le weekend الجاي إن شاء الله"

CRITICAL TIMING & VERBATIM RULES:
1. STRICT VERBATIM — NO TRANSLATION OR MODIFICATIONS: Transcribe strictly as spoken.
2. FIRST LETTER ONSET (START TIMESTAMP):
   - Concentrate strictly on the very first sound and letter of the first word you transcribe in each sentence/phrase.
   - Start the caption timestamp (start) right at that exact millisecond.
   - If there is an introductory pause, background music, or breath, DO NOT start early. Start the caption exactly when vocalization begins.
3. LAST LETTER OFFSET (END TIMESTAMP):
   - Focus strictly on the last letter/phoneme of the last word in the phrase.
   - End the caption timestamp (end) right when vocalization finishes.
   - Ensure the caption is displayed for the entire duration the phrase is spoken so viewers can read it.
4. CLEAN SUBTITLE PHRASING:
   - Segment speech into natural, readable subtitle chunks (averaging 3 to 5 words per segment).
   - Do NOT produce huge paragraphs in a single segment.
5. STRICT CHRONOLOGICAL ORDER:
   - Segments MUST be sorted in strictly ascending chronological order without overlapping.

Format the response strictly as a JSON array matching the schema.`;

  const userPrompt = `Transcribe this audiovisual file verbatim into timed subtitle segments with exact onset and offset timestamps.
Ensure segment start matches the very first sound of the first word, and segment end matches the exact finish of the last word.
${languagePrompt ? `Additional user instructions: ${languagePrompt}` : ""}`;

  // Priority models for multimodal transcription
  const modelsToTry = ["gemini-3.8-flash", "gemini-2.5-flash", "gemini-3.7-flash"];
  let lastError: any = null;

  for (const modelName of modelsToTry) {
    try {
      const response = await ai.models.generateContent({
        model: modelName,
        contents: [
          {
            inlineData: {
              data: base64Audio,
              mimeType: mimeType || "audio/wav",
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
                  description: "Precise start timestamp in seconds (e.g. 1.45). Must match exact voice onset of first word.",
                },
                end: {
                  type: Type.NUMBER,
                  description: "Precise end timestamp in seconds (e.g. 3.20). Must match exact voice offset of last word.",
                },
                text: {
                  type: Type.STRING,
                  description: "Verbatim subtitle transcription in hybrid Arabic and Latin script (~3-5 words).",
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

      // Algorithmic verification and alignment pass
      return serverRefineTimings(rawSegments);
    } catch (err: any) {
      console.warn(`Attempt with ${modelName} encountered error:`, err?.message || err);
      lastError = err;
      const msg = err?.message || "";
      if (
        msg.includes("API_KEY_INVALID") ||
        msg.includes("API key not valid") ||
        msg.includes("PERMISSION_DENIED") ||
        msg.includes("RESOURCE_EXHAUSTED")
      ) {
        // Fail fast on credential / quota issues
        throw err;
      }
    }
  }

  throw lastError || new Error("Failed to process audio with Gemini.");
}

/**
 * Measure exact media duration in seconds using ffprobe.
 */
async function getMediaDuration(filePath: string): Promise<number> {
  try {
    const { stdout } = await execFileAsync("ffprobe", [
      "-v",
      "error",
      "-show_entries",
      "format=duration",
      "-of",
      "default=noprint_wrappers=1:nokey=1",
      filePath,
    ]);
    const duration = parseFloat(stdout.trim());
    return isNaN(duration) ? 0 : duration;
  } catch (err) {
    console.warn("ffprobe duration detection warning:", err);
    return 0;
  }
}

/**
 * Requirement: When the file exceeds 30 seconds, always divide the file into 15 seconds chunks,
 * transcribe each chunk individually in the backend, then rebuild them and present them to the user as the final piece.
 */
async function divideAndTranscribeAudio(
  activeKey: string,
  buffer: Buffer,
  mimeType: string,
  languagePrompt: string
): Promise<{ segments: any[]; chunked: boolean; totalChunks: number; duration: number }> {
  const tempDir = os.tmpdir();
  const tempId = `transcribe_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;
  const ext = mimeType.includes("wav")
    ? "wav"
    : mimeType.includes("mp3")
    ? "mp3"
    : mimeType.includes("webm")
    ? "webm"
    : "tmp";
  const tempInputPath = path.join(tempDir, `${tempId}_input.${ext}`);

  try {
    await fs.promises.writeFile(tempInputPath, buffer);
    const duration = await getMediaDuration(tempInputPath);
    console.log(`[Backend Intake] Detected media duration: ${duration.toFixed(2)}s`);

    // When the file exceeds 30 seconds, always divide into 15 seconds chunks
    if (duration > 30) {
      const CHUNK_DURATION = 15; // 15 seconds chunks
      const totalChunks = Math.ceil(duration / CHUNK_DURATION);
      console.log(
        `[Backend Chunking] Audio exceeds 30s (${duration.toFixed(2)}s). Dividing into ${totalChunks} chunks of ${CHUNK_DURATION}s each...`
      );

      const allRawSegments: any[] = [];

      for (let i = 0; i < totalChunks; i++) {
        const chunkStart = i * CHUNK_DURATION;
        const chunkLen = Math.min(CHUNK_DURATION, duration - chunkStart);
        if (chunkLen <= 0.2) continue;

        const chunkFilePath = path.join(tempDir, `${tempId}_chunk_${i}.wav`);
        try {
          // Extract 15s chunk to standard 16kHz mono WAV for high-accuracy speech recognition
          await execFileAsync("ffmpeg", [
            "-y",
            "-ss",
            chunkStart.toString(),
            "-i",
            tempInputPath,
            "-t",
            chunkLen.toString(),
            "-vn",
            "-acodec",
            "pcm_s16le",
            "-ar",
            "16000",
            "-ac",
            "1",
            chunkFilePath,
          ]);

          const chunkBuffer = await fs.promises.readFile(chunkFilePath);
          console.log(
            `[Backend Chunking] Transcribing chunk ${i + 1}/${totalChunks} (${chunkStart.toFixed(1)}s - ${(
              chunkStart + chunkLen
            ).toFixed(1)}s)...`
          );

          // Transcribe each chunk individually in the backend
          const chunkSegments = await processTranscriptionWithGemini(
            activeKey,
            chunkBuffer,
            "audio/wav",
            languagePrompt
          );

          // Offset segment timestamps by the chunk's start time
          for (const seg of chunkSegments) {
            const shiftedStart = parseFloat((seg.start + chunkStart).toFixed(2));
            const shiftedEnd = parseFloat((seg.end + chunkStart).toFixed(2));
            allRawSegments.push({
              ...seg,
              start: shiftedStart,
              end: shiftedEnd,
            });
          }
        } catch (chunkErr) {
          console.warn(`[Backend Chunking] Error transcribing chunk ${i + 1}:`, chunkErr);
        } finally {
          fs.promises.unlink(chunkFilePath).catch(() => {});
        }
      }

      // Rebuild all chunks into the final piece
      console.log(
        `[Backend Chunking] Rebuilding ${allRawSegments.length} segments from ${totalChunks} chunks into final piece...`
      );
      const rebuiltSegments = serverRefineTimings(allRawSegments);
      return {
        segments: rebuiltSegments,
        chunked: true,
        totalChunks,
        duration,
      };
    }

    // Audio is <= 30 seconds: transcribe directly as a single piece
    const segments = await processTranscriptionWithGemini(
      activeKey,
      buffer,
      mimeType,
      languagePrompt
    );
    return {
      segments,
      chunked: false,
      totalChunks: 1,
      duration,
    };
  } catch (err) {
    console.warn("divideAndTranscribeAudio error, falling back to direct transcription:", err);
    const segments = await processTranscriptionWithGemini(
      activeKey,
      buffer,
      mimeType,
      languagePrompt
    );
    return {
      segments,
      chunked: false,
      totalChunks: 1,
      duration: 0,
    };
  } finally {
    fs.promises.unlink(tempInputPath).catch(() => {});
  }
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

// 4. Transcription endpoint for standard uploads
app.post(["/api/transcribe", "/transcribe"], upload.single("audio"), async (req, res) => {
  try {
    const userApiKey =
      (req.headers["x-gemini-api-key"] as string) ||
      req.body?.geminiApiKey ||
      (req.headers.authorization?.startsWith("Bearer ") ? req.headers.authorization.substring(7) : undefined);

    const serverKey = process.env.GEMINI_API_KEY || process.env.VITE_GEMINI_API_KEY;
    const activeKey = (userApiKey && userApiKey.trim()) || serverKey;

    if (!activeKey) {
      return res.status(400).json({
        error:
          "Missing Gemini API Key. Please click the 'API Key' button in the top bar to connect your personal Gemini API key.",
      });
    }

    let buffer: Buffer | null = null;
    let mimeType = "audio/wav";

    // 1. Check if audio was sent as base64 in JSON payload
    if (req.body?.audioBase64) {
      buffer = Buffer.from(req.body.audioBase64, "base64");
      mimeType = req.body.mimeType || "audio/wav";
    } else if (req.file?.buffer) {
      // 2. Check if audio was sent via multipart/form-data
      buffer = req.file.buffer;
      mimeType = req.file.mimetype || "audio/mp3";
    }

    if (!buffer || buffer.length === 0) {
      return res.status(400).json({ error: "No audio stream received. Please select an audio or video file." });
    }

    const languagePrompt = req.body?.prompt || "";

    const result = await divideAndTranscribeAudio(
      activeKey,
      buffer,
      mimeType,
      languagePrompt
    );

    let finalSegments = result.segments;
    const chunkOffset = parseFloat(req.body?.chunkOffset) || 0;
    if (chunkOffset > 0 && Array.isArray(finalSegments)) {
      finalSegments = finalSegments.map((s) => ({
        ...s,
        start: parseFloat((s.start + chunkOffset).toFixed(2)),
        end: parseFloat((s.end + chunkOffset).toFixed(2)),
      }));
    }

    return res.json({
      segments: finalSegments,
      chunked: result.chunked,
      totalChunks: result.totalChunks,
      duration: result.duration,
    });
  } catch (error: any) {
    console.error("Transcription error:", error);
    const msg = error?.message || "Failed to transcribe audio.";

    if (msg.includes("API_KEY_INVALID") || msg.includes("API key not valid")) {
      return res.status(401).json({
        error: "Your Gemini API Key is invalid or expired. Please update it in the top bar.",
      });
    }
    if (msg.includes("RESOURCE_EXHAUSTED") || msg.includes("quota")) {
      return res.status(429).json({
        error: "Gemini API rate limit exceeded or free quota exhausted. Please try again in a moment.",
      });
    }

    return res.status(500).json({
      error: msg,
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

    // Process transcription with Gemini (auto-chunks if > 30s)
    const resolvedMime = mimeType || "audio/mp3";
    const result = await divideAndTranscribeAudio(
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

    return res.json({
      segments: result.segments,
      chunked: result.chunked,
      totalChunks: result.totalChunks,
      duration: result.duration,
    });
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
