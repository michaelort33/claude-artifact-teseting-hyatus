// Main application JavaScript

window.addEventListener('error', (e) => {
    console.error('Global JavaScript error:', e.message, e.filename, e.lineno);
});

// Toast notification function
function showToast(message, type = 'info') {
    const container = document.getElementById('toastContainer');
    if (!container) return;
    
    const toast = document.createElement('div');
    toast.style.cssText = `
        padding: 14px 20px;
        border-radius: 10px;
        font-size: 14px;
        font-family: Inter, -apple-system, sans-serif;
        box-shadow: 0 4px 20px rgba(0,0,0,0.15);
        animation: slideIn 0.3s ease;
        max-width: 320px;
        line-height: 1.4;
    `;
    
    if (type === 'success') {
        toast.style.background = '#0F2C1F';
        toast.style.color = '#FDFCF8';
    } else if (type === 'error') {
        toast.style.background = '#D96F52';
        toast.style.color = '#FDFCF8';
    } else {
        toast.style.background = '#F7F3EA';
        toast.style.color = '#2A2A2A';
        toast.style.border = '1px solid #E5DDD3';
    }
    
    toast.textContent = message;
    container.appendChild(toast);
    
    setTimeout(() => {
        toast.style.animation = 'slideOut 0.3s ease forwards';
        setTimeout(() => toast.remove(), 300);
    }, 4000);
}

// Add toast animation styles
const toastStyles = document.createElement('style');
toastStyles.textContent = `
    @keyframes slideIn {
        from { opacity: 0; transform: translateX(100%); }
        to { opacity: 1; transform: translateX(0); }
    }
    @keyframes slideOut {
        from { opacity: 1; transform: translateX(0); }
        to { opacity: 0; transform: translateX(100%); }
    }
`;
document.head.appendChild(toastStyles);

let currentUser = null;
let selectedMethod = '';
let uploadedFile = null;
let mySubmissions = [];

const urlParams = new URLSearchParams(window.location.search);
const rewardParam = urlParams.get('r') || urlParams.get('reward');
const warningParam = urlParams.get('v') || urlParams.get('warning');
const guestParam = urlParams.get('g') || urlParams.get('guest');
let rewardAmount = 10;
let isPreviousGuest = false;

if (rewardParam === 'h24p' || rewardParam === 'hyatus2024premium') {
    rewardAmount = 20;
}

if (guestParam === 'vip2024' || guestParam === 'returning') {
    isPreviousGuest = true;
}

document.addEventListener('DOMContentLoaded', () => {
    const amountElements = ['rewardAmount', 'submitRewardAmount', 'disclaimerAmount', 'successRewardAmount'];
    amountElements.forEach(id => {
        const element = document.getElementById(id);
        if (element) {
            element.textContent = `$${rewardAmount}`;
        }
    });

    const warningElement = document.getElementById('accountRequirementsWarning');
    if (warningElement) {
        if (warningParam === 'x7k' || warningParam === 'true') {
            warningElement.style.display = 'block';
        } else {
            warningElement.style.display = 'none';
        }
    }

    if (!isPreviousGuest) {
        const formElements = document.querySelectorAll('#formContainer input, #formContainer button, #formContainer .payment-method, #formContainer .gift-option, #formContainer .upload-zone');
        formElements.forEach(element => {
            element.disabled = true;
            element.style.opacity = '0.5';
            element.style.cursor = 'not-allowed';
            element.style.pointerEvents = 'none';
        });

        const submitButton = document.getElementById('submitButton');
        if (submitButton) {
            submitButton.textContent = 'Currently Unavailable';
            submitButton.style.background = 'var(--warm-gray, #C4C0B8)';
            submitButton.style.cursor = 'not-allowed';
        }

        const formContainer = document.getElementById('formContainer');
        if (formContainer) {
            const pauseAlert = document.createElement('div');
            pauseAlert.id = 'campaignPauseAlert';
            pauseAlert.style.cssText = `
                background: #F7F3EA;
                border: 1px solid #E5E2DB;
                border-left: 3px solid #D96F52;
                color: #2A2A2A;
                padding: 20px 24px;
                margin-bottom: 24px;
                text-align: center;
                font-size: 14px;
                line-height: 1.6;
            `;
            pauseAlert.innerHTML = `
                <strong style="color: #D96F52; display: block; margin-bottom: 4px;">Thank You for Visiting</strong>
                Our guest appreciation program is currently reserved for returning guests. We hope to welcome you back soon.
            `;
            formContainer.insertBefore(pauseAlert, formContainer.firstChild);
        }
    }
});

