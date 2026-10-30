use std::sync::atomic::{AtomicBool, Ordering};

/// Global cancellation flag checked by ongoing cryptographic operations.
static CANCELLED: AtomicBool = AtomicBool::new(false);

/// Tauri command to request cancellation of any active encryption or decryption process.
#[tauri::command]
pub fn cmd_cancel() {
    CANCELLED.store(true, Ordering::SeqCst);
}

/// Returns true if a cancellation request has been signaled.
pub fn is_cancelled() -> bool {
    CANCELLED.load(Ordering::SeqCst)
}

/// Resets the cancellation flag back to false before starting a new operation.
pub fn reset_cancel() {
    CANCELLED.store(false, Ordering::SeqCst);
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_cancellation_flag_lifecycle() {
        reset_cancel();
        assert!(!is_cancelled());

        cmd_cancel();
        assert!(is_cancelled());

        reset_cancel();
        assert!(!is_cancelled());
    }
}
