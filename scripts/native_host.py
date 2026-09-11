"""Per-user browser launcher. Only the fixed 'start' action is accepted.

Registration follows Chrome/Edge and Firefox native messaging manifests.
Unpacked Chromium IDs hash the Windows path's UTF-16LE bytes (crx_file/id_util.cc).
No manifest key is added, so existing extension storage and queued events survive.
"""
import argparse
from contextlib import contextmanager
import hashlib
import json
import os
from pathlib import Path
import re
import struct
import subprocess
import sys
import time
from urllib.request import Request, build_opener, ProxyHandler

ROOT = Path(__file__).resolve().parents[1]
HOST = 'com.watchledger.launcher'
DATA = Path(os.environ.get('LOCALAPPDATA', str(Path.home()))) / 'WatchLedger'
ENDPOINT = 'http://127.0.0.1:17643'


def chromium_id(path):
    value = str(path)
    if len(value) > 1 and value[1] == ':':
        value = value[0].upper() + value[1:]
    digest = hashlib.sha256(value.encode('utf-16le')).hexdigest()[:32]
    return ''.join(chr(ord('a') + int(c, 16)) for c in digest)


def install(extension_id=None):
    if sys.platform != 'win32':
        raise RuntimeError('The one-click launcher currently supports Windows only.')
    import winreg
    extension_id = extension_id or chromium_id(ROOT / 'neo')
    if not re.fullmatch('[a-p]{32}', extension_id):
        raise ValueError('Expected a Chromium extension ID: 32 letters a-p.')
    target = DATA / 'launcher'
    target.mkdir(parents=True, exist_ok=True)
    # PowerShell must not pipe native stdout: its text conversion breaks the binary
    # framing. The .cmd launches Python directly using UTF-8 cmd on modern Windows.
    launcher = target / 'launch.cmd'
    python_path = str(Path(sys.executable).resolve())
    script_path = str(Path(__file__).resolve())
    if any(c in python_path + script_path for c in '%\r\n'):
        raise ValueError('Launcher paths must not contain percent signs or newlines.')
    launcher.write_text('@echo off\nsetlocal DisableDelayedExpansion\nchcp 65001 >nul\n"' + python_path + '" "' + script_path + '"\n', encoding='utf-8')
    common = dict(name=HOST, description='Start the local WatchLedger service',
                  path=str(launcher), type='stdio')
    chromium_manifest = target / 'chromium.json'
    origins = {f'chrome-extension://{extension_id}/'}
    if chromium_manifest.exists():
        try:
            origins.update(x for x in json.loads(chromium_manifest.read_text(encoding='utf-8')).get('allowed_origins', [])
                           if re.fullmatch(r'chrome-extension://[a-p]{32}/', x))
        except (ValueError, OSError):
            pass
    chromium_manifest.write_text(json.dumps({**common, 'allowed_origins': sorted(origins)}, indent=2), encoding='utf-8')
    firefox_manifest = target / 'firefox.json'
    firefox_manifest.write_text(json.dumps({**common, 'allowed_extensions': ['watchledger@local.personal']}, indent=2), encoding='utf-8')
    for vendor, manifest in [('Google\\Chrome', chromium_manifest), ('Microsoft\\Edge', chromium_manifest), ('Mozilla', firefox_manifest)]:
        with winreg.CreateKeyEx(winreg.HKEY_CURRENT_USER, f'Software\\{vendor}\\NativeMessagingHosts\\{HOST}', 0,
                               winreg.KEY_WRITE | winreg.KEY_WOW64_64KEY) as key:
            winreg.SetValueEx(key, '', 0, winreg.REG_SZ, str(manifest))
    print('WatchLedger browser launcher installed for the current user.')
    print('Chromium extension ID: ' + extension_id)


def service_token():
    try:
        token = (DATA / 'pairing-token.txt').read_text(encoding='utf-8').strip()
        request = Request(ENDPOINT + '/api/status', headers={'Authorization': 'Bearer ' + token})
        # Loopback must never use an environment-configured HTTP proxy.
        with build_opener(ProxyHandler({})).open(request, timeout=1) as response:
            status = json.load(response)
        return token if status.get('ok') is True else None
    except (OSError, ValueError):
        return None


@contextmanager
def startup_lock():
    """Serialize startup across browsers, including first-time token creation."""
    DATA.mkdir(parents=True, exist_ok=True)
    import msvcrt
    with (DATA / 'launcher.lock').open('a+b') as lock:
        if lock.tell() == 0:
            lock.write(b'0')
            lock.flush()
        deadline = time.monotonic() + 20
        while True:
            try:
                lock.seek(0)
                msvcrt.locking(lock.fileno(), msvcrt.LK_NBLCK, 1)
                break
            except OSError:
                if time.monotonic() >= deadline:
                    raise RuntimeError('另一个浏览器正在启动服务，请稍后重试。')
                time.sleep(0.2)
        try:
            yield
        finally:
            lock.seek(0)
            msvcrt.locking(lock.fileno(), msvcrt.LK_UNLCK, 1)


def start_service():
    token = service_token()
    if token:
        return {'ok': True, 'token': token}
    with startup_lock():
        return start_locked()


def start_locked():
    token = service_token()
    if token:
        return {'ok': True, 'token': token}
    DATA.mkdir(parents=True, exist_ok=True)
    flags = (subprocess.CREATE_NO_WINDOW | subprocess.CREATE_NEW_PROCESS_GROUP) if sys.platform == 'win32' else 0
    with (DATA / 'launcher.log').open('ab') as log:
        subprocess.Popen([sys.executable, str(ROOT / 'server.py'), '--no-browser'], cwd=ROOT,
                                   stdin=subprocess.DEVNULL, stdout=log, stderr=log, creationflags=flags)
    deadline = time.monotonic() + 15
    while time.monotonic() < deadline:
        token = service_token()
        if token:
            return {'ok': True, 'token': token}
        time.sleep(0.3)
    return {'ok': False, 'error': '服务启动失败或端口 17643 被占用，请查看 %LOCALAPPDATA%\\WatchLedger\\launcher.log。'}


def read_message(stream):
    header = stream.read(4)
    if len(header) != 4:
        raise ValueError('Missing native message header')
    length = struct.unpack('<I', header)[0]
    if not 0 < length <= 4096:
        raise ValueError('Invalid native message size')
    body = stream.read(length)
    if len(body) != length:
        raise ValueError('Truncated native message')
    message = json.loads(body)
    if message != {'action': 'start'}:
        raise ValueError('Unsupported launcher action')
    return message


def main():
    if '--install' in sys.argv[1:]:
        parser = argparse.ArgumentParser()
        parser.add_argument('--install', action='store_true')
        parser.add_argument('--extension-id')
        args = parser.parse_args()
        install(args.extension_id)
        return
    if sys.platform == 'win32':
        import msvcrt
        msvcrt.setmode(sys.stdin.fileno(), os.O_BINARY)
        msvcrt.setmode(sys.stdout.fileno(), os.O_BINARY)
    try:
        read_message(sys.stdin.buffer)
        result = start_service()
    except Exception as error:
        result = {'ok': False, 'error': str(error)}
    body = json.dumps(result, ensure_ascii=False).encode('utf-8')
    sys.stdout.buffer.write(struct.pack('<I', len(body)) + body)
    sys.stdout.buffer.flush()


if __name__ == '__main__':
    main()
