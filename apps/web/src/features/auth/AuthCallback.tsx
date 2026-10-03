import {useEffect,useRef,useState,type FormEvent} from 'react';
import {useNavigate} from 'react-router-dom';
import {cloud} from '../../adapters/supabase';
import {useAuth} from './AuthProvider';
export function AuthCallback(){
  const auth=useAuth();const navigate=useNavigate();const[password,setPassword]=useState('');const[error,setError]=useState('');const[busy,setBusy]=useState(false);const started=useRef(false);
  useEffect(()=>{
    if(started.current)return;started.current=true;
    const params=new URLSearchParams(location.search);const token=params.get('token_hash');const type=params.get('type');
    if(token&&(type==='invite'||type==='recovery')){
      void cloud().auth.verifyOtp({token_hash:token,type}).then(({error})=>{history.replaceState(null,'','/auth/callback');if(error)setError('El enlace ya fue utilizado o venció. Solicitá uno nuevo.');});
    }else if(params.has('error')||new URLSearchParams(location.hash.slice(1)).has('error'))setError('El enlace ya fue utilizado o venció. Solicitá uno nuevo.');
  },[]);
  async function submit(e:FormEvent){e.preventDefault();setBusy(true);setError('');try{const{error}=await cloud().auth.updateUser({password});if(error)throw error;auth.finishRecovery();navigate('/hoy',{replace:true});}catch{setError('No se pudo cambiar la contraseña. Usá al menos 12 caracteres o solicitá un enlace nuevo.');}finally{setBusy(false);}}
  return <div className="auth-panel"><div><h1>Elegí tu contraseña</h1>{error&&<p className="error" role="alert">{error}</p>}{auth.session?<form className="stack" onSubmit={submit}><label className="field">Nueva contraseña<input type="password" minLength={12} autoComplete="new-password" required value={password} onChange={e=>setPassword(e.target.value)}/></label><button className="button" disabled={busy}>Guardar contraseña</button></form>:<p>Si el enlace no se pudo validar, volvé al ingreso y pedí uno nuevo.</p>}<a href="/login">Volver al ingreso</a></div></div>;
}
