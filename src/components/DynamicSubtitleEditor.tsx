/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from "react";
import { SubtitleSegment } from "../types";
import { verifyAndRefineTimings } from "../utils";
import {
  Plus,
  Trash2,
  Clock,
  Play,
  AlignLeft,
  Sparkles,
  Scissors,
  Check,
  ChevronDown,
  ChevronUp,
  FastForward,
  Rewind,
  Edit3,
  Wand2,
} from "lucide-react";

interface DynamicSubtitleEditorProps {
  segments: SubtitleSegment[];
  onChangeSegments: (segments: SubtitleSegment[]) => void;
  currentTime: number;
  onSeek: (time: number) => void;
  wordsPerSentence: number;
  linesPerPart: number;
  onApplyFormatting: () => void;
}

export function DynamicSubtitleEditor({
  segments,
  onChangeSegments,
  currentTime,
  onSeek,
  wordsPerSentence,
  linesPerPart,
  onApplyFormatting,
}: DynamicSubtitleEditorProps) {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [showBatchShift, setShowBatchShift] = useState(false);
  const [shiftSeconds, setShiftSeconds] = useState(0.25);
  const [verifiedFeedback, setVerifiedFeedback] = useState(false);

  // Update specific field of segment
  const updateSegment = (id: string, field: keyof SubtitleSegment, val: any) => {
    const updated = segments.map((seg) => {
      if (seg.id === id) {
        return { ...seg, [field]: val };
      }
      return seg;
    });
    onChangeSegments(updated);
  };

  // Run Timing Polish & Gap-Bridging Algorithm
  const handlePolishTimings = () => {
    const refined = verifyAndRefineTimings(segments, { bridgeMicroGaps: true, maxBridgeSeconds: 0.30 });
    onChangeSegments(refined);
    setVerifiedFeedback(true);
    setTimeout(() => setVerifiedFeedback(false), 2500);
  };

  // Nudge timing
  const nudgeTime = (id: string, field: "start" | "end", delta: number) => {
    const updated = segments.map((seg) => {
      if (seg.id === id) {
        const newVal = Math.max(0, parseFloat((seg[field] + delta).toFixed(2)));
        return { ...seg, [field]: newVal };
      }
      return seg;
    });
    onChangeSegments(updated);
  };

  // Snap timestamp to current audio/video playhead
  const snapToPlayhead = (id: string, field: "start" | "end") => {
    const time = parseFloat(currentTime.toFixed(2));
    const updated = segments.map((seg) => {
      if (seg.id === id) {
        return { ...seg, [field]: time };
      }
      return seg;
    });
    onChangeSegments(updated);
  };

  // Add new blank segment
  const handleAddSegment = () => {
    const lastSeg = segments[segments.length - 1];
    const newStart = lastSeg ? lastSeg.end + 0.2 : parseFloat(currentTime.toFixed(2));
    const newEnd = parseFloat((newStart + 2.0).toFixed(2));

    const newSeg: SubtitleSegment = {
      id: `seg_${Date.now()}`,
      start: newStart,
      end: newEnd,
      text: "سلام l'équipe! نص جديد هنا",
      translation: "",
    };

    onChangeSegments([...segments, newSeg]);
    setEditingId(newSeg.id);
  };

  // Delete segment
  const handleDeleteSegment = (id: string) => {
    onChangeSegments(segments.filter((s) => s.id !== id));
  };

  // Batch shift all timestamps
  const handleBatchShift = (direction: "forward" | "backward") => {
    const factor = direction === "forward" ? 1 : -1;
    const delta = shiftSeconds * factor;
    const updated = segments.map((seg) => ({
      ...seg,
      start: Math.max(0, parseFloat((seg.start + delta).toFixed(2))),
      end: Math.max(0.1, parseFloat((seg.end + delta).toFixed(2))),
    }));
    onChangeSegments(updated);
  };

  // Identify active segment
  const activeSegmentId = segments.find(
    (seg) => currentTime >= seg.start && currentTime <= seg.end
  )?.id;

  return (
    <div className="bg-[#130D1C] border border-[#2A2036] rounded-[14px] p-4 sm:p-5 space-y-4 shadow-[0_8px_24px_rgba(0,0,0,0.25)]">
      {/* Header with Title and Quick Actions */}
      <div className="flex flex-wrap items-center justify-between gap-2.5 pb-3 border-b border-[#2A2036]">
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 rounded-[8px] bg-gradient-to-br from-[#8B5CF6] to-[#6366F1] flex items-center justify-center shadow-md">
            <Edit3 className="w-3.5 h-3.5 text-white" />
          </div>
          <div>
            <h3 className="font-cairo font-extrabold text-[15px] text-[#F3EFFA]">
              Dynamic Subtitles & Timing Editor
            </h3>
            <p className="text-[11.5px] text-[#6C6280]">
              {segments.length} segment{segments.length === 1 ? "" : "s"} · Millisecond synchronization
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          {/* Timing Polish Pass Button */}
          <button
            type="button"
            onClick={handlePolishTimings}
            className={`px-3 py-1.5 rounded-[9px] border font-bold text-xs flex items-center gap-1.5 transition-all cursor-pointer shadow-sm ${
              verifiedFeedback
                ? "bg-emerald-500/20 border-emerald-500/60 text-emerald-300"
                : "bg-[#1B1327] hover:bg-[#2A2036] border-[#3E2856] text-[#34D399] hover:text-[#6EE7B7]"
            }`}
            title="Clean timing: anchors onset to speech start, removes overlaps, and bridges micro-gaps cleanly"
          >
            {verifiedFeedback ? <Check className="w-3.5 h-3.5" /> : <Wand2 className="w-3.5 h-3.5" />}
            <span>{verifiedFeedback ? "Timings Polished & Aligned!" : "Polish & Align Timings"}</span>
          </button>

          {/* Format chunks button */}
          <button
            type="button"
            onClick={onApplyFormatting}
            className="px-3 py-1.5 rounded-[9px] bg-[#1B1327] hover:bg-[#2A2036] border border-[#3E2856] text-[#C084FC] hover:text-[#F3EFFA] font-bold text-xs flex items-center gap-1.5 transition-all cursor-pointer shadow-sm"
            title={`Format subtitle chunks to ${wordsPerSentence} words per sentence, ${linesPerPart} line(s)`}
          >
            <Scissors className="w-3.5 h-3.5 text-[#A855F7]" />
            <span>Apply {wordsPerSentence}w / {linesPerPart}L Preset</span>
          </button>

          {/* Toggle batch shift */}
          <button
            type="button"
            onClick={() => setShowBatchShift(!showBatchShift)}
            className={`px-3 py-1.5 rounded-[9px] border text-xs font-bold flex items-center gap-1.5 transition-all cursor-pointer ${
              showBatchShift
                ? "bg-[#8B5CF6]/20 border-[#8B5CF6] text-[#F3EFFA]"
                : "bg-[#1B1327] hover:bg-[#2A2036] border-[#2A2036] text-[#9086A3]"
            }`}
          >
            <Clock className="w-3.5 h-3.5" />
            <span>Shift All</span>
          </button>

          {/* Add Segment button */}
          <button
            type="button"
            onClick={handleAddSegment}
            className="px-3.5 py-1.5 rounded-[9px] bg-[#8B5CF6] hover:bg-[#7C3AED] text-white font-bold text-xs flex items-center gap-1.5 transition-all cursor-pointer shadow-[0_4px_12px_rgba(139,92,246,0.3)]"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>Add Cue</span>
          </button>
        </div>
      </div>

      {/* Batch Shift Dropdown Drawer */}
      {showBatchShift && (
        <div className="bg-[#1B1327] border border-[#3E2856] rounded-[10px] p-3 flex flex-wrap items-center justify-between gap-3 text-xs animate-in fade-in duration-150">
          <div className="flex items-center gap-2">
            <span className="text-[#9086A3] font-medium">Shift entire timeline by:</span>
            <select
              value={shiftSeconds}
              onChange={(e) => setShiftSeconds(parseFloat(e.target.value))}
              className="bg-[#0A0710] border border-[#2A2036] rounded-[7px] text-[#F3EFFA] font-mono px-2 py-1 outline-none"
            >
              <option value="0.10">0.10s (100ms)</option>
              <option value="0.25">0.25s (250ms)</option>
              <option value="0.50">0.50s (500ms)</option>
              <option value="1.00">1.00s (1s)</option>
            </select>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => handleBatchShift("backward")}
              className="px-3 py-1 bg-[#2A2036] hover:bg-[#3E2856] text-[#F3EFFA] rounded-[7px] font-bold flex items-center gap-1 cursor-pointer transition-colors"
            >
              <Rewind className="w-3 h-3" />
              <span>Nudge Earlier (-{shiftSeconds}s)</span>
            </button>
            <button
              type="button"
              onClick={() => handleBatchShift("forward")}
              className="px-3 py-1 bg-[#8B5CF6]/30 hover:bg-[#8B5CF6]/50 text-[#F3EFFA] border border-[#8B5CF6]/50 rounded-[7px] font-bold flex items-center gap-1 cursor-pointer transition-colors"
            >
              <FastForward className="w-3 h-3" />
              <span>Nudge Later (+{shiftSeconds}s)</span>
            </button>
          </div>
        </div>
      )}

      {/* Segments List */}
      {segments.length === 0 ? (
        <div className="text-center py-8 text-[#6C6280] space-y-2">
          <AlignLeft className="w-8 h-8 mx-auto opacity-40 text-[#A78BFA]" />
          <p className="text-[13px]">No subtitle cues yet. Click "Add Cue" or transcribe an audio/video file.</p>
        </div>
      ) : (
        <div className="space-y-2.5 max-h-[360px] overflow-y-auto pr-1 select-none custom-scrollbar">
          {segments.map((seg, idx) => {
            const isActive = seg.id === activeSegmentId;
            const isEditing = seg.id === editingId;

            return (
              <div
                key={seg.id}
                className={`border rounded-[12px] p-3 transition-all duration-150 ${
                  isActive
                    ? "bg-[#1B1327] border-[#8B5CF6] shadow-[0_0_15px_rgba(139,92,246,0.15)] ring-1 ring-[#8B5CF6]/40"
                    : "bg-[#0E0916] border-[#241A30] hover:border-[#3E2856]"
                }`}
              >
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
                  {/* Left: Index badge + play preview trigger + Timestamps */}
                  <div className="flex items-center gap-2 flex-wrap">
                    <span
                      className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-mono font-bold shrink-0 ${
                        isActive ? "bg-[#8B5CF6] text-white" : "bg-[#1B1327] text-[#9086A3]"
                      }`}
                    >
                      {idx + 1}
                    </span>

                    {/* Seek/Play to this segment */}
                    <button
                      type="button"
                      onClick={() => onSeek(seg.start)}
                      className="p-1 rounded-md bg-[#1B1327] hover:bg-[#8B5CF6] text-[#C084FC] hover:text-white transition-colors cursor-pointer"
                      title="Jump playback to this segment start"
                    >
                      <Play className="w-3 h-3 ml-0.5" />
                    </button>

                    {/* Start Time Editor */}
                    <div className="flex items-center gap-1 bg-[#130D1C] border border-[#2A2036] rounded-[8px] px-2 py-1 text-[11px] font-mono text-[#F3EFFA]">
                      <span className="text-[#6C6280] font-bold text-[10px]">IN:</span>
                      <input
                        type="number"
                        step="0.05"
                        min="0"
                        value={seg.start}
                        onChange={(e) =>
                          updateSegment(seg.id, "start", parseFloat(e.target.value) || 0)
                        }
                        className="w-12 bg-transparent text-center outline-none font-mono text-[11px] font-bold text-[#34D399]"
                      />
                      <span className="text-[#6C6280]">s</span>
                      <div className="flex flex-col ml-0.5">
                        <button
                          type="button"
                          onClick={() => nudgeTime(seg.id, "start", 0.1)}
                          className="text-[#6C6280] hover:text-[#34D399] -my-0.5"
                        >
                          <ChevronUp className="w-2.5 h-2.5" />
                        </button>
                        <button
                          type="button"
                          onClick={() => nudgeTime(seg.id, "start", -0.1)}
                          className="text-[#6C6280] hover:text-[#34D399] -my-0.5"
                        >
                          <ChevronDown className="w-2.5 h-2.5" />
                        </button>
                      </div>
                    </div>

                    <span className="text-[#6C6280] text-xs">→</span>

                    {/* End Time Editor */}
                    <div className="flex items-center gap-1 bg-[#130D1C] border border-[#2A2036] rounded-[8px] px-2 py-1 text-[11px] font-mono text-[#F3EFFA]">
                      <span className="text-[#6C6280] font-bold text-[10px]">OUT:</span>
                      <input
                        type="number"
                        step="0.05"
                        min="0"
                        value={seg.end}
                        onChange={(e) =>
                          updateSegment(seg.id, "end", parseFloat(e.target.value) || 0)
                        }
                        className="w-12 bg-transparent text-center outline-none font-mono text-[11px] font-bold text-[#F43F5E]"
                      />
                      <span className="text-[#6C6280]">s</span>
                      <div className="flex flex-col ml-0.5">
                        <button
                          type="button"
                          onClick={() => nudgeTime(seg.id, "end", 0.1)}
                          className="text-[#6C6280] hover:text-[#F43F5E] -my-0.5"
                        >
                          <ChevronUp className="w-2.5 h-2.5" />
                        </button>
                        <button
                          type="button"
                          onClick={() => nudgeTime(seg.id, "end", -0.1)}
                          className="text-[#6C6280] hover:text-[#F43F5E] -my-0.5"
                        >
                          <ChevronDown className="w-2.5 h-2.5" />
                        </button>
                      </div>
                    </div>

                    {/* Duration Pill */}
                    <span className="text-[10.5px] font-mono text-[#9086A3] bg-[#1B1327] px-1.5 py-0.5 rounded">
                      {(seg.end - seg.start).toFixed(2)}s
                    </span>
                  </div>

                  {/* Right: Snap Buttons & Delete */}
                  <div className="flex items-center gap-1.5 self-end sm:self-auto">
                    <button
                      type="button"
                      onClick={() => snapToPlayhead(seg.id, "start")}
                      className="px-2 py-1 bg-[#1B1327] hover:bg-[#2A2036] text-[#34D399] border border-[#2A2036] rounded-[6px] text-[10.5px] font-mono transition-colors cursor-pointer"
                      title="Snap segment IN timestamp to current playhead"
                    >
                      Set IN ({currentTime.toFixed(1)}s)
                    </button>
                    <button
                      type="button"
                      onClick={() => snapToPlayhead(seg.id, "end")}
                      className="px-2 py-1 bg-[#1B1327] hover:bg-[#2A2036] text-[#F43F5E] border border-[#2A2036] rounded-[6px] text-[10.5px] font-mono transition-colors cursor-pointer"
                      title="Snap segment OUT timestamp to current playhead"
                    >
                      Set OUT ({currentTime.toFixed(1)}s)
                    </button>
                    <button
                      type="button"
                      onClick={() => handleDeleteSegment(seg.id)}
                      className="p-1 text-[#6C6280] hover:text-red-400 rounded transition-colors cursor-pointer ml-1"
                      title="Delete segment"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>

                {/* Subtitle Textarea */}
                <div className="mt-2">
                  <textarea
                    dir="auto"
                    rows={seg.text.includes("\n") ? 2 : 1}
                    value={seg.text}
                    onChange={(e) => updateSegment(seg.id, "text", e.target.value)}
                    placeholder="Enter Darija in Arabic script and French/English in Latin script..."
                    className="w-full bg-[#130D1C] border border-[#2A2036] focus:border-[#8B5CF6] rounded-[8px] p-2 text-[13.5px] font-cairo text-[#F3EFFA] outline-none resize-none transition-all"
                  />
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
