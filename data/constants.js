/* ═══════════════════════════════════════════════════════════════
   BioFlow — data/constants.js
   Fondasi seluruh project:
     · Konstanta fisika darah
     · Range & default slider
     · Ambang batas kesehatan
     · Teks penjelasan ilmiah (dinamis)
     · Konten edukasi halaman lain
   ═══════════════════════════════════════════════════════════════ */

'use strict';

/* ─── 1. KONSTANTA FISIKA DARAH ──────────────────────────────── */
const PHYSICS = Object.freeze({

  /** Densitas darah manusia (kg/m³) — rata-rata 1060 */
  BLOOD_DENSITY: 1060,

  /** Viskositas dinamis darah (Pa·s) — rentang 0.003–0.004 */
  BLOOD_VISCOSITY: 0.0035,

  /** Gravitasi standar (m/s²) */
  GRAVITY: 9.81,

  /**
   * Panjang pembuluh referensi untuk Poiseuille (m)
   * (setara aorta descendens pendek ~0.1 m)
   */
  VESSEL_LENGTH: 0.1,

  /**
   * Radius pembuluh darah referensi dalam kondisi normal (m)
   * Aorta dewasa ≈ 0.012–0.015 m, kita pakai 0.012
   */
  VESSEL_RADIUS_REF: 0.012,

  /**
   * Faktor konversi mmHg → Pascal
   * 1 mmHg = 133.322 Pa
   */
  MMHG_TO_PA: 133.322,

  /**
   * Faktor konversi m³/s → mL/s
   * 1 m³/s = 1,000,000 mL/s
   */
  M3S_TO_MLS: 1e6,

  /**
   * Tekanan diastolik baseline (mmHg)
   * Digunakan untuk menghitung ΔP dari tekanan sistolik.
   */
  DIASTOLIC_BASELINE: 80,

  /**
   * Cardiac output referensi dalam kondisi normal (L/min)
   * Digunakan untuk skala tampilan debit.
   */
  CARDIAC_OUTPUT_REF: 5.0,

  /**
   * Volume sekuncup referensi (mL/beat)
   * Q = SV × HR   →   debit dalam mL/s
   */
  STROKE_VOLUME_REF: 70,

  /**
   * Koefisien skala Poiseuille untuk tampilan
   * Menyesuaikan satuan m³/s → mL/s pada resolusi slider UI.
   */
  POISEUILLE_DISPLAY_SCALE: 0.0018,

  /**
   * Konstanta resistansi peripheral unit (PRU)
   * 1 PRU = 1 mmHg·min/L — dipakai untuk display saja
   */
  PRU_SCALE: 0.0133,
});


/* ─── 2. KONFIGURASI SLIDER ──────────────────────────────────── */
const SLIDER = Object.freeze({

  bpm: Object.freeze({
    id:      'bpmSlider',
    fillId:  'bpmFill',
    valueId: 'bpmValue',
    min:     40,
    max:     180,
    default: 72,
    step:    1,
    unit:    'BPM',
    label:   'Detak Jantung',
  }),

  pressure: Object.freeze({
    id:      'pressureSlider',
    fillId:  'pressureFill',
    valueId: 'pressureValue',
    min:     80,
    max:     180,
    default: 120,
    step:    1,
    unit:    'mmHg',
    label:   'Tekanan Darah',
  }),

  diameter: Object.freeze({
    id:      'diameterSlider',
    fillId:  'diameterFill',
    valueId: 'diameterValue',
    min:     20,
    max:     100,
    default: 70,
    step:    1,
    unit:    '%',
    label:   'Diameter Pembuluh',
  }),
});


