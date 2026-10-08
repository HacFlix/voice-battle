import { describe, it, expect } from 'vitest';
import { computeAwards } from '../src/awards.js';

const m = (id, scores, reactions = 0) => ({ id, name: id.toUpperCase(), scores, reactions });

describe('awards', () => {
  it('picks the winner of each award', () => {
    const a = computeAwards([m('a', [50, 60, 70], 3), m('b', [90, 10, 40], 5), m('c', [55, 55, 58])]);
    expect(a.crowdFavourite).toEqual({ playerId: 'b', name: 'B', value: 5 });
    expect(a.closestMatch).toEqual({ playerId: 'b', name: 'B', value: 90 });
    expect(a.consistentPerformer).toEqual({ playerId: 'c', name: 'C', value: 3 });
  });

  it('leaves an award empty when nobody qualifies', () => {
    const a = computeAwards([m('a', [0])]);
    expect(a).toEqual({ crowdFavourite: null, closestMatch: null, consistentPerformer: null });
  });

  it('gives ties to the earlier player', () => {
    const a = computeAwards([m('a', [80, 80], 2), m('b', [80, 80], 2)]);
    expect(a.crowdFavourite.playerId).toBe('a');
    expect(a.closestMatch.playerId).toBe('a');
    expect(a.consistentPerformer.playerId).toBe('a');
  });
});
