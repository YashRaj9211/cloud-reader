import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Search,
  FileText,
  Bookmark,
  Sparkles,
  Command,
  ArrowRight,
  X,
} from 'lucide-react';
import { useAppStore } from '../../store';
import { Badge } from '../ui/Badge';
import { Spinner } from '../ui/Spinner';

export const CommandPalette: React.FC = () => {
  const {
    commandPaletteOpen,
    setCommandPaletteOpen,
    books,
    selectBook,
    changePage,
    performSemanticSearch,
    searchResults,
    isSearching,
    clearSearchResults,
  } = useAppStore();

  const [query, setQuery] = useState('');
  const [activeTab, setActiveTab] = useState<'filename' | 'semantic'>('semantic');

  // Keybinding listener for Cmd+K / Ctrl+K
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setCommandPaletteOpen(!commandPaletteOpen);
      } else if (e.key === 'Escape' && commandPaletteOpen) {
        setCommandPaletteOpen(false);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [commandPaletteOpen, setCommandPaletteOpen]);

  // Debounced semantic search
  useEffect(() => {
    if (!commandPaletteOpen) return;
    if (activeTab !== 'semantic') return;

    if (!query.trim()) {
      clearSearchResults();
      return;
    }

    const handler = setTimeout(() => {
      performSemanticSearch(query.trim());
    }, 350);

    return () => clearTimeout(handler);
  }, [query, activeTab, commandPaletteOpen, performSemanticSearch, clearSearchResults]);

  if (!commandPaletteOpen) return null;

  // Filtered books for filename search
  const filteredBooks = books.filter((b) =>
    b.name.toLowerCase().includes(query.toLowerCase())
  );

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-50 flex items-start justify-center pt-20 sm:pt-28 px-4 bg-stone-900/60 backdrop-blur-sm">
        <motion.div
          initial={{ opacity: 0, scale: 0.96, y: -10 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.96, y: -10 }}
          transition={{ duration: 0.15 }}
          className="w-full max-w-2xl bg-white dark:bg-stone-900 rounded-2xl shadow-2xl border border-stone-200 dark:border-stone-800 overflow-hidden flex flex-col max-h-[70vh]"
        >
          {/* Top Search Input */}
          <div className="p-3.5 border-b border-stone-200 dark:border-stone-800 flex items-center gap-3">
            <Search className="w-5 h-5 text-stone-400 shrink-0" />
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search across all documents, pages, or vector embeddings..."
              className="w-full bg-transparent text-base text-stone-900 dark:text-stone-100 placeholder-stone-400 focus:outline-none"
              autoFocus
            />
            {query && (
              <button
                onClick={() => setQuery('')}
                className="text-stone-400 hover:text-stone-600 dark:hover:text-stone-200"
              >
                <X className="w-4 h-4" />
              </button>
            )}
            <div className="flex items-center gap-1 shrink-0 text-[11px] font-mono text-stone-400 bg-stone-100 dark:bg-stone-800 px-2 py-1 rounded">
              <Command className="w-3 h-3" />
              <span>K</span>
            </div>
          </div>

          {/* Mode Switcher Tabs */}
          <div className="flex border-b border-stone-200 dark:border-stone-800 px-3 bg-stone-50/50 dark:bg-stone-950/40 text-xs">
            <button
              onClick={() => setActiveTab('semantic')}
              className={`py-2 px-3 flex items-center gap-1.5 font-medium border-b-2 transition-colors ${
                activeTab === 'semantic'
                  ? 'border-[#fa5d19] text-[#fa5d19]'
                  : 'border-transparent text-stone-500 hover:text-stone-800 dark:hover:text-stone-200'
              }`}
            >
              <Sparkles className="w-3.5 h-3.5" />
              Semantic Vector Search
            </button>
            <button
              onClick={() => setActiveTab('filename')}
              className={`py-2 px-3 flex items-center gap-1.5 font-medium border-b-2 transition-colors ${
                activeTab === 'filename'
                  ? 'border-[#fa5d19] text-[#fa5d19]'
                  : 'border-transparent text-stone-500 hover:text-stone-800 dark:hover:text-stone-200'
              }`}
            >
              <FileText className="w-3.5 h-3.5" />
              Document Titles ({books.length})
            </button>
          </div>

          {/* Search Content List */}
          <div className="flex-1 overflow-y-auto p-2">
            {activeTab === 'semantic' && (
              <div className="space-y-1.5">
                {isSearching ? (
                  <div className="py-12 flex flex-col items-center justify-center gap-3 text-stone-400">
                    <Spinner size="md" />
                    <p className="text-xs">Querying ChromaDB vector space...</p>
                  </div>
                ) : !query.trim() ? (
                  <div className="py-10 text-center text-stone-400 text-xs">
                    Type any phrase or concept to perform semantic matching across all your indexed PDFs.
                  </div>
                ) : searchResults.length === 0 ? (
                  <div className="py-10 text-center text-stone-400 text-xs">
                    No relevant passages found in indexed documents.
                  </div>
                ) : (
                  searchResults.map((res) => {
                    const docBook = books.find(
                      (b) => b.id === res.metadata.document_id
                    );
                    const similarityScore = res.distance != null ? Math.round((1 - res.distance) * 100) : null;

                    return (
                      <div
                        key={res.id}
                        onClick={() => {
                          selectBook(res.metadata.document_id);
                          changePage(res.metadata.page_number);
                          setCommandPaletteOpen(false);
                        }}
                        className="p-3 rounded-xl border border-stone-200/70 dark:border-stone-800 hover:border-[#fa5d19] dark:hover:border-[#fa5d19] hover:bg-stone-50 dark:hover:bg-stone-800/50 cursor-pointer transition-all group"
                      >
                        <div className="flex items-center justify-between gap-2 mb-1.5">
                          <div className="flex items-center gap-2">
                            <span className="font-semibold text-xs text-stone-900 dark:text-stone-100 flex items-center gap-1 group-hover:text-[#fa5d19]">
                              <FileText className="w-3.5 h-3.5 text-[#fa5d19]" />
                              {docBook?.name || 'Document'}
                            </span>
                            <Badge variant="primary" size="sm">
                              Page {res.metadata.page_number}
                            </Badge>
                          </div>
                          {similarityScore != null && (
                            <span className="text-[11px] font-mono text-stone-500 dark:text-stone-400">
                              {similarityScore}% match
                            </span>
                          )}
                        </div>
                        <p className="text-xs text-stone-600 dark:text-stone-300 font-mono line-clamp-2 leading-relaxed bg-stone-100/60 dark:bg-stone-950/40 p-2 rounded">
                          "{res.document}"
                        </p>
                      </div>
                    );
                  })
                )}
              </div>
            )}

            {activeTab === 'filename' && (
              <div className="space-y-1">
                {filteredBooks.length === 0 ? (
                  <div className="py-8 text-center text-stone-400 text-xs">
                    No documents matched "{query}".
                  </div>
                ) : (
                  filteredBooks.map((book) => (
                    <button
                      key={book.id}
                      onClick={() => {
                        selectBook(book.id);
                        setCommandPaletteOpen(false);
                      }}
                      className="w-full flex items-center justify-between p-2.5 rounded-lg hover:bg-stone-100 dark:hover:bg-stone-800 text-left transition-colors text-xs text-stone-800 dark:text-stone-200 group"
                    >
                      <div className="flex items-center gap-2.5 min-w-0">
                        <FileText className="w-4 h-4 text-[#fa5d19] shrink-0" />
                        <span className="truncate font-medium">{book.name}</span>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <span className="text-stone-400 text-[11px]">
                          p. {book.currentPage || 1} / {book.totalPages || '?'}
                        </span>
                        <ArrowRight className="w-3.5 h-3.5 text-stone-400 group-hover:text-[#fa5d19] group-hover:translate-x-0.5 transition-all" />
                      </div>
                    </button>
                  ))
                )}
              </div>
            )}
          </div>

          {/* Footer note */}
          <div className="p-2.5 bg-stone-50 dark:bg-stone-950/70 border-t border-stone-200 dark:border-stone-800 text-[11px] text-stone-400 flex items-center justify-between">
            <span>Press Esc to close</span>
            <span>Click any citation to jump directly to that page</span>
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
};
