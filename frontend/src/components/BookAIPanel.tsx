import { useState, useEffect, useRef, useCallback } from 'react';
import {
  Bot, BookOpenText, Zap, RefreshCw, AlertCircle,
  CheckCircle2, Loader2, ChevronDown, ChevronRight,
  Send, X, Cpu, FileText, Sparkles, RotateCcw, Trash2, AlertTriangle
} from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import P5Renderer from './P5Renderer';
import AnimationPlayer from './AnimationPlayer';
import {
  processBook,
  getRagStatus,
  chatWithBookStream,
  generateNotes,
  fetchNotes,
  retryNote,
  clearNotes,
  RagStatus,
  BookNote,
  ChatMessage,
} from '../lib/api';

// ── Markdown Components ───────────────────────────────────────────────────────

const markdownComponents = {
  code({ className, children, ...props }: any) {
    const lang = className?.replace('language-', '') || '';

    // Declarative engine: LLM outputs a JSON AnimationSpec
    if (lang === 'animation-spec') {
      const raw = String(children).trim();
      try {
        // LLMs sometimes emit literal newlines/tabs inside JSON string values,
        // which is invalid JSON. Escape them before parsing.
        const sanitized = raw.replace(
          /"((?:[^"\\]|\\.)*)"/g,
          (_match, inner: string) =>
            '"' + inner.replace(/\n/g, '\\n').replace(/\r/g, '').replace(/\t/g, '\\t') + '"'
        );
        const spec = JSON.parse(sanitized);
        return <AnimationPlayer spec={spec} />;
      } catch (e) {
        console.error('[AnimationPlayer] Failed to parse animation-spec JSON:', e, '\nRaw:', raw);
        return (
          <pre className="text-xs text-red-500 p-2 bg-red-50 rounded border border-red-200 overflow-auto max-h-40">
            ⚠️ Animation spec parse error — check console for details.{"\n"}
            {raw.slice(0, 200)}{raw.length > 200 ? '…' : ''}
          </pre>
        );
      }
    }

    // Legacy: raw p5.js code in a sandboxed iframe
    if (lang === 'p5js') {
      return <P5Renderer code={String(children).trim()} />;
    }

    return <code className={className} {...props}>{children}</code>;
  },
};

// ── Types ────────────────────────────────────────────────────────────────────

interface BookAIPanelProps {
  bookId: string;
  bookName: string;
  darkMode: boolean;
  onClose: () => void;
}

type Tab = 'chat' | 'notes';

// ── Helpers ──────────────────────────────────────────────────────────────────

function StatusBadge({ status }: { status: RagStatus['status'] }) {
  const cfg = {
    pending:    { icon: Loader2,       color: 'text-zinc-500',   spin: true,  label: 'Pending' },
    processing: { icon: Loader2,       color: 'text-[#fa5d19]',  spin: true,  label: 'Indexing…' },
    completed:  { icon: CheckCircle2,  color: 'text-emerald-500',spin: false, label: 'Indexed' },
    failed:     { icon: AlertCircle,   color: 'text-red-500',    spin: false, label: 'Failed' },
  }[status];
  const Icon = cfg.icon;
  return (
    <span className={`inline-flex items-center gap-1 text-[10px] font-mono font-semibold ${cfg.color}`}>
      <Icon size={11} className={cfg.spin ? 'animate-spin' : ''} />
      {cfg.label}
    </span>
  );
}

// ── Main component ───────────────────────────────────────────────────────────

