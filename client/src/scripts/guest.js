const { ipcRenderer, shell } = require("electron");
const fs = require("fs");
const path = require("path");
const { execSync } = require("child_process");

// ==============================================================
//
// Credentials
//
// ==============================================================

// Get meeting credentials
const credPath = "/tmp/guest.credentials.json";

// If credentials file doesnt exist then return to the index page
if (!fs.existsSync(credPath)) {
  window.location.href = "index.html";
}

const credentials = JSON.parse(
  fs.readFileSync(credPath, {
    encoding: "utf-8",
  })
);

const { meeting, guest } = credentials;

console.log(credentials);

// ==============================================================
// DOM manipulation
// ==============================================================

// Loading screen that is showed at the begining
const loadingScreen = document.querySelector("#loading_screen");

// Status icons
const initFuseStatus = document.querySelector("#init_fuse");
const connectRoomStatus = document.querySelector("#connect_room");
const mkdirPublicStatus = document.querySelector("#mkdir_public");

// Information elements
const title = document.querySelector("#title");
const host_fullname = document.querySelector("#host_fullname");
const uid = document.querySelector("#uid");
const password = document.querySelector("#password");
const guest_fullname = document.querySelector("#guest_fullname");
const mountpoint = document.querySelector("#mountpoint");

// Message related elements
const messageFeed = document.querySelector("#messageFeed");
const messageInput = document.querySelector("#messageInput");

// Guest list
const guestCount = document.querySelector("#guestCount");
const guestList = document.querySelector("#guestList");

// Init guest list count
guestCount.innerHTML = 0;

// Update informations
title.innerHTML = meeting.title;
host_fullname.innerHTML = meeting.host_fullname;
uid.innerHTML = meeting.uid;
password.innerHTML = meeting.password;
guest_fullname.innerHTML = guest.fullname;
mountpoint.innerHTML = meeting.mountpoint.replace(process.env.HOME, "~");

// Action buttons
const tryAgainBtn = document.querySelector("#try_again");
const openBtn = document.querySelector("#open");
const leaveBtn = document.querySelector("#leave");
const copyBtn = document.querySelector("#copy");
const sendBtn = document.querySelector("#send");

// Reload the window wwhen the user clicks on "Try again"
tryAgainBtn.onclick = function () {
  document.location.reload();
};

openBtn.onclick = openInExplorer;

// Leave the meeting and close the window as well
leaveBtn.onclick = function () {
  // Close the window so that it shows a confirmation message dialog
  window.close();
};

// Copy meeting UID and password to the clipboard
copyBtn.onclick = function () {
  const text = `UID: ${meeting.uid}, Password: ${meeting.password}`;

  window.navigator.clipboard.writeText(text).then(console.log);
};

sendBtn.onclick = sendMessage;

// Send message on enter
messageInput.onkeypress = function (e) {
  const ENTER = "Enter";

  if (e.key === ENTER) {
    sendMessage();
  }
};

// When user clicks on the close button
ipcRenderer.on("window:close-intent", onCloseIntent);

// ==============================================================
//
// Meeting preparation
//
// ==============================================================

// Init fuse
let initiatedFuse = false;

initFuse();

// Function that initiates FUSE and changes it status color
function initFuse() {
  // Try to execute a command that starts fuse from the meeting
  try {
    try {
      execSync(`fusermount -u ${meeting.fuseMountpoint}`);
    } catch (e) {}

    execSync(`python3 guest.py ../guest`, {
      cwd: path.join(process.env.FUSE_HOME, "roomdrop"),
    });

    initFuseStatus.classList.remove("text-gray-400");
    initFuseStatus.classList.add("text-green-600");

    initiatedFuse = true;
  } catch (e) {
    console.log("stderr", e);

    initFuseStatus.classList.add("text-red-600");

    alert(
      `We could't initiate FUSE. Make sure that your mountpoint (${meeting.fuseMountpoint}) is empty and try again.`
    );

    tryAgainBtn.classList.remove("hidden");
  }
}

// Connect to the meeting room
// Use the right Server URL according to the environment
const BASE =
  process.env.ENV === "production"
    ? "http://pacific-wave-46729.herokuapp.com"
    : "http://localhost:5000";

