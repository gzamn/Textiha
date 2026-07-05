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

export interface SubtitleStyle {
  fontFamily: string;
  fontSize: number; // in pixels, e.g., 20
  textColor: string; // hex color, e.g., '#ffffff'
  backgroundColor: string; // hex color, e.g., '#000000'
  backgroundOpacity: number; // 0 to 1
  outlineColor: string; // hex color, e.g., '#000000'
  outlineWidth: number; // 0 to 4
  textTransform: TextTransformType;
  positionY: PositionYType;
  borderRadius: number; // in pixels
  paddingX: number; // in pixels
  paddingY: number; // in pixels
  direction: DirectionType;
}

export const DEFAULT_STYLE: SubtitleStyle = {
  fontFamily: 'Inter',
  fontSize: 22,
  textColor: '#FFFFFF',
  backgroundColor: '#000000',
  backgroundOpacity: 0.65,
  outlineColor: '#000000',
  outlineWidth: 1,
  textTransform: 'none',
  positionY: 'bottom',
  borderRadius: 8,
  paddingX: 16,
  paddingY: 8,
  direction: 'rtl',
};

export const AVAILABLE_FONTS = [
  { name: 'Modern Sans (Inter)', value: 'Inter' },
  { name: 'Tech Grotesk (Space Grotesk)', value: 'Space Grotesk' },
  { name: 'Developer Mono (JetBrains Mono)', value: 'JetBrains Mono' },
  { name: 'Elegant Serif (Playfair Display)', value: 'Playfair Display' },
  { name: 'Futuristic (Outfit)', value: 'Outfit' },
];

export const AVAILABLE_COLORS = [
  { name: 'Pure White', value: '#FFFFFF' },
  { name: 'Classic Purple', value: '#C084FC' },
  { name: 'Bright Cyan', value: '#00FFFF' },
  { name: 'Neon Green', value: '#39FF14' },
  { name: 'Soft Cream', value: '#FFFDD0' },
  { name: 'Orchid Fuchsia', value: '#E879F9' },
  { name: 'Slate Gray', value: '#94A3B8' },
];

export const AVAILABLE_BG_COLORS = [
  { name: 'Black shadow', value: '#000000' },
  { name: 'Dark Navy', value: '#0F172A' },
  { name: 'Charcoal Grey', value: '#1E293B' },
  { name: 'Deep Crimson', value: '#450A0A' },
  { name: 'Forest Green', value: '#064E3B' },
];
