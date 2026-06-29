document.addEventListener('DOMContentLoaded', () => {
    const client = window.gcSupabase;


    const completeRegistrationBtn = document.getElementById('completeRegistrationBtn');
    
    const isChurchRegistrationPage = Boolean(document.getElementById('churchRegisterForm'));
    const isMemberSignupPage = Boolean(document.getElementById('memberSignupForm'));

    // Check session on load to handle returning users from email verification
    if (client && (isChurchRegistrationPage || isMemberSignupPage)) {
        client.auth.getSession().then(async ({ data: { session } }) => {
        if (!session) return;
        
        // Church Registration Completion
        const pendingChurchStr = localStorage.getItem('pendingChurchRegistration');
        if (pendingChurchStr && document.getElementById('completionState') && document.getElementById('churchRegisterForm')) {
            let pendingChurch;
            try {
                pendingChurch = JSON.parse(pendingChurchStr);
            } catch {
                localStorage.removeItem('pendingChurchRegistration');
                showMessage('registerMessage', '<i class="fas fa-exclamation-triangle"></i> We could not restore this application. Please start again.', 'error');
                return;
            }

            if (
                pendingChurch.owner_email?.trim().toLowerCase() !== session.user.email?.trim().toLowerCase() ||
                Date.now() > pendingChurch.expires_at
            ) {
                localStorage.removeItem('pendingChurchRegistration');
                showMessage('registerMessage', '<i class="fas fa-exclamation-triangle"></i> We could not safely restore this application on this device. Please sign in and start the completion step again.', 'error');
                return;
            }

            document.getElementById('churchRegisterForm').style.display = 'none';
            document.querySelector('.form-header').style.display = 'none';
            document.getElementById('completionState').style.display = 'block';
            
            if (completeRegistrationBtn) {
                completeRegistrationBtn.onclick = async () => {
                    completeRegistrationBtn.disabled = true;
                    completeRegistrationBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Submitting...';
                    try {
                        let legalAcceptanceId = null;
                        
                        // 1. Fetch active policies required for church_application
                        const { data: policies, error: fetchError } = await client.rpc('get_active_policy_documents', {
                            p_flow_type: 'church_application'
                        });
                        if (fetchError) throw fetchError;
                        
                        const isMatch = checkPoliciesSnapshot(policies, pendingChurch.accepted_policies);
                        const repromptContainer = document.getElementById('repromptPoliciesContainer_church');
                        
                        if (!isMatch && (!repromptContainer || repromptContainer.dataset.validated !== 'true')) {
                            if (repromptContainer && repromptContainer.style.display !== 'none') {
                                const checkboxes = repromptContainer.querySelectorAll('input[type="checkbox"]');
                                let allChecked = true;
                                checkboxes.forEach(cb => { if(!cb.checked) allChecked = false; });
                                if(!allChecked) {
                                    showMessage('completionMessage', '<i class="fas fa-exclamation-triangle"></i> Please accept all required policies.', 'error');
                                    completeRegistrationBtn.disabled = false;
                                    completeRegistrationBtn.innerHTML = 'Submit Church Application';
                                    return;
                                } else {
                                    repromptContainer.dataset.validated = 'true';
                                }
                            } else {
                                const msgContainer = document.getElementById('completionMessage');
                                msgContainer.innerHTML = '';
                                
                                const repromptWrapper = document.createElement('div');
                                repromptWrapper.style.marginTop = '1rem';
                                repromptWrapper.style.textAlign = 'left';
                                
                                const header = document.createElement('p');
                                header.className = 'text-error';
                                header.style.fontWeight = 'bold';
                                header.style.marginBottom = '0.5rem';
                                header.innerHTML = '<i class="fas fa-exclamation-circle"></i> Policy Requirements Have Changed';
                                repromptWrapper.appendChild(header);
                                
                                const desc = document.createElement('p');
                                desc.style.marginBottom = '1rem';
                                desc.textContent = 'Please review and accept the updated policies before continuing.';
                                repromptWrapper.appendChild(desc);
                                
                                const rpContainer = document.createElement('div');
                                rpContainer.id = 'repromptPoliciesContainer_church';
                                rpContainer.className = 'form-section legal-consent-section';
                                rpContainer.style.padding = '16px';
                                rpContainer.style.background = 'rgba(0,0,0,0.2)';
                                rpContainer.style.borderRadius = '8px';
                                repromptWrapper.appendChild(rpContainer);
                                
                                policies.forEach(policy => {
                                    const label = document.createElement('label');
                                    label.className = 'checkbox-consent';
                                    
                                    const input = document.createElement('input');
                                    input.type = 'checkbox';
                                    input.required = true;
                                    
                                    const span = document.createElement('span');
                                    let safeUrl = '#';
                                    try {
                                        const parsedUrl = new URL(policy.content_url, window.location.origin);
                                        if (parsedUrl.protocol === 'https:' || parsedUrl.origin === window.location.origin) {
                                            safeUrl = parsedUrl.href;
                                        }
                                    } catch(e) {}
                                    span.innerHTML = 'I have read and agree to the <a href="' + safeUrl + '" target="_blank" rel="noopener">' + policy.title + '</a>.';
                                    
                                    label.appendChild(input);
                                    label.appendChild(span);
                                    rpContainer.appendChild(label);
                                });
                                
                                msgContainer.appendChild(repromptWrapper);
                                msgContainer.className = 'message';
                                msgContainer.style.display = 'block';
                                
                                completeRegistrationBtn.disabled = false;
                                completeRegistrationBtn.innerHTML = 'Submit Church Application';
                                return;
                            }
                        }
                        
                        // 2. Accept each policy
                        for (const policy of policies) {
                            const { data: acceptanceId, error: acceptanceError } = await client.rpc('accept_policy_document', {
                                target_document_key: policy.document_key,
                                target_document_version: policy.document_version,
                                acceptance_source: 'web_church_registration',
                                metadata: { isAdultConfirmed: true, authorizedRepresentative: true }
                            });
                            if (acceptanceError) throw acceptanceError;
                            
                            // Capture the specific authority acceptance ID
                            if (policy.document_key === 'church_registration_authority') {
                                legalAcceptanceId = acceptanceId;
                            }
                        }

                        // 3. Submit registration
                        const { error: requestError } = await client.rpc('submit_church_registration', {
                            church_name: pendingChurch.church_name,
                            location: pendingChurch.location,
                            church_address: pendingChurch.church_address,
                            church_parish: pendingChurch.church_parish,
                            denomination: pendingChurch.denomination,
                            custom_denomination: pendingChurch.custom_denomination,
                            pastor_full_name: pendingChurch.pastor_full_name,
                            pastor_contact_email: pendingChurch.pastor_contact_email,
                            pastor_contact_phone: pendingChurch.pastor_contact_phone,
                            legal_acceptance: legalAcceptanceId,
                            applicant_note: pendingChurch.applicant_note
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
            let pendingMember;
            try {
                pendingMember = JSON.parse(pendingMemberStr);
            } catch {
                localStorage.removeItem('pendingMemberSignup');
                showMessage('searchMessage', '<i class="fas fa-exclamation-triangle"></i> We could not restore this application. Please start again.', 'error');
                document.getElementById('searchMessage').style.display = 'block';
                return;
            }

            if (
                pendingMember.owner_email?.trim().toLowerCase() !== session.user.email?.trim().toLowerCase() ||
                Date.now() > pendingMember.expires_at
            ) {
                localStorage.removeItem('pendingMemberSignup');
                showMessage('searchMessage', '<i class="fas fa-exclamation-triangle"></i> We could not safely restore this application on this device. Please sign in and start the completion step again.', 'error');
                document.getElementById('searchMessage').style.display = 'block';
                return;
            }

            document.getElementById('memberSearchSection').style.display = 'none';
            document.getElementById('memberSignupForm').style.display = 'none';
            document.querySelector('.form-header').style.display = 'none';
            document.getElementById('completionState').style.display = 'block';
            
            if (completeRegistrationBtn) {
                completeRegistrationBtn.onclick = async () => {
                    completeRegistrationBtn.disabled = true;
                    completeRegistrationBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Submitting...';
                    try {
                        // 1. Fetch active policies required for member_signup
                        const { data: policies, error: fetchError } = await client.rpc('get_active_policy_documents', {
                            p_flow_type: 'member_signup'
                        });
                        if (fetchError) throw fetchError;
                        
                        const isMatch = checkPoliciesSnapshot(policies, pendingMember.accepted_policies);
                        const repromptContainer = document.getElementById('repromptPoliciesContainer_member');
                        
                        if (!isMatch && (!repromptContainer || repromptContainer.dataset.validated !== 'true')) {
                            if (repromptContainer && repromptContainer.style.display !== 'none') {
                                const checkboxes = repromptContainer.querySelectorAll('input[type="checkbox"]');
                                let allChecked = true;
                                checkboxes.forEach(cb => { if(!cb.checked) allChecked = false; });
                                if(!allChecked) {
                                    showMessage('completionMessage', '<i class="fas fa-exclamation-triangle"></i> Please accept all required policies.', 'error');
                                    completeRegistrationBtn.disabled = false;
                                    completeRegistrationBtn.innerHTML = 'Submit Membership Request';
                                    return;
                                } else {
                                    repromptContainer.dataset.validated = 'true';
                                }
                            } else {
                                const msgContainer = document.getElementById('completionMessage');
                                msgContainer.innerHTML = '';
                                
                                const repromptWrapper = document.createElement('div');
                                repromptWrapper.style.marginTop = '1rem';
                                repromptWrapper.style.textAlign = 'left';
                                
                                const header = document.createElement('p');
                                header.className = 'text-error';
                                header.style.fontWeight = 'bold';
                                header.style.marginBottom = '0.5rem';
                                header.innerHTML = '<i class="fas fa-exclamation-circle"></i> Policy Requirements Have Changed';
                                repromptWrapper.appendChild(header);
                                
                                const desc = document.createElement('p');
                                desc.style.marginBottom = '1rem';
                                desc.textContent = 'Please review and accept the updated policies before continuing.';
                                repromptWrapper.appendChild(desc);
                                
                                const rpContainer = document.createElement('div');
                                rpContainer.id = 'repromptPoliciesContainer_member';
                                rpContainer.className = 'form-section legal-consent-section';
                                rpContainer.style.padding = '16px';
                                rpContainer.style.background = 'rgba(0,0,0,0.2)';
                                rpContainer.style.borderRadius = '8px';
                                repromptWrapper.appendChild(rpContainer);
                                
                                policies.forEach(policy => {
                                    const label = document.createElement('label');
                                    label.className = 'checkbox-consent';
                                    
                                    const input = document.createElement('input');
                                    input.type = 'checkbox';
                                    input.required = true;
                                    
                                    const span = document.createElement('span');
                                    let safeUrl = '#';
                                    try {
                                        const parsedUrl = new URL(policy.content_url, window.location.origin);
                                        if (parsedUrl.protocol === 'https:' || parsedUrl.origin === window.location.origin) {
                                            safeUrl = parsedUrl.href;
                                        }
                                    } catch(e) {}
                                    span.innerHTML = 'I have read and agree to the <a href="' + safeUrl + '" target="_blank" rel="noopener">' + policy.title + '</a>.';
                                    
                                    label.appendChild(input);
                                    label.appendChild(span);
                                    rpContainer.appendChild(label);
                                });
                                
                                msgContainer.appendChild(repromptWrapper);
                                msgContainer.className = 'message';
                                msgContainer.style.display = 'block';
                                
                                completeRegistrationBtn.disabled = false;
                                completeRegistrationBtn.innerHTML = 'Submit Membership Request';
                                return;
                            }
                        }
                        
                        // 2. Accept each policy
                        for (const policy of policies) {
                            const { error: acceptanceError } = await client.rpc('accept_policy_document', {
                                target_document_key: policy.document_key,
                                target_document_version: policy.document_version,
                                acceptance_source: 'web_member_signup',
                                metadata: { isAdultConfirmed: true, locationNoticeAccepted: true }
                            });
                            if (acceptanceError) throw acceptanceError;
                        }

                        // 3. Request membership
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

    }



    // --- Global: Mobile Menu ---
    const mobileMenuBtn = document.getElementById('mobileMenuBtn');
    const navLinks = document.getElementById('navLinks');
    
    if (mobileMenuBtn && navLinks) {
        mobileMenuBtn.addEventListener('click', () => {
            navLinks.classList.toggle('active');
            const icon = mobileMenuBtn.querySelector('i');
            if (navLinks.classList.contains('active')) {
                icon.classList.remove('fa-bars');
                icon.classList.add('fa-times');
            } else {
                icon.classList.remove('fa-times');
                icon.classList.add('fa-bars');
            }
        });
    }

    // --- Global: Navbar Scroll Effect ---
    const navbar = document.getElementById('navbar');
    if (navbar) {
        window.addEventListener('scroll', () => {
            if (window.scrollY > 20) {
                navbar.classList.add('scrolled');
            } else {
                navbar.classList.remove('scrolled');
            }
        });
    }

    // --- Global: Scroll Animations (Intersection Observer) ---
    const animatedElements = document.querySelectorAll('.animate-up');
    if (animatedElements.length > 0) {
        const observer = new IntersectionObserver((entries) => {
            entries.forEach(entry => {
                if (entry.isIntersecting) {
                    entry.target.classList.add('visible');
                    observer.unobserve(entry.target);
                }
            });
        }, {
            threshold: 0.1,
            rootMargin: '0px 0px -50px 0px'
        });

        animatedElements.forEach(el => observer.observe(el));
    }

    // --- Homepage: Tabs Logic ---
    const tabBtns = document.querySelectorAll('.tab-btn');
    const tabPanes = document.querySelectorAll('.tab-pane');
    
    if (tabBtns.length > 0 && tabPanes.length > 0) {
        tabBtns.forEach(btn => {
            btn.addEventListener('click', () => {
                const targetId = btn.getAttribute('data-target');
                
                // Remove active classes
                tabBtns.forEach(b => b.classList.remove('active'));
                tabPanes.forEach(p => p.classList.remove('active'));
                
                // Add active to clicked
                btn.classList.add('active');
                document.getElementById(targetId).classList.add('active');
            });
        });
    }

    // --- Homepage: FAQ Accordion ---
    const faqQuestions = document.querySelectorAll('.faq-question');
    if (faqQuestions.length > 0) {
        faqQuestions.forEach(btn => {
            btn.addEventListener('click', () => {
                const item = btn.parentElement;
                
                // Close others
                document.querySelectorAll('.faq-item').forEach(otherItem => {
                    if (otherItem !== item) {
                        otherItem.classList.remove('active');
                    }
                });
                
                item.classList.toggle('active');
            });
        });
    }

    // --- Utilities ---
    const showMessage = (elementId, message, type) => {
        const el = document.getElementById(elementId);
        if (el) {
            el.innerHTML = message; // Using innerHTML if we pass icons
            el.className = `message ${type}`;
            el.style.display = 'block';
        }
    };

    const checkPoliciesSnapshot = (activePolicies, storedPolicies) => {
        if (!storedPolicies || !Array.isArray(storedPolicies)) return false;
        if (activePolicies.length !== storedPolicies.length) return false;
        for (const ap of activePolicies) {
            const found = storedPolicies.find(sp => sp.key === ap.document_key && sp.version === ap.document_version);
            if (!found) return false;
        }
        return true;
    };

    const loadDynamicPolicies = async (flowType, containerId, submitBtnId) => {
        const container = document.getElementById(containerId);
        const submitBtn = document.getElementById(submitBtnId);
        if (!container || !submitBtn) return null;
        
        submitBtn.disabled = true;
        try {
            const { data, error } = await client.rpc('get_active_policy_documents', { p_flow_type: flowType });
            if (error) throw error;
            
            container.innerHTML = '';
            data.forEach(policy => {
                const label = document.createElement('label');
                label.className = 'checkbox-consent';
                
                const input = document.createElement('input');
                input.type = 'checkbox';
                input.required = true;
                input.dataset.policyKey = policy.document_key;
                input.dataset.policyVersion = policy.document_version;
                
                const span = document.createElement('span');
                span.textContent = 'I have read and agree to the ';
                
                const a = document.createElement('a');
                // Basic URL validation
                let safeUrl = '#';
                try {
                    const parsedUrl = new URL(policy.content_url, window.location.origin);
                    if (parsedUrl.protocol === 'https:' || parsedUrl.origin === window.location.origin) {
                        safeUrl = parsedUrl.href;
                    }
                } catch(e) { }
                a.href = safeUrl;
                a.target = '_blank';
                a.rel = 'noopener';
                a.textContent = policy.title;
                
                span.appendChild(a);
                span.appendChild(document.createTextNode('.'));
                
                label.appendChild(input);
                label.appendChild(span);
                container.appendChild(label);
            });
            submitBtn.disabled = false;
            return data;
        } catch (err) {
            console.error('Failed to load dynamic policies:', err);
            container.innerHTML = '';
            const errorDiv = document.createElement('div');
            errorDiv.className = 'message error';
            errorDiv.style.display = 'block';
            errorDiv.textContent = 'Failed to load required policies. Please refresh the page.';
            container.appendChild(errorDiv);
            return null;
        }
    };

    // --- Page: Church Registration ---
    const churchRegisterForm = document.getElementById('churchRegisterForm');
    const submitRegBtn = document.getElementById('submitRegistrationBtn');
    const denominationSelect = document.getElementById('denomination');
    const customDenominationGroup = document.getElementById('customDenominationGroup');
    const customDenomination = document.getElementById('customDenomination');

    let currentChurchPolicies = null;
    if (churchRegisterForm) {
        loadDynamicPolicies('church_application', 'dynamicPoliciesContainer', 'submitRegistrationBtn').then(policies => {
            currentChurchPolicies = policies;
        });
    }

    if (denominationSelect) {
        const loadDenominations = async () => {
            try {
                const { data, error } = await client.rpc('get_active_denominations');
                if (error) throw error;
                
                denominationSelect.innerHTML = '<option value="" disabled selected>Select your denomination</option>';
                data.forEach(d => {
                    const opt = document.createElement('option');
                    opt.value = d.id;
                    opt.textContent = d.display_name;
                    opt.dataset.code = d.code;
                    denominationSelect.appendChild(opt);
                });
                

            } catch (err) {
                console.error("Failed to load denominations", err);
                denominationSelect.innerHTML = '<option value="" disabled selected>Error loading denominations</option>';
            }
        };
        
        loadDenominations();

        denominationSelect.addEventListener('change', (e) => {
            const selectedOpt = denominationSelect.options[denominationSelect.selectedIndex];
            if (selectedOpt && selectedOpt.dataset.code === 'other') {
                customDenominationGroup.style.display = 'block';
                customDenomination.required = true;
            } else {
                customDenominationGroup.style.display = 'none';
                customDenomination.required = false;
                customDenomination.value = '';
            }
        });
    }

    if (churchRegisterForm && submitRegBtn) {
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
                    const shouldContinue = window.confirm(`${conflictResult.safe_message}

You can continue, but our developer review team may ask for more verification. Continue with this registration application?`);
                    if (!shouldContinue) {
                        showMessage('registerMessage', '<i class="fas fa-info-circle"></i> Registration paused. Please search the church directory or contact Grace Connect support if this church is already registered.', 'error');
                        submitRegBtn.disabled = false;
                        submitRegBtn.innerHTML = 'Submit Registration for Approval';
                        return;
                    }
                }

                // Save pending registration metadata to localStorage so we can resume after email verification
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
                    pastor_contact_phone: adminPhone,
                    applicant_note: document.getElementById('additionalNote')?.value.trim() || null,
                    accepted_policies: currentChurchPolicies ? currentChurchPolicies.map(p => ({
                        key: p.document_key,
                        version: p.document_version
                    })) : []
                }));

                const { data, error } = await client.auth.signUp({
                    email: adminEmail,
                    password: password,
                    options: {
                        emailRedirectTo: `${window.location.origin}/register-church.html?complete=1`,
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
    }

    // --- Page: Member Sign Up ---
    const searchInput = document.getElementById('churchSearch');
    const searchResults = document.getElementById('searchResults');
    const searchMessage = document.getElementById('searchMessage');
    const memberSignupForm = document.getElementById('memberSignupForm');
    const changeChurchBtn = document.getElementById('changeChurchBtn');
    const selectedChurchNameEl = document.getElementById('selectedChurchName');
    const submitMemberBtn = document.getElementById('submitMemberBtn');
    
    let currentMemberPolicies = null;
    if (memberSignupForm) {
        loadDynamicPolicies('member_signup', 'dynamicPoliciesContainer', 'submitMemberBtn').then(policies => {
            currentMemberPolicies = policies;
        });
    }
    
    if (searchInput && searchResults && memberSignupForm) {
        let debounceTimer;
        let selectedChurch = null;

        searchInput.addEventListener('input', (e) => {
            clearTimeout(debounceTimer);
            const query = e.target.value.trim();
            
            if (query.length < 2) {
                searchResults.innerHTML = '';
                searchMessage.style.display = 'none';
                return;
            }

            debounceTimer = setTimeout(() => performSearch(query), 400);
        });

        async function performSearch(query) {
            searchResults.innerHTML = '<div class="search-item"><span><i class="fas fa-spinner fa-spin"></i> Searching churches...</span></div>';
            searchMessage.style.display = 'none';

            try {
                const { data: churches, error } = await client.rpc('get_public_church_directory', {
                    search_query: query
                });

                if (error) throw error;

                searchResults.innerHTML = '';

                if (churches.length === 0) {
                    searchMessage.style.display = 'flex';
                    return;
                }

                churches.forEach(church => {
                    const item = document.createElement('div');
                    item.className = 'search-item';
                    const strong = document.createElement('strong');
                    strong.textContent = church.name;
                    const span = document.createElement('span');
                    span.innerHTML = '<i class="fas fa-map-marker-alt" style="color: #D4AF37; margin-right: 4px;"></i> ';
                    span.appendChild(document.createTextNode(church.address || 'Address not provided'));
                    item.appendChild(strong);
                    item.appendChild(span);
                    item.addEventListener('click', () => selectChurch(church));
                    searchResults.appendChild(item);
                });
            } catch (error) {
                searchResults.innerHTML = '<div class="search-item" style="color: #991b1b;"><i class="fas fa-exclamation-triangle"></i> Error fetching churches. Please try again.</div>';
                console.error('Search error:', error);
            }
        }

        function selectChurch(church) {
            selectedChurch = church;
            searchResults.innerHTML = '';
            searchInput.value = '';
            document.getElementById('memberSearchSection').style.display = 'none';
            
            selectedChurchNameEl.textContent = church.name;
            memberSignupForm.style.display = 'block';
        }

        changeChurchBtn.addEventListener('click', () => {
            selectedChurch = null;
            memberSignupForm.style.display = 'none';
            document.getElementById('memberSearchSection').style.display = 'block';
            searchInput.focus();
        });

        memberSignupForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            
            if (!selectedChurch) return;

            submitMemberBtn.disabled = true;
            submitMemberBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Creating Account...';
            showMessage('memberMessage', '', '');

            const memberName = document.getElementById('memberName').value.trim();
            const memberEmail = document.getElementById('memberEmail').value.trim();
            const memberPhone = document.getElementById('memberPhone').value.trim();
            const password = document.getElementById('memberPassword').value;

            try {
                // Save pending request
                localStorage.setItem('pendingMemberSignup', JSON.stringify({
                    flow_type: 'member_signup',
                    owner_email: memberEmail,
                    expires_at: Date.now() + 24 * 60 * 60 * 1000,
                    created_at: Date.now(),
                    target_church_id: selectedChurch.placeId || selectedChurch.id,
                    accepted_policies: currentMemberPolicies ? currentMemberPolicies.map(p => ({
                        key: p.document_key,
                        version: p.document_version
                    })) : []
                }));

                const { data, error } = await client.auth.signUp({
                    email: memberEmail,
                    password: password,
                    options: {
                        emailRedirectTo: `${window.location.origin}/member-signup.html?complete=1`,
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
    }
});
