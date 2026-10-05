import { createClient } from 'npm:@supabase/supabase-js@2.117.2';

const headers = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'apikey, content-type, x-client-info, authorization', 'Access-Control-Allow-Methods': 'POST, OPTIONS', 'Cache-Control': 'no-store', 'Content-Type': 'application/json' };
const respond = (data: unknown, status = 200) => new Response(JSON.stringify(data), { status, headers });
const denied = () => respond({ error: 'No pudimos ingresar. Revisá usuario y contraseña.' }, 401);

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers });
  if (req.method !== 'POST') return respond({ error: 'Método no permitido.' }, 405);
  try {
    const raw = await req.text();
    if (raw.length > 6000) return denied();
    const body = JSON.parse(raw);
    if (typeof body.username !== 'string' || !/^[A-Za-z0-9_]{3,48}$/.test(body.username.trim()) || typeof body.password !== 'string' || body.password.length > 128) return denied();
    const url = Deno.env.get('SUPABASE_URL')!;
    const service = createClient(url, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { auth: { persistSession: false, autoRefreshToken: false } });
    const target = await service.rpc('platform_login_target', { login_name: body.username });
    if (target.error) return respond({ error: 'No se pudo iniciar sesión. Intentá nuevamente.' }, 503);
    if (target.data.limited) return respond({ error: 'Demasiados intentos. Esperá cinco minutos y volvé a intentar.' }, 429);
    const auth = createClient(url, Deno.env.get('SUPABASE_ANON_KEY')!, { auth: { persistSession: false, autoRefreshToken: false } });
    const signed = await auth.auth.signInWithPassword({
      email: target.data.email ?? 'unavailable-operator@operator.invalid',
      password: body.password,
      options: { captchaToken: typeof body.captchaToken === 'string' ? body.captchaToken : undefined },
    });
    if (signed.error || !signed.data.session || signed.data.user?.id !== target.data.userId) return denied();
    const access = await auth.rpc('platform_access');
    if (access.error || !access.data) { await auth.auth.signOut({ scope: 'local' }); return denied(); }
    return respond({ access_token: signed.data.session.access_token, refresh_token: signed.data.session.refresh_token });
  } catch { return denied(); }
});
