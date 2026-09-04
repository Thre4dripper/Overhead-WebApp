import { useEffect, useRef } from 'react';
import * as THREE from 'three';
import { loadCategoryModel, loadGeometry } from '../lib/models';
import { useApp } from '../lib/store';

/** Homepage hero: the low-poly street kit with two aircraft crossing above it — the app icon's idea in motion. */
export function Diorama() {
  const ref = useRef<HTMLDivElement>(null);
  const theme = useApp((s) => s.theme);
  useEffect(() => {
    const el = ref.current!;
    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: 'low-power' });
    renderer.setPixelRatio(Math.min(2, window.devicePixelRatio));
    renderer.setSize(el.clientWidth, el.clientHeight, false);
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    el.appendChild(renderer.domElement);
    const scene = new THREE.Scene();
    const night = theme === 'night', golden = theme === 'golden';
    const skyHex = night ? '#1b2440' : golden ? '#e0b184' : '#bcd0dd';
    scene.fog = new THREE.Fog(new THREE.Color(skyHex), 300, 900);
    const camera = new THREE.PerspectiveCamera(36, el.clientWidth / el.clientHeight, 1, 4000);
    scene.add(new THREE.HemisphereLight(night ? 0x3a4a78 : 0xdfe9f0, night ? 0x0c1020 : 0xcab37f, 1.1));
    const sun = new THREE.DirectionalLight(golden ? 0xffb070 : 0xfff4e0, night ? 0.6 : 2.2);
    sun.position.set(golden ? -400 : -200, golden ? 120 : 400, 200); scene.add(sun);
    const ground = new THREE.Mesh(new THREE.PlaneGeometry(4000, 4000), new THREE.MeshStandardMaterial({ color: night ? 0x161e33 : golden ? 0xd0b27a : 0xcab37f, roughness: 1 }));
    ground.rotation.x = -Math.PI / 2; ground.position.y = -0.4; scene.add(ground);
    const buildingMat = new THREE.MeshStandardMaterial({ color: night ? 0x232e4a : golden ? 0xb8935e : 0xaf9761, roughness: 0.95, flatShading: true });
    const airMat = new THREE.MeshStandardMaterial({ color: night ? 0x3a4870 : 0x102a4a, roughness: 0.72, metalness: 0.12, flatShading: true });
    const propMat = new THREE.MeshStandardMaterial({ color: 0x9aa0a8, roughness: 0.6, metalness: 0.3, flatShading: true });
    const trailMat = new THREE.MeshBasicMaterial({ color: night ? 0xe2589b : 0xb0246e, transparent: true, opacity: 0.32, side: THREE.DoubleSide, depthWrite: false });
    let alive = true;
    void loadGeometry('/assets/models/city/street.glb').then((g) => {
      if (!alive) return;
      for (const [dx, dz, rot] of [[0, 0, 0], [0, -75, Math.PI], [0, 75, Math.PI], [-185, 0, 0], [185, 0, 0], [-185, -75, Math.PI], [185, -75, Math.PI], [0, -150, 0], [-185, -150, 0], [185, -150, 0]] as const) {
        const m = new THREE.Mesh(g, buildingMat); m.position.set(dx, 0, dz); m.rotation.y = rot; scene.add(m);
      }
    });
    interface Flyer { root: THREE.Group; spin: { g: THREE.Group; axis: THREE.Vector3; rps: number }[]; trail: THREE.Mesh; y: number; speed: number; z: number; phase: number; dir: 1 | -1 }
    const flyers: Flyer[] = [];
    const addFlyer = (cat: 'narrow-body-jet' | 'turboprop', y: number, z: number, speed: number, dir: 1 | -1, scale: number, phase: number) =>
      loadCategoryModel(cat).then((model) => {
        if (!alive) return;
        const root = new THREE.Group();
        root.add(new THREE.Mesh(model.body, airMat));
        const spin = model.spinners.map((sp) => { const g = new THREE.Group(); g.position.copy(sp.pivot); g.add(new THREE.Mesh(sp.geometry, propMat)); root.add(g); return { g, axis: sp.axis, rps: sp.rps }; });
        root.scale.setScalar(scale);
        // nose is along −Z in model space; heading east (+x) is a −90° yaw, west is +90°
        root.rotation.y = dir === 1 ? -Math.PI / 2 : Math.PI / 2;
        scene.add(root);
        const trail = new THREE.Mesh(new THREE.PlaneGeometry(220 * scale, 5 * scale), trailMat);
        trail.rotation.x = -Math.PI / 2; scene.add(trail);
        flyers.push({ root, spin, trail, y, speed, z, phase, dir });
      });
    void addFlyer('narrow-body-jet', 150, -60, 0.075, 1, 1.6, 0);
    void addFlyer('turboprop', 105, 30, 0.055, -1, 1.4, 0.45);
    let raf = 0; const t0 = performance.now();
    const loop = () => {
      const t = (performance.now() - t0) / 1000;
      camera.position.set(Math.sin(t * 0.05) * 160, 150 + Math.sin(t * 0.09) * 6, 360 + Math.cos(t * 0.05) * 30);
      camera.lookAt(0, 70, -80);
      for (const f of flyers) {
        const u = ((t * f.speed + f.phase) % 1);
        const x = f.dir === 1 ? -380 + u * 760 : 380 - u * 760;
        f.root.position.set(x, f.y + Math.sin(u * Math.PI) * 6, f.z + Math.sin(u * Math.PI) * -20);
        f.root.rotation.z = Math.sin(u * Math.PI * 2) * 0.05;
        for (const sp of f.spin) sp.g.quaternion.setFromAxisAngle(sp.axis, t * sp.rps * Math.PI * 2);
        f.trail.position.set(x - f.dir * 120 * f.root.scale.x, f.root.position.y - 1, f.root.position.z);
      }
      renderer.render(scene, camera); raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    const ro = new ResizeObserver(() => { renderer.setSize(el.clientWidth, el.clientHeight, false); camera.aspect = el.clientWidth / el.clientHeight; camera.updateProjectionMatrix(); });
    ro.observe(el);
    return () => { alive = false; cancelAnimationFrame(raf); ro.disconnect(); renderer.dispose(); renderer.domElement.remove(); };
  }, [theme]);
  return <div className="diorama" ref={ref} aria-hidden />;
}
