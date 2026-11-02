import { invoke } from '@tauri-apps/api/core';

function isTauriEnvironment() {
  return typeof window !== 'undefined' && Boolean(window.__TAURI_INTERNALS__ || window.__TAURI__);
}

/**
 * Computes the SHA-256 checksum of a file on disk via Tauri backend.
 * Returns a 64-character lowercase hex string.
 * @param {string} filePath
 * @returns {Promise<string|null>}
 */
export async function computeFileSha256(filePath) {
  if (!filePath) return null;

  if (isTauriEnvironment()) {
    try {
      const hash = await invoke('cmd_hash_file', { path: filePath });
      return typeof hash === 'string' ? hash.toLowerCase() : null;
    } catch (err) {
      console.warn('Failed to compute file SHA-256 via Tauri cmd_hash_file', err);
      return null;
    }
  }

  // Web preview (no Tauri backend): never display a fabricated checksum,
  // since a fake hash could be mistaken for a real integrity guarantee.
  return null;
}

/**
 * Compares two SHA-256 hashes safely (case-insensitive, trimmed).
 * @param {string} hashA
 * @param {string} hashB
 * @returns {boolean}
 */
export function compareSha256(hashA, hashB) {
  if (!hashA || !hashB) return false;
  return hashA.trim().toLowerCase() === hashB.trim().toLowerCase();
}
