import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';

const HISTORY_STORAGE_KEY = 'sfel_history_records';
const MAX_HISTORY_ITEMS = 50;

export const OperationContext = createContext({
  history: [],
  activeOperation: null,
  addHistoryEntry: () => {},
  clearHistory: () => {},
  removeHistoryEntry: () => {},
  setActiveOperation: () => {},
});

export function OperationProvider({ children }) {
  const [history, setHistory] = useState(() => {
    try {
      const saved = localStorage.getItem(HISTORY_STORAGE_KEY);
      return saved ? JSON.parse(saved) : [];
    } catch (e) {
      console.warn('Failed to parse history from localStorage', e);
      return [];
    }
  });

  const [activeOperation, setActiveOperation] = useState(null);

  useEffect(() => {
    try {
      localStorage.setItem(HISTORY_STORAGE_KEY, JSON.stringify(history));
    } catch (e) {
      console.warn('Failed to save history to localStorage', e);
    }
  }, [history]);

  /**
   * Add a new completed operation to history
   * Ensures NO sensitive data (passwords, keys) is ever recorded
   */
  const addHistoryEntry = useCallback((entry) => {
    const sanitizedEntry = {
      id: entry.id || `${Date.now()}-${Math.random().toString(36).substring(2, 9)}`,
      timestamp: entry.timestamp || Date.now(),
      operationType: entry.operationType, // 'encrypt' | 'decrypt'
      filename: entry.filename,
      inputPath: entry.inputPath,
      outputPath: entry.outputPath || null,
      fileSize: entry.fileSize || 0,
      status: entry.status, // 'success' | 'failed'
      durationMs: entry.durationMs || 0,
      errorMessage: entry.errorMessage || null,
    };

    setHistory((prev) => [sanitizedEntry, ...prev].slice(0, MAX_HISTORY_ITEMS));
  }, []);

  const clearHistory = useCallback(() => {
    setHistory([]);
    try {
      localStorage.removeItem(HISTORY_STORAGE_KEY);
    } catch (e) {
      console.warn('Failed to clear history from localStorage', e);
    }
  }, []);

  const removeHistoryEntry = useCallback((id) => {
    setHistory((prev) => prev.filter((item) => item.id !== id));
  }, []);

  return (
    <OperationContext.Provider
      value={{
        history,
        activeOperation,
        addHistoryEntry,
        clearHistory,
        removeHistoryEntry,
        setActiveOperation,
      }}
    >
      {children}
    </OperationContext.Provider>
  );
}

export function useOperation() {
  const context = useContext(OperationContext);
  if (!context) {
    throw new Error('useOperation must be used within an OperationProvider');
  }
  return context;
}

export default OperationContext;
