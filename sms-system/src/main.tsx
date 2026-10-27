import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from "react-router-dom";
import { QueryClientProvider } from '@tanstack/react-query';
import { ReactQueryDevtools } from '@tanstack/react-query-devtools';
import './index.css'
import App from './App.tsx'
import { initTheme } from '@/lib/theme';
import { queryClient } from '@/lib/queryClient';
import { AuthProvider } from '@/lib/AuthContext';
import { CurrentTermProvider } from '@/lib/CurrentTermContext';
import { ToastProvider } from '@/lib/ToastContext';
import { firebaseConfig } from '@/lib/firebase';
import { cleanupLegacyFirestoreCache } from '@/lib/legacyFirestoreCache';
import { installChunkReloadGuard } from '@/lib/chunkReload';
import { installErrorReporting } from '@/lib/reportError';
import ConnectionBanner from '@/components/ConnectionBanner';
import NavigationGuardProvider from '@/components/NavigationGuardProvider';

initTheme();
// Pages load on demand; a tab left open across a deploy can ask for a chunk that was replaced.
// This reloads it onto the new version (see chunkReload.ts).
installChunkReloadGuard();
// A Firebase error that nothing caught (an unhandled rejection, or a listener with no error
// callback) becomes a toast instead of staying silent (see reportError.ts).
installErrorReporting();
// Removes the IndexedDB copy of Firestore data older builds left in this browser
// (once per browser; see legacyFirestoreCache.ts).
cleanupLegacyFirestoreCache(firebaseConfig.projectId);

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter>
      <QueryClientProvider client={queryClient}>
        <AuthProvider>
          <CurrentTermProvider>
            <ToastProvider>
              <ConnectionBanner />
              <NavigationGuardProvider>
                <App />
              </NavigationGuardProvider>
            </ToastProvider>
          </CurrentTermProvider>
        </AuthProvider>
        {/* Dev-only inspector for the query cache (Implementation Order step 8,
            FIRESTORE_READ_CACHING_SPEC.md §10) — never rendered in a production build. */}
        {import.meta.env.DEV && <ReactQueryDevtools initialIsOpen={false} />}
      </QueryClientProvider>
    </BrowserRouter>
  </StrictMode>,
)
