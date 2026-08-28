/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useRef } from "react";
import { User } from "firebase/auth";
import { SubtitleSegment, SubtitleStyle, DEFAULT_STYLE, AVAILABLE_FONTS, TextAlignType } from "./types";
import {
  exportToSRT,
  exportToVTT,
  exportToJSON,
  reformatSegmentsByFormattingOptions,
  extractAndOptimizeAudio,
  SAMPLE_PROJECTS,
} from "./utils";
import { UserAuthBar } from "./components/UserAuthBar";
import { ApiKeyModal } from "./components/ApiKeyModal";
import { DynamicSubtitleEditor } from "./components/DynamicSubtitleEditor";
import {
  auth,
  fetchUserProfile,
  saveUserGeminiApiKey,
  saveTranscriptionToHistory,
  fetchUserTranscriptionHistory,
} from "./firebase";
import {
  Sparkles,
  AlertTriangle,
  Flame,
  Check,
  Play,
  Pause,
  RotateCcw,
  Volume2,
  FileCode,
  Video,
  Key,
  ArrowLeft,
  AlignCenter,
  AlignLeft,
  AlignRight,
  Music,
  FileAudio,
  Film,
  Layers,
  Sliders,
  Eye,
} from "lucide-react";

const STATUS_MESSAGES = [
  "Uploading your file to processing pipeline...",
  "Running Gemini AI on personal quota...",
  "Analyzing vocal patterns of Algerian Darija...",
  "Decoding colloquial Franco-Arabic phrases...",
  "Aligning hybrid French and English colloquialisms...",
  "Calculating millisecond-level timeline offsets...",
  "Generating final subtitle cue timestamps...",
  "Polishing segments for visual readability...",
];

