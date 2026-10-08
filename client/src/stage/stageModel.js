// Turns game state into what the stage shows, so the stage stays alive in every phase.
// The 3D stage can consume the same model.
const MEDALS = ['🥇', '🥈', '🥉'];

const ids = list => new Set(list.map(m => m.id));
const ranked = members => [...members].sort((a, b) => b.total - a.total);

export function stageModel(state) {
  const members = state?.members ?? [];
  const base = {
    members,
    audienceCount: state?.audience.length ?? 0,
    walkSeconds: state?.config.walkSeconds ?? 1.5,
  };
  if (!state) return base;

  switch (state.phase) {
    case 'lobby':
      return { ...base, badges: state.hostId ? { [state.hostId]: '👑' } : {} };

    case 'record':
      return {
        ...base,
        talking: ids(members.filter(m => m.recordingNow)),
        badges: Object.fromEntries(members.filter(m => m.clip).map(m => [m.id, m.submitted ? '✅' : m.recordingNow ? '🎙️' : '💭'])),
      };

    case 'show': {
      const s = state.show;
      if (!s) return base;
      return { ...base, performerId: s.performerId, step: s.step, score: s.score, partying: s.step === 'reveal' && s.score >= 70 };
    }

    case 'leaderboard': {
      const [leader] = ranked(members);
      return {
        ...base,
        cheering: ids(leader && leader.total > 0 ? [leader] : []),
        badges: Object.fromEntries(members.map(m => [m.id, `+${m.scores[state.round - 1] ?? 0}`])),
      };
    }

    case 'final': {
      const order = ranked(members);
      return {
        ...base,
        performerId: order[0]?.id ?? null,
        step: 'reveal',
        score: 100,
        badges: Object.fromEntries(order.slice(0, 3).map((m, i) => [m.id, MEDALS[i]])),
        partying: true,
      };
    }

    default:
      return base;
  }
}
