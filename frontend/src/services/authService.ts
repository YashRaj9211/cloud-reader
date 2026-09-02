// Authentication service for the Cloud PDF Reader application

import { User } from '../types';
import {
  checkAuthSession,
  getGoogleAuthUrl,
  logoutUser,
  setStoredSessionToken,
} from '../lib/api';

/**
 * Service for handling authentication operations
 */
export class AuthService {
  /**
   * Initialize authentication by checking session and handling OAuth redirect
   * @param setUser - Callback to set user state
   * @param setNeedsAuth - Callback to set auth needed state
   * @param setLoadingInit - Callback to set loading init state
   * @param loadFullLibraryData - Callback to load library data
   * @param setActionError - Callback to set action error
   * @returns Promise that resolves when initialization is complete
   */
  static async initAuth(
    setUser: (user: User | null) => void,
    setNeedsAuth: (needsAuth: boolean) => void,
    setLoadingInit: (loadingInit: boolean) => void,
    loadFullLibraryData: () => Promise<void>,
    setActionError: (error: string | null) => void
  ): Promise<void> {
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
        await loadFullLibraryData();
      } else {
        setNeedsAuth(true);
        setLoadingInit(false);
      }
    } catch (err: any) {
      console.error('Auth initialization check failed:', err);
      setNeedsAuth(true);
      setLoadingInit(false);
    }
  }

  /**
   * Handle login by getting Google auth URL and redirecting
   * @param setLoadingInit - Callback to set loading init state
   * @param setActionError - Callback to set action error
   */
  static async handleLogin(
    setLoadingInit: (loadingInit: boolean) => void,
    setActionError: (error: string | null) => void
  ): Promise<void> {
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
  }

  /**
   * Handle logout by calling logout API and clearing local state
   * @param setUser - Callback to set user state
   * @param setNeedsAuth - Callback to set auth needed state
   * @param setBooks - Callback to set books state
   * @param setActiveBookId - Callback to set active book ID state
   * @param setActiveBookBytes - Callback to set active book bytes state
   * @param setSyncData - Callback to set sync data state
   */
  static async handleLogout(
    setUser: (user: User | null) => void,
    setNeedsAuth: (needsAuth: boolean) => void,
    setBooks: (books: any[]) => void,
    setActiveBookId: (id: string | null) => void,
    setActiveBookBytes: (bytes: ArrayBuffer | null) => void,
    setSyncData: (data: any) => void
  ): Promise<void> {
    if (!window.confirm('Disconnect your Google session?')) return;
    await logoutUser();
    setUser(null);
    setNeedsAuth(true);
    setBooks([]);
    setActiveBookId(null);
    setActiveBookBytes(null);
    setSyncData({ books: {} });
  }
}