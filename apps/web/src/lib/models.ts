import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { AircraftCategory } from '@overhead/shared';

export const MODEL_FILES: Record<AircraftCategory, string> = {
  'wide-body-jet': '/assets/models/aircraft/wide-body-jet.glb',
  'narrow-body-jet': '/assets/models/aircraft/narrow-body-jet.glb',
  'regional-jet': '/assets/models/aircraft/regional-jet.glb',
  turboprop: '/assets/models/aircraft/turboprop.glb',
  'business-jet': '/assets/models/aircraft/business-jet.glb',
  helicopter: '/assets/models/aircraft/helicopter.glb',
  'light-piston': '/assets/models/aircraft/light-piston.glb',
  generic: '/assets/models/aircraft/narrow-body-jet.glb',
};

/** Approximate wingspan / rotor diameter in metres per category, for nav-light placement. */
export const CATEGORY_SPAN_M: Record<AircraftCategory, number> = {
  'wide-body-jet': 60, 'narrow-body-jet': 35, 'regional-jet': 25, turboprop: 27, 'business-jet': 18, helicopter: 11, 'light-piston': 11, generic: 35,
};

const loader = new GLTFLoader();
const cache = new Map<string, Promise<THREE.BufferGeometry>>();
const modelCache = new Map<string, Promise<AircraftModel>>();

export interface Spinner {
  /** geometry in model space, translated so the spin pivot is at the origin */
  geometry: THREE.BufferGeometry;
  /** pivot in model space */
  pivot: THREE.Vector3;
  /** spin axis in model space (Z for propellers along the fuselage, Y for a main rotor, X for a tail rotor) */
  axis: THREE.Vector3;
  /** revolutions per second on screen (real rates alias at 60 fps; these read as "spinning") */
  rps: number;
}
export interface AircraftModel { body: THREE.BufferGeometry; spinners: Spinner[] }

const SPINNER_RE = /propeller|blade|rotor/i;

function flatten(meshes: THREE.Mesh[]): THREE.BufferGeometry | null {
  const parts: THREE.BufferGeometry[] = [];
  for (const mesh of meshes) {
    let g = mesh.geometry.clone();
    if (g.index) g = g.toNonIndexed();
    for (const name of Object.keys(g.attributes)) if (name !== 'position') g.deleteAttribute(name);
    g.applyMatrix4(mesh.matrixWorld);
    parts.push(g);
  }
  if (!parts.length) return null;
  const merged = mergeGeometries(parts, false);
  if (!merged) return null;
  merged.computeVertexNormals();
  merged.computeBoundingBox();
  return merged;
}

/**
 * Body + spinners. Spinner groups are found by node name: every mesh under a `propeller*` node forms
 * one group pivoted at that node (axis Z); `main_blade_*` / `rotor_hub` form the main rotor (axis Y,
 * pivot at the hub); `tail_rotor*` spins about X. Each group renders as its own InstancedMesh.
 */
