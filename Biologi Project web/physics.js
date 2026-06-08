/* ═══════════════════════════════════════════════════════════════
   BioFlow — physics.js
   Semua kalkulasi fisika dan biologi untuk simulasi:
     · Debit aliran Poiseuille (mL/s) — realistis
     · Kecepatan aliran (cm/s) — realistis
     · Resistansi pembuluh (PRU)
     · Tekanan Bernoulli (Pa)
     · Kecepatan partikel animasi
     · Lebar lumen & konfigurasi plak
     · Waveform tekanan darah
   ═══════════════════════════════════════════════════════════════ */

'use strict';

/* ────────────────────────────────────────────────────────────────
   NILAI REFERENSI FISIOLOGIS (realistis manusia dewasa)
   ────────────────────────────────────────────────────────────────
   Aorta asendens: r ≈ 12 mm, L ≈ 0.1 m
   Cardiac output normal: ~5 L/menit = ~83 mL/s
   Kecepatan aorta normal: ~20–60 cm/s (peak sistol)
   Tekanan normal: 120/80 mmHg
   Resistansi total perifer (TPR): ~1.0–1.2 PRU
   Bernoulli dinamis (½ρv²) aorta: ~1600–3200 Pa
   ──────────────────────────────────────────────────────────────── */

/**
 * Hitung debit aliran darah berdasarkan cardiac output fisiologis.
 *
 * Pendekatan: Q = SV × HR
 * Kemudian dimodulasi oleh diameter pembuluh (Poiseuille ∝ r⁴).
 *
 * @param {{ bpm: number, pressure: number, diameter: number }} state
 * @returns {number}  debit dalam mL/s (realistis 30–150 mL/s)
 */
function calcFlowRate(state) {
  const C = window.BF_CONST.PHYSICS;

  /* Cardiac output dasar: Q_base = SV × HR (mL/s) */
  const svRef = C.STROKE_VOLUME_REF;            // 70 mL/beat
  const hrRef = 72;                             // BPM referensi
  const qBase = (svRef * hrRef) / 60;           // ~84 mL/s

  /* Modulasi BPM */
  const hrFactor = state.bpm / hrRef;

  /* Modulasi tekanan: lebih tinggi → sedikit lebih banyak aliran */
  const pRef = 120;
  const pFactor = Math.sqrt(state.pressure / pRef);   // akar agar tidak terlalu dramatis

  /* Modulasi diameter (Poiseuille: Q ∝ r⁴)
     diameter slider = % dari kondisi normal (100%)
     r = diameter/100, normalisasi terhadap r_normal = 1.0           */
  const dNorm = state.diameter / 100;           // 0.20 – 1.00
  const dFactor = Math.pow(dNorm, 4);           // 0.0016 – 1.0

  /* Q total */
  const q = qBase * hrFactor * pFactor * dFactor;

  /* Clamp ke rentang fisiologis yang masuk akal: 0.1 – 200 mL/s */
  return Math.max(0.1, Math.min(200, q));
}


/**
 * Hitung kecepatan aliran rata-rata di aorta.
 *
 * v = Q / A = Q / (π r²)
 * r = VESSEL_RADIUS_REF × (diameter/100)
 * Q dikonversi dari mL/s → m³/s sebelum dibagi, lalu hasil → cm/s
 *
 * @param {{ bpm: number, pressure: number, diameter: number }} state
 * @returns {number}  kecepatan dalam cm/s (realistis 5–120 cm/s)
 */
function calcVelocity(state) {
  const C = window.BF_CONST.PHYSICS;
  const q_mls = calcFlowRate(state);              // mL/s
  const q_m3s = q_mls / C.M3S_TO_MLS;            // m³/s

  const r = C.VESSEL_RADIUS_REF * (state.diameter / 100);  // m
  const area = Math.PI * r * r;                             // m²

  const v_ms  = q_m3s / area;                    // m/s
  const v_cms = v_ms * 100;                       // cm/s

  /* Clamp: 1–200 cm/s */
  return Math.max(1, Math.min(200, v_cms));
}


/**
 * Hitung resistansi pembuluh dalam PRU (Peripheral Resistance Unit).
 *
 * PRU = ΔP (mmHg) / Q (mL/menit)
 * Nilai normal ~1.0–1.2 PRU
 *
 * @param {{ bpm: number, pressure: number, diameter: number }} state
 * @returns {number}  resistansi dalam PRU (realistis 0.1 – 15 PRU)
 */
function calcResistance(state) {
  const q_mls  = calcFlowRate(state);
  const q_mlmin = q_mls * 60;

  /* Gunakan diastolik dari state jika ada, fallback estimasi 2/3 sistolik */
  const diastolic  = state.diastolic ?? (state.pressure * 0.67);
  const deltaPmmHg = state.pressure - diastolic;

  const pru = deltaPmmHg / q_mlmin;
  return Math.max(0.05, Math.min(20, pru));
}


/**
 * Hitung tekanan dinamis Bernoulli (½ρv²).
 *
 * Ini adalah komponen kinetik tekanan Bernoulli,
 * bukan tekanan total. Satuan Pa.
 * Nilai realistis aorta: ~600–4000 Pa
 *
 * @param {{ bpm: number, pressure: number, diameter: number }} state
 * @returns {number}  tekanan dinamis dalam Pa (dibulatkan)
 */
