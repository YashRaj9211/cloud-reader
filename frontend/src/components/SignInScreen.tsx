import { Flame } from 'lucide-react';

interface SignInScreenProps {
  darkMode: boolean;
  setDarkMode: () => void;
  actionError: string | null;
  handleLogin: () => void;
}

export default function SignInScreen({
  darkMode,
  setDarkMode,
  actionError,
  handleLogin,
}: SignInScreenProps) {
  return (
    <div className="min-h-screen w-screen flex flex-col items-center justify-center p-4 sm:p-6 transition-colors duration-300 bg-[var(--color-background)] text-[var(--color-on-background)] relative overflow-hidden">
      {/* Subtle heat ambient glow in corner */}
      <div className="absolute -top-40 -right-40 w-72 sm:w-96 h-72 sm:h-96 bg-[#fa5d19]/10 rounded-full blur-3xl pointer-events-none" />
      <div className="absolute -bottom-40 -left-40 w-72 sm:w-96 h-72 sm:h-96 bg-[#9061ff]/10 rounded-full blur-3xl pointer-events-none" />

      <div className="absolute top-4 right-4 sm:top-8 sm:right-8">
        <button
          onClick={() => setDarkMode(!darkMode)}
          className="btn-secondary text-xs"
        >
          {darkMode ? '☀️ Light' : '🌙 Dark'}
        </button>
      </div>

      <div className="w-full max-w-md p-6 sm:p-8 rounded-2xl border text-center card-surface backdrop-blur-sm z-10">
        <div className="inline-flex p-3 rounded-2xl bg-[#fa5d19]/10 text-[#fa5d19] mb-4 shadow-sm">
          <Flame size={36} />
        </div>
        <h2 className="text-xl sm:text-2xl font-bold tracking-tight mb-2">Cloud PDF Sync Reader</h2>
        <p className="text-xs sm:text-sm text-zinc-500 dark:text-zinc-400 mb-6">
          Read, annotate, and sync highlights and drawings across all devices with Google Drive.
        </p>

        <div className="text-left space-y-3 mb-8 px-1 sm:px-2">
          {[
            ['Google Drive Integration', 'Stores books and annotations directly on your private Drive.'],
            ['Rich Heat-Driven Annotation', 'Freehand ink, precision shapes, highlighters, sticky notes & text.'],
            ['Mobile & Tablet Ready', 'Optimized for touchscreens, continuous scrolling & dark mode.'],
          ].map(([title, desc]) => (
            <div key={title} className="flex items-start gap-3 text-xs leading-relaxed">
              <span className="p-1 rounded-md bg-[#fa5d19]/10 text-[#fa5d19] font-bold">✓</span>
              <div>
                <strong className="block font-medium text-[var(--color-on-surface)]">{title}</strong>
                <span className="text-zinc-500 dark:text-zinc-400">{desc}</span>
              </div>
            </div>
          ))}
        </div>

        {actionError && (
          <div className="mb-4 p-3.5 rounded-xl border border-red-500/20 bg-red-500/5 text-xs text-red-500 flex items-center gap-2">
            <ShieldAlert size={14} className="shrink-0" />
            <p className="text-left">{actionError}</p>
          </div>
        )}

        <button
          onClick={handleLogin}
          className="w-full btn-primary py-3 px-4 text-sm font-semibold shadow-md rounded-xl"
        >
          <svg version="1.1" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 48" className="w-5 h-5 bg-white p-0.5 rounded-full">
            <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z" />
            <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z" />
            <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z" />
            <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z" />
          </svg>
          <span>Sync Google Drive Account</span>
        </button>

        <p className="text-[10px] text-zinc-400 mt-4 font-mono">
          Requires minimum Google Drive API scopes to sync books folder.
        </p>
      </div>
    </div>
  );
}