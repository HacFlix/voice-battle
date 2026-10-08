import { useState } from 'react';
import { upload } from '../lib/api.js';
import { playUrl } from '../lib/audio.js';
import { useRecorder } from '../lib/recorder.js';
import { playerId } from '../lib/socket.js';
import { useSecondsLeft } from '../lib/time.js';

function micError(err) {
  if (!window.isSecureContext) return 'The microphone only works on https (or localhost).';
  if (err?.name === 'NotAllowedError') return 'Microphone permission was blocked. Allow it in your browser and try again.';
  if (err?.name === 'NotSupportedError') return 'This browser cannot record audio.';
  return 'Could not start the microphone.';
}

function extensionFor(type) {
  if (type.includes('mp4')) return 'm4a';
  if (type.includes('ogg')) return 'ogg';
  return 'webm';
}

export default function Record({ state, me, offset }) {
  const left = useSecondsLeft(state.deadline, offset);
  const withClip = state.members.filter(m => m.clip);
  const submitted = withClip.filter(m => m.submitted).length;

  let body;
  if (me.role === 'audience') {
    body = <div className="card center"><h2>🎙️ Players are recording…</h2><p>{submitted}/{withClip.length} submitted. Get ready to vote!</p></div>;
  } else if (!me.clip) {
    body = <div className="card center"><h2>Sitting this round out</h2><p>You'll get a clip next round.</p></div>;
  } else if (me.submitted) {
    body = <div className="card center"><h2>Submitted ✓</h2><p>Waiting for the others… {submitted}/{withClip.length}</p></div>;
  } else {
    body = <Recorder clip={me.clip} maxTakes={state.config.maxTakes} maxSeconds={state.config.maxRecordingSeconds} />;
  }

  return (
    <main className="screen record">
      <div className="record-top">
        <h2>Recording time</h2>
        <span className="countdown">{left}s</span>
      </div>
      {body}
    </main>
  );
}

function Recorder({ clip, maxTakes, maxSeconds }) {
  const { recording, start, stop } = useRecorder(maxSeconds);
  const [takes, setTakes] = useState([]);
  const [error, setError] = useState('');
  const [sending, setSending] = useState(false);

  async function record() {
    setError('');
    try {
      const take = await start();
      setTakes(t => [...t, take]);
    } catch (err) {
      setError(micError(err));
    }
  }

  async function submit(take) {
    setSending(true);
    const result = await upload('/api/recording', { playerId, duration: take.duration.toFixed(2) }, take.blob, `take.${extensionFor(take.blob.type)}`);
    setSending(false);
    if (!result.ok) setError(result.error);
  }

  const outOfTakes = takes.length >= maxTakes;
  return (
    <div className="card recorder">
      <p className="label">Your clip</p>
      <h2 className="clip-title">“{clip.title}”</h2>
      <button className="btn" onClick={() => playUrl(clip.url)}>▶ Play original</button>
      {recording
        ? <button className="btn rec on" onClick={stop}>■ Stop</button>
        : <button className="btn rec" disabled={outOfTakes} onClick={record}>● {outOfTakes ? 'No takes left' : `Record take ${takes.length + 1}/${maxTakes}`}</button>}
      <p className="muted">Up to {maxSeconds}s per take. Pick your best one and submit it.</p>
      <ul className="takes">
        {takes.map((take, i) => (
          <li key={take.url}>
            <span>Take {i + 1} · {take.duration.toFixed(1)}s</span>
            <button className="btn small" onClick={() => playUrl(take.url)}>▶</button>
            <button className="btn small primary" disabled={sending} onClick={() => submit(take)}>Submit</button>
          </li>
        ))}
      </ul>
      {error && <p className="error">{error}</p>}
    </div>
  );
}
