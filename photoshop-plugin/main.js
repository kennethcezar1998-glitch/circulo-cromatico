/*
 * Círculo Cromático — painel UXP para Photoshop.
 *
 * Funciona em dois modos:
 *  - Dentro do Photoshop: a cor do círculo vira a cor de primeiro plano, a cor
 *    secundária vira a cor de plano de fundo, e mudanças feitas no Photoshop
 *    (conta-gotas, seletor de cores, X, D) voltam para o círculo.
 *  - Num navegador comum: tudo funciona igual, só sem a ligação com o Photoshop
 *    (útil para testar a interface).
 */
'use strict';

/* ════════════════════════════════════════════════════════════════
 *  PONTE COM O PHOTOSHOP
 * ════════════════════════════════════════════════════════════════ */
let ps = null;
try { ps = require('photoshop'); } catch (e) { ps = null; }
const IN_PS = !!(ps && ps.app && ps.core);

/* ════════════════════════════════════════════════════════════════
 *  CONVERSORES DE COR
 * ════════════════════════════════════════════════════════════════ */
function rybToHsv(rybAngle) {
  let r = ((rybAngle % 360) + 360) % 360;
  const stops = [[0, 0], [60, 30], [120, 60], [180, 120], [240, 240], [300, 300], [360, 360]];
  for (let i = 0; i < stops.length - 1; i++) {
    if (r >= stops[i][0] && r <= stops[i + 1][0]) {
      let t = (r - stops[i][0]) / (stops[i + 1][0] - stops[i][0]);
      return stops[i][1] + t * (stops[i + 1][1] - stops[i][1]);
    }
  }
  return 0;
}

function hsvToRyb(hsvAngle) {
  let h = ((hsvAngle % 360) + 360) % 360;
  const stops = [[0, 0], [30, 60], [60, 120], [120, 180], [240, 240], [300, 300], [360, 360]];
  for (let i = 0; i < stops.length - 1; i++) {
    if (h >= stops[i][0] && h <= stops[i + 1][0]) {
      let t = (h - stops[i][0]) / (stops[i + 1][0] - stops[i][0]);
      return stops[i][1] + t * (stops[i + 1][1] - stops[i][1]);
    }
  }
  return 0;
}

function hsv2rgb(h, s, v) {
  let f = (n, k = (n + h / 60) % 6) => v - v * s * Math.max(Math.min(k, 4 - k, 1), 0);
  return [Math.round(f(5) * 255), Math.round(f(3) * 255), Math.round(f(1) * 255)];
}

function rgb2hsv(r, g, b) {
  r /= 255; g /= 255; b /= 255;
  let max = Math.max(r, g, b), min = Math.min(r, g, b);
  let d = max - min;
  let h = 0, s = max === 0 ? 0 : d / max, v = max;
  if (max !== min) {
    switch (max) {
      case r: h = (g - b) / d + (g < b ? 6 : 0); break;
      case g: h = (b - r) / d + 2; break;
      case b: h = (r - g) / d + 4; break;
    }
    h /= 6;
  }
  return { h: h * 360, s: s, v: v };
}

function rgb2hex(r, g, b) {
  return '#' + (1 << 24 | r << 16 | g << 8 | b).toString(16).slice(1).toUpperCase();
}

function rgb2cmyk(r, g, b) {
  let c = 1 - (r / 255), m = 1 - (g / 255), y = 1 - (b / 255);
  let k = Math.min(c, m, y);
  if (k === 1) return [0, 0, 0, 100];
  return [
    Math.round(((c - k) / (1 - k)) * 100),
    Math.round(((m - k) / (1 - k)) * 100),
    Math.round(((y - k) / (1 - k)) * 100),
    Math.round(k * 100)
  ];
}

function cmyk2rgb(c, m, y, k) {
  c /= 100; m /= 100; y /= 100; k /= 100;
  return [
    Math.round(255 * (1 - c) * (1 - k)),
    Math.round(255 * (1 - m) * (1 - k)),
    Math.round(255 * (1 - y) * (1 - k))
  ];
}

function rgb2lab(r, g, b) {
  let r_l = r / 255, g_l = g / 255, b_l = b / 255;
  r_l = (r_l > 0.04045) ? Math.pow((r_l + 0.055) / 1.055, 2.4) : r_l / 12.92;
  g_l = (g_l > 0.04045) ? Math.pow((g_l + 0.055) / 1.055, 2.4) : g_l / 12.92;
  b_l = (b_l > 0.04045) ? Math.pow((b_l + 0.055) / 1.055, 2.4) : b_l / 12.92;

  let x = (r_l * 0.4124 + g_l * 0.3576 + b_l * 0.1805) * 100;
  let y = (r_l * 0.2126 + g_l * 0.7152 + b_l * 0.0722) * 100;
  let z = (r_l * 0.0193 + g_l * 0.1192 + b_l * 0.9505) * 100;

  x /= 95.047; y /= 100.000; z /= 108.883;

  x = (x > 0.008856) ? Math.pow(x, 1 / 3) : (7.787 * x) + (16 / 116);
  y = (y > 0.008856) ? Math.pow(y, 1 / 3) : (7.787 * y) + (16 / 116);
  z = (z > 0.008856) ? Math.pow(z, 1 / 3) : (7.787 * z) + (16 / 116);

  let L = (116 * y) - 16;
  let A = 500 * (x - y);
  let B = 200 * (y - z);
  return [Math.max(0, Math.min(100, L)), Math.max(-128, Math.min(127, A)), Math.max(-128, Math.min(127, B))];
}

function lab2rgb(l, a, b) {
  let y = (l + 16) / 116;
  let x = a / 500 + y;
  let z = y - b / 200;

  x = 95.047 * ((Math.pow(x, 3) > 0.008856) ? Math.pow(x, 3) : (x - 16 / 116) / 7.787);
  y = 100.000 * ((Math.pow(y, 3) > 0.008856) ? Math.pow(y, 3) : (y - 16 / 116) / 7.787);
  z = 108.883 * ((Math.pow(z, 3) > 0.008856) ? Math.pow(z, 3) : (z - 16 / 116) / 7.787);

  x /= 100; y /= 100; z /= 100;

  let r = x * 3.2406 + y * -1.5372 + z * -0.4986;
  let g = x * -0.9689 + y * 1.8758 + z * 0.0415;
  let b_ = x * 0.0557 + y * -0.2040 + z * 1.0570;

  r = (r > 0.0031308) ? (1.055 * Math.pow(r, 1 / 2.4) - 0.055) : 12.92 * r;
  g = (g > 0.0031308) ? (1.055 * Math.pow(g, 1 / 2.4) - 0.055) : 12.92 * g;
  b_ = (b_ > 0.0031308) ? (1.055 * Math.pow(b_, 1 / 2.4) - 0.055) : 12.92 * b_;

  return [
    Math.max(0, Math.min(255, Math.round(r * 255))),
    Math.max(0, Math.min(255, Math.round(g * 255))),
    Math.max(0, Math.min(255, Math.round(b_ * 255)))
  ];
}

/* ════════════════════════════════════════════════════════════════
 *  ESTADO
 * ════════════════════════════════════════════════════════════════ */
let state = {
  hue: 0,
  sat: 1.0,
  val: 1.0,
  rule: 'none',
  colorMode: 'RYB',
  sliderMode: 'HSV',
  activePaletteTab: 'monochromatic',
  isDraggingRing: false,
  isDraggingTri: false,
  lumaLock: false,
  isCompact: false
};

// A cor principal é sempre a cor do círculo (state). A secundária fica guardada aqui.
let secondaryColor = { hue: 0, sat: 0, val: 1, mode: 'RYB' };

const SLIDER_CONFIGS = {
  'RGB': [{ id: 'r', lbl: 'R', max: 255 }, { id: 'g', lbl: 'G', max: 255 }, { id: 'b', lbl: 'B', max: 255 }],
  'HSV': [{ id: 'h', lbl: 'H', max: 359 }, { id: 's', lbl: 'S', max: 100 }, { id: 'v', lbl: 'V', max: 100 }],
  'LAB': [{ id: 'l', lbl: 'L', max: 100 }, { id: 'a', lbl: 'A', min: -128, max: 127 }, { id: 'b_lab', lbl: 'B', min: -128, max: 127 }],
  'CMYK': [{ id: 'c', lbl: 'C', max: 100 }, { id: 'm', lbl: 'M', max: 100 }, { id: 'y', lbl: 'Y', max: 100 }, { id: 'k', lbl: 'K', max: 100 }],
  'B/W': [{ id: 'bw', lbl: 'K', max: 100 }]
};

