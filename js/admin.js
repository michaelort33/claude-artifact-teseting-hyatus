const ADMIN_EMAILS = ['admin@example.com', 'michaelort@hyatus.com', 'aahim7406@gmail.com'];

let savedScrollPosition = 0;

function openModal() {
    savedScrollPosition = window.scrollY;
    document.body.style.top = `-${savedScrollPosition}px`;
    document.body.classList.add('modal-open');
}

function closeModal() {
    document.body.classList.remove('modal-open');
    document.body.style.top = '';
    window.scrollTo(0, savedScrollPosition);
}

function isAdminEmail(email) {
    const e = (email || '').toLowerCase();
    if (!e) return false;
    if (ADMIN_EMAILS.includes(e)) return true;
    if (e.endsWith('@hyatus.com')) return true;
    return false;
}

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

function showLoginError(msg) {
    const el = document.getElementById('loginError');
    el.style.display = 'block';
    el.textContent = msg;
}

let currentUser = null;
let submissions = [];
let allSubmissions = [];
let currentPage = 0;
let hasMoreData = true;
let currentSearchTerm = '';
let reviewsChart = null;
const ROWS_PER_PAGE = 50;

function getAwardAmount(submissionId) {
    return submissionId <= 95 ? 20.00 : 10.00;
}

async function checkAuth() {
    const urlParams = new URLSearchParams(window.location.search);
    if (urlParams.get('reset_expired') === 'true') {
        showLoginError('Your password reset link has expired. Please request a new one.');
        window.history.replaceState({}, document.title, window.location.pathname);
    }

    try {
        const response = await fetch('/api/auth/session');
        const result = await response.json();
        
        if (result.user) {
            if (!result.user.is_admin && !isAdminEmail(result.user.email)) {
                showLoginError('You do not have admin access.');
                await fetch('/api/auth/signout', { method: 'POST' });
                return;
            }
            currentUser = result.user;
            showDashboard();
        }
    } catch (err) {
        console.error('Error checking auth:', err);
    }
}

document.getElementById('loginForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const email = document.getElementById('email').value;
    const password = document.getElementById('password').value;

    try {
        const response = await fetch('/api/auth/signin', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email, password })
        });

        let result;
        try {
            result = await response.json();
        } catch (parseErr) {
            throw new Error('Login failed - invalid response from server');
        }
        
        if (!response.ok) {
            throw new Error(result.error || 'Invalid email or password');
        }

        if (!result.user.is_admin && !isAdminEmail(email)) {
            showLoginError('You do not have admin access.');
            await fetch('/api/auth/signout', { method: 'POST' });
            return;
        }

        currentUser = result.user;
        showDashboard();
    } catch (error) {
        showLoginError(error.message || 'Invalid email or password');
    }
});

document.getElementById('logoutBtn').addEventListener('click', async () => {
    await fetch('/api/auth/signout', { method: 'POST' });
    currentUser = null;
    document.getElementById('loginSection').style.display = 'flex';
    document.getElementById('dashboard').classList.remove('active');
    document.getElementById('logoutBtn').style.display = 'none';
    const tbody = document.getElementById('submissionsBody');
    if (tbody) tbody.innerHTML = '';
    submissions = [];
    allSubmissions = [];
});

// Switch between Sign In and Reset Password views
function showResetPasswordView() {
    const loginEmail = document.getElementById('email').value;
    document.getElementById('forgotEmail').value = loginEmail;
    document.getElementById('signInView').style.display = 'none';
    document.getElementById('resetPasswordView').style.display = 'block';
    document.getElementById('forgotError').style.display = 'none';
    document.getElementById('forgotPasswordForm').style.display = 'block';
}

function showSignInView() {
    document.getElementById('signInView').style.display = 'block';
    document.getElementById('resetPasswordView').style.display = 'none';
    document.getElementById('loginError').style.display = 'none';
}

document.getElementById('forgotPasswordLink').addEventListener('click', (e) => {
    e.preventDefault();
    showResetPasswordView();
});

document.getElementById('backToLoginLink').addEventListener('click', (e) => {
    e.preventDefault();
    showSignInView();
});

document.getElementById('forgotPasswordForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const email = document.getElementById('forgotEmail').value;
    const sendBtn = document.getElementById('sendResetBtn');
    const forgotError = document.getElementById('forgotError');

    if (!email) {
        forgotError.textContent = 'Please enter your email address';
        forgotError.style.display = 'block';
        return;
    }

    sendBtn.textContent = 'Sending...';
    sendBtn.disabled = true;
    forgotError.style.display = 'none';

    try {
        const response = await fetch('/api/auth/reset-password-request', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email })
        });

        forgotError.textContent = 'If an account exists, a password reset email has been sent.';
        forgotError.style.display = 'block';
        forgotError.style.background = 'linear-gradient(135deg, #B8C4AD 0%, #C5D5C3 100%)';
        forgotError.style.color = '#3D6635';
    } catch (error) {
        forgotError.textContent = 'Error sending reset email. Please try again.';
        forgotError.style.display = 'block';
        forgotError.style.background = '';
        forgotError.style.color = '';
    } finally {
        sendBtn.textContent = 'Get Reset Link';
        sendBtn.disabled = false;
    }
});

function showDashboard() {
    document.getElementById('loginSection').style.display = 'none';
    document.getElementById('logoutBtn').style.display = 'block';
    document.getElementById('dashboard').classList.add('active');
    loadSubmissions();
}

let isLoadingSubmissions = false;

