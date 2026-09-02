import ReactMarkdown from 'react-markdown';
import { motion } from 'framer-motion';
import { Bot, User as UserIcon } from 'lucide-react';
import { ChatMessageResponse } from '../../types';
import { CitationCard } from './CitationCard';
import AnimationPlayer from '../AnimationPlayer';
import P5Renderer from '../P5Renderer';

const markdownComponents = {
  code({ className, children, ...props }: any) {
    const lang = className?.replace('language-', '') || '';

    // Declarative animation engine support
    if (lang === 'animation-spec') {
      const raw = String(children).trim();
      try {
        const sanitized = raw.replace(
          /"((?:[^"\\]|\\.)*)"/g,
          (_match, inner: string) =>
            '"' + inner.replace(/\n/g, '\\n').replace(/\r/g, '').replace(/\t/g, '\\t') + '"'
        );
        const spec = JSON.parse(sanitized);
        return <AnimationPlayer spec={spec} />;
      } catch (e) {
        console.error('[AnimationPlayer] Parse error:', e);
        return (
          <pre className="text-xs text-red-500 p-2 bg-red-50 dark:bg-red-950/40 rounded border border-red-200 dark:border-red-900 overflow-auto">
            {raw}
          </pre>
        );
      }
    }

    if (lang === 'p5js') {
      return <P5Renderer code={String(children).trim()} />;
    }

    return (
      <code className="bg-stone-200/60 dark:bg-stone-700/60 px-1 py-0.5 rounded text-[12px] font-mono" {...props}>
        {children}
      </code>
    );
  },
  p: ({ children }: any) => <p className="mb-2 last:mb-0 leading-relaxed">{children}</p>,
  ul: ({ children }: any) => <ul className="list-disc pl-4 mb-2 space-y-1">{children}</ul>,
  ol: ({ children }: any) => <ol className="list-decimal pl-4 mb-2 space-y-1">{children}</ol>,
  li: ({ children }: any) => <li className="leading-relaxed">{children}</li>,
  h1: ({ children }: any) => <h1 className="text-base font-bold mb-2 mt-3 text-stone-900 dark:text-stone-100">{children}</h1>,
  h2: ({ children }: any) => <h2 className="text-sm font-bold mb-1.5 mt-2.5 text-stone-900 dark:text-stone-100">{children}</h2>,
  h3: ({ children }: any) => <h3 className="text-xs font-bold mb-1 mt-2 text-stone-900 dark:text-stone-100">{children}</h3>,
  blockquote: ({ children }: any) => (
    <blockquote className="border-l-2 border-[#fa5d19] pl-3 py-0.5 my-2 italic text-stone-600 dark:text-stone-300">
      {children}
    </blockquote>
  ),
  strong: ({ children }: any) => <strong className="font-semibold text-stone-900 dark:text-stone-100">{children}</strong>,
  table: ({ children }: any) => (
    <div className="overflow-x-auto my-2">
      <table className="min-w-full text-xs border border-stone-200 dark:border-stone-700 divide-y divide-stone-200 dark:divide-stone-700">
        {children}
      </table>
    </div>
  ),
  th: ({ children }: any) => (
    <th className="bg-stone-200/50 dark:bg-stone-700/50 px-2 py-1 text-left font-semibold">{children}</th>
  ),
  td: ({ children }: any) => (
    <td className="px-2 py-1 border-t border-stone-200 dark:border-stone-700">{children}</td>
  ),
};

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
              {isUser ? (
                <div className="whitespace-pre-wrap leading-relaxed font-sans text-[13px]">
                  {msg.content}
                </div>
              ) : (
                <div className="text-[13px] leading-relaxed font-sans prose prose-xs dark:prose-invert max-w-none">
                  <ReactMarkdown components={markdownComponents}>
                    {msg.content}
                  </ReactMarkdown>
                </div>
              )}

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
            <span className="ml-1 text-xs text-stone-500 font-mono">Analyzing with AI Assistant...</span>
          </div>
        </div>
      )}
    </div>
  );
};
