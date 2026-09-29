/**
 * Service worker registration and the update prompt.
 *
 * Updates are offered, never applied automatically. Swapping the running app out
 * from under someone mid-trip is exactly what must not happen: the version on the
 * phone has been verified to work, and a silent replacement at sea cannot be
 * undone or rolled back.
 *
 * The prompt is deliberately plain DOM rather than React state. It has to work even
 * if the app itself has failed to mount.
 */

import { registerSW } from 'virtual:pwa-register';
import { isNativeApp } from './lib/platform';

export function registerServiceWorker(): void {
  if (import.meta.env.DEV) return;
  // Inside the Android and iOS apps the whole shell is already on the phone,
  // installed with the app, and updates come through the store or a new build. The
  // advisory itself still persists offline through IndexedDB.
  if (isNativeApp()) return;

  const update = registerSW({
    immediate: true,
    onNeedRefresh() {
      showPrompt(() => void update(true));
    },
  });
}

function showPrompt(onAccept: () => void): void {
  if (document.getElementById('sw-update')) return;

  const bar = document.createElement('div');
  bar.id = 'sw-update';
  bar.className = 'banner banner--info';
  bar.setAttribute('role', 'status');
  bar.style.position = 'fixed';
  bar.style.left = '0';
  bar.style.right = '0';
  bar.style.top = '0';
  bar.style.zIndex = '100';
  bar.style.display = 'flex';
  bar.style.gap = '0.75rem';
  bar.style.alignItems = 'center';
  bar.style.justifyContent = 'space-between';

  const label = document.createElement('span');
  // Read from the rendered document so the prompt speaks the chosen language.
  label.textContent = document.documentElement.getAttribute('data-update-label') ?? 'A new version is ready';

  const accept = document.createElement('button');
  accept.type = 'button';
  accept.className = 'primary';
  accept.textContent = document.documentElement.getAttribute('data-update-now') ?? 'Update';
  accept.addEventListener('click', onAccept);

  const dismiss = document.createElement('button');
  dismiss.type = 'button';
  dismiss.textContent = document.documentElement.getAttribute('data-update-later') ?? 'Not now';
  dismiss.addEventListener('click', () => bar.remove());

  const actions = document.createElement('span');
  actions.style.display = 'flex';
  actions.style.gap = '0.5rem';
  actions.append(accept, dismiss);
  bar.append(label, actions);
  document.body.prepend(bar);
}
