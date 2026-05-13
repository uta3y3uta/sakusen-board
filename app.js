// ============================================================
// ならびっこ
// ============================================================

const STORAGE_KEY = 'sakusen-board-v3';

// Warm muted stroke color (visible on cream backgrounds, soft enough to keep cards prominent)
const STROKE = 'rgba(95,75,55,0.55)';
const STROKE_SOFT = 'rgba(95,75,55,0.3)';
const CHALKBOARD = 'rgba(46,68,52,0.85)';

// 20-color palette focused on major, recognizable colors (+ "その他" for free RGB)
const COLOR_PALETTE = [
  '#ffffff','#bfbfbf','#7a7a7a','#3d3d3d','#000000',
  '#e53935','#fb8c00','#fdd835','#43a047','#1e88e5',
  '#5e35b1','#d81b60','#00897b','#6d4c41','#1e3a5f',
  '#ffcdd2','#ffe0b2','#fff59d','#c8e6c9','#bbdefb'
];

// Font families for text element
const FONT_FAMILIES = {
  gothic: '"Hiragino Kaku Gothic ProN","Yu Gothic UI","Meiryo",sans-serif',
  mincho: '"Hiragino Mincho ProN","Yu Mincho","MS Mincho",serif',
  maru: '"Hiragino Maru Gothic ProN","Meiryo",sans-serif',
  rounded: '"M PLUS Rounded 1c","Comic Sans MS","Hiragino Maru Gothic ProN",cursive'
};

const DEFAULT_OWN_CARD = '#ffffff';
const DEFAULT_OWN_TEXT = '#1e3a5f';
const DEFAULT_OPP_CARD = '#ffe1e1';
const DEFAULT_OPP_TEXT = '#a93030';

let state = {
  boardName: '',
  sport: 'free',
  activeTeam: 'own',
  members: [],
  shapes: [],
  drawings: [],
  cardFontKey: 'gothic',
  cardFontScale: 1.0
};

let editingMemberId = null;
let selectedShapeId = null;
let selectedMemberIds = []; // array of member ids (group selection)
let selectedKind = null; // 'card' | 'shape' | null

const pickers = {};

// Drawing tool state
let drawTool = {
  mode: 'pen',
  color: '#e02e2e',
  width: 4,
  isDrawing: false,
  currentStroke: null
};

// ============================================================
// Undo / Redo history
// ============================================================
let historyStack = [];
let redoStack = [];
const HISTORY_LIMIT = 100;

function pushHistory(json) {
  if (historyStack.length > 0 && historyStack[historyStack.length - 1] === json) return;
  historyStack.push(json);
  if (historyStack.length > HISTORY_LIMIT) historyStack.shift();
  redoStack = [];
  updateHistoryButtons();
}

function applyState(json) {
  state = JSON.parse(json);
  // 再ロード時と同じ正規化を通す
  if (!state.drawings) state.drawings = [];
  if (!state.shapes) state.shapes = [];
  if (typeof state.cardFontKey !== 'string') state.cardFontKey = 'gothic';
  if (typeof state.cardFontScale !== 'number') state.cardFontScale = 1.0;
  state.members.forEach(m => {
    if (typeof m.scale !== 'number') m.scale = 1.0;
    if (typeof m.rotation !== 'number') m.rotation = 0;
  });
  if (!SPORT_SVGS[state.sport]) state.sport = 'free';
  try { localStorage.setItem(STORAGE_KEY, json); } catch (e) {}
  selectedShapeId = null;
  selectedMemberIds = [];
  selectedKind = null;
  // UI 反映
  const bn = document.getElementById('boardName'); if (bn) bn.value = state.boardName || '';
  const sp = document.getElementById('sportSelect'); if (sp) sp.value = state.sport || 'free';
  const cf = document.getElementById('cardFontFamily'); if (cf) cf.value = state.cardFontKey;
  const cs = document.getElementById('cardFontScale'); if (cs) cs.value = state.cardFontScale;
  renderBoardBackground();
  renderMemberList();
  renderCards();
  renderShapes();
  redrawStrokes();
  updateShapeToolbar();
  updateHistoryButtons();
}

function undo() {
  if (historyStack.length < 2) return;
  redoStack.push(historyStack.pop());
  applyState(historyStack[historyStack.length - 1]);
}

function redo() {
  if (redoStack.length === 0) return;
  const json = redoStack.pop();
  historyStack.push(json);
  applyState(json);
}

function updateHistoryButtons() {
  const u = document.getElementById('btnUndo');
  const r = document.getElementById('btnRedo');
  if (u) u.disabled = historyStack.length < 2;
  if (r) r.disabled = redoStack.length === 0;
}

// ============================================================
// State persistence
// ============================================================
function saveState() {
  const json = JSON.stringify(state);
  pushHistory(json);
  try {
    localStorage.setItem(STORAGE_KEY, json);
  } catch (e) {
    console.warn('保存に失敗しました', e);
  }
}

function loadState() {
  const fromUrl = decodeStateFromUrl();
  if (fromUrl) {
    state = Object.assign(state, fromUrl);
  } else {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        state = Object.assign(state, parsed);
      }
    } catch (e) {
      console.warn('読込に失敗しました', e);
    }
  }
  if (!state.drawings) state.drawings = [];
  if (!state.shapes) state.shapes = [];
  if (typeof state.cardFontKey !== 'string') state.cardFontKey = 'gothic';
  if (typeof state.cardFontScale !== 'number') state.cardFontScale = 1.0;
  // 既存メンバーへの後方互換用フィールド追加
  state.members.forEach(m => {
    if (typeof m.scale !== 'number') m.scale = 1.0;
    if (typeof m.rotation !== 'number') m.rotation = 0;
  });
  // 削除済みデザインのフォールバック
  if (!SPORT_SVGS[state.sport]) state.sport = 'free';
}

// ============================================================
// Utilities
// ============================================================
function uid(prefix = 'm_') {
  return prefix + Math.random().toString(36).slice(2, 10);
}

function defaultColorsFor(team) {
  return team === 'opponent'
    ? { card: DEFAULT_OPP_CARD, text: DEFAULT_OPP_TEXT }
    : { card: DEFAULT_OWN_CARD, text: DEFAULT_OWN_TEXT };
}

