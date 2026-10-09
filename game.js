'use strict';

const COLS = 10;
const ROWS = 20;
const BLOCK = 30;

const COLORS = [
  null,
  '#4dd0e1', // I - cyan
  '#ffd54f', // O - yellow
  '#ba68c8', // T - purple
  '#81c784', // S - green
  '#e57373', // Z - red
  '#90caf9', // J - pale blue
  '#ffb74d', // L - orange
];

const PIECES = [
  null,
  [[0,0,0,0],[1,1,1,1],[0,0,0,0],[0,0,0,0]], // I
  [[2,2],[2,2]],                               // O
  [[0,3,0],[3,3,3],[0,0,0]],                  // T
  [[0,4,4],[4,4,0],[0,0,0]],                  // S
  [[5,5,0],[0,5,5],[0,0,0]],                  // Z
  [[6,0,0],[6,6,6],[0,0,0]],                  // J
  [[0,0,7],[7,7,7],[0,0,0]],                  // L
];

const LINE_SCORES = [0, 100, 300, 500, 800];

const canvas = document.getElementById('board');
const ctx = canvas.getContext('2d');
const nextCanvas = document.getElementById('next-canvas');
const nextCtx = nextCanvas.getContext('2d');
const holdCanvas = document.getElementById('hold-canvas');
const holdCtx = holdCanvas.getContext('2d');
const holdSection = document.getElementById('hold-section');
const scoreEl = document.getElementById('score');
const linesEl = document.getElementById('lines');
const levelEl = document.getElementById('level');
const overlay = document.getElementById('overlay');
const overlayTitle = document.getElementById('overlay-title');
const overlayScore = document.getElementById('overlay-score');
const restartBtn = document.getElementById('restart-btn');
const themeToggle = document.getElementById('theme-toggle');
const startScreen = document.getElementById('start-screen');
const startBtn = document.getElementById('start-btn');
const gameoverExtra = document.getElementById('gameover-extra');
const newRecordMsg = document.getElementById('new-record-msg');
const nameEntry = document.getElementById('name-entry');
const nameInput = document.getElementById('name-input');
const saveNameBtn = document.getElementById('save-name-btn');

const RECORDS_KEY = 'tetris-records';
const MAX_RECORDS = 5;
const NAME_MAX = 12;

let gridColor = '#22222e';
let board, current, next, score, lines, level, paused, gameOver, lastTime, dropAccum, dropInterval, animId;
let hold, canHold;
let combo = 0, maxComboThisGame = 0;
let records = loadRecords();
let pendingEntry = null; // { rank, score, lines, level } mientras se escribe el nombre

function createBoard() {
  return Array.from({ length: ROWS }, () => new Array(COLS).fill(0));
}

function randomPiece() {
  return createPiece(Math.floor(Math.random() * 7) + 1);
}

function createPiece(type) {
  const shape = PIECES[type].map(row => [...row]);
  return { type, shape, x: Math.floor(COLS / 2) - Math.floor(shape[0].length / 2), y: 0 };
}

function collide(shape, ox, oy) {
  for (let r = 0; r < shape.length; r++) {
    for (let c = 0; c < shape[r].length; c++) {
      if (!shape[r][c]) continue;
      const nx = ox + c;
      const ny = oy + r;
      if (nx < 0 || nx >= COLS || ny >= ROWS) return true;
      if (ny >= 0 && board[ny][nx]) return true;
    }
  }
  return false;
}

function rotateCW(shape) {
  const rows = shape.length, cols = shape[0].length;
  const result = Array.from({ length: cols }, () => new Array(rows).fill(0));
  for (let r = 0; r < rows; r++)
    for (let c = 0; c < cols; c++)
      result[c][rows - 1 - r] = shape[r][c];
  return result;
}

function tryRotate() {
  const rotated = rotateCW(current.shape);
  const kicks = [0, -1, 1, -2, 2];
  for (const kick of kicks) {
    if (!collide(rotated, current.x + kick, current.y)) {
      current.shape = rotated;
      current.x += kick;
      return;
    }
  }
}

function merge() {
  for (let r = 0; r < current.shape.length; r++)
    for (let c = 0; c < current.shape[r].length; c++)
      if (current.shape[r][c])
        board[current.y + r][current.x + c] = current.shape[r][c];
}

function clearLines() {
  let cleared = 0;
  for (let r = ROWS - 1; r >= 0; r--) {
    if (board[r].every(v => v !== 0)) {
      board.splice(r, 1);
      board.unshift(new Array(COLS).fill(0));
      cleared++;
      r++;
    }
  }
  if (cleared) {
    lines += cleared;
    score += (LINE_SCORES[cleared] || 0) * level;
    level = Math.floor(lines / 10) + 1;
    dropInterval = Math.max(100, 1000 - (level - 1) * 90);
    updateHUD();
  }
  return cleared;
}