function toggleTutorial() {
    const tutorial = document.getElementById('tutorialContent') || document.getElementById('helpContent');
    if (tutorial) tutorial.classList.toggle('show');
}

const paymentMethods = document.querySelectorAll('.payment-method, .gift-option');
const paymentHandle = document.getElementById('paymentHandle');
const paymentLabel = document.getElementById('paymentLabel');

paymentMethods.forEach((method) => {
    method.addEventListener('click', () => {
        paymentMethods.forEach((m) => m.classList.remove('selected'));
        method.classList.add('selected');
        selectedMethod = method.dataset.method || '';

        if (paymentHandle) {
            paymentHandle.disabled = false;
            paymentHandle.value = '';
        }

        if (!paymentLabel) return;
        if (selectedMethod === 'amazon' || selectedMethod === 'starbucks' || selectedMethod === 'surprise') {
            paymentLabel.textContent = 'Delivery Email';
            if (paymentHandle) paymentHandle.placeholder = 'name@example.com';
        }
    });
});

const fileUploadArea = document.getElementById('fileUploadArea') || document.getElementById('uploadZone');
const fileInput = document.getElementById('reviewScreenshot') || document.getElementById('fileInput');
const fileName = document.getElementById('fileName');

if (fileUploadArea && fileInput) {
    fileUploadArea.addEventListener('click', (e) => {
        if (e.target !== fileInput) {
            fileInput.click();
        }
    });
    fileUploadArea.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            fileInput.click();
        }
    });
    fileUploadArea.addEventListener('dragover', (e) => {
        e.preventDefault();
        fileUploadArea.classList.add('is-dragover');
    });
    fileUploadArea.addEventListener('dragleave', () => {
        fileUploadArea.classList.remove('is-dragover');
    });
    fileUploadArea.addEventListener('drop', (e) => {
        e.preventDefault();
        const files = e.dataTransfer?.files || [];
        if (files.length > 0) {
            fileInput.files = files;
            handleFileSelect();
        }
        fileUploadArea.classList.remove('is-dragover');
    });
}

if (fileInput) fileInput.addEventListener('change', handleFileSelect);

function handleFileSelect() {
    if (!fileInput) return;
    if (fileInput.files && fileInput.files.length > 0) {
        uploadedFile = fileInput.files[0];
        if (fileName) fileName.textContent = `✓ ${uploadedFile.name}`;
        if (fileUploadArea) fileUploadArea.classList.add('has-file');
    }
}

function fileToBase64(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.readAsDataURL(file);
        reader.onload = () => resolve(reader.result);
        reader.onerror = (error) => reject(error);
    });
}

function showError(message) {
    console.log('Showing error:', message);
    const errorDiv = document.getElementById('errorMessage');
    if (!errorDiv) {
        console.error('Error message div not found!');
        showToast(message, 'error');
        return;
    }
    errorDiv.textContent = message;
    errorDiv.classList.add('show');
    setTimeout(() => {
        errorDiv.classList.remove('show');
    }, 5000);
}

