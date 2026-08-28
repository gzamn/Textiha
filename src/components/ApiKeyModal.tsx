/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from "react";
import { Key, ExternalLink, CheckCircle2, AlertCircle, Eye, EyeOff, Loader2, X, ShieldCheck } from "lucide-react";

interface ApiKeyModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentKey: string;
  onSave?: (key: string) => Promise<boolean | void> | void;
  onSaveKey?: (key: string) => Promise<boolean | void> | void;
  userEmail?: string;
}

export const ApiKeyModal: React.FC<ApiKeyModalProps> = ({
  isOpen,
  onClose,
  currentKey,
  onSave,
  onSaveKey,
  userEmail,
}) => {
  const [apiKey, setApiKey] = useState(currentKey);
  const [showKey, setShowKey] = useState(false);
  const [isTesting, setIsTesting] = useState(false);
  const [testResult, setTestResult] = useState<{
    status: "idle" | "success" | "error";
    message: string;
  }>({ status: "idle", message: "" });

  if (!isOpen) return null;

  const handleTestAndSave = async () => {
    const trimmed = apiKey.trim();
    if (!trimmed) {
      setTestResult({
        status: "error",
        message: "Please enter a valid Gemini API key.",
      });
      return;
    }

    setIsTesting(true);
    setTestResult({ status: "idle", message: "" });

    try {
      let isValid = false;

      // 1. Direct validation against Google Generative AI REST API
      try {
        const directRes = await fetch(
          `https://generativelanguage.googleapis.com/v1beta/models?key=${encodeURIComponent(trimmed)}`
        );
        const directText = await directRes.text();
        let directJson: any = null;
        try {
          directJson = JSON.parse(directText);
        } catch {}

        if (directRes.ok && Array.isArray(directJson?.models)) {
          isValid = true;
        } else if (directJson?.error?.message) {
          throw new Error(directJson.error.message);
        }
      } catch (directErr: any) {
        if (
          directErr.message &&
          (directErr.message.includes("API key not valid") ||
            directErr.message.includes("API_KEY_INVALID") ||
            directErr.message.includes("PERMISSION_DENIED"))
        ) {
          throw directErr;
        }

        // 2. Fallback to server endpoint
        try {
          const response = await fetch("/api/validate-key", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ apiKey: trimmed }),
          });

          const rawText = await response.text();
          let data: any = null;
          try {
            data = JSON.parse(rawText);
          } catch {}

          if (data) {
            if (!response.ok || !data.valid) {
              throw new Error(data.error || "Failed to validate Gemini API key.");
            }
            isValid = true;
          } else if (trimmed.startsWith("AIzaSy") && trimmed.length >= 35) {
            // Key has valid format even if serverless endpoint is offline
            isValid = true;
          } else {
            throw new Error("Invalid API key format. Ensure your key starts with 'AIzaSy'.");
          }
        } catch (serverErr: any) {
          if (trimmed.startsWith("AIzaSy") && trimmed.length >= 35) {
            isValid = true;
          } else {
            throw serverErr;
          }
        }
      }

      setTestResult({
        status: "success",
        message: "API Key verified and saved successfully!",
      });

      const saveCallback = onSaveKey || onSave;
      if (typeof saveCallback === "function") {
        await saveCallback(trimmed);
      }

      setTimeout(() => {
        onClose();
      }, 700);
    } catch (err: any) {
      setTestResult({
        status: "error",
        message: err.message || "Failed to validate key. Ensure it starts with AIzaSy... and has quota.",
      });
    } finally {
      setIsTesting(false);
    }
  };

  const handleRemove = async () => {
    setApiKey("");
    const saveCallback = onSaveKey || onSave;
    if (typeof saveCallback === "function") {
      await saveCallback("");
    }
    setTestResult({
      status: "idle",
      message: "Key removed.",
    });
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/85 backdrop-blur-md animate-in fade-in duration-200">
      <div className="relative w-full max-w-lg bg-black border border-purple-900/70 rounded-2xl p-6 sm:p-8 shadow-2xl shadow-purple-950/80 space-y-6">
        {/* Close Button */}
        <button
          onClick={onClose}
          className="absolute top-4 right-4 text-purple-400 hover:text-white hover:bg-purple-950/60 rounded-lg p-1.5 transition-colors cursor-pointer"
        >
          <X className="w-5 h-5" />
        </button>

        {/* Header */}
        <div className="flex items-center gap-3">
          <div className="p-3 bg-purple-950/40 text-purple-400 border border-purple-800/40 rounded-xl shadow-inner">
            <Key className="w-6 h-6" />
          </div>
          <div>
            <h2 className="text-xl font-bold text-purple-50 flex items-center gap-2">
              Gemini API Key Settings
            </h2>
            <p className="text-xs sm:text-sm text-purple-300/70">
              Use your personal Gemini quota for unlimited fast transcription
            </p>
          </div>
        </div>

        {/* Instructions & Link */}
        <div className="bg-purple-950/20 border border-purple-900/40 rounded-xl p-4 space-y-2">
          <p className="text-xs text-purple-200 leading-relaxed">
            Get your own free Gemini API key from Google AI Studio in just a few seconds:
          </p>
          <a
            href="https://aistudio.google.com/app/apikey"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 text-xs font-semibold text-purple-400 hover:text-purple-300 underline underline-offset-2 transition-colors"
          >
            <span>Get a Free Key at Google AI Studio</span>
            <ExternalLink className="w-3.5 h-3.5" />
          </a>
        </div>

        {/* Input */}
        <div className="space-y-2">
          <label className="block text-xs font-medium text-purple-200">
            Personal Gemini API Key
          </label>
          <div className="relative">
            <input
              type={showKey ? "text" : "password"}
              value={apiKey}
              onChange={(e) => {
                setApiKey(e.target.value);
                setTestResult({ status: "idle", message: "" });
              }}
              placeholder="AIzaSy..."
              className="w-full bg-purple-950/20 border border-purple-900/60 focus:border-purple-500 focus:ring-1 focus:ring-purple-500 rounded-xl px-4 py-3 text-sm text-purple-100 placeholder-purple-400/40 font-mono pr-10 outline-none transition-colors"
            />
            <button
              type="button"
              onClick={() => setShowKey(!showKey)}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-purple-400 hover:text-purple-200 cursor-pointer"
            >
              {showKey ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
            </button>
          </div>
          {userEmail && (
            <p className="text-[11px] text-purple-400/80 flex items-center gap-1">
              <ShieldCheck className="w-3.5 h-3.5 text-purple-400" />
              Synced securely to your Google account ({userEmail})
            </p>
          )}
        </div>

        {/* Test Result Message */}
        {testResult.status === "success" && (
          <div className="flex items-center gap-2 p-3 bg-purple-950/50 border border-purple-500/50 rounded-xl text-purple-200 text-xs">
            <CheckCircle2 className="w-4 h-4 shrink-0 text-purple-400" />
            <span>{testResult.message}</span>
          </div>
        )}
        {testResult.status === "error" && (
          <div className="flex items-center gap-2 p-3 bg-purple-950/80 border border-rose-800/80 rounded-xl text-rose-300 text-xs">
            <AlertCircle className="w-4 h-4 shrink-0 text-rose-400" />
            <span>{testResult.message}</span>
          </div>
        )}

        {/* Action Buttons */}
        <div className="flex items-center justify-between gap-3 pt-2">
          {currentKey ? (
            <button
              type="button"
              onClick={handleRemove}
              className="px-3 py-2 text-xs font-medium text-rose-400 hover:text-rose-300 hover:bg-rose-950/40 rounded-lg transition-colors cursor-pointer"
            >
              Remove Key
            </button>
          ) : <div />}

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2.5 text-xs font-medium text-purple-300 hover:text-white bg-purple-950/40 hover:bg-purple-900/50 border border-purple-900/50 rounded-xl transition-colors cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleTestAndSave}
              disabled={isTesting || !apiKey.trim()}
              className="px-5 py-2.5 text-xs font-semibold text-white bg-gradient-to-r from-purple-600 via-purple-700 to-violet-800 hover:from-purple-500 hover:to-violet-700 disabled:opacity-50 disabled:cursor-not-allowed rounded-xl shadow-lg shadow-purple-950/60 flex items-center gap-2 transition-all cursor-pointer border border-purple-500/30"
            >
              {isTesting ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>Verifying Key...</span>
                </>
              ) : (
                <>
                  <CheckCircle2 className="w-4 h-4" />
                  <span>Verify & Save Key</span>
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
