import os
import hashlib
from Crypto.Protocol.KDF import scrypt
from Cryptodome.Cipher import AES
from Cryptodome.Random import get_random_bytes

# The size in bytes that we read, encrypt and write to at once
BUFFER_SIZE = 1024 * 1024  # ~ 1 Mb


# We're gonna HASH the password that is composed of a unique meeting ID concatenated with a random password
# returned signature will be our pre-shared password for the AES-GCM crypto
def encrypt_sha256(ID, meeting_pw):
    # Empty SHA signature

    # We concatenate the ID with the meeting_pw into a string
    hash_string = str(ID) + meeting_pw

    # We convert the string into bytes for it to be acceptable by hash function
    sha_signature = hashlib.sha256(hash_string.encode())

    # Returns the encoded data in hexadecimal format
    sha_signature = sha_signature.hexdigest()

    return sha_signature


def encrypt_AES(input_filename, password):
    output_filename = input_filename + '.encrypted'  # The crypted filename

    # Open files
    file_in = open(input_filename,
                   'rb')  # rb = read bytes. Required to read non-text files
    file_out = open(
        output_filename,
        'wb')  # wb = write bytes. Required to write the encrypted data

    # generate a random salt
    salt = get_random_bytes(32)

    # use the Scrypt KDF to get a private key from the password
    key = scrypt(password, salt, key_len=32, N=2**17, r=8,
                 p=1)  # Generate a key using the password and salt

    # Write the salt to the top of the output file
    file_out.write(salt)

    # create cipher config
    cipher = AES.new(key, AES.MODE_GCM)

    # Write out the nonce to the output file under the salt
    file_out.write(cipher.nonce)

    # Read, encrypt and write the data
    data = file_in.read(BUFFER_SIZE)  # Read in some of the file
    while len(data) != 0:  # Check if we need to encrypt anymore data
        encrypted_data = cipher.encrypt(data)  # Encrypt the data we read
        file_out.write(
            encrypted_data)  # Write the encrypted data to the output file
        data = file_in.read(
            BUFFER_SIZE
        )  # Read some more of the file to see if there is any more left

    # Get and write the tag for decryption verification
    tag = cipher.digest(
    )  # Signal to the cipher that we are done and get the tag
    file_out.write(tag)

    # Close both files
    file_in.close()
    file_out.close()

    return output_filename


# Base code coming from : https://nitratine.net/blog/post/python-gcm-encryption-tutorial/ then modified to be implemented to the project


def _encrypt_AES(filename, password):
    input_filename = filename  # File we want to crypt
    output_filename = input_filename + '.encrypted'  # The crypted filename

    # Open files
    file_in = open(input_filename,
                   'rb')  # rb = read bytes. Required to read non-text files
    file_out = open(
        output_filename,
        'wb')  # wb = write bytes. Required to write the encrypted data

    # generate a random salt
    salt = get_random_bytes(32)

    # use the Scrypt KDF to get a private key from the password
    key = scrypt(password, salt, key_len=32, N=2**17, r=8,
                 p=1)  # Generate a key using the password and salt

    # Write the salt to the top of the output file
    file_out.write(salt)

    # create cipher config
    cipher = AES.new(key, AES.MODE_GCM)

    # Write out the nonce to the output file under the salt
    file_out.write(cipher.nonce)

    # Read, encrypt and write the data
    data = file_in.read(BUFFER_SIZE)  # Read in some of the file
    while len(data) != 0:  # Check if we need to encrypt anymore data
        encrypted_data = cipher.encrypt(data)  # Encrypt the data we read
        file_out.write(
            encrypted_data)  # Write the encrypted data to the output file
        data = file_in.read(
            BUFFER_SIZE
        )  # Read some more of the file to see if there is any more left

    # Get and write the tag for decryption verification
    tag = cipher.digest(
    )  # Signal to the cipher that we are done and get the tag
    file_out.write(tag)

    # Close both files
    file_in.close()
    file_out.close()

    return output_filename


def decrypt_AES(input_filename, password):
    # The decrypted file
    # output_filename = os.path.splitext(filename)[0]
    output_filename = input_filename.replace('.encrypted', '')

    # Open files
    file_in = open(input_filename, 'rb')
    file_out = open(output_filename, 'wb')

    # Read salt and generate key
    salt = file_in.read(32)  # The salt we generated was 32 bits long

    key = scrypt(password, salt, key_len=32, N=2**17, r=8,
                 p=1)  # Generate a key using the password and salt again

    # Read nonce and create cipher
    nonce = file_in.read(16)  # The nonce is 16 bytes long
    cipher = AES.new(key, AES.MODE_GCM, nonce=nonce)

    # Identify how many bytes of encrypted there is
    # We know that the salt (32) + the nonce (16) + the data (?) + the tag (16) is in the file
    # So some basic algebra can tell us how much data we need to read to decrypt
    file_in_size = os.path.getsize(input_filename)
    encrypted_data_size = file_in_size - 32 - 16 - 16  # Total - salt - nonce - tag = encrypted data

    # Read, decrypt and write the data
    for _ in range(
            int(encrypted_data_size / BUFFER_SIZE)
    ):  # Identify how many loops of full buffer reads we need to do
        data = file_in.read(
            BUFFER_SIZE)  # Read in some data from the encrypted file
        decrypted_data = cipher.decrypt(data)  # Decrypt the data
        file_out.write(
            decrypted_data)  # Write the decrypted data to the output file

    data = file_in.read(
        int(encrypted_data_size % BUFFER_SIZE
            ))  # Read whatever we have calculated to be left of encrypted data

    decrypted_data = cipher.decrypt(data)  # Decrypt the data
    file_out.write(
        decrypted_data)  # Write the decrypted data to the output file

    # Verify encrypted file was not tampered with
    tag = file_in.read(16)

    try:
        cipher.verify(tag)
    except ValueError as e:
        # If we get a ValueError, there was an error when decrypting so we delete the file we created
        file_in.close()
        file_out.close()
        os.remove(output_filename)
        raise e

    # If everything is okay, we close the files

    file_in.close()
    file_out.close()

    #delete the encrypted file so the reciever only keeps the decrypted file on his file system


# os.remove(input_filename)
