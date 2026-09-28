/**
 * Get the advisory, from the network if possible and from storage otherwise.
 *
 * The order matters and is deliberate. In harbour, with a signal, we want
 * genuinely today's advisory before the boat leaves, so the network is tried
 * first. At sea there is no network at all, so the attempt is given a short
 * deadline and then abandoned in favour of the stored copy.
 */

import { validateDocument, SchemaTooNewError, type PfzDocument } from './pfz';
import { loadDocument, saveDocument, requestPersistence } from './store';
import { dataBaseUrl } from './platform';

/** Short: an unreachable network should not hold up a boat's screen. */
const NETWORK_TIMEOUT_MS = 6000;

export type DocumentSource = 'network' | 'cache' | 'none';

export interface FetchResult {
  document: PfzDocument | null;
  source: DocumentSource;
  /** When the returned copy was downloaded, if known. */
  fetchedAt: Date | null;
  /** Set when the network attempt failed, even if a stored copy was returned. */
  networkError: string | null;
  /** Set when the published schema is newer than this build understands. */
  needsAppUpdate: boolean;
}

function dataUrl(): string {
  return `${dataBaseUrl()}pfz-latest.json`;
}

async function fromNetwork(): Promise<PfzDocument> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), NETWORK_TIMEOUT_MS);
  try {
    const response = await fetch(dataUrl(), {
      // no-store, not no-cache: we want the service worker's NetworkFirst
      // strategy to decide, not an HTTP cache layer silently answering for it.
      cache: 'no-store',
      signal: controller.signal,
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    return validateDocument(await response.json());
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Fetch, fall back to storage, and report honestly which one was used.
 *
 * Never throws for an ordinary offline case. The caller renders whatever comes
 * back and shows the staleness of it.
 */
export async function fetchPfz(): Promise<FetchResult> {
  let needsAppUpdate = false;
  let networkError: string | null = null;

  try {
    const document = await fromNetwork();
    const now = new Date();
    await saveDocument(document, now);
    void requestPersistence();
    return { document, source: 'network', fetchedAt: now, networkError: null, needsAppUpdate: false };
  } catch (error) {
    if (error instanceof SchemaTooNewError) {
      // The pipeline has moved on and this build cannot read the new shape.
      // Fall through to the stored copy, which this build did understand, and
      // tell the user the app needs updating.
      needsAppUpdate = true;
      networkError = error.message;
    } else {
      networkError = error instanceof Error ? error.message : String(error);
    }
  }

  const stored = await loadDocument();
  if (stored) {
    return {
      document: stored.document,
      source: 'cache',
      fetchedAt: new Date(stored.fetchedAt),
      networkError,
      needsAppUpdate,
    };
  }

  return { document: null, source: 'none', fetchedAt: null, networkError, needsAppUpdate };
}
