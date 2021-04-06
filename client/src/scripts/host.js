const { ipcRenderer } = require("electron");
const fs = require("fs");

// Get meeting credentials
const credPath = "/tmp/host.credentials.json";
const credentials = JSON.parse(
  fs.readFileSync(credPath, {
    encoding: "utf-8",
  })
);

const { meeting } = credentials;

console.log(credentials);

const BASE =
  process.env.ENV === "production"
    ? "http://pacific-wave-46729.herokuapp.com"
    : "http://localhost:5000";

const socket = io(BASE);

// Log every event
socket.onAny(function (event, data) {
  console.log(event, data);

  // Update guest list when a guest joins or leaves
  if (event === "new join" || event === "leaved") {
    updateGuestList(data.guests);
  }
});

// Once connected, join the meeting room
socket.on("connect", function () {
  console.log("connected");

  socket.emit("join", {
    meeting_uid: meeting.uid,
  });
});

// Information elements
const title = document.querySelector("#title");
const host_fullname = document.querySelector("#host_fullname");
const uid = document.querySelector("#uid");
const password = document.querySelector("#password");

// Update informations
title.innerHTML = meeting.title;
host_fullname.innerHTML = meeting.host_fullname;
uid.innerHTML = meeting.uid;
password.innerHTML = meeting.password;

// Guest list related stuff
const guestCount = document.querySelector("#guestCount");
const guestList = document.querySelector("#guestList");

// Init guest list
guestCount.innerHTML = 0;

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

    li.appendChild(document.createTextNode(guests[i]));

    guestList.appendChild(li);
  }
}

// Action buttons
const endBtn = document.querySelector("#end");

endBtn.onclick = function () {
  // Close the window so that it shows a confirmation message dialog
  window.close();
};

// When user clicks on the close button
ipcRenderer.on("window:close-intent", onCloseIntent);

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

        // Notify main process to close the window
        ipcRenderer.send("window:close");
      }
    });
}

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

function removeCredentials() {
  fs.rmSync(credPath);
}
