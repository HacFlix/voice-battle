import { useRef } from 'react';
import { send } from '../lib/socket.js';

const EMOJIS = ['👏', '😂', '🔥', '🍅'];

export default function ReactionBar() {
  const last = useRef(0);
  function react(emoji) {
    if (Date.now() - last.current < 250) return;
    last.current = Date.now();
    send('react', { emoji });
  }
  return (
    <div className="emoji-row">
      {EMOJIS.map(e => <button key={e} className="emoji-btn" onClick={() => react(e)} aria-label={`React ${e}`}>{e}</button>)}
    </div>
  );
}
