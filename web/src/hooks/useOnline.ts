import { useEffect, useState } from 'react';

/**
 * Whether the browser believes it has a connection.
 *
 * Only ever used to label the UI and to decide whether to offer a refresh. It is
 * never used to decide whether to show data: navigator.onLine reports a Wi-Fi
 * association rather than actual reachability, and a harbour hotspot that goes
 * nowhere still reads as online.
 */
export function useOnline(): boolean {
  const [online, setOnline] = useState(() => (typeof navigator === 'undefined' ? true : navigator.onLine));

  useEffect(() => {
    const up = (): void => setOnline(true);
    const down = (): void => setOnline(false);
    window.addEventListener('online', up);
    window.addEventListener('offline', down);
    return () => {
      window.removeEventListener('online', up);
      window.removeEventListener('offline', down);
    };
  }, []);

  return online;
}
