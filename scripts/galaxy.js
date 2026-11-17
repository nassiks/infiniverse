/**
 * INFINIVERSE procedural galaxy.
 * Deterministic spiral stars and precomputed constellation links.
 * Canvas 2D is separate from the existing WebGL planet scene.
 */
(() => {
  'use strict';
  const canvas = document.getElementById('galaxy-canvas');
  const app = document.getElementById('app');
  if (!canvas || !app) return;
  const ctx = canvas.getContext('2d', { alpha: true, desynchronized: true });
  if (!ctx) return;

  const TAU = Math.PI * 2, ARM_COUNT = 5, STAR_COUNT = 3600;
  const stars = [], links = [];
  let width = 1, height = 1, dpr = 1, frame = 0, lastTime = 0;
  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');

  function randomGenerator(seed) {
    return () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 4294967296; };
  }
  const random = randomGenerator(20261118);

  for (let i = 0; i < STAR_COUNT; i++) {
    const arm = i % ARM_COUNT, radius = Math.pow(random(), 0.72);
    const angle = arm * TAU / ARM_COUNT + radius * 5.25 + (random() - 0.5) * (0.12 + radius * 0.28);
    const spread = 0.012 + radius * 0.055, r = Math.max(0, radius + (random() - 0.5) * spread);
    stars.push({
      x: Math.cos(angle) * r * 1.24 + (random() - 0.5) * spread * 0.38,
      y: Math.sin(angle) * r * 0.78 + (random() - 0.5) * spread * 0.38,
      arm, size: 0.65 + Math.pow(random(), 3.2) * 2.55,
      phase: random() * TAU, speed: 0.35 + random() * 1.8,
      base: 0.28 + random() * 0.56, hue: random() < 0.13 ? 0 : 1
    });
  }

  // Build sparse local links once, not in the animation loop.
  const cellSize = 0.075, cells = new Map();
  const cellKey = (x, y) => Math.floor(x / cellSize) + ':' + Math.floor(y / cellSize);
  stars.forEach((star, index) => {
    const key = cellKey(star.x, star.y);
    if (!cells.has(key)) cells.set(key, []);
    cells.get(key).push(index);
  });
  stars.forEach((star, index) => {
    const cx = Math.floor(star.x / cellSize), cy = Math.floor(star.y / cellSize), nearby = [];
    for (let ox = -1; ox <= 1; ox++) for (let oy = -1; oy <= 1; oy++) {
      for (const j of cells.get((cx + ox) + ':' + (cy + oy)) || []) {
        if (j <= index || stars[j].arm !== star.arm) continue;
        const dx = stars[j].x - star.x, dy = stars[j].y - star.y, distance = dx * dx + dy * dy;
        if (distance < 0.0048) nearby.push({ j, distance });
      }
    }
    nearby.sort((a, b) => a.distance - b.distance);
    nearby.slice(0, 2).forEach(item => links.push([index, item.j]));
  });

  function resize() {
    const rect = canvas.getBoundingClientRect();
    width = Math.max(1, rect.width); height = Math.max(1, rect.height);
    dpr = Math.min(window.devicePixelRatio || 1, window.innerWidth < 700 ? 1.35 : 1.6);
    canvas.width = Math.round(width * dpr); canvas.height = Math.round(height * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    render(0, true);
  }

  function render(timestamp, forceStatic = false) {
    const reduced = reducedMotion.matches || app.classList.contains('animations-off');
    const animate = !forceStatic && !reduced && document.visibilityState === 'visible'
      && !app.classList.contains('inside') && !app.classList.contains('entering');
    const elapsed = animate ? Math.min(48, timestamp - (lastTime || timestamp)) : 0;
    lastTime = timestamp;
    const time = animate ? timestamp * 0.001 : 0, angle = animate ? time * 0.018 : 0;
    const c = Math.cos(angle), s = Math.sin(angle), scale = Math.min(width, height) * 0.47;
    const cx = width * 0.5, cy = height * 0.5, positions = new Array(stars.length);
    const drift = animate ? Math.min(1, elapsed / 16.67) : 0;

    ctx.clearRect(0, 0, width, height);
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    for (let i = 0; i < stars.length; i++) {
      const star = stars[i], pulse = animate ? 0.72 + 0.28 * Math.sin(time * star.speed + star.phase) : 0.84;
      const nudge = animate ? Math.sin(time * 0.22 + star.phase) * 0.0025 * drift : 0;
      const x0 = star.x + nudge, y0 = star.y - nudge * 0.65;
      const x = x0 * c - y0 * s, y = x0 * s + y0 * c;
      const px = cx + x * scale, py = cy + y * scale, alpha = star.base * pulse;
      positions[i] = [px, py, alpha];
      if (star.size > 1.45) {
        ctx.beginPath();
        ctx.fillStyle = star.hue ? 'rgba(211,157,255,' + alpha * 0.16 + ')' : 'rgba(255,226,255,' + alpha * 0.20 + ')';
        ctx.arc(px, py, star.size * 4.2, 0, TAU); ctx.fill();
      }
      ctx.beginPath();
      ctx.fillStyle = star.hue ? 'rgba(195,126,255,' + alpha + ')' : 'rgba(255,237,255,' + alpha * 0.94 + ')';
      ctx.arc(px, py, star.size * (0.78 + pulse * 0.22), 0, TAU); ctx.fill();
    }

    ctx.lineWidth = 0.48; ctx.strokeStyle = 'rgba(188,119,255,0.12)'; ctx.beginPath();
    for (const [a, b] of links) {
      const p = positions[a], q = positions[b];
      if (p[2] < 0.28 || q[2] < 0.28) continue;
      ctx.moveTo(p[0], p[1]); ctx.lineTo(q[0], q[1]);
    }
    ctx.stroke();

    const coreRadius = scale * 0.36;
    const outerGlowRadius = scale * 0.58;
    const outerGlow = ctx.createRadialGradient(cx, cy, coreRadius * 0.12, cx, cy, outerGlowRadius);
    outerGlow.addColorStop(0, 'rgba(223,157,255,0.22)');
    outerGlow.addColorStop(0.34, 'rgba(174,91,255,0.13)');
    outerGlow.addColorStop(0.72, 'rgba(127,55,214,0.055)');
    outerGlow.addColorStop(1, 'rgba(115,49,194,0)');
    ctx.fillStyle = outerGlow;
    ctx.fillRect(cx - outerGlowRadius, cy - outerGlowRadius, outerGlowRadius * 2, outerGlowRadius * 2);
    const core = ctx.createRadialGradient(cx, cy, 0, cx, cy, coreRadius);
    core.addColorStop(0, 'rgba(255,249,255,0.96)');
    core.addColorStop(0.16, 'rgba(244,199,255,0.58)');
    core.addColorStop(0.48, 'rgba(177,91,255,0.22)');
    core.addColorStop(1, 'rgba(115,49,194,0)');
    ctx.fillStyle = core; ctx.fillRect(cx - coreRadius, cy - coreRadius, coreRadius * 2, coreRadius * 2);

    for (let i = 0; i < 18; i++) {
      const index = i * 173 + 9, star = stars[index], p = positions[index];
      const flare = animate ? Math.max(0, Math.sin(time * star.speed * 0.7 + star.phase)) : 0.35;
      if (flare < 0.72) continue;
      const radius = 2.1 + flare * 2.4;
      ctx.strokeStyle = 'rgba(239,202,255,' + flare * 0.45 + ')'; ctx.lineWidth = 0.7; ctx.beginPath();
      ctx.moveTo(p[0] - radius * 2.5, p[1]); ctx.lineTo(p[0] + radius * 2.5, p[1]);
      ctx.moveTo(p[0], p[1] - radius * 2.5); ctx.lineTo(p[0], p[1] + radius * 2.5); ctx.stroke();
    }
    ctx.restore();
    if (animate) frame = requestAnimationFrame(render); else frame = 0;
  }

  function schedule() {
    if (frame) cancelAnimationFrame(frame);
    frame = requestAnimationFrame(render);
  }
  const observer = new ResizeObserver(resize);
  observer.observe(canvas);
  window.addEventListener('resize', resize, { passive: true });
  document.addEventListener('visibilitychange', schedule);
  document.getElementById('animation-toggle')?.addEventListener('change', schedule);
  reducedMotion.addEventListener?.('change', schedule);
  new MutationObserver(schedule).observe(app, { attributes: true, attributeFilter: ['class'] });
  resize();
  schedule();
})();
