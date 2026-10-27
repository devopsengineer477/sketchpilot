import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { SettingsApp } from './SettingsApp';
import '../styles/index.css';

const container = document.getElementById('root');
if (!container) throw new Error('Settings root element is missing');

createRoot(container).render(
  <StrictMode>
    <SettingsApp />
  </StrictMode>,
);
