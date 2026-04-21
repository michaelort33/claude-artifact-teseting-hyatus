const fs = require('fs');
const { execFileSync } = require('child_process');
const crypto = require('crypto');

function loadEnvFile(filePath) {
    if (!fs.existsSync(filePath)) return;

    const lines = fs.readFileSync(filePath, 'utf8').split(/\r?\n/);
    for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith('#')) continue;

        const eqIndex = trimmed.indexOf('=');
        if (eqIndex === -1) continue;

        const key = trimmed.slice(0, eqIndex).trim();
        let value = trimmed.slice(eqIndex + 1).trim();
        if (!key || process.env[key] !== undefined) continue;

        if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
            value = value.slice(1, -1);
        }
        process.env[key] = value;
    }
}

loadEnvFile('.env');
loadEnvFile('.env.local');

function getDevAdminToken() {
    fs.mkdirSync('.local', { recursive: true, mode: 0o700 });
    const tokenPath = '.local/dev-admin-token';
    if (fs.existsSync(tokenPath)) {
        return fs.readFileSync(tokenPath, 'utf8').trim();
    }

    const token = crypto.randomBytes(32).toString('hex');
    fs.writeFileSync(tokenPath, `${token}\n`, { mode: 0o600 });
    return token;
}

if (process.env.LOCAL_ADMIN_DATABASE_SOURCE !== 'env') {
    const databaseUrl = execFileSync('neon', [
        'connection-string',
        'br-empty-salad-a40rg002',
        '--project-id',
        'odd-mud-01179244',
        '--role-name',
        'app_runtime',
        '--database-name',
        'neondb',
        '--ssl',
        'require'
    ], { encoding: 'utf8' }).trim();

    process.env.DATABASE_URL = databaseUrl;
    process.env.NEON_DATABASE_URL = databaseUrl;
}

process.env.DEV_ADMIN_LOGIN = 'true';
process.env.DEV_ADMIN_TOKEN = process.env.DEV_ADMIN_TOKEN || getDevAdminToken();

const { createServer, runStartupMigrations } = require('../server');

const port = Number(process.env.PORT || 5001);
const host = process.env.HOST || '127.0.0.1';
const server = createServer();

server.listen(port, host, async () => {
    console.log(`Server running at http://${host}:${port}/`);
    console.log('Dev admin login enabled: true');
    console.log(`Local admin URL: http://${host}:${port}/admin#dev_admin_token=${process.env.DEV_ADMIN_TOKEN}`);
    console.log(`Database source: ${process.env.LOCAL_ADMIN_DATABASE_SOURCE === 'env' ? 'env' : 'Neon hyatus-preview/main'}`);
    console.log(`Database configured: ${!!process.env.DATABASE_URL}`);
    console.log(`Tasks API configured: ${!!(process.env.TASKS_API_EMAIL && process.env.TASKS_API_PASSWORD)}`);
    console.log(`Admin email configured: ${!!process.env.ADMIN_EMAIL}`);
    console.log(`Translation API configured: ${!!process.env.GOOGLE_TRANSLATE}`);
    await runStartupMigrations();
});
