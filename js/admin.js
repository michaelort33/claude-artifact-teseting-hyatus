// Supabase configuration
const SUPABASE_URL = 'https://dugjgmwlzyjillkemzhz.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImR1Z2pnbXdsenlqaWxsa2Vtemh6Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTU3MjE3MTIsImV4cCI6MjA3MTI5NzcxMn0.s9uM3exfI3hBvbiT3nZrC_whJ03IAy18202qmgJ4GOg';

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

const ADMIN_EMAILS = ['admin@example.com', 'michaelort@hyatus.com', 'aahim7406@gmail.com'];

function isAdminEmail(email) {
    const e = (email || '').toLowerCase();
    if (!e) return false;
    if (ADMIN_EMAILS.includes(e)) return true;
    if (e.endsWith('@hyatus.com')) return true;
    return false;
}

async function isAdminUser(user) {
    if (!user) return false;
    try {
        const { data, error } = await supabase.from('admins').select('email').eq('email', user.email).maybeSingle();
        if (!error && data && data.email) return true;
    } catch (_) { }
    return isAdminEmail(user.email);
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
const SUBMISSION_COLUMNS = [
    'id', 'created_at', 'payment_method', 'payment_handle', 'review_link',
    'award_amount', 'previous_guest', 'status', 'awarded_at', 'paid_at',
    'notes', 'task_created', 'task_id'
].join(', ');

function getAwardAmount(submissionId) {
    return submissionId <= 95 ? 20.00 : 10.00;
}

async function checkAuth() {
    const urlParams = new URLSearchParams(window.location.search);
    if (urlParams.get('reset_expired') === 'true') {
        showLoginError('Your password reset link has expired. Please request a new one.');
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

document.getElementById('logoutBtn').addEventListener('click', async () => {
    await supabase.auth.signOut();
    currentUser = null;
    document.getElementById('loginSection').style.display = 'flex';
    document.getElementById('dashboard').classList.remove('active');
    document.getElementById('logoutBtn').style.display = 'none';
    const tbody = document.getElementById('submissionsBody');
    if (tbody) tbody.innerHTML = '';
    submissions = [];
    allSubmissions = [];
});

document.getElementById('forgotPasswordLink').addEventListener('click', async (e) => {
    e.preventDefault();
    const email = document.getElementById('email').value || prompt('Please enter your email address:');

    if (!email) return;

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
        if (!supabase) {
            alert('Database connection not initialized. Please refresh the page.');
            return;
        }

        const statusFilter = document.getElementById('statusFilter')?.value || 'all';
        const paymentFilter = document.getElementById('paymentFilter')?.value || 'all';
        const searchHandle = document.getElementById('searchHandle')?.value.trim() || '';
        currentSearchTerm = searchHandle;

        let query = supabase
            .from('review_rewards')
            .select(SUBMISSION_COLUMNS)
            .order('created_at', { ascending: false })
            .range(currentPage * ROWS_PER_PAGE, (currentPage + 1) * ROWS_PER_PAGE - 1);

        if (statusFilter !== 'all') {
            if (statusFilter === 'pending') {
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
            console.error('Error loading submissions:', error);
            if (tbody) {
                tbody.innerHTML = '<tr><td colspan="10" style="text-align: center; padding: 40px; color: var(--danger);">Error loading submissions. Please refresh.</td></tr>';
            }
            return;
        }

        const newData = data || [];
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
    } finally {
        isLoadingSubmissions = false;
    }
}

async function loadAllForAnalytics() {
    try {
        const { data, error } = await supabase
            .from('review_rewards')
            .select('id, created_at, payment_method, payment_handle, status, award_amount, previous_guest')
            .order('created_at', { ascending: true });

        if (!error && data) {
            allSubmissions = data;
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
            alert('No awarded submissions selected. Only awarded submissions can be marked as paid.');
            return;
        }

        for (const sub of awardedSubmissions) {
            const { error } = await supabase
                .from('review_rewards')
                .update({ status: 'paid', paid_at: new Date().toISOString() })
                .eq('id', sub.id);

            if (error) console.error(`Error updating ${sub.id}:`, error);
        }

        alert(`Successfully marked ${awardedSubmissions.length} submissions as paid`);
        clearSelection();
        await loadSubmissions();
    } catch (err) {
        console.error('Error in bulk update:', err);
        alert('Error updating submissions: ' + err.message);
    }
}

async function viewDetails(id) {
    const submission = submissions.find(s => s.id === id);
    if (!submission) return;

    const { data, error } = await supabase
        .from('review_rewards')
        .select('*')
        .eq('id', id)
        .single();

    if (error) {
        alert('Error loading details: ' + error.message);
        return;
    }

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
            ${data.task_id ? `
                <div class="detail-label">Task ID</div>
                <div class="detail-value">${data.task_id}</div>
            ` : ''}
        </div>
        ${data.screenshot_url ? `<img src="${data.screenshot_url}" class="screenshot-preview" alt="Screenshot">` : ''}
    `;

    document.getElementById('detailModal').classList.add('active');
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
        alert('Please enter a valid amount');
        return;
    }

    try {
        const { error } = await supabase
            .from('review_rewards')
            .update({ award_amount: amount })
            .eq('id', currentEditSubmissionId);

        if (error) throw error;

        const submission = submissions.find(s => s.id === currentEditSubmissionId);
        if (submission) submission.award_amount = amount;

        renderSubmissions(submissions);
        closeEditAwardModal();
        alert(`Award amount updated to $${amount.toFixed(2)}`);
    } catch (error) {
        alert('Failed to update: ' + error.message);
    }
}

let pendingTaskSubmission = null;

async function updateStatus(id, newStatus) {
    const submission = submissions.find(s => s.id === id);
    if (!submission) return;

    try {
        const updates = { status: newStatus };
        if (newStatus === 'awarded') {
            updates.awarded_at = new Date().toISOString();
        } else if (newStatus === 'paid') {
            updates.paid_at = new Date().toISOString();
        }

        const { error } = await supabase
            .from('review_rewards')
            .update(updates)
            .eq('id', id);

        if (error) throw error;

        submission.status = newStatus;
        if (updates.awarded_at) submission.awarded_at = updates.awarded_at;
        if (updates.paid_at) submission.paid_at = updates.paid_at;

        updateStats(submissions);
        renderSubmissions(submissions);

        if (newStatus === 'awarded' && !submission.task_created) {
            showTaskModal(submission);
        }
    } catch (error) {
        alert('Failed to update status: ' + error.message);
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
    if (pendingTaskSubmission) {
        await supabase
            .from('review_rewards')
            .update({ task_created: true })
            .eq('id', pendingTaskSubmission.id);
    }
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
            await supabase
                .from('review_rewards')
                .update({ task_created: true, task_id: result.task_id || result.id })
                .eq('id', submission.id);

            alert('Task created successfully!');
        } else {
            throw new Error(result.error || 'Failed to create task');
        }
    } catch (error) {
        console.error('Error creating task:', error);
        alert('Error creating task: ' + error.message);
    }

    document.getElementById('taskModal').classList.remove('active');
    pendingTaskSubmission = null;
}

async function exportCSV() {
    try {
        const { data, error } = await supabase
            .from('review_rewards')
            .select('id, payment_method, payment_handle, review_link, status, award_amount, user_email, created_at, awarded_at, paid_at')
            .order('created_at', { ascending: false });

        if (error) throw error;

        let csv = 'ID,Gift Type,Email,Review Link,Status,Amount,User Email,Created At,Awarded At,Paid At\n';

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
        alert('Error exporting CSV: ' + err.message);
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