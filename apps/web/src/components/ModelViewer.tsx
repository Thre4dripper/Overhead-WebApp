import type { AircraftCategory } from '@overhead/shared';
import { useEffect, useRef } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { loadCategoryModel } from '../lib/models';
import { useApp } from '../lib/store';

const AIRFRAME: Record<string, number> = { day: 0x102a4a, golden: 0x3a2a3d, night: 0x3a4870 };

/** Orbitable 3D model of the selected aircraft's category. Drag to orbit, pinch to zoom, idles with a slow turn. */
export function ModelViewer({ category }: { category: AircraftCategory }) {
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
    const camera = new THREE.PerspectiveCamera(32, el.clientWidth / el.clientHeight, 0.5, 2000);
    const hemi = new THREE.HemisphereLight(theme === 'night' ? 0x3a4a78 : 0xdfe9f0, theme === 'night' ? 0x0c1020 : 0xcab37f, 1.2);
    const sun = new THREE.DirectionalLight(theme === 'golden' ? 0xffb070 : 0xfff4e0, theme === 'night' ? 0.8 : 2.4);
    sun.position.set(-3, 5, 4);
    scene.add(hemi, sun);
    const material = new THREE.MeshStandardMaterial({ color: AIRFRAME[theme] ?? 0x102a4a, flatShading: true, roughness: 0.72, metalness: 0.12 });
    let mesh: THREE.Mesh | null = null;
    const spinning: { group: THREE.Group; axis: THREE.Vector3; rps: number }[] = [];
    let disposed = false;
    void loadCategoryModel(category).then((model) => {
      if (disposed) return;
      mesh = new THREE.Mesh(model.body, material);
      scene.add(mesh);
      for (const sp of model.spinners) {
        const group = new THREE.Group();
        group.position.copy(sp.pivot);
        group.add(new THREE.Mesh(sp.geometry, new THREE.MeshStandardMaterial({ color: 0x9aa0a8, flatShading: true, roughness: 0.6, metalness: 0.3 })));
        scene.add(group);
        spinning.push({ group, axis: sp.axis, rps: sp.rps });
      }
      const box = new THREE.Box3().setFromObject(mesh);
      const size = box.getSize(new THREE.Vector3()).length();
      camera.position.set(size * 0.55, size * 0.36, size * 0.8);
      controls.target.set(0, 0, 0);
      controls.minDistance = size * 0.5; controls.maxDistance = size * 2.2;
      controls.update();
    });
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enablePan = false; controls.enableDamping = true; controls.autoRotate = true; controls.autoRotateSpeed = 0.9;
    let raf = 0;
    const loop = () => {
      const t = performance.now() / 1000;
      for (const sp of spinning) sp.group.quaternion.setFromAxisAngle(sp.axis, t * sp.rps * Math.PI * 2);
      controls.update(); renderer.render(scene, camera); raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    const ro = new ResizeObserver(() => { renderer.setSize(el.clientWidth, el.clientHeight, false); camera.aspect = el.clientWidth / el.clientHeight; camera.updateProjectionMatrix(); });
    ro.observe(el);
    return () => {
      disposed = true; cancelAnimationFrame(raf); ro.disconnect(); controls.dispose();
      material.dispose(); renderer.dispose(); renderer.domElement.remove();
    };
  }, [category, theme]);
  return <div className="viewer" ref={ref}><span className="hint">DRAG TO ORBIT</span></div>;
}
