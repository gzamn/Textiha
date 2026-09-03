/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { SubtitleSegment } from "./types";

/**
 * Extracts and downsamples audio from video or large audio files directly in the browser.
 * Converts to mono 16kHz (or adaptive sample rate) WAV format so the payload is < 3.5MB,
 * ensuring fast, seamless transcription without hitting Vercel's 4.5MB request body limit.
 */
export async function extractAndOptimizeAudio(
  file: File,
  onProgress?: (status: string) => void
): Promise<{ file: File; isExtracted: boolean; originalSize: number; optimizedSize: number }> {
  const isVideo =
    file.type.startsWith("video/") ||
    /\.(mp4|mov|mkv|webm|avi|flv|m4v|3gp|wmv)$/i.test(file.name);
  const isLarge = file.size > 3.5 * 1024 * 1024; // > 3.5 MB

  // If already an audio file and smaller than 3.5MB, no extraction/conversion needed!
  if (!isVideo && !isLarge) {
    return {
      file,
      isExtracted: false,
      originalSize: file.size,
      optimizedSize: file.size,
    };
  }

  onProgress?.("Extracting audio track from media in browser...");

  try {
    const arrayBuffer = await file.arrayBuffer();
    const AudioContextClass =
      window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!AudioContextClass) {
      // Fallback if Web Audio API is unavailable
      return { file, isExtracted: false, originalSize: file.size, optimizedSize: file.size };
    }

    const audioCtx = new AudioContextClass();
    let audioBuffer: AudioBuffer;

    try {
      // slice(0) to prevent buffer detaching issues across browser engines
      audioBuffer = await audioCtx.decodeAudioData(arrayBuffer.slice(0));
    } catch (decodeErr) {
      console.warn("Direct decodeAudioData failed, proceeding with original file:", decodeErr);
      await audioCtx.close().catch(() => {});
      return { file, isExtracted: false, originalSize: file.size, optimizedSize: file.size };
    }

    const duration = audioBuffer.duration;
    const numChannels = audioBuffer.numberOfChannels;

    onProgress?.("Optimizing voice stream for Algerian Darija AI...");

    // Target sample rate: 16000 Hz for optimal speech recognition
    // If audio is very long (e.g. > 100s), adaptively scale sample rate to keep WAV safely < 3.2 MB
    let targetSampleRate = 16000;
    const MAX_ALLOWED_BYTES = 3.2 * 1024 * 1024; // 3.2 MB safety ceiling for Vercel
    const estimatedSize = duration * targetSampleRate * 2;

    if (estimatedSize > MAX_ALLOWED_BYTES) {
      targetSampleRate = Math.max(8000, Math.floor(MAX_ALLOWED_BYTES / (duration * 2)));
    }

    // Downmix to mono and resample to targetSampleRate
    const targetLength = Math.round(duration * targetSampleRate);
    const monoData = new Float32Array(targetLength);

    // Get input channel data
    const channelData: Float32Array[] = [];
    for (let c = 0; c < numChannels; c++) {
      channelData.push(audioBuffer.getChannelData(c));
    }

    const ratio = audioBuffer.sampleRate / targetSampleRate;
    for (let i = 0; i < targetLength; i++) {
      const srcIdx = i * ratio;
      const srcFloor = Math.floor(srcIdx);
      const srcCeil = Math.min(channelData[0].length - 1, srcFloor + 1);
      const frac = srcIdx - srcFloor;

      let sample = 0;
      for (let c = 0; c < numChannels; c++) {
        const s0 = channelData[c][srcFloor] || 0;
        const s1 = channelData[c][srcCeil] || 0;
        sample += s0 + (s1 - s0) * frac;
      }
      sample /= numChannels; // Average channels
      // Clamp to [-1, 1]
      monoData[i] = Math.max(-1, Math.min(1, sample));
    }

    await audioCtx.close().catch(() => {});

    // Encode to 16-bit PCM WAV
    const wavBuffer = encodeWAV(monoData, targetSampleRate);
    const baseName = file.name.replace(/\.[^/.]+$/, "");
    const wavBlob = new Blob([wavBuffer], { type: "audio/wav" });
    const wavFile = new File([wavBlob], `${baseName}_audio.wav`, { type: "audio/wav" });

    return {
      file: wavFile,
      isExtracted: true,
      originalSize: file.size,
      optimizedSize: wavFile.size,
    };
  } catch (err) {
    console.error("Audio optimization error:", err);
    return { file, isExtracted: false, originalSize: file.size, optimizedSize: file.size };
  }
}