const $ = (id) => document.getElementById(id);

/* ════════════════════════════════════════════════════════════════
 *  DIAGNÓSTICO
 *  Clique no título do painel para mostrar uma barra com contadores do que
 *  o plugin está fazendo. A barra só é atualizada quando algum contador
 *  muda, para ela mesma não provocar redesenhos.
 * ════════════════════════════════════════════════════════════════ */
const diag = {
  draws: 0,        // redesenhos do círculo (drawWheel)
  pushes: 0,       // envios de cor ao Photoshop (executeAsModal)
  reads: 0,        // leituras das cores do Photoshop
  external: 0,     // mudanças vindas do Photoshop aplicadas ao círculo
  resizes: 0,      // vezes que o círculo foi redimensionado
  syncOn: true,    // ligação com o Photoshop (pode ser desligada na barra)
  visible: false
};
let diagTimer = null;
function diagCount(key) {
  diag[key]++;
  if (diag.visible && !diagTimer) diagTimer = setTimeout(renderDiag, 300);
}
function renderDiag() {
  diagTimer = null;
  const bar = $('diagBar');
  if (!bar || !diag.visible) return;
  const text = `desenhos ${diag.draws} · envios ${diag.pushes} · leituras ${diag.reads} · externas ${diag.external} · redimens. ${diag.resizes}`;
  if ($('diagText').textContent !== text) $('diagText').textContent = text;
  const sync = diag.syncOn ? 'PS: ligado (clique p/ desligar)' : 'PS: DESLIGADO (clique p/ ligar)';
  if ($('diagSync').textContent !== sync) $('diagSync').textContent = sync;
}
const clamp = (n, min, max) => Math.max(min, Math.min(max, n));
const nextFrame = (typeof requestAnimationFrame === 'function')
  ? (fn) => requestAnimationFrame(fn)
  : (fn) => setTimeout(fn, 16);

/* Registra o mesmo handler para eventos de ponteiro e de mouse.
 * Os handlers são idempotentes, então receber os dois não causa problema,
 * e garante funcionamento em versões do UXP que só tenham um dos tipos. */
function onPointer(target, kind, handler) {
  target.addEventListener('pointer' + kind, handler);
  target.addEventListener('mouse' + kind, handler);
}

/* ════════════════════════════════════════════════════════════════
 *  SLIDERS (desenhados à mão — o <input type=range> do UXP não aceita estilo)
 * ════════════════════════════════════════════════════════════════ */
let sliderValues = {};
let sliderDrag = null;

function currentSliderCfg(id) {
  return SLIDER_CONFIGS[state.sliderMode].find(c => c.id === id);
}

function setSliderValue(id, v) {
  const cfg = currentSliderCfg(id);
  if (!cfg) return;
  const min = cfg.min || 0;
  v = clamp(v, min, cfg.max);
  sliderValues[id] = v;
  const thumb = $('th_' + id);
  if (thumb) setStyle(thumb, 'left', ((v - min) / (cfg.max - min) * 100).toFixed(2) + '%');
}

function sliderValueFromPointer(cfg, track, clientX) {
  const rect = track.getBoundingClientRect();
  const t = rect.width > 0 ? clamp((clientX - rect.left) / rect.width, 0, 1) : 0;
  const min = cfg.min || 0;
  return Math.round(min + t * (cfg.max - min));
}

function buildSliders() {
  const container = $('slidersContainer');
  if (!container) return;
  const config = SLIDER_CONFIGS[state.sliderMode];
  sliderValues = {};

  container.innerHTML = config.map(cfg => `
    <div class="slider-row">
      <span class="slider-label">${cfg.lbl}</span>
      <div class="slider-track" id="tr_${cfg.id}">
        <div class="slider-bg" id="bg_${cfg.id}"></div>
        <div class="slider-thumb" id="th_${cfg.id}"></div>
      </div>
      <input class="slider-val" id="val_${cfg.id}" type="text" value="0" title="Clique para digitar um valor">
    </div>`).join('');

  config.forEach(cfg => {
    const track = $('tr_' + cfg.id);
    onPointer(track, 'down', (e) => {
      if (e.button !== undefined && e.button !== 0) return;
      sliderDrag = { cfg, track };
      setSliderValue(cfg.id, sliderValueFromPointer(cfg, track, e.clientX));
      handleSliderChange();
    });
    bindEditable($('val_' + cfg.id), (text) => {
      const n = parseNumbers(text);
      if (n.length !== 1) return false;
      setSliderValue(cfg.id, n[0]);
      handleSliderChange();
    });
  });
}

function handleSliderChange() {
  const v = (id) => Number(sliderValues[id] || 0);
  let mode = state.sliderMode;
  if (mode === 'RGB') {
    applyRgbToState([v('r'), v('g'), v('b')]);
  } else if (mode === 'HSV') {
    state.hue = v('h');
    state.sat = v('s') / 100;
    state.val = v('v') / 100;
  } else if (mode === 'LAB') {
    applyRgbToState(lab2rgb(v('l'), v('a'), v('b_lab')));
  } else if (mode === 'CMYK') {
    applyRgbToState(cmyk2rgb(v('c'), v('m'), v('y'), v('k')));
  } else if (mode === 'B/W') {
    state.sat = 0; state.val = 1 - (v('bw') / 100);
  }
  scheduleUpdate();
}

/* ════════════════════════════════════════════════════════════════
 *  CANVAS
 * ════════════════════════════════════════════════════════════════ */
const canvas = $('colorCanvas');
const ctx = canvas.getContext('2d');
let wheelCssSize = 300;   // tamanho do círculo na tela (px CSS)
let canvasScale = 1;      // px do canvas por px CSS

function getLayout() {
  let w = canvas.width;
  return {
    W: w, H: w, CX: w / 2, CY: w / 2,
    R_OUTER: w * (140 / 300),
    R_INNER: w * (108 / 300),
    k: canvasScale
  };
}

function getRenderHue(angle) {
  return state.colorMode === 'RYB' ? rybToHsv(angle) : angle;
}

function getTriangleVerts(angle) {
  let layout = getLayout();
  let rad = (angle - 90) * Math.PI / 180;
  let r = layout.R_INNER - 6 * layout.k;
  const third = 120 * Math.PI / 180;
  return [
    { x: layout.CX + r * Math.cos(rad), y: layout.CY + r * Math.sin(rad) },
    { x: layout.CX + r * Math.cos(rad + third), y: layout.CY + r * Math.sin(rad + third) },
    { x: layout.CX + r * Math.cos(rad - third), y: layout.CY + r * Math.sin(rad - third) }
  ];
}

function getHarmonyAngles(baseHue, rule) {
  switch (rule) {
    case 'complementary': return [baseHue, (baseHue + 180) % 360];
    case 'analogous': return [(baseHue - 30 + 360) % 360, baseHue, (baseHue + 30) % 360];
    case 'split': return [baseHue, (baseHue + 150) % 360, (baseHue + 210) % 360];
    case 'triadic': return [baseHue, (baseHue + 120) % 360, (baseHue + 240) % 360];
    case 'tetradic': return [baseHue, (baseHue + 90) % 360, (baseHue + 180) % 360, (baseHue + 270) % 360];
    default: return [baseHue];
  }
}

const rgbCss = (c) => `rgb(${c[0]},${c[1]},${c[2]})`;

/*
 * O canvas do Photoshop (UXP) é bem mais limitado que o do navegador:
 *  - não tem transparência: pixels apagados com clearRect aparecem pretos e
 *    cores com alfa (rgba) são pintadas como opacas;
 *  - não tem save/restore, clip nem setLineDash;
 *  - cada comando aparece na tela assim que é executado, então um redesenho
 *    com muitas formas "pisca" e mostra o círculo pela metade.
 * Por isso tudo aqui usa só cores opacas, o fundo é pintado com a cor do
 * painel, e o círculo inteiro é desenhado com poucas formas (antes eram
 * ~190 a cada movimento do mouse; agora são ~85).
 */
const PANEL_BG = '#222222';
const HARMONY_LINE = '#c8c8c8';
const RING_SEGMENTS = 36;   // fatias de 10° do anel, cada uma com degradê (sem emendas)
const TRI_STRIPS = 40;      // faixas do triângulo (cada uma com degradê opaco)

function polarPoint(L, radius, angleDeg) {
  const r = (angleDeg - 90) * Math.PI / 180;
  return { x: L.CX + radius * Math.cos(r), y: L.CY + radius * Math.sin(r) };
}

