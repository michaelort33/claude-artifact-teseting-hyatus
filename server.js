const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = 5000;
const HOST = '0.0.0.0';
const TASKS_API_BASE = 'https://api.gptpricing.com';

let cachedToken = null;
let tokenExpiry = null;

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
    '.txt': 'text/plain'
};

async function getTasksApiToken() {
    if (cachedToken && tokenExpiry && Date.now() < tokenExpiry) {
        return cachedToken;
    }

    const email = process.env.TASKS_API_EMAIL;
    const password = process.env.TASKS_API_PASSWORD;

    if (!email || !password) {
        throw new Error('Task API credentials not configured');
    }

    const response = await fetch(`${TASKS_API_BASE}/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password })
    });

    if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Auth failed: ${response.status} ${errorText}`);
    }

    const data = await response.json();
    cachedToken = data.data?.access_token || data.access_token;
    tokenExpiry = Date.now() + (55 * 60 * 1000);
    return cachedToken;
}

async function handleTasksApi(req, res) {
    let body = '';
    req.on('data', chunk => { body += chunk.toString(); });
    
    req.on('end', async () => {
        try {
            const token = await getTasksApiToken();
            const payload = JSON.parse(body);
            
            const response = await fetch(`${TASKS_API_BASE}/tasks`, {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json',
                    'Accept': 'application/json',
                },
                body: JSON.stringify(payload),
            });

            const responseText = await response.text();
            
            res.setHeader('Content-Type', 'application/json');
            
            if (!response.ok) {
                if (responseText.includes('uniq_external_id_subcategory')) {
                    res.writeHead(200);
                    res.end(JSON.stringify({ duplicate: true }));
                    return;
                }
                res.writeHead(response.status);
                res.end(JSON.stringify({ 
                    error: `Task API error: ${response.status}`,
                    details: responseText 
                }));
                return;
            }

            res.writeHead(200);
            res.end(responseText);
        } catch (error) {
            console.error('Task API error:', error);
            res.writeHead(500);
            res.setHeader('Content-Type', 'application/json');
            res.end(JSON.stringify({ error: error.message }));
        }
    });
}

function handleTasksHealth(req, res) {
    const hasCredentials = !!(process.env.TASKS_API_EMAIL && process.env.TASKS_API_PASSWORD);
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ 
        status: 'ok', 
        tasksApiConfigured: hasCredentials 
    }));
}

function serveStaticFile(filePath, res) {
    const extname = String(path.extname(filePath)).toLowerCase();
    const contentType = mimeTypes[extname] || 'application/octet-stream';

    fs.readFile(filePath, (error, content) => {
        if (error) {
            if (error.code === 'ENOENT') {
                res.writeHead(404, { 'Content-Type': 'text/html' });
                res.end('<h1>404 Not Found</h1>', 'utf-8');
            } else {
                res.writeHead(500);
                res.end('Server Error: ' + error.code, 'utf-8');
            }
        } else {
            res.writeHead(200, { 
                'Content-Type': contentType,
                'Cache-Control': 'no-cache, no-store, must-revalidate',
                'Pragma': 'no-cache',
                'Expires': '0'
            });
            res.end(content, 'utf-8');
        }
    });
}

const server = http.createServer((req, res) => {
    const url = new URL(req.url, `http://${req.headers.host}`);
    
    if (url.pathname === '/api/tasks' && req.method === 'POST') {
        handleTasksApi(req, res);
        return;
    }
    
    if (url.pathname === '/api/tasks/health' && req.method === 'GET') {
        handleTasksHealth(req, res);
        return;
    }
    
    let filePath = '.' + url.pathname;
    if (filePath === './') {
        filePath = './index.html';
    }
    
    serveStaticFile(filePath, res);
});

server.listen(PORT, HOST, () => {
    console.log(`Server running at http://${HOST}:${PORT}/`);
    console.log(`Tasks API configured: ${!!(process.env.TASKS_API_EMAIL && process.env.TASKS_API_PASSWORD)}`);
});
