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
  '#64b5f6', // J - azul pálido
  '#ffb74d', // L - orange
  '#ffffff', // comodín (Tinte)
];

const WILDCARD = 8;

// ---- Skins: paleta (mismo layout que COLORS), fondo/rejilla opcionales y función de dibujo ----
const SKIN_KEY = 'tetris.skin';

// rectángulo redondeado: usa roundRect nativo si existe
function roundRectPath(context, x, y, w, h, r) {
  context.beginPath();
  if (context.roundRect) { context.roundRect(x, y, w, h, r); return; }
  context.moveTo(x + r, y);
  context.arcTo(x + w, y, x + w, y + h, r);
  context.arcTo(x + w, y + h, x, y + h, r);
  context.arcTo(x, y + h, x, y, r);
  context.arcTo(x, y, x + w, y, r);
  context.closePath();
}

const SKINS = {
  retro: {
    label: 'Retro',
    colors: COLORS,
    drawBlock(context, px, py, size, color) {
      context.fillStyle = color;
      context.fillRect(px + 1, py + 1, size - 2, size - 2);
      // highlight
      context.fillStyle = 'rgba(255,255,255,0.12)';
      context.fillRect(px + 1, py + 1, size - 2, 4);
    },
  },
  neon: {
    label: 'Neon',
    colors: [null, '#00f0ff', '#fff200', '#d400ff', '#39ff14', '#ff073a', '#2d6bff', '#ff8c00', '#ffffff'],
    bg: '#000000',
    grid: '#101018',
    drawBlock(context, px, py, size, color) {
      context.shadowColor = color;
      context.shadowBlur = size * 0.4;
      context.strokeStyle = color;
      context.lineWidth = 2;
      context.strokeRect(px + 3, py + 3, size - 6, size - 6);
      context.shadowBlur = 0; // que el brillo no se filtre a la rejilla/iconos
      context.fillStyle = color;
      context.globalAlpha *= 0.25;
      context.fillRect(px + 4, py + 4, size - 8, size - 8);
    },
  },
  pastel: {
    label: 'Pastel',
    colors: [null, '#a0e7e5', '#fff1a8', '#d7b8f3', '#b4f8c8', '#ffaebc', '#a7c7e7', '#ffd8a8', '#fdfdfd'],
    drawBlock(context, px, py, size, color) {
      const r = size * 0.25;
      context.fillStyle = color;
      roundRectPath(context, px + 1.5, py + 1.5, size - 3, size - 3, r);
      context.fill();
      context.strokeStyle = 'rgba(0,0,0,0.12)';
      context.lineWidth = 1;
      context.stroke();
      // brillo suave
      context.fillStyle = 'rgba(255,255,255,0.45)';
      roundRectPath(context, px + size * 0.22, py + size * 0.16, size * 0.3, size * 0.14, size * 0.07);
      context.fill();
    },
  },
  pixel: {
    label: 'Pixel art',
    colors: [null, '#3cbcfc', '#f8d838', '#b858f8', '#58d854', '#f83800', '#0058f8', '#fc7460', '#fcfcfc'],
    drawBlock(context, px, py, size, color) {
      const p = Math.max(2, Math.floor(size / 8)); // tamaño del "píxel"
      const x = px + 1, y = py + 1, s = size - 2;
      context.fillStyle = color;
      context.fillRect(x, y, s, s);
      // bisel: claro arriba/izquierda, oscuro abajo/derecha
      context.fillStyle = 'rgba(255,255,255,0.45)';
      context.fillRect(x, y, s, p);
      context.fillRect(x, y, p, s);
      context.fillStyle = 'rgba(0,0,0,0.4)';
      context.fillRect(x, y + s - p, s, p);
      context.fillRect(x + s - p, y, p, s);
      // textura de sub-píxeles en damero
      for (let yy = y + p * 2; yy < y + s - p * 2; yy += p * 2)
        for (let xx = x + p * 2; xx < x + s - p * 2; xx += p * 2) {
          const odd = ((xx - x) / (p * 2) + (yy - y) / (p * 2)) % 2;
          context.fillStyle = odd ? 'rgba(0,0,0,0.12)' : 'rgba(255,255,255,0.15)';
          context.fillRect(xx, yy, p, p);
        }
      // contorno negro
      context.strokeStyle = 'rgba(0,0,0,0.6)';
      context.lineWidth = 1;
      context.strokeRect(x + 0.5, y + 0.5, s - 1, s - 1);
    },
  },
};

