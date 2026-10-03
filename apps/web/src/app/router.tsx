import { AppShell } from './AppShell';
import {Routes,Route,Navigate} from 'react-router-dom';
import {AuthProvider,useAuth} from '../features/auth/AuthProvider';
import {Login} from '../features/auth/Login';
import {AuthCallback} from '../features/auth/AuthCallback';
function Protected(){const auth=useAuth();if(auth.loading)return <main><p role="status">Preparando tu espacio…</p></main>;if(!auth.session)return <Login/>;if(auth.error||!auth.scope)return <main><h1>Preparando tu espacio</h1><p role="alert">{auth.error}</p><button className="button" onClick={auth.retry}>Reintentar</button></main>;if(auth.recovery)return <Navigate to="/auth/callback" replace/>;return <AppShell><Routes><Route path="/hoy" element={<><p className="eyebrow">TU JORNADA</p><h1>Hoy, con vos.</h1><div className="card empty">Todavía no hay alumnos en tu espacio.</div></>}/><Route path="/alumnos" element={<h1>Alumnos</h1>}/><Route path="/rutinas" element={<h1>Rutinas</h1>}/><Route path="/ajustes" element={<h1>Ajustes</h1>}/><Route path="*" element={<Navigate to="/hoy" replace/>}/></Routes></AppShell>;}
export function App(){return <AuthProvider><Routes><Route path="/auth/callback" element={<AuthCallback/>}/><Route path="*" element={<Protected/>}/></Routes></AuthProvider>;}
