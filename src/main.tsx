import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
// Bundled with the app so the font also works offline.
import '@fontsource-variable/inter'
import './index.css'
import App from './App.tsx'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
