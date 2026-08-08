#!/usr/bin/env node
// scripts/simulate-adjacency.mjs
// Simulación fuera del navegador de la generación de tablero + calibración
// de MAX_DIST, sobre muchas semillas y tamaños distintos. No forma parte
// de la app — se corre a mano al tocar la geometría del juego.
//
//   node scripts/simulate-adjacency.cjs
const { readFileSync } = require('node:fs');

// Extrae las funciones puras directamente de index.html, para no
// mantener una copia separada que se desincronice del código real.
const html = readFileSync(require('path').join(__dirname, '..', 'index.html'), 'utf-8');
function extract(name) {
  const m = html.match(new RegExp(`function ${name}\\(.*?\\n\\}\\n`, 's'));
  if (!m) throw new Error(`No se encontró function ${name}() en index.html`);
  return m[0];
}
const ADJACENCY_TARGET = { minDegree: 3, p10Degree: 5, meanMin: 8, meanMax: 11 };
let CIRCLE_R; // las funciones extraídas la referencian como global, igual que en la app real
eval(extract('dist'));
eval(extract('segmentPassesOverCircle'));
eval(extract('chooseAdjacency').replace('function finalizeAdjacency', 'function finalizeAdjacency'));
eval(extract('finalizeAdjacency'));

function placeCircles(W, H, N, CIRCLE_R, MIN_DIST) {
  const padding = CIRCLE_R + 20;
  const circles = [];
  let attempts = 0;
  while (circles.length < N && attempts < 5000) {
    attempts++;
    const x = padding + Math.random() * (W - padding * 2);
    const y = padding + Math.random() * (H - padding * 2);
    if (circles.every(c => dist(x, y, c.x, c.y) >= MIN_DIST)) circles.push({ x, y });
  }
  return circles;
}

function runOne(N) {
  const W = 380, H = 700; // tablero vertical típico de móvil
  CIRCLE_R = Math.max(7, Math.min(16, Math.round(16 - (N - 25) * (9 / 75))));
  const area = W * H;
  const avgDist = Math.sqrt(area / N);
  const MIN_DIST = Math.max(CIRCLE_R * 2 + 6, avgDist * 0.55);

  // Mismo bucle de reintentos que generateCircles() en la app real — sin
  // esto, la simulación mide "¿acierta a la primera?" en vez de "¿qué
  // sale realmente jugando?", que es lo que importa.
  const MAX_BOARD_ATTEMPTS = 20;
  let best = null;
  let totalMs = 0;
  for (let attempt = 0; attempt < MAX_BOARD_ATTEMPTS; attempt++) {
    const circles = placeCircles(W, H, N, CIRCLE_R, MIN_DIST);
    if (circles.length !== N) continue;

    const t0 = performance.now();
    const adjacency = chooseAdjacency(circles);
    totalMs += performance.now() - t0;
    if (!adjacency) continue;

    best = adjacency;
    const m = adjacency.metrics;
    if (m.p10Degree >= ADJACENCY_TARGET.p10Degree &&
        m.meanDegree >= ADJACENCY_TARGET.meanMin &&
        m.meanDegree <= ADJACENCY_TARGET.meanMax) {
      break; // el objetivo "bonito" se alcanzó, no hace falta seguir intentando
    }
  }

  if (!best) return { ok: false, reason: 'ni-el-minimo-en-20-intentos', ms: totalMs };

  const m = best.metrics;
  const problems = [];
  if (m.connectedComponents !== 1) problems.push('desconectado');
  if (m.minDegree < ADJACENCY_TARGET.minDegree) problems.push(`minDegree=${m.minDegree}`);
  if (m.p10Degree < ADJACENCY_TARGET.p10Degree) problems.push(`p10Degree=${m.p10Degree}`);
  // meanDegree por encima del objetivo tras 20 intentos no es un fallo
  // (el respaldo "denso" es intencionado, mejor eso que sin tablero) —
  // solo se marca fallo si ni el mínimo (conectado + grado 3) se alcanzó.

  return { ok: problems.length === 0, reason: problems.join(', '), metrics: m, ms: totalMs };
}

const SAMPLE_SIZES = [25, 35, 50, 65, 80, 100];
const RUNS_PER_SIZE = 250;
let anyFailure = false;

console.log(`Simulando ${RUNS_PER_SIZE} tableros por tamaño (${SAMPLE_SIZES.join(', ')})...\n`);

for (const N of SAMPLE_SIZES) {
  const results = [];
  let failures = 0;
  for (let i = 0; i < RUNS_PER_SIZE; i++) {
    const r = runOne(N);
    results.push(r);
    if (!r.ok) failures++;
  }

  const withMetrics = results.filter(r => r.metrics);
  const avg = (key) => withMetrics.reduce((s, r) => s + r.metrics[key], 0) / withMetrics.length;
  const avgMs = results.filter(r => r.ms != null).reduce((s, r) => s + r.ms, 0) / results.length;

  console.log(`N=${N}: ${RUNS_PER_SIZE - failures}/${RUNS_PER_SIZE} ok` +
    (failures ? `  ⚠️  ${failures} fallo(s)` : '  ✅'));
  console.log(`  minDegree medio=${avg('minDegree').toFixed(1)} ` +
    `p10 medio=${avg('p10Degree').toFixed(1)} ` +
    `meanDegree medio=${avg('meanDegree').toFixed(1)} ` +
    `candidateEdges medio=${Math.round(avg('candidateEdges'))} ` +
    `chooseAdjacency=${avgMs.toFixed(2)}ms`);

  if (failures > 0) {
    anyFailure = true;
    const sample = results.find(r => !r.ok);
    console.log(`  ejemplo de fallo: ${sample.reason}`);
  }
  console.log('');
}

if (anyFailure) {
  console.error('❌ Hay fallos — revisar antes de publicar.');
  process.exit(1);
} else {
  console.log('✅ Todos los tamaños cumplen ADJACENCY_TARGET en las 250 muestras.');
}
