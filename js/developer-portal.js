document.addEventListener('DOMContentLoaded', () => {
    const client = window.gcSupabase;
    const isLoginPage = Boolean(document.getElementById('developerLoginForm'));
    const isPortalPage = Boolean(document.querySelector('.developer-portal-page'));
    const state = {
        session: null,
        activeView: 'overview',
        selectedChurchId: null
    };

    const escapeHtml = (value) => String(value ?? '')
        .replaceAll('&', '&amp;')
        .replaceAll('<', '&lt;')
        .replaceAll('>', '&gt;')
        .replaceAll('"', '&quot;')
        .replaceAll("'", '&#039;');

    const escapeAttrJson = (value) => escapeHtml(JSON.stringify(value ?? {}));

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

    const formatJamaicaDate = (value) => {
        if (!value) return 'Not scheduled';
        const date = new Date(value);
        if (Number.isNaN(date.getTime())) return 'Not scheduled';
        return date.toLocaleString([], {
            timeZone: 'America/Jamaica',
            timeZoneName: 'short',
            year: 'numeric',
            month: 'short',
            day: 'numeric',
            hour: 'numeric',
            minute: '2-digit'
        });
    };

    const normalizeList = (value) => Array.isArray(value) ? value : [];

    const scheduledContentManagerRoles = new Set([
        'super_developer',
        'support_developer',
        'content_moderator',
        'security_admin'
    ]);

    const canManageScheduledContent = () => scheduledContentManagerRoles.has(
        String(state.session?.developer_role || '').toLowerCase()
    );

    const financialManagerRoles = new Set([
        'super_developer',
        'billing_support',
        'security_admin'
    ]);

    const canManageFinancials = () => financialManagerRoles.has(
        String(state.session?.developer_role || '').toLowerCase()
    );

    const formatNumber = (value) => new Intl.NumberFormat().format(Number(value) || 0);

    const formatMoney = (value, currency = 'USD') => {
        const amount = new Intl.NumberFormat('en-US', {
            maximumFractionDigits: 0
        }).format(Number(value) || 0);
        if (currency === 'JMD') return `J$${amount}`;
        if (currency === 'USD') return `US$${amount}`;
        return `${currency} ${amount}`;
    };

    const roleOptions = [
        'Member',
        'Pastor',
        'Senior Pastor',
        'Assistant Pastor',
        'Acting Pastor',
        'Admin',
        'Church Admin',
        'Church Secretary',
        'Secretary',
        'Treasurer',
        'Financial Secretary',
        'Sunday School Superintendent',
        'Sunday School Teacher',
        'Worship Leader',
        'Media Team',
        'Music, Media & Technical Team Live Stream Technician',
        'Deacon',
        'Usher',
        'Head Usher',
        'Prayer Warrior',
        'Intercessor',
        'Counselor'
    ];

    const privilegeOptions = [
        ['approveMembers', 'Approve members'],
        ['manageChurchSettings', 'Church settings'],
        ['manageRoles', 'Roles'],
        ['viewOperationalAnalytics', 'Analytics'],
        ['viewFinanceDashboard', 'Finance dashboard'],
        ['manageFinances', 'Manage finances'],
        ['approveFinanceReports', 'Finance reports'],
        ['createAnnouncement', 'Announcements'],
        ['sendPushNotification', 'Push notifications'],
        ['pinPost', 'Pin posts'],
        ['moderateCommunity', 'Moderate community'],
        ['createEvents', 'Events'],
        ['manageSundaySchool', 'Sunday school'],
        ['manageLivestream', 'Livestream'],
        ['manageWorship', 'Worship'],
        ['managePrayerRequests', 'Prayer requests'],
        ['assignCareRequests', 'Care requests'],
        ['manualCheckIn', 'Manual check-in'],
        ['viewAttendanceInsights', 'Attendance insights'],
        ['viewPriorityList', 'View priority list'],
        ['managePriorityList', 'Manage priority list'],
        ['manageSchedule', 'Schedule']
    ];

    const knownRoleSet = new Set(roleOptions);

    const previewList = (value, fallback = 'None') => {
        const list = normalizeList(value).filter(Boolean);
        if (!list.length) return fallback;
        if (list.length <= 3) return list.join(', ');
        return `${list.slice(0, 3).join(', ')} +${list.length - 3} more`;
    };

    const userPayload = (user) => ({
        id: user.id || user.user_id || user.uid || '',
        uid: user.uid || '',
        email: user.email || '',
        fullName: user.fullName || user.full_name || '',
        placeId: user.placeId || user.place_id || user.pendingChurchId || '',
        placeName: user.placeName || user.place_name || user.pendingChurchName || '',
        roles: normalizeList(user.roles),
        appPrivileges: normalizeList(user.appPrivileges || user.app_privileges),
        accountState: user.accountState || user.account_state || '',
        approvalStatus: user.approvalStatus || user.approval_status || user.membership_status || '',
        pendingMembershipId: user.pendingMembershipId || user.pending_membership_id || '',
        pendingChurchName: user.pendingChurchName || user.pending_church_name || '',
        isDeveloper: Boolean(user.isDeveloper || user.is_developer)
    });

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

    const invokeMailer = async (body) => {
        const { data, error } = await client.functions.invoke('grace-mailer', { body });
        if (error) throw new Error(await functionErrorMessage(error));
        if (data?.ok === false) throw new Error(data.error || 'Email delivery failed.');
        return data || { ok: true, total: 0, sent: 0, failed: 0 };
    };

    const invokeFunction = async (name, body) => {
        const { data, error } = await client.functions.invoke(name, { body });
        if (error) throw new Error(await functionErrorMessage(error));
        if (data?.error) throw new Error(data.error);
        return data || { ok: true };
    };

    const flushQueuedEmails = async () => {
        try {
            return await invokeMailer({ action: 'flush-queue', limit: 25 });
        } catch (error) {
            console.error('Queued email delivery failed:', error);
            return { ok: false, error: error.message || 'Email delivery failed.' };
        }
    };

    const emailDeliverySuffix = (delivery) => {
        if (!delivery) return '';
        if (delivery.ok === false) return ` Email delivery is not active: ${delivery.error}`;
        if (!delivery.total) return ' No queued emails needed sending.';
        return ` Email delivery: ${delivery.sent}/${delivery.total} sent${delivery.failed ? `, ${delivery.failed} failed` : ''}.`;
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
        const financeNav = document.getElementById('developerFinanceNav');
        if (financeNav) financeNav.hidden = !canManageFinancials();
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

    const statusBadge = (status) => {
        const normalized = String(status || 'unknown').toLowerCase();
        return `<span class="developer-status developer-status-${escapeHtml(normalized)}">${escapeHtml(normalized.replaceAll('_', ' '))}</span>`;
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

    const modal = () => ({
        shell: document.getElementById('churchDetailModal'),
        title: document.getElementById('churchDetailTitle'),
        body: document.getElementById('churchDetailBody'),
        actions: document.getElementById('churchDetailActions')
    });

    const openModal = (title, bodyHtml, actionsHtml = '') => {
        const parts = modal();
        parts.title.textContent = title;
        parts.body.innerHTML = bodyHtml;
        parts.actions.innerHTML = actionsHtml;
        parts.shell.style.display = 'flex';
    };

    const closeModal = () => {
        const parts = modal();
        state.selectedChurchId = null;
        parts.shell.style.display = 'none';
        parts.body.innerHTML = '';
        parts.actions.innerHTML = '';
    };

    const detailRow = (label, value) => `
        <div class="developer-detail-item">
            <strong>${escapeHtml(label)}</strong>
            <span>${escapeHtml(value || 'Not recorded')}</span>
        </div>
    `;

    const renderUserAccessModal = (rawUser) => {
        const user = userPayload(rawUser);
        const currentRoles = normalizeList(user.roles);
        const currentPrivileges = normalizeList(user.appPrivileges);
        const customRoles = currentRoles.filter((role) => !knownRoleSet.has(role));
        const displayName = user.fullName || user.email || 'User account';

        const roleChecks = roleOptions.map((role) => `
            <label class="developer-check-option">
                <input type="checkbox" name="roles" value="${escapeHtml(role)}" ${currentRoles.includes(role) ? 'checked' : ''}>
                <span>${escapeHtml(role)}</span>
            </label>
        `).join('');

        const privilegeChecks = privilegeOptions.map(([value, label]) => `
            <label class="developer-check-option">
                <input type="checkbox" name="privileges" value="${escapeHtml(value)}" ${currentPrivileges.includes(value) ? 'checked' : ''}>
                <span>${escapeHtml(label)}</span>
            </label>
        `).join('');

        openModal(
            `Access: ${displayName}`,
            `
                <form id="userAccessForm" class="developer-access-form">
                    <div class="developer-detail-grid">
                        ${detailRow('Email', user.email)}
                        ${detailRow('Church', user.placeName || user.pendingChurchName || 'No church')}
                        ${detailRow('Current State', user.accountState || user.approvalStatus || 'unknown')}
                        ${detailRow('User ID', user.id)}
                    </div>
                    <div class="developer-modal-section">
                        <h3>Account State</h3>
                        <select name="accountState" class="developer-wide-control">
                            ${['active', 'pending', 'declined', 'removed', 'suspended', 'disabled', 'deletion_requested'].map((status) => `
                                <option value="${status}" ${String(user.accountState || '').toLowerCase() === status ? 'selected' : ''}>${status.replaceAll('_', ' ')}</option>
                            `).join('')}
                        </select>
                    </div>
                    <div class="developer-modal-section">
                        <h3>Roles</h3>
                        <div class="developer-check-grid">${roleChecks}</div>
                        <label class="developer-form-field">
                            <span>Additional roles</span>
                            <input type="text" name="customRoles" value="${escapeHtml(customRoles.join(', '))}" placeholder="Comma-separated custom roles">
                        </label>
                    </div>
                    <div class="developer-modal-section">
                        <h3>App Privileges</h3>
                        <div class="developer-check-grid developer-check-grid-wide">${privilegeChecks}</div>
                    </div>
                </form>
            `,
            `
                <button class="btn btn-secondary" data-close-modal="true">Cancel</button>
                <button class="btn btn-primary" data-action="save-user-access" data-id="${escapeHtml(user.id)}"><i class="fas fa-floppy-disk"></i> Save Access</button>
            `
        );
    };

    const collectUserAccessForm = () => {
        const form = document.getElementById('userAccessForm');
        if (!form) throw new Error('Access form is not available.');

        const roles = Array.from(form.querySelectorAll('input[name="roles"]:checked')).map((input) => input.value);
        const customRoles = (form.querySelector('[name="customRoles"]')?.value || '')
            .split(',')
            .map((role) => role.trim())
            .filter(Boolean);
        const privileges = Array.from(form.querySelectorAll('input[name="privileges"]:checked')).map((input) => input.value);
        const accountState = form.querySelector('[name="accountState"]')?.value || 'active';

        return {
            roles: Array.from(new Set([...roles, ...customRoles])).filter(Boolean),
            privileges,
            accountState
        };
    };

    const loadOverview = async () => {
        setLoading('dashboardStats', 'Loading dashboard');
        setLoading('recentSignupsList');
        setLoading('missingSetupList');
        const data = await rpc('developer_get_dashboard');
        const stats = [
            ['Total Users', data.total_users, 'fa-users'],
            ['Pending Members', data.pending_members, 'fa-user-clock'],
            ['Open Issues', data.open_support_tickets || 0, 'fa-bug'],
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

        const recent = normalizeList(data.recent_signups);
        document.getElementById('recentSignupsList').innerHTML = recent.length
            ? recent.map((user) => `
                <div class="developer-list-item">
                    <strong>${escapeHtml(user.fullName || user.email)}</strong>
                    <span>${escapeHtml(user.email)} · ${escapeHtml(user.approvalStatus || 'unknown')}</span>
                    <small>${formatDate(user.joinDate)}</small>
                </div>
            `).join('')
            : '<div class="developer-empty"><i class="fas fa-inbox"></i><span>No recent signups.</span></div>';

        const missing = normalizeList(data.churches_missing_setup);
        document.getElementById('missingSetupList').innerHTML = missing.length
            ? missing.map((church) => {
                const churchId = church.placeId || church.id;
                const missingItems = normalizeList(church.missing_items).join(', ') || 'setup details';
                return `
                    <div class="developer-list-item developer-list-item-with-action">
                        <div>
                            <strong>${escapeHtml(church.name || churchId)}</strong>
                            <span>${escapeHtml(church.address || 'Address missing')}</span>
                            <small>Missing: ${escapeHtml(missingItems)}</small>
                        </div>
                        <button class="btn btn-secondary btn-small" data-action="prompt-setup" data-id="${escapeHtml(churchId)}">
                            <i class="fas fa-paper-plane"></i> Prompt
                        </button>
                    </div>
                `;
            }).join('')
            : '<div class="developer-empty"><i class="fas fa-circle-check"></i><span>No setup gaps found.</span></div>';
    };

    const loadChurches = async () => {
        setLoading('churchList', 'Loading churches');
        const status = document.getElementById('churchStatusFilter')?.value || '';
        const search = document.getElementById('churchSearchFilter')?.value || '';
        const records = await rpc('developer_list_churches', { p_status: status || null, p_search: search || null });
        const churches = normalizeList(records).filter((church) => church.record_type === 'church');

        renderTable('churchList', ['Church', 'Contact', 'Status', 'Subscription', 'Setup', 'Actions'], churches.map((church) => {
            const churchId = church.placeId || church.id;
            return `
                <tr>
                    <td>
                        <strong>${escapeHtml(church.name)}</strong>
                        <span>${escapeHtml(church.address || 'No address')}</span>
                        <small>${escapeHtml(church.denomination || 'No denomination')}</small>
                    </td>
                    <td>
                        <strong>${escapeHtml(church.pastor_or_admin_name || 'Open details')}</strong>
                        <span>${escapeHtml(church.pastor_or_admin_email || '')}</span>
                        <small>${escapeHtml(church.pastor_or_admin_phone || '')}</small>
                    </td>
                    <td>${statusBadge(church.approval_status || church.status)}<small>Public: ${church.public_visibility ? 'yes' : 'no'}</small></td>
                    <td>${subscriptionBadge(church)}</td>
                    <td><span>${escapeHtml(church.member_count || 0)} active members</span><small>Created ${formatDate(church.createdAt)}</small></td>
                    <td>
                        <div class="developer-action-row">
                            <button class="developer-icon-btn" title="View details and members" data-action="view-church" data-id="${escapeHtml(churchId)}"><i class="fas fa-eye"></i></button>
                            ${canManageFinancials() ? `
                                <button class="developer-icon-btn" title="Manage subscription events" data-action="open-subscription-event" data-context="${escapeAttrJson({ churchId, churchName: church.name, memberCountSnapshot: church.member_count || 0 })}"><i class="fas fa-money-check-dollar"></i></button>
                            ` : ''}
                        </div>
                    </td>
                </tr>
            `;
        }), 'No churches found.');
    };

    const loadChurchRequests = async () => {
        setLoading('churchRequestList', 'Loading church requests');
        const status = document.getElementById('churchRequestStatusFilter')?.value || '';
        const search = document.getElementById('churchRequestSearch')?.value || '';
        const requests = normalizeList(await rpc('developer_list_church_registration_requests', {
            p_status: status || null,
            p_search: search || null
        }));

        renderTable('churchRequestList', ['Church', 'Pastor/Admin', 'Status', 'Submitted', 'Actions'], requests.map((request) => `
            <tr>
                <td>
                    <strong>${escapeHtml(request.name)}</strong>
                    <span>${escapeHtml(request.address || request.location_name || 'No address')}</span>
                    <small>${escapeHtml(request.denomination || 'No denomination')}</small>
                </td>
                <td>
                    <strong>${escapeHtml(request.pastor_name || 'Not recorded')}</strong>
                    <span>${escapeHtml(request.pastor_email || '')}</span>
                    <small>${escapeHtml(request.pastor_phone || '')}</small>
                </td>
                <td>${statusBadge(request.status)}<small>${escapeHtml(request.review_notes || '')}</small></td>
                <td><span>${formatDate(request.created_at)}</span><small>${escapeHtml(request.parish || '')}</small></td>
                <td>
                    <div class="developer-action-row">
                        <button class="developer-icon-btn" title="View request" data-action="view-request" data-request="${escapeAttrJson(request)}"><i class="fas fa-eye"></i></button>
                        ${['submitted', 'under_review', 'needs_information'].includes(String(request.status || '').toLowerCase()) ? `
                            <button class="developer-icon-btn" title="Approve church" data-action="approve-church" data-id="${escapeHtml(request.id)}"><i class="fas fa-check"></i></button>
                            <button class="developer-icon-btn danger" title="Deny church" data-action="reject-church" data-id="${escapeHtml(request.id)}"><i class="fas fa-ban"></i></button>
                        ` : ''}
                    </div>
                </td>
            </tr>
        `), 'No church registration requests found.');
    };

    const loadIssues = async () => {
        setLoading('issueReportList', 'Loading issue reports');
        const status = document.getElementById('issueStatusFilter')?.value || '';
        const search = document.getElementById('issueSearchInput')?.value || '';
        const issues = normalizeList(await rpc('developer_list_support_tickets', {
            p_status: status || null,
            p_search: search || null
        }));

        renderTable('issueReportList', ['Issue', 'Reporter', 'Church', 'Status', 'Actions'], issues.map((issue) => `
            <tr>
                <td>
                    <strong>${escapeHtml(issue.summary)}</strong>
                    <span>${escapeHtml(issue.issueType)} · ${escapeHtml(issue.appSection)}</span>
                    <small>${escapeHtml(issue.ticketId)} · ${formatDate(issue.createdAt)}</small>
                </td>
                <td><span>${escapeHtml(issue.reporterEmail)}</span></td>
                <td><strong>${escapeHtml(issue.church_name || issue.churchId || 'No church')}</strong><span>${escapeHtml(issue.churchId || '')}</span></td>
                <td>${statusBadge(issue.status)}<small>${escapeHtml(issue.impact || 'Medium')} impact</small></td>
                <td>
                    <div class="developer-action-row">
                        <button class="developer-icon-btn" title="View issue" data-action="view-issue" data-issue="${escapeAttrJson(issue)}"><i class="fas fa-eye"></i></button>
                        <button class="developer-icon-btn" title="Acknowledge" data-action="update-issue" data-id="${escapeHtml(issue.id)}" data-status="acknowledged"><i class="fas fa-hand"></i></button>
                        <button class="developer-icon-btn" title="Mark in review" data-action="update-issue" data-id="${escapeHtml(issue.id)}" data-status="in_review"><i class="fas fa-magnifying-glass"></i></button>
                        <button class="developer-icon-btn" title="Resolve" data-action="update-issue" data-id="${escapeHtml(issue.id)}" data-status="resolved"><i class="fas fa-check"></i></button>
                    </div>
                </td>
            </tr>
        `), 'No issue reports found.');
    };

    const loadUsers = async () => {
        setLoading('userSearchList', 'Loading users');
        const search = document.getElementById('userSearchInput')?.value || '';
        const users = await rpc('developer_search_users', { p_search: search || null, p_church_id: null });

        renderTable('userSearchList', ['User', 'Church', 'Roles', 'Privileges', 'State', 'Actions'], normalizeList(users).map((record) => {
            const user = userPayload(record);
            return `
                <tr>
                    <td>
                        <strong>${escapeHtml(user.fullName || user.email || 'Unnamed user')}</strong>
                        <span>${escapeHtml(user.email)}</span>
                        <small>${escapeHtml(user.isDeveloper ? 'Developer flag set' : user.id)}</small>
                    </td>
                    <td>
                        <strong>${escapeHtml(user.placeName || user.pendingChurchName || 'No church')}</strong>
                        <span>${escapeHtml(user.placeId || '')}</span>
                        ${user.pendingMembershipId ? '<small>Pending membership request</small>' : ''}
                    </td>
                    <td><span>${escapeHtml(previewList(user.roles, 'No roles'))}</span></td>
                    <td><span>${escapeHtml(previewList(user.appPrivileges, 'No extra privileges'))}</span></td>
                    <td>${statusBadge(user.approvalStatus || user.accountState)}<small>${escapeHtml(user.accountState || 'unknown')}</small></td>
                    <td>
                        <div class="developer-action-row">
                            ${user.pendingMembershipId ? `<button class="developer-icon-btn" title="Approve member" data-action="approve-member" data-id="${escapeHtml(user.pendingMembershipId)}"><i class="fas fa-user-check"></i></button>` : ''}
                            <button class="developer-icon-btn" title="Change roles and privileges" data-action="edit-user-access" data-user="${escapeAttrJson(user)}"><i class="fas fa-user-gear"></i></button>
                            <button class="developer-icon-btn danger" title="Delete account from Supabase" data-action="delete-user" data-id="${escapeHtml(user.id)}" data-email="${escapeHtml(user.email)}"><i class="fas fa-trash"></i></button>
                        </div>
                    </td>
                </tr>
            `;
        }), 'No users found.');
    };

    const loadDeveloperAccounts = async () => {
        setLoading('developerAccountList', 'Loading developer accounts');
        const developers = await rpc('developer_list_developer_accounts');

        renderTable('developerAccountList', ['Email', 'Role', 'Status', 'Last Login', 'Actions'], normalizeList(developers).map((developer) => `
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

        renderTable('developerAuditList', ['Action', 'Actor', 'Target', 'Details'], normalizeList(logs).map((log) => `
            <tr>
                <td><strong>${escapeHtml(log.action)}</strong><span>${formatDate(log.created_at)}</span></td>
                <td><span>${escapeHtml(log.actor_email || log.actor_user_id || 'Unknown')}</span></td>
                <td><span>${escapeHtml(log.target_type || '')}</span><small>${escapeHtml(log.target_id || '')}</small></td>
                <td><code>${escapeHtml(JSON.stringify(log.details || {}))}</code></td>
            </tr>
        `), 'No developer audit events yet.');
    };

    const renderCurrentDailyWord = (word) => {
        const el = document.getElementById('currentDailyWordCard');
        if (!el) return;
        if (!word) {
            el.innerHTML = '<div class="developer-empty"><i class="fas fa-calendar-xmark"></i><span>No Daily Word has published yet today.</span></div>';
            return;
        }
        el.innerHTML = `
            <article class="scheduled-content-card scheduled-word-card scheduled-card-live">
                <div class="scheduled-card-meta">
                    <span><i class="fas fa-clock" aria-hidden="true"></i> ${escapeHtml(formatJamaicaDate(word.release_at))}</span>
                    ${statusBadge('published')}
                </div>
                <h4>${escapeHtml(word.title || 'Daily Word')}</h4>
                <p>${escapeHtml(word.message || '')}</p>
                <div class="scheduled-scripture"><i class="fas fa-book-bible" aria-hidden="true"></i><span>${escapeHtml(word.scripture_reference || '')}</span>${word.topic ? `<small>${escapeHtml(word.topic)}</small>` : ''}</div>
                ${word.has_study_quiz ? '<div class="scheduled-quiz-summary"><span><i class="fas fa-graduation-cap" aria-hidden="true"></i> Today\'s quiz studies this chapter</span></div>' : ''}
            </article>
        `;
    };

    const renderCurrentQuizzes = (quizzes) => {
        const el = document.getElementById('currentQuizList');
        if (!el) return;
        const list = normalizeList(quizzes);
        if (!list.length) {
            el.innerHTML = '<div class="developer-empty"><i class="fas fa-calendar-xmark"></i><span>No Bible Quiz has published yet today.</span></div>';
            return;
        }
        el.innerHTML = list.map((quiz) => {
            const questionCount = quiz.question_count ?? normalizeList(quiz.questions).length;
            return `
                <article class="scheduled-content-card scheduled-quiz-card scheduled-card-live">
                    <div class="scheduled-card-meta">
                        <span><i class="fas fa-clock" aria-hidden="true"></i> ${escapeHtml(formatJamaicaDate(quiz.release_at))}</span>
                        ${statusBadge('published')}
                    </div>
                    <h4>${escapeHtml(quiz.church_name || (quiz.scope === 'global' ? 'Grace Connect Global' : 'Church-specific quiz'))}</h4>
                    <div class="scheduled-quiz-summary">
                        <span><i class="fas fa-circle-question" aria-hidden="true"></i> ${questionCount} questions</span>
                        <span><i class="fas fa-eye-slash" aria-hidden="true"></i> Answers hidden</span>
                    </div>
                    <details>
                        <summary>Preview all questions</summary>
                        <ol class="scheduled-question-list">
                            ${normalizeList(quiz.questions).map((question) => `
                                <li>
                                    <strong>${escapeHtml(question.question || '')}</strong>
                                    <small>${normalizeList(question.options).map((option) => escapeHtml(option)).join(' · ')}</small>
                                </li>
                            `).join('')}
                        </ol>
                    </details>
                </article>
            `;
        }).join('');
    };

    // Both prepare crons run at fixed UTC times year-round (Jamaica has no
    // DST, so these never shift). Countdown is computed client-side purely
    // from those constants -- no backend round trip needed to keep it live.
    const GENERATION_SCHEDULE_UTC = {
        dailyWordPrepare: { hour: 1, minute: 15 },
        quizPrepare: { hour: 1, minute: 40 },
    };

    const nextOccurrenceOf = (hour, minute) => {
        const target = new Date();
        target.setUTCHours(hour, minute, 0, 0);
        if (target.getTime() <= Date.now()) {
            target.setUTCDate(target.getUTCDate() + 1);
        }
        return target;
    };

    const formatCountdown = (msRemaining) => {
        const totalSeconds = Math.max(0, Math.floor(msRemaining / 1000));
        const hours = String(Math.floor(totalSeconds / 3600)).padStart(2, '0');
        const minutes = String(Math.floor((totalSeconds % 3600) / 60)).padStart(2, '0');
        const seconds = String(totalSeconds % 60).padStart(2, '0');
        return `${hours}:${minutes}:${seconds}`;
    };

    let generationCountdownTimer = null;
    const startGenerationCountdown = () => {
        if (generationCountdownTimer) return;
        const tick = () => {
            const wordEl = document.getElementById('countdownWordPrepare');
            const quizEl = document.getElementById('countdownQuizPrepare');
            if (!wordEl && !quizEl) return;
            const now = Date.now();
            if (wordEl) {
                const target = nextOccurrenceOf(
                    GENERATION_SCHEDULE_UTC.dailyWordPrepare.hour,
                    GENERATION_SCHEDULE_UTC.dailyWordPrepare.minute,
                );
                wordEl.textContent = formatCountdown(target.getTime() - now);
            }
            if (quizEl) {
                const target = nextOccurrenceOf(
                    GENERATION_SCHEDULE_UTC.quizPrepare.hour,
                    GENERATION_SCHEDULE_UTC.quizPrepare.minute,
                );
                quizEl.textContent = formatCountdown(target.getTime() - now);
            }
        };
        tick();
        generationCountdownTimer = setInterval(tick, 1000);
    };

    const loadScheduledContent = async () => {
        setLoading('scheduledDailyWordList', 'Loading Daily Word schedule');
        setLoading('scheduledQuizList', 'Loading Bible Quiz schedule');
        const data = await rpc('developer_list_scheduled_content', { p_days: 14 });
        renderCurrentDailyWord(data?.current_daily_word || null);
        renderCurrentQuizzes(data?.current_quizzes);
        startGenerationCountdown();
        const now = Date.now();
        const isUpcoming = (item) => {
            const releaseTime = new Date(item?.release_at).getTime();
            const status = String(item?.status || '').toLowerCase();
            return Number.isFinite(releaseTime)
                && releaseTime > now
                && !['published', 'released', 'completed', 'cancelled'].includes(status);
        };
        const byReleaseTime = (left, right) => new Date(left.release_at) - new Date(right.release_at);
        const dailyWords = normalizeList(data?.daily_words).filter(isUpcoming).sort(byReleaseTime);
        const quizzes = normalizeList(data?.quizzes).filter(isUpcoming).sort(byReleaseTime);
        const settings = data?.quiz_uniqueness_settings || {};
        const uniquenessToggle = document.getElementById('quizUniquenessToggle');
        const uniquenessLabel = document.getElementById('quizUniquenessLabel');
        if (uniquenessToggle) {
            uniquenessToggle.checked = settings.guarantee_unique !== false;
            uniquenessToggle.dataset.current = String(uniquenessToggle.checked);
            uniquenessToggle.dataset.canManage = String(Boolean(data?.can_manage_quiz_uniqueness_settings && canManageScheduledContent()));
            uniquenessToggle.disabled = uniquenessToggle.dataset.canManage !== 'true';
        }
        if (uniquenessLabel) uniquenessLabel.textContent = settings.guarantee_unique === false ? 'Off' : 'On';

        const wordList = document.getElementById('scheduledDailyWordList');
        wordList.innerHTML = dailyWords.length ? dailyWords.map((word) => {
            const releaseAt = new Date(word.release_at);
            const canRefresh = canManageScheduledContent()
                && String(word.status || '').toLowerCase() === 'scheduled'
                && !Number.isNaN(releaseAt.getTime())
                && releaseAt.getTime() > now;
            return `
            <article class="scheduled-content-card scheduled-word-card">
                <div class="scheduled-card-meta">
                    <span><i class="fas fa-clock" aria-hidden="true"></i> ${escapeHtml(formatJamaicaDate(word.release_at))}</span>
                    ${statusBadge(word.status)}
                </div>
                <h4>${escapeHtml(word.title || 'Daily Word')}</h4>
                <p>${escapeHtml(word.message || '')}</p>
                <div class="scheduled-scripture"><i class="fas fa-book-bible" aria-hidden="true"></i><span>${escapeHtml(word.scripture_reference || 'Scripture reference pending')}</span>${word.topic ? `<small>${escapeHtml(word.topic)}</small>` : ''}</div>
                ${word.has_study_quiz ? '<div class="scheduled-quiz-summary"><span><i class="fas fa-graduation-cap" aria-hidden="true"></i> Mon/Wed/Sat quiz studies this chapter</span></div>' : ''}
                ${canRefresh ? `
                    <button class="btn btn-secondary" data-action="regenerate-scheduled-daily-word" data-id="${escapeHtml(word.id)}">
                        <i class="fas fa-arrows-rotate"></i> Replace Daily Word
                    </button>
                ` : ''}
                <small class="scheduled-release-note"><i class="fas fa-lock" aria-hidden="true"></i> Release slot and study chapter stay unchanged.</small>
            </article>
        `;
        }).join('') : '<div class="developer-empty"><i class="fas fa-calendar-xmark"></i><span>No future Daily Word release is scheduled.</span></div>';

        const quizList = document.getElementById('scheduledQuizList');
        quizList.innerHTML = quizzes.length ? quizzes.map((quiz) => {
            const questions = normalizeList(quiz.questions);
            const releaseAt = new Date(quiz.release_at);
            const canRefresh = canManageScheduledContent()
                && String(quiz.status || '').toLowerCase() === 'scheduled'
                && !Number.isNaN(releaseAt.getTime())
                && releaseAt.getTime() > now;
            return `
                <article class="scheduled-content-card scheduled-quiz-card">
                    <div class="scheduled-card-meta">
                        <span><i class="fas fa-clock" aria-hidden="true"></i> ${escapeHtml(formatJamaicaDate(quiz.release_at))}</span>
                        ${statusBadge(quiz.status)}
                    </div>
                    <h4>${escapeHtml(quiz.church_name || (quiz.scope === 'global' ? 'Grace Connect Global' : 'Church-specific quiz'))}</h4>
                    <div class="scheduled-quiz-summary">
                        <span><i class="fas fa-circle-question" aria-hidden="true"></i> ${questions.length} questions</span>
                        <span><i class="fas fa-eye-slash" aria-hidden="true"></i> Answers hidden</span>
                    </div>
                    <details>
                        <summary>Preview all questions</summary>
                        <ol class="scheduled-question-list">
                            ${questions.map((question) => `
                                <li>
                                    <strong>${escapeHtml(question.question || '')}</strong>
                                    <small>${normalizeList(question.options).map((option) => escapeHtml(option)).join(' · ')}</small>
                                </li>
                            `).join('')}
                        </ol>
                    </details>
                    ${canRefresh ? `
                        <button class="btn btn-secondary" data-action="regenerate-scheduled-quiz" data-id="${escapeHtml(quiz.id)}">
                            <i class="fas fa-arrows-rotate"></i> Replace Questions
                        </button>
                    ` : ''}
                    <small class="scheduled-release-note"><i class="fas fa-lock" aria-hidden="true"></i> Release slot stays unchanged. Answer key remains hidden.</small>
                </article>
            `;
        }).join('') : '<div class="developer-empty"><i class="fas fa-calendar-xmark"></i><span>No future Bible Quiz release is scheduled.</span></div>';
    };

    const financeRequestTransitions = {
        pending: ['in_review', 'rejected', 'cancelled'],
        in_review: ['quoted', 'approved', 'rejected', 'closed'],
        quoted: ['approved', 'rejected', 'closed'],
        approved: ['closed'],
        rejected: ['closed'],
        closed: [],
        cancelled: []
    };

    const financeStatusColors = {
        active: '#1f56c0',
        trialing: '#d6a92e',
        past_due: '#e66b55',
        inactive: '#9aa8bd',
        cancelled: '#6b7280',
        pending: '#e6bd4d',
        in_review: '#5b8def',
        quoted: '#7957d5',
        approved: '#2f9368',
        rejected: '#d45b69',
        closed: '#8a98aa'
    };

    const subscriptionPlans = {
        tier_0_50: { label: '0–50 members', usd: 17, jmd: 2689 },
        tier_51_100: { label: '51–100 members', usd: 34, jmd: 5377 },
        tier_101_150: { label: '101–150 members', usd: 51, jmd: 8066 },
        tier_151_200: { label: '151–200 members', usd: 68, jmd: 10755 },
        tier_201_300: { label: '201–300 members', usd: 85, jmd: 13444 },
        tier_301_400: { label: '301–400 members', usd: 102, jmd: 16132 },
        tier_401_500: { label: '401–500 members', usd: 119, jmd: 18821 },
        tier_501_700: { label: '501–700 members', usd: 136, jmd: 21510 },
        tier_701_900: { label: '701–900 members', usd: 153, jmd: 24199 },
        tier_901_1000: { label: '901–1,000 members', usd: 170, jmd: 26887 },
        enterprise_1001_plus: { label: '1,001+ members · Enterprise', usd: null, jmd: null }
    };

    const subscriptionPlanForMembers = (value) => {
        const members = Math.max(0, Number(value) || 0);
        if (members <= 50) return 'tier_0_50';
        if (members <= 100) return 'tier_51_100';
        if (members <= 150) return 'tier_101_150';
        if (members <= 200) return 'tier_151_200';
        if (members <= 300) return 'tier_201_300';
        if (members <= 400) return 'tier_301_400';
        if (members <= 500) return 'tier_401_500';
        if (members <= 700) return 'tier_501_700';
        if (members <= 900) return 'tier_701_900';
        if (members <= 1000) return 'tier_901_1000';
        return 'enterprise_1001_plus';
    };

    const formatMonthLabel = (value) => {
        if (!value) return '';
        const normalized = /^\d{4}-\d{2}$/.test(String(value)) ? `${value}-01T00:00:00Z` : value;
        const date = new Date(normalized);
        if (Number.isNaN(date.getTime())) return String(value);
        return date.toLocaleDateString([], { month: 'short', year: '2-digit', timeZone: 'UTC' });
    };

    const financeEmptyChart = (label) => `
        <div class="developer-empty finance-empty"><i class="fas fa-chart-simple" aria-hidden="true"></i><span>${escapeHtml(label)}</span></div>
    `;

    const renderRevenueChart = (series) => {
        const el = document.getElementById('financeRevenueChart');
        if (!el) return;
        const points = normalizeList(series).map((entry) => ({
            label: formatMonthLabel(entry.month),
            value: Number(entry.revenueUsd) || 0
        }));
        if (!points.length) {
            el.innerHTML = financeEmptyChart('Revenue history will appear after the first reporting month.');
            return;
        }

        const width = 760;
        const height = 270;
        const padding = { left: 58, right: 20, top: 24, bottom: 46 };
        const chartWidth = width - padding.left - padding.right;
        const chartHeight = height - padding.top - padding.bottom;
        const maxValue = Math.max(...points.map((point) => point.value), 1);
        const stepX = points.length > 1 ? chartWidth / (points.length - 1) : 0;
        const coordinates = points.map((point, index) => ({
            ...point,
            x: padding.left + (points.length === 1 ? chartWidth / 2 : index * stepX),
            y: padding.top + chartHeight - ((point.value / maxValue) * chartHeight)
        }));
        const line = coordinates.map((point) => `${point.x.toFixed(2)},${point.y.toFixed(2)}`).join(' ');
        const area = `${padding.left},${padding.top + chartHeight} ${line} ${padding.left + chartWidth},${padding.top + chartHeight}`;
        const labelEvery = Math.max(1, Math.ceil(points.length / 6));
        const grid = [0, 0.25, 0.5, 0.75, 1].map((ratio) => {
            const y = padding.top + (chartHeight * ratio);
            const value = maxValue * (1 - ratio);
            return `<line x1="${padding.left}" y1="${y}" x2="${padding.left + chartWidth}" y2="${y}" class="finance-grid-line"/><text x="${padding.left - 10}" y="${y + 4}" text-anchor="end" class="finance-axis-label">${escapeHtml(formatMoney(value, 'USD'))}</text>`;
        }).join('');
        const labels = coordinates.map((point, index) => index % labelEvery === 0 || index === coordinates.length - 1
            ? `<text x="${point.x}" y="${height - 15}" text-anchor="middle" class="finance-axis-label">${escapeHtml(point.label)}</text>`
            : '').join('');
        const markers = coordinates.map((point) => `<circle cx="${point.x}" cy="${point.y}" r="4" class="finance-line-point"><title>${escapeHtml(point.label)}: ${escapeHtml(formatMoney(point.value, 'USD'))}</title></circle>`).join('');

        el.innerHTML = `
            <svg class="finance-line-chart" viewBox="0 0 ${width} ${height}" role="img" aria-label="Monthly recurring revenue in US dollars">
                <defs><linearGradient id="financeRevenueFill" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#2f67cc" stop-opacity=".28"/><stop offset="1" stop-color="#2f67cc" stop-opacity=".02"/></linearGradient></defs>
                ${grid}
                <polygon points="${area}" fill="url(#financeRevenueFill)"/>
                <polyline points="${line}" class="finance-line-path"/>
                ${markers}${labels}
            </svg>
        `;
    };

    const renderActivityChart = (series) => {
        const el = document.getElementById('financeActivityChart');
        if (!el) return;
        const rows = normalizeList(series).map((entry) => ({
            label: formatMonthLabel(entry.month),
            requests: Number(entry.requests) || 0,
            activated: Number(entry.activated) || 0,
            cancelled: Number(entry.cancelled) || 0
        }));
        if (!rows.length) {
            el.innerHTML = financeEmptyChart('Request activity will appear when churches submit subscription changes.');
            return;
        }
        const maxValue = Math.max(...rows.flatMap((row) => [row.requests, row.activated, row.cancelled]), 1);
        el.innerHTML = `
            <div class="finance-bar-legend"><span><i class="finance-dot finance-dot-gold"></i> Requests</span><span><i class="finance-dot finance-dot-green"></i> Activated</span><span><i class="finance-dot finance-dot-red"></i> Cancelled</span></div>
            <div class="finance-grouped-chart" role="img" aria-label="Monthly subscription request, activation, and cancellation counts">
                ${rows.map((row) => `
                    <div class="finance-grouped-column">
                        <div class="finance-grouped-bars">
                            <i class="finance-bar-request" style="height:${Math.max(3, (row.requests / maxValue) * 100)}%" title="${escapeHtml(`${row.label}: ${row.requests} requests`)}"></i>
                            <i class="finance-bar-activated" style="height:${Math.max(3, (row.activated / maxValue) * 100)}%" title="${escapeHtml(`${row.label}: ${row.activated} activated`)}"></i>
                            <i class="finance-bar-cancelled" style="height:${Math.max(3, (row.cancelled / maxValue) * 100)}%" title="${escapeHtml(`${row.label}: ${row.cancelled} cancelled`)}"></i>
                        </div>
                        <span>${escapeHtml(row.label)}</span>
                    </div>
                `).join('')}
            </div>
        `;
    };

    const renderStatusChart = (distribution) => {
        const el = document.getElementById('financeStatusChart');
        if (!el) return;
        const rows = normalizeList(distribution)
            .map((entry) => ({ status: String(entry.status || 'unknown').toLowerCase(), count: Number(entry.count) || 0 }))
            .filter((entry) => entry.count > 0);
        const total = rows.reduce((sum, entry) => sum + entry.count, 0);
        if (!total) {
            el.innerHTML = financeEmptyChart('No subscription status data is available yet.');
            return;
        }
        let cursor = 0;
        const segments = rows.map((entry) => {
            const start = cursor;
            cursor += (entry.count / total) * 360;
            return `${financeStatusColors[entry.status] || '#9aa8bd'} ${start}deg ${cursor}deg`;
        }).join(', ');
        el.innerHTML = `
            <div class="finance-donut-layout">
                <div class="finance-donut" style="background:conic-gradient(${segments})" role="img" aria-label="${escapeHtml(`${total} subscriptions grouped by status`)}"><div><strong>${formatNumber(total)}</strong><span>Total</span></div></div>
                <div class="finance-donut-legend">${rows.map((entry) => `<div><i style="background:${financeStatusColors[entry.status] || '#9aa8bd'}"></i><span>${escapeHtml(entry.status.replaceAll('_', ' '))}</span><strong>${formatNumber(entry.count)}</strong></div>`).join('')}</div>
            </div>
        `;
    };

    const renderTierChart = (distribution) => {
        const el = document.getElementById('financeTierChart');
        if (!el) return;
        const rows = normalizeList(distribution).map((entry) => ({
            label: entry.label || entry.tierCode || 'Unknown tier',
            churches: Number(entry.churchCount) || 0,
            members: Number(entry.members) || 0,
            usd: Number(entry.monthlyUsd) || 0,
            jmd: Number(entry.monthlyJmd) || 0
        }));
        if (!rows.length) {
            el.innerHTML = financeEmptyChart('Tier distribution will appear as churches subscribe.');
            return;
        }
        const maxChurches = Math.max(...rows.map((row) => row.churches), 1);
        el.innerHTML = `<div class="finance-tier-bars" role="img" aria-label="Subscribed churches grouped by member tier">${rows.map((row) => `
            <div class="finance-tier-row">
                <div><strong>${escapeHtml(row.label)}</strong><span>${formatNumber(row.members)} members · ${escapeHtml(formatMoney(row.usd, 'USD'))} <small>(${escapeHtml(formatMoney(row.jmd, 'JMD'))})</small></span></div>
                <div class="finance-tier-track"><i style="width:${Math.max(2, (row.churches / maxChurches) * 100)}%"></i></div>
                <b>${formatNumber(row.churches)}</b>
            </div>
        `).join('')}</div>`;
    };

    const loadFinancialDashboard = async () => {
        const months = Math.min(24, Math.max(1, Number(document.getElementById('financialMonthRange')?.value || 12)));
        setLoading('financeKpis', 'Loading financial summary');
        setLoading('financeRevenueChart', 'Loading revenue history');
        setLoading('financeStatusChart', 'Loading subscription status');
        setLoading('financeTierChart', 'Loading plan coverage');
        setLoading('financeActivityChart', 'Loading request activity');
        const data = await rpc('developer_get_financial_dashboard', { p_months: months });
        const summary = data?.summary || {};
        const kpis = [
            ['Monthly recurring revenue', `${formatMoney(summary.monthlyRecurringRevenueUsd, 'USD')} (${formatMoney(summary.monthlyRecurringRevenueJmd, 'JMD')})`, 'fa-arrow-trend-up', 'blue'],
            ['Active subscriptions', formatNumber(summary.activeSubscriptions), 'fa-circle-check', 'green'],
            ['Active members covered', formatNumber(summary.activeMembers), 'fa-people-group', 'gold'],
            ['Open requests', formatNumber(summary.openRequests), 'fa-inbox', 'purple'],
            ['Enterprise requests', formatNumber(summary.enterpriseRequests), 'fa-building', 'navy'],
            ['Past due', formatNumber(summary.pastDueSubscriptions), 'fa-triangle-exclamation', 'red']
        ];
        document.getElementById('financeKpis').innerHTML = kpis.map(([label, value, icon, tone]) => `
            <article class="finance-kpi-card finance-kpi-${tone}"><span><i class="fas ${icon}" aria-hidden="true"></i>${escapeHtml(label)}</span><strong>${escapeHtml(value)}</strong></article>
        `).join('');
        renderRevenueChart(data?.monthlyTrend);
        renderActivityChart(data?.monthlyTrend);
        renderStatusChart(data?.statusDistribution);
        renderTierChart(data?.tierDistribution);
    };

    const renderFinanceRequestDetail = (request) => {
        const currentStatus = String(request.status || 'pending').toLowerCase();
        const transitions = financeRequestTransitions[currentStatus] || [];
        openModal(
            request.churchName || 'Subscription request',
            `
                <div class="developer-detail-grid">
                    ${detailRow('Request type', String(request.requestType || '').replaceAll('_', ' '))}
                    ${detailRow('Status', currentStatus.replaceAll('_', ' '))}
                    ${detailRow('Requested tier', request.requestedTierCode || 'Custom')}
                    ${detailRow('Member snapshot', formatNumber(request.memberCountSnapshot))}
                    ${detailRow('Monthly amount', request.monthlyUsd == null ? 'Custom quote' : `${formatMoney(request.monthlyUsd, 'USD')} (${formatMoney(request.monthlyJmd, 'JMD')})`)}
                    ${detailRow('Submitted', formatDate(request.createdAt))}
                    ${detailRow('Contact', request.contactName || request.contactEmail)}
                    ${detailRow('Contact email', request.contactEmail)}
                    ${detailRow('Contact phone', request.contactPhone)}
                    ${detailRow('Assigned to', request.assignedTo)}
                    <div class="developer-detail-item developer-detail-full"><strong>Church message</strong><span>${escapeHtml(request.message || 'No message provided.')}</span></div>
                    <div class="developer-detail-item developer-detail-full"><strong>Developer notes</strong><span>${escapeHtml(request.developerNotes || 'No developer notes yet.')}</span></div>
                </div>
            `,
            `
                <button class="btn btn-secondary" data-close-modal="true">Close</button>
                <button class="btn btn-secondary" data-action="open-subscription-event" data-context="${escapeAttrJson(request)}"><i class="fas fa-money-check-dollar"></i> Manage subscription</button>
                ${transitions.map((status) => `<button class="btn ${status === 'approved' ? 'btn-primary' : 'btn-secondary'}" data-action="update-subscription-request" data-id="${escapeHtml(request.id)}" data-status="${escapeHtml(status)}" data-request="${escapeAttrJson(request)}">${escapeHtml(status.replaceAll('_', ' '))}</button>`).join('')}
            `
        );
    };

    const renderEnterpriseQuoteForm = (request) => {
        if (request.requestedTierCode !== 'enterprise_1001_plus') {
            throw new Error('Custom quote amounts are only available for enterprise requests.');
        }
        openModal(
            `Enterprise quote · ${request.churchName || 'Church'}`,
            `
                <form id="enterpriseQuoteForm" class="developer-access-form">
                    <div class="subscription-form-notice"><i class="fas fa-file-invoice-dollar" aria-hidden="true"></i><p>Both monthly amounts are required. They are saved on this request and become authoritative when the subscription is activated.</p></div>
                    <div class="developer-detail-grid">
                        ${detailRow('Church', request.churchName || request.churchId)}
                        ${detailRow('Active-member snapshot', formatNumber(request.memberCountSnapshot))}
                    </div>
                    <div class="subscription-event-grid">
                        <label class="developer-form-field"><span>Monthly USD quote</span><input type="number" class="developer-wide-control" name="monthlyUsd" min="1" step="1" value="${escapeHtml(request.monthlyUsd ?? '')}" required></label>
                        <label class="developer-form-field"><span>Approximate monthly JMD quote</span><input type="number" class="developer-wide-control" name="monthlyJmd" min="1" step="1" value="${escapeHtml(request.monthlyJmd ?? '')}" required></label>
                    </div>
                    <label class="developer-form-field"><span>Internal quote note</span><textarea class="developer-wide-control subscription-notes-input" name="notes" maxlength="4000" rows="4" placeholder="Quote assumptions, approval, and follow-up details">${escapeHtml(request.developerNotes || '')}</textarea></label>
                </form>
            `,
            `
                <button class="btn btn-secondary" data-close-modal="true">Cancel</button>
                <button class="btn btn-primary" data-action="save-enterprise-quote" data-id="${escapeHtml(request.id)}"><i class="fas fa-file-signature"></i> Save and mark quoted</button>
            `
        );
    };

    const loadFinanceRequests = async () => {
        setLoading('financeRequestList', 'Loading subscription requests');
        const status = document.getElementById('financeRequestStatusFilter')?.value || null;
        const search = document.getElementById('financeRequestSearch')?.value?.trim() || null;
        const data = await rpc('developer_list_subscription_requests', {
            p_status: status,
            p_search: search,
            p_limit: 100,
            p_offset: 0
        });
        const requests = normalizeList(data?.items);
        renderTable('financeRequestList', ['Church', 'Request', 'Members & price', 'Contact', 'Submitted', 'Status', 'Actions'], requests.map((request) => {
            const currentStatus = String(request.status || 'pending').toLowerCase();
            const transitions = financeRequestTransitions[currentStatus] || [];
            return `
                <tr>
                    <td><strong>${escapeHtml(request.churchName || request.churchId || 'Unknown church')}</strong><small>${escapeHtml(request.churchId || '')}</small></td>
                    <td><strong>${escapeHtml(String(request.requestType || '').replaceAll('_', ' '))}</strong><small>${escapeHtml(request.requestedTierCode || 'Custom tier')}</small></td>
                    <td><strong>${formatNumber(request.memberCountSnapshot)} members</strong><small>${request.monthlyUsd == null ? 'Custom quote' : `${escapeHtml(formatMoney(request.monthlyUsd, 'USD'))} (${escapeHtml(formatMoney(request.monthlyJmd, 'JMD'))})`}</small></td>
                    <td><strong>${escapeHtml(request.contactName || 'Not recorded')}</strong><span>${escapeHtml(request.contactEmail || '')}</span></td>
                    <td><span>${escapeHtml(formatDate(request.createdAt))}</span></td>
                        <td>${statusBadge(currentStatus)}</td>
                        <td><div class="developer-action-row finance-request-actions">
                            <button class="developer-icon-btn" title="View request" aria-label="View ${escapeHtml(request.churchName || 'subscription')} request" data-action="view-subscription-request" data-request="${escapeAttrJson(request)}"><i class="fas fa-eye"></i></button>
                            <button class="developer-icon-btn" title="Manage subscription" aria-label="Manage ${escapeHtml(request.churchName || 'church')} subscription" data-action="open-subscription-event" data-context="${escapeAttrJson(request)}"><i class="fas fa-money-check-dollar"></i></button>
                            ${transitions.slice(0, 3).map((nextStatus) => `<button class="developer-icon-btn ${nextStatus === 'rejected' || nextStatus === 'cancelled' ? 'danger' : ''}" title="Mark ${escapeHtml(nextStatus.replaceAll('_', ' '))}" aria-label="Mark request ${escapeHtml(nextStatus.replaceAll('_', ' '))}" data-action="update-subscription-request" data-id="${escapeHtml(request.id)}" data-status="${escapeHtml(nextStatus)}" data-request="${escapeAttrJson(request)}"><i class="fas ${nextStatus === 'approved' ? 'fa-check' : nextStatus === 'rejected' || nextStatus === 'cancelled' ? 'fa-ban' : nextStatus === 'quoted' ? 'fa-file-invoice-dollar' : nextStatus === 'closed' ? 'fa-box-archive' : 'fa-magnifying-glass'}"></i></button>`).join('')}
                    </div></td>
                </tr>
            `;
        }), 'No subscription requests match these filters.');
    };

    const loadFinance = async () => {
        if (!canManageFinancials()) throw new Error('Your developer role does not have access to financial operations.');
        await Promise.all([loadFinancialDashboard(), loadFinanceRequests()]);
    };

    const renderSubscriptionEventForm = (rawContext) => {
        if (!canManageFinancials()) throw new Error('Your developer role does not have access to financial operations.');
        const context = rawContext || {};
        const churchId = context.churchId || context.placeId || context.id || '';
        if (!churchId) throw new Error('This subscription request is missing its church identifier.');
        const memberCount = Number(context.memberCountSnapshot ?? context.member_count ?? context.memberCount ?? 0) || 0;
        const explicitPlanCode = context.requestedTierCode || context.planCode || null;
        const displayedPlanCode = explicitPlanCode || subscriptionPlanForMembers(memberCount);
        const plan = subscriptionPlans[displayedPlanCode] || null;
        const isEnterprise = displayedPlanCode === 'enterprise_1001_plus';
        const nextMonth = new Date();
        nextMonth.setMonth(nextMonth.getMonth() + 1);
        const amountDescription = plan && !isEnterprise
            ? `${formatMoney(plan.usd, 'USD')} (${formatMoney(plan.jmd, 'JMD')}) per month · fixed by tier`
            : 'Custom enterprise quote · enter both USD and JMD amounts';
        const contextPayload = {
            churchId,
            churchName: context.churchName || context.name || 'Church subscription',
            requestId: context.requestId || (context.churchId && context.id ? context.id : null),
            planCode: explicitPlanCode,
            isEnterprise
        };

        openModal(
            `Manage subscription · ${contextPayload.churchName}`,
            `
                <form id="subscriptionEventForm" class="developer-access-form" data-enterprise="${String(isEnterprise)}">
                    <div class="subscription-form-notice"><i class="fas fa-shield-halved" aria-hidden="true"></i><p>The server rechecks the church's current active-member count before saving. A stale or incorrect tier is rejected.</p></div>
                    <div class="developer-detail-grid">
                        ${detailRow('Church', contextPayload.churchName)}
                        ${detailRow('Current member snapshot', formatNumber(memberCount))}
                        ${detailRow('Calculated plan', plan?.label || 'Automatically match current member count')}
                        ${detailRow('Monthly amount', amountDescription)}
                    </div>
                    <div class="subscription-event-grid">
                        <label class="developer-form-field">
                            <span>Financial event</span>
                            <select class="developer-wide-control" id="subscriptionEventType" name="eventType" required>
                                <option value="activated">Activate subscription</option>
                                <option value="renewed">Renew subscription</option>
                                <option value="payment_received">Record payment received</option>
                                <option value="trial_started">Grant free trial (no charge)</option>
                                <option value="marked_past_due">Mark past due</option>
                                <option value="cancelled">Cancel subscription</option>
                                <option value="note">Add internal note only</option>
                            </select>
                        </label>
                        <label class="developer-form-field" id="subscriptionPeriodField">
                            <span>Period end</span>
                            <input type="date" id="subscriptionPeriodEnd" name="periodEnd" value="${escapeHtml(nextMonth.toISOString().slice(0, 10))}">
                        </label>
                        <label class="developer-form-field subscription-enterprise-field" ${isEnterprise ? '' : 'hidden'}>
                            <span>Quoted monthly USD</span>
                            <input type="number" id="subscriptionMonthlyUsd" name="monthlyUsd" min="1" step="1" value="${escapeHtml(context.monthlyUsd ?? '')}" ${isEnterprise ? '' : 'disabled'}>
                        </label>
                        <label class="developer-form-field subscription-enterprise-field" ${isEnterprise ? '' : 'hidden'}>
                            <span>Quoted monthly JMD</span>
                            <input type="number" id="subscriptionMonthlyJmd" name="monthlyJmd" min="1" step="1" value="${escapeHtml(context.monthlyJmd ?? '')}" ${isEnterprise ? '' : 'disabled'}>
                        </label>
                    </div>
                    <div class="subscription-form-notice" id="subscriptionTrialNotice" hidden><i class="fas fa-gift" aria-hidden="true"></i><p>This gives the church full access at no charge until the period end date above. Nothing is billed and no payment amount is recorded.</p></div>
                    <label class="developer-form-field">
                        <span>Internal financial note</span>
                        <textarea class="developer-wide-control subscription-notes-input" id="subscriptionEventNotes" name="notes" maxlength="4000" rows="4" placeholder="Invoice reference, payment method, quote context, or cancellation reason"></textarea>
                    </label>
                </form>
            `,
            `
                <button class="btn btn-secondary" data-close-modal="true">Cancel</button>
                <button class="btn btn-primary" data-action="record-subscription-event" data-context="${escapeAttrJson(contextPayload)}"><i class="fas fa-floppy-disk"></i> Record event</button>
            `
        );
    };

    const collectSubscriptionEventForm = (context) => {
        const form = document.getElementById('subscriptionEventForm');
        if (!form) throw new Error('The subscription form is not available.');
        const eventType = form.querySelector('[name="eventType"]')?.value || '';
        const notes = form.querySelector('[name="notes"]')?.value?.trim() || null;
        const periodValue = form.querySelector('[name="periodEnd"]')?.value || '';
        const usesPeriod = ['activated', 'renewed', 'payment_received', 'trial_started'].includes(eventType);
        const monthlyUsdValue = form.querySelector('[name="monthlyUsd"]')?.value || '';
        const monthlyJmdValue = form.querySelector('[name="monthlyJmd"]')?.value || '';
        const monthlyUsd = monthlyUsdValue === '' ? null : Number(monthlyUsdValue);
        const monthlyJmd = monthlyJmdValue === '' ? null : Number(monthlyJmdValue);
        if (context.isEnterprise && ['activated', 'renewed', 'payment_received'].includes(eventType)) {
            if (!Number.isInteger(monthlyUsd) || monthlyUsd <= 0 || !Number.isInteger(monthlyJmd) || monthlyJmd <= 0) {
                throw new Error('Enterprise activation, renewal, and payment events require positive whole-number USD and JMD monthly amounts.');
            }
        }
        if (eventType === 'note' && !notes) throw new Error('Enter the internal note before saving.');
        return {
            p_church_id: context.churchId,
            p_event_type: eventType,
            p_status: null,
            p_plan_code: context.planCode || null,
            p_monthly_usd: context.isEnterprise ? monthlyUsd : null,
            p_monthly_jmd: context.isEnterprise ? monthlyJmd : null,
            p_period_end: usesPeriod && periodValue ? `${periodValue}T23:59:59Z` : null,
            p_notes: notes,
            p_request_id: context.requestId || null
        };
    };

    const renderChurchDetail = async (churchId) => {
        state.selectedChurchId = churchId;
        openModal(
            'Church Details',
            '<div class="developer-empty"><i class="fas fa-circle-notch fa-spin"></i><span>Loading church details...</span></div>'
        );
        const detail = await rpc('developer_get_church_detail', { p_church_id: churchId });
        const church = detail.church || {};
        const members = normalizeList(detail.members);
        const resolvedChurchId = church.placeId || church.id || churchId;

        const body = `
            <div class="developer-detail-grid">
                ${detailRow('Name', church.display_name || church.name)}
                ${detailRow('Address', church.address)}
                ${detailRow('Parish', church.parish)}
                ${detailRow('Denomination', church.denomination_label || church.denomination)}
                ${detailRow('Founded', church.founded_year)}
                ${detailRow('Contact Email', church.contact_email)}
                ${detailRow('Contact Phone', church.contact_phone)}
                ${detailRow('Website', church.website_url)}
                ${detailRow('Service Times', church.service_times_note)}
                ${detailRow('Status', `${church.church_status || church.status || 'unknown'} · public ${church.public_visibility ? 'yes' : 'no'}`)}
                <div class="developer-detail-item developer-detail-full">
                    <strong>About</strong>
                    <span>${escapeHtml(church.about || 'Not recorded')}</span>
                </div>
            </div>
            <div class="developer-modal-section">
                <h3>Members</h3>
                ${members.length ? `
                    <table class="developer-table developer-modal-table">
                        <thead>
                            <tr><th>Member</th><th>Roles</th><th>Privileges</th><th>Status</th><th>Actions</th></tr>
                        </thead>
                        <tbody>
                            ${members.map((member) => {
                                const memberUser = userPayload({
                                    id: member.user_id,
                                    uid: member.uid,
                                    email: member.email,
                                    full_name: member.full_name,
                                    placeId: resolvedChurchId,
                                    placeName: church.display_name || church.name,
                                    roles: member.roles,
                                    app_privileges: member.app_privileges,
                                    account_state: member.account_state,
                                    approval_status: member.membership_status,
                                    pending_membership_id: String(member.membership_status || '').toLowerCase() === 'pending' ? member.membership_id : '',
                                    is_developer: member.is_developer
                                });
                                return `
                                    <tr>
                                        <td>
                                            <strong>${escapeHtml(member.full_name || member.email || 'Member')}</strong>
                                            <span>${escapeHtml(member.email || '')}</span>
                                        </td>
                                        <td><span>${escapeHtml(previewList(member.roles, 'Member'))}</span></td>
                                        <td><span>${escapeHtml(previewList(member.app_privileges, 'No extra privileges'))}</span></td>
                                        <td>${statusBadge(member.membership_status)}<small>${escapeHtml(member.account_state || '')}</small></td>
                                        <td>
                                            <div class="developer-action-row">
                                                ${String(member.membership_status || '').toLowerCase() === 'pending' ? `<button class="developer-icon-btn" title="Approve member" data-action="approve-member" data-id="${escapeHtml(member.membership_id)}"><i class="fas fa-user-check"></i></button>` : ''}
                                                <button class="developer-icon-btn" title="Change roles and privileges" data-action="edit-user-access" data-user="${escapeAttrJson(memberUser)}"><i class="fas fa-user-gear"></i></button>
                                                <button class="developer-icon-btn danger" title="Delete account from Supabase" data-action="delete-user" data-id="${escapeHtml(member.user_id)}" data-email="${escapeHtml(member.email || '')}"><i class="fas fa-trash"></i></button>
                                            </div>
                                        </td>
                                    </tr>
                                `;
                            }).join('')}
                        </tbody>
                    </table>
                ` : '<div class="developer-empty"><i class="fas fa-users"></i><span>No members found for this church.</span></div>'}
            </div>
        `;

        const actions = `
            <button class="btn btn-secondary" data-action="prompt-setup" data-id="${escapeHtml(resolvedChurchId)}"><i class="fas fa-paper-plane"></i> Prompt Setup</button>
            ${canManageFinancials() ? `
                <button class="btn btn-secondary" data-action="open-subscription-event" data-context="${escapeAttrJson({ churchId: resolvedChurchId, churchName: church.display_name || church.name || 'Church', memberCountSnapshot: members.filter((member) => String(member.membership_status || '').toLowerCase() === 'active').length })}"><i class="fas fa-money-check-dollar"></i> Manage Subscription</button>
            ` : ''}
            <button class="btn btn-secondary danger" data-action="suspend-church" data-id="${escapeHtml(resolvedChurchId)}">Suspend</button>
        `;

        openModal(church.display_name || church.name || 'Church Details', body, actions);
    };

    const renderRequestDetail = (request) => {
        state.selectedChurchId = null;
        const canReview = ['submitted', 'under_review', 'needs_information'].includes(String(request.status || '').toLowerCase());
        openModal(
            request.name || 'Church Request',
            `
                <div class="developer-detail-grid">
                    ${detailRow('Church', request.name)}
                    ${detailRow('Location', request.location_name)}
                    ${detailRow('Address', request.address)}
                    ${detailRow('Parish', request.parish)}
                    ${detailRow('Denomination', request.denomination)}
                    ${detailRow('Pastor/Admin', request.pastor_name)}
                    ${detailRow('Email', request.pastor_email)}
                    ${detailRow('Phone', request.pastor_phone)}
                    ${detailRow('Status', request.status)}
                    ${detailRow('Submitted', formatDate(request.created_at))}
                    <div class="developer-detail-item developer-detail-full">
                        <strong>Applicant Note</strong>
                        <span>${escapeHtml(request.applicant_note || 'Not recorded')}</span>
                    </div>
                    <div class="developer-detail-item developer-detail-full">
                        <strong>Review Notes</strong>
                        <span>${escapeHtml(request.review_notes || 'Not recorded')}</span>
                    </div>
                </div>
            `,
            canReview ? `
                <button class="btn btn-primary" data-action="approve-church" data-id="${escapeHtml(request.id)}">Approve Church</button>
                <button class="btn btn-secondary danger" data-action="reject-church" data-id="${escapeHtml(request.id)}">Deny Request</button>
            ` : ''
        );
    };

    const renderIssueDetail = (issue) => {
        state.selectedChurchId = null;
        const attachments = normalizeList(issue.attachmentUrls);
        openModal(
            issue.summary || 'Issue Report',
            `
                <div class="developer-detail-grid">
                    ${detailRow('Ticket', issue.ticketId)}
                    ${detailRow('Reporter', issue.reporterEmail)}
                    ${detailRow('Church', issue.church_name || issue.churchId)}
                    ${detailRow('Type', issue.issueType)}
                    ${detailRow('App Section', issue.appSection)}
                    ${detailRow('Impact', issue.impact)}
                    ${detailRow('Status', issue.status)}
                    ${detailRow('Submitted', formatDate(issue.createdAt))}
                    <div class="developer-detail-item developer-detail-full">
                        <strong>Description</strong>
                        <span>${escapeHtml(issue.description || 'Not recorded')}</span>
                    </div>
                    <div class="developer-detail-item developer-detail-full">
                        <strong>Developer Notes</strong>
                        <span>${escapeHtml(issue.developer_notes || 'Not recorded')}</span>
                    </div>
                    <div class="developer-detail-item developer-detail-full">
                        <strong>Attachments</strong>
                        <span>${attachments.length ? attachments.map((url) => `<a href="${escapeHtml(url)}" target="_blank" rel="noopener">Open attachment</a>`).join(' ') : 'None'}</span>
                    </div>
                    <div class="developer-detail-item developer-detail-full">
                        <strong>Device Info</strong>
                        <code>${escapeHtml(JSON.stringify(issue.deviceInfo || {}, null, 2))}</code>
                    </div>
                </div>
            `,
            `
                <button class="btn btn-secondary" data-action="update-issue" data-id="${escapeHtml(issue.id)}" data-status="acknowledged">Acknowledge</button>
                <button class="btn btn-secondary" data-action="update-issue" data-id="${escapeHtml(issue.id)}" data-status="in_review">Mark In Review</button>
                <button class="btn btn-primary" data-action="update-issue" data-id="${escapeHtml(issue.id)}" data-status="resolved">Resolve</button>
            `
        );
    };

    const loadActiveView = async () => {
        showMessage('developerPortalMessage', '');
        try {
            if (state.activeView === 'overview') await loadOverview();
            if (state.activeView === 'churches') await loadChurches();
            if (state.activeView === 'requests') await loadChurchRequests();
            if (state.activeView === 'issues') await loadIssues();
            if (state.activeView === 'content') await loadScheduledContent();
            if (state.activeView === 'finance') await loadFinance();
            if (state.activeView === 'users') await loadUsers();
            if (state.activeView === 'developers') await loadDeveloperAccounts();
            if (state.activeView === 'audit') await loadAudit();
        } catch (error) {
            showMessage('developerPortalMessage', error.message || 'Unable to load developer portal data.', 'error');
        }
    };

    const switchView = (view) => {
        if (view === 'finance' && !canManageFinancials()) {
            showMessage('developerPortalMessage', 'Your developer role does not have access to financial operations.', 'error');
            return;
        }
        state.activeView = view;
        document.querySelectorAll('.developer-nav-btn').forEach((button) => {
            button.classList.toggle('active', button.dataset.view === view);
        });
        document.querySelectorAll('.developer-view').forEach((section) => {
            section.classList.toggle('active', section.id === `view-${view}`);
        });
        loadActiveView();
    };

    const refreshContext = async () => {
        await loadActiveView();
    };

    const handleAction = async (button) => {
        const action = button.dataset.action;
        const id = button.dataset.id;
        const email = button.dataset.email;
        button.disabled = true;

        try {
            if (action === 'view-church') {
                await renderChurchDetail(id);
                return;
            }
            if (action === 'view-request') {
                renderRequestDetail(JSON.parse(button.dataset.request || '{}'));
                return;
            }
            if (action === 'view-issue') {
                renderIssueDetail(JSON.parse(button.dataset.issue || '{}'));
                return;
            }
            if (action === 'edit-user-access') {
                renderUserAccessModal(JSON.parse(button.dataset.user || '{}'));
                return;
            }
            if (action === 'save-user-access') {
                const formData = collectUserAccessForm();
                const churchToRefresh = state.selectedChurchId;
                await rpc('developer_update_user_access', {
                    p_user_id: id,
                    p_roles: formData.roles,
                    p_app_privileges: formData.privileges,
                    p_account_state: formData.accountState
                });
                showMessage('developerPortalMessage', 'User roles, privileges, and account state were updated.', 'success');
                if (churchToRefresh) {
                    await renderChurchDetail(churchToRefresh);
                } else {
                    closeModal();
                }
                await refreshContext();
            }
            if (action === 'approve-member') {
                const churchToRefresh = state.selectedChurchId;
                const reason = window.prompt('Optional approval note for the audit log:') || 'Approved from developer portal.';
                await rpc('developer_approve_member_request', {
                    p_membership_id: id,
                    p_reason: reason
                });
                const delivery = await flushQueuedEmails();
                if (churchToRefresh) await renderChurchDetail(churchToRefresh);
                await refreshContext();
                showMessage('developerPortalMessage', `Member approved. The user can access church features.${emailDeliverySuffix(delivery)}`, delivery?.ok === false ? 'error' : 'success');
            }
            if (action === 'delete-user') {
                if (!id) throw new Error('User ID is missing.');
                const typed = window.prompt(`This permanently deletes ${email || 'this user'} from Supabase. Type DELETE to continue.`);
                if (typed !== 'DELETE') return;
                const reason = window.prompt('Reason for deleting this account?') || 'Deleted from developer portal.';
                const churchToRefresh = state.selectedChurchId;
                await rpc('developer_delete_user_account', {
                    p_user_id: id,
                    p_reason: reason
                });
                const delivery = await flushQueuedEmails();
                if (churchToRefresh) {
                    await renderChurchDetail(churchToRefresh);
                } else {
                    closeModal();
                }
                await refreshContext();
                showMessage('developerPortalMessage', `User account deleted from Supabase.${emailDeliverySuffix(delivery)}`, delivery?.ok === false ? 'error' : 'success');
            }
            if (action === 'approve-church') {
                await rpc('developer_approve_church_registration', { p_church_id: id });
                const delivery = await flushQueuedEmails();
                closeModal();
                await refreshContext();
                showMessage('developerPortalMessage', `Church registration approved.${emailDeliverySuffix(delivery)}`, delivery?.ok === false ? 'error' : 'success');
            }
            if (action === 'reject-church') {
                const reason = window.prompt('Reason for denying this church registration?') || '';
                await rpc('developer_reject_church_registration', { p_church_id: id, p_reason: reason });
                const delivery = await flushQueuedEmails();
                closeModal();
                await refreshContext();
                showMessage('developerPortalMessage', `Church registration denied.${emailDeliverySuffix(delivery)}`, delivery?.ok === false ? 'error' : 'success');
            }
            if (action === 'suspend-church') {
                const reason = window.prompt('Reason for suspending this church?') || '';
                await rpc('developer_suspend_church', { p_church_id: id, p_reason: reason });
                closeModal();
                showMessage('developerPortalMessage', 'Church suspended and hidden from public search.', 'success');
                await refreshContext();
            }
            if (action === 'prompt-setup') {
                await rpc('developer_send_church_setup_prompt', { p_church_id: id, p_message: null });
                const delivery = await flushQueuedEmails();
                await refreshContext();
                showMessage('developerPortalMessage', `Setup prompt prepared for the church contact.${emailDeliverySuffix(delivery)}`, delivery?.ok === false ? 'error' : 'success');
            }
            if (action === 'update-issue') {
                const nextStatus = button.dataset.status;
                const note = window.prompt('Optional note for the user and audit log:') || '';
                await rpc('developer_update_support_ticket', {
                    p_ticket_id: id,
                    p_status: nextStatus,
                    p_note: note
                });
                const delivery = await flushQueuedEmails();
                closeModal();
                await refreshContext();
                showMessage('developerPortalMessage', `Issue marked ${nextStatus.replaceAll('_', ' ')}.${emailDeliverySuffix(delivery)}`, delivery?.ok === false ? 'error' : 'success');
            }
            if (action === 'regenerate-scheduled-quiz') {
                if (!canManageScheduledContent()) {
                    throw new Error('Your developer role can preview scheduled content but cannot replace quiz questions.');
                }
                if (!window.confirm('Replace these questions while keeping the same release date and time?')) return;
                await invokeFunction('generate-daily-bible-quiz', {
                    action: 'regenerate_scheduled',
                    quiz_id: id
                });
                await loadScheduledContent();
                showMessage('developerPortalMessage', 'Scheduled questions replaced. The release date and time did not change.', 'success');
            }
            if (action === 'regenerate-scheduled-daily-word') {
                if (!canManageScheduledContent()) {
                    throw new Error('Your developer role can preview scheduled content but cannot replace Daily Words.');
                }
                if (!window.confirm('Replace this Daily Word while keeping the same release time and study chapter?')) return;
                await invokeFunction('generate-daily-motivation', {
                    action: 'regenerate_scheduled',
                    motivation_id: id
                });
                await loadScheduledContent();
                showMessage('developerPortalMessage', 'Scheduled Daily Word replaced. Its release time and study chapter did not change.', 'success');
            }
            if (action === 'view-subscription-request') {
                if (!canManageFinancials()) throw new Error('Your developer role does not have access to financial operations.');
                renderFinanceRequestDetail(JSON.parse(button.dataset.request || '{}'));
                return;
            }
            if (action === 'open-subscription-event') {
                renderSubscriptionEventForm(JSON.parse(button.dataset.context || '{}'));
                return;
            }
            if (action === 'record-subscription-event') {
                if (!canManageFinancials()) throw new Error('Your developer role does not have access to financial operations.');
                const context = JSON.parse(button.dataset.context || '{}');
                const params = collectSubscriptionEventForm(context);
                if (['marked_past_due', 'cancelled'].includes(params.p_event_type)) {
                    const confirmed = window.confirm(`Confirm subscription event: ${params.p_event_type.replaceAll('_', ' ')}? This changes the church's access state.`);
                    if (!confirmed) return;
                }
                await rpc('developer_record_subscription_event', params);
                closeModal();
                if (state.activeView === 'finance') {
                    await Promise.all([loadFinancialDashboard(), loadFinanceRequests()]);
                } else if (state.activeView === 'churches') {
                    await loadChurches();
                }
                showMessage('developerPortalMessage', `Subscription event recorded: ${params.p_event_type.replaceAll('_', ' ')}.`, 'success');
            }
            if (action === 'update-subscription-request') {
                if (!canManageFinancials()) throw new Error('Your developer role does not have access to financial operations.');
                const nextStatus = String(button.dataset.status || '').toLowerCase();
                const request = JSON.parse(button.dataset.request || '{}');
                if (nextStatus === 'quoted' && request.requestedTierCode === 'enterprise_1001_plus') {
                    renderEnterpriseQuoteForm(request);
                    return;
                }
                const note = window.prompt(`Optional internal note for ${nextStatus.replaceAll('_', ' ')}:`) || null;
                await rpc('developer_update_subscription_request', {
                    p_request_id: id,
                    p_status: nextStatus,
                    p_developer_notes: note,
                    p_monthly_usd: null,
                    p_monthly_jmd: null
                });
                closeModal();
                await Promise.all([loadFinancialDashboard(), loadFinanceRequests()]);
                showMessage('developerPortalMessage', `Subscription request marked ${nextStatus.replaceAll('_', ' ')}.`, 'success');
            }
            if (action === 'save-enterprise-quote') {
                if (!canManageFinancials()) throw new Error('Your developer role does not have access to financial operations.');
                const form = document.getElementById('enterpriseQuoteForm');
                if (!form) throw new Error('The enterprise quote form is not available.');
                const monthlyUsd = Number(form.querySelector('[name="monthlyUsd"]')?.value || 0);
                const monthlyJmd = Number(form.querySelector('[name="monthlyJmd"]')?.value || 0);
                const note = form.querySelector('[name="notes"]')?.value?.trim() || null;
                if (!Number.isInteger(monthlyUsd) || monthlyUsd <= 0 || !Number.isInteger(monthlyJmd) || monthlyJmd <= 0) {
                    throw new Error('Enter positive whole-number monthly amounts in both USD and JMD.');
                }
                await rpc('developer_update_subscription_request', {
                    p_request_id: id,
                    p_status: 'quoted',
                    p_developer_notes: note,
                    p_monthly_usd: monthlyUsd,
                    p_monthly_jmd: monthlyJmd
                });
                closeModal();
                await Promise.all([loadFinancialDashboard(), loadFinanceRequests()]);
                showMessage('developerPortalMessage', `Enterprise quote saved at ${formatMoney(monthlyUsd, 'USD')} (${formatMoney(monthlyJmd, 'JMD')}) per month.`, 'success');
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
        const closeButton = event.target.closest('[data-close-modal]');
        if (closeButton) closeModal();

        const actionButton = event.target.closest('[data-action]');
        if (actionButton) handleAction(actionButton);

        const refreshButton = event.target.closest('[data-refresh]');
        if (refreshButton) loadActiveView();
    });

    document.getElementById('churchDetailModal')?.addEventListener('click', (event) => {
        if (event.target.id === 'churchDetailModal') closeModal();
    });

    document.getElementById('developerSignOutBtn')?.addEventListener('click', async () => {
        await client.auth.signOut();
        window.location.href = 'login.html';
    });

    document.getElementById('churchStatusFilter')?.addEventListener('change', loadChurches);
    document.getElementById('churchSearchFilter')?.addEventListener('input', debounce(loadChurches));
    document.getElementById('churchRequestStatusFilter')?.addEventListener('change', loadChurchRequests);
    document.getElementById('churchRequestSearch')?.addEventListener('input', debounce(loadChurchRequests));
    document.getElementById('issueStatusFilter')?.addEventListener('change', loadIssues);
    document.getElementById('issueSearchInput')?.addEventListener('input', debounce(loadIssues));
    document.getElementById('userSearchInput')?.addEventListener('input', debounce(loadUsers));
    document.getElementById('financialMonthRange')?.addEventListener('change', loadFinancialDashboard);
    document.getElementById('financeRequestStatusFilter')?.addEventListener('change', loadFinanceRequests);
    document.getElementById('financeRequestSearch')?.addEventListener('input', debounce(loadFinanceRequests));

    document.getElementById('quizUniquenessToggle')?.addEventListener('change', async (event) => {
        const toggle = event.currentTarget;
        const previous = toggle.dataset.current === 'true';
        const requested = toggle.checked;
        if (!requested && !window.confirm('Turn off the daily uniqueness guarantee? This allows the generator to reuse old questions after the configured history window.')) {
            toggle.checked = previous;
            return;
        }
        toggle.disabled = true;
        try {
            const settings = await rpc('developer_update_quiz_uniqueness_settings', {
                p_guarantee_unique: requested,
                p_relaxed_history_days: 60
            });
            const enabled = settings?.guarantee_unique !== false;
            toggle.checked = enabled;
            toggle.dataset.current = String(enabled);
            const label = document.getElementById('quizUniquenessLabel');
            if (label) label.textContent = enabled ? 'On' : 'Off';
            showMessage('developerPortalMessage', enabled
                ? 'Daily quiz uniqueness is guaranteed. The scheduler will fail safely instead of repeating a retained question.'
                : 'Strict uniqueness is off. Questions may be reused after the 60-day history window.', 'success');
        } catch (error) {
            toggle.checked = previous;
            showMessage('developerPortalMessage', error.message || 'Could not update quiz uniqueness.', 'error');
        } finally {
            toggle.disabled = toggle.dataset.canManage !== 'true';
        }
    });

    document.addEventListener('change', (event) => {
        if (event.target.id !== 'subscriptionEventType') return;
        const eventType = event.target.value;
        const form = event.target.closest('form');
        const usesPeriod = ['activated', 'renewed', 'payment_received', 'trial_started'].includes(eventType);
        const periodField = document.getElementById('subscriptionPeriodField');
        const periodInput = document.getElementById('subscriptionPeriodEnd');
        if (periodField) periodField.hidden = !usesPeriod;
        if (periodInput) periodInput.disabled = !usesPeriod;
        const trialNotice = document.getElementById('subscriptionTrialNotice');
        if (trialNotice) trialNotice.hidden = eventType !== 'trial_started';
        const requiresEnterpriseAmount = form?.dataset.enterprise === 'true'
            && ['activated', 'renewed', 'payment_received'].includes(eventType);
        ['subscriptionMonthlyUsd', 'subscriptionMonthlyJmd'].forEach((id) => {
            const input = document.getElementById(id);
            if (input) input.required = requiresEnterpriseAmount;
        });
    });

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
