import '@fontsource/ibm-plex-sans/400.css';
import '@fontsource/ibm-plex-sans/600.css';
import './app/theme.css';
import { createRoot } from 'react-dom/client';
import { App } from './app/app';

const root = document.getElementById('root');
if (!root) {
  throw new Error('Root element is missing');
}

createRoot(root).render(<App />);
