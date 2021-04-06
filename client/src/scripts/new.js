const fs = require("fs");

// FOrm elements
const form = document.querySelector("#newMeetingForm");
const fullname = document.querySelector("#host_fullname");
const title = document.querySelector("#title");

const BASE =
  process.env.ENV === "production"
    ? "http://pacific-wave-46729.herokuapp.com"
    : "http://localhost:5000";

// On form submit
form.onsubmit = function (e) {
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
        const credPath = "/tmp/host.credentials.json";
        const credentials = { meeting: res.meeting };
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
