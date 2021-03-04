from uuid import uuid4

# Unique identifier length
UID_SIZE = 4


def get_uid():
    """ Returns a UUID4 of `UID_SIZE` length """

    return str(uuid4())[:UID_SIZE]
