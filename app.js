const STORAGE_KEY = 'raven-task-board:v1';
const ACHIEVEMENTS_KEY = 'raven-task-board:achievements:v1';
const COMPANION_KEY = 'raven-task-board:companion:v1';

const areas = [
  { id: 'work', title: 'Работа' },
  { id: 'study', title: 'Диплом / учёба' },
  { id: 'personal', title: 'Личное' },
  { id: 'waiting', title: 'Жду ответа' },
];

const quadrants = {
  'urgent-important': '🔥 Срочно + важно',
  'not-urgent-important': '🌱 Не срочно + важно',
  'urgent-not-important': '⚡ Срочно + неважно',
  'not-urgent-not-important': '🪶 Не срочно + неважно',
};

let state = { tasks: [] };
let draggedId = null;
let draggedCard = null;
let activeFilter = 'all';
let editingTaskId = null;
let achievementState = loadAchievementState();
let ravenMoodHoldUntil = 0;
let ravenMoodTimer = null;
let ravenMoodGuard = null;
let ravenHeldMood = '';
let companionState = loadCompanionState();

const RAVEN_LINE_MIN_MS = 4200;
const RAVEN_LINE_MAX_MS = 5600;
const RAVEN_GIFT_COOLDOWN_MS = 60 * 60 * 1000;
const RAVEN_GIFT_ACTIVITY = 80;

const areaSelect = document.querySelector('#taskArea');
const form = document.querySelector('#taskForm');
const noteInput = document.querySelector('#taskNote');
const searchInput = document.querySelector('#search');
const editDialog = document.querySelector('#editDialog');
const editForm = document.querySelector('#editForm');
const editArea = document.querySelector('#editArea');
const achievementsBtn = document.querySelector('#achievementsBtn');
const achievementsDialog = document.querySelector('#achievementsDialog');
const achievementsClose = document.querySelector('#achievementsClose');
const achievementCount = document.querySelector('#achievementCount');
const companionBtn = document.querySelector('#companionBtn');
const companionDialog = document.querySelector('#companionDialog');
const companionClose = document.querySelector('#companionClose');
const companionCount = document.querySelector('#companionCount');

// HTML already contains fallback options so the select is never an empty Chrome goblin.
areaSelect.innerHTML = '';
areas.forEach(area => {
  const option = document.createElement('option');
  option.value = area.id;
  option.textContent = area.title;
  areaSelect.append(option);
  if (editArea) editArea.append(option.cloneNode(true));
});

const cosmeticCatalog = [
  { id: 'hat-none', type: 'hat', icon: '—', title: 'Без шляпы', value: 'none', starter: true },
  { id: 'hat-witch', type: 'hat', icon: '🧙‍♀️', title: 'Ведьмина шляпа', value: 'witch' },
  { id: 'hat-crown', type: 'hat', icon: '👑', title: 'Корона хаоса', value: 'crown' },
  { id: 'hat-party', type: 'hat', icon: '🥳', title: 'Колпак победы', value: 'party' },
  { id: 'hat-cap', type: 'hat', icon: '🎩', title: 'Цилиндр джентльворона', value: 'cap' },
  { id: 'perch-twig', type: 'perch', icon: '🌿', title: 'Обычная ветка', value: 'twig', starter: true },
  { id: 'perch-moon', type: 'perch', icon: '🌙', title: 'Лунная жердочка', value: 'moon' },
  { id: 'perch-crystal', type: 'perch', icon: '💎', title: 'Кристальная ветвь', value: 'crystal' },
  { id: 'perch-fire', type: 'perch', icon: '🔥', title: 'Огненная ветка', value: 'fire' },
  { id: 'perch-swing', type: 'perch', icon: '🪵', title: 'Качелька', value: 'swing' },
  { id: 'perch-rope', type: 'perch', icon: '🪢', title: 'Верёвочное кольцо', value: 'rope' },
  { id: 'perch-hollow', type: 'perch', icon: '🕳️', title: 'Мини-дупло', value: 'hollow' },
  { id: 'aura-none', type: 'aura', icon: '—', title: 'Без ауры', value: 'none', starter: true },
  { id: 'aura-stars', type: 'aura', icon: '✨', title: 'Звёздная пыль', value: 'stars' },
  { id: 'aura-embers', type: 'aura', icon: '🟠', title: 'Тёплые искры', value: 'embers' },
  { id: 'aura-ghost', type: 'aura', icon: '👻', title: 'Туман фамильяра', value: 'ghost' },
];

function loadCompanionState() {
  const fallback = {
    activity: 0,
    totalKeys: 0,
    totalClicks: 0,
    lastRewardAt: 0,
    inventory: ['hat-none', 'perch-twig', 'aura-none'],
    equipped: { hat: 'none', perch: 'twig', aura: 'none' },
  };
  try {
    const saved = JSON.parse(localStorage.getItem(COMPANION_KEY) || '{}');
    return {
      ...fallback,
      ...saved,
      inventory: Array.from(new Set([...(fallback.inventory || []), ...(saved.inventory || [])])),
      equipped: { ...fallback.equipped, ...(saved.equipped || {}) },
    };
  } catch {
    return fallback;
  }
}

function saveCompanionState() {
  localStorage.setItem(COMPANION_KEY, JSON.stringify(companionState));
}

