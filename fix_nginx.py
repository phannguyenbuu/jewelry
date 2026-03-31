import os
import paramiko

HOST = os.environ.get('JEWELRY_VPS_HOST')
USER = os.environ.get('JEWELRY_VPS_USER')
PASS = os.environ.get('JEWELRY_VPS_PASS')


def require_vps_env():
    missing = [
        name
        for name, value in (
            ('JEWELRY_VPS_HOST', HOST),
            ('JEWELRY_VPS_USER', USER),
            ('JEWELRY_VPS_PASS', PASS),
        )
        if not value
    ]
    if missing:
        names = ', '.join(missing)
        raise RuntimeError(f'Missing VPS environment variables: {names}')

def main():
    require_vps_env()
    ssh = paramiko.SSHClient()
    ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    ssh.connect(HOST, username=USER, password=PASS)
    
    # Check nginx config for jewelry
    stdin, stdout, stderr = ssh.exec_command('cat /etc/nginx/sites-available/jewelry*')
    print("Nginx configs:\n", stdout.read().decode())
    
    # Check directory
    stdin, stdout, stderr = ssh.exec_command('ls -la /var/www/jewelry/frontend/dist')
    print("Dist directory:\n", stdout.read().decode())
    
    # Reload nginx
    ssh.exec_command('systemctl restart nginx')
    
    ssh.close()

if __name__ == '__main__':
    main()