async function loadSubmissions(resetPagination = true) {
    if (isLoadingSubmissions) return;
    isLoadingSubmissions = true;

    if (resetPagination) {
        currentPage = 0;
        hasMoreData = true;
        submissions = [];
    }

    const tbody = document.getElementById('submissionsBody');
    if (tbody && resetPagination) {
        tbody.innerHTML = '<tr><td colspan="10" style="text-align: center; padding: 40px; color: var(--warm-gray-dark);">Loading submissions...</td></tr>';
    }

    try {
        const statusFilter = document.getElementById('statusFilter')?.value || 'all';
        const paymentFilter = document.getElementById('paymentFilter')?.value || 'all';
        const searchHandle = document.getElementById('searchHandle')?.value.trim() || '';
        currentSearchTerm = searchHandle;

        const params = new URLSearchParams();
        if (statusFilter !== 'all') params.append('status', statusFilter);
        if (paymentFilter !== 'all') params.append('payment_method', paymentFilter);
        if (searchHandle) params.append('search', searchHandle);
        params.append('page', currentPage);
        params.append('limit', ROWS_PER_PAGE);

        const response = await fetch(`/api/submissions?${params.toString()}`);
        const result = await response.json();

        if (!response.ok) {
            throw new Error(result.error || 'Failed to load submissions');
        }

        const newData = result.data || [];
        hasMoreData = newData.length === ROWS_PER_PAGE;

        if (resetPagination) {
            submissions = newData;
        } else {
            submissions = [...submissions, ...newData];
        }

        updateStats(submissions);
        renderSubmissions(submissions);
        updateLoadMoreButton();

        if (resetPagination) {
            loadAllForAnalytics();
        }
    } catch (err) {
        console.error('Error loading submissions:', err.message || err);
        if (tbody) {
            const tr = document.createElement('tr');
            const td = document.createElement('td');
            td.setAttribute('colspan', '10');
            td.style.cssText = 'text-align: center; padding: 40px; color: var(--danger);';
            td.textContent = `Error loading submissions: ${err.message || 'Unknown error'}. Please refresh.`;
            tr.appendChild(td);
            tbody.innerHTML = '';
            tbody.appendChild(tr);
        }
    } finally {
        isLoadingSubmissions = false;
    }
}

async function loadAllForAnalytics() {
    try {
        const response = await fetch('/api/submissions?limit=1000');
        const result = await response.json();

        if (response.ok && result.data) {
            allSubmissions = result.data;
            renderReviewsChart();
            renderGroupedAnalytics();
        }
    } catch (err) {
        console.error('Error loading analytics data:', err);
    }
}

function updateLoadMoreButton() {
    const container = document.getElementById('loadMoreContainer');
    const btn = document.getElementById('loadMoreBtn');
    if (container && btn) {
        if (hasMoreData && submissions.length > 0) {
            container.style.display = 'block';
            btn.disabled = isLoadingSubmissions;
        } else {
            container.style.display = 'none';
        }
    }
}

document.getElementById('loadMoreBtn')?.addEventListener('click', async () => {
    if (isLoadingSubmissions || !hasMoreData) return;
    currentPage++;
    await loadSubmissions(false);
});

function updateStats(data) {
    document.getElementById('totalSubmissions').textContent = data.length;
    document.getElementById('pendingCount').textContent = data.filter(s => !s.status || s.status === 'pending').length;
    document.getElementById('awardedCount').textContent = data.filter(s => s.status === 'awarded').length;
    document.getElementById('paidCount').textContent = data.filter(s => s.status === 'paid').length;
    document.getElementById('rejectedCount').textContent = data.filter(s => s.status === 'rejected').length;
}

function renderSubmissions(data) {
    const tbody = document.getElementById('submissionsBody');
    if (!tbody) return;

    tbody.innerHTML = '';

    if (!data || data.length === 0) {
        tbody.innerHTML = '<tr><td colspan="10" style="text-align: center; padding: 40px; color: var(--warm-gray-dark);">No submissions found</td></tr>';
        return;
    }

    data.forEach((submission) => {
        const row = document.createElement('tr');
        const date = new Date(submission.created_at || Date.now()).toLocaleDateString();
        const reviewType = submission.review_link ? 'Link' : 'Screenshot';
        const amount = parseFloat(submission.award_amount) || getAwardAmount(submission.id);

        row.innerHTML = `
            <td><input type="checkbox" class="submission-checkbox" data-id="${submission.id}" onchange="updateSelection()"></td>
            <td>#${submission.id || 'N/A'}</td>
            <td>${date}</td>
            <td>${(submission.payment_method || '').toUpperCase()}</td>
            <td>${submission.payment_handle || ''}</td>
            <td>${reviewType}</td>
            <td>$${Number(amount).toFixed(2)}</td>
            <td>${submission.previous_guest ? 'Yes' : 'No'}</td>
            <td><span class="status-badge status-${submission.status || 'pending'}">${(submission.status || 'pending').toUpperCase()}</span></td>
            <td>
                <div class="action-buttons">
                    <button class="action-btn btn-view" onclick="viewDetails(${submission.id})">View</button>
                    <button class="action-btn btn-edit" onclick="editAward(${submission.id})">Edit</button>
                    ${(submission.status || 'pending') === 'pending' ? `
                        <button class="action-btn btn-award" onclick="updateStatus(${submission.id}, 'awarded')">Award</button>
                        <button class="action-btn btn-reject" onclick="updateStatus(${submission.id}, 'rejected')">Reject</button>
                    ` : (submission.status === 'awarded' ? `
                        <button class="action-btn btn-paid" onclick="updateStatus(${submission.id}, 'paid')">Paid</button>
                        <button class="action-btn btn-revert" onclick="updateStatus(${submission.id}, 'pending')">Revert</button>
                    ` : (submission.status === 'paid' ? `
                        <button class="action-btn btn-revert" onclick="updateStatus(${submission.id}, 'awarded')">Revert</button>
                    ` : (submission.status === 'rejected' ? `
                        <button class="action-btn btn-revert" onclick="updateStatus(${submission.id}, 'pending')">Revert</button>
                    ` : '')))}
                </div>
            </td>
        `;
        tbody.appendChild(row);
    });
}