function createFloatingDollars() {
    const successContainer = document.getElementById('successMessage');
    if (!successContainer) return;
    const dollarCount = 12;
    const confettiCount = 20;
    const colors = ['#C4956A', '#722F37', '#D4B896', '#8B4049', '#E8DBC8', '#7A8B6E'];

    const existingElements = successContainer.querySelectorAll('.dollar-sign, .confetti');
    existingElements.forEach((el) => el.remove());

    for (let i = 0; i < dollarCount; i++) {
        const dollar = document.createElement('div');
        dollar.className = 'dollar-sign';
        dollar.textContent = '🎁';
        dollar.style.left = Math.random() * 100 + '%';
        dollar.style.animationDelay = Math.random() * 2 + 's';
        dollar.style.animationDuration = 3 + Math.random() * 2 + 's';
        dollar.style.bottom = '-50px';
        successContainer.appendChild(dollar);
    }

    for (let i = 0; i < confettiCount; i++) {
        const confetti = document.createElement('div');
        confetti.className = 'confetti';
        confetti.style.backgroundColor = colors[Math.floor(Math.random() * colors.length)];
        confetti.style.left = Math.random() * 100 + '%';
        confetti.style.top = -10 + 'px';
        confetti.style.animationDelay = Math.random() * 3 + 's';
        confetti.style.animationDuration = 2 + Math.random() * 2 + 's';
        successContainer.appendChild(confetti);
    }

    setTimeout(() => {
        const elements = successContainer.querySelectorAll('.dollar-sign, .confetti');
        elements.forEach((el) => el.remove());
    }, 6000);
}

const form = document.getElementById('rewardForm');
const formContainer = document.getElementById('formContainer');
const successMessage = document.getElementById('successMessage');
const submitButton = document.getElementById('submitButton');

async function handleFormSubmit(e) {
    if (e) e.preventDefault();

    const reviewLinkInput = document.getElementById('reviewLink');
    const reviewLink = reviewLinkInput ? reviewLinkInput.value : '';
    const hasScreenshot = fileInput && fileInput.files && fileInput.files.length > 0;

    if (!selectedMethod) return showError('Please choose how you would like to receive your gift');
    if (!paymentHandle || !paymentHandle.value) return showError('Please enter your email so we can send your gift');
    if (!reviewLink && !hasScreenshot) return showError('Please share either a link to your feedback or upload a screenshot');

    if (submitButton) {
        submitButton.textContent = 'Submitting...';
        submitButton.disabled = true;
    }

    try {
        let screenshotData = null;
        if (hasScreenshot && uploadedFile) {
            screenshotData = await fileToBase64(uploadedFile);
        }

        const response = await fetch('/api/submissions', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                payment_method: selectedMethod,
                payment_handle: paymentHandle.value,
                review_link: reviewLink || null,
                screenshot_url: screenshotData,
                award_amount: rewardAmount,
                previous_guest: isPreviousGuest,
            })
        });

        const result = await response.json();
        if (!response.ok) {
            throw new Error(result.error || 'Failed to submit');
        }

        if (formContainer) formContainer.style.display = 'none';
        if (successMessage) successMessage.style.display = 'block';
        createFloatingDollars();
    } catch (err) {
        console.error('Error submitting:', err);
        showError('There was an error submitting your claim. Please try again.');
        if (submitButton) {
            submitButton.textContent = 'Submit for Review';
            submitButton.disabled = false;
        }
    }
}

if (submitButton) {
    submitButton.addEventListener('click', handleFormSubmit);
}
if (form) {
    form.addEventListener('submit', handleFormSubmit);
}

const userAuthLink = document.getElementById('userAuthLink');
const authModal = document.getElementById('authModal');
const authTitle = document.getElementById('authTitle');
const authError = document.getElementById('authError');
const authEmail = document.getElementById('authEmail');
const authPassword = document.getElementById('authPassword');
const authSubmitBtn = document.getElementById('authSubmitBtn');
const toggleAuthModeBtn = document.getElementById('toggleAuthMode');
const forgotPasswordBtn = document.getElementById('forgotPasswordBtn');
const profilePopover = document.getElementById('userProfileDropdown');
const submissionsModal = document.getElementById('submissionsModal');
const closeSubmissionsModalBtn = document.getElementById('closeSubmissionsModal');
const closeAuthModalBtn = document.getElementById('authClose');
const viewMySubsBtn = document.getElementById('viewMySubsBtn');
const backHomeBtn = document.getElementById('backHomeBtn');

let authMode = 'signin';

function openAuthModal() {
    if (!authModal || !authError || !authEmail || !authPassword) return;
    authModal.classList.add('active');
    authError.style.display = 'none';
    authEmail.value = '';
    authPassword.value = '';
}

