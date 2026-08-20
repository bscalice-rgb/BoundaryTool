import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';

// Vendor stylesheets are imported here rather than from index.css so each stays a
// module of its own: the build strips Geoman's hidden-toolbar rules on the way past.
import 'leaflet/dist/leaflet.css';
import '@geoman-io/leaflet-geoman-free/dist/leaflet-geoman.css';
import './index.css';

const root = document.getElementById('root');
if (!root) throw new Error('Missing #root element.');

createRoot(root).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
