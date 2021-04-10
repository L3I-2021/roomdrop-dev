from flask import Flask, request, jsonify, send_from_directory
from flask_cors import CORS
from flask_socketio import SocketIO, emit, send, join_room, leave_room
from flask_sqlalchemy import SQLAlchemy
import os
from shutil import rmtree
from werkzeug.utils import secure_filename
from datetime import datetime
from uuid import uuid4

app = Flask(__name__)

# CORS
CORS(app)

# SocketIO
app.config['SECRET_KEY'] = 'roomdrop'
sio = SocketIO(app, cors_allowed_origins="*")

# Upload folder
app.config['UPLOADS'] = os.path.join(os.curdir, 'uploads')

if not os.path.exists(app.config['UPLOADS']):
    os.mkdir(app.config['UPLOADS'])

# Database config
DB_FILENAME = 'db.sqlite3'
app.config['SQLALCHEMY_DATABASE_URI'] = f'sqlite:///{DB_FILENAME}'
db = SQLAlchemy(app)


# Utility functions
def gen_uid():
    return str(uuid4())[:4]


# Database models
class Meeting(db.Model):
    uid = db.Column(db.String, default=gen_uid, primary_key=True)
    title = db.Column(db.String, nullable=False)

    host_fullname = db.Column(db.String, nullable=False)
    host_uid = db.Column(db.String, default=gen_uid, nullable=False)
    password = db.Column(db.String, default=gen_uid, nullable=False)
    secret_key = db.Column(db.String, default=gen_uid, nullable=False)

    guests = db.relationship('Guest',
                             backref='active_meeting',
                             cascade='all, delete-orphan',
                             lazy=True)

    files = db.relationship('File',
                            backref='meeting',
                            cascade='all, delete-orphan',
                            lazy=True)

    created_at = db.Column(db.DateTime, default=datetime.now)

    def as_json(self):
        return {
            'uid': self.uid,
            'title': self.title,
            'host_uid': self.host_uid,
            'host_fullname': self.host_fullname,
            'password': self.password,
            'secret_key': self.secret_key,
            'guests': [g.as_json() for g in self.guests],
            'files': [f.as_json() for f in self.files],
            'created_at': self.created_at
        }

    def __repr__(self):
        return f'Meeting({self.uid}, {self.host_uid}, {self.host_fullname}, {self.password}, {self.secret_key}, {len(self.guests)}, {len(self.files)}, {self.created_at})'


class Guest(db.Model):
    uid = db.Column(db.String, default=gen_uid, primary_key=True)
    meeting_uid = db.Column(db.String,
                            db.ForeignKey('meeting.uid'),
                            nullable=False)
    fullname = db.Column(db.String, nullable=False)

    def as_json(self):

        return {
            'uid': self.uid,
            'meeting_uid': self.meeting_uid,
            'fullname': self.fullname
        }

    def __repr__(self):
        return f'Guest({self.id}, {self.uid}, {self.user_id}, {self.meeting_id})'


class File(db.Model):
    uid = db.Column(db.String, default=gen_uid, primary_key=True)
    meeting_uid = db.Column(db.Integer,
                            db.ForeignKey('meeting.uid'),
                            nullable=False)
    author_uid = db.Column(db.Integer,
                           db.ForeignKey('guest.uid'),
                           nullable=False)
    filename = db.Column(db.String, nullable=False)
    local_path = db.Column(db.String, nullable=False)
    save_path = db.Column(db.String, nullable=False)

    def as_json(self):
        return {
            'uid': self.uid,
            'author_uid': self.author_uid,
            'meeting_uid': self.meeting_uid,
            'filename': self.filename,
            'local_path': self.local_path,
            'save_path': self.save_path
        }

    def __repr__(self):
        return f'File({self.uid}, {self.author_uid}, {self.meeting_uid}, {self.filename}, {self.local_path}, {self.save_path})'


# Events
@sio.on('join')
def on_join(data):
    # get guest fullname and meeting_uid from data
    meeting_uid = data.get('meeting_uid')
    guest_fullname = data.get('guest_fullname')

    # add session to corresponding meeting room
    join_room(meeting_uid)

    # If a guest joined the meeting
    if guest_fullname is not None:
        print(f'new guest {guest_fullname}')

        # get meeting guests
        meeting = Meeting.query.filter_by(uid=meeting_uid).first()

        # Guest's fullname
        guests = [guest.fullname for guest in meeting.guests]

        # notify with current guest list
        response = {'guest_fullname': guest_fullname, 'guests': guests}
        sio.emit('new join', response, room=meeting_uid)