function ghostY() {
  let gy = current.y;
  while (!collide(current.shape, current.x, gy + 1)) gy++;
  return gy;
}

function hardDrop() {
  const gy = ghostY();
  score += (gy - current.y) * 2;
  current.y = gy;
  lockPiece();
}

function softDrop() {
  if (!collide(current.shape, current.x, current.y + 1)) {
    current.y++;
    score += 1;
    updateHUD();
  } else {
    lockPiece();
  }
}

function lockPiece() {
  merge();
  if (clearLines()) {
    combo++;
    if (combo > maxComboThisGame) maxComboThisGame = combo;
  } else {
    combo = 0;
  }
  spawn();
}

function spawn() {
  current = next;
  next = randomPiece();
  canHold = true;
  if (collide(current.shape, current.x, current.y)) {
    endGame();
  }
  drawNext();
  drawHold();
}

function holdPiece() {
  if (!canHold) return;
  if (hold === null) {
    hold = current.type;
    spawn();
  } else {
    const type = hold;
    hold = current.type;
    current = createPiece(type);
    if (collide(current.shape, current.x, current.y)) endGame();
  }
  canHold = false;
  dropAccum = 0;
  drawHold();
}

function updateHUD() {
  scoreEl.textContent = score.toLocaleString();
  linesEl.textContent = lines;
  levelEl.textContent = level;
}

function drawBlock(context, x, y, colorIndex, size, alpha) {
  if (!colorIndex) return;
  const color = COLORS[colorIndex];
  context.globalAlpha = alpha ?? 1;
  context.fillStyle = color;
  context.fillRect(x * size + 1, y * size + 1, size - 2, size - 2);
  // highlight
  context.fillStyle = 'rgba(255,255,255,0.12)';
  context.fillRect(x * size + 1, y * size + 1, size - 2, 4);
  context.globalAlpha = 1;
}

function drawGrid() {
  ctx.strokeStyle = gridColor;
  ctx.lineWidth = 0.5;
  for (let c = 1; c < COLS; c++) {
    ctx.beginPath();
    ctx.moveTo(c * BLOCK, 0);
    ctx.lineTo(c * BLOCK, ROWS * BLOCK);
    ctx.stroke();
  }
  for (let r = 1; r < ROWS; r++) {
    ctx.beginPath();
    ctx.moveTo(0, r * BLOCK);
    ctx.lineTo(COLS * BLOCK, r * BLOCK);
    ctx.stroke();
  }
}

function draw() {
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  drawGrid();

  // board
  for (let r = 0; r < ROWS; r++)
    for (let c = 0; c < COLS; c++)
      drawBlock(ctx, c, r, board[r][c], BLOCK);

  // ghost
  const gy = ghostY();
  for (let r = 0; r < current.shape.length; r++)
    for (let c = 0; c < current.shape[r].length; c++)
      if (current.shape[r][c])
        drawBlock(ctx, current.x + c, gy + r, current.shape[r][c], BLOCK, 0.2);

  // current piece
  for (let r = 0; r < current.shape.length; r++)
    for (let c = 0; c < current.shape[r].length; c++)
      drawBlock(ctx, current.x + c, current.y + r, current.shape[r][c], BLOCK);
}

function drawPreview(context, cnv, shape, alpha) {
  const NB = 30;
  context.clearRect(0, 0, cnv.width, cnv.height);
  if (!shape) return;
  const offX = Math.floor((4 - shape[0].length) / 2);
  const offY = Math.floor((4 - shape.length) / 2);
  for (let r = 0; r < shape.length; r++)
    for (let c = 0; c < shape[r].length; c++)
      drawBlock(context, offX + c, offY + r, shape[r][c], NB, alpha);
}

function drawNext() {
  drawPreview(nextCtx, nextCanvas, next.shape);
}

function drawHold() {
  drawPreview(holdCtx, holdCanvas, hold ? PIECES[hold] : null, canHold ? 1 : 0.3);
  holdSection.classList.toggle('hold-locked', !canHold);
}

function endGame() {
  if (gameOver) return;
  gameOver = true;
  cancelAnimationFrame(animId);
  finishRecords();
  overlayTitle.textContent = 'GAME OVER';
  overlayScore.textContent = `Puntuación: ${score.toLocaleString()}`;
  overlay.classList.remove('hidden');
}

function togglePause() {
  if (gameOver) return;
  paused = !paused;
  if (!paused) {
    lastTime = performance.now();
    loop(lastTime);
  } else {
    cancelAnimationFrame(animId);
    overlayTitle.textContent = 'PAUSA';
    overlayScore.textContent = '';
    overlay.classList.remove('hidden');
  }
}

