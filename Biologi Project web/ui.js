/* ═══════════════════════════════════════════════════════════════
   BioFlow — ui.js  (v2 — fixed)
   ═══════════════════════════════════════════════════════════════ */
'use strict';

/* ─── Inisialisasi setelah DOM siap ─────────────────────────── */
document.addEventListener('DOMContentLoaded', function () {

  /* 1. Init simulasi canvas */
  var simCanvas   = document.getElementById('simCanvas');
  var chartCanvas = document.getElementById('pressureChart');
  if (simCanvas && chartCanvas && window.BF_SIM) {
    window.BF_SIM.init(simCanvas, chartCanvas);
  }

  /* 2. Bind slider */
  _bindSlider('bpmSlider',       'bpmFill',       'bpmValue',       40,  180);
  _bindSlider('pressureSlider',  'pressureFill',  'pressureValue',  90,  180);
  _bindSlider('diastolicSlider', 'diastolicFill', 'diastolicValue', 60,  120);
  _bindSlider('diameterSlider',  'diameterFill',  'diameterValue',  20,  100);

  /* Pastikan diastolik tidak melebihi sistolik */
  document.getElementById('pressureSlider')?.addEventListener('input', _clampDiastolic);
  document.getElementById('diastolicSlider')?.addEventListener('input', _clampDiastolic);

  /* 3. Mode buttons */
  document.querySelectorAll('.mode-btn').forEach(function (btn) {
    btn.addEventListener('click', function () {
      var mode = btn.dataset.mode;
      if (!mode || !window.BF_CONST.PRESETS[mode]) return;

      document.querySelectorAll('.mode-btn').forEach(function (b) {
        b.classList.remove('active');
        b.setAttribute('aria-pressed', 'false');
      });
      btn.classList.add('active');
      btn.setAttribute('aria-pressed', 'true');

      var p = window.BF_CONST.PRESETS[mode];
      _setSlider('bpmSlider',       'bpmFill',       'bpmValue',       p.bpm,       40,  180);
      _setSlider('pressureSlider',  'pressureFill',  'pressureValue',  p.pressure,  90,  180);
      _setSlider('diastolicSlider', 'diastolicFill', 'diastolicValue', p.diastolic || Math.round(p.pressure * 0.67), 60, 120);
      _setSlider('diameterSlider',  'diameterFill',  'diameterValue',  p.diameter,  20,  100);

      if (window.BF_SIM) window.BF_SIM.applyPreset(mode);
      _updateOutputs();
    });
  });

  /* 4. Navigasi sidebar */
  document.querySelectorAll('.nav-link').forEach(function (link) {
    link.addEventListener('click', function (e) {
      e.preventDefault();
      var page = link.dataset.page;
      if (!page) return;

      document.querySelectorAll('.page').forEach(function (sec) {
        sec.classList.remove('active');
        sec.hidden = true;
      });
      var target = document.getElementById('page-' + page);
      if (target) { target.classList.add('active'); target.hidden = false; }

      document.querySelectorAll('.nav-link').forEach(function (l) {
        var active = l.dataset.page === page;
        l.classList.toggle('active', active);
        l.setAttribute('aria-current', active ? 'page' : 'false');
      });

      if (window.BF_SIM) {
        page === 'simulasi' ? window.BF_SIM.resume() : window.BF_SIM.stop();
      }
    });
  });

  /* 5. Subtopic buttons (fisika) — render panel saat klik */
  _renderPhysicsPanel('tekanan-fluida'); /* default saat load */
  document.querySelectorAll('.subtopic-btn').forEach(function (btn) {
    btn.addEventListener('click', function () {
      document.querySelectorAll('.subtopic-btn').forEach(function (b) {
        b.classList.remove('active');
      });
      btn.classList.add('active');
      _renderPhysicsPanel(btn.dataset.subtopic);
    });
  });

  /* 6. Tombol "Pelajari Lebih Lanjut" */
  var learnBtn = document.getElementById('btnLearnMore');
  if (learnBtn) {
    learnBtn.addEventListener('click', function () {
      document.querySelector('.nav-link[data-page="fisika"]')?.click();
    });
  }

  /* 7. Update output pertama kali */
  _updateOutputs();
});


/* ─── Bind slider: update fill + value + output ─────────────── */
function _bindSlider(sliderId, fillId, valueId, min, max) {
  var slider = document.getElementById(sliderId);
  if (!slider) return;

  function refresh() {
    _updateFill(slider, fillId, min, max);
    var out = document.getElementById(valueId);
    if (out) out.textContent = slider.value;
    _syncSim();
    _updateOutputs();
  }

  slider.addEventListener('input', refresh);
  _updateFill(slider, fillId, min, max); // init fill
}