function drawRing(L) {
  const step = 360 / RING_SEGMENTS;
  const overlap = 0.75; // graus a mais em cada ponta para não sobrar fresta
  const rMid = (L.R_OUTER + L.R_INNER) / 2;
  for (let i = 0; i < RING_SEGMENTS; i++) {
    const a0 = i * step, a1 = a0 + step;
    const p0 = polarPoint(L, rMid, a0), p1 = polarPoint(L, rMid, a1);
    const grad = ctx.createLinearGradient(p0.x, p0.y, p1.x, p1.y);
    grad.addColorStop(0, rgbCss(hsv2rgb(getRenderHue(a0), 1, 1)));
    grad.addColorStop(1, rgbCss(hsv2rgb(getRenderHue(a1), 1, 1)));
    const r0 = (a0 - overlap - 90) * Math.PI / 180;
    const r1 = (a1 + overlap - 90) * Math.PI / 180;
    ctx.beginPath();
    ctx.arc(L.CX, L.CY, L.R_OUTER, r0, r1);
    ctx.arc(L.CX, L.CY, L.R_INNER, r1, r0, true);
    ctx.closePath();
    ctx.fillStyle = grad;
    ctx.fill();
  }
}

// Ponto do triângulo para um valor (v) e saturação (s): mesma conta do cursor
function triPoint(verts, v, s) {
  const w0 = s * v, w1 = (1 - s) * v, w2 = 1 - v;
  return {
    x: w0 * verts[0].x + w1 * verts[1].x + w2 * verts[2].x,
    y: w0 * verts[0].y + w1 * verts[1].y + w2 * verts[2].y
  };
}

/*
 * Triângulo sem transparência: em cada faixa de valor (v) a cor vai, em linha
 * reta no RGB, do cinza v·branco até v·matiz. Cada faixa é um degradê opaco.
 */
function drawTriangle(verts, hueRgb) {
  const pad = 0.006; // sobreposição entre faixas
  for (let i = 0; i < TRI_STRIPS; i++) {
    const va = Math.max(0, i / TRI_STRIPS - pad);
    const vb = Math.min(1, (i + 1) / TRI_STRIPS + pad);
    const vm = (i + 0.5) / TRI_STRIPS;
    const g0 = triPoint(verts, vm, 0), g1 = triPoint(verts, vm, 1);
    const grad = ctx.createLinearGradient(g0.x, g0.y, g1.x, g1.y);
    const gray = Math.round(vm * 255);
    grad.addColorStop(0, `rgb(${gray},${gray},${gray})`);
    grad.addColorStop(1, rgbCss(hueRgb.map(c => Math.round(c * vm))));

    const A = triPoint(verts, va, 0), B = triPoint(verts, va, 1);
    const C = triPoint(verts, vb, 1), D = triPoint(verts, vb, 0);
    ctx.beginPath();
    ctx.moveTo(A.x, A.y);
    ctx.lineTo(B.x, B.y);
    ctx.lineTo(C.x, C.y);
    ctx.lineTo(D.x, D.y);
    ctx.closePath();
    ctx.fillStyle = grad;
    ctx.fill();
  }
}

// Linha tracejada feita à mão (o canvas do UXP não tem setLineDash)
function dashedPolyline(points, closed, dash, gap) {
  const pts = closed ? points.concat([points[0]]) : points;
  ctx.beginPath();
  for (let i = 0; i < pts.length - 1; i++) {
    const a = pts[i], b = pts[i + 1];
    const len = Math.sqrt((b.x - a.x) ** 2 + (b.y - a.y) ** 2);
    if (len === 0) continue;
    const ux = (b.x - a.x) / len, uy = (b.y - a.y) / len;
    for (let d = 0; d < len; d += dash + gap) {
      const e = Math.min(d + dash, len);
      ctx.moveTo(a.x + ux * d, a.y + uy * d);
      ctx.lineTo(a.x + ux * e, a.y + uy * e);
    }
  }
  ctx.stroke();
}

// Desenha o círculo inteiro (cerca de 85 formas, todas opacas)
function drawWheel() {
  diagCount('draws');
  const L = getLayout();
  const verts = getTriangleVerts(state.hue);
  const angles = getHarmonyAngles(state.hue, state.rule);
  const ringCenter = (L.R_OUTER + L.R_INNER) / 2;

  // Fundo com a cor do painel (no UXP, clearRect deixaria tudo preto)
  ctx.fillStyle = PANEL_BG;
  ctx.fillRect(0, 0, L.W, L.H);

  drawRing(L);
  drawTriangle(verts, hsv2rgb(getRenderHue(state.hue), 1, 1));

  // Linhas e marcadores da harmonia
  if (angles.length > 1 && state.rule !== 'mono') {
    ctx.strokeStyle = HARMONY_LINE;
    ctx.lineWidth = 1.5 * L.k;
    dashedPolyline(angles.map(a => polarPoint(L, ringCenter, a)),
      ['triadic', 'tetradic', 'split'].includes(state.rule), 4 * L.k, 4 * L.k);
  }
  angles.forEach((ang) => {
    const p = polarPoint(L, ringCenter, ang);
    ctx.beginPath();
    ctx.arc(p.x, p.y, (ang === state.hue ? 10 : 7) * L.k, 0, Math.PI * 2);
    ctx.fillStyle = rgbCss(hsv2rgb(getRenderHue(ang), 1, 1));
    ctx.fill();
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 2 * L.k;
    ctx.stroke();
  });

  // Cursor dentro do triângulo
  const cur = triPoint(verts, state.val, state.sat);
  ctx.beginPath();
  ctx.arc(cur.x, cur.y, 6 * L.k, 0, Math.PI * 2);
  ctx.fillStyle = rgbCss(hsv2rgb(getRenderHue(state.hue), state.sat, state.val));
  ctx.fill();
  ctx.strokeStyle = '#ffffff';
  ctx.lineWidth = 2.5 * L.k;
  ctx.stroke();
}

/* ── Tamanho do círculo e posição dos botões em arco ── */
function layoutWheel() {
  const section = $('wheelSection');
  const wrapper = $('wheelWrapper');
  const width = section.clientWidth || 300;
  const maxSize = state.isCompact ? 460 : 340;
  // Os botões em arco ficam a 0,55 × tamanho do centro, e têm até 28 px
  let size = Math.floor((width - 16 - 28) / 1.1);
  size = Math.max(150, Math.min(maxSize, size));

  wheelCssSize = size;
  wrapper.style.width = size + 'px';
  wrapper.style.height = size + 'px';
  canvas.style.width = size + 'px';
  canvas.style.height = size + 'px';

  // No Photoshop usamos 1:1 (o canvas do UXP é mais limitado com escala)
  const dpr = IN_PS ? 1 : (window.devicePixelRatio || 1);
  const px = Math.round(size * dpr);
  if (canvas.width !== px) { canvas.width = px; canvas.height = px; }
  // No UXP width/height podem ser só leitura: usa o tamanho real do canvas
  canvasScale = canvas.width / size;

  const pad = Math.ceil(size * 0.05 + 18);
  section.style.paddingTop = pad + 'px';
  // Espaço extra embaixo para o quadrado de cores não cobrir o anel
  section.style.paddingBottom = Math.max(pad, 58) + 'px';

  const R = size * 0.55;
  document.querySelectorAll('.arc-btn, .mode-toggle-btn').forEach(el => {
    const a = Number(el.getAttribute('data-ang')) * Math.PI / 180;
    const w = el.classList.contains('mode-toggle-btn') ? 28 : 24;
    el.style.left = (size / 2 + Math.sin(a) * R - w / 2) + 'px';
    el.style.top = (size / 2 - Math.cos(a) * R - w / 2) + 'px';
  });
}

/* ════════════════════════════════════════════════════════════════
 *  ÍCONES EM SVG (substituem os conic-gradient da versão web)
 * ════════════════════════════════════════════════════════════════ */
function polar(cx, cy, r, deg) {
  const a = deg * Math.PI / 180;
  return (cx + r * Math.sin(a)).toFixed(2) + ',' + (cy - r * Math.cos(a)).toFixed(2);
}

function wedgePath(cx, cy, r, from, to) {
  const large = (to - from) > 180 ? 1 : 0;
  return `M${cx},${cy} L${polar(cx, cy, r, from)} A${r},${r} 0 ${large} 1 ${polar(cx, cy, r, to)} Z`;
}

