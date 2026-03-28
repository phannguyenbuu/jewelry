import paramiko
import os

HOST = '31.97.76.62'
USER = 'root'
PASS = '@baoLong0511'
LOCAL_DIR = 'd:/Dropbox/_Documents/_Vlance_2026/jewelry/frontend/dist'
REMOTE_DIR = '/var/www/jewelry/dist'

def create_remote_dir(sftp, remote_directory):
    if remote_directory == '/':
        return
    if remote_directory == '':
        return
    try:
        sftp.chdir(remote_directory)
    except IOError:
        dirname, basename = os.path.split(remote_directory.rstrip('/'))
        create_remote_dir(sftp, dirname)
        sftp.mkdir(remote_directory)
        sftp.chdir(remote_directory)

def put_dir(sftp, local_dir, remote_dir):
    for root, dirs, files in os.walk(local_dir):
        # determine relative path
        rel_path = os.path.relpath(root, local_dir)
        rel_path = rel_path.replace("\\", "/") # Windows replacement
        if rel_path == '.':
            target_dir = remote_dir
        else:
            target_dir = f"{remote_dir}/{rel_path}"
        
        try:
            sftp.chdir(target_dir)
        except IOError:
            create_remote_dir(sftp, target_dir)
        
        for file in files:
            local_file = os.path.join(root, file)
            remote_file = f"{target_dir}/{file}"
            print(f"Uploading {local_file} -> {remote_file}")
            sftp.put(local_file, remote_file)

def main():
    print('Connecting to VPS...')
    ssh = paramiko.SSHClient()
    ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    ssh.connect(HOST, username=USER, password=PASS)
    
    print('Opening SFTP session...')
    sftp = ssh.open_sftp()
    
    print(f'Uploading {LOCAL_DIR} to {REMOTE_DIR}...')
    put_dir(sftp, LOCAL_DIR, REMOTE_DIR)
    
    sftp.close()
    ssh.close()
    print('Upload complete.')

if __name__ == '__main__':
    main()
