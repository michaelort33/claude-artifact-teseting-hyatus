const ADMIN_EMAILS = ['admin@example.com', 'michaelort@hyatus.com', 'aahim7406@gmail.com'];

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

        const result = await response.json();
        
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

// Forgot password modal functionality
document.getElementById('forgotPasswordLink').addEventListener('click', (e) => {
    e.preventDefault();
    const loginEmail = document.getElementById('email').value;
    document.getElementById('forgotEmail').value = loginEmail;
    document.getElementById('forgotPasswordModal').style.display = 'flex';
    document.getElementById('forgotError').style.display = 'none';
    document.getElementById('forgotSuccess').style.display = 'none';
});

document.getElementById('backToLoginLink').addEventListener('click', (e) => {
    e.preventDefault();
    document.getElementById('forgotPasswordModal').style.display = 'none';
});

document.getElementById('forgotPasswordModal').addEventListener('click', (e) => {
    if (e.target.id === 'forgotPasswordModal') {
        document.getElementById('forgotPasswordModal').style.display = 'none';
    }
});

document.getElementById('forgotPasswordForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const email = document.getElementById('forgotEmail').value;
    const sendBtn = document.getElementById('sendResetBtn');
    const forgotError = document.getElementById('forgotError');
    const forgotSuccess = document.getElementById('forgotSuccess');

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

        forgotSuccess.textContent = 'If an account exists, a password reset email has been sent.';
        forgotSuccess.style.display = 'block';
        document.getElementById('forgotPasswordForm').style.display = 'none';
    } catch (error) {
        forgotError.textContent = 'Error sending reset email. Please try again.';
        forgotError.style.display = 'block';
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
        console.error('Unexpected error:', err);
        if (tbody) {
            tbody.innerHTML = '<tr><td colspan="10" style="text-align: center; padding: 40px; color: var(--danger);">Error loading submissions. Please refresh.</td></tr>';
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
        const amount = submission.award_amount || getAwardAmount(submission.id);

        row.innerHTML = `
            <td><input type="checkbox" class="submission-checkbox" data-id="${submission.id}" onchange="updateSelection()"></td>
            <td>#${submission.id || 'N/A'}</td>
            <td>${date}</td>
            <td>${(submission.payment_method || '').toUpperCase()}</td>
            <td>${submission.payment_handle || ''}</td>
            <td>${reviewType}</td>
            <td>$${amount.toFixed(2)}</td>
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
        groups[key].totalAmount += item.award_amount || getAwardAmount(item.id);
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
                <div class="detail-value">$${(data.award_amount || getAwardAmount(data.id)).toFixed(2)}</div>
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
    } catch (err) {
        showToast('Error loading details: ' + err.message, 'error');
    }
}

function closeDetailModal() {
    document.getElementById('detailModal').classList.remove('active');
}

let currentEditSubmissionId = null;

function editAward(id) {
    currentEditSubmissionId = id;
    const submission = submissions.find(s => s.id === id);
    const amount = submission?.award_amount || getAwardAmount(id);
    document.getElementById('editAwardAmount').value = amount.toFixed(2);
    document.getElementById('editAwardModal').classList.add('active');
}

function closeEditAwardModal() {
    document.getElementById('editAwardModal').classList.remove('active');
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
    const amount = submission.award_amount || getAwardAmount(submission.id);
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
            <span style="font-weight: 500;">$${amount.toFixed(2)}</span>
        </div>
    `;
    document.getElementById('taskModal').classList.add('active');
}

async function skipTask() {
    document.getElementById('taskModal').classList.remove('active');
    pendingTaskSubmission = null;
}

async function createTask() {
    if (!pendingTaskSubmission) return;

    const submission = pendingTaskSubmission;
    const amount = submission.award_amount || getAwardAmount(submission.id);

    try {
        const response = await fetch('/api/tasks', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                email: submission.payment_handle,
                reward_type: submission.payment_method,
                amount: amount,
                submission_id: submission.id
            })
        });

        const result = await response.json();

        if (response.ok) {
            showToast('Task created successfully!', 'success');
        } else {
            throw new Error(result.error || 'Failed to create task');
        }
    } catch (error) {
        console.error('Error creating task:', error);
        showToast('Error creating task: ' + error.message, 'error');
    }

    document.getElementById('taskModal').classList.remove('active');
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

checkAuth();
