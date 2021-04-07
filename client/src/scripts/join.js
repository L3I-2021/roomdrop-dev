const fs = require("fs"); // file system
const { ipcRenderer } = require("electron");

// Form elements
const fullname = document.querySelector("#fullname");
const uid = document.querySelector("#uid");
const password = document.querySelector("#password");
const form = document.querySelector("#joinMeetingForm");
const mountpoint = document.querySelector("#mountpoint");
const mountpointBtn = document.querySelector("#mountpointBtn");

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

  if (mountpoint.value === "") {
    alert("A mountpoint is required");
    return;
  }

  // Build request url
  const API_URL = new URL(
    process.env.ENV === "production"
      ? "http://pacific-wave-46729.herokuapp.com/meetings/join"
      : "http://localhost:5000/meetings/join"
  );

  API_URL.searchParams.append("uid", uid.value);
  API_URL.searchParams.append("pwd", password.value);
  API_URL.searchParams.append("fullname", fullname.value);

  // Request to join meeting
  fetch(API_URL.href)
    .then(function (res) {
      return res.json();
    })
    .then(function (res) {
      // If an error occured
      if (res.error) {
        throw Error(res.error);
      }

      // If meeting created successfully, create a credentials file
      else {
        const credPath = "/tmp/guest.credentials.json";
        const { uid, title, host_fullname, host_uid, password } = res.meeting;
        const fuseMountpoint = "/tmp/" + uid + "." + password;
        const credentials = {
          guest: res.guest,
          meeting: {
            uid,
            title,
            host_fullname,
            host_uid,
            password,
            mountpoint: mountpoint.value,
            fuseMountpoint,
          },
        };
        const writeOpts = { encoding: "utf-8" };

        // write credentials to file
        fs.writeFileSync(credPath, JSON.stringify(credentials), writeOpts);

        // Make fuse directory mountpoint
        fs.mkdirSync(fuseMountpoint);

        // submit the form and go to next page
        form.submit();
      }
    });
};
