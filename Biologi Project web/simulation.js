/* ═══════════════════════════════════════════════════════════════
   BioFlow — simulation.js
   Engine animasi Canvas:
     · Spawn, gerak, recycle partikel darah (RBC)
     · Gambar pembuluh darah + plak penyumbatan
     · Gambar grafik tekanan real-time
     · Loop requestAnimationFrame
   ═══════════════════════════════════════════════════════════════ */

'use strict';

/* ════════════════════════════════════════════════════════════════
   SECTION 1 — STATE INTERNAL SIMULASI
   ════════════════════════════════════════════════════════════════ */

const Sim = {
  /* Canvas utama — pembuluh + partikel */
  canvas:   null,
  ctx:      null,

  /* Canvas grafik tekanan */
  chartCanvas: null,
  chartCtx:    null,

  /* State fisik saat ini (di-update oleh ui.js) */
  state: {
    bpm:       72,
    pressure:  120,
    diastolic: 80,
    diameter:  85,
  },

  /* Array partikel aktif */
  particles: [],

  /* Loop control */
  rafId:     null,
  running:   false,
  lastTime:  0,

  /* Grafik tekanan */
  chart: {
    history:     [],   // nilai mmHg, panjang = CHART_HISTORY_S × sampleRate
    sampleRate:  30,   // titik per detik
    lastSampleT: 0,    // timestamp terakhir sample diambil (ms)
    maxPoints:   900,  // CHART_HISTORY_S(30) × sampleRate(30)
  },

  /* Geometri pembuluh (dihitung ulang saat resize) */
  vessel: {
    x:         0,
    y:         0,
    w:         0,
    h:         0,
    wallThick: 14,
    centerY:   0,
  },
};


/* ════════════════════════════════════════════════════════════════
   SECTION 2 — INISIALISASI
   ════════════════════════════════════════════════════════════════ */

/**
 * Init simulasi. Dipanggil sekali oleh ui.js saat DOM ready.
 * @param {HTMLCanvasElement} simCanvas
 * @param {HTMLCanvasElement} chartCanvas
 */
function simInit(simCanvas, chartCanvas) {
  Sim.canvas      = simCanvas;
  Sim.ctx         = simCanvas.getContext('2d');
  Sim.chartCanvas = chartCanvas;
  Sim.chartCtx    = chartCanvas.getContext('2d');

  _resizeCanvas();
  _spawnAllParticles();
  _prefillChart();

  window.addEventListener('resize', _resizeCanvas);

  Sim.running = true;
  Sim.rafId   = requestAnimationFrame(_loop);
}

/**
 * Sesuaikan DPR (retina) dan hitung ulang geometri pembuluh.
 */
function _resizeCanvas() {
  const dpr = window.devicePixelRatio || 1;
  const canvases = [Sim.canvas, Sim.chartCanvas];

  canvases.forEach((c) => {
    if (!c) return;
    const rect = c.getBoundingClientRect();
    if (rect.width === 0) return;
    c.width  = rect.width  * dpr;
    c.height = rect.height * dpr;
    const ctx = c.getContext('2d');
    ctx.scale(dpr, dpr);
  });

  _calcVesselGeometry();
}

/**
 * Hitung dimensi dan posisi pembuluh dari ukuran canvas.
 */
function _calcVesselGeometry() {
  if (!Sim.canvas) return;
  const rect   = Sim.canvas.getBoundingClientRect();
  const W      = rect.width  || 600;
  const H      = rect.height || 240;

  Sim.vessel.x         = 0;
  Sim.vessel.y         = 0;
  Sim.vessel.w         = W;
  Sim.vessel.h         = H;
  Sim.vessel.wallThick = Math.max(10, H * 0.09);
  Sim.vessel.centerY   = H / 2;
}


/* ════════════════════════════════════════════════════════════════
   SECTION 3 — SISTEM PARTIKEL (RBC)
   ════════════════════════════════════════════════════════════════ */

/**
 * Buat satu partikel RBC baru.
 * @param {boolean} randomX  true = posisi X acak (untuk spawn awal)
 * @returns {object}  partikel
 */
