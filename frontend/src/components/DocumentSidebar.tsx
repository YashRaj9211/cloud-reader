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
    <div className="w-full sm:w-80 md:w-80 h-full flex flex-col border-r border-stone-200 dark:border-stone-800 bg-white dark:bg-stone-900 text-stone-900 dark:text-stone-100 transition-colors duration-300">
      {/* App Branding & Theme toggle */}
      <div className="p-4 sm:p-4.5 border-b border-stone-200 dark:border-stone-800 flex items-center justify-between">
        <div className="flex items-center space-x-2.5">
          <div className="p-1.5 rounded-lg bg-[#fa5d19]/10 text-[#fa5d19]">
            <Flame size={20} />
          </div>
          <div>
            <h1 className="text-base font-bold tracking-tight text-stone-900 dark:text-stone-100 leading-none">
              Cloud PDF
            </h1>
            <span className="text-[10px] font-mono text-stone-400">Library & Drive</span>
          </div>
        </div>

        <div className="flex items-center gap-1.5">
          <Button
            variant="ghost"
            size="xs"
            onClick={toggleDarkMode}
            title={darkMode ? 'Switch to Light Mode' : 'Switch to Dark Mode'}
            className="!p-1.5"
          >
            {darkMode ? <Sun size={15} /> : <Moon size={15} />}
          </Button>

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

      {/* Tabs: Documents | Folders | Notes */}
      <div className="grid grid-cols-3 border-b border-stone-200 dark:border-stone-800 bg-stone-50/50 dark:bg-stone-950/40 text-xs">
        <button
          onClick={() => setActiveSidebarTab('documents')}
          className={`py-2 text-center font-medium border-b-2 transition-colors flex items-center justify-center gap-1 ${
            activeSidebarTab === 'documents'
              ? 'border-[#fa5d19] text-[#fa5d19]'
              : 'border-transparent text-stone-500 hover:text-stone-800 dark:hover:text-stone-200'
          }`}
        >
          <FileText className="w-3.5 h-3.5" />
          <span>Files</span>
        </button>
        <button
          onClick={() => setActiveSidebarTab('folders')}
          className={`py-2 text-center font-medium border-b-2 transition-colors flex items-center justify-center gap-1 ${
            activeSidebarTab === 'folders'
              ? 'border-[#fa5d19] text-[#fa5d19]'
              : 'border-transparent text-stone-500 hover:text-stone-800 dark:hover:text-stone-200'
          }`}
        >
          <FolderIcon className="w-3.5 h-3.5" />
          <span>Folders</span>
        </button>
        <button
          onClick={() => setActiveSidebarTab('notes')}
          className={`py-2 text-center font-medium border-b-2 transition-colors flex items-center justify-center gap-1 ${
            activeSidebarTab === 'notes'
              ? 'border-[#fa5d19] text-[#fa5d19]'
              : 'border-transparent text-stone-500 hover:text-stone-800 dark:hover:text-stone-200'
          }`}
        >
          <StickyNote className="w-3.5 h-3.5" />
          <span>Notes</span>
        </button>
      </div>

      {/* Tab Content 1: Documents list */}
      {activeSidebarTab === 'documents' && (
        <>
          {/* Upload Dropzone */}
          <div className="p-3.5">
            <div
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
              onDrop={handleDrop}
              onClick={() => fileInputRef.current?.click()}
              className={`h-20 border-2 border-dashed rounded-xl flex flex-col items-center justify-center p-2 text-center cursor-pointer transition-all duration-200 ${
                isDragging 
                  ? 'border-[#fa5d19] bg-[#fa5d19]/10' 
                  : 'border-stone-200 dark:border-stone-800 hover:border-[#fa5d19] hover:bg-[#fa5d19]/[0.03]'
              }`}
            >
              <input
                type="file"
                ref={fileInputRef}
                onChange={handleFileChange}
                accept=".pdf"
                className="hidden"
              />
              {uploading ? (
                <div className="flex flex-col items-center space-y-1">
                  <div className="animate-spin rounded-full h-4 w-4 border-2 border-[#fa5d19] border-t-transparent" />
                  <span className="text-[11px] font-medium text-stone-400">Uploading to Drive…</span>
                </div>
              ) : (
                <>
                  <UploadCloud size={18} className="text-[#fa5d19] mb-0.5" />
                  <span className="text-xs font-semibold text-stone-900 dark:text-stone-100">Upload PDF File</span>
                  <span className="text-[10px] text-stone-400">Drag & drop or browse</span>
                </>
              )}
            </div>
            {uploadError && (
              <p className="mt-1.5 text-[10px] text-red-500 font-medium text-center">{uploadError}</p>
            )}
          </div>

          {/* Search bar */}
          <div className="px-3.5 pb-2">
            <div className="relative">
              <Search className="absolute left-3 top-2 text-stone-400" size={13} />
              <input
                type="text"
                placeholder="Search library documents…"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full bg-stone-100 dark:bg-stone-800/80 border border-stone-200 dark:border-stone-700 rounded-lg pl-8 pr-3 py-1.5 text-xs text-stone-900 dark:text-stone-100 focus:outline-none focus:border-[#fa5d19]"
              />
            </div>
          </div>

          {/* Book List */}
          <div className="flex-1 overflow-y-auto px-3 py-1 space-y-2">
            {filteredBooks.length === 0 ? (
              <div className="py-8 text-center flex flex-col items-center justify-center">
                <FileText size={28} className="text-stone-400/50 mb-2" />
                <p className="text-xs text-stone-500 font-medium">No PDF documents found</p>
                <p className="text-[10px] text-stone-400 mt-1">Upload a PDF to sync and index for AI.</p>
              </div>
            ) : (
              filteredBooks.map((book) => {
                const isActive = book.id === activeBookId;
                const progressPct = book.totalPages > 0 
                  ? Math.max(0, Math.min(100, Math.round((book.currentPage / book.totalPages) * 100)))
                  : 0;
                const docStatus = indexingStatus[book.id];

                return (
                  <div
                    key={book.id}
                    onClick={() => selectBook(book.id)}
                    className={`group p-2.5 rounded-xl cursor-pointer relative flex flex-col transition-all duration-150 border ${
                      isActive
                        ? 'bg-[#fa5d19]/10 text-stone-900 dark:text-stone-100 border-[#fa5d19]/40 shadow-xs'
                        : 'bg-transparent border-transparent hover:bg-stone-100 dark:hover:bg-stone-800 text-stone-800 dark:text-stone-200'
                    }`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex-1 min-w-0 pr-5">
                        <h3 className="text-xs font-semibold truncate leading-tight" title={book.name}>
                          {book.name.replace(/\.[^/.]+$/, '')}
                        </h3>
                        <span className="text-[10px] text-stone-400 font-mono mt-0.5 block">
                          {formatSize(book.size)}
                        </span>
                      </div>

                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          deleteBook(book.id);
                        }}
                        className="opacity-0 group-hover:opacity-100 p-1 rounded-md text-stone-400 hover:text-red-500 hover:bg-red-500/10 transition-all"
                        title="Delete document"
                      >
                        <Trash2 size={13} />
                      </button>
                    </div>

                    {/* Progress Bar & Index status badge */}
                    <div className="mt-2.5 space-y-1.5">
                      <div className="flex justify-between items-center text-[9px] font-mono text-stone-400">
                        <span>{book.currentPage > 0 ? `Page ${book.currentPage} / ${book.totalPages}` : 'Unread'}</span>
                        <span>{progressPct}%</span>
                      </div>
                      <div className="h-1 w-full rounded-full overflow-hidden bg-stone-200 dark:bg-stone-700">
                        <div 
                          className="bg-[#fa5d19] h-full rounded-full transition-all duration-300"
                          style={{ width: `${progressPct}%` }}
                        />
                      </div>

                      <div className="pt-1 flex items-center justify-between">
                        <IndexingProgressBar
                          status={docStatus}
                          onStartIndexing={() => startIndexing(book.id)}
                        />
                      </div>
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
        <div className="p-3.5 border-t border-stone-200 dark:border-stone-800 bg-stone-50 dark:bg-stone-950/60 flex items-center justify-between gap-3">
          <div className="flex items-center space-x-2.5 min-w-0">
            {user.picture ? (
              <img
                src={user.picture}
                alt={user.name || 'Avatar'}
                referrerPolicy="no-referrer"
                className="w-8 h-8 rounded-full ring-1 ring-stone-200 dark:ring-stone-700"
              />
            ) : (
              <div className="w-8 h-8 rounded-full bg-[#fa5d19] flex items-center justify-center text-white text-xs font-semibold">
                <User size={14} />
              </div>
            )}
            
            <div className="min-w-0">
              <p className="text-xs font-semibold truncate leading-tight text-stone-900 dark:text-stone-100">
                {user.name || 'Google User'}
              </p>
              <p className="text-[10px] text-stone-400 font-mono truncate leading-tight mt-0.5">
                {user.email}
              </p>
            </div>
          </div>

          <button
            onClick={logout}
            className="p-1.5 rounded-lg text-stone-400 hover:text-red-500 hover:bg-stone-100 dark:hover:bg-stone-800 transition-colors"
            title="Disconnect Google Sync"
          >
            <LogOut size={15} />
          </button>
        </div>
      )}
    </div>
  );
};

export default DocumentSidebar;