/**
 * Encodes Float32Array audio samples into a standard 16-bit PCM WAV ArrayBuffer.
 */
function encodeWAV(samples: Float32Array, sampleRate: number): ArrayBuffer {
  const buffer = new ArrayBuffer(44 + samples.length * 2);
  const view = new DataView(buffer);

  // RIFF chunk descriptor
  writeString(view, 0, "RIFF");
  view.setUint32(4, 36 + samples.length * 2, true);
  writeString(view, 8, "WAVE");

  // fmt sub-chunk
  writeString(view, 12, "fmt ");
  view.setUint32(16, 16, true); // SubChunk1Size (16 for PCM)
  view.setUint16(20, 1, true); // AudioFormat (1 for PCM)
  view.setUint16(22, 1, true); // NumChannels (1 mono)
  view.setUint32(24, sampleRate, true); // SampleRate
  view.setUint32(28, sampleRate * 2, true); // ByteRate (SampleRate * NumChannels * 16/8)
  view.setUint16(32, 2, true); // BlockAlign (NumChannels * 16/8)
  view.setUint16(34, 16, true); // BitsPerSample (16 bits)

  // data sub-chunk
  writeString(view, 36, "data");
  view.setUint32(40, samples.length * 2, true);

  // Write PCM samples (convert float -1.0..1.0 to int16)
  let offset = 44;
  for (let i = 0; i < samples.length; i++, offset += 2) {
    const s = Math.max(-1, Math.min(1, samples[i]));
    view.setInt16(offset, s < 0 ? s * 0x8000 : s * 0x7fff, true);
  }

  return buffer;
}

function writeString(view: DataView, offset: number, string: string) {
  for (let i = 0; i < string.length; i++) {
    view.setUint8(offset + i, string.charCodeAt(i));
  }
}

/**
 * Converts a Blob or File to a base64 encoded string without the data URL prefix.
 */
export async function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      const dataUrl = reader.result as string;
      const base64 = dataUrl.includes(",") ? dataUrl.split(",")[1] : dataUrl;
      resolve(base64 || "");
    };
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

/**
 * Synthesizes or calibrates word-level timestamps for a text segment based on speech cadence and syllable weights.
 * Guarantees that the first word starts exactly at segment start and the last word ends exactly at segment end.
 */
export function calculateWordTimings(
  text: string,
  segStart: number,
  segEnd: number,
  existingWords?: Array<{ word: string; start: number; end: number }>
): Array<{ word: string; start: number; end: number }> {
  const rawWords = text.trim().split(/\s+/).filter(Boolean);
  if (rawWords.length === 0) return [];

  const totalDuration = Math.max(0.2, segEnd - segStart);

  // If existing words match raw words count and are valid, calibrate them to fit segment bounds
  if (
    existingWords &&
    existingWords.length === rawWords.length &&
    existingWords.every((w) => typeof w.start === "number" && typeof w.end === "number" && w.end >= w.start)
  ) {
    const minWStart = existingWords[0].start;
    const maxWEnd = existingWords[existingWords.length - 1].end;
    const span = Math.max(0.1, maxWEnd - minWStart);

    return existingWords.map((w, idx) => {
      const normStart = segStart + ((w.start - minWStart) / span) * totalDuration;
      const normEnd = segStart + ((w.end - minWStart) / span) * totalDuration;
      return {
        word: rawWords[idx],
        start: parseFloat(normStart.toFixed(2)),
        end: parseFloat(Math.max(normStart + 0.05, normEnd).toFixed(2)),
      };
    });
  }

  // Calculate weights based on character length & vowels for natural speech rhythm
  const weights = rawWords.map((w) => Math.max(1, Math.min(10, w.length)));
  const totalWeight = weights.reduce((acc, cur) => acc + cur, 0);

  let currentStart = segStart;
  const result: Array<{ word: string; start: number; end: number }> = [];

  for (let i = 0; i < rawWords.length; i++) {
    const fraction = weights[i] / totalWeight;
    const wordDuration = totalDuration * fraction;
    const wordEnd = i === rawWords.length - 1 ? segEnd : currentStart + wordDuration;

    result.push({
      word: rawWords[i],
      start: parseFloat(currentStart.toFixed(2)),
      end: parseFloat(wordEnd.toFixed(2)),
    });

    currentStart = wordEnd;
  }

  return result;
}

