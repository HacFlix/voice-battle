import { apiUrl } from './apiBase.js';

export async function upload(url, fields, blob, filename) {
  const form = new FormData();
  for (const [key, value] of Object.entries(fields)) form.append(key, value);
  form.append('audio', blob, filename);
  try {
    const res = await fetch(apiUrl(url), { method: 'POST', body: form });
    return await res.json();
  } catch {
    return { ok: false, error: 'Upload failed — check your connection' };
  }
}
