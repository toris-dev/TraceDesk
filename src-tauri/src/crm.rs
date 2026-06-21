use crate::database::models::{CrmContact, CrmContactInput, CrmInteraction, CrmInteractionInput, CrmOverview};
use crate::state::AppState;
use tauri::State;

#[tauri::command]
pub fn get_founder_crm(state: State<AppState>) -> Result<CrmOverview, String> {
    state.repository.get_crm_overview().map_err(|e| e.to_string())
}

#[tauri::command]
pub fn save_founder_contact(
    state: State<AppState>,
    contact: CrmContactInput,
) -> Result<CrmContact, String> {
    state
        .repository
        .upsert_crm_contact(&contact)
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub fn delete_founder_contact(state: State<AppState>, id: i64) -> Result<(), String> {
    state.repository.delete_crm_contact(id).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn add_founder_interaction(
    state: State<AppState>,
    interaction: CrmInteractionInput,
) -> Result<CrmInteraction, String> {
    state
        .repository
        .add_crm_interaction(&interaction)
        .map_err(|e| e.to_string())
}