function renderReviewsChart() {
    const ctx = document.getElementById('reviewsChart');
    if (!ctx || !allSubmissions.length) return;

    const weeklyData = {};
    allSubmissions.forEach(s => {
        const date = new Date(s.created_at);
        const weekStart = new Date(date);
        weekStart.setDate(date.getDate() - date.getDay());
        const weekKey = weekStart.toISOString().split('T')[0];
        weeklyData[weekKey] = (weeklyData[weekKey] || 0) + 1;
    });

    const sortedWeeks = Object.keys(weeklyData).sort();
    const labels = sortedWeeks.map(w => {
        const date = new Date(w);
        return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    });
    const values = sortedWeeks.map(w => weeklyData[w]);

    if (reviewsChart) {
        reviewsChart.destroy();
    }

    reviewsChart = new Chart(ctx, {
        type: 'line',
        data: {
            labels: labels,
            datasets: [{
                label: 'Reviews per Week',
                data: values,
                borderColor: '#0F2C1F',
                backgroundColor: 'rgba(15, 44, 31, 0.1)',
                fill: true,
                tension: 0.3,
                pointRadius: 4,
                pointBackgroundColor: '#0F2C1F'
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: {
                    display: false
                }
            },
            scales: {
                y: {
                    beginAtZero: true,
                    ticks: {
                        stepSize: 1
                    }
                }
            }
        }
    });
}

document.getElementById('groupBySelect')?.addEventListener('change', renderGroupedAnalytics);

function renderGroupedAnalytics() {
    const groupBy = document.getElementById('groupBySelect')?.value || 'none';
    const tbody = document.getElementById('groupedTableBody');
    const thead = document.getElementById('groupedTableHead');
    const analyticsBody = document.getElementById('groupedAnalyticsBody');
    const noGroupMessage = document.getElementById('noGroupMessage');

    if (groupBy === 'none') {
        analyticsBody.style.display = 'none';
        noGroupMessage.style.display = 'block';
        return;
    }

    analyticsBody.style.display = 'block';
    noGroupMessage.style.display = 'none';

    if (!allSubmissions.length) {
        tbody.innerHTML = '<tr><td colspan="3" style="text-align: center; padding: 20px;">No data available</td></tr>';
        return;
    }

    const groups = {};
    allSubmissions.forEach(item => {
        let key;
        switch (groupBy) {
            case 'email':
                key = item.payment_handle || 'Unknown';
                break;
            case 'payment_method':
                key = (item.payment_method || 'Unknown').toUpperCase();
                break;
            case 'status':
                key = (item.status || 'pending').charAt(0).toUpperCase() + (item.status || 'pending').slice(1);
                break;
            case 'month':
                const date = new Date(item.created_at);
                key = date.toLocaleDateString('en-US', { year: 'numeric', month: 'long' });
                break;
            default:
                key = 'Unknown';
        }

        if (!groups[key]) {
            groups[key] = { count: 0, totalAmount: 0, awarded: 0, paid: 0 };
        }
        groups[key].count++;
        groups[key].totalAmount += parseFloat(item.award_amount) || getAwardAmount(item.id);
        if (item.status === 'awarded' || item.status === 'paid') groups[key].awarded++;
        if (item.status === 'paid') groups[key].paid++;
    });

    const groupLabels = {
        'email': 'Email',
        'payment_method': 'Gift Type',
        'status': 'Status',
        'month': 'Month'
    };

    thead.innerHTML = `
        <tr>
            <th>${groupLabels[groupBy] || 'Group'}</th>
            <th>Count</th>
            <th>Awarded</th>
            <th>Paid</th>
            <th>Total Amount</th>
        </tr>
    `;

    const sortedGroups = Object.entries(groups).sort((a, b) => b[1].count - a[1].count);
    let totalCount = 0, totalAwarded = 0, totalPaid = 0, grandTotal = 0;

    tbody.innerHTML = '';
    sortedGroups.forEach(([key, stats]) => {
        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td style="font-weight: 500;">${key}</td>
            <td>${stats.count}</td>
            <td>${stats.awarded}</td>
            <td>${stats.paid}</td>
            <td>$${stats.totalAmount.toFixed(2)}</td>
        `;
        tbody.appendChild(tr);

        totalCount += stats.count;
        totalAwarded += stats.awarded;
        totalPaid += stats.paid;
        grandTotal += stats.totalAmount;
    });

    const totalRow = document.createElement('tr');
    totalRow.className = 'total-row';
    totalRow.innerHTML = `
        <td>TOTAL (${sortedGroups.length} groups)</td>
        <td>${totalCount}</td>
        <td>${totalAwarded}</td>
        <td>${totalPaid}</td>
        <td>$${grandTotal.toFixed(2)}</td>
    `;
    tbody.appendChild(totalRow);
}

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
        bulkBar.classList.add('active');
        selectedCount.textContent = `${selectedIds.size} selected`;
    } else {
        bulkBar.classList.remove('active');
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
        const awardedSubmissions = submissions.filter(sub =>
            selectedIds.has(sub.id) && sub.status === 'awarded'
        );

        if (awardedSubmissions.length === 0) {
            showToast('No awarded submissions selected. Only awarded submissions can be marked as paid.', 'error');
            return;
        }

        for (const sub of awardedSubmissions) {
            await fetch(`/api/submissions/${sub.id}`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ status: 'paid' })
            });
        }

        showToast(`Successfully marked ${awardedSubmissions.length} submissions as paid`, 'success');
        clearSelection();
        await loadSubmissions();
    } catch (err) {
        console.error('Error in bulk update:', err);
        showToast('Error updating submissions: ' + err.message, 'error');
    }
}

async function viewDetails(id) {
    try {
        const response = await fetch(`/api/submissions/${id}`);
        const result = await response.json();

        if (!response.ok) {
            throw new Error(result.error || 'Failed to load details');
        }

        const data = result.data;
        const content = document.getElementById('detailContent');
        content.innerHTML = `
            <div class="detail-grid">
                <div class="detail-label">ID</div>
                <div class="detail-value">#${data.id}</div>
                <div class="detail-label">Date</div>
                <div class="detail-value">${new Date(data.created_at).toLocaleString()}</div>
                <div class="detail-label">Gift Type</div>
                <div class="detail-value">${(data.payment_method || '').toUpperCase()}</div>
                <div class="detail-label">Email</div>
                <div class="detail-value">${data.payment_handle || 'N/A'}</div>
                <div class="detail-label">Amount</div>
                <div class="detail-value">$${(parseFloat(data.award_amount) || getAwardAmount(data.id)).toFixed(2)}</div>
                <div class="detail-label">Previous Guest</div>
                <div class="detail-value">${data.previous_guest ? 'Yes' : 'No'}</div>
                <div class="detail-label">Status</div>
                <div class="detail-value"><span class="status-badge status-${data.status || 'pending'}">${(data.status || 'pending').toUpperCase()}</span></div>
                ${data.review_link ? `
                    <div class="detail-label">Review Link</div>
                    <div class="detail-value"><a href="${data.review_link}" target="_blank" style="color: var(--info);">${data.review_link}</a></div>
                ` : ''}
                ${data.notes ? `
                    <div class="detail-label">Notes</div>
                    <div class="detail-value">${data.notes}</div>
                ` : ''}
            </div>
            ${data.screenshot_url ? `<img src="${data.screenshot_url}" class="screenshot-preview" alt="Screenshot">` : ''}
        `;

        document.getElementById('detailModal').classList.add('active');
        openModal();
    } catch (err) {
        showToast('Error loading details: ' + err.message, 'error');
    }
}

function closeDetailModal() {
    document.getElementById('detailModal').classList.remove('active');
    closeModal();
}

let currentEditSubmissionId = null;

function editAward(id) {
    currentEditSubmissionId = id;
    const submission = submissions.find(s => s.id === id);
    const amount = parseFloat(submission?.award_amount) || getAwardAmount(id);
    document.getElementById('editAwardAmount').value = Number(amount).toFixed(2);
    document.getElementById('editAwardModal').classList.add('active');
    openModal();
}

function closeEditAwardModal() {
    document.getElementById('editAwardModal').classList.remove('active');
    closeModal();
    currentEditSubmissionId = null;
}

async function saveAwardAmount() {
    const amount = parseFloat(document.getElementById('editAwardAmount').value);
    if (isNaN(amount) || amount < 0) {
        showToast('Please enter a valid amount', 'error');
        return;
    }

    try {
        const response = await fetch(`/api/submissions/${currentEditSubmissionId}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ award_amount: amount })
        });

        if (!response.ok) {
            const result = await response.json();
            throw new Error(result.error || 'Failed to update');
        }

        const submission = submissions.find(s => s.id === currentEditSubmissionId);
        if (submission) submission.award_amount = amount;

        renderSubmissions(submissions);
        closeEditAwardModal();
        showToast(`Award amount updated to $${amount.toFixed(2)}`, 'success');
    } catch (error) {
        showToast('Failed to update: ' + error.message, 'error');
    }
}

