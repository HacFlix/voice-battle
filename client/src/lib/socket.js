import { io } from 'socket.io-client';

function tabPlayerId() {
  let id = sessionStorage.getItem('vb-player');
  if (!id) {
    id = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
    sessionStorage.setItem('vb-player', id);
  }
  return id;
}

export const playerId = tabPlayerId();
export const socket = io({ auth: { playerId } });

export function send(event, payload = {}) {
  return new Promise(resolve => socket.emit(event, payload, resolve));
}
