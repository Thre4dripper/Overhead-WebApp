import { openSkyCreditCost, openSkyStatesUrl, parseOpenSkyResponse, type AircraftProvider, type BBox, type StateVector } from '@overhead/shared';
import { fetchJson } from './http';

const TOKEN_URL = 'https://auth.opensky-network.org/auth/realms/opensky-network/protocol/openid-connect/token';

/**
 * OpenSky Network — the project's live feed (hobby project, non-commercial; see docs/data-source.md).
 * Auth: OAuth2 client credentials when OPENSKY_CLIENT_ID/SECRET are set, anonymous otherwise.
 * Cost: bbox queries cost credits scaled by area — 1 (<25 sq°), 2 (<100), 3 (<400), 4 (≥400);
 * the poller charges `costHint` against the daily budget. 429 carries X-Rate-Limit-Retry-After-Seconds.
 */
export class OpenSkyProvider implements AircraftProvider {
  readonly id = 'opensky';
  readonly attribution = 'Aircraft data: The OpenSky Network';
  private token: { value: string; expiresAt: number } | null = null;

  constructor(private readonly clientId?: string, private readonly clientSecret?: string, private readonly base = 'https://opensky-network.org/api') {}

  readonly costHint = (b: BBox): number => openSkyCreditCost(b);

  private async accessToken(): Promise<string | null> {
    if (!this.clientId || !this.clientSecret) return null;
    if (this.token && this.token.expiresAt > Date.now() + 30_000) return this.token.value;
    const res = await fetch(TOKEN_URL, {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ grant_type: 'client_credentials', client_id: this.clientId, client_secret: this.clientSecret }),
    });
    if (!res.ok) throw new Error(`OpenSky token request failed: ${res.status}`);
    const j = (await res.json()) as { access_token: string; expires_in: number };
    this.token = { value: j.access_token, expiresAt: Date.now() + j.expires_in * 1000 };
    return j.access_token;
  }

  async fetchBox(bbox: BBox): Promise<StateVector[]> {
    const token = await this.accessToken();
    const json = await fetchJson(openSkyStatesUrl(this.base, bbox), { headers: token ? { authorization: `Bearer ${token}` } : {}, timeoutMs: 12000 });
    return parseOpenSkyResponse(json).aircraft;
  }
}
