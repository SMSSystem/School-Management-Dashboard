import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from "react-router-dom";
import './index.css'
import App from './App.tsx'
import { initTheme } from '@/lib/theme';
import { AuthProvider } from '@/lib/AuthContext';
import { CurrentTermProvider } from '@/lib/CurrentTermContext';
import { ToastProvider } from '@/lib/ToastContext';

initTheme();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter>
      <AuthProvider>
        <CurrentTermProvider>
          <ToastProvider>
            <App />
          </ToastProvider>
        </CurrentTermProvider>
      </AuthProvider>
    </BrowserRouter>
  </StrictMode>,
)
