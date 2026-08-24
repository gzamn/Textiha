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
  onSaveKey: (key: string) => Promise<boolean | void>;
  userEmail?: string;
}

export const ApiKeyModal: React.FC<ApiKeyModalProps> = ({
  isOpen,
  onClose,
  currentKey,
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
      // Test key via validation endpoint
      const response = await fetch("/api/validate-key", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ apiKey: trimmed }),
      });

      const data = await response.json();
      if (!response.ok || !data.valid) {
        throw new Error(data.error || "Failed to validate Gemini API key.");
      }

      setTestResult({
        status: "success",
        message: "API Key verified successfully with Gemini 2.5 Flash!",
      });

      await onSaveKey(trimmed);
      setTimeout(() => {
        onClose();
      }, 900);
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
    await onSaveKey("");
    setTestResult({
      status: "idle",
      message: "Key removed.",
    });
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-md animate-in fade-in duration-200">
      <div className="relative w-full max-w-lg bg-slate-900 border border-slate-700/80 rounded-2xl p-6 sm:p-8 shadow-2xl space-y-6">
        {/* Close Button */}
        <button
          onClick={onClose}
          className="absolute top-4 right-4 text-slate-400 hover:text-slate-200 hover:bg-slate-800 rounded-lg p-1.5 transition-colors"
        >
          <X className="w-5 h-5" />
        </button>

        {/* Header */}
        <div className="flex items-center gap-3">
          <div className="p-3 bg-violet-600/20 text-violet-400 border border-violet-500/30 rounded-xl">
            <Key className="w-6 h-6" />
          </div>
          <div>
            <h2 className="text-xl font-bold text-slate-100 flex items-center gap-2">
              Gemini API Key Settings
            </h2>
            <p className="text-xs sm:text-sm text-slate-400">
              Use your personal Gemini quota for unlimited fast transcription
            </p>
          </div>
        </div>

        {/* Instructions & Link */}
        <div className="bg-slate-950/60 border border-slate-800/80 rounded-xl p-4 space-y-2">
          <p className="text-xs text-slate-300 leading-relaxed">
            Get your own free Gemini API key from Google AI Studio. It takes less than 30 seconds:
          </p>
          <a
            href="https://aistudio.google.com/app/apikey"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 text-xs font-semibold text-violet-400 hover:text-violet-300 underline underline-offset-2 transition-colors"
          >
            <span>Get a Free Key at Google AI Studio</span>
            <ExternalLink className="w-3.5 h-3.5" />
          </a>
        </div>

        {/* Input */}
        <div className="space-y-2">
          <label className="block text-xs font-medium text-slate-300">
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
              className="w-full bg-slate-950 border border-slate-700/80 focus:border-violet-500 focus:ring-1 focus:ring-violet-500 rounded-xl px-4 py-3 text-sm text-slate-100 placeholder-slate-500 font-mono pr-10 outline-none transition-colors"
            />
            <button
              type="button"
              onClick={() => setShowKey(!showKey)}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-200"
            >
              {showKey ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
            </button>
          </div>
          {userEmail && (
            <p className="text-[11px] text-slate-400 flex items-center gap-1">
              <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
              Synced securely to your Google account ({userEmail})
            </p>
          )}
        </div>

        {/* Test Result Message */}
        {testResult.status === "success" && (
          <div className="flex items-center gap-2 p-3 bg-emerald-950/40 border border-emerald-800/60 rounded-xl text-emerald-300 text-xs">
            <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-400" />
            <span>{testResult.message}</span>
          </div>
        )}
        {testResult.status === "error" && (
          <div className="flex items-center gap-2 p-3 bg-rose-950/40 border border-rose-800/60 rounded-xl text-rose-300 text-xs">
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
              className="px-3 py-2 text-xs font-medium text-rose-400 hover:text-rose-300 hover:bg-rose-950/40 rounded-lg transition-colors"
            >
              Remove Key
            </button>
          ) : <div />}

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2.5 text-xs font-medium text-slate-300 hover:text-white bg-slate-800 hover:bg-slate-700 rounded-xl transition-colors"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleTestAndSave}
              disabled={isTesting || !apiKey.trim()}
              className="px-5 py-2.5 text-xs font-semibold text-white bg-gradient-to-r from-violet-600 to-indigo-600 hover:from-violet-500 hover:to-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed rounded-xl shadow-lg shadow-violet-900/30 flex items-center gap-2 transition-all"
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