// Fatias escuras de 30° em cada ícone de harmonia (mesmos ângulos da versão web)
const HARMONY_WEDGES = {
  none: [],
  mono: [-15],
  analogous: [-45, 15],
  complementary: [-15, 165],
  split: [-15, 120, 180],
  triadic: [-15, 105, 225],
  tetradic: [-15, 75, 165, 255]
};

function harmonyIconSvg(rule) {
  const wedges = (HARMONY_WEDGES[rule] || [])
    .map(a => `<path d="${wedgePath(10, 10, 10, a, a + 30)}" fill="#444444"/>`).join('');
  return `<svg viewBox="0 0 20 20" width="20" height="20"><circle cx="10" cy="10" r="10" fill="#909090"/>${wedges}</svg>`;
}

function modeIconSvg(mode) {
  const colors = mode === 'RYB' ? ['#0000ff', '#ffff00', '#ff0000'] : ['#0000ff', '#00ff00', '#ff0000'];
  const parts = colors.map((c, i) => `<path d="${wedgePath(12, 12, 12, i * 120, (i + 1) * 120)}" fill="${c}"/>`).join('');
  return `<svg viewBox="0 0 24 24" width="24" height="24">${parts}<circle cx="12" cy="12" r="7" fill="#222222"/></svg>`;
}

function sunIconSvg() {
  let rays = '';
  for (let i = 0; i < 8; i++) {
    const p = polar(12, 12, 7, i * 45).split(',');
    rays += `<circle cx="${p[0]}" cy="${p[1]}" r="2.5" fill="#dddddd"/>`;
  }
  return `<svg viewBox="0 0 24 24" width="24" height="24"><circle cx="12" cy="12" r="12" fill="#909090"/>${rays}<circle cx="12" cy="12" r="4" fill="#dddddd"/></svg>`;
}

const COMPACT_ICON_EXPAND = '<path d="M15 3h6v6M9 21H3v-6M21 3l-7 7M3 21l7-7"/>';
const COMPACT_ICON_SHRINK = '<path d="M4 14h6v6M20 10h-6V4M14 10l7-7M10 14l-7 7"/>';
function compactIconSvg(compact) {
  return `<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="#1a1a1a" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">${compact ? COMPACT_ICON_SHRINK : COMPACT_ICON_EXPAND}</svg>`;
}

/* ════════════════════════════════════════════════════════════════
 *  PALETAS
 * ════════════════════════════════════════════════════════════════ */
/*
 * Os elementos das paletas são criados uma única vez e depois só recoloridos.
 * Recriar elementos a cada movimento do mouse obriga o UXP a refazer o layout
 * do painel inteiro, o que deixa a rolagem e o arraste travados.
 */
function setStyle(el, prop, value) {
  if (!el) return;
  if (!el._styleCache) el._styleCache = {};
  if (el._styleCache[prop] === value) return;
  el._styleCache[prop] = value;
  el.style[prop] = value;
}

function setHtml(el, html) {
  if (el && el._html !== html) { el._html = html; el.innerHTML = html; }
}

function setSwatchColor(el, hex) {
  if (el._hex === hex) return;
  el._hex = hex;
  el.style.backgroundColor = hex;
  el.title = hex;
}

function swatchPool(container, className, count) {
  if (!container._pool) container._pool = [];
  const pool = container._pool;
  while (pool.length < count) {
    const el = document.createElement('div');
    el.className = className;
    el.addEventListener('click', (e) => swatchClick(e, el._hex));
    container.appendChild(el);
    pool.push(el);
  }
  pool.forEach((el, i) => setStyle(el, 'display', i < count ? 'block' : 'none'));
  return pool;
}

function generate9ColorPalette() {
  const container = $('palette9Grid');
  if (!container) return;

  let h = state.hue, s = state.sat, v = state.val;
  let colors = [];

  switch (state.activePaletteTab) {
    case 'monochromatic':
      colors = [
        { h: h, s: 1, v: 1 }, { h: h, s: 0.8, v: 0.9 }, { h: h, s: 0.6, v: 0.9 },
        { h: h, s: 0.4, v: 0.9 }, { h: h, s: 0.2, v: 1 }, { h: h, s: s, v: v },
        { h: h, s: 1, v: 0.6 }, { h: h, s: 0.8, v: 0.4 }, { h: h, s: 0.6, v: 0.2 }
      ];
      break;
    case 'shades':
      for (let i = 1; i <= 9; i++) colors.push({ h: h, s: s, v: 1 - (i * 0.1) });
      break;
    case 'compound':
      colors = [
        { h: h, s: s, v: v }, { h: (h + 30) % 360, s: s * 0.8, v: v }, { h: (h - 30 + 360) % 360, s: s * 0.8, v: v },
        { h: (h + 150) % 360, s: s, v: v }, { h: (h + 180) % 360, s: s, v: v }, { h: (h + 210) % 360, s: s, v: v },
        { h: h, s: s * 0.5, v: Math.max(0, v - 0.3) }, { h: (h + 150) % 360, s: s * 0.5, v: Math.max(0, v - 0.3) }, { h: (h + 180) % 360, s: s * 0.5, v: Math.max(0, v - 0.3) }
      ];
      break;
    case 'square':
      colors = [
        { h: h, s: s, v: v }, { h: h, s: s * 0.5, v: Math.max(0, v - 0.3) }, { h: h, s: 1, v: Math.min(1, v + 0.3) },
        { h: (h + 90) % 360, s: s, v: v }, { h: (h + 90) % 360, s: s * 0.5, v: Math.max(0, v - 0.3) },
        { h: (h + 180) % 360, s: s, v: v }, { h: (h + 180) % 360, s: s * 0.5, v: Math.max(0, v - 0.3) },
        { h: (h + 270) % 360, s: s, v: v }, { h: (h + 270) % 360, s: s * 0.5, v: Math.max(0, v - 0.3) }
      ];
      break;
    case 'triad':
      colors = [
        { h: h, s: s, v: v }, { h: h, s: s * 0.6, v: Math.max(0, v - 0.2) }, { h: h, s: 1, v: Math.min(1, v + 0.2) },
        { h: (h + 120) % 360, s: s, v: v }, { h: (h + 120) % 360, s: s * 0.6, v: Math.max(0, v - 0.2) }, { h: (h + 120) % 360, s: 1, v: Math.min(1, v + 0.2) },
        { h: (h + 240) % 360, s: s, v: v }, { h: (h + 240) % 360, s: s * 0.6, v: Math.max(0, v - 0.2) }, { h: (h + 240) % 360, s: 1, v: Math.min(1, v + 0.2) }
      ];
      break;
    case 'split':
      colors = [
        { h: h, s: s, v: v }, { h: h, s: s * 0.5, v: Math.max(0, v - 0.4) }, { h: h, s: s * 0.8, v: Math.min(1, v + 0.2) },
        { h: (h + 150) % 360, s: s, v: v }, { h: (h + 150) % 360, s: s * 0.5, v: Math.max(0, v - 0.4) }, { h: (h + 150) % 360, s: s * 0.8, v: Math.min(1, v + 0.2) },
        { h: (h + 210) % 360, s: s, v: v }, { h: (h + 210) % 360, s: s * 0.5, v: Math.max(0, v - 0.4) }, { h: (h + 210) % 360, s: s * 0.8, v: Math.min(1, v + 0.2) }
      ];
      break;
    case 'complementary':
      colors = [
        { h: h, s: 1, v: 1 }, { h: h, s: s, v: v }, { h: h, s: s * 0.7, v: Math.max(0, v - 0.2) }, { h: h, s: s * 0.4, v: Math.max(0, v - 0.4) }, { h: h, s: s * 0.2, v: Math.max(0, v - 0.6) },
        { h: (h + 180) % 360, s: 1, v: 1 }, { h: (h + 180) % 360, s: s, v: v }, { h: (h + 180) % 360, s: s * 0.7, v: Math.max(0, v - 0.2) }, { h: (h + 180) % 360, s: s * 0.4, v: Math.max(0, v - 0.4) }
      ];
      break;
    case 'analogous':
      colors = [
        { h: (h - 60 + 360) % 360, s: s, v: v }, { h: (h - 45 + 360) % 360, s: s, v: v }, { h: (h - 30 + 360) % 360, s: s, v: v },
        { h: (h - 15 + 360) % 360, s: s, v: v }, { h: h, s: s, v: v }, { h: (h + 15) % 360, s: s, v: v },
        { h: (h + 30) % 360, s: s, v: v }, { h: (h + 45) % 360, s: s, v: v }, { h: (h + 60) % 360, s: s, v: v }
      ];
      break;
  }

  const pool = swatchPool(container, 'p9-swatch', colors.length);
  colors.forEach((c, i) => setSwatchColor(pool[i], rgb2hex(...hsv2rgb(getRenderHue(c.h), c.s, c.v))));
}