function _createParticle(randomX = false) {
  const ANIM = window.BF_CONST.ANIMATION;
  const C    = window.BF_CONST;
  const phys = window.BF_PHYSICS;

  const speed  = phys.particleSpeed(Sim.state);
  const maxLum = _maxLumen();
  const halfL  = maxLum / 2;

  /* Posisi Y: distribusi parabola Poiseuille (lebih banyak di tengah) */
  const lane  = _poiseuilleLane(maxLum);
  const yOff  = lane;                        // offset dari center

  /* Radius visual: lebih kecil di tepi (shear) */
  const edgeT = Math.abs(yOff) / halfL;     // 0 = tengah, 1 = tepi
  const rBase = ANIM.PARTICLE_RADIUS_MIN +
                (ANIM.PARTICLE_RADIUS_MAX - ANIM.PARTICLE_RADIUS_MIN) *
                (1 - edgeT * 0.6);

  return {
    x:       randomX
               ? Math.random() * (Sim.vessel.w + 40) - 20
               : -rBase * 2,
    yOff,                                   // offset dari centerY
    vy:      (Math.random() - 0.5) * 0.08, // drift vertikal sangat kecil
    r:       rBase + Math.random() * 1.2,
    speed:   speed * (0.8 + Math.random() * 0.4),
    opacity: 0.75 + Math.random() * 0.25,
    phase:   Math.random() * Math.PI * 2,  // untuk efek deformasi RBC
    deform:  0.82 + Math.random() * 0.15, // rasio sumbu bikonkaf
  };
}

/**
 * Pilih posisi Y lane sesuai distribusi kecepatan Poiseuille (profil parabola).
 * Partikel di tengah lebih cepat, di tepi lebih lambat.
 *
 * @param {number} maxLumen  lebar lumen px
 * @returns {number}         offset dari center (px), negatif = atas
 */
function _poiseuilleLane(maxLumen) {
  // Inverse CDF sederhana untuk distribusi parabola:
  // Sample u ∈ [0,1] → y ∈ [-1, 1] dengan kepadatan ∝ (1−y²)
  let u, y;
  do {
    u = Math.random() * 2 - 1;
    y = Math.random() * 2 - 1;
  } while (Math.random() > (1 - y * y));
  return y * (maxLumen / 2) * 0.88;
}

/**
 * Spawn semua partikel awal dengan posisi X acak.
 */
function _spawnAllParticles() {
  const count = window.BF_CONST.ANIMATION.PARTICLE_COUNT;
  Sim.particles = [];
  for (let i = 0; i < count; i++) {
    Sim.particles.push(_createParticle(true));
  }
}

/**
 * Lebar lumen saat ini (px) berdasarkan diameter slider.
 */
function _maxLumen() {
  const H      = Sim.vessel.h || 240;
  const maxLum = H - Sim.vessel.wallThick * 2.4;
  return window.BF_PHYSICS.lumenWidth(Sim.state.diameter, maxLum);
}

/**
 * Update posisi semua partikel satu frame.
 * Recycle partikel yang keluar kanan → spawn ulang di kiri.
 * @param {number} dt  delta time (ms)
 */
function _updateParticles(dt) {
  const phys   = window.BF_PHYSICS;
  const W      = Sim.vessel.w;
  const maxLum = _maxLumen();
  const halfL  = maxLum / 2;

  // Kecepatan global saat ini (bisa berubah saat slider digeser)
  const globalSpeed = phys.particleSpeed(Sim.state);
  const maxSpeed    = globalSpeed * 7;

  for (let i = 0; i < Sim.particles.length; i++) {
    const p = Sim.particles[i];

    /* Modulasi kecepatan berdasarkan posisi Y (Poiseuille) */
    const edgeRatio = Math.abs(p.yOff) / (halfL || 1);
    const vFactor   = Math.max(0.1, 1 - edgeRatio * edgeRatio);
    p.speed += (globalSpeed * vFactor - p.speed) * 0.04;  // smooth lerp

    /* Gerak horizontal */
    p.x += p.speed;

    /* Drift vertikal kecil + oscillation */
    p.phase += 0.025;
    p.yOff  += Math.sin(p.phase) * 0.06 + p.vy;

    /* Klem agar tidak keluar lumen */
    const maxOff = halfL - p.r;
    if (Math.abs(p.yOff) > maxOff) {
      p.yOff = Math.sign(p.yOff) * maxOff;
      p.vy   = -p.vy * 0.5;
    }

    /* Recycle saat keluar kanan */
    if (p.x - p.r > W + 10) {
      const fresh = _createParticle(false);
      fresh.speed = globalSpeed * (0.8 + Math.random() * 0.4);
      Sim.particles[i] = fresh;
    }
  }
}