function loop(ts) {
  const dt = ts - lastTime;
  lastTime = ts;
  dropAccum += dt;
  if (dropAccum >= dropInterval) {
    dropAccum = 0;
    if (!collide(current.shape, current.x, current.y + 1)) {
      current.y++;
    } else {
      lockPiece();
    }
  }
  draw();
  if (gameOver) return;
  animId = requestAnimationFrame(loop);
}

function init() {
  commitPendingEntry(); // si se reinicia sin guardar el nombre, se guarda como Anónimo
  gameoverExtra.classList.add('hidden');
  startScreen.classList.add('hidden');
  combo = 0;
  maxComboThisGame = 0;
  board = createBoard();
  score = 0;
  lines = 0;
  level = 1;
  paused = false;
  gameOver = false;
  dropInterval = 1000;
  dropAccum = 0;
  hold = null;
  canHold = true;
  lastTime = performance.now();
  next = randomPiece();
  spawn();
  updateHUD();
  overlay.classList.add('hidden');
  cancelAnimationFrame(animId);
  animId = requestAnimationFrame(loop);
}

document.addEventListener('keydown', e => {
  // Pantalla de inicio: solo Enter (sin botón enfocado) arranca la partida
  if (!startScreen.classList.contains('hidden')) {
    if (e.code === 'Enter' && e.target.tagName !== 'BUTTON') { e.preventDefault(); init(); }
    return;
  }
  // Escribiendo el nombre: no mover piezas ni pausar
  if (e.target === nameInput) return;
  if (e.code === 'KeyP') { togglePause(); return; }
  if (paused || gameOver) return;
  switch (e.code) {
    case 'ArrowLeft':
      if (!collide(current.shape, current.x - 1, current.y)) current.x--;
      break;
    case 'ArrowRight':
      if (!collide(current.shape, current.x + 1, current.y)) current.x++;
      break;
    case 'ArrowDown':
      softDrop();
      break;
    case 'ArrowUp':
    case 'KeyX':
      tryRotate();
      break;
    case 'Space':
      e.preventDefault();
      hardDrop();
      break;
    case 'KeyC':
    case 'ShiftLeft':
    case 'ShiftRight':
      holdPiece();
      break;
  }
  updateHUD();
});

restartBtn.addEventListener('click', init);

function applyTheme(theme) {
  const isLight = theme === 'light';
  if (isLight) document.documentElement.dataset.theme = 'light';
  else delete document.documentElement.dataset.theme;
  try { localStorage.setItem('tetris-theme', isLight ? 'light' : 'dark'); } catch (e) {}
  themeToggle.textContent = isLight ? '🌙 Modo oscuro' : '☀️ Modo claro';
  themeToggle.setAttribute('aria-pressed', String(isLight));
  gridColor = getComputedStyle(document.documentElement).getPropertyValue('--grid').trim() || gridColor;
  // En pausa o Game Over el rAF no corre: redibujar a mano
  if (current && next) { draw(); drawNext(); drawHold(); }
}

themeToggle.addEventListener('click', () => {
  applyTheme(document.documentElement.dataset.theme === 'light' ? 'dark' : 'light');
  themeToggle.blur();
});

let savedTheme = 'dark';
try { savedTheme = localStorage.getItem('tetris-theme') === 'light' ? 'light' : 'dark'; } catch (e) {}
applyTheme(savedTheme);

/* ---- Récords ---- */
function emptyRecords() {
  return { top: [], bestCombo: 0, maxLines: 0 };
}

function cleanCount(v) {
  return Number.isFinite(v) && v > 0 ? Math.floor(v) : 0;
}

function loadRecords() {
  const rec = emptyRecords();
  try {
    const data = JSON.parse(localStorage.getItem(RECORDS_KEY));
    if (!data || typeof data !== 'object') return rec;
    if (Array.isArray(data.top)) {
      rec.top = data.top
        .filter(t => t && typeof t === 'object' && Number.isFinite(t.score) && t.score > 0)
        .map(t => ({
          name: String(t.name == null ? '' : t.name).slice(0, NAME_MAX) || 'Anónimo',
          score: cleanCount(t.score),
          lines: cleanCount(t.lines),
          level: cleanCount(t.level),
          date: typeof t.date === 'string' ? t.date : '',
        }))
        .sort((a, b) => b.score - a.score)
        .slice(0, MAX_RECORDS);
    }
    rec.bestCombo = cleanCount(data.bestCombo);
    rec.maxLines = cleanCount(data.maxLines);
  } catch (e) {}
  return rec;
}

function saveRecords() {
  try { localStorage.setItem(RECORDS_KEY, JSON.stringify(records)); } catch (e) {}
}