/**
 * Timing Verification & Alignment Algorithm:
 * - Accurately anchors to the voice onset of the first word (never artificially delays start).
 * - Enforces chronological monotonic ordering without overlap (clamps previous end to current start).
 * - Bridges small micro-gaps (<= 0.30s) in continuous speech so captions stay cleanly visible without flickering.
 * - Preserves natural pauses and silences (> 0.30s) so captions disappear during silence.
 */
export function verifyAndRefineTimings(
  segments: SubtitleSegment[],
  options?: { bridgeMicroGaps?: boolean; maxBridgeSeconds?: number }
): SubtitleSegment[] {
  if (!segments || segments.length === 0) return [];

  const bridgeGaps = options?.bridgeMicroGaps ?? true;
  const maxBridge = options?.maxBridgeSeconds ?? 0.30;

  // 1. Sort by start timestamp
  const sorted = [...segments].sort((a, b) => a.start - b.start);
  const refined: SubtitleSegment[] = [];

  for (let i = 0; i < sorted.length; i++) {
    const seg = sorted[i];
    const text = seg.text.trim();
    if (!text) continue;

    let start = parseFloat(seg.start.toFixed(2));
    let end = parseFloat(seg.end.toFixed(2));

    // Ensure minimum reasonable duration based on word count for human reading
    const wordCount = text.split(/\s+/).filter(Boolean).length;
    const minDur = Math.max(0.65, wordCount * 0.25);
    if (end <= start || end - start < minDur) {
      end = parseFloat((start + minDur).toFixed(2));
    }

    // Fix overlap with previous segment while strictly respecting current segment's start onset
    if (refined.length > 0) {
      const prev = refined[refined.length - 1];
      if (start < prev.end) {
        // Clamp previous segment's end right at current segment's start
        prev.end = start;
        if (prev.end <= prev.start + 0.3) {
          prev.end = parseFloat((prev.start + 0.3).toFixed(2));
          start = prev.end;
        }
        if (end <= start) {
          end = parseFloat((start + minDur).toFixed(2));
        }
      } else if (bridgeGaps) {
        // If there is a small gap (e.g. <= 0.30s) in continuous speech, extend previous caption to bridge it
        const gap = start - prev.end;
        if (gap > 0 && gap <= maxBridge) {
          prev.end = start;
        }
      }
    }

    refined.push({
      ...seg,
      id: seg.id || `seg_${Date.now()}_${i}`,
      start,
      end,
      text,
      translation: seg.translation || "",
    });
  }

  return refined;
}

/**
 * Reformats subtitle segments by splitting or wrapping them
 * based on user-chosen words per sentence and lines per segment.
 */
