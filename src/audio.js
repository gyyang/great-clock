// All sound is synthesised: no samples. A long convolution reverb makes the hall.
export class Sound {
  constructor() { this.ctx = null; this.muted = false; }

  start() {
    if (this.ctx) { this.ctx.resume(); return; }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    const ctx = this.ctx = new AC();
    this.master = ctx.createGain(); this.master.gain.value = 0.9;
    const comp = ctx.createDynamicsCompressor(); comp.threshold.value = -14; comp.ratio.value = 5;
    this.master.connect(comp); comp.connect(ctx.destination);
    this.dry = ctx.createGain(); this.dry.connect(this.master);
    this.rev = ctx.createConvolver(); this.rev.buffer = this.impulse(6);
    const rg = ctx.createGain(); rg.gain.value = 0.6; this.rev.connect(rg); rg.connect(this.master);
    this.noise = this.noiseBuffer(3, false); this.brown = this.noiseBuffer(4, true);

    // the hall itself: a low rumble and a faint hiss of steam
    const loop = (buf, type, freq, q, gain) => {
      const src = ctx.createBufferSource(); src.buffer = buf; src.loop = true;
      const f = ctx.createBiquadFilter(); f.type = type; f.frequency.value = freq; f.Q.value = q;
      const g = ctx.createGain(); g.gain.value = gain;
      src.connect(f); f.connect(g); g.connect(this.master); src.start();
      return { f, g };
    };
    loop(this.brown, 'lowpass', 95, 0.7, 0.5);
    loop(this.noise, 'bandpass', 5200, 0.6, 0.006);
    this.wind = loop(this.noise, 'bandpass', 400, 0.8, 0);
    this.hiss = loop(this.noise, 'highpass', 3000, 0.5, 0);      // the safety valve, when it lifts
  }

  toggleMute() { this.muted = !this.muted; if (this.ctx) this.master.gain.value = this.muted ? 0 : 0.9; return this.muted; }

  noiseBuffer(sec, brown) {
    const ctx = this.ctx, n = sec * ctx.sampleRate, buf = ctx.createBuffer(1, n, ctx.sampleRate), d = buf.getChannelData(0);
    let last = 0;
    for (let i = 0; i < n; i++) {
      const w = Math.random() * 2 - 1;
      if (brown) { last = (last + 0.02 * w) / 1.02; d[i] = last * 3.5; } else d[i] = w;
    }
    return buf;
  }
  impulse(sec) {
    const ctx = this.ctx, n = sec * ctx.sampleRate, buf = ctx.createBuffer(2, n, ctx.sampleRate);
    for (let ch = 0; ch < 2; ch++) {
      const d = buf.getChannelData(ch); let lp = 0;
      for (let i = 0; i < n; i++) {
        const t = i / n, a = 0.06 + 0.5 * t;                  // the tail gets darker as it decays
        lp += ((Math.random() * 2 - 1) - lp) * (1 - a * 0.9);
        d[i] = lp * Math.pow(1 - t, 3.2) * (i < 400 ? i / 400 : 1);
      }
    }
    return buf;
  }

  // one enveloped voice into dry + reverb
  voice(node, t, peak, attack, decay, wet = 0.5) {
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(Math.max(0.0002, peak), t + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t + attack + decay);
    node.connect(g); g.connect(this.dry);
    if (wet > 0) { const s = this.ctx.createGain(); s.gain.value = wet; g.connect(s); s.connect(this.rev); }
  }
  tone(freq, t, peak, attack, decay, wet, glideTo) {
    const o = this.ctx.createOscillator(); o.frequency.setValueAtTime(freq, t);
    if (glideTo) o.frequency.exponentialRampToValueAtTime(glideTo, t + decay * 0.5);
    this.voice(o, t, peak, attack, decay, wet); o.start(t); o.stop(t + attack + decay + 0.1);
  }
  burst(type, freq, q, t, peak, decay, wet) {
    const src = this.ctx.createBufferSource(); src.buffer = this.noise;
    const f = this.ctx.createBiquadFilter(); f.type = type; f.frequency.value = freq; f.Q.value = q;
    src.connect(f); this.voice(f, t, peak, 0.002, decay, wet);
    src.start(t, Math.random() * 2); src.stop(t + decay + 0.1);
  }