function shiftHueTowards(currentHue, targetHue, weight) {
  let diff = (targetHue - currentHue + 360) % 360;
  if (diff > 180) diff -= 360;
  return (currentHue + (diff * weight) + 360) % 360;
}

// Cria uma vez as 5 caixas de Luz e Sombra (amostra, rótulo e campo HEX)
let lsItems = null;
function buildLightShadowItems(container) {
  lsItems = ['Brilho', 'Luz', 'Base', 'Sombra', 'Oclusão'].map(label => {
    const item = { currentHex: null };

    const wrapper = document.createElement('div');
    wrapper.className = 'ls-swatch-container';

    const swatch = document.createElement('div');
    swatch.className = 'ls-swatch';
    swatch.addEventListener('click', (e) => swatchClick(e, item.currentHex));

    const lbl = document.createElement('div');
    lbl.className = 'ls-label';
    lbl.textContent = label;

    const hexInput = document.createElement('input');
    hexInput.type = 'text';
    hexInput.className = 'ls-hex';
    hexInput.title = 'Clique para editar este hexadecimal';

    item.show = (hex) => {
      item.currentHex = hex;
      setSwatchColor(swatch, hex);
      if (!hexInput._editing && hexInput.value !== hex) hexInput.value = hex;
    };
    // Edição manual: ajusta só esta caixa (a cor do círculo não muda)
    bindEditable(hexInput, (text) => {
      const newHex = parseHex(text);
      if (!newHex) return false;
      item.show(newHex);
    }, () => { hexInput.value = item.currentHex; });

    wrapper.appendChild(swatch);
    wrapper.appendChild(lbl);
    wrapper.appendChild(hexInput);
    container.appendChild(wrapper);
    return item;
  });
}

function generateLightShadowPalette() {
  const container = $('lsPalette');
  if (!container) return;
  if (!lsItems) buildLightShadowItems(container);
  let h = state.hue, s = state.sat, v = state.val;

  const TARGET_SHADOW = 240, TARGET_LIGHT = 60, TARGET_COMPLEMENTARY = (h + 180) % 360;
  let palette = [
    { label: 'Brilho', h: shiftHueTowards(h, TARGET_LIGHT, 0.3), s: Math.max(0, s * 0.3), v: Math.min(1, v + 0.4) },
    { label: 'Luz', h: shiftHueTowards(h, TARGET_LIGHT, 0.15), s: Math.max(0, s * 0.7), v: Math.min(1, v + 0.2) },
    { label: 'Base', h: h, s: s, v: v },
    { label: 'Sombra', h: shiftHueTowards(h, TARGET_SHADOW, 0.2), s: Math.min(1, s + 0.3), v: Math.max(0.1, v - 0.35) },
    { label: 'Oclusão', h: shiftHueTowards(h, TARGET_COMPLEMENTARY, 0.4), s: Math.max(0, s * 0.5), v: Math.max(0.05, v - 0.65) }
  ];

  palette.forEach((item, i) => lsItems[i].show(rgb2hex(...hsv2rgb(getRenderHue(item.h), item.s, item.v))));

  const insightBox = $('theoryInsight');
  if (insightBox) {
    if (h >= 15 && h <= 45) {
      setHtml(insightBox, '<strong>Insight Corkit (Pág. 56):</strong> O Marrom e o Laranja compartilham a <em>mesma Matiz e Saturação</em>! A única diferença real está no Valor/Tom (Marrom é apenas laranja escuro).');
    } else if (h >= 210 && h <= 270) {
      setHtml(insightBox, '<strong>Insight Corkit (Pág. 87):</strong> A matiz Azul em saturação extrema é <em>intrinsecamente muito escura</em> (próxima ao preto). Adicionar azul na área de oclusão mantém o peso tonal de forma estética!');
    } else if (h >= 46 && h <= 80) {
      setHtml(insightBox, '<strong>Insight Corkit (Pág. 87):</strong> A matiz Amarela em saturação máxima é <em>intrinsecamente muito clara</em> (quase branca). Leve isso em consideração ao calcular degradês para não quebrar o tom.');
    } else {
      setHtml(insightBox, '<strong>Insight Corkit (Pág. 44):</strong> Toda cor é um \'liquidificador\' de 4 propriedades fundamentais: <em>Valor, Matiz, Saturação e Mancha</em>. Mude de tom ou matiz em vez de apenas escurecer para manter sua arte \'viva\'!');
    }
  }
}

/* ════════════════════════════════════════════════════════════════
 *  ATUALIZAÇÃO DA INTERFACE
 * ════════════════════════════════════════════════════════════════ */
function setBg(id, css) {
  setStyle($(id), 'background', css);
}

function updateSlidersUI() {
  let hsv = getRenderHue(state.hue);
  let rgb = hsv2rgb(hsv, state.sat, state.val);
  let cmyk = rgb2cmyk(...rgb);
  let lab = rgb2lab(...rgb);
  let mode = state.sliderMode;
  const hx = (c) => rgb2hex(...c);

  if (mode === 'RGB') {
    ['r', 'g', 'b'].forEach((id, i) => { setSliderValue(id, rgb[i]); setFieldText('val_' + id, String(rgb[i])); });
    setBg('bg_r', `linear-gradient(to right, rgb(0,${rgb[1]},${rgb[2]}), rgb(255,${rgb[1]},${rgb[2]}))`);
    setBg('bg_g', `linear-gradient(to right, rgb(${rgb[0]},0,${rgb[2]}), rgb(${rgb[0]},255,${rgb[2]}))`);
    setBg('bg_b', `linear-gradient(to right, rgb(${rgb[0]},${rgb[1]},0), rgb(${rgb[0]},${rgb[1]},255))`);
  } else if (mode === 'HSV') {
    setSliderValue('h', state.hue); setFieldText('val_h', Math.round(state.hue) + '°');
    setSliderValue('s', state.sat * 100); setFieldText('val_s', Math.round(state.sat * 100) + '%');
    setSliderValue('v', state.val * 100); setFieldText('val_v', Math.round(state.val * 100) + '%');
    let hBg = []; for (let i = 0; i <= 360; i += 30) hBg.push(hx(hsv2rgb(getRenderHue(i), 1, 1)));
    setBg('bg_h', `linear-gradient(to right, ${hBg.join(',')})`);
    setBg('bg_s', `linear-gradient(to right, ${hx(hsv2rgb(hsv, 0, state.val))}, ${hx(hsv2rgb(hsv, 1, state.val))})`);
    setBg('bg_v', `linear-gradient(to right, #000000, ${hx(hsv2rgb(hsv, state.sat, 1))})`);
  } else if (mode === 'LAB') {
    setSliderValue('l', lab[0]); setFieldText('val_l', String(Math.round(lab[0])));
    setSliderValue('a', lab[1]); setFieldText('val_a', String(Math.round(lab[1])));
    setSliderValue('b_lab', lab[2]); setFieldText('val_b_lab', String(Math.round(lab[2])));
    let bgL = [], bgA = [], bgB = [];
    for (let i = 0; i <= 10; i++) {
      bgL.push(hx(lab2rgb(i * 10, lab[1], lab[2])));
      bgA.push(hx(lab2rgb(lab[0], -128 + (i * 25.5), lab[2])));
      bgB.push(hx(lab2rgb(lab[0], lab[1], -128 + (i * 25.5))));
    }
    setBg('bg_l', `linear-gradient(to right, ${bgL.join(',')})`);
    setBg('bg_a', `linear-gradient(to right, ${bgA.join(',')})`);
    setBg('bg_b_lab', `linear-gradient(to right, ${bgB.join(',')})`);
  } else if (mode === 'CMYK') {
    ['c', 'm', 'y', 'k'].forEach((id, i) => { setSliderValue(id, cmyk[i]); setFieldText('val_' + id, cmyk[i] + '%'); });
    setBg('bg_c', `linear-gradient(to right, ${hx(cmyk2rgb(0, cmyk[1], cmyk[2], cmyk[3]))}, ${hx(cmyk2rgb(100, cmyk[1], cmyk[2], cmyk[3]))})`);
    setBg('bg_m', `linear-gradient(to right, ${hx(cmyk2rgb(cmyk[0], 0, cmyk[2], cmyk[3]))}, ${hx(cmyk2rgb(cmyk[0], 100, cmyk[2], cmyk[3]))})`);
    setBg('bg_y', `linear-gradient(to right, ${hx(cmyk2rgb(cmyk[0], cmyk[1], 0, cmyk[3]))}, ${hx(cmyk2rgb(cmyk[0], cmyk[1], 100, cmyk[3]))})`);
    setBg('bg_k', `linear-gradient(to right, ${hx(cmyk2rgb(cmyk[0], cmyk[1], cmyk[2], 0))}, ${hx(cmyk2rgb(cmyk[0], cmyk[1], cmyk[2], 100))})`);
  } else if (mode === 'B/W') {
    let bw = Math.round((1 - state.val) * 100);
    setSliderValue('bw', bw); setFieldText('val_bw', bw + '%');
    setBg('bg_bw', 'linear-gradient(to right, #ffffff, #000000)');
  }

  setFieldText('valHex', rgb2hex(...rgb));
  setFieldText('valRgb', `${rgb[0]},${rgb[1]},${rgb[2]}`);
  setFieldText('valHsv', `${Math.round(state.hue)}°,${Math.round(state.sat * 100)}%,${Math.round(state.val * 100)}%`);
  setFieldText('valCmyk', `${cmyk[0]},${cmyk[1]},${cmyk[2]},${cmyk[3]}`);
}

