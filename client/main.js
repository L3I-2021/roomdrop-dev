const { app, BrowserWindow, dialog, ipcMain } = require("electron");

// Set environment
process.env.ENV = "production"; // set to "development"

// Enable live reload for all the files inside your project directory
if (!(process.env.ENV === "production")) {
  require("electron-reload")(`${__dirname}/src`);
}

function createWindow() {
  // create window
  let win = new BrowserWindow({
    width: 800,
    height: 600,
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false,
    },
  });

  // load index page
  win.loadFile("src/index.html");

  // on window close
  win.on("close", function (event) {
    const url = win.webContents.getURL();
    //  path/to/page -> page/to/page -> page
    const page = url.split("?")[0].split("/").reverse()[0];

    console.log(page);

    // if the user is closing the window during a meeting
    if (page === "host.html" || page === "guest.html") {
      // don't close the window
      event.preventDefault();

      // show a confirmation dialog box
      const buttons = ["Cancel", "Confirm"];
      const dialogOpts = {
        type: "warning",
        buttons,
        defaultId: 1,
        title: "Warning",
        message: "Are you sure ?",
        detail:
          "Closing the application will end the current meeting. All transfered files are saved at the meeting mountpoint.",
      };

      dialog.showMessageBox(null, dialogOpts).then(function ({ response }) {
        // If the 'Confirm' button was pressed
        if (response === buttons.indexOf("Confirm")) {
          win.webContents.send("window:close-intent");
        }
      });
    }
    // Else, close window normally
    else {
      // ..
    }
  });

  // close the window once the meeting has ended
  ipcMain.on("window:close", function (event, args) {
    win.destroy();
  });

  // show a directory selector
  ipcMain.on("select:directory", function (event, args) {
    dialog
      .showOpenDialog({
        properties: ["openDirectory"],
      })
      .then(function (result) {
        event.returnValue = result;
      });
  });
}

app.whenReady().then(() => {
  createWindow();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});
