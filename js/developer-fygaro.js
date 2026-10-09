/* Owner-only, write-only API secrets. No credentials are cached in the browser. */
(() => {
    const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
    async function request(client, action, config) {
        const result = await client.functions.invoke('developer-fygaro-settings', {body:{action, ...(config ? {config} : {})}});
        if (result.error) {
            let message = 'Payment settings could not be updated. Please try again.';
            try { message = (await result.error.context.json()).error || message; } catch (_) { /* No response details available. */ }
            throw new Error(message);
        }
        if (result.data?.error) throw new Error(result.data.error);
        return result.data;
    }
    async function load(root, client) {
        root.innerHTML = '<p role="status">Loading secure payment settings…</p>';
        render(root, await request(client,'status'), client);
    }
    function render(root, data, client) {
        root.innerHTML = `<h3>Fygaro connection</h3>
          <p>Connect once here. API secrets are encrypted on the server and are never displayed again.</p>
          <p><strong>${data.enabled ? 'Website checkout enabled' : 'Website checkout paused'}</strong>${data.configured ? ' · Credentials saved' : ' · Setup required'}</p>
          <ol><li>In Fygaro, create API credentials and a payment button that supports signed (JWT) payments. Fygaro requires a compatible plan.</li>
          <li>Paste the key ID, secret and payment-button URL below.</li>
          <li>In the Fygaro button’s advanced settings, set the Hook URL and Return URL below. Select the matching default webhook API credential in Fygaro.</li></ol>
          <label class="developer-form-field">Hook URL<input readonly data-fygaro-hook value="${esc(data.webhook_url)}"></label>
          <button type="button" class="btn btn-secondary" data-copy-hook>Copy Hook URL</button>
          <label class="developer-form-field">Return URL<input readonly value="${esc(data.return_url)}"></label>
          <p>A verified payment automatically records the church’s subscription and unlocks its plan. A redirect alone never grants access. Use a real test payment to confirm your Fygaro account and webhook setup.</p>
          <p data-fygaro-message role="status" aria-live="polite"></p>
          <form data-fygaro-form class="developer-access-form" autocomplete="off">
            <label class="developer-form-field">Fygaro payment-button URL<input name="button_url" type="url" required maxlength="2048" placeholder="https://www.fygaro.com/en/pb/…" value="${esc(data.button_url)}"></label>
            <label class="developer-form-field">API key ID<input name="key_id" required maxlength="200" spellcheck="false" value="${esc(data.key_id)}"></label>
            <label class="developer-form-field">API secret<input name="secret_key" type="password" maxlength="4096" autocomplete="new-password" ${data.has_secret ? 'placeholder="Leave blank to keep the saved secret"' : 'required'}></label>
            <label><input name="same_webhook_key" type="checkbox" ${data.same_webhook_key ? 'checked' : ''}> Use the same API credential for checkout and webhook verification</label>
            <div data-webhook-fields ${data.same_webhook_key ? 'hidden' : ''}>
              <label class="developer-form-field">Webhook API key ID<input name="webhook_key_id" maxlength="200" spellcheck="false" value="${esc(data.webhook_key_id)}"></label>
              <label class="developer-form-field">Webhook API secret<input name="webhook_secret_key" type="password" maxlength="4096" autocomplete="new-password" placeholder="${data.has_webhook_secret ? 'Leave blank to keep the saved secret' : 'Enter the webhook API secret'}"></label>
            </div>
            <label><input name="enabled" type="checkbox" ${data.enabled ? 'checked' : ''}> Enable website checkout (Fygaro Hook URL and credentials are configured)</label>
            <button type="submit" class="btn btn-primary">Save payment settings</button>
          </form>`;
        const form=root.querySelector('[data-fygaro-form]');
        const message=text=>{root.querySelector('[data-fygaro-message]').textContent=text;};
        form.elements.same_webhook_key.addEventListener('change',()=>{
            root.querySelector('[data-webhook-fields]').hidden=form.elements.same_webhook_key.checked;
        });
        root.querySelector('[data-copy-hook]').addEventListener('click',async()=>{
            try { await navigator.clipboard.writeText(data.webhook_url); message('Hook URL copied. Paste it into your Fygaro payment-button settings.'); }
            catch (_) {root.querySelector('[data-fygaro-hook]').select();message('Select and copy the Hook URL shown above.');}
        });
        form.addEventListener('submit',async event=>{
            event.preventDefault();
            const button=form.querySelector('button[type=submit]');
            if(button.disabled)return;
            button.disabled=true;
            const config=Object.fromEntries(['button_url','key_id','secret_key','webhook_key_id','webhook_secret_key'].map(k=>[k,form.elements[k].value.trim()]));
            config.same_webhook_key=form.elements.same_webhook_key.checked;
            config.enabled=form.elements.enabled.checked;
            form.elements.secret_key.value='';form.elements.webhook_secret_key.value='';
            message('Saving encrypted credentials…');
            try {
                const saved=await request(client,'save',config);
                render(root,saved,client);
                root.querySelector('[data-fygaro-message]').textContent='Settings saved. Checkout and webhook verification now use this configuration. Confirm a real test payment before launch.';
            } catch(error) {message(error.message || 'Settings could not be saved. Re-enter any new secrets and try again.');button.disabled=false;}
            finally {config.secret_key='';config.webhook_secret_key='';}
        });
    }
    window.GraceFygaroSettings={load,render};
})();
