import { useEffect } from 'react';
import { apiUrl } from './apiBase.js';

// Server audio is downloaded ahead of time and played from memory, so every device starts
// a clip the moment the stage step begins instead of after a 1-2 s download.
const cache = new Map(); // server path -> { promise, objectUrl }

export function preloadAudio(path) {
  if (!path || cache.has(path)) return;
  const entry = { objectUrl: null };
  entry.promise = fetch(apiUrl(path))
    .then(res => (res.ok ? res.blob() : Promise.reject(new Error(res.status))))
    .then(blob => {
      entry.objectUrl = URL.createObjectURL(blob);
    })
    .catch(() => cache.delete(path)); // fall back to streaming; a later preload can retry
  cache.set(path, entry);
}

// The in-memory copy when it's ready, otherwise the network URL.
export function resolveAudio(path) {
  if (!path.startsWith('/')) return path; // blob: URLs of local takes
  return cache.get(path)?.objectUrl ?? apiUrl(path);
}

function clearAudioCache() {
  for (const entry of cache.values()) if (entry.objectUrl) URL.revokeObjectURL(entry.objectUrl);
  cache.clear();
}

// Preload whatever the current round will play: the clip and every submitted recording.
export function useAudioPreload(state) {
  const paths = [
    state?.roundClip?.url,
    state?.show?.clip?.url,
    state?.show?.recordingUrl,
    ...(state?.members ?? []).map(m => m.recordingUrl),
  ].filter(Boolean);
  const key = paths.join('|');
  const idle = !state || state.phase === 'none' || state.phase === 'lobby';

  useEffect(() => {
    if (idle) clearAudioCache();
    else paths.forEach(preloadAudio);
  }, [key, idle]); // eslint-disable-line react-hooks/exhaustive-deps
}
