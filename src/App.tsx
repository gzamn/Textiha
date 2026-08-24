/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useRef } from "react";
import { User } from "firebase/auth";
import { SubtitleSegment, SubtitleStyle, DEFAULT_STYLE } from "./types";
import { SAMPLE_PROJECTS, reformatSegmentsByWordLimit } from "./utils";
import AudioPlayerPreview from "./components/AudioPlayerPreview";
import SubtitleStylePanel from "./components/SubtitleStylePanel";
import SubtitleExporter from "./components/SubtitleExporter";
import SubtitleEditor from "./components/SubtitleEditor";
import { UserAuthBar } from "./components/UserAuthBar";
import { ApiKeyModal } from "./components/ApiKeyModal";
import {
  auth,
  fetchUserProfile,
  saveUserGeminiApiKey,
  saveTranscriptionToHistory,
  fetchUserTranscriptionHistory,
} from "./firebase";
import {
  UploadCloud,
  FileAudio,
  Sparkles,
  RefreshCw,
  AlertTriangle,
  Flame,
  BookOpen,
  CheckCircle2,
  Key,
} from "lucide-react";

const STATUS_MESSAGES = [
  "Uploading your MP3 audio file to processing pipeline...",
  "Running Gemini 2.5 Flash on your personal quota...",
  "Analyzing mixed vocal patterns of Algerian Darija...",
  "Decoding colloquial Franco-Arabic phrases...",
  "Aligning hybrid French and English colloquialisms...",
  "Calculating millisecond-level timeline offsets...",
  "Generating final subtitle cue timestamps...",
  "Polishing segments for visual readability...",
];

