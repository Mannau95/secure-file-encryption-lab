import React from 'react';
import { HashRouter, Routes, Route, Navigate } from 'react-router-dom';
import Layout from './components/Layout';
import Home from './pages/Home';
import Encrypt from './pages/Encrypt';
import Decrypt from './pages/Decrypt';
import Education from './pages/Education';
import History from './pages/History';
import Settings from './pages/Settings';

export function App() {
  return (
    <HashRouter>
      <Routes>
        <Route path="/" element={<Layout />}>
          <Route index element={<Home />} />
          <Route path="encrypt" element={<Encrypt />} />
          <Route path="decrypt" element={<Decrypt />} />
          <Route path="education" element={<Education />} />
          <Route path="history" element={<History />} />
          <Route path="settings" element={<Settings />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Route>
      </Routes>
    </HashRouter>
  );
}

export default App;