const POWERUPS = {
  bomb:    { icon: '💣', label: 'Bomba' },
  ray:     { icon: '⚡', label: 'Rayo' },
  tint:    { icon: '🎨', label: 'Tinte' },
  gravity: { icon: '⬇', label: 'Gravedad' },
  freeze:  { icon: '❄', label: 'Congelar' },
};
const POWERUP_KINDS = Object.keys(POWERUPS);
const POWERUP_EVERY = 3;   // líneas entre power-ups
const FREEZE_MS = 5000;
const TINT_MS = 400;       // tiempo que los comodines se ven antes de desaparecer
const POWERUP_CELL_SCORE = 10;

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
const scoreEl = document.getElementById('score');
const linesEl = document.getElementById('lines');
const levelEl = document.getElementById('level');
const overlay = document.getElementById('overlay');
const overlayTitle = document.getElementById('overlay-title');
const overlayScore = document.getElementById('overlay-score');
const restartBtn = document.getElementById('restart-btn');
const themeBtn = document.getElementById('theme-toggle');
const powerupEl = document.getElementById('powerup');
const skinSelect = document.getElementById('skin-select');

let gridColor;
let skin = SKINS.retro; // preferencia: no se reinicia en init()

let board, current, next, score, lines, level, paused, gameOver, lastTime, dropAccum, dropInterval, animId;
let nextPowerupAt, pendingPowerup, freezeLeft, tintLeft;

function createBoard() {
  return Array.from({ length: ROWS }, () => new Array(COLS).fill(0));
}

function randomPiece() {
  const type = Math.floor(Math.random() * 7) + 1;
  const shape = PIECES[type].map(row => [...row]);
  return { type, shape, x: Math.floor(COLS / 2) - Math.floor(shape[0].length / 2), y: 0 };
}

// pieza normal con un bloque especial elegido al azar
function makePowerPiece() {
  const piece = randomPiece();
  const cells = [];
  for (let r = 0; r < piece.shape.length; r++)
    for (let c = 0; c < piece.shape[r].length; c++)
      if (piece.shape[r][c]) cells.push({ r, c });
  const cell = cells[Math.floor(Math.random() * cells.length)];
  const kind = POWERUP_KINDS[Math.floor(Math.random() * POWERUP_KINDS.length)];
  piece.power = { kind, r: cell.r, c: cell.c };
  return piece;
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
      if (current.power) {
        // misma transformación que rotateCW: (r, c) → (c, rows-1-r)
        const { r, c } = current.power;
        current.power.r = c;
        current.power.c = current.shape.length - 1 - r;
      }
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
    while (lines >= nextPowerupAt) {
      pendingPowerup = true;
      nextPowerupAt += POWERUP_EVERY;
    }
    score += (LINE_SCORES[cleared] || 0) * level;
    level = Math.floor(lines / 10) + 1;
    dropInterval = Math.max(100, 1000 - (level - 1) * 90);
    updateHUD();
  }
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

// baja todos los bloques de cada columna eliminando huecos
function compactBoard() {
  for (let c = 0; c < COLS; c++) {
    let write = ROWS - 1;
    for (let r = ROWS - 1; r >= 0; r--) {
      if (board[r][c]) {
        const v = board[r][c];
        board[r][c] = 0;
        board[write][c] = v;
        write--;
      }
    }
  }
}

// vacía una celda (si está dentro del tablero) y devuelve 1 si había bloque
function destroyCell(r, c) {
  if (r < 0 || r >= ROWS || c < 0 || c >= COLS || !board[r][c]) return 0;
  board[r][c] = 0;
  return 1;
}

