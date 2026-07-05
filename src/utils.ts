/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { SubtitleSegment } from "./types";

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
