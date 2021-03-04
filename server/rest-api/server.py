from flask import Flask, request, jsonify
from tinydb import TinyDB, Query
import os
from rd_utils import get_uid
from db import *

app = Flask(__name__)

# Flask configuration file
config_file = os.path.join(os.curdir, 'roomdrop.cfg')


@app.route('/v0/meetings')
def v0_get_all_meetings():
    """ Returns all current meetings. For DEBUG purposes only"""

    all_meetings = db.all()

    return jsonify(message='All meetings', meetings=all_meetings)


@app.route('/v0/meetings/new')
def v0_new_meeting():
    """ Create a new meeting """

    # Get author from URL
    author = request.args.get('author', type=str, default='')

    # If author not provided
    if not author:
        return jsonify(
            error='Bad request',
            message='Missing parameters',
            details={'author': 'required'}
        )

    # Create the meeting
    new_meeting = create_meeting(author)

    # Return meeting information
    return jsonify(
        message='Meeting created successfully',
        meeting=new_meeting
    )


@app.route('/v0/meetings/join')
def v0_join_meeting():
    """ Joins a guest to a meeting """

    # Get meeting id and guest name from URL
    meeting_id = request.args.get('id', type=str, default='')
    guest = request.args.get('guest', type=str, default='')

    # If missing parameters
    if not meeting_id or not guest:
        return jsonify(
            error='Bad request',
            message='Missing parameters',
            details={'uid': 'required', 'guest': 'required'}
        )

    # Get corresponding meeting
    target_meeting = get_meeting_by_id(meeting_id)

    # If meeting not found
    if not target_meeting:
        return jsonify(
            error='Not found',
            message='Meeting not found'
        )

    # Add to guest list
    add_guest_to_meeting(target_meeting, guest)

    return jsonify(
        message='Meeting joined successfully'
    )


@app.route('/v0/meetings/<string:meeting_id>/leave')
def v0_leave_meeting(meeting_id):
    """ Makes a guest leave with the given name """

    # Get guest from URL
    guest = request.args.get('guest', type=str, default='')

    # If missing parameters
    if not meeting_id or not guest:
        return jsonify(
            error='Bad request',
            message='Missing parameters',
            details={'meeting_id': 'required', 'guest': 'required'}
        )

    # Get corresponding meeting
    target_meeting = get_meeting_by_id(meeting_id)

    # If meeting not found
    if not target_meeting:
        return jsonify(
            error='Not found',
            message='Meeting not found'
        )

    # Remove a guest from the meeting's guest list
    delete_guest_from_meeting(target_meeting, guest)

    return jsonify(
        message='Meeting leaved successfully'
    )


@app.route('/v0/meetings/<string:meeting_id>/end')
def v0_end_meeting(meeting_id):
    """ Ends a meeting if given secret_key is correct """

    # Get secret key from URL
    secret_key = request.args.get('secret_key', type=str, default='')

    # If missing parameters
    if not meeting_id or not secret_key:
        return jsonify(
            error='Bad request',
            message='Missing parameters',
            details={'meeting_id': 'required', 'secret_key': 'required'}
        )

    # Get corresponding meeting
    target_meeting = get_meeting_by_id(meeting_id)

    # If meeting not found
    if not target_meeting:
        return jsonify(
            error='Not found',
            message='Meeting not found'
        )

    # If secret ley is correct
    if secret_key == target_meeting['secret_key']:
        # Delete meeting from database
        delete_meeting(target_meeting['id'])

        return jsonify(
            message='Meeting ended successfully'
        )
    # If not then return an error
    else:
        return jsonify(
            error='Unauthorized',
            message='Wrong secret key'
        )