function closeAuthModal() {
    if (authModal) authModal.classList.remove('active');
}

function setAuthMode(mode) {
    authMode = mode;
    const confirmPasswordGroup = document.getElementById('confirmPasswordGroup');
    const passwordRequirements = document.getElementById('passwordRequirements');
    const authConfirmPassword = document.getElementById('authConfirmPassword');
    
    if (mode === 'signin') {
        if (authSubmitBtn) authSubmitBtn.textContent = 'Sign In';
        if (toggleAuthModeBtn) toggleAuthModeBtn.textContent = 'Create an account';
        if (confirmPasswordGroup) confirmPasswordGroup.style.display = 'none';
        if (passwordRequirements) passwordRequirements.style.display = 'none';
        if (authConfirmPassword) authConfirmPassword.value = '';
    } else {
        if (authSubmitBtn) authSubmitBtn.textContent = 'Create Account';
        if (toggleAuthModeBtn) toggleAuthModeBtn.textContent = 'Have an account? Sign in';
        if (confirmPasswordGroup) confirmPasswordGroup.style.display = 'block';
        if (passwordRequirements) passwordRequirements.style.display = 'block';
        validatePasswordRequirements();
        validatePasswordMatch();
    }
}

function validatePasswordRequirements() {
    const password = document.getElementById('authPassword')?.value || '';
    const reqLength = document.getElementById('reqLength');
    
    if (!reqLength) return;
    
    const icon = reqLength.querySelector('.req-icon');
    const isValid = password.length >= 8;
    
    if (isValid) {
        reqLength.style.color = 'var(--success, #3D6635)';
        icon.style.borderColor = 'var(--success, #3D6635)';
        icon.style.background = 'var(--success, #3D6635)';
        icon.style.color = 'white';
        icon.innerHTML = '✓';
    } else {
        reqLength.style.color = 'var(--warm-gray-dark)';
        icon.style.borderColor = 'var(--warm-gray)';
        icon.style.background = 'transparent';
        icon.style.color = 'transparent';
        icon.innerHTML = '';
    }
    
    return isValid;
}

function validatePasswordMatch() {
    const password = document.getElementById('authPassword')?.value || '';
    const confirmPassword = document.getElementById('authConfirmPassword')?.value || '';
    const matchIcon = document.getElementById('matchIcon');
    const matchText = document.getElementById('matchText');
    
    if (!matchIcon || !matchText) return false;
    
    const hasConfirmInput = confirmPassword.length > 0;
    const isMatch = password === confirmPassword && hasConfirmInput;
    
    if (isMatch) {
        matchIcon.style.borderColor = 'var(--success, #3D6635)';
        matchIcon.style.background = 'var(--success, #3D6635)';
        matchIcon.style.color = 'white';
        matchIcon.innerHTML = '✓';
        matchText.style.color = 'var(--success, #3D6635)';
        matchText.textContent = 'Passwords match';
    } else if (hasConfirmInput && password !== confirmPassword) {
        matchIcon.style.borderColor = 'var(--danger, #991B1B)';
        matchIcon.style.background = 'transparent';
        matchIcon.style.color = 'var(--danger, #991B1B)';
        matchIcon.innerHTML = '✗';
        matchText.style.color = 'var(--danger, #991B1B)';
        matchText.textContent = 'Passwords do not match';
    } else {
        matchIcon.style.borderColor = 'var(--warm-gray)';
        matchIcon.style.background = 'transparent';
        matchIcon.style.color = 'transparent';
        matchIcon.innerHTML = '';
        matchText.style.color = 'var(--warm-gray-dark)';
        matchText.textContent = 'Passwords must match';
    }
    
    return isMatch;
}

document.getElementById('authPassword')?.addEventListener('input', () => {
    if (authMode === 'signup') {
        validatePasswordRequirements();
        validatePasswordMatch();
    }
});

document.getElementById('authConfirmPassword')?.addEventListener('input', () => {
    validatePasswordMatch();
});

if (userAuthLink) {
    userAuthLink.addEventListener('click', async (e) => {
        e.preventDefault();
        if (currentUser) {
            toggleProfilePopover();
        } else {
            setAuthMode('signin');
            openAuthModal();
        }
    });
}