function applyPowerup(kind, tr, tc) {
  let destroyed = 0;
  switch (kind) {
    case 'bomb':
      for (let r = tr - 1; r <= tr + 1; r++)
        for (let c = tc - 1; c <= tc + 1; c++)
          destroyed += destroyCell(r, c);
      break;
    case 'ray':
      for (let c = 0; c < COLS; c++) destroyed += destroyCell(tr, c);
      for (let r = 0; r < ROWS; r++) destroyed += destroyCell(r, tc);
      break;
    case 'tint': {
      if (tr < 0 || tr >= ROWS) break;
      const color = board[tr][tc];
      if (!color) break;
      for (let r = 0; r < ROWS; r++)
        for (let c = 0; c < COLS; c++)
          if (board[r][c] === color) board[r][c] = WILDCARD;
      tintLeft = TINT_MS; // se eliminan en loop() tras un instante
      break;
    }
    case 'gravity':
      compactBoard();
      break;
    case 'freeze':
      freezeLeft = FREEZE_MS;
      break;
  }
  score += destroyed * POWERUP_CELL_SCORE * level;
}

// elimina los comodines del Tinte y compacta el tablero
function resolveTint() {
  let destroyed = 0;
  for (let r = 0; r < ROWS; r++)
    for (let c = 0; c < COLS; c++)
      if (board[r][c] === WILDCARD) {
        board[r][c] = 0;
        destroyed++;
      }
  score += destroyed * POWERUP_CELL_SCORE * level;
  compactBoard();
  clearLines();
  // si un bloque compactado quedó encima de la pieza en juego, subirla
  while (current.y > -4 && collide(current.shape, current.x, current.y)) current.y--;
  updateHUD();
}

function lockPiece() {
  merge();
  if (current.power) {
    const { kind, r, c } = current.power;
    applyPowerup(kind, current.y + r, current.x + c);
  }
  clearLines();
  spawn();
}

function spawn() {
  current = next;
  if (pendingPowerup) {
    next = makePowerPiece();
    pendingPowerup = false;
  } else {
    next = randomPiece();
  }
  if (collide(current.shape, current.x, current.y)) {
    endGame();
  }
  drawNext();
}

function updateHUD() {
  scoreEl.textContent = score.toLocaleString();
  linesEl.textContent = lines;
  levelEl.textContent = level;
  updatePowerHUD();
}

function updatePowerHUD() {
  let text = '—';
  if (freezeLeft > 0) text = `❄ ${(freezeLeft / 1000).toFixed(1)}s`;
  else if (current && current.power) text = `${POWERUPS[current.power.kind].icon} ${POWERUPS[current.power.kind].label}`;
  else if (next && next.power) text = `${POWERUPS[next.power.kind].icon} próximo`;
  if (powerupEl.textContent !== text) powerupEl.textContent = text;
}

function drawPowerIcon(context, x, y, size, kind) {
  context.strokeStyle = '#ffffff';
  context.lineWidth = 2;
  context.strokeRect(x * size + 2, y * size + 2, size - 4, size - 4);
  context.font = `${Math.floor(size * 0.6)}px sans-serif`;
  context.textAlign = 'center';
  context.textBaseline = 'middle';
  context.fillStyle = '#ffffff';
  context.fillText(POWERUPS[kind].icon, x * size + size / 2, y * size + size / 2 + 1);
}

// delega en la skin activa
function drawBlock(context, x, y, colorIndex, size, alpha) {
  if (!colorIndex) return;
  context.globalAlpha = alpha ?? 1;
  skin.drawBlock(context, x * size, y * size, size, skin.colors[colorIndex]);
  context.shadowBlur = 0;
  context.globalAlpha = 1;
}

// fondo propio de la skin (si no tiene, se ve el --board-bg del tema vía CSS)
function clearCanvas(context, cv) {
  context.clearRect(0, 0, cv.width, cv.height);
  if (skin.bg) {
    context.fillStyle = skin.bg;
    context.fillRect(0, 0, cv.width, cv.height);
  }
}

function drawGrid() {
  ctx.strokeStyle = skin.grid || gridColor;
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
  clearCanvas(ctx, canvas);
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
  if (current.power)
    drawPowerIcon(ctx, current.x + current.power.c, current.y + current.power.r, BLOCK, current.power.kind);
}

