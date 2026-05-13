const http = require('node:http');
const fs = require('node:fs/promises');
const path = require('node:path');

const PORT = Number(process.env.PORT || 8099);
const ROOT = __dirname;
const OBSIDIAN_FILE = process.env.RAVEN_OBSIDIAN_FILE || '/home/sunrise/Obsidian/данные о владельце/работа/Воронья доска задач.md';

const AREAS = {
  work: 'Работа',
  study: 'Диплом / учёба',
  personal: 'Личное',
  waiting: 'Жду ответа',
};

const QUADRANTS = {
  'urgent-important': '🔥 Срочно + важно',
  'not-urgent-important': '🌱 Не срочно + важно',
  'urgent-not-important': '⚡ Срочно + неважно',
  'not-urgent-not-important': '🪶 Не срочно + неважно',
};

const EMPTY_STATE = { tasks: [] };

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.md': 'text/markdown; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.svg': 'image/svg+xml',
};

function json(res, status, body) {
  res.writeHead(status, { 'content-type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify(body));
}

async function readBody(req) {
  let data = '';
  for await (const chunk of req) data += chunk;
  return data ? JSON.parse(data) : {};
}

async function readState() {
  try {
    const text = await fs.readFile(OBSIDIAN_FILE, 'utf8');
    const match = text.match(/```raven-task-board-json\n([\s\S]*?)\n```/);
    if (!match) return EMPTY_STATE;
    const parsed = JSON.parse(match[1]);
    if (!Array.isArray(parsed.tasks)) return EMPTY_STATE;
    return parsed;
  } catch (error) {
    if (error.code === 'ENOENT') return EMPTY_STATE;
    throw error;
  }
}

function escapeMd(text) {
  return String(text || '').replace(/\|/g, '\\|');
}

function toMarkdown(state) {
  const lines = [];
  lines.push('# Воронья доска задач');
  lines.push('');
  lines.push('> Автоматически обновляется из Raven Task Board. Можно читать и править глазами, но машинные данные лучше не ломать руками, а то ворон будет шипеть.');
  lines.push('');
  lines.push(`Обновлено: ${new Date().toLocaleString('ru-RU', { timeZone: 'Europe/Moscow' })}`);
  lines.push('');

  for (const [qid, qtitle] of Object.entries(QUADRANTS)) {
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
      const area = AREAS[task.area] || task.area || 'Без направления';
      lines.push(`- [ ] **${escapeMd(task.title)}** — ${escapeMd(area)}${due}`);
      if (task.note) {
        for (const line of String(task.note).split('\n')) lines.push(`  - ${escapeMd(line)}`);
      }
    }
    lines.push('');
  }

  const done = state.tasks.filter(task => task.done).slice(-40);
  lines.push('## ✅ Завершённые');
  lines.push('');
  if (!done.length) lines.push('_Пока пусто._');
  for (const task of done) {
    const area = AREAS[task.area] || task.area || 'Без направления';
    lines.push(`- [x] ${escapeMd(task.title)} — ${escapeMd(area)}`);
  }
  lines.push('');
  lines.push('---');
  lines.push('');
  lines.push('## Данные приложения');
  lines.push('');
  lines.push('```raven-task-board-json');
  lines.push(JSON.stringify(state, null, 2));
  lines.push('```');
  lines.push('');
  return lines.join('\n');
}

async function writeState(state) {
  if (!state || !Array.isArray(state.tasks)) throw new Error('Invalid state');
  await fs.mkdir(path.dirname(OBSIDIAN_FILE), { recursive: true });
  await fs.writeFile(OBSIDIAN_FILE, toMarkdown(state), 'utf8');
}

async function serveStatic(req, res) {
  const rawUrl = new URL(req.url, `http://${req.headers.host}`);
  const pathname = rawUrl.pathname === '/' ? '/index.html' : decodeURIComponent(rawUrl.pathname);
  const safePath = path.normalize(path.join(ROOT, pathname));
  if (!safePath.startsWith(ROOT)) {
    res.writeHead(403);
    res.end('Forbidden');
    return;
  }
  try {
    const data = await fs.readFile(safePath);
    res.writeHead(200, { 'content-type': MIME[path.extname(safePath)] || 'application/octet-stream' });
    res.end(data);
  } catch (error) {
    res.writeHead(error.code === 'ENOENT' ? 404 : 500);
    res.end(error.code === 'ENOENT' ? 'Not found' : String(error));
  }
}

const server = http.createServer(async (req, res) => {
  try {
    if (req.url === '/api/tasks' && req.method === 'GET') {
      return json(res, 200, { state: await readState(), obsidianFile: OBSIDIAN_FILE });
    }
    if (req.url === '/api/tasks' && req.method === 'PUT') {
      const body = await readBody(req);
      await writeState(body.state);
      return json(res, 200, { ok: true, obsidianFile: OBSIDIAN_FILE });
    }
    return serveStatic(req, res);
  } catch (error) {
    console.error(error);
    return json(res, 500, { error: String(error.message || error) });
  }
});

server.listen(PORT, '0.0.0.0', () => {
  console.log(`Raven Task Board: http://0.0.0.0:${PORT}`);
  console.log(`Obsidian file: ${OBSIDIAN_FILE}`);
  console.log('Auth: handled by reverse proxy (Node server has no built-in auth)');
});
