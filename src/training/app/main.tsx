import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { registerSW } from 'virtual:pwa-register';
import { App } from './App';
import { AuthGate } from '../auth/AuthGate';
import { AuthProvider } from '../auth/AuthProvider';
import { StoreProvider } from './StoreProvider';
import './styles.css';

// De service worker cachet de app-shell, zodat de app ook zonder verbinding
// opstart — en dat is precies het geval waarvoor het trainingsblad bedoeld is:
// een sporthal met dikke muren. De gegevens staan toch al in IndexedDB.
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
    <AuthProvider>
      <AuthGate>
        <StoreProvider>
          <App />
        </StoreProvider>
      </AuthGate>
    </AuthProvider>
  </StrictMode>,
);
