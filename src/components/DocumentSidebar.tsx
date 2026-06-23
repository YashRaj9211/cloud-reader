import React, { useRef, useState } from 'react';
import { 
  FileText, 
  Trash2, 
  Search, 
  UploadCloud, 
  BookOpen, 
  User, 
  LogOut,
  Moon,
  Sun
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
    <div className={`w-80 h-full flex flex-col border-r transition-colors duration-300 ${
      darkMode 
        ? 'bg-zinc-900 border-zinc-800 text-zinc-100' 
        : 'bg-zinc-50 border-zinc-200 text-zinc-900'
    }`}>
      {/* App Branding & Theme toggle */}
      <div className={`p-6 border-b flex items-center justify-between ${
        darkMode ? 'border-zinc-800' : 'border-zinc-200'
      }`}>
        <div className="flex items-center space-x-2.5">
          <BookOpen className="text-amber-500" size={24} />
          <h1 className="text-lg font-semibold tracking-tight font-sans">Cloud PDF</h1>
        </div>

        {/* Dark Mode toggle */}
        <button
          onClick={onToggleDarkMode}
          className={`p-2 rounded-lg border transition-colors ${
            darkMode 
              ? 'border-zinc-800 hover:bg-zinc-800 text-zinc-400' 
              : 'border-zinc-200 hover:bg-zinc-100 text-zinc-600'
          }`}
          title={darkMode ? 'Switch to Light Mode' : 'Switch to Dark Mode'}
        >
          {darkMode ? <Sun size={16} /> : <Moon size={16} />}
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
              ? 'border-amber-500 bg-amber-50/10' 
              : darkMode 
                ? 'border-zinc-800 hover:border-zinc-700 hover:bg-zinc-800/20' 
                : 'border-zinc-200 hover:border-amber-400 hover:bg-amber-500/[0.02]'
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
              <div className="animate-spin rounded-full h-5 w-5 border-2 border-amber-500 border-t-transparent" />
              <span className="text-[11px] font-medium text-zinc-400 animate-pulse font-sans">Uploading to Google Drive...</span>
            </div>
          ) : (
            <>
              <UploadCloud size={22} className="text-amber-500/80 mb-1" />
              <span className="text-xs font-medium">Upload PDF Book</span>
              <span className="text-[10px] text-zinc-400 mt-0.5">Drag & drop or Click to browse</span>
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
            placeholder="Search documents..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className={`w-full pl-9 pr-4 py-2 text-xs rounded-xl border focus:outline-none focus:ring-1 focus:ring-amber-500 transition-colors ${
              darkMode 
                ? 'bg-zinc-800/60 border-zinc-700 text-zinc-100 placeholder-zinc-500' 
                : 'bg-white border-zinc-200 text-zinc-800 placeholder-zinc-400'
            }`}
          />
        </div>
      </div>

      {/* Scrollable Books directory lists list */}
      <div className="flex-1 overflow-y-auto px-4 py-2 space-y-1.5 custom-scrollbar">
        <span className="text-[10px] font-semibold text-zinc-400/80 tracking-wider uppercase block px-1 mb-2">
          Your Library ({filteredBooks.length})
        </span>

        {filteredBooks.length === 0 ? (
          <div className="py-8 text-center flex flex-col items-center justify-center">
            <FileText size={32} className="text-zinc-400/55 mb-2" />
            <p className="text-xs text-zinc-500 font-sans">No book PDF found</p>
            <p className="text-[10px] text-zinc-400/70 mt-1">Upload a book file to start synchronizing.</p>
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
                className={`group p-3 rounded-xl cursor-pointer relative flex flex-col transition-all duration-200 ${
                  isActive
                    ? 'bg-amber-100 dark:bg-amber-950 text-amber-900 dark:text-amber-100 border border-amber-200 dark:border-amber-900/60 shadow-xs'
                    : darkMode 
                      ? 'hover:bg-zinc-800/50 border border-transparent text-zinc-300' 
                      : 'hover:bg-zinc-100 border border-transparent text-zinc-700'
                }`}
              >
                {/* Title & Size */}
                <div className="flex items-start justify-between gap-2">
                  <div className="flex-1 min-w-0 pr-6">
                    <h3 className="text-xs font-semibold truncate leading-tight font-sans" title={book.name}>
                      {book.name.replace(/\.[^/.]+$/, '')}
                    </h3>
                    <span className="text-[10px] text-zinc-400 font-mono mt-0.5 block">
                      {formatSize(book.size)}
                    </span>
                  </div>

                  {/* Deletion confirmation button */}
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      onDeleteBook(book.id);
                    }}
                    id={`deleteDoc-${book.id}`}
                    name="deleteDoc"
                    className={`absolute right-3 top-3 opacity-0 group-hover:opacity-100 p-1.5 rounded-lg transition-all ${
                      isActive 
                        ? 'hover:bg-amber-200 dark:hover:bg-amber-900 hover:text-red-500 text-amber-700 dark:text-amber-300'
                        : 'hover:bg-zinc-200 dark:hover:bg-zinc-800 hover:text-red-500 text-zinc-400'
                    }`}
                    title="Remove book from Library"
                  >
                    <Trash2 size={13} />
                  </button>
                </div>

                {/* Progress bar info layout */}
                <div className="mt-3">
                  <div className="flex justify-between items-center text-[9px] font-mono text-zinc-400 dark:text-zinc-500 mb-1">
                    <span>
                      {book.currentPage > 0 ? `Page ${book.currentPage} / ${book.totalPages}` : 'Not read yet'}
                    </span>
                    <span>{progressPct}%</span>
                  </div>

                  <div className={`h-1 w-full rounded-full overflow-hidden ${
                    darkMode ? 'bg-zinc-800' : 'bg-zinc-200'
                  }`}>
                    <div 
                      className="bg-amber-500 h-full rounded-full transition-all duration-300"
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
        <div className={`p-4 border-t flex items-center justify-between gap-3 ${
          darkMode ? 'border-zinc-800 bg-zinc-950/40' : 'border-zinc-200 bg-zinc-100/40'
        }`}>
          <div className="flex items-center space-x-2.5 min-w-0">
            {user.photoURL ? (
              <img
                src={user.photoURL}
                alt={user.displayName || 'Avatar'}
                referrerPolicy="no-referrer"
                className="w-8 h-8 rounded-full ring-1 ring-zinc-200 dark:ring-zinc-800"
              />
            ) : (
              <div className="w-8 h-8 rounded-full bg-amber-500 flex items-center justify-center text-white text-xs font-semibold">
                <User size={14} />
              </div>
            )}
            
            <div className="min-w-0">
              <p className="text-xs font-semibold truncate leading-tight">
                {user.displayName || 'Authorized User'}
              </p>
              <p className="text-[10px] text-zinc-400 font-mono truncate leading-tight mt-0.5">
                {user.email}
              </p>
            </div>
          </div>

          <button
            onClick={onLogout}
            className={`p-2 rounded-lg transition-colors ${
              darkMode ? 'hover:bg-zinc-800 text-zinc-400' : 'hover:bg-zinc-100 text-zinc-600'
            }`}
            title="Disconnect Google Sync"
          >
            <LogOut size={16} />
          </button>
        </div>
      )}
    </div>
  );
}
