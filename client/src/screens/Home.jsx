import { useState } from 'react';
import { send } from '../lib/socket.js';

export default function Home({ mode }) {
  const [name, setName] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function act(event, extra = {}) {
    setBusy(true);
    setError('');
    const result = await send(event, { name, ...extra });
    setBusy(false);
    if (!result.ok) setError(result.error);
  }

  return (
    <main className="screen home">
      <h1 className="logo">Voice<br />Battle</h1>
      <p className="tagline">Hear the clip. Copy the voice. Let the crowd decide.</p>
      {mode === 'busy' && (
        <p className="notice">A game is in progress. If you're on the team, enter the same name to rejoin.</p>
      )}
      <form className="card form" onSubmit={e => { e.preventDefault(); if (mode === 'create') act('create'); }}>
        <input value={name} onChange={e => setName(e.target.value)} placeholder="Your name" maxLength={20} autoFocus />
        {mode === 'create' && <button className="btn primary big" disabled={busy}>Create Team</button>}
        {mode === 'join' && (
          <div className="row">
            <button type="button" className="btn primary" disabled={busy} onClick={() => act('join', { role: 'member' })}>Join the Team</button>
            <button type="button" className="btn" disabled={busy} onClick={() => act('join', { role: 'audience' })}>Join the Audience</button>
          </div>
        )}
        {mode === 'busy' && (
          <button type="button" className="btn primary" disabled={busy} onClick={() => act('join', { role: 'member' })}>Rejoin</button>
        )}
        {error && <p className="error">{error}</p>}
      </form>
    </main>
  );
}
