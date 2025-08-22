// Main application JavaScript

// Add global error handler
window.addEventListener('error', (e) => {
    console.error('Global JavaScript error:', e.message, e.filename, e.lineno);
});

// Supabase configuration
const SUPABASE_URL = 'https://dugjgmwlzyjillkemzhz.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImR1Z2pnbXdsenlqaWxsa2Vtemh6Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTU3MjE3MTIsImV4cCI6MjA3MTI5NzcxMn0.s9uM3exfI3hBvbiT3nZrC_whJ03IAy18202qmgJ4GOg';

// Initialize Supabase client
const supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

let currentUser = null;
let selectedMethod = '';
let uploadedFile = null;
let mySubmissions = [];

// Toggle tutorial visibility
function toggleTutorial() {
    const tutorial = document.getElementById('tutorialContent');
    if (tutorial) tutorial.classList.toggle('show');
}

// Payment method selection
const paymentMethods = document.querySelectorAll('.payment-method');
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
        if (selectedMethod === 'venmo') {
            paymentLabel.textContent = 'Venmo Username';
            if (paymentHandle) paymentHandle.placeholder = '@username';
        } else if (selectedMethod === 'zelle') {
            paymentLabel.textContent = 'Zelle Email or Phone';
            if (paymentHandle) paymentHandle.placeholder = 'email@example.com or (555) 123-4567';
        } else if (selectedMethod === 'paypal') {
            paymentLabel.textContent = 'PayPal Email';
            if (paymentHandle) paymentHandle.placeholder = 'email@example.com';
        }
    });
});

// File upload
const fileUploadArea = document.getElementById('fileUploadArea');
const fileInput = document.getElementById('reviewScreenshot');
const fileName = document.getElementById('fileName');