export default function App() {
  // Auth & API Key States
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [geminiApiKey, setGeminiApiKey] = useState<string>(() => {
    return localStorage.getItem("user_gemini_api_key") || "";
  });
  const [isKeyModalOpen, setIsKeyModalOpen] = useState<boolean>(false);
  const [savedHistory, setSavedHistory] = useState<any[]>([]);

  // Subtitle Content & Timeline States
  const [originalSegments, setOriginalSegments] = useState<SubtitleSegment[]>([]);
  const [maxWordsPerLine, setMaxWordsPerLine] = useState<number>(50); // 50 means uncapped
  const [subtitleStyle, setSubtitleStyle] = useState<SubtitleStyle>(DEFAULT_STYLE);

  // Playback States
  const [currentTime, setCurrentTime] = useState<number>(0);
  const [isPlaying, setIsPlaying] = useState<boolean>(false);

  // Upload & Project States
  const [audioFile, setAudioFile] = useState<File | null>(null);
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [projectName, setProjectName] = useState<string>("New Transcription");
  const [customPrompt, setCustomPrompt] = useState<string>("");

  // Loading & Error States
  const [isTranscribing, setIsTranscribing] = useState<boolean>(false);
  const [transcribingStatus, setTranscribingStatus] = useState<string>("");
  const [error, setError] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState<boolean>(false);

  const statusTimer = useRef<any>(null);

  // Get active project duration (either current audio file duration or active mock sample duration)
  const [audioDuration, setAudioDuration] = useState<number>(0);

  // Listen to Firebase Auth state
  useEffect(() => {
    const unsubscribe = auth.onAuthStateChanged(async (user) => {
      setCurrentUser(user);
      if (user) {
        // Load user profile & saved key from Firestore
        const profile = await fetchUserProfile(user.uid);
        if (profile?.geminiApiKey) {
          setGeminiApiKey(profile.geminiApiKey);
          localStorage.setItem("user_gemini_api_key", profile.geminiApiKey);
        }
        // Load transcription history
        const history = await fetchUserTranscriptionHistory(user.uid);
        setSavedHistory(history);
      }
    });
    return () => unsubscribe();
  }, []);

  // Save Gemini Key
  const handleSaveGeminiKey = async (newKey: string) => {
    setGeminiApiKey(newKey);
    localStorage.setItem("user_gemini_api_key", newKey);
    if (currentUser) {
      await saveUserGeminiApiKey(currentUser.uid, newKey);
    }
  };

  // Load a saved project from history
  const handleLoadSavedProject = (project: any) => {
    if (project.segments) {
      setOriginalSegments(project.segments);
      setProjectName(project.audioName || "Loaded Project");
      if (project.audioDuration) {
        setAudioDuration(project.audioDuration);
      }
      if (project.guidelines) {
        setCustomPrompt(project.guidelines);
      }
      setCurrentTime(0);
      setIsPlaying(false);
      setError(null);
    }
  };

  // If a mock sample is active, calculate its duration based on last segment end
  useEffect(() => {
    if (!audioUrl && originalSegments.length > 0) {
      const maxEnd = Math.max(...originalSegments.map((s) => s.end));
      setAudioDuration(maxEnd + 1.0);
    }
  }, [originalSegments, audioUrl]);

  // Rotator for transcribing progress status messages
  useEffect(() => {
    if (isTranscribing) {
      let idx = 0;
      setTranscribingStatus(STATUS_MESSAGES[0]);
      statusTimer.current = setInterval(() => {
        idx = (idx + 1) % STATUS_MESSAGES.length;
        setTranscribingStatus(STATUS_MESSAGES[idx]);
      }, 3500);
    } else {
      if (statusTimer.current) {
        clearInterval(statusTimer.current);
      }
    }
    return () => {
      if (statusTimer.current) clearInterval(statusTimer.current);
    };
  }, [isTranscribing]);

  // Handle Mock Sample Playback ticks (when there is no actual audio file)
  useEffect(() => {
    let intervalId: any;
    if (isPlaying && !audioUrl) {
      const startRealTime = Date.now() - currentTime * 1000;
      intervalId = setInterval(() => {
        const elapsed = (Date.now() - startRealTime) / 1000;
        if (elapsed >= audioDuration) {
          setCurrentTime(0);
          setIsPlaying(false);
        } else {
          setCurrentTime(elapsed);
        }
      }, 50); // fast 50ms update rate for fluid syncing
    }
    return () => {
      if (intervalId) clearInterval(intervalId);
    };
  }, [isPlaying, audioUrl, audioDuration]);

  // Drag & drop file upload handlers
  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(true);
  };

  const handleDragLeave = () => {
    setDragOver(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const files = e.dataTransfer.files;
    if (files && files.length > 0) {
      processSelectedFile(files[0]);
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (files && files.length > 0) {
      processSelectedFile(files[0]);
    }
  };

  const processSelectedFile = (file: File) => {
    if (!file.type.startsWith("audio/") && !file.name.endsWith(".mp3")) {
      setError("Please select a valid audio file, preferably an MP3 file.");
      return;
    }
    setError(null);
    setAudioFile(file);

    // Create localized audio source URL
    const url = URL.createObjectURL(file);
    setAudioUrl(url);

    // Auto update project details
    const cleanName = file.name.replace(/\.[^/.]+$/, "");
    setProjectName(cleanName);

    // Detect duration using Web Audio APIs
    const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
    const reader = new FileReader();
    reader.onload = function (evt) {
      audioContext.decodeAudioData(evt.target?.result as ArrayBuffer, (buffer) => {
        setAudioDuration(buffer.duration);
      });
    };
    reader.readAsArrayBuffer(file);

    // Pause current playing
    setIsPlaying(false);
    setCurrentTime(0);
  };

  // Trigger server-side transcription using Gemini API
  const handleTranscribeSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!audioFile) {
      setError("Please upload an MP3 audio file first before transcribing.");
      return;
    }

    if (!geminiApiKey.trim()) {
      setIsKeyModalOpen(true);
      setError("Please enter and verify your free Gemini API key to proceed with transcription.");
      return;
    }

    setIsTranscribing(true);
    setError(null);

    const formData = new FormData();
    formData.append("audio", audioFile);
    formData.append("prompt", customPrompt);
    formData.append("geminiApiKey", geminiApiKey.trim());

    try {
      const response = await fetch("/api/transcribe", {
        method: "POST",
        headers: {
          "x-gemini-api-key": geminiApiKey.trim(),
        },
        body: formData,
      });

      const contentType = response.headers.get("content-type");
      if (!contentType || !contentType.includes("application/json")) {
        const rawText = await response.text();
        if (rawText.includes("<!DOCTYPE") || rawText.includes("<html") || rawText.includes("The page")) {
          throw new Error(
            `Server endpoint /api/transcribe returned an HTML response (HTTP ${response.status}). If deployed on Vercel, check that the API deployment is active.`
          );
        }
        throw new Error(`Server returned unexpected non-JSON response (HTTP ${response.status}): ${rawText.slice(0, 150)}`);
      }

      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || "Failed to transcribe audio. Please check your Gemini API key.");
      }

      if (data.segments && Array.isArray(data.segments)) {
        // Map unique IDs
        const parsedSegments = data.segments.map((seg: any, idx: number) => ({
          id: `seg_gemini_${Date.now()}_${idx}`,
          start: parseFloat(seg.start) || 0,
          end: parseFloat(seg.end) || 0,
          text: seg.text || "",
          translation: "",
        }));

        setOriginalSegments(parsedSegments);
        setCurrentTime(0);
        setIsPlaying(false);

        // Auto save to Firestore if user is logged in
        if (currentUser) {
          try {
            await saveTranscriptionToHistory(currentUser.uid, {
              audioName: projectName,
              audioDuration: audioDuration,
              segments: parsedSegments,
              guidelines: customPrompt,
            });
            const updated = await fetchUserTranscriptionHistory(currentUser.uid);
            setSavedHistory(updated);
          } catch (histErr) {
            console.warn("Could not save to history:", histErr);
          }
        }
      } else {
        throw new Error("Invalid response schema received from transcription engine.");
      }
    } catch (err: any) {
      console.error(err);
      setError(err.message || "An unexpected error occurred during transcription.");
    } finally {
      setIsTranscribing(false);
    }
  };

  // Apply client-side "words-per-line" filter dynamically on top of original transcripts
  const processedSegments = reformatSegmentsByWordLimit(originalSegments, maxWordsPerLine);

  return (
    <div id="app-root" className="min-h-screen bg-slate-950 text-slate-100 flex flex-col font-sans">
      {/* 1. Header Banner */}
      <header id="app-header" className="border-b border-slate-900 bg-slate-900/80 backdrop-blur-md sticky top-0 z-40">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between gap-4">
          <div className="flex items-center space-x-3">
            <div className="bg-purple-600 p-2 rounded-xl text-white shadow-md shadow-purple-500/10 shrink-0">
              <Flame className="w-5 h-5 sm:w-6 sm:h-6 animate-pulse" id="branding-logo" />
            </div>
            <div>
              <h1 className="text-sm sm:text-base md:text-lg font-extrabold text-slate-100 tracking-tight font-sans">
                Algerian Darija Transcriber
              </h1>
              <p className="text-[10px] sm:text-xs text-slate-400 font-medium">
                Subtitle Builder & Synchronization
              </p>
            </div>
          </div>

          {/* User Auth and Gemini API Key Management */}
          <UserAuthBar
            user={currentUser}
            geminiApiKey={geminiApiKey}
            onOpenKeyModal={() => setIsKeyModalOpen(true)}
            savedHistory={savedHistory}
            onLoadProject={handleLoadSavedProject}
          />
        </div>
      </header>

      {/* API Key Modal */}
      <ApiKeyModal
        isOpen={isKeyModalOpen}
        onClose={() => setIsKeyModalOpen(false)}
        currentKey={geminiApiKey}
        onSaveKey={handleSaveGeminiKey}
        userEmail={currentUser?.email || undefined}
      />

      {/* 2. Main Content Dashboard Container */}
      <main id="app-dashboard" className="flex-1 max-w-7xl w-full mx-auto p-4 sm:p-6 lg:p-8 grid grid-cols-1 lg:grid-cols-12 gap-6">
        
        {/* Error notification banner if any */}
        {error && (
          <div id="error-banner" className="lg:col-span-12 bg-rose-950/40 border border-rose-800/60 rounded-xl p-4 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 text-rose-300 text-sm animate-in fade-in duration-200">
            <div className="flex items-start gap-3">
              <AlertTriangle className="w-5 h-5 shrink-0 text-rose-400 mt-0.5" />
              <div className="space-y-1">
                <p className="font-bold text-rose-200">Execution Error</p>
                <p className="text-xs opacity-90">{error}</p>
              </div>
            </div>
            <button
              onClick={() => setIsKeyModalOpen(true)}
              className="shrink-0 px-3 py-1.5 bg-rose-900/60 hover:bg-rose-800/80 border border-rose-700 text-white rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-colors"
            >
              <Key className="w-3.5 h-3.5" />
              <span>Configure Gemini Key</span>
            </button>
          </div>
        )}

        {/* API Key missing tip bar (if key not configured) */}
        {!geminiApiKey && !error && (
          <div className="lg:col-span-12 bg-amber-950/30 border border-amber-800/60 rounded-xl p-3 sm:p-4 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 text-amber-200 text-xs">
            <div className="flex items-center gap-2.5">
              <Key className="w-4 h-4 text-amber-400 shrink-0" />
              <span>
                <strong>Bring Your Own Gemini API Key:</strong> Connect your personal free Gemini key from Google AI Studio to process unlimited transcriptions with your own dedicated quota.
              </span>
            </div>
            <button
              onClick={() => setIsKeyModalOpen(true)}
              className="shrink-0 px-3 py-1.5 bg-amber-500 hover:bg-amber-400 text-slate-950 rounded-lg font-bold transition-colors flex items-center gap-1.5 shadow-sm"
            >
              <span>Add Gemini Key</span>
            </button>
          </div>
        )}

        {/* ========================================================
            COLUMN A: INPUT CONTROLS, UPLOADS & MOCK SAMPLES (4 COLS)
            ======================================================== */}
        <div className="lg:col-span-4 space-y-6">
          {/* Audio Upload Card */}
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow-lg space-y-5">
            <div className="flex items-center gap-2 pb-3 border-b border-slate-800">
              <UploadCloud className="w-5 h-5 text-purple-400" />
              <h2 className="text-sm font-bold text-slate-200 uppercase tracking-wider">
                Upload & Configure
              </h2>
            </div>

            {/* Drag & Drop Upload Zone */}
            <div
              id="upload-dropzone"
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
              onDrop={handleDrop}
              className={`border-2 border-dashed rounded-xl p-6 text-center transition-all cursor-pointer ${
                dragOver
                  ? "border-purple-500 bg-purple-500/5 scale-[0.98]"
                  : "border-slate-800 bg-slate-950 hover:border-slate-700"
              }`}
              onClick={() => document.getElementById("file-input-trigger")?.click()}
            >
              <input
                id="file-input-trigger"
                type="file"
                accept="audio/mp3, audio/*"
                onChange={handleFileChange}
                className="hidden"
              />
              <FileAudio className={`w-10 h-10 mx-auto mb-3 transition-colors ${audioFile ? "text-purple-400" : "text-slate-500"}`} />
              
              {audioFile ? (
                <div className="space-y-1" id="selected-file-meta">
                  <p className="text-xs font-bold text-slate-200 line-clamp-1">{audioFile.name}</p>
                  <p className="text-[10px] text-slate-400 font-mono">
                    {(audioFile.size / 1024 / 1024).toFixed(2)} MB • MP3 Audio
                  </p>
                </div>
              ) : (
                <div className="space-y-1">
                  <p className="text-xs font-semibold text-slate-300">
                    Drag & Drop your audio file here
                  </p>
                  <p className="text-[10px] text-slate-500 font-medium">
                    Supports .MP3 and .WAV files up to 35MB
                  </p>
                </div>
              )}
            </div>

            {/* Audio Settings Form */}
            <form onSubmit={handleTranscribeSubmit} className="space-y-4">
              {/* Extra AI Instructions */}
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-slate-300 flex items-center gap-1.5">
                  <BookOpen className="w-3.5 h-3.5 text-purple-400" />
                  AI Style Guidelines (Optional)
                </label>
                <textarea
                  id="extra-prompt-input"
                  value={customPrompt}
                  onChange={(e) => setCustomPrompt(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-xs text-slate-200 focus:outline-none focus:border-purple-500 resize-none h-24 leading-relaxed"
                  placeholder="e.g., Maintain exact Algerian spoken pacing, output Latin letters for French/English words and clean Arabic script for Darija elements..."
                />
              </div>

              {/* Action Button */}
              <button
                id="btn-submit-transcription"
                type="submit"
                disabled={!audioFile || isTranscribing}
                className="w-full bg-purple-600 hover:bg-purple-500 text-white font-bold py-2.5 px-4 rounded-xl shadow-md shadow-purple-500/5 transition-all flex items-center justify-center gap-2 cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
              >
                {isTranscribing ? (
                  <>
                    <RefreshCw className="w-4 h-4 animate-spin text-white" />
                    <span>Transcribing audio...</span>
                  </>
                ) : (
                  <>
                    <Sparkles className="w-4 h-4 text-white" />
                    <span>Transcribe with Gemini</span>
                  </>
                )}
              </button>
            </form>
          </div>
        </div>

        {/* ========================================================
            COLUMN B: PREVIEW, STYLER, EXPORTER (8 COLS)
            ======================================================== */}
        <div className="lg:col-span-8 space-y-6">
          {/* If transcription is loading, show animated full overlay */}
          {isTranscribing ? (
            <div id="transcription-loading-state" className="bg-slate-900 border border-slate-800 rounded-2xl p-12 shadow-xl flex flex-col items-center justify-center text-center space-y-6 min-h-[400px]">
              <div className="relative">
                <div className="w-16 h-16 border-4 border-purple-500/20 border-t-purple-400 rounded-full animate-spin" />
                <Sparkles className="w-6 h-6 text-purple-400 absolute inset-0 m-auto animate-pulse" />
              </div>
              <div className="space-y-2 max-w-md">
                <h3 className="text-lg font-bold text-slate-200">Processing Audio with Gemini</h3>
                <p className="text-xs text-purple-400 font-mono tracking-wider animate-pulse uppercase">
                  {transcribingStatus}
                </p>
                <p className="text-xs text-slate-400 leading-relaxed">
                  Executing with your personal Gemini quota. High-fidelity Darija Franco-Arabic detection in progress.
                </p>
              </div>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {/* Left Grid: Simulated Video Preview Player */}
              <div className="md:col-span-2">
                <AudioPlayerPreview
                  segments={processedSegments}
                  audioUrl={audioUrl}
                  duration={audioDuration}
                  currentTime={currentTime}
                  onTimeUpdate={setCurrentTime}
                  isPlaying={isPlaying}
                  onPlayPause={setIsPlaying}
                  style={subtitleStyle}
                />
              </div>

              {/* Bottom Left: Style Panels */}
              <div className="md:col-span-1">
                <SubtitleStylePanel
                  style={subtitleStyle}
                  onChangeStyle={setSubtitleStyle}
                  maxWordsPerLine={maxWordsPerLine}
                  onChangeMaxWordsPerLine={setMaxWordsPerLine}
                />
              </div>

              {/* Bottom Right: Exporters */}
              <div className="md:col-span-1">
                <SubtitleExporter segments={processedSegments} projectName={projectName} />
              </div>
            </div>
          )}
        </div>

        {/* ========================================================
            ROW 3: INTERACTIVE TIMELINE / BUILDER SEGMENTS LIST (12 COLS)
            ======================================================== */}
        <div className="lg:col-span-12">
          <SubtitleEditor
            segments={originalSegments}
            onChangeSegments={setOriginalSegments}
            currentTime={currentTime}
            onSelectTime={(time) => {
              setCurrentTime(time);
              // If native audio is available, sync its timestamp too
              const audioTag = document.querySelector("audio") as HTMLAudioElement;
              if (audioTag) {
                audioTag.currentTime = time;
              }
            }}
          />
        </div>
      </main>
    </div>
  );
}

