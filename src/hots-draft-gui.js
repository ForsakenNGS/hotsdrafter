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
    "replays": path.resolve(__dirname, "..", "gui", "pages", "replays.twig.html"),
    "detectionTuningContent": path.resolve(__dirname, "..", "gui", "elements", "detectionTuning.content.twig.html"),
    "elementBan": path.resolve(__dirname, "..", "gui", "elements", "ban.twig.html"),
    "elementPlayer": path.resolve(__dirname, "..", "gui", "elements", "player.twig.html")
};

class HotsDraftGui extends EventEmitter {

    constructor(window) {
        super();
        this.debugEnabled = false;
        this.debugStep = "Initializing...";
        this.document = window.document;
        this.window = window;
        // GUI relevant fields
        this.page = "main";
        this.config = null;
        this.displays = null;
        this.draft = null;
        this.talents = null;
        this.gameActive = false;
        this.gameData = null;
        this.debugData = [];
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
                this.refreshPage();
                break;
            case "draft.status":
                this.draftActive = parameters[0];
                this.refreshPage();
                break;
            case "talents":
                this.talents = parameters[0];
                this.refreshPage();
                break;
            case "ban.update":
                this.updateBan(...parameters);
                break;
            case "player.update":
                this.updatePlayer(...parameters);
                break;
            case "draftProvider.update":
                this.updateDraftProvider(...parameters);
                break;
            case "talentProvider.update":
                this.updateTalentProvider(...parameters);
                break;
            case "game.start":
                this.gameActive = true;
                break;
            case "game.end":
                this.gameActive = false;
                this.refreshPage();
                break;
            case "gameData":
                this.gameData = parameters[0];
                break;
            case "debugData":
                this.debugData = parameters[0];
                break;
            case "debug.step.update":
                this.setDebugStep(parameters[0]);
                break;
            case "displays.detected":
                this.setDisplays(parameters[0]);
                break;
            case "ready.status":
                this.ready = parameters[0];
                this.refreshPage();
                break;
            case "update.start":
                this.setUpdateProgress(0);
                break;
            case "update.progress":
                this.setUpdateProgress(parameters[0]);
                break;
            case "update.done":
                this.setUpdateProgress(100);
                break;
            case "page.update":
                this.refreshPage();
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
    getHeroId(heroName) {
        if (!this.gameData.heroes.name.hasOwnProperty(this.config.language)) {
            return null;
        }
        for (let heroId in this.gameData.heroes.name[this.config.language]) {
            if (this.gameData.heroes.name[this.config.language][heroId] === heroName) {
                return heroId;
            }
        }
        return null;
    }
    getHeroImage(heroName) {
        if (!heroName) {
            return null;
        }
        heroName = this.fixHeroName(heroName);
        let heroId = this.getHeroId(heroName);
        if (heroId === null) {
            return null;
        }
        return path.join(HotsHelpers.getStorageDir(), "heroes", heroId+"_crop.png");
    }

    reloadDraftProvider() {
        this.sendEvent("gui", "draftProvider.reload");
    }
    draftProviderAction(...params) {
        this.sendEvent("gui", "draftProvider.action", ...params);
    }

    saveHeroBanImage(heroId, imageData) {
        this.sendEvent("gui", "ban.save", heroId, imageData);
    }

    saveCorrection(heroNameFailed, heroId) {
        this.sendEvent("gui", "hero.correct", heroNameFailed, heroId);
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
            this.refreshPage();
        }
    }
    setUpdateProgress(percent) {
        this.updateProgress = percent;
        jQuery(".page").find(".progress-bar").css("width", this.updateProgress+"%");
    }

    pauseDetection() {
        this.sendEvent("gui", "detection.pause");
    }

