import { LoadingState } from "../components/LoadingState";
import { lazy, Suspense, type ComponentType } from "react";
import { useParams, Routes, Route, Navigate, Link } from "react-router-dom";
import { AppUpdates } from "../components/AppUpdates";
import { SaveNotice } from "../components/SaveNotice";
import { AppShell } from "./AppShell";
import { AuthProvider, useAuth } from "../features/auth/AuthProvider";
import { SignOutButton } from "../features/auth/SignOutButton";
import { Login } from "../features/auth/Login";
import { AuthCallback } from "../features/auth/AuthCallback";
import { DataProvider, useData } from "./DataProvider";
const GymPortal = lazy(() =>
  import("../features/gym/GymPortal").then((m) => ({ default: m.GymPortal })),
);
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
const RoutineCatalog = lazy(() =>
  import("../features/routines/RoutineCatalog").then((m) => ({
    default: m.RoutineCatalog,
  })),
);
const TemplateEditor = lazy(() =>
  import("../features/routines/TemplateEditor").then((m) => ({
    default: m.TemplateEditor,
  })),
);
const ActiveRoutine = lazy(() =>
  import("../features/routines/StudentRoutines").then((m) => ({
    default: m.ActiveRoutine,
  })),
);
const StudentDrafts = lazy(() =>
  import("../features/routines/StudentRoutines").then((m) => ({
    default: m.StudentDrafts,
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
const StudentProgress = lazy(() =>
  import("../features/history/StudentProgress").then((m) => ({
    default: m.StudentProgress,
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
  const data = useData();
  if (!data.rows.some((row) => row.studentId === id)) {
    if (data.loading) return <LoadingState label="Cargando alumno…" />;
    return (
      <section className="card stack" aria-labelledby="student-unavailable">
        <h1 id="student-unavailable">
          {data.error
            ? "No pudimos cargar este alumno"
            : "Alumno no disponible"}
        </h1>
        <p>
          {data.error ||
            "No encontramos este alumno en tu cuenta. Volvé a la lista o reintentá la carga si acabás de agregarlo."}
        </p>
        <div className="row">
          <Link className="button" to="/alumnos">
            Volver a alumnos
          </Link>
          <button
            className="button secondary"
            onClick={() => void data.refresh()}
          >
            Reintentar carga
          </button>
        </div>
      </section>
    );
  }
  return <Component key={id} />;
}
function LegacyRoutine() {
  const { id } = useParams();
  return <Navigate to={"/alumnos/" + id + "/rutina"} replace />;
}
function TemplateRoute() {
  const { id } = useParams();
  return <TemplateEditor key={id} />;
}
function Protected() {
  const auth = useAuth();
  if (auth.loading)
    return <LoadingState label="Preparando tu espacio…" fullScreen />;
  if (!auth.session) return <Login />;
  if (auth.gymAccount)
    return (
      <Suspense
        fallback={<LoadingState label="Preparando tu gimnasio…" fullScreen />}
      >
        <GymPortal key={auth.session.user.id} />
      </Suspense>
    );
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
      <AppShell accountActions={<SignOutButton />}>
        <AppUpdates />
        <SaveNotice />
        <Suspense fallback={<LoadingState label="Cargando…" />}>
          <Routes>
            <Route path="/hoy" element={<Today />} />
            <Route path="/alumnos" element={<StudentList />} />
            <Route
              path="/alumnos/:id"
              element={<StudentRoute component={StudentProfile} />}
            />
            <Route path="/biblioteca" element={<ExerciseLibrary />} />
            <Route path="/rutinas" element={<RoutineCatalog />} />
            <Route path="/rutinas/plantillas/:id" element={<TemplateRoute />} />
            <Route
              path="/alumnos/:id/borradores"
              element={<StudentRoute component={StudentDrafts} />}
            />
            <Route
              path="/alumnos/:id/borradores/editar"
              element={<StudentRoute component={RoutineBuilder} />}
            />
            <Route path="/rutinas/:id" element={<LegacyRoutine />} />
            <Route
              path="/alumnos/:id/rutina"
              element={<StudentRoute component={ActiveRoutine} />}
            />
            <Route
              path="/entrenar/:id"
              element={<StudentRoute component={TrainingScreen} />}
            />
            <Route
              path="/historial/:id"
              element={<StudentRoute component={History} />}
            />
            <Route
              path="/progreso/:id"
              element={<StudentRoute component={StudentProgress} />}
            />
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
