import { useEffect } from 'react';
import { BrowserRouter, Route, Routes } from 'react-router-dom';

import { Layout } from './components/Layout';
import { useWebSocket } from './hooks/useWebSocket';
import { ChatPage } from './pages/ChatPage';
import { DashboardPage } from './pages/DashboardPage';
import { EconomicsPage } from './pages/EconomicsPage';
import { PortfolioPage } from './pages/PortfolioPage';
import { SecurityPage } from './pages/SecurityPage';
import { useRugnotStore } from './store';

export function App() {
  const fetchState = useRugnotStore((store) => store.fetchState);
  useWebSocket();

  useEffect(() => {
    void fetchState();
  }, [fetchState]);

  return (
    <BrowserRouter>
      <Routes>
        <Route element={<Layout />}>
          <Route path="/" element={<DashboardPage />} />
          <Route path="/chat" element={<ChatPage />} />
          <Route path="/portfolio" element={<PortfolioPage />} />
          <Route path="/security" element={<SecurityPage />} />
          <Route path="/economics" element={<EconomicsPage />} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}
