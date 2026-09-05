const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const { stripTypeScriptTypes } = require('node:module');
const root = path.resolve(__dirname, '..');

async function page(search = '', hash = '', authOverrides = {}) {
    const elements = {};
    const calls = [];
    const get = (id) => elements[id] ||= {
        hidden: true, value: '', textContent: '', className: '', disabled: false,
        addEventListener(name, fn) { this[name] = fn; }, focus() {}, reset() {},
        querySelector() { return get('requestButton'); },
    };
    const session = { user: { id: 'test', email: 'test@example.invalid' } };
    const auth = {
        verifyOtp: async (args) => { calls.push(['verify', args]); return { data: { session } }; },
        setSession: async (args) => { calls.push(['session', args]); return { data: { session } }; },
        updateUser: async (args) => { calls.push(['update', args]); return {}; },
        signOut: async () => { calls.push(['signout']); return {}; },
        ...authOverrides,
    };
    let initialize;
    const context = {
        document: { getElementById: get, addEventListener(_, fn) { initialize = fn; } },
        location: { search, hash }, history: { replaceState(...args) { calls.push(['history', ...args]); } },
        URLSearchParams,
        window: { supabase: { createClient(_url, _key, options) { calls.push(['options', options]); return { auth }; } } },
    };
    vm.runInNewContext(fs.readFileSync(path.join(root, 'js/reset-password.js'), 'utf8'), context);
    await initialize();
    return { get, calls, submit: async (id) => get(id).submit({ preventDefault() {}, currentTarget: get(id) }) };
}

test('email token waits for a click, is removed from the URL, and uses isolated memory storage', async () => {
    const p = await page('?token_hash=test&type=recovery');
    assert.equal(p.calls.some(([name]) => name === 'verify'), false);
    assert.equal(p.calls.find(([name]) => name === 'history').at(-1), '/reset-password.html');
    assert.equal(p.calls.find(([name]) => name === 'options')[1].auth.persistSession, false);
    assert.equal(p.get('verifyRecoveryForm').hidden, false);
    await p.submit('verifyRecoveryForm');
    assert.equal(p.calls.find(([name]) => name === 'verify')[1].type, 'recovery');
    assert.equal(p.get('newPasswordForm').hidden, false);
});

test('a plain page never adopts an existing developer session or allows password updates', async () => {
    const p = await page();
    p.get('newPassword').value = p.get('confirmPassword').value = 'Test-password-123';
    await p.submit('newPasswordForm');
    assert.equal(p.calls.some(([name]) => name === 'update'), false);
    assert.equal(p.get('recoveryAlternatives').hidden, false);
});

test('temporary password is redeemed once through Supabase recovery and then allows a new password', async () => {
    const p = await page();
    p.get('useTemporaryPassword').click();
    p.get('temporaryPassword').value = 'GC-test-hash';
    await p.submit('verifyRecoveryForm');
    assert.equal(p.calls.find(([name]) => name === 'verify')[1].token_hash, 'test-hash');
    assert.equal(p.get('temporaryPassword').value, '');
    p.get('newPassword').value = 'Test-password-123';
    p.get('confirmPassword').value = 'different';
    await p.submit('newPasswordForm');
    assert.equal(p.calls.some(([name]) => name === 'update'), false);
    p.get('confirmPassword').value = 'Test-password-123';
    await p.submit('newPasswordForm');
    assert.equal(p.calls.filter(([name]) => name === 'update').length, 1);
    assert.equal(p.get('resetComplete').hidden, false);
    assert.equal(p.calls.some(([name]) => name === 'signout'), true);
});

test('expired and reused links offer recovery without opening the password form', async () => {
    const p = await page('?token_hash=expired&type=recovery', '', { verifyOtp: async () => ({ error: { message: 'expired' } }) });
    await p.submit('verifyRecoveryForm');
    assert.equal(p.get('newPasswordForm').hidden, true);
    assert.equal(p.get('recoveryAlternatives').hidden, false);
    assert.match(p.get('resetMessage').textContent, /expired/);
});

test('legacy implicit recovery fragments work and arbitrary signup tokens do not', async () => {
    const p = await page('', '#access_token=test&refresh_token=test&type=recovery');
    assert.equal(p.get('newPasswordForm').hidden, false);
    const signup = await page('?token_hash=signup&type=signup');
    assert.equal(signup.get('newPasswordForm').hidden, true);
});

test('home and verification page route recovery credentials while preserving them', () => {
    let destination;
    vm.runInNewContext(fs.readFileSync(path.join(root, 'js/recovery-route.js'), 'utf8'), {
        URLSearchParams, window: {}, location: { search: '?x=1', hash: '#type=recovery&access_token=test', replace(value) { destination = value; } },
    });
    assert.equal(destination, '/reset-password.html?x=1#type=recovery&access_token=test');
});

async function endpoint({ role = 'super_developer', authenticated = true, targetDeveloper = false, auditFailure = false } = {}) {
    const calls = [];
    const target = { id: '11111111-1111-4111-8111-111111111111', email: 'test@example.invalid', email_confirmed_at: '2026-01-01' };
    const admin = {
        auth: {
            getUser: async () => authenticated ? { data: { user: { id: 'actor' } } } : { data: {}, error: {} },
            admin: {
                getUserById: async () => ({ data: { user: target } }),
                generateLink: async (args) => { calls.push(['generate', args]); return { data: { properties: { hashed_token: 'secret-test-token' } } }; },
            },
        },
        from: () => ({ select: async () => ({ data: targetDeveloper ? [{ user_id: target.id }] : [] }) }),
    };
    const caller = { rpc: async (name, args) => {
        calls.push([name, args]);
        return name === 'developer_get_session' ? { data: { status: 'active', developer_role: role } } : { error: auditFailure ? {} : null };
    } };
    let clientCount = 0;
    const source = fs.readFileSync(path.join(root, 'supabase/functions/developer-password-recovery/index.ts'), 'utf8')
        .replace(/^import .*;\n/, '').replace('export async function', 'async function');
    const context = { Request, Response, Date, Set, createClient: () => clientCount++ ? caller : admin, Deno: { env: { get: () => 'test' }, serve() {} } };
    vm.createContext(context);
    vm.runInContext(stripTypeScriptTypes(source), context);
    const response = await context.handleRequest(new Request('https://example.invalid', {
        method: 'POST', headers: { authorization: 'Bearer test', 'content-type': 'application/json', origin: 'https://graceconnect.love' }, body: JSON.stringify({ user_id: target.id }),
    }));
    return { response, body: await response.json(), calls };
}

test('backend denies unauthenticated users, ordinary roles, and support recovery of developers', async () => {
    for (const [options, status] of [[{ authenticated: false }, 401], [{ role: 'billing_support' }, 403], [{ role: 'support_developer', targetDeveloper: true }, 403]]) {
        const result = await endpoint(options);
        assert.equal(result.response.status, status);
        assert.equal(result.calls.some(([name]) => name === 'generate'), false);
    }
});

test('authorized issue uses recovery API without putting credentials in the audit record', async () => {
    const result = await endpoint({ role: 'support_developer' });
    assert.equal(result.response.status, 200);
    assert.equal(result.body.temporary_password, 'GC-secret-test-token');
    assert.equal(result.response.headers.get('cache-control'), 'no-store');
    const audit = result.calls.find(([name]) => name === 'log_developer_action');
    assert.doesNotMatch(JSON.stringify(audit), /secret-test-token/);
    const failure = await endpoint({ auditFailure: true });
    assert.equal(failure.response.status, 503);
    assert.equal(failure.calls.some(([name]) => name === 'generate'), false);
});
