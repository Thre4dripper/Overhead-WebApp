export function hasWebGL2(): boolean {
  try {
    const c = document.createElement('canvas');
    const gl = c.getContext('webgl2', { failIfMajorPerformanceCaveat: false });
    return !!gl;
  } catch { return false; }
}

/** Rough device tier from hardware hints — decides trails, model instance caps and label count. */
export function lowEndDevice(): boolean {
  const nav = navigator as Navigator & { deviceMemory?: number; hardwareConcurrency?: number };
  if (nav.deviceMemory != null && nav.deviceMemory <= 2) return true;
  if (nav.hardwareConcurrency != null && nav.hardwareConcurrency <= 2) return true;
  return false;
}