function updateUIButtons() {
  const toggleBtn = $('btnModeToggle');
  if (toggleBtn._mode === state.colorMode) return; // nada mudou
  toggleBtn._mode = state.colorMode;
  const title = $('uiModeTitle');
  toggleBtn.innerHTML = modeIconSvg(state.colorMode);
  if (state.colorMode === 'RYB') {
    toggleBtn.title = 'Modo Atual: RYB Clássico (Clique para RGB)';
    title.textContent = 'RYB Color Wheel Pro';
  } else {
    toggleBtn.title = 'Modo Atual: RGB Luz (Clique para RYB)';
    title.textContent = 'RGB Color Wheel Pro';
  }
}

function currentHex() {
  return rgb2hex(...hsv2rgb(getRenderHue(state.hue), state.sat, state.val));
}

function updateAll(opts) {
  opts = opts || {};
  drawWheel();
  updateUIButtons();

  const hex = currentHex();
  setStyle($('mainSwatch'), 'backgroundColor', hex);

  updateSlidersUI();

  let harmHexes;
  if (state.rule === 'mono') {
    let sVals = [Math.max(0, state.sat - 0.4), state.sat, Math.min(1, state.sat + 0.4)];
    let vVals = [Math.max(0.2, state.val - 0.3), state.val, Math.min(1, state.val + 0.3)];
    harmHexes = sVals.map((s, i) => rgb2hex(...hsv2rgb(getRenderHue(state.hue), s, vVals[i])));
  } else {
    let angles = getHarmonyAngles(state.hue, state.rule);
    harmHexes = angles
      .filter(ang => !(ang === state.hue && angles.length > 1))
      .map(ang => rgb2hex(...hsv2rgb(getRenderHue(ang), state.sat, state.val)));
  }
  const harmPool = swatchPool($('harmonyContainer'), 'harm-sw', harmHexes.length);
  harmHexes.forEach((h, i) => setSwatchColor(harmPool[i], h));

  const bgHex = storedColorToHex(secondaryColor);
  updateFgBgUI(hex, bgHex);

  generate9ColorPalette();
  generateLightShadowPalette();

  if (!opts.noPush) syncToPhotoshop(hex, bgHex);
  lastWheelFg = hex;
  lastWheelBg = bgHex;
}

// Agrupa várias mudanças seguidas (ex.: arrastar) num único redesenho.
// No Photoshop limita a ~30 quadros por segundo: o painel não acompanha mais que isso.
const MIN_FRAME_MS = IN_PS ? 33 : 0;
let updateQueued = false;
let lastUpdateAt = 0;
function scheduleUpdate() {
  if (updateQueued) return;
  updateQueued = true;
  const wait = Math.max(0, MIN_FRAME_MS - (Date.now() - lastUpdateAt));
  const run = () => { updateQueued = false; lastUpdateAt = Date.now(); updateAll(); };
  // No Photoshop usa só setTimeout: o requestAnimationFrame do UXP não é garantido
  if (IN_PS) setTimeout(run, wait);
  else if (wait > 0) setTimeout(() => nextFrame(run), wait);
  else nextFrame(run);
}

/* ════════════════════════════════════════════════════════════════
 *  INTERAÇÃO COM O CÍRCULO
 * ════════════════════════════════════════════════════════════════ */
function getCanvasPos(e) {
  const rect = canvas.getBoundingClientRect();
  const sx = rect.width > 0 ? canvas.width / rect.width : 1;
  const sy = rect.height > 0 ? canvas.height / rect.height : 1;
  return { x: (e.clientX - rect.left) * sx, y: (e.clientY - rect.top) * sy };
}

function handleWheelInput(e) {
  if (!state.isDraggingRing && !state.isDraggingTri) return;
  let pos = getCanvasPos(e);
  let L = getLayout();
  if (state.isDraggingRing) {
    let angle = Math.atan2(pos.y - L.CY, pos.x - L.CX) * 180 / Math.PI + 90;
    state.hue = (angle + 360) % 360;
  } else {
    let v = getTriangleVerts(state.hue);
    let denom = (v[1].y - v[2].y) * (v[0].x - v[2].x) + (v[2].x - v[1].x) * (v[0].y - v[2].y);
    let w0 = ((v[1].y - v[2].y) * (pos.x - v[2].x) + (v[2].x - v[1].x) * (pos.y - v[2].y)) / denom;
    let w1 = ((v[2].y - v[0].y) * (pos.x - v[2].x) + (v[0].x - v[2].x) * (pos.y - v[2].y)) / denom;
    let w2 = 1 - w0 - w1;

    w0 = clamp(w0, 0, 1); w1 = clamp(w1, 0, 1); w2 = clamp(w2, 0, 1);
    let sum = w0 + w1 + w2; w0 /= sum; w1 /= sum;

    let val = w0 + w1;
    let sat = val > 0 ? w0 / val : 0;
    if (!state.lumaLock) state.val = val;
    state.sat = sat;
  }
  scheduleUpdate();
}

onPointer(canvas, 'down', (e) => {
  if (e.button !== undefined && e.button !== 0) return;
  let pos = getCanvasPos(e);
  let L = getLayout();
  let dist = Math.sqrt((pos.x - L.CX) ** 2 + (pos.y - L.CY) ** 2);
  if (dist >= L.R_INNER && dist <= L.R_OUTER) state.isDraggingRing = true;
  else if (dist < L.R_INNER) state.isDraggingTri = true;
  if (e.preventDefault) e.preventDefault();
  handleWheelInput(e);
});

function endDrags() {
  const wasDragging = isInteracting();
  state.isDraggingRing = false;
  state.isDraggingTri = false;
  sliderDrag = null;
  if (wasDragging) schedulePushFlush(); // manda a cor final sem esperar
}

onPointer(document, 'move', (e) => {
  // Se o botão foi solto fora do painel, encerra o arraste
  if (e.buttons === 0 && (state.isDraggingRing || state.isDraggingTri || sliderDrag)) { endDrags(); return; }
  if (sliderDrag) {
    setSliderValue(sliderDrag.cfg.id, sliderValueFromPointer(sliderDrag.cfg, sliderDrag.track, e.clientX));
    handleSliderChange();
    return;
  }
  handleWheelInput(e);
});
onPointer(document, 'up', endDrags);

const isInteracting = () => state.isDraggingRing || state.isDraggingTri || !!sliderDrag;

/* ── Botões ── */
document.querySelectorAll('.arc-btn').forEach(btn => {
  btn.innerHTML = harmonyIconSvg(btn.getAttribute('data-rule'));
  btn.addEventListener('click', () => {
    document.querySelectorAll('.arc-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    state.rule = btn.getAttribute('data-rule');
    updateAll();
  });
});

$('btnModeToggle').addEventListener('click', () => {
  state.colorMode = state.colorMode === 'RYB' ? 'RGB' : 'RYB';
  updateAll();
});

const lumaBtn = $('btnLuma');
lumaBtn.innerHTML = sunIconSvg();
lumaBtn.addEventListener('click', () => {
  state.lumaLock = !state.lumaLock;
  if (state.lumaLock) lumaBtn.classList.add('active'); else lumaBtn.classList.remove('active');
});

const compactBtn = $('btnCompact');
compactBtn.innerHTML = compactIconSvg(false);
compactBtn.addEventListener('click', () => {
  state.isCompact = !state.isCompact;
  const container = $('appContainer');
  if (state.isCompact) container.classList.add('is-compact'); else container.classList.remove('is-compact');
  compactBtn.innerHTML = compactIconSvg(state.isCompact);
  compactBtn.title = state.isCompact ? 'Mostrar tudo' : 'Modo compacto';
  layoutWheel();
  updateAll({ noPush: true });
});

document.querySelectorAll('.slider-mode-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.slider-mode-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    state.sliderMode = btn.getAttribute('data-mode');
    buildSliders();
    updateAll({ noPush: true });
  });
});

