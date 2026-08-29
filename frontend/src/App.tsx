import { useEffect } from 'react';
import {
  BookOpen,
  ShieldAlert,
  Menu,
  Tag,
  RefreshCw,
  CheckCircle,
  Sparkles,
  Flame,
  LogOut,
} from 'lucide-react';

import DocumentSidebar from './components/DocumentSidebar';
import PDFReader from './components/PDFReader';
import AnnotationPanel from './components/AnnotationPanel';
import LoadingScreen from './components/LoadingScreen';
import { useAuth } from './hooks/useAuth';
import { useBooks } from './hooks/useBooks';
import { useUI } from './hooks/useUI';
import { Book, SyncData, BookProgress } from './types';
import { emptyProgress } from './utils/helpers';

// Components that were extracted from App.tsx
import SignInScreen from './components/SignInScreen';
import MainApp from './components/MainApp';

export default function App() {
  // Hooks for different concerns
  const {
    user,
    needsAuth,
    loadingInit,
    actionError: authActionError,
    handleLogin,
    handleLogout,
  } = useAuth();

  const {
    books,
    activeBookId,
    activeBookBytes,
    activeBookPage,
    syncFileId,
    syncData,
    isSaving,
    loadingLibrary,
    loadingBookData,
    actionError: bookActionError,
    handleSelectBook,
    handleUploadBook,
    handleDeleteBook,
    updateBookStats,
    // Derived state from useBooks
    activeStats,
    currentHighlights,
    currentNotes,
    currentInkStrokes,
    currentShapes,
    currentTextBoxes,
  } = useBooks();

  const {
    sidebarOpen,
    setSidebarOpen,
    annotationsOpen,
    setAnnotationsOpen,
    darkMode,
    setDarkMode,
  } = useUI();

  // Combine action errors
  const actionError = authActionError || bookActionError;

  // Load library data on auth change
  useEffect(() => {
    if (!needsAuth && !loadingInit && user) {
      // This would be handled by useAuth, but we keep it for compatibility
      // In a real app, this might be handled differently
    }
  }, [needsAuth, loadingInit, user]);

  // Render appropriate screen based on auth state
  if (loadingInit) {
    return <LoadingScreen />;
  }

  if (needsAuth) {
    return (
      <SignInScreen
        darkMode={darkMode}
        setDarkMode={setDarkMode}
        actionError={actionError}
        handleLogin={handleLogin}
      />
    );
  }

  return (
    <MainApp
      user={user}
      books={books}
      activeBookId={activeBookId}
      activeBookBytes={activeBookBytes}
      activeBookPage={activeBookPage}
      syncFileId={syncFileId}
      syncData={syncData}
      isSaving={isSaving}
      loadingLibrary={loadingLibrary}
      loadingBookData={loadingBookData}
      actionError={actionError}
      sidebarOpen={sidebarOpen}
      setSidebarOpen={setSidebarOpen}
      annotationsOpen={annotationsOpen}
      setAnnotationsOpen={setAnnotationsOpen}
      darkMode={darkMode}
      setDarkMode={setDarkMode}
      handleLogin={handleLogin}
      handleLogout={handleLogout}
      handleSelectBook={handleSelectBook}
      handleUploadBook={handleUploadBook}
      handleDeleteBook={handleDeleteBook}
      updateBookStats={updateBookStats}
      // Derived state
      activeStats={activeStats}
      currentHighlights={currentHighlights}
      currentNotes={currentNotes}
      currentInkStrokes={currentInkStrokes}
      currentShapes={currentShapes}
      currentTextBoxes={currentTextBoxes}
      // Helper functions
      emptyProgress={emptyProgress}
    />
  );
}