/* ════════════════════════════════════════════════════════════════
   SECTION 4 — RENDER PEMBULUH DARAH
   ════════════════════════════════════════════════════════════════ */

/**
 * Gambar pembuluh darah lengkap (dinding + lumen + plak).
 */
function _drawVessel() {
  const ctx    = Sim.ctx;
  const v      = Sim.vessel;
  const W      = v.w;
  const H      = v.h;
  const cY     = v.centerY;
  const wt     = v.wallThick;
  const ANIM   = window.BF_CONST.ANIMATION;
  const phys   = window.BF_PHYSICS;

  const maxLum  = _maxLumen();
  const halfL   = maxLum / 2;
  const plaque  = phys.plaqueConfig(Sim.state.diameter);

  /* ── Background canvas ── */
  ctx.clearRect(0, 0, W, H);

  /* ── Dinding luar pembuluh (gradien radial) ── */
  const gradOuter = ctx.createLinearGradient(0, cY - halfL - wt, 0, cY + halfL + wt);
  gradOuter.addColorStop(0,    '#4a0a0a');
  gradOuter.addColorStop(0.18, '#8b1a1a');
  gradOuter.addColorStop(0.5,  '#5c0e0e');
  gradOuter.addColorStop(0.82, '#8b1a1a');
  gradOuter.addColorStop(1,    '#4a0a0a');

  ctx.fillStyle = gradOuter;
  ctx.beginPath();
  ctx.roundRect
    ? ctx.roundRect(0, cY - halfL - wt, W, (halfL + wt) * 2, wt * 0.6)
    : ctx.rect(0, cY - halfL - wt, W, (halfL + wt) * 2);
  ctx.fill();

  /* ── Lumen (interior) ── */
  const gradLumen = ctx.createLinearGradient(0, cY - halfL, 0, cY + halfL);
  gradLumen.addColorStop(0,    '#1a0505');
  gradLumen.addColorStop(0.15, '#2d0808');
  gradLumen.addColorStop(0.5,  '#3d0c0c');
  gradLumen.addColorStop(0.85, '#2d0808');
  gradLumen.addColorStop(1,    '#1a0505');

  ctx.fillStyle = gradLumen;
  ctx.fillRect(0, cY - halfL, W, halfL * 2);

  /* ── Garis median (aliran) ── */
  ctx.save();
  ctx.strokeStyle = 'rgba(200, 50, 50, 0.12)';
  ctx.lineWidth   = 1;
  ctx.setLineDash([6, 10]);
  ctx.beginPath();
  ctx.moveTo(0, cY);
  ctx.lineTo(W, cY);
  ctx.stroke();
  ctx.setLineDash([]);
  ctx.restore();

  /* ── Highlight specular dinding atas ── */
  const gradSpec = ctx.createLinearGradient(0, cY - halfL - wt, 0, cY - halfL - wt * 0.3);
  gradSpec.addColorStop(0,   'rgba(255,180,180,0.15)');
  gradSpec.addColorStop(1,   'rgba(255,180,180,0)');
  ctx.fillStyle = gradSpec;
  ctx.fillRect(0, cY - halfL - wt, W, wt * 0.7);

  /* ── Plak aterosklerotik ── */
  if (plaque) {
    _drawPlaque(ctx, v, halfL, plaque);
  }

  /* ── Garis tepi dinding atas & bawah ── */
  ctx.strokeStyle = 'rgba(180, 40, 40, 0.6)';
  ctx.lineWidth   = 1.5;

  ctx.beginPath();
  ctx.moveTo(0, cY - halfL);
  ctx.lineTo(W, cY - halfL);
  ctx.stroke();

  ctx.beginPath();
  ctx.moveTo(0, cY + halfL);
  ctx.lineTo(W, cY + halfL);
  ctx.stroke();
}

