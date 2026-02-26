/**
 * Renderer entry (React + Jotai + shadcn/ui shell).
 */
import React from "react";
import ReactDOM from "react-dom/client";
import { Provider } from "jotai";
import { App } from "./app/App";
import "./index.css";

const rootEl = document.getElementById("root");
if (!rootEl) {
  throw new Error("Missing #root");
}

ReactDOM.createRoot(rootEl).render(
  <React.StrictMode>
    <Provider>
      <App />
    </Provider>
  </React.StrictMode>
);
