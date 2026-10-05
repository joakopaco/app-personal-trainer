import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import { lazy, Suspense } from "react";
import { isPlatformPortal } from "./adapters/supabase";
// Keep each lazy import in its own loader so the production build attaches
// the corresponding CSS dependencies to both entry points.
const PlatformApp = lazy(() =>
  import("./features/platform/PlatformApp").then((m) => ({
    default: m.PlatformApp,
  })),
);
const CustomerApp = lazy(() =>
  import("./app/router").then((m) => ({ default: m.App })),
);
const App = isPlatformPortal ? PlatformApp : CustomerApp;
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
