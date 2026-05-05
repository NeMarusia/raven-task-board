# GitHub technical post draft

## Short version

Shipped an early open-source prototype of **Raven Task Board** — a local-first task board for Markdown/Obsidian workflows.

Repo: https://github.com/NeMarusia/raven-task-board
Demo: https://nemarusia.github.io/raven-task-board/

It is intentionally small: kanban, Eisenhower matrix, today/overdue/week focus, archive, JSON/Markdown export, optional Obsidian-backed storage, and a tiny raven familiar because productivity tools are allowed to have a soul.

The app can run as:

- static browser app with `localStorage`;
- local Node backend that writes to a Markdown file;
- Tauri desktop app.

Current status: usable prototype. Desktop builds are not code-signed yet, so OS warnings are expected. Code is open; feedback/issues/forks are welcome.

## Longer version

I pushed the first public version of **Raven Task Board**.

It started as a very practical problem: personal task trackers often become either too heavy for daily life or too detached from the place where notes already live. I wanted a small board that can sit close to Markdown/Obsidian, keep data local, and still give a clear operational view of what matters today.

What is inside:

- kanban by areas;
- Eisenhower matrix;
- today / overdue / week filters;
- task editing without recreating cards;
- completed-task archive;
- focus session and small rituals;
- JSON import/export;
- Markdown export;
- optional backend storage in an Obsidian-compatible `.md` file;
- Tauri desktop wrapper;
- a raven familiar with reactions, achievements and cosmetics, because sterile productivity software is boring.

Architecture is intentionally simple:

- vanilla HTML/CSS/JS frontend;
- Node built-in `http` backend, no Express;
- browser-only fallback via `localStorage`;
- Markdown file storage with a fenced `raven-task-board-json` block;
- Tauri for desktop builds.

This is not positioned as a polished SaaS or enterprise product. It is an early open-source local-first tool: useful already, but still rough around the edges. Desktop builds are currently unsigned, so macOS/Windows warnings are expected until code signing is added.

Links:

- Repo: https://github.com/NeMarusia/raven-task-board
- Demo: https://nemarusia.github.io/raven-task-board/
- Roadmap: https://github.com/NeMarusia/raven-task-board/blob/master/ROADMAP.md

If you use Obsidian/Markdown for personal operations, I would love feedback: what would make this actually fit your workflow — recurring tasks, custom columns, mobile/PWA, import from Markdown task lists, or something else?