function trackRavenActivity(kind = 'action', amount = 1) {
  if (kind === 'key') companionState.totalKeys += amount;
  else companionState.totalClicks += amount;
  companionState.activity += amount;
  saveCompanionState();
  renderCompanion();
  maybeGiveRavenGift();
}

function maybeGiveRavenGift() {
  const now = Date.now();
  if (companionState.activity < RAVEN_GIFT_ACTIVITY) return;
  if (companionState.lastRewardAt && now - companionState.lastRewardAt < RAVEN_GIFT_COOLDOWN_MS) return;
  const locked = cosmeticCatalog.filter(item => !companionState.inventory.includes(item.id));
  if (!locked.length) return;
  const gift = locked[Math.floor(Math.random() * locked.length)];
  companionState.inventory.push(gift.id);
  companionState.activity = 0;
  companionState.lastRewardAt = now;
  companionState.equipped[gift.type] = gift.value;
  saveCompanionState();
  applyCompanionCosmetics();
  renderCompanion();
  showCompanionGift(gift);
}

function showCompanionGift(gift) {
  holdRavenMood(`Нашёл обновку: ${gift.title}. Кар-р-ьерная доставка!`, 5600);
  showAchievement({ icon: gift.icon, title: 'Воронья находка', text: gift.title });
}

function applyCompanionCosmetics() {
  const perch = document.querySelector('.raven-perch');
  const preview = document.querySelector('#companionPreview');
  const target = companionState.equipped || {};
  if (perch) {
    perch.dataset.hat = target.hat || 'none';
    perch.dataset.perch = target.perch || 'twig';
    perch.dataset.aura = target.aura || 'none';
  }
  if (preview) {
    preview.dataset.hat = target.hat || 'none';
    preview.dataset.perch = target.perch || 'twig';
    preview.dataset.aura = target.aura || 'none';
  }
}

function renderCompanion() {
  applyCompanionCosmetics();
  if (companionCount) companionCount.textContent = String(companionState.activity);
  const keys = document.querySelector('#companionKeys');
  const clicks = document.querySelector('#companionClicks');
  const next = document.querySelector('#companionNextGift');
  const summary = document.querySelector('#companionSummary');
  if (keys) keys.textContent = String(companionState.totalKeys);
  if (clicks) clicks.textContent = String(companionState.totalClicks);
  const remainingActivity = Math.max(0, RAVEN_GIFT_ACTIVITY - companionState.activity);
  const remainingCooldown = companionState.lastRewardAt ? Math.max(0, RAVEN_GIFT_COOLDOWN_MS - (Date.now() - companionState.lastRewardAt)) : 0;
  if (next) next.textContent = remainingCooldown ? formatDuration(remainingCooldown) : `${remainingActivity} клац`;
  if (summary) summary.textContent = `Внутри доски собрано ${companionState.activity} свежих клац-клац. Находки падают не чаще раза в час.`;
  renderCosmeticGrid();
}

function renderCosmeticGrid() {
  const grid = document.querySelector('#cosmeticGrid');
  if (!grid) return;
  grid.innerHTML = '';
  cosmeticCatalog.forEach(item => {
    const owned = companionState.inventory.includes(item.id);
    const equipped = companionState.equipped?.[item.type] === item.value;
    const node = document.createElement('button');
    node.type = 'button';
    node.className = `cosmetic-card${owned ? '' : ' locked'}${equipped ? ' equipped' : ''}`;
    node.innerHTML = `<strong>${escapeHtml(item.icon)} ${escapeHtml(item.title)}</strong><span>${owned ? (equipped ? 'надето' : 'примерить') : 'ещё не найдено'}</span>`;
    node.disabled = !owned;
    node.addEventListener('click', () => {
      companionState.equipped[item.type] = item.value;
      saveCompanionState();
      renderCompanion();
      holdRavenMood(`Так, образ обновлён: ${item.title}. Ворон доволен собой.`, 4600);
    });
    grid.append(node);
  });
}

function formatDuration(ms) {
  const minutes = Math.ceil(ms / 60000);
  if (minutes <= 1) return '<1 мин';
  return `${minutes} мин`;
}

document.addEventListener('keydown', event => {
  if (event.repeat || event.ctrlKey || event.metaKey || event.altKey) return;
  trackRavenActivity('key', 1);
  document.querySelector('.raven-perch')?.classList.add('typing');
  clearTimeout(document.body._ravenTypingTimer);
  document.body._ravenTypingTimer = setTimeout(() => document.querySelector('.raven-perch')?.classList.remove('typing'), 260);
});

document.addEventListener('click', event => {
  if (event.target.closest('button, input, select, textarea, label, .task-card')) trackRavenActivity('click', 1);
}, { capture: true });

form.addEventListener('submit', event => {
  event.preventDefault();
  const task = {
    id: makeId(),
    title: document.querySelector('#taskTitle').value.trim(),
    area: document.querySelector('#taskArea').value,
    quadrant: document.querySelector('#taskQuadrant').value,
    due: document.querySelector('#taskDue').value,
    note: noteInput.value.trim(),
    createdAt: new Date().toISOString(),
    done: false,
  };
  if (task.due) unlockAchievement('deadline-sigil');
  if (task.note) unlockAchievement('footnote-familiar');
  trackRavenActivity('click', 8);
  state.tasks.unshift(task);
  const created = bumpAchievementCounter('tasksCreated');
  if (created >= 3) unlockAchievement('nest-builder');
  checkBoardAchievements();
  saveAndRender();
  form.reset();
  noteInput.value = '';
});

