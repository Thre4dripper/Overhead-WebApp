import { visualAltitudeMsl } from '@overhead/altitude';
import { AIRCRAFT_CATEGORIES, CATEGORY_LENGTH_M, angleDelta, type AircraftCategory } from '@overhead/shared';
import { MercatorCoordinate, type CustomLayerInterface, type CustomRenderMethodInput, type Map as MlMap } from 'maplibre-gl';
import * as THREE from 'three';
import { CATEGORY_SPAN_M, loadCategoryModel, type Spinner } from './models';
import type { Theme } from './solar';
import type { Tracked, TrafficStore } from './traffic';

export interface Projected {
  icao24: string;
  /** CSS px in the map container */
  x: number; y: number;
  visible: boolean;
  /** screen pixels per metre at the aircraft */
  pxPerM: number;
  /** on-screen length of the (possibly up-scaled) silhouette */
  lengthPx: number;
  /** metres from the camera eye */
  distanceM: number;
  /** compressed render height, metres above the reference ground */
  visualM: number;
  tracked: Tracked;
}

export interface LayerOptions {
  traffic: TrafficStore;
  getTheme: () => Theme;
  getGroundElevM: () => number;
  getSelected: () => string | null;
  getTrails: () => boolean;
  onProjected: (list: Projected[]) => void;
  /** sun direction for lighting: azimuth clockwise from north, elevation above the horizon, degrees */
  getSun?: () => { azimuth: number; elevation: number };
  /** observer position for the range rings and the home marker */
  getHome?: () => { lat: number; lon: number };
  lowEnd?: () => boolean;
  maxInstances?: number;
  /** minimum legible silhouette length in CSS px (sky treatment: never under ~28 px on a 924 px frame) */
  minPx?: () => number;
}

interface ThemeColors { sky: THREE.Color; airframe: THREE.Color; airframeHigh: THREE.Color; trail: THREE.Color; ring: THREE.Color; drop: THREE.Color; navLights: boolean; hemiSky: number; hemiGround: number; sun: number; sunIntensity: number; sunDir: [number, number, number] }

const THEMES: Record<Theme, ThemeColors> = {
  day: { sky: new THREE.Color('#bcd0dd'), airframe: new THREE.Color('#0a1a36'), airframeHigh: new THREE.Color('#3c516b'), trail: new THREE.Color('#b0246e'), ring: new THREE.Color('#b0246e'), drop: new THREE.Color('#12263c'), navLights: false, hemiSky: 0xdfe9f0, hemiGround: 0xcab37f, sun: 0xfff4e0, sunIntensity: 2.2, sunDir: [0.4, 1, 0.6] },
  golden: { sky: new THREE.Color('#e0b184'), airframe: new THREE.Color('#2a1e33'), airframeHigh: new THREE.Color('#7a5a64'), trail: new THREE.Color('#b0246e'), ring: new THREE.Color('#b0246e'), drop: new THREE.Color('#2a2418'), navLights: true, hemiSky: 0xf2c9a0, hemiGround: 0x8a6a48, sun: 0xffb070, sunIntensity: 2.6, sunDir: [-0.9, 0.25, 0.3] },
  night: { sky: new THREE.Color('#1b2440'), airframe: new THREE.Color('#2c3757'), airframeHigh: new THREE.Color('#3a4870'), trail: new THREE.Color('#e2589b'), ring: new THREE.Color('#e2589b'), drop: new THREE.Color('#e7edf4'), navLights: true, hemiSky: 0x3a4a78, hemiGround: 0x0c1020, sun: 0x8fa4d8, sunIntensity: 0.7, sunDir: [-0.3, 1, 0.2] },
};

const TRAIL_KEEP_MS = 240_000;
const MAX_TRAIL_PTS = 121;
const DEG = Math.PI / 180;

/**
 * three.js custom layer sharing MapLibre's camera matrix. Local frame: x east, y up, z south, in
 * metres around a reference Mercator origin near the map centre. One InstancedMesh per aircraft
 * category, one merged ribbon mesh for every trail, one small InstancedMesh for nav lights.
 * The depth buffer is cleared before drawing so aircraft are never hidden behind buildings or
 * terrain (docs/decisions.md).
 */
