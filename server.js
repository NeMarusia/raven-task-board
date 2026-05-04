const http = require('node:http');
const fs = require('node:fs/promises');
const path = require('node:path');

const PORT = Number(process.env.PORT || 8099);
const ROOT = __dirname;
const OBSIDIAN_FILE = process.env.RAVEN_OBSIDIAN_FILE || '/home/sunrise/Obsidian/данные о владельце/работа/Воронья доска задач.md';
const AUTH_USER = process.env.RAVEN_AUTH_USER || '';
const AUTH_PASSWORD = process.env.RAVEN_AUTH_PASSWORD || '';
const REQUIRE_AUTH = process.env.RAVEN_REQUIRE_AUTH !== 'false';
const AUTH_REALM = 'Raven Task Board';

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
};

function json(res, status, body) {
  res.writeHead(status, { 'content-type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify(body));
}

function timingSafeEqualText(a, b) {
  const left = Buffer.from(String(a));
  const right = Buffer.from(String(b));
  if (left.length !== right.length) return false;
  return require('node:crypto').timingSafeEqual(left, right);
}

function hasValidAuth(req) {
  if (!REQUIRE_AUTH) return true;
  if (!AUTH_USER || !AUTH_PASSWORD) return false;
  const header = req.headers.authorization || '';
  if (!header.startsWith('Basic ')) return false;
  let decoded = '';
  try {
    decoded = Buffer.from(header.slice(6), 'base64').toString('utf8');
  } catch {
    return false;
  }
  const separator = decoded.indexOf(':');
  if (separator < 0) return false;
  const user = decoded.slice(0, separator);
  const password = decoded.slice(separator + 1);
  return timingSafeEqualText(user, AUTH_USER) && timingSafeEqualText(password, AUTH_PASSWORD);
}

function requestAuth(res) {
  res.writeHead(401, {
    'www-authenticate': `Basic realm="${AUTH_REALM}", charset="UTF-8"`,
    'content-type': 'text/plain; charset=utf-8',
    'cache-control': 'no-store',
  });
  res.end('Authentication required');
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
    if (!hasValidAuth(req)) return requestAuth(res);

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
  console.log(REQUIRE_AUTH ? 'HTTP Basic Auth: enabled' : 'HTTP Basic Auth: disabled');
  if (REQUIRE_AUTH && (!AUTH_USER || !AUTH_PASSWORD)) {
    console.warn('WARNING: RAVEN_AUTH_USER/RAVEN_AUTH_PASSWORD are not set; all requests will be rejected.');
  }
});
