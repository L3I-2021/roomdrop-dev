const fs = require("fs");
const { ipcRenderer } = require("electron");

// Form elements
const form = document.querySelector("#newMeetingForm");
const fullname = document.querySelector("#host_fullname");
const title = document.querySelector("#title");
const mountpoint = document.querySelector("#mountpoint");
const mountpointBtn = document.querySelector("#mountpointBtn");

const BASE =
  process.env.ENV === "production"
    ? "http://pacific-wave-46729.herokuapp.com"
    : "http://localhost:5000";

mountpointBtn.onclick = function (e) {
  // Prevent form from submiting
  e.preventDefault();

  const { filePaths } = ipcRenderer.sendSync("select:directory");

  // If no selected path
  if (filePaths.lenght === 0) return;

  const path = filePaths[0];

  // Check if folder is empty
  const isEmpty = fs.readdirSync(path).length === 0;

  if (!isEmpty) {
    alert("Select an empty folder in order to mount the meeting");
  } else {
    // Set mountpoint value to selected path
    mountpoint.value = filePaths[0];
  }
};

// On form submit
form.onsubmit = function (e) {
  // Prevent form from submiting
  e.preventDefault();

  const reqBody = {
    fullname: fullname.value,
    title: title.value,
  };

  // Make a request to create a new meeting
  const API_NEW_MEETING = `${BASE}/meetings/new`;

  fetch(API_NEW_MEETING, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(reqBody),
  })
    .then(function (res) {
      return res.json();
    })

    // If meeting created successfully then create a credentials file
    .then(function (res) {
      if (res.error) {
        throw Error(res.error);
      } else {
        console.log(res);
        const {
          uid,
          title,
          host_fullname,
          host_uid,
          secret_key,
          password,
        } = res.meeting;

        const credPath = "/tmp/host.credentials.json";
        const credentials = {
          meeting: {
            uid,
            title,
            host_fullname,
            host_uid,
            secret_key,
            password,
            mountpoint: mountpoint.value,
          },
        };
        const writeOpts = { encoding: "utf-8" };

        // write credentials to a file
        fs.writeFileSync(credPath, JSON.stringify(credentials), writeOpts);

        // submit the form and go to next page
        form.submit();
      }
    })
    .catch(function (err) {
      console.log("Catched");
      console.log(err);
    });
};
