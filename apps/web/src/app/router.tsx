import { lazy, Suspense, type ComponentType } from "react";
import { useParams, Routes, Route, Navigate } from "react-router-dom";
import { UpdateAvailable } from "../components/UpdateAvailable";
import { PendingReview } from "../components/PendingReview";
import { AppShell } from "./AppShell";
import { AuthProvider, useAuth } from "../features/auth/AuthProvider";
import { Login } from "../features/auth/Login";
import { AuthCallback } from "../features/auth/AuthCallback";
import { DataProvider } from "./DataProvider";
const Today = lazy(() =>
  import("../features/agenda/Today").then((m) => ({ default: m.Today })),
);
const StudentList = lazy(() =>
  import("../features/students/Students").then((m) => ({
    default: m.StudentList,
  })),
);
const StudentProfile = lazy(() =>
  import("../features/students/Students").then((m) => ({
    default: m.StudentProfile,
  })),
);
const RoutineList = lazy(() =>
  import("../features/routines/RoutineBuilder").then((m) => ({
    default: m.RoutineList,
  })),
);
const RoutineBuilder = lazy(() =>
  import("../features/routines/RoutineBuilder").then((m) => ({
    default: m.RoutineBuilder,
  })),
);
const TrainingScreen = lazy(() =>
  import("../features/live/TrainingScreen").then((m) => ({
    default: m.TrainingScreen,
  })),
);
const History = lazy(() =>
  import("../features/history/History").then((m) => ({ default: m.History })),
);
const SyncCenter = lazy(() =>
  import("../features/settings/SyncCenter").then((m) => ({
    default: m.SyncCenter,
  })),
);
const Settings = lazy(() =>
  import("../features/settings/Settings").then((m) => ({
    default: m.Settings,
  })),
);
const ExerciseLibrary = lazy(() =>
  import("../features/catalog/ExerciseLibrary").then((m) => ({
    default: m.ExerciseLibrary,
  })),
);
function StudentRoute({ component: Component }: { component: ComponentType }) {
  const { id } = useParams();
  return <Component key={id} />;
}
function Protected() {
  const auth = useAuth();
  if (auth.loading)
    return (
      <main>
        <p role="status">Preparando tu espacio…</p>
      </main>
    );
  if (!auth.session) return <Login />;
  if (auth.error || !auth.scope)
    return (
      <main>
        <h1>Preparando tu espacio</h1>
        <p role="alert">{auth.error}</p>
        <button className="button" onClick={auth.retry}>
          Reintentar
        </button>
      </main>
    );
  if (auth.recovery) return <Navigate to="/auth/callback" replace />;
  return (
    <DataProvider key={auth.scope.userId}>
      <AppShell>
        <UpdateAvailable />
        <PendingReview />
        <Suspense fallback={<p role="status">Cargando…</p>}>
          <Routes>
            <Route path="/hoy" element={<Today />} />
            <Route path="/alumnos" element={<StudentList />} />
            <Route
              path="/alumnos/:id"
              element={<StudentRoute component={StudentProfile} />}
            />
            <Route path="/biblioteca" element={<ExerciseLibrary />} />
            <Route path="/rutinas" element={<RoutineList />} />
            <Route
              path="/rutinas/:id"
              element={<StudentRoute component={RoutineBuilder} />}
            />
            <Route
              path="/entrenar/:id"
              element={<StudentRoute component={TrainingScreen} />}
            />
            <Route
              path="/historial/:id"
              element={<StudentRoute component={History} />}
            />
            <Route path="/sincronizacion" element={<SyncCenter />} />
            <Route path="/ajustes" element={<Settings />} />
            <Route path="*" element={<Navigate to="/hoy" replace />} />
          </Routes>
        </Suspense>
      </AppShell>
    </DataProvider>
  );
}
export function App() {
  return (
    <AuthProvider>
      <Routes>
        <Route path="/auth/callback" element={<AuthCallback />} />
        <Route path="*" element={<Protected />} />
      </Routes>
    </AuthProvider>
  );
}
