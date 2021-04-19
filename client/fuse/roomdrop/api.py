import requests, json, os
from aes import encrypt_sha256, encrypt_AES, decrypt_AES

HOST_CREDS_PATH = '/tmp/host.credentials.json'
GUEST_CREDS_PATH = '/tmp/guest.credentials.json'

# Environment
DEBUG = False
# Local server url
LOCAL = 'http://localhost:5000'
# Deployed server url
REMOTE = 'https://pacific-wave-46729.herokuapp.com'

# Url used for requests
API_URL = LOCAL if DEBUG is True else REMOTE


class Client:
    def __init__(self, creds_path):
        with open(creds_path, 'r') as credentials_file:
            self.credentials = json.loads(credentials_file.read())

            # Create a folder in /tmp to store encrypted files
            self.ENCRYPTED_PATH = os.path.join('/tmp', 'encrypted')
            if not os.path.exists(self.ENCRYPTED_PATH):
                os.mkdir(self.ENCRYPTED_PATH)

            # Generate SHA signature from meeting UID and password
            self.signature = encrypt_sha256(
                self.credentials['meeting']['uid'],
                self.credentials['meeting']['password'])

    def upload(self, path_to_file):
        pass

    def download(self, path_to_file):
        pass

    def delete(self, path_to_file):
        pass


class HostClient(Client):
    """ Host client that handles file uploads and downloads.
        It uploads every new file added in the public folder
        And downloads every file added in a guest folder
    """
    def __init__(self):
        Client.__init__(self, HOST_CREDS_PATH)

    def upload(self, path_to_file):
        # Ignore hidden files
        if '.Trash' in path_to_file or '.git' in path_to_file or '.goutputstream' in path_to_file:
            return

        # File absolute path located in the meeting save folder
        abspath = os.path.join(self.credentials['meeting']['mountpoint'],
                               path_to_file[1:])

        meeting_uid = self.credentials['meeting'][
            'uid']  # Meeting uid from credentials
        author_uid = self.credentials['meeting']['host_uid']
        filename = path_to_file.split('/')[-1]

        params = {'author_uid': author_uid}
        endpoint = f'/meetings/{meeting_uid}/files/upload'

        # Create encrypted file before upload
        encrypted_file_path = encrypt_AES(abspath, self.signature)

        # Attach encrypted file
        files = {'file': open(encrypted_file_path, 'rb')}

        # Make a request with attached file
        res = requests.post(API_URL + endpoint, files=files, params=params)

        # Delete the encrypted file that was created
        if os.path.exists(encrypted_file_path):
            os.remove(encrypted_file_path)

    def download(self, path_to_file):
        # Ignore hidden files
        if '.Trash' in path_to_file or '.git' in path_to_file or '.goutputstream' in path_to_file:
            return

        # Download file save path
        save_path = os.path.join(self.credentials['meeting']['mountpoint'],
                                 path_to_file[1:])

        # If file exists and is empty
        if os.path.exists(save_path) and os.stat(save_path).st_size == 0:
            meeting_uid = self.credentials['meeting']['uid']

            # Extract author and filename from path
            # Expected path format: /AUTHOR_FULLNAME/FILENAME
            _, author_fullname, filename = path_to_file.split('/')

            # Request params in order to get the corresponding file
            params = {
                'filename': filename,
                'author_fullname': author_fullname,
                'password': self.credentials['meeting']['password']
            }

            # API endpoint to download a file
            endpoint = f'/meetings/{meeting_uid}/files/download'

            # Request the file
            res = requests.get(API_URL + endpoint, params=params)

            # If there is not an error, save the downloaded file
            if 'error' not in res.text:
                with open(save_path, 'wb') as downloaded_file:
                    downloaded_file.write(res.content)

                # Decrypt downloaded file (ex: foo.txt.encrypted)
                encrypted_file_path = os.path.join(
                    self.credentials['meeting']['mountpoint'],
                    path_to_file[1:])
                decrypt_AES(encrypted_file_path, self.signature)

                # Delete encrypted file
                os.remove(encrypted_file_path)

    def delete(self, path_to_file):
        for i in range(10):
            print(f'deleting {path_to_file}')

        # Extract filename from path
        filename = path_to_file.split('/')[-1]

        # File save location
        save_path = os.path.join(self.credentials['meeting']['mountpoint'],
                                 path_to_file[1:])

        meeting_uid = self.credentials['meeting']['uid']

        # Prepare requests
        params = {
            'filename': filename,
            'secret_key': self.credentials['meeting']['secret_key']
        }

        endpoint = f'/meetings/{meeting_uid}/files/public/delete'

        # Send request to delete file
        res = requests.delete(API_URL + endpoint, params=params)

        if 'error' not in res.text and os.path.exists(save_path):
            # Delete file from system
            os.unlink(save_path)


