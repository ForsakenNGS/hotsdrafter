const { app, BrowserWindow } = require('electron');

function createWindow () {
    // Erstelle das Browser-Fenster.
    let win = new BrowserWindow({
        width: 1400,
        height: 900,
        webPreferences: {
            nodeIntegration: true
        }
    });

    win.setMenuBarVisibility(false);

    // and load the index.html of the app.
    win.loadFile('gui/index.html');
}

app.on('ready', createWindow);
