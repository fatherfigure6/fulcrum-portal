import React from 'react'
import ReactDOM from 'react-dom/client'
import App, { PDRPublicForm } from './fulcrum-rent-portal.jsx'

// Route: if URL has ?pdr=xxx, show the public client form (no login)
const isPDR = new URLSearchParams(window.location.search).has('pdr')

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    {isPDR ? <PDRPublicForm /> : <App />}
  </React.StrictMode>
)