function hexToRgba(hex: string, alpha: number): string {
  const cleanHex = hex.replace("#", "");
  const r = parseInt(cleanHex.substring(0, 2), 16) || 0;
  const g = parseInt(cleanHex.substring(2, 4), 16) || 0;
  const b = parseInt(cleanHex.substring(4, 6), 16) || 0;
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

export default function App() {
  // Navigation / Stepper State
  const [currentStep, setCurrentStep] = useState<1 | 2 | 3>(1);

  // Auth & API Key States
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [geminiApiKey, setGeminiApiKey] = useState<string>(() => {
    return localStorage.getItem("user_gemini_api_key") || "";
  });
  const [serverKeyAvailable, setServerKeyAvailable] = useState<boolean>(true);
  const [isKeyModalOpen, setIsKeyModalOpen] = useState<boolean>(false);
  const [savedHistory, setSavedHistory] = useState<any[]>([]);

  // Subtitle Content & Styling States
  const [segments, setSegments] = useState<SubtitleSegment[]>([]);
  const [style, setStyle] = useState<SubtitleStyle>(DEFAULT_STYLE);

  // Upload & File States
  const [audioFile, setAudioFile] = useState<File | null>(null);
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [customPrompt, setCustomPrompt] = useState<string>("");
  const [isAdvOpen, setIsAdvOpen] = useState<boolean>(false);
  const [dragOver, setDragOver] = useState<boolean>(false);

  // Media Playback States
  const [currentTime, setCurrentTime] = useState<number>(0);
  const [audioDuration, setAudioDuration] = useState<number>(0);
  const [isPlaying, setIsPlaying] = useState<boolean>(false);
  const [volume, setVolume] = useState<number>(0.85);
  const mediaElementRef = useRef<HTMLMediaElement | null>(null);

  // Formatting states for user options
  const [wordsPerSentence, setWordsPerSentence] = useState<number>(style.maxWordsPerSegment || 4);
  const [linesPerPart, setLinesPerPart] = useState<number>(style.maxLinesPerSegment || 1);

  // Loading & Error States
  const [isTranscribing, setIsTranscribing] = useState<boolean>(false);
  const [transcriptionPhase, setTranscriptionPhase] = useState<"idle" | "uploading" | "transcribing">("idle");
  const [uploadProgress, setUploadProgress] = useState<number>(0);
  const [uploadLoadedBytes, setUploadLoadedBytes] = useState<number>(0);
  const [uploadTotalBytes, setUploadTotalBytes] = useState<number>(0);
  const [transcriptionProgress, setTranscriptionProgress] = useState<number>(0);
  const [transcribingStatus, setTranscribingStatus] = useState<string>("");
  const [error, setError] = useState<string | null>(null);
  const statusTimer = useRef<any>(null);
  const progressTimer = useRef<any>(null);

  // Step 3 Export States
  const [exportType, setExportType] = useState<"subtitle" | "video">("subtitle");
  const [exportFormat, setExportFormat] = useState<string>("SRT");
  const [isExportDone, setIsExportDone] = useState<boolean>(false);

  // Check health endpoint for server key configuration
  useEffect(() => {
    fetch("/api/health")
      .then((res) => res.json())
      .then((data) => {
        if (typeof data.serverKeyConfigured === "boolean") {
          setServerKeyAvailable(data.serverKeyConfigured);
        }
      })
      .catch((err) => {
        console.warn("Health check error:", err);
      });
  }, []);

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
      setSegments(project.segments);
      if (project.audioDuration) {
        setAudioDuration(project.audioDuration);
      }
      if (project.guidelines) {
        setCustomPrompt(project.guidelines);
      }
      setCurrentTime(0);
      setIsPlaying(false);
      setError(null);
      setCurrentStep(2);
    }
  };

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

  // Handle Mock Sample Playback ticks if playing without audio URL
  useEffect(() => {
    let intervalId: any;
    if (isPlaying && !audioUrl) {
      const startRealTime = Date.now() - currentTime * 1000;
      const duration = audioDuration || 30;
      intervalId = setInterval(() => {
        const elapsed = (Date.now() - startRealTime) / 1000;
        if (elapsed >= duration) {
          setCurrentTime(0);
          setIsPlaying(false);
        } else {
          setCurrentTime(elapsed);
        }
      }, 50);
    }
    return () => {
      if (intervalId) clearInterval(intervalId);
    };
  }, [isPlaying, audioUrl, audioDuration, currentTime]);

  // Update media element volume
  useEffect(() => {
    if (mediaElementRef.current) {
      mediaElementRef.current.volume = volume;
    }
  }, [volume]);

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
    const isValid =
      file.type.startsWith("audio/") ||
      file.type.startsWith("video/") ||
      /\.(mp3|wav|mp4|mov|m4a|aac|ogg|webm|mkv)$/i.test(file.name);

    if (!isValid) {
      setError("Please select a valid audio or video file (MP3, WAV, MP4, MOV, etc.).");
      return;
    }

    // Bunny CDN supports large uploads up to 500 MB
    if (file.size > 500 * 1024 * 1024) {
      setError(
        `Selected file is too large (${(file.size / (1024 * 1024)).toFixed(1)} MB). The maximum allowed upload size is 500 MB.`
      );
      return;
    }

    setError(null);
    setAudioFile(file);

    // Create localized audio source URL
    const url = URL.createObjectURL(file);
    setAudioUrl(url);

    // Detect duration using Web Audio APIs
    try {
      const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
      const reader = new FileReader();
      reader.onload = function (evt) {
        audioContext.decodeAudioData(
          evt.target?.result as ArrayBuffer,
          (buffer) => {
            setAudioDuration(buffer.duration);
          },
          () => {
            // fallback
          }
        );
      };
      reader.readAsArrayBuffer(file);
    } catch {
      // ignore
    }

    setIsPlaying(false);
    setCurrentTime(0);
  };

  const handleRemoveFile = () => {
    setAudioFile(null);
    if (audioUrl) {
      URL.revokeObjectURL(audioUrl);
      setAudioUrl(null);
    }
    setSegments([]);
    setCurrentTime(0);
    setIsPlaying(false);
  };

  // Trigger transcription with live upload progress and transcribing stages
  const handleTranscribeOrContinue = async () => {
    if (!audioFile) {
      // If sample project or already has segments
      if (segments.length > 0) {
        setCurrentStep(2);
        return;
      }
      setError("Please select an audio file first.");
      return;
    }

    // If segments already loaded for this file, just proceed
    if (segments.length > 0) {
      setCurrentStep(2);
      return;
    }

    if (!geminiApiKey.trim() && !serverKeyAvailable) {
      setIsKeyModalOpen(true);
      setError("Please enter and verify your free Gemini API key to proceed with transcription.");
      return;
    }

    setIsTranscribing(true);
    setTranscriptionPhase("uploading");
    setUploadProgress(0);
    setUploadLoadedBytes(0);
    setUploadTotalBytes(audioFile.size || 1);
    setTranscriptionProgress(0);
    setTranscribingStatus("Preparing audio for transcription...");
    setError(null);

    if (progressTimer.current) clearInterval(progressTimer.current);
    if (statusTimer.current) clearInterval(statusTimer.current);

    try {
      let transcriptionData: any = null;

      // 1. Extract and optimize audio track client-side
      // This reduces 10MB-500MB videos down to ultra-compact < 3MB voice WAV streams
      // completely eliminating Vercel's 4.5MB request limit (HTTP 413) and avoiding heavy upload delays!
      const { file: uploadFile, isExtracted, originalSize, optimizedSize } =
        await extractAndOptimizeAudio(audioFile, (status) => setTranscribingStatus(status));

      if (isExtracted) {
        console.log(
          `Extracted audio from ${Math.round(originalSize / 1024)} KB to ${Math.round(optimizedSize / 1024)} KB`
        );
      }

      const isLargeFile = uploadFile.size > 20 * 1024 * 1024; // Only if extracted stream is still > 20MB

      if (isLargeFile) {
        // --- Fallback: BUNNY CDN DIRECT STORAGE UPLOAD FOR EXTREMELY LARGE RAW FILES ---
        setTranscribingStatus("Connecting to storage server...");

        const configRes = await fetch("/api/bunny-config");
        if (!configRes.ok) {
          throw new Error("Storage server configuration not available. Please try a shorter audio clip.");
        }
        const bunny = await configRes.json();

        const cleanName = uploadFile.name.replace(/[^a-zA-Z0-9._-]/g, "_");
        const storagePath = `uploads/${Date.now()}_${cleanName}`;
        const bunnyUploadUrl = `https://${bunny.storageHost}/${bunny.storageZone}/${storagePath}`;

        await new Promise<void>((resolve, reject) => {
          const xhr = new XMLHttpRequest();
          xhr.open("PUT", bunnyUploadUrl);
          xhr.setRequestHeader("AccessKey", bunny.accessKey);
          xhr.setRequestHeader("Content-Type", uploadFile.type || "application/octet-stream");

          xhr.upload.onprogress = (event) => {
            if (event.lengthComputable) {
              const percent = Math.min(100, Math.round((event.loaded / event.total) * 100));
              setUploadProgress(percent);
              setUploadLoadedBytes(event.loaded);
              setUploadTotalBytes(event.total);
              setTranscribingStatus(`Uploading to storage (${percent}%)...`);
            }
          };

          xhr.onload = () => {
            if (xhr.status === 200 || xhr.status === 201) {
              resolve();
            } else {
              reject(
                new Error(
                  `Storage server returned HTTP ${xhr.status}. Please check your connection.`
                )
              );
            }
          };

          xhr.onerror = () => {
            reject(new Error("Network error occurred while uploading file."));
          };

          xhr.ontimeout = () => {
            reject(new Error("Upload timed out."));
          };

          xhr.send(uploadFile);
        });

        // Transition to transcribing stage
        setUploadProgress(100);
        setTranscriptionPhase("transcribing");
        setTranscriptionProgress(5);
        setTranscribingStatus("Transcribing with Gemini 2.5 Flash...");

        let currentProg = 5;
        let msgIndex = 1;
        progressTimer.current = setInterval(() => {
          currentProg += Math.floor(Math.random() * 4) + 2;
          if (currentProg > 94) {
            currentProg = 94;
          }
          setTranscriptionProgress(currentProg);

          if (currentProg % 15 === 0 && msgIndex < STATUS_MESSAGES.length) {
            setTranscribingStatus(STATUS_MESSAGES[msgIndex]);
            msgIndex++;
          }
        }, 450);

        const res = await fetch("/api/transcribe-bunny", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            ...(geminiApiKey.trim() ? { "x-gemini-api-key": geminiApiKey.trim() } : {}),
          },
          body: JSON.stringify({
            storagePath,
            fileName: uploadFile.name,
            mimeType: uploadFile.type || "audio/wav",
            prompt: customPrompt,
            geminiApiKey: geminiApiKey.trim(),
          }),
        });

        if (!res.ok) {
          const errData = await res.json().catch(() => ({}));
          throw new Error(errData.error || `Server returned HTTP ${res.status}`);
        }

        transcriptionData = await res.json();
      } else {
        // --- 2. FAST DIRECT UPLOAD (Compact audio < 3.5MB, fully Vercel-compatible) ---
        const formData = new FormData();
        formData.append("audio", uploadFile);
        formData.append("prompt", customPrompt);
        if (geminiApiKey.trim()) {
          formData.append("geminiApiKey", geminiApiKey.trim());
        }

        const xhr = new XMLHttpRequest();

        xhr.upload.onprogress = (event) => {
          if (event.lengthComputable) {
            const percent = Math.min(100, Math.round((event.loaded / event.total) * 100));
            setUploadProgress(percent);
            setUploadLoadedBytes(event.loaded);
            setUploadTotalBytes(event.total);
            setTranscribingStatus(`Uploading audio stream (${percent}%)...`);
          }
        };

        xhr.upload.onload = () => {
          setUploadProgress(100);
          setTranscriptionPhase("transcribing");
          setTranscriptionProgress(5);
          setTranscribingStatus("Transcribing with Gemini 2.5 Flash...");

          let currentProg = 5;
          let msgIndex = 1;
          progressTimer.current = setInterval(() => {
            currentProg += Math.floor(Math.random() * 4) + 2;
            if (currentProg > 94) {
              currentProg = 94;
            }
            setTranscriptionProgress(currentProg);

            if (currentProg % 15 === 0 && msgIndex < STATUS_MESSAGES.length) {
              setTranscribingStatus(STATUS_MESSAGES[msgIndex]);
              msgIndex++;
            }
          }, 450);
        };

        const transcriptionPromise = new Promise<{ status: number; data: any }>((resolve, reject) => {
          xhr.open("POST", "/api/transcribe");
          if (geminiApiKey.trim()) {
            xhr.setRequestHeader("x-gemini-api-key", geminiApiKey.trim());
          }

          xhr.onload = () => {
            if (xhr.status === 413) {
              reject(
                new Error(
                  "File payload exceeded serverless limit. Please choose a shorter file or audio clip."
                )
              );
              return;
            }

            try {
              const json = JSON.parse(xhr.responseText);
              resolve({ status: xhr.status, data: json });
            } catch {
              if (xhr.status >= 400) {
                reject(
                  new Error(
                    `Server returned HTTP error ${xhr.status}. Please check your connection or Gemini API key.`
                  )
                );
              } else {
                reject(
                  new Error(
                    `Server returned unexpected response (HTTP ${xhr.status})`
                  )
                );
              }
            }
          };

          xhr.onerror = () => {
            reject(new Error("Network error occurred during transcription upload. Please check your connection."));
          };

          xhr.ontimeout = () => {
            reject(new Error("Transcription request timed out. Please try again."));
          };

          xhr.send(formData);
        });

        const { status, data } = await transcriptionPromise;

        if (status !== 200) {
          throw new Error(data?.error || "Failed to transcribe audio. Please check your Gemini API key.");
        }

        transcriptionData = data;
      }

      if (transcriptionData?.segments && Array.isArray(transcriptionData.segments)) {
        // Complete transcription progress
        if (progressTimer.current) clearInterval(progressTimer.current);
        setTranscriptionProgress(100);
        setTranscribingStatus("Transcription finished! Preparing editor...");

        const parsedSegments: SubtitleSegment[] = transcriptionData.segments.map(
          (seg: any, idx: number) => ({
            id: `seg_${Date.now()}_${idx}`,
            start: parseFloat(seg.start) || 0,
            end: parseFloat(seg.end) || 0,
            text: seg.text || "",
            translation: "",
          })
        );

        // Brief delay so the user perceives the 100% completion
        await new Promise((r) => setTimeout(r, 450));

        setSegments(parsedSegments);
        setCurrentTime(0);
        setIsPlaying(false);

        // Auto save to Firestore if user is logged in
        if (currentUser) {
          try {
            await saveTranscriptionToHistory(currentUser.uid, {
              audioName: audioFile.name,
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

        // Navigate to Step 2
        setCurrentStep(2);
      } else {
        throw new Error("No subtitle segments returned by Gemini AI.");
      }
    } catch (err: any) {
      console.error(err);
      setError(err.message || "An unexpected error occurred during transcription.");
    } finally {
      if (progressTimer.current) clearInterval(progressTimer.current);
      if (statusTimer.current) clearInterval(statusTimer.current);
      setIsTranscribing(false);
      setTranscriptionPhase("idle");
    }
  };

  // Active subtitle text lookup based on playback currentTime
  // Only display subtitle when voice is actively speaking in current segment!
  const activeSegment = segments.find(
    (seg) => currentTime >= seg.start && currentTime <= seg.end
  );

  // When playing or when user has scrolled the playhead:
  // if activeSegment is found, show it.
  // If no segment is active right now during playback, display empty string (disappears when voice stops).
  // When idle before playback begins, if segments exist, show the first segment text as style preview sample.
  const previewDisplayText = activeSegment
    ? activeSegment.text
    : currentTime > 0
    ? "" // Disappear when voice stops during playback
    : segments.length > 0
    ? segments[0].text
    : "Wallah [tuto] hada rah top 🔥";

  // Check if current uploaded file is video
  const isVideoFile = !!(
    audioFile &&
    (audioFile.type.startsWith("video/") ||
      /\.(mp4|mkv|mov|webm|avi|flv|m4v)$/i.test(audioFile.name))
  );

  // Playback Controls
  const togglePlayPause = () => {
    if (!mediaElementRef.current && !audioUrl && segments.length === 0) return;

    if (mediaElementRef.current) {
      if (isPlaying) {
        mediaElementRef.current.pause();
        setIsPlaying(false);
      } else {
        mediaElementRef.current.play().catch(() => {});
        setIsPlaying(true);
      }
    } else {
      setIsPlaying(!isPlaying);
    }
  };

  const handleSeek = (time: number) => {
    const clampedTime = Math.max(0, Math.min(time, audioDuration || 3600));
    setCurrentTime(clampedTime);
    if (mediaElementRef.current) {
      mediaElementRef.current.currentTime = clampedTime;
    }
  };

  const handleApplyFormatting = (words: number = wordsPerSentence, lines: number = linesPerPart) => {
    if (segments.length === 0) return;
    const reformatted = reformatSegmentsByFormattingOptions(segments, words, lines);
    setSegments(reformatted);
    setStyle((prev) => ({
      ...prev,
      maxWordsPerSegment: words,
      maxLinesPerSegment: lines,
    }));
  };

  // Download Handler for Step 3
  const handleDownload = () => {
    let exportText = "";
    let mimeType = "text/plain";
    let fileExt = exportFormat.toLowerCase();

    const currentSegments =
      segments.length > 0
        ? segments
        : SAMPLE_PROJECTS[0].segments;

    if (exportFormat === "SRT") {
      exportText = exportToSRT(currentSegments);
      mimeType = "application/x-subrip";
      fileExt = "srt";
    } else if (exportFormat === "VTT") {
      exportText = exportToVTT(currentSegments);
      mimeType = "text/vtt";
      fileExt = "vtt";
    } else if (exportFormat === "JSON") {
      exportText = exportToJSON(currentSegments);
      mimeType = "application/json";
      fileExt = "json";
    } else {
      // For MP4 / MOV video preset subtitle configuration
      exportText = JSON.stringify(
        {
          project: audioFile?.name || "recording.mp3",
          style,
          segments: currentSegments,
        },
        null,
        2
      );
      mimeType = "application/json";
      fileExt = `${exportFormat.toLowerCase()}.json`;
    }

    const blob = new Blob([exportText], { type: mimeType });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    const baseName = audioFile
      ? audioFile.name.replace(/\.[^/.]+$/, "")
      : "recording";
    link.href = url;
    link.download = `${baseName}.${fileExt}`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);

    setIsExportDone(true);
  };

  const handleStartOver = () => {
    setIsExportDone(false);
    handleRemoveFile();
    setCurrentStep(1);
  };

  return (
    <div className="min-h-screen flex flex-col font-sans selection:bg-[#8B5CF6] selection:text-white">
      {/* 1. Header Navigation Bar (Preserved as requested) */}
      <header className="border-b border-[#2A2036] bg-[#0A0710]/90 backdrop-blur-xl sticky top-0 z-40">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between gap-4">
          <div className="flex items-center space-x-3">
            <div className="w-[34px] h-[34px] rounded-[10px] bg-gradient-to-br from-[#8B5CF6] to-[#5B21B6] flex items-center justify-center shadow-[0_6px_18px_rgba(139,92,246,0.35)] shrink-0">
              <svg viewBox="0 0 24 24" fill="none" className="w-[18px] h-[18px]">
                <path
                  d="M12 2C10 6 6 8 6 13a6 6 0 0 0 12 0c0-2-1-3-1-3s.5 2-1 3c.8-3-1.5-4.5-1-8 0 0-2 2-2 4-1-2-1-5-1-7Z"
                  fill="#fff"
                />
              </svg>
            </div>
            <div>
              <h1 className="font-cairo font-extrabold text-base tracking-[0.2px] text-[#F3EFFA]">
                Textiha
              </h1>
              <p className="text-[11px] text-[#6C6280] -mt-0.5">
                Turn spoken Darija into clean subtitles
              </p>
            </div>
          </div>

          {/* User Auth, Cloud History & Gemini API Key modal controls */}
          <div className="flex items-center gap-2">
            <button
              onClick={() => setIsKeyModalOpen(true)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-[#1B1327] hover:bg-[#2A2036] border border-[#2A2036] text-[#C084FC] hover:text-[#F3EFFA] transition-all cursor-pointer"
              title="Configure Gemini API Key"
            >
              <Key className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">API Key</span>
            </button>

            <UserAuthBar
              user={currentUser}
              geminiApiKey={geminiApiKey}
              serverKeyAvailable={serverKeyAvailable}
              onOpenKeyModal={() => setIsKeyModalOpen(true)}
              savedHistory={savedHistory}
              onLoadProject={handleLoadSavedProject}
            />
          </div>
        </div>
      </header>

      {/* Native media element for audio-only playback sync */}
      {audioUrl && !isVideoFile && (
        <audio
          ref={(el) => {
            mediaElementRef.current = el;
          }}
          src={audioUrl}
          onTimeUpdate={() => {
            if (mediaElementRef.current) {
              setCurrentTime(mediaElementRef.current.currentTime);
            }
          }}
          onLoadedMetadata={() => {
            if (mediaElementRef.current) {
              setAudioDuration(mediaElementRef.current.duration);
            }
          }}
          onEnded={() => {
            setIsPlaying(false);
            setCurrentTime(0);
          }}
        />
      )}

      {/* 2. Main Content Container */}
      <main className="flex-1 flex flex-col items-center px-4 py-8 sm:py-10 pb-20">
        <div className={`w-full transition-all duration-300 ${currentStep === 2 ? "max-w-[1020px]" : "max-w-[640px]"}`}>
          
          {/* Brand header right in content */}
          <div className="flex items-center gap-2.5 mb-8 justify-center">
            <div className="w-[34px] h-[34px] rounded-[10px] bg-gradient-to-br from-[#8B5CF6] to-[#5B21B6] flex items-center justify-center shadow-[0_6px_18px_rgba(139,92,246,0.35)] shrink-0">
              <svg viewBox="0 0 24 24" fill="none" className="w-[18px] h-[18px]">
                <path
                  d="M12 2C10 6 6 8 6 13a6 6 0 0 0 12 0c0-2-1-3-1-3s.5 2-1 3c.8-3-1.5-4.5-1-8 0 0-2 2-2 4-1-2-1-5-1-7Z"
                  fill="#fff"
                />
              </svg>
            </div>
            <div>
              <div className="font-cairo font-extrabold text-base tracking-[0.2px] text-[#F3EFFA]">
                Textiha
              </div>
              <div className="text-[11px] text-[#6C6280] mt-0.5">
                Turn spoken Darija into clean subtitles
              </div>
            </div>
          </div>

          {/* Stepper Progress Indicator */}
          <div className="flex items-center justify-center gap-1.5 mb-7 select-none">
            {/* Step 1 */}
            <button
              type="button"
              onClick={() => setCurrentStep(1)}
              className={`flex items-center gap-2 py-1.5 px-2.5 rounded-full text-xs font-semibold transition-colors cursor-pointer ${
                currentStep === 1
                  ? "text-[#F3EFFA]"
                  : currentStep > 1
                  ? "text-[#9086A3]"
                  : "text-[#6C6280]"
              }`}
            >
              <span
                className={`w-[22px] h-[22px] rounded-full flex items-center justify-center text-[11px] font-bold transition-all ${
                  currentStep === 1
                    ? "bg-[#8B5CF6] border-[#8B5CF6] text-white shadow-[0_0_0_4px_rgba(139,92,246,0.14)]"
                    : currentStep > 1
                    ? "bg-[#34D399] border-[#34D399] text-[#06281c]"
                    : "bg-[#1B1327] border-[1.5px] border-[#2A2036] text-[#6C6280]"
                }`}
              >
                1
              </span>
              <span className="hidden sm:inline">Upload</span>
            </button>

            <div className="w-7 h-[1.5px] bg-[#2A2036] mx-0.5" />

            {/* Step 2 */}
            <button
              type="button"
              onClick={() => {
                if (audioFile || segments.length > 0) setCurrentStep(2);
              }}
              className={`flex items-center gap-2 py-1.5 px-2.5 rounded-full text-xs font-semibold transition-colors cursor-pointer ${
                currentStep === 2
                  ? "text-[#F3EFFA]"
                  : currentStep > 2
                  ? "text-[#9086A3]"
                  : "text-[#6C6280]"
              }`}
            >
              <span
                className={`w-[22px] h-[22px] rounded-full flex items-center justify-center text-[11px] font-bold transition-all ${
                  currentStep === 2
                    ? "bg-[#8B5CF6] border-[#8B5CF6] text-white shadow-[0_0_0_4px_rgba(139,92,246,0.14)]"
                    : currentStep > 2
                    ? "bg-[#34D399] border-[#34D399] text-[#06281c]"
                    : "bg-[#1B1327] border-[1.5px] border-[#2A2036] text-[#6C6280]"
                }`}
              >
                2
              </span>
              <span className="hidden sm:inline">Style</span>
            </button>

            <div className="w-7 h-[1.5px] bg-[#2A2036] mx-0.5" />

            {/* Step 3 */}
            <button
              type="button"
              onClick={() => {
                if (audioFile || segments.length > 0) setCurrentStep(3);
              }}
              className={`flex items-center gap-2 py-1.5 px-2.5 rounded-full text-xs font-semibold transition-colors cursor-pointer ${
                currentStep === 3
                  ? "text-[#F3EFFA]"
                  : "text-[#6C6280]"
              }`}
            >
              <span
                className={`w-[22px] h-[22px] rounded-full flex items-center justify-center text-[11px] font-bold transition-all ${
                  currentStep === 3
                    ? "bg-[#8B5CF6] border-[#8B5CF6] text-white shadow-[0_0_0_4px_rgba(139,92,246,0.14)]"
                    : "bg-[#1B1327] border-[1.5px] border-[#2A2036] text-[#6C6280]"
                }`}
              >
                3
              </span>
              <span className="hidden sm:inline">Export</span>
            </button>
          </div>

          {/* Error Message Banner */}
          {error && (
            <div className="mb-5 bg-[#1B1327] border border-rose-800/80 rounded-2xl p-4 flex items-start justify-between gap-3 text-rose-300 text-xs animate-in fade-in duration-200">
              <div className="flex items-start gap-2.5">
                <AlertTriangle className="w-4 h-4 shrink-0 text-rose-400 mt-0.5" />
                <span>{error}</span>
              </div>
              <button
                onClick={() => setError(null)}
                className="text-rose-400 hover:text-rose-200 text-xs font-semibold cursor-pointer"
              >
                Dismiss
              </button>
            </div>
          )}

          {/* Card Container */}
          <div className="bg-[#130D1C] border border-[#2A2036] rounded-[16px] p-6 sm:p-7 shadow-[0_20px_50px_rgba(0,0,0,0.35)]">
            
            {/* ========================================================
                STEP 1: UPLOAD
                ======================================================== */}
            {currentStep === 1 && (
              <div id="panel-1" className="space-y-6 animate-in fade-in duration-200">
                <div>
                  <h2 className="font-cairo font-extrabold text-[21px] text-[#F3EFFA] mb-1">
                    Upload your file
                  </h2>
                  <p className="text-[#9086A3] text-[13.5px] leading-relaxed">
                    Drop in a video or audio file and we'll transcribe it in Darija automatically.
                  </p>
                </div>

                {/* Dropzone */}
                {!audioFile ? (
                  <div
                    id="dropzone"
                    tabIndex={0}
                    onDragOver={handleDragOver}
                    onDragLeave={handleDragLeave}
                    onDrop={handleDrop}
                    onClick={() => document.getElementById("file-input-element")?.click()}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === " ") {
                        document.getElementById("file-input-element")?.click();
                      }
                    }}
                    className={`border-[1.5px] border-dashed rounded-[14px] p-10 text-center cursor-pointer transition-all ${
                      dragOver
                        ? "border-[#8B5CF6] bg-[rgba(139,92,246,0.14)]"
                        : "border-[#2A2036] bg-[rgba(255,255,255,0.012)] hover:border-[#8B5CF6] hover:bg-[rgba(139,92,246,0.14)]"
                    }`}
                  >
                    <svg
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="1.6"
                      className="w-[30px] h-[30px] text-[#C084FC] mx-auto mb-2.5"
                    >
                      <path d="M12 16V4M12 4l-4 4M12 4l4 4" />
                      <path d="M4 16v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2" />
                    </svg>
                    <div className="font-semibold text-[14.5px] text-[#F3EFFA]">
                      Drag & drop your file here
                    </div>
                    <div className="text-[12.5px] text-[#6C6280] mt-1">
                      or click to browse · MP4, MOV, MP3, WAV (Up to 500 MB via Bunny CDN)
                    </div>
                    <div className="text-[11.5px] text-[#C084FC]/80 mt-1.5 font-medium flex items-center justify-center gap-1.5">
                      <span className="w-1.5 h-1.5 rounded-full bg-[#34D399]" />
                      <span>Bunny CDN Storage enabled for high-speed large video & audio uploads</span>
                    </div>
                  </div>
                ) : (
                  /* File Chip Holder */
                  <div id="fileChipHolder">
                    <div className="flex items-center gap-2.5 bg-[#1B1327] border border-[#2A2036] rounded-[12px] p-3 sm:p-3.5">
                      <svg
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2"
                        className="w-[18px] h-[18px] text-[#34D399] shrink-0"
                      >
                        <path d="M20 6L9 17l-5-5" />
                      </svg>
                      <div className="flex-1 overflow-hidden">
                        <div className="text-[13.5px] font-semibold text-[#F3EFFA] truncate">
                          {audioFile.name}
                        </div>
                        <div className="text-[11.5px] text-[#6C6280]">
                          {(audioFile.size / 1024 / 1024).toFixed(1)} MB
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={handleRemoveFile}
                        className="text-[#9086A3] hover:text-[#F3EFFA] hover:bg-[rgba(255,255,255,0.06)] px-2 py-1 rounded-[6px] text-xs font-medium transition-colors cursor-pointer"
                      >
                        Remove
                      </button>
                    </div>
                  </div>
                )}

                <input
                  type="file"
                  id="file-input-element"
                  accept=".mp4,.mov,.mp3,.wav,video/mp4,video/quicktime,audio/mpeg,audio/wav"
                  onChange={handleFileChange}
                  className="hidden"
                />

                {/* Advanced Prompt Accordion */}
                <div>
                  <button
                    type="button"
                    onClick={() => setIsAdvOpen(!isAdvOpen)}
                    className="text-[12.5px] text-[#9086A3] hover:text-[#F3EFFA] flex items-center gap-1.5 cursor-pointer transition-colors"
                  >
                    <svg
                      viewBox="0 0 24 24"
                      fill="currentColor"
                      className={`w-3 h-3 transition-transform duration-200 ${
                        isAdvOpen ? "rotate-90" : ""
                      }`}
                    >
                      <path d="M9 6l6 6-6 6V6z" />
                    </svg>
                    <span>Advanced: guide the AI (optional)</span>
                  </button>

                  {isAdvOpen && (
                    <div className="mt-3 animate-in fade-in duration-200">
                      <textarea
                        value={customPrompt}
                        onChange={(e) => setCustomPrompt(e.target.value)}
                        placeholder="e.g. keep it casual, use Latin letters for French/English words..."
                        className="w-full min-h-[76px] bg-[#1B1327] border border-[#2A2036] rounded-[10px] text-[#F3EFFA] placeholder-[#6C6280] font-sans text-[12.5px] p-2.5 sm:p-3 resize-none outline-none focus:border-[#8B5CF6]"
                      />
                    </div>
                  )}
                </div>

                {/* Submit / Continue Button and Live Progress Bars */}
                <div className="pt-2 space-y-4">
                  {/* Live Upload & Transcribing Progress Container */}
                  {isTranscribing && (
                    <div className="bg-[#1B1327] border border-[#3E2856] rounded-[14px] p-4 sm:p-5 space-y-4 shadow-[0_8px_24px_rgba(0,0,0,0.3)] animate-in fade-in duration-200">
                      {/* Header with status badge */}
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <div className="w-2.5 h-2.5 rounded-full bg-[#8B5CF6] animate-ping" />
                          <span className="font-cairo font-bold text-[13.5px] text-[#F3EFFA]">
                            {transcriptionPhase === "uploading"
                              ? "Stage 1 of 2: Uploading File"
                              : "Stage 2 of 2: Transcribing Algerian Darija"}
                          </span>
                        </div>
                        <span className="text-xs font-mono font-bold text-[#C084FC]">
                          {transcriptionPhase === "uploading"
                            ? `${uploadProgress}%`
                            : `${transcriptionProgress}%`}
                        </span>
                      </div>

                      {/* Stage 1: Uploading Progress Bar */}
                      <div className="space-y-1.5">
                        <div className="flex items-center justify-between text-[11.5px]">
                          <span className="text-[#9086A3] font-medium flex items-center gap-1.5">
                            <span
                              className={`w-4 h-4 rounded-full flex items-center justify-center text-[9.5px] font-bold ${
                                uploadProgress === 100
                                  ? "bg-[#34D399] text-[#06281c]"
                                  : "bg-[#8B5CF6] text-white"
                              }`}
                            >
                              {uploadProgress === 100 ? "✓" : "1"}
                            </span>
                            Uploading audio / video file
                          </span>
                          <span className="text-[#6C6280] font-mono text-[10.5px]">
                            {uploadLoadedBytes > 0 && uploadTotalBytes > 0
                              ? `${(uploadLoadedBytes / 1024 / 1024).toFixed(1)} / ${(
                                  uploadTotalBytes /
                                  1024 /
                                  1024
                                ).toFixed(1)} MB`
                              : `${uploadProgress}%`}
                          </span>
                        </div>
                        <div className="w-full h-2 bg-[#0A0710] rounded-full overflow-hidden border border-[#2A2036]">
                          <div
                            className="h-full bg-gradient-to-r from-[#6366F1] to-[#8B5CF6] transition-all duration-150 rounded-full"
                            style={{ width: `${uploadProgress}%` }}
                          />
                        </div>
                      </div>

                      {/* Stage 2: Transcribing Progress Bar */}
                      <div
                        className={`space-y-1.5 transition-opacity duration-200 ${
                          transcriptionPhase === "transcribing" ? "opacity-100" : "opacity-40"
                        }`}
                      >
                        <div className="flex items-center justify-between text-[11.5px]">
                          <span className="text-[#9086A3] font-medium flex items-center gap-1.5">
                            <span
                              className={`w-4 h-4 rounded-full flex items-center justify-center text-[9.5px] font-bold ${
                                transcriptionProgress === 100
                                  ? "bg-[#34D399] text-[#06281c]"
                                  : transcriptionPhase === "transcribing"
                                  ? "bg-[#8B5CF6] text-white"
                                  : "bg-[#2A2036] text-[#6C6280]"
                              }`}
                            >
                              {transcriptionProgress === 100 ? "✓" : "2"}
                            </span>
                            Gemini AI Speech-to-Text Transcription
                          </span>
                          <span className="text-[#C084FC] font-mono text-[10.5px]">
                            {transcriptionProgress}%
                          </span>
                        </div>
                        <div className="w-full h-2 bg-[#0A0710] rounded-full overflow-hidden border border-[#2A2036]">
                          <div
                            className="h-full bg-gradient-to-r from-[#8B5CF6] via-[#A855F7] to-[#EC4899] transition-all duration-300 rounded-full shadow-[0_0_10px_rgba(139,92,246,0.5)]"
                            style={{ width: `${transcriptionProgress}%` }}
                          />
                        </div>
                      </div>

                      {/* Live Status Description */}
                      <div className="text-[12px] text-[#A78BFA] flex items-center gap-2 pt-0.5 font-medium truncate">
                        <div className="w-3.5 h-3.5 border-[1.5px] border-[#A78BFA]/30 border-t-[#A78BFA] rounded-full animate-spin shrink-0" />
                        <span className="truncate">{transcribingStatus}</span>
                      </div>
                    </div>
                  )}

                  <button
                    type="button"
                    onClick={handleTranscribeOrContinue}
                    disabled={!audioFile || isTranscribing}
                    className="w-full bg-gradient-to-r from-[#8B5CF6] to-[#7C3AED] hover:brightness-110 disabled:opacity-40 disabled:cursor-not-allowed text-white font-bold text-[14px] py-3.5 px-4 rounded-[11px] shadow-[0_8px_22px_rgba(139,92,246,0.32)] flex items-center justify-center gap-2 transition-all cursor-pointer"
                  >
                    {isTranscribing ? (
                      <>
                        <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                        <span>{transcribingStatus || "Transcribing audio..."}</span>
                      </>
                    ) : (
                      <span>Transcribe & continue</span>
                    )}
                  </button>
                </div>
              </div>
            )}

            {/* ========================================================
                STEP 2: STYLE SUBTITLES
                ======================================================== */}
            {currentStep === 2 && (
              <div id="panel-2" className="space-y-6 animate-in fade-in duration-200">
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 pb-1 border-b border-[#2A2036]">
                  <div>
                    <h2 className="font-cairo font-extrabold text-[21px] text-[#F3EFFA] mb-1">
                      Style & refine your subtitles
                    </h2>
                    <p className="text-[#9086A3] text-[13.5px] leading-relaxed">
                      Tune alignment, density, styling and fine-tune word timings with live feedback.
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => setCurrentStep(1)}
                      className="bg-[#1B1327] hover:text-[#F3EFFA] text-[#9086A3] border border-[#2A2036] font-bold text-[13px] py-2 px-3.5 rounded-[10px] transition-colors cursor-pointer"
                    >
                      Back
                    </button>
                    <button
                      type="button"
                      onClick={() => setCurrentStep(3)}
                      className="bg-gradient-to-r from-[#8B5CF6] to-[#7C3AED] hover:brightness-110 text-white font-bold text-[13px] py-2 px-4 rounded-[10px] shadow-[0_4px_14px_rgba(139,92,246,0.32)] flex items-center gap-1.5 transition-all cursor-pointer"
                    >
                      <span>Continue to export</span>
                      <span>→</span>
                    </button>
                  </div>
                </div>

                {/* Main 2-Column Style Layout */}
                <div className="grid grid-cols-1 lg:grid-cols-[1.4fr_1fr] gap-6 items-start">
                  
                  {/* Left Column: Live Preview Player Stage + Controls */}
                  <div className="space-y-4">
                    {/* Live Preview Stage (Expanded 16:9 screen with video/audio format detection) */}
                    <div className="bg-[#050308] border border-[#2A2036] rounded-[16px] aspect-video relative overflow-hidden flex items-center justify-center shadow-[0_8px_30px_rgba(0,0,0,0.5)]">
                      {/* Video Player or Audio Track Background */}
                      {isVideoFile && audioUrl ? (
                        <video
                          ref={(el) => {
                            mediaElementRef.current = el;
                          }}
                          src={audioUrl}
                          playsInline
                          className="w-full h-full object-contain pointer-events-none"
                          onTimeUpdate={(e) => {
                            const v = e.currentTarget;
                            if (v) {
                              setCurrentTime(v.currentTime);
                            }
                          }}
                          onLoadedMetadata={(e) => {
                            const v = e.currentTarget;
                            if (v) {
                              setAudioDuration(v.duration);
                            }
                          }}
                          onEnded={() => {
                            setIsPlaying(false);
                            setCurrentTime(0);
                          }}
                        />
                      ) : (
                        /* Audio / File format visualizer backdrop */
                        <div className="absolute inset-0 flex flex-col items-center justify-center p-6 text-center bg-[radial-gradient(circle_at_50%_40%,rgba(139,92,246,0.15),transparent_65%)] select-none">
                          <div className="w-12 h-12 rounded-2xl bg-[#1B1327] border border-[#3A2C4D] flex items-center justify-center text-[#C084FC] mb-2.5 shadow-lg">
                            <Music className="w-6 h-6 animate-pulse" />
                          </div>
                          <div className="text-[13px] font-semibold text-[#F3EFFA] max-w-[280px] truncate px-3 py-1 bg-[#130D1C]/80 rounded-full border border-[#2A2036]">
                            {audioFile ? audioFile.name : "Audio Track Preview"}
                          </div>
                          <div className="text-[11px] text-[#6C6280] mt-1 font-mono">
                            Audio Mode · Live Subtitle Overlay
                          </div>
                        </div>
                      )}
                      
                      {/* Subtle Ambient Radial Purple Glow Top-Left */}
                      <div className="absolute inset-0 bg-[radial-gradient(circle_at_15%_15%,rgba(139,92,246,0.12),transparent_45%)] pointer-events-none" />
                      
                      {/* Live Preview Format Badge */}
                      <div className="absolute top-3 left-3 text-[10px] tracking-[0.5px] uppercase bg-[#130D1C]/90 backdrop-blur-md px-2.5 py-1 rounded-md border border-[#2A2036] text-[#A78BFA] font-bold z-10 select-none flex items-center gap-1.5 shadow-sm">
                        <span className="w-1.5 h-1.5 rounded-full bg-[#34D399] animate-ping" />
                        {isVideoFile ? "Video Preview" : "Audio Preview"}
                      </div>

                      {/* Subtitle Element on Stage with Full Overflow Protection and Text Alignment */}
                      {previewDisplayText ? (
                        <div
                          id="previewSub"
                          dir={style.direction || "rtl"}
                          style={{
                            position: "absolute",
                            left: `${style.posX}%`,
                            top: `${style.posY}%`,
                            transform: `translate(-${style.posX}%, -${style.posY}%)`,
                            fontSize: `${style.fontSize}px`,
                            fontFamily: style.fontFamily,
                            color: style.textColor,
                            backgroundColor: style.backgroundEnabled
                              ? hexToRgba(style.backgroundColor, style.backgroundOpacity)
                              : "transparent",
                            padding: "6px 16px",
                            borderRadius: `${style.borderRadius}px`,
                            maxWidth: "92%",
                            width: "auto",
                            textAlign: style.textAlign || "center",
                            lineHeight: "1.45",
                            wordBreak: "break-word",
                            overflowWrap: "break-word",
                            whiteSpace: "pre-wrap",
                            transition: "all 0.1s ease-out",
                            boxShadow: style.backgroundEnabled ? "0 4px 16px rgba(0,0,0,0.4)" : "none",
                            textShadow: style.backgroundEnabled ? "none" : "0 2px 4px rgba(0,0,0,0.9)",
                            zIndex: 20,
                          }}
                        >
                          {previewDisplayText}
                        </div>
                      ) : null}
                    </div>

                    {/* Media Playback Controller bar */}
                    {(audioUrl || segments.length > 0) && (
                      <div className="bg-[#1B1327] border border-[#2A2036] rounded-[12px] p-3 flex items-center gap-3.5 shadow-sm">
                        <button
                          type="button"
                          onClick={togglePlayPause}
                          className="w-9 h-9 rounded-full bg-gradient-to-tr from-[#8B5CF6] to-[#7C3AED] hover:brightness-110 text-white flex items-center justify-center shrink-0 cursor-pointer shadow-md transition-transform active:scale-95"
                          title={isPlaying ? "Pause playback" : "Play media to preview live subtitle timing"}
                        >
                          {isPlaying ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4 ml-0.5" />}
                        </button>

                        <div className="flex-1 flex items-center gap-3">
                          <input
                            type="range"
                            min="0"
                            max={audioDuration || 30}
                            step="0.05"
                            value={currentTime}
                            onChange={(e) => {
                              const val = parseFloat(e.target.value);
                              handleSeek(val);
                            }}
                            className="w-full h-2 bg-[#2A2036] rounded-lg appearance-none cursor-pointer accent-[#8B5CF6]"
                          />
                          <span className="text-[12px] font-mono text-[#F3EFFA] shrink-0 w-16 text-right font-medium">
                            {currentTime.toFixed(2)}s / {(audioDuration || 0).toFixed(1)}s
                          </span>
                        </div>
                      </div>
                    )}

                    {/* Subtitle Alignment & Density Controls Grid */}
                    <div className="bg-[#1B1327] border border-[#2A2036] rounded-[14px] p-4 space-y-3.5">
                      <div className="font-cairo font-extrabold text-[13.5px] text-[#F3EFFA] flex items-center gap-1.5">
                        <Sliders className="w-3.5 h-3.5 text-[#C084FC]" />
                        <span>Alignment & Sentence Density</span>
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                        {/* Text Alignment */}
                        <div className="space-y-1.5">
                          <span className="text-[11px] font-bold text-[#9086A3] uppercase tracking-[0.4px] block">
                            Text Alignment
                          </span>
                          <div className="grid grid-cols-3 bg-[#130D1C] border border-[#2A2036] rounded-[10px] p-1 gap-1">
                            <button
                              type="button"
                              onClick={() => setStyle({ ...style, textAlign: "left" })}
                              className={`py-1.5 rounded-[7px] text-xs font-semibold flex items-center justify-center transition-all cursor-pointer ${
                                style.textAlign === "left"
                                  ? "bg-[#8B5CF6] text-white shadow-sm"
                                  : "text-[#9086A3] hover:text-[#F3EFFA] hover:bg-[#1B1327]"
                              }`}
                              title="Align Left"
                            >
                              <AlignLeft className="w-3.5 h-3.5" />
                            </button>
                            <button
                              type="button"
                              onClick={() => setStyle({ ...style, textAlign: "center" })}
                              className={`py-1.5 rounded-[7px] text-xs font-semibold flex items-center justify-center transition-all cursor-pointer ${
                                (!style.textAlign || style.textAlign === "center")
                                  ? "bg-[#8B5CF6] text-white shadow-sm"
                                  : "text-[#9086A3] hover:text-[#F3EFFA] hover:bg-[#1B1327]"
                              }`}
                              title="Align Center"
                            >
                              <AlignCenter className="w-3.5 h-3.5" />
                            </button>
                            <button
                              type="button"
                              onClick={() => setStyle({ ...style, textAlign: "right" })}
                              className={`py-1.5 rounded-[7px] text-xs font-semibold flex items-center justify-center transition-all cursor-pointer ${
                                style.textAlign === "right"
                                  ? "bg-[#8B5CF6] text-white shadow-sm"
                                  : "text-[#9086A3] hover:text-[#F3EFFA] hover:bg-[#1B1327]"
                              }`}
                              title="Align Right"
                            >
                              <AlignRight className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </div>

                        {/* Words per sentence chunk */}
                        <div className="space-y-1.5">
                          <div className="flex items-center justify-between">
                            <span className="text-[11px] font-bold text-[#9086A3] uppercase tracking-[0.4px]">
                              Words / sentence
                            </span>
                            <span className="text-[11px] font-mono text-[#C084FC] font-semibold">
                              {wordsPerSentence} words
                            </span>
                          </div>
                          <select
                            value={wordsPerSentence}
                            onChange={(e) => {
                              const val = parseInt(e.target.value) || 4;
                              setWordsPerSentence(val);
                              handleApplyFormatting(val, linesPerPart);
                            }}
                            className="w-full bg-[#130D1C] border border-[#2A2036] text-[#F3EFFA] font-sans text-[12.5px] font-semibold p-2 rounded-[10px] outline-none focus:border-[#8B5CF6] cursor-pointer"
                          >
                            <option value={2}>2 words (Short punchy)</option>
                            <option value={3}>3 words</option>
                            <option value={4}>4 words (Standard)</option>
                            <option value={6}>6 words (Medium)</option>
                            <option value={8}>8 words (Longer sentence)</option>
                            <option value={12}>12 words (Full clause)</option>
                          </select>
                        </div>

                        {/* Lines per part */}
                        <div className="space-y-1.5">
                          <div className="flex items-center justify-between">
                            <span className="text-[11px] font-bold text-[#9086A3] uppercase tracking-[0.4px]">
                              Lines / part
                            </span>
                            <span className="text-[11px] font-mono text-[#C084FC] font-semibold">
                              {linesPerPart} {linesPerPart === 1 ? "line" : "lines"}
                            </span>
                          </div>
                          <select
                            value={linesPerPart}
                            onChange={(e) => {
                              const val = parseInt(e.target.value) || 1;
                              setLinesPerPart(val);
                              handleApplyFormatting(wordsPerSentence, val);
                            }}
                            className="w-full bg-[#130D1C] border border-[#2A2036] text-[#F3EFFA] font-sans text-[12.5px] font-semibold p-2 rounded-[10px] outline-none focus:border-[#8B5CF6] cursor-pointer"
                          >
                            <option value={1}>1 line (Reels / TikTok style)</option>
                            <option value={2}>2 lines (Standard subtitle)</option>
                            <option value={3}>3 lines (Detailed paragraph)</option>
                          </select>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Right Column: Visual Styling Controls (Position, Font, Color, Background) */}
                  <div className="space-y-4">
                    {/* Position and Size */}
                    <div className="bg-[#1B1327] border border-[#2A2036] rounded-[14px] p-4 space-y-3.5">
                      <div className="font-cairo font-extrabold text-[13.5px] text-[#F3EFFA] flex items-center gap-1.5 pb-0.5">
                        <Eye className="w-3.5 h-3.5 text-[#C084FC]" />
                        <span>Position & Sizing</span>
                      </div>

                      {/* Position X & Y */}
                      <div className="grid grid-cols-2 gap-2.5">
                        <div className="bg-[#130D1C] border border-[#2A2036] rounded-[10px] p-2.5 flex items-center gap-1.5">
                          <label className="text-[11px] text-[#6C6280] font-bold">X</label>
                          <input
                            type="number"
                            id="posX"
                            min="0"
                            max="100"
                            value={style.posX}
                            onChange={(e) =>
                              setStyle({ ...style, posX: parseInt(e.target.value) || 0 })
                            }
                            className="bg-transparent border-none text-[#F3EFFA] font-sans text-[13px] font-semibold w-full outline-none"
                          />
                          <span className="text-[10.5px] text-[#6C6280]">%</span>
                        </div>

                        <div className="bg-[#130D1C] border border-[#2A2036] rounded-[10px] p-2.5 flex items-center gap-1.5">
                          <label className="text-[11px] text-[#6C6280] font-bold">Y</label>
                          <input
                            type="number"
                            id="posY"
                            min="0"
                            max="100"
                            value={style.posY}
                            onChange={(e) =>
                              setStyle({ ...style, posY: parseInt(e.target.value) || 0 })
                            }
                            className="bg-transparent border-none text-[#F3EFFA] font-sans text-[13px] font-semibold w-full outline-none"
                          />
                          <span className="text-[10.5px] text-[#6C6280]">%</span>
                        </div>
                      </div>

                      {/* Font Size */}
                      <div className="space-y-1.5">
                        <div className="flex items-center justify-between">
                          <span className="text-[11px] font-bold text-[#9086A3] uppercase tracking-[0.4px]">
                            Font Size
                          </span>
                          <span className="text-[11px] font-mono text-[#C084FC] font-semibold">
                            {style.fontSize}px
                          </span>
                        </div>
                        <input
                          type="range"
                          min="12"
                          max="48"
                          value={style.fontSize}
                          onChange={(e) =>
                            setStyle({ ...style, fontSize: parseInt(e.target.value) || 20 })
                          }
                          className="w-full h-1.5 bg-[#2A2036] rounded-lg appearance-none cursor-pointer accent-[#8B5CF6]"
                        />
                      </div>
                    </div>

                    {/* Font & Color */}
                    <div className="bg-[#1B1327] border border-[#2A2036] rounded-[14px] p-4 space-y-3.5">
                      <div className="font-cairo font-extrabold text-[13.5px] text-[#F3EFFA] flex items-center gap-1.5 pb-0.5">
                        <svg
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="2"
                          className="w-3.5 h-3.5 text-[#C084FC]"
                        >
                          <path d="M4 7V4h16v3M9 20h6M12 4v16" />
                        </svg>
                        <span>Font & Colors</span>
                      </div>

                      {/* Font Family Dropdown */}
                      <div className="space-y-1.5">
                        <span className="text-[11px] font-bold text-[#9086A3] uppercase tracking-[0.4px] block">
                          Font family
                        </span>
                        <select
                          id="fontFamily"
                          value={style.fontFamily}
                          onChange={(e) => setStyle({ ...style, fontFamily: e.target.value })}
                          className="w-full bg-[#130D1C] border border-[#2A2036] text-[#F3EFFA] font-sans text-[13px] font-semibold p-2.5 rounded-[10px] outline-none focus:border-[#8B5CF6] cursor-pointer"
                        >
                          {AVAILABLE_FONTS.map((f) => (
                            <option key={f.value} value={f.value} className="bg-[#130D1C] text-[#F3EFFA]">
                              {f.name}
                            </option>
                          ))}
                        </select>
                      </div>

                      {/* Text Color Swatch + Hex */}
                      <div className="space-y-1.5">
                        <span className="text-[11px] font-bold text-[#9086A3] uppercase tracking-[0.4px] block">
                          Text color
                        </span>
                        <div className="flex items-center gap-2.5">
                          <input
                            type="color"
                            id="textColor"
                            value={style.textColor}
                            onChange={(e) => setStyle({ ...style, textColor: e.target.value })}
                            className="w-[36px] h-[36px] rounded-[9px] border-[1.5px] border-[#2A2036] p-0.5 cursor-pointer bg-transparent shrink-0"
                          />
                          <input
                            type="text"
                            id="textColorHex"
                            value={style.textColor.toUpperCase()}
                            onChange={(e) => {
                              const val = e.target.value;
                              if (/^#[0-9A-Fa-f]{0,6}$/.test(val)) {
                                setStyle({ ...style, textColor: val });
                              }
                            }}
                            className="flex-1 bg-[#130D1C] border border-[#2A2036] rounded-[10px] p-2 text-[#F3EFFA] text-[12px] font-mono outline-none focus:border-[#8B5CF6]"
                          />
                        </div>
                      </div>

                      <hr className="border-none border-t border-[#2A2036] my-2" />

                      {/* Background Box Switch */}
                      <div className="flex items-center justify-between">
                        <span className="text-[11px] font-bold text-[#9086A3] uppercase tracking-[0.4px]">
                          Background box
                        </span>
                        <div
                          id="bgSwitch"
                          onClick={() =>
                            setStyle({ ...style, backgroundEnabled: !style.backgroundEnabled })
                          }
                          className={`w-9 h-5 rounded-full relative cursor-pointer transition-colors duration-150 shrink-0 ${
                            style.backgroundEnabled ? "bg-[#8B5CF6]" : "bg-[#2A2036]"
                          }`}
                        >
                          <div
                            className={`w-4 h-4 rounded-full bg-white absolute top-0.5 transition-all duration-150 ${
                              style.backgroundEnabled ? "left-[18px]" : "left-0.5"
                            }`}
                          />
                        </div>
                      </div>

                      {/* Background Color & Opacity Controls */}
                      <div
                        id="bgControls"
                        className={`space-y-3 transition-opacity duration-150 ${
                          style.backgroundEnabled ? "opacity-100" : "opacity-35 pointer-events-none"
                        }`}
                      >
                        <div className="flex items-center gap-2.5">
                          <input
                            type="color"
                            id="bgColor"
                            value={style.backgroundColor}
                            onChange={(e) =>
                              setStyle({ ...style, backgroundColor: e.target.value })
                            }
                            className="w-[36px] h-[36px] rounded-[9px] border-[1.5px] border-[#2A2036] p-0.5 cursor-pointer bg-transparent shrink-0"
                          />
                          <input
                            type="text"
                            id="bgColorHex"
                            value={style.backgroundColor.toUpperCase()}
                            onChange={(e) => {
                              const val = e.target.value;
                              if (/^#[0-9A-Fa-f]{0,6}$/.test(val)) {
                                setStyle({ ...style, backgroundColor: val });
                              }
                            }}
                            className="flex-1 bg-[#130D1C] border border-[#2A2036] rounded-[10px] p-2 text-[#F3EFFA] text-[12px] font-mono outline-none focus:border-[#8B5CF6]"
                          />
                        </div>

                        <div className="flex items-center gap-2.5 pt-0.5">
                          <input
                            type="range"
                            id="bgOpacity"
                            min="0"
                            max="100"
                            value={Math.round(style.backgroundOpacity * 100)}
                            onChange={(e) =>
                              setStyle({
                                ...style,
                                backgroundOpacity: parseInt(e.target.value) / 100,
                              })
                            }
                            className="flex-1 h-1.5 bg-[#2A2036] rounded-lg appearance-none cursor-pointer accent-[#8B5CF6]"
                          />
                          <span className="text-[11px] text-[#9086A3] w-9 text-right font-mono">
                            {Math.round(style.backgroundOpacity * 100)}%
                          </span>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Bottom Section: Dynamic Subtitles Editor (Interactive Segment & Timeline Editor) */}
                <div className="pt-2">
                  <DynamicSubtitleEditor
                    segments={segments}
                    onChangeSegments={(newSegments) => setSegments(newSegments)}
                    currentTime={currentTime}
                    onSeek={handleSeek}
                    wordsPerSentence={wordsPerSentence}
                    linesPerPart={linesPerPart}
                    onApplyFormatting={() => handleApplyFormatting(wordsPerSentence, linesPerPart)}
                  />
                </div>

                {/* Bottom Action Footer */}
                <div className="flex items-center justify-between pt-4 border-t border-[#2A2036]">
                  <button
                    type="button"
                    onClick={() => setCurrentStep(1)}
                    className="bg-[#1B1327] hover:text-[#F3EFFA] text-[#9086A3] border border-[#2A2036] font-bold text-[14px] py-3.5 px-6 rounded-[11px] transition-colors cursor-pointer"
                  >
                    Back to Upload
                  </button>
                  <button
                    type="button"
                    onClick={() => setCurrentStep(3)}
                    className="bg-gradient-to-r from-[#8B5CF6] to-[#7C3AED] hover:brightness-110 text-white font-bold text-[14px] py-3.5 px-8 rounded-[11px] shadow-[0_8px_22px_rgba(139,92,246,0.32)] flex items-center gap-2 transition-all cursor-pointer"
                  >
                    <span>Continue to Export</span>
                    <span>→</span>
                  </button>
                </div>
              </div>
            )}

            {/* ========================================================
                STEP 3: EXPORT
                ======================================================== */}
            {currentStep === 3 && (
              <div id="panel-3" className="space-y-6 animate-in fade-in duration-200">
                {!isExportDone ? (
                  <div id="exportForm" className="space-y-6">
                    <div>
                      <h2 className="font-cairo font-extrabold text-[21px] text-[#F3EFFA] mb-1">
                        Export
                      </h2>
                      <p className="text-[#9086A3] text-[13.5px] leading-relaxed">
                        Get a subtitle file to import, or a finished video with subtitles burned in.
                      </p>
                    </div>

                    {/* Subtitle File vs Video with subtitles Toggle */}
                    <div className="flex gap-2 bg-[#1B1327] border border-[#2A2036] rounded-[12px] p-1">
                      <button
                        type="button"
                        onClick={() => {
                          setExportType("subtitle");
                          setExportFormat("SRT");
                        }}
                        className={`flex-1 font-bold text-[13.5px] py-2.5 px-2 rounded-[9px] cursor-pointer flex items-center justify-center gap-2 transition-all ${
                          exportType === "subtitle"
                            ? "bg-[#8B5CF6] text-white shadow-md"
                            : "bg-transparent text-[#9086A3] hover:text-[#F3EFFA]"
                        }`}
                      >
                        <FileCode className="w-4 h-4" />
                        <span>Subtitle file</span>
                      </button>

                      <button
                        type="button"
                        onClick={() => {
                          setExportType("video");
                          setExportFormat("MP4");
                        }}
                        className={`flex-1 font-bold text-[13.5px] py-2.5 px-2 rounded-[9px] cursor-pointer flex items-center justify-center gap-2 transition-all ${
                          exportType === "video"
                            ? "bg-[#8B5CF6] text-white shadow-md"
                            : "bg-transparent text-[#9086A3] hover:text-[#F3EFFA]"
                        }`}
                      >
                        <Video className="w-4 h-4" />
                        <span>Video with subtitles</span>
                      </button>
                    </div>

                    {/* Format Chips */}
                    {exportType === "subtitle" ? (
                      <div className="flex gap-2.5 flex-wrap">
                        {["SRT", "VTT", "JSON"].map((fmt) => (
                          <div
                            key={fmt}
                            onClick={() => setExportFormat(fmt)}
                            className={`flex-1 min-w-[80px] text-center border-[1.5px] rounded-[11px] py-3.5 px-2 cursor-pointer font-bold text-[13.5px] transition-all ${
                              exportFormat === fmt
                                ? "border-[#8B5CF6] bg-[rgba(139,92,246,0.14)] text-[#F3EFFA]"
                                : "border-[#2A2036] bg-[#1B1327] text-[#9086A3] hover:text-[#F3EFFA]"
                            }`}
                          >
                            .{fmt}
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div className="flex gap-2.5 flex-wrap">
                        {["MP4", "MOV"].map((fmt) => (
                          <div
                            key={fmt}
                            onClick={() => setExportFormat(fmt)}
                            className={`flex-1 min-w-[80px] text-center border-[1.5px] rounded-[11px] py-3.5 px-2 cursor-pointer font-bold text-[13.5px] transition-all ${
                              exportFormat === fmt
                                ? "border-[#8B5CF6] bg-[rgba(139,92,246,0.14)] text-[#F3EFFA]"
                                : "border-[#2A2036] bg-[#1B1327] text-[#9086A3] hover:text-[#F3EFFA]"
                            }`}
                          >
                            .{fmt}
                          </div>
                        ))}
                      </div>
                    )}

                    {/* Summary Box */}
                    <div className="bg-[#1B1327] border border-[#2A2036] rounded-[12px] p-3.5 sm:p-4 text-[12.5px] text-[#9086A3] leading-relaxed">
                      <b className="text-[#F3EFFA]">{audioFile ? audioFile.name : "recording.mp3"}</b> · hybrid Algerian Darija script · custom style, positioned at{" "}
                      <b className="text-[#F3EFFA]">
                        {style.posX}%, {style.posY}%
                      </b>{" "}
                      · works in Premiere, CapCut, DaVinci & YouTube.
                    </div>

                    {/* Actions: Back & Download */}
                    <div className="flex gap-2.5 pt-2">
                      <button
                        type="button"
                        onClick={() => setCurrentStep(2)}
                        className="bg-[#1B1327] hover:text-[#F3EFFA] text-[#9086A3] border border-[#2A2036] font-bold text-[14px] py-3.5 px-5 rounded-[11px] transition-colors cursor-pointer"
                      >
                        Back
                      </button>
                      <button
                        type="button"
                        onClick={handleDownload}
                        className="flex-1 bg-gradient-to-r from-[#8B5CF6] to-[#7C3AED] hover:brightness-110 text-white font-bold text-[14px] py-3.5 px-4 rounded-[11px] shadow-[0_8px_22px_rgba(139,92,246,0.32)] flex items-center justify-center gap-2 transition-all cursor-pointer"
                      >
                        Download
                      </button>
                    </div>
                  </div>
                ) : (
                  /* Done State */
                  <div id="doneState" className="py-2 space-y-5 animate-in fade-in duration-200">
                    {/* Top small back arrow button to return to export options */}
                    <div className="flex items-center justify-between pb-2 border-b border-[#2A2036]">
                      <button
                        type="button"
                        onClick={() => setIsExportDone(false)}
                        className="inline-flex items-center gap-2 text-[12.5px] font-semibold text-[#C084FC] hover:text-[#F3EFFA] bg-[#1B1327] hover:bg-[#2A2036] border border-[#2A2036] px-3 py-1.5 rounded-[9px] transition-all cursor-pointer shadow-sm group"
                        title="Back to export options"
                      >
                        <ArrowLeft className="w-3.5 h-3.5 transition-transform group-hover:-translate-x-0.5" />
                        <span>Back to export options</span>
                      </button>
                      <span className="text-[11px] text-[#6C6280] font-mono">
                        .{exportFormat.toLowerCase()}
                      </span>
                    </div>

                    <div className="text-center space-y-4 py-2">
                      <div className="w-[52px] h-[52px] rounded-full bg-[rgba(52,211,153,0.14)] flex items-center justify-center mx-auto shadow-[0_0_20px_rgba(52,211,153,0.15)]">
                        <Check className="w-6 h-6 text-[#34D399]" />
                      </div>
                      <div>
                        <div className="font-cairo font-extrabold text-[19px] text-[#F3EFFA] mb-1">
                          Downloaded successfully
                        </div>
                        <div className="text-[13px] text-[#9086A3]">
                          <span className="text-[#F3EFFA] font-semibold">
                            {audioFile ? audioFile.name.replace(/\.[^/.]+$/, "") : "recording"}.
                            {exportFormat.toLowerCase()}
                          </span>{" "}
                          has been saved to your device.
                        </div>
                      </div>
                    </div>

                    <div className="flex flex-col sm:flex-row gap-2.5 pt-2">
                      <button
                        type="button"
                        onClick={() => setIsExportDone(false)}
                        className="flex-1 bg-[#1B1327] hover:bg-[#2A2036] text-[#F3EFFA] border border-[#2A2036] font-bold text-[13px] py-3 px-4 rounded-[11px] flex items-center justify-center gap-2 transition-colors cursor-pointer"
                      >
                        <ArrowLeft className="w-3.5 h-3.5 text-[#C084FC]" />
                        <span>Export again or change format</span>
                      </button>
                      <button
                        type="button"
                        onClick={handleStartOver}
                        className="flex-1 bg-[#130D1C] hover:bg-[#1B1327] hover:text-[#F3EFFA] text-[#9086A3] border border-[#2A2036] font-bold text-[13px] py-3 px-4 rounded-[11px] transition-colors cursor-pointer"
                      >
                        Transcribe another file
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Footnote */}
          <div className="text-center text-[11.5px] text-[#6C6280] mt-5">
            No account needed for this preview · your file stays on this device
          </div>
        </div>
      </main>

      {/* API Key Modal */}
      <ApiKeyModal
        isOpen={isKeyModalOpen}
        onClose={() => setIsKeyModalOpen(false)}
        currentKey={geminiApiKey}
        onSave={handleSaveGeminiKey}
        userEmail={currentUser?.email || undefined}
      />
    </div>
  );
}