searchInput.addEventListener('input', () => {
  if (searchInput.value.trim().length >= 2) unlockAchievement('search-lantern');
  render();
});

document.querySelectorAll('.filter').forEach(button => {
  button.addEventListener('click', () => {
    activeFilter = button.dataset.filter;
    if (activeFilter !== 'all') unlockAchievement('time-witch');
    document.querySelectorAll('.filter').forEach(item => item.classList.remove('active'));
    button.classList.add('active');
    render();
  });
});

document.querySelectorAll('.tab').forEach(tab => {
  tab.addEventListener('click', () => {
    const views = achievementState.counters.viewsSeen || {};
    views[tab.dataset.view] = true;
    achievementState.counters.viewsSeen = views;
    saveAchievementState();
    if (Object.keys(views).length >= 3) unlockAchievement('view-shifter');
    document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
    tab.classList.add('active');
    document.querySelectorAll('.view').forEach(view => view.classList.add('hidden'));
    document.querySelector(`#${tab.dataset.view}View`).classList.remove('hidden');
    render();
  });
});



companionBtn?.addEventListener('click', () => {
  renderCompanion();
  companionDialog?.showModal();
});
companionClose?.addEventListener('click', () => companionDialog?.close());

achievementsBtn?.addEventListener('click', () => {
  renderAchievementTree();
  achievementsDialog?.showModal();
});
achievementsClose?.addEventListener('click', () => achievementsDialog?.close());

document.querySelector('#editClose')?.addEventListener('click', () => editDialog.close());
document.querySelector('#editCancel')?.addEventListener('click', () => editDialog.close());
editForm?.addEventListener('submit', event => {
  event.preventDefault();
  const task = state.tasks.find(item => item.id === editingTaskId);
  if (!task) return;
  task.title = document.querySelector('#editTitle').value.trim();
  task.area = document.querySelector('#editArea').value;
  task.quadrant = document.querySelector('#editQuadrant').value;
  task.due = document.querySelector('#editDue').value;
  task.note = document.querySelector('#editNote').value.trim();
  task.updatedAt = new Date().toISOString();
  if (task.due) unlockAchievement('deadline-sigil');
  if (task.note) unlockAchievement('footnote-familiar');
  unlockAchievement('scribe');
  editDialog.close();
  saveAndRender();
});

document.querySelector('#resetBtn').addEventListener('click', () => {
  if (!confirm('Очистить все задачи? Это локальное действие, но всё равно неприятно.')) return;
  if (state.tasks.length) unlockAchievement('phoenix-dust');
  state = { tasks: [] };
  saveAndRender();
});

document.querySelector('#exportBtn').addEventListener('click', () => {
  const blob = new Blob([JSON.stringify(state, null, 2)], { type: 'application/json' });
  const link = document.createElement('a');
  link.href = URL.createObjectURL(blob);
  link.download = `raven-task-board-${new Date().toISOString().slice(0,10)}.json`;
  link.click();
  URL.revokeObjectURL(link.href);
  unlockAchievement('json-carrier');
});



