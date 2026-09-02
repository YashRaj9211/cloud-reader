import React, { useState } from 'react';
import {
  BookOpen,
  Sparkles,
  Search,
  ArrowRight,
  ShieldAlert,
  Sun,
  Moon,
  CheckCircle2,
  Lock,
  Layers,
  FileText,
  Zap,
} from 'lucide-react';
import { useAppStore } from '../store';
import { Button } from './ui/Button';

export const SignInScreen: React.FC = () => {
  const { darkMode, toggleDarkMode, authError, login } = useAppStore();
  const [activeScreen, setActiveScreen] = useState<'welcome' | 'signin'>('signin');

  return (
    <div className="min-h-screen w-full flex items-center justify-center p-0 sm:p-6 md:p-10 bg-[#f4ebd0] dark:bg-[#121212] transition-colors duration-300 font-sans selection:bg-[#fa5d19]/20">
      {/* Theme Toggle in top corner */}
      <div className="fixed top-4 right-4 z-50">
        <button
          onClick={toggleDarkMode}
          className="p-2.5 rounded-full bg-white/80 dark:bg-stone-800/80 backdrop-blur-md shadow-md border border-stone-200/60 dark:border-stone-700/60 text-stone-700 dark:text-stone-200 hover:scale-105 transition-all cursor-pointer"
          title={darkMode ? 'Switch to Light Mode' : 'Switch to Dark Mode'}
        >
          {darkMode ? <Sun size={18} /> : <Moon size={18} />}
        </button>
      </div>

      {/* Main Container / Mobile Device Mockup Frame */}
      <div className="w-full max-w-md sm:max-w-md md:max-w-4xl min-h-screen sm:min-h-[720px] md:min-h-[640px] bg-transparent sm:bg-white sm:dark:bg-stone-900 sm:rounded-[36px] sm:shadow-2xl sm:border sm:border-stone-200/80 sm:dark:border-stone-800 overflow-hidden flex flex-col md:flex-row relative">
        
        {/* ========================================================================= */}
        {/* Left / Top Hero Visual Section (Warm accent brand area with curved cards) */}
        {/* ========================================================================= */}
        <div className="relative w-full md:w-5/12 bg-gradient-to-br from-[#fa5d19] via-[#f7520e] to-[#e44200] text-white p-8 sm:p-10 flex flex-col justify-between overflow-hidden shrink-0 min-h-[300px] md:min-h-full">
          {/* Subtle decorative curved background shapes matching reference */}
          <div className="absolute -top-16 -right-16 w-48 h-48 rounded-full bg-white/10 blur-2xl pointer-events-none" />
          <div className="absolute -bottom-12 -left-12 w-48 h-48 rounded-full bg-black/10 blur-2xl pointer-events-none" />
          
          {/* Top Brand Tag */}
          <div className="flex items-center justify-between relative z-10">
            <div className="flex items-center gap-3">
              <div className="w-11 h-11 rounded-2xl bg-white text-[#fa5d19] shadow-lg flex items-center justify-center">
                <BookOpen size={24} className="stroke-[2.5]" />
              </div>
              <div>
                <span className="text-xl font-extrabold tracking-tight block leading-none text-white">
                  CloudReader
                </span>
                <span className="text-[10px] font-semibold tracking-widest uppercase opacity-80 mt-1 block">
                  Smart AI Library
                </span>
              </div>
            </div>
          </div>

          {/* Center Brand / Punchline */}
          <div className="my-6 md:my-auto relative z-10">
            <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-white/15 backdrop-blur-md text-white text-xs font-medium mb-3 border border-white/20">
              <Zap size={13} className="fill-white" />
              <span>Next-Gen Document Reader</span>
            </div>
            <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-white leading-tight">
              Read smarter, find instantly, chat with your library.
            </h1>
            <p className="text-xs sm:text-sm text-white/80 mt-2.5 leading-relaxed font-normal">
              Organize research, analyze books with AI, and navigate citations seamlessly across all your devices.
            </p>
          </div>

          {/* Feature Badges for Desktop & Tablet */}
          <div className="hidden sm:grid grid-cols-2 gap-2 pt-4 border-t border-white/15 relative z-10">
            <div className="flex items-center gap-2 text-xs text-white/90">
              <CheckCircle2 size={14} className="text-white shrink-0" />
              <span>AI Page Citations</span>
            </div>
            <div className="flex items-center gap-2 text-xs text-white/90">
              <CheckCircle2 size={14} className="text-white shrink-0" />
              <span>Vector Search (⌘K)</span>
            </div>
            <div className="flex items-center gap-2 text-xs text-white/90">
              <CheckCircle2 size={14} className="text-white shrink-0" />
              <span>Cloud Sync</span>
            </div>
            <div className="flex items-center gap-2 text-xs text-white/90">
              <CheckCircle2 size={14} className="text-white shrink-0" />
              <span>Smart Notes & Ink</span>
            </div>
          </div>

          {/* Decorative curve at bottom on mobile to transition seamlessly */}
          <div className="block md:hidden absolute -bottom-6 left-0 right-0 h-10 bg-white dark:bg-stone-900 rounded-t-[32px]" />
        </div>

        {/* ========================================================================= */}
        {/* Right / Bottom Interactive Content Section (Mobile Sheet Style)          */}
        {/* ========================================================================= */}
        <div className="flex-1 bg-white dark:bg-stone-900 p-6 sm:p-10 flex flex-col justify-center relative z-10 rounded-t-[32px] md:rounded-none -mt-4 md:mt-0">
          
          <div className="max-w-md w-full mx-auto space-y-6">
            
            {/* Header / Greeting */}
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <h2 className="text-2xl sm:text-3xl font-extrabold text-stone-900 dark:text-stone-50 tracking-tight">
                  Sign In
                </h2>
                <span className="text-xs font-semibold text-[#fa5d19] bg-[#fa5d19]/10 px-2.5 py-1 rounded-full">
                  Fast & Secure
                </span>
              </div>
              <p className="text-xs sm:text-sm text-stone-500 dark:text-stone-400 leading-relaxed">
                Connect your account to access your documents, notes, and AI workspace.
              </p>
            </div>

            {/* Error Message */}
            {authError && (
              <div className="p-3.5 rounded-2xl border border-red-500/20 bg-red-500/10 text-xs text-red-600 dark:text-red-400 flex items-center gap-2.5 animate-shake">
                <ShieldAlert size={16} className="shrink-0" />
                <p className="font-medium">{authError}</p>
              </div>
            )}

            {/* Main Auth Actions (Card Style like Reference Image) */}
            <div className="space-y-3.5 pt-2">
              {/* Primary Google Login Button with Modern Card Feel */}
              <button
                onClick={login}
                className="w-full group flex items-center justify-between p-4 rounded-2xl bg-stone-50 dark:bg-stone-800/90 hover:bg-stone-100 dark:hover:bg-stone-800 border border-stone-200 dark:border-stone-700 shadow-sm hover:shadow-md hover:border-[#fa5d19]/40 transition-all duration-200 cursor-pointer text-left"
              >
                <div className="flex items-center gap-3.5 min-w-0">
                  <div className="w-10 h-10 rounded-xl bg-white shadow-xs flex items-center justify-center shrink-0 border border-stone-100 dark:border-stone-700">
                    <svg
                      version="1.1"
                      xmlns="http://www.w3.org/2000/svg"
                      viewBox="0 0 48 48"
                      className="w-5 h-5"
                    >
                      <path
                        fill="#EA4335"
                        d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"
                      />
                      <path
                        fill="#4285F4"
                        d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"
                      />
                      <path
                        fill="#FBBC05"
                        d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"
                      />
                      <path
                        fill="#34A853"
                        d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"
                      />
                    </svg>
                  </div>
                  <div>
                    <div className="text-sm font-bold text-stone-900 dark:text-stone-100 group-hover:text-[#fa5d19] transition-colors">
                      Continue with Google
                    </div>
                    <div className="text-[11px] text-stone-400">
                      Access cloud library & sync notes
                    </div>
                  </div>
                </div>

                <div className="w-8 h-8 rounded-full bg-stone-100 dark:bg-stone-700/80 group-hover:bg-[#fa5d19] text-stone-400 group-hover:text-white flex items-center justify-center transition-all">
                  <ArrowRight size={15} />
                </div>
              </button>

              {/* Action Button: Get Started */}
              <Button
                onClick={login}
                size="lg"
                className="w-full py-3.5 font-bold text-sm rounded-2xl shadow-lg hover:shadow-[#fa5d19]/20"
              >
                Sign In to Workspace
              </Button>
            </div>

            {/* Feature Highlights Strip */}
            <div className="pt-4 border-t border-stone-100 dark:border-stone-800 grid grid-cols-3 gap-3 text-center">
              <div className="p-2 rounded-xl bg-stone-50 dark:bg-stone-800/50">
                <Sparkles size={16} className="text-[#fa5d19] mx-auto mb-1" />
                <span className="text-[10px] font-semibold text-stone-700 dark:text-stone-300 block">AI Reading</span>
                <span className="text-[9px] text-stone-400">Instant answers</span>
              </div>
              <div className="p-2 rounded-xl bg-stone-50 dark:bg-stone-800/50">
                <Search size={16} className="text-[#fa5d19] mx-auto mb-1" />
                <span className="text-[10px] font-semibold text-stone-700 dark:text-stone-300 block">Deep Search</span>
                <span className="text-[9px] text-stone-400">Exact page links</span>
              </div>
              <div className="p-2 rounded-xl bg-stone-50 dark:bg-stone-800/50">
                <Layers size={16} className="text-[#fa5d19] mx-auto mb-1" />
                <span className="text-[10px] font-semibold text-stone-700 dark:text-stone-300 block">Drive Sync</span>
                <span className="text-[9px] text-stone-400">Always updated</span>
              </div>
            </div>

            {/* Privacy & Security Note */}
            <div className="text-center pt-2">
              <p className="text-[11px] text-stone-400 inline-flex items-center gap-1.5 font-medium">
                <Lock size={12} className="text-stone-400" />
                <span>Your documents and notes are securely encrypted.</span>
              </p>
            </div>

          </div>
        </div>
      </div>
    </div>
  );
};

export default SignInScreen;