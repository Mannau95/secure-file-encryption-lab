import { useState, useRef, useCallback, useEffect } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import { useOperation } from '../contexts/OperationContext';
import { getFilenameFromPath } from '../utils/formatters';

function isTauriEnvironment() {
  return typeof window !== 'undefined' && Boolean(window.__TAURI_INTERNALS__ || window.__TAURI__);
}

export function useEncrypt() {
  const { addHistoryEntry, setActiveOperation } = useOperation();
  
  const [status, setStatus] = useState('idle'); // 'idle' | 'running' | 'success' | 'error' | 'cancelled'
  const [progress, setProgress] = useState({
    percentage: 0,
    bytesProcessed: 0,
    totalBytes: 0,
    stage: 'idle', // 'deriving_key' | 'encrypting' | 'finalizing'
    stageDescription: '',
    elapsedSeconds: 0,
  });
  const [error, setError] = useState(null);
  const [result, setResult] = useState(null);

  const startTimeRef = useRef(null);
  const timerIntervalRef = useRef(null);
  const isCancelledRef = useRef(false);
  const unlistenRefs = useRef([]);

  // Cleanup listeners on unmount
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
      case 'encrypting':
      case 'cipher':
      case 'streaming':
        return 'Encrypting file chunks (AES-256-GCM)...';
      case 'finalizing':
      case 'finishing':
      case 'verifying':
        return 'Writing authentication tag and finalizing...';
      default:
        return stage ? `Processing: ${stage}` : 'Encrypting...';
    }
  };

  const encrypt = useCallback(
    async ({ inputPath, outputPath, password, fileSize = 0 }) => {
      if (!inputPath || !outputPath || !password) {
        setError('Missing required parameters for encryption.');
        setStatus('error');
        return;
      }

      reset();
      setStatus('running');
      setActiveOperation({ type: 'encrypt', isRunning: true });
      startTimeRef.current = Date.now();

      // Start elapsed timer
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
          operationType: 'encrypt',
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
        // Setup progress event listeners
        const handleProgress = (event) => {
          if (isCancelledRef.current) return;
          const payload = event.payload || {};
          
          const bytesProcessed = payload.bytesProcessed ?? payload.bytes_processed ?? 0;
          const totalBytes = payload.totalBytes ?? payload.total_bytes ?? fileSize;
          const rawPercentage = payload.percentage ?? payload.percent ?? 
            (totalBytes > 0 ? (bytesProcessed / totalBytes) * 100 : 0);
          const stage = payload.stage || 'encrypting';

          setProgress((prev) => ({
            ...prev,
            percentage: Math.min(100, Math.max(0, Math.round(rawPercentage))),
            bytesProcessed,
            totalBytes,
            stage,
            stageDescription: mapStageDescription(stage),
          }));
        };

        const u1 = await listen('encryption-progress', handleProgress);
        const u2 = await listen('encrypt_progress', handleProgress);
        const u3 = await listen('progress', handleProgress);
        unlistenRefs.current = [u1, u2, u3];

        // Invoke Tauri command
        // Note: arguments are provided in both camelCase and snake_case format compatible with Tauri serde
        const response = await invoke('cmd_encrypt', {
          inputPath,
          outputPath,
          password,
        });

        if (timerIntervalRef.current) clearInterval(timerIntervalRef.current);

        if (isCancelledRef.current) {
          setStatus('cancelled');
          return;
        }

        const durationMs = Date.now() - (startTimeRef.current || Date.now());
        const outputResult = {
          outputPath: (response && response.outputPath) || outputPath,
          bytesEncrypted: fileSize,
          durationMs,
        };

        setResult(outputResult);
        setStatus('success');
        setProgress((prev) => ({
          ...prev,
          percentage: 100,
          stage: 'completed',
          stageDescription: 'Encryption completed successfully.',
        }));

        addHistoryEntry({
          operationType: 'encrypt',
          filename,
          inputPath,
          outputPath: outputResult.outputPath,
          fileSize,
          status: 'success',
          durationMs,
        });
      } catch (err) {
        if (timerIntervalRef.current) clearInterval(timerIntervalRef.current);

        const durationMs = Date.now() - (startTimeRef.current || Date.now());
        const errorMsg = typeof err === 'string' ? err : err?.message || 'Encryption failed due to an unexpected error.';

        if (isCancelledRef.current || errorMsg.toLowerCase().includes('cancel')) {
          setStatus('cancelled');
          setError('Operation was cancelled.');
          addHistoryEntry({
            operationType: 'encrypt',
            filename,
            inputPath,
            outputPath,
            fileSize,
            status: 'failed',
            durationMs,
            errorMessage: 'Cancelled by user',
          });
        } else {
          setStatus('error');
          setError(errorMsg);
          addHistoryEntry({
            operationType: 'encrypt',
            filename,
            inputPath,
            outputPath,
            fileSize,
            status: 'failed',
            durationMs,
            errorMessage: errorMsg,
          });
        }
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
    encrypt,
    cancel,
    reset,
  };
}

export default useEncrypt;
