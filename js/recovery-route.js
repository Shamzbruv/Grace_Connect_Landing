// Run before the shared auth client can consume the URL or navigate away.
(() => {
    const query = new URLSearchParams(location.search);
    const fragment = new URLSearchParams(location.hash.slice(1));
    if (query.get('type') === 'recovery' || fragment.get('type') === 'recovery' ||
        query.has('error') || fragment.has('error')) {
        window.gcRecoveryRedirecting = true;
        location.replace('/reset-password.html' + location.search + location.hash);
    }
})();
