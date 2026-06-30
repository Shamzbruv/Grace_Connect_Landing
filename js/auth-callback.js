document.addEventListener('DOMContentLoaded', async () => {
    const client = window.gcSupabase;
    const titleEl = document.getElementById('authCallbackTitle');
    const messageEl = document.getElementById('authCallbackMessage');
    const iconEl = document.getElementById('authCallbackIcon');
    const actionsEl = document.getElementById('authCallbackActions');
    const continueEl = document.getElementById('authCallbackContinue');

    const setState = (type, title, message, nextUrl) => {
        titleEl.textContent = title;
        messageEl.textContent = message;
        if (type === 'success') {
            iconEl.innerHTML = '<i class="fas fa-check"></i>';
        } else if (type === 'error') {
            iconEl.innerHTML = '<i class="fas fa-triangle-exclamation"></i>';
        }
        if (nextUrl) {
            continueEl.href = nextUrl;
            actionsEl.style.display = 'block';
        }
    };

    const safeNextUrl = () => {
        const params = new URLSearchParams(window.location.search);
        const rawNext = params.get('next') || 'index.html';
        try {
            const parsed = new URL(rawNext, window.location.origin);
            if (parsed.origin === window.location.origin) {
                return `${parsed.pathname}${parsed.search}${parsed.hash}`;
            }
        } catch (_) {}
        return 'index.html';
    };

    const allParams = () => {
        const query = new URLSearchParams(window.location.search);
        const fragment = new URLSearchParams(window.location.hash.replace(/^#/, ''));
        return { query, fragment };
    };

    try {
        if (!client) throw new Error('Supabase is not available on this page.');

        const nextUrl = safeNextUrl();
        const { query, fragment } = allParams();
        const errorDescription = query.get('error_description') ||
            fragment.get('error_description') ||
            query.get('error') ||
            fragment.get('error');
        if (errorDescription) throw new Error(errorDescription);

        const code = query.get('code');
        const tokenHash = query.get('token_hash') || fragment.get('token_hash');
        const token = query.get('token') || fragment.get('token');
        const type = query.get('type') || fragment.get('type') || 'signup';
        const accessToken = fragment.get('access_token');
        const refreshToken = fragment.get('refresh_token');

        if (code) {
            const { error } = await client.auth.exchangeCodeForSession(code);
            if (error) throw error;
        } else if (tokenHash) {
            const { error } = await client.auth.verifyOtp({
                token_hash: tokenHash,
                type,
            });
            if (error) throw error;
        } else if (token) {
            const { error } = await client.auth.verifyOtp({
                email: query.get('email') || fragment.get('email') || undefined,
                token,
                type,
            });
            if (error) throw error;
        } else if (accessToken && refreshToken) {
            const { error } = await client.auth.setSession({
                access_token: accessToken,
                refresh_token: refreshToken,
            });
            if (error) throw error;
        } else {
            const { data: { session } } = await client.auth.getSession();
            if (!session) throw new Error('This verification link is missing its confirmation token.');
        }

        setState(
            'success',
            'Email Verified',
            'Your email is confirmed. We are taking you back to finish the Grace Connect request.',
            nextUrl,
        );
        window.setTimeout(() => {
            window.location.replace(nextUrl);
        }, 1200);
    } catch (error) {
        setState(
            'error',
            'Verification Link Issue',
            error?.message || 'Grace Connect could not confirm this email link. Please request a new verification email.',
            'index.html',
        );
    }
});
