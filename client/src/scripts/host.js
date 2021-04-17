const { ipcRenderer, shell } = require("electron");
const fs = require("fs");
const path = require("path");
const { execSync, exec } = require("child_process");

// ==============================================================
//
// Credentials
//
// ==============================================================

// Get meeting credentials from file system
const credPath = "/tmp/host.credentials.json";
const credentials = JSON.parse(
  fs.readFileSync(credPath, {
    encoding: "utf-8",
  })
);

const { meeting } = credentials;

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
const mountpoint = document.querySelector("#mountpoint");

// Guest list related stuff
const guestCount = document.querySelector("#guestCount");
const guestList = document.querySelector("#guestList");

// Message related elements
const messageFeed = document.querySelector("#messageFeed");
const messageInput = document.querySelector("#messageInput");

// Update informations
title.innerHTML = meeting.title;
host_fullname.innerHTML = meeting.host_fullname;
uid.innerHTML = meeting.uid;
password.innerHTML = meeting.password;
mountpoint.innerHTML = meeting.mountpoint.replace(process.env.HOME, "~");

// Init guest list count
guestCount.innerHTML = 0;

// Action buttons
const tryAgainBtn = document.querySelector("#try_again");
const openBtn = document.querySelector("#open");
const endBtn = document.querySelector("#end");
const copyBtn = document.querySelector("#copy");
const sendBtn = document.querySelector("#send");

// Reload the window wwhen the user clicks on "Try again"
tryAgainBtn.onclick = function () {
  document.location.reload();
};

// Open the meeting in the file explorer
openBtn.onclick = openInExplorer;

// End the meeting and close the window as well
endBtn.onclick = function () {
  // Close the window so that it shows a confirmation message dialog
  window.close();
};

// Copy meeting UID and password to the clipboard
copyBtn.onclick = function () {
  const text = `UID: ${meeting.uid}, Password: ${meeting.password}`;

  window.navigator.clipboard.writeText(text).then(console.log);
};

// Send message on send button click
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
  const RDFUSE_HOME = path.join(
    process.env.HOME,
    ".roomdrop",
    "fuse",
    "roomdrop"
  );

  // Try to execute a command that starts fuse from the meeting
  try {
    // In case it is already mounted
    try {
      execSync(`fusermount -u ${meeting.fuseMountpoint}`);
    } catch (e) {}

    execSync(`python3 host.py ../host`, {
      cwd: RDFUSE_HOME,
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
socket.on("connect", function () {
  console.log("connected");

  connectRoomStatus.classList.remove("text-gray-400");
  connectRoomStatus.classList.add("text-green-600");

  // Notify meeting attendants
  socket.emit("join", {
    meeting_uid: meeting.uid,
  });
});

// Create meeting public folder
const PUBLIC_PATH = path.join(meeting.fuseMountpoint, "public");
let createdPublicFolder = false;

if (initiatedFuse && !fs.existsSync(PUBLIC_PATH)) {
  try {
    fs.mkdirSync(PUBLIC_PATH);

    mkdirPublicStatus.classList.remove("text-gray-400");
    mkdirPublicStatus.classList.add("text-green-600");

    createdPublicFolder = true;
  } catch (e) {
    mkdirPublicStatus.classList.remove("text-gray-400");
    mkdirPublicStatus.classList.add("text-red-600");

    alert(
      `Couldn't create the 'public' directory in the meeting mountpoint (${meeting.fuseMountpoint}). Verify that the meeting was correctly mounted.`
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

    shell.openPath(meeting.fuseMountpoint);
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

  // Update guest list when a guest joins or leaves
  if (event === "new join" || event === "leaved") {
    updateGuestList(data.guests);
  }
});

// On new join
socket.on("new join", function (data) {
  const { guest_fullname } = data;

  // Create a new directory named after the new guest
  const guestDirPath = path.join(meeting.fuseMountpoint, guest_fullname);

  if (!fs.existsSync(guestDirPath)) {
    fs.mkdirSync(guestDirPath);
  }
});

// On new filed add
socket.on("new file", function (data) {
  // Create a new file in the fusemount directory
  const { filename, author_fullname } = data;

  // Is the fie from the host himself ?
  const fromHost = author_fullname === meeting.host_fullname;

  // If so then do nothing
  if (fromHost) return;
  // Otherwise:
  // Create a new file in the FUSE mountpoint
  // So it can detect it and then download the file
  // from the server
  else {
    const downloadPath = path.join(
      meeting.fuseMountpoint,
      author_fullname,
      filename
    );

    // Create an empty file
    fs.writeFileSync(downloadPath, "", { encoding: "utf-8" });
  }
});

// On guest file deleted
socket.on("delete file guest", function (data) {
  const { filename, guest_fullname } = data;

  const guestFilePath = path.join(
    meeting.fuseMountpoint,
    guest_fullname,
    filename
  );

  // Delete file from sytem
  if (fs.existsSync(guestFilePath)) {
    fs.rmSync(guestFilePath);
  }
});

// On new message
socket.on("new message", function (message) {
  addMessage(message);
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

  // If empty list
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

  // Create the from element
  const fromEl = document.createElement("h6");
  fromEl.appendChild(document.createTextNode(message.from));
  fromEl.classList.add("font-bold", "text-purple-600");

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
}

// ==============================================================
//
// Utils
//
// ==============================================================

// Open file explorer on the meeting mountpoint
function openInExplorer() {
  shell.openPath(meeting.fuseMountpoint);
}

// Function that ends the meeting and closes the window
function onCloseIntent(event, args) {
  // Make a request to end the meeting
  endMeeting()
    // If meeting ended successfully notify main process to close the window
    .then(function (res) {
      console.log(res);

      if (res.error) {
      } else {
        // Remove credentials file
        removeCredentials();

        // Notify room
        socket.emit("end", { meeting_uid: meeting.uid });

        // Unmount FUSE
        execSync(`fusermount -u ${meeting.fuseMountpoint}`);

        // Notify main process to close the window
        ipcRenderer.send("window:close");
      }
    });
}

// Function that sends a request to end the meeting
function endMeeting() {
  // Request URL
  const API_URL = new URL(`${BASE}/meetings/${meeting.uid}/end`);

  // Append secret_key argument
  API_URL.searchParams.append("secret_key", meeting.secret_key);

  // Return the request's response
  return fetch(API_URL.href, {
    method: "DELETE",
  }).then(function (res) {
    return res.json();
  });
}

// Function thate
function sendMessage() {
  const text = messageInput.value.trim();

  if (text.length === 0) return;

  const message = {
    text,
    from: meeting.host_fullname,
  };

  socket.emit("message", message);

  messageInput.value = "";
}

// Function that deletes the credentials files
function removeCredentials() {
  fs.rmSync(credPath);
}
