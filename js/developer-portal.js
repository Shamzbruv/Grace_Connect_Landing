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

    const normalizeList = (value) => Array.isArray(value) ? value : [];

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
                            <button class="developer-icon-btn" title="Grant 1 free month" data-action="grant-subscription" data-id="${escapeHtml(churchId)}" data-months="1"><i class="fas fa-calendar-plus"></i></button>
                            <button class="developer-icon-btn danger" title="Turn subscription off" data-action="clear-subscription" data-id="${escapeHtml(churchId)}"><i class="fas fa-lock"></i></button>
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
            <button class="btn btn-primary" data-action="grant-subscription" data-id="${escapeHtml(resolvedChurchId)}" data-months="1">Free 1 Month</button>
            <button class="btn btn-secondary" data-action="grant-subscription" data-id="${escapeHtml(resolvedChurchId)}" data-months="3">Free 3 Months</button>
            <button class="btn btn-secondary danger" data-action="clear-subscription" data-id="${escapeHtml(resolvedChurchId)}">Turn Subscription Off</button>
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
                if (state.selectedChurchId) await renderChurchDetail(state.selectedChurchId);
                await refreshContext();
            }
            if (action === 'clear-subscription') {
                const reason = window.prompt('Reason for turning this church subscription off?') || '';
                await rpc('developer_clear_church_subscription', {
                    p_church_id: id,
                    p_reason: reason || 'Developer manual disable'
                });
                showMessage('developerPortalMessage', 'Church subscription turned off. Users keep feed access only.', 'success');
                if (state.selectedChurchId) await renderChurchDetail(state.selectedChurchId);
                await refreshContext();
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