@sio.on('leave')
def on_leave(data):
    # get guest fullname and meeting_uid from data
    meeting_uid = data.get('meeting_uid')
    guest_fullname = data.get('guest_fullname')

    # get meeting guests
    meeting = Meeting.query.filter_by(uid=meeting_uid).first()

    # Guest's fullname
    guests = [guest for guest in meeting.guests]

    # notify with current guest list
    response = {'guest_fullname': guest_fullname, 'guests': guests}
    sio.emit('leaved', response, room=meeting_uid)

    # remove session from meeting
    leave_room(meeting_uid)


@sio.on('end')
def on_end(data):
    # get guest fullname and meeting_uid from data
    meeting_uid = data.get('meeting_uid')

    # notify with current guest list
    sio.emit('ended', {}, room=meeting_uid)


# Routes
@app.route('/meetings')
def meeting_index():
    meetings = [meeting.as_json() for meeting in Meeting.query.all()]

    return jsonify(meetings=meetings, success="All meetings")


@app.route('/meetings/new', methods=['POST'])
def new_meeting():
    """ Create a new meeting
    with given host informations """

    # Get information from body
    fullname = request.json.get('fullname')
    title = request.json.get('title')

    # Error checking
    if fullname is None:
        return jsonify(error="Missing information: fullname")

    if title is None:
        return jsonify(error="Missing information: title")

    # Create meeting
    meeting = Meeting(host_fullname=fullname, title=title)

    db.session.add(meeting)
    db.session.commit()

    return jsonify(message="New meeting created successfully",
                   meeting=meeting.as_json())


@app.route('/meetings/join')
def join_meeting():
    """ Join a meeting
    with given uid and password
    
    Usage: /meetings/join?uid=UID&pwd=PASSWORD
    """

    # Get information from url arguments
    uid = request.args.get('uid')
    password = request.args.get('pwd')
    fullname = request.args.get('fullname')

    # Error checking
    if uid is None:
        return jsonify(error="Missing argument: uid")

    if password is None:
        return jsonify(error="Missing argument: password")

    if fullname is None:
        return jsonify(error="Missing argument: fullname")

    # Get correspondin meeting
    meeting = Meeting.query.filter_by(uid=uid).first()

    # If meeting not found
    if meeting is None:
        return jsonify(error="Meeting not found", uid=uid)

    # If invalid password
    if password != meeting.password:
        return jsonify(error="Invalid password", password=password)

    # If fullname already taken
    if Guest.query.filter_by(meeting_uid=meeting.uid,
                             fullname=fullname).first() is not None:
        return jsonify(error="Fullname already exists", fullname=fullname)

    # Otherwise, create a new guest
    else:
        guest = Guest(fullname=fullname, meeting_uid=meeting.uid)

        db.session.add(guest)
        db.session.commit()

        return jsonify(success="Meeting joined successfully",
                       guest=guest.as_json(),
                       meeting=meeting.as_json())


@app.route('/meetings/<uid>')
def get_meeting(uid):
    meeting = Meeting.query.filter_by(uid=uid).first()

    if meeting is None:
        return jsonify(error='Meeting not found', uid=uid)
    else:
        return jsonify(message="Meeting with given uid",
                       meeting=meeting.as_json())


@app.route('/meetings/<uid>/end', methods=['DELETE'])
def end_meeting(uid):
    # Get secret_key
    secret_key = request.args.get('secret_key')

    if secret_key is None:
        return jsonify(error="Missing argument: secret_key")

    # Find meeting
    meeting = Meeting.query.filter_by(uid=uid).first()

    if meeting is None:
        return jsonify(error="Meeting not found", uid=uid)

    if secret_key == meeting.secret_key:
        # Delete stored files
        meeting_folder = os.path.join(app.config['UPLOADS'], meeting.uid)

        if os.path.exists(meeting_folder):
            rmtree(meeting_folder)

        # Delete meeting from database
        db.session.delete(meeting)
        db.session.commit()

        return jsonify(success="Meeting ended successfully",
                       meeting=meeting.as_json())
    else:
        return jsonify(error="Unauthorized: invalid secret_key")


@app.route('/meetings/<uid>/guests')
def get_meeting_guests(uid):
    """ Get a meeting's guest list """

    # Get corresponding meeting
    meeting = Meeting.query.filter_by(uid=uid).first()

    # Check if meeting exists
    if meeting is None:
        return jsonify(error="Meeting not found", uid=uid)

    # Get guest list
    guests = [guest.as_json() for guest in meeting.guests]

    return jsonify(guests=guests,
                   success=f'Meeting with uid({meeting.uid}) guest list')


@app.route('/meetings/<uid>/guests/<guest_uid>')
def get_guest(uid, guest_uid):
    pass


@app.route('/meetings/<uid>/guests/<guest_uid>/files')
def get_guest_files(uid, guest_uid):
    pass


