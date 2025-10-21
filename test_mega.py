import subprocess
import os
from dotenv import load_dotenv
import sys

# Carga las variables de entorno desde .env
load_dotenv()
email = os.getenv("MEGA_EMAIL")
password = os.getenv("MEGA_PASSWORD")

# Verifica credenciales
if not email or not password:
    print("❌ Error: No se encontraron credenciales en .env")
    print("Asegúrate de que MEGA_EMAIL y MEGA_PASSWORD estén definidos en el archivo .env")
    sys.exit(1)

print(f"Email: {email}")
print(f"Password: {'*' * len(password)}")
print("Intentando interactuar con megacmd...")

# Función para ejecutar comandos de mega-cmd vía snap
def run_mega_cmd(command, args=None):
    try:
        cmd = ['snap', 'run', f'mega-cmd.{command}']
        if args:
            cmd.extend(args)
        process = subprocess.Popen(cmd, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True)
        stdout, stderr = process.communicate()
        return stdout, stderr, process.returncode
    except FileNotFoundError:
        return None, "Comando snap no encontrado. Verifica que snapd esté instalado.", 1
    except Exception as e:
        return None, f"Error ejecutando comando: {e}", 1

try:
    # Verifica si mega-cmd está disponible
    stdout, stderr, rc = run_mega_cmd("mega-version")
    if rc != 0:
        print(f"❌ Error: No se pudo ejecutar mega-cmd: {stderr}")
        print("Prueba manualmente: snap run mega-cmd.mega-version")
        sys.exit(1)

    print(f"✅ mega-cmd detectado! Versión: {stdout.strip()}")

    # Verifica si ya hay una sesión activa
    stdout, stderr, rc = run_mega_cmd("mega-whoami")
    if rc == 0 and email in stdout:
        print(f"✅ Sesión ya activa para {email}")
    else:
        # Cierra cualquier sesión existente
        stdout, stderr, rc_logout = run_mega_cmd("mega-logout")
        if rc_logout == 0 or "Not logged in" in stderr:
            print("Sesión anterior cerrada o no existía.")
        else:
            print(f"❌ Error al cerrar sesión: {stderr}")
            sys.exit(1)

        # Intenta login
        stdout, stderr, rc = run_mega_cmd("mega-login", args=[email, password])
        if rc == 0:
            print("✅ Login exitoso!")
        else:
            print(f"❌ Error en login: {stderr}")
            print("\n🔍 Diagnóstico:")
            print("1. Verifica que las credenciales en .env sean correctas.")
            print("2. Intenta login manual: snap run mega-cmd.mega-login robertoavilagarcia@gmail.com tu_contraseña")
            print("3. Si usas 2FA, desactívalo temporalmente o usa --auth-code=XXXXXX.")
            print("4. Verifica permisos: snap connect mega-cmd:removable-media")
            sys.exit(1)

    # Lista archivos
    stdout, stderr, rc_ls = run_mega_cmd("mega-ls")
    if rc_ls == 0:
        print("Archivos en MEGA:")
        print(stdout or "No hay archivos en la cuenta.")
        lines = stdout.splitlines() if stdout else []
        print(f"Total de líneas (archivos + carpetas): {len(lines)}")
    else:
        print(f"❌ Error listando archivos: {stderr}")

except Exception as e:
    print(f"❌ Error general: {e}")
    print("\n🔍 Diagnóstico:")
    print("1. Verifica que snapd esté instalado: sudo systemctl status snapd")
    print("2. Prueba manual: snap run mega-cmd.mega-version")
    print("3. Reinstala mega-cmd: sudo snap remove mega-cmd && sudo snap install mega-cmd")
    sys.exit(1)