const socket = io(BASE);

// Once connected, join the meeting room
socket.on("connect", () => {
  console.log("connected");

  connectRoomStatus.classList.remove("text-gray-400");
  connectRoomStatus.classList.add("text-green-600");

  // Notify meeting attendants
  socket.emit("join", {
    guest_fullname: guest.fullname,
    meeting_uid: meeting.uid,
  });
});

// Create meeting public folder and guest's personnal folder
const PUBLIC_PATH = path.join(meeting.fuseMountpoint, "public");
const GUEST_PATH = path.join(meeting.fuseMountpoint, guest.fullname);
let createdPublicFolder = false;

// Create folders only if fuse was initiated
if (initiatedFuse && !fs.existsSync(PUBLIC_PATH)) {
  try {
    fs.mkdirSync(PUBLIC_PATH);
    fs.mkdirSync(GUEST_PATH); // Guest folder

    mkdirPublicStatus.classList.remove("text-gray-400");
    mkdirPublicStatus.classList.add("text-green-600");

    createdPublicFolder = true;
  } catch (e) {
    mkdirPublicStatus.classList.remove("text-gray-400");
    mkdirPublicStatus.classList.add("text-red-600");

    alert(
      `Couldn't create required directories in the meeting mountpoint (${meeting.fuseMountpoint}). Verify that the meeting was correctly mounted.`
    );

    tryAgainBtn.classList.remove("hidden");
  }
} else {
  mkdirPublicStatus.classList.remove("text-gray-400");
  mkdirPublicStatus.classList.add("text-green-600");

  createdPublicFolder = true;
}

// Finally, if fuse was initiated and the public folder was created
// Simulate loading delay and open the meeting folder in the explorer
if (initiatedFuse && createdPublicFolder) {
  setTimeout(function () {
    loadingScreen.classList.add("hidden");

    openInExplorer(meeting.fuseMountpoint);
  }, 2000);
}

// ==============================================================
//
// Socket Events
//
// ==============================================================

// Log every event
socket.onAny(function (event, data) {
  console.log(event, data);

  // Update guests list when a guest joins or leaves
  if (event === "new join" || event === "leaved") {
    updateGuestList(data.guests);
  }
});

// On new guest join
socket.on("new join", function (data) {
  const { guest_fullname, guests, public_files } = data;
  console.log("Nouvel participant", data);

  // mettre a jour la liste des particiapnts
  updateGuestList(guests);

  // Add notification to the message feed
  addNotification(`${guest_fullname} joined the meeting`);

  // Download public files
  for (let i = 0; i < public_files.length; i++) {
    const file = public_files[i];
    const downloadPath = path.join(
      meeting.fuseMountpoint,
      "public",
      file.filename
    );

    // Create an empty file
    if (!fs.existsSync(downloadPath)) {
      fs.writeFileSync(downloadPath, "", {
        encoding: "utf-8",
      });
    }

    // Add notification of a file add
    const display_filename = file.filename.replace(".encrypted", "");
    addNotification(`${meeting.host_fullname} uploaded ${display_filename}`);
  }
});

// On guest leave
socket.on("leaved", function (data) {
  const { guest_fullname } = data;

  addNotification(`${guest_fullname} leaved the meeting`);
});

// On new file add
socket.on("new file", function (data) {
  // Create a new file in the fusemount directory
  const { filename, author_fullname } = data;
  const display_filename = filename.replace(".encrypted", "");

  // If the new file is from the host
  // Create a new file in the FUSE mountpoint
  // So it can detect it and then download the file
  // from the server
  if (author_fullname === meeting.host_fullname) {
    const downloadPath = path.join(meeting.fuseMountpoint, "public", filename);

    // Create an empty file
    fs.writeFileSync(downloadPath, "", {
      encoding: "utf-8",
    });

    addNotification(`${meeting.host_fullname} uploaded ${display_filename}`);
  }

  if (author_fullname == guest.fullname) {
    addNotification(`You uploaded ${display_filename}`);
  }
});

