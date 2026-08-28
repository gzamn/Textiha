/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

export interface SubtitleSegment {
  id: string;
  start: number; // in seconds
  end: number;   // in seconds
  text: string;  // original transcript (Darija + French + English)
  translation: string; // translated text
}

export type TextTransformType = 'none' | 'uppercase' | 'lowercase';
export type PositionYType = 'top' | 'bottom' | 'center';
export type DirectionType = 'ltr' | 'rtl';
export type TextAlignType = 'left' | 'center' | 'right';

export interface SubtitleStyle {
  fontFamily: string;
  fontSize: number; // in pixels, e.g., 22
  textColor: string; // hex color, e.g., '#FFFFFF'
  backgroundColor: string; // hex color, e.g., '#000000'
  backgroundOpacity: number; // 0 to 1, e.g., 0.55
  backgroundEnabled: boolean; // boolean toggle
  posX: number; // percentage, e.g., 50
  posY: number; // percentage, e.g., 88
  outlineColor: string; // hex color
  outlineWidth: number;
  textTransform: TextTransformType;
  positionY: PositionYType;
  borderRadius: number;
  paddingX: number;
  paddingY: number;
  direction: DirectionType;
  textAlign: TextAlignType;
  maxWordsPerSegment: number; // e.g., 4 (or 0 for automatic)
  maxLinesPerSegment: number; // 1, 2, or 3 lines
}

export const DEFAULT_STYLE: SubtitleStyle = {
  fontFamily: "'Cairo', sans-serif",
  fontSize: 22,
  textColor: '#FFFFFF',
  backgroundColor: '#000000',
  backgroundOpacity: 0.55,
  backgroundEnabled: true,
  posX: 50,
  posY: 88,
  outlineColor: '#000000',
  outlineWidth: 0,
  textTransform: 'none',
  positionY: 'bottom',
  borderRadius: 8,
  paddingX: 14,
  paddingY: 8,
  direction: 'rtl',
  textAlign: 'center',
  maxWordsPerSegment: 4,
  maxLinesPerSegment: 1,
};

export const AVAILABLE_FONTS = [
  { name: 'Cairo', value: "'Cairo', sans-serif" },
  { name: 'Tajawal', value: "'Tajawal', sans-serif" },
  { name: 'Amiri', value: "'Amiri', serif" },
  { name: 'Poppins', value: "'Poppins', sans-serif" },
  { name: 'Inter', value: "'Inter', sans-serif" },
  { name: 'Arial', value: 'Arial, sans-serif' },
];

export const AVAILABLE_COLORS = [
  { name: 'Pure White', value: '#FFFFFF' },
  { name: 'Soft Lavender', value: '#E9D5FF' },
  { name: 'Radiant Purple', value: '#C084FC' },
  { name: 'Electric Violet', value: '#A855F7' },
  { name: 'Fuchsia Glow', value: '#F0ABFC' },
  { name: 'Platinum Silver', value: '#E2E8F0' },
];

export const AVAILABLE_BG_COLORS = [
  { name: 'Obsidian Black', value: '#000000' },
  { name: 'Midnight Purple', value: '#1e0836' },
  { name: 'Deep Violet', value: '#2e1065' },
  { name: 'Velvet Noir', value: '#0d0718' },
  { name: 'Dark Slate', value: '#181126' },
];