/**
 * Gambar plak aterosklerotik di dinding pembuluh.
 * Plak muncul di sisi atas dan bawah dengan ukuran proporsional blockRatio.
 *
 * @param {CanvasRenderingContext2D} ctx
 * @param {object} v       geometri vessel
 * @param {number} halfL   setengah lebar lumen (px)
 * @param {object} plaque  { severity, blockRatio }
 */
function _drawPlaque(ctx, v, halfL, plaque) {
  const W   = v.w;
  const cY  = v.centerY;
  const wt  = v.wallThick;

  /* Tebal plak berdasarkan blockRatio */
  const plaqH = plaque.blockRatio * (wt * 1.4);

  /* Warna plak berdasarkan severity */
  const colors = {
    mild:     { fill: '#8B7355', stroke: '#A0896A', glow: 'rgba(160,137,106,0.4)' },
    moderate: { fill: '#C0A050', stroke: '#D4B468', glow: 'rgba(192,160,80,0.4)' },
    severe:   { fill: '#D4882A', stroke: '#E89830', glow: 'rgba(212,136,42,0.5)' },
  };
  const col = colors[plaque.severity] || colors.moderate;

  /* Plak atas — tidak rata (lekukan organis) */
  ctx.save();
  ctx.shadowColor = col.glow;
  ctx.shadowBlur  = 8;

  /* Buat bentuk tak beraturan dengan beberapa kurva bezier */
  const segments = 6;
  const segW     = W / segments;

  /* ── Plak atas ── */
  ctx.beginPath();
  ctx.moveTo(0, cY - halfL);
  for (let i = 0; i <= segments; i++) {
    const sx   = i * segW;
    const bump = (Math.sin(i * 2.1 + 1.3) * 0.2 + 0.9) * plaqH;
    ctx.lineTo(sx, cY - halfL + bump);
  }
  ctx.lineTo(W, cY - halfL);
  ctx.closePath();

  const gradP1 = ctx.createLinearGradient(0, cY - halfL, 0, cY - halfL + plaqH);
  gradP1.addColorStop(0,   col.stroke);
  gradP1.addColorStop(0.5, col.fill);
  gradP1.addColorStop(1,   '#6b4e2a');
  ctx.fillStyle = gradP1;
  ctx.fill();

  ctx.strokeStyle = col.stroke;
  ctx.lineWidth   = 0.8;
  ctx.stroke();

  /* ── Plak bawah ── */
  ctx.beginPath();
  ctx.moveTo(0, cY + halfL);
  for (let i = 0; i <= segments; i++) {
    const sx   = i * segW;
    const bump = (Math.sin(i * 1.7 + 0.8) * 0.2 + 0.9) * plaqH;
    ctx.lineTo(sx, cY + halfL - bump);
  }
  ctx.lineTo(W, cY + halfL);
  ctx.closePath();

  const gradP2 = ctx.createLinearGradient(0, cY + halfL, 0, cY + halfL - plaqH);
  gradP2.addColorStop(0,   col.stroke);
  gradP2.addColorStop(0.5, col.fill);
  gradP2.addColorStop(1,   '#6b4e2a');
  ctx.fillStyle = gradP2;
  ctx.fill();

  ctx.strokeStyle = col.stroke;
  ctx.lineWidth   = 0.8;
  ctx.stroke();

  ctx.restore();

  /* ── Label calcification spots (severity severe) ── */
  if (plaque.severity === 'severe') {
    _drawCalcificationSpots(ctx, v, halfL, plaqH);
  }
}

/**
 * Gambar bintik kalsifikasi pada plak berat.
 */