export function loadModel(url: string): Promise<AircraftModel> {
  let p = modelCache.get(url);
  if (!p) {
    p = loader.loadAsync(url).then((gltf) => {
      gltf.scene.updateMatrixWorld(true);
      const body: THREE.Mesh[] = [];
      const groups = new Map<string, { meshes: THREE.Mesh[]; pivotNode: THREE.Object3D | null; axis: THREE.Vector3; rps: number }>();
      gltf.scene.traverse((o) => {
        const mesh = o as THREE.Mesh;
        if (!mesh.isMesh) return;
        // walk up to find a named spinner ancestor
        let node: THREE.Object3D | null = mesh; let key: string | null = null; let pivotNode: THREE.Object3D | null = null;
        while (node && node !== gltf.scene) {
          const n = node.name.toLowerCase();
          if (/^propeller/.test(n)) { key = n.replace(/_(spinner|blade_\d+)$/, ''); pivotNode = node.name.toLowerCase() === key ? node : pivotNode; }
          else if (/tail_rotor/.test(n)) { key = 'tail_rotor'; }
          else if (/main_blade|rotor_hub|^rotor$/.test(n)) { key = 'main_rotor'; }
          node = node.parent;
        }
        if (!key || !SPINNER_RE.test(key)) { body.push(mesh); return; }
        const axis = key === 'main_rotor' ? new THREE.Vector3(0, 1, 0) : key === 'tail_rotor' ? new THREE.Vector3(1, 0, 0) : new THREE.Vector3(0, 0, 1);
        const rps = key === 'main_rotor' ? 1.3 : key === 'tail_rotor' ? 5 : 3.2;
        const g = groups.get(key) ?? { meshes: [], pivotNode: null, axis, rps };
        g.meshes.push(mesh);
        if (!g.pivotNode) g.pivotNode = pivotNode ?? gltf.scene.getObjectByName(key === 'main_rotor' ? 'rotor_hub' : key) ?? null;
        groups.set(key, g);
      });
      const bodyGeom = flatten(body) ?? placeholderGeometry();
      const spinners: Spinner[] = [];
      for (const g of groups.values()) {
        const geom = flatten(g.meshes);
        if (!geom) continue;
        const pivot = new THREE.Vector3();
        if (g.pivotNode) g.pivotNode.getWorldPosition(pivot); else geom.boundingBox!.getCenter(pivot);
        geom.translate(-pivot.x, -pivot.y, -pivot.z);
        spinners.push({ geometry: geom, pivot, axis: g.axis, rps: g.rps });
      }
      return { body: bodyGeom, spinners };
    }).catch((err: unknown) => {
      console.warn('model load failed, using placeholder', url, err);
      return { body: placeholderGeometry(), spinners: [] as Spinner[] };
    });
    modelCache.set(url, p);
  }
  return p;
}
export const loadCategoryModel = (cat: AircraftCategory) => loadModel(MODEL_FILES[cat]);

/**
 * Load a GLB and flatten it into ONE geometry (world transforms applied, flat normals) so a whole
 * category renders as a single InstancedMesh: draw calls, not triangles, are the phone killer.
 * Assets are Y-up, nose along −Z, origin at the centre of mass, real metres.
 */
export function loadGeometry(url: string): Promise<THREE.BufferGeometry> {
  let p = cache.get(url);
  if (!p) {
    p = loader.loadAsync(url).then((gltf) => {
      gltf.scene.updateMatrixWorld(true);
      const parts: THREE.BufferGeometry[] = [];
      gltf.scene.traverse((o) => {
        const mesh = o as THREE.Mesh;
        if (!mesh.isMesh) return;
        let g = mesh.geometry.clone();
        if (g.index) g = g.toNonIndexed();
        for (const name of Object.keys(g.attributes)) if (name !== 'position') g.deleteAttribute(name);
        g.applyMatrix4(mesh.matrixWorld);
        parts.push(g);
      });
      if (parts.length === 0) throw new Error(`no meshes in ${url}`);
      const merged = mergeGeometries(parts, false);
      if (!merged) throw new Error(`merge failed for ${url}`);
      merged.computeVertexNormals();
      merged.computeBoundingBox();
      return merged;
    }).catch((err: unknown) => {
      console.warn('model load failed, using placeholder', url, err);
      return placeholderGeometry();
    });
    cache.set(url, p);
  }
  return p;
}

export const loadCategoryGeometry = (cat: AircraftCategory) => loadGeometry(MODEL_FILES[cat]);

/** A dart-shaped stand-in (fuselage + wing) in case a GLB cannot be fetched. Never render nothing. */
export function placeholderGeometry(): THREE.BufferGeometry {
  const fuselage = new THREE.CylinderGeometry(1.6, 1.2, 34, 8).rotateX(Math.PI / 2);
  const wing = new THREE.BoxGeometry(32, 0.6, 5).translate(0, -0.5, 2);
  const tail = new THREE.BoxGeometry(0.5, 7, 4).translate(0, 3, 14);
  const parts = [fuselage, wing, tail].map((g) => (g.index ? g.toNonIndexed() : g));
  for (const g of parts) for (const n of Object.keys(g.attributes)) if (n !== 'position') g.deleteAttribute(n);
  const merged = mergeGeometries(parts, false)!;
  merged.computeVertexNormals();
  return merged;
}