document.querySelector('#markdownBtn').addEventListener('click', async () => {
  const markdown = toMarkdown();
  try {
    await navigator.clipboard.writeText(markdown);
    unlockAchievement('obsidian-rune');
    alert('Markdown скопирован в буфер. Можно вставлять в Obsidian.');
  } catch {
    const blob = new Blob([markdown], { type: 'text/markdown' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `Воронья доска задач — ${new Date().toISOString().slice(0,10)}.md`;
    link.click();
    URL.revokeObjectURL(link.href);
    unlockAchievement('obsidian-rune');
  }
});

document.querySelector('#importFile').addEventListener('change', async event => {
  const file = event.target.files[0];
  if (!file) return;
  const imported = JSON.parse(await file.text());
  if (!Array.isArray(imported.tasks)) throw new Error('Неверный формат файла');
  state = imported;
  unlockAchievement('mirror-ritual');
  saveAndRender();
});



const achievementCatalog = [
  { id: 'first-feather', icon: '🪶', title: 'Первое перо', text: 'Задача попала в гнездо.' },
  { id: 'clean-cut', icon: '✅', title: 'Чистый клюв', text: 'Первая задача закрыта.' },
  { id: 'small-hunt', icon: '🐦‍⬛', title: 'Малая охота', text: 'Несколько задач уже не вернутся прежними.' },
  { id: 'raven-streak', icon: '🌌', title: 'Воронья серия', text: 'Закрытия пошли стаей.' },
  { id: 'firekeeper', icon: '🔥', title: 'Хранительница пожаров', text: 'Горящее стало заметным.' },
  { id: 'quiet-sky', icon: '🌙', title: 'Тихое небо', text: 'На доске стало спокойнее.' },
  { id: 'time-witch', icon: '⏳', title: 'Ведьма дедлайнов', text: 'Фокус времени пойман.' },
  { id: 'second-thought', icon: '↩️', title: 'Второй шанс', text: 'Задача вернулась из архива.' },
  { id: 'scribe', icon: '✍️', title: 'Писарь гнезда', text: 'Задача была переписана без жертв.' },
  { id: 'obsidian-rune', icon: '💎', title: 'Обсидиановая руна', text: 'Доска заговорила Markdown-ом.' },
  { id: 'poke-the-bird', icon: '👀', title: 'Не тыкай ворона', text: 'Ладно, тыкай. Ему нравится.' },
  { id: 'bird-friend', icon: '🖤', title: 'Свой человек', text: 'Ворон уже узнаёт руку.' },
  { id: 'nest-builder', icon: '🪹', title: 'Гнездостроительница', text: 'План начал обрастать веточками.' },
  { id: 'quadrant-oracle', icon: '🧭', title: 'Оракул квадрантов', text: 'Все стороны доски получили смысл.' },
  { id: 'all-realms', icon: '🗺️', title: 'Четыре королевства', text: 'Гнездо увидело все области жизни.' },
  { id: 'deadline-sigil', icon: '📅', title: 'Печать срока', text: 'Дата поставлена. Судьба предупреждена.' },
  { id: 'footnote-familiar', icon: '📜', title: 'Полевые заметки', text: 'У задачи появился шёпот на полях.' },
  { id: 'search-lantern', icon: '🔎', title: 'Фонарь в тумане', text: 'Что-то было найдено до того, как потерялось.' },
  { id: 'view-shifter', icon: '🪄', title: 'Смена формы', text: 'Доска повернулась другой гранью.' },
  { id: 'migration-raven', icon: '🪽', title: 'Перелёт', text: 'Задача сменила ветку без паники.' },
  { id: 'priority-alchemy', icon: '⚗️', title: 'Алхимия важности', text: 'Приоритеты переплавлены вручную.' },
  { id: 'archive-keeper', icon: '🗝️', title: 'Ключница архива', text: 'Архив уже не просто кладбище задач.' },
  { id: 'json-carrier', icon: '📦', title: 'Посылка ворона', text: 'Доска упакована для перелёта.' },
  { id: 'mirror-ritual', icon: '🪞', title: 'Зеркальный ритуал', text: 'Старое состояние вернулось из файла.' },
  { id: 'phoenix-dust', icon: '🧹', title: 'Пепел феникса', text: 'Иногда чистый лист тоже заклинание.' },
];

function loadAchievementState() {
  try {
    const saved = JSON.parse(localStorage.getItem(ACHIEVEMENTS_KEY) || '{}');
    return { unlocked: saved.unlocked || {}, counters: saved.counters || {} };
  } catch {
    return { unlocked: {}, counters: {} };
  }
}

function saveAchievementState() {
  localStorage.setItem(ACHIEVEMENTS_KEY, JSON.stringify(achievementState));
}

function bumpAchievementCounter(name, amount = 1) {
  achievementState.counters[name] = (achievementState.counters[name] || 0) + amount;
  saveAchievementState();
  return achievementState.counters[name];
}

function unlockAchievement(id) {
  if (achievementState.unlocked[id]) return;
  const item = achievementCatalog.find(entry => entry.id === id);
  if (!item) return;
  achievementState.unlocked[id] = new Date().toISOString();
  saveAchievementState();
  renderAchievementEntry();
  renderAchievementTree();
  showAchievement(item);
}

function showAchievement(item) {
  const shelf = document.querySelector('#achievementShelf');
  if (!shelf) return;
  const toast = document.createElement('div');
  toast.className = 'achievement-toast';
  toast.innerHTML = `<div class="achievement-icon">${item.icon}</div><div><strong>${escapeHtml(item.title)}</strong><span>${escapeHtml(item.text)}</span></div>`;
  shelf.append(toast);
  setTimeout(() => toast.remove(), 6600);
}

function unlockedAchievements() {
  return achievementCatalog
    .filter(item => achievementState.unlocked[item.id])
    .sort((a, b) => String(achievementState.unlocked[a.id]).localeCompare(String(achievementState.unlocked[b.id])));
}

function renderAchievementEntry() {
  if (!achievementsBtn) return;
  const count = unlockedAchievements().length;
  achievementsBtn.classList.toggle('hidden', count === 0);
  if (achievementCount) achievementCount.textContent = String(count);
}

function renderAchievementTree() {
  const tree = document.querySelector('#achievementTree');
  const summary = document.querySelector('#achievementSummary');
  if (!tree) return;
  const unlocked = unlockedAchievements();
  const lockedCount = Math.max(0, achievementCatalog.length - unlocked.length);
  tree.innerHTML = '';
  if (summary) {
    summary.textContent = unlocked.length
      ? `На ветках сидит трофеев: ${unlocked.length}. Остальные пока притворяются обычными воронами.`
      : 'Пока ветки пустуют.';
  }
  unlocked.forEach(item => {
    const node = document.createElement('article');
    node.className = 'trophy-bird';
    const date = new Date(achievementState.unlocked[item.id]);
    const when = Number.isNaN(date.getTime()) ? '' : date.toLocaleDateString('ru-RU');
    node.innerHTML = `<div class="trophy-raven" aria-hidden="true">🐦‍⬛${item.icon}</div><strong>${escapeHtml(item.title)}</strong><span>${escapeHtml(item.text)}</span>${when ? `<time>${escapeHtml(when)}</time>` : ''}`;
    tree.append(node);
  });
  if (lockedCount) {
    const node = document.createElement('article');
    node.className = 'trophy-bird mystery';
    node.innerHTML = `<div class="trophy-raven" aria-hidden="true">🐦‍⬛?</div><strong>Скрытые ветки</strong><span>Ещё ${lockedCount} ждёт своего момента. Условия засекречены, потому что магия должна кусаться.</span>`;
    tree.append(node);
  }
}

function checkBoardAchievements() {
  const active = state.tasks.filter(task => !task.done);
  const done = state.tasks.filter(task => task.done);
  const hot = active.filter(task => task.quadrant === 'urgent-important');
  const usedQuadrants = new Set(state.tasks.map(task => task.quadrant).filter(Boolean));
  const usedAreas = new Set(state.tasks.map(task => task.area).filter(Boolean));
  if (state.tasks.length >= 1) unlockAchievement('first-feather');
  if (done.length >= 1) unlockAchievement('clean-cut');
  if (done.length >= 5) unlockAchievement('small-hunt');
  if (done.length >= 10) unlockAchievement('raven-streak');
  if (hot.length >= 3) unlockAchievement('firekeeper');
  if (active.length > 0 && hot.length === 0) unlockAchievement('quiet-sky');
  if (usedQuadrants.size >= Object.keys(quadrants).length) unlockAchievement('quadrant-oracle');
  if (usedAreas.size >= areas.length) unlockAchievement('all-realms');
  if (done.length >= 3) unlockAchievement('archive-keeper');
}

const ravenLines = [
  'Кар. Я наблюдаю.',
  'Не тыкай без задачи. Хотя ладно, тыкай.',
  'Закрой одну задачу — получишь фейерверк.',
  'Срочное видишь? Я тоже вижу. Кар.',
  'Я не прокрастинация. Я моральная поддержка.',
  'Порядок в задачах — порядок в гнезде.',
  'Я всё записал. Не благодари, просто не теряй список.',
  'Если задача шипит — значит, её пора приручать.',
  'Гнездо не резиновое, но я пока держу конструкцию.',
  'Карточки двигаются. Хаос нервничает.',
];
const ravenActions = ['peck', 'flap', 'side-eye'];

document.querySelector('#perchRaven')?.addEventListener('click', () => {
  const perch = document.querySelector('.raven-perch');
  const mood = document.querySelector('#ravenMood');
  if (!perch || !mood) return;
  const action = ravenActions[Math.floor(Math.random() * ravenActions.length)];
  perch.classList.remove(...ravenActions);
  void perch.offsetWidth;
  perch.classList.add(action);
  const pokes = bumpAchievementCounter('ravenPokes');
  unlockAchievement('poke-the-bird');
  if (pokes >= 7) unlockAchievement('bird-friend');
  holdRavenMood(ravenLines[Math.floor(Math.random() * ravenLines.length)]);
  setTimeout(() => {
    perch.classList.remove(action);
  }, 900);
});




function makeId() {
  if (globalThis.crypto?.randomUUID) return crypto.randomUUID();
  const bytes = new Uint8Array(16);
  if (globalThis.crypto?.getRandomValues) {
    crypto.getRandomValues(bytes);
    return [...bytes].map(byte => byte.toString(16).padStart(2, '0')).join('');
  }
  return `task-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function toMarkdown() {
  const lines = [];
  lines.push(`# Воронья доска задач — ${new Date().toLocaleDateString('ru-RU')}`);
  lines.push('');
  lines.push('> Экспорт из Raven Task Board.');
  lines.push('');
  for (const [qid, qtitle] of Object.entries(quadrants)) {
    const tasks = state.tasks.filter(task => !task.done && task.quadrant === qid);
    lines.push(`## ${qtitle}`);
    lines.push('');
    if (!tasks.length) {
      lines.push('_Пусто._');
      lines.push('');
      continue;
    }
    for (const task of tasks) {
      const due = task.due ? ` 📅 ${task.due}` : '';
      lines.push(`- [ ] **${escapeMd(task.title)}** — ${escapeMd(areaName(task.area))}${due}`);
      if (task.note) lines.push(`  - ${escapeMd(task.note).replace(/\n/g, '\n  - ')}`);
    }
    lines.push('');
  }
  return lines.join('\n');
}

function escapeMd(text) {
  return String(text).replace(/\|/g, '\\|');
}

async function loadState() {
  const local = loadLocalState();
  try {
    const response = await fetch('/api/tasks', { headers: { accept: 'application/json' } });
    if (!response.ok) throw new Error(`API ${response.status}`);
    const data = await response.json();
    const remote = data.state && Array.isArray(data.state.tasks) ? data.state : null;
    if (remote && remote.tasks.length) {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(remote));
      return remote;
    }
    if (local.tasks.length) {
      await saveRemoteState(local);
      return local;
    }
  } catch (error) {
    console.warn('Obsidian sync unavailable, using browser storage:', error);
  }
  return local.tasks.length ? local : demoState();
}

function loadLocalState() {
  const saved = localStorage.getItem(STORAGE_KEY);
  if (!saved) return { tasks: [] };
  try {
    const parsed = JSON.parse(saved);
    return Array.isArray(parsed.tasks) ? parsed : { tasks: [] };
  } catch {
    return { tasks: [] };
  }
}

function demoState() {
  return {
    tasks: [
      {
        id: makeId(),
        title: 'Пример: заказать листовки / проверить макет',
        area: 'work',
        quadrant: 'urgent-important',
        due: '',
        note: 'Это демо-задача. Можно удалить.',
        createdAt: new Date().toISOString(),
        done: false,
      },
    ],
  };
}

let syncTimer = null;
function saveAndRender() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  render();
  clearTimeout(syncTimer);
  syncTimer = setTimeout(() => saveRemoteState(state), 250);
}