let pendingTaskSubmission = null;

async function updateStatus(id, newStatus) {
    const submission = submissions.find(s => s.id === id);
    if (!submission) return;

    try {
        const response = await fetch(`/api/submissions/${id}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ status: newStatus })
        });

        if (!response.ok) {
            const result = await response.json();
            throw new Error(result.error || 'Failed to update status');
        }

        const result = await response.json();
        submission.status = newStatus;
        if (result.data?.awarded_at) submission.awarded_at = result.data.awarded_at;
        if (result.data?.paid_at) submission.paid_at = result.data.paid_at;

        updateStats(submissions);
        renderSubmissions(submissions);

        if (newStatus === 'awarded') {
            showTaskModal(submission);
        }
    } catch (error) {
        showToast('Failed to update status: ' + error.message, 'error');
    }
}

function showTaskModal(submission) {
    pendingTaskSubmission = submission;
    const details = document.getElementById('taskDetails');
    const amount = parseFloat(submission.award_amount) || getAwardAmount(submission.id);
    details.innerHTML = `
        <div class="task-detail-row">
            <span>Email</span>
            <span style="font-weight: 500;">${submission.payment_handle || 'N/A'}</span>
        </div>
        <div class="task-detail-row">
            <span>Gift Type</span>
            <span style="font-weight: 500;">${(submission.payment_method || '').toUpperCase()}</span>
        </div>
        <div class="task-detail-row">
            <span>Amount</span>
            <span style="font-weight: 500;">$${Number(amount).toFixed(2)}</span>
        </div>
    `;
    document.getElementById('taskModal').classList.add('active');
    openModal();
}

async function skipTask() {
    document.getElementById('taskModal').classList.remove('active');
    closeModal();
    pendingTaskSubmission = null;
}

async function createTask() {
    if (!pendingTaskSubmission) return;

    const submission = pendingTaskSubmission;
    const amount = parseFloat(submission.award_amount) || getAwardAmount(submission.id);
    const giftType = (submission.payment_method || 'gift').toUpperCase();
    const email = submission.payment_handle;

    const createBtn = document.querySelector('#taskModal .btn-primary');
    const skipBtn = document.querySelector('#taskModal .btn-secondary');
    const originalText = createBtn ? createBtn.textContent : 'Create Task';

    if (createBtn) {
        createBtn.textContent = 'Creating...';
        createBtn.disabled = true;
    }
    if (skipBtn) {
        skipBtn.disabled = true;
    }

    try {
        let taskParent = 'company';
        let linkId = 'Hyatus';

        if (email) {
            try {
                const lookupResponse = await fetch('/api/reservations/lookup-by-email', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ email })
                });

                if (lookupResponse.ok) {
                    const reservationId = await lookupResponse.json();
                    if (reservationId) {
                        taskParent = 'reservation';
                        linkId = String(reservationId);
                    }
                }
            } catch (lookupError) {
                console.warn('Reservation lookup failed, using company fallback:', lookupError);
            }
        }

        const response = await fetch('/api/tasks', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                name: `Send $${amount} ${giftType} gift card to ${email}`,
                category: 'guest_satisfaction',
                priority: 'medium',
                description: `Guest appreciation gift - ${giftType} $${amount}\nRecipient: ${email}\nSubmission ID: ${submission.id}`,
                external_id: `reward-${submission.id}`,
                subcategory: 'gift_card',
                tags: ['Giftly'],
                due_date: new Date().toISOString(),
                task_parent: taskParent,
                link_id: linkId
            })
        });

        const result = await response.json();

        if (response.ok) {
            const linkInfo = taskParent === 'reservation' ? ` (linked to reservation ${linkId})` : ' (linked to company)';
            showToast('Task created successfully!' + linkInfo, 'success');
        } else {
            throw new Error(result.error || 'Failed to create task');
        }
    } catch (error) {
        console.error('Error creating task:', error);
        showToast('Error creating task: ' + error.message, 'error');
    } finally {
        if (createBtn) {
            createBtn.textContent = originalText;
            createBtn.disabled = false;
        }
        if (skipBtn) {
            skipBtn.disabled = false;
        }
    }

    document.getElementById('taskModal').classList.remove('active');
    closeModal();
    pendingTaskSubmission = null;
}

async function exportCSV() {
    try {
        const response = await fetch('/api/submissions?limit=10000');
        const result = await response.json();

        if (!response.ok) {
            throw new Error(result.error || 'Failed to export');
        }

        const data = result.data || [];
        let csv = 'ID,Gift Type,Email,Review Link,Status,Amount,Created At,Awarded At,Paid At\n';

        data.forEach(row => {
            const fields = [
                row.id,
                row.payment_method || '',
                row.payment_handle || '',
                row.review_link || '',
                row.status || 'pending',
                row.award_amount || '10.00',
                row.created_at || '',
                row.awarded_at || '',
                row.paid_at || ''
            ].map(f => {
                const str = String(f);
                if (str.includes(',') || str.includes('"') || str.includes('\n')) {
                    return `"${str.replace(/"/g, '""')}"`;
                }
                return str;
            });

            csv += fields.join(',') + '\n';
        });

        const blob = new Blob([csv], { type: 'text/csv' });
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `review_rewards_${new Date().toISOString().split('T')[0]}.csv`;
        a.click();
        window.URL.revokeObjectURL(url);
    } catch (err) {
        showToast('Error exporting CSV: ' + err.message, 'error');
    }
}

