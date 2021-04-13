import requests, json, os

HOST_CREDS_PATH = '/tmp/host.credentials.json'
GUEST_CREDS_PATH = '/tmp/guest.credentials.json'

# Environment
DEBUG = True
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

    def upload(self, path_to_file):
        pass

    def download(self, path_to_file):
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

        print(os.stat(abspath).st_size)

        meeting_uid = self.credentials['meeting'][
            'uid']  # Meeting uid from credentials
        params = {'author_uid': self.credentials['meeting']['host_uid']}
        endpoint = f'/meetings/{meeting_uid}/files/upload'

        # Attached file
        files = {'file': open(abspath, 'rb')}

        # Make a request with attached file
        res = requests.post(API_URL + endpoint, files=files, params=params)

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

        print(os.stat(abspath).st_size)

        meeting_uid = self.credentials['meeting'][
            'uid']  # Meeting uid from credentials
        params = {'author_uid': self.credentials['guest']['uid']}
        endpoint = f'/meetings/{meeting_uid}/files/upload'

        # Attached file
        files = {'file': open(abspath, 'rb')}

        # Make a request with attached file
        res = requests.post(API_URL + endpoint, files=files, params=params)

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