async function saveRemoteState(nextState) {
  const response = await fetch('/api/tasks', {
    method: 'PUT',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ state: nextState }),
  });
  if (!response.ok) throw new Error(`API ${response.status}`);
  return response.json();
}

async function init() {
  state = await loadState();
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  render();
  checkBoardAchievements();
  renderAchievementEntry();
  renderAchievementTree();
  renderCompanion();
}


function filteredTasks() {
  const query = searchInput.value.trim().toLowerCase();
  return state.tasks.filter(task => !task.done).filter(task => {
    if (!matchesDateFilter(task)) return false;
    if (!query) return true;
    return [task.title, task.note, areaName(task.area), quadrants[task.quadrant]].join(' ').toLowerCase().includes(query);
  });
}

function render() {
  renderTodayPanel();
  renderKanban();
  renderMatrix();
  renderList();
  renderDone();
  updateRavenMood();
  renderAchievementEntry();
  renderCompanion();
}



function renderTodayPanel() {
  const root = document.querySelector('#todayPanel');
  if (!root) return;
  const active = state.tasks.filter(task => !task.done);
  const today = active.filter(isTodayTask);
  const overdue = active.filter(isOverdueTask);
  const week = active.filter(isThisWeekTask);
  const hot = active.filter(task => task.quadrant === 'urgent-important');
  const focus = [...new Map([...overdue, ...today, ...hot].map(task => [task.id, task])).values()].slice(0, 6);
  root.innerHTML = `
    <h2>🔥 Сегодня <span class="count">фокус дня</span></h2>
    <div class="today-grid">
      <div class="today-stat"><strong>${today.length}</strong><span>на сегодня</span></div>
      <div class="today-stat"><strong>${overdue.length}</strong><span>просрочено</span></div>
      <div class="today-stat"><strong>${week.length}</strong><span>на 7 дней</span></div>
    </div>
    <div class="today-strip"></div>
  `;
  const strip = root.querySelector('.today-strip');
  if (!focus.length) {
    strip.append(empty('На сегодня явного пожара нет. Подозрительно, но приятно.'));
    return;
  }
  focus.forEach(task => {
    const node = document.createElement('div');
    node.className = 'today-mini';
    const due = task.due ? ` · ${formatDate(task.due)}` : '';
    node.innerHTML = `<strong>${escapeHtml(task.title)}</strong><span>${escapeHtml(areaName(task.area))} · ${escapeHtml(quadrants[task.quadrant])}${due}</span>`;
    strip.append(node);
  });
}

