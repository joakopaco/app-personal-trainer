import { LoadingState } from "./components/LoadingState";
import React from "react";
import ReactDOM from "react-dom/client";
import { createBrowserRouter, RouterProvider } from "react-router-dom";
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
const router = createBrowserRouter([
  {
    path: "*",
    element: (
      <Suspense fallback={<LoadingState label="Cargando…" fullScreen />}>
        <App />
      </Suspense>
    ),
  },
]);
ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <RouterProvider router={router} />
  </React.StrictMode>,
);
