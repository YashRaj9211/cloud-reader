import { useState, useEffect, useCallback } from 'react';

/**
 * Custom hook for UI state management
 * @returns Object containing UI state and handler functions
 */
export function useUI() {
  // Responsive initial sidebars
  const [sidebarOpen, setSidebarOpen] = useState<boolean>(() =>
    typeof window !== 'undefined' ? window.innerWidth >= 1024 : false
  );
  const [annotationsOpen, setAnnotationsOpen] = useState<boolean>(() =>
    typeof window !== 'undefined' ? window.innerWidth >= 1280 : false
  );
  const [darkMode, setDarkMode] = useState<boolean>(false);

  // Window resize responsive handler
  useEffect(() => {
    const handleResize = () => {
      if (typeof window !== 'undefined') {
        setSidebarOpen(window.innerWidth >= 1024);
        setAnnotationsOpen(window.innerWidth >= 1280);
      }
    };
    window.addEventListener('resize', handleResize);
    // Initial check
    handleResize();
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  // Dark mode class management
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const root = window.document.documentElement;
      darkMode ? root.classList.add('dark') : root.classList.remove('dark');
    }
  }, [darkMode]);

  return {
    sidebarOpen,
    setSidebarOpen,
    annotationsOpen,
    setAnnotationsOpen,
    darkMode,
    setDarkMode,
  };
}