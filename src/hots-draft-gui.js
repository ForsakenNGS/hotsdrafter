// Nodejs dependencies
const { ipcRenderer } = require('electron');
const path = require('path');
const Twig = require('twig');
const EventEmitter = require('events');

// Local classes
const HotsHelpers = require('./hots-helpers.js');

// Templates
const templates = {
    "main": path.resolve(__dirname, "..", "gui", "pages", "main.twig.html"),
    "config": path.resolve(__dirname, "..", "gui", "pages", "config.twig.html"),
    "wait": path.resolve(__dirname, "..", "gui", "pages", "wait.twig.html"),
    "update": path.resolve(__dirname, "..", "gui", "pages", "update.twig.html")
};

class HotsDraftGui extends EventEmitter {

    constructor(window) {
        super();
        this.debugEnabled = false;
        this.debugStep = "Initializing...";
        this.document = window.document;
        this.window = window;
        // GUI relevant fields
        this.page = "update";
        this.config = null;
        this.displays = null;
        this.draft = null;
        this.gameData = null;
        this.modalActive = false;
        this.updateProgress = 0;
        this.registerEvents();
        this.sendEvent("gui", "window.ready");
        this.renderPage();
    }

    debug(debugEnabled) {
        this.debugEnabled = debugEnabled;
    }

    registerEvents() {
        ipcRenderer.on("gui", (event, type, ...parameters) => {
            this.handleEvent(event, type, parameters);
        });
    }
    handleEvent(event, type, parameters) {
        switch (type) {
            case "config":
                this.config = parameters[0];
                break;
            case "draft":
                this.draft = parameters[0];
                this.renderPage();
                break;
            case "gameData":
                this.gameData = parameters[0];
                break;
            case "debug.step.update":
                this.setDebugStep(parameters[0]);
                break;
            case "displays.detected":
                this.setDisplays(parameters[0]);
                break;
            case "download.start":
                this.setUpdateProgress(0);
                break;
            case "download.progress":
                this.setUpdateProgress(parameters[0]);
                break;
            case "download.done":
                this.setUpdateProgress(100);
                break;
            case "page.set":
                this.changePage(parameters[0]);
                break;
            case "update.progress":
                this.setUpdateProgress(parameters[0]);
                break;
        }
    }
    sendEvent(channel, type, ...parameters) {
        ipcRenderer.send(channel, type, ...parameters);
    }

    changePage(targetPage) {
        if (this.page !== targetPage) {
            this.page = targetPage;
            this.renderPage();
        }
    }

    forceUpdate() {
        this.sendEvent("gui", "update.forced");
    }
    fixHeroName(name) {
        if (this.gameData.substitutions.hasOwnProperty(name)) {
          name = this.gameData.substitutions[name];
        }
        name = name.toUpperCase();
        return name;
    }

    getDisplays() {
        return this.displays;
    }
    getHeroImage(heroName) {
        if (!heroName) {
            return null;
        }
        heroName = this.fixHeroName(heroName);
        return path.join(HotsHelpers.getStorageDir(), "heroes", heroName+"_crop.png");
    }

    reloadProvider() {
        this.sendEvent("gui", "provider.reload");
    }
    providerAction(...params) {
        this.sendEvent("gui", "provider.action", ...params);
    }

    saveHeroBanImage(heroName, imageData) {
        this.sendEvent("gui", "ban.save", heroName, imageData);
    }

    saveCorrection(heroNameFailed, heroNameFixed) {
        this.sendEvent("gui", "hero.correct", heroNameFailed, heroNameFixed);
    }

    setConfigOption(name, value) {
        if (this.config === null) {
            console.error("Trying to modify config before receiving it!");
            return;
        }
        this.config[name] = value;
        this.sendEvent("gui", "config.option.set", name, value);
    }
    setDisplays(displays) {
        this.displays = displays;
    }
    setDebugStep(step) {
        this.debugStep = step;
        jQuery(".debug-step").text(step);
    }
    setModalActive(modalActive) {
        this.modalActive = modalActive;
        if (!modalActive) {
            // Re-render page after closing a modal
            this.renderPage();
        }
    }
    setUpdateProgress(percent) {
        this.updateProgress = percent;
        jQuery(".page").find(".progress-bar").css("width", this.updateProgress+"%");
    }

    quit() {
        this.sendEvent("gui", "quit");
    }

    renderPage() {
        if (this.modalActive) {
            return;
        }
        Twig.renderFile(templates[this.page], {
            gui: this
        }, (error, html) => {
            if (error) {
                console.error(error);
            } else {
                jQuery(".page").html(html);
            }
        });
    }
}

module.exports = HotsDraftGui;
