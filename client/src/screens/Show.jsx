import { useEffect, useState } from 'react';
import ReactionBar from '../components/ReactionBar.jsx';
import { playUrl, sfx, stopPlayback, unlockAudio, useAudioUnlocked } from '../lib/audio.js';
import { send } from '../lib/socket.js';
import { useSecondsLeft } from '../lib/time.js';

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

function Hud({ show, performer, left }) {
  const name = performer?.name ?? '';
  const texts = {
    original: <>🎬 The original: <b>“{show.clip.title}”</b></>,
    walkIn: <>Up next: <b>{name}</b></>,
    perform: <>🎤 <b>{name}</b> is performing…</>,
    vote: <>🗳️ Audience, vote now! <b>{left}s</b> · {show.votes} vote{show.votes === 1 ? '' : 's'}</>,
  };
  const scored = (show.step === 'reveal' || show.step === 'walkOut') && show.score !== null;
  return (
    <div className="stage-hud">
      <p className="hud-meta">Performer {show.index + 1} of {show.count}</p>
      {texts[show.step] && <div className="caption">{texts[show.step]}</div>}
      {scored && (
        <div className={`score-pop ${show.score >= 70 ? 'hot' : show.score < 40 ? 'cold' : ''}`}>
          {show.score}<small>/100</small>
        </div>
      )}
    </div>
  );
}

function VotePanel({ open, performer }) {
  const [value, setValue] = useState(50);
  const [sent, setSent] = useState(null);

  async function submit() {
    const result = await send('vote', { value });
    if (result.ok) setSent(value);
  }

  return (
    <aside className="panel side vote-panel">
      {open ? (
        <>
          <p>How close was <b>{performer?.name}</b> to the original?</p>
          <div className="slider-row">
            <input type="range" min="0" max="100" value={value} onChange={e => setValue(Number(e.target.value))} aria-label="Score" />
            <span className="big-num">{value}</span>
          </div>
          <button className="btn primary" onClick={submit}>{sent === null ? 'Lock in vote' : `Update vote (sent ${sent})`}</button>
        </>
      ) : (
        <p className="muted">{sent !== null ? `You gave ${performer?.name} ${sent}/100` : 'Voting opens after the performance'}</p>
      )}
      <p className="muted small">React any time:</p>
      <ReactionBar />
    </aside>
  );
}

export default function Show({ state, me, offset }) {
  const show = state.show;
  const unlocked = useAudioUnlocked();
  const left = useSecondsLeft(state.deadline, offset);
  useStageAudio(show);

  if (!show) return null;
  const performer = state.members.find(m => m.id === show.performerId);

  return (
    <>
      <Hud show={show} performer={performer} left={left} />
      {!unlocked && <button className="unlock" onClick={unlockAudio}>🔊 Tap to hear the show</button>}
      {me.role === 'audience' && (
        <VotePanel key={`${state.round}-${show.performerId}`} open={show.step === 'vote'} performer={performer} />
      )}
    </>
  );
}
