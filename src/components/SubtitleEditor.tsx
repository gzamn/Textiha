/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from "react";
import { SubtitleSegment } from "../types";
import { Plus, Trash2, Clock, AlignLeft, Sparkles, MessageSquareDot } from "lucide-react";

interface SubtitleEditorProps {
  segments: SubtitleSegment[];
  onChangeSegments: (segments: SubtitleSegment[]) => void;
  currentTime: number;
  onSelectTime: (time: number) => void;
}

export default function SubtitleEditor({
  segments,
  onChangeSegments,
  currentTime,
  onSelectTime,
}: SubtitleEditorProps) {
  // Update a single field on a segment
  const updateSegment = (id: string, key: keyof SubtitleSegment, value: any) => {
    const updated = segments.map((seg) => {
      if (seg.id === id) {
        return { ...seg, [key]: value };
      }
      return seg;
    });
    onChangeSegments(updated);
  };

  // Add a new segment at the end or near current time
  const handleAddSegment = () => {
    const lastSeg = segments[segments.length - 1];
    const newStart = lastSeg ? lastSeg.end + 0.5 : 0;
    const newEnd = newStart + 3.0;

    const newSegment: SubtitleSegment = {
      id: `custom_${Date.now()}`,
      start: parseFloat(newStart.toFixed(2)),
      end: parseFloat(newEnd.toFixed(2)),
      text: "سلام l'équipe! اكتب هنا (Arabic for Darija, Latin for English/French)",
      translation: "",
    };

    onChangeSegments([...segments, newSegment]);
  };

  // Shift all subtitle segment timestamps by a delta (offset in seconds)
  const handleShiftAll = (offset: number) => {
    const updated = segments.map((seg) => {
      const newStart = Math.max(0, parseFloat((seg.start + offset).toFixed(2)));
      const newEnd = Math.max(0, parseFloat((seg.end + offset).toFixed(2)));
      return {
        ...seg,
        start: newStart,
        end: newEnd,
      };
    });
    onChangeSegments(updated);
  };

  // Delete a segment
  const handleDeleteSegment = (id: string) => {
    onChangeSegments(segments.filter((seg) => seg.id !== id));
  };

  const formatSeconds = (sec: number) => {
    return sec.toFixed(2);
  };

  return (
    <div id="subtitle-editor-panel" className="bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-xl space-y-4 h-full flex flex-col">
      {/* Editor Header */}
      <div className="flex items-center justify-between pb-4 border-b border-slate-800">
        <div className="flex items-center space-x-2">
          <AlignLeft className="w-5 h-5 text-purple-400" id="editor-panel-icon" />
          <h2 className="text-lg font-semibold text-slate-100 tracking-tight font-sans">
            Interactive Subtitle Builder
          </h2>
        </div>
        <button
          id="btn-add-segment"
          type="button"
          onClick={handleAddSegment}
          className="bg-purple-600 hover:bg-purple-550 text-white font-bold px-3 py-1.5 rounded-lg text-xs flex items-center gap-1.5 transition-all cursor-pointer"
        >
          <Plus className="w-4 h-4" />
          <span>Add Block</span>
        </button>
      </div>

      {/* Time Sync Adjustment Bar */}
      {segments.length > 0 && (
        <div id="time-sync-adjuster-bar" className="bg-slate-950/60 border border-slate-800/80 rounded-xl p-3.5 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs">
          <div className="flex items-center gap-2">
            <Clock className="w-4 h-4 text-purple-400 shrink-0" />
            <div className="text-left">
              <p className="font-bold text-slate-300">Global Subtitle Sync Adjuster</p>
              <p className="text-[11px] text-slate-500">Subtitles showing too early? Delay all timestamps forward, or advance them backward.</p>
            </div>
          </div>
          <div className="flex items-center gap-1.5 shrink-0 bg-slate-900 border border-slate-800 p-1 rounded-lg">
            <button
              id="sync-shift-minus-1"
              type="button"
              onClick={() => handleShiftAll(-1.0)}
              className="px-2.5 py-1.5 text-[11px] font-bold text-slate-400 hover:text-white hover:bg-slate-850 rounded transition-colors cursor-pointer"
              title="Shift all subtitles 1.0 second earlier"
            >
              -1.0s Earlier
            </button>
            <button
              id="sync-shift-minus-05"
              type="button"
              onClick={() => handleShiftAll(-0.5)}
              className="px-2.5 py-1.5 text-[11px] font-bold text-slate-400 hover:text-white hover:bg-slate-850 rounded transition-colors cursor-pointer"
              title="Shift all subtitles 0.5 seconds earlier"
            >
              -0.5s Earlier
            </button>
            <div className="h-4 w-px bg-slate-800 mx-0.5" />
            <button
              id="sync-shift-plus-05"
              type="button"
              onClick={() => handleShiftAll(0.5)}
              className="px-2.5 py-1.5 text-[11px] font-bold text-purple-300 bg-purple-500/10 hover:bg-purple-550/20 rounded transition-colors cursor-pointer"
              title="Shift all subtitles 0.5 seconds later (Delay them)"
            >
              +0.5s Later (Delay)
            </button>
            <button
              id="sync-shift-plus-1"
              type="button"
              onClick={() => handleShiftAll(1.0)}
              className="px-2.5 py-1.5 text-[11px] font-bold text-purple-300 bg-purple-500/10 hover:bg-purple-550/20 rounded transition-colors cursor-pointer"
              title="Shift all subtitles 1.0 second later"
            >
              +1.0s Later
            </button>
          </div>
        </div>
      )}

      {/* Segments timeline list */}
      <div className="flex-1 overflow-y-auto space-y-4 max-h-[500px] pr-1 scrollbar-thin">
        {segments.length === 0 ? (
          <div className="text-center py-12 text-slate-500 space-y-2">
            <MessageSquareDot className="w-12 h-12 mx-auto text-slate-600 animate-bounce" />
            <p className="text-sm">No subtitle segments exist yet.</p>
            <p className="text-xs text-slate-600">Upload an MP3 file or load a default sample to begin editing.</p>
          </div>
        ) : (
          segments.map((seg, index) => {
            const isActive = currentTime >= seg.start && currentTime <= seg.end;

            return (
              <div
                key={seg.id}
                id={`segment-card-${seg.id}`}
                className={`p-4 rounded-xl border transition-all ${
                  isActive
                    ? "bg-slate-950 border-purple-500/80 shadow-md shadow-purple-500/5"
                    : "bg-slate-950/60 border-slate-800 hover:border-slate-700"
                }`}
              >
                {/* Block meta details */}
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center space-x-2">
                    <span className="text-[11px] font-bold bg-slate-800 text-slate-400 px-2 py-0.5 rounded">
                      #{index + 1}
                    </span>
                    <button
                      id={`jump-time-btn-${seg.id}`}
                      type="button"
                      onClick={() => onSelectTime(seg.start)}
                      className="text-[10px] text-purple-400 font-mono flex items-center gap-1 bg-purple-500/10 hover:bg-purple-500/20 px-2 py-0.5 rounded transition-all cursor-pointer"
                    >
                      <Clock className="w-3 h-3" />
                      <span>{formatSeconds(seg.start)}s → {formatSeconds(seg.end)}s</span>
                    </button>
                  </div>

                  <button
                    id={`delete-btn-${seg.id}`}
                    type="button"
                    onClick={() => handleDeleteSegment(seg.id)}
                    className="text-slate-500 hover:text-rose-400 p-1 rounded transition-colors cursor-pointer"
                    title="Delete segment"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>

                {/* Content Inputs */}
                <div className="grid grid-cols-1 gap-3">
                  {/* Original text (mixed Darija) */}
                  <div className="space-y-1">
                    <div className="flex justify-between">
                      <label className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider">
                        Algerian Darija (Spoken Mix)
                      </label>
                      <span className="text-[9px] font-mono text-slate-500">
                        {seg.text.split(/\s+/).filter(Boolean).length} words
                      </span>
                    </div>
                    <textarea
                      id={`textarea-orig-${seg.id}`}
                      value={seg.text}
                      onChange={(e) => updateSegment(seg.id, "text", e.target.value)}
                      dir="rtl"
                      className="w-full bg-slate-900 border border-slate-800 rounded-lg px-3 py-1.5 text-xs text-slate-100 focus:outline-none focus:border-purple-500/60 font-sans leading-relaxed resize-none h-12 text-right"
                      placeholder="Spoken transcript..."
                    />
                  </div>

                  {/* Exact Timestamps Editor */}
                  <div className="grid grid-cols-2 gap-2 pt-1 border-t border-slate-900">
                    <div className="flex items-center space-x-2">
                      <span className="text-[10px] font-semibold text-slate-500">Start:</span>
                      <input
                        id={`input-start-${seg.id}`}
                        type="number"
                        step="0.1"
                        min="0"
                        value={seg.start}
                        onChange={(e) => updateSegment(seg.id, "start", parseFloat(e.target.value) || 0)}
                        className="w-full bg-slate-900 border border-slate-800 rounded px-2 py-0.5 text-[11px] text-slate-300 font-mono text-center focus:outline-none focus:border-purple-500/60"
                      />
                    </div>
                    <div className="flex items-center space-x-2">
                      <span className="text-[10px] font-semibold text-slate-500">End:</span>
                      <input
                        id={`input-end-${seg.id}`}
                        type="number"
                        step="0.1"
                        min="0"
                        value={seg.end}
                        onChange={(e) => updateSegment(seg.id, "end", parseFloat(e.target.value) || 0)}
                        className="w-full bg-slate-900 border border-slate-800 rounded px-2 py-0.5 text-[11px] text-slate-300 font-mono text-center focus:outline-none focus:border-purple-500/60"
                      />
                    </div>
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
