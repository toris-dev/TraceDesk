pub mod agent;
pub mod clipboard;
pub mod input;
pub mod screenshot;
pub mod thumbnail;

#[cfg(target_os = "macos")]
pub mod input_macos;

pub use agent::CollectorAgent;
