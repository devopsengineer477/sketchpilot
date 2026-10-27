import './bootstrap';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { EditorApp } from './EditorApp';
import '../styles/index.css';

const container = document.getElementById('root');
if (!container) throw new Error('Editor root element is missing');

const params = new URLSearchParams(window.location.search);
const drawingId = params.get('id');
const templateId = params.get('template');

createRoot(container).render(
  <StrictMode>
    <EditorApp initialDrawingId={drawingId} initialTemplateId={templateId} />
  </StrictMode>,
);
