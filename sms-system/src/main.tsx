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

initTheme();
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
              <App />
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
