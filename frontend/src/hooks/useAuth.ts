import { useEffect, useState, useCallback } from 'react';
import { User } from '../types';
import {
  checkAuthSession,
  getGoogleAuthUrl,
  logoutUser,
  setStoredSessionToken,
} from '../lib/api';

/**
 * Custom hook for authentication logic
 * @returns Object containing auth state and handler functions
 */
export function useAuth() {
  const [user, setUser] = useState<User | null>(null);
  const [needsAuth, setNeedsAuth] = useState<boolean>(false);
  const [loadingInit, setLoadingInit] = useState<boolean>(true);
  const [actionError, setActionError] = useState<string | null>(null);

  // Initialize auth on mount
  useEffect(() => {
    const initAuth = async () => {
      // Check query params for OAuth redirect feedback
      const urlParams = new URLSearchParams(window.location.search);
      const tokenParam = urlParams.get('token');
      const authSuccess = urlParams.get('auth_success');
      const authError = urlParams.get('auth_error');

      if (tokenParam) {
        setStoredSessionToken(tokenParam);
      }
      if (tokenParam || authSuccess || authError) {
        window.history.replaceState({}, document.title, window.location.pathname);
      }
      if (authError) {
        setActionError(`Sign-in failed: ${authError}`);
      }

      try {
        const authStatus = await checkAuthSession();
        if (authStatus.authenticated && authStatus.user) {
          setUser(authStatus.user);
          setNeedsAuth(false);
        } else {
          setNeedsAuth(true);
        }
      } catch (err: any) {
        console.error('Auth initialization check failed:', err);
        setNeedsAuth(true);
      } finally {
        setLoadingInit(false);
      }
    };

    initAuth();
  }, []);

  // Handle login
  const handleLogin = useCallback(async () => {
    setLoadingInit(true);
    setActionError(null);
    try {
      const authUrl = await getGoogleAuthUrl();
      window.location.href = authUrl;
    } catch (err: any) {
      const msg = err.message || String(err);
      setActionError(`Sign-in failed: ${msg}`);
      setLoadingInit(false);
    }
  }, []);

  // Handle logout
  const handleLogout = useCallback(async () => {
    if (!window.confirm('Disconnect your Google session?')) return;
    await logoutUser();
    setUser(null);
    setNeedsAuth(true);
    // Note: Other state resets (books, etc.) should be handled by the component
  }, []);

  return {
    user,
    needsAuth,
    loadingInit,
    actionError,
    handleLogin,
    handleLogout,
    setUser,
    setNeedsAuth,
    setLoadingInit,
    setActionError,
  };
}