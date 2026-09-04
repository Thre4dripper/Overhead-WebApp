# Design assets

The approved source assets for Overhead, produced with Claude Design against the prompts in
`../overhead-agent-prompt.md`. They are the reference, not the runtime: the app loads its own copies
from `../apps/web/public/assets/`, which are the same files with the C2PA manifests stripped so the
SVGs stay small over the wire. Re-copy after editing anything here.

| Path | What | Used by |
|---|---|---|
| `models/aircraft/*.glb` | Seven aircraft categories, Y-up, nose along −Z, origin at the centre of mass, real metres, one material | `apps/web/src/lib/models.ts` splits each into a body plus pivoted propeller and rotor groups |
| `models/city-kit/*.glb` | Eight low-poly building archetypes plus an assembled `street.glb` | `street.glb` builds the homepage diorama; MapLibre extrudes the real city from OpenStreetMap footprints, so the rest is reference |
| `models/sky-treatment/` | The four-height, three-lighting scene that fixes the aerial mix, contrail and nav-light treatment | Reimplemented as material and shader settings in `apps/web/src/lib/aircraftLayer.ts` |
| `vector/hud/*.svg` | Altitude ruler, compass, scale and tilt, aircraft label plate, and a full overlay, day and night | Redrawn as live React components in `apps/web/src/components/hud/` so they track real values |
| `vector/aircraft-icons/*.svg` | Top-down silhouettes, 64×64, centre of mass at (32,32), `currentColor` | Paths are inlined in `apps/web/src/lib/icons.ts` for the 2D map, lists and the AR view |
| `vector/trails/*.svg` | Three motion-trail treatments (tapering solid, dotted, fading), day and night | The tapering solid is what the 3D layer draws |
| `vector/empty-state/` | "Nothing overhead" illustration on a 400×300 viewBox | Shown inside the overhead sheet when nothing is in range |
| `vector/stamps/*.svg` | Eight logbook badges, 96×96 | The browser-side logbook awards these |
| `vector/app-icon/` | App icon and a monochrome badge, 1024×1024 with a safe circle at r 410 | Rasterised into `apps/web/public/icons/` by `pnpm icons` |

Each folder also carries the `canvas.dc.html` (or `canvas.html`) design canvas it was delivered in.
Those are inert previews: they reference support files that were never part of the delivery, so they
are kept for the specifications written on them — palettes, stroke weights, anchor positions and the
ruler's compression formula — not because they run.
