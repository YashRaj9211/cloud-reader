import React, { useEffect } from 'react';
import { useAppStore } from './store';
import LoadingScreen from './components/LoadingScreen';
import SignInScreen from './components/SignInScreen';
import { MainDashboard } from './components/MainDashboard';

export default function App() {
  const { needsAuth, loadingInit, initAuth } = useAppStore();

  useEffect(() => {
    initAuth();
  }, []);

  if (loadingInit) {
    return <LoadingScreen />;
  }

  if (needsAuth) {
    return <SignInScreen />;
  }

  return <MainDashboard />;
}
