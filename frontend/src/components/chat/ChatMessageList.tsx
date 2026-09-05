import ReactMarkdown from 'react-markdown';
import { motion } from 'framer-motion';
import { Bot, User as UserIcon, PlayCircle, Sliders, FileText, Download, ExternalLink } from 'lucide-react';
import { ChatMessageResponse } from '../../types';
import { CitationCard } from './CitationCard';
import AnimationPlayer from '../AnimationPlayer';
import P5Renderer from '../P5Renderer';
import { useAppStore } from '../../store';

const API_BASE = import.meta.env.VITE_API_URL ?? 'http://localhost:4001';

function downloadPdfBase64(base64Data: string, filename: string) {
  try {
    const byteCharacters = atob(base64Data);
    const byteNumbers = new Uint8Array(byteCharacters.length);
    for (let i = 0; i < byteCharacters.length; i++) {
      byteNumbers[i] = byteCharacters.charCodeAt(i);
    }
    const blob = new Blob([byteNumbers], { type: 'application/pdf' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename.endsWith('.pdf') ? filename : `${filename}.pdf`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  } catch (err) {
    console.error('Failed to download PDF:', err);
  }
}

function openPdfBase64(base64Data: string) {
  try {
    const byteCharacters = atob(base64Data);
    const byteNumbers = new Uint8Array(byteCharacters.length);
    for (let i = 0; i < byteCharacters.length; i++) {
      byteNumbers[i] = byteCharacters.charCodeAt(i);
    }
    const blob = new Blob([byteNumbers], { type: 'application/pdf' });
    const url = URL.createObjectURL(blob);
    window.open(url, '_blank');
  } catch (err) {
    console.error('Failed to open PDF:', err);
  }
}

const markdownComponents = {
  code({ className, children, ...props }: any) {
    const rawLang = className?.replace(/^language-/, '').trim().toLowerCase() || '';
    const codeStr = String(children).trim();

    // Declarative animation engine support
    if (rawLang === 'animation-spec') {
      try {
        const sanitized = codeStr.replace(
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
            {codeStr}
          </pre>
        );
      }
    }

    // p5.js script detection (supports ```p5js, ```p5, ```p5.js, ```html containing p5/canvas, or javascript with setup/draw)
    const isHtmlSketch =
      (rawLang === 'html' || rawLang === 'htm' || rawLang === 'xml') &&
      (/p5(?:\.min)?\.js/i.test(codeStr) ||
        /createCanvas|function\s+setup/i.test(codeStr) ||
        /<canvas/i.test(codeStr));

    const isFullHtmlDoc = /<!DOCTYPE\s+html|<html[\s>]/i.test(codeStr);

    const isP5 =
      rawLang === 'p5js' ||
      rawLang === 'p5' ||
      rawLang === 'p5.js' ||
      isHtmlSketch ||
      isFullHtmlDoc ||
      ((rawLang === 'javascript' || rawLang === 'js' || !rawLang) &&
        (/function\s+setup\s*\(|setup\s*=\s*(?:function|\()/.test(codeStr) || /createCanvas\s*\(/.test(codeStr)) &&
        (/function\s+draw\s*\(|draw\s*=\s*(?:function|\()/.test(codeStr) || /background\s*\(/.test(codeStr)));

    if (isP5) {
      return <P5Renderer code={codeStr} />;
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
    '🎨 Animate the main concept with p5.js',
    '📝 Generate PDF study notes on this topic',
    'Summarize this document',
    'What are the key findings?',
    '🎬 Create an interactive simulation of this topic',
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
                    {/* If raw <!DOCTYPE html> ... </html> is present outside a code block, wrap it in ```p5js so it renders */}
                    {/(?:<!DOCTYPE\s+html|<html[\s>])/i.test(msg.content) && !msg.content.includes('```p5js') && !msg.content.includes('```html')
                      ? msg.content.replace(
                          /(<!DOCTYPE\s+html[\s\S]*?<\/html>|<html[\s\S]*?<\/html>)/gi,
                          '\n```p5js\n$1\n```\n'
                        )
                      : msg.content}
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

              {/* PDF Notes Download Card */}
              {!isUser && (() => {
                const pdfObj = msg.generated_pdf;
                const pdfMatch = !pdfObj && (
                  msg.content.match(/\[(?:📄\s*)?Download PDF Notes[:\s]*([^\]]+)\]\(([\/][^)]+\.pdf[^)]*)\)/i) ||
                  msg.content.match(/\[([^\]]+)\]\(([\/]api[\/]notes[\/]generated[\/][^)]+)\)/i)
                );

                if (!pdfObj && !pdfMatch) return null;

                const noteTitle = pdfObj?.title || (pdfMatch ? pdfMatch[1]?.replace(/📄\s*/, '').trim() : 'Study Notes');
                const noteSize = pdfObj?.size_bytes ? `${Math.round(pdfObj.size_bytes / 1024)} KB` : 'A4 Format';
                const noteSummary = pdfObj?.summary;
                const legacyUrl = pdfMatch ? (pdfMatch[2].startsWith('http') ? pdfMatch[2] : `${API_BASE}${pdfMatch[2]}`) : null;

                return (
                  <div className="mt-2.5 p-3 rounded-xl bg-stone-50 dark:bg-stone-900/90 border border-emerald-500/30 shadow-xs flex flex-col gap-2">
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex items-center gap-2">
                        <div className="w-7 h-7 rounded-lg bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 flex items-center justify-center shrink-0">
                          <FileText size={16} />
                        </div>
                        <div>
                          <div className="font-semibold text-stone-900 dark:text-stone-100 text-[12px] leading-tight">
                            {noteTitle}
                          </div>
                          <div className="text-[10px] text-stone-500 dark:text-stone-400">
                            AI-Generated PDF Notes • {noteSize}
                          </div>
                        </div>
                      </div>
                      <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[9px] font-semibold bg-emerald-500/15 text-emerald-600 dark:text-emerald-400">
                        PDF READY
                      </span>
                    </div>

                    {noteSummary ? (
                      <p className="text-[11px] text-stone-600 dark:text-stone-300 leading-snug">
                        {noteSummary}
                      </p>
                    ) : (
                      <p className="text-[11px] text-stone-600 dark:text-stone-400 leading-snug">
                        Your study notes are compiled and ready. Download the PDF directly to your device or open it in your browser.
                      </p>
                    )}

                    <div className="flex gap-2">
                      {pdfObj ? (
                        <>
                          <button
                            type="button"
                            onClick={() => downloadPdfBase64(pdfObj.data, pdfObj.filename || `${noteTitle}.pdf`)}
                            className="flex-1 py-1.5 px-2.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 active:scale-[0.98] text-white text-[11px] font-medium flex items-center justify-center gap-1.5 shadow-xs transition-all cursor-pointer border-0"
                          >
                            <Download size={12} />
                            <span>Download PDF</span>
                          </button>
                          <button
                            type="button"
                            onClick={() => openPdfBase64(pdfObj.data)}
                            className="flex-1 py-1.5 px-2.5 rounded-lg bg-stone-200 hover:bg-stone-300 dark:bg-stone-700 dark:hover:bg-stone-600 text-stone-700 dark:text-stone-200 text-[11px] font-medium flex items-center justify-center gap-1.5 transition-colors cursor-pointer border-0"
                          >
                            <ExternalLink size={12} />
                            <span>Open in Browser</span>
                          </button>
                        </>
                      ) : (
                        <>
                          <a
                            href={legacyUrl!}
                            download
                            target="_blank"
                            rel="noreferrer"
                            className="flex-1 py-1.5 px-2.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-[11px] font-medium flex items-center justify-center gap-1.5 shadow-xs transition-colors no-underline"
                          >
                            <Download size={12} />
                            <span>Download PDF</span>
                          </a>
                          <a
                            href={legacyUrl!}
                            target="_blank"
                            rel="noreferrer"
                            className="flex-1 py-1.5 px-2.5 rounded-lg bg-stone-200 hover:bg-stone-300 dark:bg-stone-700 dark:hover:bg-stone-600 text-stone-700 dark:text-stone-200 text-[11px] font-medium flex items-center justify-center gap-1.5 transition-colors no-underline"
                          >
                            <ExternalLink size={12} />
                            <span>Open in Browser</span>
                          </a>
                        </>
                      )}
                    </div>
                  </div>
                );
              })()}

              {/* Stitch Simulation Highlight Banner if message contains animation code */}
              {!isUser &&
                (/```(?:p5js|p5|javascript|js|html)?[\s\S]*?(?:setup\s*\(|createCanvas)/i.test(msg.content) ||
                  /<!DOCTYPE\s+html|<html[\s>]/i.test(msg.content)) && (
                  <div className="mt-2.5 p-3 rounded-xl bg-stone-50 dark:bg-stone-900/90 border border-[#fa5d19]/30 shadow-xs flex flex-col gap-2">
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex items-center gap-2">
                        <div className="w-7 h-7 rounded-lg bg-[#fa5d19]/10 text-[#fa5d19] flex items-center justify-center shrink-0">
                          <PlayCircle size={17} />
                        </div>
                        <div>
                          <div className="font-semibold text-stone-900 dark:text-stone-100 text-[12px] leading-tight">
                            Interactive Concept Simulation
                          </div>
                          <div className="text-[10px] text-stone-500 dark:text-stone-400">
                            On-demand Playground • 60 FPS
                          </div>
                        </div>
                      </div>
                      <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[9px] font-semibold bg-[#fa5d19]/15 text-[#fa5d19]">
                        STUDIO
                      </span>
                    </div>

                    <p className="text-[11px] text-stone-600 dark:text-stone-400 leading-snug">
                      Launch expanded playground over document viewport with parameter sliders & live calculations.
                    </p>

                    <button
                      onClick={() => {
                        const codeBlock =
                          msg.content.match(/```(?:p5js|p5|javascript|js|html)?([\s\S]*?)```/i)?.[1] ||
                          msg.content.match(/(<!DOCTYPE\s+html[\s\S]*?<\/html>|<html[\s\S]*?<\/html>)/i)?.[1] ||
                          msg.content;
                        const titleMatch = msg.content.match(/\/\/\s*(?:Title:|Topic:)?\s*([^\n\r]+)/i);
                        const clean = codeBlock.replace(/^```[a-z]*\n?/i, '').replace(/\n?```$/i, '').trim();

                        useAppStore.getState().setActiveAnimation({
                          code: clean,
                          title: titleMatch ? titleMatch[1].trim() : 'Dynamic Concept Simulation',
                          groundedPage: msg.sources?.[0]?.page_number || 1,
                          sourceDocId: msg.sources?.[0]?.document_id,
                        });
                        useAppStore.getState().setAnimationStudioOpen(true);
                      }}
                      className="w-full py-1.5 px-2.5 rounded-lg bg-[#fa5d19] hover:bg-[#e44e0e] text-white text-[11px] font-medium flex items-center justify-center gap-1.5 shadow-xs transition-colors cursor-pointer"
                    >
                      <Sliders size={13} />
                      <span>Open in Animation Studio ↗</span>
                    </button>
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