/* ─── 3. AMBANG BATAS KESEHATAN ──────────────────────────────── */
const HEALTH = Object.freeze({

  /* ── Detak Jantung ── */
  bpm: Object.freeze({
    bradycardia: { max: 60,  label: 'Bradikardia',   severity: 'warning' },
    normal:      { min: 60,  max: 100, label: 'Normal',       severity: 'normal'  },
    tachycardia: { min: 100, label: 'Takikardia',    severity: 'danger'  },
  }),

  /* ── Tekanan Darah Sistolik ── */
  pressure: Object.freeze({
    hypotension:     { max: 90,  label: 'Hipotensi',     severity: 'warning' },
    normal:          { min: 90,  max: 120, label: 'Normal',         severity: 'normal'  },
    prehypertension: { min: 120, max: 140, label: 'Pra-Hipertensi', severity: 'warning' },
    hypertension:    { min: 140, label: 'Hipertensi',    severity: 'danger'  },
  }),

  /* ── Diameter Pembuluh (% dari normal) ── */
  diameter: Object.freeze({
    severe:   { max: 40,  label: 'Stenosis Berat',    severity: 'danger'  },
    moderate: { min: 40,  max: 60,  label: 'Stenosis Sedang', severity: 'warning' },
    mild:     { min: 60,  max: 80,  label: 'Stenosis Ringan', severity: 'warning' },
    normal:   { min: 80,  label: 'Normal',             severity: 'normal'  },
  }),

  /**
   * Fungsi helper: kembalikan objek { label, severity } berdasarkan nilai.
   * Dipanggil oleh ui.js untuk update status badge.
   */
  classify(type, value) {
    const ranges = HEALTH[type];
    if (!ranges) return { label: '—', severity: 'normal' };

    for (const key of Object.keys(ranges)) {
      const r = ranges[key];
      const aboveMin = r.min == null || value >= r.min;
      const belowMax = r.max == null || value <  r.max;
      if (aboveMin && belowMax) return { label: r.label, severity: r.severity };
    }
    return { label: '—', severity: 'normal' };
  },

  /**
   * Fungsi helper: kembalikan severity keseluruhan dari ketiga parameter.
   * Priority: danger > warning > normal
   */
  overallSeverity(bpmVal, pressureVal, diameterVal) {
    const priorities = { danger: 2, warning: 1, normal: 0 };
    const levels = [
      HEALTH.classify('bpm',      bpmVal).severity,
      HEALTH.classify('pressure', pressureVal).severity,
      HEALTH.classify('diameter', diameterVal).severity,
    ];
    return levels.reduce((acc, sev) =>
      (priorities[sev] ?? 0) > (priorities[acc] ?? 0) ? sev : acc,
      'normal'
    );
  },
});


/* ─── 4. MODE PRESET ─────────────────────────────────────────── */
/**
 * Preset nilai slider untuk tiap mode simulasi.
 * Dipanggil oleh ui.js saat tombol mode ditekan.
 */
const PRESETS = Object.freeze({

  normal: Object.freeze({
    bpm:      72,
    pressure: 120,
    diameter: 85,
    label:    'Normal',
    description: 'Kondisi kardiovaskular sehat. Detak jantung, tekanan darah, dan diameter pembuluh dalam rentang optimal.',
  }),

  hipertensi: Object.freeze({
    bpm:      90,
    pressure: 155,
    diameter: 65,
    label:    'Hipertensi',
    description: 'Tekanan darah tinggi (sistolik ≥ 140 mmHg). Jantung bekerja lebih keras; risiko kerusakan pembuluh meningkat.',
  }),

  penyumbatan: Object.freeze({
    bpm:      95,
    pressure: 145,
    diameter: 30,
    label:    'Penyumbatan',
    description: 'Stenosis berat — diameter pembuluh < 40%. Aliran darah terhambat signifikan. Tekanan di bagian proksimal naik drastis.',
  }),
});


/* ─── 5. TEKS PENJELASAN DINAMIS ─────────────────────────────── */
/**
 * Teks yang muncul di panel kanan simulasi.
 * ui.js memilih entri yang paling relevan berdasarkan state saat ini.
 *
 * Setiap objek: { condition(state) → boolean, title, body }
 * Dievaluasi berurutan; entri pertama yang cocok dipakai.
 */
