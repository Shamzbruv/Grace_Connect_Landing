import re

file_name = 'js/main.js'
with open(file_name, 'r') as f:
    content = f.read()

# 1. Inject DOMContentLoaded Session Check and Completion logic
session_logic = """
    const completeRegistrationBtn = document.getElementById('completeRegistrationBtn');
    
    // Check session on load to handle returning users from email verification
    client.auth.getSession().then(async ({ data: { session } }) => {
        if (!session) return;
        
        // Church Registration Completion
        const pendingChurchStr = localStorage.getItem('pendingChurchRegistration');
        if (pendingChurchStr && document.getElementById('completionState') && document.getElementById('churchRegisterForm')) {
            document.getElementById('churchRegisterForm').style.display = 'none';
            document.querySelector('.form-header').style.display = 'none';
            document.getElementById('completionState').style.display = 'block';
            
            if (completeRegistrationBtn) {
                completeRegistrationBtn.onclick = async () => {
                    completeRegistrationBtn.disabled = true;
                    completeRegistrationBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Submitting...';
                    try {
                        const pendingChurch = JSON.parse(pendingChurchStr);
                        let legalAcceptanceId = null;
                        const requiredPolicies = ['terms', 'privacy', 'community_guidelines', 'age_policy', 'church_admin_access', 'church_registration_authority', 'data_retention'];
                        
                        for (const policyKey of requiredPolicies) {
                            const { data: acceptanceId, error: acceptanceError } = await client.rpc('accept_policy_document', {
                                target_document_key: policyKey,
                                target_document_version: LEGAL_DOCUMENT_VERSION,
                                acceptance_source: 'web_church_registration',
                                metadata: { isAdultConfirmed: true, authorizedRepresentative: true }
                            });
                            if (acceptanceError) throw acceptanceError;
                            if (!legalAcceptanceId) legalAcceptanceId = acceptanceId;
                        }

                        const { error: requestError } = await client.rpc('submit_church_registration', {
                            ...pendingChurch,
                            legal_acceptance: legalAcceptanceId
                        });
                        if (requestError) throw requestError;
                        
                        localStorage.removeItem('pendingChurchRegistration');
                        document.getElementById('completionState').style.display = 'none';
                        document.getElementById('registerSuccessState').style.display = 'block';
                        await client.auth.signOut();
                    } catch (err) {
                        showMessage('completionMessage', `<i class="fas fa-exclamation-triangle"></i> ${err.message}`, 'error');
                        completeRegistrationBtn.disabled = false;
                        completeRegistrationBtn.innerHTML = 'Submit Church Application';
                    }
                };
            }
        }
        
        // Member Signup Completion
        const pendingMemberStr = localStorage.getItem('pendingMemberSignup');
        if (pendingMemberStr && document.getElementById('completionState') && document.getElementById('memberSearchSection')) {
            document.getElementById('memberSearchSection').style.display = 'none';
            document.getElementById('memberSignupForm').style.display = 'none';
            document.querySelector('.form-header').style.display = 'none';
            document.getElementById('completionState').style.display = 'block';
            
            if (completeRegistrationBtn) {
                completeRegistrationBtn.onclick = async () => {
                    completeRegistrationBtn.disabled = true;
                    completeRegistrationBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Submitting...';
                    try {
                        const pendingMember = JSON.parse(pendingMemberStr);
                        const requiredPolicies = ['terms', 'privacy', 'community_guidelines', 'age_policy', 'location_disclosure'];
                        
                        for (const policyKey of requiredPolicies) {
                            const { error: acceptanceError } = await client.rpc('accept_policy_document', {
                                target_document_key: policyKey,
                                target_document_version: LEGAL_DOCUMENT_VERSION,
                                acceptance_source: 'web_member_signup',
                                metadata: { isAdultConfirmed: true, locationNoticeAccepted: true }
                            });
                            if (acceptanceError) throw acceptanceError;
                        }

                        const { error: requestError } = await client.rpc('request_church_membership', {
                            target_church_id: pendingMember.target_church_id,
                            request_note: 'Requested from landing page signup.'
                        });
                        if (requestError) throw requestError;
                        
                        localStorage.removeItem('pendingMemberSignup');
                        document.getElementById('completionState').style.display = 'none';
                        document.getElementById('memberSuccessState').style.display = 'block';
                        await client.auth.signOut();
                    } catch (err) {
                        showMessage('completionMessage', `<i class="fas fa-exclamation-triangle"></i> ${err.message}`, 'error');
                        completeRegistrationBtn.disabled = false;
                        completeRegistrationBtn.innerHTML = 'Submit Membership Request';
                    }
                };
            }
        }
    });

    const LEGAL_DOCUMENT_VERSION = '2026-06-24';
"""
content = content.replace("    const LEGAL_DOCUMENT_VERSION = '2026-06-24';", session_logic)

