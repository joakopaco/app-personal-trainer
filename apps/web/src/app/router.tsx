import { AppShell } from './AppShell';
import {Routes,Route,Navigate} from 'react-router-dom';
import {AuthProvider,useAuth} from '../features/auth/AuthProvider';
import {Login} from '../features/auth/Login';
import {AuthCallback} from '../features/auth/AuthCallback';
import {DataProvider} from './DataProvider';
import {StudentList,StudentProfile} from '../features/students/Students';
import {RoutineBuilder,RoutineList} from '../features/routines/RoutineBuilder';
import {Today} from '../features/agenda/Today';
import {TrainingScreen} from '../features/live/TrainingScreen';
import {Settings} from '../features/settings/Settings';
import {History} from '../features/history/History';
function Protected(){const auth=useAuth();if(auth.loading)return <main><p role="status">Preparando tu espacio…</p></main>;if(!auth.session)return <Login/>;if(auth.error||!auth.scope)return <main><h1>Preparando tu espacio</h1><p role="alert">{auth.error}</p><button className="button" onClick={auth.retry}>Reintentar</button></main>;if(auth.recovery)return <Navigate to="/auth/callback" replace/>;return <DataProvider key={auth.scope.userId}><AppShell><Routes><Route path="/hoy" element={<Today/>}/><Route path="/alumnos" element={<StudentList/>}/><Route path="/alumnos/:id" element={<StudentProfile/>}/><Route path="/rutinas" element={<RoutineList/>}/><Route path="/rutinas/:id" element={<RoutineBuilder/>}/><Route path="/entrenar/:id" element={<TrainingScreen/>}/><Route path="/historial/:id" element={<History/>}/><Route path="/ajustes" element={<Settings/>}/><Route path="*" element={<Navigate to="/hoy" replace/>}/></Routes></AppShell></DataProvider>;}
export function App(){return <AuthProvider><Routes><Route path="/auth/callback" element={<AuthCallback/>}/><Route path="*" element={<Protected/>}/></Routes></AuthProvider>;}