// Posición que ocuparía la puntuación en el top, o -1 si no entra
function recordRank(sc) {
  if (sc <= 0) return -1;
  let i = records.top.findIndex(t => sc > t.score);
  if (i === -1) i = records.top.length;
  return i < MAX_RECORDS ? i : -1;
}

function renderRecords(listEl, highlight, preview) {
  let rows = records.top.map(t => ({ name: t.name, score: t.score }));
  if (preview) rows.splice(preview.rank, 0, { name: '???', score: preview.score });
  rows = rows.slice(0, MAX_RECORDS);
  listEl.textContent = '';
  if (!rows.length) {
    const li = document.createElement('li');
    li.className = 'rec-empty';
    li.textContent = 'Sin récords todavía';
    listEl.appendChild(li);
    return;
  }
  rows.forEach((row, i) => {
    const li = document.createElement('li');
    if (i === highlight) li.className = 'rec-highlight';
    for (const [cls, text] of [['rec-pos', `${i + 1}.`], ['rec-name', row.name], ['rec-score', row.score.toLocaleString()]]) {
      const span = document.createElement('span');
      span.className = cls;
      span.textContent = text;
      li.appendChild(span);
    }
    listEl.appendChild(li);
  });
}

function renderStartRecords() {
  renderRecords(document.getElementById('start-records'), -1);
  document.getElementById('start-best-combo').textContent = records.bestCombo;
  document.getElementById('start-max-lines').textContent = records.maxLines;
}

function renderOverRecords(highlight, preview) {
  renderRecords(document.getElementById('over-records'), highlight, preview);
  document.getElementById('over-best-combo').textContent = records.bestCombo;
  document.getElementById('over-max-lines').textContent = records.maxLines;
}

// Al terminar la partida: actualiza combo/líneas máximas y prepara la entrada de nombre
function finishRecords() {
  records = loadRecords(); // evita pisar récords de otra pestaña
  if (maxComboThisGame > records.bestCombo) records.bestCombo = maxComboThisGame;
  if (lines > records.maxLines) records.maxLines = lines;
  saveRecords();
  const rank = recordRank(score);
  gameoverExtra.classList.remove('hidden');
  if (rank >= 0) {
    pendingEntry = { rank, score, lines, level };
    newRecordMsg.classList.remove('hidden');
    nameEntry.classList.remove('hidden');
    nameInput.value = '';
    renderOverRecords(rank, pendingEntry);
    setTimeout(() => nameInput.focus(), 0);
  } else {
    pendingEntry = null;
    newRecordMsg.classList.add('hidden');
    nameEntry.classList.add('hidden');
    renderOverRecords(-1);
  }
}

// Inserta la entrada pendiente en el top (nombre vacío = Anónimo)
function commitPendingEntry() {
  if (!pendingEntry) return -1;
  const entry = pendingEntry;
  pendingEntry = null;
  records = loadRecords();
  const name = nameInput.value.trim().slice(0, NAME_MAX) || 'Anónimo';
  const rank = recordRank(entry.score);
  if (rank < 0) return -1;
  records.top.splice(rank, 0, { name, score: entry.score, lines: entry.lines, level: entry.level, date: new Date().toISOString() });
  records.top = records.top.slice(0, MAX_RECORDS);
  saveRecords();
  return rank;
}

function saveName() {
  if (!pendingEntry) return;
  const rank = commitPendingEntry();
  newRecordMsg.classList.add('hidden');
  nameEntry.classList.add('hidden');
  nameInput.blur();
  renderOverRecords(rank);
}

saveNameBtn.addEventListener('click', saveName);
nameInput.addEventListener('keydown', e => {
  if (e.key === 'Enter') { e.preventDefault(); saveName(); }
});

// Reseteo con confirmación en el DOM (sin alert/confirm del navegador)
function setupReset(prefix, onDone) {
  const btn = document.getElementById(prefix + '-reset-btn');
  const box = document.getElementById(prefix + '-reset-confirm');
  const toggle = asking => {
    box.classList.toggle('hidden', !asking);
    btn.classList.toggle('hidden', asking);
  };
  btn.addEventListener('click', () => toggle(true));
  document.getElementById(prefix + '-reset-no').addEventListener('click', () => toggle(false));
  document.getElementById(prefix + '-reset-yes').addEventListener('click', () => {
    records = emptyRecords();
    saveRecords();
    toggle(false);
    onDone();
  });
}

setupReset('start', renderStartRecords);
setupReset('over', () => {
  // Con una entrada pendiente y el top vacío, queda en el puesto 1
  if (pendingEntry) {
    pendingEntry.rank = 0;
    renderOverRecords(0, pendingEntry);
  } else {
    renderOverRecords(-1);
  }
});

startBtn.addEventListener('click', init);
renderStartRecords();
