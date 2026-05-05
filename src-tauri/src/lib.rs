use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use std::{
    fs,
    path::{Path, PathBuf},
};
use tauri::{AppHandle, Manager};

const DATA_BLOCK_START: &str = "```raven-task-board-json";
const DATA_BLOCK_END: &str = "```";

#[derive(Debug, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
struct Settings {
    board_path: Option<String>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct DesktopStatus {
    available: bool,
    board_path: Option<String>,
}

fn settings_path(app: &AppHandle) -> Result<PathBuf, String> {
    let dir = app
        .path()
        .app_config_dir()
        .map_err(|err| format!("Cannot resolve app config dir: {err}"))?;
    fs::create_dir_all(&dir).map_err(|err| format!("Cannot create app config dir: {err}"))?;
    Ok(dir.join("settings.json"))
}

fn read_settings(app: &AppHandle) -> Settings {
    let Ok(path) = settings_path(app) else {
        return Settings::default();
    };
    let Ok(text) = fs::read_to_string(path) else {
        return Settings::default();
    };
    serde_json::from_str(&text).unwrap_or_default()
}

fn write_settings(app: &AppHandle, settings: &Settings) -> Result<(), String> {
    let path = settings_path(app)?;
    let text = serde_json::to_string_pretty(settings).map_err(|err| err.to_string())?;
    fs::write(path, text).map_err(|err| format!("Cannot write settings: {err}"))
}

fn empty_state() -> Value {
    json!({ "tasks": [] })
}

fn validate_state(state: &Value) -> Result<(), String> {
    match state.get("tasks").and_then(Value::as_array) {
        Some(_) => Ok(()),
        None => Err("Invalid board state: expected { tasks: [] }".into()),
    }
}

fn read_state_from_markdown(path: &Path) -> Result<Value, String> {
    if !path.exists() {
        return Ok(empty_state());
    }
    let text = fs::read_to_string(path).map_err(|err| format!("Cannot read board file: {err}"))?;
    let Some(start) = text.find(DATA_BLOCK_START) else {
        return Ok(empty_state());
    };
    let json_start = start + DATA_BLOCK_START.len();
    let rest = text[json_start..].trim_start_matches(['\r', '\n']);
    let Some(end) = rest.find(DATA_BLOCK_END) else {
        return Ok(empty_state());
    };
    let raw = rest[..end].trim();
    let parsed: Value =
        serde_json::from_str(raw).map_err(|err| format!("Cannot parse board JSON block: {err}"))?;
    validate_state(&parsed)?;
    Ok(parsed)
}

fn escape_md(value: Option<&Value>) -> String {
    value
        .and_then(Value::as_str)
        .unwrap_or("")
        .replace('|', "\\|")
}

fn area_name(value: Option<&Value>) -> String {
    match value.and_then(Value::as_str).unwrap_or("") {
        "work" => "Работа".into(),
        "study" => "Диплом / учёба".into(),
        "personal" => "Личное".into(),
        "waiting" => "Жду ответа".into(),
        other if !other.is_empty() => other.into(),
        _ => "Без направления".into(),
    }
}

fn quadrant_name(key: &str) -> &'static str {
    match key {
        "urgent-important" => "🔥 Срочно + важно",
        "not-urgent-important" => "🌱 Не срочно + важно",
        "urgent-not-important" => "⚡ Срочно + неважно",
        "not-urgent-not-important" => "🪶 Не срочно + неважно",
        _ => "Без квадранта",
    }
}