export class AircraftLayer implements CustomLayerInterface {
  readonly id = 'aircraft-3d';
  readonly type = 'custom' as const;
  readonly renderingMode = '3d' as const;

  private map!: MlMap;
  private renderer!: THREE.WebGLRenderer;
  private scene = new THREE.Scene();
  private camera = new THREE.Camera();
  private hemi!: THREE.HemisphereLight;
  private sun!: THREE.DirectionalLight;
  private meshes = new Map<AircraftCategory, THREE.InstancedMesh>();
  private spinners = new Map<AircraftCategory, { mesh: THREE.InstancedMesh; spinner: Spinner }[]>();
  private material!: THREE.MeshStandardMaterial;
  private spinMaterial!: THREE.MeshStandardMaterial;
  private fill!: THREE.DirectionalLight;
  private lastSunAt = 0;
  private navLights!: THREE.InstancedMesh;
  private trailMesh!: THREE.Mesh;
  private trailGeom!: THREE.BufferGeometry;
  private trailPos!: Float32Array;
  private trailCol!: Float32Array;
  private ring!: THREE.Mesh;
  private drops!: THREE.LineSegments;
  private dropPos!: Float32Array;
  private rings!: THREE.LineSegments;
  private ringPos!: Float32Array;
  private ringMat!: THREE.LineBasicMaterial;
  private clouds!: THREE.InstancedMesh;
  private cloudSeeds: { x: number; z: number; y: number; size: number; alpha: number }[] = [];
  private cloudMat!: THREE.MeshBasicMaterial;
  private ref: MercatorCoordinate | null = null;
  private refLngLat: [number, number] = [0, 0];
  private theme: Theme;
  private bank = new Map<string, { track: number; bank: number; t: number }>();
  private readonly maxInstances: number;
  private readonly tmpM = new THREE.Matrix4();
  private readonly tmpV = new THREE.Vector3();
  private readonly tmpV4 = new THREE.Vector4();
  private readonly tmpQ = new THREE.Quaternion();
  private readonly tmpE = new THREE.Euler();
  private readonly tmpS = new THREE.Vector3();
  private readonly tmpC = new THREE.Color();
  private visibleFlag = true;
  stats = { drawCalls: 0, aircraft: 0, frameMs: 0 };

  constructor(private readonly opts: LayerOptions) {
    this.theme = opts.getTheme();
    this.maxInstances = opts.maxInstances ?? 96;
  }

  setVisible(v: boolean): void { this.visibleFlag = v; this.map?.triggerRepaint(); }

