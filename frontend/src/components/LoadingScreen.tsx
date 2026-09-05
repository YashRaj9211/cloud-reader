import { Flame } from 'lucide-react';

interface LoadingScreenProps {}

export default function LoadingScreen({}: LoadingScreenProps) {
  return (
    <div className="min-h-screen w-screen flex flex-col items-center justify-center gap-4 bg-[#f9f9f9] dark:bg-[#0d0d0d] text-stone-900 dark:text-stone-100">
      <div className="flex items-center gap-3 mb-2 animate-pulse">
        <div className="p-2.5 rounded-xl bg-[#fa5d19]/10 text-[#fa5d19]">
          <Flame size={28} />
        </div>
        <h1 className="text-2xl font-bold tracking-tight text-stone-900 dark:text-stone-100">Cloud PDF</h1>
      </div>
      <div className="animate-spin rounded-full h-8 w-8 border-[3px] border-[#fa5d19] border-t-transparent" />
      <p className="text-xs font-mono text-stone-500 animate-pulse">Synchronizing workspace…</p>
    </div>
  );
}