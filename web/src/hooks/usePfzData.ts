/**
 * Load the advisory once on start, and on explicit request afterwards.
 *
 * There is no polling. A boat at sea has no signal to poll, and trying anyway
 * drains the battery while manufacturing the impression that an update might
 * arrive. Refreshing is a button someone presses in harbour.
 */

import { useCallback, useEffect, useState } from 'react';
import { fetchPfz, type FetchResult } from '@/lib/fetchPfz';

export interface PfzState extends FetchResult {
  loading: boolean;
}

const INITIAL: PfzState = {
  document: null,
  source: 'none',
  fetchedAt: null,
  networkError: null,
  needsAppUpdate: false,
  loading: true,
};

export function usePfzData(): { state: PfzState; refresh: () => Promise<void> } {
  const [state, setState] = useState<PfzState>(INITIAL);

  const load = useCallback(async () => {
    setState((current) => ({ ...current, loading: true }));
    const result = await fetchPfz();
    setState({ ...result, loading: false });
  }, []);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const result = await fetchPfz();
      if (!cancelled) setState({ ...result, loading: false });
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  return { state, refresh: load };
}
