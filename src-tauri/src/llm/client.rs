use crate::llm::secrets::load_secrets;
use crate::settings::AppSettings;
use anyhow::{anyhow, Context, Result};
use serde::{Deserialize, Serialize};
use serde_json::json;

#[derive(Debug, Clone, Serialize)]
pub struct LlmModelInfo {
    pub id: String,
    pub name: String,
}

#[derive(Debug, Clone, Serialize)]
pub struct LlmChatResult {
    pub answer: String,
    pub model: String,
    pub provider: String,
}

fn http() -> Result<reqwest::Client> {
    reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(120))
        .build()
        .context("failed to build HTTP client")
}

pub async fn list_models(settings: &AppSettings) -> Result<Vec<LlmModelInfo>> {
    match settings.llm_provider.as_str() {
        "ollama" => list_ollama_models(&settings.ollama_base_url).await,
        "openai" => list_openai_models(settings).await,
        other => Err(anyhow!("unsupported provider: {other}")),
    }
}

async fn list_ollama_models(base_url: &str) -> Result<Vec<LlmModelInfo>> {
    let url = format!("{}/api/tags", base_url.trim_end_matches('/'));
    let resp = http()?
        .get(&url)
        .send()
        .await
        .context("Ollama 연결 실패 — Ollama가 실행 중인지 확인하세요")?;

    if !resp.status().is_success() {
        return Err(anyhow!("Ollama 오류: HTTP {}", resp.status()));
    }

    #[derive(Deserialize)]
    struct TagsResponse {
        models: Vec<OllamaModel>,
    }
    #[derive(Deserialize)]
    struct OllamaModel {
        name: String,
    }

    let body: TagsResponse = resp.json().await.context("Ollama 응답 파싱 실패")?;
    Ok(body
        .models
        .into_iter()
        .map(|m| LlmModelInfo {
            name: m.name.clone(),
            id: m.name,
        })
        .collect())
}

async fn list_openai_models(settings: &AppSettings) -> Result<Vec<LlmModelInfo>> {
    let key = load_secrets().api_key.trim().to_string();
    if key.is_empty() {
        return Err(anyhow!("API 키가 설정되지 않았습니다"));
    }

    let url = format!(
        "{}/models",
        settings.api_base_url.trim_end_matches('/')
    );
    let resp = http()?
        .get(&url)
        .bearer_auth(&key)
        .send()
        .await
        .context("API 서버 연결 실패")?;

    if !resp.status().is_success() {
        let status = resp.status();
        let text = resp.text().await.unwrap_or_default();
        return Err(anyhow!("모델 목록 조회 실패 ({status}): {text}"));
    }

    #[derive(Deserialize)]
    struct ModelsResponse {
        data: Vec<OpenAiModel>,
    }
    #[derive(Deserialize)]
    struct OpenAiModel {
        id: String,
    }

    let body: ModelsResponse = resp.json().await.context("API 응답 파싱 실패")?;
    let mut models: Vec<LlmModelInfo> = body
        .data
        .into_iter()
        .filter(|m| {
            m.id.contains("gpt")
                || m.id.contains("o1")
                || m.id.contains("o3")
                || m.id.contains("claude")
                || m.id.contains("gemini")
        })
        .map(|m| LlmModelInfo {
            name: m.id.clone(),
            id: m.id,
        })
        .collect();

    if models.is_empty() {
        if !settings.llm_model.trim().is_empty() {
            models.push(LlmModelInfo {
                id: settings.llm_model.clone(),
                name: settings.llm_model.clone(),
            });
        }
    }

    models.sort_by(|a, b| a.id.cmp(&b.id));
    Ok(models)
}

pub async fn chat(
    settings: &AppSettings,
    system: &str,
    user: &str,
) -> Result<LlmChatResult> {
    let model = settings.llm_model.trim();
    if model.is_empty() {
        return Err(anyhow!("모델이 선택되지 않았습니다"));
    }

    match settings.llm_provider.as_str() {
        "ollama" => chat_ollama(settings, model, system, user).await,
        "openai" => chat_openai(settings, model, system, user).await,
        other => Err(anyhow!("unsupported provider: {other}")),
    }
}

async fn chat_ollama(
    settings: &AppSettings,
    model: &str,
    system: &str,
    user: &str,
) -> Result<LlmChatResult> {
    let url = format!(
        "{}/api/chat",
        settings.ollama_base_url.trim_end_matches('/')
    );

    let body = json!({
        "model": model,
        "stream": false,
        "messages": [
            { "role": "system", "content": system },
            { "role": "user", "content": user }
        ]
    });

    let resp = http()?
        .post(&url)
        .json(&body)
        .send()
        .await
        .context("Ollama 연결 실패")?;

    if !resp.status().is_success() {
        let status = resp.status();
        let text = resp.text().await.unwrap_or_default();
        return Err(anyhow!("Ollama 채팅 실패 ({status}): {text}"));
    }

    #[derive(Deserialize)]
    struct ChatResponse {
        message: ChatMessage,
    }
    #[derive(Deserialize)]
    struct ChatMessage {
        content: String,
    }

    let parsed: ChatResponse = resp.json().await.context("Ollama 응답 파싱 실패")?;
    Ok(LlmChatResult {
        answer: parsed.message.content.trim().to_string(),
        model: model.to_string(),
        provider: "ollama".into(),
    })
}

async fn chat_openai(
    settings: &AppSettings,
    model: &str,
    system: &str,
    user: &str,
) -> Result<LlmChatResult> {
    let key = load_secrets().api_key.trim().to_string();
    if key.is_empty() {
        return Err(anyhow!("API 키가 설정되지 않았습니다"));
    }

    let url = format!(
        "{}/chat/completions",
        settings.api_base_url.trim_end_matches('/')
    );

    let body = json!({
        "model": model,
        "messages": [
            { "role": "system", "content": system },
            { "role": "user", "content": user }
        ],
        "temperature": 0.3
    });

    let resp = http()?
        .post(&url)
        .bearer_auth(&key)
        .json(&body)
        .send()
        .await
        .context("API 서버 연결 실패")?;

    if !resp.status().is_success() {
        let status = resp.status();
        let text = resp.text().await.unwrap_or_default();
        return Err(anyhow!("API 채팅 실패 ({status}): {text}"));
    }

    #[derive(Deserialize)]
    struct ChatResponse {
        choices: Vec<Choice>,
    }
    #[derive(Deserialize)]
    struct Choice {
        message: ChatMessage,
    }
    #[derive(Deserialize)]
    struct ChatMessage {
        content: String,
    }

    let parsed: ChatResponse = resp.json().await.context("API 응답 파싱 실패")?;
    let answer = parsed
        .choices
        .into_iter()
        .next()
        .map(|c| c.message.content)
        .unwrap_or_default();

    Ok(LlmChatResult {
        answer: answer.trim().to_string(),
        model: model.to_string(),
        provider: "openai".into(),
    })
}

pub async fn test_connection(settings: &AppSettings) -> Result<String> {
    let result = chat(
        settings,
        "You are a helpful assistant. Reply in one short sentence.",
        "Say hello in Korean.",
    )
    .await?;
    Ok(format!("{} ({})", result.answer, result.model))
}
