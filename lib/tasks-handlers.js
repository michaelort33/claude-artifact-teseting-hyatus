const {
    getSessionUser,
    isAdmin,
    parseBody,
    pool,
    securityHeaders,
    sendJson
} = require('./core');

const TASKS_API_BASE = 'https://api.gptpricing.com';

function getTasksApiKey() {
    const apiKey = process.env.GPTGPTBACKEND_X_API_KEY;
    if (!apiKey) {
        throw new Error('Tasks API key not configured (GPTGPTBACKEND_X_API_KEY)');
    }
    return apiKey;
}

async function handleTasksApi(req, res) {
    let body = null;
    let submissionId = null;

    try {
        // Admin-only. Without this gate, anonymous users can create tasks in the
        // GPTGPT backend using the server's API key, pollute task_logs, and exfiltrate data.
        const user = await getSessionUser(req);
        if (!user) return sendJson(res, 401, { error: 'Authentication required' });
        const admin = await isAdmin(user.email);
        if (!admin) return sendJson(res, 403, { error: 'Admin access required' });

        body = await parseBody(req);

        if (body.external_id && body.external_id.startsWith('reward-')) {
            submissionId = parseInt(body.external_id.replace('reward-', ''), 10) || null;
        }

        const apiKey = getTasksApiKey();

        const response = await fetch(`${TASKS_API_BASE}/tasks`, {
            method: 'POST',
            headers: {
                'x-api-key': apiKey,
                'Content-Type': 'application/json',
                'Accept': 'application/json',
            },
            body: JSON.stringify(body),
        });

        const responseText = await response.text();
        let responsePayload = null;
        try {
            responsePayload = JSON.parse(responseText);
        } catch (e) {
            responsePayload = { raw: responseText };
        }

        if (!response.ok) {
            const isDuplicate = responseText.includes('uniq_external_id_subcategory');
            const status = isDuplicate ? 'duplicate' : 'error';
            const errorMessage = isDuplicate ? 'Duplicate external_id' : `Task API error: ${response.status}`;

            try {
                await pool.query(
                    `INSERT INTO task_logs (submission_id, request_payload, response_payload, status, http_status, error_message)
                     VALUES ($1, $2, $3, $4, $5, $6)`,
                    [submissionId, body, responsePayload, status, response.status, errorMessage]
                );
            } catch (logErr) {
                console.error('Failed to log task API call:', logErr);
            }

            if (isDuplicate) {
                return sendJson(res, 200, { duplicate: true });
            }
            return sendJson(res, 502, { error: 'Failed to create task. Please try again.' });
        }

        try {
            await pool.query(
                `INSERT INTO task_logs (submission_id, request_payload, response_payload, status, http_status)
                 VALUES ($1, $2, $3, $4, $5)`,
                [submissionId, body, responsePayload, 'success', response.status]
            );
        } catch (logErr) {
            console.error('Failed to log task API call:', logErr);
        }

        res.writeHead(200, { 'Content-Type': 'application/json', ...securityHeaders });
        res.end(responseText);

    } catch (err) {
        console.error('Task API error:', err);

        try {
            await pool.query(
                `INSERT INTO task_logs (submission_id, request_payload, response_payload, status, http_status, error_message)
                 VALUES ($1, $2, $3, $4, $5, $6)`,
                [submissionId, body, null, 'error', null, err.message]
            );
        } catch (logErr) {
            console.error('Failed to log task API error:', logErr);
        }

        sendJson(res, 500, { error: 'Failed to create task. Please try again.' });
    }
}