    resumeDetection() {
        this.sendEvent("gui", "detection.resume");
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
    refreshPage() {
        if (this.modalActive || (this.page !== "main")) {
            return;
        }
        this.renderPage();
    }

    renderDetectionTunerContent(targetElement, cbDone) {
        let debugDataGrouped = {};
        for (let i = 0; i < this.debugData.length; i++) {
            if (!debugDataGrouped.hasOwnProperty(this.debugData[i].colorsIdent)) {
                debugDataGrouped[this.debugData[i].colorsIdent] = {
                    images: [],
                    colorsPositive: this.debugData[i].colorsPositive,
                    colorsNegative: this.debugData[i].colorsNegative,
                    colorsInvert: this.debugData[i].colorsInvert
                };
            }
            debugDataGrouped[this.debugData[i].colorsIdent].images.push(this.debugData[i]);
        }
        Twig.renderFile(templates["detectionTuningContent"], {
            debugData: debugDataGrouped
        }, (error, html) => {
            if (error) {
                console.error(error);
            } else {
                jQuery(targetElement).html(html);
                cbDone();
            }
        });
    }

    updateBan(banData) {
        // Update local draft data
        for (let i = 0; i < this.draft.players.length; i++) {
            if ((this.draft.bans[i].team == banData.team) && (this.draft.bans[i].index == banData.index)) {
                this.draft.bans[i] = banData;
                break;
            }
        }
        // Update gui
        let selector = "[data-type=\"ban\"][data-team=\""+banData.team+"\"][data-index=\""+banData.index+"\"]";
        if (jQuery(selector).length === 0) {
            // No element available. Skip.
            // TODO: Render the whole page in this case?
            return;
        }
        Twig.renderFile(templates.elementBan, Object.assign({ gui: this }, banData), (error, html) => {
            if (error) {
                console.error(error);
            } else {
                jQuery(selector).replaceWith(html);
                jQuery(document).trigger("ban.init", jQuery(selector));
            }
        });
    }

    updatePlayer(playerData) {
        // Update local draft data
        for (let i = 0; i < this.draft.players.length; i++) {
            if ((this.draft.players[i].team == playerData.team) && (this.draft.players[i].index == playerData.index)) {
                this.draft.players[i] = playerData;
                break;
            }
        }
        // Update gui
        let selector = "[data-type=\"player\"][data-team=\""+playerData.team+"\"][data-index=\""+playerData.index+"\"]";
        if (jQuery(selector).length === 0) {
            // No element available. Skip.
            // TODO: Render the whole page in this case?
            return;
        }
        Twig.renderFile(templates.elementPlayer, Object.assign({ gui: this }, playerData), (error, html) => {
            if (error) {
                console.error(error);
            } else {
                jQuery(selector).replaceWith(html);
                jQuery(document).trigger("player.init", jQuery(selector));
            }
        });
    }

    updateDraftProvider(providerData) {
        // Update local draft data
        this.draft.provider = providerData;
        // Update gui
        let selector = "[data-type=\"draft-provider\"]";
        if (jQuery(selector).length === 0) {
            // No element available. Skip.
            // TODO: Render the whole page in this case?
            return;
        }
        let providerTemplate = path.resolve(__dirname, "..", "gui", providerData.template);
        Twig.renderFile(providerTemplate, Object.assign({ gui: this }, providerData.templateData), (error, html) => {
            if (error) {
                console.error(error);
            } else {
                jQuery(selector).replaceWith(html);
                jQuery(document).trigger("draftProvider.init", jQuery(selector));
            }
        });
    }

    updateTalentProvider(providerData) {
        // Update local draft data
        this.talents.provider = providerData;
        // Update gui
        let selector = "[data-type=\"talent-provider\"]";
        if (jQuery(selector).length === 0) {
            // No element available. Skip.
            // TODO: Render the whole page in this case?
            return;
        }
        let providerTemplate = path.resolve(__dirname, "..", "gui", providerData.template);
        Twig.renderFile(providerTemplate, Object.assign({ gui: this }, providerData.templateData), (error, html) => {
            if (error) {
                console.error(error);
            } else {
                jQuery(selector).replaceWith(html);
                jQuery(document).trigger("talentProvider.init", jQuery(selector));
            }
        });
    }
}

module.exports = HotsDraftGui;
