#!/usr/bin/env python3
"""
Vercel Web-Auth PTY Standard Dispatcher for Android Termux.
Spawns `vercel login`, intercepts the device authorization URL,
copies it to clipboard, dispatches it to the Android browser via `termux-open-url`,
and waits for the authorization poll to complete.
"""
import os
import pty
import re
import select
import shutil
import subprocess
import sys
import time

def resolve_vercel_binary() -> str:
    """Dynamically resolves the Vercel executable without hardcoded directory paths."""
    found = shutil.which("vercel")
    if found:
        return found
    prefix = os.environ.get("PREFIX", "/data/data/com.termux/files/usr")
    termux_bin = os.path.join(prefix, "bin", "vercel")
    if os.path.isfile(termux_bin):
        return termux_bin
    return "vercel"

def main():
    vercel_bin = resolve_vercel_binary()
    print(f"[AUTH] Resolved Vercel binary at: {vercel_bin}")
    print("[AUTH] Spawning Vercel login in PTY...")
    master, slave = pty.openpty()
    
    env = os.environ.copy()
    env["VERCEL_SKIP_UPGRADE_CHECK"] = "1"
    env["NO_UPDATE_NOTIFIER"] = "1"

    pid = os.fork()
    if pid == 0:
        os.close(master)
        os.dup2(slave, 0)
        os.dup2(slave, 1)
        os.dup2(slave, 2)
        os.close(slave)
        os.execve(
            vercel_bin,
            ["vercel", "login"],
            env
        )
        sys.exit(1)

    os.close(slave)
    
    auth_url_dispatched = False
    full_output = ""
    start_time = time.time()
    timeout = 180  # 3 minutes

    while time.time() - start_time < timeout:
        r, _, _ = select.select([master], [], [], 0.5)
        if master in r:
            try:
                data = os.read(master, 1024)
                if not data:
                    break
                text = data.decode("utf-8", errors="replace")
                full_output += text
                sys.stdout.write(text)
                sys.stdout.flush()

                # If interactive selection prompt appears, press Enter to select default (GitHub)
                if ("Continue with" in text or "Log in to Vercel" in text) and not auth_url_dispatched:
                    time.sleep(0.2)
                    os.write(master, b"\r")

                # Detect device OAuth URL
                match = re.search(r"https://vercel\.com/oauth/device\?user_code=[A-Z0-9-]+", full_output)
                if match and not auth_url_dispatched:
                    url = match.group(0)
                    print(f"\n\n[DISPATCH] Detected Vercel Auth URL: {url}")
                    
                    # Copy to clipboard
                    try:
                        p = subprocess.Popen(["termux-clipboard-set"], stdin=subprocess.PIPE)
                        p.communicate(input=url.encode("utf-8"))
                        print("[DISPATCH] ✓ Copied authorization URL to Termux clipboard.")
                    except Exception as e:
                        print(f"[DISPATCH] Clipboard note: {e}")

                    # Open in Android browser
                    try:
                        subprocess.run(["termux-open-url", url], check=False)
                        print("[DISPATCH] ✓ Dispatched URL to browser via termux-open-url.")
                    except Exception as e:
                        print(f"[DISPATCH] Browser note: {e}")

                    print("\n👉 Please confirm/authorize in your browser. Waiting for authentication to complete...\n")
                    auth_url_dispatched = True

                if "Success!" in text or "Congratulations!" in text or "Email confirmed" in text:
                    print("\n[AUTH] Authentication detected as successful!")
                    break

            except OSError:
                break

    os.close(master)
    try:
        _, status = os.waitpid(pid, 0)
        print(f"\n[AUTH] Process exited with code {os.waitstatus_to_exitcode(status)}")
    except Exception:
        pass

    # Verify whoami
    print("\n[AUTH] Verifying logged-in status via `vercel whoami`...")
    res = subprocess.run(
        [vercel_bin, "whoami"],
        env=env,
        capture_output=True,
        text=True
    )
    print(res.stdout)
    if res.returncode == 0:
        print("✅ Vercel login verified successfully!")
    else:
        print(f"❌ Vercel whoami output: {res.stderr or res.stdout}")

if __name__ == "__main__":
    main()
