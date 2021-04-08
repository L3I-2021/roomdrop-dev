import requests, json, os

HOST_CREDS_PATH = '/tmp/host.credentials.json'
GUEST_CREDS_PATH = '/tmp/host.credentials.json'

# Environment
DEBUG = True
# Local server url
LOCAL = 'http://localhost:5000'
# Deployed server url
REMOTE = 'https://pacific-wave-46729.herokuapp.com'

# Url used for requests
API_URL = LOCAL if DEBUG is True else REMOTE


class HostClient:
    def __init__(self):
        with open(HOST_CREDS_PATH, 'r') as credentials_file:
            self.credentials = json.loads(credentials_file.read())

    def upload(self, path_to_file):
        if 'Trash' in path_to_file:
            return

        abspath = os.path.join(self.credentials['meeting']['mountpoint'],
                               path_to_file[1:])
        print(abspath)

        # for i in range(20):
        #     print('uploading ' + path_to_file)
        meetung_uid = self.credentials['meeting'][
            'uid']  # Meeting uid from credentials
        author_uid = self.credentials['meeting']['host_uid']  # Meeting
        endpoint = f'/meetings/{meetung_uid}/files/upload?author_uid={author_uid}'
        files = {'file': open(abspath, 'rb')}

        res = requests.post(API_URL + endpoint, files=files)
        print(res.text)
        # error = json.loads(res.text).get('error')

        # return True if error is None else False