// On deleted file from public
socket.on("delete file public", function (data) {
  const { filename } = data;

  const publicFilePath = path.join(meeting.fuseMountpoint, "public", filename);

  // Delete file from sytem
  if (fs.existsSync(publicFilePath)) {
    fs.rmSync(publicFilePath);

    addNotification(`${meeting.host_fullname} deleted ${filename}`);
  }
});

// On new message
socket.on("new message", function (message) {
  addMessage(message);
});

// If meeting has ended, quit the application
socket.on("ended", function () {
  socket.emit("leave", {
    guest_fullname: guest.fullname,
    meeting_uid: meeting.uid,
  });

  alert("The meeting has ended.");

  // Unmount FUSE
  execSync(`fusermount -u ${meeting.fuseMountpoint}`);

  ipcRenderer.send("window:close");
});

// ==============================================================
//
// Rendering functions
//
// ==============================================================

function updateGuestList(guests) {
  // Clear list
  guestList.textContent = "";

  // Update guest count
  guestCount.innerHTML = guests.length;

  // Si liste vide
  if (guests.length == 0) return;

  // Add each guest to the list
  for (let i = 0; i < guests.length; i++) {
    let li = document.createElement("li");
    li.classList.add("py-2", "border-b", "mx-2");

    li.appendChild(document.createTextNode(guests[i]));

    guestList.appendChild(li);
  }
}

// Add a message to the message feed
function addMessage(message) {
  const messageEl = document.createElement("div");
  // Add TailwindCSS classes to the message element
  messageEl.classList.add(
    "bg-white",
    "px-3",
    "py-2",
    "rounded-lg",
    "border",
    "mb-2",
    "shadow",
    "max-w-lg"
  );

  // Align message to the right if its from right
  if (message.from === meeting.host_fullname)
    messageEl.classList.add("self-end");

  // Create the from element
  const fromEl = document.createElement("h6");
  fromEl.appendChild(document.createTextNode(message.from));
  fromEl.classList.add("font-bold", "text-purple-600");

  // Align message to the right if its from right
  fromEl.classList.add("self-end");

  // Create message paragraph
  const textEl = document.createElement("p");
  textEl.appendChild(document.createTextNode(message.text));

  // Create message time text
  const timeEl = document.createElement("p");
  timeEl.appendChild(document.createTextNode(message.time));
  timeEl.classList.add("text-right", "text-xs", "text-gray-400");

  // Append created elements to the message
  messageEl.appendChild(fromEl);
  messageEl.appendChild(textEl);
  messageEl.appendChild(timeEl);

  // Append message to the feed
  messageFeed.appendChild(messageEl);

  // Scroll to the end of the chat
  messageFeed.scrollTop = messageFeed.scrollHeight;
}

function addNotification(notification) {
  const notif = document.createElement("div");
  notif.classList.add(
    "self-stretch",
    "p-2",
    "text-sm",
    "text-center",
    "text-gray-600"
  );

  notif.appendChild(document.createTextNode(notification));

  messageFeed.appendChild(notif);
}

// ==============================================================
//
// Utils
//
// ==============================================================

function openInExplorer() {
  shell.openPath(meeting.fuseMountpoint);
}

function onCloseIntent(event, args) {
  console.log("meeting leave request");

  leaveMeeting().then(function (res) {
    console.log(res);

    // Remove credentials
    removeCredentials();

    // Notify room
    socket.emit("leave", {
      guest_fullname: guest.fullname,
      meeting_uid: meeting.uid,
    });

    // Unmount FUSE
    try {
      execSync(`fusermount -u ${meeting.fuseMountpoint}`);
    } catch (e) {}

    // Notify main process to close the window
    ipcRenderer.send("window:close");
  });
}

function leaveMeeting() {
  const API_URL = `${BASE}/meetings/${meeting.uid}/guests/${guest.uid}/leave`;

  return fetch(API_URL, {
    method: "DELETE",
  }).then(function (res) {
    return res.json();
  });
}

function sendMessage() {
  const text = messageInput.value.trim();

  if (text.length === 0) return;

  const message = {
    text,
    from: guest.fullname,
    meeting_uid: meeting.uid,
  };

  socket.emit("message", message);

  messageInput.value = "";
}

function removeCredentials() {
  if (fs.existsSync(credPath)) {
    fs.rmSync(credPath);
  }
}
