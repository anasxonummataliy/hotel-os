import subprocess
import os
import signal
import sys
import time
from pathlib import Path

PROJECT_ROOT = Path(__file__).parent
VENV_PYTHON = PROJECT_ROOT / ".venv" / "bin" / "python"

if not VENV_PYTHON.exists():
    VENV_PYTHON = sys.executable

SERVICES = {
    "auth":              {"port": 8000, "module": "services.auth.main:app",              "name": "Auth Service"},
    "reception":         {"port": 8001, "module": "services.reception.main:app",         "name": "Reception Service"},
    "housekeeping":      {"port": 8002, "module": "services.housekeeping.main:app",      "name": "Housekeeping Service"},
    "room_service":      {"port": 8003, "module": "services.room_service.main:app",      "name": "Room Service"},
    "maintenance":       {"port": 8004, "module": "services.maintenance.main:app",       "name": "Maintenance Service"},
    "websocket_gateway": {"port": 8005, "module": "services.websocket_gateway.main:app", "name": "WebSocket Gateway"},
}

processes = {}


def kill_port(port: int):
    try:
        result = subprocess.run(["lsof", "-ti", f":{port}"], capture_output=True, text=True)
        for pid in result.stdout.strip().split():
            if pid:
                subprocess.run(["kill", "-9", pid], capture_output=True)
    except Exception:
        pass


def start_service(key: str, cfg: dict):
    print(f"  Starting {cfg['name']} on port {cfg['port']}…", end=" ", flush=True)
    try:
        proc = subprocess.Popen(
            [str(VENV_PYTHON), "-m", "uvicorn", cfg["module"],
             "--host", "0.0.0.0", "--port", str(cfg["port"])],
            cwd=str(PROJECT_ROOT),
        )
        processes[key] = proc
        print(f"PID {proc.pid}")
    except Exception as e:
        print(f"FAILED — {e}")


def stop_all():
    print("\nShutting down…")
    for key, proc in processes.items():
        try:
            proc.terminate()
            proc.wait(timeout=5)
            print(f"  Stopped {SERVICES[key]['name']}")
        except subprocess.TimeoutExpired:
            proc.kill()
        except Exception:
            pass


def signal_handler(sig, frame):
    stop_all()
    sys.exit(0)


def main():
    print("=" * 60)
    print("  HotelOS — Microservices")
    print("=" * 60)

    signal.signal(signal.SIGINT, signal_handler)
    signal.signal(signal.SIGTERM, signal_handler)

    print("\nFreeing ports…", end=" ")
    for cfg in SERVICES.values():
        kill_port(cfg["port"])
    time.sleep(0.3)
    print("done")

    print("\nChecking Redis…", end=" ")
    try:
        import redis
        redis.Redis(host="localhost", port=6379).ping()
        print("running")
    except Exception as e:
        print(f"NOT running — {e}")
        print("  Start Redis:  redis-server")

    print("\nStarting services:")
    for key, cfg in SERVICES.items():
        start_service(key, cfg)
        time.sleep(0.4)

    print("\n" + "=" * 60)
    print("  Auth:         http://localhost:8000/docs")
    print("  Reception:    http://localhost:8001/docs")
    print("  Housekeeping: http://localhost:8002/docs")
    print("  Room Service: http://localhost:8003/docs")
    print("  Maintenance:  http://localhost:8004/docs")
    print("  Dashboard:    http://localhost:8005/")
    print("=" * 60)
    print("\nDefault accounts:")
    print("  admin@hotel.com        / admin123  (admin)")
    print("  reception@hotel.com    / staff123  (reception)")
    print("  housekeeping@hotel.com / staff123  (housekeeping)")
    print("  roomservice@hotel.com  / staff123  (room_service)")
    print("  maintenance@hotel.com  / staff123  (maintenance)")
    print("\nCtrl+C to stop.\n")

    try:
        while True:
            time.sleep(5)
            for key, proc in list(processes.items()):
                if proc.poll() is not None:
                    print(f"  {SERVICES[key]['name']} crashed — restarting…")
                    time.sleep(1)
                    start_service(key, SERVICES[key])
    except KeyboardInterrupt:
        pass
    finally:
        stop_all()


if __name__ == "__main__":
    main()