const EXPLANATIONS = [

  /* Penyumbatan berat */
  {
    condition: (s) => s.diameter <= 30,
    title: 'Stenosis Berat',
    body:  `Diameter pembuluh ≤ 30% dari normal menciptakan hambatan ekstrem.
            Sesuai Hukum Poiseuille, debit berbanding lurus dengan <em>r⁴</em>,
            sehingga penyempitan 70% mengurangi aliran hingga <strong>99,76%</strong>.
            Tekanan di proksimal melonjak; risiko ruptur atau infark sangat tinggi.`,
  },

  /* Stenosis sedang */
  {
    condition: (s) => s.diameter <= 50,
    title: 'Stenosis Sedang',
    body:  `Pada diameter 40–50%, kecepatan aliran meningkat tajam di titik sempit
            (Asas Kontinuitas: A₁v₁ = A₂v₂). Tekanan dinamis turun di titik tersempit
            sesuai Bernoulli, tetapi tekanan total naik di hulu. Kompensasi jantung
            berupa peningkatan frekuensi detak.`,
  },

  /* Hipertensi */
  {
    condition: (s) => s.pressure >= 140,
    title: 'Hipertensi',
    body:  `Tekanan sistolik ≥ 140 mmHg mendorong dinding arteri dengan gaya lebih besar
            (P = F/A). Jika berlangsung kronis, dinding pembuluh menebal (hipertrofi)
            dan elastisitasnya berkurang — menciptakan siklus umpan balik yang
            memperburuk hipertensi.`,
  },

  /* Pra-hipertensi */
  {
    condition: (s) => s.pressure >= 120 && s.pressure < 140,
    title: 'Pra-Hipertensi',
    body:  `Tekanan 120–139 mmHg adalah zona waspada. Belum menyebabkan kerusakan
            langsung, namun tanpa perubahan gaya hidup risiko hipertensi penuh
            dalam 10 tahun meningkat dua kali lipat. Olahraga aerobik dan
            pembatasan natrium efektif menurunkan tekanan.`,
  },

  /* Takikardia */
  {
    condition: (s) => s.bpm >= 100,
    title: 'Takikardia',
    body:  `Detak jantung ≥ 100 BPM meningkatkan cardiac output (CO = SV × HR).
            Dalam jangka pendek, ini merupakan respons fisiologis normal (olahraga,
            stres). Jika persisten saat istirahat, menunjukkan beban kerja
            berlebih pada miokardium.`,
  },

  /* Bradikardia */
  {
    condition: (s) => s.bpm < 60,
    title: 'Bradikardia',
    body:  `Detak jantung < 60 BPM. Pada atlet terlatih ini normal (stroke volume
            tinggi). Namun jika disertai pusing atau sinkop, bradikardia patologis
            mengurangi perfusi organ. Debit aliran Q = SV × HR turut berkurang
            proporsional.`,
  },

  /* Kondisi normal — ditampilkan terakhir sebagai fallback */
  {
    condition: () => true,
    title: 'Kondisi Normal',
    body:  `Diameter pembuluh yang mengecil menyebabkan kecepatan aliran darah
            meningkat dan tekanan fluida naik. Hal ini sesuai dengan
            <strong>Asas Kontinuitas</strong> (A₁v₁ = A₂v₂) dan
            <strong>Prinsip Bernoulli</strong>
            (P + ½ρv² + ρgh = konstan).`,
  },
];

/**
 * Ambil teks penjelasan yang sesuai berdasarkan state saat ini.
 * @param {{ bpm: number, pressure: number, diameter: number }} state
 * @returns {{ title: string, body: string }}
 */
function getExplanation(state) {
  const entry = EXPLANATIONS.find((e) => e.condition(state));
  return entry ?? EXPLANATIONS[EXPLANATIONS.length - 1];
}


/* ─── 6. KONTEN EDUKASI ──────────────────────────────────────── */
/**
 * Konten detail untuk halaman Edukasi.
 * Dikonsumsi oleh ui.js saat tombol "Pelajari" di-klik.
 */
const EDU_TOPICS = Object.freeze({

  'sistem-peredaran': {
    title: 'Sistem Peredaran Darah',
    content: `
      <h3>Sistem Peredaran Darah</h3>
      <p>Sistem kardiovaskular manusia terdiri dari jantung, pembuluh darah, dan darah itu sendiri.
         Sistem ini bertugas mengantarkan oksigen, nutrisi, hormon, dan sel imun ke seluruh jaringan
         tubuh, sekaligus mengangkut limbah metabolik (CO₂, urea) ke organ ekskresi.</p>

      <p><strong>Peredaran besar (sistemik)</strong> — jantung kiri memompa darah beroksigen
         ke seluruh tubuh melalui aorta, lalu darah kembali via vena cava ke jantung kanan.</p>

      <p><strong>Peredaran kecil (pulmonal)</strong> — jantung kanan memompa darah ke paru-paru
         untuk pertukaran gas O₂/CO₂, lalu darah segar kembali ke jantung kiri.</p>

      <p>Satu siklus jantung (sistol + diastol) berlangsung ± 0,8 detik pada detak 75 BPM,
         dengan volume sekuncup rata-rata 70 mL sehingga cardiac output ≈ 5,25 L/menit.</p>
    `,
  },

  'tekanan-fluida': {
    title: 'Tekanan Fluida',
    content: `
      <h3>Tekanan Fluida dalam Pembuluh Darah</h3>
      <p>Tekanan fluida adalah gaya per satuan luas: <strong>P = F / A</strong> (Pascal).
         Dalam konteks darah, tekanan ini diciptakan oleh kontraksi ventrikel kiri
         dan dipertahankan oleh elastisitas dinding arteri.</p>

      <p><strong>Tekanan sistolik</strong> adalah puncak tekanan saat ventrikel berkontraksi.
         <strong>Tekanan diastolik</strong> adalah tekanan minimum saat ventrikel relaksasi.
         Normal: 120/80 mmHg (1 mmHg = 133,3 Pa).</p>

      <p>Tekanan menurun sepanjang pembuluh dari arteri → kapiler → vena, karena energi
         hilang akibat viskositas darah (seperti resistansi pada rangkaian listrik).</p>
    `,
  },

  'aliran-darah': {
    title: 'Aliran Darah',
    content: `
      <h3>Dinamika Aliran Darah</h3>
      <p>Aliran darah dalam pembuluh mengikuti pola <strong>laminar</strong> pada kondisi normal —
         lapisan cairan mengalir paralel dengan kecepatan tertinggi di tengah dan nol
         di dinding (profil parabola Poiseuille).</p>

      <p>Debit volumetrik Q dihitung dengan <strong>Hukum Poiseuille</strong>:</p>
      <p style="font-family: monospace; padding: 8px 16px; background: var(--surface-3); border-radius: 6px;">
         Q = (π · r⁴ · ΔP) / (8 · η · L)
      </p>
      <p>Implikasi kunci: debit <em>berbanding r pangkat empat</em>. Penyempitan
         diameter 50% mengurangi debit 16× lipat!</p>

      <p>Aliran menjadi <strong>turbulen</strong> saat bilangan Reynolds Re > 2000,
         yaitu saat kecepatan tinggi, diameter besar, atau viskositas rendah.
         Turbulensi menimbulkan bunyi (bruit) dan meningkatkan risiko trombosis.</p>
    `,
  },
});


