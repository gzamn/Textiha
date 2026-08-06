/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useRef, useEffect, useState } from "react";
import { SubtitleSegment, SubtitleStyle } from "../types";
import { Play, Pause, RotateCcw, Volume2, Video, Sparkles, Image as ImageIcon } from "lucide-react";

interface AudioPlayerPreviewProps {
  segments: SubtitleSegment[];
  audioUrl: string | null; // NULL if using mock playback
  duration: number; // Duration in seconds
  currentTime: number;
  onTimeUpdate: (time: number) => void;
  isPlaying: boolean;
  onPlayPause: (playing: boolean) => void;
  style: SubtitleStyle;
}

const BACKDROPS = [
  { id: "vlog", name: "Kasbah Algiers (Vlog Mockup)", bg: "bg-radial from-orange-400 via-rose-500 to-indigo-900" },
  { id: "dark", name: "Cinematic Cinema Stage", bg: "bg-slate-950" },
  { id: "neon", name: "Future Algiers Tech Stage", bg: "bg-gradient-to-tr from-cyan-900 via-indigo-950 to-purple-950" },
  { id: "vintage", name: "Warm Cafe Background", bg: "bg-gradient-to-b from-amber-900 via-yellow-950 to-stone-900" },
];

export default function AudioPlayerPreview({
  segments,
  audioUrl,
  duration,
  currentTime,
  onTimeUpdate,
  isPlaying,
  onPlayPause,
  style,
}: AudioPlayerPreviewProps) {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const visualizerCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);

  const [backdrop, setBackdrop] = useState("vlog");
  const [volume, setVolume] = useState(0.8);
  const [peaks, setPeaks] = useState<number[]>([]);
  const [isDragging, setIsDragging] = useState(false);

  const animationFrameId = useRef<number | null>(null);

  // Generate pseudo-random repeatable peaks from subtitles segments
  const generateFallbackPeaks = () => {
    const count = 120;
    const simulatedPeaks: number[] = [];
    const activeDuration = duration || 10;

    for (let i = 0; i < count; i++) {
      const t = (i / count) * activeDuration;
      // Check if t falls within any segment
      const isVoice = segments.some((seg) => t >= seg.start && t <= seg.end);
      if (isVoice) {
        // High spike indicating speech
        const seed = Math.sin(i * 0.25) * 0.25 + 0.65;
        const noise = Math.random() * 0.2;
        simulatedPeaks.push(Math.min(1.0, Math.max(0.3, seed + noise)));
      } else {
        // Low background signal
        simulatedPeaks.push(0.04 + Math.random() * 0.05);
      }
    }
    setPeaks(simulatedPeaks);
  };

  // Decode actual audio URL using Web Audio API if available
  useEffect(() => {
    let isMounted = true;
    
    // Always start with fallback peaks so user sees segments immediately
    generateFallbackPeaks();

    if (!audioUrl) return;

    const fetchAndDecode = async () => {
      try {
        const response = await fetch(audioUrl);
        if (!response.ok) throw new Error("Network response error");
        const arrayBuffer = await response.arrayBuffer();
        const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
        if (!AudioContextClass) return;
        const audioCtx = new AudioContextClass();
        const audioBuffer = await audioCtx.decodeAudioData(arrayBuffer);

        if (!isMounted) return;

        const rawData = audioBuffer.getChannelData(0);
        const count = 120;
        const samplesPerPixel = Math.floor(rawData.length / count) || 1;
        const extractedPeaks: number[] = [];

        for (let i = 0; i < count; i++) {
          let max = 0;
          const start = i * samplesPerPixel;
          const end = Math.min(start + samplesPerPixel, rawData.length);
          for (let j = start; j < end; j++) {
            const val = Math.abs(rawData[j]);
            if (val > max) max = val;
          }
          extractedPeaks.push(max);
        }

        const maxPeak = Math.max(...extractedPeaks, 0.01);
        const normalized = extractedPeaks.map((p) => Math.max(0.04, p / maxPeak));
        setPeaks(normalized);
      } catch (err) {
        console.warn("Waveform decoding failed, using segments-based fallback:", err);
      }
    };

    fetchAndDecode();

    return () => {
      isMounted = false;
    };
  }, [audioUrl, segments, duration]);

  const handleWaveformInteraction = (clientX: number) => {
    if (!containerRef.current || !duration) return;
    const rect = containerRef.current.getBoundingClientRect();
    const x = clientX - rect.left;
    const percentage = Math.max(0, Math.min(1, x / rect.width));
    const newTime = percentage * duration;
    onTimeUpdate(newTime);
    if (audioRef.current) {
      audioRef.current.currentTime = newTime;
    }
  };

  const handleMouseDown = (e: React.MouseEvent<HTMLDivElement>) => {
    setIsDragging(true);
    handleWaveformInteraction(e.clientX);
  };

  const handleMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    if (isDragging) {
      handleWaveformInteraction(e.clientX);
    }
  };

  const handleMouseUp = () => {
    setIsDragging(false);
  };

  const handleTouchStart = (e: React.TouchEvent<HTMLDivElement>) => {
    setIsDragging(true);
    if (e.touches[0]) {
      handleWaveformInteraction(e.touches[0].clientX);
    }
  };

  const handleTouchMove = (e: React.TouchEvent<HTMLDivElement>) => {
    if (isDragging && e.touches[0]) {
      handleWaveformInteraction(e.touches[0].clientX);
    }
  };

  // Sync internal HTMLAudioElement with props
  useEffect(() => {
    if (!audioRef.current) return;

    if (isPlaying) {
      audioRef.current.play().catch(() => {
        // Handle potential autoplay blockages
        onPlayPause(false);
      });
    } else {
      audioRef.current.pause();
    }
  }, [isPlaying, onPlayPause]);

  // Sync volume
  useEffect(() => {
    if (audioRef.current) {
      audioRef.current.volume = volume;
    }
  }, [volume]);

  // Reset audio when audioUrl changes
  useEffect(() => {
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.load();
      if (isPlaying) {
        audioRef.current.play().catch(() => onPlayPause(false));
      }
    }
  }, [audioUrl]);

  // Draw simulated or real audio visualizer wave on canvas
  useEffect(() => {
    const canvas = visualizerCanvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let width = canvas.width;
    let height = canvas.height;

    const draw = () => {
      ctx.clearRect(0, 0, width, height);

      // We'll draw 40 bars of waveform
      const barCount = 42;
      const barWidth = width / barCount - 2;

      for (let i = 0; i < barCount; i++) {
        // Base height from distance to center
        const distFromCenter = Math.abs(i - barCount / 2) / (barCount / 2);
        let amp = 0.15 + (1 - distFromCenter) * 0.45;

        // Animate based on isPlaying and time
        if (isPlaying) {
          amp += Math.sin(Date.now() * 0.006 + i * 0.3) * 0.35;
        } else {
          amp += Math.sin(i * 0.2) * 0.05;
        }

        amp = Math.max(0.05, amp);

        const barHeight = amp * (height * 0.7);
        const x = i * (barWidth + 2);
        const y = (height - barHeight) / 2;

        // Beautiful purple and fuchsia gradient bars
        const gradient = ctx.createLinearGradient(0, y, 0, y + barHeight);
        gradient.addColorStop(0, "#C084FC"); // purple 400
        gradient.addColorStop(0.5, "#A855F7"); // purple 500
        gradient.addColorStop(1, "#6366F1"); // indigo 500

        ctx.fillStyle = gradient;
        ctx.beginPath();
        if (ctx.roundRect) {
          ctx.roundRect(x, y, barWidth, barHeight, 3);
        } else {
          ctx.rect(x, y, barWidth, barHeight);
        }
        ctx.fill();
      }

      animationFrameId.current = requestAnimationFrame(draw);
    };

    draw();

    return () => {
      if (animationFrameId.current) {
        cancelAnimationFrame(animationFrameId.current);
      }
    };
  }, [isPlaying]);

  // Handle time update from native Audio element
  const handleNativeTimeUpdate = () => {
    if (audioRef.current) {
      onTimeUpdate(audioRef.current.currentTime);
    }
  };

  const handleNativeEnded = () => {
    onPlayPause(false);
    onTimeUpdate(0);
    if (audioRef.current) {
      audioRef.current.currentTime = 0;
    }
  };

  // Find the active subtitle segment for current time
  const activeSegment = segments.find(
    (seg) => currentTime >= seg.start && currentTime <= seg.end
  );

  // Manual scrubber change
  const handleScrub = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newTime = parseFloat(e.target.value);
    onTimeUpdate(newTime);
    if (audioRef.current) {
      audioRef.current.currentTime = newTime;
    }
  };

  // Skip back 5 seconds
  const handleRewind = () => {
    const newTime = Math.max(0, currentTime - 5);
    onTimeUpdate(newTime);
    if (audioRef.current) {
      audioRef.current.currentTime = newTime;
    }
  };

  const formatSeconds = (sec: number) => {
    const m = Math.floor(sec / 60).toString().padStart(2, "0");
    const s = Math.floor(sec % 60).toString().padStart(2, "0");
    const ms = Math.floor((sec % 1) * 10).toString();
    return `${m}:${s}.${ms}`;
  };

  // Get current backdrop config
  const activeBackdrop = BACKDROPS.find((b) => b.id === backdrop) || BACKDROPS[0];

  return (
    <div id="audio-player-preview" className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden shadow-xl flex flex-col h-full">
      {/* Hidden native audio tag */}
      {audioUrl && (
        <audio
          ref={audioRef}
          src={audioUrl}
          onTimeUpdate={handleNativeTimeUpdate}
          onEnded={handleNativeEnded}
        />
      )}

      {/* Backdrop Selector Tabs */}
      <div className="bg-slate-950 border-b border-slate-800 px-4 py-3 flex items-center justify-between">
        <span className="text-xs font-semibold text-slate-400 tracking-wider uppercase flex items-center gap-1.5">
          <Video className="w-3.5 h-3.5 text-purple-400" /> Simulated Video Monitor
        </span>
        <div className="flex gap-1 bg-slate-900 border border-slate-800 p-1 rounded-lg">
          {BACKDROPS.map((b) => (
            <button
              key={b.id}
              id={`backdrop-tab-${b.id}`}
              type="button"
              onClick={() => setBackdrop(b.id)}
              className={`px-2 py-1 text-[10px] font-medium rounded-md transition-all ${
                backdrop === b.id
                  ? "bg-purple-500/10 text-purple-300 font-bold"
                  : "text-slate-400 hover:text-slate-200"
              }`}
            >
              {b.id === "vlog" ? "Kasbah" : b.id === "dark" ? "Cinema" : b.id === "neon" ? "Tech" : "Cafe"}
            </button>
          ))}
        </div>
      </div>

      {/* Main Video Monitor Stage */}
      <div
        id="video-monitor-stage"
        className={`relative flex-1 min-h-[250px] md:min-h-[320px] ${activeBackdrop.bg} transition-colors duration-500 flex flex-col justify-between p-6 overflow-hidden`}
      >
        {/* Subtle decorative grid/overlay for realism */}
        <div className="absolute inset-0 bg-grid-pattern opacity-10 pointer-events-none" />
        <div className="absolute inset-0 bg-gradient-to-b from-black/20 via-transparent to-black/30 pointer-events-none" />

        {/* Top Header - Mock Watermark */}
        <div className="flex justify-between items-start z-10">
          <div className="flex items-center gap-1.5 bg-black/40 backdrop-blur-md border border-white/5 px-2.5 py-1 rounded-full text-[10px] font-mono text-white/70">
            <Sparkles className="w-3 h-3 text-purple-400 animate-pulse" />
            <span>ALGERIAN DARIJA LIVE PREVIEW</span>
          </div>
          <span className="text-[10px] font-mono text-white/50 bg-black/40 px-2 py-0.5 rounded backdrop-blur-md">
            {backdrop === "vlog" ? "1080p | 30fps" : "Cinematic 4K"}
          </span>
        </div>

        {/* Middle Stage - Waveform overlay (if cinema or abstract selected, looks amazing) */}
        <div className="absolute inset-x-0 top-1/2 -translate-y-1/2 flex justify-center pointer-events-none opacity-20 z-0">
          <canvas
            ref={visualizerCanvasRef}
            width={380}
            height={90}
            className="w-full max-w-[400px] h-[90px]"
          />
        </div>

        {/* Bottom/Center/Top Subtitle Display Engine */}
        <div
          id="subtitle-display-container"
          className={`w-full flex justify-center z-10 transition-all pointer-events-none ${
            style.positionY === "top"
              ? "mt-2 justify-start items-start"
              : style.positionY === "center"
              ? "my-auto justify-center items-center"
              : "mb-2 justify-end items-end"
          }`}
          style={{
            height: "50px", // fixed buffer to avoid bouncing
          }}
        >
          {activeSegment ? (() => {
            const words = activeSegment.text.trim().split(/\s+/).filter(Boolean);
            const segDuration = activeSegment.end - activeSegment.start;
            const elapsed = Math.max(0, currentTime - activeSegment.start);
            const progress = segDuration > 0 ? Math.min(1, elapsed / segDuration) : 0;
            const activeWordIdx = Math.min(words.length - 1, Math.floor(progress * words.length));

            return (
              <div
                id="active-subtitle-card"
                className="transition-all duration-150 transform scale-100 ease-out flex flex-col items-center text-center shadow-2xl animate-fade-in"
                dir={style.direction || "rtl"}
                style={{
                  fontFamily: style.fontFamily,
                  fontSize: `${style.fontSize}px`,
                  color: style.textColor,
                  backgroundColor: style.backgroundColor
                    ? `${style.backgroundColor}${Math.round(style.backgroundOpacity * 255)
                        .toString(16)
                        .padStart(2, "0")}`
                    : "transparent",
                  borderRadius: `${style.borderRadius}px`,
                  padding: `${style.paddingY}px ${style.paddingX}px`,
                  textTransform: style.textTransform,
                  textShadow:
                    style.outlineWidth > 0
                      ? `0 0 0.5px ${style.outlineColor}, ${style.outlineColor} 0px 0px ${style.outlineWidth}px`
                      : "none",
                  maxWidth: "90%",
                  lineHeight: "1.4",
                  direction: style.direction || "rtl",
                }}
              >
                {/* Original Darija text line with active word timing highlight */}
                <div id="subtitle-orig-text" className="font-semibold tracking-wide flex flex-wrap justify-center gap-1.5" dir={style.direction || "rtl"}>
                  {words.map((word, wIdx) => {
                    const isWordActive = wIdx === activeWordIdx;
                    return (
                      <span
                        key={wIdx}
                        className={`transition-all duration-100 ${
                          isWordActive
                            ? "text-yellow-300 font-extrabold scale-105 underline decoration-purple-400 decoration-2 underline-offset-4"
                            : ""
                        }`}
                      >
                        {word}
                      </span>
                    );
                  })}
                </div>
              </div>
            );
          })() : (
            <span className="text-white/20 font-mono text-xs italic tracking-wider animate-pulse">
              [ Waiting for speech ]
            </span>
          )}
        </div>
      </div>

      {/* Playback Controls Panel */}
      <div className="bg-slate-950 p-4 border-t border-slate-800 space-y-4 z-10">
        {/* Waveform timeline */}
        <div className="space-y-1.5">
          <div className="flex justify-between items-center px-1">
            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider flex items-center gap-1">
              <Sparkles className="w-3 h-3 text-purple-400" /> Interactive Waveform Timeline
            </span>
            <span className="text-[10px] font-mono text-slate-500">
              Drag or Click to Scrub
            </span>
          </div>
          
          <div
            ref={containerRef}
            id="waveform-timeline"
            onMouseDown={handleMouseDown}
            onMouseMove={handleMouseMove}
            onMouseUp={handleMouseUp}
            onMouseLeave={handleMouseUp}
            onTouchStart={handleTouchStart}
            onTouchMove={handleTouchMove}
            onTouchEnd={handleMouseUp}
            className="relative h-14 bg-slate-900/60 border border-slate-800/80 rounded-xl overflow-hidden flex items-center justify-center cursor-ew-resize select-none"
          >
            {/* Subtitle segment background highlights */}
            {segments.map((seg) => {
              if (!duration) return null;
              const left = (seg.start / duration) * 100;
              const width = ((seg.end - seg.start) / duration) * 100;
              return (
                <div
                  key={seg.id}
                  className="absolute top-0 bottom-0 bg-purple-500/5 border-x border-purple-500/10 pointer-events-none"
                  style={{ left: `${left}%`, width: `${width}%` }}
                />
              );
            })}

            {/* Waveform bars */}
            <div className="absolute inset-0 px-4 flex items-center justify-between pointer-events-none">
              {peaks.map((peak, index) => {
                const playedRatio = duration ? currentTime / duration : 0;
                const playedCount = Math.floor(playedRatio * peaks.length);
                const isPlayed = index < playedCount;
                const barHeight = `${Math.max(12, peak * 85)}%`;
                return (
                  <div
                    key={index}
                    className={`w-[2px] sm:w-[3px] mx-[0.5px] rounded-full transition-all duration-150 ${
                      isPlayed
                        ? "bg-purple-500 shadow-[0_0_3px_rgba(168,85,247,0.4)]"
                        : "bg-slate-750/70"
                    }`}
                    style={{ height: barHeight }}
                  />
                );
              })}
            </div>

            {/* Glowing Playhead vertical cursor */}
            {duration > 0 && (
              <div
                className="absolute top-0 bottom-0 w-0.5 bg-purple-400 pointer-events-none z-10 shadow-[0_0_8px_#a855f7]"
                style={{ left: `${(currentTime / duration) * 100}%` }}
              >
                <div className="absolute -top-0.5 -left-1.5 w-3.5 h-3.5 rounded-full bg-purple-400 shadow-[0_0_8px_#a855f7] border border-white" />
              </div>
            )}
          </div>
        </div>

        {/* Scrubber timeline */}
        <div className="flex items-center space-x-3">
          <span className="text-xs font-mono text-slate-400 w-12 text-right">
            {formatSeconds(currentTime)}
          </span>
          <input
            id="player-timeline-slider"
            type="range"
            min="0"
            max={duration || 10}
            step="0.05"
            value={currentTime}
            onChange={handleScrub}
            className="flex-1 h-1.5 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-purple-500"
          />
          <span className="text-xs font-mono text-slate-400 w-12 text-left">
            {formatSeconds(duration)}
          </span>
        </div>

        {/* Action Controls */}
        <div className="flex items-center justify-between">
          {/* Play/Pause/Rewind */}
          <div className="flex items-center space-x-2">
            <button
              id="btn-play-pause"
              type="button"
              onClick={() => onPlayPause(!isPlaying)}
              className={`p-3 rounded-full flex items-center justify-center transition-all cursor-pointer ${
                isPlaying
                  ? "bg-purple-600 text-white hover:bg-purple-500 hover:scale-105"
                  : "bg-slate-800 text-slate-200 hover:bg-slate-700 hover:scale-105"
              }`}
            >
              {isPlaying ? (
                <Pause className="w-5 h-5" id="pause-icon" />
              ) : (
                <Play className="w-5 h-5 ml-0.5" id="play-icon" />
              )}
            </button>
            <button
              id="btn-rewind"
              type="button"
              onClick={handleRewind}
              title="Rewind 5 seconds"
              className="p-2.5 rounded-lg bg-slate-900 border border-slate-800 text-slate-400 hover:text-slate-100 hover:bg-slate-800 transition-colors cursor-pointer"
            >
              <RotateCcw className="w-4 h-4" />
            </button>
          </div>

          {/* Volume control */}
          <div className="flex items-center space-x-2 bg-slate-900 border border-slate-800/80 px-3 py-1.5 rounded-lg max-w-[130px]">
            <Volume2 className="w-4 h-4 text-slate-400" />
            <input
              id="volume-slider"
              type="range"
              min="0"
              max="1"
              step="0.1"
              value={volume}
              onChange={(e) => setVolume(parseFloat(e.target.value))}
              className="w-16 h-1 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-slate-400"
            />
          </div>
        </div>
      </div>
    </div>
  );
}
