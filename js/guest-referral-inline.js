        document.getElementById('copyrightYear').textContent = new Date().getFullYear();
        const _formLoadTime = Date.now();

        let guestReferralReward = 50;
        let guestReferralMax = 10;

        async function loadSettings() {
            try {
                const response = await fetch('/api/settings/public');
                if (response.ok) {
                    const data = await response.json();
                    if (data.guest_referral_reward) {
                        guestReferralReward = parseFloat(data.guest_referral_reward);
                        document.getElementById('rewardAmount').textContent = '$' + guestReferralReward;
                    }
                    if (data.guest_referral_max) {
                        guestReferralMax = parseInt(data.guest_referral_max);
                        document.getElementById('remainingSlots').textContent = guestReferralMax;
                    }
                    updateRewardTexts();
                }
            } catch (err) {
                console.log('Using default settings');
            }
        }

        function updateRewardTexts() {
            const maxEarnings = guestReferralReward * guestReferralMax;
            const rewardMaxEl = document.getElementById('rewardMaxText');
            if (rewardMaxEl && currentLang === 'en') {
                rewardMaxEl.textContent = `Earn up to $${maxEarnings} (maximum ${guestReferralMax} referrals per person)`;
            }
        }

        const translations = {
            en: {
                backToFeedback: "Back to Feedback",
                companyReferrals: "Company Referrals",
                switchToCompany: "Switch to company referrals",
                badgeText: "Friends & Family Referral",
                heroTitle: "Refer Friends & Family",
                heroSubtitle: "Know someone looking for furnished housing? Refer them to Hyatus and earn rewards!",
                rewardLabel: "per qualifying guest referral",
                rewardMax: "Earn up to $500 (maximum 10 referrals per person)",
                howItWorksTitle: "How It Works",
                howItWorksText: "Know someone who needs furnished housing for work, relocation, or an extended stay? Refer them to Hyatus, and when they book, you'll earn a reward for helping them find their perfect home away from home.",
                step1Title: "Submit a Referral",
                step1Text: "Fill out the form below with your friend's contact information.",
                step2Title: "We Reach Out",
                step2Text: "Our team will contact your friend about their housing needs.",
                step3Title: "Friend Books a Stay",
                step3Text: "When your friend completes their first booking, you earn your reward.",
                step4Title: "Get Paid",
                step4Text: "Receive $50 for each qualifying referral, up to $500 total.",
                qualificationsTitle: "What Qualifies as a Successful Referral?",
                qual1: "The guest must be new to Hyatus (not an existing guest)",
                qual2: "Your friend must complete a qualifying stay (minimum 30 nights)",
                qual3: "Final qualification approval is determined by Hyatus",
                formTitle: "Refer a Friend",
                formIntro: "Tell us about your friend who needs furnished housing.",
                labelYourName: "Your Name <span class=\"required\">*</span>",
                labelYourEmail: "Your Email <span class=\"required\">*</span>",
                labelFriendName: "Friend's Name <span class=\"required\">*</span>",
                labelFriendEmail: "Friend's Email <span class=\"required\">*</span>",
                labelFriendPhone: "Friend's Phone",
                labelCity: "City They're Looking For",
                labelMoveInTimeframe: "Expected Move-in Timeframe",
                labelNotes: "Additional Notes",
                placeholderYourName: "Your full name",
                placeholderYourEmail: "your@email.com",
                placeholderFriendName: "Your friend's full name",
                placeholderFriendEmail: "friend@email.com",
                placeholderFriendPhone: "(555) 123-4567",
                placeholderCity: "e.g., Austin, TX",
                placeholderNotes: "Any additional context about your friend's housing needs...",
                optionSelectTimeframe: "Select timeframe...",
                optionWithin30Days: "Within 30 days",
                option1to3Months: "1-3 months",
                option3to6Months: "3-6 months",
                optionNotSure: "Not sure",
                submitButton: "Submit Referral",
                submitting: "Submitting...",
                disclaimer: "By submitting this referral, you confirm that you have your friend's permission to share their information. Hyatus will reach out professionally on your behalf. Rewards are paid after the referred guest completes a qualifying stay.",
                successTitle: "Referral Submitted!",
                successText: "Thank you for referring a friend! Our team will reach out to them about their housing needs. We'll keep you updated on the status, and if they book a qualifying stay, your $50 reward will be on its way!",
                footerContact: "Questions about the program? Contact us at",
                footerRights: "All rights reserved.",
                errorRequired: "Please fill in all required fields.",
                errorGeneric: "Something went wrong. Please try again.",
                myReferralsTitle: "My Guest Referrals",
                myReferralsSubtitle: "Track the status of your guest referrals and rewards.",
                totalReferrals: "Total Referrals",
                approvedReferrals: "Approved",
                totalEarned: "Total Earned",
                remainingSlots: "Slots Left",
                loadingReferrals: "Loading your referrals...",
                noReferrals: "You haven't submitted any guest referrals yet.",
                statusSubmitted: "Submitted",
                statusInReview: "In Review",
                statusApproved: "Approved",
                statusRejected: "Rejected",
                statusPaid: "Paid"
            }
        };

        let currentTranslations = translations.en;
        let currentLang = 'en';

        const supportedLanguages = {
            en: { name: 'English', dir: 'ltr' },
            ar: { name: 'العربية', dir: 'rtl' },
            pt: { name: 'Português', dir: 'ltr' },
            zh: { name: '中文', dir: 'ltr' },
            ja: { name: '日本語', dir: 'ltr' },
            ko: { name: '한국어', dir: 'ltr' },
            es: { name: 'Español', dir: 'ltr' },
            ru: { name: 'Русский', dir: 'ltr' },
            de: { name: 'Deutsch', dir: 'ltr' }
        };

        function populateLanguageDropdown() {
            const menu = document.getElementById('langDropdownMenu');
            menu.innerHTML = '';
            
            Object.entries(supportedLanguages).forEach(([code, lang]) => {
                const option = document.createElement('button');
                option.className = 'lang-option' + (code === currentLang ? ' active' : '');
                option.dataset.lang = code;
                option.textContent = lang.name;
                option.addEventListener('click', () => selectLanguage(code));
                menu.appendChild(option);
            });
        }

        function selectLanguage(lang) {
            if (!supportedLanguages[lang]) return;
            
            currentLang = lang;
            localStorage.setItem('preferredLanguage', lang);
            
            const url = new URL(window.location);
            url.searchParams.set('lang', lang);
            window.history.replaceState({}, '', url);
            
            document.getElementById('currentLangName').textContent = supportedLanguages[lang].name;
            
            populateLanguageDropdown();
            closeDropdown();
            
            setLanguage(lang);
        }

        function toggleDropdown() {
            const btn = document.getElementById('langDropdownBtn');
            const menu = document.getElementById('langDropdownMenu');
            const isOpen = menu.classList.contains('open');
            
            if (isOpen) {
                closeDropdown();
            } else {
                btn.classList.add('open');
                menu.classList.add('open');
            }
        }

        function closeDropdown() {
            document.getElementById('langDropdownBtn').classList.remove('open');
            document.getElementById('langDropdownMenu').classList.remove('open');
        }

        async function setLanguage(lang) {
            const html = document.documentElement;
            const langDropdown = document.querySelector('.lang-dropdown');
            const langInfo = supportedLanguages[lang] || { name: lang, dir: 'ltr' };
            
            html.setAttribute('lang', lang);
            html.setAttribute('dir', langInfo.dir);

            if (lang === 'en') {
                currentTranslations = translations.en;
                applyTranslations(currentTranslations);
                return;
            }
            
            const cacheKey = `translations_${lang}_guest_referral`;
            const cached = localStorage.getItem(cacheKey);
            
            if (cached) {
                try {
                    currentTranslations = JSON.parse(cached);
                    applyTranslations(currentTranslations);
                    return;
                } catch (e) {
                    console.error('Failed to parse cached translations:', e);
                }
            }
            
            if (langDropdown) langDropdown.classList.add('lang-loading');
            
            try {
                const textsToTranslate = Object.values(translations.en);
                const keys = Object.keys(translations.en);
                
                const response = await fetch('/api/translate', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        texts: textsToTranslate,
                        targetLang: lang,
                        sourceLang: 'en'
                    })
                });
                
                if (!response.ok) throw new Error('Translation API failed');
                
                const data = await response.json();
                
                const langTranslations = {};
                keys.forEach((key, index) => {
                    langTranslations[key] = data.translations[index] || translations.en[key];
                });
                
                localStorage.setItem(cacheKey, JSON.stringify(langTranslations));
                
                currentTranslations = langTranslations;
                applyTranslations(currentTranslations);
            } catch (error) {
                console.error('Translation error:', error);
                currentTranslations = translations.en;
                applyTranslations(currentTranslations);
            } finally {
                if (langDropdown) langDropdown.classList.remove('lang-loading');
            }
        }

        function applyTranslations(trans) {
            document.querySelectorAll('[data-i18n]').forEach(el => {
                const key = el.dataset.i18n;
                if (trans[key]) {
                    if (trans[key].includes('<') && trans[key].includes('>')) {
                        el.innerHTML = trans[key];
                    } else {
                        el.textContent = trans[key];
                    }
                }
            });
            
            document.querySelectorAll('[data-i18n-placeholder]').forEach(el => {
                const key = el.dataset.i18nPlaceholder;
                if (trans[key]) {
                    el.placeholder = trans[key];
                }
            });

            document.querySelectorAll('[data-i18n-title]').forEach(el => {
                const key = el.dataset.i18nTitle;
                if (trans[key]) {
                    el.title = trans[key];
                }
            });
        }

        function initLanguage() {
            const urlParams = new URLSearchParams(window.location.search);
            const urlLang = urlParams.get('lang');
            const storedLang = localStorage.getItem('preferredLanguage');
            
            const lang = urlLang || storedLang || 'en';
            
            if (supportedLanguages[lang]) {
                currentLang = lang;
            } else {
                currentLang = 'en';
            }
            
            document.getElementById('currentLangName').textContent = supportedLanguages[currentLang].name;
            populateLanguageDropdown();
            setLanguage(currentLang);
        }

        document.getElementById('langDropdownBtn').addEventListener('click', toggleDropdown);

        document.addEventListener('click', (e) => {
            const dropdown = document.querySelector('.lang-dropdown');
            if (!dropdown.contains(e.target)) {
                closeDropdown();
            }
        });

        loadSettings();
        initLanguage();

        const form = document.getElementById('referralFormElement');
        const formContainer = document.getElementById('referralForm');
        const successMessage = document.getElementById('successMessage');
        const formError = document.getElementById('formError');
        const submitBtn = document.getElementById('submitBtn');

        function showError(message) {
            formError.textContent = message;
            formError.classList.add('show');
        }

        function hideError() {
            formError.classList.remove('show');
        }

        form.addEventListener('submit', async (e) => {
            e.preventDefault();
            hideError();

            const data = {
                referrer_name: document.getElementById('referrerName').value.trim(),
                referrer_email: document.getElementById('referrerEmail').value.trim(),
                friend_name: document.getElementById('friendName').value.trim(),
                friend_email: document.getElementById('friendEmail').value.trim(),
                friend_phone: document.getElementById('friendPhone').value.trim(),
                city: document.getElementById('city').value.trim(),
                move_in_timeframe: document.getElementById('moveInTimeframe').value,
                notes: document.getElementById('notes').value.trim(),
                _form_token: _formLoadTime.toString(36)
            };

            if (!data.referrer_name || !data.referrer_email || !data.friend_name || !data.friend_email) {
                showError(currentTranslations.errorRequired);
                return;
            }

            submitBtn.disabled = true;
            submitBtn.textContent = currentTranslations.submitting;

            try {
                const response = await fetch('/api/guest-referrals', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(data)
                });

                const result = await response.json();

                if (!response.ok) {
                    throw new Error(result.error || currentTranslations.errorGeneric);
                }

                formContainer.style.display = 'none';
                successMessage.classList.add('show');
                loadMyReferrals();

            } catch (err) {
                console.error('Error:', err);
                showError(err.message || currentTranslations.errorGeneric);
                submitBtn.disabled = false;
                submitBtn.textContent = currentTranslations.submitButton;
            }
        });

        async function checkAuthAndLoadReferrals() {
            try {
                const response = await fetch('/api/auth/session', { credentials: 'include' });
                const data = await response.json();
                
                if (response.ok && data.user) {
                    document.getElementById('myReferralsSection').classList.add('show');
                    loadMyReferrals();
                }
            } catch (err) {
                console.log('Not authenticated');
            }
        }

        async function loadMyReferrals() {
            const listEl = document.getElementById('referralList');
            
            try {
                const response = await fetch('/api/guest-referrals/my');
                const result = await response.json();
                
                if (!response.ok) {
                    throw new Error(result.error || 'Failed to load referrals');
                }
                
                const referrals = result.data || [];
                const summary = result.summary || {};
                
                document.getElementById('totalReferrals').textContent = summary.total || referrals.length;
                document.getElementById('approvedCount').textContent = summary.approved || 0;
                document.getElementById('totalEarned').textContent = '$' + (summary.total_earned || 0);
                document.getElementById('remainingSlots').textContent = Math.max(0, guestReferralMax - referrals.length);
                
                if (referrals.length === 0) {
                    listEl.innerHTML = '<div class="no-referrals">' + (currentTranslations.noReferrals || 'You haven\'t submitted any guest referrals yet.') + '</div>';
                    return;
                }
                
                listEl.innerHTML = '';
                referrals.forEach(ref => {
                    const item = document.createElement('div');
                    item.className = 'referral-item';
                    
                    const statusLabels = {
                        submitted: currentTranslations.statusSubmitted || 'Submitted',
                        in_review: currentTranslations.statusInReview || 'In Review',
                        approved: currentTranslations.statusApproved || 'Approved',
                        rejected: currentTranslations.statusRejected || 'Rejected',
                        paid: currentTranslations.statusPaid || 'Paid'
                    };
                    
                    const date = new Date(ref.created_at).toLocaleDateString();
                    const reward = ref.reward_amount ? '$' + parseFloat(ref.reward_amount).toFixed(0) : '-';
                    
                    item.innerHTML = `
                        <div class="referral-item-info">
                            <div class="referral-item-name">${escapeHtml(ref.friend_name)}</div>
                            <div class="referral-item-date">${date}</div>
                        </div>
                        <div class="referral-item-right" style="display: flex; gap: 12px; align-items: center;">
                            <span class="referral-item-status ${ref.status}">${statusLabels[ref.status] || ref.status}</span>
                            <span class="referral-item-reward">${reward}</span>
                        </div>
                    `;
                    
                    listEl.appendChild(item);
                });
                
            } catch (err) {
                console.error('Error loading referrals:', err);
                listEl.innerHTML = '<div class="no-referrals">Unable to load referrals</div>';
            }
        }

        function escapeHtml(text) {
            const div = document.createElement('div');
            div.textContent = text;
            return div.innerHTML;
        }

        checkAuthAndLoadReferrals();

        let currentUser = null;
        let authMode = 'login';

        async function checkSession() {
            const cachedUser = localStorage.getItem('hyatus_user');
            if (cachedUser) {
                try {
                    currentUser = JSON.parse(cachedUser);
                    renderAuthButton();
                    renderProfileDropdown();
                } catch (e) {
                    localStorage.removeItem('hyatus_user');
                }
            }
            
            try {
                const response = await fetch('/api/auth/session', { credentials: 'include' });
                const data = await response.json();
                
                if (response.ok && data.user) {
                    currentUser = data.user;
                    localStorage.setItem('hyatus_user', JSON.stringify(data.user));
                    renderAuthButton();
                    renderProfileDropdown();
                } else {
                    currentUser = null;
                    localStorage.removeItem('hyatus_user');
                    renderAuthButton();
                }
            } catch (err) {
                console.log('Session check failed');
                currentUser = null;
                localStorage.removeItem('hyatus_user');
                renderAuthButton();
            }
        }

        function renderAuthButton() {
            const authBtn = document.getElementById('userAuthLink');
            
            if (currentUser) {
                const initial = currentUser.email ? currentUser.email.charAt(0).toUpperCase() : 'U';
                authBtn.innerHTML = `
                    <div style="width: 28px; height: 28px; background: linear-gradient(135deg, var(--moss) 0%, var(--moss-soft) 100%); border-radius: 50%; display: flex; align-items: center; justify-content: center; color: white; font-size: 12px; font-weight: 600;">${initial}</div>
                `;
            } else {
                authBtn.innerHTML = `
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path>
                        <circle cx="12" cy="7" r="4"></circle>
                    </svg>
                    <span class="auth-button-text" data-i18n="signIn">${currentTranslations.signIn || 'Sign In'}</span>
                `;
            }
            authBtn.classList.add('auth-ready');
        }

        function renderProfileDropdown() {
            const dropdown = document.getElementById('userProfileDropdown');
            if (!currentUser) {
                dropdown.innerHTML = '';
                return;
            }
            
            dropdown.innerHTML = `
                <div class="profile-header">
                    <div style="display: flex; align-items: center; gap: 12px;">
                        <div style="width: 40px; height: 40px; background: linear-gradient(135deg, var(--moss) 0%, var(--moss-soft) 100%); border-radius: 50%; display: flex; align-items: center; justify-content: center; color: white; font-size: 16px; font-weight: 600;">${currentUser.email.charAt(0).toUpperCase()}</div>
                        <div>
                            <div style="font-weight: 500; color: var(--charcoal);">${currentUser.email}</div>
                            <div style="font-size: 12px; color: var(--warm-gray-dark);">Member</div>
                        </div>
                    </div>
                </div>
                <div class="profile-actions">
                    <button class="sign-out-btn" onclick="handleSignOut()">Sign Out</button>
                </div>
            `;
        }

        async function handleSignIn(email, password) {
            try {
                const response = await fetch('/api/auth/signin', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    credentials: 'include',
                    body: JSON.stringify({ email, password })
                });
                
                const data = await response.json();
                
                if (!response.ok) {
                    throw new Error(data.error || 'Sign in failed');
                }
                
                currentUser = data.user;
                localStorage.setItem('hyatus_user', JSON.stringify(data.user));
                closeAuthModal();
                renderAuthButton();
                renderProfileDropdown();
                document.getElementById('myReferralsSection').classList.add('show');
                loadMyReferrals();
                
            } catch (err) {
                throw err;
            }
        }

        async function handleSignUp(email, password) {
            try {
                const response = await fetch('/api/auth/signup', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    credentials: 'include',
                    body: JSON.stringify({ email, password })
                });
                
                const data = await response.json();
                
                if (!response.ok) {
                    throw new Error(data.error || 'Sign up failed');
                }
                
                currentUser = data.user;
                localStorage.setItem('hyatus_user', JSON.stringify(data.user));
                closeAuthModal();
                renderAuthButton();
                renderProfileDropdown();
                document.getElementById('myReferralsSection').classList.add('show');
                loadMyReferrals();
                
            } catch (err) {
                throw err;
            }
        }

        async function handleSignOut() {
            try {
                await fetch('/api/auth/signout', { method: 'POST', credentials: 'include' });
                currentUser = null;
                localStorage.removeItem('hyatus_user');
                renderAuthButton();
                document.getElementById('userProfileDropdown').classList.remove('active');
                document.getElementById('myReferralsSection').classList.remove('show');
            } catch (err) {
                console.error('Sign out failed:', err);
            }
        }

        function openAuthModal() {
            document.getElementById('authModal').classList.add('active');
            document.getElementById('authError').style.display = 'none';
            document.getElementById('authEmail').value = '';
            document.getElementById('authPassword').value = '';
            if (document.getElementById('authConfirmPassword')) {
                document.getElementById('authConfirmPassword').value = '';
            }
        }

        function closeAuthModal() {
            document.getElementById('authModal').classList.remove('active');
        }

        function switchAuthTab(tab) {
            authMode = tab;
            const tabs = document.querySelectorAll('.auth-tab');
            tabs.forEach(t => t.classList.remove('active'));
            document.querySelector(`.auth-tab[data-tab="${tab}"]`).classList.add('active');
            
            const confirmGroup = document.getElementById('confirmPasswordGroup');
            const submitBtn = document.getElementById('authSubmitBtn');
            const forgotPassword = document.querySelector('.forgot-password');
            
            if (tab === 'signup') {
                confirmGroup.style.display = 'block';
                submitBtn.textContent = currentTranslations.createAccount || 'Create Account';
                if (forgotPassword) forgotPassword.style.display = 'none';
            } else {
                confirmGroup.style.display = 'none';
                submitBtn.textContent = currentTranslations.signIn || 'Sign In';
                if (forgotPassword) forgotPassword.style.display = 'block';
            }
            
            document.getElementById('authError').style.display = 'none';
        }

        document.getElementById('userAuthLink').addEventListener('click', () => {
            if (currentUser) {
                const dropdown = document.getElementById('userProfileDropdown');
                dropdown.classList.toggle('active');
            } else {
                openAuthModal();
            }
        });

        document.getElementById('authClose').addEventListener('click', closeAuthModal);

        document.getElementById('authModal').addEventListener('click', (e) => {
            if (e.target === document.getElementById('authModal')) {
                closeAuthModal();
            }
        });

        document.querySelectorAll('.auth-tab').forEach(tab => {
            tab.addEventListener('click', () => switchAuthTab(tab.dataset.tab));
        });

        document.getElementById('authForm').addEventListener('submit', async (e) => {
            e.preventDefault();
            
            const email = document.getElementById('authEmail').value.trim();
            const password = document.getElementById('authPassword').value;
            const errorEl = document.getElementById('authError');
            const submitBtn = document.getElementById('authSubmitBtn');
            
            if (!email || !password) {
                errorEl.textContent = 'Please fill in all fields';
                errorEl.style.display = 'block';
                return;
            }
            
            if (authMode === 'signup') {
                const confirmPassword = document.getElementById('authConfirmPassword').value;
                if (password !== confirmPassword) {
                    errorEl.textContent = 'Passwords do not match';
                    errorEl.style.display = 'block';
                    return;
                }
                if (password.length < 8) {
                    errorEl.textContent = 'Password must be at least 8 characters';
                    errorEl.style.display = 'block';
                    return;
                }
            }
            
            submitBtn.disabled = true;
            errorEl.style.display = 'none';
            
            try {
                if (authMode === 'signup') {
                    await handleSignUp(email, password);
                } else {
                    await handleSignIn(email, password);
                }
            } catch (err) {
                errorEl.textContent = err.message;
                errorEl.style.display = 'block';
                submitBtn.disabled = false;
            }
        });

        document.addEventListener('click', (e) => {
            const authContainer = document.querySelector('.topbar-auth-container');
            const dropdown = document.getElementById('userProfileDropdown');
            if (authContainer && !authContainer.contains(e.target)) {
                dropdown.classList.remove('active');
            }
        });

        checkSession();