export function reformatSegmentsByFormattingOptions(
  segments: SubtitleSegment[],
  wordsPerSentence: number,
  linesPerPart: number = 1
): SubtitleSegment[] {
  if (!segments || segments.length === 0) return [];
  if (!wordsPerSentence || wordsPerSentence >= 40) return verifyAndRefineTimings(segments);

  const result: SubtitleSegment[] = [];

  for (const seg of segments) {
    const rawWords = seg.text.trim().split(/\s+/).filter(Boolean);
    if (rawWords.length === 0) continue;

    if (rawWords.length <= wordsPerSentence) {
      result.push({
        ...seg,
        words: calculateWordTimings(seg.text, seg.start, seg.end, seg.words),
      });
      continue;
    }

    const numChunks = Math.ceil(rawWords.length / wordsPerSentence);
    const duration = Math.max(0.5, seg.end - seg.start);

    for (let i = 0; i < numChunks; i++) {
      const chunkStart = seg.start + (i / numChunks) * duration;
      const chunkEnd = seg.start + ((i + 1) / numChunks) * duration;

      const origStartIdx = Math.floor((i * rawWords.length) / numChunks);
      const origEndIdx = Math.floor(((i + 1) * rawWords.length) / numChunks);
      const chunkWordList = rawWords.slice(origStartIdx, origEndIdx);

      // If user selected 2 or 3 lines per part and chunk has enough words, format with line breaks
      let formattedText = chunkWordList.join(" ");
      if (linesPerPart > 1 && chunkWordList.length >= linesPerPart * 2) {
        const wordsPerLine = Math.ceil(chunkWordList.length / linesPerPart);
        const lines: string[] = [];
        for (let l = 0; l < chunkWordList.length; l += wordsPerLine) {
          lines.push(chunkWordList.slice(l, l + wordsPerLine).join(" "));
        }
        formattedText = lines.join("\n");
      }

      const cStart = parseFloat(chunkStart.toFixed(2));
      const cEnd = parseFloat(chunkEnd.toFixed(2));

      result.push({
        id: `${seg.id}_fmt_${i}_${Date.now()}`,
        start: cStart,
        end: cEnd,
        text: formattedText,
        translation: "",
        words: calculateWordTimings(formattedText, cStart, cEnd),
      });
    }
  }

  return verifyAndRefineTimings(result);
}

/**
 * Reformats subtitle segments by splitting them into smaller pieces
 * if they exceed the user-defined maximum words per line.
 * Uses linear interpolation to align text and timestamps beautifully.
 */
export function reformatSegmentsByWordLimit(
  segments: SubtitleSegment[],
  maxWordsPerLine: number
): SubtitleSegment[] {
  // If no limit is set, or limit is unreasonably high, return unmodified
  if (!maxWordsPerLine || maxWordsPerLine >= 50) {
    return segments;
  }

  const result: SubtitleSegment[] = [];

  for (const seg of segments) {
    const origWords = seg.text.trim().split(/\s+/).filter(Boolean);

    if (origWords.length <= maxWordsPerLine) {
      result.push(seg);
      continue;
    }

    // Determine how many chunks we need
    const numChunks = Math.ceil(origWords.length / maxWordsPerLine);
    const duration = seg.end - seg.start;

    for (let i = 0; i < numChunks; i++) {
      const chunkStart = seg.start + (i / numChunks) * duration;
      const chunkEnd = seg.start + ((i + 1) / numChunks) * duration;

      // Slice original words proportionally
      const origStartIdx = Math.floor((i * origWords.length) / numChunks);
      const origEndIdx = Math.floor(((i + 1) * origWords.length) / numChunks);
      const chunkText = origWords.slice(origStartIdx, origEndIdx).join(" ");

      result.push({
        id: `${seg.id}_chunk_${i}`,
        start: parseFloat(chunkStart.toFixed(3)),
        end: parseFloat(chunkEnd.toFixed(3)),
        text: chunkText,
        translation: "",
      });
    }
  }

  return result;
}

/**
 * Format seconds to SRT format: HH:MM:SS,mmm
 */
export function formatTimeSRT(seconds: number): string {
  const hrs = Math.floor(seconds / 3600);
  const mins = Math.floor((seconds % 3600) / 60);
  const secs = Math.floor(seconds % 60);
  const ms = Math.floor((seconds % 1) * 1000);

  const hh = hrs.toString().padStart(2, "0");
  const mm = mins.toString().padStart(2, "0");
  const ss = secs.toString().padStart(2, "0");
  const mmm = ms.toString().padStart(3, "0");

  return `${hh}:${mm}:${ss},${mmm}`;
}

/**
 * Format seconds to VTT format: HH:MM:SS.mmm
 */
export function formatTimeVTT(seconds: number): string {
  const hrs = Math.floor(seconds / 3600);
  const mins = Math.floor((seconds % 3600) / 60);
  const secs = Math.floor(seconds % 60);
  const ms = Math.floor((seconds % 1) * 1000);

  const hh = hrs.toString().padStart(2, "0");
  const mm = mins.toString().padStart(2, "0");
  const ss = secs.toString().padStart(2, "0");
  const mmm = ms.toString().padStart(3, "0");

  return `${hh}:${mm}:${ss}.${mmm}`;
}