export default function BookAIPanel({ bookId, bookName, darkMode, onClose }: BookAIPanelProps) {
  const [tab, setTab] = useState<Tab>('chat');
  const [ragStatus, setRagStatus] = useState<RagStatus | null>(null);
  const [statusLoading, setStatusLoading] = useState(false);
  const [indexing, setIndexing] = useState(false);

  // Chat state
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [streaming, setStreaming] = useState(false);
  const chatEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  // Notes state
  const [notes, setNotes] = useState<BookNote[]>([]);
  const [notesLoading, setNotesLoading] = useState(false);
  const [generatingNotes, setGeneratingNotes] = useState(false);
  const [retryingNoteId, setRetryingNoteId] = useState<string | null>(null);
  const [expandedNote, setExpandedNote] = useState<string | null>(null);
  const pollTimer = useRef<ReturnType<typeof setInterval> | null>(null);
  const notesPollTimer = useRef<ReturnType<typeof setInterval> | null>(null);

  // ── Load status on mount and when bookId changes ──────────────────────────
  const loadStatus = useCallback(async () => {
    setStatusLoading(true);
    try {
      const s = await getRagStatus(bookId);
      setRagStatus(s);
    } catch {
      setRagStatus(null);
    } finally {
      setStatusLoading(false);
    }
  }, [bookId]);

  useEffect(() => {
    loadStatus();
    return () => { if (pollTimer.current) clearInterval(pollTimer.current); };
  }, [loadStatus]);

  // Poll while processing
  useEffect(() => {
    if (ragStatus?.status === 'processing') {
      pollTimer.current = setInterval(loadStatus, 4000);
    } else {
      if (pollTimer.current) clearInterval(pollTimer.current);
    }
    return () => { if (pollTimer.current) clearInterval(pollTimer.current); };
  }, [ragStatus?.status, loadStatus]);

  // Auto-scroll chat
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, streaming]);

  // Load notes when tab switches to notes and book is indexed
  useEffect(() => {
    if (tab === 'notes' && ragStatus?.status === 'completed') {
      loadNotes();
    }
  }, [tab, ragStatus?.status]);

  // Active polling while any note is pending or generating
  useEffect(() => {
    const hasInProgress = notes.some(n => n.status === 'pending' || n.status === 'generating');
    if (hasInProgress && tab === 'notes') {
      if (!notesPollTimer.current) {
        notesPollTimer.current = setInterval(async () => {
          try {
            const fresh = await fetchNotes(bookId);
            setNotes(fresh);
          } catch {}
        }, 3000);
      }
    } else {
      if (notesPollTimer.current) {
        clearInterval(notesPollTimer.current);
        notesPollTimer.current = null;
      }
    }
    return () => {
      if (notesPollTimer.current) {
        clearInterval(notesPollTimer.current);
        notesPollTimer.current = null;
      }
    };
  }, [notes, tab, bookId]);

  // ── Actions ───────────────────────────────────────────────────────────────

  const handleIndex = async () => {
    setIndexing(true);
    try {
      await processBook(bookId);
      setRagStatus({ book_id: bookId, status: 'processing' });
    } catch (e: any) {
      alert(`Failed to start indexing: ${e.message}`);
    } finally {
      setIndexing(false);
    }
  };

  const handleSendMessage = async () => {
    const q = input.trim();
    if (!q || streaming) return;

    const userMsg: ChatMessage = { role: 'user', content: q, timestamp: new Date().toISOString() };
    setMessages(prev => [...prev, userMsg]);
    setInput('');
    setStreaming(true);

    const assistantMsg: ChatMessage = {
      role: 'assistant', content: '', timestamp: new Date().toISOString(),
    };
    setMessages(prev => [...prev, assistantMsg]);

    try {
      for await (const token of chatWithBookStream(bookId, q)) {
        setMessages(prev => {
          const copy = [...prev];
          copy[copy.length - 1] = { ...copy[copy.length - 1], content: copy[copy.length - 1].content + token };
          return copy;
        });
      }
    } catch (e: any) {
      setMessages(prev => {
        const copy = [...prev];
        copy[copy.length - 1] = { ...copy[copy.length - 1], content: `⚠️ Error: ${e.message}` };
        return copy;
      });
    } finally {
      setStreaming(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage();
    }
  };

  const loadNotes = async () => {
    setNotesLoading(true);
    try {
      const n = await fetchNotes(bookId);
      setNotes(n);
    } catch {}
    finally { setNotesLoading(false); }
  };

  const handleGenerateNotes = async (scope: 'chapter' | 'full') => {
    setGeneratingNotes(true);
    try {
      await generateNotes(bookId, scope, bookName);
      await loadNotes();
    } catch (e: any) {
      alert(`Failed to generate notes: ${e.message}`);
    } finally {
      setGeneratingNotes(false);
    }
  };

  const handleRetryNote = async (noteId: string) => {
    setRetryingNoteId(noteId);
    try {
      await retryNote(bookId, noteId);
      await loadNotes();
    } catch (e: any) {
      alert(`Failed to retry note: ${e.message}`);
    } finally {
      setRetryingNoteId(null);
    }
  };

  const handleClearNotes = async () => {
    if (!window.confirm('Clear all notes for this book?')) return;
    try {
      await clearNotes(bookId);
      setNotes([]);
      setExpandedNote(null);
    } catch (e: any) {
      alert(`Failed to clear notes: ${e.message}`);
    }
  };

  // ── Guard: not yet indexed ─────────────────────────────────────────────────

  const isIndexed = ragStatus?.status === 'completed';
  const isProcessing = ragStatus?.status === 'processing';

  return (
    <div className={`flex flex-col h-full w-[340px] md:w-[380px] border-l border-[var(--color-outline-variant)] bg-[var(--color-surface)]`}>

      {/* ── Header ── */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-[var(--color-outline-variant)] shrink-0">
        <div className="flex items-center gap-2">
          <div className="p-1.5 rounded-lg bg-[#9061ff]/10 text-[#9061ff]">
            <Sparkles size={15} />
          </div>
          <div>
            <p className="text-xs font-semibold text-[var(--color-on-surface)]">AI Assistant</p>
            <p className="text-[9px] text-zinc-500 font-mono truncate max-w-[160px]">{bookName}</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {statusLoading
            ? <Loader2 size={11} className="animate-spin text-zinc-400" />
            : ragStatus
              ? (
                <div className="flex items-center gap-1.5">
                  <StatusBadge status={ragStatus.status} />
                  {ragStatus.status === 'completed' && (
                    <button
                      onClick={handleIndex}
                      disabled={indexing}
                      title="Re-index book content into vector database"
                      className="p-1 rounded hover:bg-zinc-100 dark:hover:bg-zinc-800 text-zinc-400 hover:text-[#9061ff] transition-colors"
                    >
                      <RefreshCw size={11} className={indexing ? 'animate-spin text-[#9061ff]' : ''} />
                    </button>
                  )}
                </div>
              )
              : <span className="text-[10px] font-mono text-zinc-400">Not indexed</span>
          }
          <button onClick={onClose} className="btn-secondary !h-7 !w-7 !p-0 text-zinc-400">
            <X size={14} />
          </button>
        </div>

      </div>

      {/* ── Index prompt ── */}
      {!ragStatus || ragStatus.status === 'failed' ? (
        <div className="flex flex-col items-center justify-center gap-4 p-6 flex-1 text-center">
          <div className="p-4 rounded-2xl bg-[#9061ff]/10 text-[#9061ff]">
            <Cpu size={32} />
          </div>
          <div>
            <h3 className="text-sm font-semibold text-[var(--color-on-surface)] mb-1">Index this book</h3>
            <p className="text-xs text-zinc-500 leading-relaxed mb-1">
              To chat with this book and generate notes, we need to parse and embed its content into the vector database.
            </p>
            {ragStatus?.error_message && (
              <p className="text-[10px] text-red-500 font-mono mt-2">Error: {ragStatus.error_message}</p>
            )}
          </div>
          <button
            onClick={handleIndex}
            disabled={indexing}
            className="btn-primary text-xs gap-2 !bg-[#9061ff] hover:!bg-[#7c3aed]"
            id="index-book-btn"
          >
            {indexing ? <Loader2 size={13} className="animate-spin" /> : <Zap size={13} />}
            {indexing ? 'Starting…' : ragStatus?.status === 'failed' ? 'Retry Indexing' : 'Index Book'}
          </button>
        </div>
      ) : isProcessing ? (
        <div className="flex flex-col items-center justify-center gap-4 p-6 flex-1 text-center">
          <div className="relative">
            <div className="p-4 rounded-2xl bg-[#9061ff]/10 text-[#9061ff]">
              <Cpu size={32} />
            </div>
            <div className="absolute -bottom-1 -right-1 rounded-full bg-[var(--color-surface)] p-0.5">
              <Loader2 size={14} className="animate-spin text-[#fa5d19]" />
            </div>
          </div>
          <div>
            <h3 className="text-sm font-semibold text-[var(--color-on-surface)] mb-1">Indexing book…</h3>
            <p className="text-xs text-zinc-500 leading-relaxed">
              Parsing, chunking, and embedding the content. This may take a minute for large books.
            </p>
            <p className="text-[10px] font-mono text-[#fa5d19] mt-3 animate-pulse">
              {ragStatus.total_chunks ? `${ragStatus.total_chunks} chunks processed` : 'Running pipeline…'}
            </p>
          </div>
        </div>
      ) : (
        <>
          {/* ── Tabs ── */}
          <div className="flex border-b border-[var(--color-outline-variant)] shrink-0">
            {(['chat', 'notes'] as Tab[]).map(t => (
              <button
                key={t}
                id={`ai-tab-${t}`}
                onClick={() => setTab(t)}
                className={`flex-1 flex items-center justify-center gap-1.5 py-2.5 text-xs font-semibold transition-all border-b-2 ${
                  tab === t
                    ? 'border-[#9061ff] text-[#9061ff] bg-[#9061ff]/5'
                    : 'border-transparent text-zinc-500 hover:text-[var(--color-on-surface)]'
                }`}
              >
                {t === 'chat' ? <Bot size={13} /> : <BookOpenText size={13} />}
                {t === 'chat' ? 'Chat' : 'Notes'}
              </button>
            ))}
          </div>

          {/* ── Tab Content ── */}
          {tab === 'chat' && (
            <ChatTab
              messages={messages}
              input={input}
              streaming={streaming}
              chatEndRef={chatEndRef}
              inputRef={inputRef}
              onInputChange={setInput}
              onSend={handleSendMessage}
              onKeyDown={handleKeyDown}
              ragChunks={ragStatus.total_chunks}
            />
          )}

          {tab === 'notes' && (
            <NotesTab
              notes={notes}
              notesLoading={notesLoading}
              generatingNotes={generatingNotes}
              retryingNoteId={retryingNoteId}
              expandedNote={expandedNote}
              onExpandNote={setExpandedNote}
              onGenerateNotes={handleGenerateNotes}
              onRetryNote={handleRetryNote}
              onClearNotes={handleClearNotes}
              onRefresh={loadNotes}
            />
          )}
        </>
      )}
    </div>
  );
}

// ── Chat Tab ─────────────────────────────────────────────────────────────────

function ChatTab({
  messages, input, streaming, chatEndRef, inputRef,
  onInputChange, onSend, onKeyDown, ragChunks,
}: {
  messages: ChatMessage[];
  input: string;
  streaming: boolean;
  chatEndRef: React.RefObject<HTMLDivElement | null>;
  inputRef: React.RefObject<HTMLTextAreaElement | null>;
  onInputChange: (v: string) => void;
  onSend: () => void;
  onKeyDown: (e: React.KeyboardEvent<HTMLTextAreaElement>) => void;
  ragChunks?: number;
}) {
  return (
    <div className="flex flex-col flex-1 min-h-0">
      {/* Messages */}
      <div className="flex-1 overflow-y-auto custom-scrollbar p-3 space-y-3">
        {messages.length === 0 && (
          <div className="flex flex-col items-center justify-center h-full gap-3 text-center py-8">
            <div className="p-3 rounded-xl bg-[#9061ff]/10 text-[#9061ff]">
              <Bot size={24} />
            </div>
            <p className="text-xs font-semibold text-[var(--color-on-surface)]">Ask anything about this book</p>
            <p className="text-[10px] text-zinc-500 max-w-[200px] leading-relaxed">
              {ragChunks
                ? `Book indexed into ${ragChunks} chunks. Ask about concepts, get summaries, or find information.`
                : 'Book is indexed and ready for questions.'}
            </p>
            <div className="grid grid-cols-1 gap-1.5 w-full mt-2">
              {[
                'Summarize the main theme',
                'What are the key concepts?',
                'Who are the main characters?',
              ].map(s => (
                <button
                  key={s}
                  onClick={() => onInputChange(s)}
                  className="text-[10px] text-left px-3 py-2 rounded-lg border border-[var(--color-outline-variant)] bg-[var(--color-surface-container)] hover:border-[#9061ff]/40 hover:bg-[#9061ff]/5 transition-all text-zinc-500 hover:text-[#9061ff]"
                >
                  "{s}"
                </button>
              ))}
            </div>
          </div>
        )}

        {messages.map((msg, i) => (
          <div key={i} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
            {msg.role === 'assistant' && (
              <div className="mr-2 mt-1 shrink-0">
                <div className="p-1 rounded-md bg-[#9061ff]/10 text-[#9061ff]">
                  <Bot size={11} />
                </div>
              </div>
            )}
            <div
              className={`max-w-[85%] rounded-2xl px-3 py-2 text-xs leading-relaxed ${
                msg.role === 'user'
                  ? 'bg-[#9061ff] text-white rounded-br-sm'
                  : 'bg-[var(--color-surface-container-high)] text-[var(--color-on-surface)] rounded-bl-sm'
              }`}
            >
              {msg.role === 'assistant' ? (
                <div className="prose prose-xs dark:prose-invert max-w-none prose-p:my-1 prose-headings:text-xs prose-li:text-xs">
                  <ReactMarkdown components={markdownComponents}>
                    {msg.content || (streaming && i === messages.length - 1 ? '▋' : '')}
                  </ReactMarkdown>
                </div>
              ) : (
                msg.content
              )}
            </div>
          </div>
        ))}
        <div ref={chatEndRef} />
      </div>

      {/* Input */}
      <div className="p-3 border-t border-[var(--color-outline-variant)] shrink-0">
        <div className="flex items-end gap-2 bg-[var(--color-surface-container)] rounded-xl border border-[var(--color-outline-variant)] focus-within:border-[#9061ff]/50 focus-within:shadow-[0_0_0_3px_rgba(144,97,255,0.1)] transition-all px-3 py-2">
          <textarea
            ref={inputRef}
            value={input}
            onChange={e => onInputChange(e.target.value)}
            onKeyDown={onKeyDown}
            placeholder="Ask a question… (Enter to send)"
            rows={1}
            disabled={streaming}
            id="chat-input"
            className="flex-1 resize-none bg-transparent text-xs text-[var(--color-on-surface)] placeholder:text-zinc-400 outline-none max-h-28 overflow-y-auto"
            style={{ lineHeight: '1.5' }}
          />
          <button
            onClick={onSend}
            disabled={!input.trim() || streaming}
            id="chat-send-btn"
            className="shrink-0 p-1.5 rounded-lg bg-[#9061ff] text-white disabled:opacity-40 disabled:cursor-not-allowed hover:bg-[#7c3aed] transition-colors"
          >
            {streaming ? <Loader2 size={13} className="animate-spin" /> : <Send size={13} />}
          </button>
        </div>
        <p className="text-[9px] text-zinc-400 mt-1.5 text-center">Shift+Enter for new line • answers cite page numbers</p>
      </div>
    </div>
  );
}

// ── Notes Tab ─────────────────────────────────────────────────────────────────

function NotesTab({
  notes,
  notesLoading,
  generatingNotes,
  retryingNoteId,
  expandedNote,
  onExpandNote,
  onGenerateNotes,
  onRetryNote,
  onClearNotes,
  onRefresh,
}: {
  notes: BookNote[];
  notesLoading: boolean;
  generatingNotes: boolean;
  retryingNoteId: string | null;
  expandedNote: string | null;
  onExpandNote: (id: string | null) => void;
  onGenerateNotes: (scope: 'chapter' | 'full') => void;
  onRetryNote: (id: string) => void;
  onClearNotes: () => void;
  onRefresh: () => void;
}) {
  const completedNotes = notes.filter(n => n.status === 'completed');
  const generatingNotesList = notes.filter(n => n.status === 'generating' || n.status === 'pending');
  const failedNotes = notes.filter(n => n.status === 'failed');
  const hasNotes = notes.length > 0;

  return (
    <div className="flex flex-col flex-1 min-h-0">
      {/* Notes header actions */}
      <div className="px-3 py-2.5 border-b border-[var(--color-outline-variant)] shrink-0 flex items-center justify-between gap-2">
        <div className="flex items-center gap-1.5 min-w-0">
          <span className="text-[10px] font-mono text-zinc-500 truncate">
            {hasNotes ? `${completedNotes.length}/${notes.length} ready` : 'No notes yet'}
          </span>
          {failedNotes.length > 0 && (
            <span className="px-1.5 py-0.2 rounded text-[9px] font-mono bg-red-500/10 text-red-500 shrink-0">
              {failedNotes.length} failed
            </span>
          )}
        </div>
        <div className="flex items-center gap-1.5 shrink-0">
          {hasNotes && (
            <button
              onClick={onClearNotes}
              className="btn-secondary !h-6 !w-6 !p-0 text-zinc-400 hover:text-red-500 hover:bg-red-500/10 transition-colors"
              title="Clear all notes"
            >
              <Trash2 size={11} />
            </button>
          )}
          <button onClick={onRefresh} className="btn-secondary !h-6 !w-6 !p-0 text-zinc-400" title="Refresh notes">
            <RefreshCw size={11} className={notesLoading ? 'animate-spin' : ''} />
          </button>
          <button
            onClick={() => onGenerateNotes('chapter')}
            disabled={generatingNotes}
            id="generate-chapter-notes-btn"
            className="btn-secondary !h-6 !px-2 text-[10px] gap-1 border-[#9061ff]/30 text-[#9061ff] hover:bg-[#9061ff]/10"
          >
            {generatingNotes ? <Loader2 size={10} className="animate-spin" /> : <BookOpenText size={10} />}
            By Chapter
          </button>
          <button
            onClick={() => onGenerateNotes('full')}
            disabled={generatingNotes}
            id="generate-full-notes-btn"
            className="btn-secondary !h-6 !px-2 text-[10px] gap-1 border-[#fa5d19]/30 text-[#fa5d19] hover:bg-[#fa5d19]/10"
          >
            {generatingNotes ? <Loader2 size={10} className="animate-spin" /> : <Sparkles size={10} />}
            Full Book
          </button>
        </div>
      </div>

      {/* Notes list */}
      <div className="flex-1 overflow-y-auto custom-scrollbar p-2 space-y-2">
        {notesLoading && !hasNotes && (
          <div className="flex items-center justify-center py-8">
            <Loader2 size={18} className="animate-spin text-zinc-400" />
          </div>
        )}

        {!notesLoading && !hasNotes && (
          <div className="flex flex-col items-center justify-center gap-3 p-6 text-center h-full">
            <div className="p-3 rounded-xl bg-[#fa5d19]/10 text-[#fa5d19]">
              <FileText size={24} />
            </div>
            <p className="text-xs font-semibold text-[var(--color-on-surface)]">No notes generated yet</p>
            <p className="text-[10px] text-zinc-500 leading-relaxed max-w-[200px]">
              Generate chapter-by-chapter study notes or a full book overview using the buttons above.
            </p>
          </div>
        )}

        {/* ── Generating / Queued Notes ── */}
        {generatingNotesList.length > 0 && (
          <div className="space-y-1.5">
            {generatingNotesList.map(note => (
              <div
                key={note.id}
                className="flex items-center justify-between gap-2 px-3 py-2.5 rounded-xl bg-[#9061ff]/5 border border-[#9061ff]/20 animate-pulse"
              >
                <div className="flex items-center gap-2 min-w-0">
                  <Loader2 size={12} className="animate-spin text-[#9061ff] shrink-0" />
                  <div className="min-w-0">
                    <p className="text-[11px] font-medium text-[var(--color-on-surface)] truncate">
                      {note.chapter_title || (note.scope === 'full' ? 'Full Book Overview' : 'Chapter Notes')}
                    </p>
                    <p className="text-[9px] font-mono text-zinc-400">
                      {note.status === 'generating' ? 'Generating summary with LLM…' : 'Queued in pipeline…'}
                    </p>
                  </div>
                </div>
                <span className="text-[9px] font-mono px-1.5 py-0.5 rounded bg-[#9061ff]/10 text-[#9061ff] shrink-0">
                  {note.status}
                </span>
              </div>
            ))}
          </div>
        )}

        {/* ── Failed Notes ── */}
        {failedNotes.length > 0 && (
          <div className="space-y-1.5">
            {failedNotes.map(note => (
              <div
                key={note.id}
                className="flex items-center justify-between gap-2 px-3 py-2.5 rounded-xl bg-red-500/5 border border-red-500/20"
              >
                <div className="flex items-center gap-2 min-w-0">
                  <AlertTriangle size={13} className="text-red-500 shrink-0" />
                  <div className="min-w-0">
                    <p className="text-[11px] font-medium text-[var(--color-on-surface)] truncate">
                      {note.chapter_title || (note.scope === 'full' ? 'Full Book Overview' : 'Chapter Notes')}
                    </p>
                    <p className="text-[9px] font-mono text-red-400 truncate max-w-[180px]">
                      {note.error_message ? note.error_message.split('\n')[0] : 'Generation failed'}
                    </p>
                  </div>
                </div>
                <button
                  onClick={() => onRetryNote(note.id)}
                  disabled={retryingNoteId === note.id}
                  className="btn-secondary !h-6 !px-2 text-[9px] gap-1 border-red-500/30 text-red-500 hover:bg-red-500/10 shrink-0"
                  title="Retry generation"
                >
                  {retryingNoteId === note.id ? (
                    <Loader2 size={10} className="animate-spin" />
                  ) : (
                    <RotateCcw size={10} />
                  )}
                  Retry
                </button>
              </div>
            ))}
          </div>
        )}

        {/* ── Completed Notes ── */}
        {completedNotes.length > 0 && (
          <div className="space-y-1.5">
            {completedNotes
              .sort((a, b) => (a.chapter_index ?? 0) - (b.chapter_index ?? 0))
              .map(note => (
                <NoteCard
                  key={note.id}
                  note={note}
                  expanded={expandedNote === note.id}
                  onToggle={() => onExpandNote(expandedNote === note.id ? null : note.id)}
                />
              ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ── Note Card ─────────────────────────────────────────────────────────────────

function NoteCard({ note, expanded, onToggle }: { note: BookNote; expanded: boolean; onToggle: () => void }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (note.content) {
      navigator.clipboard.writeText(note.content);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  return (
    <div className="rounded-xl border border-[var(--color-outline-variant)] bg-[var(--color-surface-container)] overflow-hidden transition-all shadow-sm">
      <button
        onClick={onToggle}
        className="w-full flex items-center gap-2 px-3 py-2.5 text-left hover:bg-[var(--color-surface-container-high)] transition-colors"
      >
        <div className="shrink-0 text-[#9061ff]">
          {expanded ? <ChevronDown size={13} /> : <ChevronRight size={13} />}
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-[11px] font-semibold text-[var(--color-on-surface)] truncate">
            {note.chapter_title || (note.scope === 'full' ? 'Full Book Overview' : 'Chapter Notes')}
          </p>
          <p className="text-[9px] font-mono text-zinc-400 mt-0.5">
            {note.scope === 'full' ? 'Full overview' : `Chapter ${(note.chapter_index ?? 0) + 1}`}
          </p>
        </div>
        <div className="flex items-center gap-1 shrink-0">
          <span className="px-1.5 py-0.5 rounded-full text-[9px] font-mono bg-emerald-500/10 text-emerald-600">
            ready
          </span>
        </div>
      </button>

      {expanded && note.content && (
        <div className="border-t border-[var(--color-outline-variant)] px-3 py-3 max-h-96 overflow-y-auto custom-scrollbar">
          <div className="flex justify-end mb-2">
            <button
              onClick={handleCopy}
              className="text-[9px] font-mono px-2 py-0.5 rounded border border-[var(--color-outline-variant)] text-zinc-400 hover:text-[var(--color-on-surface)] hover:bg-[var(--color-surface-container-high)] transition-colors"
            >
              {copied ? '✓ Copied' : 'Copy markdown'}
            </button>
          </div>
          <div className="prose prose-xs dark:prose-invert max-w-none prose-p:my-1.5 prose-headings:text-xs prose-headings:font-bold prose-li:text-xs prose-code:text-[10px] prose-strong:text-[var(--color-on-surface)]">
            <ReactMarkdown components={markdownComponents}>{note.content}</ReactMarkdown>
          </div>
        </div>
      )}
    </div>
  );
}

