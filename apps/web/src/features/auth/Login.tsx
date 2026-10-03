import {useState,type FormEvent} from 'react';
import {Activity,ArrowRight} from 'lucide-react';
import {cloud,supabase} from '../../adapters/supabase';
export function Login(){
  const[email,setEmail]=useState('');const[password,setPassword]=useState('');const[mode,setMode]=useState<'login'|'recovery'>('login');
  const[busy,setBusy]=useState(false);const[message,setMessage]=useState('');const[error,setError]=useState('');
  async function submit(event:FormEvent){event.preventDefault();setBusy(true);setError('');setMessage('');
    try{
      if(mode==='recovery'){
        const{error}=await cloud().auth.resetPasswordForEmail(email,{redirectTo:location.origin+'/auth/callback'});
        if(error)throw error;
        setMessage('Si el email tiene una cuenta, recibirás un enlace para recuperar el acceso.');
      }else{const{error}=await cloud().auth.signInWithPassword({email,password});if(error)throw error;}
    }catch{setError(mode==='login'?'No pudimos ingresar. Revisá tus datos, la confirmación del email y tu conexión.':'No pudimos solicitar el enlace. Intentá nuevamente.');}finally{setBusy(false);}
  }
  return <div className="auth-page"><section className="auth-story"><div className="brand"><Activity/><span>pulso.</span></div><div><p className="eyebrow">EL ENTRENAMIENTO, EN TUS MANOS</p><h2>Más presente.<br/>En cada repetición.</h2><p>Un espacio para preparar rutinas, acompañar a tus alumnos y ver cómo progresan.</p></div><p>Hecho para el ritmo de tu jornada.</p></section><section className="auth-panel"><div><p className="eyebrow">TU ESPACIO PRIVADO</p><h1>{mode==='login'?'Tu jornada empieza acá':'Recuperá tu acceso'}</h1><p className="muted">{mode==='login'?'Ingresá con tu cuenta de entrenador.':'Te enviamos un enlace para elegir una contraseña nueva.'}</p>{!supabase&&<p className="notice">Falta conectar el entorno local. Ejecutá la preparación indicada en el README.</p>}<form className="stack" onSubmit={submit}><label className="field">Email<input type="email" autoComplete="username" required value={email} onChange={e=>setEmail(e.target.value)}/></label>{mode==='login'&&<label className="field">Contraseña<input type="password" autoComplete="current-password" required value={password} onChange={e=>setPassword(e.target.value)}/></label>}{error&&<p className="error" role="alert">{error}</p>}{message&&<p className="notice" role="status">{message}</p>}<button className="button" disabled={busy||!supabase}>{busy?'Un momento…':mode==='login'?'Ingresar':'Enviar enlace'}<ArrowRight size={17}/></button><button type="button" className="link-button" onClick={()=>{setMode(mode==='login'?'recovery':'login');setError('');setMessage('');}}>{mode==='login'?'Olvidé mi contraseña':'Volver al ingreso'}</button></form><p className="auth-note">Acceso por invitación. Cada entrenador tiene su propio espacio y administra las fichas de sus alumnos.</p></div></section></div>;
}