/**
 * Convert subtitle segments to SubRip (.srt) format
 */
export function exportToSRT(
  segments: SubtitleSegment[]
): string {
  let srt = "";
  segments.forEach((seg, idx) => {
    srt += `${idx + 1}\n`;
    srt += `${formatTimeSRT(seg.start)} --> ${formatTimeSRT(seg.end)}\n`;
    srt += `${seg.text}\n\n`;
  });
  return srt;
}

/**
 * Convert subtitle segments to WebVTT (.vtt) format
 */
export function exportToVTT(
  segments: SubtitleSegment[]
): string {
  let vtt = "WEBVTT\n\n";
  segments.forEach((seg, idx) => {
    vtt += `${idx + 1}\n`;
    vtt += `${formatTimeVTT(seg.start)} --> ${formatTimeVTT(seg.end)}\n`;
    vtt += `${seg.text}\n\n`;
  });
  return vtt;
}

/**
 * Format seconds to ASS format: H:MM:SS.cc (centiseconds)
 */
export function formatTimeASS(seconds: number): string {
  const hrs = Math.floor(seconds / 3600);
  const mins = Math.floor((seconds % 3600) / 60);
  const secs = Math.floor(seconds % 60);
  const cs = Math.floor((seconds % 1) * 100);

  const m = mins.toString().padStart(2, "0");
  const s = secs.toString().padStart(2, "0");
  const c = cs.toString().padStart(2, "0");

  return `${hrs}:${m}:${s}.${c}`;
}

/**
 * Convert subtitle segments to Advanced SubStation Alpha (.ass) format
 */
