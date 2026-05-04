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

let state = loadState();
let draggedId = null;

const areaSelect = document.querySelector('#taskArea');
const form = document.querySelector('#taskForm');
const noteInput = document.querySelector('#taskNote');
const searchInput = document.querySelector('#search');

areas.forEach(area => {
  const option = document.createElement('option');
  option.value = area.id;
  option.textContent = area.title;
  areaSelect.append(option);
});

form.addEventListener('submit', event => {
  event.preventDefault();
  const task = {
    id: crypto.randomUUID(),
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

document.querySelector('#importFile').addEventListener('change', async event => {
  const file = event.target.files[0];
  if (!file) return;
  const imported = JSON.parse(await file.text());
  if (!Array.isArray(imported.tasks)) throw new Error('Неверный формат файла');
  state = imported;
  saveAndRender();
});

function loadState() {
  const saved = localStorage.getItem(STORAGE_KEY);
  if (saved) return JSON.parse(saved);
  return {
    tasks: [
      {
        id: crypto.randomUUID(),
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

function saveAndRender() {
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

function taskCard(task) {
  const template = document.querySelector('#taskTemplate');
  const card = template.content.firstElementChild.cloneNode(true);
  card.dataset.id = task.id;
  card.querySelector('h3').textContent = task.title;
  card.querySelector('.area').textContent = `${areaName(task.area)} · ${quadrants[task.quadrant]}`;
  card.querySelector('.due').textContent = task.due ? formatDate(task.due) : '';
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

  card.querySelector('.done').addEventListener('click', () => {
    task.done = true;
    saveAndRender();
  });
  card.querySelector('.delete').addEventListener('click', () => {
    state.tasks = state.tasks.filter(item => item.id !== task.id);
    saveAndRender();
  });
  card.querySelector('.move').addEventListener('click', () => quickMove(task));
  return card;
}

function quickMove(task) {
  const nextArea = prompt(`Направление: ${areas.map(a => a.id + '=' + a.title).join(', ')}`, task.area);
  if (nextArea && areas.some(a => a.id === nextArea)) task.area = nextArea;
  const nextQuadrant = prompt(`Квадрант: ${Object.keys(quadrants).join(', ')}`, task.quadrant);
  if (nextQuadrant && quadrants[nextQuadrant]) task.quadrant = nextQuadrant;
  saveAndRender();
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

function urgencyRank(task) {
  return {
    'urgent-important': 0,
    'urgent-not-important': 1,
    'not-urgent-important': 2,
    'not-urgent-not-important': 3,
  }[task.quadrant] ?? 9;
}

render();
