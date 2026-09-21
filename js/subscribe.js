// Church subscription checkout.
//
// Nothing about the price is decided here. The page asks the server what this
// church owes, shows it, and hands the member to the payment provider with a
// server-signed amount. A number typed into this file's variables, or into the
// browser console, changes nothing that gets charged.

document.addEventListener('DOMContentLoaded', () => {
    const client = window.gcSupabase;
    if (!client) return;

    const authPanel = document.getElementById('subscribeAuthPanel');
    const workspace = document.getElementById('subscribeWorkspace');
    const signOutButton = document.getElementById('subscribeSignOut');
    const signInForm = document.getElementById('subscribeSignInForm');
    const payForm = document.getElementById('subscribeForm');
    const authMessage = document.getElementById('subscribeAuthMessage');
    const payMessage = document.getElementById('subscribeMessage');
    const payButton = document.getElementById('subscribePayButton');
    const existingNotice = document.getElementById('subscribeExistingNotice');
    let context = null;

    const setMessage = (element, text, type = '') => {
        if (!element) return;
        element.textContent = text;
        element.className = `subscription-form-message ${type}`.trim();
    };

    const setButtonBusy = (button, busy, busyLabel, readyLabel) => {
        if (!button) return;
        button.disabled = busy;
        button.textContent = busy ? busyLabel : readyLabel;
    };

    const functionErrorMessage = async (error) => {
        const ctx = error?.context;
        if (ctx && typeof ctx.clone === 'function') {
            try {
                const payload = await ctx.clone().json();
                if (payload?.error) return payload.error;
                if (payload?.message) return payload.message;
            } catch (_) {}
        }
        return error?.message || 'Request failed.';
    };

    const money = (value, currency) => {
        if (value === null || value === undefined) return '—';
        const prefix = currency === 'JMD' ? 'J$' : 'US$';
        return `${prefix}${Number(value).toLocaleString('en-US')}`;
    };

    const formatDate = (value) => {
        if (!value) return '—';
        const date = new Date(value);
        if (Number.isNaN(date.getTime())) return '—';
        return date.toLocaleDateString('en-US', {
            year: 'numeric', month: 'long', day: 'numeric',
        });
    };

    const callFunction = async (body) => {
        const { data, error } = await client.functions.invoke(
            'manage-church-subscription',
            { body },
        );
        if (error) throw new Error(await functionErrorMessage(error));
        if (data?.error) throw new Error(data.error);
        return data;
    };

    const renderContext = () => {
        const tier = context?.calculatedTier || {};
        const subscription = context?.subscription;

        document.getElementById('subscribeChurchName').textContent =
            context?.churchName || '—';
        document.getElementById('subscribeMemberCount').textContent =
            Number(context?.memberCount ?? 0).toLocaleString('en-US');
        document.getElementById('subscribeTierLabel').textContent =
            tier.label || '—';

        const isEnterprise = tier.customQuote === true;
        document.getElementById('subscribeTierPrice').textContent = isEnterprise
            ? 'Custom quote'
            : `${money(tier.monthlyUsd, 'USD')} / month`;
        document.getElementById('subscribeUsdAmount').textContent = isEnterprise
            ? 'Quoted individually'
            : `${money(tier.monthlyUsd, 'USD')} per month`;
        document.getElementById('subscribeJmdAmount').textContent = isEnterprise
            ? 'Quoted individually'
            : `${money(tier.monthlyJmd, 'JMD')} per month`;

        if (isEnterprise) {
            // There is no published price to charge, so offering a pay button
            // would only produce a server error at the last step.
            setMessage(
                payMessage,
                'Churches over 1,000 members are priced individually. Please request an enterprise quote instead.',
                'notice',
            );
            if (payButton) payButton.disabled = true;
            return;
        }

        if (context.checkoutReady !== true) {
            setMessage(payMessage, 'Online payment is not available yet. Please contact Grace Connect billing for help with your plan.', 'notice');
            if (payButton) payButton.disabled = true;
        }

        if (subscription && subscription.status === 'active') {
            existingNotice.hidden = false;
            existingNotice.textContent = subscription.cancellationEffectiveAt
                ? `This church has a pending cancellation and access paid through ${formatDate(subscription.currentPeriodEnd)}. Another payment adds paid time; it does not withdraw the cancellation request.`
                : `This church already has an active plan paid through ${formatDate(subscription.currentPeriodEnd)}.`;
        } else {
            existingNotice.hidden = true;
        }
    };

    const showWorkspace = async () => {
        setButtonBusy(payButton, true, 'Loading…', 'Continue to secure payment');
        try {
            const data = await callFunction({ action: 'context' });
            context = data.context;
            authPanel.hidden = true;
            workspace.hidden = false;
            signOutButton.hidden = false;
            renderContext();
            if (!context?.calculatedTier?.customQuote && context?.checkoutReady === true) setMessage(payMessage, '');
        } catch (error) {
            // A signed-in member who is not a church leader lands here. They
            // are authenticated, so the sign-in form would be misleading.
            authPanel.hidden = false;
            workspace.hidden = true;
            setMessage(authMessage, error.message, 'error');
        } finally {
            setButtonBusy(payButton, false, 'Loading…', 'Continue to secure payment');
            if (payButton) payButton.disabled = context?.checkoutReady !== true || context?.calculatedTier?.customQuote === true;
        }
    };

    signInForm?.addEventListener('submit', async (event) => {
        event.preventDefault();
        const button = document.getElementById('subscribeLoginButton');
        setMessage(authMessage, '');
        setButtonBusy(button, true, 'Signing in…', 'Sign in');
        try {
            const { error } = await client.auth.signInWithPassword({
                email: document.getElementById('subscribeLoginEmail').value.trim(),
                password: document.getElementById('subscribeLoginPassword').value,
            });
            if (error) throw error;
            document.getElementById('subscribeLoginPassword').value = '';
            await showWorkspace();
        } catch (error) {
            setMessage(authMessage, error.message || 'Sign in failed.', 'error');
        } finally {
            setButtonBusy(button, false, 'Signing in…', 'Sign in');
        }
    });

    signOutButton?.addEventListener('click', async () => {
        await client.auth.signOut();
        context = null;
        workspace.hidden = true;
        authPanel.hidden = false;
        signOutButton.hidden = true;
        setMessage(authMessage, 'Signed out.', 'success');
    });

    payForm?.addEventListener('submit', async (event) => {
        event.preventDefault();
        if (payButton?.disabled || context?.checkoutReady !== true || context?.calculatedTier?.customQuote) return;
        if (!document.getElementById('subscribeTermsAccepted').checked) {
            setMessage(payMessage, 'Please confirm the terms to continue.', 'error');
            return;
        }
        const currency = (
            payForm.querySelector('input[name="subscribeCurrency"]:checked')?.value
            || 'USD'
        );
        const tierCode = context?.calculatedTier?.tierCode;
        if (!tierCode) {
            setMessage(payMessage, 'Your plan could not be determined. Please reload.', 'error');
            return;
        }

        setMessage(payMessage, '');
        setButtonBusy(payButton, true, 'Preparing secure payment…', 'Continue to secure payment');
        try {
            const data = await callFunction({
                action: 'checkout',
                tierCode,
                currency,
                returnUrl: `${window.location.origin}/manage-subscription.html`,
            });
            if (!data?.checkoutUrl) {
                throw new Error('The payment page could not be prepared.');
            }
            setMessage(payMessage, 'Redirecting you to the secure payment page…', 'success');
            window.location.assign(data.checkoutUrl);
        } catch (error) {
            setMessage(payMessage, error.message, 'error');
            setButtonBusy(payButton, false, 'Preparing secure payment…', 'Continue to secure payment');
        }
    });

    // A leader arriving from the app is often already signed in on this
    // browser; sending them back through a login form they do not need is
    // friction for no benefit.
    client.auth.getSession().then(({ data }) => {
        if (data?.session) showWorkspace();
    });
});
