use std::time::Instant;
use zeroize::Zeroize;

use crate::crypto::aead::{encrypt_single_with_cipher, HEADER_SIZE};
use crate::crypto::kdf::{derive_key, Argon2Profile};
use crate::error::SfelError;
use crate::format::header::CipherAlgorithm;

#[derive(Debug, Clone, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct BenchmarkReport {
    pub argon2_fast_ms: u64,
    pub argon2_standard_ms: u64,
    pub argon2_paranoid_ms: u64,
    pub aes_gcm_mib_per_sec: f64,
    pub chacha20_mib_per_sec: f64,
}

/// Runs an in-memory hardware cryptographic benchmark measuring:
/// - Argon2id derivation latency across `Fast`, `Standard`, and `Paranoid` profiles.
/// - AEAD encryption throughput (MiB/s) for `AES-256-GCM` and `ChaCha20-Poly1305`.
pub fn run_crypto_benchmark() -> Result<BenchmarkReport, SfelError> {
    let bench_pass = b"sfel-hardware-benchmark-passphrase";
    let salt = [0x42u8; 16];

    // 1. Argon2id Fast (32 MiB, t=2, p=2)
    let t0 = Instant::now();
    let _ = derive_key(bench_pass, &salt, &Argon2Profile::Fast.params())?;
    let argon2_fast_ms = t0.elapsed().as_millis() as u64;

    // 2. Argon2id Standard (64 MiB, t=3, p=4)
    let t1 = Instant::now();
    let key = derive_key(bench_pass, &salt, &Argon2Profile::Standard.params())?;
    let argon2_standard_ms = t1.elapsed().as_millis() as u64;

    // 3. Argon2id Paranoid (256 MiB, t=5, p=8)
    let t2 = Instant::now();
    let _ = derive_key(bench_pass, &salt, &Argon2Profile::Paranoid.params())?;
    let argon2_paranoid_ms = t2.elapsed().as_millis() as u64;

    // 4. AEAD Streaming Throughput (16 MiB total across 16 x 1 MiB blocks)
    let block_size = 1_048_576usize; // 1 MiB
    let iterations = 16usize;
    let total_mib = iterations as f64;
    let mut payload = vec![0xA5u8; block_size];
    let nonce = [0x11u8; 12];
    let header = [0x22u8; HEADER_SIZE];

    let t_aes = Instant::now();
    for _ in 0..iterations {
        let mut ct = encrypt_single_with_cipher(
            CipherAlgorithm::Aes256Gcm,
            &key,
            &nonce,
            &header,
            &payload,
        )?;
        ct.zeroize();
    }
    let aes_secs = t_aes.elapsed().as_secs_f64().max(0.000_1);
    let aes_gcm_mib_per_sec = ((total_mib / aes_secs) * 10.0).round() / 10.0;

    let t_chacha = Instant::now();
    for _ in 0..iterations {
        let mut ct = encrypt_single_with_cipher(
            CipherAlgorithm::Chacha20Poly1305,
            &key,
            &nonce,
            &header,
            &payload,
        )?;
        ct.zeroize();
    }
    let chacha_secs = t_chacha.elapsed().as_secs_f64().max(0.000_1);
    let chacha20_mib_per_sec = ((total_mib / chacha_secs) * 10.0).round() / 10.0;

    payload.zeroize();

    Ok(BenchmarkReport {
        argon2_fast_ms,
        argon2_standard_ms,
        argon2_paranoid_ms,
        aes_gcm_mib_per_sec,
        chacha20_mib_per_sec,
    })
}

/// Tauri command to execute the cryptographic hardware benchmark.
#[tauri::command]
pub async fn cmd_benchmark() -> Result<BenchmarkReport, SfelError> {
    tauri::async_runtime::spawn_blocking(run_crypto_benchmark)
        .await
        .map_err(|e| SfelError::IoError(format!("Benchmark task join error: {e}")))?
}
