import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App, NotConfigured } from './App';
import { createAppServices } from './app/services';
import './index.css';

const services = createAppServices();

createRoot(document.getElementById('root')!).render(<StrictMode>{services ? <App services={services} /> : <NotConfigured />}</StrictMode>);
