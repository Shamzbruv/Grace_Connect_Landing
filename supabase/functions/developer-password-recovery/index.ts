import { createClient } from 'npm:@supabase/supabase-js@2.57.4';

const resetUrl = 'https://graceconnect.love/reset-password.html';
const permittedRoles = new Set(['super_developer', 'support_developer', 'security_admin']);

export async function handleRequest(req: Request) {
    const headers = {
        'Access-Control-Allow-Origin': 'https://graceconnect.love',
        'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
        'Access-Control-Allow-Methods': 'POST, OPTIONS',
        'Cache-Control': 'no-store',
        'Content-Type': 'application/json',
        'Vary': 'Origin',
    };
    const reply = (status: number, body: Record<string, unknown>) => new Response(JSON.stringify(body), { status, headers });
    if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers });
    if (req.method !== 'POST') return reply(405, { error: 'Use POST.' });
    if (req.headers.get('origin') && req.headers.get('origin') !== 'https://graceconnect.love') return reply(403, { error: 'Origin not allowed.' });
    const authorization = req.headers.get('authorization') || '';
    if (!authorization.startsWith('Bearer ')) return reply(401, { error: 'Sign in to the developer portal.' });
    try {
        const url = Deno.env.get('SUPABASE_URL')!;
        const admin = createClient(url, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { auth: { persistSession: false, autoRefreshToken: false } });
        // Validate the actual user with Auth; never trust decoded claims or user_metadata.
        const { data: identity, error: identityError } = await admin.auth.getUser(authorization.slice(7));
        if (identityError || !identity.user) return reply(401, { error: 'Your sign-in has expired. Sign in again.' });
        const caller = createClient(url, Deno.env.get('SUPABASE_ANON_KEY')!, {
            global: { headers: { Authorization: authorization } },
            auth: { persistSession: false, autoRefreshToken: false },
        });
        const { data: session, error: sessionError } = await caller.rpc('developer_get_session');
        if (sessionError || session?.status !== 'active' || !permittedRoles.has(session?.developer_role)) return reply(403, { error: 'Your developer role cannot issue temporary passwords.' });
        const body = await req.json();
        if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(body.user_id || '')) return reply(400, { error: 'Select a valid user account.' });
        const { data: target, error: targetError } = await admin.auth.admin.getUserById(body.user_id);
        if (targetError || !target.user?.email) return reply(404, { error: 'User account not found.' });
        if (!target.user.email_confirmed_at) return reply(400, { error: 'The user must verify their email before password recovery.' });
        if (target.user.banned_until && new Date(target.user.banned_until).getTime() > Date.now()) return reply(403, { error: 'This account is suspended.' });
        const { data: developers, error: developerError } = await admin.from('developer_accounts').select('user_id,email');
        if (developerError) return reply(503, { error: 'Unable to verify account permissions.' });
        const isDeveloper = developers?.some((dev) => dev.user_id === target.user.id || dev.email?.toLowerCase() === target.user.email?.toLowerCase());
        if (isDeveloper && session.developer_role !== 'super_developer') return reply(403, { error: 'Only a super developer can recover another developer account.' });
        // Audit the request without storing the recovery credential or a password.
        const { error: auditError } = await caller.rpc('log_developer_action', {
            p_action: 'temporary_password_requested', p_target_type: 'user', p_target_id: target.user.id,
            p_details: { delivery: 'manual', method: 'single_use_web_recovery' },
        });
        if (auditError) return reply(503, { error: 'Unable to record this recovery request. Please try again.' });
        const { data, error } = await admin.auth.admin.generateLink({ type: 'recovery', email: target.user.email, options: { redirectTo: resetUrl } });
        if (error || !data.properties?.hashed_token) return reply(503, { error: 'Unable to generate a temporary password. Please try again.' });
        // Supabase enforces expiry and single use. No email is sent by generateLink.
        return reply(200, {
            temporary_password: `GC-${data.properties.hashed_token}`,
            reset_url: resetUrl,
            email: target.user.email,
        });
    } catch (_) {
        return reply(400, { error: 'Unable to process this recovery request.' });
    }
}

Deno.serve(handleRequest);
