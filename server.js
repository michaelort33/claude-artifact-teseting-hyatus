const http = require('http');
const fs = require('fs');
const path = require('path');
const {
    handleDevAdminSignin,
    handleGetSession,
    handlePasswordReset,
    handlePasswordResetRequest,
    handleSignin,
    handleSignout,
    handleSignup
} = require('./lib/auth-handlers');
const {
    handleCreateSubmission,
    handleGetSubmission,
    handleGetSubmissions,
    handleScreenshotUpload,
    handleUpdateSubmission
} = require('./lib/submission-handlers');
const {
    handleCreateReferral,
    handleGetMyReferrals,
    handleGetReferrals,
    handleUpdateReferral
} = require('./lib/referral-handlers');
const {
    handleGetPublicSettings,
    handleGetSettings,
    handleUpdateSettings
} = require('./lib/settings-handlers');
const {
    handleCreateGuestReferral,
    handleGetGuestReferrals,
    handleGetMyGuestReferrals,
    handleUpdateGuestReferral
} = require('./lib/guest-referral-handlers');
const {
    handleReservationLookup,
    handleVerifyManual,
    handleVerifyToken
} = require('./lib/reservations-handlers');
const {
    handleGetTaskLog,
    handleGetTaskLogs,
    handleTasksApi,
    handleTasksHealth,
    handleTasksOptions
} = require('./lib/tasks-handlers');
const {
    handleEmailHealth,
    handleRequestProof,
    handleSendEmail
} = require('./lib/email-handlers');
const {
    handleTranslate,
    handleTranslateHealth
} = require('./lib/translate-handlers');
const {
    pool,
    securityHeaders
} = require('./lib/core');

const PORT = 5000;
const HOST = '0.0.0.0';

const dbUrl = process.env.DATABASE_URL;


const mimeTypes = {
    '.html': 'text/html',
    '.js': 'application/javascript',
    '.css': 'text/css',
    '.json': 'application/json',
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.gif': 'image/gif',
    '.svg': 'image/svg+xml',
    '.ico': 'image/x-icon',
    '.webp': 'image/webp',
    '.txt': 'text/plain'
};

function serveStaticFile(filePath, res) {
    const extname = String(path.extname(filePath)).toLowerCase();
    const contentType = mimeTypes[extname] || 'application/octet-stream';

    fs.readFile(filePath, (error, content) => {
        if (error) {
            if (error.code === 'ENOENT') {
                res.writeHead(404, { 'Content-Type': 'text/html', ...securityHeaders });
                res.end('<h1>404 Not Found</h1>', 'utf-8');
            } else {
                res.writeHead(500, securityHeaders);
                res.end('Server Error', 'utf-8');
            }
        } else {
            res.writeHead(200, {
                'Content-Type': contentType,
                'Cache-Control': 'no-cache, no-store, must-revalidate',
                'Pragma': 'no-cache',
                'Expires': '0',
                ...securityHeaders
            });
            res.end(content, 'utf-8');
        }
    });
}

