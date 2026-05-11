// ============================================================
// 作戦ボードアプリ
// ============================================================

const DEFAULT_OWN_CARD = '#ffffff';
const DEFAULT_OWN_TEXT = '#1e3a5f';
const DEFAULT_OPP_CARD = '#ffe1e1';
const DEFAULT_OPP_TEXT = '#a93030';

const STORAGE_KEY = 'sakusen-board-v2';

let state = {
  boardName: '',
  sport: 'free',
  activeTeam: 'own',
  members: [],
  drawings: []
};

let editingMemberId = null;

// Drawing tool state
let drawTool = {
  mode: 'pen',       // 'pen' | 'eraser'
  color: '#e02e2e',
  width: 4,          // pixels (relative to 1000-wide canvas)
  isDrawing: false,
  currentStroke: null
};

// ============================================================
// State persistence
// ============================================================
function saveState() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch (e) {
    console.warn('保存に失敗しました', e);
  }
}

function loadState() {
  const fromUrl = decodeStateFromUrl();
  if (fromUrl) {
    state = Object.assign(state, fromUrl);
    return;
  }
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      state = Object.assign(state, parsed);
    }
  } catch (e) {
    console.warn('読込に失敗しました', e);
  }
  if (!state.drawings) state.drawings = [];
}

// ============================================================
// Utilities
// ============================================================
function uid() {
  return 'm_' + Math.random().toString(36).slice(2, 10);
}

function defaultColorsFor(team) {
  return team === 'opponent'
    ? { card: DEFAULT_OPP_CARD, text: DEFAULT_OPP_TEXT }
    : { card: DEFAULT_OWN_CARD, text: DEFAULT_OWN_TEXT };
}

function makeMember({ name = '', other = '', team = 'own', number = '' } = {}) {
  const c = defaultColorsFor(team);
  return {
    id: uid(),
    name,
    other,
    number,
    showNumber: false,
    team,
    cardColor: c.card,
    textColor: c.text,
    x: 0.5,
    y: 0.5,
    onBoard: false
  };
}