# 2. Rewrite Church Registration Submit
old_church_submit_start = "if (churchRegisterForm && submitRegBtn) {\n        churchRegisterForm.addEventListener('submit', async (e) => {"
old_church_submit_end = "submitRegBtn.innerHTML = 'Submit Registration for Approval';\n            }\n        });\n    }"

new_church_submit = """if (churchRegisterForm && submitRegBtn) {
        churchRegisterForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            
            submitRegBtn.disabled = true;
            submitRegBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Submitting...';
            showMessage('registerMessage', '', '');

            const churchName = document.getElementById('churchName').value.trim();
            const denomination = document.getElementById('denomination').value.trim();
            const customDenomVal = document.getElementById('customDenomination')?.value.trim() || null;
            const parish = document.getElementById('churchParish')?.value.trim() || null;
            const address = document.getElementById('churchAddress').value.trim();
            const adminName = document.getElementById('adminName').value.trim();
            const adminEmail = document.getElementById('adminEmail').value.trim();
            const adminPhone = document.getElementById('adminPhone').value.trim();
            const password = document.getElementById('adminPassword').value;
            const churchAgeConfirm = document.getElementById('churchAgeConfirm');
            const churchAuthorizedConfirm = document.getElementById('churchAuthorizedConfirm');
            const churchLegalAccept = document.getElementById('churchLegalAccept');

            if (!churchAgeConfirm?.checked || !churchAuthorizedConfirm?.checked || !churchLegalAccept?.checked) {
                showMessage('registerMessage', '<i class="fas fa-exclamation-triangle"></i> Please confirm that you are 18+, authorized to register this church, and accept the required legal documents before continuing.', 'error');
                submitRegBtn.disabled = false;
                submitRegBtn.innerHTML = 'Submit Registration for Approval';
                return;
            }

            // NTCOG Naming Logic Standard
            let displayChurchName = churchName;
            const selectedOption = denominationSelect ? denominationSelect.options[denominationSelect.selectedIndex] : null;
            const denomCode = selectedOption ? selectedOption.dataset.code : '';
            if (denomCode === 'ntcog' || (customDenomVal && (customDenomVal.toLowerCase().includes('new testament church of god') || customDenomVal.toLowerCase().includes('ntcog')))) {
                displayChurchName = `${churchName.replace(/new testament church of god/ig, '').replace(/ntcog/ig, '').trim()} NTCOG`;
            }

            try {
                const { data: conflictResult, error: conflictError } = await client.rpc('check_church_registration_conflicts', {
                    church_name: displayChurchName,
                    location_name: churchName,
                    address: address,
                    parish: parish,
                    denomination_id: denomination === 'other' ? null : denomination
                });

                if (conflictError) throw conflictError;

                if (conflictResult?.has_conflict) {
                    const shouldContinue = window.confirm(`${conflictResult.safe_message}\\n\\nYou can continue, but our developer review team may ask for more verification. Continue with this registration application?`);
                    if (!shouldContinue) {
                        showMessage('registerMessage', '<i class="fas fa-info-circle"></i> Registration paused. Please search the church directory or contact Grace Connect support if this church is already registered.', 'error');
                        submitRegBtn.disabled = false;
                        submitRegBtn.innerHTML = 'Submit Registration for Approval';
                        return;
                    }
                }

                // Save pending registration metadata to localStorage so we can resume after email verification
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
                }));

                const { data, error } = await client.auth.signUp({
                    email: adminEmail,
                    password: password,
                    options: {
                        data: {
                            full_name: adminName,
                            phone: adminPhone,
                            signupSource: 'web_church_registration'
                        }
                    }
                });

                if (error) throw error;

                churchRegisterForm.style.display = 'none';
                document.querySelector('.form-header').style.display = 'none';

                if (!data?.session) {
                    document.getElementById('verifyEmailState').style.display = 'block';
                } else {
                    // User already verified (e.g. disabled email verification on dev)
                    // Let the page reload or trigger completion state directly
                    location.reload();
                }
                
            } catch (error) {
                showMessage('registerMessage', `<i class="fas fa-exclamation-triangle"></i> ${error.message || 'An error occurred during registration.'}`, 'error');
                submitRegBtn.disabled = false;
                submitRegBtn.innerHTML = 'Submit Registration for Approval';
            }
        });
    }"""
