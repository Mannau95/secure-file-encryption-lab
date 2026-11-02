import { useState, useRef, useCallback, useEffect } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import { useOperation } from '../contexts/OperationContext';
import { getFilenameFromPath, getFileExtension } from '../utils/formatters';
import { computeFileSha256 } from '../utils/hash';

function isTauriEnvironment() {
  return typeof window !== 'undefined' && Boolean(window.__TAURI_INTERNALS__ || window.__TAURI__);
}

export function useBatchDecrypt() {
  const { addHistoryEntry, setActiveOperation } = useOperation();

  const [queue, setQueue] = useState([]);
  const [status, setStatus] = useState('idle'); // 'idle' | 'running' | 'completed' | 'cancelled' | 'error'
  const [currentIndex, setCurrentIndex] = useState(-1);
  const [currentProgress, setCurrentProgress] = useState({
    percentage: 0,
    bytesProcessed: 0,
    totalBytes: 0,
    stageDescription: '',
    elapsedSeconds: 0,
  });

  const stopRequestedRef = useRef(false);
  const unlistenRefs = useRef([]);
  const timerIntervalRef = useRef(null);
  const fileStartTimeRef = useRef(null);

  // Clean up listeners on unmount
  useEffect(() => {
    return () => {
      unlistenRefs.current.forEach((unlisten) => {
        try {
          if (typeof unlisten === 'function') unlisten();
        } catch {}
      });
      if (timerIntervalRef.current) clearInterval(timerIntervalRef.current);
    };
  }, []);

  // Add .sfel files to queue
  const addFiles = useCallback((newFiles) => {
    if (!newFiles || newFiles.length === 0) return;

    setQueue((prevQueue) => {
      const existingPaths = new Set(prevQueue.map((item) => item.path));
      const itemsToAdd = [];

      for (const f of newFiles) {
        if (!f || !f.path) continue;
        const ext = getFileExtension(f.name || f.path);
        if (ext.toLowerCase() !== 'sfel') continue;

        if (!existingPaths.has(f.path)) {
          existingPaths.add(f.path);
          itemsToAdd.push({
            id: `decrypt-batch-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`,
            path: f.path,
            name: f.name || getFilenameFromPath(f.path),
            size: f.size || 0,
            status: 'pending', // 'pending' | 'decrypting' | 'completed' | 'failed' | 'cancelled'
            progress: 0,
            outputPath: null,
            originalName: null,
            sha256: null,
            errorMessage: null,
            durationMs: 0,
          });
        }
      }

      return [...prevQueue, ...itemsToAdd];
    });
  }, []);

  // Remove file from queue
  const removeFile = useCallback((id) => {
    setQueue((prev) => prev.filter((item) => item.id !== id));
  }, []);

  // Clear entire queue
  const clearQueue = useCallback(() => {
    if (status === 'running') return;
    setQueue([]);
    setStatus('idle');
    setCurrentIndex(-1);
    setCurrentProgress({
      percentage: 0,
      bytesProcessed: 0,
      totalBytes: 0,
      stageDescription: '',
      elapsedSeconds: 0,
    });
  }, [status]);

  // Reset queue items back to pending
  const resetQueueStatus = useCallback(() => {
    setQueue((prev) =>
      prev.map((item) => ({
        ...item,
        status: 'pending',
        progress: 0,
        outputPath: null,
        originalName: null,
        sha256: null,
        errorMessage: null,
        durationMs: 0,
      }))
    );
    setStatus('idle');
    setCurrentIndex(-1);
  }, []);

  // Reset only failed items back to pending for retry
  const retryFailed = useCallback(() => {
    setQueue((prev) =>
      prev.map((item) =>
        item.status === 'failed'
          ? {
              ...item,
              status: 'pending',
              errorMessage: null,
              progress: 0,
            }
          : item
      )
    );
    setStatus('idle');
    setCurrentIndex(-1);
  }, []);

  // Cancel entire batch
  const cancelBatch = useCallback(async () => {
    stopRequestedRef.current = true;
    try {
      if (isTauriEnvironment()) {
        await invoke('cmd_cancel');
      }
    } catch (e) {
      console.warn('Failed to invoke cmd_cancel in batch decrypt', e);
    }

    if (timerIntervalRef.current) {
      clearInterval(timerIntervalRef.current);
      timerIntervalRef.current = null;
    }

    setStatus('cancelled');
    setActiveOperation(null);

    setQueue((prev) =>
      prev.map((item) => {
        if (item.status === 'decrypting' || item.status === 'pending') {
          return { ...item, status: 'cancelled' };
        }
        return item;
      })
    );
  }, [setActiveOperation]);

  // Start batch processing sequentially
  const startBatch = useCallback(
    async ({ password, destinationDir = '' }) => {
      if (!password || queue.length === 0) return;

      stopRequestedRef.current = false;
      setStatus('running');
      setActiveOperation({ type: 'batch-decrypt', isRunning: true });

      // Clean up previous event listeners
      unlistenRefs.current.forEach((u) => {
        try {
          if (typeof u === 'function') u();
        } catch {}
      });
      unlistenRefs.current = [];

      // Setup Tauri progress listener
      const handleProgress = (event) => {
        if (stopRequestedRef.current) return;
        const payload = event.payload || {};
        const bytesProcessed = payload.bytesProcessed ?? payload.bytes_processed ?? 0;
        const totalBytes = payload.totalBytes ?? payload.total_bytes ?? 0;
        const rawPercentage =
          payload.percentage ??
          payload.percent ??
          (totalBytes > 0 ? (bytesProcessed / totalBytes) * 100 : 0);
        const stage = payload.stage || 'decrypting';

        const safePercent = Math.min(100, Math.max(0, Math.round(rawPercentage)));

        setCurrentProgress((prev) => ({
          ...prev,
          percentage: safePercent,
          bytesProcessed,
          totalBytes,
          stageDescription: stage,
        }));

        setQueue((prev) =>
          prev.map((item, idx) =>
            idx === currentIndex ? { ...item, progress: safePercent } : item
          )
        );
      };

      if (isTauriEnvironment()) {
        try {
          const u1 = await listen('decryption-progress', handleProgress);
          const u2 = await listen('decrypt_progress', handleProgress);
          unlistenRefs.current = [u1, u2];
        } catch (e) {
          console.warn('Could not register decryption listeners', e);
        }
      }

      // Snapshot queue items
      const itemsToProcess = [...queue];

      for (let i = 0; i < itemsToProcess.length; i++) {
        if (stopRequestedRef.current) {
          setQueue((prev) =>
            prev.map((item, idx) => (idx >= i ? { ...item, status: 'cancelled' } : item))
          );
          break;
        }

        const currentItem = itemsToProcess[i];
        if (currentItem.status === 'completed') {
          continue;
        }

        setCurrentIndex(i);
        fileStartTimeRef.current = Date.now();

        // Update item status to 'decrypting'
        setQueue((prev) =>
          prev.map((item, idx) =>
            idx === i ? { ...item, status: 'decrypting', progress: 0 } : item
          )
        );

        setCurrentProgress({
          percentage: 0,
          bytesProcessed: 0,
          totalBytes: currentItem.size || 0,
          stageDescription: 'Starting...',
          elapsedSeconds: 0,
        });

        // Start per-file timer
        if (timerIntervalRef.current) clearInterval(timerIntervalRef.current);
        timerIntervalRef.current = setInterval(() => {
          if (fileStartTimeRef.current) {
            const elapsed = Math.floor((Date.now() - fileStartTimeRef.current) / 1000);
            setCurrentProgress((prev) => ({ ...prev, elapsedSeconds: elapsed }));
          }
        }, 500);

        // Calculate destination directory
        const destDir = destinationDir.trim()
          ? destinationDir.trim()
          : currentItem.path.replace(/[/\\][^/\\]+$/, '');

        if (!isTauriEnvironment()) {
          // Web preview simulation
          await new Promise((r) => setTimeout(r, 800));
          const simPath = currentItem.path.replace(/\.sfel$/, '') || `${currentItem.path}.restored`;
          const duration = Date.now() - fileStartTimeRef.current;
          setQueue((prev) =>
            prev.map((item, idx) =>
              idx === i
                ? {
                    ...item,
                    status: 'completed',
                    progress: 100,
                    outputPath: simPath,
                    originalName: getFilenameFromPath(simPath),
                    durationMs: duration,
                  }
                : item
            )
          );
          addHistoryEntry({
            operationType: 'decrypt',
            filename: currentItem.name,
            inputPath: currentItem.path,
            outputPath: simPath,
            fileSize: currentItem.size,
            status: 'success',
            durationMs: duration,
          });
          continue;
        }

        try {
          const response = await invoke('cmd_decrypt', {
            sourcePath: currentItem.path,
            source_path: currentItem.path,
            destDir: destDir || '.',
            dest_dir: destDir || '.',
            password,
          });

          if (timerIntervalRef.current) clearInterval(timerIntervalRef.current);

          if (stopRequestedRef.current) {
            setQueue((prev) =>
              prev.map((item, idx) => (idx >= i ? { ...item, status: 'cancelled' } : item))
            );
            break;
          }

          const durationMs = Date.now() - (fileStartTimeRef.current || Date.now());
          const finalOutputPath =
            typeof response === 'string'
              ? response
              : response?.outputPath || currentItem.path.replace(/\.sfel$/, '');
          const originalName =
            (response && response.originalName) || getFilenameFromPath(finalOutputPath);

          let restoredSha256 = null;
          try {
            restoredSha256 = await computeFileSha256(finalOutputPath);
          } catch {}

          setQueue((prev) =>
            prev.map((item, idx) =>
              idx === i
                ? {
                    ...item,
                    status: 'completed',
                    progress: 100,
                    outputPath: finalOutputPath,
                    originalName,
                    sha256: restoredSha256,
                    durationMs,
                  }
                : item
            )
          );

          addHistoryEntry({
            operationType: 'decrypt',
            filename: currentItem.name,
            inputPath: currentItem.path,
            outputPath: finalOutputPath,
            fileSize: currentItem.size,
            sha256: restoredSha256,
            status: 'success',
            durationMs,
          });
        } catch (err) {
          if (timerIntervalRef.current) clearInterval(timerIntervalRef.current);

          const durationMs = Date.now() - (fileStartTimeRef.current || Date.now());
          const errorMsg =
            typeof err === 'string'
              ? err
              : err?.message || 'Decryption failed (invalid password or corrupted data).';

          if (stopRequestedRef.current || errorMsg.toLowerCase().includes('cancel')) {
            setQueue((prev) =>
              prev.map((item, idx) => (idx >= i ? { ...item, status: 'cancelled' } : item))
            );
            break;
          } else {
            setQueue((prev) =>
              prev.map((item, idx) =>
                idx === i
                  ? {
                      ...item,
                      status: 'failed',
                      progress: 0,
                      errorMessage: errorMsg,
                      durationMs,
                    }
                  : item
              )
            );

            addHistoryEntry({
              operationType: 'decrypt',
              filename: currentItem.name,
              inputPath: currentItem.path,
              outputPath: null,
              fileSize: currentItem.size,
              status: 'failed',
              durationMs,
              errorMessage: errorMsg,
            });
          }
        }
      }

      if (timerIntervalRef.current) {
        clearInterval(timerIntervalRef.current);
        timerIntervalRef.current = null;
      }

      unlistenRefs.current.forEach((u) => {
        try {
          if (typeof u === 'function') u();
        } catch {}
      });
      unlistenRefs.current = [];

      setActiveOperation(null);
      setCurrentIndex(-1);

      if (stopRequestedRef.current) {
        setStatus('cancelled');
      } else {
        setStatus('completed');
      }
    },
    [addHistoryEntry, currentIndex, queue, setActiveOperation]
  );

  // Compute overall stats
  const totalFiles = queue.length;
  const completedCount = queue.filter((item) => item.status === 'completed').length;
  const failedCount = queue.filter((item) => item.status === 'failed').length;
  const totalBytes = queue.reduce((acc, item) => acc + (item.size || 0), 0);
  const overallPercentage =
    totalFiles > 0
      ? Math.round(
          ((completedCount + (currentIndex >= 0 ? currentProgress.percentage / 100 : 0)) /
            totalFiles) *
            100
        )
      : 0;

  return {
    queue,
    status,
    currentIndex,
    currentProgress,
    overallStats: {
      totalFiles,
      completedCount,
      failedCount,
      totalBytes,
      overallPercentage: Math.min(100, Math.max(0, overallPercentage)),
    },
    addFiles,
    removeFile,
    clearQueue,
    resetQueueStatus,
    retryFailed,
    startBatch,
    cancelBatch,
  };
}

export default useBatchDecrypt;