function _updateFill(slider, fillId, min, max) {
  var fill = document.getElementById(fillId);
  if (!fill) return;
  var pct = ((+slider.value - min) / (max - min)) * 100;
  fill.style.width = pct + '%';
}

function _setSlider(sliderId, fillId, valueId, value, min, max) {
  var slider = document.getElementById(sliderId);
  var out    = document.getElementById(valueId);
  if (slider) slider.value = value;
  if (out)    out.textContent = value;
  if (slider) _updateFill(slider, fillId, min, max);
}

function _syncSim() {
  if (!window.BF_SIM) return;
  window.BF_SIM.updateState({
    bpm:       +document.getElementById('bpmSlider').value,
    pressure:  +document.getElementById('pressureSlider').value,
    diastolic: +(document.getElementById('diastolicSlider')?.value ?? 80),
    diameter:  +document.getElementById('diameterSlider').value,
  });
}

function _clampDiastolic() {
  var sys  = document.getElementById('pressureSlider');
  var dia  = document.getElementById('diastolicSlider');
  var dOut = document.getElementById('diastolicValue');
  if (!sys || !dia) return;
  /* Diastolik harus minimal 20 di bawah sistolik */
  var maxDia = +sys.value - 20;
  if (+dia.value > maxDia) {
    dia.value = maxDia;
    if (dOut) dOut.textContent = maxDia;
    _updateFill(dia, 'diastolicFill', 60, 120);
  }
}


/* ─── Update semua nilai output fisika ──────────────────────── */
function _updateOutputs() {
  var phys = window.BF_PHYSICS;
  if (!phys) return;

  var state = {
    bpm:       +(document.getElementById('bpmSlider')?.value       ?? 72),
    pressure:  +(document.getElementById('pressureSlider')?.value  ?? 120),
    diastolic: +(document.getElementById('diastolicSlider')?.value ?? 80),
    diameter:  +(document.getElementById('diameterSlider')?.value  ?? 70),
  };

  /* Hitung */
  var flow       = phys.flowRate(state);      // mL/s
  var velocity   = phys.velocity(state);      // cm/s
  var resistance = phys.resistance(state);    // PRU
  var bernoulli  = phys.bernoulli(state);     // Pa

  /* Tampilkan */
  _setText('flowValue',       flow.toFixed(1));
  _setText('velocityValue',   velocity.toFixed(1));
  _setText('resistanceValue', resistance.toFixed(2));
  _setText('bernoulliValue',  Math.round(bernoulli).toLocaleString('id-ID'));

  /* Status badge */
  _updateBadge(state);

  /* Penjelasan */
  _updateExplanation(state);
}

function _setText(id, val) {
  var el = document.getElementById(id);
  if (el) el.textContent = val;
}

function _updateBadge(state) {
  var badge = document.getElementById('statusBadge');
  if (!badge || !window.BF_CONST.HEALTH) return;
  var cls = window.BF_CONST.HEALTH.classify('pressure', state.pressure);
  badge.textContent = cls.label;
  badge.className   = 'status-badge';
  if      (cls.severity === 'danger')  badge.classList.add('status-badge--danger');
  else if (cls.severity === 'warning') badge.classList.add('status-badge--warning');
  else                                 badge.classList.add('status-badge--normal');
}

function _updateExplanation(state) {
  var el = document.getElementById('explanationText');
  if (!el || !window.BF_CONST.getExplanation) return;
  var entry = window.BF_CONST.getExplanation(state);
  if (entry && entry.body) el.innerHTML = entry.body;
}


/* ════════════════════════════════════════════════════════════════
   HALAMAN KONSEP FISIKA — render panel & visual canvas
   ════════════════════════════════════════════════════════════════ */