const userAuthLinkMobile = document.getElementById('userAuthLinkMobile');
if (userAuthLinkMobile) {
    userAuthLinkMobile.addEventListener('click', async (e) => {
        e.preventDefault();
        if (currentUser) {
            toggleProfilePopover();
        } else {
            setAuthMode('signin');
            openAuthModal();
        }
    });
}

if (toggleAuthModeBtn) {
    toggleAuthModeBtn.addEventListener('click', (e) => {
        e.preventDefault();
        setAuthMode(authMode === 'signin' ? 'signup' : 'signin');
    });
}

const authTabs = document.querySelectorAll('.auth-tab[data-tab]');
authTabs.forEach(tab => {
    tab.addEventListener('click', (e) => {
        e.preventDefault();
        const mode = tab.dataset.tab === 'signup' ? 'signup' : 'signin';
        setAuthMode(mode);
        authTabs.forEach(t => t.classList.remove('active'));
        tab.classList.add('active');
    });
});

async function handleAuthSubmit() {
    if (!authError || !authEmail || !authPassword || !authSubmitBtn) return;
    authError.style.display = 'none';
    const email = authEmail.value.trim();
    const password = authPassword.value;
    
    if (!email || !password) {
        authError.textContent = 'Please enter email and password';
        authError.style.display = 'block';
        return;
    }

    if (authMode === 'signup') {
        const confirmPassword = document.getElementById('authConfirmPassword')?.value;
        
        if (password.length < 8) {
            authError.textContent = 'Password must be at least 8 characters';
            authError.style.display = 'block';
            return;
        }
        
        if (password !== confirmPassword) {
            authError.textContent = 'Passwords do not match';
            authError.style.display = 'block';
            return;
        }
    }

    authSubmitBtn.disabled = true;
    authSubmitBtn.textContent = authMode === 'signin' ? 'Signing In...' : 'Creating Account...';
    
    try {
        const endpoint = authMode === 'signin' ? '/api/auth/signin' : '/api/auth/signup';
        const response = await fetch(endpoint, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email, password })
        });

        const result = await response.json();
        
        if (!response.ok) {
            throw new Error(result.error || 'Authentication failed');
        }

        if (authMode === 'signup') {
            authError.style.color = 'var(--success, #3D6635)';
            authError.style.background = 'linear-gradient(135deg, #B8C4AD 0%, #C5D5C3 100%)';
            authError.textContent = 'Account created successfully!';
            authError.style.display = 'block';
            
            currentUser = result.user;
            updateAuthUI();
            setTimeout(() => closeAuthModal(), 1500);
        } else {
            currentUser = result.user;
            updateAuthUI();
            closeAuthModal();
        }
    } catch (err) {
        authError.style.color = '';
        authError.style.background = '';
        authError.textContent = err.message || 'Authentication error';
        authError.style.display = 'block';
    } finally {
        authSubmitBtn.disabled = false;
        authSubmitBtn.textContent = authMode === 'signin' ? 'Sign In' : 'Create Account';
    }
}

if (authSubmitBtn) {
    authSubmitBtn.addEventListener('click', handleAuthSubmit);
}

const forgotPasswordForm = document.getElementById('forgotPasswordForm');
const forgotEmail = document.getElementById('forgotEmail');
const forgotError = document.getElementById('forgotError');
const sendResetBtn = document.getElementById('sendResetBtn');
const backToSignInBtn = document.getElementById('backToSignIn');
const authTabsContainer = document.querySelector('.auth-tabs');
const authFormElement = document.getElementById('authForm');
const forgotPasswordDiv = document.querySelector('.forgot-password');
const authModalHeader = document.querySelector('.auth-modal-header h3');

function showForgotPasswordForm() {
    if (authTabsContainer) authTabsContainer.style.display = 'none';
    if (authFormElement) authFormElement.style.display = 'none';
    if (forgotPasswordDiv) forgotPasswordDiv.style.display = 'none';
    if (forgotPasswordForm) forgotPasswordForm.style.display = 'block';
    if (authModalHeader) authModalHeader.textContent = 'Reset Password';
    if (authError) authError.style.display = 'none';
    if (forgotError) forgotError.style.display = 'none';
    if (forgotEmail && authEmail) {
        forgotEmail.value = authEmail.value.trim();
    }
}

