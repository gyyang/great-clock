// Steam you can see: soft billboards that rise, spread and thin out.
// One instanced draw call; particles live in a ring buffer and are integrated on the CPU.
import * as THREE from 'three';

const VERT = `
  attribute vec3 iPos; attribute vec4 iPar;      // iPar: age 0..1, size (m), opacity, seed
  uniform float fogDensity;
  varying vec2 vUv; varying float vA; varying float vFog;
  void main(){
    float age = iPar.x;
    vec4 mv = viewMatrix * vec4(iPos, 1.0);
    float rot = iPar.w * 6.283 + age * (iPar.w - 0.5) * 2.5;
    float cs = cos(rot), sn = sin(rot);
    mv.xy += vec2(position.x * cs - position.y * sn, position.x * sn + position.y * cs) * iPar.y;
    gl_Position = projectionMatrix * mv;
    vUv = position.xy * 2.0;
    float d = -mv.z;
    vFog = 1.0 - exp(-fogDensity * fogDensity * d * d);
    vA = iPar.z * smoothstep(0.0, 0.07, age) * (1.0 - smoothstep(0.4, 1.0, age)) * smoothstep(0.4, 2.0, d);
  }`;
const FRAG = `
  uniform vec3 tint; uniform vec3 fogColor;
  varying vec2 vUv; varying float vA; varying float vFog;
  void main(){
    float r = length(vUv);
    if (r > 1.0) discard;
    float a = (exp(-3.2 * r * r) - 0.0408) / 0.9592;          // soft all the way to the rim
    gl_FragColor = vec4(mix(tint, fogColor, vFog * 0.8), a * vA * (1.0 - vFog * 0.5));
  }`;

export class SteamCloud {
  constructor(scene, max = 1600) {
    this.max = max; this.head = 0;
    this.pos = new Float32Array(max * 3); this.par = new Float32Array(max * 4);
    this.vel = new Float32Array(max * 3);
    this.age = new Float32Array(max); this.life = new Float32Array(max);     // life 0: slot is free
    this.s0 = new Float32Array(max); this.s1 = new Float32Array(max);

    const quad = new THREE.PlaneGeometry(1, 1), geo = new THREE.InstancedBufferGeometry();
    geo.index = quad.index; geo.setAttribute('position', quad.attributes.position);
    this.aPos = new THREE.InstancedBufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage);
    this.aPar = new THREE.InstancedBufferAttribute(this.par, 4).setUsage(THREE.DynamicDrawUsage);
    geo.setAttribute('iPos', this.aPos); geo.setAttribute('iPar', this.aPar);
    geo.instanceCount = max;
    this.material = new THREE.ShaderMaterial({
      transparent: true, depthWrite: false, fog: false, vertexShader: VERT, fragmentShader: FRAG,
      uniforms: { tint: { value: new THREE.Color(0.46, 0.41, 0.34) }, fogColor: { value: new THREE.Color() }, fogDensity: { value: 0 } },
    });
    this.mesh = new THREE.Mesh(geo, this.material);
    this.mesh.frustumCulled = false; this.mesh.renderOrder = 2;
    // The shader ignores the model matrix. Parking the mesh far below ground keeps passes that
    // swap in their own material (ambient occlusion) from drawing the bare quad inside the hall.
    this.mesh.position.y = -9000;
    scene.add(this.mesh);
  }

  // p: {x,y,z}; v: [vx,vy,vz] m/s; spread: random speed added on each axis.
  emit(p, v, { spread = 0.5, life = 3, s0 = 0.3, s1 = 3, alpha = 0.4 } = {}) {
    const i = this.head; this.head = (i + 1) % this.max;
    const r = () => (Math.random() - 0.5) * 2 * spread;
    this.pos[i * 3] = p.x; this.pos[i * 3 + 1] = p.y; this.pos[i * 3 + 2] = p.z;
    this.vel[i * 3] = v[0] + r(); this.vel[i * 3 + 1] = v[1] + r(); this.vel[i * 3 + 2] = v[2] + r();
    this.age[i] = 0; this.life[i] = life * (0.75 + Math.random() * 0.5);
    this.s0[i] = s0; this.s1[i] = s1 * (0.7 + Math.random() * 0.6);
    this.par[i * 4 + 2] = alpha; this.par[i * 4 + 3] = Math.random();
  }

  update(dt, fog) {
    const { pos, par, vel, age, life } = this, slow = Math.max(0, 1 - 0.9 * dt);
    for (let i = 0; i < this.max; i++) {
      if (life[i] <= 0) continue;
      age[i] += dt;
      const t = age[i] / life[i], k = i * 3;
      if (t >= 1) { life[i] = 0; par[i * 4 + 1] = 0; continue; }
      vel[k] *= slow; vel[k + 1] = vel[k + 1] * slow + 0.7 * dt; vel[k + 2] *= slow;       // drag, and warm air rises
      pos[k] += vel[k] * dt; pos[k + 1] += vel[k + 1] * dt; pos[k + 2] += vel[k + 2] * dt;
      par[i * 4] = t; par[i * 4 + 1] = this.s0[i] + (this.s1[i] - this.s0[i]) * (1 - (1 - t) * (1 - t));
    }
    this.aPos.needsUpdate = true; this.aPar.needsUpdate = true;
    this.material.uniforms.fogColor.value.copy(fog.color); this.material.uniforms.fogDensity.value = fog.density;
  }
}