document.getElementById('statusFilter')?.addEventListener('change', () => loadSubmissions());
document.getElementById('paymentFilter')?.addEventListener('change', () => loadSubmissions());

let searchTimeout;
document.getElementById('searchHandle')?.addEventListener('input', () => {
    clearTimeout(searchTimeout);
    searchTimeout = setTimeout(() => loadSubmissions(), 300);
});

// Tab switching functionality
function switchTab(tabName) {
    const tabs = document.querySelectorAll('.admin-tab');
    const contents = document.querySelectorAll('.tab-content');
    
    tabs.forEach(tab => {
        if (tab.dataset.tab === tabName) {
            tab.classList.add('active');
        } else {
            tab.classList.remove('active');
        }
    });
    
    contents.forEach(content => {
        if (content.id === tabName + 'Section') {
            content.classList.add('active');
        } else {
            content.classList.remove('active');
        }
    });
    
    if (tabName === 'referrals') {
        loadReferrals();
    } else if (tabName === 'taskLogs') {
        loadTaskLogs();
    }
}

// Referral management
let referrals = [];
let currentReferralId = null;
let isLoadingReferrals = false;

async function loadReferrals(status) {
    if (isLoadingReferrals) return;
    isLoadingReferrals = true;
    
    const tbody = document.getElementById('referralsBody');
    if (tbody) {
        while (tbody.firstChild) {
            tbody.removeChild(tbody.firstChild);
        }
        const loadingRow = document.createElement('tr');
        const loadingCell = document.createElement('td');
        loadingCell.setAttribute('colspan', '8');
        loadingCell.style.cssText = 'text-align: center; padding: 40px; color: var(--warm-gray-dark);';
        loadingCell.textContent = 'Loading referrals...';
        loadingRow.appendChild(loadingCell);
        tbody.appendChild(loadingRow);
    }
    
    try {
        const statusFilter = status || document.getElementById('referralStatusFilter')?.value || 'all';
        
        const params = new URLSearchParams();
        if (statusFilter !== 'all') {
            params.append('status', statusFilter);
        }
        
        const response = await fetch(`/api/referrals?${params.toString()}`);
        const result = await response.json();
        
        if (!response.ok) {
            throw new Error(result.error || 'Failed to load referrals');
        }
        
        referrals = result.data || [];
        renderReferrals(referrals);
    } catch (err) {
        console.error('Error loading referrals:', err);
        if (tbody) {
            while (tbody.firstChild) {
                tbody.removeChild(tbody.firstChild);
            }
            const errorRow = document.createElement('tr');
            const errorCell = document.createElement('td');
            errorCell.setAttribute('colspan', '8');
            errorCell.style.cssText = 'text-align: center; padding: 40px; color: var(--danger);';
            errorCell.textContent = 'Error loading referrals: ' + (err.message || 'Unknown error');
            errorRow.appendChild(errorCell);
            tbody.appendChild(errorRow);
        }
    } finally {
        isLoadingReferrals = false;
    }
}

