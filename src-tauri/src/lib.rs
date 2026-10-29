pub mod commands;
pub mod crypto;
pub mod error;
pub mod format;
pub mod fs;

use commands::{cancel::cmd_cancel, decrypt::cmd_decrypt, encrypt::cmd_encrypt};

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .invoke_handler(tauri::generate_handler![
            cmd_encrypt,
            cmd_decrypt,
            cmd_cancel
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
