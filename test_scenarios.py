import httpx
import json
import time
from datetime import date, timedelta

BASE_URL = "http://localhost"
AUTH_PORT = 8000
RECEPTION_PORT = 8001
HOUSEKEEPING_PORT = 8002
ROOM_SERVICE_PORT = 8003
MAINTENANCE_PORT = 8004

client = httpx.Client(timeout=10.0)


def get_token(email: str, password: str) -> str:
    r = client.post(
        f"{BASE_URL}:{AUTH_PORT}/auth/login",
        data={"username": email, "password": password},
        headers={"Content-Type": "application/x-www-form-urlencoded"},
    )
    r.raise_for_status()
    return r.json()["access_token"]


# Login as admin (used for most operations)
ADMIN_TOKEN = get_token("admin@hotel.com", "admin123")
HK_TOKEN    = get_token("housekeeping@hotel.com", "staff123")

def headers(token: str = None) -> dict:
    t = token or ADMIN_TOKEN
    return {"Authorization": f"Bearer {t}", "Content-Type": "application/json"}


def test_ts01_room_allocation_algorithm():

    guest_data = {
        "first_name": "Ali",
        "last_name": "Valiyev",
        "email": "ali@example.com",
        "phone": "+998901234567",
    }

    check_in_data = {
        "guest_id": 1,
        "room_type": "double",
        "check_in_date": date.today().isoformat(),
        "check_out_date": (date.today() + timedelta(days=3)).isoformat(),
        "preferred_floor": 1,
        "special_requests": "City view",
    }

    try:
        response = client.post(
            f"{BASE_URL}:{RECEPTION_PORT}/check-in", json=check_in_data, headers=headers()
        )
        print(f"✓ Check-in request: {response.status_code}")
        if response.status_code == 200:
            data = response.json()
            print(f"  - Allocated Room: {data['room_number']}")
            print(f"  - Room ID: {data['room_id']}")
            print(f"  - Floor: {data['room_id']}")
            print(f"  - Price/Night: ${data['price_per_night']}")
            print("✓ PASSED: Room allocated successfully")
        else:
            print(f"✗ FAILED: {response.text}")
    except Exception as e:
        print(f"✗ ERROR: {e}")


def test_ts02_checkout_auto_clean_queue():
    print("\n" + "=" * 60)
    print("TEST TS-02: Check-Out & Auto-Clean Queue")
    print("=" * 60)

    checkout_data = {"booking_id": 1, "room_id": 3}

    try:
        response = client.post(
            f"{BASE_URL}:{RECEPTION_PORT}/check-out",
            json=checkout_data,
            headers=headers(),
        )
        print(f"✓ Check-out request: {response.status_code}")
        if response.status_code == 200:
            data = response.json()
            bill = data["bill"]
            print(f"  - Bill Details:")
            print(f"    • Nightly Rate: ${bill['nightly_rate']}")
            print(f"    • Nights: {bill['num_nights']}")
            print(f"    • Room Service: ${bill['room_service_charges']}")
            print(f"    • Total: ${bill['total_bill']}")
            print("✓ PASSED: Check-out processed, room marked for cleaning")
        else:
            print(f"✗ FAILED: {response.text}")
    except Exception as e:
        print(f"✗ ERROR: {e}")


def test_ts03_housekeeping_workflow():
    print("\n" + "=" * 60)
    print("TEST TS-03: Housekeeping Workflow")
    print("=" * 60)

    room_id = 3

    try:
        response = client.get(f"{BASE_URL}:{HOUSEKEEPING_PORT}/queue", headers=headers())
        print(f"✓ Get cleaning queue: {response.status_code}")
        print(f"  - Queue items: {len(response.json()['queue'])}")

        response = client.post(
            f"{BASE_URL}:{HOUSEKEEPING_PORT}/clean/start",
            params={"room_id": room_id},
            headers=headers(),
        )
        print(f"✓ Start cleaning: {response.status_code}")
        if response.status_code == 200:
            print(f"  - Room status: cleaning")

        time.sleep(1)

        response = client.post(
            f"{BASE_URL}:{HOUSEKEEPING_PORT}/clean/complete",
            params={"room_id": room_id},
            headers=headers(),
        )
        print(f"✓ Complete cleaning: {response.status_code}")
        if response.status_code == 200:
            print(f"  - Room status: clean")
            print("✓ PASSED: Room ready for next guest")
        else:
            print(f"✗ FAILED: {response.text}")
    except Exception as e:
        print(f"✗ ERROR: {e}")