function _renderPhysicsPanel(key) {
  var topics = window.BF_CONST && window.BF_CONST.PHYSICS_TOPICS;
  if (!topics) return;
  var t = topics[key];
  if (!t) return;

  var el = document.getElementById('physicsContent');
  if (!el) return;

  var formulaMap = {
    'tekanan-fluida':    'P &nbsp;=&nbsp; <span class="frac"><span class="frac-num">F</span><span class="frac-den">A</span></span>',
    'asas-kontinuitas':  'A<sub>1</sub>v<sub>1</sub> &nbsp;=&nbsp; A<sub>2</sub>v<sub>2</sub>',
    'hukum-bernoulli':   'P + &frac12;&rho;v&sup2; + &rho;gh &nbsp;=&nbsp; konstan',
    'viskositas':        '&tau; &nbsp;=&nbsp; &eta; &middot; <span class="frac"><span class="frac-num">dv</span><span class="frac-den">dy</span></span>',
  };

  var legendHtml = (t.legend || []).map(function(l){ return '<div>' + l + '</div>'; }).join('');

  el.innerHTML =
    '<div class="physics-panel">' +
      '<div class="physics-panel__text">' +
        '<h2>' + t.title + '</h2>' +
        '<p>' + t.intro + '</p>' +
        '<div class="formula-card formula-card--lg">' +
          '<div class="formula-card__expr large">' + (formulaMap[key] || t.formula) + '</div>' +
          '<div class="formula-legend">' + legendHtml + '</div>' +
        '</div>' +
        '<p class="physics-note">' + t.note + '</p>' +
      '</div>' +
      '<div class="physics-panel__visual" aria-hidden="true">' +
        '<canvas id="physicsCanvas" width="260" height="220"></canvas>' +
      '</div>' +
    '</div>';

  setTimeout(function() { _drawPhysCanvas(key); }, 20);
}

function _drawPhysCanvas(key) {
  var canvas = document.getElementById('physicsCanvas');
  if (!canvas) return;
  var ctx = canvas.getContext('2d');
  var W = 260, H = 220;
  ctx.clearRect(0, 0, W, H);
  ctx.fillStyle = 'rgba(255,255,255,0.03)';
  ctx.fillRect(0, 0, W, H);

  if      (key === 'tekanan-fluida')    _visPressure(ctx, W, H);
  else if (key === 'asas-kontinuitas')  _visContinuity(ctx, W, H);
  else if (key === 'hukum-bernoulli')   _visBernoulli(ctx, W, H);
  else if (key === 'viskositas')        _visViscosity(ctx, W, H);
}

function _visArrow(ctx, x1, y1, x2, y2, color, w) {
  if (x1===x2 && y1===y2) return;
  ctx.save();
  ctx.strokeStyle = color; ctx.fillStyle = color; ctx.lineWidth = w;
  ctx.beginPath(); ctx.moveTo(x1,y1); ctx.lineTo(x2,y2); ctx.stroke();
  var a = Math.atan2(y2-y1, x2-x1), s = Math.max(5, w*3.5);
  ctx.beginPath();
  ctx.moveTo(x2,y2);
  ctx.lineTo(x2 - s*Math.cos(a-0.45), y2 - s*Math.sin(a-0.45));
  ctx.lineTo(x2 - s*Math.cos(a+0.45), y2 - s*Math.sin(a+0.45));
  ctx.closePath(); ctx.fill(); ctx.restore();
}

function _visPressure(ctx, W, H) {
  var cx = W/2;
  ctx.fillStyle = 'rgba(229,57,53,0.12)'; ctx.strokeStyle = '#e53935'; ctx.lineWidth = 2;
  if (ctx.roundRect) {
    ctx.beginPath(); ctx.roundRect(cx-55, 70, 110, 100, 8); ctx.fill(); ctx.stroke();
  } else {
    ctx.fillRect(cx-55, 70, 110, 100); ctx.strokeRect(cx-55, 70, 110, 100);
  }
  ctx.fillStyle = 'rgba(229,57,53,0.7)';
  ctx.fillRect(cx-50, 52, 100, 22); ctx.strokeRect(cx-50, 52, 100, 22);
  _visArrow(ctx, cx, 18, cx, 50, '#e53935', 3);
  ctx.fillStyle = 'rgba(255,255,255,0.8)'; ctx.font = 'bold 13px monospace'; ctx.textAlign = 'center';
  ctx.fillText('F ↓', cx+22, 38);
  _visArrow(ctx, cx-28, 128, cx-54, 128, 'rgba(229,57,53,0.55)', 1.5);
  _visArrow(ctx, cx+28, 128, cx+54, 128, 'rgba(229,57,53,0.55)', 1.5);
  ctx.fillStyle='rgba(255,255,255,0.45)'; ctx.font='10px monospace';
  ctx.fillText('P tersebar merata', cx, 195);
}