function downloadFile(filename, content, mime) {
  const blob = (content instanceof Blob) ? content : new Blob([content], { type: mime || 'text/plain' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function timestamp() {
  const d = new Date();
  const pad = n => String(n).padStart(2, '0');
  return `${d.getFullYear()}${pad(d.getMonth()+1)}${pad(d.getDate())}_${pad(d.getHours())}${pad(d.getMinutes())}`;
}

// ============================================================
// 10 Board background designs (SVG)
// viewBox is 1000 x 600
// ============================================================
const SPORT_SVGS = {
  free: () => `
    <defs>
      <pattern id="grid" width="40" height="40" patternUnits="userSpaceOnUse">
        <path d="M 40 0 L 0 0 0 40" fill="none" stroke="#dfe5ee" stroke-width="1"/>
      </pattern>
    </defs>
    <rect width="1000" height="600" fill="url(#grid)"/>
  `,

  soccer: () => `
    <rect x="20" y="20" width="960" height="560" fill="none" stroke="#fff" stroke-width="3"/>
    <line x1="500" y1="20" x2="500" y2="580" stroke="#fff" stroke-width="3"/>
    <circle cx="500" cy="300" r="70" fill="none" stroke="#fff" stroke-width="3"/>
    <circle cx="500" cy="300" r="4" fill="#fff"/>
    <rect x="20" y="170" width="120" height="260" fill="none" stroke="#fff" stroke-width="3"/>
    <rect x="20" y="240" width="50" height="120" fill="none" stroke="#fff" stroke-width="3"/>
    <rect x="860" y="170" width="120" height="260" fill="none" stroke="#fff" stroke-width="3"/>
    <rect x="930" y="240" width="50" height="120" fill="none" stroke="#fff" stroke-width="3"/>
    <path d="M 140 240 A 70 70 0 0 1 140 360" fill="none" stroke="#fff" stroke-width="3"/>
    <path d="M 860 240 A 70 70 0 0 0 860 360" fill="none" stroke="#fff" stroke-width="3"/>
  `,

  basketball: () => `
    <rect x="20" y="20" width="960" height="560" fill="none" stroke="#fff" stroke-width="3"/>
    <line x1="500" y1="20" x2="500" y2="580" stroke="#fff" stroke-width="3"/>
    <circle cx="500" cy="300" r="60" fill="none" stroke="#fff" stroke-width="3"/>
    <rect x="20" y="170" width="180" height="260" fill="none" stroke="#fff" stroke-width="3"/>
    <rect x="800" y="170" width="180" height="260" fill="none" stroke="#fff" stroke-width="3"/>
    <circle cx="200" cy="300" r="60" fill="none" stroke="#fff" stroke-width="3"/>
    <circle cx="800" cy="300" r="60" fill="none" stroke="#fff" stroke-width="3"/>
    <path d="M 20 110 Q 220 300 20 490" fill="none" stroke="#fff" stroke-width="3"/>
    <path d="M 980 110 Q 780 300 980 490" fill="none" stroke="#fff" stroke-width="3"/>
    <line x1="40" y1="290" x2="60" y2="290" stroke="#fff" stroke-width="4"/>
    <line x1="40" y1="310" x2="60" y2="310" stroke="#fff" stroke-width="4"/>
    <line x1="940" y1="290" x2="960" y2="290" stroke="#fff" stroke-width="4"/>
    <line x1="940" y1="310" x2="960" y2="310" stroke="#fff" stroke-width="4"/>
  `,

  volleyball: () => `
    <rect x="100" y="80" width="800" height="440" fill="none" stroke="#fff" stroke-width="3"/>
    <line x1="500" y1="80" x2="500" y2="520" stroke="#fff" stroke-width="5"/>
    <line x1="300" y1="80" x2="300" y2="520" stroke="#fff" stroke-width="3" stroke-dasharray="6,4"/>
    <line x1="700" y1="80" x2="700" y2="520" stroke="#fff" stroke-width="3" stroke-dasharray="6,4"/>
    <text x="200" y="50" fill="#fff" font-size="20" text-anchor="middle">後衛</text>
    <text x="800" y="50" fill="#fff" font-size="20" text-anchor="middle">後衛</text>
    <text x="400" y="50" fill="#fff" font-size="20" text-anchor="middle">前衛</text>
    <text x="600" y="50" fill="#fff" font-size="20" text-anchor="middle">前衛</text>
  `,

  baseball: () => `
    <path d="M 500 540 L 100 200 A 600 600 0 0 1 900 200 Z" fill="#c9a87a" stroke="#fff" stroke-width="2"/>
    <path d="M 500 540 L 100 200 A 600 600 0 0 1 900 200 Z" fill="none" stroke="#fff" stroke-width="2"/>
    <polygon points="500,440 600,360 500,280 400,360" fill="#6ea84c" stroke="#fff" stroke-width="3"/>
    <line x1="500" y1="440" x2="600" y2="360" stroke="#fff" stroke-width="3"/>
    <line x1="600" y1="360" x2="500" y2="280" stroke="#fff" stroke-width="3"/>
    <line x1="500" y1="280" x2="400" y2="360" stroke="#fff" stroke-width="3"/>
    <line x1="400" y1="360" x2="500" y2="440" stroke="#fff" stroke-width="3"/>
    <circle cx="500" cy="370" r="14" fill="#c9a87a" stroke="#fff" stroke-width="2"/>
    <rect x="492" y="436" width="16" height="12" fill="#fff"/>
    <rect x="592" y="356" width="14" height="12" fill="#fff"/>
    <rect x="394" y="356" width="14" height="12" fill="#fff"/>
    <polygon points="500,272 508,284 500,290 492,284" fill="#fff"/>
    <line x1="500" y1="540" x2="200" y2="240" stroke="#fff" stroke-width="3"/>
    <line x1="500" y1="540" x2="800" y2="240" stroke="#fff" stroke-width="3"/>
  `,

  dodgeball: () => `
    <rect x="50" y="50" width="900" height="500" fill="none" stroke="#fff" stroke-width="3"/>
    <line x1="500" y1="50" x2="500" y2="550" stroke="#fff" stroke-width="3"/>
    <rect x="50" y="50" width="450" height="500" fill="rgba(255,255,255,0.05)"/>
    <rect x="500" y="50" width="450" height="500" fill="rgba(0,0,0,0.05)"/>
    <line x1="50" y1="50" x2="50" y2="550" stroke="#fff" stroke-width="6" stroke-dasharray="10,8"/>
    <line x1="950" y1="50" x2="950" y2="550" stroke="#fff" stroke-width="6" stroke-dasharray="10,8"/>
    <text x="250" y="40" fill="#fff" font-size="22" text-anchor="middle" font-weight="bold">内野</text>
    <text x="750" y="40" fill="#fff" font-size="22" text-anchor="middle" font-weight="bold">内野</text>
    <text x="25" y="305" fill="#fff" font-size="16" text-anchor="middle" font-weight="bold" transform="rotate(-90 25 305)">外野</text>
    <text x="975" y="305" fill="#fff" font-size="16" text-anchor="middle" font-weight="bold" transform="rotate(90 975 305)">外野</text>
  `,

  track: () => `
    <rect x="60" y="80" width="880" height="440" rx="220" ry="220" fill="#a76b3a" stroke="#fff" stroke-width="3"/>
    <rect x="120" y="140" width="760" height="320" rx="160" ry="160" fill="#a76b3a" stroke="#fff" stroke-width="2" stroke-dasharray="6,6"/>
    <rect x="180" y="200" width="640" height="200" rx="100" ry="100" fill="#6ea84c" stroke="#fff" stroke-width="3"/>
    <line x1="500" y1="80" x2="500" y2="140" stroke="#fff" stroke-width="4"/>
    <line x1="500" y1="460" x2="500" y2="520" stroke="#fff" stroke-width="4"/>
    <text x="500" y="60" fill="#fff" font-size="18" text-anchor="middle" font-weight="bold">スタート／ゴール</text>
  `,

  classroom: () => `
    <rect x="40" y="40" width="920" height="520" fill="none" stroke="#7a6a4a" stroke-width="3"/>
    <rect x="350" y="60" width="300" height="40" fill="#3a3a3a" stroke="#7a6a4a" stroke-width="2"/>
    <text x="500" y="88" fill="#fff" font-size="18" text-anchor="middle">黒板</text>
    <rect x="80" y="110" width="50" height="30" fill="#fff" stroke="#7a6a4a" stroke-width="1.5"/>
    <text x="105" y="130" font-size="11" text-anchor="middle" fill="#888">教卓</text>
    ${(function() {
      let out = '';
      const cols = 6, rows = 5;
      const startX = 130, startY = 200;
      const gapX = 130, gapY = 70;
      for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
          const x = startX + c * gapX;
          const y = startY + r * gapY;
          out += `<rect x="${x}" y="${y}" width="80" height="50" fill="#fff" stroke="#7a6a4a" stroke-width="1.5" rx="4"/>`;
          out += `<circle cx="${x+40}" cy="${y+62}" r="6" fill="#7a6a4a"/>`;
        }
      }
      return out;
    })()}
  `,

  assembly: () => `
    <rect x="40" y="40" width="920" height="520" fill="none" stroke="#7a6a4a" stroke-width="3"/>
    <rect x="350" y="60" width="300" height="60" fill="#8b6f3a" stroke="#5a4a2a" stroke-width="2"/>
    <text x="500" y="98" fill="#fff" font-size="20" text-anchor="middle" font-weight="bold">ステージ</text>
    <line x1="100" y1="160" x2="900" y2="160" stroke="#7a6a4a" stroke-width="2" stroke-dasharray="4,4"/>
    ${(function() {
      let out = '';
      const rows = 5, cols = 12;
      const startX = 130, startY = 200;
      const gapX = 62, gapY = 70;
      for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
          const x = startX + c * gapX;
          const y = startY + r * gapY;
          out += `<circle cx="${x}" cy="${y}" r="14" fill="#fff" stroke="#7a6a4a" stroke-width="1.5"/>`;
        }
      }
      return out;
    })()}
  `,

  ground: () => `
    <rect x="30" y="30" width="940" height="540" fill="none" stroke="#fff" stroke-width="3"/>
    <ellipse cx="500" cy="300" rx="380" ry="220" fill="#6ea84c" stroke="#fff" stroke-width="3"/>
    <circle cx="500" cy="300" r="60" fill="none" stroke="#fff" stroke-width="2" stroke-dasharray="6,4"/>
    <rect x="80" y="80" width="200" height="100" fill="none" stroke="#fff" stroke-width="2" stroke-dasharray="4,4"/>
    <text x="180" y="135" fill="#fff" font-size="16" text-anchor="middle">遊具</text>
    <rect x="720" y="80" width="200" height="100" fill="none" stroke="#fff" stroke-width="2" stroke-dasharray="4,4"/>
    <text x="820" y="135" fill="#fff" font-size="16" text-anchor="middle">砂場</text>
    <rect x="80" y="440" width="200" height="100" fill="none" stroke="#fff" stroke-width="2" stroke-dasharray="4,4"/>
    <text x="180" y="495" fill="#fff" font-size="16" text-anchor="middle">朝礼台</text>
  `
};

function renderBoardBackground() {
  const svg = document.getElementById('boardBg');
  const board = document.getElementById('board');
  board.dataset.sport = state.sport;
  const draw = SPORT_SVGS[state.sport] || SPORT_SVGS.free;
  svg.innerHTML = draw();
}

// ============================================================
// Member list rendering
// ============================================================
function renderMemberList() {
  const ul = document.getElementById('memberList');
  ul.innerHTML = '';
  const filtered = state.members.filter(m => m.team === state.activeTeam);
  if (filtered.length === 0) {
    const li = document.createElement('li');
    li.className = 'member-item';
    li.style.opacity = '0.6';
    li.style.justifyContent = 'center';
    li.textContent = 'メンバーがいません。「取り込み」か「＋名前を追加」で追加してください。';
    ul.appendChild(li);
    return;
  }
  filtered.forEach((m, idx) => {
    const li = document.createElement('li');
    li.className = 'member-item';

    // Number + checkbox cell
    const numCell = document.createElement('div');
    numCell.className = 'member-num-cell';
    const numCheck = document.createElement('input');
    numCheck.type = 'checkbox';
    numCheck.className = 'member-num-check';
    numCheck.checked = !!m.showNumber;
    numCheck.title = '番号をカードに表示';
    numCheck.addEventListener('change', () => {
      m.showNumber = numCheck.checked;
      if (!m.number) m.number = String(idx + 1);
      saveState();
      renderMemberList();
      renderCards();
    });
    const numLabel = document.createElement('span');
    numLabel.className = 'member-num';
    numLabel.textContent = m.number || String(idx + 1);
    numCell.append(numCheck, numLabel);

    const swatch = document.createElement('span');
    swatch.className = 'member-swatch';
    swatch.style.background = m.cardColor;

    const nameWrap = document.createElement('div');
    nameWrap.className = 'member-name';
    const nameText = document.createElement('span');
    nameText.textContent = m.name || '（空白）';
    nameWrap.appendChild(nameText);
    if (m.other) {
      const otherEl = document.createElement('div');
      otherEl.className = 'member-other';
      otherEl.textContent = m.other;
      nameWrap.appendChild(otherEl);
    }

    const toggle = document.createElement('button');
    toggle.className = 'member-toggle' + (m.onBoard ? ' on' : '');
    toggle.textContent = m.onBoard ? 'ON' : 'OFF';
    toggle.title = 'ボード表示の切替';
    toggle.addEventListener('click', () => {
      m.onBoard = !m.onBoard;
      saveState();
      renderMemberList();
      renderCards();
    });

    const edit = document.createElement('button');
    edit.className = 'member-edit';
    edit.textContent = '✎';
    edit.title = '編集';
    edit.addEventListener('click', () => openEditModal(m.id));

    li.append(numCell, swatch, nameWrap, toggle, edit);
    ul.appendChild(li);
  });
}

// ============================================================
// Card rendering
// ============================================================
function renderCards() {
  const layer = document.getElementById('cardLayer');
  layer.innerHTML = '';
  const indexMap = {};
  state.members.forEach((m, i) => { indexMap[m.id] = i; });

  state.members.filter(m => m.onBoard).forEach(m => {
    const card = document.createElement('div');
    card.className = 'card team-' + m.team;
    if (!m.name && !m.other) card.classList.add('empty');
    card.dataset.id = m.id;
    card.style.left = (m.x * 100) + '%';
    card.style.top = (m.y * 100) + '%';
    card.style.background = m.cardColor;
    card.style.color = m.textColor;

    const row = document.createElement('div');
    row.className = 'card-row';

    if (m.showNumber) {
      const num = document.createElement('span');
      num.className = 'card-number';
      num.textContent = m.number || String(indexMap[m.id] + 1);
      row.appendChild(num);
    }

    const nameSpan = document.createElement('span');
    nameSpan.className = 'card-name';
    nameSpan.textContent = m.name || '（空白）';
    row.appendChild(nameSpan);

    card.appendChild(row);

    if (m.other) {
      const otherSpan = document.createElement('span');
      otherSpan.className = 'card-other';
      otherSpan.textContent = m.other;
      card.appendChild(otherSpan);
    }

    attachDrag(card, m);
    card.addEventListener('dblclick', () => openEditModal(m.id));
    layer.appendChild(card);
  });
}

// ============================================================
// Drag and drop
// ============================================================
function attachDrag(card, member) {
  let startX, startY, originX, originY;
  let dragging = false;

  const onDown = (e) => {
    if (document.getElementById('board').classList.contains('draw-mode')) return;
    e.preventDefault();
    dragging = true;
    card.classList.add('dragging');
    const point = e.touches ? e.touches[0] : e;
    startX = point.clientX;
    startY = point.clientY;
    originX = member.x;
    originY = member.y;
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
    document.addEventListener('touchmove', onMove, { passive: false });
    document.addEventListener('touchend', onUp);
  };

  const onMove = (e) => {
    if (!dragging) return;
    e.preventDefault();
    const point = e.touches ? e.touches[0] : e;
    const board = document.getElementById('board');
    const rect = board.getBoundingClientRect();
    const dx = (point.clientX - startX) / rect.width;
    const dy = (point.clientY - startY) / rect.height;
    let nx = Math.min(1, Math.max(0, originX + dx));
    let ny = Math.min(1, Math.max(0, originY + dy));
    member.x = nx;
    member.y = ny;
    card.style.left = (nx * 100) + '%';
    card.style.top = (ny * 100) + '%';
  };

  const onUp = () => {
    if (!dragging) return;
    dragging = false;
    card.classList.remove('dragging');
    document.removeEventListener('mousemove', onMove);
    document.removeEventListener('mouseup', onUp);
    document.removeEventListener('touchmove', onMove);
    document.removeEventListener('touchend', onUp);
    saveState();
  };

  card.addEventListener('mousedown', onDown);
  card.addEventListener('touchstart', onDown, { passive: false });
}

// ============================================================
// Drawing layer (Whiteboard marker)
// ============================================================
function setupDrawCanvas() {
  const canvas = document.getElementById('drawCanvas');
  const board = document.getElementById('board');

  const resize = () => {
    const rect = board.getBoundingClientRect();
    canvas.width = rect.width;
    canvas.height = rect.height;
    redrawStrokes();
  };
  window.addEventListener('resize', resize);
  // Initial size after layout
  requestAnimationFrame(resize);
  // Also re-resize when sport changes (board may resize)
  new ResizeObserver(resize).observe(board);

  // Drawing events
  const getPoint = (e) => {
    const rect = canvas.getBoundingClientRect();
    const p = e.touches ? e.touches[0] : e;
    return {
      x: (p.clientX - rect.left) / rect.width,
      y: (p.clientY - rect.top) / rect.height
    };
  };

  const onDown = (e) => {
    if (!board.classList.contains('draw-mode')) return;
    e.preventDefault();
    drawTool.isDrawing = true;
    const pt = getPoint(e);
    if (drawTool.mode === 'eraser') {
      eraseAt(pt);
      drawTool.currentStroke = { mode: 'eraser' };
    } else {
      drawTool.currentStroke = {
        mode: 'pen',
        color: drawTool.color,
        width: drawTool.width / 1000,
        points: [[pt.x, pt.y]]
      };
    }
  };

  const onMove = (e) => {
    if (!drawTool.isDrawing) return;
    e.preventDefault();
    const pt = getPoint(e);
    if (drawTool.mode === 'eraser') {
      eraseAt(pt);
    } else {
      drawTool.currentStroke.points.push([pt.x, pt.y]);
      redrawStrokes();
      drawStroke(drawTool.currentStroke);
    }
  };

  const onUp = (e) => {
    if (!drawTool.isDrawing) return;
    drawTool.isDrawing = false;
    if (drawTool.mode === 'pen' && drawTool.currentStroke && drawTool.currentStroke.points.length > 1) {
      state.drawings.push(drawTool.currentStroke);
      saveState();
    }
    drawTool.currentStroke = null;
    redrawStrokes();
  };

  canvas.addEventListener('mousedown', onDown);
  canvas.addEventListener('mousemove', onMove);
  document.addEventListener('mouseup', onUp);
  canvas.addEventListener('touchstart', onDown, { passive: false });
  canvas.addEventListener('touchmove', onMove, { passive: false });
  canvas.addEventListener('touchend', onUp);
}

function drawStroke(stroke) {
  const canvas = document.getElementById('drawCanvas');
  const ctx = canvas.getContext('2d');
  if (!stroke.points || stroke.points.length < 1) return;
  ctx.strokeStyle = stroke.color;
  ctx.lineWidth = Math.max(1, stroke.width * canvas.width);
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.beginPath();
  const [x0, y0] = stroke.points[0];
  ctx.moveTo(x0 * canvas.width, y0 * canvas.height);
  for (let i = 1; i < stroke.points.length; i++) {
    const [x, y] = stroke.points[i];
    ctx.lineTo(x * canvas.width, y * canvas.height);
  }
  ctx.stroke();
}

function redrawStrokes() {
  const canvas = document.getElementById('drawCanvas');
  const ctx = canvas.getContext('2d');
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  state.drawings.forEach(drawStroke);
}

function eraseAt(pt) {
  const threshold = 0.018; // normalized distance
  const before = state.drawings.length;
  state.drawings = state.drawings.filter(stroke => {
    return !stroke.points.some(([x, y]) => {
      const dx = x - pt.x, dy = y - pt.y;
      return dx*dx + dy*dy < threshold*threshold;
    });
  });
  if (state.drawings.length !== before) {
    redrawStrokes();
    saveState();
  }
}

function undoStroke() {
  if (state.drawings.length === 0) return;
  state.drawings.pop();
  redrawStrokes();
  saveState();
}

function clearStrokes() {
  if (state.drawings.length === 0) return;
  if (!confirm('描画をすべて消去しますか？')) return;
  state.drawings = [];
  redrawStrokes();
  saveState();
}

function toggleDrawMode() {
  const board = document.getElementById('board');
  const btn = document.getElementById('btnDrawToggle');
  const tools = document.getElementById('drawTools');
  const on = !board.classList.contains('draw-mode');
  board.classList.toggle('draw-mode', on);
  btn.classList.toggle('active', on);
  btn.textContent = on ? '描画モード終了' : '描画モード';
  tools.classList.toggle('hidden', !on);
}

// ============================================================
// Import
// ============================================================
function parsePasted(text, delimiter, firstColMode) {
  const lines = text.split(/\r?\n/).map(l => l.trim()).filter(l => l.length > 0);
  return lines.map(line => {
    let parts;
    if (delimiter === 'tab') parts = line.split('\t');
    else if (delimiter === 'comma') parts = line.split(',');
    else if (delimiter === 'space') parts = line.split(/\s+/);
    else {
      if (line.includes('\t')) parts = line.split('\t');
      else if (line.includes(',')) parts = line.split(',');
      else parts = line.split(/\s+/);
    }
    parts = parts.map(p => p.trim());

    let number = '', name = '', other = '';
    const firstIsNum = /^\d{1,3}$/.test(parts[0]);
    const useNumber = firstColMode === 'number' || (firstColMode === 'auto' && firstIsNum && parts.length > 1);

    if (useNumber) {
      number = parts[0];
      name = parts[1] || '';
      other = parts[2] || '';
    } else {
      name = parts[0] || '';
      other = parts[1] || '';
    }
    return { number, name, other };
  });
}

function importMembers(rows, team) {
  rows.forEach(r => {
    const m = makeMember({ name: r.name, other: r.other, team, number: r.number });
    state.members.push(m);
  });
  saveState();
  renderMemberList();
}

function doPasteImport() {
  const text = document.getElementById('pasteInput').value;
  const delim = document.getElementById('pasteDelimiter').value;
  const team = document.getElementById('pasteTeam').value;
  const firstCol = document.getElementById('pasteFirstCol').value;
  if (!text.trim()) {
    alert('テキストが入力されていません。');
    return;
  }
  const rows = parsePasted(text, delim, firstCol);
  importMembers(rows, team);
  document.getElementById('pasteInput').value = '';
  closeModal('importModal');
}

function doExcelImport(file) {
  const team = document.getElementById('excelTeam').value;
  const reader = new FileReader();
  reader.onload = (e) => {
    try {
      const data = new Uint8Array(e.target.result);
      const wb = XLSX.read(data, { type: 'array' });
      const sheet = wb.Sheets[wb.SheetNames[0]];
      const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, blankrows: false });
      const parsed = [];
      rows.forEach((row, idx) => {
        if (!row || row.length === 0) return;
        const c0 = String(row[0] ?? '').trim();
        const c1 = String(row[1] ?? '').trim();
        const c2 = String(row[2] ?? '').trim();
        if (idx === 0) {
          const headerWords = ['氏名', '名前', 'name', '番号', 'no', '#', 'no.'];
          if (headerWords.includes(c0.toLowerCase()) || headerWords.includes(c1.toLowerCase())) return;
        }
        let number = '', name = '', other = '';
        if (/^\d{1,3}$/.test(c0) && (c1 || c2)) {
          number = c0;
          name = c1;
          other = c2;
        } else {
          name = c0;
          other = c1;
        }
        if (!name && !other && !number) return;
        parsed.push({ number, name, other });
      });
      if (parsed.length === 0) {
        alert('取り込めるデータがありませんでした。');
        return;
      }
      importMembers(parsed, team);
      closeModal('importModal');
    } catch (err) {
      console.error(err);
      alert('Excelファイルの読み込みに失敗しました：' + err.message);
    }
  };
  reader.readAsArrayBuffer(file);
}

async function doGsheetImport() {
  const url = document.getElementById('gsheetUrl').value.trim();
  const team = document.getElementById('gsheetTeam').value;
  if (!url) {
    alert('URLが入力されていません。');
    return;
  }
  try {
    const res = await fetch(url);
    if (!res.ok) throw new Error('HTTP ' + res.status);
    const csv = await res.text();
    const rows = parsePasted(csv, 'comma', 'auto');
    if (rows.length === 0) {
      alert('取り込めるデータがありませんでした。');
      return;
    }
    importMembers(rows, team);
    document.getElementById('gsheetUrl').value = '';
    closeModal('importModal');
  } catch (err) {
    alert('Googleスプレッドシートの読み込みに失敗しました。\nURLを確認するか，スプレッドシートのデータをコピー＆ペーストで取り込んでください。\n\n詳細：' + err.message);
  }
}

// ============================================================
// JSON save / load
// ============================================================
function jsonSave() {
  const data = JSON.stringify(state, null, 2);
  const name = (state.boardName || 'sakusen-board').replace(/[^\w\-ぁ-んァ-ヶ一-龯]/g, '_');
  downloadFile(`${name}_${timestamp()}.json`, data, 'application/json');
}

function jsonLoad(file) {
  const reader = new FileReader();
  reader.onload = (e) => {
    try {
      const parsed = JSON.parse(e.target.result);
      if (!parsed.members) throw new Error('不正な作戦ボードJSONです');
      if (!confirm('現在のボードを読み込みデータで置き換えます。よろしいですか？')) return;
      state = Object.assign({
        boardName: '', sport: 'free', activeTeam: 'own', members: [], drawings: []
      }, parsed);
      saveState();
      // Refresh UI
      document.getElementById('boardName').value = state.boardName || '';
      document.getElementById('sportSelect').value = state.sport || 'free';
      renderBoardBackground();
      renderMemberList();
      renderCards();
      redrawStrokes();
    } catch (err) {
      alert('JSONの読み込みに失敗しました：' + err.message);
    }
  };
  reader.readAsText(file);
}

// ============================================================
// JPEG save
// ============================================================
async function jpegSave() {
  const board = document.getElementById('board');
  try {
    const canvas = await html2canvas(board, {
      backgroundColor: null,
      scale: 2,
      useCORS: true,
      logging: false
    });
    canvas.toBlob((blob) => {
      if (!blob) {
        alert('画像の生成に失敗しました。');
        return;
      }
      const name = (state.boardName || 'sakusen-board').replace(/[^\w\-ぁ-んァ-ヶ一-龯]/g, '_');
      downloadFile(`${name}_${timestamp()}.jpg`, blob);
    }, 'image/jpeg', 0.92);
  } catch (err) {
    console.error(err);
    alert('JPEG保存に失敗しました：' + err.message);
  }
}

// ============================================================
// Modal helpers
// ============================================================
function openModal(id) {
  document.getElementById(id).classList.remove('hidden');
}
function closeModal(id) {
  document.getElementById(id).classList.add('hidden');
}

// ============================================================
// Edit Modal
// ============================================================
function openEditModal(memberId) {
  const m = state.members.find(x => x.id === memberId);
  if (!m) return;
  editingMemberId = memberId;
  document.getElementById('editNumber').value = m.number || '';
  document.getElementById('editName').value = m.name;
  document.getElementById('editOther').value = m.other;
  document.getElementById('editTeam').value = m.team;
  document.getElementById('editCardColor').value = m.cardColor;
  document.getElementById('editTextColor').value = m.textColor;
  document.getElementById('editShowNumber').checked = !!m.showNumber;
  document.getElementById('editOnBoard').checked = m.onBoard;
  openModal('memberEditModal');
}

function saveEdit() {
  if (!editingMemberId) return;
  const m = state.members.find(x => x.id === editingMemberId);
  if (!m) return;
  m.number = document.getElementById('editNumber').value.trim();
  m.name = document.getElementById('editName').value;
  m.other = document.getElementById('editOther').value;
  m.team = document.getElementById('editTeam').value;
  m.cardColor = document.getElementById('editCardColor').value;
  m.textColor = document.getElementById('editTextColor').value;
  m.showNumber = document.getElementById('editShowNumber').checked;
  m.onBoard = document.getElementById('editOnBoard').checked;
  saveState();
  renderMemberList();
  renderCards();
  closeModal('memberEditModal');
  editingMemberId = null;
}

function deleteEditing() {
  if (!editingMemberId) return;
  if (!confirm('このカードを削除しますか？')) return;
  state.members = state.members.filter(m => m.id !== editingMemberId);
  saveState();
  renderMemberList();
  renderCards();
  closeModal('memberEditModal');
  editingMemberId = null;
}

// ============================================================
// Bulk color
// ============================================================
function applyBulkColor() {
  const target = document.getElementById('bulkTarget').value;
  const card = document.getElementById('bulkCardColor').value;
  const text = document.getElementById('bulkTextColor').value;
  const showNumber = document.getElementById('bulkShowNumber').checked;
  state.members.forEach((m, idx) => {
    if (target === 'all' || m.team === target) {
      m.cardColor = card;
      m.textColor = text;
      m.showNumber = showNumber;
      if (showNumber && !m.number) m.number = String(idx + 1);
    }
  });
  saveState();
  renderMemberList();
  renderCards();
  closeModal('bulkColorModal');
}

// ============================================================
// Share URL
// ============================================================
function encodeStateToUrl() {
  const json = JSON.stringify(state);
  const b64 = btoa(unescape(encodeURIComponent(json)));
  const base = location.origin + location.pathname;
  return base + '#board=' + b64;
}

function decodeStateFromUrl() {
  const hash = location.hash;
  const m = hash.match(/board=([^&]+)/);
  if (!m) return null;
  try {
    const json = decodeURIComponent(escape(atob(m[1])));
    return JSON.parse(json);
  } catch (e) {
    console.warn('共有URLの復号に失敗', e);
    return null;
  }
}

function openShareModal() {
  const url = encodeStateToUrl();
  document.getElementById('shareUrl').value = url;
  document.getElementById('copyStatus').textContent = '';
  openModal('shareModal');
}

async function copyShareUrl() {
  const ta = document.getElementById('shareUrl');
  try {
    await navigator.clipboard.writeText(ta.value);
    document.getElementById('copyStatus').textContent = 'コピーしました';
  } catch (e) {
    ta.select();
    document.execCommand('copy');
    document.getElementById('copyStatus').textContent = 'コピーしました';
  }
}

// ============================================================
// Event wiring
// ============================================================
function wireEvents() {
  // Header
  document.getElementById('boardName').addEventListener('input', e => {
    state.boardName = e.target.value;
    saveState();
  });
  document.getElementById('sportSelect').addEventListener('change', e => {
    state.sport = e.target.value;
    saveState();
    renderBoardBackground();
  });
  document.getElementById('btnImport').addEventListener('click', () => openModal('importModal'));
  document.getElementById('btnBulkColor').addEventListener('click', () => openModal('bulkColorModal'));
  document.getElementById('btnShare').addEventListener('click', openShareModal);
  document.getElementById('btnClear').addEventListener('click', () => {
    if (!confirm('すべてのメンバー・カード・描画を削除します。よろしいですか？')) return;
    state.members = [];
    state.drawings = [];
    saveState();
    renderMemberList();
    renderCards();
    redrawStrokes();
  });
  document.getElementById('btnAddBlank').addEventListener('click', () => {
    const m = makeMember({ team: state.activeTeam });
    m.onBoard = true;
    m.x = 0.3 + Math.random() * 0.4;
    m.y = 0.3 + Math.random() * 0.4;
    state.members.push(m);
    saveState();
    renderMemberList();
    renderCards();
  });

  // Sidebar
  document.querySelectorAll('.team-tab').forEach(tab => {
    tab.addEventListener('click', () => {
      document.querySelectorAll('.team-tab').forEach(t => t.classList.remove('active'));
      tab.classList.add('active');
      state.activeTeam = tab.dataset.team;
      renderMemberList();
    });
  });
  document.getElementById('btnAddMember').addEventListener('click', () => {
    const name = prompt('名前を入力してください（空欄でも可）');
    if (name === null) return;
    const m = makeMember({ name: name.trim(), team: state.activeTeam });
    state.members.push(m);
    saveState();
    renderMemberList();
  });
  document.getElementById('btnPlaceAll').addEventListener('click', () => {
    const team = state.activeTeam;
    const targets = state.members.filter(m => m.team === team);
    targets.forEach((m, i) => {
      m.onBoard = true;
      const cols = Math.ceil(Math.sqrt(targets.length));
      const row = Math.floor(i / cols);
      const col = i % cols;
      const xBase = team === 'own' ? 0.15 : 0.55;
      m.x = xBase + (col / Math.max(cols, 1)) * 0.3;
      m.y = 0.2 + (row / Math.max(cols, 1)) * 0.6;
    });
    saveState();
    renderMemberList();
    renderCards();
  });
  document.getElementById('btnRemoveAll').addEventListener('click', () => {
    state.members.filter(m => m.team === state.activeTeam).forEach(m => m.onBoard = false);
    saveState();
    renderMemberList();
    renderCards();
  });

  // Board toolbar — drawing
  document.getElementById('btnDrawToggle').addEventListener('click', toggleDrawMode);
  document.querySelectorAll('.bt-mode').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.bt-mode').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      drawTool.mode = btn.dataset.mode;
    });
  });
  document.getElementById('penColor').addEventListener('input', e => {
    drawTool.color = e.target.value;
  });
  document.getElementById('penWidth').addEventListener('input', e => {
    drawTool.width = Number(e.target.value);
  });
  document.getElementById('btnUndoStroke').addEventListener('click', undoStroke);
  document.getElementById('btnClearStrokes').addEventListener('click', clearStrokes);

  // Board toolbar — JSON / JPEG
  document.getElementById('btnJsonSave').addEventListener('click', jsonSave);
  document.getElementById('btnJsonLoad').addEventListener('click', () => {
    document.getElementById('jsonInput').click();
  });
  document.getElementById('jsonInput').addEventListener('change', e => {
    if (e.target.files[0]) jsonLoad(e.target.files[0]);
    e.target.value = '';
  });
  document.getElementById('btnJpegSave').addEventListener('click', jpegSave);

  // Modals
  document.querySelectorAll('.modal-close').forEach(btn => {
    btn.addEventListener('click', () => closeModal(btn.dataset.close));
  });
  document.querySelectorAll('.modal').forEach(modal => {
    modal.addEventListener('click', (e) => {
      if (e.target === modal) modal.classList.add('hidden');
    });
  });

  // Import tabs
  document.querySelectorAll('.import-tab').forEach(tab => {
    tab.addEventListener('click', () => {
      document.querySelectorAll('.import-tab').forEach(t => t.classList.remove('active'));
      tab.classList.add('active');
      const target = tab.dataset.tab;
      document.querySelectorAll('.import-panel').forEach(p => {
        p.classList.toggle('hidden', p.dataset.panel !== target);
      });
    });
  });

  document.getElementById('btnDoPasteImport').addEventListener('click', doPasteImport);
  document.getElementById('excelInput').addEventListener('change', e => {
    if (e.target.files[0]) doExcelImport(e.target.files[0]);
  });
  document.getElementById('btnDoGsheetImport').addEventListener('click', doGsheetImport);

  // Edit modal
  document.getElementById('btnSaveEdit').addEventListener('click', saveEdit);
  document.getElementById('btnDeleteMember').addEventListener('click', deleteEditing);

  // Bulk color
  document.getElementById('btnApplyBulk').addEventListener('click', applyBulkColor);

  // Share
  document.getElementById('btnCopyShare').addEventListener('click', copyShareUrl);
}

// ============================================================
// Init
// ============================================================
function init() {
  loadState();
  document.getElementById('boardName').value = state.boardName || '';
  document.getElementById('sportSelect').value = state.sport || 'free';
  renderBoardBackground();
  renderMemberList();
  renderCards();
  setupDrawCanvas();
  wireEvents();
}

document.addEventListener('DOMContentLoaded', init);
