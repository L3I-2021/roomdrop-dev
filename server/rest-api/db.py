from tinydb import TinyDB, Query
from rd_utils import get_uid

# Database URI
DB_URI = 'database.json'

db = TinyDB(DB_URI)

# Meeting query object
Meeting = Query()


def create_meeting(author):
    """ Create a new meeting with the given author name """

    uid = get_uid()
    secret_key = get_uid()

    meeting = {
        'host': author,
        'id': uid,
        'secret_key': secret_key,
        'guests': [],
    }

    # Insert into databse
    db.insert(meeting)

    return meeting


def delete_meeting(meeting_id):
    """ Deletes a meeting with corresponding id. Needs more security ! """

    db.remove(Meeting.id == meeting_id)


def get_meeting_by_id(meeting_id):
    """ Get a meeting by his id """

    results = db.search(Meeting.id == meeting_id)

    # If no corresponding meeting then return None
    if not results:
        return None
    else:
        return results[0]


def add_guest_to_meeting(meeting, guest):
    """ Add a guest to a meetings guest list """

    # Update database
    db.update({
        # Concatenate lists
        'guests': meeting['guests'] + [guest]
    },
        Meeting.id == meeting['id'])


def delete_guest_from_meeting(meeting, guest):
    """ Removes a guest from a meeting's guest list """

    # New array without guest
    remaining_guests = [g for g in meeting['guests'] if g != guest]

    # Update database
    db.update({
        'guests': remaining_guests
    }, Meeting.id == meeting['id'])


#allo