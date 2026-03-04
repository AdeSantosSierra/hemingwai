import React from 'react'
import ReactDOM from 'react-dom/client'
import { ClerkProvider } from '@clerk/clerk-react'
import App from './App.jsx'
import './index.css' // <--- ¡ESTA LÍNEA ES CRÍTICA!

const clerkPublishableKey = import.meta.env.VITE_CLERK_PUBLISHABLE_KEY
const root = ReactDOM.createRoot(document.getElementById('root'))

if (!clerkPublishableKey || !clerkPublishableKey.trim()) {
  root.render(
    <React.StrictMode>
      <div className="min-h-screen bg-[color:var(--hw-bg)] text-[color:var(--hw-text)] flex items-center justify-center px-6">
        <div className="max-w-xl w-full rounded-2xl border border-red-400/40 bg-[color:var(--hw-bg-elevated)] p-6 shadow-xl">
          <h1 className="text-2xl font-bold text-red-300 mb-3">Missing Clerk configuration</h1>
          <p className="text-sm text-[color:var(--hw-text-muted)] mb-3">
            Set <code className="bg-black/30 px-1 py-0.5 rounded">VITE_CLERK_PUBLISHABLE_KEY</code> in
            <code className="bg-black/30 px-1 py-0.5 rounded ml-1">frontend/.env</code> or
            <code className="bg-black/30 px-1 py-0.5 rounded ml-1">frontend/.env.local</code>.
          </p>
          <p className="text-sm text-[color:var(--hw-text-muted)]">
            After saving env vars, restart Vite with <code className="bg-black/30 px-1 py-0.5 rounded">npm run dev</code>.
          </p>
        </div>
      </div>
    </React.StrictMode>,
  )
} else {
  root.render(
    <React.StrictMode>
      <ClerkProvider publishableKey={clerkPublishableKey}>
        <App />
      </ClerkProvider>
    </React.StrictMode>,
  )
}
