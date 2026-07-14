import urllib.request
import urllib.parse
import json
import time

url = "https://lluhjkslpvudqueqtvhg.supabase.co"
service_key = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImxsdWhqa3NscHZ1ZHF1ZXF0dmhnIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc0NzgzMDUwMiwiZXhwIjoyMDYzNDA2NTAyfQ.MMZMrA9NqvBkmHQPDFSWoVeJiBPR6bugnD4yvTOv6ck"
anon_key = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImxsdWhqa3NscHZ1ZHF1ZXF0dmhnIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NDc4MzA1MDIsImV4cCI6MjA2MzQwNjUwMn0.3ytZAbh1zaxJXuBhzJQ5bjBOtTCad6tFpvAhwUhJAys"

def main():
    timestamp = int(time.time())
    email = f"test_temp_user_{timestamp}@example.com"
    password = f"TempPass123!_{timestamp}"
    user_id = None

    try:
        # 1. Create temporary user via Admin endpoint
        print("Creating temporary user...")
        create_user_url = f"{url}/auth/v1/admin/users"
        user_payload = {
            "email": email,
            "password": password,
            "email_confirm": True
        }
        
        req = urllib.request.Request(
            create_user_url,
            data=json.dumps(user_payload).encode('utf-8'),
            headers={
                "apikey": service_key,
                "Authorization": f"Bearer {service_key}",
                "Content-Type": "application/json"
            },
            method="POST"
        )
        
        with urllib.request.urlopen(req) as response:
            user_data = json.loads(response.read().decode('utf-8'))
            user_id = user_data.get("id")
            print("Temporary user created:", user_id)

        # 2. Update admin profile in perfiles table using PATCH
        print("Updating admin profile in perfiles to set rol='admin'...")
        profile_url = f"{url}/rest/v1/perfiles?id=eq.{user_id}"
        profile_payload = {
            "rol": "admin",
            "nombre_completo": "Test Admin Temp",
            "puesto": "Sistemas"
        }
        req_profile = urllib.request.Request(
            profile_url,
            data=json.dumps(profile_payload).encode('utf-8'),
            headers={
                "apikey": service_key,
                "Authorization": f"Bearer {service_key}",
                "Content-Type": "application/json"
            },
            method="PATCH"
        )
        with urllib.request.urlopen(req_profile) as response:
            print("Profile updated in DB.")

        # 3. Sign in to get JWT
        print("Signing in...")
        signin_url = f"{url}/auth/v1/token?grant_type=password"
        signin_payload = {
            "email": email,
            "password": password
        }
        
        req_signin = urllib.request.Request(
            signin_url,
            data=json.dumps(signin_payload).encode('utf-8'),
            headers={
                "apikey": anon_key,
                "Content-Type": "application/json"
            },
            method="POST"
        )
        
        with urllib.request.urlopen(req_signin) as response:
            session_data = json.loads(response.read().decode('utf-8'))
            user_jwt = session_data.get("access_token")
            print("Sign in success, JWT obtained.")

        # 4. Call crear_pagos_encomiendas_batch RPC with different values
        print("Calling crear_pagos_encomiendas_batch...")
        rpc_url = f"{url}/rest/v1/rpc/crear_pagos_encomiendas_batch"
        test_description = f"TEST RPC BATCH INSERT {timestamp}"
        
        rpc_payload = {
            "p_pagos": [
                {
                    "fecha_gasto": f"2026-07-14T12:00:00Z",
                    "descripcion_general": test_description,
                    "monto_total": 999.0,
                    "transporte_id": 22,
                    "tipo_gasto_id": 22,
                    "origen_gasto": "rendicion", # Changed from cuenta_corriente_empresa
                    "formato_id": 2 # Changed from 1
                }
            ]
        }
        
        req_rpc = urllib.request.Request(
            rpc_url,
            data=json.dumps(rpc_payload).encode('utf-8'),
            headers={
                "apikey": anon_key,
                "Authorization": f"Bearer {user_jwt}",
                "Content-Type": "application/json"
            },
            method="POST"
        )
        
        with urllib.request.urlopen(req_rpc) as response:
            print("RPC Call Success. Response:", response.read().decode('utf-8'))

        # 5. Query inserted row
        print("Querying inserted row...")
        encoded_desc = urllib.parse.quote(test_description)
        query_url = f"{url}/rest/v1/gastos?descripcion_general=eq.{encoded_desc}&select=id,tipo_gasto_id,formato_id,origen_gasto"
        
        req_query = urllib.request.Request(
            query_url,
            headers={
                "apikey": service_key,
                "Authorization": f"Bearer {service_key}"
            }
        )
        
        inserted_id = None
        with urllib.request.urlopen(req_query) as response:
            res_data = json.loads(response.read().decode('utf-8'))
            print("Inserted row fields in DB:", json.dumps(res_data, indent=2))
            if res_data and len(res_data) > 0:
                inserted_id = res_data[0].get("id")

        # Cleanup inserted row
        if inserted_id:
            print("Cleaning up inserted row...")
            delete_url = f"{url}/rest/v1/gastos?id=eq.{inserted_id}"
            req_delete = urllib.request.Request(
                delete_url,
                headers={
                    "apikey": service_key,
                    "Authorization": f"Bearer {service_key}"
                },
                method="DELETE"
            )
            with urllib.request.urlopen(req_delete) as response:
                print("Deleted row success.")

    except Exception as e:
        print("Error occurred:", e)
        if hasattr(e, "read"):
            print("Error details:", e.read().decode('utf-8'))
    finally:
        # Cleanup user
        if user_id:
            print("Deleting temporary user...")
            delete_user_url = f"{url}/auth/v1/admin/users/{user_id}"
            req_del_user = urllib.request.Request(
                delete_user_url,
                headers={
                    "apikey": service_key,
                    "Authorization": f"Bearer {service_key}"
                },
                method="DELETE"
            )
            try:
                with urllib.request.urlopen(req_del_user) as response:
                    print("Temporary user deleted successfully.")
            except Exception as ex:
                print("Failed to delete temporary user:", ex)

if __name__ == "__main__":
    main()
