"""Opt-in live smoke test. Creates and deletes one synthetic account; sends no email.
Run: python test/recovery-live.py < /secure/path/to/pat
The PAT, service key, passwords and sessions are kept in process memory only.
"""
import json
import secrets
import subprocess
import sys

project = 'nimgsgnkcvddomrgkawb'
management = 'https://api.supabase.com/v1/projects/' + project
base = 'https://' + project + '.supabase.co'
pat = sys.stdin.read().strip()


def request(url, method='GET', body=None, bearer=None, key=None):
    config = ['url = ' + json.dumps(url), 'request = ' + json.dumps(method)]
    for name, value in [('Authorization', 'Bearer ' + bearer if bearer else None), ('apikey', key), ('Content-Type', 'application/json')]:
        if value:
            config.append('header = ' + json.dumps(name + ': ' + value))
    if body is not None:
        config.append('data = ' + json.dumps(json.dumps(body)))
    result = subprocess.run(['curl', '-sS', '--max-time', '30', '--config', '-', '-w', '\n%{http_code}'], input='\n'.join(config), capture_output=True, text=True)
    raw, status = result.stdout.rsplit('\n', 1)
    return int(status), json.loads(raw) if raw else {}


def ok(status, label):
    if not 200 <= status < 300:
        raise RuntimeError(label + ': HTTP ' + str(status))


status, keys = request(management + '/api-keys', bearer=pat)
ok(status, 'Read project keys')
service = next(k['api_key'] for k in keys if k['name'] == 'service_role')
anon = next(k['api_key'] for k in keys if k['name'] == 'anon')
email = 'gc-recovery-test-' + secrets.token_hex(8) + '@example.invalid'
old_password = 'Old!' + secrets.token_hex(18)
new_password = 'New!' + secrets.token_hex(18)
user_id = None
sessions = []
try:
    status, user = request(base + '/auth/v1/admin/users', 'POST', {'email': email, 'password': old_password, 'email_confirm': True}, bearer=service, key=service)
    ok(status, 'Create isolated test account')
    user_id = user['id']
    status, session = request(base + '/auth/v1/token?grant_type=password', 'POST', {'email': email, 'password': old_password}, key=anon)
    ok(status, 'Initial password sign-in')
    sessions.append(session['access_token'])
    status, _ = request(base + '/functions/v1/developer-password-recovery', 'POST', {'user_id': user_id}, bearer=session['access_token'], key=anon)
    assert status == 403, 'Ordinary account must not issue recovery passwords'
    print('PASS: live backend rejects an ordinary user')
    status, recovery = request(base + '/auth/v1/admin/generate_link', 'POST', {'type': 'recovery', 'email': email, 'redirect_to': 'https://graceconnect.love/reset-password.html'}, bearer=service, key=service)
    ok(status, 'Generate recovery without sending email')
    token_hash = recovery['hashed_token']
    status, recovered = request(base + '/auth/v1/verify', 'POST', {'token_hash': token_hash, 'type': 'recovery'}, key=anon)
    ok(status, 'Redeem temporary recovery credential')
    sessions.append(recovered['access_token'])
    status, _ = request(base + '/auth/v1/user', 'PUT', {'password': new_password}, bearer=recovered['access_token'], key=anon)
    ok(status, 'Save new password')
    status, _ = request(base + '/auth/v1/verify', 'POST', {'token_hash': token_hash, 'type': 'recovery'}, key=anon)
    assert status >= 400, 'Recovery credential must be single use'
    print('PASS: password reset succeeds and recovery credential cannot be reused')
    status, _ = request(base + '/auth/v1/token?grant_type=password', 'POST', {'email': email, 'password': old_password}, key=anon)
    assert status == 400, 'Old password must stop working'
    status, new_session = request(base + '/auth/v1/token?grant_type=password', 'POST', {'email': email, 'password': new_password}, key=anon)
    ok(status, 'New password sign-in')
    sessions.append(new_session['access_token'])
    print('PASS: old password rejected; new password signs into the existing Auth project')
finally:
    for access in sessions:
        request(base + '/auth/v1/logout?scope=global', 'POST', bearer=access, key=anon)
    if user_id:
        status, _ = request(base + '/auth/v1/admin/users/' + user_id, 'DELETE', bearer=service, key=service)
        ok(status, 'Delete isolated test account')
        print('PASS: isolated test account removed')
