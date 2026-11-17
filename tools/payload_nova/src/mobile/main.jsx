import './shim.js'; // debe cargarse primero: define window.jarvis
import React from 'react';
import { createRoot } from 'react-dom/client';
import Mobile from './Mobile.jsx';
import '../styles/hud.css';
import './mobile.css';
createRoot(document.getElementById('root')).render(<Mobile />);
