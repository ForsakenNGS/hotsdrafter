const path = require('path');
const { app, ipcMain, BrowserWindow } = require('electron');
const Twig = require('twig');
const fork = require('child_process').fork;

if (require('electron-squirrel-startup')) return app.quit();

const Installer = require("./src/installer.js");
if (Installer.handleSquirrelEvent()) {
    // squirrel event handled and app will exit in 1000ms, so don't do anything else
    return;
}

function createWindow () {
    // Erstelle das Browser-Fenster.
    let win = new BrowserWindow({
        width: 1400,
        height: 900,
        minWidth: 1000,
        minHeight: 600,
        frame: false,
        icon: path.join(__dirname, 'build/icon_64x64.png'),
        webPreferences: {
            nodeIntegration: true
        }
    });

    win.setMenuBarVisibility(false);

    // and load the index.twig.html of the app.
    win.loadFile('gui/index.html');

    let backend = fork("./src/backend.js");
    ipcMain.on("gui", (event, type, ...parameters) => {
        if (type === "quit") {
            backend.kill();
            app.quit();
            return;
        }
        backend.send([type, parameters]);
    });
    backend.on("message", function(message) {
        win.webContents.send(...message);
    });
}

app.on('ready', createWindow);