/* ─── 7. KONTEN KONTEKSTUAL ──────────────────────────────────── */
const CONTEXT_TOPICS = Object.freeze({

  hipertensi: {
    title: 'Hipertensi — Silent Killer',
    content: `
      <h3>Hipertensi</h3>
      <p>Hipertensi (tekanan darah tinggi) didefinisikan sebagai tekanan sistolik ≥ 140 mmHg
         atau diastolik ≥ 90 mmHg secara persisten. Disebut <em>silent killer</em> karena
         sering tanpa gejala hingga terjadi komplikasi serius.</p>

      <p><strong>Komplikasi:</strong> stroke, infark miokard, gagal ginjal, dan retinopati.
         Setiap kenaikan 20/10 mmHg dari 115/75 mmHg melipatduakan risiko penyakit
         kardiovaskular.</p>

      <p><strong>Penanganan:</strong> modifikasi gaya hidup (diet DASH, olahraga aerobik
         150 menit/minggu, pembatasan sodium &lt; 2g/hari) dan farmakoterapi
         (ACE inhibitor, ARB, CCB, diuretik tiazid).</p>
    `,
  },

  penyumbatan: {
    title: 'Aterosklerosis & Penyumbatan',
    content: `
      <h3>Penyumbatan Pembuluh Darah</h3>
      <p>Aterosklerosis adalah penumpukan plak (kolesterol LDL teroksidasi, sel busa,
         kalsium) di dinding arteri. Plak menyempitkan lumen dan mengurangi elastisitas
         dinding — meningkatkan resistansi perifer.</p>

      <p>Jika plak pecah, trombosit berkumpul membentuk trombus yang dapat menyumbat
         arteri koroner (<strong>infark miokard</strong>) atau arteri serebral
         (<strong>stroke iskemik</strong>) secara mendadak.</p>

      <p><strong>Faktor risiko:</strong> dislipidemia, hipertensi, diabetes, merokok,
         obesitas, dan riwayat keluarga. CT angiografi dan skor kalsium arteri koroner
         (CACS) digunakan untuk deteksi dini.</p>
    `,
  },

  olahraga: {
    title: 'Olahraga & Kesehatan Jantung',
    content: `
      <h3>Olahraga & Kardiovaskular</h3>
      <p>Olahraga aerobik teratur (jogging, bersepeda, renang) meningkatkan efisiensi
         kardiovaskular: stroke volume naik, detak istirahat turun
         (atlet elite bisa &lt; 40 BPM), dan cardiac output sama pada kerja yang
         lebih rendah.</p>

      <p><strong>Adaptasi pembuluh darah:</strong> peningkatan produksi nitrat oksida (NO)
         oleh endotel, vasodilatasi, angiogenesis (pembentukan kapiler baru),
         dan peningkatan elastisitas arteri — semua menurunkan tekanan darah.</p>

      <p>WHO merekomendasikan minimal <strong>150 menit aerobik sedang</strong>
         atau <strong>75 menit aerobik intens</strong> per minggu, ditambah
         latihan kekuatan 2× seminggu untuk kesehatan kardiovaskular optimal.</p>
    `,
  },
});