function _visContinuity(ctx, W, H) {
  ctx.strokeStyle = '#e53935'; ctx.lineWidth = 2;
  ctx.fillStyle = 'rgba(229,57,53,0.1)';
  ctx.beginPath();
  ctx.moveTo(10,60); ctx.lineTo(110,60); ctx.lineTo(150,93); ctx.lineTo(250,93);
  ctx.lineTo(250,127); ctx.lineTo(150,127); ctx.lineTo(110,160); ctx.lineTo(10,160);
  ctx.closePath(); ctx.fill(); ctx.stroke();

  _visArrow(ctx, 25,110, 75,110, 'rgba(255,255,255,0.45)', 1.8);
  ctx.fillStyle='rgba(255,255,255,0.5)'; ctx.font='10px monospace'; ctx.textAlign='center';
  ctx.fillText('v₁', 50, 103);

  _visArrow(ctx, 163,110, 237,110, '#e53935', 2.5);
  ctx.fillStyle='rgba(255,255,255,0.8)'; ctx.font='bold 10px monospace';
  ctx.fillText('v₂ > v₁', 200, 88);

  ctx.fillStyle='rgba(255,255,255,0.35)'; ctx.font='9px monospace';
  ctx.fillText('A₁ besar', 55, 182);
  ctx.fillText('A₂ kecil', 200, 148);
  ctx.fillStyle='rgba(229,57,53,0.7)'; ctx.font='10px monospace';
  ctx.fillText('A₁v₁ = A₂v₂', W/2, 210);
}

function _visBernoulli(ctx, W, H) {
  var pad=30, gW=W-pad*2, gH=120, ox=pad, oy=H-48;
  ctx.strokeStyle='rgba(255,255,255,0.2)'; ctx.lineWidth=1;
  ctx.beginPath(); ctx.moveTo(ox,oy-gH); ctx.lineTo(ox,oy); ctx.lineTo(ox+gW,oy); ctx.stroke();
  ctx.fillStyle='rgba(255,255,255,0.4)'; ctx.font='10px monospace';
  ctx.textAlign='left'; ctx.fillText('↑ Tekanan', ox+4, oy-gH+12);
  ctx.textAlign='right'; ctx.fillText('Kecepatan →', ox+gW, oy+13);

  ctx.beginPath(); ctx.strokeStyle='#e53935'; ctx.lineWidth=2.5;
  for (var i=0; i<=gW; i++) {
    var t=i/gW, y=oy-gH*(1-t*t*0.85);
    i===0 ? ctx.moveTo(ox+i,y) : ctx.lineTo(ox+i,y);
  }
  ctx.stroke();

  ctx.fillStyle='rgba(229,57,53,0.9)';
  ctx.beginPath(); ctx.arc(ox+gW*0.15, oy-gH*0.97, 5, 0, Math.PI*2); ctx.fill();
  ctx.beginPath(); ctx.arc(ox+gW*0.85, oy-gH*0.39, 5, 0, Math.PI*2); ctx.fill();

  ctx.font='9px monospace'; ctx.textAlign='left';
  ctx.fillStyle='rgba(255,255,255,0.55)'; ctx.fillText('v rendah→P tinggi', ox+6, oy-gH+28);
  ctx.fillStyle='rgba(229,57,53,0.9)'; ctx.fillText('v tinggi→P rendah', ox+gW*0.42, oy-16);
}

function _visViscosity(ctx, W, H) {
  var yTop=35, yBot=183, mid=(yTop+yBot)/2;
  ctx.strokeStyle='#e53935'; ctx.lineWidth=3;
  ctx.beginPath(); ctx.moveTo(20,yTop); ctx.lineTo(240,yTop); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(20,yBot); ctx.lineTo(240,yBot); ctx.stroke();
  ctx.fillStyle='rgba(229,57,53,0.07)'; ctx.fillRect(20,yTop,220,yBot-yTop);

  var n=11;
  for (var i=0; i<n; i++) {
    var y = yTop+8 + i*((yBot-yTop-16)/(n-1));
    var dist = Math.abs(y-mid)/(mid-yTop);
    var len  = Math.round(85*(1-dist*dist));
    var alpha = 0.35 + 0.65*(1-dist);
    _visArrow(ctx, 28, y, 28+len, y, 'rgba(229,57,53,'+alpha.toFixed(2)+')', 1.6);
  }

  ctx.fillStyle='rgba(255,255,255,0.4)'; ctx.font='9px monospace'; ctx.textAlign='center';
  ctx.fillText('dinding — v = 0', W/2, yTop-8);
  ctx.fillText('dinding — v = 0', W/2, yBot+14);
  ctx.fillStyle='rgba(229,57,53,0.85)'; ctx.font='bold 9px monospace';
  ctx.fillText('pusat — v maksimum', W/2+30, mid+4);
}
