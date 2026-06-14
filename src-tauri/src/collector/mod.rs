pub mod agent;
pub mod clipboard;
pub mod input;
pub mod input_bridge;
pub mod screenshot;
pub mod thumbnail;

#[cfg(target_os = "macos")]
pub mod input_macos;

#[cfg(test)]
mod action_tests;

pub use agent::CollectorAgent;
