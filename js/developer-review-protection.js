(() => {
    const esc = text => window.GraceDeveloperTools.escape(text);
    function render(root, data, client, refresh) {
        root.innerHTML = `<details ${data.configured ? '' : 'open'}><summary>Protect Google Play review access</summary>
          <p>Use the login email addresses and church IDs from your Play Console review instructions. Passwords are kept unchanged; do not paste them here. The server verifies that each account exists and belongs to the selected church.</p>
          <form data-review-form class="developer-access-form">
            <label class="developer-form-field">Review login emails (one per line)<textarea name="emails" rows="3" required maxlength="6500" placeholder="reviewer@example.com">${esc((data.review_emails || []).join('\n'))}</textarea></label>
            <label class="developer-form-field">Review church IDs (one per line)<textarea name="churches" rows="2" required maxlength="3200" placeholder="Copy the church ID from Church management">${esc((data.churches || []).map(c=>c.id).join('\n'))}</textarea></label>
            <p>Preserves these churches, their members, related content, subscriptions and media, plus accounts their records depend on. Saving this protection does not run a reset.</p>
            <button type="submit" class="btn btn-secondary">Verify and save review protection</button>
            <p data-review-message role="status" aria-live="polite"></p>
          </form></details>`;
        const form=root.querySelector('[data-review-form]');
        form.addEventListener('submit',async event=>{
            event.preventDefault();const button=form.querySelector('button');if(button.disabled)return;
            button.disabled=true;
            const message=root.querySelector('[data-review-message]');
            const split=value=>value.split(/[\n,]+/).map(s=>s.trim()).filter(Boolean);
            try {
                message.textContent='Verifying accounts, church and dependent records…';
                const result=await client.functions.invoke('developer-platform-operations',{body:{action:'protect_review',
                    emails:split(form.elements.emails.value),church_ids:split(form.elements.churches.value)}});
                if(result.error){let detail;try{detail=(await result.error.context.json()).error;}catch(_){}throw new Error(detail || 'Review protection could not be saved.');}
                if(result.data?.error)throw new Error(result.data.error);
                await refresh();
            }catch(error){message.textContent=error.message || 'Please check the review accounts and church IDs.';button.disabled=false;}
        });
    }
    window.GraceReviewProtection={render};
})();
