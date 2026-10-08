import { useRef, useState } from 'react';

export function useRecorder(maxSeconds) {
  const [recording, setRecording] = useState(false);
  const active = useRef(null);

  function stop() {
    const r = active.current;
    if (!r) return;
    active.current = null;
    clearTimeout(r.timeout);
    if (r.recorder.state !== 'inactive') r.recorder.stop();
  }

  async function start() {
    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === 'undefined') {
      throw Object.assign(new Error('unsupported'), { name: 'NotSupportedError' });
    }
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    const recorder = new MediaRecorder(stream);
    const chunks = [];
    const startedAt = performance.now();
    recorder.ondataavailable = e => { if (e.data.size) chunks.push(e.data); };
    const done = new Promise(resolve => {
      recorder.onstop = () => {
        stream.getTracks().forEach(t => t.stop());
        setRecording(false);
        const blob = new Blob(chunks, { type: recorder.mimeType || 'audio/webm' });
        resolve({ blob, url: URL.createObjectURL(blob), duration: (performance.now() - startedAt) / 1000 });
      };
    });
    recorder.start();
    active.current = { recorder, timeout: setTimeout(stop, maxSeconds * 1000) };
    setRecording(true);
    return done;
  }

  return { recording, start, stop };
}
