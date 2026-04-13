import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import "./index.css"; 
import { ThemeProvider } from "./context/ThemeContext"; // 1. Import the Provider

const root = ReactDOM.createRoot(document.getElementById("root"));
root.render(
  <React.StrictMode>
    <ThemeProvider> {/* 2. Wrap the App component */}
      <App />
    </ThemeProvider>
  </React.StrictMode>
);