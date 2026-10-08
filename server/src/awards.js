const entry = (m, value) => ({ playerId: m.id, name: m.name, value });

export function computeAwards(members) {
  let crowdFavourite = null;
  let closestMatch = null;
  let consistentPerformer = null;
  for (const m of members) {
    if (m.reactions > 0 && (!crowdFavourite || m.reactions > crowdFavourite.value)) {
      crowdFavourite = entry(m, m.reactions);
    }
    const best = m.scores.length ? Math.max(...m.scores) : 0;
    if (best > 0 && (!closestMatch || best > closestMatch.value)) closestMatch = entry(m, best);
    if (m.scores.length >= 2) {
      const spread = Math.max(...m.scores) - Math.min(...m.scores);
      if (!consistentPerformer || spread < consistentPerformer.value) consistentPerformer = entry(m, spread);
    }
  }
  return { crowdFavourite, closestMatch, consistentPerformer };
}
