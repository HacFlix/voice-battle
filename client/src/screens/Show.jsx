import { useEffect, useRef, useState } from 'react';
import { playUrl, sfx, stopPlayback, unlockAudio, useAudioUnlocked } from '../lib/audio.js';
import { send, socket } from '../lib/socket.js';
import { useSecondsLeft } from '../lib/time.js';
import Stage2D from '../stage/Stage2D.jsx';

const EMOJIS = ['👏', '😂', '🔥', '🍅'];

function useStageAudio(show) {
  const key = show ? `${show.performerId}:${show.step}` : '';
  useEffect(() => {
    if (!show) return;
    if (show.step === 'original') playUrl(show.clip.url);
    if (show.step === 'perform') playUrl(show.recordingUrl);
    if (show.step === 'reveal') {
      if (show.score >= 70) sfx.cheer();
      else if (show.score < 40) sfx.groan();
      else sfx.pop();
    }
  }, [key]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => stopPlayback, []);
}

function useReactions() {
  const [floaters, setFloaters] = useState([]);
  const [hype, setHype] = useState(0);
  useEffect(() => {
    const onReaction = ({ emoji, from }) => {
      const id = `${Date.now()}-${Math.random()}`;
      setFloaters(f => [...f.slice(-30), { id, emoji, from, x: 10 + Math.random() * 80 }]);
      setHype(Date.now());
      sfx[emoji]?.();
      setTimeout(() => setFloaters(f => f.filter(x => x.id !== id)), 2200);
    };
    socket.on('reaction', onReaction);
    return () => socket.off('reaction', onReaction);
  }, []);
  return { floaters, hype };
}

function Caption({ show, performer, left }) {
  const name = performer?.name ?? '';
  const texts = {
    original: <>🎬 The original: <b>“{show.clip.title}”</b></>,
    walkIn: <>Up next: <b>{name}</b></>,
    perform: <>🎤 <b>{name}</b> is performing…</>,
    vote: <>🗳️ Vote now! <b>{left}s</b> · {show.votes} vote{show.votes === 1 ? '' : 's'}</>,
  };
  const scored = (show.step === 'reveal' || show.step === 'walkOut') && show.score !== null;
  return (
    <>
      {texts[show.step] && <div className="caption">{texts[show.step]}</div>}
      {scored && (
        <div className={`score-pop ${show.score >= 70 ? 'hot' : show.score < 40 ? 'cold' : ''}`}>
          {show.score}<small>/100</small>
        </div>
      )}
    </>
  );
}

function VotePanel({ open, performer }) {
  const [value, setValue] = useState(50);
  const [sent, setSent] = useState(null);
  const lastReact = useRef(0);

  async function submit() {
    const result = await send('vote', { value });
    if (result.ok) setSent(value);
  }
  function react(emoji) {
    if (Date.now() - lastReact.current < 250) return;
    lastReact.current = Date.now();
    send('react', { emoji });
  }

  if (!open) {
    return (
      <section className="card vote-panel">
        <p className="muted">{sent !== null ? `You gave ${performer?.name} ${sent}/100` : 'Voting opens after the performance'}</p>
      </section>
    );
  }
  return (
    <section className="card vote-panel">
      <p>How close was <b>{performer?.name}</b> to the original?</p>
      <div className="slider-row">
        <input type="range" min="0" max="100" value={value} onChange={e => setValue(Number(e.target.value))} aria-label="Score" />
        <span className="big-num">{value}</span>
      </div>
      <button className="btn primary" onClick={submit}>{sent === null ? 'Lock in vote' : `Update vote (sent ${sent})`}</button>
      <div className="emoji-row">
        {EMOJIS.map(e => <button key={e} className="emoji-btn" onClick={() => react(e)}>{e}</button>)}
      </div>
    </section>
  );
}

export default function Show({ state, me, offset }) {
  const show = state.show;
  const unlocked = useAudioUnlocked();
  const left = useSecondsLeft(state.deadline, offset);
  const { floaters, hype } = useReactions();
  useStageAudio(show);

  if (!show) return <main className="screen center"><p className="muted">Setting the stage…</p></main>;
  const performer = state.members.find(m => m.id === show.performerId);

  return (
    <main className="screen show">
      <p className="muted center">Performer {show.index + 1} of {show.count}</p>
      <div className="stage-wrap">
        <Stage2D
          members={state.members}
          performerId={show.performerId}
          step={show.step}
          score={show.score}
          audienceCount={state.audience.length}
          hype={hype}
          walkSeconds={state.config.walkSeconds}
        />
        <Caption show={show} performer={performer} left={left} />
        <div className="floaters">
          {floaters.map(f => (
            <span key={f.id} className="floater" style={{ left: `${f.x}%` }}>{f.emoji}<small>{f.from}</small></span>
          ))}
        </div>
        {!unlocked && <button className="unlock" onClick={unlockAudio}>🔊 Tap to enter the stage</button>}
      </div>
      {me.role === 'audience' && (
        <VotePanel key={`${state.round}-${show.performerId}`} open={show.step === 'vote'} performer={performer} />
      )}
    </main>
  );
}
