import { useState, useRef, useCallback, useEffect } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import { useOperation } from '../contexts/OperationContext';
import { getFilenameFromPath } from '../utils/formatters';
import { computeFileSha256 } from '../utils/hash';

function isTauriEnvironment() {
  return typeof window !== 'undefined' && Boolean(window.__TAURI_INTERNALS__ || window.__TAURI__);
}

export function useDecrypt() {
  const { addHistoryEntry, setActiveOperation } = useOperation();

  const [status, setStatus] = useState('idle'); // 'idle' | 'running' | 'success' | 'error' | 'cancelled'
  const [progress, setProgress] = useState({
    percentage: 0,
    bytesProcessed: 0,
    totalBytes: 0,
    stage: 'idle',
    stageDescription: '',
    elapsedSeconds: 0,
  });
  const [error, setError] = useState(null);
  const [result, setResult] = useState(null);

  const startTimeRef = useRef(null);
  const timerIntervalRef = useRef(null);
  const isCancelledRef = useRef(false);
  const unlistenRefs = useRef([]);

  useEffect(() => {
    return () => {
      unlistenRefs.current.forEach((unlisten) => {
        try {
          if (typeof unlisten === 'function') unlisten();
        } catch (e) {
          console.warn('Error cleaning up progress listener', e);
        }
      });
      if (timerIntervalRef.current) clearInterval(timerIntervalRef.current);
    };
  }, []);

  const reset = useCallback(() => {
    setStatus('idle');
    setProgress({
      percentage: 0,
      bytesProcessed: 0,
      totalBytes: 0,
      stage: 'idle',
      stageDescription: '',
      elapsedSeconds: 0,
    });
    setError(null);
    setResult(null);
    isCancelledRef.current = false;
    if (timerIntervalRef.current) {
      clearInterval(timerIntervalRef.current);
      timerIntervalRef.current = null;
    }
  }, []);

  const mapStageDescription = (stage) => {
    switch (stage?.toLowerCase()) {
      case 'deriving_key':
      case 'kdf':
      case 'argon2':
        return 'Deriving cryptographic key (Argon2id)...';
      case 'decrypting':
      case 'cipher':
      case 'streaming':
        return 'Authenticating & decrypting chunks...';
      case 'finalizing':
      case 'verifying':
        return 'Verifying final authentication tag...';
      default:
        return stage ? `Processing: ${stage}` : 'Decrypting...';
    }
  };

  const decrypt = useCallback(
    async ({ inputPath, outputPath, password, fileSize = 0, keyfilePath = '' }) => {
      if (!inputPath || !outputPath || !password) {
        setError('Missing required parameters for decryption.');
        setStatus('error');
        return;
      }

      reset();
      setStatus('running');
      setActiveOperation({ type: 'decrypt', isRunning: true });
      startTimeRef.current = Date.now();

      timerIntervalRef.current = setInterval(() => {
        if (startTimeRef.current) {
          const elapsed = Math.floor((Date.now() - startTimeRef.current) / 1000);
          setProgress((prev) => ({ ...prev, elapsedSeconds: elapsed }));
        }
      }, 500);

      const filename = getFilenameFromPath(inputPath);

      if (!isTauriEnvironment()) {
        const errorMsg = 'Tauri runtime not detected. Application must run inside the Tauri desktop window.';
        setError(errorMsg);
        setStatus('error');
        setActiveOperation(null);
        if (timerIntervalRef.current) clearInterval(timerIntervalRef.current);
        addHistoryEntry({
          operationType: 'decrypt',
          filename,
          inputPath,
          outputPath,
          fileSize,
          status: 'failed',
          errorMessage: errorMsg,
        });
        return;
      }

      try {
        const handleProgress = (event) => {
          if (isCancelledRef.current) return;
          const payload = event.payload || {};

          const bytesProcessed = payload.bytesProcessed ?? payload.bytes_processed ?? 0;
          const totalBytes = payload.totalBytes ?? payload.total_bytes ?? fileSize;
          const rawPercentage = payload.percentage ?? payload.percent ??
            (totalBytes > 0 ? (bytesProcessed / totalBytes) * 100 : 0);
          const stage = payload.stage || 'decrypting';

          setProgress((prev) => ({
            ...prev,
            percentage: Math.min(100, Math.max(0, Math.round(rawPercentage))),
            bytesProcessed,
            totalBytes,
            stage,
            stageDescription: mapStageDescription(stage),
          }));
        };

        const u1 = await listen('decryption-progress', handleProgress);
        const u2 = await listen('decrypt_progress', handleProgress);
        const u3 = await listen('progress', handleProgress);
        unlistenRefs.current = [u1, u2, u3];

        const destDir = outputPath 
          ? outputPath.replace(/[/\\][^/\\]+$/, '') 
          : inputPath.replace(/[/\\][^/\\]+$/, '');

        const cleanKeyfile = keyfilePath ? keyfilePath.trim() : null;
        const response = await invoke('cmd_decrypt', {
          sourcePath: inputPath,
          source_path: inputPath,
          destDir: destDir || '.',
          dest_dir: destDir || '.',
          password,
          keyfilePath: cleanKeyfile || null,
          keyfile_path: cleanKeyfile || null,
        });

        if (timerIntervalRef.current) clearInterval(timerIntervalRef.current);

        if (isCancelledRef.current) {
          setStatus('cancelled');
          return;
        }

        const durationMs = Date.now() - (startTimeRef.current || Date.now());
        const finalPath = typeof response === 'string' ? response : (response?.outputPath || outputPath);
        const restoredName = (response && response.originalName) || 
          (finalPath ? getFilenameFromPath(finalPath) : 'restored_file');

        let restoredSha256 = null;
        try {
          restoredSha256 = await computeFileSha256(finalPath);
        } catch {}

        const outputResult = {
          outputPath: finalPath,
          originalName: restoredName,
          bytesDecrypted: fileSize,
          sha256: restoredSha256,
          durationMs,
        };

        setResult(outputResult);
        setStatus('success');
        setProgress((prev) => ({
          ...prev,
          percentage: 100,
          stage: 'completed',
          stageDescription: 'Decryption and authentication completed successfully.',
        }));

        addHistoryEntry({
          operationType: 'decrypt',
          filename,
          inputPath,
          outputPath: outputResult.outputPath,
          fileSize,
          sha256: restoredSha256,
          status: 'success',
          durationMs,
        });
      } catch (err) {
        if (timerIntervalRef.current) clearInterval(timerIntervalRef.current);

        const durationMs = Date.now() - (startTimeRef.current || Date.now());
        const rawError = typeof err === 'string' ? err : err?.message || 'Decryption failed.';

        let userFriendlyError = rawError;
        const lower = rawError.toLowerCase();

        if (isCancelledRef.current || lower.includes('cancel')) {
          setStatus('cancelled');
          setError('Operation was cancelled.');
          addHistoryEntry({
            operationType: 'decrypt',
            filename,
            inputPath,
            outputPath,
            fileSize,
            status: 'failed',
            durationMs,
            errorMessage: 'Cancelled by user',
          });
          return;
        }

        // Standardized security error message to prevent side-channel oracles
        if (
          lower.includes('auth') ||
          lower.includes('password') ||
          lower.includes('tag') ||
          lower.includes('corrupted') ||
          lower.includes('integrity') ||
          lower.includes('mac')
        ) {
          userFriendlyError = 'Incorrect password or corrupted file';
        }

        setStatus('error');
        setError(userFriendlyError);
        addHistoryEntry({
          operationType: 'decrypt',
          filename,
          inputPath,
          outputPath,
          fileSize,
          status: 'failed',
          durationMs,
          errorMessage: userFriendlyError,
        });
      } finally {
        setActiveOperation(null);
        unlistenRefs.current.forEach((u) => {
          try {
            if (typeof u === 'function') u();
          } catch {}
        });
        unlistenRefs.current = [];
      }
    },
    [addHistoryEntry, reset, setActiveOperation]
  );

  const cancel = useCallback(async () => {
    isCancelledRef.current = true;
    try {
      if (isTauriEnvironment()) {
        await invoke('cmd_cancel');
      }
    } catch (e) {
      console.warn('Failed to invoke cmd_cancel', e);
    }
    setStatus('cancelled');
    if (timerIntervalRef.current) clearInterval(timerIntervalRef.current);
    setActiveOperation(null);
  }, [setActiveOperation]);

  return {
    status,
    progress,
    error,
    result,
    decrypt,
    cancel,
    reset,
  };
}

export default useDecrypt;
