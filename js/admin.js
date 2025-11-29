        // Supabase configuration
        const SUPABASE_URL = 'https://dugjgmwlzyjillkemzhz.supabase.co';
        const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImR1Z2pnbXdsenlqaWxsa2Vtemh6Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTU3MjE3MTIsImV4cCI6MjA3MTI5NzcxMn0.s9uM3exfI3hBvbiT3nZrC_whJ03IAy18202qmgJ4GOg';

        // Initialize Supabase client
        let supabase;
        try {
            if (!window.supabase) {
                console.error('Supabase library not loaded');
                alert('Error: Database library not loaded. Please check your internet connection and refresh the page.');
            } else {
                supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
                console.log('Supabase client initialized successfully');
            }
        } catch (err) {
            console.error('Error initializing Supabase:', err);
            alert('Error initializing database connection: ' + err.message);
        }

        // Allowlisted admin emails (replace with your real admin emails). Kept as fallback.
        const ADMIN_EMAILS = ['admin@example.com', 'michaelort@hyatus.com', 'aahim7406@gmail.com'];

        function isAdminEmail(email) {
            const e = (email || '').toLowerCase();
            if (!e) return false;
            if (ADMIN_EMAILS.includes(e)) return true;
            // Allow hyatus.com domain admins as a fail-safe
            if (e.endsWith('@hyatus.com')) return true;
            return false;
        }

        async function isAdminUser(user) {
            if (!user) return false;
            try {
                // Prefer server-driven allowlist from public.admins
                const { data, error } = await supabase.from('admins').select('email').eq('email', user.email).maybeSingle();
                if (!error && data && data.email) return true;
            } catch (_) { }
            // Fallback to static list
            return isAdminEmail(user.email);
        }

        function showLoginError(msg) {
            const el = document.getElementById('loginError');
            el.style.display = 'block';
            el.textContent = msg;
        }

        let currentUser = null;
        let submissions = [];
        let currentPage = 0;
        let hasMoreData = true;
        let currentSearchTerm = '';
        const SUBMISSION_COLUMNS = [
            'id',
            'created_at',
            'payment_method',
            'payment_handle',
            'review_link',
            'screenshot_url',
            'award_amount',
            'previous_guest',
            'status',
            'awarded_at',
            'paid_at',
            'notes'
        ].join(', ');
        const ROWS_PER_PAGE = 50;
        const supportsAbortTimeout = typeof AbortSignal !== 'undefined' && typeof AbortSignal.timeout === 'function';
        let loggedAbortTimeoutWarning = false;

        function applyTimeout(query, timeoutMs) {
            if (!supportsAbortTimeout) {
                if (!loggedAbortTimeoutWarning) {
                    console.warn('AbortSignal.timeout not supported; continuing without request timeouts.');
                    loggedAbortTimeoutWarning = true;
                }
                return query;
            }

            try {
                return query.abortSignal(AbortSignal.timeout(timeoutMs));
            } catch (timeoutErr) {
                if (!loggedAbortTimeoutWarning) {
                    console.warn('Failed to apply AbortSignal timeout; continuing without request timeouts.', timeoutErr);
                    loggedAbortTimeoutWarning = true;
                }
                return query;
            }
        }

        // Get award amount based on ID (fallback for existing records)
        function getAwardAmount(submissionId) {
            // $20 for ID <= 95, $10 for others
            return submissionId <= 95 ? 20.00 : 10.00;
        }

        // Check authentication on load
        async function checkAuth() {
            // Check if redirected from expired reset link
            const urlParams = new URLSearchParams(window.location.search);
            if (urlParams.get('reset_expired') === 'true') {
                showLoginError('Your password reset link has expired. Please request a new one using the "Forgot password?" link below.');
                // Clean up URL
                window.history.replaceState({}, document.title, window.location.pathname);
            }

            const { data: { user } } = await supabase.auth.getUser();
            if (user) {
                const ok = await isAdminUser(user);
                if (!ok) {
                    showLoginError('You do not have admin access.');
                    await supabase.auth.signOut();
                    return;
                }
                currentUser = user;
                showDashboard();
            }
        }

        // Login form handler
        document.getElementById('loginForm').addEventListener('submit', async (e) => {
            e.preventDefault();
            const email = document.getElementById('email').value;
            const password = document.getElementById('password').value;

            try {
                const { data, error } = await supabase.auth.signInWithPassword({
                    email: email,
                    password: password,
                });

                if (error) throw error;

                if (!(await isAdminUser({ email }))) {
                    showLoginError('You do not have admin access.');
                    await supabase.auth.signOut();
                    return;
                }

                currentUser = data.user;
                showDashboard();
            } catch (error) {
                showLoginError('Invalid email or password');
            }
        });

        // Logout handler
        document.getElementById('logoutBtn').addEventListener('click', async () => {
            await supabase.auth.signOut();
            currentUser = null;
            // Reset UI back to login state
            showLoginForm();
            const loginWrapper = document.querySelector('.login-wrapper');
            if (loginWrapper) loginWrapper.style.display = 'flex';
            const dashboardEl = document.getElementById('dashboard');
            if (dashboardEl) {
                dashboardEl.classList.remove('active');
                dashboardEl.style.display = 'none';
            }
            document.getElementById('logoutBtn').style.display = 'none';
            document.getElementById('navTabs').classList.remove('active');
            // Clear any previously rendered rows to avoid stale UI
            const tbody = document.getElementById('submissionsBody');
            if (tbody) tbody.innerHTML = '';
            submissions = [];
        });

        // Forgot password handler
        document.getElementById('forgotPasswordLink').addEventListener('click', async (e) => {
            e.preventDefault();
            const email = document.getElementById('email').value || prompt('Please enter your email address:');

            if (!email) {
                return;
            }

            try {
                const { error } = await supabase.auth.resetPasswordForEmail(email, {
                    redirectTo: `${window.location.origin}/index.html`,
                });

                if (error) throw error;

                alert('Password reset email sent! Please check your inbox.');
            } catch (error) {
                alert('Error sending password reset email: ' + error.message);
            }
        });

        // Show dashboard
        function showDashboard() {
            document.querySelector('.login-wrapper').style.display = 'none';
            document.getElementById('logoutBtn').style.display = 'block';
            document.getElementById('navTabs').classList.add('active');

            // Show loading message immediately
            const tbody = document.getElementById('submissionsBody');
            if (tbody) {
                tbody.innerHTML = '<tr><td colspan="10" style="text-align: center; color: #6B635B;">Loading dashboard...</td></tr>';
            }

            // Properly initialize the rewards tab as active
            switchTab('rewards');
        }

        // Prevent multiple simultaneous loads
        let isLoadingSubmissions = false;

        // Load submissions with pagination
        async function loadSubmissions(retryCount = 0, resetPagination = true) {
            const normalizedRetryCount = Number(retryCount);
            retryCount = Number.isFinite(normalizedRetryCount) && normalizedRetryCount >= 0 ? normalizedRetryCount : 0;
            const shouldResetPagination = typeof resetPagination === 'boolean' ? resetPagination : true;

            // Prevent multiple simultaneous calls
            if (isLoadingSubmissions && retryCount === 0) {
                console.log('Load already in progress, skipping...');
                return;
            }

            isLoadingSubmissions = true;
            const maxRetries = 3;
            const retryDelay = 1000 * Math.pow(2, retryCount); // Exponential backoff
            const retryShouldReset = shouldResetPagination;

            // Reset pagination if requested
            if (shouldResetPagination) {
                currentPage = 0;
                hasMoreData = true;
                submissions = [];
                clearSelection();
            }

            // Show loading state
            const tbody = document.getElementById('submissionsBody');
            if (tbody && retryCount === 0) {
                if (shouldResetPagination) {
                    tbody.innerHTML = '<tr><td colspan="10" style="text-align: center; color: #6B635B;">Loading submissions...</td></tr>';
                } else {
                    tbody.innerHTML += '<tr><td colspan="10" style="text-align: center; color: #6B635B;">Loading more...</td></tr>';
                }
            }

            try {
                // Check if we have Supabase client
                if (!supabase) {
                    console.error('Supabase client not initialized');
                    alert('Database connection not initialized. Please refresh the page.');
                    return;
                }

                const statusFilter = document.getElementById('statusFilter') ? document.getElementById('statusFilter').value : 'all';
                const paymentFilter = document.getElementById('paymentFilter') ? document.getElementById('paymentFilter').value : 'all';
                const searchInputEl = document.getElementById('searchHandle');
                const searchHandle = searchInputEl ? searchInputEl.value.trim() : '';
                currentSearchTerm = searchHandle;

                console.log('Starting database query...');
                const queryStart = performance.now();

                // Query only the fields the UI uses to keep payloads small
                let query = supabase
                    .from('review_rewards')
                    .select(SUBMISSION_COLUMNS)
                    .order('created_at', { ascending: false })
                    .range(currentPage * ROWS_PER_PAGE, (currentPage + 1) * ROWS_PER_PAGE - 1);

                query = applyTimeout(query, 30000); // Increased to 30 seconds for complex queries

                if (statusFilter !== 'all') {
                    if (statusFilter === 'pending') {
                        // Include null status as pending
                        query = query.or('status.eq.pending,status.is.null');
                    } else {
                        query = query.eq('status', statusFilter);
                    }
                }
                if (paymentFilter !== 'all') {
                    query = query.eq('payment_method', paymentFilter);
                }
                if (searchHandle) {
                    query = query.ilike('payment_handle', `%${searchHandle}%`);
                }

                const { data, error } = await query;

                if (error) {
                    console.error('Supabase error:', error);
                    console.error('Error details:', {
                        message: error.message,
                        details: error.details,
                        hint: error.hint,
                        code: error.code,
                        status: error.status,
                        statusText: error.statusText
                    });

                    // More helpful error messages
                    if (error.message.includes('Failed to fetch') || error.name === 'AbortError') {
                        console.error('Network/timeout error details:', error);
                        // Retry with exponential backoff
                        if (retryCount < maxRetries) {
                            console.log(`Retrying in ${retryDelay}ms... (attempt ${retryCount + 1}/${maxRetries})`);
                            // Show retry message to user
                            if (tbody) {
                                tbody.innerHTML = `<tr><td colspan="10" style="text-align: center; color: #6B635B;">Connection timeout, retrying... (${retryCount + 1}/${maxRetries})</td></tr>`;
                            }
                            setTimeout(() => loadSubmissions(retryCount + 1, retryShouldReset), retryDelay);
                            return;
                        } else {
                            alert('Network error: Unable to connect to the database after multiple attempts. This may be due to slow connection or database performance issues.\n\nTip: Try refreshing the page or try again in a few moments.');
                            if (tbody) {
                                tbody.innerHTML = '<tr><td colspan="10" style="text-align: center; color: #991B1B;">Unable to load submissions. Please try refreshing.</td></tr>';
                            }
                        }
                    } else if (error.code === 'PGRST301') {
                        alert('Authentication error: Please log in again.');
                        window.location.reload();
                    } else if (error.message.includes('infinite recursion')) {
                        alert('Database policy error detected. Please contact support to fix RLS policies.');
                    } else if (error.status === 500) {
                        alert('Server Error (500): The database server encountered an error.\n\nCommon causes:\n1. Row Level Security (RLS) policies are blocking access\n2. Table permissions are not set correctly\n3. Database function or trigger error\n\nPlease check your Supabase dashboard:\n- Go to Authentication > Policies\n- Check the review_rewards table policies\n- Ensure your user has proper permissions');
                    } else {
                        alert('Error loading submissions: ' + error.message + '\n\nError code: ' + (error.code || 'Unknown') + '\nStatus: ' + (error.status || 'Unknown'));
                        if (tbody) {
                            tbody.innerHTML = '<tr><td colspan="10" style="text-align: center; color: #991B1B;">Failed to load submissions. Please refresh the page.</td></tr>';
                        }
                    }
                    return;
                }

                const newData = data || [];
                const queryEnd = performance.now();
                console.log(`Loaded ${newData.length} submissions in ${(queryEnd - queryStart).toFixed(2)}ms`);

                // Check if we have more data
                hasMoreData = newData.length === ROWS_PER_PAGE;

                // Add new data to existing submissions
                if (shouldResetPagination) {
                    submissions = newData;
                } else {
                    submissions = [...submissions, ...newData];
                }

                updateStats(submissions); // Stats should show all, not filtered
                renderSubmissions(submissions);
                updateSelection();
                updateLoadMoreButton();
            } catch (err) {
                console.error('Unexpected error in loadSubmissions:', err);
                alert('Unexpected error loading submissions: ' + err.message);
            } finally {
                // Always reset loading flag
                isLoadingSubmissions = false;
            }
        }

        // Update Load More button visibility
        function updateLoadMoreButton() {
            const loadMoreContainer = document.getElementById('loadMoreContainer');
            const loadMoreBtn = document.getElementById('loadMoreBtn');

            if (loadMoreContainer && loadMoreBtn) {
                if (hasMoreData && submissions.length > 0) {
                    loadMoreContainer.style.display = 'block';
                    loadMoreBtn.disabled = isLoadingSubmissions;
                    loadMoreBtn.textContent = isLoadingSubmissions ? 'Loading...' : 'Load More Submissions';
                } else {
                    loadMoreContainer.style.display = 'none';
                }
            }
        }

        // Load more submissions
        async function loadMoreSubmissions() {
            if (isLoadingSubmissions || !hasMoreData) {
                return;
            }

            currentPage++;
            await loadSubmissions(0, false); // Don't reset pagination
        }

        // Tabs logic
        function switchTab(which) {
            const rewardsTab = document.getElementById('dashboard');
            const summaryTab = document.getElementById('summaryDashboard');
            const btnRewards = document.getElementById('tabRewards');
            const btnSummary = document.getElementById('tabSummary');

            // Hide all tabs
            rewardsTab.classList.remove('active'); rewardsTab.style.display = 'none';
            summaryTab.classList.remove('active'); summaryTab.style.display = 'none';
            btnRewards.classList.remove('active');
            btnSummary.classList.remove('active');

            if (which === 'summary') {
                summaryTab.style.display = 'block'; summaryTab.classList.add('active');
                btnSummary.classList.add('active');
                loadSummary();
            } else {
                rewardsTab.style.display = 'block'; rewardsTab.classList.add('active');
                btnRewards.classList.add('active');
                // Don't reload submissions if we already have data
                if (!submissions || submissions.length === 0) {
                    loadSubmissions();
                } else {
                    // Just re-render existing data
                    renderSubmissions(submissions);
                }
            }
        }

        // Update statistics
        function updateStats(data) {
            document.getElementById('totalSubmissions').textContent = data.length;
            document.getElementById('pendingCount').textContent = data.filter(s => !s.status || s.status === 'pending').length;
            document.getElementById('awardedCount').textContent = data.filter(s => s.status === 'awarded').length;
            document.getElementById('paidCount').textContent = data.filter(s => s.status === 'paid').length;
            document.getElementById('rejectedCount').textContent = data.filter(s => s.status === 'rejected').length;
        }

        // Render submissions table
        function renderSubmissions(data) {
            try {
                const tbody = document.getElementById('submissionsBody');
                if (!tbody) {
                    console.error('Submissions table body not found');
                    return;
                }

                tbody.innerHTML = '';

                if (!data || data.length === 0) {
                    tbody.innerHTML = '<tr><td colspan="10" style="text-align: center; color: #8B8278;">No submissions found</td></tr>';
                    return;
                }

                const fragment = document.createDocumentFragment();
                data.forEach((submission, index) => {
                    try {
                        const row = document.createElement('tr');
                        const date = new Date(submission.created_at || Date.now()).toLocaleDateString();
                        const reviewType = submission.review_link ? 'Link' : 'Screenshot';

                        row.innerHTML = `
                            <td><input type="checkbox" class="submission-checkbox" data-id="${submission.id}" onchange="updateSelection()"></td>
                            <td>#${submission.id || 'N/A'}</td>
                    <td>${date}</td>
                            <td>${(submission.payment_method || '').toUpperCase()}</td>
                            <td>${submission.payment_handle || ''}</td>
                    <td>${reviewType}</td>
                            <td>$${(submission.award_amount || getAwardAmount(submission.id)).toFixed(2)}</td>
                            <td>${submission.previous_guest ? '✓ Yes' : 'No'}</td>
                            <td><span class="status-badge status-${submission.status || 'pending'}">${(submission.status || 'pending').toUpperCase()}</span></td>
                    <td>
                        <div class="action-buttons">
                            <button class="action-btn btn-view" onclick="viewDetails(${submission.id})">View</button>
                                    <button class="action-btn btn-edit" onclick="editAward(${submission.id})">Edit Award</button>
                                    ${(submission.status || 'pending') === 'pending' ? `
                                <button class="action-btn btn-award" onclick="updateStatus(${submission.id}, 'awarded')">Award</button>
                                <button class="action-btn btn-reject" onclick="updateStatus(${submission.id}, 'rejected')">Reject</button>
                                    ` : (submission.status === 'awarded' ? `
                                        <button class="action-btn btn-paid" onclick="updateStatus(${submission.id}, 'paid')">Mark Paid</button>
                                        <button class="action-btn btn-revert" onclick="updateStatus(${submission.id}, 'pending')">Revert to Pending</button>
                                    ` : (submission.status === 'paid' ? `
                                        <button class="action-btn btn-revert" onclick="updateStatus(${submission.id}, 'awarded')">Revert to Awarded</button>
                                    ` : (submission.status === 'rejected' ? `
                                        <button class="action-btn btn-revert" onclick="updateStatus(${submission.id}, 'pending')">Revert to Pending</button>
                                    ` : '')))}
                        </div>
                    </td>
                `;
                        fragment.appendChild(row);
                    } catch (submissionError) {
                        console.error('Error rendering submission:', submissionError, submission);
                        // Continue with other submissions
                    }
                });

                tbody.appendChild(fragment);
            } catch (err) {
                console.error('Error in renderSubmissions:', err);
                const tbody = document.getElementById('submissionsBody');
                if (tbody) {
                    tbody.innerHTML = '<tr><td colspan="10" style="text-align: center; color: #991B1B;">Error loading submissions</td></tr>';
                }
            }
        }

        // View submission details
        function viewDetails(id) {
            const submission = submissions.find(s => s.id === id);
            if (!submission) return;

            const modal = document.getElementById('detailModal');
            const modalBody = document.getElementById('modalBody');

            modalBody.innerHTML = `
                <div class="detail-row">
                    <div class="detail-label">Submission ID:</div>
                    <div class="detail-value">#${submission.id}</div>
                </div>
                <div class="detail-row">
                    <div class="detail-label">Date Submitted:</div>
                    <div class="detail-value">${new Date(submission.created_at).toLocaleString()}</div>
                </div>
                <div class="detail-row">
                    <div class="detail-label">Reward Choice:</div>
                    <div class="detail-value">${(submission.payment_method || '').toUpperCase()}</div>
                </div>
                <div class="detail-row">
                    <div class="detail-label">Delivery Email:</div>
                    <div class="detail-value">${submission.payment_handle || ''}</div>
                </div>
                <div class="detail-row">
                    <div class="detail-label">Award Amount:</div>
                    <div class="detail-value">$${(submission.award_amount || getAwardAmount(submission.id)).toFixed(2)}</div>
                </div>
                <div class="detail-row">
                    <div class="detail-label">Previous Guest:</div>
                    <div class="detail-value">${submission.previous_guest ? '✓ Yes' : 'No'}</div>
                </div>
                <div class="detail-row">
                    <div class="detail-label">Status:</div>
                    <div class="detail-value"><span class="status-badge status-${submission.status || 'pending'}">${(submission.status || 'pending').toUpperCase()}</span></div>
                </div>
                ${submission.review_link ? `
                    <div class="detail-row">
                        <div class="detail-label">Review Link:</div>
                        <div class="detail-value"><a href="${submission.review_link}" target="_blank">${submission.review_link}</a></div>
                    </div>
                ` : ''}
                ${submission.screenshot_url ? `
                    <div class="detail-row">
                        <div class="detail-label">Screenshot:</div>
                        <div class="detail-value">
                            <img src="${submission.screenshot_url}" class="screenshot-preview" alt="Review Screenshot">
                        </div>
                    </div>
                ` : ''}
                ${submission.awarded_at ? `
                    <div class="detail-row">
                        <div class="detail-label">Awarded At:</div>
                        <div class="detail-value">${new Date(submission.awarded_at).toLocaleString()}</div>
                    </div>
                ` : ''}
                ${submission.paid_at ? `
                    <div class="detail-row">
                        <div class="detail-label">Paid At:</div>
                        <div class="detail-value">${new Date(submission.paid_at).toLocaleString()}</div>
                    </div>
                ` : ''}
                <div class="detail-row">
                    <div class="detail-label">Notes:</div>
                    <div class="detail-value">
                        <textarea class="notes-input" id="notes-${submission.id}" placeholder="Add notes here...">${submission.notes || ''}</textarea>
                        <button class="btn" style="margin-top: 10px;" onclick="saveNotes(${submission.id})">Save Notes</button>
                    </div>
                </div>
            `;

            modal.classList.add('active');
        }

        // Close modal
        function closeModal() {
            document.getElementById('detailModal').classList.remove('active');
        }

        // Update submission status
        async function updateStatus(id, newStatus) {
            try {
                // Disable the button to prevent double-clicks
                const button = event.target;
                const originalText = button.textContent;
                button.disabled = true;
                button.textContent = 'Updating...';

                const updateData = {
                    status: newStatus
                };

                if (newStatus === 'awarded') {
                    updateData.awarded_at = new Date().toISOString();
                    // Only set award_amount if not already set (for backward compatibility)
                    const submission = submissions.find(s => s.id === id);
                    if (!submission?.award_amount) {
                        updateData.award_amount = getAwardAmount(id);
                    }
                } else if (newStatus === 'paid') {
                    updateData.paid_at = new Date().toISOString();
                } else if (newStatus === 'pending') {
                    // When reverting to pending, clear the timestamps
                    updateData.awarded_at = null;
                    updateData.paid_at = null;
                }

                // Retry logic for better reliability
                let retries = 3;
                let lastError = null;

                while (retries > 0) {
                    try {
                        const { data, error } = await supabase
                            .from('review_rewards')
                            .update(updateData)
                            .eq('id', id)
                            .select();

                        if (error) {
                            throw error;
                        }

                        // Success - update the UI immediately
                        const submission = submissions.find(s => s.id === id);
                        if (submission) {
                            submission.status = newStatus;
                            if (newStatus === 'awarded') {
                                submission.awarded_at = updateData.awarded_at;
                                submission.award_amount = updateData.award_amount;
                            } else if (newStatus === 'paid') {
                                submission.paid_at = updateData.paid_at;
                            } else if (newStatus === 'pending') {
                                // Clear timestamps when reverting to pending
                                submission.awarded_at = null;
                                submission.paid_at = null;
                            }
                        }

                        // Refresh the display
                        updateStats(submissions);
                        renderSubmissions(submissions);

                        // Show success feedback
                        const statusText = newStatus === 'awarded' ? 'Awarded' :
                            (newStatus === 'paid' ? 'Paid' :
                                (newStatus === 'pending' ? 'Reverted' : 'Rejected'));
                        button.textContent = '✓ ' + statusText;
                        button.style.background = 'linear-gradient(135deg, #7A8B6E 0%, #6B7D60 100%)';
                        button.style.color = 'white';

                        setTimeout(() => {
                            button.disabled = false;
                            button.textContent = originalText;
                            button.style.background = '';
                            button.style.color = '';
                        }, 2000);

                        return; // Success, exit retry loop
                    } catch (error) {
                        lastError = error;
                        retries--;
                        if (retries > 0) {
                            // Wait before retrying
                            await new Promise(resolve => setTimeout(resolve, 1000));
                        }
                    }
                }

                // All retries failed
                throw lastError;

            } catch (error) {
                console.error('Error updating status:', error);

                // Re-enable button
                const button = event.target;
                button.disabled = false;
                button.textContent = originalText;

                // Show error message
                alert(`Failed to update status: ${error.message || 'Unknown error'}`);
            }
        }

        // Save notes
        async function saveNotes(id) {
            try {
                const notes = document.getElementById(`notes-${id}`).value;
                const button = event.target;
                const originalText = button.textContent;

                button.disabled = true;
                button.textContent = 'Saving...';

                // Retry logic for better reliability
                let retries = 3;
                let lastError = null;

                while (retries > 0) {
                    try {
                        const { error } = await supabase
                            .from('review_rewards')
                            .update({ notes: notes })
                            .eq('id', id);

                        if (error) {
                            throw error;
                        }

                        // Success - update local data
                        const submission = submissions.find(s => s.id === id);
                        if (submission) {
                            submission.notes = notes;
                        }

                        // Show success feedback
                        button.textContent = '✓ Saved';
                        button.style.background = 'linear-gradient(135deg, #7A8B6E 0%, #6B7D60 100%)';
                        button.style.color = 'white';

                        setTimeout(() => {
                            button.disabled = false;
                            button.textContent = originalText;
                            button.style.background = '';
                            button.style.color = '';
                        }, 2000);

                        return; // Success, exit retry loop
                    } catch (error) {
                        lastError = error;
                        retries--;
                        if (retries > 0) {
                            await new Promise(resolve => setTimeout(resolve, 1000));
                        }
                    }
                }

                // All retries failed
                throw lastError;

            } catch (error) {
                console.error('Error saving notes:', error);

                // Re-enable button
                const button = event.target;
                button.disabled = false;
                button.textContent = originalText;

                alert(`Failed to save notes: ${error.message || 'Unknown error'}`);
            }
        }

        // Edit Award functions
        let currentEditSubmissionId = null;

        async function editAward(id) {
            currentEditSubmissionId = id;
            const submission = submissions.find(s => s.id === id);
            if (!submission) return;

            const defaultAmt = getAwardAmount(id);
            const currentAmt = submission.award_amount || defaultAmt;

            document.getElementById('editSubmissionId').textContent = id;
            document.getElementById('defaultAmount').textContent = defaultAmt.toFixed(2);
            document.getElementById('editAwardAmount').value = currentAmt.toFixed(2);

            document.getElementById('editAwardModal').classList.add('active');
        }

        function closeEditAwardModal() {
            document.getElementById('editAwardModal').classList.remove('active');
            currentEditSubmissionId = null;
        }

        async function saveAwardAmount() {
            if (!currentEditSubmissionId) return;

            const amountInput = document.getElementById('editAwardAmount');
            const amount = parseFloat(amountInput.value);

            if (isNaN(amount) || amount < 0) {
                alert('Please enter a valid amount');
                return;
            }

            try {
                const { error } = await supabase
                    .from('review_rewards')
                    .update({ award_amount: amount })
                    .eq('id', currentEditSubmissionId);

                if (error) throw error;

                // Update local data
                const submission = submissions.find(s => s.id === currentEditSubmissionId);
                if (submission) {
                    submission.award_amount = amount;
                }

                // Refresh the display
                renderSubmissions(submissions);
                closeEditAwardModal();

                // Show success message
                alert(`Award amount updated to $${amount.toFixed(2)}`);

            } catch (error) {
                console.error('Error updating award amount:', error);
                alert('Failed to update award amount: ' + error.message);
            }
        }

        // Toggle method expansion
        function toggleMethodExpansion(rowId, method) {
            const row = document.querySelector(`tr[data-method="${method}"]`);
            const handleRows = document.querySelectorAll(`tr[data-parent="${rowId}"]`);

            if (row.classList.contains('expanded')) {
                row.classList.remove('expanded');
                handleRows.forEach(row => row.classList.remove('visible'));
            } else {
                row.classList.add('expanded');
                handleRows.forEach(row => row.classList.add('visible'));
            }
        }

        // Export summary to CSV
        async function exportSummaryCSV() {
            try {
                // Get all submissions data for detailed export
                const { data, error } = await supabase
                    .from('review_rewards')
                    .select('id, payment_method, payment_handle, review_link, status, award_amount, user_email, created_at, awarded_at, paid_at')
                    .order('created_at', { ascending: false });

                if (error) {
                    alert('Error loading data for export: ' + error.message);
                    return;
                }

                // Create CSV content
                let csv = 'ID,Reward Choice,Delivery Email,Review Link,Status,Award Amount,User Email,Created At,Awarded At,Paid At\n';

                data.forEach(row => {
                    const fields = [
                        row.id,
                        row.payment_method || '',
                        row.payment_handle || '',
                        row.review_link || '',
                        row.status || 'pending',
                        row.award_amount || '10.00',
                        row.user_email || '',
                        row.created_at || '',
                        row.awarded_at || '',
                        row.paid_at || ''
                    ];

                    // Escape fields that contain commas or quotes
                    const escapedFields = fields.map(field => {
                        const str = String(field);
                        if (str.includes(',') || str.includes('"') || str.includes('\n')) {
                            return `"${str.replace(/"/g, '""')}"`;
                        }
                        return str;
                    });

                    csv += escapedFields.join(',') + '\n';
                });

                // Create download link
                const blob = new Blob([csv], { type: 'text/csv' });
                const url = window.URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url;
                a.download = `review_rewards_export_${new Date().toISOString().split('T')[0]}.csv`;
                a.click();
                window.URL.revokeObjectURL(url);

            } catch (err) {
                console.error('Error exporting CSV:', err);
                alert('Error exporting CSV: ' + err.message);
            }
        }

        // Selection management
        let selectedIds = new Set();

        function toggleSelectAll() {
            const selectAll = document.getElementById('selectAll');
            const checkboxes = document.querySelectorAll('.submission-checkbox');

            checkboxes.forEach(checkbox => {
                checkbox.checked = selectAll.checked;
                const id = parseInt(checkbox.dataset.id);
                if (selectAll.checked) {
                    selectedIds.add(id);
                } else {
                    selectedIds.delete(id);
                }
            });

            updateBulkActionsBar();
        }

        function updateSelection() {
            selectedIds.clear();
            const checkboxes = document.querySelectorAll('.submission-checkbox:checked');
            checkboxes.forEach(checkbox => {
                selectedIds.add(parseInt(checkbox.dataset.id));
            });

            // Update select all checkbox
            const selectAll = document.getElementById('selectAll');
            const allCheckboxes = document.querySelectorAll('.submission-checkbox');
            if (selectAll) {
                selectAll.checked = allCheckboxes.length > 0 && checkboxes.length === allCheckboxes.length;
            }

            updateBulkActionsBar();
        }

        function updateBulkActionsBar() {
            const bulkBar = document.getElementById('bulkActionsBar');
            const selectedCount = document.getElementById('selectedCount');

            if (selectedIds.size > 0) {
                bulkBar.style.display = 'flex';
                selectedCount.textContent = `${selectedIds.size} selected`;
            } else {
                bulkBar.style.display = 'none';
            }
        }

        function clearSelection() {
            selectedIds.clear();
            document.querySelectorAll('.submission-checkbox').forEach(cb => cb.checked = false);
            const selectAll = document.getElementById('selectAll');
            if (selectAll) selectAll.checked = false;
            updateBulkActionsBar();
        }

        async function bulkMarkPaid() {
            if (selectedIds.size === 0) return;

            if (!confirm(`Mark ${selectedIds.size} submissions as paid?`)) return;

            try {
                // Get only awarded submissions from selected
                const awardedSubmissions = submissions.filter(sub =>
                    selectedIds.has(sub.id) && sub.status === 'awarded'
                );

                if (awardedSubmissions.length === 0) {
                    alert('No awarded submissions selected. Only awarded submissions can be marked as paid.');
                    return;
                }

                // Update each submission
                for (const sub of awardedSubmissions) {
                    const { error } = await supabase
                        .from('review_rewards')
                        .update({
                            status: 'paid',
                            paid_at: new Date().toISOString()
                        })
                        .eq('id', sub.id);

                    if (error) {
                        console.error(`Error updating submission ${sub.id}:`, error);
                    }
                }

                alert(`Successfully marked ${awardedSubmissions.length} submissions as paid`);
                clearSelection();
                await loadSubmissions();

            } catch (err) {
                console.error('Error in bulk update:', err);
                alert('Error updating submissions: ' + err.message);
            }
        }

        // Manual refresh only - no auto-refresh
        // Users must click the refresh button to get updated data

        // Test database connection
        async function testConnection() {
            try {
                let testQuery = supabase
                    .from('review_rewards')
                    .select('id')
                    .limit(1);

                testQuery = applyTimeout(testQuery, 5000);

                const { data, error } = await testQuery;

                if (error) {
                    console.error('Connection test failed:', error);
                    return false;
                }
                console.log('Database connection test passed');
                return true;
            } catch (err) {
                console.error('Connection test error:', err);
                return false;
            }
        }

        // Test table structure and permissions
        async function testTableAccess() {
            try {
                console.log('Testing table access...');

                // Test 1: Basic select
                const { data: basicData, error: basicError } = await supabase
                    .from('review_rewards')
                    .select('id')
                    .limit(1);

                if (basicError) {
                    console.error('Basic select failed:', basicError);
                    return { success: false, error: basicError, test: 'basic_select' };
                }

                // Test 2: Count query
                const { count, error: countError } = await supabase
                    .from('review_rewards')
                    .select('id', { count: 'exact', head: true });

                if (countError) {
                    console.error('Count query failed:', countError);
                    return { success: false, error: countError, test: 'count' };
                }

                // Test 3: Order by query
                const { data: orderData, error: orderError } = await supabase
                    .from('review_rewards')
                    .select('id, created_at')
                    .order('created_at', { ascending: false })
                    .limit(5);

                if (orderError) {
                    console.error('Order by query failed:', orderError);
                    return { success: false, error: orderError, test: 'order_by' };
                }

                console.log('All table access tests passed');
                return { success: true, count: count, sampleData: orderData };

            } catch (err) {
                console.error('Table access test error:', err);
                return { success: false, error: err, test: 'general' };
            }
        }

        // Add event listener for Load More button
        const loadMoreBtn = document.getElementById('loadMoreBtn');
        if (loadMoreBtn) {
            loadMoreBtn.addEventListener('click', loadMoreSubmissions);
        }

        // Fallback summary aggregation when view fails
        async function loadSummaryFallback() {
            try {
                console.log('Using fallback summary aggregation...');

                // Get basic counts and totals directly from main table
                let fallbackQuery = supabase
                    .from('review_rewards')
                    .select('payment_method, status, award_amount, id');

                fallbackQuery = applyTimeout(fallbackQuery, 15000);

                const { data: allData, error } = await fallbackQuery;

                if (error) {
                    console.error('Fallback query failed:', error);
                    alert('Unable to load summary data. Please try refreshing the page.');
                    return;
                }

                // Aggregate data manually
                const summary = {};
                let totalSubmissions = 0;
                let totalAwarded = 0;
                let totalPaid = 0;

                allData.forEach(row => {
                    const method = row.payment_method || 'unknown';
                    if (!summary[method]) {
                        summary[method] = {
                            payment_method: method,
                            total_submissions: 0,
                            awarded_count: 0,
                            paid_count: 0,
                            total_awarded_amount: 0,
                            total_paid_amount: 0
                        };
                    }

                    summary[method].total_submissions++;
                    totalSubmissions++;

                    const amount = row.award_amount || (row.id <= 95 ? 20 : 10);

                    if (row.status === 'awarded' || row.status === 'paid') {
                        summary[method].awarded_count++;
                        summary[method].total_awarded_amount += amount;
                        totalAwarded += amount;
                    }

                    if (row.status === 'paid') {
                        summary[method].paid_count++;
                        summary[method].total_paid_amount += amount;
                        totalPaid += amount;
                    }
                });

                // Convert to array and add totals row
                const summaryArray = Object.values(summary);
                summaryArray.push({
                    payment_method: 'TOTAL',
                    total_submissions: totalSubmissions,
                    awarded_count: summaryArray.reduce((sum, s) => sum + s.awarded_count, 0),
                    paid_count: summaryArray.reduce((sum, s) => sum + s.paid_count, 0),
                    total_awarded_amount: totalAwarded,
                    total_paid_amount: totalPaid
                });

                renderSummary(summaryArray, null);
            } catch (err) {
                console.error('Fallback summary failed:', err);
                alert('Unable to load summary data. Please try refreshing the page.');
            }
        }

        // Load summary data
        async function loadSummary() {
            try {
                // Load summary from function (if using function instead of view)
                // const { data: summaryData, error: summaryError } = await supabase.rpc('get_review_rewards_summary');

                // Load summary from view with timeout
                let summaryQuery = supabase
                    .from('review_rewards_summary')
                    .select('payment_method, total_submissions, awarded_count, paid_count, total_awarded_amount, total_paid_amount');

                summaryQuery = applyTimeout(summaryQuery, 10000); // 10 second timeout

                const { data: summaryData, error: summaryError } = await summaryQuery;

                if (summaryError) {
                    console.error('Error loading summary:', summaryError);
                    // If summary view fails, try fallback aggregation
                    if (summaryError.message.includes('does not exist') || summaryError.name === 'AbortError') {
                        console.log('Summary view failed, trying fallback aggregation...');
                        return loadSummaryFallback();
                    }
                    alert('Error loading summary: ' + summaryError.message);
                    return;
                }

                let handleData = null;
                const needsHandleData = (summaryData || []).some(row =>
                    row.payment_method !== 'TOTAL' && (row.awarded_count > 0 || row.paid_count > 0)
                );

                if (needsHandleData) {
                    let detailQuery = supabase
                        .from('review_rewards')
                        .select('payment_method, payment_handle, status, award_amount')
                        .in('status', ['awarded', 'paid']);

                    detailQuery = applyTimeout(detailQuery, 10000);

                    const { data: detailData, error: detailError } = await detailQuery;

                    if (detailError) {
                        console.error('Error loading handle data:', detailError);
                    } else {
                        handleData = detailData;
                    }
                }

                renderSummary(summaryData || [], handleData);
            } catch (err) {
                console.error('Unexpected error in loadSummary:', err);
                alert('Unexpected error loading summary: ' + err.message);
            }
        }

        // Render summary data
        function renderSummary(data, handleData) {
            const tbody = document.getElementById('summaryBody');
            tbody.innerHTML = '';

            let totalAwarded = 0;
            let totalPaid = 0;

            // Process handle data if provided
            const handlesByMethod = {};
            if (handleData) {
                handleData.forEach(item => {
                    const method = item.payment_method || 'unknown';
                    if (!handlesByMethod[method]) {
                        handlesByMethod[method] = {};
                    }
                    const handle = item.payment_handle || 'Unknown';
                    if (!handlesByMethod[method][handle]) {
                        handlesByMethod[method][handle] = {
                            count: 0,
                            awardedCount: 0,
                            paidCount: 0,
                            awardedAmount: 0,
                            paidAmount: 0
                        };
                    }

                    const amount = item.award_amount || 10;
                    handlesByMethod[method][handle].count++;

                    if (item.status === 'awarded') {
                        handlesByMethod[method][handle].awardedCount++;
                        handlesByMethod[method][handle].awardedAmount += amount;
                    } else if (item.status === 'paid') {
                        handlesByMethod[method][handle].paidCount++;
                        handlesByMethod[method][handle].awardedAmount += amount;
                        handlesByMethod[method][handle].paidAmount += amount;
                    }
                });
            }

            // First, find the TOTAL row to get the correct totals
            const totalDataRow = data.find(row => row.payment_method === 'TOTAL');
            if (totalDataRow) {
                totalAwarded = totalDataRow.total_awarded_amount;
                totalPaid = totalDataRow.total_paid_amount;
            }

            data.forEach((row, index) => {
                if (row.payment_method !== 'TOTAL') {
                    const tr = document.createElement('tr');
                    const outstanding = row.total_awarded_amount - row.total_paid_amount;
                    const hasHandles = handleData && handlesByMethod[row.payment_method];
                    const rowId = `method-row-${index}`;

                    if (hasHandles) {
                        tr.className = 'expandable-row';
                        tr.setAttribute('data-method', row.payment_method);
                        tr.onclick = () => toggleMethodExpansion(rowId, row.payment_method);
                    }

                    tr.innerHTML = `
                        <td>${(row.payment_method || 'Unknown').toUpperCase()}</td>
                        <td>${row.total_submissions}</td>
                        <td>${row.awarded_count}</td>
                        <td>${row.paid_count}</td>
                        <td>$${row.total_awarded_amount.toFixed(2)}</td>
                        <td>$${row.total_paid_amount.toFixed(2)}</td>
                        <td>$${outstanding.toFixed(2)}</td>
                    `;
                    tbody.appendChild(tr);

                    // Add handle rows if available
                    if (hasHandles) {
                        const handles = handlesByMethod[row.payment_method];
                        Object.entries(handles).forEach(([handle, stats]) => {
                            const handleRow = document.createElement('tr');
                            handleRow.className = 'handle-row';
                            handleRow.setAttribute('data-parent', rowId);
                            const handleOutstanding = stats.awardedAmount - stats.paidAmount;

                            handleRow.innerHTML = `
                                <td>${handle}</td>
                                <td>${stats.count}</td>
                                <td>${stats.awardedCount}</td>
                                <td>${stats.paidCount}</td>
                                <td>$${stats.awardedAmount.toFixed(2)}</td>
                                <td>$${stats.paidAmount.toFixed(2)}</td>
                                <td>$${handleOutstanding.toFixed(2)}</td>
                            `;
                            tbody.appendChild(handleRow);
                        });
                    }
                }
            });

            // Add total row
            const totalRow = document.createElement('tr');
            totalRow.style.fontWeight = 'bold';
            totalRow.style.background = 'var(--surface-2)';
            const outstanding = totalAwarded - totalPaid;
            totalRow.innerHTML = `
                <td>TOTAL</td>
                <td>${data.find(r => r.payment_method === 'TOTAL')?.total_submissions || 0}</td>
                <td>${data.find(r => r.payment_method === 'TOTAL')?.awarded_count || 0}</td>
                <td>${data.find(r => r.payment_method === 'TOTAL')?.paid_count || 0}</td>
                <td>$${totalAwarded.toFixed(2)}</td>
                <td>$${totalPaid.toFixed(2)}</td>
                <td>$${outstanding.toFixed(2)}</td>
            `;
            tbody.appendChild(totalRow);

            // Update summary stats
            document.getElementById('totalAwardedAmount').textContent = `$${totalAwarded.toFixed(2)}`;
            document.getElementById('totalPaidAmount').textContent = `$${totalPaid.toFixed(2)}`;
            document.getElementById('outstandingBalance').textContent = `$${outstanding.toFixed(2)}`;
        }

        // Tabs events
        document.getElementById('tabRewards').addEventListener('click', () => switchTab('rewards'));
        document.getElementById('tabSummary').addEventListener('click', () => switchTab('summary'));

        // Set up filters
        const statusFilterEl = document.getElementById('statusFilter');
        if (statusFilterEl) {
            statusFilterEl.addEventListener('change', () => loadSubmissions(0, true));
        }

        const paymentFilterEl = document.getElementById('paymentFilter');
        if (paymentFilterEl) {
            paymentFilterEl.addEventListener('change', () => loadSubmissions(0, true));
        }

        // Set up search input with debounce
        let searchTimeout;
        const searchInput = document.getElementById('searchHandle');
        if (searchInput) {
            searchInput.addEventListener('input', () => {
                clearTimeout(searchTimeout);
                searchTimeout = setTimeout(() => {
                    handleSearchInput();
                }, 300); // 300ms debounce
            });
        }

        function handleSearchInput() {
            const inputEl = document.getElementById('searchHandle');
            const searchValue = inputEl ? inputEl.value.trim() : '';

            if (searchValue === currentSearchTerm) {
                renderSubmissions(submissions);
                updateSelection();
                updateLoadMoreButton();
                return;
            }

            currentSearchTerm = searchValue;
            clearSelection();
            loadSubmissions(0, true);
        }

        // Close modal on outside click
        document.getElementById('detailModal').addEventListener('click', (e) => {
            if (e.target === document.getElementById('detailModal')) {
                closeModal();
            }
        });

        document.getElementById('editAwardModal').addEventListener('click', (e) => {
            if (e.target === document.getElementById('editAwardModal')) {
                closeEditAwardModal();
            }
        });

        // Check session on page load
        async function checkSession() {
            try {
                // Show loading state immediately
                const loginMessage = document.getElementById('loginMessage');
                const loginForm = document.getElementById('loginForm');
                const dashboard = document.getElementById('dashboard');

                if (loginMessage) {
                    loginMessage.textContent = 'Checking session...';
                }

                // Hide both forms initially to prevent flash
                if (loginForm) loginForm.style.display = 'none';
                if (dashboard) dashboard.style.display = 'none';

                console.log('Checking existing session...');
                const { data: { session }, error } = await supabase.auth.getSession();

                if (error) {
                    console.error('Session check error:', error);
                    showLoginForm();
                    return;
                }

                if (session) {
                    console.log('Session found for:', session.user.email);
                    currentUser = session.user;

                    // Check if user is admin
                    const { data: adminData, error: adminError } = await supabase
                        .from('admins')
                        .select('email')
                        .eq('email', session.user.email)
                        .single();

                    if (adminError || !adminData) {
                        console.log('User is not an admin');
                        await supabase.auth.signOut();
                        showLoginForm();
                        return;
                    }

                    console.log('Admin verified, showing dashboard');
                    showDashboard();
                } else {
                    console.log('No existing session found');
                    showLoginForm();
                }
            } catch (err) {
                console.error('Unexpected error checking session:', err);
                showLoginForm();
            }
        }

        // Helper function to show login form
        function showLoginForm() {
            const loginForm = document.getElementById('loginForm');
            const dashboard = document.getElementById('dashboard');
            const loginMessage = document.getElementById('loginMessage');

            if (loginForm) loginForm.style.display = 'block';
            if (dashboard) dashboard.style.display = 'none';
            if (loginMessage) {
                loginMessage.textContent = 'Sign in to manage rewards and claims';
            }
        }

        // Debug database function
        async function debugDatabase() {
            console.log('=== DATABASE DEBUG START ===');

            try {
                // Test 1: Basic connection
                console.log('1. Testing basic connection...');
                const connectionTest = await testConnection();
                console.log('Connection test result:', connectionTest);

                // Test 2: Table access
                console.log('2. Testing table access...');
                const tableTest = await testTableAccess();
                console.log('Table access test result:', tableTest);

                // Test 3: User authentication
                console.log('3. Testing user authentication...');
                const { data: { user }, error: userError } = await supabase.auth.getUser();
                console.log('User:', user);
                console.log('User error:', userError);

                // Test 4: Admin check
                console.log('4. Testing admin permissions...');
                if (user) {
                    const { data: adminData, error: adminError } = await supabase
                        .from('admins')
                        .select('email')
                        .eq('email', user.email);
                    console.log('Admin data:', adminData);
                    console.log('Admin error:', adminError);
                }

                // Test 5: RLS policies
                console.log('5. Testing RLS policies...');
                const { data: rlsTest, error: rlsError } = await supabase
                    .from('review_rewards')
                    .select('id, created_at, status')
                    .limit(1);
                console.log('RLS test result:', rlsTest);
                console.log('RLS error:', rlsError);

                // Show results to user
                let debugMessage = 'Database Debug Results:\n\n';
                debugMessage += `1. Connection: ${connectionTest ? 'PASS' : 'FAIL'}\n`;
                debugMessage += `2. Table Access: ${tableTest.success ? 'PASS' : 'FAIL'}\n`;
                debugMessage += `3. User Auth: ${user ? 'PASS' : 'FAIL'}\n`;
                debugMessage += `4. Admin Check: ${user ? 'PASS' : 'N/A'}\n`;
                debugMessage += `5. RLS Policies: ${rlsTest ? 'PASS' : 'FAIL'}\n\n`;

                if (!connectionTest) {
                    debugMessage += 'Connection failed - check your internet connection and Supabase URL.\n';
                }
                if (!tableTest.success) {
                    debugMessage += `Table access failed: ${tableTest.error?.message || 'Unknown error'}\n`;
                }
                if (!user) {
                    debugMessage += 'User not authenticated - please log in.\n';
                }
                if (user && !rlsTest) {
                    debugMessage += `RLS policy error: ${rlsError?.message || 'Unknown error'}\n`;
                }

                alert(debugMessage);

            } catch (err) {
                console.error('Debug error:', err);
                alert('Debug failed: ' + err.message);
            }

            console.log('=== DATABASE DEBUG END ===');
        }

        // Check session when page loads
        checkSession();
