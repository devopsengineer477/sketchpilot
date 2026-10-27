import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { PopupApp } from './PopupApp';
import '../styles/index.css';

document.documentElement.classList.add('popup-root');

const container = document.getElementById('root');
if (!container) throw new Error('Popup root element is missing');

createRoot(container).render(
  <StrictMode>
    <PopupApp />
  </StrictMode>,
);
