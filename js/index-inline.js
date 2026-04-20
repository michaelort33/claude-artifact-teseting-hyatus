        // Help toggle functionality
        document.querySelectorAll('.help-toggle').forEach(btn => {
            btn.addEventListener('click', () => {
                const helpContent = document.getElementById('helpContent');
                if (helpContent) helpContent.classList.toggle('show');
            });
        });

        // Language Support
        const translations = {
            en: {
                signIn: 'Sign In',
                eyebrow: 'A Note of Gratitude',
                mainHeadline: 'Thank you for sharing your <em>experience</em>',
                introText: "Your feedback means everything to us. As a small token of our appreciation, we'd love to send you a gift.",
                feature1: "Choose how you'd like to receive your gift",
                feature2: 'Share your feedback with our team',
                feature3: 'Help us continue to improve',
                feature4: 'Receive your thank-you gift within 48 hours',
                headerEyebrow: 'With Gratitude',
                cardTitle: 'Accept a <span id="rewardAmount">$10</span> gift from us',
                cardSubtitle: 'A small thank you for taking the time to share your thoughts',
                pausedTitle: 'Thank You',
                pausedMessage: 'Our guest appreciation program is currently reserved for returning guests. We hope to welcome you back soon.',
                warningTitle: 'A Quick Note',
                warningMessage: 'To help us verify your feedback, please share from an established Google account when possible.',
                chooseGiftTitle: 'Choose Your Gift',
                giftAmazon: 'Amazon',
                giftStarbucks: 'Starbucks',
                giftSurprise: 'Surprise Me',
                deliveryEmailLabel: 'Delivery Email',
                emailPlaceholder: 'email@example.com',
                yourFeedbackDivider: 'Your Feedback',
                shareFeedbackTitle: 'Share Your Feedback',
                helpToggle: 'How do I find my feedback?',
                helpTitle: 'Finding Your Feedback',
                demoStep1Title: 'Step 1:',
                demoStep1Text: 'Go to Google Maps',
                demoStep1Card: 'Find your feedback on our listing',
                demoStep2Title: 'Step 2:',
                demoStep2Text: 'Locate your comments',
                demoStep2Card: 'Click on "Reviews" to find yours',
                demoStep3Title: 'Step 3:',
                demoStep3Text: 'Share with us',
                demoStep3Btn: 'Share → Copy Link',
                reviewLinkLabel: 'Link to Your Feedback',
                reviewLinkPlaceholder: 'Paste the link to your feedback here',
                orDivider: 'or',
                uploadTitle: 'Upload a Screenshot',
                uploadHint: 'Share a photo of your feedback',
                submitButton: 'Send to Hyatus',
                successTitle: 'Thank You',
                successMessage: 'We truly appreciate you sharing your experience with us. Your <span id="successRewardAmount">$10</span> gift will be on its way within 48 hours.',
                wantToEarnMore: 'Want to earn more?',
                referralCtaTitle: 'Earn $250 with Hyatus Connect Rewards',
                referralCtaSubtitle: 'Refer a company and get rewarded',
                shareMoreFeedback: 'Share More Feedback',
                welcomeTitle: 'Welcome',
                createAccount: 'Create Account',
                emailLabel: 'Email',
                passwordLabel: 'Password',
                passwordPlaceholder: 'Enter password',
                passwordReq: 'At least 8 characters',
                confirmPasswordLabel: 'Confirm Password',
                confirmPasswordPlaceholder: 'Confirm password',
                passwordsMustMatch: 'Passwords must match',
                forgotPassword: 'Forgot password?'
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
            
            const cacheKey = `translations_${lang}_feedback`;
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

        initLanguage();