function showSignInForm() {
    if (authTabsContainer) authTabsContainer.style.display = 'flex';
    if (authFormElement) authFormElement.style.display = 'block';
    if (forgotPasswordDiv) forgotPasswordDiv.style.display = 'block';
    if (forgotPasswordForm) forgotPasswordForm.style.display = 'none';
    if (authModalHeader) authModalHeader.textContent = 'Welcome';
    if (forgotError) forgotError.style.display = 'none';
}

if (forgotPasswordBtn) {
    forgotPasswordBtn.addEventListener('click', (e) => {
        e.preventDefault();
        showForgotPasswordForm();
    });
}

if (backToSignInBtn) {
    backToSignInBtn.addEventListener('click', (e) => {
        e.preventDefault();
        showSignInForm();
    });
}

if (sendResetBtn) {
    sendResetBtn.addEventListener('click', async (e) => {
        e.preventDefault();
        const email = forgotEmail?.value.trim();
        if (!email) {
            if (forgotError) {
                forgotError.textContent = 'Please enter your email address';
                forgotError.style.display = 'block';
                forgotError.style.background = '';
                forgotError.style.color = '';
            }
            return;
        }
        
        sendResetBtn.disabled = true;
        sendResetBtn.textContent = 'Sending...';
        
        try {
            const response = await fetch('/api/auth/reset-password-request', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ email })
            });

            const result = await response.json();
            if (forgotError) {
                forgotError.textContent = 'If an account exists with this email, a password reset link will be sent.';
                forgotError.style.display = 'block';
                forgotError.style.background = 'linear-gradient(135deg, #B8C4AD 0%, #C5D5C3 100%)';
                forgotError.style.color = '#3D6635';
            }
        } catch (err) {
            if (forgotError) {
                forgotError.textContent = err.message || 'Failed to send reset email';
                forgotError.style.display = 'block';
                forgotError.style.background = 'linear-gradient(135deg, #FEE2E2 0%, #FECACA 100%)';
                forgotError.style.color = '#991B1B';
            }
        } finally {
            sendResetBtn.disabled = false;
            sendResetBtn.textContent = 'Get Reset Link';
        }
    });
}

if (closeAuthModalBtn) {
    closeAuthModalBtn.addEventListener('click', closeAuthModal);
}

if (authModal) {
    authModal.addEventListener('click', (e) => {
        if (e.target === authModal) {
            closeAuthModal();
        }
    });
}

document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && authModal && authModal.classList.contains('active')) {
        closeAuthModal();
    }
});

function updateAuthUI() {
    const userAuthLinkMobileEl = document.getElementById('userAuthLinkMobile');
    if (currentUser) {
        const email = currentUser.email;
        const emailPrefix = email.split('@')[0];
        const initials = emailPrefix.charAt(0).toUpperCase();

        const userHTML = `
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path>
        <circle cx="12" cy="7" r="4"></circle>
      </svg>
      <span class="auth-button-text">${currentUser.email}</span>
    `;

        const userHTMLMobile = `
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path>
        <circle cx="12" cy="7" r="4"></circle>
      </svg>
      <span class="auth-button-text-mobile">${initials}</span>
    `;

        if (userAuthLink) userAuthLink.innerHTML = userHTML;
        if (userAuthLinkMobileEl) userAuthLinkMobileEl.innerHTML = userHTMLMobile;
        closeAuthModal();
        closeProfilePopover();
        loadMySubmissions();
    } else {
        const signInHTML = `
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path>
        <circle cx="12" cy="7" r="4"></circle>
      </svg>
      <span class="auth-button-text">Sign In</span>
    `;
        if (userAuthLink) userAuthLink.innerHTML = signInHTML;
        if (userAuthLinkMobileEl) userAuthLinkMobileEl.innerHTML = signInHTML.replace('auth-button-text', 'auth-button-text-mobile');
        closeProfilePopover();
    }
}