async function requestHandler(req, res) {
    const url = new URL(req.url, `http://${req.headers.host}`);
    const pathname = url.pathname;
    const method = req.method;

    if (pathname === '/api/auth/signup' && method === 'POST') {
        return handleSignup(req, res);
    }
    if (pathname === '/api/auth/signin' && method === 'POST') {
        return handleSignin(req, res);
    }
    if (pathname === '/api/auth/dev-admin' && method === 'POST') {
        return handleDevAdminSignin(req, res);
    }
    if (pathname === '/api/auth/signout' && method === 'POST') {
        return handleSignout(req, res);
    }
    if (pathname === '/api/auth/session' && method === 'GET') {
        return handleGetSession(req, res);
    }
    if (pathname === '/api/auth/reset-password-request' && method === 'POST') {
        return handlePasswordResetRequest(req, res);
    }
    if (pathname === '/api/auth/reset-password' && method === 'POST') {
        return handlePasswordReset(req, res);
    }

    if (pathname === '/api/submissions' && method === 'GET') {
        return handleGetSubmissions(req, res);
    }
    if (pathname === '/api/submissions' && method === 'POST') {
        return handleCreateSubmission(req, res);
    }
    if (pathname === '/api/uploads/screenshot' && method === 'POST') {
        return handleScreenshotUpload(req, res);
    }

    const submissionMatch = pathname.match(/^\/api\/submissions\/(\d+)$/);
    if (submissionMatch) {
        const id = submissionMatch[1];
        if (method === 'GET') {
            return handleGetSubmission(req, res, id);
        }
        if (method === 'PATCH') {
            return handleUpdateSubmission(req, res, id);
        }
    }

    if (pathname === '/api/tasks' && method === 'POST') {
        return handleTasksApi(req, res);
    }
    if (pathname === '/api/tasks/health' && method === 'GET') {
        return handleTasksHealth(req, res);
    }
    if (pathname === '/api/tasks/options' && method === 'GET') {
        return handleTasksOptions(req, res);
    }
    if (pathname === '/api/reservations/lookup-by-email' && method === 'POST') {
        return handleReservationLookup(req, res);
    }
    if (pathname === '/api/reservations/verify-token' && method === 'POST') {
        return handleVerifyToken(req, res);
    }
    if (pathname === '/api/reservations/verify-manual' && method === 'POST') {
        return handleVerifyManual(req, res);
    }
    if (pathname === '/api/task-logs' && method === 'GET') {
        return handleGetTaskLogs(req, res);
    }

    const taskLogMatch = pathname.match(/^\/api\/task-logs\/(\d+)$/);
    if (taskLogMatch && method === 'GET') {
        return handleGetTaskLog(req, res, taskLogMatch[1]);
    }

    if (pathname === '/api/submissions/request-proof' && method === 'POST') {
        return handleRequestProof(req, res);
    }
    if (pathname === '/api/email/send' && method === 'POST') {
        return handleSendEmail(req, res);
    }
    if (pathname === '/api/email/health' && method === 'GET') {
        return handleEmailHealth(req, res);
    }

    if (pathname === '/api/translate' && method === 'POST') {
        return handleTranslate(req, res);
    }
    if (pathname === '/api/translate/health' && method === 'GET') {
        return handleTranslateHealth(req, res);
    }

    if (pathname === '/api/referrals/my' && method === 'GET') {
        return handleGetMyReferrals(req, res);
    }
    if (pathname === '/api/referrals' && method === 'GET') {
        return handleGetReferrals(req, res);
    }
    if (pathname === '/api/referrals' && method === 'POST') {
        return handleCreateReferral(req, res);
    }

    const referralMatch = pathname.match(/^\/api\/referrals\/(\d+)$/);
    if (referralMatch) {
        const id = referralMatch[1];
        if (method === 'PATCH') {
            return handleUpdateReferral(req, res, id);
        }
    }

    if (pathname === '/api/settings' && method === 'GET') {
        return handleGetSettings(req, res);
    }
    if (pathname === '/api/settings' && method === 'PATCH') {
        return handleUpdateSettings(req, res);
    }
    if (pathname === '/api/settings/public' && method === 'GET') {
        return handleGetPublicSettings(req, res);
    }

    if (pathname === '/api/guest-referrals/my' && method === 'GET') {
        return handleGetMyGuestReferrals(req, res);
    }
    if (pathname === '/api/guest-referrals' && method === 'GET') {
        return handleGetGuestReferrals(req, res);
    }
    if (pathname === '/api/guest-referrals' && method === 'POST') {
        return handleCreateGuestReferral(req, res);
    }
    const guestReferralMatch = pathname.match(/^\/api\/guest-referrals\/(\d+)$/);
    if (guestReferralMatch) {
        const id = guestReferralMatch[1];
        if (method === 'PATCH') {
            return handleUpdateGuestReferral(req, res, id);
        }
    }

    if (pathname === '/admin') {
        return serveStaticFile('./admin.html', res);
    } else if (pathname === '/referral') {
        return serveStaticFile('./referral.html', res);
    } else if (pathname === '/guest-referral') {
        return serveStaticFile('./guest-referral.html', res);
    }

    if (pathname.endsWith('.html') && pathname !== '/index.html') {
        const cleanPath = pathname.replace('.html', '');
        res.writeHead(301, { 'Location': cleanPath, ...securityHeaders });
        return res.end();
    }

    const allowedDirs = ['js', 'images'];
    const allowedExtensions = ['.html', '.css', '.js', '.png', '.jpg', '.jpeg', '.gif', '.svg', '.ico', '.webp', '.woff', '.woff2', '.ttf', '.eot'];

    let filePath = '.' + pathname;
    if (filePath === './') {
        filePath = './index.html';
    }

    const resolvedPath = path.resolve(filePath);
    const projectRoot = path.resolve('.');

    if (!resolvedPath.startsWith(projectRoot)) {
        res.writeHead(404, { 'Content-Type': 'text/html', ...securityHeaders });
        return res.end('<h1>404 Not Found</h1>', 'utf-8');
    }

    const ext = path.extname(filePath).toLowerCase();
    const relativePath = path.relative(projectRoot, resolvedPath);
    const topDir = relativePath.split(path.sep)[0];

    const pathSegments = relativePath.split(path.sep);
    const blockedSegments = ['node_modules', 'attached_assets', '.local', '.config', '.cache', '.git'];
    const blockedFiles = ['server.js', 'package.json', 'package-lock.json', 'replit.md', 'INFRASTRUCTURE.md', '.replit', '.env', '.gitignore'];
    const hasBlockedSegment = pathSegments.some(seg => blockedSegments.includes(seg) || seg.startsWith('.'));
    const isBlockedFile = blockedFiles.includes(relativePath);

    if (hasBlockedSegment || isBlockedFile) {
        res.writeHead(404, { 'Content-Type': 'text/html', ...securityHeaders });
        return res.end('<h1>404 Not Found</h1>', 'utf-8');
    }

    if (!allowedExtensions.includes(ext)) {
        res.writeHead(404, { 'Content-Type': 'text/html', ...securityHeaders });
        return res.end('<h1>404 Not Found</h1>', 'utf-8');
    }

    const isRootHtml = relativePath.endsWith('.html') && !relativePath.includes(path.sep);
    const isAllowedDir = allowedDirs.includes(topDir);

    if (!isRootHtml && !isAllowedDir) {
        res.writeHead(404, { 'Content-Type': 'text/html', ...securityHeaders });
        return res.end('<h1>404 Not Found</h1>', 'utf-8');
    }

    serveStaticFile(filePath, res);
}