function makeMember({ name = '', other = '', team = 'own', number = '' } = {}) {
  const c = defaultColorsFor(team);
  return {
    id: uid('m_'),
    name, other, number,
    showNumber: false,
    team,
    cardColor: c.card,
    textColor: c.text,
    x: 0.5, y: 0.5,
    onBoard: false,
    scale: 1.0,
    rotation: 0
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

function clamp(v, lo, hi) { return Math.min(hi, Math.max(lo, v)); }

// ============================================================
// Color picker component
// ============================================================
function createColorPicker(initial, onChange, options = {}) {
  const wrap = document.createElement('div');
  wrap.className = 'color-picker' + (options.compact ? ' compact' : '');
  let value = initial || COLOR_PALETTE[0];
  const swatches = [];

  COLOR_PALETTE.forEach(c => {
    const s = document.createElement('span');
    s.className = 'cp-swatch';
    s.style.background = c;
    s.dataset.color = c;
    s.title = c;
    s.addEventListener('click', () => setValue(c));
    wrap.appendChild(s);
    swatches.push(s);
  });

  const custom = document.createElement('span');
  custom.className = 'cp-swatch cp-custom';
  custom.title = 'その他（自由な色を指定）';
  custom.textContent = '他';
  const input = document.createElement('input');
  input.type = 'color';
  input.className = 'cp-custom-input';
  input.value = value;
  custom.appendChild(input);
  input.addEventListener('input', e => setValue(e.target.value));
  wrap.appendChild(custom);

  function setValue(v, fireChange = true) {
    value = v;
    swatches.forEach(s => s.classList.remove('active'));
    custom.classList.remove('active');
    custom.style.background = '';
    const match = swatches.find(s => s.dataset.color === v);
    if (match) {
      match.classList.add('active');
    } else {
      custom.classList.add('active');
      custom.style.background = v;
    }
    input.value = v;
    if (fireChange && onChange) onChange(value);
  }

  setValue(value, false);

  return {
    el: wrap,
    getValue: () => value,
    setValue: (v) => setValue(v, false)
  };
}

// ============================================================
// 10 Board background designs (SVG)
// Minimal: no text, no decorative frames. Muted colors.
// viewBox: 1000 x 600
// ============================================================
const SPORT_SVGS = {
  // 1. フリー：白板＋うっすらグリッド
  free: () => `
    <defs>
      <pattern id="grid" width="40" height="40" patternUnits="userSpaceOnUse">
        <path d="M 40 0 L 0 0 0 40" fill="none" stroke="rgba(180,195,215,0.5)" stroke-width="0.6"/>
      </pattern>
    </defs>
    <rect width="1000" height="600" fill="url(#grid)"/>
  `,

  // 2. 校庭：トラックのみ（外枠の長方形・点線トラックは撤去）
  ground: () => `
    <rect x="100" y="110" width="800" height="380" rx="190" ry="190" fill="none" stroke="${STROKE}" stroke-width="2"/>
  `,

  // 3. 体育館：外枠＋横長ステージ（センターラインは撤去）
  assembly: () => `
    <rect x="40" y="40" width="920" height="520" fill="none" stroke="${STROKE}" stroke-width="2"/>
    <rect x="200" y="44" width="600" height="60" fill="rgba(95,75,55,0.16)" stroke="${STROKE}" stroke-width="2"/>
    <line x1="200" y1="74" x2="800" y2="74" stroke="${STROKE_SOFT}" stroke-width="1"/>
  `,

  // 4. 教室：外枠＋黒板（壁に貼り付け・さらに薄く）
  classroom: () => `
    <rect x="40" y="40" width="920" height="520" fill="none" stroke="${STROKE}" stroke-width="2"/>
    <rect x="220" y="40" width="560" height="60" fill="rgba(46,68,52,0.18)" stroke="${STROKE_SOFT}" stroke-width="1" rx="0"/>
    <rect x="225" y="44" width="550" height="52" fill="none" stroke="rgba(255,255,255,0.2)" stroke-width="1"/>
  `,

  // 5. ゴール型1（サッカー）：ピッチ枠／センターライン／センターサークル／ペナルティエリア／ゴールエリア／PKマーク／ペナルティアーク／ゴール／コーナー
  soccer: () => `
    <rect x="40" y="40" width="920" height="520" fill="none" stroke="${STROKE}" stroke-width="2"/>
    <line x1="500" y1="40" x2="500" y2="560" stroke="${STROKE}" stroke-width="2"/>
    <circle cx="500" cy="300" r="70" fill="none" stroke="${STROKE}" stroke-width="2"/>
    <circle cx="500" cy="300" r="3" fill="${STROKE}"/>
    <rect x="40" y="170" width="120" height="260" fill="none" stroke="${STROKE}" stroke-width="2"/>
    <rect x="40" y="230" width="50" height="140" fill="none" stroke="${STROKE}" stroke-width="2"/>
    <circle cx="120" cy="300" r="3" fill="${STROKE}"/>
    <path d="M 160 257 A 50 50 0 0 1 160 343" fill="none" stroke="${STROKE}" stroke-width="2"/>
    <rect x="840" y="170" width="120" height="260" fill="none" stroke="${STROKE}" stroke-width="2"/>
    <rect x="910" y="230" width="50" height="140" fill="none" stroke="${STROKE}" stroke-width="2"/>
    <circle cx="880" cy="300" r="3" fill="${STROKE}"/>
    <path d="M 840 257 A 50 50 0 0 0 840 343" fill="none" stroke="${STROKE}" stroke-width="2"/>
    <rect x="30" y="270" width="10" height="60" fill="none" stroke="${STROKE}" stroke-width="2"/>
    <rect x="960" y="270" width="10" height="60" fill="none" stroke="${STROKE}" stroke-width="2"/>
    <path d="M 40 50 A 10 10 0 0 1 50 40" fill="none" stroke="${STROKE}" stroke-width="1.5"/>
    <path d="M 950 40 A 10 10 0 0 1 960 50" fill="none" stroke="${STROKE}" stroke-width="1.5"/>
    <path d="M 40 550 A 10 10 0 0 0 50 560" fill="none" stroke="${STROKE}" stroke-width="1.5"/>
    <path d="M 950 560 A 10 10 0 0 0 960 550" fill="none" stroke="${STROKE}" stroke-width="1.5"/>
  `,

  // 6. ゴール型3（ラグビー）：トライライン／22mライン／10mライン（破線）／ハーフ／ゴールポスト(H)
  rugby: () => `
    <rect x="40" y="40" width="920" height="520" fill="none" stroke="${STROKE}" stroke-width="2"/>
    <line x1="500" y1="40" x2="500" y2="560" stroke="${STROKE}" stroke-width="2"/>
    <line x1="160" y1="40" x2="160" y2="560" stroke="${STROKE}" stroke-width="2"/>
    <line x1="840" y1="40" x2="840" y2="560" stroke="${STROKE}" stroke-width="2"/>
    <line x1="280" y1="40" x2="280" y2="560" stroke="${STROKE}" stroke-width="1.5"/>
    <line x1="720" y1="40" x2="720" y2="560" stroke="${STROKE}" stroke-width="1.5"/>
    <line x1="400" y1="40" x2="400" y2="560" stroke="${STROKE_SOFT}" stroke-width="1.5" stroke-dasharray="8,6"/>
    <line x1="600" y1="40" x2="600" y2="560" stroke="${STROKE_SOFT}" stroke-width="1.5" stroke-dasharray="8,6"/>
    <line x1="154" y1="280" x2="166" y2="280" stroke="${STROKE}" stroke-width="3"/>
    <line x1="160" y1="280" x2="160" y2="320" stroke="${STROKE}" stroke-width="3"/>
    <line x1="154" y1="320" x2="166" y2="320" stroke="${STROKE}" stroke-width="3"/>
    <line x1="834" y1="280" x2="846" y2="280" stroke="${STROKE}" stroke-width="3"/>
    <line x1="840" y1="280" x2="840" y2="320" stroke="${STROKE}" stroke-width="3"/>
    <line x1="834" y1="320" x2="846" y2="320" stroke="${STROKE}" stroke-width="3"/>
  `,

  // 7. ベースボール型：内野ダイヤを下寄せにして外野にカードを置けるように
  baseball: () => `
    <polygon points="500,540 600,440 500,340 400,440" fill="none" stroke="${STROKE}" stroke-width="2"/>
    <line x1="500" y1="540" x2="220" y2="260" stroke="${STROKE}" stroke-width="1.5"/>
    <line x1="500" y1="540" x2="780" y2="260" stroke="${STROKE}" stroke-width="1.5"/>
    <path d="M 220 260 Q 500 40 780 260" fill="none" stroke="${STROKE_SOFT}" stroke-width="1.5" stroke-dasharray="6,6"/>
    <circle cx="500" cy="460" r="14" fill="none" stroke="${STROKE}" stroke-width="2"/>
    <rect x="492" y="536" width="16" height="12" fill="${STROKE}"/>
    <rect x="592" y="436" width="14" height="12" fill="${STROKE}"/>
    <rect x="394" y="436" width="14" height="12" fill="${STROKE}"/>
    <polygon points="500,332 508,344 500,350 492,344" fill="${STROKE}"/>
  `,

  // 8. ゴール型2（バスケットボール）：コート枠／センター／センターサークル／制限区域／フリースロー／3Pライン／リング
  basketball: () => `
    <rect x="40" y="40" width="920" height="520" fill="none" stroke="${STROKE}" stroke-width="2"/>
    <line x1="500" y1="40" x2="500" y2="560" stroke="${STROKE}" stroke-width="2"/>
    <circle cx="500" cy="300" r="60" fill="none" stroke="${STROKE}" stroke-width="2"/>
    <rect x="40" y="180" width="170" height="240" fill="none" stroke="${STROKE}" stroke-width="2"/>
    <rect x="790" y="180" width="170" height="240" fill="none" stroke="${STROKE}" stroke-width="2"/>
    <path d="M 210 240 A 60 60 0 0 1 210 360" fill="none" stroke="${STROKE}" stroke-width="2"/>
    <path d="M 790 240 A 60 60 0 0 0 790 360" fill="none" stroke="${STROKE}" stroke-width="2"/>
    <path d="M 40 90 Q 320 300 40 510" fill="none" stroke="${STROKE}" stroke-width="2"/>
    <path d="M 960 90 Q 680 300 960 510" fill="none" stroke="${STROKE}" stroke-width="2"/>
    <circle cx="90" cy="300" r="6" fill="none" stroke="${STROKE}" stroke-width="2"/>
    <circle cx="910" cy="300" r="6" fill="none" stroke="${STROKE}" stroke-width="2"/>
  `,

  // 9. ネット型（バレーボール）：コート枠／ネットのみ（アタックラインの点線は撤去）
  volleyball: () => `
    <rect x="60" y="100" width="880" height="400" fill="none" stroke="${STROKE}" stroke-width="2"/>
    <line x1="500" y1="80" x2="500" y2="520" stroke="${STROKE}" stroke-width="4"/>
  `,

  // 10. ドッジボール：内野コート（実線）／センターライン（外野の点線は撤去）
  dodgeball: () => `
    <rect x="180" y="140" width="640" height="320" fill="none" stroke="${STROKE}" stroke-width="2.5"/>
    <line x1="500" y1="140" x2="500" y2="460" stroke="${STROKE}" stroke-width="2.5"/>
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
    li.textContent = 'メンバーがいません。「取込」または「＋空白」で追加してください。';
    ul.appendChild(li);
    return;
  }
  filtered.forEach((m, idx) => {
    const li = document.createElement('li');
    li.className = 'member-item';
    li.dataset.id = m.id;
    li.draggable = true;
    li.addEventListener('dragstart', (e) => {
      e.dataTransfer.effectAllowed = 'move';
      e.dataTransfer.setData('text/plain', m.id);
      li.classList.add('dragging');
    });
    li.addEventListener('dragend', () => {
      li.classList.remove('dragging');
      document.querySelectorAll('.member-item.drag-over-top, .member-item.drag-over-bottom')
        .forEach(el => el.classList.remove('drag-over-top', 'drag-over-bottom'));
    });
    li.addEventListener('dragover', (e) => {
      e.preventDefault();
      e.dataTransfer.dropEffect = 'move';
      const rect = li.getBoundingClientRect();
      const above = (e.clientY - rect.top) < rect.height / 2;
      li.classList.toggle('drag-over-top', above);
      li.classList.toggle('drag-over-bottom', !above);
    });
    li.addEventListener('dragleave', () => {
      li.classList.remove('drag-over-top', 'drag-over-bottom');
    });
    li.addEventListener('drop', (e) => {
      e.preventDefault();
      const srcId = e.dataTransfer.getData('text/plain');
      const rect = li.getBoundingClientRect();
      const above = (e.clientY - rect.top) < rect.height / 2;
      li.classList.remove('drag-over-top', 'drag-over-bottom');
      if (srcId && srcId !== m.id) reorderMembers(srcId, m.id, above ? 'before' : 'after');
    });

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

    li.append(numCell, nameWrap, toggle, edit);
    ul.appendChild(li);
  });
}

function reorderMembers(srcId, dstId, position) {
  const srcIdx = state.members.findIndex(x => x.id === srcId);
  if (srcIdx === -1) return;
  const [src] = state.members.splice(srcIdx, 1);
  let dstIdx = state.members.findIndex(x => x.id === dstId);
  if (dstIdx === -1) {
    state.members.push(src);
  } else {
    if (position === 'after') dstIdx += 1;
    state.members.splice(dstIdx, 0, src);
  }
  saveState();
  renderMemberList();
  renderCards();
}

// ============================================================
// Card rendering
// ============================================================
function renderCards() {
  const layer = document.getElementById('cardLayer');
  layer.innerHTML = '';
  const indexMap = {};
  state.members.forEach((m, i) => { indexMap[m.id] = i; });

  const fontFamily = FONT_FAMILIES[state.cardFontKey] || FONT_FAMILIES.gothic;
  const fontScale = state.cardFontScale || 1.0;

  state.members.filter(m => m.onBoard).forEach(m => {
    const card = document.createElement('div');
    card.className = 'card team-' + m.team;
    if (!m.name && !m.other) card.classList.add('empty');
    if (selectedMemberIds.includes(m.id)) card.classList.add('selected');
    card.dataset.id = m.id;
    card.style.left = (m.x * 100) + '%';
    card.style.top = (m.y * 100) + '%';
    card.style.background = m.cardColor;
    card.style.color = m.textColor;
    card.style.fontFamily = fontFamily;
    const scale = (typeof m.scale === 'number' ? m.scale : 1.0);
    const rotation = (typeof m.rotation === 'number' ? m.rotation : 0);
    // 13px はカードの基底フォントサイズ
    card.style.fontSize = (13 * fontScale) + 'px';
    card.style.transform = `translate(-50%, -50%) rotate(${rotation}deg) scale(${scale})`;

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

    // 単独選択時のみ，リサイズ・回転ハンドルを表示（■と同じ見た目）
    if (selectedKind === 'card' && selectedMemberIds.length === 1 && selectedMemberIds[0] === m.id) {
      const bbox = document.createElement('div');
      bbox.className = 'card-bbox';
      card.appendChild(bbox);
      const hResize = document.createElement('div');
      hResize.className = 'card-handle handle-resize';
      hResize.dataset.handle = 'resize';
      card.appendChild(hResize);
      const hRotate = document.createElement('div');
      hRotate.className = 'card-handle handle-rotate';
      hRotate.dataset.handle = 'rotate';
      card.appendChild(hRotate);
    }

    attachCardDrag(card, m);
    card.addEventListener('dblclick', () => openEditModal(m.id));
    layer.appendChild(card);
  });
}

function attachCardDrag(card, member) {
  let action = null; // 'move' | 'resize' | 'rotate'
  let start = {};
  let groupOrigins = []; // [{id, x, y}] for move

  const onDown = (e) => {
    if (document.getElementById('board').classList.contains('draw-mode')) return;
    e.preventDefault();
    e.stopPropagation();
    const p = e.touches ? e.touches[0] : e;
    const handle = e.target.closest('.card-handle');

    if (handle) {
      // 単独選択中のみハンドルが存在するので，このカードを選択状態にする
      selectCard(member.id);
      action = handle.dataset.handle === 'resize' ? 'resize' : 'rotate';
      const boardRect = document.getElementById('board').getBoundingClientRect();
      const centerX = boardRect.left + member.x * boardRect.width;
      const centerY = boardRect.top + member.y * boardRect.height;
      // offsetWidth/Height は transform を無視するので，そのまま自然サイズとして使える
      const naturalW = card.offsetWidth;
      const naturalH = card.offsetHeight;
      start = {
        clientX: p.clientX, clientY: p.clientY,
        centerX, centerY,
        scale: member.scale || 1.0,
        rotation: member.rotation || 0,
        naturalW, naturalH,
        halfDiag: Math.sqrt((naturalW / 2) ** 2 + (naturalH / 2) ** 2),
        startMouseAngle: Math.atan2(p.clientY - centerY, p.clientX - centerX) * 180 / Math.PI
      };
    } else {
      action = 'move';
      card.classList.add('dragging');
      if (!selectedMemberIds.includes(member.id)) {
        selectCard(member.id);
      }
      const ids = selectedMemberIds.length > 0 ? [...selectedMemberIds] : [member.id];
      groupOrigins = ids
        .map(id => state.members.find(m => m.id === id))
        .filter(Boolean)
        .filter(m => m.onBoard)
        .map(m => ({ id: m.id, x: m.x, y: m.y }));
      start = { clientX: p.clientX, clientY: p.clientY };
    }

    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
    document.addEventListener('touchmove', onMove, { passive: false });
    document.addEventListener('touchend', onUp);
  };

  const onMove = (e) => {
    if (!action) return;
    e.preventDefault();
    const p = e.touches ? e.touches[0] : e;

    if (action === 'move') {
      const board = document.getElementById('board');
      const rect = board.getBoundingClientRect();
      let dx = (p.clientX - start.clientX) / rect.width;
      let dy = (p.clientY - start.clientY) / rect.height;
      let minDx = -1, maxDx = 1, minDy = -1, maxDy = 1;
      groupOrigins.forEach(o => {
        minDx = Math.max(minDx, -o.x);
        maxDx = Math.min(maxDx, 1 - o.x);
        minDy = Math.max(minDy, -o.y);
        maxDy = Math.min(maxDy, 1 - o.y);
      });
      dx = clamp(dx, minDx, maxDx);
      dy = clamp(dy, minDy, maxDy);
      groupOrigins.forEach(o => {
        const m = state.members.find(x => x.id === o.id);
        if (!m) return;
        m.x = o.x + dx;
        m.y = o.y + dy;
        const el = document.querySelector(`.card[data-id="${o.id}"]`);
        if (el) {
          el.style.left = (m.x * 100) + '%';
          el.style.top = (m.y * 100) + '%';
        }
      });
    } else if (action === 'resize') {
      // マウス位置をカードのローカル座標（回転を逆適用）に変換
      const mx = p.clientX - start.centerX;
      const my = p.clientY - start.centerY;
      const rad = -start.rotation * Math.PI / 180;
      const lx = mx * Math.cos(rad) - my * Math.sin(rad);
      const ly = mx * Math.sin(rad) + my * Math.cos(rad);
      const localR = Math.sqrt(lx * lx + ly * ly);
      let newScale = localR / start.halfDiag;
      newScale = clamp(newScale, 0.4, 4.0);
      member.scale = newScale;
      card.style.transform = `translate(-50%, -50%) rotate(${start.rotation}deg) scale(${newScale})`;
    } else if (action === 'rotate') {
      const cur = Math.atan2(p.clientY - start.centerY, p.clientX - start.centerX) * 180 / Math.PI;
      let newRot = start.rotation + (cur - start.startMouseAngle);
      // Shift で 15° スナップ
      if (e.shiftKey) newRot = Math.round(newRot / 15) * 15;
      member.rotation = newRot;
      card.style.transform = `translate(-50%, -50%) rotate(${newRot}deg) scale(${member.scale || 1.0})`;
    }
  };

  const onUp = () => {
    if (!action) return;
    action = null;
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
// Shapes (rect / circle / triangle / arrow / line / double-arrow)
// ============================================================
function makeShape(type) {
  const s = {
    id: uid('s_'),
    type,
    x: 0.5, y: 0.5,
    w: 0.12, h: 0.12,
    rotation: 0,
    color: '#1e3a5f',
    strokeWidth: 3,
    filled: false
  };
  if (type === 'arrow' || type === 'double-arrow' || type === 'line') {
    s.w = 0.22;
    s.h = 0.06;
  }
  if (type === 'text') {
    s.content = 'テキスト';
    s.fontKey = 'gothic';
    s.fontSize = 0.028; // ~17px on 600px board (close to name card font)
    s.color = '#3d2f1f';
    s.w = 0.08;  // ~80px wide (close to name card)
    s.h = 0.05;  // ~30px tall
  }
  return s;
}

function shapeInnerSvg(shape) {
  const c = shape.color;
  const sw = shape.strokeWidth || 3;
  const fill = shape.filled ? c : 'none';
  const ns = ` vector-effect="non-scaling-stroke"`;
  if (shape.type === 'rect') {
    return `<rect x="3" y="3" width="94" height="94" fill="${fill}" stroke="${c}" stroke-width="${sw}"${ns}/>`;
  }
  if (shape.type === 'circle') {
    return `<ellipse cx="50" cy="50" rx="47" ry="47" fill="${fill}" stroke="${c}" stroke-width="${sw}"${ns}/>`;
  }
  if (shape.type === 'triangle') {
    return `<polygon points="50,5 95,95 5,95" fill="${fill}" stroke="${c}" stroke-width="${sw}"${ns} stroke-linejoin="round"/>`;
  }
  if (shape.type === 'line') {
    return `<line x1="3" y1="50" x2="97" y2="50" stroke="${c}" stroke-width="${sw}"${ns} stroke-linecap="round"/>`;
  }
  if (shape.type === 'arrow') {
    return `
      <line x1="3" y1="50" x2="78" y2="50" stroke="${c}" stroke-width="${sw}"${ns} stroke-linecap="round"/>
      <polygon points="97,50 78,34 78,66" fill="${c}" stroke="${c}" stroke-width="${sw}"${ns} stroke-linejoin="round"/>
    `;
  }
  if (shape.type === 'double-arrow') {
    return `
      <line x1="22" y1="50" x2="78" y2="50" stroke="${c}" stroke-width="${sw}"${ns} stroke-linecap="round"/>
      <polygon points="3,50 22,34 22,66" fill="${c}" stroke="${c}" stroke-width="${sw}"${ns} stroke-linejoin="round"/>
      <polygon points="97,50 78,34 78,66" fill="${c}" stroke="${c}" stroke-width="${sw}"${ns} stroke-linejoin="round"/>
    `;
  }
  return '';
}

function renderShapes() {
  const layer = document.getElementById('shapeLayer');
  layer.innerHTML = '';
  const board = document.getElementById('board');
  const rect = board.getBoundingClientRect();
  state.shapes.forEach(s => {
    const div = document.createElement('div');
    div.className = 'shape shape-' + s.type + (s.id === selectedShapeId ? ' selected' : '');
    div.dataset.id = s.id;
    div.style.left = (s.x * 100) + '%';
    div.style.top = (s.y * 100) + '%';
    div.style.transform = `translate(-50%, -50%) rotate(${s.rotation}deg)`;

    div.style.width = (s.w * rect.width) + 'px';
    div.style.height = (s.h * rect.height) + 'px';

    if (s.type === 'text') {
      const span = document.createElement('span');
      span.className = 'text-content';
      span.textContent = s.content || 'テキスト';
      span.style.fontFamily = FONT_FAMILIES[s.fontKey] || FONT_FAMILIES.gothic;
      span.style.fontSize = (s.fontSize * rect.height) + 'px';
      span.style.color = s.color;
      div.appendChild(span);
      div.addEventListener('dblclick', (e) => { e.stopPropagation(); editTextShapeContent(s.id); });
    } else {
      div.innerHTML = `<svg viewBox="0 0 100 100" preserveAspectRatio="none">${shapeInnerSvg(s)}</svg>`;
    }

    if (s.id === selectedShapeId) {
      const bbox = document.createElement('div');
      bbox.className = 'shape-bbox';
      div.appendChild(bbox);
      const hResize = document.createElement('div');
      hResize.className = 'shape-handle handle-resize';
      hResize.dataset.handle = 'resize';
      div.appendChild(hResize);
      const hRotate = document.createElement('div');
      hRotate.className = 'shape-handle handle-rotate';
      hRotate.dataset.handle = 'rotate';
      div.appendChild(hRotate);
    }

    attachShapeEvents(div, s);
    layer.appendChild(div);
  });
}

function editTextShapeContent(id) {
  const s = state.shapes.find(x => x.id === id);
  if (!s || s.type !== 'text') return;
  const v = prompt('テキストを入力してください', s.content || '');
  if (v === null) return;
  s.content = v;
  saveState();
  renderShapes();
}

function attachShapeEvents(div, shape) {
  let action = null;
  let start = {};

  const onDown = (e) => {
    if (document.getElementById('board').classList.contains('draw-mode')) return;
    e.stopPropagation();
    e.preventDefault();
    const p = e.touches ? e.touches[0] : e;
    const handle = e.target.closest('.shape-handle');
    const board = document.getElementById('board');
    const boardRect = board.getBoundingClientRect();
    const centerX = boardRect.left + shape.x * boardRect.width;
    const centerY = boardRect.top + shape.y * boardRect.height;

    if (handle) {
      action = handle.dataset.handle === 'resize' ? 'resize' : 'rotate';
    } else {
      action = 'move';
      selectShape(shape.id);
    }

    start = {
      clientX: p.clientX, clientY: p.clientY,
      boardWidth: boardRect.width, boardHeight: boardRect.height,
      x: shape.x, y: shape.y,
      w: shape.w, h: shape.h,
      rotation: shape.rotation,
      centerX, centerY
    };

    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
    document.addEventListener('touchmove', onMove, { passive: false });
    document.addEventListener('touchend', onUp);
  };

  const onMove = (e) => {
    if (!action) return;
    e.preventDefault();
    const p = e.touches ? e.touches[0] : e;

    if (action === 'move') {
      const dx = (p.clientX - start.clientX) / start.boardWidth;
      const dy = (p.clientY - start.clientY) / start.boardHeight;
      shape.x = clamp(start.x + dx, 0, 1);
      shape.y = clamp(start.y + dy, 0, 1);
      div.style.left = (shape.x * 100) + '%';
      div.style.top = (shape.y * 100) + '%';
    } else if (action === 'resize') {
      const mx = p.clientX - start.centerX;
      const my = p.clientY - start.centerY;
      const rad = -start.rotation * Math.PI / 180;
      const localX = mx * Math.cos(rad) - my * Math.sin(rad);
      const localY = mx * Math.sin(rad) + my * Math.cos(rad);
      const minPx = 20;
      const halfWpx = Math.max(minPx, Math.abs(localX));
      const halfHpx = Math.max(minPx, Math.abs(localY));
      shape.w = (halfWpx * 2) / start.boardWidth;
      shape.h = (halfHpx * 2) / start.boardHeight;
      div.style.width = (halfWpx * 2) + 'px';
      div.style.height = (halfHpx * 2) + 'px';
    } else if (action === 'rotate') {
      const angle = Math.atan2(p.clientY - start.centerY, p.clientX - start.centerX);
      shape.rotation = (angle * 180 / Math.PI) + 90;
      div.style.transform = `translate(-50%, -50%) rotate(${shape.rotation}deg)`;
    }
  };

  const onUp = () => {
    if (!action) return;
    action = null;
    document.removeEventListener('mousemove', onMove);
    document.removeEventListener('mouseup', onUp);
    document.removeEventListener('touchmove', onMove);
    document.removeEventListener('touchend', onUp);
    saveState();
  };

  div.addEventListener('mousedown', onDown);
  div.addEventListener('touchstart', onDown, { passive: false });
}

function selectShape(id) {
  selectedKind = 'shape';
  selectedMemberIds = [];
  document.querySelectorAll('.card.selected').forEach(c => c.classList.remove('selected'));
  if (selectedShapeId === id) return;
  selectedShapeId = id;
  renderShapes();
  updateShapeToolbar();
}

function deselectShape() {
  if (selectedKind === 'shape') selectedKind = null;
  if (!selectedShapeId) return;
  selectedShapeId = null;
  renderShapes();
  updateShapeToolbar();
}

function selectCard(memberId) {
  selectCards([memberId]);
}

function selectCards(ids) {
  selectedKind = 'card';
  selectedMemberIds = Array.isArray(ids) ? [...ids] : [];
  if (selectedShapeId) {
    selectedShapeId = null;
    updateShapeToolbar();
  }
  // 再描画して，単独選択時にハンドル付きで描き直す
  renderCards();
  renderShapes();
}

function deselectCard() {
  if (selectedKind === 'card') selectedKind = null;
  selectedMemberIds = [];
  renderCards();
}

function deleteSelected() {
  if (selectedKind === 'shape' && selectedShapeId) {
    deleteSelectedShape();
  } else if (selectedKind === 'card' && selectedMemberIds.length > 0) {
    selectedMemberIds.forEach(id => {
      const m = state.members.find(x => x.id === id);
      if (m) m.onBoard = false;
    });
    saveState();
    renderMemberList();
    renderCards();
    selectedMemberIds = [];
    selectedKind = null;
  }
}

// ============================================================
// Marquee (rubber-band) selection on the board
// ============================================================
function setupMarqueeSelect() {
  const boardEl = document.getElementById('board');
  let marquee = null;
  let startNorm = null; // { x, y } in 0-1 board coords
  let moved = false;

  const isEmptyArea = (target) => {
    const id = target.id;
    if (id === 'board' || id === 'boardBg' || id === 'shapeLayer' || id === 'cardLayer') return true;
    // Clicks on the SVG background's child elements (rects, lines, etc.) also count as empty
    if (target.closest && target.closest('#boardBg') && !target.closest('.card, .shape')) return true;
    return false;
  };

  const getNorm = (e) => {
    const r = boardEl.getBoundingClientRect();
    const p = e.touches ? e.touches[0] : e;
    return {
      x: clamp((p.clientX - r.left) / r.width, 0, 1),
      y: clamp((p.clientY - r.top) / r.height, 0, 1)
    };
  };

  const onDown = (e) => {
    if (boardEl.classList.contains('draw-mode')) return;
    if (!isEmptyArea(e.target)) return;
    e.preventDefault();

    // Empty-area mousedown: immediately drop shape selection
    deselectShape();

    startNorm = getNorm(e);
    moved = false;

    marquee = document.createElement('div');
    marquee.className = 'board-marquee';
    marquee.style.left = (startNorm.x * 100) + '%';
    marquee.style.top = (startNorm.y * 100) + '%';
    marquee.style.width = '0';
    marquee.style.height = '0';
    boardEl.appendChild(marquee);

    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
    document.addEventListener('touchmove', onMove, { passive: false });
    document.addEventListener('touchend', onUp);
  };

  const onMove = (e) => {
    if (!marquee || !startNorm) return;
    e.preventDefault();
    const cur = getNorm(e);
    const x1 = Math.min(startNorm.x, cur.x);
    const y1 = Math.min(startNorm.y, cur.y);
    const x2 = Math.max(startNorm.x, cur.x);
    const y2 = Math.max(startNorm.y, cur.y);
    marquee.style.left = (x1 * 100) + '%';
    marquee.style.top = (y1 * 100) + '%';
    marquee.style.width = ((x2 - x1) * 100) + '%';
    marquee.style.height = ((y2 - y1) * 100) + '%';
    if (Math.abs(cur.x - startNorm.x) > 0.005 || Math.abs(cur.y - startNorm.y) > 0.005) {
      moved = true;
    }
  };

  const onUp = (e) => {
    document.removeEventListener('mousemove', onMove);
    document.removeEventListener('mouseup', onUp);
    document.removeEventListener('touchmove', onMove);
    document.removeEventListener('touchend', onUp);
    if (!marquee || !startNorm) return;

    if (moved) {
      // Read final rectangle from the marquee div, then capture cards inside
      const cur = e.changedTouches ? getNorm({ touches: [e.changedTouches[0]] }) : getNorm(e);
      const x1 = Math.min(startNorm.x, cur.x);
      const y1 = Math.min(startNorm.y, cur.y);
      const x2 = Math.max(startNorm.x, cur.x);
      const y2 = Math.max(startNorm.y, cur.y);
      const captured = state.members
        .filter(m => m.onBoard && m.x >= x1 && m.x <= x2 && m.y >= y1 && m.y <= y2)
        .map(m => m.id);
      if (captured.length > 0) {
        selectCards(captured);
      } else {
        deselectCard();
      }
    } else {
      // Plain click on empty area → deselect everything
      deselectCard();
    }

    marquee.remove();
    marquee = null;
    startNorm = null;
    moved = false;
  };

  boardEl.addEventListener('mousedown', onDown);
  boardEl.addEventListener('touchstart', onDown, { passive: false });
}

function updateShapeToolbar() {
  const tb = document.getElementById('shapeEditToolbar');
  const s = state.shapes.find(x => x.id === selectedShapeId);
  if (!s) {
    tb.classList.add('hidden');
    return;
  }
  tb.classList.remove('hidden');
  pickers.shape.setValue(s.color);

  const shapeOnly = document.getElementById('shapeOnlyControls');
  const textOnly = document.getElementById('textOnlyControls');

  if (s.type === 'text') {
    shapeOnly.classList.add('hidden');
    textOnly.classList.remove('hidden');
    document.getElementById('textFontFamily').value = s.fontKey || 'gothic';
    document.getElementById('textFontSize').value = Math.round((s.fontSize || 0.032) * 1000);
    document.getElementById('btnEditText').classList.remove('hidden');
  } else {
    shapeOnly.classList.remove('hidden');
    textOnly.classList.add('hidden');
    document.getElementById('btnEditText').classList.add('hidden');
    document.getElementById('shapeStrokeWidth').value = s.strokeWidth;
    document.getElementById('btnShapeFill').classList.toggle('active', !!s.filled);
  }
}

function addShape(type) {
  const s = makeShape(type);
  state.shapes.push(s);
  selectedShapeId = s.id;
  selectedKind = 'shape';
  selectedMemberIds = [];
  document.querySelectorAll('.card.selected').forEach(c => c.classList.remove('selected'));
  saveState();
  renderShapes();
  updateShapeToolbar();
}

function rotateSelectedShape(deg) {
  const s = state.shapes.find(x => x.id === selectedShapeId);
  if (!s) return;
  s.rotation = (s.rotation + deg) % 360;
  saveState();
  renderShapes();
}

function duplicateSelectedShape() {
  const s = state.shapes.find(x => x.id === selectedShapeId);
  if (!s) return;
  const copy = JSON.parse(JSON.stringify(s));
  copy.id = uid('s_');
  copy.x = clamp(copy.x + 0.04, 0, 1);
  copy.y = clamp(copy.y + 0.04, 0, 1);
  state.shapes.push(copy);
  selectedShapeId = copy.id;
  saveState();
  renderShapes();
  updateShapeToolbar();
}

function deleteSelectedShape() {
  if (!selectedShapeId) return;
  state.shapes = state.shapes.filter(s => s.id !== selectedShapeId);
  selectedShapeId = null;
  saveState();
  renderShapes();
  updateShapeToolbar();
}

function toggleSelectedShapeFill() {
  const s = state.shapes.find(x => x.id === selectedShapeId);
  if (!s) return;
  s.filled = !s.filled;
  saveState();
  renderShapes();
  updateShapeToolbar();
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
    renderShapes();
  };
  window.addEventListener('resize', resize);
  requestAnimationFrame(resize);
  new ResizeObserver(resize).observe(board);

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

  const onUp = () => {
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
  const threshold = 0.018;
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
  btn.textContent = on ? '描画終了' : '描画';
  tools.classList.toggle('hidden', !on);
  if (on) deselectShape();
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
    else if (delimiter === 'space') {
      // 明示的にスペース区切り指定のときのみ，スペースで分割する
      parts = line.split(/\s+/);
    } else {
      // 自動判定：タブ・カンマがあればそれで区切る。
      // それ以外は氏名内のスペース（例：「鈴木 優太」）を尊重し，
      // 先頭に「数字＋スペース」がある場合のみ番号と氏名に分ける。
      if (line.includes('\t')) parts = line.split('\t');
      else if (line.includes(',')) parts = line.split(',');
      else {
        const m = line.match(/^(\d{1,3})[\s\u3000]+(.+)$/);
        parts = m ? [m[1], m[2]] : [line];
      }
    }
    parts = parts.map(p => p.trim());

    let number = '', name = '', other = '';
    const firstIsNum = /^\d{1,3}$/.test(parts[0]);
    const useNumber = firstColMode === 'number' || (firstColMode === 'auto' && firstIsNum && parts.length > 1);
    if (useNumber) {
      number = parts[0]; name = parts[1] || ''; other = parts[2] || '';
    } else {
      name = parts[0] || ''; other = parts[1] || '';
    }
    return { number, name, other };
  });
}

function importMembers(rows, team) {
  rows.forEach(r => {
    state.members.push(makeMember({ name: r.name, other: r.other, team, number: r.number }));
  });
  saveState();
  renderMemberList();
}

function doPasteImport() {
  const text = document.getElementById('pasteInput').value;
  const delim = document.getElementById('pasteDelimiter').value;
  const team = document.getElementById('pasteTeam').value;
  const firstCol = document.getElementById('pasteFirstCol').value;
  if (!text.trim()) { alert('テキストが入力されていません。'); return; }
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
        if (/^\d{1,3}$/.test(c0) && (c1 || c2)) { number = c0; name = c1; other = c2; }
        else { name = c0; other = c1; }
        if (!name && !other && !number) return;
        parsed.push({ number, name, other });
      });
      if (parsed.length === 0) { alert('取り込めるデータがありませんでした。'); return; }
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
  if (!url) { alert('URLが入力されていません。'); return; }
  try {
    const res = await fetch(url);
    if (!res.ok) throw new Error('HTTP ' + res.status);
    const csv = await res.text();
    const rows = parsePasted(csv, 'comma', 'auto');
    if (rows.length === 0) { alert('取り込めるデータがありませんでした。'); return; }
    importMembers(rows, team);
    document.getElementById('gsheetUrl').value = '';
    closeModal('importModal');
  } catch (err) {
    alert('Googleスプレッドシートの読み込みに失敗しました。\nURLを確認するか，スプレッドシートをコピー＆ペーストで取り込んでください。\n\n詳細：' + err.message);
  }
}

// ============================================================
// JSON save / load
// ============================================================
function jsonSave() {
  const data = JSON.stringify(state, null, 2);
  const name = (state.boardName || 'narabikko').replace(/[^\w\-ぁ-んァ-ヶ一-龯]/g, '_');
  downloadFile(`${name}_${timestamp()}.json`, data, 'application/json');
}

function jsonLoad(file) {
  const reader = new FileReader();
  reader.onload = (e) => {
    try {
      const parsed = JSON.parse(e.target.result);
      if (!parsed.members) throw new Error('不正な「ならびっこ」JSONです');
      if (!confirm('現在のボードを読み込みデータで置き換えます。よろしいですか？')) return;
      state = Object.assign({
        boardName: '', sport: 'free', activeTeam: 'own',
        members: [], shapes: [], drawings: []
      }, parsed);
      if (!state.shapes) state.shapes = [];
      if (!state.drawings) state.drawings = [];
      selectedShapeId = null;
      saveState();
      document.getElementById('boardName').value = state.boardName || '';
      document.getElementById('sportSelect').value = state.sport || 'free';
      renderBoardBackground();
      renderMemberList();
      renderCards();
      renderShapes();
      redrawStrokes();
      updateShapeToolbar();
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
  // Temporarily deselect so handles don't show in capture
  const prevSelected = selectedShapeId;
  selectedShapeId = null;
  renderShapes();
  try {
    const canvas = await html2canvas(board, {
      backgroundColor: null,
      scale: 2,
      useCORS: true,
      logging: false
    });
    canvas.toBlob((blob) => {
      if (!blob) { alert('画像の生成に失敗しました。'); return; }
      const name = (state.boardName || 'narabikko').replace(/[^\w\-ぁ-んァ-ヶ一-龯]/g, '_');
      downloadFile(`${name}_${timestamp()}.jpg`, blob);
    }, 'image/jpeg', 0.92);
  } catch (err) {
    console.error(err);
    alert('JPEG保存に失敗しました：' + err.message);
  } finally {
    selectedShapeId = prevSelected;
    renderShapes();
  }
}

// ============================================================
// Modal helpers
// ============================================================
function openModal(id) { document.getElementById(id).classList.remove('hidden'); }
function closeModal(id) { document.getElementById(id).classList.add('hidden'); }

// ============================================================
// Edit Modal
// ============================================================
function openEditModal(memberId) {
  const m = state.members.find(x => x.id === memberId);
  if (!m) return;
  editingMemberId = memberId;
  document.getElementById('editName').value = m.name;
  document.getElementById('editOther').value = m.other;
  document.getElementById('editTeam').value = m.team;
  pickers.editCard.setValue(m.cardColor);
  pickers.editText.setValue(m.textColor);
  document.getElementById('editShowNumber').checked = !!m.showNumber;
  document.getElementById('editOnBoard').checked = m.onBoard;
  openModal('memberEditModal');
}

function saveEdit() {
  if (!editingMemberId) return;
  const m = state.members.find(x => x.id === editingMemberId);
  if (!m) return;
  m.name = document.getElementById('editName').value;
  m.other = document.getElementById('editOther').value;
  m.team = document.getElementById('editTeam').value;
  m.cardColor = pickers.editCard.getValue();
  m.textColor = pickers.editText.getValue();
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
function openBulkModal() {
  pickers.bulkCard.setValue('#ffffff');
  pickers.bulkText.setValue('#1e1e1e');
  document.getElementById('bulkShowNumber').checked = false;
  openModal('bulkColorModal');
}

function applyBulkColor() {
  const target = document.getElementById('bulkTarget').value;
  const card = pickers.bulkCard.getValue();
  const text = pickers.bulkText.getValue();
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
  document.getElementById('shareUrl').value = encodeStateToUrl();
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
  document.getElementById('btnBulkColor').addEventListener('click', openBulkModal);
  document.getElementById('btnShare').addEventListener('click', openShareModal);
  document.getElementById('btnClear').addEventListener('click', () => {
    if (!confirm('すべてのメンバー・カード・図形・描画を削除します。よろしいですか？')) return;
    state.members = [];
    state.shapes = [];
    state.drawings = [];
    selectedShapeId = null;
    saveState();
    renderMemberList();
    renderCards();
    renderShapes();
    redrawStrokes();
    updateShapeToolbar();
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

  // 名前カードのフォント・大きさ
  document.getElementById('cardFontFamily').addEventListener('change', e => {
    state.cardFontKey = e.target.value;
    saveState();
    renderCards();
  });
  document.getElementById('cardFontScale').addEventListener('input', e => {
    state.cardFontScale = parseFloat(e.target.value);
    renderCards();
  });
  document.getElementById('cardFontScale').addEventListener('change', () => saveState());

  // Undo / Redo
  document.getElementById('btnUndo').addEventListener('click', undo);
  document.getElementById('btnRedo').addEventListener('click', redo);

  // Board toolbar — drawing
  document.getElementById('btnDrawToggle').addEventListener('click', toggleDrawMode);
  document.querySelectorAll('.bt-mode').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.bt-mode').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      drawTool.mode = btn.dataset.mode;
    });
  });
  document.getElementById('penWidth').addEventListener('input', e => {
    drawTool.width = Number(e.target.value);
  });
  document.getElementById('btnUndoStroke').addEventListener('click', undoStroke);
  document.getElementById('btnClearStrokes').addEventListener('click', clearStrokes);

  // Board toolbar — shapes (T = text)
  document.querySelectorAll('.bt-shape').forEach(btn => {
    btn.addEventListener('click', () => addShape(btn.dataset.shape));
  });

  // Text element font/size controls
  document.getElementById('textFontFamily').addEventListener('change', e => {
    const s = state.shapes.find(x => x.id === selectedShapeId);
    if (!s || s.type !== 'text') return;
    s.fontKey = e.target.value;
    saveState();
    renderShapes();
  });
  document.getElementById('textFontSize').addEventListener('input', e => {
    const s = state.shapes.find(x => x.id === selectedShapeId);
    if (!s || s.type !== 'text') return;
    s.fontSize = Number(e.target.value) / 1000;
    saveState();
    renderShapes();
  });
  document.getElementById('btnEditText').addEventListener('click', () => {
    if (selectedShapeId) editTextShapeContent(selectedShapeId);
  });

  // Shape edit toolbar
  document.getElementById('shapeStrokeWidth').addEventListener('input', e => {
    const s = state.shapes.find(x => x.id === selectedShapeId);
    if (!s) return;
    s.strokeWidth = Number(e.target.value);
    saveState();
    renderShapes();
  });
  document.getElementById('btnShapeFill').addEventListener('click', toggleSelectedShapeFill);
  document.getElementById('btnShapeDuplicate').addEventListener('click', duplicateSelectedShape);

  // Marquee select: click+drag on empty board area draws a selection rectangle
  // Cards inside the rectangle become a group (move together / delete together)
  setupMarqueeSelect();
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') { deselectShape(); deselectCard(); }
    if ((e.key === 'Delete' || e.key === 'Backspace') &&
        document.activeElement.tagName !== 'INPUT' &&
        document.activeElement.tagName !== 'TEXTAREA') {
      if (selectedKind === 'shape' && selectedShapeId) { e.preventDefault(); deleteSelectedShape(); }
      else if (selectedKind === 'card' && selectedMemberIds.length > 0) { e.preventDefault(); deleteSelected(); }
    }
    // Undo / Redo
    if ((e.ctrlKey || e.metaKey) && !e.shiftKey && (e.key === 'z' || e.key === 'Z')) {
      e.preventDefault();
      undo();
    } else if (((e.ctrlKey || e.metaKey) && (e.key === 'y' || e.key === 'Y')) ||
               ((e.ctrlKey || e.metaKey) && e.shiftKey && (e.key === 'z' || e.key === 'Z'))) {
      e.preventDefault();
      redo();
    }
  });

  // Board toolbar — Save dropdown (JPEG / JSON), Load, Delete
  const saveDropdown = document.getElementById('saveDropdown');
  document.getElementById('btnSaveToggle').addEventListener('click', (e) => {
    e.stopPropagation();
    saveDropdown.classList.toggle('hidden');
  });
  document.getElementById('btnDoSaveJpeg').addEventListener('click', () => {
    saveDropdown.classList.add('hidden');
    jpegSave();
  });
  document.getElementById('btnDoSaveJson').addEventListener('click', () => {
    saveDropdown.classList.add('hidden');
    jsonSave();
  });
  document.addEventListener('click', () => saveDropdown.classList.add('hidden'));

  document.getElementById('btnJsonLoad').addEventListener('click', () => {
    document.getElementById('jsonInput').click();
  });
  document.getElementById('jsonInput').addEventListener('change', e => {
    if (e.target.files[0]) jsonLoad(e.target.files[0]);
    e.target.value = '';
  });

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
function initPickers() {
  pickers.editCard = createColorPicker('#ffffff');
  pickers.editText = createColorPicker('#1e3a5f');
  pickers.bulkCard = createColorPicker('#ffffff');
  pickers.bulkText = createColorPicker('#1e1e1e');
  pickers.pen = createColorPicker(drawTool.color, v => { drawTool.color = v; }, { compact: true });
  pickers.shape = createColorPicker('#1e3a5f', v => {
    const s = state.shapes.find(x => x.id === selectedShapeId);
    if (s) { s.color = v; saveState(); renderShapes(); }
  }, { compact: true });

  document.getElementById('editCardPicker').appendChild(pickers.editCard.el);
  document.getElementById('editTextPicker').appendChild(pickers.editText.el);
  document.getElementById('bulkCardPicker').appendChild(pickers.bulkCard.el);
  document.getElementById('bulkTextPicker').appendChild(pickers.bulkText.el);
  document.getElementById('penColorMount').appendChild(pickers.pen.el);
  document.getElementById('shapeColorMount').appendChild(pickers.shape.el);
}

function init() {
  // 共有URLで開かれた場合はプレビューモード（ボードのみ全画面）
  const isPreview = /board=/.test(location.hash || '');
  if (isPreview) document.body.classList.add('preview-mode');

  loadState();
  document.getElementById('boardName').value = state.boardName || '';
  document.getElementById('sportSelect').value = state.sport || 'free';
  const cf = document.getElementById('cardFontFamily'); if (cf) cf.value = state.cardFontKey || 'gothic';
  const cs = document.getElementById('cardFontScale'); if (cs) cs.value = state.cardFontScale || 1.0;
  initPickers();
  renderBoardBackground();
  renderMemberList();
  renderCards();
  renderShapes();
  setupDrawCanvas();
  wireEvents();
  updateShapeToolbar();
  // 履歴の起点をセット
  historyStack = [JSON.stringify(state)];
  redoStack = [];
  updateHistoryButtons();
}

document.addEventListener('DOMContentLoaded', init);
