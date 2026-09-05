import React, { useRef, useState } from 'react';
import { 
  FileText, 
  Trash2, 
  Search, 
  UploadCloud, 
  User, 
  LogOut,
  Moon,
  Sun,
  Flame,
  X,
  Folder as FolderIcon,
  Sparkles,
  Layers,
  StickyNote,
} from 'lucide-react';
import { useAppStore } from '../store';
import { FolderTree } from './folders/FolderTree';
import { IndexingProgressBar } from './common/IndexingProgressBar';
import { Button } from './ui/Button';

export interface DocumentSidebarProps {
  onClose?: () => void;
}

export const DocumentSidebar: React.FC<DocumentSidebarProps> = ({ onClose }) => {
  const {
    books,
    activeBookId,
    selectBook,
    uploadBook,
    deleteBook,
    user,
    logout,
    darkMode,
    toggleDarkMode,
    activeSidebarTab,
    setActiveSidebarTab,
    activeFolderId,
    indexingStatus,
    startIndexing,
    globalNotes,
    changePage,
  } = useAppStore();

  const [searchQuery, setSearchQuery] = useState('');
  const [isDragging, setIsDragging] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Filter books by active folder and search query
  const filteredBooks = books.filter((book) => {
    const matchesSearch = book.name.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesFolder = activeFolderId ? book.directoryId === activeFolderId : true;
    return matchesSearch && matchesFolder;
  });

  const triggerUpload = async (file: File) => {
    if (file.type !== 'application/pdf' && !file.name.endsWith('.pdf')) {
      setUploadError('Only PDF files are supported.');
      return;
    }
    setUploadError(null);
    setUploading(true);
    try {
      await uploadBook(file);
    } catch (err: any) {
      console.error(err);
      setUploadError(err.message || 'Error uploading file.');
    } finally {
      setUploading(false);
    }
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      await triggerUpload(e.target.files[0]);
    }
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = () => {
    setIsDragging(false);
  };

  const handleDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      await triggerUpload(e.dataTransfer.files[0]);
    }
  };

  const formatSize = (bytes?: number) => {
    if (!bytes) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
  };

  return (
    <div className="w-full sm:w-72 md:w-72 h-full flex flex-col border-r border-stone-200/60 dark:border-stone-800/60 bg-white/95 dark:bg-stone-900/95 backdrop-blur-xl text-stone-900 dark:text-stone-100 select-none">
      {/* Top Header: Minimal Library title & actions */}
      <div className="px-4 py-3 border-b border-stone-200/50 dark:border-stone-800/50 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-xs font-semibold uppercase tracking-wider text-stone-400">Library</span>
          <span className="text-[10px] font-mono text-stone-400 bg-stone-100 dark:bg-stone-800 px-1.5 py-0.5 rounded-full">
            {books.length}
          </span>
        </div>

        <div className="flex items-center gap-1">
          {/* Subtle upload button */}
          <button
            onClick={() => fileInputRef.current?.click()}
            title="Upload PDF"
            className="p-1.5 rounded-lg text-stone-500 hover:text-[#fa5d19] hover:bg-stone-100 dark:hover:bg-stone-800 transition-colors"
          >
            <UploadCloud size={16} />
          </button>
          <input
            type="file"
            ref={fileInputRef}
            onChange={handleFileChange}
            accept=".pdf"
            className="hidden"
          />

          <button
            onClick={toggleDarkMode}
            title={darkMode ? 'Switch to Light Mode' : 'Switch to Dark Mode'}
            className="p-1.5 rounded-lg text-stone-400 hover:text-stone-700 dark:hover:text-stone-200 transition-colors"
          >
            {darkMode ? <Sun size={15} /> : <Moon size={15} />}
          </button>

          {onClose && (
            <button
              onClick={onClose}
              className="p-1.5 rounded-lg md:hidden text-stone-400 hover:text-stone-800 dark:hover:text-stone-200"
              title="Close library"
            >
              <X size={16} />
            </button>
          )}
        </div>
      </div>

      {/* Minimal Tabs: Files | Folders | Notes */}
      <div className="flex items-center px-3 pt-2 pb-1 gap-1 border-b border-stone-200/40 dark:border-stone-800/40 text-xs">
        <button
          onClick={() => setActiveSidebarTab('documents')}
          className={`flex-1 py-1 px-2 rounded-lg text-center font-medium transition-all ${
            activeSidebarTab === 'documents'
              ? 'bg-stone-200/60 dark:bg-stone-800 text-stone-900 dark:text-white'
              : 'text-stone-400 hover:text-stone-700 dark:hover:text-stone-300'
          }`}
        >
          Files
        </button>
        <button
          onClick={() => setActiveSidebarTab('folders')}
          className={`flex-1 py-1 px-2 rounded-lg text-center font-medium transition-all ${
            activeSidebarTab === 'folders'
              ? 'bg-stone-200/60 dark:bg-stone-800 text-stone-900 dark:text-white'
              : 'text-stone-400 hover:text-stone-700 dark:hover:text-stone-300'
          }`}
        >
          Folders
        </button>
        <button
          onClick={() => setActiveSidebarTab('notes')}
          className={`flex-1 py-1 px-2 rounded-lg text-center font-medium transition-all ${
            activeSidebarTab === 'notes'
              ? 'bg-stone-200/60 dark:bg-stone-800 text-stone-900 dark:text-white'
              : 'text-stone-400 hover:text-stone-700 dark:hover:text-stone-300'
          }`}
        >
          Notes
        </button>
      </div>

      {/* Tab Content 1: Documents list */}
      {activeSidebarTab === 'documents' && (
        <>
          {/* Subtle Search bar */}
          <div className="px-3 pt-2.5 pb-1">
            <div className="relative">
              <Search className="absolute left-2.5 top-2 text-stone-400" size={13} />
              <input
                type="text"
                placeholder="Filter files…"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full bg-stone-100/70 dark:bg-stone-800/50 rounded-lg pl-7 pr-3 py-1.5 text-xs text-stone-900 dark:text-stone-100 placeholder-stone-400 focus:outline-none focus:bg-white dark:focus:bg-stone-800 border border-transparent focus:border-stone-200 dark:focus:border-stone-700 transition-all"
              />
            </div>
            {uploadError && (
              <p className="mt-1 text-[10px] text-red-500 font-medium">{uploadError}</p>
            )}
          </div>

          {/* Book List */}
          <div className="flex-1 overflow-y-auto px-2 py-1 space-y-0.5">
            {filteredBooks.length === 0 ? (
              <div className="py-10 text-center flex flex-col items-center justify-center">
                <FileText size={22} className="text-stone-300 dark:text-stone-700 mb-1" />
                <p className="text-xs text-stone-400 font-medium">No files found</p>
              </div>
            ) : (
              filteredBooks.map((book) => {
                const isActive = book.id === activeBookId;
                const currentPage = book.currentPage || 1;
                const totalPages = book.totalPages || 1;
                const percent = Math.min(100, Math.max(0, Math.round((currentPage / totalPages) * 100)));
                
                // SVG Circle Progress calculation (radius = 9, circumference = 2 * PI * 9 ~= 56.55)
                const radius = 9;
                const circumference = 2 * Math.PI * radius;
                const strokeDashoffset = circumference - (percent / 100) * circumference;

                return (
                  <div
                    key={book.id}
                    onClick={() => selectBook(book.id)}
                    className={`group px-2.5 py-2 rounded-lg cursor-pointer flex items-center justify-between gap-2 transition-all ${
                      isActive
                        ? 'bg-stone-200/70 dark:bg-stone-800 text-stone-900 dark:text-white font-medium'
                        : 'text-stone-600 dark:text-stone-400 hover:bg-stone-100/80 dark:hover:bg-stone-850 hover:text-stone-900 dark:hover:text-stone-200'
                    }`}
                  >
                    <div className="flex items-center gap-2 min-w-0 flex-1">
                      <FileText
                        size={14}
                        className={`shrink-0 ${isActive ? 'text-[#fa5d19]' : 'text-stone-400'}`}
                      />
                      <span className="text-xs truncate" title={book.name}>
                        {book.name.replace(/\.[^/.]+$/, '')}
                      </span>
                    </div>

                    <div className="flex items-center gap-2 shrink-0">
                      {/* Reading progress: Circular progress + page fraction */}
                      <div className="flex items-center gap-1.5 text-[10px] font-mono text-stone-400 group-hover:text-stone-600 dark:group-hover:text-stone-300 transition-colors">
                        {book.totalPages && book.totalPages > 1 && (
                          <span className="hidden sm:inline-block">
                            {currentPage}/{totalPages}
                          </span>
                        )}

                        {/* Circular Progress Gauge */}
                        <div className="relative w-6 h-6 flex items-center justify-center" title={`${percent}% read (${currentPage}/${totalPages} pages)`}>
                          <svg className="w-6 h-6 -rotate-90 transform" viewBox="0 0 24 24">
                            {/* Track */}
                            <circle
                              cx="12"
                              cy="12"
                              r={radius}
                              stroke="currentColor"
                              strokeWidth="2"
                              fill="none"
                              className="text-stone-200 dark:text-stone-700/60"
                            />
                            {/* Fill */}
                            <circle
                              cx="12"
                              cy="12"
                              r={radius}
                              stroke="currentColor"
                              strokeWidth="2"
                              strokeDasharray={circumference}
                              strokeDashoffset={strokeDashoffset}
                              strokeLinecap="round"
                              fill="none"
                              className={isActive ? 'text-[#fa5d19]' : 'text-stone-400 dark:text-stone-500'}
                            />
                          </svg>
                          <span className="absolute text-[8px] font-mono font-medium leading-none">
                            {percent}
                          </span>
                        </div>
                      </div>

                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          deleteBook(book.id);
                        }}
                        className="opacity-0 group-hover:opacity-100 p-1 rounded text-stone-400 hover:text-red-500 hover:bg-red-500/10 transition-all"
                        title="Delete"
                      >
                        <Trash2 size={12} />
                      </button>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </>
      )}

      {/* Tab Content 2: Folder Tree */}
      {activeSidebarTab === 'folders' && (
        <div className="flex-1 overflow-y-auto px-2 py-2">
          <FolderTree onSelectFolder={() => setActiveSidebarTab('documents')} />
        </div>
      )}

      {/* Tab Content 3: Global Notes */}
      {activeSidebarTab === 'notes' && (
        <div className="flex-1 overflow-y-auto p-3 space-y-2 text-xs">
          <div className="text-[10px] font-semibold text-stone-400 uppercase tracking-wider px-1">
            Global Notes Across Books ({globalNotes.length})
          </div>
          {globalNotes.length === 0 ? (
            <p className="text-stone-400 text-center py-6 text-xs">
              No sticky notes added yet. Click Sticky Note while viewing any page to annotate!
            </p>
          ) : (
            globalNotes.map((note) => (
              <div
                key={note.id}
                onClick={() => {
                  selectBook(note.bookId);
                  changePage(note.page);
                }}
                className="p-2.5 rounded-lg border border-stone-200 dark:border-stone-800 bg-amber-500/10 hover:border-amber-500 cursor-pointer transition-colors"
              >
                <div className="flex items-center justify-between text-[10px] font-medium text-amber-600 dark:text-amber-400 mb-1">
                  <span className="truncate">{note.bookTitle}</span>
                  <span>Page {note.page}</span>
                </div>
                <p className="text-stone-700 dark:text-stone-200 line-clamp-2">
                  {note.text}
                </p>
              </div>
            ))
          )}
        </div>
      )}

      {/* User Session Profile Footer */}
      {user && (
        <div className="px-3 py-2.5 border-t border-stone-200/50 dark:border-stone-800/50 flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 min-w-0">
            {user.picture ? (
              <img
                src={user.picture}
                alt={user.name || 'Avatar'}
                referrerPolicy="no-referrer"
                className="w-7 h-7 rounded-full object-cover ring-1 ring-stone-200 dark:ring-stone-700 shrink-0"
              />
            ) : (
              <div className="w-7 h-7 rounded-full bg-[#fa5d19] flex items-center justify-center text-white text-xs font-semibold shrink-0">
                <User size={13} />
              </div>
            )}
            
            <div className="min-w-0">
              <p className="text-xs font-medium truncate text-stone-800 dark:text-stone-200">
                {user.name || 'User'}
              </p>
            </div>
          </div>

          <button
            onClick={logout}
            className="p-1.5 rounded-lg text-stone-400 hover:text-red-500 hover:bg-stone-100 dark:hover:bg-stone-800 transition-colors"
            title="Log out"
          >
            <LogOut size={14} />
          </button>
        </div>
      )}
    </div>
  );
};

export default DocumentSidebar;