function drawNext() {
  const NB = 30;
  clearCanvas(nextCtx, nextCanvas);
  const shape = next.shape;
  const offX = Math.floor((4 - shape[0].length) / 2);
  const offY = Math.floor((4 - shape.length) / 2);
  for (let r = 0; r < shape.length; r++)
    for (let c = 0; c < shape[r].length; c++)
      drawBlock(nextCtx, offX + c, offY + r, shape[r][c], NB);
  if (next.power)
    drawPowerIcon(nextCtx, offX + next.power.c, offY + next.power.r, NB, next.power.kind);
}

function endGame() {
  gameOver = true;
  cancelAnimationFrame(animId);
  draw(); // el loop está detenido: dibujar el estado final
  overlayTitle.textContent = 'GAME OVER';
  overlayScore.textContent = `Puntuación: ${score.toLocaleString()}`;
  overlay.classList.remove('hidden');
}

function setTheme(theme) {
  const light = theme === 'light';
  if (light) document.documentElement.dataset.theme = 'light';
  else delete document.documentElement.dataset.theme;
  themeBtn.textContent = light ? 'Modo oscuro' : 'Modo claro';
  themeBtn.setAttribute('aria-pressed', String(light));
  gridColor = getComputedStyle(document.documentElement).getPropertyValue('--grid').trim();
  // en pausa/game over el loop está detenido: redibujar manualmente
  if (current && next) { draw(); drawNext(); }
}

function setSkin(name) {
  if (!SKINS[name]) name = 'retro';
  skin = SKINS[name];
  skinSelect.value = name;
  try { localStorage.setItem(SKIN_KEY, name); } catch (e) { /* sin almacenamiento */ }
  // en pausa/game over el loop está detenido: redibujar manualmente
  if (current && next) { draw(); drawNext(); }
}

function loadSkin() {
  try { return localStorage.getItem(SKIN_KEY) || 'retro'; } catch (e) { return 'retro'; }
}

function cycleSkin() {
  const names = Object.keys(SKINS);
  setSkin(names[(names.indexOf(skinSelect.value) + 1) % names.length]);
}

function toggleTheme() {
  setTheme(document.documentElement.dataset.theme === 'light' ? 'dark' : 'light');
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
  if (tintLeft > 0) {
    tintLeft -= dt;
    if (tintLeft <= 0) resolveTint();
  }
  if (freezeLeft > 0) freezeLeft = Math.max(0, freezeLeft - dt);
  else dropAccum += dt;
  updatePowerHUD();
  if (dropAccum >= dropInterval) {
    dropAccum = 0;
    if (!collide(current.shape, current.x, current.y + 1)) {
      current.y++;
    } else {
      lockPiece();
      // lockPiece() puede disparar endGame(): no reprogramar el loop
      if (gameOver) return;
    }
  }
  draw();
  animId = requestAnimationFrame(loop);
}

function init() {
  board = createBoard();
  score = 0;
  lines = 0;
  level = 1;
  paused = false;
  gameOver = false;
  dropInterval = 1000;
  dropAccum = 0;
  nextPowerupAt = POWERUP_EVERY;
  pendingPowerup = false;
  freezeLeft = 0;
  tintLeft = 0;
  lastTime = performance.now();
  next = randomPiece();
  spawn();
  updateHUD();
  overlay.classList.add('hidden');
  cancelAnimationFrame(animId);
  animId = requestAnimationFrame(loop);
}

document.addEventListener('keydown', e => {
  if (e.target === skinSelect) return; // el selector tiene el foco: no mover piezas
  if (e.code === 'KeyS') { cycleSkin(); return; }
  if (e.code === 'KeyP') { togglePause(); return; }
  if (e.code === 'KeyT') { toggleTheme(); return; }
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
  }
  updateHUD();
});

restartBtn.addEventListener('click', init);
themeBtn.addEventListener('click', () => {
  toggleTheme();
  themeBtn.blur(); // evita que Space active el botón
});

skinSelect.addEventListener('change', () => {
  setSkin(skinSelect.value);
  skinSelect.blur(); // evita que flechas/Space operen el selector durante el juego
});

setTheme('dark'); // siempre arranca en modo oscuro
setSkin(loadSkin());

init();
