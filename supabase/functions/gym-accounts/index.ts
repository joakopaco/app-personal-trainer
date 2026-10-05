import { createClient } from 'npm:@supabase/supabase-js@2.117.2';

const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, apikey, content-type, x-client-info', 'Access-Control-Allow-Methods': 'POST, OPTIONS', 'Cache-Control': 'no-store' };
const respond = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } });
const hash = async (password: string) => Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(password)))).map(n => n.toString(16).padStart(2, '0')).join('');
const temporary = () => 'Pu!' + Array.from(crypto.getRandomValues(new Uint8Array(18))).map(n => n.toString(16).padStart(2, '0')).join('') + 'a1';

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: cors });
  if (req.method !== 'POST') return respond({ error: 'Método no permitido.' }, 405);
  try {
    const text = await req.text();
    if (text.length > 5000) return respond({ error: 'Solicitud demasiado grande.' }, 400);
    const body = JSON.parse(text);
    const url = Deno.env.get('SUPABASE_URL')!;
    const caller = createClient(url, Deno.env.get('SUPABASE_ANON_KEY')!, { auth: { persistSession: false }, global: { headers: { Authorization: req.headers.get('Authorization') ?? '' } } });
    const { data: { user }, error: authError } = await caller.auth.getUser();
    if (authError || !user) return respond({ error: 'Volvé a ingresar.' }, 401);
    const { data: access, error: accessError } = await caller.rpc('gym_access');
    if (accessError || access.blocked) return respond({ error: 'Acceso no disponible.' }, 403);
    if (access.mode === 'trainer' && !access.operator) return respond({ error: 'Acceso no disponible.' }, 403);
    if (access.mustChangePassword && body.action !== 'change_password') return respond({ error: 'Primero elegí tu nueva contraseña.' }, 403);
    const service = createClient(url, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { auth: { persistSession: false } });
    const rpc = async (name: string, args: Record<string, unknown>) => {
      const { data, error } = await service.rpc(name, args);
      if (error) throw error;
      return data;
    };
    if (body.action === 'create_gym' || body.action === 'create_member') {
      const request = { action: body.action, operationId: body.operationId, name: String(body.name ?? '').trim(), email: String(body.email ?? '').trim().toLowerCase() };
      const reservation = await rpc('gym_provision_begin', { actor: user.id, request });
      if (reservation.complete) return respond({ userId: reservation.userId, gymId: reservation.gymId, alreadyCreated: true });
      try {
        const password = temporary();
        if (reservation.userId) {
          const changed = await service.auth.admin.updateUserById(reservation.userId, { password });
          if (changed.error) throw changed.error;
        } else {
          const created = await service.auth.admin.createUser({ email: request.email, password, email_confirm: true, app_metadata: { gym_account: true, gym_provision_id: request.operationId } });
          if (created.error) throw created.error;
        }
        const result = await rpc('gym_provision_finish', { actor: user.id, operation: request.operationId, lease: reservation.token, password_hash: await hash(password) });
        return respond({ ...result, email: request.email, temporaryPassword: password });
      } finally {
        await rpc('gym_provision_release', { actor: user.id, operation: request.operationId, lease: reservation.token });
      }
    }
    if (body.action === 'change_password' || body.action === 'reset_password') {
      const reset = body.action === 'reset_password';
      const password = reset ? temporary() : String(body.password ?? '');
      if (password.length < 12 || password.length > 128 || !/[a-z]/.test(password) || !/[A-Z]/.test(password) || !/[0-9]/.test(password)) return respond({ error: 'Usá entre 12 y 128 caracteres, con mayúscula, minúscula y número.' }, 400);
      const target = reset ? body.userId : user.id;
      const passwordHash = await hash(password);
      const job = await rpc('gym_credentials_begin', { actor: user.id, target_id: target, reset, password_hash: passwordHash });
      let succeeded = false;
      try {
        const changed = await service.auth.admin.updateUserById(target, { password });
        if (changed.error) throw changed.error;
        succeeded = true;
      } finally {
        await rpc('gym_credentials_finish', { actor: user.id, target_id: target, job, reset, password_hash: passwordHash, succeeded });
      }
      return respond(reset ? { temporaryPassword: password } : { changed: true });
    }
    if (body.action === 'set_gym_active' && typeof body.active === 'boolean') {
      await rpc('gym_set_active', { actor: user.id, tenant: body.gymId, enabled: body.active });
      return respond({ updated: true });
    }
    return respond({ error: 'Solicitud no válida.' }, 400);
  } catch (error) {
    const e = error as { code?: string; message?: string };
    const status = e.code === '42501' ? 403 : e.code === '23505' || e.code === '40001' ? 409 : 400;
    const message = e.code === '23505' ? 'Ese email ya tiene una cuenta. No se modificó su acceso.' : e.code === '40001' ? 'Hay otra operación en curso. Esperá un momento y reintentá.' : e.code === '42501' ? 'No tenés permiso para esta acción.' : e.message === 'Choose a different password' ? 'Elegí una contraseña diferente a la temporal.' : 'No se pudo completar la solicitud. Revisá los datos y reintentá.';
    return respond({ error: message }, status);
  }
});
