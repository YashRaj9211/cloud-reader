import React, { useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  X,
  Plus,
  Send,
  Sparkles,
  Layers,
  FileText,
  Folder,
  Globe,
  Trash2,
  Edit2,
  Check,
} from 'lucide-react';
import { useAppStore } from '../../store';
import { ScopeType } from '../../types';
import { ChatMessageList } from './ChatMessageList';
import { Button } from '../ui/Button';

export const ChatDrawer: React.FC = () => {
  const {
    chatOpen,
    setChatOpen,
    chatSessions,
    activeSession,
    activeSessionId,
    chatLoading,
    chatError,
    chatScope,
    books,
    folders,
    activeBookId,
    activeFolderId,
    loadChatSessions,
    createSession,
    selectSession,
    deleteSession,
    renameSession,
    sendMessage,
    setChatScope,
    changePage,
    selectBook,
  } = useAppStore();

  const [inputMessage, setInputMessage] = useState('');
  const [editingTitle, setEditingTitle] = useState<string | null>(null);
  const [newTitleVal, setNewTitleVal] = useState('');
  const [showSessionsDropdown, setShowSessionsDropdown] = useState(false);
  const [scopeDropdownOpen, setScopeDropdownOpen] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (chatOpen) {
      loadChatSessions();
    }
  }, [chatOpen, loadChatSessions]);

  const handleSend = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!inputMessage.trim() || chatLoading) return;
    const content = inputMessage.trim();
    setInputMessage('');
    await sendMessage(content);
  };

  const handleJumpToPage = async (pageNumber: number, documentId?: string) => {
    if (documentId && documentId !== activeBookId) {
      await selectBook(documentId);
    }
    changePage(pageNumber);
  };

  const handleScopeChange = (type: ScopeType) => {
    let id: string | null = null;
    if (type === 'DOCUMENT') id = activeBookId;
    if (type === 'FOLDER') id = activeFolderId;

    setChatScope({ type, id });
    setScopeDropdownOpen(false);

    // Create a new session with this scope
    const scopeLabel =
      type === 'DOCUMENT'
        ? books.find((b) => b.id === id)?.name || 'Document'
        : type === 'FOLDER'
        ? folders.find((f) => f.id === id)?.name || 'Folder'
        : 'All Documents';

    createSession(`Chat: ${scopeLabel}`, type, id);
  };

  if (!chatOpen) return null;

  const currentBook = books.find((b) => b.id === activeBookId);

  return (
    <AnimatePresence>
      <motion.aside
        initial={{ x: '100%', opacity: 0 }}
        animate={{ x: 0, opacity: 1 }}
        exit={{ x: '100%', opacity: 0 }}
        transition={{ type: 'spring', damping: 26, stiffness: 280 }}
        className="fixed inset-y-0 right-0 z-40 w-full sm:w-[420px] bg-white dark:bg-stone-900 border-l border-stone-200 dark:border-stone-800 shadow-2xl flex flex-col"
      >
        {/* Chat Header */}
        <div className="p-3.5 border-b border-stone-200 dark:border-stone-800 flex items-center justify-between gap-2 bg-stone-50/70 dark:bg-stone-950/40">
          <div className="flex items-center gap-2 min-w-0">
            <div className="w-8 h-8 rounded-lg bg-[#fa5d19]/10 text-[#fa5d19] flex items-center justify-center shrink-0">
              <Sparkles className="w-4 h-4" />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-1.5">
                {editingTitle !== null ? (
                  <div className="flex items-center gap-1">
                    <input
                      type="text"
                      value={newTitleVal}
                      onChange={(e) => setNewTitleVal(e.target.value)}
                      className="text-xs px-2 py-1 rounded border border-[#fa5d19] bg-white dark:bg-stone-950 text-stone-900 dark:text-stone-100"
                      autoFocus
                    />
                    <button
                      onClick={() => {
                        if (activeSessionId && newTitleVal.trim()) {
                          renameSession(activeSessionId, newTitleVal.trim());
                        }
                        setEditingTitle(null);
                      }}
                      className="text-emerald-500 hover:text-emerald-600 p-1"
                    >
                      <Check className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ) : (
                  <button
                    onClick={() => setShowSessionsDropdown(!showSessionsDropdown)}
                    className="font-semibold text-sm text-stone-900 dark:text-stone-100 truncate hover:text-[#fa5d19] text-left transition-colors flex items-center gap-1"
                  >
                    <span className="truncate">
                      {activeSession?.title || 'AI RAG Assistant'}
                    </span>
                    <span className="text-stone-400 text-[10px]">▼</span>
                  </button>
                )}
                {activeSession && editingTitle === null && (
                  <button
                    onClick={() => {
                      setEditingTitle(activeSession.id);
                      setNewTitleVal(activeSession.title);
                    }}
                    className="text-stone-400 hover:text-stone-600 dark:hover:text-stone-200 p-0.5"
                    title="Rename session"
                  >
                    <Edit2 className="w-3 h-3" />
                  </button>
                )}
              </div>
              <p className="text-[11px] text-stone-500 dark:text-stone-400 truncate">
                Grounded research assistant
              </p>
            </div>
          </div>

          <div className="flex items-center gap-1 shrink-0">
            <Button
              variant="outline"
              size="xs"
              onClick={() =>
                createSession(
                  'New Chat',
                  chatScope.type,
                  chatScope.id
                )
              }
              title="Start new conversation"
              leftIcon={<Plus className="w-3.5 h-3.5" />}
            >
              New
            </Button>
            <button
              onClick={() => setChatOpen(false)}
              className="p-1.5 rounded-lg text-stone-400 hover:text-stone-700 dark:hover:text-stone-200 hover:bg-stone-100 dark:hover:bg-stone-800 transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Sessions Dropdown Modal / Popover */}
        {showSessionsDropdown && (
          <div className="bg-stone-100 dark:bg-stone-800/90 border-b border-stone-200 dark:border-stone-700 p-2 max-h-48 overflow-y-auto space-y-1">
            <div className="text-[10px] font-semibold uppercase tracking-wider text-stone-400 px-2 py-1">
              Conversations History
            </div>
            {chatSessions.length === 0 ? (
              <p className="text-xs text-stone-500 px-2 py-1">No past sessions found.</p>
            ) : (
              chatSessions.map((s) => (
                <div
                  key={s.id}
                  className={`flex items-center justify-between px-2.5 py-1.5 rounded-lg text-xs transition-colors ${
                    s.id === activeSessionId
                      ? 'bg-[#fa5d19]/15 text-[#fa5d19] font-medium'
                      : 'hover:bg-stone-200/70 dark:hover:bg-stone-700/60 text-stone-700 dark:text-stone-300'
                  }`}
                >
                  <button
                    onClick={() => {
                      selectSession(s.id);
                      setShowSessionsDropdown(false);
                    }}
                    className="flex-1 text-left truncate mr-2"
                  >
                    {s.title}
                  </button>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      deleteSession(s.id);
                    }}
                    className="text-stone-400 hover:text-rose-500 p-1"
                    title="Delete session"
                  >
                    <Trash2 className="w-3 h-3" />
                  </button>
                </div>
              ))
            )}
          </div>
        )}

        {/* Scope Selector Bar */}
        <div className="px-4 py-2 bg-stone-100/60 dark:bg-stone-900/60 border-b border-stone-200/80 dark:border-stone-800 flex items-center justify-between text-xs">
          <div className="flex items-center gap-1.5 text-stone-500 dark:text-stone-400">
            <Layers className="w-3.5 h-3.5 text-[#fa5d19]" />
            <span>Active Scope:</span>
          </div>

          <div className="relative">
            <button
              onClick={() => setScopeDropdownOpen(!scopeDropdownOpen)}
              className="flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-white dark:bg-stone-800 border border-stone-200 dark:border-stone-700 font-medium text-stone-800 dark:text-stone-200 hover:border-[#fa5d19]"
            >
              {chatScope.type === 'DOCUMENT' && (
                <>
                  <FileText className="w-3 h-3 text-[#fa5d19]" />
                  <span className="truncate max-w-[130px]">
                    {currentBook ? currentBook.name : 'Current Doc'}
                  </span>
                </>
              )}
              {chatScope.type === 'FOLDER' && (
                <>
                  <Folder className="w-3 h-3 text-amber-500" />
                  <span>Folder Scope</span>
                </>
              )}
              {chatScope.type === 'ALL' && (
                <>
                  <Globe className="w-3 h-3 text-blue-500" />
                  <span>All Library</span>
                </>
              )}
              <span className="text-[10px] text-stone-400">▼</span>
            </button>

            {scopeDropdownOpen && (
              <div className="absolute right-0 mt-1 w-48 bg-white dark:bg-stone-800 border border-stone-200 dark:border-stone-700 rounded-lg shadow-xl z-50 p-1 space-y-1">
                <button
                  onClick={() => handleScopeChange('DOCUMENT')}
                  disabled={!activeBookId}
                  className="w-full flex items-center gap-2 px-2.5 py-1.5 rounded text-xs text-stone-700 dark:text-stone-200 hover:bg-stone-100 dark:hover:bg-stone-700 disabled:opacity-40"
                >
                  <FileText className="w-3.5 h-3.5 text-[#fa5d19]" />
                  <div className="text-left truncate">
                    <p className="font-medium truncate">Current Document</p>
                    <p className="text-[10px] text-stone-400 truncate">
                      {currentBook?.name || 'Select a document'}
                    </p>
                  </div>
                </button>
                <button
                  onClick={() => handleScopeChange('ALL')}
                  className="w-full flex items-center gap-2 px-2.5 py-1.5 rounded text-xs text-stone-700 dark:text-stone-200 hover:bg-stone-100 dark:hover:bg-stone-700"
                >
                  <Globe className="w-3.5 h-3.5 text-blue-500" />
                  <div className="text-left">
                    <p className="font-medium">Entire Library</p>
                    <p className="text-[10px] text-stone-400">All indexed PDFs</p>
                  </div>
                </button>
              </div>
            )}
          </div>
        </div>

        {/* Error banner */}
        {chatError && (
          <div className="bg-red-50 dark:bg-red-950/40 text-red-600 dark:text-red-300 text-xs px-4 py-2 border-b border-red-200 dark:border-red-800 flex justify-between items-center">
            <span>{chatError}</span>
            <button onClick={() => useAppStore.setState({ chatError: null })}>
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        )}

        {/* Message Stream */}
        <ChatMessageList
          messages={activeSession?.messages || []}
          loading={chatLoading}
          onJumpToPage={handleJumpToPage}
          onPromptClick={(prompt) => {
            setInputMessage(prompt);
            inputRef.current?.focus();
          }}
        />

        {/* Chat Input Bar */}
        <div className="p-3 border-t border-stone-200 dark:border-stone-800 bg-white dark:bg-stone-900">
          <form onSubmit={handleSend} className="relative flex items-center">
            <input
              ref={inputRef}
              type="text"
              value={inputMessage}
              onChange={(e) => setInputMessage(e.target.value)}
              placeholder="Ask anything about this document..."
              disabled={chatLoading}
              className="w-full bg-stone-100 dark:bg-stone-800/80 border border-stone-200 dark:border-stone-700 rounded-xl px-4 py-2.5 pr-12 text-sm text-stone-900 dark:text-stone-100 placeholder-stone-400 focus:outline-none focus:border-[#fa5d19] focus:ring-2 focus:ring-[#fa5d19]/20"
            />
            <button
              type="submit"
              disabled={!inputMessage.trim() || chatLoading}
              className="absolute right-2 p-1.5 rounded-lg bg-[#fa5d19] text-white hover:bg-[#ff7a3d] disabled:opacity-30 disabled:hover:bg-[#fa5d19] transition-all cursor-pointer"
            >
              <Send className="w-4 h-4" />
            </button>
          </form>
          <p className="text-[10px] text-center text-stone-400 mt-2">
            Answers are grounded strictly on vector chunks with citation links.
          </p>
        </div>
      </motion.aside>
    </AnimatePresence>
  );
};
