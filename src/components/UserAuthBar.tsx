/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from "react";
import { User } from "firebase/auth";
import {
  Key,
  LogOut,
  Sparkles,
  History,
  CheckCircle2,
  AlertTriangle,
  FolderOpen,
  ChevronDown,
  Clock,
  FileText,
} from "lucide-react";
import { signInWithGoogle, signOutUser } from "../firebase";

interface UserAuthBarProps {
  user: User | null;
  geminiApiKey: string;
  onOpenKeyModal: () => void;
  savedHistory: any[];
  onLoadProject: (project: any) => void;
}

export const UserAuthBar: React.FC<UserAuthBarProps> = ({
  user,
  geminiApiKey,
  onOpenKeyModal,
  savedHistory,
  onLoadProject,
}) => {
  const [isSigningIn, setIsSigningIn] = useState(false);
  const [showHistoryDropdown, setShowHistoryDropdown] = useState(false);

  const handleSignIn = async () => {
    try {
      setIsSigningIn(true);
      await signInWithGoogle();
    } catch (err: any) {
      console.error("Google sign in error:", err);
      // If popup was closed by user, don't show alarming error
    } finally {
      setIsSigningIn(false);
    }
  };

  const handleSignOut = async () => {
    try {
      await signOutUser();
    } catch (err) {
      console.error("Sign out error:", err);
    }
  };

  return (
    <div className="flex items-center gap-2 sm:gap-3">
      {/* Saved History (when signed in and has history) */}
      {user && (
        <div className="relative">
          <button
            onClick={() => setShowHistoryDropdown(!showHistoryDropdown)}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-slate-800/80 hover:bg-slate-800 border border-slate-700/80 text-slate-300 hover:text-white transition-all shadow-sm"
            title="Saved Cloud Transcriptions"
          >
            <History className="w-3.5 h-3.5 text-indigo-400" />
            <span className="hidden md:inline">Cloud History</span>
            <span className="bg-indigo-900/60 text-indigo-300 px-1.5 py-0.2 rounded text-[10px]">
              {savedHistory.length}
            </span>
            <ChevronDown className="w-3 h-3 text-slate-400" />
          </button>

          {showHistoryDropdown && (
            <div className="absolute right-0 mt-2 w-72 sm:w-80 bg-slate-900 border border-slate-700 rounded-xl p-3 shadow-2xl z-40 space-y-2">
              <div className="flex items-center justify-between border-b border-slate-800 pb-2">
                <span className="text-xs font-semibold text-slate-200 flex items-center gap-1.5">
                  <FolderOpen className="w-3.5 h-3.5 text-indigo-400" />
                  Saved Transcriptions
                </span>
                <span className="text-[10px] text-slate-400">{savedHistory.length} saved</span>
              </div>
              {savedHistory.length === 0 ? (
                <p className="text-xs text-slate-500 py-3 text-center">No transcriptions saved yet.</p>
              ) : (
                <div className="max-h-60 overflow-y-auto space-y-1.5 pr-1">
                  {savedHistory.map((item) => (
                    <button
                      key={item.id}
                      onClick={() => {
                        onLoadProject(item);
                        setShowHistoryDropdown(false);
                      }}
                      className="w-full text-left p-2 rounded-lg bg-slate-950/60 hover:bg-indigo-950/40 border border-slate-800 hover:border-indigo-800/60 transition-all text-xs group"
                    >
                      <div className="font-medium text-slate-200 truncate group-hover:text-indigo-300">
                        {item.audioName || "Untitled Recording"}
                      </div>
                      <div className="flex items-center justify-between text-[10px] text-slate-400 mt-1">
                        <span className="flex items-center gap-1">
                          <FileText className="w-3 h-3 text-slate-500" />
                          {item.segments?.length || 0} segments
                        </span>
                        <span className="flex items-center gap-1">
                          <Clock className="w-3 h-3 text-slate-500" />
                          {item.audioDuration ? `${Math.round(item.audioDuration)}s` : "0s"}
                        </span>
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* Gemini API Key Button / Status Indicator */}
      <button
        onClick={onOpenKeyModal}
        className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-medium border transition-all ${
          geminiApiKey
            ? "bg-emerald-950/30 border-emerald-800/60 text-emerald-300 hover:bg-emerald-900/40 hover:border-emerald-700"
            : "bg-amber-950/30 border-amber-800/60 text-amber-300 hover:bg-amber-900/40 hover:border-amber-700 animate-pulse"
        }`}
      >
        <Key className="w-3.5 h-3.5 shrink-0" />
        <span className="hidden sm:inline">
          {geminiApiKey ? "Personal Key Active" : "Add Gemini Key"}
        </span>
        {geminiApiKey ? (
          <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
        ) : (
          <AlertTriangle className="w-3.5 h-3.5 text-amber-400 shrink-0" />
        )}
      </button>

      {/* Google User Authentication */}
      {user ? (
        <div className="flex items-center gap-2 bg-slate-800/80 border border-slate-700/80 rounded-xl p-1 sm:pr-2">
          {user.photoURL ? (
            <img
              src={user.photoURL}
              alt={user.displayName || "User"}
              className="w-7 h-7 rounded-lg border border-slate-600 object-cover"
            />
          ) : (
            <div className="w-7 h-7 rounded-lg bg-gradient-to-tr from-violet-600 to-indigo-600 text-white font-bold flex items-center justify-center text-xs">
              {(user.displayName || user.email || "U").charAt(0).toUpperCase()}
            </div>
          )}
          <span className="hidden lg:inline text-xs font-medium text-slate-200 max-w-[120px] truncate">
            {user.displayName || user.email?.split("@")[0]}
          </span>
          <button
            onClick={handleSignOut}
            title="Sign Out"
            className="p-1 text-slate-400 hover:text-rose-400 hover:bg-slate-700/60 rounded-md transition-colors"
          >
            <LogOut className="w-3.5 h-3.5" />
          </button>
        </div>
      ) : (
        <button
          onClick={handleSignIn}
          disabled={isSigningIn}
          className="flex items-center gap-2 px-3 py-1.5 bg-gradient-to-r from-violet-600 to-indigo-600 hover:from-violet-500 hover:to-indigo-500 text-white text-xs font-semibold rounded-lg shadow-md shadow-violet-900/20 transition-all active:scale-95 disabled:opacity-50"
        >
          {/* Google G SVG */}
          <svg className="w-3.5 h-3.5" viewBox="0 0 24 24">
            <path
              fill="#ffffff"
              d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
            />
            <path
              fill="#ffffff"
              d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
            />
            <path
              fill="#ffffff"
              d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"
            />
            <path
              fill="#ffffff"
              d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"
            />
          </svg>
          <span className="hidden sm:inline">Google Login</span>
        </button>
      )}
    </div>
  );
};
