import { useEffect, useState } from 'react';
import ReactionBar from '../components/ReactionBar.jsx';
import { upload } from '../lib/api.js';
import { playUrl, stopPlayback } from '../lib/audio.js';
import { useRecorder } from '../lib/recorder.js';
import { playerId, send } from '../lib/socket.js';
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
  const recordingNow = withClip.filter(m => m.recordingNow).map(m => m.name);

  let body;
  if (me.role === 'host') {
    body = (
      <>
        <h2>🎛️ Your team is recording</h2>
        <p className="clip-title">“{state.roundClip?.title}”</p>
        <ul className="roster">
          {withClip.map(m => (
            <li key={m.id} className={m.connected ? '' : 'offline'}>
              <span>{m.submitted ? '✅' : m.recordingNow ? '🎙️' : '💭'}</span>
              <span>{m.name}</span>
              <span className="muted small">{m.submitted ? 'submitted' : m.recordingNow ? 'recording…' : 'getting ready'}</span>
            </li>
          ))}
        </ul>
        <p className="muted small">The show starts when everyone submits or the timer runs out.</p>
      </>
    );
  } else if (me.role === 'audience') {
    body = (
      <>
        <h2>🎙️ Players are recording</h2>
        <p className="clip-title">“{state.roundClip?.title}”</p>
        <p>{submitted}/{withClip.length} submitted{recordingNow.length > 0 && <> · <b>{recordingNow.join(', ')}</b> recording now</>}</p>
        <p className="muted">Cheer them on while you wait:</p>
        <ReactionBar />
      </>
    );
  } else if (!me.clip) {
    body = <><h2>Sitting this round out</h2><p>You'll get the clip next round.</p></>;
  } else if (me.submitted) {
    body = <><h2>Submitted ✓</h2><p>Waiting for the others… {submitted}/{withClip.length}</p></>;
  } else {
    body = <Recorder clip={me.clip} maxTakes={state.config.maxTakes} maxSeconds={state.config.maxRecordingSeconds} />;
  }

  return (
    <aside className="panel side">
      <div className="record-top">
        <span className="label">Round {state.round} · recording</span>
        <span className="countdown">{left}s</span>
      </div>
      {body}
    </aside>
  );
}

function Recorder({ clip, maxTakes, maxSeconds }) {
  const { recording, start, stop } = useRecorder(maxSeconds);
  const [takes, setTakes] = useState([]);
  const [error, setError] = useState('');
  const [sending, setSending] = useState(false);

  // Tell the stage when this player is recording so their character performs live.
  useEffect(() => {
    send('recording', { on: recording });
  }, [recording]);

  async function record() {
    setError('');
    stopPlayback(); // keep the original out of the mic
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
    <div className="recorder">
      <p className="label">This round's clip — everyone does the same one</p>
      <h2 className="clip-title">“{clip.title}”</h2>
      <button className="btn" disabled={recording} onClick={() => playUrl(clip.url, { ignoreMute: true })}>▶ Play original</button>
      {recording
        ? <button className="btn rec on" onClick={stop}>■ Stop</button>
        : <button className="btn rec" disabled={outOfTakes} onClick={record}>● {outOfTakes ? 'No takes left' : `Record take ${takes.length + 1}/${maxTakes}`}</button>}
      <p className="muted small">Up to {maxSeconds}s per take. Headphones keep the original out of your recording.</p>
      <ul className="takes">
        {takes.map((take, i) => (
          <li key={take.url}>
            <span>Take {i + 1} · {take.duration.toFixed(1)}s</span>
            <button className="btn small" onClick={() => playUrl(take.url, { ignoreMute: true })}>▶</button>
            <button className="btn small primary" disabled={sending} onClick={() => submit(take)}>Submit</button>
          </li>
        ))}
      </ul>
      {error && <p className="error">{error}</p>}
    </div>
  );
}