document.querySelectorAll('.tab-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    if (tabsWasDragged) return;
    document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    state.activePaletteTab = btn.getAttribute('data-tab');
    updateAll({ noPush: true });
  });
});

/* ════════════════════════════════════════════════════════════════
 *  CAMPOS EDITÁVEIS
 * ════════════════════════════════════════════════════════════════ */
// Só escreve no campo se o usuário não estiver editando ele agora
function setFieldText(id, text) {
  const el = $(id);
  if (el && !el._editing && el.value !== text) el.value = text;
}

function parseNumbers(text) {
  return (text.match(/-?\d+(\.\d+)?/g) || []).map(Number);
}

function parseHex(text) {
  let t = text.trim().replace(/^#/, '');
  if (/^[0-9a-fA-F]{3}$/.test(t)) t = t.split('').map(ch => ch + ch).join('');
  if (!/^[0-9a-fA-F]{6}$/.test(t)) return null;
  return '#' + t.toUpperCase();
}

function hexToRgb(hex) {
  let n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

// Converte RGB para o estado do círculo. Em cinzas/preto, mantém matiz (e
// saturação, no preto) atuais, para o triângulo não "pular" para o vermelho.
function applyRgbToState(rgb) {
  let hsv = rgb2hsv(...rgb);
  if (hsv.s > 0) {
    state.hue = state.colorMode === 'RYB' ? hsvToRyb(hsv.h) : hsv.h;
  }
  if (hsv.v > 0) state.sat = hsv.s;
  state.val = hsv.v;
}

/**
 * Liga um <input type="text">:
 * Enter confirma · Esc cancela · clicar fora confirma.
 * commit(texto) deve retornar false se o valor for inválido.
 */
function bindEditable(el, commit, revert) {
  if (!el || el._editBound) return;
  el._editBound = true;
  revert = revert || (() => updateAll({ noPush: true }));
  let original = '';
  let cancel = false;

  const finish = () => {
    if (!el._editing) return;
    el._editing = false;
    const text = String(el.value || '').trim();
    if (cancel) { cancel = false; revert(el); return; }
    if (text === original.trim()) return;
    if (commit(text) === false) {
      showToast('Valor inválido: ' + text, null);
      revert(el);
    }
  };

  el.addEventListener('focus', () => {
    el._editing = true;
    original = String(el.value || '');
    try { el.select(); } catch (err) { /* nem todo UXP tem select() */ }
  });
  el.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') { e.preventDefault(); finish(); el.blur(); }
    else if (e.key === 'Escape') { e.preventDefault(); cancel = true; finish(); el.blur(); }
  });
  el.addEventListener('blur', finish);
}

bindEditable($('valHex'), (text) => {
  const hex = parseHex(text);
  if (!hex) return false;
  applyRgbToState(hexToRgb(hex)); updateAll();
});
bindEditable($('valRgb'), (text) => {
  const n = parseNumbers(text);
  if (n.length !== 3) return false;
  applyRgbToState(n.map(x => Math.round(clamp(x, 0, 255)))); updateAll();
});
bindEditable($('valHsv'), (text) => {
  const n = parseNumbers(text);
  if (n.length !== 3) return false;
  state.hue = ((n[0] % 360) + 360) % 360;
  state.sat = clamp(n[1], 0, 100) / 100;
  state.val = clamp(n[2], 0, 100) / 100;
  updateAll();
});
bindEditable($('valCmyk'), (text) => {
  const n = parseNumbers(text);
  if (n.length !== 4) return false;
  applyRgbToState(cmyk2rgb(...n.map(x => clamp(x, 0, 100)))); updateAll();
});

// Clicar na caixa (fora do campo) copia o valor
document.querySelectorAll('.val-box').forEach(box => {
  box.addEventListener('click', (e) => {
    if (e.target && e.target.tagName === 'INPUT') return;
    const input = $(box.getAttribute('data-field'));
    copyText(input.value, currentHex());
  });
});

/* ════════════════════════════════════════════════════════════════
 *  ABAS ARRASTÁVEIS + GRADIENTE DE CONTINUIDADE
 * ════════════════════════════════════════════════════════════════ */
let tabsWasDragged = false;
(function setupDraggableTabs() {
  const slider = $('tabsHeader');
  const fadeL = $('fadeLeft'), fadeR = $('fadeRight');
  let isDown = false, startX = 0, startScroll = 0;

  function updateFade() {
    const maxScroll = slider.scrollWidth - slider.clientWidth;
    const cur = slider.scrollLeft;
    if (maxScroll > 0 && cur > 5) fadeL.classList.add('show'); else fadeL.classList.remove('show');
    if (maxScroll > 0 && cur < maxScroll - 5) fadeR.classList.add('show'); else fadeR.classList.remove('show');
  }

  onPointer(slider, 'down', (e) => {
    if (e.button !== undefined && e.button !== 0) return;
    if (!isDown) { startX = e.clientX; startScroll = slider.scrollLeft; tabsWasDragged = false; }
    isDown = true;
    slider.classList.add('dragging');
  });
  onPointer(document, 'move', (e) => {
    if (!isDown) return;
    if (e.buttons === 0) { isDown = false; slider.classList.remove('dragging'); return; }
    const walk = e.clientX - startX;
    if (Math.abs(walk) > 5) tabsWasDragged = true;
    if (tabsWasDragged) { slider.scrollLeft = startScroll - walk; updateFade(); }
  });
  onPointer(document, 'up', () => {
    if (!isDown) return;
    isDown = false;
    slider.classList.remove('dragging');
    // o "click" chega depois do "up": só então liberamos a troca de aba
    setTimeout(() => { tabsWasDragged = false; }, 0);
  });

  slider.addEventListener('scroll', updateFade);
  window.addEventListener('resize', updateFade);
  setTimeout(updateFade, 0);
  window._updateTabsFade = updateFade;
})();

/* ════════════════════════════════════════════════════════════════
 *  ÁREA DE TRANSFERÊNCIA E AVISOS
 * ════════════════════════════════════════════════════════════════ */
let toastTimer = null;
function showToast(text, swatchColor) {
  const toast = $('copyToast');
  $('copyToastText').textContent = text;
  const sw = $('copyToastSwatch');
  sw.style.backgroundColor = swatchColor || 'transparent';
  sw.style.display = swatchColor ? 'block' : 'none';
  toast.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toast.classList.remove('show'), 1400);
}

async function writeClipboard(text) {
  const cb = navigator.clipboard;
  if (!cb) throw new Error('Área de transferência indisponível');
  if (cb.writeText) {
    try { await cb.writeText(text); return; } catch (err) { if (!cb.setContent) throw err; }
  }
  // API própria do UXP
  await cb.setContent({ 'text/plain': text });
}

function copyText(text, swatchColor) {
  writeClipboard(text)
    .then(() => showToast('Copiado: ' + text, swatchColor))
    .catch((err) => { showToast('Erro ao copiar.', null); console.error(err); });
}

function copyHex(hex) { copyText(hex, hex); }

// Clique numa amostra: no Photoshop vira a cor de primeiro plano; Alt+clique copia.
function swatchClick(e, hex) {
  if (e.altKey || !IN_PS) { copyHex(hex); return; }
  pushToPhotoshop({ fg: hex });
  showToast('Primeiro plano: ' + hex, hex);
}

$('mainSwatch').addEventListener('click', () => copyHex(currentHex()));

/* ════════════════════════════════════════════════════════════════
 *  CORES PRINCIPAL / SECUNDÁRIA
 * ════════════════════════════════════════════════════════════════ */
function storedColorToHex(c) {
  let h = c.mode === 'RYB' ? rybToHsv(c.hue) : c.hue;
  return rgb2hex(...hsv2rgb(h, c.sat, c.val));
}

