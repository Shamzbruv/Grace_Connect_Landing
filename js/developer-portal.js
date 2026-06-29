document.addEventListener('DOMContentLoaded', () => {
    const client = window.gcSupabase;
    const isLoginPage = Boolean(document.getElementById('developerLoginForm'));
    const isPortalPage = Boolean(document.querySelector('.developer-portal-page'));
    const state = {
        session: null,
        activeView: 'overview'
    };

    const escapeHtml = (value) => String(value ?? '')
        .replaceAll('&', '&amp;')
        .replaceAll('<', '&lt;')
        .replaceAll('>', '&gt;')
        .replaceAll('"', '&quot;')
        .replaceAll("'", '&#039;');

    const formatDate = (value) => {
        if (!value) return 'Not recorded';
        const date = new Date(value);
        if (Number.isNaN(date.getTime())) return 'Not recorded';
        return date.toLocaleString([], {
            year: 'numeric',
            month: 'short',
            day: 'numeric',
            hour: 'numeric',
            minute: '2-digit'
        });
    };

    const showMessage = (id, message, type = 'error') => {
        const el = document.getElementById(id);
        if (!el) return;
        el.textContent = message;
        el.className = `message ${type}`;
        el.style.display = message ? 'block' : 'none';
    };

    const rpc = async (fn, params = {}) => {
        const { data, error } = await client.rpc(fn, params);
        if (error) throw error;
        return data;
    };

    const verifyDeveloperSession = async () => {
        const { data: sessionResult } = await client.auth.getSession();
        if (!sessionResult?.session) {
            throw new Error('Please sign in to continue.');
        }
        state.session = await rpc('developer_get_session');
        return state.session;
    };

    if (isLoginPage) {
        const form = document.getElementById('developerLoginForm');
        const button = document.getElementById('developerLoginBtn');

        client.auth.getSession().then(async ({ data }) => {
            if (!data?.session) return;
            try {
                await verifyDeveloperSession();
                window.location.href = 'index.html';
            } catch (_) {
                await client.auth.signOut();
            }
        });

        form.addEventListener('submit', async (event) => {
            event.preventDefault();
            button.disabled = true;
            button.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Verifying...';
            showMessage('developerLoginMessage', '');

            try {
                const email = document.getElementById('developerEmail').value.trim();
                const password = document.getElementById('developerPassword').value;
                const { error } = await client.auth.signInWithPassword({ email, password });
                if (error) throw error;

                await verifyDeveloperSession();
                window.location.href = 'index.html';
            } catch (error) {
                await client.auth.signOut();
                showMessage('developerLoginMessage', error.message || 'Developer access denied.', 'error');
                button.disabled = false;
                button.textContent = 'Sign In';
            }
        });
    }

    if (!isPortalPage) return;

    const setLoading = (id, label = 'Loading...') => {
        const el = document.getElementById(id);
        if (!el) return;
        el.innerHTML = `<div class="developer-empty"><i class="fas fa-circle-notch fa-spin"></i><span>${escapeHtml(label)}</span></div>`;
    };

    const renderEmpty = (id, label) => {
        const el = document.getElementById(id);
        if (!el) return;
        el.innerHTML = `<div class="developer-empty"><i class="fas fa-inbox"></i><span>${escapeHtml(label)}</span></div>`;
    };

    const renderSessionPill = () => {
        const el = document.getElementById('developerSessionPill');
        if (!el || !state.session) return;
        el.innerHTML = `
            <i class="fas fa-shield-halved"></i>
            <span>${escapeHtml(state.session.email)} · ${escapeHtml(state.session.developer_role)}</span>
        `;
    };

    const renderTable = (id, headers, rows, emptyLabel) => {
        const el = document.getElementById(id);
        if (!el) return;
        if (!rows.length) {
            renderEmpty(id, emptyLabel);
            return;
        }

        el.innerHTML = `
            <table class="developer-table">
                <thead>
                    <tr>${headers.map((header) => `<th>${escapeHtml(header)}</th>`).join('')}</tr>
                </thead>
                <tbody>${rows.join('')}</tbody>
            </table>
        `;
    };

    const loadOverview = async () => {
        setLoading('dashboardStats', 'Loading dashboard');
        setLoading('recentSignupsList');
        setLoading('missingSetupList');
        const data = await rpc('developer_get_dashboard');
        const stats = [
            ['Total Users', data.total_users, 'fa-users'],
            ['Pending Members', data.pending_members, 'fa-user-clock'],
            ['Total Churches', data.total_churches, 'fa-church'],
            ['Approved Churches', data.approved_churches, 'fa-circle-check'],
            ['Pending Churches', data.pending_churches, 'fa-hourglass-half'],
            ['Suspended Churches', data.suspended_churches, 'fa-ban'],
            ['Subscribed Churches', data.subscribed_churches, 'fa-money-check-dollar'],
            ['No Active Subscription', data.unsubscribed_churches, 'fa-lock'],
            ['Developer Accounts', data.developer_accounts, 'fa-user-shield']
        ];

        document.getElementById('dashboardStats').innerHTML = stats.map(([label, value, icon]) => `
            <div class="developer-stat">
                <i class="fas ${icon}"></i>
                <span>${escapeHtml(label)}</span>
                <strong>${escapeHtml(value)}</strong>
            </div>
        `).join('');

        const recent = data.recent_signups || [];
        document.getElementById('recentSignupsList').innerHTML = recent.length
            ? recent.map((user) => `
                <div class="developer-list-item">
                    <strong>${escapeHtml(user.fullName || user.email)}</strong>
                    <span>${escapeHtml(user.email)} · ${escapeHtml(user.approvalStatus || 'unknown')}</span>
                    <small>${formatDate(user.joinDate)}</small>
                </div>
            `).join('')
            : '<div class="developer-empty"><i class="fas fa-inbox"></i><span>No recent signups.</span></div>';

        const missing = data.churches_missing_setup || [];
        document.getElementById('missingSetupList').innerHTML = missing.length
            ? missing.map((church) => `
                <div class="developer-list-item">
                    <strong>${escapeHtml(church.name || church.placeId || church.id)}</strong>
                    <span>${escapeHtml(church.address || 'Address missing')}</span>
                    <small>${escapeHtml(church.ownerUserId ? 'Owner set' : 'Owner missing')}</small>
                </div>
            `).join('')
            : '<div class="developer-empty"><i class="fas fa-circle-check"></i><span>No setup gaps found.</span></div>';
    };

    const statusBadge = (status) => {
        const normalized = String(status || 'unknown').toLowerCase();
        return `<span class="developer-status developer-status-${escapeHtml(normalized)}">${escapeHtml(normalized)}</span>`;
    };

    const subscriptionBadge = (church) => {
        if (church.subscription_active) {
            const until = church.subscription_active_until
                ? `until ${formatDate(church.subscription_active_until)}`
                : 'indefinite';
            return `
                <span class="developer-status developer-status-active">active</span>
                <small>${escapeHtml(church.subscription_plan_code || 'manual')} · ${escapeHtml(until)}</small>
            `;
        }
        return `
            <span class="developer-status developer-status-inactive">inactive</span>
            <small>Feed only</small>
        `;
    };

    const loadChurches = async () => {
        setLoading('churchList', 'Loading churches');
        const status = document.getElementById('churchStatusFilter')?.value || '';
        const search = document.getElementById('churchSearchFilter')?.value || '';
        const churches = await rpc('developer_list_churches', { p_status: status || null, p_search: search || null });

        renderTable('churchList', ['Church', 'Contact', 'Status', 'Subscription', 'Setup', 'Actions'], churches.map((church) => `
            <tr>
                <td>
                    <strong>${escapeHtml(church.name)}</strong>
                    <span>${escapeHtml(church.address || 'No address')}</span>
                    <small>${escapeHtml(church.denomination || 'No denomination')}</small>
                </td>
                <td>
                    <strong>${escapeHtml(church.pastor_or_admin_name || 'No contact')}</strong>
                    <span>${escapeHtml(church.pastor_or_admin_email || '')}</span>
                    <small>${escapeHtml(church.pastor_or_admin_phone || '')}</small>
                </td>
                <td>${statusBadge(church.approval_status || church.status)}<small>Public: ${church.public_visibility ? 'yes' : 'no'}</small></td>
                <td>${subscriptionBadge(church)}</td>
                <td><span>${escapeHtml(church.member_count || 0)} members</span><small>Created ${formatDate(church.createdAt)}</small></td>
                <td>
                    <div class="developer-action-row">
                        <button class="developer-icon-btn" title="View Details" data-action="view-church" data-church='${escapeHtml(JSON.stringify(church))}'><i class="fas fa-eye"></i></button>
                        ${church.record_type === 'church' ? `
                            <button class="developer-icon-btn" title="Grant 1 free month" data-action="grant-subscription" data-id="${escapeHtml(church.placeId || church.id)}" data-months="1"><i class="fas fa-calendar-plus"></i></button>
                            <button class="developer-icon-btn danger" title="Turn subscription off" data-action="clear-subscription" data-id="${escapeHtml(church.placeId || church.id)}"><i class="fas fa-lock"></i></button>
                        ` : ''}
                    </div>
                </td>
            </tr>
        `), 'No churches found.');
    };

    const loadMemberRequests = async () => {
        setLoading('memberRequestList', 'Loading member requests');
        const search = document.getElementById('memberRequestSearch')?.value || '';
        const members = await rpc('developer_list_member_requests', { p_search: search || null });

        renderTable('memberRequestList', ['Member', 'Church', 'Status', 'Actions'], members.map((member) => `
            <tr>
                <td>
                    <strong>${escapeHtml(member.fullName || member.email)}</strong>
                    <span>${escapeHtml(member.email)}</span>
                    <small>${escapeHtml(member.phone || '')}</small>
                </td>
                <td>
                    <strong>${escapeHtml(member.church_name || member.placeName || member.placeId)}</strong>
                    <span>${escapeHtml(member.placeId || '')}</span>
                </td>
                <td>${statusBadge(member.approvalStatus)}<small>${formatDate(member.joinDate)}</small></td>
                <td>
                    <div class="developer-action-row">
                        <button class="developer-icon-btn" title="Emergency Approve" data-action="approve-member" data-id="${escapeHtml(member.id)}"><i class="fas fa-check"></i></button>
                    </div>
                </td>
            </tr>
        `), 'No pending member requests.');
    };

    const loadUsers = async () => {
        setLoading('userSearchList', 'Loading users');
        const search = document.getElementById('userSearchInput')?.value || '';
        const users = await rpc('developer_search_users', { p_search: search || null, p_church_id: null });

        renderTable('userSearchList', ['User', 'Church', 'Roles', 'State'], users.map((user) => `
            <tr>
                <td>
                    <strong>${escapeHtml(user.fullName || user.email)}</strong>
                    <span>${escapeHtml(user.email)}</span>
                    <small>${escapeHtml(user.isDeveloper ? 'Developer flag set' : '')}</small>
                </td>
                <td><strong>${escapeHtml(user.placeName || 'No church')}</strong><span>${escapeHtml(user.placeId || '')}</span></td>
                <td><span>${escapeHtml((user.roles || []).join(', ') || 'No roles')}</span></td>
                <td>${statusBadge(user.approvalStatus)}<small>${escapeHtml(user.accountState || 'unknown')}</small></td>
            </tr>
        `), 'No users found.');
    };

    const loadDeveloperAccounts = async () => {
        setLoading('developerAccountList', 'Loading developer accounts');
        const developers = await rpc('developer_list_developer_accounts');

        renderTable('developerAccountList', ['Email', 'Role', 'Status', 'Last Login', 'Actions'], developers.map((developer) => `
            <tr>
                <td><strong>${escapeHtml(developer.email)}</strong><span>${escapeHtml(developer.user_id || 'Auth user not linked yet')}</span></td>
                <td><span>${escapeHtml(developer.developer_role)}</span></td>
                <td>${statusBadge(developer.status)}</td>
                <td><span>${formatDate(developer.last_login_at)}</span><small>Created ${formatDate(developer.created_at)}</small></td>
                <td>
                    <button class="developer-icon-btn danger" title="Disable developer access" data-action="remove-developer" data-email="${escapeHtml(developer.email)}"><i class="fas fa-user-slash"></i></button>
                </td>
            </tr>
        `), 'No developer accounts found.');
    };

    const loadAudit = async () => {
        setLoading('developerAuditList', 'Loading audit logs');
        const logs = await rpc('developer_get_audit_logs', { p_limit: 100 });

        renderTable('developerAuditList', ['Action', 'Actor', 'Target', 'Details'], logs.map((log) => `
            <tr>
                <td><strong>${escapeHtml(log.action)}</strong><span>${formatDate(log.created_at)}</span></td>
                <td><span>${escapeHtml(log.actor_email || log.actor_user_id || 'Unknown')}</span></td>
                <td><span>${escapeHtml(log.target_type || '')}</span><small>${escapeHtml(log.target_id || '')}</small></td>
                <td><code>${escapeHtml(JSON.stringify(log.details || {}))}</code></td>
            </tr>
        `), 'No developer audit events yet.');
    };

    const loadActiveView = async () => {
        showMessage('developerPortalMessage', '');
        try {
            if (state.activeView === 'overview') await loadOverview();
            if (state.activeView === 'churches') await loadChurches();
            if (state.activeView === 'members') await loadMemberRequests();
            if (state.activeView === 'users') await loadUsers();
            if (state.activeView === 'developers') await loadDeveloperAccounts();
            if (state.activeView === 'audit') await loadAudit();
        } catch (error) {
            showMessage('developerPortalMessage', error.message || 'Unable to load developer portal data.', 'error');
        }
    };

    const switchView = (view) => {
        state.activeView = view;
        document.querySelectorAll('.developer-nav-btn').forEach((button) => {
            button.classList.toggle('active', button.dataset.view === view);
        });
        document.querySelectorAll('.developer-view').forEach((section) => {
            section.classList.toggle('active', section.id === `view-${view}`);
        });
        loadActiveView();
    };

    const handleAction = async (button) => {
        const action = button.dataset.action;
        const id = button.dataset.id;
        const email = button.dataset.email;
        button.disabled = true;

        try {
            if (action === 'view-church') {
                const churchStr = button.dataset.church;
                if (churchStr) {
                    const church = JSON.parse(churchStr);
                    document.getElementById('churchDetailModal').style.display = 'flex';
                    document.getElementById('churchDetailTitle').textContent = church.name;
                    
                    document.getElementById('churchDetailBody').innerHTML = `
                        <div class="developer-detail-grid">
                            <div class="developer-detail-item"><strong>Location Name:</strong> <span>${escapeHtml(church.location_name || church.name || 'N/A')}</span></div>
                            <div class="developer-detail-item"><strong>Address:</strong> <span>${escapeHtml(church.address || 'N/A')}</span></div>
                            <div class="developer-detail-item"><strong>Parish:</strong> <span>${escapeHtml(church.parish || 'N/A')}</span></div>
                            <div class="developer-detail-item"><strong>Denomination:</strong> <span>${escapeHtml(church.denomination || 'N/A')}</span></div>
                            <div class="developer-detail-item"><strong>Contact Name:</strong> <span>${escapeHtml(church.pastor_or_admin_name || church.pastor_name || 'N/A')}</span></div>
                            <div class="developer-detail-item"><strong>Contact Email:</strong> <span>${escapeHtml(church.pastor_or_admin_email || church.pastor_email || 'N/A')}</span></div>
                            <div class="developer-detail-item" style="grid-column: 1 / -1;"><strong>Applicant Note:</strong> <span>${escapeHtml(church.applicant_note || 'None')}</span></div>
                            <div class="developer-detail-item"><strong>Status:</strong> <span>${statusBadge(church.approval_status || church.status)}</span></div>
                            <div class="developer-detail-item"><strong>Subscription:</strong> <span>${subscriptionBadge(church)}</span></div>
                        </div>
                    `;
                    
                    let actionsHtml = '';
                    const status = (church.approval_status || church.status || '').toLowerCase();
                    if (status === 'pending' || status === 'submitted' || status === 'under_review') {
                        actionsHtml = `
                            <button class="btn btn-primary" data-action="approve-church" data-id="${escapeHtml(church.placeId || church.id)}">Approve</button>
                            <button class="btn btn-secondary danger" data-action="reject-church" data-id="${escapeHtml(church.placeId || church.id)}">Reject</button>
                        `;
                    } else if (status === 'approved') {
                        actionsHtml = `
                            <button class="btn btn-primary" data-action="grant-subscription" data-id="${escapeHtml(church.placeId || church.id)}" data-months="1">Free 1 Month</button>
                            <button class="btn btn-secondary" data-action="grant-subscription" data-id="${escapeHtml(church.placeId || church.id)}" data-months="3">Free 3 Months</button>
                            <button class="btn btn-secondary danger" data-action="clear-subscription" data-id="${escapeHtml(church.placeId || church.id)}">Turn Subscription Off</button>
                            <button class="btn btn-secondary danger" data-action="suspend-church" data-id="${escapeHtml(church.placeId || church.id)}">Suspend</button>
                        `;
                    }
                    document.getElementById('churchDetailActions').innerHTML = actionsHtml;
                }
                return;
            }
            
            // Close modal after approving, rejecting, suspending
            if (['approve-church', 'reject-church', 'suspend-church'].includes(action)) {
                document.getElementById('churchDetailModal').style.display = 'none';
            }

            if (['grant-subscription', 'clear-subscription'].includes(action)) {
                document.getElementById('churchDetailModal').style.display = 'none';
            }

            if (action === 'approve-church') {
                await rpc('developer_approve_church_registration', { p_church_id: id });
                showMessage('developerPortalMessage', 'Church approved and added to the public directory.', 'success');
                await loadChurches();
            }
            if (action === 'reject-church') {
                const reason = window.prompt('Reason for rejecting this church registration?') || '';
                await rpc('developer_reject_church_registration', { p_church_id: id, p_reason: reason });
                showMessage('developerPortalMessage', 'Church registration rejected.', 'success');
                await loadChurches();
            }
            if (action === 'suspend-church') {
                const reason = window.prompt('Reason for suspending this church?') || '';
                await rpc('developer_suspend_church', { p_church_id: id, p_reason: reason });
                showMessage('developerPortalMessage', 'Church suspended and hidden from public search.', 'success');
                await loadChurches();
            }
            if (action === 'grant-subscription') {
                const months = Number(button.dataset.months || '1');
                await rpc('developer_set_church_subscription', {
                    p_church_id: id,
                    p_status: 'active',
                    p_plan_code: 'manual_free',
                    p_months: months,
                    p_notes: `Developer manual free grant: ${months} month(s)`
                });
                showMessage('developerPortalMessage', `Free subscription granted for ${months} month(s).`, 'success');
                await loadChurches();
                await loadOverview();
            }
            if (action === 'clear-subscription') {
                const reason = window.prompt('Reason for turning this church subscription off?') || '';
                await rpc('developer_clear_church_subscription', {
                    p_church_id: id,
                    p_reason: reason || 'Developer manual disable'
                });
                showMessage('developerPortalMessage', 'Church subscription turned off. Users keep feed access only.', 'success');
                await loadChurches();
                await loadOverview();
            }
            if (action === 'approve-member') {
                const reason = window.prompt('WARNING: This is an emergency override. Enter the reason for approving this member directly:') || '';
                if (!reason) throw new Error('Emergency approval requires a reason.');
                await rpc('developer_approve_member_request', { p_user_id: id, p_reason: reason, p_emergency_override: true });
                showMessage('developerPortalMessage', 'Member request approved (Emergency Override).', 'success');
                await loadMemberRequests();
            }
            if (action === 'remove-developer') {
                if (!window.confirm(`Disable developer access for ${email}?`)) return;
                await rpc('developer_remove_developer_access', { p_email: email });
                showMessage('developerPortalMessage', 'Developer access disabled.', 'success');
                await loadDeveloperAccounts();
            }
        } catch (error) {
            showMessage('developerPortalMessage', error.message || 'Action failed.', 'error');
        } finally {
            button.disabled = false;
        }
    };

    const debounce = (callback, delay = 350) => {
        let timer;
        return (...args) => {
            window.clearTimeout(timer);
            timer = window.setTimeout(() => callback(...args), delay);
        };
    };

    document.querySelectorAll('.developer-nav-btn').forEach((button) => {
        button.addEventListener('click', () => switchView(button.dataset.view));
    });

    document.addEventListener('click', (event) => {
        const actionButton = event.target.closest('[data-action]');
        if (actionButton) handleAction(actionButton);

        const refreshButton = event.target.closest('[data-refresh]');
        if (refreshButton) loadActiveView();
    });

    document.getElementById('developerSignOutBtn')?.addEventListener('click', async () => {
        await client.auth.signOut();
        window.location.href = 'login.html';
    });

    document.getElementById('churchStatusFilter')?.addEventListener('change', loadChurches);
    document.getElementById('churchSearchFilter')?.addEventListener('input', debounce(loadChurches));
    document.getElementById('memberRequestSearch')?.addEventListener('input', debounce(loadMemberRequests));
    document.getElementById('userSearchInput')?.addEventListener('input', debounce(loadUsers));

    document.getElementById('developerAccountForm')?.addEventListener('submit', async (event) => {
        event.preventDefault();
        const email = document.getElementById('developerAccountEmail').value.trim();
        const role = document.getElementById('developerAccountRole').value;
        const status = document.getElementById('developerAccountStatus').value;
        try {
            await rpc('developer_upsert_developer_account', {
                p_email: email,
                p_developer_role: role,
                p_status: status
            });
            event.target.reset();
            showMessage('developerPortalMessage', 'Developer account saved.', 'success');
            await loadDeveloperAccounts();
        } catch (error) {
            showMessage('developerPortalMessage', error.message || 'Could not save developer account.', 'error');
        }
    });

    (async () => {
        try {
            await verifyDeveloperSession();
            renderSessionPill();
            await loadOverview();
        } catch (error) {
            await client.auth.signOut();
            window.location.href = `login.html?reason=${encodeURIComponent(error.message || 'access-denied')}`;
        }
    })();
});