function holdRavenMood(text, durationMs = randomRavenLineDuration()) {
  const mood = document.querySelector('#ravenMood');
  const perch = document.querySelector('.raven-perch');
  if (!mood) return;
  clearTimeout(ravenMoodTimer);
  clearInterval(ravenMoodGuard);
  ravenHeldMood = text;
  ravenMoodHoldUntil = Date.now() + durationMs;
  mood.textContent = ravenHeldMood;
  perch?.classList.add('speaking');
  ravenMoodGuard = setInterval(() => {
    if (Date.now() >= ravenMoodHoldUntil) return;
    if (mood.textContent !== ravenHeldMood) mood.textContent = ravenHeldMood;
  }, 120);
  ravenMoodTimer = setTimeout(() => {
    ravenMoodHoldUntil = 0;
    clearInterval(ravenMoodGuard);
    ravenMoodGuard = null;
    ravenHeldMood = '';
    perch?.classList.remove('speaking');
    updateRavenMood({ force: true });
  }, durationMs);
}

function randomRavenLineDuration() {
  return RAVEN_LINE_MIN_MS + Math.floor(Math.random() * (RAVEN_LINE_MAX_MS - RAVEN_LINE_MIN_MS + 1));
}

function updateRavenMood(options = {}) {
  const mood = document.querySelector('#ravenMood');
  if (!mood) return;
  if (!options.force && Date.now() < ravenMoodHoldUntil) {
    if (ravenHeldMood && mood.textContent !== ravenHeldMood) mood.textContent = ravenHeldMood;
    return;
  }
  const active = state.tasks.filter(task => !task.done).length;
  const hot = state.tasks.filter(task => !task.done && task.quadrant === 'urgent-important').length;
  if (!active) mood.textContent = 'Пусто. Подозрительно, но прекрасно.';
  else if (hot) mood.textContent = `На посту: ${hot} горит, ${active} всего.`;
  else mood.textContent = `Задачи текут спокойно: ${active} всего.`;
}

function renderKanban() {
  const root = document.querySelector('#kanbanView');
  root.innerHTML = '';
  areas.forEach(area => {
    const column = document.createElement('section');
    column.className = 'column';
    column.dataset.area = area.id;
    const tasks = filteredTasks().filter(task => task.area === area.id);
    column.innerHTML = `<h2>${area.title}<span class="count">${tasks.length}</span></h2><div class="dropzone"></div>`;
    const zone = column.querySelector('.dropzone');
    wireDropzone(zone, task => { task.area = area.id; });
    tasks.forEach(task => zone.append(taskCard(task)));
    if (!tasks.length) zone.append(empty('Пусто. Редкий вид роскоши.'));
    root.append(column);
  });
}

