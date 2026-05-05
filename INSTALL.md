# Установка и обновление Raven Task Board Desktop

RTB хранит доску отдельно от приложения — в выбранном Markdown-файле (`.md`). Поэтому переустановка или обновление `.app`/`.exe` не должны трогать задачи.

## macOS

### Установка

1. Откройте страницу последнего Release или успешного GitHub Actions build.
2. Скачайте macOS-файл:
   - для Apple Silicon: `Raven-Task-Board-...-macOS-arm64.dmg`.
3. Откройте `.dmg`.
4. Перетащите `Raven Task Board.app` в `Applications / Программы`.
5. При первом запуске, если macOS ругается на неизвестного разработчика:
   - откройте `Applications / Программы`;
   - нажмите `Ctrl` + click / правой кнопкой по `Raven Task Board`;
   - выберите `Open / Открыть`;
   - подтвердите `Open / Открыть` ещё раз.

Если macOS пишет, что приложение повреждено, снимите quarantine-флаг:

```bash
xattr -dr com.apple.quarantine "/Applications/Raven Task Board.app"
```

### Обновление

1. Закройте RTB.
2. Скачайте новый `.dmg`.
3. Откройте `.dmg`.
4. Перетащите `Raven Task Board.app` в `Applications / Программы`.
5. Когда macOS спросит, заменить ли существующее приложение, выберите `Replace / Заменить`.

Markdown-файл доски не удаляется и не перезаписывается установщиком.

## Windows

1. Скачайте Windows installer из Release или GitHub Actions artifact.
2. Запустите установщик.
3. Если Windows SmartScreen предупреждает о неизвестном издателе, выберите `More info / Подробнее` → `Run anyway / Выполнить в любом случае`.
4. Для обновления установите новую версию поверх старой.

## Где хранятся задачи

В desktop-режиме RTB предлагает создать или открыть Markdown-файл доски. Его удобно держать в Obsidian vault, например:

```text
Obsidian/работа/Воронья доска задач.md
```

Внутри файла есть человекочитаемые списки задач и служебный блок:

````markdown
```raven-task-board-json
{
  "tasks": []
}
```
````

RTB читает и пишет именно этот JSON-блок. Руками лучше его не ломать — ворон будет шипеть, и на этот раз по делу.

## Как выпускать новую версию

Для обычной разработки достаточно пушить коммиты в `master`: GitHub Actions соберёт проверочные Windows/macOS artifacts.

Для продуктового релиза:

```bash
git tag v0.1.1
git push origin v0.1.1
```

Workflow `Release RTB Desktop` соберёт desktop-пакеты и прикрепит их к GitHub Release.