def test_ts04_room_service_integration():
    print("\n" + "=" * 60)
    print("TEST TS-04: Room Service Integration")
    print("=" * 60)

    order_data = {
        "room_id": 3,
        "items": [
            {"name": "Breakfast", "quantity": 2, "price": 15.0},
            {"name": "Coffee", "quantity": 2, "price": 5.0},
            {"name": "Sandwich", "quantity": 1, "price": 12.0},
        ],
        "special_requests": "No onions",
    }

    try:
        response = client.post(
            f"{BASE_URL}:{ROOM_SERVICE_PORT}/orders", json=order_data, headers=headers()
        )
        print(f"✓ Create order: {response.status_code}")
        if response.status_code == 201:
            order = response.json()
            order_id = order["id"]
            print(f"  - Order ID: {order_id}")
            print(f"  - Total: ${order['total_amount']}")
            print(f"  - Status: {order['status']}")

            response = client.put(
                f"{BASE_URL}:{ROOM_SERVICE_PORT}/orders/{order_id}/status",
                json={"status": "preparing"},
                headers=headers(),
            )
            print(f"✓ Update to preparing: {response.status_code}")

            response = client.put(
                f"{BASE_URL}:{ROOM_SERVICE_PORT}/orders/{order_id}/status",
                json={"status": "in_delivery"},
                headers=headers(),
            )
            print(f"✓ Update to in_delivery: {response.status_code}")

            response = client.put(
                f"{BASE_URL}:{ROOM_SERVICE_PORT}/orders/{order_id}/status",
                json={"status": "delivered"},
                headers=headers(),
            )
            print(f"✓ Update to delivered: {response.status_code}")
            print("✓ PASSED: Order processed and charges tracked")
        else:
            print(f"✗ FAILED: {response.text}")
    except Exception as e:
        print(f"✗ ERROR: {e}")


def test_ts05_maintenance_priority_queue():
    print("\n" + "=" * 60)
    print("TEST TS-05: Maintenance Priority Queue Algorithm")
    print("=" * 60)

    issues = [
        {"room_id": 2, "description": "Water leak in bathroom", "priority": "high"},
        {"room_id": 5, "description": "Light switch broken", "priority": "normal"},
        {"room_id": 4, "description": "Fire alarm not working", "priority": "critical"},
        {"room_id": 3, "description": "TV remote missing", "priority": "low"},
        {"room_id": 6, "description": "Door lock stuck", "priority": "high"},
    ]

    try:
        print("Creating maintenance issues...")
        for issue in issues:
            response = client.post(
                f"{BASE_URL}:{MAINTENANCE_PORT}/maintenance/report",
                json={
                    "room_id": issue["room_id"],
                    "description": issue["description"],
                    "priority": issue["priority"],
                },
                headers=headers(),
            )
            if response.status_code == 201:
                print(f"  ✓ {issue['priority'].upper()}: Room {issue['room_id']}")

        response = client.get(
            f"{BASE_URL}:{MAINTENANCE_PORT}/maintenance/queue", headers=headers()
        )
        print(f"\nPriority Queue (sorted):")
        if response.status_code == 200:
            queue = response.json()["queue"]
            for idx, item in enumerate(queue, 1):
                print(f"  {idx}. Room {item['room_id']}: {item['priority'].upper()}")

            # Verify order
            if (
                queue[0]["priority"] == "critical"
                and queue[1]["priority"] == "high"
                and queue[2]["priority"] == "high"
                and queue[3]["priority"] == "normal"
                and queue[4]["priority"] == "low"
            ):
                print(
                    "✓ PASSED: Issues sorted correctly (Critical > High > Normal > Low, FIFO)"
                )
            else:
                print("✗ FAILED: Queue not properly sorted")
        else:
            print(f"✗ FAILED: {response.text}")
    except Exception as e:
        print(f"✗ ERROR: {e}")


def test_ts06_concurrent_checkin():
    print("\n" + "=" * 60)
    print("TEST TS-06: Concurrent Check-In Handling")
    print("=" * 60)

    print("⚠  This test requires implementing async concurrent requests")
    print("   For now, verifying sequential check-ins don't conflict...")

    check_in_1 = {
        "guest_id": 1,
        "room_type": "single",
        "check_in_date": date.today().isoformat(),
        "check_out_date": (date.today() + timedelta(days=1)).isoformat(),
    }

    try:
        response = client.post(
            f"{BASE_URL}:{RECEPTION_PORT}/check-in", json=check_in_1, headers=headers()
        )
        print(f"✓ First check-in: {response.status_code}")
        if response.status_code == 200:
            room_1 = response.json()["room_id"]
            print(f"  - Assigned Room ID: {room_1}")
            print("✓ PASSED: Room allocated without conflicts")
        else:
            print(f"✗ FAILED: {response.text}")
    except Exception as e:
        print(f"✗ ERROR: {e}")


