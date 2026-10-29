import React from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import App from './App';
import { AuthProvider } from './auth';
import { ToastProvider } from './ui';
import './styles.css';

const qc = new QueryClient({ defaultOptions: { queries: { staleTime: 15000, retry: 1, refetchOnWindowFocus: false } } });

createRoot(document.getElementById('root')).render(
  <QueryClientProvider client={qc}>
    <ToastProvider>
      <AuthProvider>
        <BrowserRouter><App /></BrowserRouter>
      </AuthProvider>
    </ToastProvider>
  </QueryClientProvider>,
);
