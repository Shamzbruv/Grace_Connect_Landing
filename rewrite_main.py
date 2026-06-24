import re

file_name = 'js/main.js'
with open(file_name, 'r') as f:
    content = f.read()

# 1. Wrap session check
old_session_logic = """    // Check session on load to handle returning users from email verification
    client.auth.getSession().then(async ({ data: { session } }) => {"""
new_session_logic = """    const isChurchRegistrationPage = Boolean(document.getElementById('churchRegisterForm'));
    const isMemberSignupPage = Boolean(document.getElementById('memberSignupForm'));

    // Check session on load to handle returning users from email verification
    if (client && (isChurchRegistrationPage || isMemberSignupPage)) {
        client.auth.getSession().then(async ({ data: { session } }) => {"""
content = content.replace(old_session_logic, new_session_logic)

# Since we wrapped the getSession block in `if (client && ...) { ... }`, we need to add the closing brace.
# Find the end of the `getSession` then block which is right before `const LEGAL_DOCUMENT_VERSION = '2026-06-24';`
content = content.replace("    const LEGAL_DOCUMENT_VERSION = '2026-06-24';", "    }\n\n    const LEGAL_DOCUMENT_VERSION = '2026-06-24';")

# 2. Add owner_email and expires_at to Church Registration localStorage
old_church_ls = """                // Save pending registration metadata to localStorage so we can resume after email verification
                localStorage.setItem('pendingChurchRegistration', JSON.stringify({
                    church_name: displayChurchName,
                    location: churchName,
                    church_address: address,
                    church_parish: parish,
                    denomination: denomination === 'other' ? null : denomination,
                    custom_denomination: customDenomVal,
                    pastor_full_name: adminName,
                    pastor_contact_email: adminEmail,
                    pastor_contact_phone: adminPhone
                }));"""
new_church_ls = """                // Save pending registration metadata to localStorage so we can resume after email verification
                localStorage.setItem('pendingChurchRegistration', JSON.stringify({
                    flow_type: 'church_registration',
                    owner_email: adminEmail,
                    expires_at: Date.now() + 24 * 60 * 60 * 1000,
                    created_at: Date.now(),
                    church_name: displayChurchName,
                    location: churchName,
                    church_address: address,
                    church_parish: parish,
                    denomination: denomination === 'other' ? null : denomination,
                    custom_denomination: customDenomVal,
                    pastor_full_name: adminName,
                    pastor_contact_email: adminEmail,
                    pastor_contact_phone: adminPhone
                }));"""
content = content.replace(old_church_ls, new_church_ls)

# 3. Add emailRedirectTo for Church Registration
old_church_signup = """                const { data, error } = await client.auth.signUp({
                    email: adminEmail,
                    password: password,
                    options: {
                        data: {"""
new_church_signup = """                const { data, error } = await client.auth.signUp({
                    email: adminEmail,
                    password: password,
                    options: {
                        emailRedirectTo: `${window.location.origin}/register-church.html?complete=1`,
                        data: {"""
content = content.replace(old_church_signup, new_church_signup)

# 4. Add owner_email and expires_at to Member Signup localStorage
old_member_ls = """                // Save pending request
                localStorage.setItem('pendingMemberSignup', JSON.stringify({
                    target_church_id: selectedChurch.placeId || selectedChurch.id
                }));"""
new_member_ls = """                // Save pending request
                localStorage.setItem('pendingMemberSignup', JSON.stringify({
                    flow_type: 'member_signup',
                    owner_email: memberEmail,
                    expires_at: Date.now() + 24 * 60 * 60 * 1000,
                    created_at: Date.now(),
                    target_church_id: selectedChurch.placeId || selectedChurch.id
                }));"""
content = content.replace(old_member_ls, new_member_ls)

# 5. Add emailRedirectTo for Member Signup
old_member_signup = """                const { data, error } = await client.auth.signUp({
                    email: memberEmail,
                    password: password,
                    options: {
                        data: {"""
new_member_signup = """                const { data, error } = await client.auth.signUp({
                    email: memberEmail,
                    password: password,
                    options: {
                        emailRedirectTo: `${window.location.origin}/member-signup.html?complete=1`,
                        data: {"""
content = content.replace(old_member_signup, new_member_signup)

# 6. Update getSession logic to enforce owner_email and expires_at
old_church_resume = """        const pendingChurchStr = localStorage.getItem('pendingChurchRegistration');
        if (pendingChurchStr && document.getElementById('completionState') && document.getElementById('churchRegisterForm')) {
            document.getElementById('churchRegisterForm').style.display = 'none';
            document.querySelector('.form-header').style.display = 'none';
            document.getElementById('completionState').style.display = 'block';"""

new_church_resume = """        const pendingChurchStr = localStorage.getItem('pendingChurchRegistration');
        if (pendingChurchStr && document.getElementById('completionState') && document.getElementById('churchRegisterForm')) {
            const pendingChurch = JSON.parse(pendingChurchStr);
            if (pendingChurch.owner_email !== session.user.email || Date.now() > pendingChurch.expires_at) {
                showMessage('registerMessage', '<i class="fas fa-exclamation-triangle"></i> We could not safely restore this application on this device. Please sign in and start the completion step again.', 'error');
                return;
            }

            document.getElementById('churchRegisterForm').style.display = 'none';
            document.querySelector('.form-header').style.display = 'none';
            document.getElementById('completionState').style.display = 'block';"""
content = content.replace(old_church_resume, new_church_resume)

old_church_submit_fn = "const pendingChurch = JSON.parse(pendingChurchStr);"
content = content.replace(old_church_submit_fn, "", 1)

old_member_resume = """        const pendingMemberStr = localStorage.getItem('pendingMemberSignup');
        if (pendingMemberStr && document.getElementById('completionState') && document.getElementById('memberSearchSection')) {
            document.getElementById('memberSearchSection').style.display = 'none';
            document.getElementById('memberSignupForm').style.display = 'none';
            document.querySelector('.form-header').style.display = 'none';
            document.getElementById('completionState').style.display = 'block';"""

new_member_resume = """        const pendingMemberStr = localStorage.getItem('pendingMemberSignup');
        if (pendingMemberStr && document.getElementById('completionState') && document.getElementById('memberSearchSection')) {
            const pendingMember = JSON.parse(pendingMemberStr);
            if (pendingMember.owner_email !== session.user.email || Date.now() > pendingMember.expires_at) {
                showMessage('searchMessage', '<i class="fas fa-exclamation-triangle"></i> We could not safely restore this application on this device. Please sign in and start the completion step again.', 'error');
                document.getElementById('searchMessage').style.display = 'block';
                return;
            }

            document.getElementById('memberSearchSection').style.display = 'none';
            document.getElementById('memberSignupForm').style.display = 'none';
            document.querySelector('.form-header').style.display = 'none';
            document.getElementById('completionState').style.display = 'block';"""
content = content.replace(old_member_resume, new_member_resume)

old_member_submit_fn = "const pendingMember = JSON.parse(pendingMemberStr);"
content = content.replace(old_member_submit_fn, "", 1)

with open(file_name, "w") as f:
    f.write(content)
