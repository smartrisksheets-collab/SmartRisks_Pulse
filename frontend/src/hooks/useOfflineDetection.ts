import { useEffect, useState } from 'react';

export function useOfflineDetection(): boolean {
  const [isOffline, setIsOffline] = useState(!navigator.onLine);

  useEffect(() => {
    function handleOffline() { setIsOffline(true);  }
    function handleOnline()  { setIsOffline(false); }

    window.addEventListener('offline', handleOffline);
    window.addEventListener('online',  handleOnline);

    return () => {
      window.removeEventListener('offline', handleOffline);
      window.removeEventListener('online',  handleOnline);
    };
  }, []);

  return isOffline;
}