async function handleGetTaskLogs(req, res) {
    try {
        const user = await getSessionUser(req);
        if (!user) {
            return sendJson(res, 401, { error: 'Authentication required' });
        }
        const admin = await isAdmin(user.email);
        if (!admin) {
            return sendJson(res, 403, { error: 'Admin access required' });
        }

        const url = new URL(req.url, `http://${req.headers.host}`);
        const status = url.searchParams.get('status');
        const submissionId = url.searchParams.get('submission_id');
        const limit = parseInt(url.searchParams.get('limit')) || 50;
        const offset = parseInt(url.searchParams.get('offset')) || 0;

        let query = `
            SELECT tl.id, tl.submission_id, tl.request_payload, tl.response_payload,
                   tl.status, tl.http_status, tl.error_message, tl.created_at,
                   rr.payment_handle
            FROM task_logs tl
            LEFT JOIN review_rewards rr ON tl.submission_id = rr.id
        `;
        const params = [];
        const conditions = [];

        if (status) {
            conditions.push(`tl.status = $${params.length + 1}`);
            params.push(status);
        }
        if (submissionId) {
            conditions.push(`tl.submission_id = $${params.length + 1}`);
            params.push(parseInt(submissionId, 10));
        }

        const whereClause = conditions.length > 0 ? ' WHERE ' + conditions.join(' AND ') : '';
        query += whereClause;

        // Explicit count query — avoids fragile regex on the SELECT above.
        const countQuery = `SELECT COUNT(*) FROM task_logs tl LEFT JOIN review_rewards rr ON tl.submission_id = rr.id${whereClause}`;
        const countResult = await pool.query(countQuery, params);
        const total = parseInt(countResult.rows[0].count, 10);

        query += ' ORDER BY tl.created_at DESC';
        query += ` LIMIT $${params.length + 1} OFFSET $${params.length + 2}`;
        params.push(limit, offset);

        const result = await pool.query(query, params);
        sendJson(res, 200, { data: { logs: result.rows, total } });

    } catch (err) {
        console.error('Get task logs error:', err);
        sendJson(res, 500, { error: 'Server error' });
    }
}

async function handleGetTaskLog(req, res, id) {
    try {
        const user = await getSessionUser(req);
        if (!user) {
            return sendJson(res, 401, { error: 'Authentication required' });
        }
        const admin = await isAdmin(user.email);
        if (!admin) {
            return sendJson(res, 403, { error: 'Admin access required' });
        }

        const result = await pool.query(`
            SELECT tl.id, tl.submission_id, tl.request_payload, tl.response_payload,
                   tl.status, tl.http_status, tl.error_message, tl.created_at,
                   rr.payment_handle
            FROM task_logs tl
            LEFT JOIN review_rewards rr ON tl.submission_id = rr.id
            WHERE tl.id = $1
        `, [id]);

        if (result.rows.length === 0) {
            return sendJson(res, 404, { error: 'Task log not found' });
        }

        sendJson(res, 200, { data: result.rows[0] });

    } catch (err) {
        console.error('Get task log error:', err);
        sendJson(res, 500, { error: 'Server error' });
    }
}

async function handleTasksHealth(req, res) {
    const user = await getSessionUser(req);
    if (!user) return sendJson(res, 401, { error: 'Authentication required' });
    const admin = await isAdmin(user.email);
    if (!admin) return sendJson(res, 403, { error: 'Admin access required' });
    const hasApiKey = !!process.env.GPTGPTBACKEND_X_API_KEY;
    sendJson(res, 200, { status: 'ok', tasksApiConfigured: hasApiKey });
}

async function handleTasksOptions(req, res) {
    try {
        // Admin-only. Leaking the dropdown reveals building/property catalog + internal IDs.
        const user = await getSessionUser(req);
        if (!user) return sendJson(res, 401, { error: 'Authentication required' });
        const admin = await isAdmin(user.email);
        if (!admin) return sendJson(res, 403, { error: 'Admin access required' });

        const apiKey = getTasksApiKey();

        const response = await fetch(`${TASKS_API_BASE}/tasks/options/dropdown`, {
            method: 'GET',
            headers: {
                'x-api-key': apiKey,
                'Accept': 'application/json',
            },
        });

        if (!response.ok) {
            const errorText = await response.text();
            console.error('Tasks options API error:', response.status, errorText);
            return sendJson(res, 502, { error: 'Failed to load task options. Please try again.' });
        }

        const options = await response.json();
        sendJson(res, 200, options);
    } catch (err) {
        console.error('Tasks options error:', err);
        sendJson(res, 500, { error: 'Failed to load task options. Please try again.' });
    }
}

module.exports = {
    handleGetTaskLog,
    handleGetTaskLogs,
    handleTasksApi,
    handleTasksHealth,
    handleTasksOptions
};
