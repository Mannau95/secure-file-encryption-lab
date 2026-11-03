pub mod commands;
pub mod crypto;
pub mod error;
pub mod format;
pub mod fs;

use commands::{
    benchmark::cmd_benchmark,
    cancel::cmd_cancel,
    decrypt::cmd_decrypt,
    encrypt::cmd_encrypt,
    hash::cmd_hash_file,
    keyfile::cmd_generate_keyfile,
    verify::{cmd_inspect_file_integrity, cmd_verify_sfel_container},
};

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .invoke_handler(tauri::generate_handler![
            cmd_encrypt,
            cmd_decrypt,
            cmd_cancel,
            cmd_hash_file,
            cmd_generate_keyfile,
            cmd_benchmark,
            cmd_inspect_file_integrity,
            cmd_verify_sfel_container
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
