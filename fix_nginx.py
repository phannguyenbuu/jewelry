import paramiko

HOST = '31.97.76.62'
USER = 'root'
PASS = '@baoLong0511'

def main():
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
