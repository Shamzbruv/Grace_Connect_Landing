// Church subscription management.
//
// This is where the app's "Cancel plan" button lands. Everything shown here
// comes from the server: the page never decides what a church is paying or
// whether it may cancel, it only renders the answer and offers the action.

document.addEventListener('DOMContentLoaded', () => {
    const client = window.gcSupabase;
    if (!client) return;

    const authPanel = document.getElementById('manageAuthPanel');
    const workspace = document.getElementById('manageWorkspace');
    const signOutButton = document.getElementById('manageSignOut');
    const signInForm = document.getElementById('manageSignInForm');
    const cancelForm = document.getElementById('manageCancelForm');
    const cancelSection = document.getElementById('manageCancelSection');
    const cancelScheduled = document.getElementById('manageCancelScheduled');
    const noSubscription = document.getElementById('manageNoSubscription');
    const authMessage = document.getElementById('manageAuthMessage');
    const message = document.getElementById('manageMessage');
    const billingList = document.getElementById('manageBillingList');
    const history = document.getElementById('manageHistory');
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

    const formatDate = (value) => {
        if (!value) return '—';
        const date = new Date(value);
        if (Number.isNaN(date.getTime())) return '—';
        return date.toLocaleDateString('en-US', {
            year: 'numeric', month: 'long', day: 'numeric',
        });
    };

    const money = (value, currency) => {
        if (value === null || value === undefined) return null;
        const prefix = currency === 'JMD' ? 'J$' : 'US$';
        return `${prefix}${Number(value).toLocaleString('en-US')}`;
    };

    const statusLabel = (subscription) => {
        if (!subscription) return 'No subscription';
        if (subscription.cancellationEffectiveAt) return 'Ending';
        return {
            active: 'Active',
            trialing: 'Trial',
            grace_period: 'Grace period',
            past_due: 'Payment overdue',
            cancelled: 'Cancelled',
            inactive: 'Inactive',
        }[subscription.status] || subscription.status;
    };

    const sourceLabel = (source) => ({
        web_checkout: 'Paid online',
        developer_manual: 'Granted by Grace Connect',
        external_invoice: 'Invoiced directly',
        google_play: 'Google Play',
        system: 'System',
    }[source] || source || '—');

    const eventLabel = (type) => ({
        request_submitted: 'Request submitted',
        request_refreshed: 'Request updated',
        request_status_changed: 'Request status changed',
        activated: 'Subscription activated',
        renewed: 'Subscription renewed',
        trial_started: 'Trial started',
        payment_received: 'Payment received',
        marked_past_due: 'Marked overdue',
        cancelled: 'Cancellation scheduled',
        note: 'Note',
    }[type] || type);

    const callFunction = async (body) => {
        const { data, error } = await client.functions.invoke(
            'manage-church-subscription',
            { body },
        );
        if (error) throw new Error(await functionErrorMessage(error));
        if (data?.error) throw new Error(data.error);
        return data;
    };

    const renderBillingRows = (subscription) => {
        const currency = subscription?.billingCurrency
            || (subscription?.monthlyJmd && !subscription?.monthlyUsd ? 'JMD' : 'USD');
        const amount = currency === 'JMD'
            ? money(subscription?.monthlyJmd, 'JMD')
            : money(subscription?.monthlyUsd, 'USD');

        const rows = [
            ['Plan', subscription?.planCode || '—'],
            ['Billing status', subscription?.billingState || '—'],
            ['How it was set up', sourceLabel(subscription?.source)],
            ['Monthly amount', amount || 'Not set'],
            ['Current period started', formatDate(subscription?.currentPeriodStart)],
            ['Paid through', formatDate(subscription?.currentPeriodEnd)],
            [
                'Renews automatically',
                subscription?.autoRenews ? 'Yes' : 'No',
            ],
            [
                'Next charge',
                subscription?.nextChargeAt
                    ? formatDate(subscription.nextChargeAt)
                    : 'None scheduled',
            ],
        ];

        billingList.innerHTML = rows.map(([term, value]) => `
            <div class="manage-billing-row">
                <dt>${term}</dt>
                <dd>${String(value)}</dd>
            </div>
        `).join('');
    };

    const renderHistory = (events) => {
        if (!events || events.length === 0) {
            history.innerHTML = '<p class="manage-empty-line">No billing activity recorded yet.</p>';
            return;
        }
        history.innerHTML = events.map((event) => `
            <article class="subscription-request-history-item">
                <strong>${eventLabel(event.eventType)}</strong>
                <span>${formatDate(event.createdAt)}</span>
            </article>
        `).join('');
    };

    const render = () => {
        const subscription = context?.subscription;

        document.getElementById('manageChurchName').textContent =
            context?.churchName || '—';
        document.getElementById('manageStatus').textContent =
            statusLabel(subscription);

        const currency = subscription?.billingCurrency || 'USD';
        document.getElementById('manageAmount').textContent = (
            currency === 'JMD'
                ? money(subscription?.monthlyJmd, 'JMD')
                : money(subscription?.monthlyUsd, 'USD')
        ) || '—';
        document.getElementById('managePaidThrough').textContent =
            formatDate(subscription?.currentPeriodEnd);

        renderHistory(context?.recentEvents);

        if (!subscription) {
            billingList.innerHTML = '';
            noSubscription.hidden = false;
            cancelSection.hidden = true;
            cancelScheduled.hidden = true;
            return;
        }

        noSubscription.hidden = true;
        renderBillingRows(subscription);

        if (subscription.cancellationEffectiveAt) {
            cancelSection.hidden = true;
            cancelScheduled.hidden = false;
            cancelScheduled.innerHTML = `
                <i class="fas fa-circle-check" aria-hidden="true"></i>
                <div>
                    <strong>This subscription is scheduled to end.</strong>
                    <span>Your church keeps full access until ${formatDate(subscription.cancellationEffectiveAt)}. Nothing further will be charged. To stay on Grace Connect, <a href="subscribe.html">start a new plan</a> or <a href="subscription-request.html">contact the finance team</a>.</span>
                </div>
            `;
            return;
        }

        cancelScheduled.hidden = true;
        cancelSection.hidden = subscription.canCancelOnline !== true;
        document.getElementById('manageCancelCopy').textContent =
            `Your church keeps full access until ${formatDate(subscription.currentPeriodEnd)}. After that date the plan simply stops; nothing else is charged.`;
    };

    const showWorkspace = async () => {
        try {
            const data = await callFunction({ action: 'context' });
            context = data.context;
            authPanel.hidden = true;
            workspace.hidden = false;
            signOutButton.hidden = false;
            render();
            setMessage(message, '');
        } catch (error) {
            authPanel.hidden = false;
            workspace.hidden = true;
            setMessage(authMessage, error.message, 'error');
        }
    };

    signInForm?.addEventListener('submit', async (event) => {
        event.preventDefault();
        const button = document.getElementById('manageLoginButton');
        setMessage(authMessage, '');
        setButtonBusy(button, true, 'Signing in…', 'Sign in');
        try {
            const { error } = await client.auth.signInWithPassword({
                email: document.getElementById('manageLoginEmail').value.trim(),
                password: document.getElementById('manageLoginPassword').value,
            });
            if (error) throw error;
            document.getElementById('manageLoginPassword').value = '';
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

    cancelForm?.addEventListener('submit', async (event) => {
        event.preventDefault();
        if (!document.getElementById('manageCancelConfirm').checked) {
            setMessage(message, 'Please confirm you understand before cancelling.', 'error');
            return;
        }
        const button = document.getElementById('manageCancelButton');
        setMessage(message, '');
        setButtonBusy(button, true, 'Cancelling…', 'Cancel my subscription');
        try {
            const data = await callFunction({
                action: 'cancel',
                reason: document.getElementById('manageCancelReason').value.trim(),
            });
            context = data.context;
            render();
            setMessage(
                message,
                data.alreadyScheduled
                    ? `This subscription was already scheduled to end on ${formatDate(data.effectiveAt)}.`
                    : `Cancelled. Your church keeps access until ${formatDate(data.effectiveAt)}.`,
                'success',
            );
        } catch (error) {
            setMessage(message, error.message, 'error');
        } finally {
            setButtonBusy(button, false, 'Cancelling…', 'Cancel my subscription');
        }
    });

    client.auth.getSession().then(({ data }) => {
        if (data?.session) showWorkspace();
    });
});
