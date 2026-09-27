/**
 * Durable offline storage for the last good advisory.
 *
 * The service worker's Cache Storage is not enough on its own. Browsers evict
 * origin caches under storage pressure, and this app may sit unopened for a week
 * between trips. IndexedDB is the authoritative copy; the runtime cache is a
 * convenience on top of it.
 *
 * Every access is wrapped: in a private window, with site data blocked, or during
 * a thumbnail capture, IndexedDB can be missing or throw. The app must still
 * render, so failures here degrade to "no stored copy" rather than an error.
 */

import { get, set, del } from 'idb-keyval';
import { validateDocument, type PfzDocument } from './pfz';

const DOC_KEY = 'pfz:document:v1';

export interface StoredDocument {
  document: PfzDocument;
  /** When this copy was downloaded. Diagnostic only, never used for freshness. */
  fetchedAt: string;
}

export async function saveDocument(document: PfzDocument, fetchedAt: Date): Promise<void> {
  try {
    await set(DOC_KEY, { document, fetchedAt: fetchedAt.toISOString() } satisfies StoredDocument);
  } catch {
    // Storage unavailable. The app keeps working from memory for this session.
  }
}

export async function loadDocument(): Promise<StoredDocument | null> {
  try {
    const stored = await get<StoredDocument>(DOC_KEY);
    if (!stored?.document) return null;
    // Re-validate on read. A document stored by an older build may predate a
    // field this build relies on, and a stored copy is not inherently trustworthy.
    return { document: validateDocument(stored.document), fetchedAt: stored.fetchedAt };
  } catch {
    return null;
  }
}

export async function clearDocument(): Promise<void> {
  try {
    await del(DOC_KEY);
  } catch {
    // Nothing to do.
  }
}

/**
 * Ask the browser not to evict this origin's storage.
 *
 * Best effort. Chrome grants it on an installed app; Safari ignores it. The
 * result is surfaced in Settings so the state is visible rather than assumed.
 */
export async function requestPersistence(): Promise<boolean> {
  try {
    if (!navigator.storage?.persist) return false;
    if (await navigator.storage.persisted()) return true;
    return await navigator.storage.persist();
  } catch {
    return false;
  }
}

export async function storageEstimate(): Promise<{ usage: number; quota: number } | null> {
  try {
    if (!navigator.storage?.estimate) return null;
    const { usage, quota } = await navigator.storage.estimate();
    return { usage: usage ?? 0, quota: quota ?? 0 };
  } catch {
    return null;
  }
}