function renderMatrix() {
  const root = document.querySelector('#matrixView');
  root.innerHTML = '';
  Object.entries(quadrants).forEach(([id, title]) => {
    const cell = document.createElement('section');
    cell.className = 'matrix-cell';
    cell.dataset.quadrant = id;
    const tasks = filteredTasks().filter(task => task.quadrant === id);
    cell.innerHTML = `<h2>${title}<span class="count">${tasks.length}</span></h2><div class="dropzone"></div>`;
    const zone = cell.querySelector('.dropzone');
    wireDropzone(zone, task => { task.quadrant = id; });
    tasks.forEach(task => zone.append(taskCard(task)));
    if (!tasks.length) zone.append(empty('Ничего нет. Подозрительно, но приятно.'));
    root.append(cell);
  });
}

function renderList() {
  const root = document.querySelector('#listView');
  root.innerHTML = '';
  const tasks = filteredTasks().sort((a, b) => urgencyRank(a) - urgencyRank(b));
  tasks.forEach(task => root.append(taskCard(task)));
  if (!tasks.length) root.append(empty('Задач нет. Можно выдохнуть или проверить, не сломалась ли реальность.'));
}


function renderDone() {
  const root = document.querySelector('#doneView');
  root.innerHTML = '';
  const tasks = state.tasks
    .filter(task => task.done)
    .sort((a, b) => String(b.doneAt || b.createdAt || '').localeCompare(String(a.doneAt || a.createdAt || '')));
  const summary = document.createElement('p');
  summary.className = 'done-summary';
  summary.textContent = `Закрыто задач: ${tasks.length}`;
  root.append(summary);
  tasks.forEach(task => root.append(taskCard(task, { archived: true })));
  if (!tasks.length) root.append(empty('Архив пуст. Пока никто не совершил подвиг, но всё впереди.'));
}

function taskCard(task, options = {}) {
  const template = document.querySelector('#taskTemplate');
  const card = template.content.firstElementChild.cloneNode(true);
  card.dataset.id = task.id;
  card.querySelector('h3').textContent = task.title;
  card.classList.toggle('done-card', Boolean(task.done));
  const complete = card.querySelector('.complete');
  complete.checked = Boolean(task.done);
  complete.addEventListener('change', () => {
    setTaskDone(task, complete.checked, card);
  });
  card.querySelector('.area').textContent = `${areaName(task.area)} · ${quadrants[task.quadrant]}`;
  card.querySelector('.due').textContent = task.done && task.doneAt ? `закрыто ${formatDateTime(task.doneAt)}` : (task.due ? formatDate(task.due) : '');
  const note = card.querySelector('.note');
  note.textContent = task.note;
  note.hidden = !task.note;

  card.addEventListener('dragstart', event => {
    draggedId = task.id;
    draggedCard = card;
    card.classList.add('dragging');
    event.dataTransfer.effectAllowed = 'move';
    event.dataTransfer.setData('text/plain', task.id);
  });
  card.addEventListener('dragend', () => {
    draggedId = null;
    draggedCard = null;
    card.classList.remove('dragging');
    document.querySelectorAll('.dropzone.drag-over').forEach(zone => zone.classList.remove('drag-over'));
  });

  const editBtn = card.querySelector('.edit');
  const restoreBtn = card.querySelector('.restore');
  editBtn.classList.toggle('hidden', Boolean(task.done));
  editBtn.addEventListener('click', () => openEditDialog(task));
  restoreBtn.classList.toggle('hidden', !task.done);
  restoreBtn.addEventListener('click', () => setTaskDone(task, false, card));
  return card;
}



function openEditDialog(task) {
  editingTaskId = task.id;
  document.querySelector('#editTitle').value = task.title || '';
  document.querySelector('#editArea').value = task.area || 'work';
  document.querySelector('#editQuadrant').value = task.quadrant || 'not-urgent-important';
  document.querySelector('#editDue').value = task.due || '';
  document.querySelector('#editNote').value = task.note || '';
  editDialog.showModal();
}

function setTaskDone(task, done, card) {
  const wasDone = Boolean(task.done);
  task.done = done;
  if (done && !task.doneAt) task.doneAt = new Date().toISOString();
  if (!done) {
    delete task.doneAt;
    if (wasDone) unlockAchievement('second-thought');
  }
  if (done && !wasDone) {
    trackRavenActivity('click', 10);
    celebrateTask(card);
  }
  checkBoardAchievements();
  saveAndRender();
}