if (fileUploadArea && fileInput) {
    fileUploadArea.addEventListener('click', () => {
        fileInput.click();
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

// Convert file to base64
function fileToBase64(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.readAsDataURL(file);
        reader.onload = () => resolve(reader.result);
        reader.onerror = (error) => reject(error);
    });
}

// Show error message
function showError(message) {
    const errorDiv = document.getElementById('errorMessage');
    if (!errorDiv) return;
    errorDiv.textContent = message;
    errorDiv.classList.add('show');
    setTimeout(() => {
        errorDiv.classList.remove('show');
    }, 5000);
}

// Send admin notification email
async function sendAdminNotification(submission) {
    const requestBody = { record: submission };

    try {
        const response = await fetch('https://dugjgmwlzyjillkemzhz.supabase.co/functions/v1/send-admin-notification', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${SUPABASE_ANON_KEY}`
            },
            body: JSON.stringify(requestBody)
        });

        if (!response.ok) {
            const errorText = await response.text();
            throw new Error(`HTTP error! status: ${response.status} - ${errorText}`);
        }

        const responseText = await response.text();
        try {
            return JSON.parse(responseText);
        } catch (e) {
            return { success: true, rawResponse: responseText };
        }
    } catch (error) {
        console.error('Failed to send email notification:', error);
        throw error;
    }
}

// Create floating dollar signs and confetti animation
function createFloatingDollars() {
    const successContainer = document.getElementById('successMessage');
    if (!successContainer) return;
    const dollarCount = 12;
    const confettiCount = 20;
    const colors = ['#ffdd00', '#ff6b6b', '#4ecdc4', '#45b7d1', '#f9ca24', '#6c5ce7'];

    // Remove any existing animations
    const existingElements = successContainer.querySelectorAll('.dollar-sign, .confetti');
    existingElements.forEach((el) => el.remove());

    // Create dollar signs
    for (let i = 0; i < dollarCount; i++) {
        const dollar = document.createElement('div');
        dollar.className = 'dollar-sign';
        dollar.textContent = '$';
        dollar.style.left = Math.random() * 100 + '%';
        dollar.style.animationDelay = Math.random() * 2 + 's';
        dollar.style.animationDuration = 3 + Math.random() * 2 + 's';
        dollar.style.bottom = '-50px';
        successContainer.appendChild(dollar);
    }

    // Create confetti
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

    // Clean up after animation
    setTimeout(() => {
        const elements = successContainer.querySelectorAll('.dollar-sign, .confetti');
        elements.forEach((el) => el.remove());
    }, 6000);
}

// Form submission
const form = document.getElementById('rewardForm');
const formContainer = document.getElementById('formContainer');
const successMessage = document.getElementById('successMessage');
const submitButton = document.getElementById('submitButton');

// Form elements

// Submit button click handler
if (submitButton) {
    submitButton.addEventListener('click', (e) => {
        // If the button type is not "submit", manually trigger form submission
        if (e.target.type !== 'submit') {
            if (form) {
                form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
            }
        }
    });
}

if (form) {
    form.addEventListener('submit', async (e) => {
        e.preventDefault();

        const reviewLinkInput = document.getElementById('reviewLink');
        const reviewLink = reviewLinkInput ? reviewLinkInput.value : '';
        const hasScreenshot = fileInput && fileInput.files && fileInput.files.length > 0;

        if (!selectedMethod) return showError('Please select a payment method');
        if (!paymentHandle || !paymentHandle.value) return showError('Please enter your payment information');
        if (!reviewLink && !hasScreenshot) return showError('Please provide either a review link or upload a screenshot');

        if (submitButton) {
            submitButton.textContent = 'Submitting...';
            submitButton.disabled = true;
        }

        try {
            let screenshotData = null;
            if (hasScreenshot && uploadedFile) {
                screenshotData = await fileToBase64(uploadedFile);
            }

            const { data: userResp, error: userError } = await supabase.auth.getUser();
            if (userError) {
                console.error('User error:', userError);
            }
            const userId = userResp?.user?.id || null;

            const { data, error } = await supabase
                .from('review_rewards')
                .insert([
                    {
                        payment_method: selectedMethod,
                        payment_handle: paymentHandle.value,
                        review_link: reviewLink || null,
                        screenshot_url: screenshotData,
                        status: 'pending',
                        user_id: userId,
                    },
                ]);

            if (error) {
                console.error('Database error:', error);
                throw error;
            }

            // Send admin notification
            const submissionData = {
                payment_method: selectedMethod,
                payment_handle: paymentHandle.value,
                created_at: new Date().toISOString(),
            };

            try {
                await sendAdminNotification(submissionData);
            } catch (emailError) {
                console.error('Failed to send admin notification:', emailError);
                // Don't fail the whole submission for email issues
            }

            if (formContainer) formContainer.style.display = 'none';
            if (successMessage) successMessage.style.display = 'block';
            createFloatingDollars();
        } catch (err) {
            console.error('Error submitting:', err);
            console.error('Error details:', {
                message: err.message,
                code: err.code,
                details: err.details,
                hint: err.hint
            });
            showError('There was an error submitting your claim. Please try again.');
            if (submitButton) {
                submitButton.textContent = 'Submit & Claim Reward';
                submitButton.disabled = false;
            }
        }
    });
}

// ---------- Auth + User Dashboard ----------
const userAuthLink = document.getElementById('userAuthLink');
const authModal = document.getElementById('authModal');
const authTitle = document.getElementById('authTitle');
const authError = document.getElementById('authError');
const authEmail = document.getElementById('authEmail');
const authPassword = document.getElementById('authPassword');
const authSubmitBtn = document.getElementById('authSubmitBtn');
const toggleAuthModeBtn = document.getElementById('toggleAuthMode');
const forgotPasswordBtn = document.getElementById('forgotPasswordBtn');
const profilePopover = document.getElementById('profilePopover');
const submissionsModal = document.getElementById('submissionsModal');
const closeSubmissionsModalBtn = document.getElementById('closeSubmissionsModal');
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
    if (!authTitle || !authSubmitBtn || !toggleAuthModeBtn) return;
    if (mode === 'signin') {
        authTitle.textContent = 'Sign In';
        authSubmitBtn.textContent = 'Sign In';
        toggleAuthModeBtn.textContent = 'Create an account';
    } else {
        authTitle.textContent = 'Create Account';
        authSubmitBtn.textContent = 'Create Account';
        toggleAuthModeBtn.textContent = 'Have an account? Sign in';
    }
}

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

if (authSubmitBtn) {
    authSubmitBtn.addEventListener('click', async () => {
        if (!authError || !authEmail || !authPassword || !authSubmitBtn) return;
        authError.style.display = 'none';
        const email = authEmail.value.trim();
        const password = authPassword.value.trim();
        if (!email || !password) {
            authError.textContent = 'Please enter email and password';
            authError.style.display = 'block';
            return;
        }

        authSubmitBtn.disabled = true;
        authSubmitBtn.textContent = authMode === 'signin' ? 'Signing In...' : 'Creating Account...';
        try {
            if (authMode === 'signin') {
                const { error } = await supabase.auth.signInWithPassword({ email, password });
                if (error) throw error;
            } else {
                const { error } = await supabase.auth.signUp({ email, password });
                if (error) throw error;
            }
            closeAuthModal();
        } catch (err) {
            authError.textContent = err.message || 'Authentication error';
            authError.style.display = 'block';
        } finally {
            authSubmitBtn.disabled = false;
            authSubmitBtn.textContent = authMode === 'signin' ? 'Sign In' : 'Create Account';
        }
    });
}

if (forgotPasswordBtn) {
    forgotPasswordBtn.addEventListener('click', async (e) => {
        e.preventDefault();
        if (!authError || !authEmail) return;
        const email = authEmail.value.trim();
        if (!email) {
            authError.textContent = 'Enter your email above first to receive a reset link';
            authError.style.display = 'block';
            return;
        }
        authError.style.display = 'none';
        try {
            const { error } = await supabase.auth.resetPasswordForEmail(email, {
                redirectTo: window.MAIN_BASE_URL || window.location.origin + '/',
            });
            if (error) throw error;
            authError.textContent = 'Password reset email sent. Check your inbox.';
            authError.style.display = 'block';
            authError.style.background = '#d4edda';
            authError.style.color = '#155724';
        } catch (err) {
            authError.textContent = err.message || 'Failed to send reset email';
            authError.style.display = 'block';
            authError.style.background = '#f8d7da';
            authError.style.color = '#721c24';
        }
    });
}

function updateAuthUI() {
    const userAuthLinkMobileEl = document.getElementById('userAuthLinkMobile');
    if (currentUser) {
        // Get initials from email
        const email = currentUser.email;
        let displayText = email;

        // For mobile, show initials instead of full email
        // If there's a name, use first letter of first and last name
        // Otherwise, use first letter of email
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
    const { data, error } = await supabase
        .from('review_rewards')
        .select('*')
        .eq('user_id', currentUser.id)
        .order('created_at', { ascending: false });
    if (error) return;
    mySubmissions = data || [];
    if (profilePopover && profilePopover.style.display === 'block') renderProfilePopover();
    if (submissionsModal && submissionsModal.classList.contains('active')) renderMySubmissions(mySubmissions);
}

function renderMySubmissions(rows) {
    const wrapper = document.getElementById('mySubmissionsContent');
    if (!wrapper) return;
    if (!rows.length) {
        wrapper.innerHTML = `<div style="padding:16px; color:#666;">No submissions yet. Submit your first reward claim above.</div>`;
        return;
    }
    const header = `
    <table>
      <thead>
        <tr>
          <th>Date</th>
          <th>Payment</th>
          <th>Handle</th>
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
    const footer = `</tbody></table>`;
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
        await supabase.auth.signOut();
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
            wrapper.innerHTML = '<div style="padding:16px; color:#666;">Please sign in to view your submissions.<br /><button class="btn-primary-small" id="modalSignInBtn" style="margin-top:10px;">Sign In</button></div>';
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
    if (wrapper) wrapper.innerHTML = '<div style="padding:16px; color:#666;">Loading...</div>';
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

// Success actions
if (viewMySubsBtn) viewMySubsBtn.addEventListener('click', () => openSubmissionsModal());
if (backHomeBtn) {
    backHomeBtn.addEventListener('click', () => {
        if (successMessage) successMessage.style.display = 'none';
        if (formContainer) formContainer.style.display = 'block';
        if (submitButton) {
            submitButton.textContent = 'Submit & Claim Reward';
            submitButton.disabled = false;
        }
        if (form) form.reset();
        paymentMethods.forEach((m) => m.classList.remove('selected'));
        selectedMethod = '';
        if (paymentHandle) {
            paymentHandle.disabled = true;
            paymentHandle.value = '';
        }
        if (paymentLabel) paymentLabel.textContent = 'Select a payment method above';
        if (fileUploadArea) fileUploadArea.classList.remove('has-file');
        if (fileName) fileName.textContent = '';
    });
}

// Check for password reset token in URL
async function checkForPasswordReset() {
    const hashParams = new URLSearchParams(window.location.hash.substring(1));
    const accessToken = hashParams.get('access_token');
    const refreshToken = hashParams.get('refresh_token');
    const type = hashParams.get('type');
    const error = hashParams.get('error');
    const errorCode = hashParams.get('error_code');

    if (error === 'access_denied' && errorCode === 'otp_expired') {
        const message = 'Password reset link has expired. Please request a new one.\n\nWould you like to go to the admin login page?';
        if (confirm(message)) window.location.href = 'admin.html?reset_expired=true';
        window.location.hash = '';
        return;
    }

    if (accessToken && type === 'recovery') {
        const { error } = await supabase.auth.setSession({
            access_token: accessToken,
            refresh_token: refreshToken,
        });
        if (error) {
            alert('Error setting up password reset session: ' + error.message);
            return;
        }
        const modal = document.getElementById('resetModal');
        if (modal) modal.classList.add('active');
    }
}

// Password reset function
async function resetPassword() {
    const newPasswordInput = document.getElementById('newPassword');
    const confirmPasswordInput = document.getElementById('confirmPassword');
    const newPassword = newPasswordInput ? newPasswordInput.value : '';
    const confirmPassword = confirmPasswordInput ? confirmPasswordInput.value : '';

    if (newPassword !== confirmPassword) {
        alert('Passwords do not match!');
        return;
    }

    if (newPassword.length < 6) {
        alert('Password must be at least 6 characters long!');
        return;
    }

    try {
        const { data: { session } } = await supabase.auth.getSession();
        if (!session) {
            alert('Session expired. Please request a new password reset link.');
            closeResetModal();
            return;
        }

        const { error } = await supabase.auth.updateUser({ password: newPassword });
        if (error) throw error;
        alert('Password updated successfully! Redirecting to admin login...');
        await supabase.auth.signOut();
        window.location.href = 'index.html';
    } catch (error) {
        alert('Error updating password: ' + error.message);
    }
}

// Close reset modal
function closeResetModal() {
    const modal = document.getElementById('resetModal');
    if (modal) modal.classList.remove('active');
    window.location.hash = '';
}

// Auth state + initial session
async function initAuth() {
    const { data: { user } } = await supabase.auth.getUser();
    if (user) currentUser = user;
    updateAuthUI();
}

supabase.auth.onAuthStateChange((_event, session) => {
    currentUser = session?.user || null;
    updateAuthUI();
});

window.addEventListener('load', () => {
    initAuth();
    checkForPasswordReset();
});



