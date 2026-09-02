import React from 'react';
import { motion } from 'framer-motion';
import { Bot, User as UserIcon } from 'lucide-react';
import { ChatMessageResponse } from '../../types';
import { CitationCard } from './CitationCard';

export interface ChatMessageListProps {
  messages: ChatMessageResponse[];
  loading?: boolean;
  onJumpToPage: (pageNumber: number, documentId?: string) => void;
  onPromptClick?: (prompt: string) => void;
}

export const ChatMessageList: React.FC<ChatMessageListProps> = ({
  messages,
  loading = false,
  onJumpToPage,
  onPromptClick,
}) => {
  const suggestedPrompts = [
    'Summarize this document',
    'What are the key findings?',
    'Explain the methodology used',
    'Extract all data tables and metrics',
  ];

  if (messages.length === 0 && !loading) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center p-6 text-center text-stone-500 dark:text-stone-400">
        <div className="w-12 h-12 rounded-2xl bg-[#fa5d19]/10 text-[#fa5d19] flex items-center justify-center mb-3">
          <Bot className="w-6 h-6" />
        </div>
        <h4 className="font-semibold text-stone-900 dark:text-stone-100 mb-1">
          Scoped AI Assistant
        </h4>
        <p className="text-xs text-stone-500 dark:text-stone-400 max-w-xs mb-5">
          Ask questions grounded by indexed chunks with exact page citations and vector similarity.
        </p>

        {onPromptClick && (
          <div className="flex flex-col gap-2 w-full max-w-xs text-left">
            <span className="text-[11px] font-semibold uppercase tracking-wider text-stone-400">
              Suggested Prompts
            </span>
            {suggestedPrompts.map((prompt) => (
              <button
                key={prompt}
                onClick={() => onPromptClick(prompt)}
                className="text-xs px-3 py-2 rounded-lg bg-stone-100 hover:bg-stone-200 dark:bg-stone-800 dark:hover:bg-stone-700 text-stone-700 dark:text-stone-200 text-left transition-colors border border-stone-200/60 dark:border-stone-700/60"
              >
                "{prompt}"
              </button>
            ))}
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-y-auto p-4 space-y-4">
      {messages.map((msg, index) => {
        const isUser = msg.role === 'USER';

        return (
          <motion.div
            key={msg.id || index}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            className={`flex gap-3 ${isUser ? 'justify-end' : 'justify-start'}`}
          >
            {!isUser && (
              <div className="w-7 h-7 rounded-full bg-[#fa5d19]/10 text-[#fa5d19] flex items-center justify-center shrink-0 mt-0.5">
                <Bot className="w-4 h-4" />
              </div>
            )}

            <div
              className={`max-w-[85%] rounded-xl p-3.5 text-sm ${
                isUser
                  ? 'bg-[#fa5d19] text-white rounded-br-none shadow-sm'
                  : 'bg-stone-100 dark:bg-stone-800 text-stone-900 dark:text-stone-100 rounded-bl-none border border-stone-200/80 dark:border-stone-700/80'
              }`}
            >
              <div className="whitespace-pre-wrap leading-relaxed font-sans text-[13px]">
                {msg.content}
              </div>

              {/* Render sources citations for assistant messages if present */}
              {msg.sources && msg.sources.length > 0 && (
                <div className="mt-3 pt-2.5 border-t border-stone-200 dark:border-stone-700/80 space-y-2">
                  <div className="text-[11px] font-semibold uppercase tracking-wider text-stone-500 dark:text-stone-400">
                    Sources & Citations
                  </div>
                  <div className="space-y-1.5">
                    {msg.sources.map((src, sIdx) => (
                      <CitationCard
                        key={`${src.document_id}-${src.page_number}-${sIdx}`}
                        citation={src}
                        onJumpToPage={onJumpToPage}
                      />
                    ))}
                  </div>
                </div>
              )}
            </div>

            {isUser && (
              <div className="w-7 h-7 rounded-full bg-stone-200 dark:bg-stone-700 text-stone-700 dark:text-stone-200 flex items-center justify-center shrink-0 mt-0.5">
                <UserIcon className="w-4 h-4" />
              </div>
            )}
          </motion.div>
        );
      })}

      {loading && (
        <div className="flex gap-3 items-center text-stone-400 text-xs">
          <div className="w-7 h-7 rounded-full bg-[#fa5d19]/10 text-[#fa5d19] flex items-center justify-center shrink-0">
            <Bot className="w-4 h-4 animate-pulse" />
          </div>
          <div className="bg-stone-100 dark:bg-stone-800 border border-stone-200 dark:border-stone-700 px-3.5 py-2.5 rounded-xl rounded-bl-none flex items-center gap-1.5">
            <span className="w-1.5 h-1.5 rounded-full bg-[#fa5d19] animate-bounce" />
            <span className="w-1.5 h-1.5 rounded-full bg-[#fa5d19] animate-bounce [animation-delay:0.2s]" />
            <span className="w-1.5 h-1.5 rounded-full bg-[#fa5d19] animate-bounce [animation-delay:0.4s]" />
            <span className="ml-1 text-xs text-stone-500 font-mono">Thinking with ADK RAG...</span>
          </div>
        </div>
      )}
    </div>
  );
};