pattern_church = re.compile(re.escape(old_church_submit_start) + r".*?" + re.escape("submitRegBtn.innerHTML = 'Submit Registration for Approval';\n            }\n        });\n    }"), re.DOTALL)
content = pattern_church.sub(new_church_submit, content)

# 3. Rewrite Member Signup Submit
old_member_submit_start = "memberSignupForm.addEventListener('submit', async (e) => {"
old_member_submit_end = "submitMemberBtn.innerHTML = 'Create Account';\n            }\n        });\n    }"

new_member_submit = """memberSignupForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            
            if (!selectedChurch) return;

            submitMemberBtn.disabled = true;
            submitMemberBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Creating Account...';
            showMessage('memberMessage', '', '');

            const memberName = document.getElementById('memberName').value.trim();
            const memberEmail = document.getElementById('memberEmail').value.trim();
            const memberPhone = document.getElementById('memberPhone').value.trim();
            const password = document.getElementById('memberPassword').value;
            const memberAgeConfirm = document.getElementById('memberAgeConfirm');
            const memberLegalAccept = document.getElementById('memberLegalAccept');
            const memberLocationNotice = document.getElementById('memberLocationNotice');

            if (!memberAgeConfirm?.checked || !memberLegalAccept?.checked || !memberLocationNotice?.checked) {
                showMessage('memberMessage', '<i class="fas fa-exclamation-triangle"></i> Please confirm that you are 18+ and accept the required legal documents before creating your account.', 'error');
                submitMemberBtn.disabled = false;
                submitMemberBtn.innerHTML = 'Create Account';
                return;
            }

            try {
                // Save pending request
                localStorage.setItem('pendingMemberSignup', JSON.stringify({
                    target_church_id: selectedChurch.placeId || selectedChurch.id
                }));

                const { data, error } = await client.auth.signUp({
                    email: memberEmail,
                    password: password,
                    options: {
                        data: {
                            full_name: memberName,
                            phone: memberPhone,
                            signupSource: 'web_member_signup'
                        }
                    }
                });

                if (error) throw error;

                memberSignupForm.style.display = 'none';
                document.querySelector('.form-header').style.display = 'none';
                
                if (!data?.session) {
                    document.getElementById('verifyEmailState').style.display = 'block';
                } else {
                    location.reload();
                }
                
            } catch (error) {
                showMessage('memberMessage', `<i class="fas fa-exclamation-triangle"></i> ${error.message || 'An error occurred during signup.'}`, 'error');
                submitMemberBtn.disabled = false;
                submitMemberBtn.innerHTML = 'Create Account';
            }
        });
    }"""
pattern_member = re.compile(re.escape(old_member_submit_start) + r".*?" + re.escape("submitMemberBtn.innerHTML = 'Create Account';\n            }\n        });\n    }"), re.DOTALL)
content = pattern_member.sub(new_member_submit, content)

with open(file_name, "w") as f:
    f.write(content)