/* ─── 8. KONTEN FISIKA (sub-topik) ──────────────────────────── */
const PHYSICS_TOPICS = Object.freeze({

  'tekanan-fluida': {
    title: 'Tekanan Fluida',
    intro: 'Tekanan adalah gaya yang bekerja tegak lurus pada suatu luas permukaan.',
    formula: 'P = F / A',
    legend: ['P = Tekanan (Pa)', 'F = Gaya (N)', 'A = Luas (m²)'],
    note:  'Dalam pembuluh darah, tekanan mendorong darah mengalir ke seluruh tubuh.',
    visual: 'pressure',
  },

  'asas-kontinuitas': {
    title: 'Asas Kontinuitas',
    intro: 'Untuk fluida tak-kompresibel, laju volume aliran konstan di semua penampang.',
    formula: 'A₁v₁ = A₂v₂',
    legend: ['A = Luas penampang (m²)', 'v = Kecepatan aliran (m/s)'],
    note:  'Saat pembuluh menyempit, kecepatan darah meningkat untuk menjaga debit tetap konstan.',
    visual: 'continuity',
  },

  'hukum-bernoulli': {
    title: 'Hukum Bernoulli',
    intro: 'Pada aliran steady tak-viskos, total energi per satuan volume konstan.',
    formula: 'P + ½ρv² + ρgh = konstan',
    legend: ['P = Tekanan statis (Pa)', 'ρ = Densitas (kg/m³)', 'v = Kecepatan (m/s)', 'h = Ketinggian (m)'],
    note:  'Kecepatan tinggi = tekanan statis rendah. Ini menjelaskan mengapa arteri yang menyempit mengalami tekanan dinamik tinggi.',
    visual: 'bernoulli',
  },

  'viskositas': {
    title: 'Viskositas Fluida',
    intro: 'Viskositas mengukur resistansi fluida terhadap deformasi (gesekan internal).',
    formula: 'τ = η · (dv/dy)',
    legend: ['τ = Tegangan geser (Pa)', 'η = Viskositas dinamis (Pa·s)', 'dv/dy = Gradien kecepatan'],
    note:  'Darah bersifat non-Newtonian: viskositasnya turun saat kecepatan geser tinggi (efek shear-thinning). Hematokrit tinggi meningkatkan viskositas.',
    visual: 'viscosity',
  },
});


/* ─── 9. KONFIGURASI ANIMASI ─────────────────────────────────── */
const ANIMATION = Object.freeze({

  /** Jumlah partikel darah (RBC) di canvas */
  PARTICLE_COUNT: 38,

  /** Radius partikel RBC (px, di koordinat canvas) */
  PARTICLE_RADIUS_MIN: 4,
  PARTICLE_RADIUS_MAX: 7,

  /** Warna partikel */
  RBC_COLOR_FILL:   '#c0392b',
  RBC_COLOR_STROKE: '#922b21',
  RBC_COLOR_DARK:   '#7b241c',

  /** Warna pembuluh */
  VESSEL_WALL_COLOR:  '#8b1a1a',
  VESSEL_INNER_COLOR: '#3d0c0c',
  VESSEL_PLAQUE_COLOR:'#c0a050',

  /** Frame rate target */
  TARGET_FPS: 60,

  /** Interval update grafik tekanan (ms) */
  CHART_UPDATE_MS: 100,

  /** Panjang riwayat grafik tekanan (detik) */
  CHART_HISTORY_S: 30,

  /**
   * Kecepatan partikel base (px/frame) pada kondisi normal.
   * Dimodulasi oleh BPM dan diameter di simulation.js.
   */
  BASE_SPEED: 2.2,

  /** Amplitudo osilasi tekanan sistolik-diastolik untuk grafik */
  PRESSURE_WAVE_AMPLITUDE: 20,
});


/* ─── 10. EKSPOR GLOBAL ──────────────────────────────────────── */
/**
 * Semua konstanta diekspos via objek global BF_CONST
 * agar dapat dikonsumsi oleh physics.js, simulation.js, dan ui.js
 * tanpa module bundler.
 */
window.BF_CONST = Object.freeze({
  PHYSICS,
  SLIDER,
  HEALTH,
  PRESETS,
  EXPLANATIONS,
  ANIMATION,
  EDU_TOPICS,
  CONTEXT_TOPICS,
  PHYSICS_TOPICS,
  getExplanation,
});