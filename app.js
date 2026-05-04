const STORAGE_KEY = 'raven-task-board:v1';

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

const areaSelect = document.querySelector('#taskArea');
const form = document.querySelector('#taskForm');
const noteInput = document.querySelector('#taskNote');
const searchInput = document.querySelector('#search');

// HTML already contains fallback options so the select is never an empty Chrome goblin.
areaSelect.innerHTML = '';
areas.forEach(area => {
  const option = document.createElement('option');
  option.value = area.id;
  option.textContent = area.title;
  areaSelect.append(option);
});

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
  state.tasks.unshift(task);
  saveAndRender();
  form.reset();
  noteInput.value = '';
});

searchInput.addEventListener('input', render);

document.querySelectorAll('.tab').forEach(tab => {
  tab.addEventListener('click', () => {
    document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
    tab.classList.add('active');
    document.querySelectorAll('.view').forEach(view => view.classList.add('hidden'));
    document.querySelector(`#${tab.dataset.view}View`).classList.remove('hidden');
    render();
  });
});

document.querySelector('#resetBtn').addEventListener('click', () => {
  if (!confirm('Очистить все задачи? Это локальное действие, но всё равно неприятно.')) return;
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
});



document.querySelector('#markdownBtn').addEventListener('click', async () => {
  const markdown = toMarkdown();
  try {
    await navigator.clipboard.writeText(markdown);
    alert('Markdown скопирован в буфер. Можно вставлять в Obsidian.');
  } catch {
    const blob = new Blob([markdown], { type: 'text/markdown' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `Воронья доска задач — ${new Date().toISOString().slice(0,10)}.md`;
    link.click();
    URL.revokeObjectURL(link.href);
  }
});

document.querySelector('#importFile').addEventListener('change', async event => {
  const file = event.target.files[0];
  if (!file) return;
  const imported = JSON.parse(await file.text());
  if (!Array.isArray(imported.tasks)) throw new Error('Неверный формат файла');
  state = imported;
  saveAndRender();
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
}


function filteredTasks() {
  const query = searchInput.value.trim().toLowerCase();
  return state.tasks.filter(task => !task.done).filter(task => {
    if (!query) return true;
    return [task.title, task.note, areaName(task.area), quadrants[task.quadrant]].join(' ').toLowerCase().includes(query);
  });
}

function render() {
  renderKanban();
  renderMatrix();
  renderList();
  renderDone();
  updateRavenMood();
}


function updateRavenMood() {
  const mood = document.querySelector('#ravenMood');
  if (!mood) return;
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

  card.addEventListener('dragstart', () => {
    draggedId = task.id;
    card.classList.add('dragging');
  });
  card.addEventListener('dragend', () => {
    draggedId = null;
    card.classList.remove('dragging');
  });

  const doneBtn = card.querySelector('.done');
  const restoreBtn = card.querySelector('.restore');
  doneBtn.classList.toggle('hidden', Boolean(task.done));
  restoreBtn.classList.toggle('hidden', !task.done);
  doneBtn.addEventListener('click', () => setTaskDone(task, true, card));
  restoreBtn.addEventListener('click', () => setTaskDone(task, false, card));
  card.querySelector('.delete').addEventListener('click', () => {
    state.tasks = state.tasks.filter(item => item.id !== task.id);
    saveAndRender();
  });
  card.querySelector('.move').addEventListener('click', () => quickMove(task));
  return card;
}


function setTaskDone(task, done, card) {
  const wasDone = Boolean(task.done);
  task.done = done;
  if (done && !task.doneAt) task.doneAt = new Date().toISOString();
  if (!done) delete task.doneAt;
  if (done && !wasDone) celebrateTask(card);
  saveAndRender();
}

function quickMove(task) {
  const nextArea = prompt(`Направление: ${areas.map(a => a.id + '=' + a.title).join(', ')}`, task.area);
  if (nextArea && areas.some(a => a.id === nextArea)) task.area = nextArea;
  const nextQuadrant = prompt(`Квадрант: ${Object.keys(quadrants).join(', ')}`, task.quadrant);
  if (nextQuadrant && quadrants[nextQuadrant]) task.quadrant = nextQuadrant;
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
    const oldMood = mood.textContent;
    mood.textContent = 'Задача закрыта. Кар-р-расивая работа.';
    setTimeout(() => { mood.textContent = oldMood || 'Смотрю, как задачи текут.'; }, 2200);
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
  zone.addEventListener('dragover', event => event.preventDefault());
  zone.addEventListener('drop', event => {
    event.preventDefault();
    const task = state.tasks.find(item => item.id === draggedId);
    if (!task) return;
    applyChange(task);
    saveAndRender();
  });
}

function empty(text) {
  const node = document.createElement('div');
  node.className = 'empty';
  node.textContent = text;
  return node;
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
