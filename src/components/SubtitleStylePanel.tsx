/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from "react";
import {
  SubtitleStyle,
  AVAILABLE_FONTS,
  AVAILABLE_COLORS,
  AVAILABLE_BG_COLORS,
  TextTransformType,
  PositionYType,
  DirectionType,
} from "../types";
import { Sliders, Type, Palette, Layout, Sparkles, AlignRight } from "lucide-react";

interface SubtitleStylePanelProps {
  style: SubtitleStyle;
  onChangeStyle: (style: SubtitleStyle) => void;
  maxWordsPerLine: number;
  onChangeMaxWordsPerLine: (words: number) => void;
}

export default function SubtitleStylePanel({
  style,
  onChangeStyle,
  maxWordsPerLine,
  onChangeMaxWordsPerLine,
}: SubtitleStylePanelProps) {
  const updateStyle = (key: keyof SubtitleStyle, value: any) => {
    onChangeStyle({
      ...style,
      [key]: value,
    });
  };

  return (
    <div id="subtitle-style-panel" className="bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-xl space-y-6">
      {/* Panel Header */}
      <div className="flex items-center space-x-2 pb-4 border-b border-slate-800">
        <Sliders className="w-5 h-5 text-purple-400" id="style-panel-icon" />
        <h2 className="text-lg font-semibold text-slate-100 tracking-tight font-sans">
          Subtitle Style & Layout
        </h2>
      </div>

      {/* 1. Layout Word Limit Controller */}
      <div className="space-y-3">
        <div className="flex justify-between items-center">
          <label className="text-sm font-medium text-slate-300 flex items-center gap-2">
            <Layout className="w-4 h-4 text-purple-400" />
            Max Words Per Line
          </label>
          <span className="text-xs font-mono bg-purple-500/10 text-purple-300 px-2.5 py-0.5 rounded-full font-bold">
            {maxWordsPerLine === 50 ? "Uncapped" : `${maxWordsPerLine} words`}
          </span>
        </div>
        <input
          id="words-per-line-slider"
          type="range"
          min="2"
          max="20"
          step="1"
          value={maxWordsPerLine === 50 ? 20 : maxWordsPerLine}
          onChange={(e) => {
            const val = parseInt(e.target.value);
            onChangeMaxWordsPerLine(val === 20 ? 50 : val);
          }}
          className="w-full h-2 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-purple-500"
        />
        <p className="text-xs text-slate-400 leading-relaxed">
          Splits longer phrases dynamically into neat multi-line chunks using smart timestamp interpolation.
        </p>
      </div>

      {/* 2. Typography Options */}
      <div className="space-y-4 pt-2">
        <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider flex items-center gap-1.5">
          <Type className="w-3.5 h-3.5 text-blue-400" /> Typography
        </h3>

        {/* Font Family */}
        <div className="space-y-1.5">
          <label className="text-xs font-medium text-slate-300">Font Family</label>
          <select
            id="font-family-select"
            value={style.fontFamily}
            onChange={(e) => updateStyle("fontFamily", e.target.value)}
            className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-sm text-slate-200 focus:outline-none focus:border-purple-500 font-sans"
          >
            {AVAILABLE_FONTS.map((f) => (
              <option key={f.value} value={f.value}>
                {f.name}
              </option>
            ))}
          </select>
        </div>

        {/* Font Size & Rounded corners */}
        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-slate-300">Font Size (px)</label>
            <input
              id="font-size-input"
              type="number"
              min="12"
              max="48"
              value={style.fontSize}
              onChange={(e) => updateStyle("fontSize", parseInt(e.target.value) || 20)}
              className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-1.5 text-sm text-slate-200 focus:outline-none focus:border-purple-500 font-mono"
            />
          </div>
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-slate-300">Corner Radius (px)</label>
            <input
              id="border-radius-input"
              type="number"
              min="0"
              max="24"
              value={style.borderRadius}
              onChange={(e) => updateStyle("borderRadius", parseInt(e.target.value) || 0)}
              className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-1.5 text-sm text-slate-200 focus:outline-none focus:border-purple-500 font-mono"
            />
          </div>
        </div>

        {/* Padding and Text Transform */}
        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-slate-300">Text Transform</label>
            <select
              id="text-transform-select"
              value={style.textTransform}
              onChange={(e) => updateStyle("textTransform", e.target.value as TextTransformType)}
              className="w-full bg-slate-950 border border-slate-800 rounded-lg px-2 py-1.5 text-sm text-slate-200 focus:outline-none focus:border-purple-500"
            >
              <option value="none">Normal Case</option>
              <option value="uppercase">UPPERCASE</option>
              <option value="lowercase">lowercase</option>
            </select>
          </div>
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-slate-300">Padding (X / Y)</label>
            <div className="grid grid-cols-2 gap-2">
              <input
                id="padding-x-input"
                type="number"
                min="0"
                max="40"
                value={style.paddingX}
                onChange={(e) => updateStyle("paddingX", parseInt(e.target.value) || 0)}
                className="w-full bg-slate-950 border border-slate-800 rounded-lg px-2 py-1.5 text-xs text-center text-slate-200 focus:outline-none focus:border-purple-500 font-mono"
                placeholder="X"
              />
              <input
                id="padding-y-input"
                type="number"
                min="0"
                max="30"
                value={style.paddingY}
                onChange={(e) => updateStyle("paddingY", parseInt(e.target.value) || 0)}
                className="w-full bg-slate-950 border border-slate-800 rounded-lg px-2 py-1.5 text-xs text-center text-slate-200 focus:outline-none focus:border-purple-500 font-mono"
                placeholder="Y"
              />
            </div>
          </div>
        </div>
      </div>

      {/* 3. Color Styling */}
      <div className="space-y-4 pt-2">
        <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider flex items-center gap-1.5">
          <Palette className="w-3.5 h-3.5 text-pink-400" /> Color & Theme
        </h3>

        {/* Text Color Selection */}
        <div className="space-y-2">
          <label className="text-xs font-medium text-slate-300 block">Text Color</label>
          <div className="flex flex-wrap gap-2" id="text-color-palette">
            {AVAILABLE_COLORS.map((c) => (
              <button
                key={c.value}
                id={`btn-color-${c.value}`}
                type="button"
                onClick={() => updateStyle("textColor", c.value)}
                className={`w-6 h-6 rounded-full border cursor-pointer transition-transform ${
                  style.textColor === c.value
                    ? "scale-125 border-purple-500 shadow-md shadow-purple-500/20"
                    : "border-slate-800 hover:scale-110"
                }`}
                style={{ backgroundColor: c.value }}
                title={c.name}
              />
            ))}
            <input
              id="custom-text-color-picker"
              type="color"
              value={style.textColor}
              onChange={(e) => updateStyle("textColor", e.target.value)}
              className="w-6 h-6 rounded-full bg-transparent border-0 cursor-pointer"
            />
          </div>
        </div>

        {/* Background Color Selection */}
        <div className="space-y-2">
          <label className="text-xs font-medium text-slate-300 block">Background Bar</label>
          <div className="flex flex-wrap gap-2" id="bg-color-palette">
            {AVAILABLE_BG_COLORS.map((c) => (
              <button
                key={c.value}
                id={`btn-bg-${c.value}`}
                type="button"
                onClick={() => updateStyle("backgroundColor", c.value)}
                className={`w-6 h-6 rounded-md border cursor-pointer transition-transform ${
                  style.backgroundColor === c.value
                    ? "scale-125 border-purple-500 shadow-md shadow-purple-500/20"
                    : "border-slate-800 hover:scale-110"
                }`}
                style={{ backgroundColor: c.value }}
                title={c.name}
              />
            ))}
            <input
              id="custom-bg-color-picker"
              type="color"
              value={style.backgroundColor}
              onChange={(e) => updateStyle("backgroundColor", e.target.value)}
              className="w-6 h-6 rounded-md bg-transparent border-0 cursor-pointer"
            />
          </div>
        </div>

        {/* Background Opacity */}
        <div className="space-y-1.5">
          <div className="flex justify-between text-xs">
            <span className="text-slate-300">Background Opacity</span>
            <span className="text-slate-400 font-mono">
              {Math.round(style.backgroundOpacity * 100)}%
            </span>
          </div>
          <input
            id="bg-opacity-slider"
            type="range"
            min="0"
            max="1"
            step="0.05"
            value={style.backgroundOpacity}
            onChange={(e) => updateStyle("backgroundOpacity", parseFloat(e.target.value))}
            className="w-full h-1.5 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-purple-500"
          />
        </div>
      </div>

      {/* 4. Display Position */}
      <div className="space-y-3 pt-2">
        <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider flex items-center gap-1.5">
          <Sparkles className="w-3.5 h-3.5 text-purple-400" /> Vertical Position
        </h3>
        <div className="grid grid-cols-3 gap-2" id="position-y-selector">
          {(["top", "center", "bottom"] as PositionYType[]).map((pos) => (
            <button
              key={pos}
              id={`position-btn-${pos}`}
              type="button"
              onClick={() => updateStyle("positionY", pos)}
              className={`py-2 text-xs font-medium rounded-lg capitalize border transition-all ${
                style.positionY === pos
                  ? "bg-purple-500/10 text-purple-300 border-purple-500/50 font-bold"
                  : "bg-slate-950 text-slate-400 border-slate-800 hover:text-slate-200"
              }`}
            >
              {pos}
            </button>
          ))}
        </div>
      </div>

      {/* 5. Text Direction */}
      <div className="space-y-3 pt-2">
        <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider flex items-center gap-1.5">
          <AlignRight className="w-3.5 h-3.5 text-purple-400" /> Text Direction (Reading Order)
        </h3>
        <div className="grid grid-cols-2 gap-2" id="text-direction-selector">
          {[
            { value: "rtl", label: "RTL (Right-to-Left)" },
            { value: "ltr", label: "LTR (Left-to-Right)" },
          ].map((dirOpt) => (
            <button
              key={dirOpt.value}
              id={`direction-btn-${dirOpt.value}`}
              type="button"
              onClick={() => updateStyle("direction", dirOpt.value as DirectionType)}
              className={`py-2 text-xs font-medium rounded-lg border transition-all ${
                style.direction === dirOpt.value
                  ? "bg-purple-500/10 text-purple-300 border-purple-500/50 font-bold"
                  : "bg-slate-950 text-slate-400 border-slate-800 hover:text-slate-200"
              }`}
            >
              {dirOpt.label}
            </button>
          ))}
        </div>
        <p className="text-[10px] text-slate-500 leading-relaxed">
          RTL flips the layout order for hybrid Arabic (Darija) and Latin (French/English) words, ensuring correct right-to-left flow.
        </p>
      </div>
    </div>
  );
}
