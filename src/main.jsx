import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import './index.css';
import { AuthProvider } from './context/AuthContext';
import AuthGate from './components/AuthGate';
import App from './screens/App';

// Keep the installed copy current. A PWA that has to be deleted and re-added to
// pick up a fix is a PWA people stop trusting.
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    window.location.reload();
  });
  navigator.serviceWorker.ready.then((reg) => {
    reg.update();
    setInterval(() => reg.update(), 30 * 60 * 1000);
  });
}

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <BrowserRouter basename="/Rx">
      <AuthProvider>
        <AuthGate>
          <App />
        </AuthGate>
      </AuthProvider>
    </BrowserRouter>
  </StrictMode>,
);
