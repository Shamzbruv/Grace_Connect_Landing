document.addEventListener('DOMContentLoaded', () => {
    const client = window.gcSupabase;
    if (!client) return;

    const authPanel = document.getElementById('subscriptionAuthPanel');
    const workspace = document.getElementById('subscriptionWorkspace');
    const signOutButton = document.getElementById('subscriptionSignOut');
    const signInForm = document.getElementById('subscriptionSignInForm');
    const requestForm = document.getElementById('subscriptionRequestForm');
    const authMessage = document.getElementById('subscriptionAuthMessage');
    const requestMessage = document.getElementById('subscriptionRequestMessageOutput');
    let management = null;

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
        const context = error?.context;
        if (context && typeof context.clone === 'function') {
            try {
                const payload = await context.clone().json();
                if (payload?.error) return payload.error;
                if (payload?.message) return payload.message;
            } catch (_) {}
        }
        return error?.message || 'Request failed.';
    };

    const formatPrice = (tier) => {
        if (!tier || tier.customQuote === true) return 'Custom quote';
        const usd = Number(tier.monthlyUsd || 0).toLocaleString('en-US');
        const jmd = Number(tier.monthlyJmd || 0).toLocaleString('en-US');
        return `US$${usd} (J$${jmd}) / month`;
    };

    const requestIntent = (context) => {
        if (['new_subscription', 'change_plan', 'enterprise_quote'].includes(context?.recommendedIntent)) {
            return context.recommendedIntent;
        }
        if (context?.calculatedTier?.tierCode === 'enterprise_1001_plus') {
            return 'enterprise_quote';
        }
        return context?.hasCurrentSubscription ? 'change_plan' : 'new_subscription';
    };

    const intentCopy = {
        new_subscription: {
            label: 'New subscription / reactivation request',
            description: 'The finance team will review this new or returning plan request. No subscription starts from this form.'
        },
        change_plan: {
            label: 'Plan review / change request',
            description: 'The finance team will review the verified member tier and existing subscription before any change is recorded.'
        },
        enterprise_quote: {
            label: 'Enterprise custom-quote request',
            description: 'The finance team will review your 1,001+ member requirements and contact you with a custom quote.'
        }
    };

    const renderHistory = (requests) => {
        const container = document.getElementById('subscriptionRequestHistory');
        if (!container) return;
        container.replaceChildren();
        const items = Array.isArray(requests) ? requests : [];
        if (!items.length) {
            const empty = document.createElement('p');
            empty.className = 'subscription-history-empty';
            empty.textContent = 'No subscription requests have been submitted for this church yet.';
            container.appendChild(empty);
            return;
        }
        items.slice(0, 8).forEach((request) => {
            const card = document.createElement('article');
            const top = document.createElement('div');
            const title = document.createElement('strong');
            const status = document.createElement('span');
            const meta = document.createElement('small');
            title.textContent = String(request.requestType || 'request').replaceAll('_', ' ');
            status.textContent = String(request.status || 'pending').replaceAll('_', ' ');
            meta.textContent = `${request.requestedTierCode || 'Tier pending'} · ${new Date(request.createdAt).toLocaleDateString()}`;
            top.append(title, status);
            card.append(top, meta);
            container.appendChild(card);
        });
    };

    const renderManagement = (context, session) => {
        management = context;
        const tier = context.calculatedTier || {};
        document.getElementById('subscriptionChurchName').textContent = context.churchName || 'Approved church';
        document.getElementById('subscriptionMemberCount').textContent = Number(context.memberCount || 0).toLocaleString('en-US');
        document.getElementById('subscriptionTierLabel').textContent = tier.label || 'Tier unavailable';
        document.getElementById('subscriptionTierPrice').textContent = formatPrice(tier);

        const intent = requestIntent(context);
        const copy = intentCopy[intent];
        document.getElementById('subscriptionIntent').value = intent;
        document.getElementById('subscriptionIntentLabel').textContent = copy.label;
        document.getElementById('subscriptionIntentDescription').textContent = copy.description;
        const contactEmail = document.getElementById('subscriptionContactEmail');
        if (contactEmail && !contactEmail.value) contactEmail.value = session?.user?.email || '';

        document.querySelectorAll('#subscriptionTierTable [data-tier]').forEach((row) => {
            row.classList.toggle('is-current-tier', row.dataset.tier === tier.tierCode);
        });
        renderHistory(context.requests);
    };

    const loadManagement = async (session) => {
        setMessage(authMessage, 'Verifying your approved church role…');
        const { data, error } = await client.functions.invoke('submit-web-subscription-request', {
            body: { action: 'context' }
        });
        const context = data?.context;
        if (error || data?.ok !== true || context?.canManage !== true) {
            authPanel.hidden = false;
            workspace.hidden = true;
            signOutButton.hidden = false;
            setMessage(
                authMessage,
                error ? await functionErrorMessage(error) : data?.error || 'This account is not an authorised subscription manager for an approved church.',
                'error'
            );
            return;
        }
        authPanel.hidden = true;
        workspace.hidden = false;
        signOutButton.hidden = false;
        setMessage(authMessage, '');
        renderManagement(context, session);
    };

    const showSignedOut = () => {
        management = null;
        authPanel.hidden = false;
        workspace.hidden = true;
        signOutButton.hidden = true;
        requestForm?.reset();
    };

    signInForm?.addEventListener('submit', async (event) => {
        event.preventDefault();
        const button = document.getElementById('subscriptionLoginButton');
        setButtonBusy(button, true, 'Verifying…', 'Verify my access');
        setMessage(authMessage, '');
        try {
            const email = document.getElementById('subscriptionLoginEmail').value.trim();
            const password = document.getElementById('subscriptionLoginPassword').value;
            const { data, error } = await client.auth.signInWithPassword({ email, password });
            if (error) throw error;
            await loadManagement(data.session);
            document.getElementById('subscriptionLoginPassword').value = '';
        } catch (error) {
            setMessage(authMessage, error?.message || 'Sign-in failed.', 'error');
        } finally {
            setButtonBusy(button, false, 'Verifying…', 'Verify my access');
        }
    });

    signOutButton?.addEventListener('click', async () => {
        await client.auth.signOut();
        showSignedOut();
        setMessage(authMessage, 'Signed out.', 'success');
    });

    requestForm?.addEventListener('submit', async (event) => {
        event.preventDefault();
        if (!management) return;
        const button = document.getElementById('subscriptionSubmitButton');
        setButtonBusy(button, true, 'Sending securely…', 'Send request for review');
        setMessage(requestMessage, '');
        try {
            const payload = {
                intent: document.getElementById('subscriptionIntent').value,
                contactName: document.getElementById('subscriptionContactName').value.trim(),
                contactEmail: document.getElementById('subscriptionContactEmail').value.trim(),
                contactPhone: document.getElementById('subscriptionContactPhone').value.trim(),
                message: document.getElementById('subscriptionRequestMessage').value.trim(),
                termsAccepted: document.getElementById('subscriptionTermsAccepted').checked
            };
            const { data, error } = await client.functions.invoke('submit-web-subscription-request', {
                body: payload
            });
            if (error) throw new Error(await functionErrorMessage(error));
            if (!data?.ok || data?.requestOnly !== true) {
                throw new Error(data?.error || 'The request could not be verified.');
            }
            setMessage(
                requestMessage,
                data.notice || 'Request received. Nothing was charged, activated, enrolled, or invoiced.',
                'success'
            );
            document.getElementById('subscriptionTermsAccepted').checked = false;
            const { data: refreshed, error: refreshError } = await client.functions.invoke('submit-web-subscription-request', {
                body: { action: 'context' }
            });
            if (!refreshError && refreshed?.context) {
                renderManagement(refreshed.context, (await client.auth.getSession()).data.session);
            }
        } catch (error) {
            setMessage(requestMessage, error?.message || 'Request failed.', 'error');
        } finally {
            setButtonBusy(button, false, 'Sending securely…', 'Send request for review');
        }
    });

    client.auth.getSession().then(({ data }) => {
        if (data.session) {
            loadManagement(data.session).catch((error) => {
                setMessage(authMessage, error?.message || 'Church access could not be verified.', 'error');
            });
        } else {
            showSignedOut();
        }
    });

    // Supabase restores persisted sessions and completes approved web auth
    // redirects before emitting these events. Work is deferred out of the auth
    // callback to avoid competing with the SDK's session lock.
    client.auth.onAuthStateChange((event, session) => {
        window.setTimeout(() => {
            if (event === 'SIGNED_OUT' || !session) {
                showSignedOut();
            } else if (event === 'SIGNED_IN' && workspace.hidden) {
                loadManagement(session).catch((error) => {
                    setMessage(authMessage, error?.message || 'Church access could not be verified.', 'error');
                });
            }
        }, 0);
    });
});
