import React from 'react';
import ReactDOM from 'react-dom/client';
import './styles/variables.css';
import './styles/global.css';
import { ThemeProvider } from './contexts/ThemeContext';
import { OperationProvider } from './contexts/OperationContext';
import { I18nProvider } from './contexts/I18nContext';
import App from './App';

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <I18nProvider>
      <ThemeProvider>
        <OperationProvider>
          <App />
        </OperationProvider>
      </ThemeProvider>
    </I18nProvider>
  </React.StrictMode>
);
