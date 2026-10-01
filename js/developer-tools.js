/* Platform tools use the signed-in developer session; never a service key. */
(() => {
    const escape = (value) => String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));
    const imageTypes = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' };
    const canEdit = session => ['super_developer', 'security_admin', 'content_moderator'].includes(session?.developer_role);
    const unwrap = ({ data, error }) => { if (error) throw error; return data; };
    const publicImage = (client, fileName) => client.storage.from('quote-backgrounds').getPublicUrl(`quote_backgrounds/${fileName}`).data.publicUrl;
    const notice = (root, message) => { root.querySelector('[data-tool-message]').textContent = message; };

    async function loadBackgrounds(client, session) {
        const root = document.getElementById('backgroundTools');
        root.innerHTML = '<p role="status">Loading backgrounds…</p>';
        const rows = unwrap(await client.rpc('developer_list_quote_backgrounds')) || [];
        const editable = canEdit(session);
        root.innerHTML = `
          <p data-tool-message role="status" aria-live="polite"></p>
          ${editable ? `<form id="backgroundUploadForm" class="developer-panel developer-access-form">
            <h3>Add an image</h3>
            <label class="developer-form-field">Image (PNG, JPG or WebP, up to 5 MB)<input name="image" type="file" accept="image/png,image/jpeg,image/webp" required></label>
            <img data-upload-preview alt="Selected background preview" hidden style="max-width:240px;max-height:240px;object-fit:contain;border-radius:12px">
            <label class="developer-form-field">Title<input name="title" maxlength="120" required></label>
            <label class="developer-form-field">Category<input name="category" maxlength="80" placeholder="Nature, worship, abstract…"></label>
            <label class="developer-form-field">Recommended text colour<select name="color"><option value="white">White</option><option value="black">Black</option></select></label>
            <label class="developer-form-field">Text placement<select name="area"><option value="center">Centre</option><option value="upper-center">Upper centre</option><option value="left-center">Left centre</option><option value="center-right">Right centre</option></select></label>
            <button class="btn btn-primary" type="submit">Upload background</button>
          </form>` : '<p>Your role can view this catalogue. Content moderators, security admins and super developers can change it.</p>'}
          <div class="background-catalogue">${rows.map(row => `
            <article class="developer-panel" data-background="${escape(row.id)}">
              <img src="${escape(publicImage(client, row.file_name))}" alt="${escape(row.title)}" loading="lazy" style="width:100%;aspect-ratio:4/3;object-fit:cover;border-radius:12px">
              <form data-background-edit>
                <label class="developer-form-field">Title<input name="title" value="${escape(row.title)}" maxlength="120" required ${editable ? '' : 'disabled'}></label>
                <label class="developer-form-field">Category<input name="category" value="${escape(row.category)}" maxlength="80" ${editable ? '' : 'disabled'}></label>
                <label class="developer-form-field">Display order<input name="sort_order" type="number" step="1" min="0" max="100000" value="${Number(row.sort_order) || 0}" ${editable ? '' : 'disabled'}></label>
                <label class="developer-form-field">Recommended text colour<select name="recommended_text_color" ${editable ? '' : 'disabled'}>${['white', 'black'].map(color => `<option ${row.recommended_text_color === color ? 'selected' : ''}>${color}</option>`).join('')}</select></label>
                <label class="developer-form-field">Text placement<select name="safe_text_area" ${editable ? '' : 'disabled'}>${['center','upper-center','left-center','center-right'].map(area => `<option ${row.safe_text_area === area ? 'selected' : ''}>${area}</option>`).join('')}</select></label>
                <label><input name="is_active" type="checkbox" ${row.is_active ? 'checked' : ''} ${editable ? '' : 'disabled'}> Available in the app</label>
                ${editable ? '<div class="developer-action-row"><button class="btn btn-primary" type="submit">Save</button><button class="btn btn-secondary" type="button" data-background-delete>Remove</button></div>' : ''}
              </form>
            </article>`).join('')}</div>
          ${rows.length ? '' : '<p>No backgrounds yet. Add an image above to make it available in the app.</p>'}`;

        const uploadForm = root.querySelector('#backgroundUploadForm');
        let previewUrl;
        uploadForm?.elements.image.addEventListener('change', () => {
            if (previewUrl) URL.revokeObjectURL(previewUrl);
            const file = uploadForm.elements.image.files[0];
            const preview = root.querySelector('[data-upload-preview]');
            preview.hidden = !file || !imageTypes[file.type] || file.size > 5 * 1024 * 1024;
            if (!preview.hidden) { previewUrl = URL.createObjectURL(file); preview.src = previewUrl; }
        });
        uploadForm?.addEventListener('submit', async event => {
            event.preventDefault();
            const button = uploadForm.querySelector('button[type=submit]');
            if (button.disabled) return;
            button.disabled = true;
            let uploadedPath;
            try {
                const file = uploadForm.elements.image.files[0];
                validateBackgroundFile(file);
                const bitmap = await createImageBitmap(file);
                const pixels = bitmap.width * bitmap.height;
                bitmap.close();
                if (pixels > 24000000) throw new Error('Use an image smaller than 24 megapixels.');
                const title = uploadForm.elements.title.value.trim();
                if (!title) throw new Error('Enter a title.');
                const fileName = `${crypto.randomUUID()}.${imageTypes[file.type]}`;
                const path = `quote_backgrounds/${fileName}`;
                notice(root, 'Uploading image…');
                unwrap(await client.storage.from('quote-backgrounds').upload(path, file, { contentType: file.type, upsert: false }));
                uploadedPath = path;
                unwrap(await client.from('quote_backgrounds').insert({
                    file_name: fileName, title, category: uploadForm.elements.category.value.trim(),
                    recommended_text_color: uploadForm.elements.color.value,
                    safe_text_area: uploadForm.elements.area.value,
                    sort_order: Math.max(0, ...rows.map(row => Number(row.sort_order) || 0)) + 1,
                    is_active: true,
                }));
                uploadedPath = null;
                if (previewUrl) URL.revokeObjectURL(previewUrl);
                await loadBackgrounds(client, session);
                notice(root, 'Background added. It will appear in the app within five minutes.');
            } catch (error) {
                if (uploadedPath) await client.storage.from('quote-backgrounds').remove([uploadedPath]);
                notice(root, error.message || 'Could not upload the background.');
            } finally { button.disabled = false; }
        });

        for (const card of root.querySelectorAll('[data-background]')) {
            const row = rows.find(row => row.id === card.dataset.background);
            const form = card.querySelector('form');
            form.addEventListener('submit', async event => {
                event.preventDefault();
                const button = form.querySelector('button[type=submit]');
                if (!editable || button.disabled) return;
                button.disabled = true;
                try {
                    unwrap(await client.from('quote_backgrounds').update({
                        title: form.elements.title.value.trim(), category: form.elements.category.value.trim(),
                        sort_order: Number(form.elements.sort_order.value), is_active: form.elements.is_active.checked,
                        recommended_text_color: form.elements.recommended_text_color.value,
                        safe_text_area: form.elements.safe_text_area.value, updated_at: new Date().toISOString(),
                    }).eq('id', row.id));
                    notice(root, 'Background updated.');
                } catch (error) { notice(root, error.message || 'Could not save.'); }
                finally { button.disabled = false; }
            });
            card.querySelector('[data-background-delete]')?.addEventListener('click', async event => {
                if (!window.confirm(`Remove “${row.title}” from the app’s sharing backgrounds?`)) return;
                const button = event.currentTarget;
                button.disabled = true;
                try {
                    unwrap(await client.from('quote_backgrounds').delete().eq('id', row.id));
                    const removed = await client.storage.from('quote-backgrounds').remove([`quote_backgrounds/${row.file_name}`]);
                    await loadBackgrounds(client, session);
                    notice(root, removed.error ? 'Removed from the catalogue. File cleanup will retry in the background.' : 'Background removed.');
                } catch (error) { notice(root, error.message || 'Could not remove.'); button.disabled = false; }
            });
        }
    }

    function validateBackgroundFile(file) {
        if (!file || !imageTypes[file.type]) throw new Error('Choose a PNG, JPG or WebP image.');
        if (file.size === 0 || file.size > 5 * 1024 * 1024) throw new Error('Choose an image between 1 byte and 5 MB.');
    }

    async function loadOperations(client, session) {
        const root = document.getElementById('operationsTools');
        root.innerHTML = '<p role="status">Checking platform operations…</p>';
        const data = unwrap(await client.functions.invoke('developer-platform-operations', { body: { action: 'status' } }));
        window.GraceDeveloperTools.renderOperations(root, data, client, session);
    }

    function renderOperations(root, data, client, session) {
        const reset = data.reset || {};
        const count = value => Number.isFinite(Number(value)) ? Number(value).toLocaleString() : '—';
        const time = value => value ? new Date(value).toLocaleString() : 'Not yet';
        root.innerHTML = `
          <p data-tool-message role="status" aria-live="polite"></p>
          <div class="developer-action-row"><button type="button" class="btn btn-secondary" data-refresh-operations>Refresh status</button><span>Checked ${escape(time(data.checked_at))}</span></div>
          <div class="background-catalogue">
            <article class="developer-panel"><h3>Payments</h3><p>${data.payments_ready ? 'Gateway credentials configured. Confirm a real payment in the provider dashboard before opening paid subscriptions.' : 'Gateway setup is incomplete. Live subscription checkout cannot be enabled until server credentials are configured.'}</p>
              <p>Verified payment events: <strong>${count(data.payment_events)}</strong><br>Checkout sessions: <strong>${count(data.checkout_sessions)}</strong></p>
              <button type="button" class="btn btn-secondary" data-open-finance>Open financial tools</button>
              <details><summary>Connect the payment gateway</summary><p>Configure FYGARO_KEY_ID, FYGARO_SECRET_KEY, FYGARO_BUTTON_URL and FYGARO_WEBHOOK_SECRET in Supabase Edge Function secrets. Never enter secret keys in public website code.</p><p>Set the gateway webhook to:</p><code class="operation-endpoint">${escape(data.payment_webhook)}</code><p>A verified, successful webhook updates the church subscription and its access. A browser redirect alone never grants paid access. Repeated webhook events are handled idempotently.</p></details>
            </article>
            <article class="developer-panel"><h3>Media and moderation</h3><p>Private video storage: <strong>${data.media_ready ? 'Configured' : 'Needs configuration'}</strong></p><p>Storage cleanup queue: <strong>${count(data.media_cleanup_pending)}</strong><br>Reel cleanup queue: <strong>${count(data.reel_cleanup_pending)}</strong><br>Reels awaiting review: <strong>${count(data.reels_pending_review)}</strong></p><p>Database size: ${count(Math.round(Number(data.database_bytes) / 1048576))} MB</p><p>Disk activity is different from storage size. Review database performance if Supabase reports an I/O budget warning.</p></article>
          </div>
          <article class="developer-panel"><h3>Scheduled maintenance</h3><div class="developer-table-wrap"><table><thead><tr><th>Job</th><th>Schedule</th><th>Last result</th><th>Finished</th></tr></thead><tbody>${(data.schedules || []).map(job => `<tr><td>${escape(job.name)}</td><td>${job.active ? 'Enabled' : 'Disabled'}</td><td>${escape(job.last_status || 'No run recorded')}</td><td>${escape(time(job.last_finished))}</td></tr>`).join('')}</tbody></table></div><p>A successful scheduler result confirms dispatch; check function logs when a cleanup queue remains pending.</p></article>
          <article class="developer-panel reset-panel"><h3>One-time launch reset</h3>
            ${reset.used ? `<p><strong>${reset.phase === 'complete' ? 'Reset completed' : 'Reset in progress: ' + escape(reset.phase)}</strong></p><p>This one-time action has been consumed and cannot be started again.</p><p>Started: ${escape(time(reset.started_at))}<br>Completed: ${escape(time(reset.completed_at))}</p>${reset.last_error ? `<p role="alert">${escape(reset.last_error)}</p>` : ''}` : `
              <p>This permanently removes all other user accounts, churches, posts, messages, reels, attendance, subscriptions and uploaded media. Only <strong>${escape(reset.preserved_account)}</strong> and essential app definitions remain.</p>
              <p>Resetting app subscriptions does not cancel charges at an external payment provider. Backups and provider records follow their separate retention policies.</p>
              <p>App writes and new signups pause during cleanup. It takes at least 16 minutes so previously issued upload links can expire. Keep a backup before using this irreversible action.</p>
              <p>${count(reset.other_accounts)} other accounts · ${count(reset.churches)} churches · ${count(reset.storage_objects)} stored files, plus all R2 media</p>
              ${reset.can_start && session?.developer_role === 'super_developer' ? (data.reset_ready ? `
                <form data-reset-form class="developer-access-form">
                  <label class="developer-form-field">Your current password<input name="password" type="password" autocomplete="current-password" required maxlength="1024"></label>
                  <label class="developer-form-field">Type DELETE ALL DATA EXCEPT MY DEVELOPER ACCOUNT<input name="confirmation" autocomplete="off" spellcheck="false" required></label>
                  <label><input name="understood" type="checkbox" required> I understand this permanently deletes all other accounts and app data.</label>
                  <button type="submit" class="btn reset-button">Permanently reset app once</button>
                </form>` : '<p role="status">Reset is unavailable until the private media service and scheduled cleanup worker are configured.</p>') : '<p>Only the platform owner can start this reset.</p>'}`}
          </article>`;
        root.querySelector('[data-refresh-operations]').addEventListener('click', () => loadOperations(client, session).catch(error => notice(root, error.message || 'Could not refresh status.')));
        root.querySelector('[data-open-finance]').addEventListener('click', () => document.querySelector('[data-view="finance"]')?.click());
        root.querySelector('[data-reset-form]')?.addEventListener('submit', async event => {
            event.preventDefault();
            const form = event.currentTarget;
            const button = form.querySelector('button[type=submit]');
            if (button.disabled) return;
            if (form.elements.confirmation.value !== 'DELETE ALL DATA EXCEPT MY DEVELOPER ACCOUNT' || !form.elements.understood.checked) {
                notice(root, 'Enter the exact confirmation phrase and acknowledge the deletion.');
                return;
            }
            button.disabled = true;
            try {
                const password = form.elements.password.value;
                form.elements.password.value = '';
                notice(root, 'Verifying your password and reset readiness…');
                unwrap(await client.functions.invoke('developer-platform-operations', { body: {
                    action: 'reset', password, confirmation: form.elements.confirmation.value,
                } }));
                // Remove the button immediately; server state is the durable authority.
                form.remove();
                notice(root, 'Reset accepted. Cleanup continues on the server; refresh to see progress.');
                await loadOperations(client, session);
            } catch (error) {
                // The request may have succeeded even if its response was interrupted.
                // Reload authoritative state before allowing another attempt.
                try { await loadOperations(client, session); }
                catch { button.disabled = true; }
                notice(root, error.message || 'The request could not be confirmed. Refresh the status before retrying.');
            }
        });
    }

    window.GraceDeveloperTools = { loadBackgrounds, loadOperations, renderOperations, validateBackgroundFile, escape, unwrap };
})();
