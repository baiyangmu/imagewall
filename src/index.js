// index.js
import React from 'react';
import { createRoot } from 'react-dom/client'; // 使用 React 19 的 client 模块
import App from './App';
import './index.css';

const container = document.getElementById('root');
const root = createRoot(container);
root.render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
