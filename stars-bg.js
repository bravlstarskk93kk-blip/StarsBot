function initStarfield(canvasId, opts = {}) {
  const canvas = document.getElementById(canvasId);
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  const density = opts.density ?? 70;
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  let w, h, dpr;
  function resize() {
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    w = canvas.clientWidth;
    h = canvas.clientHeight;
    canvas.width = w * dpr;
    canvas.height = h * dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }
  window.addEventListener('resize', resize);
  resize();

  function drawSpark(x, y, r, alpha) {
    ctx.save();
    ctx.translate(x, y);
    ctx.globalAlpha = alpha;
    const grad = ctx.createRadialGradient(0, 0, 0, 0, 0, r * 3.2);
    grad.addColorStop(0, 'rgba(255,217,125,0.9)');
    grad.addColorStop(1, 'rgba(255,217,125,0)');
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.arc(0, 0, r * 3.2, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = '#ffe9b3';
    ctx.beginPath();
    ctx.moveTo(0, -r);
    ctx.bezierCurveTo(r * 0.25, -r * 0.25, r, -r * 0.15, r, 0);
    ctx.bezierCurveTo(r * 0.25, r * 0.15, r * 0.15, r * 0.25, 0, r);
    ctx.bezierCurveTo(-r * 0.15, r * 0.25, -r * 0.25, r * 0.15, -r, 0);
    ctx.bezierCurveTo(-r * 0.25, -r * 0.15, -r * 0.15, -r * 0.25, 0, -r);
    ctx.fill();
    ctx.restore();
  }

  const stars = Array.from({ length: density }, () => spawnStar());
  function spawnStar(fromTop = false) {
    return {
      x: Math.random() * w,
      y: fromTop ? -10 : Math.random() * h,
      r: 1.4 + Math.random() * 2.6,
      speed: 12 + Math.random() * 22,
      drift: (Math.random() - 0.5) * 8,
      alpha: 0.35 + Math.random() * 0.55,
      twinkle: Math.random() * Math.PI * 2,
    };
  }

  let last = performance.now();
  function frame(now) {
    const dt = Math.min((now - last) / 1000, 0.05);
    last = now;
    ctx.clearRect(0, 0, w, h);
    for (const s of stars) {
      s.twinkle += dt * 2;
      const flicker = 0.75 + 0.25 * Math.sin(s.twinkle);
      drawSpark(s.x, s.y, s.r, s.alpha * flicker);
      if (!reduceMotion) {
        s.y += s.speed * dt;
        s.x += s.drift * dt;
      }
      if (s.y > h + 10) Object.assign(s, spawnStar(true));
    }
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
    }
