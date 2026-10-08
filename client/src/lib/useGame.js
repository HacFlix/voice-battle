import { useEffect, useState } from 'react';
import { socket } from './socket.js';

export function useGame() {
  const [game, setGame] = useState({ state: null, offset: 0 });
  useEffect(() => {
    const onState = state => setGame({ state, offset: state.now - Date.now() });
    socket.on('state', onState);
    return () => socket.off('state', onState);
  }, []);
  return game;
}