  // The pallet lets go: a light metallic click.
  release(vol = 1) {
    if (!this.ctx) return; const t = this.ctx.currentTime;
    this.burst('bandpass', 2600, 2, t, 0.1 * vol, 0.05, 0.6);
    this.tone(620, t, 0.03 * vol, 0.002, 0.25, 0.8);
  }
  // A tooth the size of a person lands on the other pallet.
  tock(alt, vol = 1) {
    if (!this.ctx) return; const t = this.ctx.currentTime, p = alt ? 0.84 : 1;
    this.tone(74 * p, t, 0.95 * vol, 0.004, 1.1, 0.5, 38 * p);            // the floor moves
    this.burst('bandpass', 420, 0.9, t, 0.55 * vol, 0.14, 0.7);            // body
    this.burst('highpass', 2400, 0.5, t, 0.16 * vol, 0.035, 0.5);          // edge
    const f = [112, 187, 263, 391, 587, 911], g = [0.26, 0.2, 0.15, 0.09, 0.05, 0.025], d = [2.6, 2.0, 1.5, 1.0, 0.7, 0.4];
    for (let i = 0; i < f.length; i++) this.tone(f[i] * p * (1 + (Math.random() - 0.5) * 0.004), t, g[i] * vol, 0.003, d[i], 0.9);
  }
  bell(delay = 0, vol = 1) {
    if (!this.ctx) return; const t = this.ctx.currentTime + delay, base = 98;
    const r = [0.5, 1, 1.19, 1.5, 2, 2.51, 3.01, 4.1], g = [0.3, 0.34, 0.24, 0.12, 0.22, 0.08, 0.06, 0.03], d = [11, 9, 7, 5, 4, 2.5, 1.8, 1];
    for (let i = 0; i < r.length; i++) this.tone(base * r[i], t, g[i] * vol, 0.006, d[i], 1.0);
    this.burst('bandpass', 900, 1.2, t, 0.25 * vol, 0.08, 0.8);
  }
  strike(count) { for (let i = 0; i < count; i++) this.bell(1.2 + i * 3.6); }

  step(speed) {
    if (!this.ctx) return; const t = this.ctx.currentTime, v = Math.min(1, speed / 7) * 0.5 + 0.5;
    this.burst('bandpass', 1500 + Math.random() * 700, 3, t, 0.07 * v, 0.05, 0.5);
    this.tone(95 + Math.random() * 20, t, 0.09 * v, 0.003, 0.09, 0.3);
  }
  land(impact) {
    if (!this.ctx) return; const t = this.ctx.currentTime, v = Math.min(1, impact / 22);
    this.tone(70, t, 0.25 + 0.6 * v, 0.004, 0.25 + 0.5 * v, 0.6, 34);
    this.burst('lowpass', 700 + 1500 * v, 0.7, t, 0.2 + 0.5 * v, 0.12 + 0.2 * v, 0.7);
    if (v > 0.5) this.tone(180, t, 0.2 * v, 0.004, 1.4, 1.0);
  }
  clunk(vol = 0.5) {
    if (!this.ctx) return; const t = this.ctx.currentTime;
    this.burst('bandpass', 700, 2, t, 0.12 * vol, 0.07, 0.6); this.tone(140, t, 0.08 * vol, 0.004, 0.2, 0.6);
  }
  // One exhaust stroke up the stack.
  chuff(vol = 1) {
    if (!this.ctx) return; const t = this.ctx.currentTime;
    this.burst('lowpass', 380, 0.8, t, 0.5 * vol, 0.5, 0.7);
    this.burst('bandpass', 1600, 0.7, t, 0.1 * vol, 0.3, 0.6);
    this.tone(52, t, 0.28 * vol, 0.01, 0.4, 0.4, 40);
  }
  // A three-chime steam whistle: the pitch climbs as the bells fill.
  whistle(seconds = 1.6, vol = 1) {
    if (!this.ctx) return; const ctx = this.ctx, t = ctx.currentTime, peak = 0.15 * vol;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(peak, t + 0.12);
    g.gain.setValueAtTime(peak, t + seconds); g.gain.exponentialRampToValueAtTime(0.0001, t + seconds + 0.35);
    g.connect(this.dry);
    const wet = ctx.createGain(); wet.gain.value = 0.9; g.connect(wet); wet.connect(this.rev);
    for (const f of [392, 494, 587]) {
      const o = ctx.createOscillator(); o.type = 'triangle';
      o.frequency.setValueAtTime(f * 0.88, t); o.frequency.exponentialRampToValueAtTime(f, t + 0.3);
      o.connect(g); o.start(t); o.stop(t + seconds + 0.5);
    }
    const breath = ctx.createBufferSource(); breath.buffer = this.noise; breath.loop = true;
    const f = ctx.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = 2600; f.Q.value = 0.7;
    const bg = ctx.createGain(); bg.gain.value = 0.5;
    breath.connect(f); f.connect(bg); bg.connect(g); breath.start(t); breath.stop(t + seconds + 0.5);
  }
  setHiss(level) {
    if (!this.ctx) return;
    this.hiss.g.gain.setTargetAtTime(level * 0.12, this.ctx.currentTime, 0.15);
  }
  // air rushing past when you fall
  setWind(speed, outside) {
    if (!this.ctx) return;
    const a = Math.min(1, Math.max(0, (speed - 7) / 40)), t = this.ctx.currentTime;
    this.wind.g.gain.setTargetAtTime(Math.pow(a, 1.4) * 0.55 + outside * 0.05, t, 0.08);
    this.wind.f.frequency.setTargetAtTime(350 + a * 1100, t, 0.08);
  }
}
