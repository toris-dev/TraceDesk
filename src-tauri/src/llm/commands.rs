use crate::llm::client::{chat, list_models, test_connection, LlmChatResult, LlmModelInfo};
use crate::llm::context::{build_action_context, system_prompt, user_prompt};
use crate::llm::secrets::{has_api_key, load_secrets, save_secrets, LlmSecrets};
use crate::settings::{
    default_url_for_llm_provider, is_default_api_base_url, normalize_llm_provider, save_settings,
    uses_api_base_url, AppSettings,
};
use crate::settings_commands::SettingsState;
use crate::state::AppState;
use chrono::NaiveDate;
use serde::Serialize;
use tauri::State;

#[derive(Debug, Clone, Serialize)]
pub struct LlmConfigView {
    pub provider: String,
    pub model: String,
    pub ollama_base_url: String,
    pub api_base_url: String,
    pub has_api_key: bool,
    pub connected: bool,
}

fn config_view(settings: &AppSettings) -> LlmConfigView {
    LlmConfigView {
        provider: settings.llm_provider.clone(),
        model: settings.llm_model.clone(),
        ollama_base_url: settings.ollama_base_url.clone(),
        api_base_url: settings.api_base_url.clone(),
        has_api_key: has_api_key(),
        connected: settings.llm_connected,
    }
}

#[tauri::command]
pub fn get_llm_config(state: State<SettingsState>) -> Result<LlmConfigView, String> {
    let settings = state.0.read().map_err(|e| e.to_string())?;
    Ok(config_view(&settings))
}

#[tauri::command]
pub fn update_llm_settings(
    state: State<SettingsState>,
    provider: Option<String>,
    model: Option<String>,
    ollama_base_url: Option<String>,
    api_base_url: Option<String>,
) -> Result<LlmConfigView, String> {
    let mut settings = state.0.write().map_err(|e| e.to_string())?;

    if let Some(v) = provider {
        let next = normalize_llm_provider(&v);
        if uses_api_base_url(&next) {
            if settings.api_base_url.trim().is_empty() || is_default_api_base_url(&settings.api_base_url)
            {
                settings.api_base_url = default_url_for_llm_provider(&next);
            }
        }
        settings.llm_provider = next;
        settings.llm_connected = false;
    }
    if let Some(v) = model {
        settings.llm_model = v.trim().to_string();
    }
    if let Some(v) = ollama_base_url {
        settings.ollama_base_url = v.trim().to_string();
        settings.llm_connected = false;
    }
    if let Some(v) = api_base_url {
        settings.api_base_url = v.trim().to_string();
        settings.llm_connected = false;
    }

    save_settings(&settings).map_err(|e| e.to_string())?;
    Ok(config_view(&settings))
}

#[tauri::command]
pub fn set_llm_api_key(api_key: Option<String>) -> Result<LlmConfigView, String> {
    let key = api_key.unwrap_or_default();
    save_secrets(&LlmSecrets { api_key: key }).map_err(|e| e.to_string())?;
    let mut settings = crate::settings::load_settings();
    settings.llm_connected = false;
    save_settings(&settings).map_err(|e| e.to_string())?;
    Ok(config_view(&settings))
}

#[tauri::command]
pub async fn llm_list_models(state: State<'_, SettingsState>) -> Result<Vec<LlmModelInfo>, String> {
    let settings = state.0.read().map_err(|e| e.to_string())?.clone();
    list_models(&settings).await.map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn llm_test_connection(state: State<'_, SettingsState>) -> Result<String, String> {
    let settings = state.0.read().map_err(|e| e.to_string())?.clone();
    let result = test_connection(&settings).await.map_err(|e| e.to_string())?;
    let mut settings = state.0.write().map_err(|e| e.to_string())?;
    settings.llm_connected = true;
    save_settings(&settings).map_err(|e| e.to_string())?;
    Ok(result)
}

fn validate_llm_ready(settings: &AppSettings) -> Result<(), String> {
    if settings.llm_model.trim().is_empty() {
        return Err("설정 → AI / LLM에서 모델을 선택하고 연결하세요".into());
    }
    if settings.llm_provider == "openai" && load_secrets().api_key.trim().is_empty() {
        return Err("설정 → AI / LLM에서 API 키를 저장하세요".into());
    }
    if !settings.llm_connected {
        return Err("설정 → AI / LLM에서 「연결하기」를 눌러 주세요".into());
    }
    Ok(())
}

fn parse_date(date: Option<String>) -> Result<NaiveDate, String> {
    match date {
        Some(d) => NaiveDate::parse_from_str(&d, "%Y-%m-%d").map_err(|e| e.to_string()),
        None => Ok(chrono::Local::now().date_naive()),
    }
}

#[tauri::command]
pub async fn llm_ask_actions(
    app_state: State<'_, AppState>,
    settings_state: State<'_, SettingsState>,
    question: String,
    date: Option<String>,
) -> Result<LlmChatResult, String> {
    let question = question.trim().to_string();
    if question.is_empty() {
        return Err("질문을 입력하세요".into());
    }

    let settings = settings_state.0.read().map_err(|e| e.to_string())?.clone();
    validate_llm_ready(&settings)?;

    let day = parse_date(date)?;
    let context = build_action_context(&app_state.repository, day).map_err(|e| e.to_string())?;
    let system = system_prompt(&settings.locale);
    let user = user_prompt(&question, day, &context);

    chat(&settings, system, &user)
        .await
        .map_err(|e| e.to_string())
}

pub fn companion_system_prompt(locale: &str) -> &'static str {
    if locale == "en" {
        "You are the TraceDesk turtle assistant — friendly, concise, and helpful. You can answer general questions and, when activity logs are provided, help the user recall copy/paste/screenshot history. Never invent activity that is not in the log."
    } else {
        "당신은 TraceDesk 거북이 도우미입니다. 친근하고 간결하게 답하세요. 활동 기록이 주어지면 복사·붙여넣기·캡처 내역을 바탕으로 도와주고, 기록에 없는 내용은 지어내지 마세요."
    }
}

#[tauri::command]
pub async fn llm_chat(
    app_state: State<'_, AppState>,
    settings_state: State<'_, SettingsState>,
    message: String,
    include_activity: bool,
    date: Option<String>,
) -> Result<LlmChatResult, String> {
    let message = message.trim().to_string();
    if message.is_empty() {
        return Err("메시지를 입력하세요".into());
    }

    let settings = settings_state.0.read().map_err(|e| e.to_string())?.clone();
    validate_llm_ready(&settings)?;

    let day = parse_date(date)?;
    let mut user = message.clone();
    if include_activity {
        let context = build_action_context(&app_state.repository, day).map_err(|e| e.to_string())?;
        user = format!(
            "날짜: {}\n\n활동 기록:\n{}\n\n사용자: {}",
            day.format("%Y-%m-%d"),
            if context.is_empty() {
                "(기록 없음)"
            } else {
                &context
            },
            message
        );
    }

    chat(
        &settings,
        companion_system_prompt(&settings.locale),
        &user,
    )
    .await
    .map_err(|e| e.to_string())
}