function renderReferrals(data) {
    const tbody = document.getElementById('referralsBody');
    if (!tbody) return;
    
    while (tbody.firstChild) {
        tbody.removeChild(tbody.firstChild);
    }
    
    if (!data || data.length === 0) {
        const emptyRow = document.createElement('tr');
        const emptyCell = document.createElement('td');
        emptyCell.setAttribute('colspan', '8');
        emptyCell.style.cssText = 'text-align: center; padding: 40px; color: var(--warm-gray-dark);';
        emptyCell.textContent = 'No referrals found';
        emptyRow.appendChild(emptyCell);
        tbody.appendChild(emptyRow);
        return;
    }
    
    data.forEach(referral => {
        const row = document.createElement('tr');
        
        // Referrer Name & Email
        const referrerCell = document.createElement('td');
        const referrerName = document.createElement('div');
        referrerName.style.fontWeight = '500';
        referrerName.textContent = referral.referrer_name || 'N/A';
        const referrerEmail = document.createElement('div');
        referrerEmail.style.cssText = 'font-size: 12px; color: var(--warm-gray-dark);';
        referrerEmail.textContent = referral.referrer_email || '';
        referrerCell.appendChild(referrerName);
        referrerCell.appendChild(referrerEmail);
        row.appendChild(referrerCell);
        
        // Company Name
        const companyCell = document.createElement('td');
        companyCell.textContent = referral.company_name || 'N/A';
        row.appendChild(companyCell);
        
        // Org Type
        const orgTypeCell = document.createElement('td');
        orgTypeCell.textContent = referral.org_type || 'N/A';
        row.appendChild(orgTypeCell);
        
        // Contact Info
        const contactCell = document.createElement('td');
        const contactName = document.createElement('div');
        contactName.style.fontWeight = '500';
        contactName.textContent = referral.contact_name || 'N/A';
        const contactEmail = document.createElement('div');
        contactEmail.style.cssText = 'font-size: 12px; color: var(--warm-gray-dark);';
        contactEmail.textContent = referral.contact_email || '';
        const contactRole = document.createElement('div');
        contactRole.style.cssText = 'font-size: 11px; color: var(--warm-gray-dark);';
        contactRole.textContent = referral.contact_role || '';
        contactCell.appendChild(contactName);
        contactCell.appendChild(contactEmail);
        if (referral.contact_role) {
            contactCell.appendChild(contactRole);
        }
        row.appendChild(contactCell);
        
        // Status
        const statusCell = document.createElement('td');
        const statusBadge = document.createElement('span');
        statusBadge.className = 'status-badge status-' + (referral.status || 'submitted');
        statusBadge.textContent = (referral.status || 'submitted').replace('_', ' ').toUpperCase();
        statusCell.appendChild(statusBadge);
        row.appendChild(statusCell);
        
        // Reward Amount
        const rewardCell = document.createElement('td');
        const amount = parseFloat(referral.reward_amount) || 0;
        rewardCell.textContent = '$' + amount.toFixed(2);
        row.appendChild(rewardCell);
        
        // Submitted Date
        const dateCell = document.createElement('td');
        dateCell.textContent = referral.created_at ? new Date(referral.created_at).toLocaleDateString() : 'N/A';
        row.appendChild(dateCell);
        
        // Actions
        const actionsCell = document.createElement('td');
        const actionButtons = document.createElement('div');
        actionButtons.className = 'action-buttons';
        
        const reviewBtn = document.createElement('button');
        reviewBtn.className = 'action-btn btn-view';
        reviewBtn.textContent = 'Review';
        reviewBtn.addEventListener('click', () => openReferralModal(referral.id));
        actionButtons.appendChild(reviewBtn);
        
        actionsCell.appendChild(actionButtons);
        row.appendChild(actionsCell);
        
        tbody.appendChild(row);
    });
}

async function openReferralModal(referralId) {
    currentReferralId = referralId;
    
    try {
        const response = await fetch(`/api/referrals/${referralId}`);
        const result = await response.json();
        
        if (!response.ok) {
            throw new Error(result.error || 'Failed to load referral details');
        }
        
        const referral = result.data;
        const content = document.getElementById('referralDetailContent');
        
        while (content.firstChild) {
            content.removeChild(content.firstChild);
        }
        
        // Referrer info section
        const referrerSection = document.createElement('div');
        referrerSection.className = 'referral-detail-section';
        const referrerTitle = document.createElement('h4');
        referrerTitle.textContent = 'Referrer Information';
        referrerSection.appendChild(referrerTitle);
        
        const referrerGrid = document.createElement('div');
        referrerGrid.className = 'detail-grid';
        
        const addDetailRow = (grid, label, value) => {
            const labelDiv = document.createElement('div');
            labelDiv.className = 'detail-label';
            labelDiv.textContent = label;
            const valueDiv = document.createElement('div');
            valueDiv.className = 'detail-value';
            valueDiv.textContent = value || 'N/A';
            grid.appendChild(labelDiv);
            grid.appendChild(valueDiv);
        };
        
        addDetailRow(referrerGrid, 'Name', referral.referrer_name);
        addDetailRow(referrerGrid, 'Email', referral.referrer_email);
        referrerSection.appendChild(referrerGrid);
        content.appendChild(referrerSection);
        
        // Company info section
        const companySection = document.createElement('div');
        companySection.className = 'referral-detail-section';
        const companyTitle = document.createElement('h4');
        companyTitle.textContent = 'Company Information';
        companySection.appendChild(companyTitle);
        
        const companyGrid = document.createElement('div');
        companyGrid.className = 'detail-grid';
        addDetailRow(companyGrid, 'Company Name', referral.company_name);
        addDetailRow(companyGrid, 'Organization Type', referral.org_type);
        addDetailRow(companyGrid, 'Website', referral.company_website);
        addDetailRow(companyGrid, 'Location', referral.company_location);
        companySection.appendChild(companyGrid);
        content.appendChild(companySection);
        
        // Contact info section
        const contactSection = document.createElement('div');
        contactSection.className = 'referral-detail-section';
        const contactTitle = document.createElement('h4');
        contactTitle.textContent = 'Contact Information';
        contactSection.appendChild(contactTitle);
        
        const contactGrid = document.createElement('div');
        contactGrid.className = 'detail-grid';
        addDetailRow(contactGrid, 'Contact Name', referral.contact_name);
        addDetailRow(contactGrid, 'Contact Email', referral.contact_email);
        addDetailRow(contactGrid, 'Contact Phone', referral.contact_phone);
        addDetailRow(contactGrid, 'Contact Role', referral.contact_role);
        contactSection.appendChild(contactGrid);
        content.appendChild(contactSection);
        
        // Additional info section
        if (referral.additional_notes) {
            const notesSection = document.createElement('div');
            notesSection.className = 'referral-detail-section';
            const notesTitle = document.createElement('h4');
            notesTitle.textContent = 'Additional Notes from Referrer';
            notesSection.appendChild(notesTitle);
            const notesText = document.createElement('p');
            notesText.style.cssText = 'color: var(--charcoal); font-size: 14px; line-height: 1.6;';
            notesText.textContent = referral.additional_notes;
            notesSection.appendChild(notesText);
            content.appendChild(notesSection);
        }
        
        // Populate form fields
        document.getElementById('referralStatusSelect').value = referral.status || 'submitted';
        document.getElementById('referralRewardAmount').value = parseFloat(referral.reward_amount) || 0;
        document.getElementById('referralAdminNotes').value = referral.admin_notes || '';
        
        document.getElementById('referralModal').classList.add('active');
        openModal();
    } catch (err) {
        showToast('Error loading referral: ' + err.message, 'error');
    }
}

