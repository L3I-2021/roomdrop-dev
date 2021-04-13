const { ipcRenderer, shell } = require("electron");
const fs = require("fs");
const path = require("path");

// Get meeting credentials
const credPath = "/tmp/guest.credentials.json";
const credentials = JSON.parse(
  fs.readFileSync(credPath, {
    encoding: "utf-8",
  })
);

const { meeting, guest } = credentials;

console.log(credentials);

// Information elements
const title = document.querySelector("#title");
const host_fullname = document.querySelector("#host_fullname");
const uid = document.querySelector("#uid");
const password = document.querySelector("#password");
const guest_fullname = document.querySelector("#guest_fullname");
const mountpoint = document.querySelector("#mountpoint");

// Update informations
title.innerHTML = meeting.title;
host_fullname.innerHTML = meeting.host_fullname;
uid.innerHTML = meeting.uid;
password.innerHTML = meeting.password;
guest_fullname.innerHTML = guest.fullname;
mountpoint.innerHTML = meeting.mountpoint;

const BASE =
  process.env.ENV === "production"
    ? "http://pacific-wave-46729.herokuapp.com"
    : "http://localhost:5000";

const socket = io(BASE);

// Log every event
socket.onAny(function (event, data) {
  console.log(event, data);

  // Update guests list when a guest joins or leaves
  if (event === "new join" || event === "leaved") {
    updateGuestList(data.guests);
  }

  // If meeting has ended, quit the application
  if (event == "ended") {
    socket.emit("leave", {
      guest_fullname: guest.fullname,
      meeting_uid: meeting.uid,
    });

    alert("The meeting has ended.");

    ipcRenderer.send("window:close");
  }
});

// Once connected, join the meeting room
socket.on("connect", () => {
  console.log("connected");

  // Notify meeting attendants
  socket.emit("join", {
    guest_fullname: guest.fullname,
    meeting_uid: meeting.uid,
  });

  // Create meeting public folder
  const PUBLIC_PATH = path.join(meeting.fuseMountpoint, "public");

  if (!fs.existsSync(PUBLIC_PATH)) {
    fs.mkdirSync(PUBLIC_PATH);
  }
});

// On new guest join
socket.on("new join", function (data) {
  console.log("Nouvel participant", data);

  // mettre a jour la liste des particiapnts
  updateGuestList(data.guests);

  const { guest_fullname } = data;

  // Create a new directory named after the new guest
  const guestDirPath = path.join(meeting.fuseMountpoint, guest_fullname);

  if (!fs.existsSync(guestDirPath)) {
    fs.mkdirSync(guestDirPath);
  }
});

// On new file add
socket.on("new file", function (data) {
  // Create a new file in the fusemount directory
  const { filename, author_fullname } = data;

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
  }
});

// On meeting end
socket.on("end", function (data) {});

// Guest list
const guestCount = document.querySelector("#guestCount");
const guestList = document.querySelector("#guestList");

guestCount.innerHTML = 0; // Initialiser le compteur à 0

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

    li.appendChild(document.createTextNode(guests[i]));

    guestList.appendChild(li);
  }
}

// Buttons
const openBtn = document.querySelector("#open");
const leaveBtn = document.querySelector("#leave");

openBtn.onclick = function () {
  // Open file explorer on the meeting mountpoint
  shell.openPath(meeting.mountpoint);
};

leaveBtn.onclick = function () {
  // Close the window so that it shows a confirmation message dialog
  window.close();
};

ipcRenderer.on("window:close-intent", onCloseIntent);

function onCloseIntent(event, args) {
  console.log("meeting leave request");

  leaveMeeting().then(function (res) {
    console.log(res);

    if (res.error) {
    } else {
      // Remove credentials
      removeCredentials();

      // Notify room
      socket.emit("leave", {
        guest_fullname: guest.fullname,
        meeting_uid: meeting.uid,
      });

      // Delete fuse directory (TEMPORARY)
      // fs.rmSync(meeting.fuseMountpoint, { recursive: true, force: true });

      // Notify main process to close the window
      ipcRenderer.send("window:close");
    }
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

function removeCredentials() {
  fs.rmSync(credPath);
}