function celebrateTask(card) {
  const rect = card.getBoundingClientRect();
  const raven = document.createElement('div');
  raven.className = 'raven-celebration';
  raven.textContent = '🐦‍⬛';
  raven.style.left = `${rect.left + rect.width / 2}px`;
  raven.style.top = `${rect.top + 18}px`;
  document.body.append(raven);
  raven.addEventListener('animationend', () => raven.remove(), { once: true });

  const perch = document.querySelector('.raven-perch');
  const mood = document.querySelector('#ravenMood');
  if (perch) {
    perch.classList.remove('celebrate');
    void perch.offsetWidth;
    perch.classList.add('celebrate');
  }
  if (mood) {
    holdRavenMood('Задача закрыта. Кар-р-расивая работа.', 5000);
  }

  for (let i = 0; i < 28; i += 1) {
    const spark = document.createElement('span');
    spark.className = 'spark';
    const angle = (Math.PI * 2 * i) / 28;
    const distance = 58 + Math.random() * 92;
    spark.style.left = `${rect.left + rect.width / 2}px`;
    spark.style.top = `${rect.top + 38}px`;
    spark.style.setProperty('--x', `${Math.cos(angle) * distance}px`);
    spark.style.setProperty('--y', `${Math.sin(angle) * distance}px`);
    spark.style.setProperty('--hue', `${250 + Math.random() * 90}`);
    document.body.append(spark);
    spark.addEventListener('animationend', () => spark.remove(), { once: true });
  }
}

function wireDropzone(zone, applyChange) {
  zone.addEventListener('dragenter', () => {
    if (draggedId) zone.classList.add('drag-over');
  });
  zone.addEventListener('dragover', event => {
    event.preventDefault();
    if (!draggedCard) return;
    const afterElement = getDragAfterElement(zone, event.clientY);
    const emptyNode = zone.querySelector('.empty');
    if (emptyNode) emptyNode.remove();
    if (afterElement == null) zone.appendChild(draggedCard);
    else zone.insertBefore(draggedCard, afterElement);
  });
  zone.addEventListener('dragleave', event => {
    if (!zone.contains(event.relatedTarget)) zone.classList.remove('drag-over');
  });
  zone.addEventListener('drop', event => {
    event.preventDefault();
    zone.classList.remove('drag-over');
    const task = state.tasks.find(item => item.id === draggedId);
    if (!task) return;
    const oldArea = task.area;
    const oldQuadrant = task.quadrant;
    const orderedIds = [...zone.querySelectorAll('.task-card')].map(card => card.dataset.id);
    applyChange(task);
    moveTaskByDropOrder(task.id, orderedIds);
    trackRavenActivity('click', 5);
    if (task.area !== oldArea) unlockAchievement('migration-raven');
    if (task.quadrant !== oldQuadrant) unlockAchievement('priority-alchemy');
    holdRavenMood('Карточка перелетела. Почти как настоящая доска, только без стикеров под столом.', 4800);
    saveAndRender();
  });
}

function getDragAfterElement(container, y) {
  const draggableElements = [...container.querySelectorAll('.task-card:not(.dragging)')];
  return draggableElements.reduce((closest, child) => {
    const box = child.getBoundingClientRect();
    const offset = y - box.top - box.height / 2;
    if (offset < 0 && offset > closest.offset) return { offset, element: child };
    return closest;
  }, { offset: Number.NEGATIVE_INFINITY, element: null }).element;
}

function moveTaskByDropOrder(taskId, orderedIds) {
  const current = state.tasks.find(task => task.id === taskId);
  if (!current) return;
  const prevId = orderedIds[orderedIds.indexOf(taskId) - 1];
  const nextId = orderedIds[orderedIds.indexOf(taskId) + 1];
  state.tasks = state.tasks.filter(task => task.id !== taskId);
  if (nextId) {
    const nextIndex = state.tasks.findIndex(task => task.id === nextId);
    if (nextIndex >= 0) {
      state.tasks.splice(nextIndex, 0, current);
      return;
    }
  }
  if (prevId) {
    const prevIndex = state.tasks.findIndex(task => task.id === prevId);
    if (prevIndex >= 0) {
      state.tasks.splice(prevIndex + 1, 0, current);
      return;
    }
  }
  state.tasks.unshift(current);
}

function empty(text) {
  const node = document.createElement('div');
  node.className = 'empty';
  node.textContent = text;
  return node;
}


function todayKey() {
  return new Date().toISOString().slice(0, 10);
}

function dateOnly(value) {
  return value ? new Date(value + 'T00:00:00') : null;
}

function isTodayTask(task) {
  return task.due === todayKey();
}

function isOverdueTask(task) {
  return Boolean(task.due && task.due < todayKey());
}

function isThisWeekTask(task) {
  if (!task.due) return false;
  const due = dateOnly(task.due);
  const start = dateOnly(todayKey());
  const end = new Date(start);
  end.setDate(start.getDate() + 7);
  return due >= start && due <= end;
}

function matchesDateFilter(task) {
  if (activeFilter === 'today') return isTodayTask(task);
  if (activeFilter === 'overdue') return isOverdueTask(task);
  if (activeFilter === 'week') return isThisWeekTask(task);
  return true;
}

function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = String(text ?? '');
  return div.innerHTML;
}

function areaName(id) {
  return areas.find(area => area.id === id)?.title ?? id;
}

function formatDate(date) {
  return new Intl.DateTimeFormat('ru-RU', { day: '2-digit', month: '2-digit' }).format(new Date(date + 'T00:00:00'));
}


function formatDateTime(value) {
  return new Intl.DateTimeFormat('ru-RU', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }).format(new Date(value));
}

function urgencyRank(task) {
  return {
    'urgent-important': 0,
    'urgent-not-important': 1,
    'not-urgent-important': 2,
    'not-urgent-not-important': 3,
  }[task.quadrant] ?? 9;
}

init();
