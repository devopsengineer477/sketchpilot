import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { DashboardApp } from './DashboardApp';
import '../styles/index.css';

const container = document.getElementById('root');
if (!container) throw new Error('Dashboard root element is missing');

createRoot(container).render(
  <StrictMode>
    <DashboardApp />
  </StrictMode>,
);
