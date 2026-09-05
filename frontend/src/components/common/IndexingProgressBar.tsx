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
  if (!status || status.status === 'UPLOADED' || (status.status as string) === 'NOT_INDEXED') {
    return (
      <button
        onClick={(e) => {
          e.stopPropagation();
          onStartIndexing?.();
        }}
        className="flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-stone-100 dark:bg-stone-800 text-stone-700 dark:text-stone-300 hover:bg-[#fa5d19]/15 hover:text-[#fa5d19] transition-colors border border-stone-200 dark:border-stone-700"
        title="Index document content into vector store for AI search & chat"
      >
        <Sparkles className="w-3.5 h-3.5 text-[#fa5d19]" />
        <span>Index for AI</span>
      </button>
    );
  }

  if (status.status === 'PROCESSING') {
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
      <div className="inline-flex items-center gap-1 text-xs text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800/40 pl-2 pr-1.5 py-0.5 rounded-full group">
        <Sparkles className="w-3 h-3 text-emerald-500" />
        <span className="font-medium">AI Ready</span>
        {onStartIndexing && (
          <button
            onClick={(e) => {
              e.stopPropagation();
              onStartIndexing();
            }}
            title="Re-index document in vector database"
            className="ml-1 p-0.5 rounded hover:bg-emerald-200/50 dark:hover:bg-emerald-800/50 text-emerald-700 dark:text-emerald-300 transition-colors flex items-center gap-0.5 text-[10px] font-medium"
          >
            <RefreshCw className="w-2.5 h-2.5" />
            <span className="opacity-90">Re-index</span>
          </button>
        )}
      </div>
    );
  }

  if (status.status === 'FAILED') {
    return (
      <div 
        className="inline-flex items-center gap-1.5 text-xs text-rose-600 dark:text-rose-400 bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-800/40 pl-2 pr-1.5 py-0.5 rounded-full"
        title={status.error_message || 'Indexing failed or vector index missing'}
      >
        <AlertCircle className="w-3 h-3 text-rose-500 shrink-0" />
        <span className="font-medium">Not Indexed</span>
        {onStartIndexing && (
          <button
            onClick={(e) => {
              e.stopPropagation();
              onStartIndexing();
            }}
            title="Re-index document in vector database"
            className="ml-0.5 px-1.5 py-0.2 rounded bg-rose-200/60 dark:bg-rose-900/60 hover:bg-rose-300/80 dark:hover:bg-rose-800/80 text-rose-800 dark:text-rose-200 transition-colors flex items-center gap-1 text-[10px] font-semibold"
          >
            <RefreshCw className="w-2.5 h-2.5" />
            <span>Re-index</span>
          </button>
        )}
      </div>
    );
  }

  return null;
};