async function loadMySubmissions() {
    if (!currentUser) return;
    
    try {
        const response = await fetch('/api/submissions?user_only=true');
        const result = await response.json();
        
        if (response.ok && result.data) {
            mySubmissions = result.data;
        }
    } catch (err) {
        console.error('Error loading submissions:', err);
    }
    
    if (profilePopover && profilePopover.classList.contains('active')) renderProfilePopover();
    if (submissionsModal && submissionsModal.classList.contains('active')) renderMySubmissions(mySubmissions);
}

function renderMySubmissions(rows) {
    const wrapper = document.getElementById('mySubmissionsContent');
    if (!wrapper) return;
    if (!rows.length) {
        wrapper.innerHTML = `<div style="padding:18px; color:#6B635B; font-size:14px;">No submissions yet. Submit your first reward claim above.</div>`;
        return;
    }
    const header = `
    <div class="subs-table">
      <table>
        <thead>
          <tr>
            <th>Date</th>
            <th>Reward</th>
            <th>Delivery Email</th>
            <th>Type</th>
            <th>Status</th>
          </tr>
        </thead>
        <tbody>
    `;
    const rowsHtml = rows
        .map((r) => {
            const date = new Date(r.created_at).toLocaleString();
            const pm = (r.payment_method || '').toLowerCase();
            const type = r.review_link ? 'link' : 'screenshot';
            return `
        <tr>
          <td>${date}</td>
          <td><span class="pill ${pm}">${(r.payment_method || '').toUpperCase()}</span></td>
          <td><span class="handle">${r.payment_handle || ''}</span></td>
          <td><span class="pill ${type}">${type.toUpperCase()}</span></td>
          <td><span class="status-chip ${r.status}">${(r.status || '').toUpperCase()}</span></td>
        </tr>
      `;
        })
        .join('');
    const footer = `</tbody></table></div>`;
    wrapper.innerHTML = header + rowsHtml + footer;
}

function renderProfilePopover() {
    if (!currentUser || !profilePopover) return;
    const count = mySubmissions.length;
    profilePopover.innerHTML = `
    <div class="profile-header">
      <div style="font-weight:600;">Profile</div>
      <div style="font-size:13px; opacity:0.9;">${currentUser.email}</div>
    </div>
    <div class="profile-body">
      <div class="profile-row">
        <div>Submissions</div>
        <div style="font-weight:600;">${count}</div>
      </div>
    </div>
    <div class="profile-actions">
      <button class="btn-primary-small" id="openMySubsBtn">My Submissions</button>
      <button class="btn-secondary-small" id="signOutBtn">Sign Out</button>
    </div>
  `;
    const openBtn = document.getElementById('openMySubsBtn');
    const signOutBtn = document.getElementById('signOutBtn');
    if (openBtn) openBtn.onclick = () => openSubmissionsModal();
    if (signOutBtn) signOutBtn.onclick = async () => {
        await fetch('/api/auth/signout', { method: 'POST' });
        currentUser = null;
        mySubmissions = [];
        updateAuthUI();
    };
}

function toggleProfilePopover() {
    if (!profilePopover) return;
    if (profilePopover.style.display === 'block') {
        closeProfilePopover();
    } else {
        renderProfilePopover();
        profilePopover.style.display = 'block';
    }
}

function closeProfilePopover() {
    if (profilePopover) profilePopover.style.display = 'none';
}

async function openSubmissionsModal() {
    if (!submissionsModal) return;
    submissionsModal.classList.add('active');
    closeProfilePopover();
    const wrapper = document.getElementById('mySubmissionsContent');
    if (!currentUser) {
        if (wrapper) {
            wrapper.innerHTML = '<div style="padding:18px; color:#6B635B; font-size:14px;">Please sign in to view your submissions.<br /><button class="btn-primary-small" id="modalSignInBtn" style="margin-top:12px;">Sign In</button></div>';
            const btn = document.getElementById('modalSignInBtn');
            if (btn)
                btn.onclick = () => {
                    closeSubmissionsModal();
                    setAuthMode('signin');
                    openAuthModal();
                };
        }
        return;
    }
    if (wrapper) wrapper.innerHTML = '<div style="padding:18px; color:#6B635B; font-size:14px;">Loading...</div>';
    if (!mySubmissions.length) await loadMySubmissions();
    renderMySubmissions(mySubmissions);
}

