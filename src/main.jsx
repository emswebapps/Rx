import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import './index.css';
import { AuthProvider } from './context/AuthContext';
import AuthGate from './components/AuthGate';
import App from './screens/App';

// Keep the installed copy current. A PWA that has to be deleted and re-added to
// pick up a fix is a PWA people stop trusting.
//
// The reload is guarded on there having *been* a controller when the page
// loaded. On a first ever visit there is none, and `clientsClaim()` fires
// `controllerchange` the moment the new worker activates — which used to reload
// the page out from under someone seconds after they first opened the app,
// looking for all the world like a crash. A page that was already controlled,
// on the other hand, only sees that event when a genuinely new worker takes
// over, and reloading is the whole point.
if ('serviceWorker' in navigator) {
  const wasControlled = Boolean(navigator.serviceWorker.controller);
  let reloading = false;

  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (!wasControlled || reloading) return;
    reloading = true;
    window.location.reload();
  });

  navigator.serviceWorker.ready.then((reg) => {
    reg.update();
    // Checking on every foreground as well as on a timer: a phone that has had
    // the app open in the background for a week fires no interval anyone can
    // rely on, and coming back to it is exactly when an update should land.
    setInterval(() => reg.update(), 30 * 60 * 1000);
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') reg.update();
    });
  }).catch(() => {
    // No worker — a private window, or an unsupported browser. The app is
    // online-only there, which is worth nothing being thrown over.
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
