import { useState, useCallback } from 'react';
import { Book, BookProgress, SyncData } from '../types';
import {
  fetchLibrary,
  fetchBookBytes,
  uploadBookFile,
  deleteBookFile,
  updateBookProgress,
} from '../lib/api';
import { emptyProgress } from '../utils/helpers';

/**
 * Custom hook for book and library operations
 * @returns Object containing book state and handler functions
 */
export function useBooks() {
  const [books, setBooks] = useState<Book[]>([]);
  const [activeBookId, setActiveBookId] = useState<string | null>(null);
  const [activeBookBytes, setActiveBookBytes] = useState<ArrayBuffer | null>(null);
  const [activeBookPage, setActiveBookPage] = useState<number>(1);
  const [syncFileId, setSyncFileId] = useState<string | null>(null);
  const [syncData, setSyncData] = useState<SyncData>({ books: {} });
  const [isSaving, setIsSaving] = useState<boolean>(false);
  const [loadingLibrary, setLoadingLibrary] = useState<boolean>(false);
  const [loadingBookData, setLoadingBookData] = useState<boolean>(false);
  const [actionError, setActionError] = useState<string | null>(null);

  // Load library data
  const loadFullLibraryData = useCallback(async () => {
    setLoadingLibrary(true);
    setActionError(null);
    try {
      const data = await fetchLibrary();
      setBooks(data.books || []);
      setSyncData(data.syncData || { books: {} });
      if (data.syncFileId) {
        setSyncFileId(data.syncFileId);
      }

      if (data.books && data.books.length > 0) {
        const sorted = [...data.books].sort((a, b) => {
          const tA = a.lastReadTime ? new Date(a.lastReadTime).getTime() : 0;
          const tB = b.lastReadTime ? new Date(b.lastReadTime).getTime() : 0;
          return tB - tA;
        });
        const target = sorted[0];
        setActiveBookId(target.id);
        setActiveBookPage(target.currentPage || 1);
        await selectAndLoadBookBytes(target.id, data.syncData);
      }
    } catch (err: any) {
      console.error('Library loading error:', err);
      setActionError(err.message || 'Error loading Google Drive components.');
    } finally {
      setLoadingLibrary(false);
    }
  }, []);

  // Select and load book bytes
  const selectAndLoadBookBytes = useCallback(async (bookId: string, customSyncData?: SyncData) => {
    setLoadingBookData(true);
    setActionError(null);
    try {
      const bytes = await fetchBookBytes(bookId);
      setActiveBookBytes(bytes);
      const activeSync = customSyncData || syncData;
      const cached = activeSync.books[bookId];
      setActiveBookPage(cached?.currentPage || 1);
    } catch (err: any) {
      console.error('Error fetching book bytes:', err);
      setActionError('Could not download file. Click retry to refresh.');
    } finally {
      setLoadingBookData(false);
    }
  }, [syncData]);

  // Handle book selection
  const handleSelectBook = useCallback(async (bookId: string) => {
    // Note: Sidebar state should be handled by the component
    if (bookId === activeBookId) return;
    setActiveBookId(bookId);
    setActiveBookBytes(null);
    await selectAndLoadBookBytes(bookId);
  }, [activeBookId, selectAndLoadBookBytes]);

  // Handle book upload
  const handleUploadBook = useCallback(async (file: File) => {
    const newBook = await uploadBookFile(file);
    const initialStats = emptyProgress();
    const nextSyncData: SyncData = {
      ...syncData,
      books: { ...syncData.books, [newBook.id]: initialStats },
    };
    setSyncData(nextSyncData);
    setBooks((prev) => [newBook, ...prev]);
    setActiveBookId(newBook.id);
    setActiveBookPage(1);
    // Note: Sidebar state should be handled by the component
    await selectAndLoadBookBytes(newBook.id, nextSyncData);
  }, [syncData, selectAndLoadBookBytes]);

  // Handle book deletion
  const handleDeleteBook = useCallback(async (bookId: string) => {
    const title = books.find((b) => b.id === bookId)?.name || 'this book';
    if (!window.confirm(`Permanently delete "${title}" from Google Drive?`)) return;
    setLoadingLibrary(true);
    try {
      await deleteBookFile(bookId);
      const nextSync = { ...syncData };
      delete nextSync.books[bookId];
      setSyncData(nextSync);
      if (activeBookId === bookId) {
        setActiveBookId(null);
        setActiveBookBytes(null);
      }
      setBooks((prev) => prev.filter((b) => b.id !== bookId));
    } catch (err: any) {
      setActionError('Error deleting document: ' + err.message);
    } finally {
      setLoadingLibrary(false);
    }
  }, [books, activeBookId, syncData]);

  // Generic annotation updater
  const updateBookStats = useCallback(async (
    bookId: string,
    updater: (prev: BookProgress) => BookProgress
  ) => {
    const current = syncData.books[bookId] || emptyProgress(activeBookPage);
    const next = updater({ ...current });
    const updated: SyncData = {
      ...syncData,
      books: { ...syncData.books, [bookId]: next },
    };
    setSyncData(updated);

    setIsSaving(true);
    try {
      await updateBookProgress(bookId, next);
    } catch (err) {
      console.error('Sync failed:', err);
    } finally {
      setIsSaving(false);
    }
  }, [syncData, activeBookPage]);

  // Derived state
  const activeStats = activeBookId ? syncData.books[activeBookId] : null;
  const currentHighlights = activeStats?.highlights || [];
  const currentNotes = activeStats?.notes || [];
  const currentInkStrokes = activeStats?.inkStrokes || [];
  const currentShapes = activeStats?.shapes || [];
  const currentTextBoxes = activeStats?.textBoxes || [];

  return {
    // State
    books,
    setBooks,
    activeBookId,
    activeBookBytes,
    activeBookPage,
    syncFileId,
    syncData,
    isSaving,
    loadingLibrary,
    loadingBookData,
    actionError,

    // Derived state
    activeStats,
    currentHighlights,
    currentNotes,
    currentInkStrokes,
    currentShapes,
    currentTextBoxes,

    // Handlers
    loadFullLibraryData,
    selectAndLoadBookBytes,
    handleSelectBook,
    handleUploadBook,
    handleDeleteBook,
    updateBookStats,

    // Setters
    setActiveBookId,
    setActiveBookBytes,
    setActiveBookPage,
    setSyncData,
    setIsSaving,
    setLoadingLibrary,
    setLoadingBookData,
    setActionError,
  };
}