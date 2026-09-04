import { geohashBounds as sharedBounds } from '@overhead/shared';
import { describe, expect, it } from 'vitest';
import { feedName, geohashBounds, isTile } from '../../api/feed';

/**
 * The edge function cannot import the workspace (Vercel's edge bundler rejects it) and must not live
 * under api/ (every file there becomes a public endpoint), so it carries its own copy of the geohash
 * decode and this test — from src/ — is what keeps the copy honest.
 */
describe('edge function geohash decode', () => {
  it('matches @overhead/shared for every 4-character tile prefix sampled across the globe', () => {
    const tiles = ['gcps', 'gcpu', '9q8y', 'r3gx', 'ttn9', 'xn76', 'u33d', 'kzf0', 'e7dh', '2fs0', 'b1zz', 'zzzz', '0000'];
    for (const t of tiles) expect(geohashBounds(t)).toEqual(sharedBounds(t));
  });
  it('defaults to the feed that Vercel can actually reach', () => {
    expect(feedName(undefined)).toBe('adsblol');
    expect(feedName('')).toBe('adsblol');
    expect(feedName('opensky')).toBe('opensky');
    expect(feedName('nonsense')).toBe('adsblol');
  });
  it('rejects anything that is not a 4-character geohash', () => {
    expect(isTile('gcps')).toBe(true);
    expect(isTile('gcp')).toBe(false);
    expect(isTile('gcpsa')).toBe(false);
    expect(isTile('gcpa')).toBe(false); // 'a' is not in the geohash alphabet
    expect(isTile('../..')).toBe(false);
  });
});