function _drawCalcificationSpots(ctx, v, halfL, plaqH) {
  const cY  = v.centerY;
  const W   = v.w;
  const spots = [
    { x: W * 0.15, dy: -halfL + plaqH * 0.5 },
    { x: W * 0.38, dy: -halfL + plaqH * 0.3 },
    { x: W * 0.61, dy: -halfL + plaqH * 0.6 },
    { x: W * 0.82, dy: -halfL + plaqH * 0.4 },
    { x: W * 0.25, dy:  halfL - plaqH * 0.5 },
    { x: W * 0.55, dy:  halfL - plaqH * 0.4 },
    { x: W * 0.75, dy:  halfL - plaqH * 0.55 },
  ];

  spots.forEach((s) => {
    ctx.beginPath();
    ctx.arc(s.x, cY + s.dy, 3 + Math.random(), 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(240, 230, 200, 0.55)';
    ctx.fill();
  });
}


/* ════════════════════════════════════════════════════════════════
   SECTION 5 — RENDER PARTIKEL (RBC)
   ════════════════════════════════════════════════════════════════ */

/**
 * Gambar semua partikel darah.
 * RBC divisualisasikan sebagai elips bikonkaf dengan highlight.
 */
function _drawParticles() {
  const ctx    = Sim.ctx;
  const cY     = Sim.vessel.centerY;
  const phys   = window.BF_PHYSICS;
  const ANIM   = window.BF_CONST.ANIMATION;

  const maxSpeed = phys.particleSpeed(Sim.state) * 7;
  const halfL    = _maxLumen() / 2;

  /* Clip ke lumen agar partikel tidak tembus dinding */
  ctx.save();
  ctx.beginPath();
  ctx.rect(0, cY - halfL + 1, Sim.vessel.w, halfL * 2 - 2);
  ctx.clip();

  for (const p of Sim.particles) {
    const py     = cY + p.yOff;
    const color  = phys.particleColor(p.speed, maxSpeed);

    /* Sumbu elips — bikonkaf RBC */
    const rx     = p.r * 1.35;      // sumbu horizontal (lebih lebar)
    const ry     = p.r * p.deform;  // sumbu vertikal (lebih pendek)

    ctx.save();
    ctx.translate(p.x, py);

    /* Shadow/glow lemah */
    ctx.shadowColor = 'rgba(180, 30, 30, 0.35)';
    ctx.shadowBlur  = 4;

    /* Badan RBC */
    ctx.beginPath();
    ctx.ellipse(0, 0, rx, ry, 0, 0, Math.PI * 2);
    const grad = ctx.createRadialGradient(
      -rx * 0.2, -ry * 0.2, 0,
       rx * 0.1,  ry * 0.1, rx,
    );
    grad.addColorStop(0,   _lighten(color, 20));
    grad.addColorStop(0.5, color);
    grad.addColorStop(1,   _darken(color, 15));
    ctx.fillStyle   = grad;
    ctx.globalAlpha = p.opacity;
    ctx.fill();

    /* Kontur */
    ctx.strokeStyle = ANIM.RBC_COLOR_STROKE;
    ctx.lineWidth   = 0.5;
    ctx.stroke();

    /* Cekungan tengah (bikonkaf) — lingkaran kecil gelap */
    ctx.beginPath();
    ctx.ellipse(0, 0, rx * 0.38, ry * 0.38, 0, 0, Math.PI * 2);
    ctx.fillStyle   = _darken(color, 25);
    ctx.globalAlpha = p.opacity * 0.55;
    ctx.fill();

    /* Highlight specular kiri atas */
    ctx.beginPath();
    ctx.ellipse(-rx * 0.28, -ry * 0.3, rx * 0.22, ry * 0.15, -Math.PI / 6, 0, Math.PI * 2);
    ctx.fillStyle   = 'rgba(255, 180, 180, 0.28)';
    ctx.globalAlpha = p.opacity * 0.7;
    ctx.fill();

    ctx.globalAlpha = 1;
    ctx.restore();
  }

  ctx.restore(); // remove clip
}

/**
 * Cerahkan warna HSL string.
 * @param {string} hsl  `hsl(h, s%, l%)`
 * @param {number} amt  jumlah lightness ditambah
 * @returns {string}
 */
function _lighten(hsl, amt) {
  return hsl.replace(/(\d+)%\)/, (_, l) => `${Math.min(100, +l + amt)}%)`);
}

/**
 * Gelapkan warna HSL string.
 * @param {string} hsl
 * @param {number} amt
 * @returns {string}
 */
function _darken(hsl, amt) {
  return hsl.replace(/(\d+)%\)/, (_, l) => `${Math.max(0, +l - amt)}%)`);
}


/* ════════════════════════════════════════════════════════════════
   SECTION 6 — GRAFIK TEKANAN DARAH
   ════════════════════════════════════════════════════════════════ */

/**
 * Isi riwayat grafik dengan data awal (sebelum animasi mulai).
 */
