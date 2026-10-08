import { useState } from 'react';
import { send } from '../lib/socket.js';

export default function Home({ mode, teamName, teamCount = 0, audienceCount = 0 }) {
  const [name, setName] = useState('');
  const [team, setTeam] = useState('');
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
        <p className="notice"><b>{teamName}</b> is playing right now. If you're on the team, enter your name to rejoin.</p>
      )}
      <form className="card form" onSubmit={e => { e.preventDefault(); if (mode === 'create') act('create', { teamName: team }); }}>
        {mode === 'create' && (
          <>
            <label className="field">Team name
              <input value={team} onChange={e => setTeam(e.target.value)} placeholder="e.g. The Mimics" maxLength={30} autoFocus />
            </label>
            <label className="field">Your name
              <input value={name} onChange={e => setName(e.target.value)} placeholder="e.g. Biswajit" maxLength={20} />
            </label>
            <button className="btn primary big" disabled={busy}>Create Team</button>
          </>
        )}
        {mode === 'join' && (
          <>
            <p className="join-title"><b>{teamName}</b> is getting ready</p>
            <p className="muted join-meta">{teamCount} teammate{teamCount === 1 ? '' : 's'} · {audienceCount} in the audience</p>
            <label className="field">Your name
              <input value={name} onChange={e => setName(e.target.value)} placeholder="e.g. Priya" maxLength={20} autoFocus />
            </label>
            <div className="row">
              <button type="button" className="btn primary" disabled={busy} onClick={() => act('join', { role: 'member' })}>Join as Teammate</button>
              <button type="button" className="btn" disabled={busy} onClick={() => act('join', { role: 'audience' })}>Join as Audience</button>
            </div>
          </>
        )}
        {mode === 'busy' && (
          <>
            <label className="field">Your name
              <input value={name} onChange={e => setName(e.target.value)} placeholder="Same name as before" maxLength={20} autoFocus />
            </label>
            <button type="button" className="btn primary" disabled={busy} onClick={() => act('join', { role: 'member' })}>Rejoin</button>
          </>
        )}
        {error && <p className="error">{error}</p>}
      </form>
    </main>
  );
}
