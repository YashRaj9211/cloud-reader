import React, { useEffect } from 'react';
import { Flame, ShieldAlert, Sparkles, FolderTree as FolderTreeIcon, Search } from 'lucide-react';
import { useAppStore } from '../store';
import { Button } from './ui/Button';

export const SignInScreen: React.FC = () => {
  const { darkMode, toggleDarkMode, authError, login } = useAppStore();

  return (
    <div className="min-h-screen w-screen flex flex-col items-center justify-center p-4 sm:p-6 transition-colors duration-300 bg-stone-50 dark:bg-stone-950 text-stone-900 dark:text-stone-100 relative overflow-hidden font-sans">
      {/* Subtle heat ambient glow in corner */}
      <div className="absolute -top-40 -right-40 w-72 sm:w-96 h-72 sm:h-96 bg-[#fa5d19]/10 rounded-full blur-3xl pointer-events-none" />
      <div className="absolute -bottom-40 -left-40 w-72 sm:w-96 h-72 sm:h-96 bg-[#fa5d19]/5 rounded-full blur-3xl pointer-events-none" />

      <div className="absolute top-4 right-4 sm:top-8 sm:right-8">
        <Button
          variant="outline"
          size="sm"
          onClick={toggleDarkMode}
        >
          {darkMode ? '☀️ Light' : '🌙 Dark'}
        </Button>
      </div>

      <div className="w-full max-w-md p-6 sm:p-8 rounded-2xl border border-stone-200 dark:border-stone-800 bg-white/80 dark:bg-stone-900/80 text-center shadow-xl backdrop-blur-md z-10">
        <div className="inline-flex p-3.5 rounded-2xl bg-[#fa5d19]/10 text-[#fa5d19] mb-4 shadow-sm">
          <Flame size={36} />
        </div>
        <h2 className="text-xl sm:text-2xl font-bold tracking-tight mb-2 text-stone-900 dark:text-stone-50">
          Cloud PDF Sync & AI Reader
        </h2>
        <p className="text-xs sm:text-sm text-stone-500 dark:text-stone-400 mb-6">
          Cloud-native PDF reader with real-time vector indexing, Google ADK RAG Assistant, and Google Drive sync.
        </p>

        <div className="text-left space-y-3 mb-8 px-1 sm:px-2">
          {[
            [
              'Google Drive Directories',
              'Organize textbooks and papers in nested folders synced with your cloud drive.',
              <FolderTreeIcon key="f" className="w-3.5 h-3.5" />,
            ],
            [
              'Google ADK RAG Assistant',
              'Grounded chat assistant with interactive citations jumping right to the referenced page.',
              <Sparkles key="s" className="w-3.5 h-3.5" />,
            ],
            [
              'ChromaDB Semantic Search',
              'Global vector search (Cmd+K) querying chunks and excerpts across your entire library.',
              <Search key="q" className="w-3.5 h-3.5" />,
            ],
          ].map(([title, desc, icon]) => (
            <div key={title as string} className="flex items-start gap-3 text-xs leading-relaxed">
              <span className="p-1 rounded-md bg-[#fa5d19]/10 text-[#fa5d19] font-bold shrink-0 mt-0.5">
                {icon}
              </span>
              <div>
                <strong className="block font-medium text-stone-900 dark:text-stone-200">
                  {title}
                </strong>
                <span className="text-stone-500 dark:text-stone-400">{desc}</span>
              </div>
            </div>
          ))}
        </div>

        {authError && (
          <div className="mb-5 p-3.5 rounded-xl border border-red-500/20 bg-red-500/10 text-xs text-red-600 dark:text-red-400 flex items-center gap-2">
            <ShieldAlert size={16} className="shrink-0" />
            <p className="text-left font-medium">{authError}</p>
          </div>
        )}

        <Button
          onClick={login}
          className="w-full py-3 px-4 text-sm font-semibold shadow-md rounded-xl"
          leftIcon={
            <svg version="1.1" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 48" className="w-5 h-5 bg-white p-0.5 rounded-full">
              <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z" />
              <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z" />
              <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z" />
              <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z" />
            </svg>
          }
        >
          Connect Google Account
        </Button>

        <p className="text-[10px] text-stone-400 mt-4 font-mono">
          Secure OAuth token authorization &bull; Direct Google Drive API sync
        </p>
      </div>
    </div>
  );
};

export default SignInScreen;