fn state_to_markdown(state: &Value) -> Result<String, String> {
    validate_state(state)?;
    let tasks = state.get("tasks").and_then(Value::as_array).unwrap();
    let mut lines = vec![
        "# Воронья доска задач".to_string(),
        "".to_string(),
        "> Автоматически обновляется из Raven Task Board Desktop. Можно читать и править глазами, но машинные данные лучше не ломать руками, а то ворон будет шипеть.".to_string(),
        "".to_string(),
    ];

    for qid in [
        "urgent-important",
        "not-urgent-important",
        "urgent-not-important",
        "not-urgent-not-important",
    ] {
        lines.push(format!("## {}", quadrant_name(qid)));
        lines.push("".into());
        let mut any = false;
        for task in tasks.iter().filter(|task| {
            !task.get("done").and_then(Value::as_bool).unwrap_or(false)
                && task.get("quadrant").and_then(Value::as_str) == Some(qid)
        }) {
            any = true;
            let title = escape_md(task.get("title"));
            let area = area_name(task.get("area"));
            let due = task
                .get("due")
                .and_then(Value::as_str)
                .filter(|s| !s.is_empty())
                .map(|s| format!(" 📅 {s}"))
                .unwrap_or_default();
            lines.push(format!("- [ ] **{title}** — {area}{due}"));
            if let Some(note) = task
                .get("note")
                .and_then(Value::as_str)
                .filter(|s| !s.is_empty())
            {
                for line in note.lines() {
                    lines.push(format!("  - {}", line.replace('|', "\\|")));
                }
            }
        }
        if !any {
            lines.push("_Пусто._".into());
        }
        lines.push("".into());
    }

    lines.push("## ✅ Завершённые".into());
    lines.push("".into());
    let done: Vec<&Value> = tasks
        .iter()
        .filter(|task| task.get("done").and_then(Value::as_bool).unwrap_or(false))
        .collect();
    if done.is_empty() {
        lines.push("_Пока пусто._".into());
    } else {
        for task in done.iter().rev().take(40).rev() {
            let title = escape_md(task.get("title"));
            let area = area_name(task.get("area"));
            lines.push(format!("- [x] {title} — {area}"));
        }
    }
    lines.push("".into());
    lines.push("---".into());
    lines.push("".into());
    lines.push("## Данные приложения".into());
    lines.push("".into());
    lines.push(DATA_BLOCK_START.into());
    lines.push(serde_json::to_string_pretty(state).map_err(|err| err.to_string())?);
    lines.push(DATA_BLOCK_END.into());
    lines.push("".into());
    Ok(lines.join("\n"))
}

fn write_state_to_markdown(path: &Path, state: &Value) -> Result<(), String> {
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent)
            .map_err(|err| format!("Cannot create board directory: {err}"))?;
    }
    let text = state_to_markdown(state)?;
    fs::write(path, text).map_err(|err| format!("Cannot write board file: {err}"))
}

#[tauri::command]
fn desktop_status(app: AppHandle) -> DesktopStatus {
    let settings = read_settings(&app);
    DesktopStatus {
        available: true,
        board_path: settings.board_path,
    }
}

#[tauri::command]
fn read_board(app: AppHandle) -> Result<Value, String> {
    let settings = read_settings(&app);
    let Some(board_path) = settings.board_path else {
        return Ok(empty_state());
    };
    read_state_from_markdown(Path::new(&board_path))
}

#[tauri::command]
fn save_board(app: AppHandle, state: Value) -> Result<(), String> {
    validate_state(&state)?;
    let settings = read_settings(&app);
    let Some(board_path) = settings.board_path else {
        return Ok(());
    };
    write_state_to_markdown(Path::new(&board_path), &state)
}

#[tauri::command]
fn choose_board_file(app: AppHandle) -> Result<Option<Value>, String> {
    let file = rfd::FileDialog::new()
        .set_title("Открыть доску RTB")
        .add_filter("Markdown", &["md", "markdown"])
        .add_filter("All files", &["*"])
        .pick_file();
    let Some(path) = file else {
        return Ok(None);
    };
    let state = read_state_from_markdown(&path)?;
    write_settings(
        &app,
        &Settings {
            board_path: Some(path.to_string_lossy().to_string()),
        },
    )?;
    Ok(Some(state))
}

#[tauri::command]
fn create_board_file(app: AppHandle, state: Value) -> Result<Option<String>, String> {
    validate_state(&state)?;
    let file = rfd::FileDialog::new()
        .set_title("Создать доску RTB")
        .set_file_name("Воронья доска задач.md")
        .add_filter("Markdown", &["md", "markdown"])
        .save_file();
    let Some(path) = file else {
        return Ok(None);
    };
    write_state_to_markdown(&path, &state)?;
    let board_path = path.to_string_lossy().to_string();
    write_settings(
        &app,
        &Settings {
            board_path: Some(board_path.clone()),
        },
    )?;
    Ok(Some(board_path))
}

pub fn run() {
    tauri::Builder::default()
        .invoke_handler(tauri::generate_handler![
            desktop_status,
            read_board,
            save_board,
            choose_board_file,
            create_board_file,
        ])
        .run(tauri::generate_context!())
        .expect("error while running Raven Task Board");
}