export function exportToASS(segments: SubtitleSegment[], style?: any): string {
  const primaryColor = style?.textColor ? hexToBGR(style.textColor) : "&H00FFFFFF";
  const outlineColor = "&H00000000";
  const backColor = "&H80000000";
  const font = style?.fontFamily?.replace(/['"]/g, "").split(",")[0] || "Cairo";
  const fontSize = style?.fontSize || 22;

  let ass = `[Script Info]
Title: Algerian Darija Subtitles
ScriptType: v4.00+
WrapStyle: 0
ScaledBorderAndShadow: yes
PlayResX: 1920
PlayResY: 1080

[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding
Style: Default,${font},${fontSize * 2.2},${primaryColor},${primaryColor},${outlineColor},${backColor},1,0,0,0,100,100,0,0,1,2,2,2,30,30,50,1

[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
`;

  segments.forEach((seg) => {
    const startStr = formatTimeASS(seg.start);
    const endStr = formatTimeASS(seg.end);
    ass += `Dialogue: 0,${startStr},${endStr},Default,,0,0,0,,${seg.text}\n`;
  });

  return ass;
}

function hexToBGR(hex: string): string {
  const clean = hex.replace("#", "");
  if (clean.length === 6) {
    const r = clean.substring(0, 2);
    const g = clean.substring(2, 4);
    const b = clean.substring(4, 6);
    return `&H00${b}${g}${r}`.toUpperCase();
  }
  return "&H00FFFFFF";
}

/**
 * Convert subtitle segments to JSON format
 */
export function exportToJSON(segments: SubtitleSegment[]): string {
  return JSON.stringify(segments, null, 2);
}

// ----------------------------------------------------
// DEFAULT SAMPLE AUDIO PROJECTS WITH MIXED ARABIC/LATIN SCRIPT
// ----------------------------------------------------

export interface SampleProject {
  id: string;
  title: string;
  duration: number; // in seconds
  language: string;
  description: string;
  segments: SubtitleSegment[];
}

export const SAMPLE_PROJECTS: SampleProject[] = [
  {
    id: "sample_food_vlog",
    title: "Algerian Street Food Vlog (Algiers)",
    duration: 35,
    language: "Arabic + Latin Script Mix",
    description: "A review of Garantita and traditional tea in Algiers, incorporating authentic Arabic script for Darija and Latin script for French and English.",
    segments: [
      {
        id: "vlog_1",
        start: 0.5,
        end: 4.2,
        text: "سلام l'équipe! اليوم راني في la Casbah d'Alger, absolute beautiful day!",
        translation: ""
      },
      {
        id: "vlog_2",
        start: 4.8,
        end: 9.5,
        text: "We are searching for the best food spot في هذا المستوى. C'est incroyable هنا يا خاوتي.",
        translation: ""
      },
      {
        id: "vlog_3",
        start: 10.0,
        end: 14.8,
        text: "شوف هاد la Garantita، سخونة تقول pizza. Très délicieux, avec l'harissa bien sûr!",
        translation: ""
      },
      {
        id: "vlog_4",
        start: 15.2,
        end: 20.1,
        text: "والله عندها un goût spécial، بغيت كل يوم ناكلها. Let's try the traditional tea now.",
        translation: ""
      },
      {
        id: "vlog_5",
        start: 20.8,
        end: 26.5,
        text: "أتاي بالنعناع مشحر، perfect view overlooking the Mediterranean sea. C'est magique.",
        translation: ""
      },
      {
        id: "vlog_6",
        start: 27.0,
        end: 34.0,
        text: "ما تنساوش تديروا subscribe and share، support local food culture in Algeria! تهلاو، ciao!",
        translation: ""
      }
    ]
  },
  {
    id: "sample_tech_startup",
    title: "Algiers Tech Ecosystem Pitch",
    duration: 31,
    language: "Arabic + Latin Script Mix",
    description: "A tech startup pitch in Algiers blending English and French business terminology with Darija in Arabic script.",
    segments: [
      {
        id: "tech_1",
        start: 0.8,
        end: 5.5,
        text: "سلام! Our platform تحل un grand problème في la logistique في الجزائر.",
        translation: ""
      },
      {
        id: "tech_2",
        start: 6.0,
        end: 11.2,
        text: "We are building an on-demand delivery app. كلشي digital, zero papers, c'est super rapide.",
        translation: ""
      },
      {
        id: "tech_3",
        start: 11.8,
        end: 16.5,
        text: "السوق de la livraison ربي يبارك راه يكبر. We are launching our beta next week.",
        translation: ""
      },
      {
        id: "tech_4",
        start: 17.0,
        end: 22.8,
        text: "بغينا نـ recrutou des drivers في كل ولاية. If you are interested, check out our website.",
        translation: ""
      },
      {
        id: "tech_5",
        start: 23.2,
        end: 30.5,
        text: "C'est l'avenir de l'e-commerce هنا في دزاير. Join our journey, thank you very much l'équipe!",
        translation: ""
      }
    ]
  },
  {
    id: "sample_family_recipe",
    title: "Algerian Traditional Recipe (Couscous)",
    duration: 32,
    language: "Arabic + Latin Script Mix",
    description: "Traditional culinary couscous recipe demonstrating pure Algerian Arabic script and standard French kitchen vocabulary.",
    segments: [
      {
        id: "recipe_1",
        start: 0.5,
        end: 5.0,
        text: "اليوم نحضروا couscous بالخضرة، la recette traditionnelle de ma grand-mère.",
        translation: ""
      },
      {
        id: "recipe_2",
        start: 5.5,
        end: 10.8,
        text: "L'étape الأولى: la cuisson de la viande بالبصل، الحمص، و les épices.",
        translation: ""
      },
      {
        id: "recipe_3",
        start: 11.2,
        end: 17.0,
        text: "نفوروا الطعام deux fois، c'est très important باش يجي رطب، melt-in-your-mouth texture.",
        translation: ""
      },
      {
        id: "recipe_4",
        start: 17.5,
        end: 24.2,
        text: "نزيدوا الخضرة: courgette, carottes, potiron في المرقة الحمراء. C'est magnifique.",
        translation: ""
      },
      {
        id: "recipe_5",
        start: 24.8,
        end: 31.0,
        text: "سربوه سخون avec l'lben. Un repas familial parfait pour le vendredi. صحة فطوركم!",
        translation: ""
      }
    ]
  }
];
