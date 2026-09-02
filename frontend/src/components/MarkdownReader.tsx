import React, { useState } from 'react';
import { Copy, Check, FileText, Sparkles, BookOpen } from 'lucide-react';
import { Button } from './ui/Button';

export interface MarkdownReaderProps {
  markdown: string | null;
  isLoading?: boolean;
  bookTitle?: string;
  onStartIndexing?: () => void;
}

export const MarkdownReader: React.FC<MarkdownReaderProps> = ({
  markdown,
  isLoading = false,
  bookTitle,
  onStartIndexing,
}) => {
  const [copied, setCopied] = useState(false);

  const handleCopy = () => {
    if (!markdown) return;
    navigator.clipboard.writeText(markdown);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  if (isLoading) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center p-8 text-stone-500">
        <div className="animate-spin rounded-full h-8 w-8 border-2 border-[#fa5d19] border-t-transparent mb-3" />
        <p className="text-sm font-medium">Extracting parsed Markdown document...</p>
      </div>
    );
  }

  if (!markdown) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center p-8 text-center max-w-md mx-auto">
        <div className="w-12 h-12 rounded-2xl bg-[#fa5d19]/10 text-[#fa5d19] flex items-center justify-center mb-3">
          <BookOpen className="w-6 h-6" />
        </div>
        <h3 className="text-base font-semibold text-stone-900 dark:text-stone-100 mb-1">
          No Markdown Extracted Yet
        </h3>
        <p className="text-xs text-stone-500 dark:text-stone-400 mb-5">
          This document has not been parsed into structured Markdown. Run the AI pipeline to extract headers, formulas, and text.
        </p>
        {onStartIndexing && (
          <Button onClick={onStartIndexing} leftIcon={<Sparkles className="w-4 h-4" />}>
            Index for AI & Extract Markdown
          </Button>
        )}
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col h-full bg-white dark:bg-stone-900 overflow-hidden">
      {/* Top action bar */}
      <div className="px-6 py-3 border-b border-stone-200 dark:border-stone-800 flex items-center justify-between bg-stone-50/60 dark:bg-stone-950/40">
        <div className="flex items-center gap-2">
          <FileText className="w-4 h-4 text-[#fa5d19]" />
          <span className="font-semibold text-xs text-stone-800 dark:text-stone-200 truncate">
            {bookTitle || 'Document'} · Parsed Markdown
          </span>
        </div>
        <Button
          variant="outline"
          size="xs"
          onClick={handleCopy}
          leftIcon={copied ? <Check className="w-3.5 h-3.5 text-emerald-500" /> : <Copy className="w-3.5 h-3.5" />}
        >
          {copied ? 'Copied' : 'Copy All'}
        </Button>
      </div>

      {/* Markdown Content Viewer */}
      <div className="flex-1 overflow-y-auto p-6 sm:p-10 max-w-3xl mx-auto w-full prose dark:prose-invert font-sans leading-relaxed text-sm text-stone-800 dark:text-stone-200">
        <div className="whitespace-pre-wrap font-mono text-xs sm:text-[13px] bg-stone-50 dark:bg-stone-950/50 p-6 rounded-2xl border border-stone-200 dark:border-stone-800 overflow-x-auto">
          {markdown}
        </div>
      </div>
    </div>
  );
};
