const {
    getSessionUser,
    isAdmin,
    parseBody,
    pool,
    sendJson
} = require('./core');

async function handleGetSettings(req, res) {
    try {
        const user = await getSessionUser(req);
        if (!user) {
            return sendJson(res, 401, { error: 'Authentication required' });
        }

        const admin = await isAdmin(user.email);
        if (!admin) {
            return sendJson(res, 403, { error: 'Admin access required' });
        }

        const result = await pool.query('SELECT key, value, description FROM settings ORDER BY key');
        const settings = {};
        result.rows.forEach(row => {
            settings[row.key] = { value: row.value, description: row.description };
        });

        sendJson(res, 200, { data: settings });
    } catch (err) {
        console.error('Get settings error:', err);
        sendJson(res, 500, { error: 'Server error' });
    }
}

// Explicit allow-list of writable settings. Attempts to write other keys are rejected
// (prevents an admin — compromised or otherwise — from silently adding arbitrary keys).
const ALLOWED_SETTING_KEYS = new Set([
    'company_referral_reward',
    'company_referral_max',
    'guest_referral_reward',
    'guest_referral_max'
]);

async function handleUpdateSettings(req, res) {
    try {
        const user = await getSessionUser(req);
        if (!user) {
            return sendJson(res, 401, { error: 'Authentication required' });
        }

        const admin = await isAdmin(user.email);
        if (!admin) {
            return sendJson(res, 403, { error: 'Admin access required' });
        }

        const body = await parseBody(req);
        const updates = [];
        const rejected = [];

        for (const [key, value] of Object.entries(body)) {
            if (!ALLOWED_SETTING_KEYS.has(key)) {
                rejected.push(key);
                continue;
            }
            const stringValue = value === null || value === undefined ? '' : String(value);
            if (stringValue.length > 200) {
                return sendJson(res, 400, { error: `Value for "${key}" exceeds maximum length` });
            }
            await pool.query(
                'UPDATE settings SET value = $1, updated_at = NOW() WHERE key = $2',
                [stringValue, key]
            );
            updates.push(key);
        }

        if (rejected.length) {
            return sendJson(res, 400, { error: 'Unknown setting keys', rejected });
        }

        sendJson(res, 200, { success: true, updated: updates });
    } catch (err) {
        if (err.statusCode === 413) return sendJson(res, 413, { error: 'Request too large' });
        console.error('Update settings error:', err);
        sendJson(res, 500, { error: 'Server error' });
    }
}

async function handleGetPublicSettings(req, res) {
    try {
        const result = await pool.query(
            "SELECT key, value FROM settings WHERE key IN ('company_referral_reward', 'company_referral_max', 'guest_referral_reward', 'guest_referral_max')"
        );
        const settings = {};
        result.rows.forEach(row => {
            settings[row.key] = row.value;
        });

        sendJson(res, 200, settings);
    } catch (err) {
        console.error('Get public settings error:', err);
        sendJson(res, 200, {
            company_referral_reward: '250',
            company_referral_max: '5',
            guest_referral_reward: '50',
            guest_referral_max: '10'
        });
    }
}

module.exports = {
    handleGetPublicSettings,
    handleGetSettings,
    handleUpdateSettings
};
