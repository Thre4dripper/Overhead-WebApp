# Aircraft-data source research (verified 2026-09-03/04)

Method: every claim below was checked against a page actually fetched on 2026-09-03 (UTC evening) / 2026-09-04. Fetch method noted where it matters (WebFetch = summarising fetcher; curl = raw HTML/JSON saved and parsed locally). Items that could not be fetched are marked UNVERIFIED.

---

## 1. OpenSky Network REST API

Primary source: https://openskynetwork.github.io/opensky-api/rest.html (fetched via WebFetch and via curl; raw text saved locally and quoted verbatim). Root URL: `https://opensky-network.org/api`.

### 1a. Authentication — OAuth2 client-credentials (basic auth is gone)

Verbatim: "OpenSky exclusively supports the OAuth2 client credentials flow. Basic authentication with username and password is no longer accepted."

Steps (verbatim): "Log in to your OpenSky account and visit the Account page. Create a new API client and retrieve your client_id and client_secret. Exchange these for an access token, then pass it as a Bearer token on every request."

Token endpoint (exact):
`https://auth.opensky-network.org/auth/realms/opensky-network/protocol/openid-connect/token`
POST, `Content-Type: application/x-www-form-urlencoded`, body `grant_type=client_credentials&client_id=...&client_secret=...`; response JSON has `access_token` and `expires_in` (docs' example defaults to 1800 s).

Verbatim: "Tokens expire after 30 minutes. A 401 Unauthorized response means the token has expired - request a new one and retry."
Use: `Authorization: Bearer $TOKEN`.

### 1b. Credit system

Verbatim: "All endpoints consume credits except /states/own. Credits are tracked in three independent buckets - one each for /states/*, /tracks/*, and /flights/*. Spending credits on one endpoint has no effect on the others."

Credit quotas by tier — per endpoint (table, verbatim cells):

| Tier | Credits | Refill |
|---|---|---|
| Anonymous | 400 | Daily |
| Standard user | 4,000 | Daily |
| Active feeder (≥30% uptime/month) | 8,000 | Daily |
| Licensed user | 14,400 | Hourly |

Verbatim note: "Active feeder status is recalculated every 2 hours. Tier upgrades take effect after ~50 requests. To confirm you are receiving the 8,000-credit allowance, check that X-Rate-Limit-Remaining exceeds 4,000 at the start of a day."

Credit cost — `/states/all` (verbatim: "bounding box area in sq° = latitude range × longitude range"):

| Bounding box area | Credits |
|---|---|
| ≤ 25 sq° or serial-only query | 1 |
| 25 – 100 sq° | 2 |
| 100 – 400 sq° | 3 |
| > 400 sq° or global | 4 |

Credit cost — `/flights/*` and `/tracks/*` (by calendar-day partitions crossed): Live / < 24 h = 4; 1–2 = 30; 3–10 = 60×N; 11–15 = 120×N; 16–20 = 240×N; 21–25 = 480×N; > 25 = 960×N.

Verbatim: "When credits are available, X-Rate-Limit-Remaining shows your remaining balance. When exhausted, the API returns 429 Too Many Requests and X-Rate-Limit-Retry-After-Seconds indicates how many seconds to wait."

### 1c. `/api/states/all` response shape and state-vector field order

Request params: `time` (int, epoch s), `icao24` (repeatable hex string), bounding box `lamin`, `lomin`, `lamax`, `lomax` (floats), and `extended` (integer, "Set to 1 if required") — the `category` element (index 17) is only present when `extended=1`.

Top level (verbatim): `time` — integer — "The time which the state vectors in this response are associated with. All vectors represent the state of a vehicle with the interval [time - 1, time]." `states` — array — "The state vectors." "The states property is a two-dimensional array. Each row represents a state vector and contains the following fields:"

| Index | Property | Type | Description (verbatim) |
|---|---|---|---|
| 0 | icao24 | string | Unique ICAO 24-bit address of the transponder in hex string representation. |
| 1 | callsign | string | Callsign of the vehicle (8 chars). Can be null if no callsign has been received. |
| 2 | origin_country | string | Country name inferred from the ICAO 24-bit address. |
| 3 | time_position | int | Unix timestamp (seconds) for the last position update. Can be null if no position report was received by OpenSky within the past 15s. |
| 4 | last_contact | int | Unix timestamp (seconds) for the last update in general. This field is updated for any new, valid message received from the transponder. |
| 5 | longitude | float | WGS-84 longitude in decimal degrees. Can be null. |
| 6 | latitude | float | WGS-84 latitude in decimal degrees. Can be null. |
| 7 | baro_altitude | float | Barometric altitude in meters. Can be null. |
| 8 | on_ground | boolean | Boolean value which indicates if the position was retrieved from a surface position report. |
| 9 | velocity | float | Velocity over ground in m/s. Can be null. |
| 10 | true_track | float | True track in decimal degrees clockwise from north (north=0°). Can be null. |
| 11 | vertical_rate | float | Vertical rate in m/s. A positive value indicates that the airplane is climbing, a negative value indicates that it descends. Can be null. |
| 12 | sensors | int[] | IDs of the receivers which contributed to this state vector. Is null if no filtering for sensor was used in the request. |
| 13 | geo_altitude | float | Geometric altitude in meters. Can be null. |
| 14 | squawk | string | The transponder code aka Squawk. Can be null. |
| 15 | spi | boolean | Whether flight status indicates special purpose indicator. |
| 16 | position_source | int | Origin of this state's position. 0 = ADS-B, 1 = ASTERIX, 2 = MLAT, 3 = FLARM |
| 17 | category | int | Aircraft category (only with `extended=1`). 0 = No information at all; 1 = No ADS-B Emitter Category Information; 2 = Light (< 15500 lbs); 3 = Small (15500 to 75000 lbs); 4 = Large (75000 to 300000 lbs); 5 = High Vortex Large (aircraft such as B-757); 6 = Heavy (> 300000 lbs); 7 = High Performance (> 5g acceleration and 400 kts); 8 = Rotorcraft; 9 = Glider / sailplane; 10 = Lighter-than-air; 11 = Parachutist / Skydiver; 12 = Ultralight / hang-glider / paraglider; 13 = Reserved; 14 = Unmanned Aerial Vehicle; 15 = Space / Trans-atmospheric vehicle; 16 = Surface Vehicle – Emergency Vehicle; 17 = Surface Vehicle – Service Vehicle; 18 = Point Obstacle (includes tethered balloons); 19 = Cluster Obstacle; 20 = Line Obstacle |

Note units: altitude in **metres**, speed in **m/s**, vertical rate in **m/s** (unlike readsb-family feeds which use feet/knots/ft-min).

### 1d. Anonymous access

Allowed. Verbatim ("Limitations"):
- "Anonymous users (unauthenticated, bucketed by IP): Only the most recent state vectors are available - the time parameter is ignored. Time resolution is 10 seconds: now - (now mod 10)."
- "Authenticated users: State vectors up to 1 hour in the past. Requests with t < now - 3600 return 400 Bad Request. Time resolution is 5 seconds: t - (t mod 5)."
- "You can retrieve state vectors from your own receivers without any credit cost or time restriction. See Own State Vectors." (`GET /states/own`, auth required, else 403.)

### 1e. Licence terms

Source: https://opensky-network.org/about/terms-of-use ("General Terms of Use & Data License Agreement"; WebFetch got 403, fetched with curl + browser UA, HTTP 200).

Verbatim "Tl;dr" block at the top:
- "Commercial or for-profit entities: Any use by a for-profit or commercial entity — including government and military contractors — requires a written license from OpenSky Network, regardless of purpose."
- "Operational REST API use: Use of the REST API in any operational capacity — including integration into a live product, service, or automated system (even if only internal) — requires a previous written agreement, even for non-profit or governmental entities."
- "To obtain a license, contact contact[at]opensky-network.org."

Body, verbatim: the licence granted is "solely for the purpose of non-profit research and non-profit education. Government entities may obtain an exemption at the discretion of the OpenSky Network. No license is granted for any other purpose and there are no implied licenses in this AGREEMENT. Any use by a for-profit or commercial entity requires written permission and a license granted by the OpenSky Network."

Clause (vi), verbatim: "The REST API is provided for non-profit research and educational use only. Use of the REST API in any operational capacity — including but not limited to integration into a live product, service, or automated system — requires a written license from OpenSky Network, regardless of the entity's non-profit status."

Clause (v): "You will not register multiple accounts on the OpenSky Network website. Specifically, You must not use multiple accounts in order to circumvent technical restrictions or blocks (e.g. obtaining additional requests to the REST API)."

Attribution (4(i)): publications using the data "must cite the data as follows: Bringing up OpenSky: A large-scale ADS-B sensor network for research — Matthias Schäfer, Martin Strohmeier, Vincent Lenders, Ivan Martinovic, Matthias Wilhelm — ACM/IEEE International Conference on Information Processing in Sensor Networks, April 2014" and may add "The OpenSky Network, http://www.opensky-network.org".

Implication for a public flight-tracking web app: the free tier is non-commercial AND non-operational — a live web app (even a free hobby one that is an "automated system"/"live product") needs a written licence per the terms as written.

### 1f. Aircraft metadata database

- Page: https://opensky-network.org/data/aircraft (HTTP 200 via curl; the old /aircraft-database URL is 404). Verbatim: "Important note: You can find the existing aircraft database dataset here. It is not up to date. The crowdsourced aircraft database may be made available again at a further date. Keep an eye on our Discord for updates." Sources listed: "Official aircraft registries; Various Basestation.sqb files; Crowdsourced and manually collected data from various supporters; openflights.org; ICAO Doc 8643."
- Licence, verbatim: "The aircraft database is unlicensed and does not fall under our terms of use. We do not provide support or guarantees of any kind—it is offered "as is"." Citation of the IPSN 2014 paper is requested ("please cite").
- Dataset entry https://opensky-network.org/data/scientific#d5 ("OpenSky's Aircraft Metadata Database"), verbatim: "The database as a whole can also be downloaded in .csv format. Monthly snapshots are also available but updates are currently on hold."
- Download location: https://opensky-network.org/datasets/metadata/ (an S3 bucket browser; bucket `https://s3.opensky-network.org/data-samples`, prefix `metadata/`; S3 listing fetched directly, 79 keys). Direct files (verified with HEAD/GET):
  - `https://s3.opensky-network.org/data-samples/metadata/aircraftDatabase.csv` — text/csv, 94,509,542 bytes, Last-Modified 2024-11-04. Downloaded and parsed: 520,000 data rows; 516,527 with a registration; 479,947 with a typecode. 27 double-quoted columns: `icao24, registration, manufacturericao, manufacturername, model, typecode, serialnumber, linenumber, icaoaircrafttype, operator, operatorcallsign, operatoricao, operatoriata, owner, testreg, registered, reguntil, status, built, firstflightdate, seatconfiguration, engines, modes, adsb, acars, notes, categoryDescription`. Also `aircraftDatabase.zip` (24.7 MB).
  - `.../metadata/aircraft-database-complete-YYYY-MM.csv` monthly "complete" dumps, latest `aircraft-database-complete-2025-08.csv` (107,956,517 bytes). Parsed: 609,368 rows; 32 single-quoted columns: `icao24, timestamp, acars, adsb, built, categoryDescription, country, engines, firstFlightDate, firstSeen, icaoAircraftClass, lineNumber, manufacturerIcao, manufacturerName, model, modes, nextReg, notes, operator, operatorCallsign, operatorIata, operatorIcao, owner, prevReg, regUntil, registered, registration, selCal, serialNumber, status, typecode, vdl`.
  - `.../metadata/README.TXT`, verbatim: "IMPORTANT: The daily snapshot ("aircraftDatabase.csv/zip") and the monthly snapshots in the format aircraftDatabase-$year-$month.csv are incomplete. The monthly snapshots in the format aircraft-Database-complete-$year-$month.csv are complete. Note that the column number/organizations between both dumps differ."
  - Also present: `doc8643AircraftTypes.csv` (695 KB), `doc8643Manufacturers.csv` (80 KB).
- Format: CSV (note: the "complete" files use single-quote quoting, the daily file uses double quotes). Licence: "unlicensed", as-is. Coverage: ~520k (daily) / ~609k (complete 2025-08) ICAO24 rows; not updated since late 2024 / Aug 2025.

---

## 2. adsb.lol

Sources fetched: https://api.adsb.lol/api/openapi.json (the Swagger UI at https://api.adsb.lol/docs loads `/api/openapi.json`; `/openapi.json` is 404), https://raw.githubusercontent.com/adsblol/api/main/README.md, https://www.adsb.lol/docs/open-data/api/, https://www.adsb.lol/privacy-license/, https://www.adsb.lol/ , plus a live call `GET https://api.adsb.lol/v2/lat/51.47/lon/-0.46/dist/25` (HTTP 200, 56 aircraft).

### Endpoints (from openapi.json, title "adsb.lol API", version 0.0.2; all GET unless noted)
- `/v2/pia` — "Returns all aircraft with PIA addresses."
- `/v2/mil` — "Returns all military registered aircraft."
- `/v2/ladd` — "Returns all aircrafts on LADD filter."
- `/v2/sqk/{squawk}` and `/v2/squawk/{squawk}`
- `/v2/type/{aircraft_type}` (ICAO type designator, e.g. A320, B738)
- `/v2/reg/{registration}` and `/v2/registration/{registration}`
- `/v2/icao/{icao_hex}` and `/v2/hex/{icao_hex}`
- `/v2/callsign/{callsign}`
- `/v2/lat/{lat}/lon/{lon}/dist/{radius}` and `/v2/point/{lat}/{lon}/{radius}` — "Aircrafts surrounding a point (lat, lon) up to 250nm"
- `/v2/closest/{lat}/{lon}/{radius}` — "Single aircraft closest to a point"
- `/api/0/airport/{icao}` (airport data, from vradarserver/standing-data), `POST /api/0/routeset`, `/0/me` (receiver info / global stats), `/0/my` (My Map redirect)
README: "This API is compatible with the ADSBExchange Rapid API. It is a drop-in replacement."

### Response shape
Top level (schema `V2Response_Model`): `ac` (array), `msg` (string, "No error"), `now` (int, **milliseconds** epoch — live sample `1788466281500`), `total` (int), `ctime` (int ms), `ptime` (int).
`ac` items (schema `V2Response_AcItem`; all optional/nullable except hex, type, messages, seen, rssi, mlat, tisb): `hex, type, flight, r, t, dbFlags, desc (not in schema but readsb-standard), alt_baro (int | "ground" string | null), alt_geom, gs, ias, tas, mach, track, track_rate, roll, mag_heading, true_heading, baro_rate, geom_rate, squawk, emergency, category, nav_qnh, nav_altitude_mcp, nav_altitude_fms, nav_heading, nav_modes[], lat, lon, nic, rc, seen_pos, version, nic_baro, nac_p, nac_v, sil, sil_type, gva, sda, alert, spi, mlat[], tisb[], messages, seen, rssi, wd, ws, oat, tat, gpsOkBefore, gpsOkLat, gpsOkLon, lastPosition{lat,lon,nic,rc,seen_pos}, rr_lat, rr_lon, calc_track`.
Live sample additionally carried `dst` (distance from query point, nm) and `dir` (bearing) on every aircraft — present in the live response, not in the schema. Field presence observed in 56 aircraft: hex/type/alt_baro/lat/lon/seen/seen_pos/messages/rssi 100%; gs 55/56; flight 53; r/t/category 52; squawk 46; track 25; baro_rate 22; alt_geom 21; dbFlags only appears when non-zero (not observed in the sample).

### Rate limits
README, verbatim: "Rate limits are dynamic based on the environment load. If you get 4xx errors, you are doing something wrong. In the future, you will require an API key which you can obtain by feeding adsb.lol. This will be a way to ensure that the API is being used responsibly and by people who are willing to contribute to the project." No numeric limit published; no rate-limit headers were returned on the live call (`cache-control: no-store` only).

### Terms / commercial use / attribution (verbatim)
openapi.json `info.description`:
"## Terms of Service — You can use the API for free. In the future, you will require an API key which you can get by feeding to adsb.lol. If you want to use the API for production purposes, please contact me so I do not break your application by accident."
"## License — The license for the API as well as all data ADSB.lol makes public is ODbL. This is the same license OpenStreetMap uses." (`info.license`: "Open Data Commons Open Database License (ODbL) v1.0", https://opendatacommons.org/licenses/odbl/1-0/)
https://www.adsb.lol/docs/open-data/api/: "The API is available to everyone." / "License: ODbL 1.0" / "https://api.adsb.lol".
https://www.adsb.lol/: "ADSB.lol is an unfiltered flight tracker with a focus on open data. Data is provided by people like you, and is available freely via the API and the historical daily archive."
https://www.adsb.lol/privacy-license/ (feeder side): "By sending data to feed.adsb.lol/in.adsb.lol, you agree, to the extent possible under law, to waive all copyright and related or neighboring rights to the data you are sharing, under the CC0 license." Disclaimer: data "provided on an 'as is' basis".
Interpretation: no non-commercial clause; commercial use is permitted under ODbL, which itself requires attribution and share-alike for derived databases. There is no adsb.lol-specific attribution wording beyond ODbL. Repo licence: BSD-3-Clause (README page via WebFetch).

---

## 3. airplanes.live

Sources fetched: https://airplanes.live/api-docs/ (HTTP 200; page is a Stoplight Elements viewer with `apiDescriptionUrl="/openapi.yaml"`), https://airplanes.live/openapi.yaml (HTTP 200, 35 KB), https://airplanes.live/about/, https://airplanes.live/faq/, https://airplanes.live/terms-of-use/ (Termly embed; document content fetched from https://app.termly.io/api/v1/policies/0f828a6a-8926-4d1d-82fd-784723f8bf66/content), https://github.com/airplanes-live/api-archive (archived) via raw README, live probes of https://api.airplanes.live/. The URL in the brief, https://airplanes.live/api-guide/, is now **404** (also /rest-api-adsb-data-field-descriptions/ and /api/ are 404).

### Access status (important)
Every request to `https://api.airplanes.live/` (root, `/docs`, `/v2/mil`, `/v2/point/51.47/-0.46/25`) from a non-feeder IP returned **HTTP 403** with body:
`{"error": "Please contact us at contact@airplanes.live. Your email MUST include any links, a description of the project, and any information you deem appropriate."}`
The API is therefore effectively feeder-only / by-arrangement. FAQ ("What a feeder gets access to"): "Detailed aircraft information; Detailed ADS-B data; Public weather radar; Aeronautical charts and layers; Ability to replay data; MLAT-calculated Mode S positions; No filtering or blocking." Third-party reports (x-plane.org forum, via search) say access is limited to feeder IPs "due to excessive use".

### Endpoints (current openapi.yaml: title "Airplanes.live API", version 2.0.0, server https://api.airplanes.live, spec licence Apache-2.0)
- `/v2/reg/{reg}` — "Single aircraft position by registration." ("Registration (comma-separated for multiple).")
- `/v2/hex/{hex}` — "Single aircraft position by Mode S code (hex/ICAO)." (comma-separated OK)
- `/v2/hex/{hex}/live` — "Live aircraft position by Mode S code"
- `/v2/hex/{hex}/last` — "Last known position by Mode S code"
- `/v2/callsign/{callsign}` — "Aircraft by callsign."
- `/v2/squawk/{squawk}` — "Aircraft by squawk (Mode A) code." ("Four octal digits, e.g. 7700.")
- `/v2/mil` — "Tagged military aircraft."
- `/v2/point/{lat}/{lon}/{radius}` — "Aircraft within a radius (nautical miles) of a point." ("Search radius in nautical miles (max 250).")
- `/feed-status` — "Clients belonging to the caller IP."
- `/rest/v1/ref/{airports|airlines|countries|cities|timezones}` — static reference data (limit default 50, cap 200).
NOT in the current spec (but in the archived api-archive README): `/v2/type/[type]`, `/v2/ladd/`, `/v2/pia/`.

### Response shape (schema `V2Response` / `Aircraft`, verbatim descriptions)
Envelope: `ac[]`, `msg` ("\"No error\" on success."), `now` ("Cache time, milliseconds since the Unix epoch."), `total` ("Number of aircraft in ac."), `ctime`, `ptime` ("Time to build the response, milliseconds.").
`Aircraft` ("Keys are omitted when data is unavailable", additionalProperties true): `hex` "24-bit Mode S / ICAO address (6 hex digits)."; `type` "Message/position source, e.g. adsb_icao, mlat."; `flight` "Callsign / flight id, up to 8 chars"; `r` "Registration (from the aircraft DB)."; `t` "ICAO type code (from the aircraft DB)."; `desc` "Long type description (DB, optional)."; `dbFlags` "Bitfield: 1=military, 2=interesting, 4=PIA, 8=LADD."; `alt_baro` integer or enum "ground" — "Barometric altitude in feet, or \"ground\"."; `alt_geom` "Geometric altitude in feet (WGS84)."; `gs` "Ground speed in knots."; `track` "True track over ground, degrees."; `baro_rate` "Barometric climb rate, ft/min."; `geom_rate` "Geometric climb rate, ft/min."; `squawk` "Mode A code, 4 octal digits."; `emergency` enum none/general/lifeguard/minfuel/nordo/unlawful/downed/reserved; `category` "Emitter category A0-D7 (DO-260B 2.2.3.2.5.2)."; `nav_qnh`, `nav_altitude_mcp`, `nav_altitude_fms`, `nav_heading`, `nav_modes` enum autopilot/vnav/althold/approach/lnav/tcas; `lat`, `lon`; `nic`; `rc`; `seen_pos` "Age of the position, seconds before \"now\"."; plus ias/tas/mach/track_rate/roll/mag_heading/true_heading/version/nic_baro/nac_p/nac_v/sil/sil_type/gva/sda/alert/spi/mlat/tisb/messages/seen/rssi/wd/ws/oat/tat. Identical in shape to adsb.lol / ADSBExchange v2 / readsb aircraft.json.

### Rate limits
Current spec contains no rate-limit statement. Archived README (https://github.com/airplanes-live/api-archive, repo marked archived), verbatim: "The ADSB One API is rate limited to 1 request per second." Current numeric limit: UNVERIFIED (old /api-guide/ is 404; live API returns 403 before any limit applies).

### Terms (Termly "Terms and Conditions", AirDG LLC d/b/a Airplanes.live, version_date 08/10/2025, verbatim)
- Content and Marks "are provided in or through the Services "AS IS" for your personal, non-commercial use or internal business purpose only."
- "The Services may not be used in connection with any commercial endeavors except those that are specifically endorsed or approved by us."
- Prohibited: "Systematically retrieve data or other content from the Services to create or compile, directly or indirectly, a collection, compilation, database, or directory without written permission from us."
- Prohibited: "Use the Services as part of any effort to compete with us or otherwise use the Services and/or the Content for any revenue-generating endeavor or commercial enterprise."
- No explicit attribution clause found in the terms, FAQ, about page or spec. Attribution wording from the old api-guide: UNVERIFIED (page gone).
About page context: "FlightAware, FlightRadar24, and ADSBExchange all charge substantial fees for data and API access. We set out to build a worldwide aviation data aggregator that stays open to every aviation enthusiast."

---

## 4. ADSBExchange — commercial access model

Sources fetched: https://www.adsbexchange.com/data-products/ (WebFetch + curl), https://www.adsbexchange.com/community/developer-hub/ (curl; https://www.adsbexchange.com/api-lite/ redirects here), https://www.adsbexchange.com/data-products/sample-api-call/, https://gateway.adsbexchange.com/api/aircraft/v2/docs/openapi.json, https://rapidapi.com/adsbx/api/adsbexchange-com1 (curl; plan data parsed from embedded page JSON — RapidAPI pricing page is JS-rendered, so WebFetch returned nothing).

Two tracks. (1) **Enterprise**: "Our data products are delivered as ongoing subscription services with minimum annual commitments, supporting production systems and long-term analysis. Historical backfills for up to 10 years are available to subscription customers only. ADS-B Exchange does not offer one-time data extracts or project-based access." Enterprise REST API lives at `https://gateway.adsbexchange.com/api/aircraft/v2/...` with an `api-auth: YOUR_API_KEY` header (endpoints incl. `/lat/{lat}/lon/{lon}/dist/{dist}`, `/hex/{hex}`, `/icao/{icao}`, `/mil`, `/callsign/…`, `/registration/…`, `/sqk/…`, `/airport/…`, geospatial, operations, traces). No prices published; contact sales. (2) **Community API (formerly API Lite)** sold only through RapidAPI as the "ADS-B Exchange Personal Use Aircraft Data API": "The Community API (formerly API Lite) is built for non-commercial use—perfect for side projects, research, and experiments." / "ADS-B Exchange makes a low-cost API available for personal and non-commercial use" / "If you start hitting limits or need commercial use, we have Enterprise options for you." RapidAPI plans (from the listing's embedded billing data): **BASIC $10/month, 10,000 requests/month, overage $0.0015/request, soft limit, rate limit "No Limit"** (the only visible/recommended plan); hidden plans PRO $10 (10,000, 200 q/s), ULTRA $49.95 (50,000), MEGA $99.95 (100,000). **There is no $0 / free tier** for non-feeders. Whether feeders still receive a free API key was not confirmed on any fetched page (member-hub/aircraft-data page had no such text) — UNVERIFIED. Third-party note (x-plane.org forum via search): the old "ADSBx Flight Sim Traffic API" RapidAPI listing was discontinued 2025-03-01 in favour of this $10/10k listing.

---

## 5. readsb / tar1090 aircraft.json field semantics

Source: https://raw.githubusercontent.com/wiedehopf/readsb/dev/README-json.md (raw file saved; quotes verbatim). "(Section references (2.2.xyz) refer to DO-260B.)"

Top level: `now` "the time this file was generated, in seconds since Jan 1 1970 00:00:00 GMT (the Unix epoch)."; `messages` "the total number of Mode S messages processed since readsb started."; `aircraft` "an array of JSON objects, one per known aircraft. Each aircraft has the following keys. Keys will be omitted if data is not available."

- `hex`: "the 24-bit ICAO identifier of the aircraft, as 6 hex digits. The identifier may start with '~', this means that the address is a non-ICAO address (e.g. from TIS-B)."
- `type` (in preference order): `adsb_icao` "messages from a Mode S or ADS-B transponder, using a 24-bit ICAO address"; `adsb_icao_nt` "messages from an ADS-B equipped "non-transponder" emitter e.g. a ground vehicle"; `adsr_icao` "rebroadcast of ADS-B messages originally sent via another data link e.g. UAT"; `tisb_icao` "traffic information about a non-ADS-B target identified by a 24-bit ICAO address, e.g. a Mode S target tracked by secondary radar"; `adsc` "ADS-C (received by monitoring satellite downlinks)"; `mlat` "MLAT, position calculated arrival time differences using multiple receivers, outliers and varying accuracy is expected."; `other`; `mode_s` "ModeS data from the planes transponder (no position transmitted)"; `adsb_other`; `adsr_other`; `tisb_other`; `tisb_trackfile`.
- `flight`: "callsign, the flight name or aircraft registration as 8 chars (2.2.8.2.6)" (space-padded, e.g. "TVF73QA ").
- **`alt_baro`: "the aircraft barometric altitude in feet as a number OR "ground" as a string"** — so parse as `number | "ground"`.
- `alt_geom`: "geometric (GNSS / INS) altitude in feet referenced to the WGS84 ellipsoid"
- **`gs`: "ground speed in knots"**; `ias`/`tas` knots; `mach`.
- **`track`: "true track over ground in degrees (0-359)"**; `track_rate` deg/s; `roll` "degrees, negative is left roll"; `mag_heading`; `true_heading` "usually only transmitted on ground, in the air usually derived from the magnetic heading using magnetic model WMM2020". (ADSBx v2 docs add: when `alt_baro == "ground"`, `track` "will be true heading instead of track".)
- **`baro_rate`: "Rate of change of barometric altitude, feet/minute"**; `geom_rate` same for geometric altitude.
- `squawk`: "Mode A code (Squawk), encoded as 4 octal digits"; `emergency`: "ADS-B emergency/priority status, a superset of the 7x00 squawks (none, general, lifeguard, minfuel, nordo, unlawful, downed, reserved)".
- **`category`: "emitter category to identify particular aircraft or vehicle classes (values A0 - D7) (2.2.3.2.5.2)"** — the README does NOT enumerate the codes. Enumeration verified from tar1090's own label table (https://raw.githubusercontent.com/wiedehopf/tar1090/master/html/formatter.js, `aircraftCategories`) and the DO-260B table as reproduced at https://pkg.go.dev/kreklow.us/go/go-adsb/adsbtype; OpenSky's numeric enum (1c above) matches:
  - A0 "No ADS-B emitter category information" (tar1090: "Unspecified powered aircraft"); A1 "Light (< 15500 lbs)"; A2 "Small (15500 to 75000 lbs)"; A3 "Large (75000 to 300000 lbs)"; A4 "High vortex large (aircraft such as B-757)"; A5 "Heavy (> 300000 lbs)"; A6 "High performance (> 5g acceleration and 400 kts)"; A7 "Rotorcraft".
  - B0 "No ADS-B emitter category information" (tar1090: "Unspecified unpowered aircraft or UAV or spacecraft"); B1 "Glider / sailplane"; B2 "Lighter-than-air"; B3 "Parachutist / skydiver"; B4 "Ultralight / hang-glider / paraglider"; B5 "Reserved"; B6 "Unmanned aerial vehicle"; B7 "Space / trans-atmospheric vehicle".
  - C0 "No ADS-B emitter category information" (tar1090: "Unspecified ground installation or vehicle"); C1 "Surface vehicle – emergency vehicle"; C2 "Surface vehicle – service vehicle"; C3 "Point obstacle (includes tethered balloons)" (tar1090: "Fixed Ground or Tethered Obstruction"); C4 "Cluster obstacle"; C5 "Line obstacle"; C6, C7 "Reserved".
  - D0–D7: reserved in DO-260B (no definitions published in any fetched source; tar1090 has no D labels).
- `nav_qnh` "altimeter setting (QFE or QNH/QNE), hPa"; `nav_altitude_mcp`; `nav_altitude_fms`; `nav_heading`; `nav_modes` "'autopilot', 'vnav', 'althold', 'approach', 'lnav', 'tcas'".
- `lat, lon` "the aircraft position in decimal degrees"; `nic`; `rc` "Radius of Containment, meters"; `seen_pos` "how long ago (in seconds before "now") the position was last updated"; `seen` "how long ago (in seconds before "now") a message was last received from this aircraft"; `rssi` "recent average RSSI (signal power), in dbFS; this will always be negative."; `messages`; `mlat`/`tisb` "list of fields derived from MLAT/TIS-B data"; `version`; `nic_baro`, `nac_p`, `nac_v`, `sil`, `sil_type` (unknown/perhour/persample), `gva`, `sda`, `alert`, `spi`; `wd, ws` (wind, calculated); `oat, tat` (°C, calculated).
- Database-derived (with `--db-file` from tar1090-db): `r` "aircraft registration pulled from database"; `t` "aircraft type pulled from database"; `desc` "long type name" (optional, `--db-file-lt`); **`dbFlags`: "bitfield for certain database flags, below & must be a bitwise and": `military = dbFlags & 1; interesting = dbFlags & 2; PIA = dbFlags & 4; LADD = dbFlags & 8;`** (identical wording in ADSBExchange v2 docs and gateway OpenAPI; airplanes.live spec: "Bitfield: 1=military, 2=interesting, 4=PIA, 8=LADD.")
- `lastPosition`: "{lat, lon, nic, rc, seen_pos} when the regular lat and lon are older than 60 seconds they are no longer considered valid, this will provide the last position... aircraft will only be in the aircraft json if a messages has been received in the last 60 seconds".
- `rr_lat, rr_lon`: "If no ADS-B or MLAT position available, a rough estimated position for the aircraft based on the receiver's estimated coordinates."

---

## Belief check

| Belief | Verdict |
|---|---|
| (i) OpenSky moved to OAuth2 client credentials | **Correct.** Basic auth "no longer accepted". Token URL above; 30-min tokens. |
| (ii) OpenSky anonymous 400 / registered 4000 / contributor 8000 daily | **Correct**, with nuances: quotas are **per endpoint family** (states, tracks, flights each have an independent bucket); "contributor" = "Active feeder (≥30% uptime/month)", recalculated every 2 h; there is a 4th tier, "Licensed user 14,400, refilled hourly". |
| (iii) State-vector order [icao24, callsign, origin_country, time_position, last_contact, longitude, latitude, baro_altitude, on_ground, velocity, true_track, vertical_rate, sensors, geo_altitude, squawk, spi, position_source, category] | **Correct** (indices 0–17). Nuance: index 17 `category` is present only when the request includes `extended=1`; without it rows have 17 elements (0–16). Units are metres and m/s. |

## Other findings that change the picture
- OpenSky's free tier is not just non-commercial: clause (vi) requires a written licence for *any operational use* ("integration into a live product, service, or automated system"), even for non-profits.
- airplanes.live no longer serves anonymous/non-feeder API requests (HTTP 403 "Please contact us..."); its docs moved to /api-docs/ + /openapi.yaml; `/v2/type`, `/v2/ladd`, `/v2/pia` are gone from the current spec; terms are non-commercial "except those that are specifically endorsed or approved by us".
- adsb.lol is the only one of the three community feeds that is openly usable without feeding, under ODbL (attribution + share-alike; commercial use allowed), with dynamic unpublished rate limits and a stated intention to require feeder-obtained API keys "in the future".
- ADSBExchange has no free API tier; cheapest is $10/month for 10,000 requests via RapidAPI, licensed for personal/non-commercial use only.
- OpenSky's aircraft database is frozen (daily file dated 2024-11-04; last complete dump 2025-08) and explicitly "unlicensed... offered as is".

## Local evidence files (scratchpad)
opensky_rest.html(.txt), opensky_terms.txt, opensky_data_aircraft.txt, adsblol_openapi.json, adsblol_sample.json, airplaneslive_openapi.yaml, airplaneslive_faq.html.txt, termly_content.json(.txt), adsbx_gateway_openapi.json, rapidapi_com_adsbx_api_adsbexchange-com1.html, readsb_README-json.md
