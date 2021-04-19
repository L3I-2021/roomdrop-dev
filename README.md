# roomdrop-dev

### Installation

```
# Install the app
sudo apt install ./roomdrop-client_1.0.0_amd64.deb

# Install dependencies
sudo apt-get install libfuse-dev python3-dev pycryptodome pycryptodomex

# Prepare FUSE mountpoint
mkdir ~/Roomdrop
sudo cp -r /usr/lib/roomdrop-client/resources/app/fuse ~/Roomdrop
cd ~/Roomdrop/fuse
sudo python3 setup.py build
```
