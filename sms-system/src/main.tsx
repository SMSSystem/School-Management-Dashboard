import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from "react-router-dom";
import './index.css'
import App from './App.tsx'
import { initTheme } from '@/lib/theme';
import { AuthProvider } from '@/lib/AuthContext';
import { CurrentTermProvider } from '@/lib/CurrentTermContext';

initTheme();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter>
      <AuthProvider>
        <CurrentTermProvider>
          <App />
        </CurrentTermProvider>
      </AuthProvider>
    </BrowserRouter>
  </StrictMode>,
)