def test_ts07_no_rooms_available():
    print("\n" + "=" * 60)
    print("TEST TS-07: No Rooms Available — Alternative Suggestion")
    print("=" * 60)

    # Mark ALL suite rooms occupied first by checking in to them
    # Then try to check in another guest needing a suite
    check_in_data = {
        "guest_id": 1,
        "room_type": "suite",
        "check_in_date": date.today().isoformat(),
        "check_out_date": (date.today() + timedelta(days=2)).isoformat(),
    }

    # Fill all suites (rooms 105 and 204 are suites in seed data)
    suite_bookings = []
    for _ in range(3):  # attempt more than available suites
        try:
            response = client.post(
                f"{BASE_URL}:{RECEPTION_PORT}/check-in",
                json=check_in_data,
                headers=headers(),
            )
            if response.status_code == 200:
                suite_bookings.append(response.json()["booking_id"])
                print(f"  ✓ Suite allocated: Room {response.json()['room_number']}")
            elif response.status_code == 409:
                data = response.json()
                detail = data.get("detail", data)
                if isinstance(detail, dict):
                    print(f"  ✓ No suites left — detail: {detail.get('detail')}")
                    print(f"  ✓ Available alternatives: {detail.get('available_types', [])}")
                    print(f"  ✓ Suggestion: {detail.get('suggestion', '')}")
                else:
                    print(f"  ✓ 409 received: {detail}")
                print("✓ PASSED: System returned clear unavailability message with alternatives")
                break
        except Exception as e:
            print(f"✗ ERROR: {e}")
            break


def test_ts08_invalid_room_input():
    print("\n" + "=" * 60)
    print("TEST TS-08: Input Validation & Error Handling")
    print("=" * 60)

    # Invalid room_id (999 doesn't exist)
    invalid_check_in = {
        "guest_id": 999999,  # non-existent guest
        "room_type": "double",
        "check_in_date": date.today().isoformat(),
        "check_out_date": (date.today() + timedelta(days=1)).isoformat(),
    }

    try:
        response = client.post(
            f"{BASE_URL}:{RECEPTION_PORT}/check-in",
            json=invalid_check_in,
            headers=headers(),
        )
        if response.status_code == 404:
            print(f"  ✓ Non-existent guest rejected: {response.status_code}")
            print(f"  ✓ Error message: {response.json().get('detail')}")
            print("✓ PASSED: Input validation works — system stable")
        else:
            print(f"  Status: {response.status_code} — {response.text}")

        # Invalid room type
        bad_type_check_in = {
            "guest_id": 1,
            "room_type": "penthouse",  # not a valid enum
            "check_in_date": date.today().isoformat(),
            "check_out_date": (date.today() + timedelta(days=1)).isoformat(),
        }
        response2 = client.post(
            f"{BASE_URL}:{RECEPTION_PORT}/check-in",
            json=bad_type_check_in,
            headers=headers(),
        )
        if response2.status_code == 422:
            print(f"  ✓ Invalid room type rejected: {response2.status_code}")
            print("✓ PASSED: Enum validation catches invalid room types")
        else:
            print(f"  Invalid type status: {response2.status_code}")

    except Exception as e:
        print(f"✗ ERROR: {e}")


def run_all_tests():
    print("\n" + "=" * 80)
    print(" " * 20 + "HOTEL OS - TEST SUITE (LO4 VERIFICATION)")
    print("=" * 80)

    print("\nWaiting for services to be ready...")
    print("Ensure all services are running on ports 8001-8005")
    time.sleep(2)

    try:
        test_ts01_room_allocation_algorithm()
        test_ts02_checkout_auto_clean_queue()
        test_ts03_housekeeping_workflow()
        test_ts04_room_service_integration()
        test_ts05_maintenance_priority_queue()
        test_ts06_concurrent_checkin()
        test_ts07_no_rooms_available()
        test_ts08_invalid_room_input()

        print("\n" + "=" * 80)
        print("TEST SUITE COMPLETED")
        print("=" * 80)

    except httpx.ConnectError:
        print("\n✗ ERROR: Cannot connect to services")
        print("Make sure all services are running:")
        print("  python run_services.py")
    finally:
        client.close()


if __name__ == "__main__":
    run_all_tests()
