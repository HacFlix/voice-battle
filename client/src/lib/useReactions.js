import { useEffect, useState } from 'react';
import { sfx } from './audio.js';
import { socket } from './socket.js';

export function useReactions() {
  const [floaters, setFloaters] = useState([]);
  const [hype, setHype] = useState(0);
  useEffect(() => {
    const onReaction = ({ emoji, from }) => {
      const id = `${Date.now()}-${Math.random()}`;
      setFloaters(f => [...f.slice(-30), { id, emoji, from, x: 8 + Math.random() * 84 }]);
      setHype(Date.now());
      sfx[emoji]?.();
      setTimeout(() => setFloaters(f => f.filter(x => x.id !== id)), 2200);
    };
    socket.on('reaction', onReaction);
    return () => socket.off('reaction', onReaction);
  }, []);
  return { floaters, hype };
}
