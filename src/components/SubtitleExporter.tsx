/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from "react";
import { SubtitleSegment } from "../types";
import { exportToSRT, exportToVTT, exportToJSON } from "../utils";
import { Download, FileCode, Check, Copy, Sparkles } from "lucide-react";

interface SubtitleExporterProps {
  segments: SubtitleSegment[];
  projectName: string;
}

export default function SubtitleExporter({ segments, projectName }: SubtitleExporterProps) {
  const [format, setFormat] = useState<"srt" | "vtt" | "json">("srt");
  const [copied, setCopied] = useState(false);

  // Generate output content
  const getOutputContent = (): string => {
    if (format === "srt") return exportToSRT(segments);
    if (format === "vtt") return exportToVTT(segments);
    return exportToJSON(segments);
  };

  const outputContent = getOutputContent();

  const handleCopy = () => {
    navigator.clipboard.writeText(outputContent);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleDownload = () => {
    const filename = `${projectName.toLowerCase().replace(/\s+/g, "_")}_subtitles.${format}`;
    const blob = new Blob([outputContent], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  return (
    <div id="subtitle-exporter-panel" className="bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-xl space-y-6">
      {/* Exporter Header */}
      <div className="flex items-center space-x-2 pb-4 border-b border-slate-800">
        <Download className="w-5 h-5 text-purple-400" id="exporter-panel-icon" />
        <h2 className="text-lg font-semibold text-slate-100 tracking-tight font-sans">
          Export Subtitle Files
        </h2>
      </div>

      {/* Configuration options */}
      <div className="space-y-4">
        {/* 1. Format Selection */}
        <div className="space-y-1.5">
          <label className="text-xs font-semibold text-slate-400 uppercase tracking-wider flex items-center gap-1.5">
            <FileCode className="w-3.5 h-3.5 text-purple-400" /> Output Format
          </label>
          <div className="grid grid-cols-3 gap-2" id="format-toggle-group">
            {(["srt", "vtt", "json"] as const).map((fmt) => (
              <button
                key={fmt}
                id={`export-fmt-btn-${fmt}`}
                type="button"
                onClick={() => setFormat(fmt)}
                className={`py-2 text-xs font-bold rounded-lg uppercase border transition-all ${
                  format === fmt
                    ? "bg-purple-500/10 text-purple-300 border-purple-500/50"
                    : "bg-slate-950 text-slate-400 border-slate-800 hover:text-slate-200"
                }`}
              >
                .{fmt}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Live Code Preview */}
      <div className="space-y-2">
        <div className="flex justify-between items-center text-xs">
          <span className="text-slate-400 font-mono">File Preview:</span>
          <button
            id="btn-copy-preview"
            type="button"
            onClick={handleCopy}
            className="text-slate-400 hover:text-white flex items-center gap-1 text-[11px] font-medium bg-slate-950 border border-slate-800 px-2 py-1 rounded transition-colors cursor-pointer"
          >
            {copied ? (
              <>
                <Check className="w-3 h-3 text-emerald-400" />
                <span className="text-emerald-400 font-bold">Copied!</span>
              </>
            ) : (
              <>
                <Copy className="w-3 h-3" />
                <span>Copy Code</span>
              </>
            )}
          </button>
        </div>

        <div className="bg-slate-950 border border-slate-800 rounded-xl p-4 overflow-x-auto max-h-[140px] md:max-h-[180px] font-mono text-xs text-slate-300 leading-relaxed scrollbar-thin">
          <pre id="export-code-preview" className="whitespace-pre-wrap">{outputContent}</pre>
        </div>
      </div>

      {/* Download Action Trigger */}
      <button
        id="btn-trigger-download"
        type="button"
        onClick={handleDownload}
        disabled={segments.length === 0}
        className="w-full bg-gradient-to-r from-purple-600 to-purple-500 text-white font-bold py-3 px-4 rounded-xl shadow-lg shadow-purple-500/15 hover:shadow-purple-500/25 hover:from-purple-500 hover:to-purple-400 transition-all flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
      >
        <Download className="w-4.5 h-4.5" />
        <span>Download Subtitle File (.{format.toUpperCase()})</span>
      </button>

      <div className="flex items-center gap-2 bg-purple-500/5 border border-purple-500/10 rounded-xl px-4 py-3 text-[11px] text-purple-300 leading-relaxed">
        <Sparkles className="w-4 h-4 shrink-0 text-purple-400" />
        <span>
          Subtitles are exported in hybrid Arabic (for Darija) and Latin (for French/English) scripts, fully synchronized with timestamps.
        </span>
      </div>
    </div>
  );
}
