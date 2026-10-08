// Where the game server lives. Empty in local dev (Vite proxies to it);
// set VITE_API_URL when the site and the server are deployed separately.
export const API_URL = (import.meta.env.VITE_API_URL ?? '').replace(/\/$/, '');

// Server paths like /clips/x.mp3 or /uploads/... need the server's origin; blob: URLs don't.
export const apiUrl = path => (path.startsWith('/') ? `${API_URL}${path}` : path);