async function runStartupMigrations() {
    if (!process.env.DATABASE_URL) return;
    try {
        const tables = ['review_rewards', 'referrals', 'guest_referrals', 'users', 'sessions', 'task_logs'];
        for (const table of tables) {
            try {
                await pool.query(`SELECT setval('${table}_id_seq', COALESCE((SELECT MAX(id) FROM ${table}), 0) + 1, false)`);
            } catch (e) {}
        }
        console.log('Primary key sequences synchronized');

        await pool.query(`ALTER TABLE review_rewards ADD COLUMN IF NOT EXISTS reservation_id TEXT`);
        await pool.query(`ALTER TABLE review_rewards ADD COLUMN IF NOT EXISTS followup_sent_at TIMESTAMPTZ`);
        await pool.query(`ALTER TABLE review_rewards ADD COLUMN IF NOT EXISTS source_url TEXT`);
        await pool.query(`ALTER TABLE review_rewards
            ADD COLUMN IF NOT EXISTS verification_method TEXT,
            ADD COLUMN IF NOT EXISTS verification_status TEXT,
            ADD COLUMN IF NOT EXISTS verified_reservation_id TEXT,
            ADD COLUMN IF NOT EXISTS verified_previously_used BOOLEAN DEFAULT false,
            ADD COLUMN IF NOT EXISTS provided_checkin DATE,
            ADD COLUMN IF NOT EXISTS provided_checkout DATE,
            ADD COLUMN IF NOT EXISTS actual_checkin DATE,
            ADD COLUMN IF NOT EXISTS actual_checkout DATE`);
        await pool.query(`CREATE INDEX IF NOT EXISTS idx_review_rewards_verified_reservation
            ON review_rewards (verified_reservation_id)
            WHERE verified_reservation_id IS NOT NULL`);
        console.log('Schema migration complete');
    } catch (err) {
        console.error('Failed to sync sequences:', err.message);
    }
}

function createServer() {
    return http.createServer(requestHandler);
}

if (require.main === module) {
    const server = createServer();
    server.listen(PORT, HOST, async () => {
        console.log(`Server running at http://${HOST}:${PORT}/`);
        console.log(`Database configured: ${!!process.env.DATABASE_URL}`);
        console.log(`Tasks API configured: ${!!(process.env.TASKS_API_EMAIL && process.env.TASKS_API_PASSWORD)}`);
        console.log(`Admin email configured: ${!!process.env.ADMIN_EMAIL}`);
        console.log(`Translation API configured: ${!!process.env.GOOGLE_TRANSLATE}`);
        await runStartupMigrations();
    });
}

module.exports = {
    createServer,
    requestHandler,
    runStartupMigrations
};
