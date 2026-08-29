// Book service for the Cloud PDF Reader application

import { Book, BookProgress, SyncData } from '../types';
import {
  fetchLibrary,
  fetchBookBytes,
  uploadBookFile,
  deleteBookFile,
  updateBookProgress,
} from '../lib/api';

/**
 * Service for handling book and library operations
 */
export class BookService {
  /**
   * Load library data and set initial state
   * @param setBooks - Callback to set books state
   * @param setSyncData - Callback to set sync data state
   * @param setSyncFileId - Callback to set sync file ID state
   * @param setLoadingLibrary - Callback to set loading library state
   * @param setActionError - Callback to set action error
   * @param setLoadingInit - Callback to set loading init state
   * @param setActiveBookId - Callback to set active book ID state
   * @param setActiveBookPage - Callback to set active book page state
   * @param selectAndLoadBookBytes - Callback to select and load book bytes
   * @returns Promise that resolves when library data is loaded
   */
  static async loadLibraryData(
    setBooks: (books: Book[]) => void,
    setSyncData: (data: SyncData) => void,
    setSyncFileId: (id: string | null) => void,
    setLoadingLibrary: (loading: boolean) => void,
    setActionError: (error: string | null) => void,
    setLoadingInit: (loadingInit: boolean) => void,
    setActiveBookId: (id: string | null) => void,
    setActiveBookPage: (page: number) => void,
    selectAndLoadBookBytes: (bookId: string, customSyncData?: SyncData) => Promise<void>
  ): Promise<void> {
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
      setLoadingInit(false);
    }
  }

  /**
   * Select and load book bytes for a given book ID
   * @param bookId - The ID of the book to load
   * @param setActiveBookBytes - Callback to set active book bytes state
   * @param setLoadingBookData - Callback to set loading book data state
   * @param setActionError - Callback to set action error
   * @param setActiveBookPage - Callback to set active book page state
   * @param syncData - The current sync data
   * @returns Promise that resolves when book bytes are loaded
   */
  static async loadBookBytes(
    bookId: string,
    setActiveBookBytes: (bytes: ArrayBuffer | null) => void,
    setLoadingBookData: (loading: boolean) => void,
    setActionError: (error: string | null) => void,
    setActiveBookPage: (page: number) => void,
    syncData: SyncData
  ): Promise<void> {
    setLoadingBookData(true);
    setActionError(null);
    try {
      const bytes = await fetchBookBytes(bookId);
      setActiveBookBytes(bytes);
      const activeSync = syncData;
      const cached = activeSync.books[bookId];
      setActiveBookPage(cached?.currentPage || 1);
    } catch (err: any) {
      console.error('Error fetching book bytes:', err);
      setActionError('Could not download file. Click retry to refresh.');
    } finally {
      setLoadingBookData(false);
    }
  }

  /**
   * Handle book selection
   * @param bookId - The ID of the book to select
   * @param activeBookId - The currently active book ID
   * @param setActiveBookId - Callback to set active book ID state
   * @param setActiveBookBytes - Callback to set active book bytes state
   * @param setSidebarOpen - Callback to set sidebar open state
   * @param selectAndLoadBookBytes - Callback to select and load book bytes
   * @param window - Window object for width check
   */
  static handleSelectBook(
    bookId: string,
    activeBookId: string | null,
    setActiveBookId: (id: string | null) => void,
    setActiveBookBytes: (bytes: ArrayBuffer | null) => void,
    setSidebarOpen: (open: boolean) => void,
    selectAndLoadBookBytes: (bookId: string, customSyncData?: SyncData) => Promise<void>,
    window: Window & typeof globalThis
  ): void {
    if (window.innerWidth < 1024) {
      setSidebarOpen(false);
    }
    if (bookId === activeBookId) return;
    setActiveBookId(bookId);
    setActiveBookBytes(null);
    selectAndLoadBookBytes(bookId);
  }

  /**
   * Handle book upload
   * @param file - The file to upload
   * @param setBooks - Callback to set books state
   * @param setSyncData - Callback to set sync data state
   * @param setActiveBookId - Callback to set active book ID state
   * @param setActiveBookPage - Callback to set active book page state
   * @param setSidebarOpen - Callback to set sidebar open state
   * @param selectAndLoadBookBytes - Callback to select and load book bytes
   * @param emptyProgress - Function to create empty progress object
   * @param window - Window object for width check
   * @returns Promise that resolves when book is uploaded
   */
  static async handleUploadBook(
    file: File,
    setBooks: (books: Book[]) => void,
    setSyncData: (data: SyncData) => void,
    setActiveBookId: (id: string | null) => void,
    setActiveBookPage: (page: number) => void,
    setSidebarOpen: (open: boolean) => void,
    selectAndLoadBookBytes: (bookId: string, customSyncData?: SyncData) => Promise<void>,
    emptyProgress: (page?: number) => BookProgress,
    window: Window & typeof globalThis
  ): Promise<void> {
    const newBook = await uploadBookFile(file);
    const initialStats = emptyProgress();
    const nextSyncData: SyncData = {
      ...setSyncData.__getState ? undefined : {}, // Placeholder for syncData state
      books: { ...setSyncData.__getState ? undefined : {}, [newBook.id]: initialStats }, // Placeholder
    };
    // We'll need to handle this differently since we don't have direct state access
    // This will be called from within the component where we have access to setters
    setBooks((prev) => [newBook, ...prev]);
    setActiveBookId(newBook.id);
    setActiveBookPage(1);
    if (window.innerWidth < 1024) {
      setSidebarOpen(false);
    }
    await selectAndLoadBookBytes(newBook.id, nextSyncData);
  }

  /**
   * Handle book deletion
   * @param bookId - The ID of the book to delete
   * @param books - The current books array
   * @param setBooks - Callback to set books state
   * @param setSyncData - Callback to set sync data state
   * @param setActiveBookId - Callback to set active book ID state
   * @param setActiveBookBytes - Callback to set active book bytes state
   * @param setLoadingLibrary - Callback to set loading library state
   * @param setActionError - Callback to set action error
   * @param window - Window object for confirm dialog
   * @returns Promise that resolves when book is deleted
   */
  static async handleDeleteBook(
    bookId: string,
    books: Book[],
    setBooks: (books: Book[]) => void,
    setSyncData: (data: SyncData) => void,
    setActiveBookId: (id: string | null) => void,
    setActiveBookBytes: (bytes: ArrayBuffer | null) => void,
    setLoadingLibrary: (loading: boolean) => void,
    setActionError: (error: string | null) => void,
    window: Window & typeof globalThis
  ): Promise<void> {
    const title = books.find((b) => b.id === bookId)?.name || 'this book';
    if (!window.confirm(`Permanently delete "${title}" from Google Drive?`)) return;
    setLoadingLibrary(true);
    try {
      await deleteBookFile(bookId);
      const nextSync = { ...setSyncData.__getState ? undefined : {} }; // Placeholder
      delete nextSync.books[bookId];
      setSyncData(nextSync);
      if (setActiveBookId.__getState?.() === bookId) { // Placeholder
        setActiveBookId(null);
        setActiveBookBytes(null);
      }
      setBooks((prev) => prev.filter((b) => b.id !== bookId));
    } catch (err: any) {
      setActionError('Error deleting document: ' + err.message);
    } finally {
      setLoadingLibrary(false);
    }
  }
}