  onAdd(map: MlMap, gl: WebGL2RenderingContext): void {
    this.map = map;
    this.renderer = new THREE.WebGLRenderer({ canvas: map.getCanvas(), context: gl, antialias: true });
    this.renderer.autoClear = false;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;

    const t = THEMES[this.theme];
    this.hemi = new THREE.HemisphereLight(t.hemiSky, t.hemiGround, 1.1);
    this.sun = new THREE.DirectionalLight(t.sun, t.sunIntensity);
    this.sun.position.set(...t.sunDir).multiplyScalar(1000);
    this.fill = new THREE.DirectionalLight(0xcfe0ff, 0.45);
    this.fill.position.set(-t.sunDir[0], 0.4, -t.sunDir[2]).multiplyScalar(1000);
    this.scene.add(this.hemi, this.sun, this.fill);

    // airframe: one material shared by every category; colour lives per instance
    this.material = new THREE.MeshStandardMaterial({ color: 0xffffff, flatShading: true, roughness: 0.72, metalness: 0.12, side: THREE.DoubleSide });
    this.spinMaterial = new THREE.MeshStandardMaterial({ color: 0x9aa0a8, flatShading: true, roughness: 0.6, metalness: 0.3, side: THREE.DoubleSide });
    for (const cat of AIRCRAFT_CATEGORIES) {
      if (cat === 'generic') continue;
      void loadCategoryModel(cat).then((model) => {
        const mesh = new THREE.InstancedMesh(model.body, this.material, this.maxInstances);
        mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
        mesh.count = 0;
        mesh.frustumCulled = false;
        this.meshes.set(cat, mesh);
        this.scene.add(mesh);
        const list = model.spinners.map((spinner) => {
          const sm = new THREE.InstancedMesh(spinner.geometry, this.spinMaterial, this.maxInstances);
          sm.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
          sm.count = 0; sm.frustumCulled = false;
          this.scene.add(sm);
          return { mesh: sm, spinner };
        });
        this.spinners.set(cat, list);
        map.triggerRepaint();
      });
    }

    // nav / beacon lights: unlit discs, only visible when the sky is dark
    const lightGeom = new THREE.SphereGeometry(1, 8, 6);
    this.navLights = new THREE.InstancedMesh(lightGeom, new THREE.MeshBasicMaterial({ color: 0xffffff, toneMapped: false }), this.maxInstances * 4);
    this.navLights.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.navLights.count = 0;
    this.navLights.frustumCulled = false;
    this.scene.add(this.navLights);

    // trails: one ribbon mesh for everyone, rebuilt each frame from the traffic store
    const maxVerts = this.maxInstances * MAX_TRAIL_PTS * 2;
    this.trailPos = new Float32Array(maxVerts * 3);
    this.trailCol = new Float32Array(maxVerts * 4);
    this.trailGeom = new THREE.BufferGeometry();
    this.trailGeom.setAttribute('position', new THREE.BufferAttribute(this.trailPos, 3).setUsage(THREE.DynamicDrawUsage));
    this.trailGeom.setAttribute('color', new THREE.BufferAttribute(this.trailCol, 4).setUsage(THREE.DynamicDrawUsage));
    const idx = new Uint32Array(this.maxInstances * (MAX_TRAIL_PTS - 1) * 6);
    this.trailGeom.setIndex(new THREE.BufferAttribute(idx, 1).setUsage(THREE.DynamicDrawUsage));
    this.trailGeom.setDrawRange(0, 0);
    this.trailMesh = new THREE.Mesh(this.trailGeom, new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, depthWrite: false, side: THREE.DoubleSide, toneMapped: false }));
    this.trailMesh.frustumCulled = false;
    this.scene.add(this.trailMesh);

    // drop lines: a hairline from each aircraft straight down to its ground track, so the compressed
    // height reads as "above that point" instead of "somewhere over there"
    this.dropPos = new Float32Array(this.maxInstances * 8 * 6);
    const dropGeom = new THREE.BufferGeometry();
    dropGeom.setAttribute('position', new THREE.BufferAttribute(this.dropPos, 3).setUsage(THREE.DynamicDrawUsage));
    dropGeom.setDrawRange(0, 0);
    this.drops = new THREE.LineSegments(dropGeom, new THREE.LineBasicMaterial({ color: t.drop, transparent: true, opacity: 0.28, depthWrite: false, toneMapped: false }));
    this.drops.frustumCulled = false;
    this.scene.add(this.drops);

    // range rings at 2 / 5 / 10 km around the observer plus a small home ring, on the ground
    const RING_SEGS = 96, RING_COUNT = 4;
    this.ringPos = new Float32Array(RING_COUNT * RING_SEGS * 2 * 3);
    const ringGeom = new THREE.BufferGeometry();
    ringGeom.setAttribute('position', new THREE.BufferAttribute(this.ringPos, 3).setUsage(THREE.DynamicDrawUsage));
    this.ringMat = new THREE.LineBasicMaterial({ color: t.drop, transparent: true, opacity: 0.22, depthWrite: false, toneMapped: false });
    this.rings = new THREE.LineSegments(ringGeom, this.ringMat);
    this.rings.frustumCulled = false;
    this.scene.add(this.rings);

    // clouds: a few soft procedural quads drifting at the top of the approach band; sparse and faint so
    // they read as depth (approach traffic below, cruise above) without hiding the city. Day and golden only.
    const cvs = document.createElement('canvas'); cvs.width = cvs.height = 128;
    const ctx = cvs.getContext('2d')!;
    const grad = ctx.createRadialGradient(64, 64, 6, 64, 64, 62);
    grad.addColorStop(0, 'rgba(255,255,255,0.85)'); grad.addColorStop(0.45, 'rgba(255,255,255,0.45)'); grad.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = grad; ctx.fillRect(0, 0, 128, 128);
    for (let i = 0; i < 9; i++) { const g2 = ctx.createRadialGradient(30 + Math.random() * 68, 30 + Math.random() * 68, 2, 64, 64, 40 + Math.random() * 20); g2.addColorStop(0, 'rgba(255,255,255,0.25)'); g2.addColorStop(1, 'rgba(255,255,255,0)'); ctx.fillStyle = g2; ctx.fillRect(0, 0, 128, 128); }
    const tex = new THREE.CanvasTexture(cvs);
    this.cloudMat = new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false, side: THREE.DoubleSide, opacity: 1, toneMapped: false });
    this.clouds = new THREE.InstancedMesh(new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2), this.cloudMat, 14);
    this.clouds.frustumCulled = false; this.clouds.count = 0;
    let seed = 11;
    const rnd = () => ((seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);
    for (let i = 0; i < 14; i++) this.cloudSeeds.push({ x: (rnd() - 0.5) * 16000, z: (rnd() - 0.5) * 16000, y: 900 + rnd() * 500, size: 700 + rnd() * 900, alpha: 0.22 + rnd() * 0.16 });
    this.scene.add(this.clouds);

    // selection ring: a hairline horizontal ring under the chosen aircraft
    this.ring = new THREE.Mesh(new THREE.RingGeometry(0.92, 1, 64), new THREE.MeshBasicMaterial({ color: t.ring, transparent: true, opacity: 0.9, side: THREE.DoubleSide, depthWrite: false, toneMapped: false }));
    this.ring.rotation.x = -Math.PI / 2;
    this.ring.visible = false;
    this.scene.add(this.ring);
  }

  onRemove(): void {
    this.scene.clear();
    this.renderer.dispose();
  }

  setTheme(theme: Theme): void {
    this.theme = theme;
    const t = THEMES[theme];
    if (this.hemi) { this.hemi.color.set(t.hemiSky); this.hemi.groundColor.set(t.hemiGround); }
    if (this.sun) { this.sun.color.set(t.sun); this.sun.intensity = t.sunIntensity; this.sun.position.set(...t.sunDir).multiplyScalar(1000); }
    if (this.ring) (this.ring.material as THREE.MeshBasicMaterial).color.set(t.ring);
    if (this.drops) (this.drops.material as THREE.LineBasicMaterial).color.set(t.drop);
    if (this.ringMat) this.ringMat.color.set(t.drop);
    this.map?.triggerRepaint();
  }

  private ensureRef(): void {
    const c = this.map.getCenter();
    if (!this.ref || Math.abs(c.lng - this.refLngLat[0]) > 0.03 || Math.abs(c.lat - this.refLngLat[1]) > 0.03) {
      this.ref = MercatorCoordinate.fromLngLat([c.lng, c.lat], 0);
      this.refLngLat = [c.lng, c.lat];
    }
  }

  /** local metric coordinates for a lng/lat + visual height */
  private toLocal(lon: number, lat: number, yMetres: number, s: number, out: THREE.Vector3): THREE.Vector3 {
    const mc = MercatorCoordinate.fromLngLat([lon, lat], 0);
    return out.set((mc.x - this.ref!.x) / s, yMetres, (mc.y - this.ref!.y) / s);
  }

  /** project a local point through the current camera → CSS px; returns w (depth) or -1 if behind */
  private project(local: THREE.Vector3, w: number, h: number, out: { x: number; y: number }): number {
    const v = this.tmpV4.set(local.x, local.y, local.z, 1).applyMatrix4(this.camera.projectionMatrix);
    if (v.w <= 0) return -1;
    out.x = ((v.x / v.w + 1) / 2) * w;
    out.y = ((1 - v.y / v.w) / 2) * h;
    return v.w;
  }

  render(_gl: WebGL2RenderingContext, options: CustomRenderMethodInput): void {
    const t0 = performance.now();
    if (!this.visibleFlag) { this.opts.onProjected([]); return; }
    this.ensureRef();
    const ref = this.ref!;
    const s = ref.meterInMercatorCoordinateUnits();
    const m = new THREE.Matrix4().fromArray(options.defaultProjectionData.mainMatrix as unknown as number[]);
    // local (x east, y up, z south) metres → Mercator (x east, y south, z up)
    const model = new THREE.Matrix4().makeTranslation(ref.x, ref.y, ref.z).multiply(new THREE.Matrix4().set(s, 0, 0, 0, 0, 0, s, 0, 0, s, 0, 0, 0, 0, 0, 1));
    this.camera.projectionMatrix.copy(m).multiply(model);

    const now = Date.now();
    const list = this.opts.traffic.tick(now);
    const th = THEMES[this.theme];
    const ground = this.opts.getGroundElevM();
    const canvas = this.map.getCanvas();
    const W = canvas.clientWidth, H = canvas.clientHeight;
    const minPx = this.opts.minPx?.() ?? Math.min(34, Math.max(18, H * 0.032));
    const selected = this.opts.getSelected();
    const showTrails = this.opts.getTrails();
    // camera eye in local metres, from the map state (MapLibre 6 exposes no free-camera getter):
    // the eye sits cameraToCenterDistance behind the centre along the bearing, tilted by the pitch
    const centre = this.map.getCenter();
    const fov = this.map.getVerticalFieldOfView();
    const fovRad = fov > Math.PI ? (fov * Math.PI) / 180 : fov;
    const mpp = (156543.03392 * Math.cos((centre.lat * Math.PI) / 180)) / 2 ** this.map.getZoom();
    const camDistM = ((0.5 * H) / Math.tan(fovRad / 2)) * mpp;
    const pitchRad = (this.map.getPitch() * Math.PI) / 180, bearingRad = (this.map.getBearing() * Math.PI) / 180;
    const centreLocal = this.toLocal(centre.lng, centre.lat, 0, s, new THREE.Vector3());
    const camLocal: THREE.Vector3 | null = new THREE.Vector3(
      centreLocal.x - Math.sin(bearingRad) * camDistM * Math.sin(pitchRad),
      camDistM * Math.cos(pitchRad) + ground,
      centreLocal.z + Math.cos(bearingRad) * camDistM * Math.sin(pitchRad),
    );

    // lighting follows the real sun (clamped so night is still legible), refreshed once a minute
    if (this.opts.getSun && now - this.lastSunAt > 60_000) {
      this.lastSunAt = now;
      const sun = this.opts.getSun();
      const el = Math.max(8, sun.elevation) * DEG, az = sun.azimuth * DEG;
      // local frame: x east, y up, z south; azimuth clockwise from north
      this.sun.position.set(Math.cos(el) * Math.sin(az), Math.sin(el), -Math.cos(el) * Math.cos(az)).multiplyScalar(1000);
      this.fill.position.set(-Math.sin(az), 0.35, Math.cos(az)).multiplyScalar(1000);
    }
    const counts = new Map<AircraftCategory, number>();
    for (const mesh of this.meshes.values()) mesh.count = 0;
    for (const list of this.spinners.values()) for (const s of list) s.mesh.count = 0;
    const spinM = new THREE.Matrix4(), spinQ = new THREE.Quaternion(), spinT = new THREE.Matrix4();
    let lights = 0;
    const projected: Projected[] = [];
    const pt = { x: 0, y: 0 };
    const pt2 = { x: 0, y: 0 };
    const local = new THREE.Vector3();
    const local2 = new THREE.Vector3();
    let ringSet = false;
    let dropVerts = 0;
    let trailVerts = 0, trailIdx = 0;
    const idxArr = this.trailGeom.index!.array as Uint32Array;

    for (const tr of list) {
      const cat: AircraftCategory = tr.a.category === 'generic' ? 'narrow-body-jet' : tr.a.category;
      const mesh = this.meshes.get(cat);
      const visualM = visualAltitudeMsl(tr.altM, ground) - ground;
      this.toLocal(tr.lon, tr.lat, visualM + ground, s, local);
      const w = this.project(local, W, H, pt);
      // pixels per metre at this depth: project a point 1 m east
      let pxPerM = 0;
      if (w > 0) { local2.copy(local).x += 1; this.project(local2, W, H, pt2); pxPerM = Math.hypot(pt2.x - pt.x, pt2.y - pt.y); }
      const lengthM = CATEGORY_LENGTH_M[cat];
      const distanceM = camLocal ? camLocal.distanceTo(local) : 0;
      const onScreen = w > 0 && pt.x > -120 && pt.x < W + 120 && pt.y > -120 && pt.y < H + 120;
      // silhouette scale on top of true perspective: legible, never a dot
      const bandScale = 1 + 0.35 * Math.min(1, Math.max(0, (visualM - 300) / 1700));
      const legible = pxPerM > 0 ? minPx / (lengthM * pxPerM) : 1;
      const scale = Math.min(9, Math.max(bandScale, legible));
      projected.push({ icao24: tr.icao24, x: pt.x, y: pt.y, visible: onScreen, pxPerM, lengthPx: lengthM * scale * pxPerM, distanceM, visualM, tracked: tr });
      if (!mesh || !onScreen) continue;
      const i = counts.get(cat) ?? 0;
      if (i >= this.maxInstances) continue;
      counts.set(cat, i + 1);

      // attitude: heading from track, pitch from vertical rate, bank from the rate of turn
      const gs = tr.a.velocityMps ?? 0;
      const vr = tr.a.verticalRateMps ?? 0;
      const pitch = gs > 20 ? Math.max(-0.22, Math.min(0.22, Math.atan2(vr, gs) * 1.6)) : 0;
      let bank = 0;
      const b = this.bank.get(tr.icao24);
      if (b) {
        const dt = Math.max(0.016, (now - b.t) / 1000);
        const rate = angleDelta(b.track, tr.track) / dt; // deg/s
        const target = Math.max(-28, Math.min(28, -rate * 9));
        bank = b.bank + (target - b.bank) * Math.min(1, dt * 2.5);
      }
      this.bank.set(tr.icao24, { track: tr.track, bank, t: now });
      this.tmpE.set(pitch, -tr.track * DEG, bank * DEG, 'YXZ');
      this.tmpQ.setFromEuler(this.tmpE);
      this.tmpS.set(scale, scale, scale);
      this.tmpM.compose(local, this.tmpQ, this.tmpS);
      mesh.setMatrixAt(i, this.tmpM);
      // propellers and rotors: aircraft matrix × translate(pivot) × rotate(axis, θ), one extra instanced draw per group
      const spins = this.spinners.get(cat);
      if (spins) {
        for (const sp of spins) {
          const theta = (now / 1000) * sp.spinner.rps * Math.PI * 2 + i * 0.7;
          spinQ.setFromAxisAngle(sp.spinner.axis, theta);
          spinT.makeTranslation(sp.spinner.pivot.x, sp.spinner.pivot.y, sp.spinner.pivot.z).multiply(spinM.makeRotationFromQuaternion(spinQ));
          spinM.copy(this.tmpM).multiply(spinT);
          sp.mesh.setMatrixAt(i, spinM);
          sp.mesh.count = i + 1;
        }
      }

      // aerial mix: lerp the airframe toward the sky with height, then with distance; fade when stale
      const aerial = 0.04 + 0.42 * Math.min(1, Math.max(0, (visualM - 120) / 1800));
      const distFade = 0.45 * Math.min(1, Math.max(0, (distanceM - 4000) / 14000));
      this.tmpC.copy(th.airframe).lerp(th.airframeHigh, Math.min(1, visualM / 1900)).lerp(th.sky, Math.min(0.85, aerial + distFade + (1 - tr.freshness) * 0.5));
      mesh.setColorAt(i, this.tmpC);
      mesh.count = i + 1;

      if (dropVerts + 2 <= this.dropPos.length / 3) {
        const di = dropVerts * 3;
        this.dropPos[di] = local.x; this.dropPos[di + 1] = local.y - lengthM * scale * 0.1; this.dropPos[di + 2] = local.z;
        this.dropPos[di + 3] = local.x; this.dropPos[di + 4] = ground; this.dropPos[di + 5] = local.z;
        dropVerts += 2;
      }

      if (selected === tr.icao24) {
        const r = Math.max(lengthM * scale * 0.9, 14 / Math.max(pxPerM, 1e-6));
        this.ring.position.copy(local).y -= lengthM * scale * 0.12;
        this.ring.scale.set(r, r, 1);
        this.ring.visible = true; ringSet = true;
      }

      if (th.navLights && lights + 4 <= this.navLights.count + 4 && lights + 4 <= this.maxInstances * 4) {
        const span = CATEGORY_SPAN_M[cat] * scale * 0.5;
        const len = lengthM * scale * 0.5;
        const r = Math.max(0.9 * scale, 1.7 / Math.max(pxPerM, 1e-6));
        const blink = Math.floor(now / 500 + i * 3) % 2 === 0;
        const place = (dx: number, dy: number, dz: number, color: number, on = true) => {
          this.tmpV.set(dx, dy, dz).applyQuaternion(this.tmpQ).add(local);
          this.tmpM.compose(this.tmpV, this.tmpQ, this.tmpS.set(on ? r : 0.0001, on ? r : 0.0001, on ? r : 0.0001));
          this.navLights.setMatrixAt(lights, this.tmpM);
          this.navLights.setColorAt(lights, this.tmpC.set(color));
          lights++;
        };
        place(-span, 0, 0, 0xd8324f);      // port red
        place(span, 0, 0, 0x2fbf6a);       // starboard green
        place(0, 0, len, 0xf2efe6);        // tail white
        place(0, -lengthM * scale * 0.06, 0, 0xd8324f, blink); // belly beacon
      }

      // trail ribbon: horizontal, tapering with age, alpha fading to nothing at the tail
      if (showTrails && tr.trail.length >= 2 && trailVerts + tr.trail.length * 2 + 2 < this.trailPos.length / 3) {
        const pts = tr.trail;
        const n = Math.min(pts.length, MAX_TRAIL_PTS - 1);
        const start = pts.length - n;
        const w0 = Math.max(lengthM * 0.11 * scale, 2.0 / Math.max(pxPerM, 1e-6));
        const base = trailVerts;
        let prevX = 0, prevZ = 0;
        for (let k = 0; k <= n; k++) {
          const p = k < n ? pts[start + k]! : null;
          const px = p ? p.lon : tr.lon, py = p ? p.lat : tr.lat, pa = p ? p.altM : tr.altM, ptime = p ? p.t : now;
          const age = Math.min(1, Math.max(0, (now - ptime) / TRAIL_KEEP_MS));
          this.toLocal(px, py, visualAltitudeMsl(pa, ground), s, local2);
          const nx = k === 0 ? 0 : local2.x - prevX, nz = k === 0 ? 0 : local2.z - prevZ;
          const len2 = Math.hypot(nx, nz) || 1;
          const ox = (-nz / len2) * w0 * Math.pow(1 - age, 0.95), oz = (nx / len2) * w0 * Math.pow(1 - age, 0.95);
          prevX = local2.x; prevZ = local2.z;
          const alpha = 0.42 * Math.pow(1 - age, 1.5) * tr.freshness * (1 - Math.min(0.6, distFade));
          const col = this.tmpC.copy(th.trail).lerp(th.sky, aerial * 0.5);
          for (const sign of [-1, 1]) {
            const vi = trailVerts * 3, ci = trailVerts * 4;
            this.trailPos[vi] = local2.x + ox * sign; this.trailPos[vi + 1] = local2.y - 0.5; this.trailPos[vi + 2] = local2.z + oz * sign;
            this.trailCol[ci] = col.r; this.trailCol[ci + 1] = col.g; this.trailCol[ci + 2] = col.b; this.trailCol[ci + 3] = alpha;
            trailVerts++;
          }
          if (k > 0) {
            const a = base + (k - 1) * 2;
            idxArr[trailIdx++] = a; idxArr[trailIdx++] = a + 1; idxArr[trailIdx++] = a + 2;
            idxArr[trailIdx++] = a + 1; idxArr[trailIdx++] = a + 3; idxArr[trailIdx++] = a + 2;
          }
        }
      }
    }

    for (const mesh of this.meshes.values()) {
      if (mesh.count > 0) { mesh.instanceMatrix.needsUpdate = true; if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true; }
    }
    for (const list of this.spinners.values()) for (const s of list) if (s.mesh.count > 0) s.mesh.instanceMatrix.needsUpdate = true;
    // keep repainting while anything is spinning
    if (list.length > 0) this.map.triggerRepaint();
    this.navLights.count = th.navLights ? lights : 0;
    if (lights) { this.navLights.instanceMatrix.needsUpdate = true; if (this.navLights.instanceColor) this.navLights.instanceColor.needsUpdate = true; }
    // range rings around the observer: 2, 5, 10 km, and a 60 m home ring (never under ~7 px)
    if (this.opts.getHome) {
      const h = this.opts.getHome();
      const c = this.toLocal(h.lon, h.lat, ground + 1.5, s, new THREE.Vector3());
      const homePx = this.project(c, W, H, pt);
      let hp = 0;
      if (homePx > 0) { local2.copy(c).x += 1; this.project(local2, W, H, pt2); hp = Math.hypot(pt2.x - pt.x, pt2.y - pt.y); }
      const radii = [2000, 5000, 10000, Math.max(60, 7 / Math.max(hp, 1e-6))];
      const SEGS = 96; let k = 0;
      for (const r of radii) {
        for (let i = 0; i < SEGS; i++) {
          const a0 = (i / SEGS) * Math.PI * 2, a1 = ((i + 1) / SEGS) * Math.PI * 2;
          this.ringPos[k++] = c.x + Math.cos(a0) * r; this.ringPos[k++] = c.y; this.ringPos[k++] = c.z + Math.sin(a0) * r;
          this.ringPos[k++] = c.x + Math.cos(a1) * r; this.ringPos[k++] = c.y; this.ringPos[k++] = c.z + Math.sin(a1) * r;
        }
      }
      (this.rings.geometry.attributes.position as THREE.BufferAttribute).needsUpdate = true;
      this.rings.visible = true;
    } else this.rings.visible = false;

    // clouds drift slowly on a fixed wind, wrapping around a 16 km cell centred on the reference origin
    if (this.theme !== 'night' && !(this.opts.lowEnd?.() ?? false)) {
      const drift = (now / 1000) * 6; // m/s
      let ci = 0;
      for (const c of this.cloudSeeds) {
        const wrap = (v: number) => ((v + 8000) % 16000 + 16000) % 16000 - 8000;
        const x = wrap(c.x + drift), z = wrap(c.z + drift * 0.35);
        this.tmpM.compose(this.tmpV.set(x, c.y + ground, z), this.tmpQ.identity(), this.tmpS.set(c.size, 1, c.size * 0.72));
        this.clouds.setMatrixAt(ci, this.tmpM);
        this.clouds.setColorAt(ci, this.tmpC.copy(th.sky).lerp(new THREE.Color(0xffffff), 0.55));
        ci++;
      }
      this.clouds.count = ci; this.clouds.instanceMatrix.needsUpdate = true; if (this.clouds.instanceColor) this.clouds.instanceColor.needsUpdate = true;
      this.cloudMat.opacity = this.theme === 'golden' ? 0.5 : 0.62;
    } else this.clouds.count = 0;

    this.ring.visible = ringSet;
    (this.drops.geometry.attributes.position as THREE.BufferAttribute).needsUpdate = true;
    this.drops.geometry.setDrawRange(0, dropVerts);
    (this.trailGeom.attributes.position as THREE.BufferAttribute).needsUpdate = true;
    (this.trailGeom.attributes.color as THREE.BufferAttribute).needsUpdate = true;
    this.trailGeom.index!.needsUpdate = true;
    this.trailGeom.setDrawRange(0, trailIdx);
    this.trailMesh.visible = trailIdx > 0;

    // bank entries for aircraft that vanished
    if (this.bank.size > list.length * 2) for (const k of this.bank.keys()) if (!list.some((t) => t.icao24 === k)) this.bank.delete(k);

    this.renderer.resetState();
    this.renderer.clearDepth();           // aircraft are above everything; never let a tower hide one
    this.renderer.render(this.scene, this.camera);
    this.stats.drawCalls = this.renderer.info.render.calls;
    this.stats.aircraft = list.length;
    this.stats.frameMs = performance.now() - t0;
    this.opts.onProjected(projected);
    if (list.length > 0) this.map.triggerRepaint();
  }
}
