import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
// Every family / weight the Figma text layers use (scripts/figma/sync.mjs prints the list).
import '@fontsource/poppins/300.css';
import '@fontsource/poppins/400.css';
import '@fontsource/poppins/500.css';
import '@fontsource/poppins/600.css';
import '@fontsource/poppins/700.css';
import '@fontsource/poppins/800.css';
import '@fontsource/inter/400.css';
import '@fontsource/inter/600.css';
import '@fontsource/space-mono/400.css';
import '@fontsource/space-mono/700.css';
import '@fontsource/roboto/400.css';
import '@fontsource/roboto/500.css';
import '@fontsource/roboto/600.css';
import '@fontsource/roboto/700.css';
import '@fontsource/open-sans/700.css';
import '@fontsource/caveat/700.css';
import './styles.css';
import { App } from './app/App';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
