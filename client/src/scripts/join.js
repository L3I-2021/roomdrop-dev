const fs = require("fs"); // file system

// Form elements
const fullname = document.querySelector("#fullname");
const uid = document.querySelector("#uid");
const password = document.querySelector("#password");
const form = document.querySelector("#joinMeetingForm");

// On form submit
form.onsubmit = function (e) {
  e.preventDefault();

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
        const credentials = {
          guest: res.guest,
          meeting: res.meeting,
        };
        const writeOpts = { encoding: "utf-8" };

        // write credentials to file
        fs.writeFileSync(credPath, JSON.stringify(credentials), writeOpts);

        form.submit();
      }
    });
};
