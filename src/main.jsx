import React from 'react';
import ReactDOM from 'react-dom/client';
import './styles/variables.css';
import './styles/global.css';
import { ThemeProvider } from './contexts/ThemeContext';
import { OperationProvider } from './contexts/OperationContext';
import App from './App';

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <ThemeProvider>
      <OperationProvider>
        <App />
      </OperationProvider>
    </ThemeProvider>
  </React.StrictMode>
);