function calcBernoulli(state) {
  const C = window.BF_CONST.PHYSICS;
  const v_cms = calcVelocity(state);
  const v_ms  = v_cms / 100;                     // m/s

  /* ½ ρ v² */
  const bernoulli = 0.5 * C.BLOOD_DENSITY * v_ms * v_ms;

  /* Clamp: 1 – 10000 Pa */
  return Math.max(1, Math.min(10000, bernoulli));
}


/* ────────────────────────────────────────────────────────────────
   FUNGSI ANIMASI PARTIKEL
   ──────────────────────────────────────────────────────────────── */

/**
 * Kecepatan visual partikel (px/frame) untuk canvas animasi.
 * Proporsional terhadap kecepatan aliran, dinormalisasi ke rentang px.
 *
 * @param {{ bpm: number, pressure: number, diameter: number }} state
 * @returns {number}  kecepatan pixel per frame
 */
function calcParticleSpeed(state) {
  const C    = window.BF_CONST.ANIMATION;
  const vRef = 40;   // cm/s referensi → BASE_SPEED px/frame

  const v    = calcVelocity(state);
  const spd  = C.BASE_SPEED * (v / vRef);

  /* Clamp ke rentang visual yang masuk akal */
  return Math.max(0.3, Math.min(C.BASE_SPEED * 6, spd));
}


/**
 * Lebar lumen aktual (px) berdasarkan diameter slider.
 *
 * @param {number} diameterPct  nilai slider diameter (20–100)
 * @param {number} maxPossible  lebar lumen maksimal (px, dari canvas)
 * @returns {number}  lebar lumen dalam px
 */
function calcLumenWidth(diameterPct, maxPossible) {
  const ratio = diameterPct / 100;
  return maxPossible * ratio;
}


/**
 * Konfigurasi plak aterosklerotik berdasarkan diameter.
 *
 * @param {number} diameterPct  nilai slider diameter (20–100)
 * @returns {null | { severity: string, blockRatio: number }}
 */
function calcPlaqueConfig(diameterPct) {
  if (diameterPct >= 80) return null;   // tidak ada plak yang terlihat

  if (diameterPct < 40) {
    return { severity: 'severe',   blockRatio: 0.85 };
  } else if (diameterPct < 60) {
    return { severity: 'moderate', blockRatio: 0.55 };
  } else {
    return { severity: 'mild',     blockRatio: 0.28 };
  }
}


/**
 * Warna partikel berdasarkan kecepatannya relatif terhadap max speed.
 *
 * @param {number} speed     kecepatan partikel saat ini (px/frame)
 * @param {number} maxSpeed  kecepatan maksimal dalam simulasi
 * @returns {string}  warna HSL string
 */
function calcParticleColor(speed, maxSpeed) {
  const t = Math.min(1, speed / (maxSpeed || 1));
  /* Slow = merah gelap, fast = merah terang-oranye */
  const h = 0;
  const s = 75 + t * 10;
  const l = 35 + t * 20;
  return `hsl(${h}, ${s}%, ${l}%)`;
}


/* ────────────────────────────────────────────────────────────────
   WAVEFORM TEKANAN DARAH
   ──────────────────────────────────────────────────────────────── */

/**
 * Hasilkan satu sampel tekanan pada waktu t.
 * Menghasilkan bentuk gelombang fisiologis (sistol naik cepat, diastol turun lambat).
 *
 * @param {number} t         waktu dalam detik
 * @param {number} bpm       detak jantung
 * @param {number} systolic  tekanan sistolik (mmHg)
 * @returns {number}  tekanan sesaat (mmHg)
 */
function calcPressureWaveform(t, bpm, systolic, diastolic) {
  const period    = 60 / bpm;
  const diasVal   = diastolic ?? (systolic * 0.67);
  const phase     = (t % period) / period;

  let waveform;
  if (phase < 0.15) {
    waveform = Math.pow(phase / 0.15, 1.8);
  } else if (phase < 0.30) {
    const p2 = (phase - 0.15) / 0.15;
    waveform = 1 - 0.12 * Math.pow(p2, 1.2);
  } else {
    const p3 = (phase - 0.30) / 0.70;
    waveform = 0.88 * Math.exp(-p3 * 2.1);
  }

  const pressure = diasVal + (systolic - diasVal) * waveform;
  const noise    = (Math.random() - 0.5) * 0.8;
  return pressure + noise;
}


/**
 * Isi array riwayat tekanan awal.
 *
 * @param {number} bpm        BPM
 * @param {number} systolic   tekanan sistolik
 * @param {number} durationS  durasi riwayat (detik)
 * @param {number} sampleRate titik per detik
 * @returns {number[]}  array nilai tekanan
 */
function generatePressureHistory(bpm, systolic, durationS, sampleRate, diastolic) {
  const total = durationS * sampleRate;
  const dt    = 1 / sampleRate;
  const result = [];
  for (let i = 0; i < total; i++) {
    result.push(calcPressureWaveform(i * dt, bpm, systolic, diastolic));
  }
  return result;
}


/* ════════════════════════════════════════════════════════════════
   EKSPOR GLOBAL
   ════════════════════════════════════════════════════════════════ */

window.BF_PHYSICS = Object.freeze({
  /* Kalkulasi display */
  flowRate:         calcFlowRate,
  velocity:         calcVelocity,
  resistance:       calcResistance,
  bernoulli:        calcBernoulli,

  /* Animasi */
  particleSpeed:    calcParticleSpeed,
  lumenWidth:       calcLumenWidth,
  plaqueConfig:     calcPlaqueConfig,
  particleColor:    calcParticleColor,

  /* Grafik */
  pressureWaveform:       calcPressureWaveform,
  generatePressureHistory: generatePressureHistory,
});