function hueForCurrentMode(c) {
  if (c.mode === state.colorMode) return c.hue;
  return c.mode === 'RYB' ? rybToHsv(c.hue) : hsvToRyb(c.hue);
}

function hexToStoredColor(hex) {
  const hsv = rgb2hsv(...hexToRgb(hex));
  return { hue: hsv.h, sat: hsv.s, val: hsv.v, mode: 'RGB' };
}

function updateFgBgUI(fgHex, bgHex) {
  const fg = $('fgSwatch'), bg = $('bgSwatch');
  if (fg._hex === fgHex && bg._hex === bgHex) return;
  fg._hex = fgHex; bg._hex = bgHex;
  fg.style.backgroundColor = fgHex;
  bg.style.backgroundColor = bgHex;
  fg.title = 'Cor principal ' + fgHex + ' (clique para copiar)';
  bg.title = 'Cor secundária ' + bgHex + ' (clique para trocar com a principal)';
}

function swapFgBg() {
  let current = { hue: state.hue, sat: state.sat, val: state.val, mode: state.colorMode };
  state.hue = hueForCurrentMode(secondaryColor);
  state.sat = secondaryColor.sat;
  state.val = secondaryColor.val;
  secondaryColor = current;
  updateAll();
}

function resetFgBg() {
  state.sat = 0; state.val = 0;
  secondaryColor = { hue: state.hue, sat: 0, val: 1, mode: state.colorMode };
  updateAll();
}

$('fgSwatch').addEventListener('click', () => copyHex(currentHex()));
$('bgSwatch').addEventListener('click', swapFgBg);
$('btnSwapFgBg').addEventListener('click', swapFgBg);
$('btnResetFgBg').addEventListener('click', resetFgBg);

/* ════════════════════════════════════════════════════════════════
 *  SINCRONIA COM O PHOTOSHOP
 *  - círculo → Photoshop: quando a cor do círculo muda, vira a cor de
 *    primeiro plano (e a secundária, a de plano de fundo).
 *  - Photoshop → círculo: a cada 400 ms o painel lê as cores do Photoshop;
 *    se mudaram por fora (conta-gotas, seletor, X, D), o círculo acompanha.
 * ════════════════════════════════════════════════════════════════ */
let lastWheelFg = null, lastWheelBg = null;   // últimas cores mostradas no círculo
let lastReadFg = null, lastReadBg = null;     // últimas cores conhecidas do Photoshop
let pendingPush = null, pushBusy = false;

function solidToHex(c) {
  const rgb = c.rgb;
  return rgb2hex(Math.round(rgb.red), Math.round(rgb.green), Math.round(rgb.blue));
}

function makeSolidColor(hex) {
  const [r, g, b] = hexToRgb(hex);
  const c = new ps.app.SolidColor();
  c.rgb.red = r; c.rgb.green = g; c.rgb.blue = b;
  return c;
}

function readPhotoshopColors() {
  return { fg: solidToHex(ps.app.foregroundColor), bg: solidToHex(ps.app.backgroundColor) };
}

function syncToPhotoshop(fgHex, bgHex) {
  const job = {};
  if (fgHex !== lastWheelFg) job.fg = fgHex;
  if (bgHex !== lastWheelBg) job.bg = bgHex;
  if (job.fg || job.bg) pushToPhotoshop(job);
}

function pushToPhotoshop(job) {
  if (!IN_PS || !diag.syncOn) return;
  pendingPush = Object.assign(pendingPush || {}, job);
  schedulePushFlush();
}

/*
 * Cada envio usa executeAsModal, que bloqueia o Photoshop por um instante.
 * Enviar a cada movimento do mouse deixava o painel piscando; durante o
 * arraste o envio é espaçado, e ao soltar o mouse a cor final vai na hora.
 */
const PUSH_INTERVAL_MS = 150;
let pushTimer = null, lastPushAt = 0;
function schedulePushFlush() {
  if (!pendingPush || pushBusy || pushTimer) return;
  const wait = isInteracting() ? Math.max(0, PUSH_INTERVAL_MS - (Date.now() - lastPushAt)) : 0;
  pushTimer = setTimeout(() => { pushTimer = null; flushPush(); }, wait);
}

// Envia uma alteração por vez; se várias se acumularem, só a mais recente vai.
async function flushPush() {
  if (pushBusy || !pendingPush) return;
  pushBusy = true;
  {
    const job = pendingPush;
    pendingPush = null;
    try {
      diagCount('pushes');
      await ps.core.executeAsModal(async () => {
        if (job.fg) ps.app.foregroundColor = makeSolidColor(job.fg);
        if (job.bg) ps.app.backgroundColor = makeSolidColor(job.bg);
      }, { commandName: 'Círculo Cromático: definir cor' });
      // Guarda o valor como o Photoshop o armazenou (pode variar em docs CMYK)
      const now = readPhotoshopColors();
      lastReadFg = now.fg;
      lastReadBg = now.bg;
      setPsStatus(true);
    } catch (err) {
      console.warn('Não foi possível definir a cor no Photoshop:', err);
      setPsStatus(false, 'O Photoshop está ocupado (há alguma caixa de diálogo aberta?)');
    }
  }
  lastPushAt = Date.now();
  pushBusy = false;
  schedulePushFlush(); // se chegou outra cor enquanto enviava
}

function pullFromPhotoshop() {
  if (!IN_PS || !diag.syncOn || pushBusy || pendingPush || isInteracting()) return;
  if (Date.now() - lastScrollAt < 800) return; // não atrapalha a rolagem
  let now;
  diagCount('reads');
  try { now = readPhotoshopColors(); } catch (err) { return; }
  let changed = false;
  if (now.fg !== lastReadFg) {
    lastReadFg = now.fg;
    if (now.fg !== currentHex()) { applyRgbToState(hexToRgb(now.fg)); changed = true; }
  }
  if (now.bg !== lastReadBg) {
    lastReadBg = now.bg;
    if (now.bg !== storedColorToHex(secondaryColor)) { secondaryColor = hexToStoredColor(now.bg); changed = true; }
  }
  if (changed) { diagCount('external'); updateAll({ noPush: true }); }
}

function setPsStatus(ok, msg) {
  const el = $('psStatus');
  if (!IN_PS) {
    el.className = 'ps-status';
    el.title = 'Modo navegador: sem ligação com o Photoshop';
    return;
  }
  const cls = ok ? 'ps-status on' : 'ps-status';
  const title = ok ? 'Ligado às cores do Photoshop' : (msg || 'Sem ligação com o Photoshop');
  if (el.className !== cls) el.className = cls;
  if (el.title !== title) el.title = title;
}

/* ════════════════════════════════════════════════════════════════
 *  INÍCIO
 * ════════════════════════════════════════════════════════════════ */
let lastSectionWidth = 0;
function checkResize() {
  const w = $('wheelSection').clientWidth;
  if (w && w !== lastSectionWidth) {
    lastSectionWidth = w;
    diagCount('resizes');
    layoutWheel();
    updateAll({ noPush: true });
    if (window._updateTabsFade) window._updateTabsFade();
  }
}
window.addEventListener('resize', checkResize);

buildSliders();
layoutWheel();
lastSectionWidth = $('wheelSection').clientWidth;

if (IN_PS) {
  // Começa com as cores que já estão no Photoshop
  try {
    const now = readPhotoshopColors();
    lastReadFg = now.fg;
    lastReadBg = now.bg;
    applyRgbToState(hexToRgb(now.fg));
    secondaryColor = hexToStoredColor(now.bg);
    setPsStatus(true);
  } catch (err) {
    setPsStatus(false);
  }
} else {
  setPsStatus(false);
}
updateAll({ noPush: true });

$('uiModeTitle').addEventListener('click', () => {
  diag.visible = !diag.visible;
  $('diagBar').style.display = diag.visible ? 'flex' : 'none';
  renderDiag();
});
$('diagSync').addEventListener('click', () => {
  diag.syncOn = !diag.syncOn;
  // Ao religar, a próxima leitura adota as cores atuais do Photoshop
  if (diag.syncOn) { lastReadFg = null; lastReadBg = null; }
  setPsStatus(diag.syncOn, 'Ligação desligada na barra de diagnóstico');
  renderDiag();
});

// Rolagem: anota quando aconteceu, para pausar a leitura das cores do Photoshop
let lastScrollAt = 0;
$('appContainer').addEventListener('scroll', () => { lastScrollAt = Date.now(); });

setInterval(() => {
  if (Date.now() - lastScrollAt < 800) return;
  checkResize();
  pullFromPhotoshop();
}, IN_PS ? 600 : 400);
