// What the moving parts weigh, from the same dimensions they are drawn with.
import { MATERIAL } from './model.js';

// A cast wheel: toothed rim (teeth averaged to the pitch circle), a web or spokes
// at reduced thickness, and a proud hub. Matches gearGeometry() in clock/gears.js.
export function wheelVolume(s) {
  const r = s.r ?? (s.R + s.rr) / 2;
  const rim = Math.PI * (r * r - s.rimIn * s.rimIn) * s.t;
  const web = s.spokes ? s.spokes * s.spokeW * (s.rimIn - s.hubR) * s.t * 0.5 : Math.PI * (s.rimIn * s.rimIn - s.hubR * s.hubR) * s.t * 0.68;
  return rim + web + Math.PI * s.hubR * s.hubR * s.t * 1.28;
}
export const wheelMass = (s, material = MATERIAL.brass) => wheelVolume(s) * material.rho;
export const cylinderMass = (r, length, material = MATERIAL.steel, rInner = 0) => Math.PI * (r * r - rInner * rInner) * length * material.rho;
