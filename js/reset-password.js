document.addEventListener('DOMContentLoaded', async () => {
    const $ = (id) => document.getElementById(id);
    const query = new URLSearchParams(location.search);
    const fragment = new URLSearchParams(location.hash.slice(1));
    const tokenHash = query.get('token_hash') || fragment.get('token_hash');
    const type = query.get('type') || fragment.get('type');
    const accessToken = fragment.get('access_token');
    const refreshToken = fragment.get('refresh_token');
    const linkError = query.get('error') || fragment.get('error');
    // Do not leave recovery credentials in history, referrers, or shared auth storage.
    history.replaceState(null, '', '/reset-password.html');
    let client;
    let recoveryReady = false;
    let temporaryMode = false;
    const message = (text, kind = '') => {
        $('resetMessage').textContent = text;
        $('resetMessage').className = kind ? `reset-${kind}` : '';
    };
    const alternatives = () => {
        $('verifyRecoveryForm').hidden = true;
        $('newPasswordForm').hidden = true;
        $('recoveryAlternatives').hidden = false;
    };
    const ready = (session) => {
        if (!session?.user) throw new Error('A valid recovery session is required. Request a new reset link.');
        recoveryReady = true;
        $('verifyRecoveryForm').hidden = true;
        $('recoveryAlternatives').hidden = true;
        $('newPasswordForm').hidden = false;
        message(`Choose a new password for ${session.user.email || 'your account'}.`);
        $('newPassword').focus();
    };
    try {
        client = window.supabase.createClient(
            'https://nimgsgnkcvddomrgkawb.supabase.co',
            'sb_publishable_-lsEclVqaNPAlO4h7z3vtw_Q8xZY3cN',
            { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false, storageKey: 'gc-password-recovery' } },
        );
        if (linkError) throw new Error('This recovery link has expired or was already used. Request a new reset link below.');
        if (type === 'recovery' && accessToken && refreshToken) {
            const { data, error } = await client.auth.setSession({ access_token: accessToken, refresh_token: refreshToken });
            if (error) throw error;
            ready(data.session);
        } else if (type === 'recovery' && tokenHash) {
            // Deliberate click prevents email link scanners from consuming a one-use token.
            $('verifyRecoveryForm').hidden = false;
            message('Your secure password-reset page is ready.');
        } else {
            alternatives();
            message(query.has('code') ? 'Please request a new reset email to continue in this browser.' : 'Request a reset link or use a temporary password from platform support.');
        }
    } catch (error) {
        alternatives();
        message(client ? 'This recovery link is invalid, expired, or already used. Please request a new reset link.' : 'The secure sign-in service could not load. Check your connection and reload this page.', 'error');
    }

    $('useTemporaryPassword').addEventListener('click', () => {
        temporaryMode = true;
        $('recoveryAlternatives').hidden = true;
        $('temporaryPasswordField').hidden = false;
        $('temporaryPassword').required = true;
        $('verifyRecoveryHelp').textContent = 'Paste the temporary recovery password provided by platform support.';
        $('verifyRecoveryForm').hidden = false;
        message('Verify your temporary password, then choose your own new password.');
        $('temporaryPassword').focus();
    });
    $('verifyRecoveryForm').addEventListener('submit', async (event) => {
        event.preventDefault();
        const button = $('verifyRecoveryButton');
        button.disabled = true;
        try {
            if (!client) throw new Error('Reload the page to reconnect to the sign-in service.');
            const recoveryToken = temporaryMode ? $('temporaryPassword').value.trim().replace(/^GC-/, '') : tokenHash;
            if (!recoveryToken) throw new Error('Enter your temporary recovery password.');
            const { data, error } = await client.auth.verifyOtp({ token_hash: recoveryToken, type: 'recovery' });
            if (error) throw new Error('This link or temporary password is invalid, expired, or already used. Request a new one.');
            $('temporaryPassword').value = '';
            ready(data.session);
        } catch (error) {
            message(error.message || 'Unable to verify recovery. Please request a new link.', 'error');
            alternatives();
        } finally { button.disabled = false; }
    });
    $('newPasswordForm').addEventListener('submit', async (event) => {
        event.preventDefault();
        const password = $('newPassword').value;
        if (password !== $('confirmPassword').value) return message('Your passwords do not match.', 'error');
        if (password.length < 8 || !/[a-z]/.test(password) || !/[A-Z]/.test(password) || !/[0-9]/.test(password) || !/[^A-Za-z0-9\s]/.test(password)) {
            return message('Use at least 8 characters with an uppercase letter, a lowercase letter, a number, and a symbol.', 'error');
        }
        const button = $('savePasswordButton');
        button.disabled = true;
        try {
            if (!recoveryReady) throw new Error('Verify a recovery link or temporary password first.');
            const { error } = await client.auth.updateUser({ password });
            if (error) throw error;
            recoveryReady = false;
            $('newPasswordForm').reset();
            $('newPasswordForm').hidden = true;
            $('resetComplete').hidden = false;
            message('Password changed successfully.', 'success');
            // Password is already saved; a cleanup failure must not suggest otherwise.
            await client.auth.signOut({ scope: 'global' }).catch(() => {});
        } catch (error) {
            message(error.message || 'Unable to save your password. Please try again.', 'error');
        } finally { button.disabled = false; }
    });
    $('requestRecoveryForm').addEventListener('submit', async (event) => {
        event.preventDefault();
        const button = event.currentTarget.querySelector('button');
        button.disabled = true;
        try {
            if (!client) throw new Error('Reload the page to reconnect to the sign-in service.');
            const { error } = await client.auth.resetPasswordForEmail($('recoveryEmail').value.trim(), { redirectTo: 'https://graceconnect.love/reset-password.html' });
            if (error) throw new Error('We could not send a reset email right now. Please wait a minute and try again, or contact platform support.');
            message('If this email has a Grace Connect account, a reset link will arrive shortly. Check your spam folder too.', 'success');
        } catch (error) { message(error.message, 'error'); }
        finally { button.disabled = false; }
    });
});
