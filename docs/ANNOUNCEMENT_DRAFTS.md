# Announcement drafts

## Human / Telegram-style

Я устала от таск-трекеров, которые хотят быть Jira, Notion, CRM и моей второй работой одновременно.

Поэтому мы сделали Raven Task Board — маленькую open-source доску задач поверх Markdown/Obsidian.

Что внутри:
- канбан по направлениям;
- срочно/важно;
- блок «Сегодня»;
- фокус-сессии;
- архив закрытых задач;
- экспорт JSON/Markdown;
- локальное хранение;
- ворон-фамильяр Джарвис, который смотрит на хаос осуждающе, но с пользой.

Это пока ранний прототип, без code signing сертификатов для desktop-сборок, зато код открыт и можно посмотреть, запустить, форкнуть или предложить правки.

GitHub: https://github.com/NeMarusia/raven-task-board

Если идея близка — поставьте звезду, откройте issue или просто скажите, чего вам не хватает в личной доске задач.

## More technical

Raven Task Board is an early open-source local-first task board for Markdown/Obsidian workflows.

It supports kanban views, Eisenhower matrix, today/overdue/week filters, focus sessions, JSON/Markdown export and an optional local backend that stores the board state in an Obsidian-compatible Markdown file.

No cloud account is required. Browser mode uses localStorage; desktop/backend mode can write to a local `.md` file.

Status: usable prototype. Desktop builds are not code-signed yet, so macOS/Windows may warn on first launch.

Repo: https://github.com/NeMarusia/raven-task-board

Feedback, issues and forks are very welcome.
