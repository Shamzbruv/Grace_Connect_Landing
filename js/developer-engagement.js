/* Uses the signed-in developer session. No service credentials or review claims. */
(() => {
    const escape = value => window.GraceDeveloperTools.escape(value);
    const unwrap = result => window.GraceDeveloperTools.unwrap(result);
    const time = value => value ? new Date(value).toLocaleString() : 'Not yet';
    const usage = seconds => `${Math.floor(Math.max(0, Number(seconds) || 0) / 3600)}h ${Math.floor(Math.max(0, Number(seconds) || 0) % 3600 / 60)}m`;
    const canResend = row => row.response == null && !!row.last_prompted_at && !row.resend_requested_at;
    async function loadRatings(client, session, offset = 0) {
        const root = document.getElementById('experienceTools');
        root.innerHTML = '<p role="status">Loading app feedback…</p>';
        const data = unwrap(await client.rpc('developer_app_experience', { p_action: 'list', p_limit: 50, p_offset: offset }));
        root.innerHTML = `
            <p data-feedback-message role="status" aria-live="polite"></p>
            <article class="developer-panel"><h3>Growing together in faith</h3><p>“Is Grace Connect helping you grow closer to God and connect with others in faith?”</p>
            <p>The first invitation follows two hours of active app use. Unanswered invitations wait at least two more hours of use and 24 hours before returning, with a maximum of three automatic invitations. A developer resend also respects those limits. Answered surveys are not sent again.</p>
            <p>Both answers receive the same opportunity to leave honest feedback. Store-link opens are recorded; Apple and Google do not confirm an individual review submission to the app.</p></article>
            ${session?.developer_role === 'super_developer' ? `<form data-ios-config class="developer-panel developer-access-form"><label class="developer-form-field">Apple App Store listing URL<input name="ios_url" type="url" placeholder="https://apps.apple.com/app/id…" value="${escape(data.configuration?.ios_url || '')}"></label><p>Leave blank until the iPhone app is published. This prevents sending members to a missing listing.</p><button type="submit" class="btn btn-secondary">Save iPhone listing</button></form>` : ''}
            <div class="developer-table-wrap"><table><thead><tr><th>Member</th><th>Active use</th><th>Answer</th><th>Invitations</th><th>Store opened</th><th>Review submitted</th><th>Next invitation</th><th>Action</th></tr></thead><tbody>
            ${(data.entries || []).map(row => `<tr><td>${escape(row.display_name)}</td><td>${usage(row.active_seconds)}</td><td>${row.response == null ? 'Unanswered' : row.response ? 'Yes' : 'No'}<br>${escape(time(row.answered_at))}</td><td>${Number(row.prompt_count) || 0}</td><td>${escape(time(row.last_store_opened_at))}${row.store_platform ? '<br>' + escape(row.store_platform === 'ios' ? 'App Store' : 'Google Play') : ''}</td><td>Not verifiable</td><td>${row.response != null ? 'Answered — no repeat' : `${usage(row.remaining_active_seconds)} more active use<br>Not before ${escape(time(row.next_prompt_after))}`}</td><td>${canResend(row) ? `<button class="btn btn-secondary" data-survey-resend="${escape(row.user_id)}">Queue reminder</button>` : row.resend_requested_at ? 'Reminder queued' : '—'}</td></tr>`).join('')}
            </tbody></table></div>${data.entries?.length ? '' : '<p>Records will appear after members use the updated app. Usage from older builds cannot be reconstructed.</p>'}
            <div class="developer-action-row"><button class="btn btn-secondary" data-previous ${offset ? '' : 'disabled'}>Previous</button><span>${offset + (data.entries?.length ? 1 : 0)}–${offset + (data.entries?.length || 0)} of ${Number(data.total) || 0}</span><button class="btn btn-secondary" data-next ${offset + 50 < Number(data.total) ? '' : 'disabled'}>Next</button></div>`;
        const message = text => { root.querySelector('[data-feedback-message]').textContent = text; };
        const reload = async next => { try { await loadRatings(client, session, next); } catch (error) { message(error.message || 'Could not load feedback.'); } };
        root.querySelector('[data-previous]').addEventListener('click', () => reload(Math.max(0, offset - 50)));
        root.querySelector('[data-next]').addEventListener('click', () => reload(offset + 50));
        root.querySelectorAll('[data-survey-resend]').forEach(button => button.addEventListener('click', async () => {
            button.disabled = true;
            try {
                unwrap(await client.rpc('developer_app_experience', { p_action: 'resend', p_user_id: button.dataset.surveyResend }));
                await loadRatings(client, session, offset);
            } catch (error) { message(error.message || 'Could not queue reminder.'); button.disabled = false; }
        }));
        root.querySelector('[data-ios-config]')?.addEventListener('submit', async event => {
            event.preventDefault(); const form = event.currentTarget, button = form.querySelector('button'); button.disabled = true;
            try { unwrap(await client.rpc('developer_app_experience', { p_action: 'configure_ios', p_ios_url: form.elements.ios_url.value.trim() || null })); message('iPhone listing saved.'); }
            catch (error) { message(error.message || 'Could not save listing.'); }
            finally { button.disabled = false; }
        });
    }
    async function loadPreparation(client, session, month = new Date().toISOString().slice(0, 7)) {
        const root = document.getElementById('preparationTools');
        root.innerHTML = '<p role="status">Loading monthly preparation…</p>';
        const data = unwrap(await client.rpc('developer_content_batch', { p_action: 'status', p_month: `${month}-01` }));
        root.innerHTML = `<p data-preparation-message role="status" aria-live="polite"></p>
          <article class="developer-panel"><h3>One shared quiz each day</h3><p>Global members and church members receive the same five questions. Preparation checks retained history across all audiences and keeps chapter-study quizzes linked to the Daily Word.</p><p>Next month is queued on the 25th. The worker prepares one date at a time, with limited retries after errors. Daily release uses the prepared content; opening a quiz does not create a new AI request.</p>
          <form data-preparation-form class="developer-action-row"><label>Month <input name="month" type="month" required value="${escape(month)}"></label><button class="btn btn-secondary" type="submit">View month</button><button class="btn btn-primary" type="button" data-queue-month>Prepare month</button><button class="btn btn-secondary" type="button" data-retry-month>Retry failed days</button></form></article>
          <div class="developer-table-wrap"><table><thead><tr><th>Date</th><th>State</th><th>Preparing</th><th>Attempts</th><th>Completed</th><th>Next attempt</th><th>Issue</th></tr></thead><tbody>${(data.days || []).map(row => `<tr><td>${escape(row.content_date)}</td><td>${escape(row.status)}</td><td>${row.stage === 'quiz' ? 'Quiz' : 'Daily Word'}</td><td>${Number(row.attempts) || 0}</td><td>${escape(time(row.completed_at))}</td><td>${row.status === 'pending' ? escape(time(row.next_attempt_at)) : '—'}</td><td>${escape(row.last_error || '—')}</td></tr>`).join('')}</tbody></table></div>${data.days?.length ? '' : '<p>No dates have been queued for this month.</p>'}`;
        const form = root.querySelector('[data-preparation-form]');
        const act = async action => {
            const target = form.elements.month.value;
            if (!/^\d{4}-\d{2}$/.test(target)) return;
            form.querySelectorAll('button').forEach(button => button.disabled = true);
            try { if (action !== 'status') unwrap(await client.rpc('developer_content_batch', { p_action: action, p_month: `${target}-01` })); await loadPreparation(client, session, target); }
            catch (error) { root.querySelector('[data-preparation-message]').textContent = error.message || 'Could not update preparation.'; form.querySelectorAll('button').forEach(button => button.disabled = false); }
        };
        form.addEventListener('submit', event => { event.preventDefault(); act('status'); });
        root.querySelector('[data-queue-month]').addEventListener('click', () => act('queue'));
        root.querySelector('[data-retry-month]').addEventListener('click', () => act('retry'));
    }
    window.GraceExperienceTools = { loadRatings, loadPreparation, usage, canResend };
})();