function closeSubmissionsModal() {
    if (submissionsModal) submissionsModal.classList.remove('active');
}

if (closeSubmissionsModalBtn) closeSubmissionsModalBtn.addEventListener('click', closeSubmissionsModal);
if (submissionsModal) {
    submissionsModal.addEventListener('click', (e) => {
        if (e.target === submissionsModal) closeSubmissionsModal();
    });
}

if (viewMySubsBtn) viewMySubsBtn.addEventListener('click', () => openSubmissionsModal());
if (backHomeBtn) {
    backHomeBtn.addEventListener('click', () => {
        if (successMessage) successMessage.style.display = 'none';
        if (formContainer) formContainer.style.display = 'block';
        if (submitButton) {
            submitButton.textContent = 'Send Details & Receive Your Gift';
            submitButton.disabled = false;
        }
        if (form) form.reset();
        paymentMethods.forEach((m) => m.classList.remove('selected'));
        selectedMethod = '';
        if (paymentHandle) {
            paymentHandle.disabled = true;
            paymentHandle.value = '';
        }
        if (paymentLabel) paymentLabel.textContent = 'Delivery Email';
        if (fileUploadArea) fileUploadArea.classList.remove('has-file');
        if (fileName) fileName.textContent = '';
    });
}

async function checkForPasswordReset() {
    const resetToken = urlParams.get('reset_token');
    if (resetToken) {
        const modal = document.getElementById('resetModal');
        if (modal) modal.classList.add('active');
    }
}

async function resetPassword() {
    const newPasswordInput = document.getElementById('newPassword');
    const confirmPasswordInput = document.getElementById('confirmPassword');
    const resetBtn = document.getElementById('resetPasswordBtn');
    const newPassword = newPasswordInput ? newPasswordInput.value : '';
    const confirmPassword = confirmPasswordInput ? confirmPasswordInput.value : '';
    const resetToken = urlParams.get('reset_token');

    if (newPassword !== confirmPassword) {
        showToast('Passwords do not match', 'error');
        return;
    }

    if (newPassword.length < 8) {
        showToast('Password must be at least 8 characters', 'error');
        return;
    }

    if (resetBtn) {
        resetBtn.textContent = 'Updating...';
        resetBtn.disabled = true;
    }

    try {
        const response = await fetch('/api/auth/reset-password', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ token: resetToken, password: newPassword })
        });

        const result = await response.json();
        
        if (!response.ok) {
            throw new Error(result.error || 'Failed to reset password');
        }

        showToast('Password updated successfully!', 'success');
        closeResetModal();
        setTimeout(() => {
            window.location.href = '/';
        }, 1500);
    } catch (error) {
        showToast(error.message || 'Error updating password', 'error');
        if (resetBtn) {
            resetBtn.textContent = 'Update Password';
            resetBtn.disabled = false;
        }
    }
}

function closeResetModal() {
    const modal = document.getElementById('resetModal');
    if (modal) modal.classList.remove('active');
    const url = new URL(window.location);
    url.searchParams.delete('reset_token');
    window.history.replaceState({}, '', url);
}

async function initAuth() {
    try {
        const response = await fetch('/api/auth/session');
        const result = await response.json();
        if (result.user) {
            currentUser = result.user;
        }
    } catch (err) {
        console.error('Error checking session:', err);
    }
    updateAuthUI();
}

window.addEventListener('load', () => {
    initAuth();
    checkForPasswordReset();
    
    // Reset modal close button
    const closeResetModalBtn = document.getElementById('closeResetModal');
    if (closeResetModalBtn) {
        closeResetModalBtn.addEventListener('click', closeResetModal);
    }
    
    // Close reset modal on backdrop click
    const resetModal = document.getElementById('resetModal');
    if (resetModal) {
        resetModal.addEventListener('click', (e) => {
            if (e.target === resetModal) closeResetModal();
        });
    }
});
