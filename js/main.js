document.addEventListener('DOMContentLoaded', () => {

    const TERMS_VERSION = 'GC-TERMS-2026-06-16';
    const PRIVACY_VERSION = 'GC-PRIVACY-2026-06-16';


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

    if (churchRegisterForm && submitRegBtn) {
        churchRegisterForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            
            submitRegBtn.disabled = true;
            submitRegBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Submitting...';
            showMessage('registerMessage', '', '');

            const churchName = document.getElementById('churchName').value.trim();
            const denomination = document.getElementById('denomination').value.trim();
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
            if (denomination.toLowerCase().includes('new testament church of god') || denomination.toLowerCase().includes('ntcog')) {
                displayChurchName = `${churchName.replace(/new testament church of god/ig, '').replace(/ntcog/ig, '').trim()} NTCOG`;
            }

            const placeId = `church_${Date.now()}`;

            try {
                // Submit to Supabase
                const { data, error } = await supabase.auth.signUp({
                    email: adminEmail,
                    password: password,
                    options: {
                        data: {
                            full_name: adminName,
                            phone: adminPhone,
                            phoneNumber: adminPhone,
                            placeId: placeId,
                            placeName: displayChurchName,
                            address: address,
                            denomination: denomination,
                            location_name: churchName,
                            pastor_or_admin_name: adminName,
                            pastor_or_admin_email: adminEmail,
                            pastor_or_admin_phone: adminPhone,
                            roles: ['Admin', 'Pastor'],
                            accountState: 'active',
                            joinDate: new Date().toISOString(),
                            bio: 'Church Admin',
                            ageConfirmed: true,
                            authorizedRepresentative: true,
                            legalAccepted: true,
                            legalAcceptedAt: new Date().toISOString(),
                            termsVersion: TERMS_VERSION,
                            privacyPolicyVersion: PRIVACY_VERSION,
                            acceptedLegalDocuments: ['Terms & Conditions', 'Privacy Policy', 'Admin & Staff Access Policy', 'Data Retention Schedule', 'Community Guidelines'],
                            signupSource: 'web_church_registration'
                        }
                    }
                });

                if (error) throw error;

                // Show Success State
                churchRegisterForm.style.display = 'none';
                document.querySelector('.form-header').style.display = 'none';
                document.getElementById('registerSuccessState').style.display = 'block';
                
                await window.supabase.auth.signOut();
                
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
                // Only show approved or active churches
                const { data: churches, error } = await window.supabase
                    .from('churches')
                    .select('id, name, address, placeId')
                    .in('approval_status', ['approved', 'active'])
                    .ilike('name', `%${query}%`)
                    .limit(5);

                if (error) throw error;

                searchResults.innerHTML = '';

                if (churches.length === 0) {
                    searchMessage.style.display = 'flex';
                    return;
                }

                churches.forEach(church => {
                    const item = document.createElement('div');
                    item.className = 'search-item';
                    item.innerHTML = `
                        <strong>${church.name}</strong>
                        <span><i class="fas fa-map-marker-alt" style="color: #D4AF37; margin-right: 4px;"></i> ${church.address || 'Address not provided'}</span>
                    `;
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
                            placeId: selectedChurch.placeId || selectedChurch.id,
                            placeName: selectedChurch.name,
                            roles: ['Member'],
                            accountState: 'active',
                            joinDate: new Date().toISOString(),
                            ageConfirmed: true,
                            legalAccepted: true,
                            legalAcceptedAt: new Date().toISOString(),
                            termsVersion: TERMS_VERSION,
                            privacyPolicyVersion: PRIVACY_VERSION,
                            acceptedLegalDocuments: ['Terms & Conditions', 'Privacy Policy', 'Account Deletion Policy', 'Community Guidelines', 'Location Disclosure'],
                            signupSource: 'web_member_signup'
                        }
                    }
                });

                if (error) throw error;

                // Show Success State
                memberSignupForm.style.display = 'none';
                document.querySelector('.form-header').style.display = 'none';
                document.getElementById('memberSuccessState').style.display = 'block';
                
                await window.supabase.auth.signOut();
                
            } catch (error) {
                showMessage('memberMessage', `<i class="fas fa-exclamation-triangle"></i> ${error.message || 'An error occurred during signup.'}`, 'error');
                submitMemberBtn.disabled = false;
                submitMemberBtn.innerHTML = 'Create Account';
            }
        });
    }
});
