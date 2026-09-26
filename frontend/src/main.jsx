import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App.jsx';
import './index.css'; // Aquí se cargan todas las variables CSS y estilos de Tailwind
import { instalarInterceptorApi } from './config/api';

// Antes de cualquier llamada al backend: agrega el token de sesión a cada petición.
instalarInterceptorApi();

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