function _prefillChart() {
  const C    = window.BF_CONST;
  const phys = window.BF_PHYSICS;
  const dur  = C.ANIMATION.CHART_HISTORY_S;

  Sim.chart.history = phys.generatePressureHistory(
    Sim.state.bpm,
    Sim.state.pressure,
    dur,
    Sim.chart.sampleRate,
    Sim.state.diastolic,
  );
}

/**
 * Sample satu titik tekanan baru dan tambahkan ke riwayat.
 * Dipanggil setiap ~33ms (sampleRate 30 Hz).
 * @param {number} nowMs  timestamp sekarang (ms)
 */
function _samplePressure(nowMs) {
  const phys = window.BF_PHYSICS;
  const t    = nowMs / 1000;

  const val  = phys.pressureWaveform(t, Sim.state.bpm, Sim.state.pressure, Sim.state.diastolic);

  Sim.chart.history.push(val);
  if (Sim.chart.history.length > Sim.chart.maxPoints) {
    Sim.chart.history.shift();
  }
  Sim.chart.lastSampleT = nowMs;

  /* Update tooltip tekanan saat ini */
  const el = document.getElementById('tooltipPressure');
  if (el) {
    const dia = Sim.state.diastolic ?? Math.round(Sim.state.pressure * 0.67);
    el.textContent = Math.round(val) + '/' + Math.round(dia);
  }
}

/**
 * Re-draw grafik tekanan penuh.
 */