@app.route('/meetings/<uid>/guests/<guest_uid>/leave', methods=['DELETE'])
def leave_guest(uid, guest_uid):
    # Get corresponding guest
    guest = Guest.query.filter_by(uid=guest_uid).first()

    if guest is None:
        return jsonify(error="Unauthorized: guest not found")

    # Get corresponding meeting
    meeting = Meeting.query.filter_by(uid=uid).first()

    if meeting is None:
        return jsonify(error="Meeting not found", uid=uid)

    else:
        db.session.delete(guest)
        db.session.commit()

        return jsonify(success="Guest leaved successfully",
                       guest=guest.as_json())


@app.route('/meetings/<uid>/files')
def get_meeting_files(uid):
    pass


@app.route('/meetings/<uid>/files/upload', methods=['POST'])
def upload_file(uid):
    """ Upload a file to public folder """

    # Get information from args and form data
    author_uid = request.args.get('author_uid')
    reqFile = request.files.get('file')

    # Error checking
    if author_uid is None:
        return jsonify(error='Missing argument: author_uid')

    if reqFile is None:
        return jsonify(error="No file attached")

    # Get corresponding meeting
    meeting = Meeting.query.filter_by(uid=uid).first()

    if meeting is None:
        return jsonify(error='Meeting not found')

    # If author is the host
    if author_uid == meeting.host_uid:
        author_fullname = meeting.host_fullname
    else:
        # Get corresponding guest
        guest = Guest.query.filter_by(uid=author_uid).first()

        if guest is None:
            return jsonify(error='Unauthorized: guest not found',
                           author_uid=author_uid)
        else:
            author_fullname = guest.fullname

    # Check for no duplicate filenames from the same author
    existingFile = File.query.filter_by(filename=reqFile.filename,
                                        meeting_uid=meeting.uid,
                                        author_uid=author_uid).first()

    # If file doesnt exist
    if existingFile is None:
        # Create file
        file_uid = gen_uid()
        save_path = os.path.join(app.config['UPLOADS'], meeting.uid, file_uid)

        file = File(
            uid=file_uid,
            meeting_uid=meeting.uid,
            author_uid=author_uid,
            filename=secure_filename(reqFile.filename),
            local_path='/',  #TODO change this
            save_path=save_path)

        # Create meeting folder if doesn't exist
        meeting_folder = os.path.join(app.config['UPLOADS'], meeting.uid)

        if not os.path.exists(meeting_folder):
            os.mkdir(meeting_folder)

        db.session.add(file)
        db.session.commit()

    else:
        # Update existing file
        save_path = os.path.join(app.config['UPLOADS'], meeting.uid,
                                 existingFile.uid)

    # Upload file
    reqFile.save(save_path)

    # Notify the room
    sio.emit("new file", {
        'filename': reqFile.filename,
        'author_uid': author_uid,
        'author_fullname': author_fullname,
    },
             room=uid)

    returnFile = file if existingFile is None else existingFile

    return jsonify(message=f'File {reqFile.filename} uploaded successfully',
                   file=returnFile.as_json())


@app.route('/meetings/<uid>/files/download')
def download_file(uid):
    # return send_from_directory('.', filename='tux.png', as_attachment=True)
    """ Download a file """

    # ?filename=enonce.txt&author_uid=158d&password=9599

    # Get information from args and form data
    filename = request.args.get('filename')
    author_uid = request.args.get('author_uid')
    password = request.args.get('password')

    # Error checking
    if filename is None:
        return jsonify(error='Missing argument: filename')

    if author_uid is None:
        return jsonify(error="Missing argument: author_uid")

    # Get corresponding meeting
    meeting = Meeting.query.filter_by(uid=uid).first()

    if meeting is None:
        return jsonify(error='Meeting not found')

    # Check password
    if password != meeting.password:
        return jsonify(error='Unauthorized: invalid password')

    # Get corresponding file
    file = File.query.filter_by(meeting_uid=meeting.uid,
                                author_uid=author_uid,
                                filename=filename).first()

    # If file not found
    if file is None:
        return jsonify(error='File not found',
                       filename=filename,
                       author_uid=author_uid)

    else:
        folder = os.path.join(app.config['UPLOADS'], meeting.uid)
        return send_from_directory(folder, file.uid, as_attachment=True)


# Test route
@app.route("/meetings/<uid>/files/new")
def ping_meeting(uid):
    sio.emit("new file", {
        'filename': request.args.get('filename'),
        'author_uid': request.args.get('author_uid'),
        'author_fullname': request.args.get('author_fullname')
    },
             room=uid)

    return jsonify()


def test_db():
    pass


if __name__ == '__main__':
    # If database exists, remove it
    if os.path.exists(DB_FILENAME):
        os.remove(DB_FILENAME)

    # Create database and related tables
    db.create_all()

    # test function
    test_db()

    # app.run(threaded=True, port=5000)
    sio.run(app, port=5000)