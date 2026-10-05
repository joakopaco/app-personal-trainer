import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import { lazy, Suspense } from "react";
import { isPlatformPortal } from "./adapters/supabase";
const App = lazy(() =>
  isPlatformPortal
    ? import("./features/platform/PlatformApp").then((m) => ({
        default: m.PlatformApp,
      }))
    : import("./app/router").then((m) => ({ default: m.App })),
);
import "./app/styles.css";
ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <BrowserRouter>
      <Suspense fallback={<p role="status">Cargando…</p>}>
        <App />
      </Suspense>
    </BrowserRouter>
  </React.StrictMode>,
);