function _drawChart() {
  const ctx  = Sim.chartCtx;
  const can  = Sim.chartCanvas;
  if (!ctx || !can) return;

  const rect = can.getBoundingClientRect();
  const W    = rect.width  || 600;
  const H    = rect.height || 160;
  const data = Sim.chart.history;
  const n    = data.length;

  if (n < 2) return;

  /* ── Clear ── */
  ctx.clearRect(0, 0, W, H);

  /* ── Grid horizontal ── */
  const gridLines = [80, 100, 120, 140, 160, 180];
  const pMin = 60, pMax = 200;

  ctx.save();
  ctx.strokeStyle = 'rgba(255,255,255,0.04)';
  ctx.lineWidth   = 1;

  gridLines.forEach((p) => {
    const y = _mapPressureY(p, pMin, pMax, H);
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(W, y);
    ctx.stroke();
  });

  /* ── Label Y (mmHg) ── */
  ctx.fillStyle  = 'rgba(255,255,255,0.18)';
  ctx.font       = '9px "IBM Plex Mono", monospace';
  ctx.textAlign  = 'left';
  gridLines.forEach((p) => {
    const y = _mapPressureY(p, pMin, pMax, H);
    ctx.fillText(p, 3, y - 2);
  });

  ctx.restore();

  /* ── Area fill (gradien di bawah kurva) ── */
  ctx.save();
  const gradArea = ctx.createLinearGradient(0, 0, 0, H);
  gradArea.addColorStop(0,   'rgba(229, 57, 53, 0.22)');
  gradArea.addColorStop(0.6, 'rgba(229, 57, 53, 0.06)');
  gradArea.addColorStop(1,   'rgba(229, 57, 53, 0)');

  ctx.beginPath();
  for (let i = 0; i < n; i++) {
    const x = (i / (n - 1)) * W;
    const y = _mapPressureY(data[i], pMin, pMax, H);
    i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
  }
  ctx.lineTo(W, H);
  ctx.lineTo(0, H);
  ctx.closePath();
  ctx.fillStyle = gradArea;
  ctx.fill();
  ctx.restore();

  /* ── Kurva utama ── */
  ctx.save();
  ctx.strokeStyle = '#e53935';
  ctx.lineWidth   = 1.8;
  ctx.lineJoin    = 'round';
  ctx.lineCap     = 'round';
  ctx.shadowColor = 'rgba(229, 57, 53, 0.45)';
  ctx.shadowBlur  = 6;

  ctx.beginPath();
  for (let i = 0; i < n; i++) {
    const x = (i / (n - 1)) * W;
    const y = _mapPressureY(data[i], pMin, pMax, H);
    i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
  }
  ctx.stroke();
  ctx.restore();

  /* ── Titik terakhir (live indicator) ── */
  if (n > 0) {
    const lx   = W;
    const ly   = _mapPressureY(data[n - 1], pMin, pMax, H);
    const now  = performance.now();
    const blink = 0.5 + 0.5 * Math.sin(now / 300);

    ctx.save();
    ctx.shadowColor = '#e53935';
    ctx.shadowBlur  = 10;
    ctx.fillStyle   = `rgba(229, 57, 53, ${blink.toFixed(2)})`;
    ctx.beginPath();
    ctx.arc(lx, ly, 3.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }
}

/**
 * Map nilai tekanan (mmHg) ke koordinat Y canvas.
 * @param {number} p      tekanan (mmHg)
 * @param {number} pMin   nilai minimum skala
 * @param {number} pMax   nilai maksimum skala
 * @param {number} H      tinggi canvas (px)
 * @returns {number}      koordinat Y
 */
function _mapPressureY(p, pMin, pMax, H) {
  const t = (p - pMin) / (pMax - pMin);
  /* Balik: tekanan tinggi = Y kecil (atas) */
  return H - t * H * 0.88 - H * 0.06;
}


/* ════════════════════════════════════════════════════════════════
   SECTION 7 — RENDER LOOP (requestAnimationFrame)
   ════════════════════════════════════════════════════════════════ */

/**
 * Main loop — dipanggil setiap frame oleh browser.
 * @param {number} timestamp  DOMHighResTimeStamp (ms)
 */
function _loop(timestamp) {
  if (!Sim.running) return;

  const dt = timestamp - (Sim.lastTime || timestamp);
  Sim.lastTime = timestamp;

  /* ── Update partikel ── */
  _updateParticles(dt);

  /* ── Render pembuluh + partikel ── */
  _drawVessel();
  _drawParticles();

  /* ── Sample & render grafik (max 30 Hz) ── */
  const sampleInterval = 1000 / Sim.chart.sampleRate;
  if (timestamp - Sim.chart.lastSampleT >= sampleInterval) {
    _samplePressure(timestamp);
  }
  _drawChart();

  /* ── Jadwalkan frame berikutnya ── */
  Sim.rafId = requestAnimationFrame(_loop);
}


/* ════════════════════════════════════════════════════════════════
   SECTION 8 — API PUBLIK
   ════════════════════════════════════════════════════════════════ */

/**
 * Update state fisik (dipanggil ui.js saat slider berubah).
 * @param {{ bpm?: number, pressure?: number, diameter?: number }} patch
 */
function simUpdateState(patch) {
  Object.assign(Sim.state, patch);
}

/**
 * Terapkan preset mode (Normal / Hipertensi / Penyumbatan).
 * Juga re-fill riwayat grafik agar sesuai preset baru.
 * @param {string} modeName  kunci di BF_CONST.PRESETS
 */
function simApplyPreset(modeName) {
  const preset = window.BF_CONST.PRESETS[modeName];
  if (!preset) return;

  simUpdateState({
    bpm:      preset.bpm,
    pressure: preset.pressure,
    diameter: preset.diameter,
  });

  /* Respawn partikel agar lane Poiseuille direset */
  _spawnAllParticles();

  /* Flush & regenerate riwayat grafik */
  _prefillChart();
}

/**
 * Hentikan loop animasi.
 */
function simStop() {
  Sim.running = false;
  if (Sim.rafId) {
    cancelAnimationFrame(Sim.rafId);
    Sim.rafId = null;
  }
}

/**
 * Mulai ulang loop animasi (setelah simStop).
 */
function simResume() {
  if (Sim.running) return;
  Sim.running = true;
  Sim.lastTime = 0;
  Sim.rafId = requestAnimationFrame(_loop);
}

/**
 * Kembalikan salinan state saat ini (read-only).
 * @returns {{ bpm: number, pressure: number, diameter: number }}
 */
function simGetState() {
  return { ...Sim.state };
}


/* ════════════════════════════════════════════════════════════════
   SECTION 9 — EKSPOR GLOBAL
   ════════════════════════════════════════════════════════════════ */

window.BF_SIM = Object.freeze({
  init:         simInit,
  updateState:  simUpdateState,
  applyPreset:  simApplyPreset,
  stop:         simStop,
  resume:       simResume,
  getState:     simGetState,
});