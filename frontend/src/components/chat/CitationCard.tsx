import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Bookmark, ChevronDown, ChevronRight, ExternalLink } from 'lucide-react';
import { SourceCitation } from '../../types';

export interface CitationCardProps {
  citation: SourceCitation;
  onJumpToPage: (pageNumber: number, documentId?: string) => void;
}

export const CitationCard: React.FC<CitationCardProps> = ({
  citation,
  onJumpToPage,
}) => {
  const [expanded, setExpanded] = useState(false);

  const matchPercent = citation.relevance_score
    ? Math.round(citation.relevance_score * 100)
    : null;

  return (
    <div className="rounded-lg border border-stone-200 dark:border-stone-800 bg-stone-50 dark:bg-stone-900/60 p-2.5 text-xs transition-colors hover:border-stone-300 dark:hover:border-stone-700">
      <div className="flex items-center justify-between gap-2">
        <button
          type="button"
          onClick={() => onJumpToPage(citation.page_number, citation.document_id)}
          className="flex items-center gap-1.5 font-semibold text-[#fa5d19] hover:underline cursor-pointer group text-left truncate"
        >
          <Bookmark className="w-3.5 h-3.5 shrink-0" />
          <span className="truncate">
            {citation.document_name || 'Document'} · Page {citation.page_number}
          </span>
          <ExternalLink className="w-3 h-3 opacity-0 group-hover:opacity-100 transition-opacity shrink-0" />
        </button>

        <div className="flex items-center gap-1.5 shrink-0">
          {matchPercent !== null && (
            <span className="px-1.5 py-0.5 rounded text-[10px] font-mono bg-stone-200 dark:bg-stone-800 text-stone-700 dark:text-stone-300">
              {matchPercent}% match
            </span>
          )}
          <button
            type="button"
            onClick={() => setExpanded(!expanded)}
            className="text-stone-400 hover:text-stone-600 dark:hover:text-stone-200 p-0.5"
            aria-label="Toggle citation text"
          >
            {expanded ? (
              <ChevronDown className="w-3.5 h-3.5" />
            ) : (
              <ChevronRight className="w-3.5 h-3.5" />
            )}
          </button>
        </div>
      </div>

      <AnimatePresence initial={false}>
        {expanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="overflow-hidden"
          >
            <div className="mt-2 pt-2 border-t border-stone-200 dark:border-stone-800 text-stone-600 dark:text-stone-300 font-mono text-[11px] leading-relaxed bg-white/50 dark:bg-stone-950/40 p-2 rounded">
              "{citation.content}"
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};
