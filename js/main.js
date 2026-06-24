document.addEventListener('DOMContentLoaded', () => {

    const LEGAL_DOCUMENT_VERSION = '2026-06-24';


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

    // --- Page: Church Registration ---
    const churchRegisterForm = document.getElementById('churchRegisterForm');
    const submitRegBtn = document.getElementById('submitRegistrationBtn');
    const denominationSelect = document.getElementById('denomination');
    const customDenominationGroup = document.getElementById('customDenominationGroup');
    const customDenomination = document.getElementById('customDenomination');

    if (denominationSelect) {
        const loadDenominations = async () => {
            try {
                const { data, error } = await window.supabase.rpc('get_active_denominations');
                if (error) throw error;
                
                denominationSelect.innerHTML = '<option value="" disabled selected>Select your denomination</option>';
                data.forEach(d => {
                    const opt = document.createElement('option');
                    opt.value = d.id;
                    opt.textContent = d.display_name;
                    opt.dataset.code = d.code;
                    denominationSelect.appendChild(opt);
                });
                
                // Add Other option
                const otherOpt = document.createElement('option');
                otherOpt.value = 'other';
                otherOpt.textContent = 'Other / Unlisted';
                denominationSelect.appendChild(otherOpt);
            } catch (err) {
                console.error("Failed to load denominations", err);
                denominationSelect.innerHTML = '<option value="" disabled selected>Error loading denominations</option>';
            }
        };
        
        loadDenominations();

        denominationSelect.addEventListener('change', (e) => {
            if (e.target.value === 'other') {
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
                const { data: conflictResult, error: conflictError } = await window.supabase.rpc('check_church_registration_conflicts', {
                    church_name: displayChurchName,
                    location_name: churchName,
                    address: address,
                    parish: null,
                    denomination_id: denomination === 'other' ? null : denomination
                });

                if (conflictError) throw conflictError;

                if (conflictResult?.has_conflict) {
                    const shouldContinue = window.confirm(`${conflictResult.safe_message}\n\nYou can continue, but our developer review team may ask for more verification. Continue with this registration application?`);
                    if (!shouldContinue) {
                        showMessage('registerMessage', '<i class="fas fa-info-circle"></i> Registration paused. Please search the church directory or contact Grace Connect support if this church is already registered.', 'error');
                        submitRegBtn.disabled = false;
                        submitRegBtn.innerHTML = 'Submit Registration for Approval';
                        return;
                    }
                }

                const { data, error } = await supabase.auth.signUp({
                    email: adminEmail,
                    password: password,
                    options: {
                        data: {
                            full_name: adminName,
                            phone: adminPhone,
                            phoneNumber: adminPhone,
                            churchRegistrationRequest: true,
                            churchNameSubmitted: displayChurchName,
                            locationName: churchName,
                            churchAddress: address,
                            denomination,
                            pastorName: adminName,
                            pastorEmail: adminEmail,
                            pastorPhone: adminPhone,
                            authorizedRepresentative: true,
                            acceptedPolicyKeys: [
                                'terms',
                                'privacy',
                                'community_guidelines',
                                'age_policy',
                                'church_admin_access',
                                'church_registration_authority',
                                'data_retention'
                            ],
                            legalDocumentVersion: LEGAL_DOCUMENT_VERSION,
                            legalAcceptedAt: new Date().toISOString(),
                            legalAcceptanceSource: 'web_church_registration',
                            isAdultConfirmed: true,
                            signupSource: 'web_church_registration'
                        }
                    }
                });

                if (error) throw error;

                if (data?.session) {
                    let legalAcceptanceId = null;
                    const requiredPolicies = [
                        'terms',
                        'privacy',
                        'community_guidelines',
                        'age_policy',
                        'church_admin_access',
                        'church_registration_authority',
                        'data_retention'
                    ];

                    for (const policyKey of requiredPolicies) {
                        const { data: acceptanceId, error: acceptanceError } = await window.supabase.rpc('accept_policy_document', {
                            target_document_key: policyKey,
                            target_document_version: LEGAL_DOCUMENT_VERSION,
                            acceptance_source: 'web_church_registration',
                            metadata: {
                                isAdultConfirmed: true,
                                authorizedRepresentative: true
                            }
                        });
                        if (acceptanceError) throw acceptanceError;
                        if (!legalAcceptanceId) legalAcceptanceId = acceptanceId;
                    }

                    const { error: requestError } = await window.supabase.rpc('submit_church_registration', {
                        church_name: displayChurchName,
                        location: churchName,
                        church_address: address,
                        church_parish: null,
                        denomination: denomination === 'other' ? null : denomination,
                        custom_denomination: customDenomVal,
                        pastor_full_name: adminName,
                        pastor_contact_email: adminEmail,
                        pastor_contact_phone: adminPhone,
                        legal_acceptance: legalAcceptanceId
                    });
                    if (requestError) throw requestError;
                }

                // Show Success State
                churchRegisterForm.style.display = 'none';
                document.querySelector('.form-header').style.display = 'none';
                if (!data?.session) {
                    document.getElementById('verifyEmailState').style.display = 'block';
                } else {
                    document.getElementById('registerSuccessState').style.display = 'block';
                    await window.supabase.auth.signOut();
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
                const { data: churches, error } = await window.supabase.rpc('get_public_church_directory', {
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
                const { data, error } = await window.supabase.auth.signUp({
                    email: memberEmail,
                    password: password,
                    options: {
                        data: {
                            full_name: memberName,
                            phone: memberPhone,
                            phoneNumber: memberPhone,
                            requestedChurchId: selectedChurch.placeId || selectedChurch.id,
                            requestedChurchName: selectedChurch.name,
                            acceptedPolicyKeys: [
                                'terms',
                                'privacy',
                                'community_guidelines',
                                'age_policy',
                                'location_disclosure'
                            ],
                            legalDocumentVersion: LEGAL_DOCUMENT_VERSION,
                            legalAcceptedAt: new Date().toISOString(),
                            legalAcceptanceSource: 'web_member_signup',
                            isAdultConfirmed: true,
                            signupSource: 'web_member_signup'
                        }
                    }
                });

                if (error) throw error;

                if (data?.session) {
                    const requiredPolicies = [
                        'terms',
                        'privacy',
                        'community_guidelines',
                        'age_policy',
                        'location_disclosure'
                    ];

                    for (const policyKey of requiredPolicies) {
                        const { error: acceptanceError } = await window.supabase.rpc('accept_policy_document', {
                            target_document_key: policyKey,
                            target_document_version: LEGAL_DOCUMENT_VERSION,
                            acceptance_source: 'web_member_signup',
                            metadata: {
                                isAdultConfirmed: true,
                                locationNoticeAccepted: true
                            }
                        });
                        if (acceptanceError) throw acceptanceError;
                    }

                    const { error: requestError } = await window.supabase.rpc('request_church_membership', {
                        target_church_id: selectedChurch.placeId || selectedChurch.id,
                        request_note: 'Requested from landing page signup.'
                    });
                    if (requestError) throw requestError;
                }

                // Show Success State
                memberSignupForm.style.display = 'none';
                document.querySelector('.form-header').style.display = 'none';
                if (!data?.session) {
                    document.getElementById('verifyEmailState').style.display = 'block';
                } else {
                    document.getElementById('memberSuccessState').style.display = 'block';
                    await window.supabase.auth.signOut();
                }
                
            } catch (error) {
                showMessage('memberMessage', `<i class="fas fa-exclamation-triangle"></i> ${error.message || 'An error occurred during signup.'}`, 'error');
                submitMemberBtn.disabled = false;
                submitMemberBtn.innerHTML = 'Create Account';
            }
        });
    }
});
