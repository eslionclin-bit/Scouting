import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { registerSW } from 'virtual:pwa-register';
import { App } from './App';
import { StoreProvider } from './StoreProvider';
import './styles.css';

// De service worker cachet de app-shell, zodat de app ook zonder verbinding
// opstart. De data zelf staat toch al lokaal in IndexedDB. In omgevingen zonder
// service worker (een preview in een sandbox, een browser die het blokkeert)
// hoort de app gewoon te draaien — alleen dan zonder offline-start.
if ('serviceWorker' in navigator) {
  try {
    registerSW({ immediate: true });
  } catch (cause) {
    console.warn('Service worker niet geregistreerd:', cause);
  }
}

const container = document.getElementById('root');
if (!container) throw new Error('Geen #root element gevonden.');

createRoot(container).render(
  <StrictMode>
    <StoreProvider>
      <App />
    </StoreProvider>
  </StrictMode>,
);
