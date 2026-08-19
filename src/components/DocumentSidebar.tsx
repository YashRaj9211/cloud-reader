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
} from 'lucide-react';
import { Book } from '../types';

interface DocumentSidebarProps {
  books: Book[];
  activeBookId: string | null;
  onSelectBook: (id: string) => void;
  onUploadBook: (file: File) => Promise<void>;
  onDeleteBook: (id: string) => void;
  user: any;
  onLogout: () => void;
  darkMode: boolean;
  onToggleDarkMode: () => void;
}

export default function DocumentSidebar({
  books,
  activeBookId,
  onSelectBook,
  onUploadBook,
  onDeleteBook,
  user,
  onLogout,
  darkMode,
  onToggleDarkMode,
}: DocumentSidebarProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [isDragging, setIsDragging] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Filter books matching search
  const filteredBooks = books.filter((book) =>
    book.name.toLowerCase().includes(searchQuery.toLowerCase())
  );

  // File Upload Handlers
  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0];
      await triggerUpload(file);
    }
  };

  const triggerUpload = async (file: File) => {
    if (file.type !== 'application/pdf' && !file.name.endsWith('.pdf')) {
      setUploadError('Only PDF files are supported.');
      return;
    }
    setUploadError(null);
    setUploading(true);
    try {
      await onUploadBook(file);
    } catch (err: any) {
      console.error(err);
      setUploadError(err.message || 'Error uploading file.');
    } finally {
      setUploading(false);
    }
  };

  // Drag and Drop Zone Management
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
      const file = e.dataTransfer.files[0];
      await triggerUpload(file);
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
    <div className="w-80 h-full flex flex-col border-r border-[var(--color-outline-variant)] bg-[var(--color-surface)] text-[var(--color-on-surface)] transition-colors duration-300">
      {/* App Branding & Theme toggle */}
      <div className="p-5 border-b border-[var(--color-outline-variant)] flex items-center justify-between">
        <div className="flex items-center space-x-2.5">
          <div className="p-1.5 rounded-lg bg-[#fa5d19]/10 text-[#fa5d19]">
            <Flame size={20} />
          </div>
          <div>
            <h1 className="text-base font-bold tracking-tight text-[var(--color-on-surface)] leading-none">Cloud PDF</h1>
            <span className="text-[10px] font-mono text-zinc-400">Context Workspace</span>
          </div>
        </div>

        {/* Dark Mode toggle */}
        <button
          onClick={onToggleDarkMode}
          className="btn-secondary !h-8 !w-8 !p-0"
          title={darkMode ? 'Switch to Light Mode' : 'Switch to Dark Mode'}
        >
          {darkMode ? <Sun size={15} /> : <Moon size={15} />}
        </button>
      </div>

      {/* Upload Box Dropzone */}
      <div className="p-4">
        <div
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
          onClick={() => fileInputRef.current?.click()}
          className={`h-24 border-2 border-dashed rounded-xl flex flex-col items-center justify-center p-3 text-center cursor-pointer transition-all duration-200 ${
            isDragging 
              ? 'border-[#fa5d19] bg-[#fa5d19]/10' 
              : 'border-[var(--color-outline-variant)] hover:border-[#fa5d19] hover:bg-[#fa5d19]/[0.03]'
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
            <div className="flex flex-col items-center space-y-2">
              <div className="animate-spin rounded-full h-5 w-5 border-2 border-[#fa5d19] border-t-transparent" />
              <span className="text-[11px] font-medium text-zinc-400 animate-pulse">Uploading to Drive…</span>
            </div>
          ) : (
            <>
              <UploadCloud size={20} className="text-[#fa5d19] mb-1" />
              <span className="text-xs font-semibold text-[var(--color-on-surface)]">Upload PDF File</span>
              <span className="text-[10px] text-zinc-400 mt-0.5">Drag & drop or browse</span>
            </>
          )}
        </div>
        {uploadError && (
          <p className="mt-2 text-[10px] text-red-500 font-medium text-center">{uploadError}</p>
        )}
      </div>

      {/* Document Directory Filter Search */}
      <div className="px-4 pb-2">
        <div className="relative">
          <Search className="absolute left-3 top-2.5 text-zinc-400" size={14} />
          <input
            type="text"
            placeholder="Search documents…"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="input-field w-full pl-9 pr-4 !py-1.5 text-xs"
          />
        </div>
      </div>

      {/* Scrollable Books directory lists */}
      <div className="flex-1 overflow-y-auto px-4 py-2 space-y-1.5 custom-scrollbar">
        <div className="flex items-center justify-between px-1 mb-2">
          <span className="text-[10px] font-semibold text-zinc-400 tracking-wider uppercase">
            Library ({filteredBooks.length})
          </span>
        </div>

        {filteredBooks.length === 0 ? (
          <div className="py-8 text-center flex flex-col items-center justify-center">
            <FileText size={30} className="text-zinc-400/50 mb-2" />
            <p className="text-xs text-zinc-500 font-medium">No PDF documents found</p>
            <p className="text-[10px] text-zinc-400 mt-1">Upload a PDF to sync annotations.</p>
          </div>
        ) : (
          filteredBooks.map((book) => {
            const isActive = book.id === activeBookId;
            const progressPct = book.totalPages > 0 
              ? Math.max(0, Math.min(100, Math.round((book.currentPage / book.totalPages) * 100)))
              : 0;
            
            return (
              <div
                key={book.id}
                onClick={() => onSelectBook(book.id)}
                className={`group p-3 rounded-xl cursor-pointer relative flex flex-col transition-all duration-150 border ${
                  isActive
                    ? 'bg-[#fa5d19]/10 text-[var(--color-on-surface)] border-[#fa5d19]/40 shadow-xs'
                    : 'bg-transparent border-transparent hover:bg-[var(--color-surface-container-high)] text-[var(--color-on-surface)]'
                }`}
              >
                {/* Title & Size */}
                <div className="flex items-start justify-between gap-2">
                  <div className="flex-1 min-w-0 pr-6">
                    <h3 className="text-xs font-semibold truncate leading-tight" title={book.name}>
                      {book.name.replace(/\.[^/.]+$/, '')}
                    </h3>
                    <span className="text-[10px] text-zinc-400 font-mono mt-0.5 block">
                      {formatSize(book.size)}
                    </span>
                  </div>

                  {/* Deletion button */}
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      onDeleteBook(book.id);
                    }}
                    id={`deleteDoc-${book.id}`}
                    name="deleteDoc"
                    className="absolute right-3 top-3 opacity-0 group-hover:opacity-100 p-1.5 rounded-lg text-zinc-400 hover:text-red-500 hover:bg-red-500/10 transition-all"
                    title="Remove book from Library"
                  >
                    <Trash2 size={13} />
                  </button>
                </div>

                {/* Progress bar */}
                <div className="mt-3">
                  <div className="flex justify-between items-center text-[9px] font-mono text-zinc-400 mb-1">
                    <span>
                      {book.currentPage > 0 ? `Page ${book.currentPage} / ${book.totalPages}` : 'Unread'}
                    </span>
                    <span>{progressPct}%</span>
                  </div>

                  <div className="h-1 w-full rounded-full overflow-hidden bg-[var(--color-surface-container-high)]">
                    <div 
                      className="bg-[#fa5d19] h-full rounded-full transition-all duration-300"
                      style={{ width: `${progressPct}%` }}
                    />
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* User Session profile Footer */}
      {user && (
        <div className="p-4 border-t border-[var(--color-outline-variant)] bg-[var(--color-surface-container-lowest)] flex items-center justify-between gap-3">
          <div className="flex items-center space-x-2.5 min-w-0">
            {user.photoURL ? (
              <img
                src={user.photoURL}
                alt={user.displayName || 'Avatar'}
                referrerPolicy="no-referrer"
                className="w-8 h-8 rounded-full ring-1 ring-[var(--color-outline-variant)]"
              />
            ) : (
              <div className="w-8 h-8 rounded-full bg-[#fa5d19] flex items-center justify-center text-white text-xs font-semibold">
                <User size={14} />
              </div>
            )}
            
            <div className="min-w-0">
              <p className="text-xs font-semibold truncate leading-tight text-[var(--color-on-surface)]">
                {user.displayName || 'Authorized User'}
              </p>
              <p className="text-[10px] text-zinc-400 font-mono truncate leading-tight mt-0.5">
                {user.email}
              </p>
            </div>
          </div>

          <button
            onClick={onLogout}
            className="btn-secondary !h-8 !w-8 !p-0 text-zinc-400 hover:text-red-500"
            title="Disconnect Google Sync"
          >
            <LogOut size={15} />
          </button>
        </div>
      )}
    </div>
  );
}