function closeReferralModal() {
    document.getElementById('referralModal').classList.remove('active');
    closeModal();
    currentReferralId = null;
}

async function updateReferral(id, data) {
    const response = await fetch(`/api/referrals/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data)
    });
    
    if (!response.ok) {
        const result = await response.json();
        throw new Error(result.error || 'Failed to update referral');
    }
    
    return await response.json();
}

async function saveReferral() {
    if (!currentReferralId) return;
    
    const status = document.getElementById('referralStatusSelect').value;
    const rewardAmount = parseFloat(document.getElementById('referralRewardAmount').value) || 0;
    const adminNotes = document.getElementById('referralAdminNotes').value;
    
    try {
        await updateReferral(currentReferralId, {
            status: status,
            reward_amount: rewardAmount,
            admin_notes: adminNotes
        });
        
        showToast('Referral updated successfully', 'success');
        closeReferralModal();
        await loadReferrals();
    } catch (err) {
        showToast('Error updating referral: ' + err.message, 'error');
    }
}

document.getElementById('referralStatusFilter')?.addEventListener('change', () => loadReferrals());

// Task Logs management
let taskLogs = [];
let currentTaskLogId = null;
let isLoadingTaskLogs = false;

async function loadTaskLogs(status) {
    if (isLoadingTaskLogs) return;
    isLoadingTaskLogs = true;
    
    const tbody = document.getElementById('taskLogsBody');
    if (tbody) {
        while (tbody.firstChild) {
            tbody.removeChild(tbody.firstChild);
        }
        const loadingRow = document.createElement('tr');
        const loadingCell = document.createElement('td');
        loadingCell.setAttribute('colspan', '7');
        loadingCell.style.cssText = 'text-align: center; padding: 40px; color: var(--warm-gray-dark);';
        loadingCell.textContent = 'Loading task logs...';
        loadingRow.appendChild(loadingCell);
        tbody.appendChild(loadingRow);
    }
    
    try {
        const statusFilter = status || document.getElementById('taskLogStatusFilter')?.value || 'all';
        
        const params = new URLSearchParams();
        if (statusFilter !== 'all') {
            params.append('status', statusFilter);
        }
        
        const response = await fetch(`/api/task-logs?${params.toString()}`);
        const result = await response.json();
        
        if (!response.ok) {
            throw new Error(result.error || 'Failed to load task logs');
        }
        
        taskLogs = result.data || [];
        renderTaskLogs(taskLogs);
    } catch (err) {
        console.error('Error loading task logs:', err);
        if (tbody) {
            while (tbody.firstChild) {
                tbody.removeChild(tbody.firstChild);
            }
            const errorRow = document.createElement('tr');
            const errorCell = document.createElement('td');
            errorCell.setAttribute('colspan', '7');
            errorCell.style.cssText = 'text-align: center; padding: 40px; color: var(--danger);';
            errorCell.textContent = 'Error loading task logs: ' + (err.message || 'Unknown error');
            errorRow.appendChild(errorCell);
            tbody.appendChild(errorRow);
        }
    } finally {
        isLoadingTaskLogs = false;
    }
}

function renderTaskLogs(data) {
    const tbody = document.getElementById('taskLogsBody');
    if (!tbody) return;
    
    while (tbody.firstChild) {
        tbody.removeChild(tbody.firstChild);
    }
    
    if (!data || data.length === 0) {
        const emptyRow = document.createElement('tr');
        const emptyCell = document.createElement('td');
        emptyCell.setAttribute('colspan', '7');
        emptyCell.style.cssText = 'text-align: center; padding: 40px; color: var(--warm-gray-dark);';
        emptyCell.textContent = 'No task logs found';
        emptyRow.appendChild(emptyCell);
        tbody.appendChild(emptyRow);
        return;
    }
    
    data.forEach(log => {
        const row = document.createElement('tr');
        
        // Date/Time
        const dateCell = document.createElement('td');
        const logDate = log.created_at ? new Date(log.created_at) : new Date();
        dateCell.textContent = logDate.toLocaleString('en-US', {
            year: 'numeric',
            month: 'short',
            day: 'numeric',
            hour: '2-digit',
            minute: '2-digit'
        });
        row.appendChild(dateCell);
        
        // Submission ID
        const submissionCell = document.createElement('td');
        submissionCell.textContent = log.submission_id ? '#' + log.submission_id : 'N/A';
        row.appendChild(submissionCell);
        
        // Recipient (payment_handle)
        const recipientCell = document.createElement('td');
        recipientCell.textContent = log.payment_handle || 'N/A';
        row.appendChild(recipientCell);
        
        // Status badge
        const statusCell = document.createElement('td');
        const statusBadge = document.createElement('span');
        const status = (log.status || 'unknown').toLowerCase();
        statusBadge.className = 'status-badge status-' + status;
        statusBadge.textContent = status.toUpperCase();
        statusCell.appendChild(statusBadge);
        row.appendChild(statusCell);
        
        // HTTP Status
        const httpStatusCell = document.createElement('td');
        httpStatusCell.textContent = log.http_status || 'N/A';
        row.appendChild(httpStatusCell);
        
        // Error Message (truncated)
        const errorCell = document.createElement('td');
        const errorText = log.error_message || '';
        if (errorText) {
            const truncatedDiv = document.createElement('div');
            truncatedDiv.className = 'error-text-truncated';
            truncatedDiv.textContent = errorText;
            truncatedDiv.title = errorText;
            errorCell.appendChild(truncatedDiv);
        } else {
            errorCell.textContent = '-';
        }
        row.appendChild(errorCell);
        
        // Actions
        const actionsCell = document.createElement('td');
        const actionButtons = document.createElement('div');
        actionButtons.className = 'action-buttons';
        
        const viewBtn = document.createElement('button');
        viewBtn.className = 'action-btn btn-view';
        viewBtn.textContent = 'View Details';
        viewBtn.addEventListener('click', () => openTaskLogModal(log.id));
        actionButtons.appendChild(viewBtn);
        
        actionsCell.appendChild(actionButtons);
        row.appendChild(actionsCell);
        
        tbody.appendChild(row);
    });
}

async function openTaskLogModal(logId) {
    currentTaskLogId = logId;
    
    try {
        const response = await fetch(`/api/task-logs/${logId}`);
        const result = await response.json();
        
        if (!response.ok) {
            throw new Error(result.error || 'Failed to load task log details');
        }
        
        const log = result.data;
        const content = document.getElementById('taskLogDetailContent');
        
        while (content.firstChild) {
            content.removeChild(content.firstChild);
        }
        
        // Basic Info Section
        const infoSection = document.createElement('div');
        infoSection.className = 'referral-detail-section';
        const infoTitle = document.createElement('h4');
        infoTitle.textContent = 'Log Information';
        infoSection.appendChild(infoTitle);
        
        const infoGrid = document.createElement('div');
        infoGrid.className = 'detail-grid';
        
        const addDetailRow = (grid, label, value) => {
            const labelDiv = document.createElement('div');
            labelDiv.className = 'detail-label';
            labelDiv.textContent = label;
            const valueDiv = document.createElement('div');
            valueDiv.className = 'detail-value';
            valueDiv.textContent = value || 'N/A';
            grid.appendChild(labelDiv);
            grid.appendChild(valueDiv);
        };
        
        const logDate = log.created_at ? new Date(log.created_at).toLocaleString() : 'N/A';
        addDetailRow(infoGrid, 'Date/Time', logDate);
        addDetailRow(infoGrid, 'Submission ID', log.submission_id ? '#' + log.submission_id : 'N/A');
        addDetailRow(infoGrid, 'Recipient', log.payment_handle || 'N/A');
        addDetailRow(infoGrid, 'Status', (log.status || 'unknown').toUpperCase());
        addDetailRow(infoGrid, 'HTTP Status', log.http_status || 'N/A');
        
        infoSection.appendChild(infoGrid);
        content.appendChild(infoSection);
        
        // Error Message Section (if exists)
        if (log.error_message) {
            const errorSection = document.createElement('div');
            errorSection.className = 'referral-detail-section';
            const errorTitle = document.createElement('h4');
            errorTitle.textContent = 'Error Message';
            errorSection.appendChild(errorTitle);
            
            const errorPre = document.createElement('pre');
            errorPre.className = 'json-display';
            errorPre.textContent = log.error_message;
            errorSection.appendChild(errorPre);
            content.appendChild(errorSection);
        }
        
        // Request Payload Section
        const requestSection = document.createElement('div');
        requestSection.className = 'referral-detail-section';
        const requestTitle = document.createElement('h4');
        requestTitle.textContent = 'Request Payload';
        requestSection.appendChild(requestTitle);
        
        const requestPre = document.createElement('pre');
        requestPre.className = 'json-display';
        try {
            const requestData = typeof log.request_payload === 'string' 
                ? JSON.parse(log.request_payload) 
                : log.request_payload;
            requestPre.textContent = requestData ? JSON.stringify(requestData, null, 2) : 'No request data';
        } catch (e) {
            requestPre.textContent = log.request_payload || 'No request data';
        }
        requestSection.appendChild(requestPre);
        content.appendChild(requestSection);
        
        // Response Payload Section
        const responseSection = document.createElement('div');
        responseSection.className = 'referral-detail-section';
        const responseTitle = document.createElement('h4');
        responseTitle.textContent = 'Response Payload';
        responseSection.appendChild(responseTitle);
        
        const responsePre = document.createElement('pre');
        responsePre.className = 'json-display';
        try {
            const responseData = typeof log.response_payload === 'string' 
                ? JSON.parse(log.response_payload) 
                : log.response_payload;
            responsePre.textContent = responseData ? JSON.stringify(responseData, null, 2) : 'No response data';
        } catch (e) {
            responsePre.textContent = log.response_payload || 'No response data';
        }
        responseSection.appendChild(responsePre);
        content.appendChild(responseSection);
        
        document.getElementById('taskLogModal').classList.add('active');
        openModal();
    } catch (err) {
        showToast('Error loading task log: ' + err.message, 'error');
    }
}

function closeTaskLogModal() {
    document.getElementById('taskLogModal').classList.remove('active');
    closeModal();
    currentTaskLogId = null;
}

document.getElementById('taskLogStatusFilter')?.addEventListener('change', () => loadTaskLogs());

checkAuth();
