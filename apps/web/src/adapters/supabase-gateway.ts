import {snapshotSchema,type AccountScope,type CloudGateway,type CommandEnvelope,type CommandReply} from '@pulso/domain/contracts';
import {cloud} from './supabase';
export function gateway(scope:AccountScope):CloudGateway{
 async function check(){const{data,error}=await cloud().auth.getSession();if(error||data.session?.user.id!==scope.userId)throw Object.assign(Error('Volvé a ingresar a la misma cuenta.'),{code:'AUTH_REQUIRED'});}
 return {
  async fetchStudent(requested,studentId){if(requested.userId!==scope.userId||requested.workspaceId!==scope.workspaceId)throw Error('Cuenta incorrecta');await check();const{data,error}=await cloud().rpc('fetch_student',{workspace_id:scope.workspaceId,student_id:studentId});if(error)throw error;return snapshotSchema.parse(data);},
  async execute(command:CommandEnvelope):Promise<CommandReply>{if(command.workspaceId!==scope.workspaceId)throw Error('Cuenta incorrecta');await check();const{data,error}=await cloud().rpc('apply_training_command',{command});if(error)throw error;if(data.status==='applied'||data.status==='duplicate')return {...data,patch:snapshotSchema.parse(data.patch)};if(data.status==='conflict')return {...data,current:snapshotSchema.parse(data.current)};if(data.status==='rejected')return data;throw Error('Respuesta no reconocida');}
 };
}