class GuestClient(Client):
    """ Guest client that handles file uploads and downloads.
        It uploads every new file added in the guest folder
        And downloads every file added in the public folder
    """
    def __init__(self):
        Client.__init__(self, GUEST_CREDS_PATH)

    def upload(self, path_to_file):
        # Ignore hidden files
        if '.Trash' in path_to_file or '.git' in path_to_file or '.goutputstream' in path_to_file:
            return

        # File absolute path located in the meeting save folder
        abspath = os.path.join(self.credentials['meeting']['mountpoint'],
                               path_to_file[1:])

        meeting_uid = self.credentials['meeting'][
            'uid']  # Meeting uid from credentials
        author_uid = self.credentials['guest']['uid']
        params = {'author_uid': author_uid}
        endpoint = f'/meetings/{meeting_uid}/files/upload'

        # Create encrypted file before upload
        encrypted_file_path = encrypt_AES(abspath, self.signature)

        # Attached encrypted file
        files = {'file': open(encrypted_file_path, 'rb')}

        # Make a request with attached file
        res = requests.post(API_URL + endpoint, files=files, params=params)

        # Delete the encrypted file that was created
        if os.path.exists(encrypted_file_path):
            os.remove(encrypted_file_path)

    def download(self, path_to_file):
        # Ignore hidden files
        if '.Trash' in path_to_file or '.git' in path_to_file or '.goutputstream' in path_to_file:
            return

        # Download file save path
        save_path = os.path.join(self.credentials['meeting']['mountpoint'],
                                 path_to_file[1:])

        # If file exists and is empty
        if os.path.exists(save_path) and os.stat(save_path).st_size == 0:
            meeting_uid = self.credentials['meeting']['uid']

            # Extract author and filename from path
            # Expected path format: /AUTHOR_FULLNAME/FILENAME
            _, author_fullname, filename = path_to_file.split('/')

            # Request params in order to get the corresponding file
            params = {
                'filename': filename,
                'author_fullname':
                self.credentials['meeting']['host_fullname'],
                'password': self.credentials['meeting']['password']
            }

            # API endpoint to download a file
            endpoint = f'/meetings/{meeting_uid}/files/download'

            # Request the file
            res = requests.get(API_URL + endpoint, params=params)

            # If there is not an error, save the downloaded file
            if 'error' not in res.text:
                with open(save_path, 'wb') as downloaded_file:
                    downloaded_file.write(res.content)

                # Decrypt downloaded file (ex: foo.txt.encrypted)
                encrypted_file_path = os.path.join(
                    self.credentials['meeting']['mountpoint'],
                    path_to_file[1:])
                decrypt_AES(encrypted_file_path, self.signature)

                # Delete encrypted file
                os.remove(encrypted_file_path)

    def delete(self, path_to_file):
        # Extract filename from path
        filename = path_to_file.split('/')[-1]

        # File location
        save_path = os.path.join(self.credentials['meeting']['mountpoint'],
                                 path_to_file[1:])

        meeting_uid = self.credentials['meeting']['uid']
        guest_uid = self.credentials['guest']['uid']

        # Prepare request params
        params = {
            'filename': filename,
            'password': self.credentials['meeting']['password'],
            'author_uid': self.credentials['guest']['uid']
        }

        endpoint = f'/meetings/{meeting_uid}/files/guests/delete'

        # Send request to delete file
        res = requests.delete(API_URL + endpoint, params=params)

        for i in range(50):
            print(res.text)

        if 'error' not in res.text and os.path.exists(save_path):
            # Delete file from system
            os.unlink(save_path)