import React from 'react';
import { Sparkles, AlertCircle, RefreshCw } from 'lucide-react';
import { DocumentProcessingResponse } from '../../types';
import { Spinner } from '../ui/Spinner';

export interface IndexingProgressBarProps {
  status?: DocumentProcessingResponse;
  onStartIndexing?: () => void;
}

export const IndexingProgressBar: React.FC<IndexingProgressBarProps> = ({
  status,
  onStartIndexing,
}) => {
  if (!status) {
    return (
      <button
        onClick={onStartIndexing}
        className="flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-stone-100 dark:bg-stone-800 text-stone-700 dark:text-stone-300 hover:bg-[#fa5d19]/15 hover:text-[#fa5d19] transition-colors border border-stone-200 dark:border-stone-700"
      >
        <Sparkles className="w-3.5 h-3.5 text-[#fa5d19]" />
        <span>Index for AI</span>
      </button>
    );
  }

  if (status.status === 'PROCESSING' || status.status === 'UPLOADED') {
    const percent =
      status.total_chunks > 0
        ? Math.min(100, Math.round((status.processed_chunks / status.total_chunks) * 100))
        : 15;

    return (
      <div className="flex items-center gap-2 text-xs bg-[#fa5d19]/10 border border-[#fa5d19]/25 text-[#fa5d19] px-2.5 py-1 rounded-full">
        <Spinner size="sm" />
        <span className="font-semibold">Indexing {percent}%</span>
        <div className="w-12 bg-[#fa5d19]/20 h-1.5 rounded-full overflow-hidden">
          <div
            className="bg-[#fa5d19] h-full transition-all duration-300 rounded-full"
            style={{ width: `${percent}%` }}
          />
        </div>
      </div>
    );
  }

  if (status.status === 'INDEXED') {
    return (
      <div className="flex items-center gap-1 text-xs text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800/40 px-2 py-0.5 rounded-full">
        <Sparkles className="w-3 h-3" />
        <span className="font-medium">AI Ready</span>
      </div>
    );
  }

  if (status.status === 'FAILED') {
    return (
      <div className="flex items-center gap-1 text-xs text-rose-600 dark:text-rose-400 bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-800/40 px-2 py-0.5 rounded-full">
        <AlertCircle className="w-3 h-3" />
        <span>Failed</span>
        {onStartIndexing && (
          <button
            onClick={onStartIndexing}
            className="ml-1 text-rose-700 dark:text-rose-300 underline font-medium hover:text-rose-800"
          >
            Retry
          </button>
        )}
      </div>
    );
  }

  return null;
};
