// Nodejs dependencies
const path = require('path');
const request = require('request');
const screenshot = require('screenshot-desktop');
const Twig = require('twig');
const HotsReplay = require('hots-replay');
const EventEmitter = require('events');

// Local classes
const HotsDraftScreen = require('../src/hots-draft-screen.js');
const HotsGameData = require('./hots-game-data.js');
const HotsHelpers = require('../src/hots-helpers.js');

// Templates
const templates = {
    "main": path.resolve(__dirname, "..", "gui", "pages", "main.twig.html"),
    "config": path.resolve(__dirname, "..", "gui", "pages", "config.twig.html"),
    "wait": path.resolve(__dirname, "..", "gui", "pages", "wait.twig.html"),
    "update": path.resolve(__dirname, "..", "gui", "pages", "update.twig.html")
};

class HotsDraftApp extends EventEmitter {

    constructor() {
        super();
        this.debugEnabled = false;
        this.gameData = new HotsGameData( HotsHelpers.getConfig().getOption("language") );
        this.screen = new HotsDraftScreen(this);
        this.provider = null;
        this.displays = null;
        // Status fields
        this.statusDownloadPending = false;
        this.statusGameActive = false;
        this.statusGameActiveLock = null;
        this.statusGameSaveFile = { file: null, mtime: 0, updated: 0 };
        this.statusGameLastReplay = { file: null, mtime: 0, updated: 0 };
        this.statusDraftData = null;
        this.statusUpdatePending = false;
        this.statusDraftActive = false;
        this.statusModalActive = false;
        this.statusDetectionRunning = false;
        this.statusDetectionPaused = false;
        // Initialize
        this.registerEvents();
    }
    createProvider() {
        const ProviderName = HotsHelpers.getConfig().getOption("provider");
        const Provider = require('../src/external/'+ProviderName+'.js');
        return new Provider(this);
    }
    registerEvents() {
        // Bind ready event
        this.on("ready", () => {
            this.updatePage();
            this.startDetection();
        });
        this.on("draft.started", () => {
            this.sendDraftData();
            this.updatePage();
        });
        this.on("draft.ended", () => {
            this.updatePage();
        })
        // Detection events
        this.screen.on("detect.teams.new", () => {
            if (this.statusDraftActive) {
                this.sendDraftData();
                // Register events for updating singular elements
                let teams = this.screen.getTeams();
                for (let t = 0; t < teams.length; t++) {
                    let team = teams[t];
                    team.on("ban.update", (banIndex) => {
                        this.sendBan(team, banIndex);
                    });
                    let players = team.getPlayers();
                    for (let p = 0; p < players.length; p++) {
                        let player = players[p];
                        players[p].on("change", () => {
                            this.sendPlayerData(player);
                        });
                    }
                }
            }
        });
        this.screen.on("detect.error", (error) => {
            this.setDebugStep("Detection failed!")
            this.checkNextUpdate();
            if (this.debugEnabled) {
                console.log("Analysing screenshot failed!");
            }
        });
        this.screen.on("detect.success", () => {
            this.setDebugStep("Detection successful!")
            this.checkNextUpdate();
            if (this.debugEnabled) {
                console.log("Analysing screenshot successful!");
            }
        });
        this.screen.on("detect.done", () => {
            this.statusDetectionRunning = false;
            if (this.debugEnabled) {
                this.sendDebugData();
            }
            let playersLocked = 0;
            let teams = this.screen.getTeams();
            for (let t = 0; t < teams.length; t++) {
                let players = teams[t].getPlayers();
                for (let p = 0; p < players.length; p++) {
                    if (players[p].isLocked()) {
                        playersLocked++;
                    }
                }
            }
            if (playersLocked === 10) {
                this.statusGameActive = true;
                this.statusGameActiveLock = (new Date()).getTime() + 1000 * 180;
            }
        });
        this.screen.on("detect.map.start", () => {
            this.setDebugStep("Detecting map...")
        });
        this.screen.on("detect.timer.start", () => {
            this.setDebugStep("Detecting active team...")
        });
        this.screen.on("detect.teams.start", () => {
            this.setDebugStep("Detecting picks and bans...")
        });
        // Download events for game data
        this.gameData.on("download.start", () => {
            this.statusDownloadPending = true;
            this.sendEvent("gui", "download.start");
        });
        this.gameData.on("download.progress", (percent) => {
            this.sendEvent("gui", "download.progress", percent);
        });
        this.gameData.on("download.done", (success) => {
            if (success) {
                this.statusDownloadPending = false;
                this.sendEvent("gui", "download.done");
                this.sendGameData();
                this.updateReadyState();
            } else {
                // Retry
                this.gameData.update();
            }
        });
    }
    handleEvent(type, parameters) {
        switch (type) {
            case "ban.save":
                this.screen.saveHeroBanImage(...parameters);
                break;
            case "config.option.set":
                HotsHelpers.getConfig().setOption(...parameters);
                switch (parameters[0]) {
                    case "language":
                        this.statusDownloadPending = true;
                        this.updateLanguage();
                        this.updateForced();
                        this.updatePage();
                        break;
                    case "provider":
                        this.initProvider();
                        break;
                }
                break;
            case "detection.pause":
                this.statusDetectionPaused = true;
                break;
            case "detection.resume":
                this.statusDetectionPaused = false;
                break;
            case "hero.correct":
                this.gameData.addHeroCorrection(...parameters);
                break;
            case "provider.action":
                this.provider.handleGuiAction(parameters);
                break;
            case "provider.reload":
                this.initProvider();
                break;
            case "update.forced":
                this.updateForced();
                break;
            case "window.ready":
                this.sendConfig();
                this.init();
                break;
        }
    }
    sendEvent(channel, type, ...parameters) {
        process.send([channel, type, ...parameters]);
    }
    sendConfig() {
        this.sendEvent("gui", "config", HotsHelpers.getConfig().options);
    }
    sendDraftData() {
        this.sendEvent("gui", "draft", this.collectDraftData());
    }
    sendGameData() {
        this.sendEvent("gui", "gameData", {
            languageOptions: this.gameData.languageOptions,
            heroes: this.gameData.heroes,
            maps: this.gameData.maps,
            substitutions: this.gameData.substitutions
        });
    }
    sendDebugData() {
        if (this.screen.debugData.length > 1) {
            this.sendEvent("gui", "debugData", this.screen.debugData);
        }
    }
    sendBan(team, banIndex) {
        this.sendEvent("gui", "ban.update", this.collectBanData(team, banIndex));
    }
    sendPlayerData(player) {
        this.sendEvent("gui", "player.update", this.collectPlayerData(player));
    }
    sendProvider(provider) {
        this.sendEvent("gui", "provider.update", this.collectProviderData(provider));
    }
    init() {
        this.initProvider();
        this.downloadGameData();
        this.detectDisplays();
    }
    initProvider() {
        // Init provider
        this.provider = this.createProvider();
        this.provider.init();
        this.provider.on("change", () => {
            if (this.statusDraftActive) {
                this.sendProvider(this.provider);
            }
        });
    }
    detectDisplays() {
        screenshot.listDisplays().then((displays) => {
            this.displays = displays;
            this.sendEvent("gui", "displays.detected", displays);
            // Update config
            let displayPrimary = null;
            let displayConfig = HotsHelpers.getConfig().getOption("gameDisplay");
            let displayConfigFound = false;
            for (let i = 0; i < displays.length; i++) {
                if (displays[i].id == displayConfig) {
                    displayConfigFound = true;
                    break;
                }
                if (displays[i].primary) {
                    displayPrimary = displays[i].id;
                }
            }
            if (!displayConfigFound) {
                HotsHelpers.getConfig().setOption("gameDisplay", (displayPrimary !== null ? displayPrimary : null));
            }
            // Update status
            this.emit("displays.detected");
            this.updateReadyState();
            // Debug output
            if (this.debugEnabled) {
                console.log("=== DISPLAYS DETECTED ===");
            }
        });
    }
    downloadGameData() {
        this.statusDownloadPending = true;
        this.gameData.update();
    }
    setDebugStep(step) {
        this.sendEvent("gui", "debug.step.update", step);
    }
    updateForced() {
        this.screen.clear();
        this.update();
        this.sendDraftData();
    }
    updateReadyState() {
        if (!this.ready) {
            if (!this.statusDownloadPending && (this.displays !== null)) {
                this.ready = true;
                this.emit("ready");
            }
        }
    }
    updatePage() {
        if (this.statusModalActive) {
            // Do not re-updatePage while a correction modal is active
            return;
        }
        // Render config template?
        let config = HotsHelpers.getConfig();
        if (config.isVisible()) {
            this.sendEvent("gui", "page.set", "config");
            return;
        }
        // App ready?
        if (this.ready) {
            if (this.statusDraftActive) {
                // Render draft screen
                this.sendEvent("gui", "page.set", "main");
            } else {
                // Show wait screen while not drafting
                this.sendEvent("gui", "page.set", "wait");
            }
        } else {
            // Show update screen
            this.sendEvent("gui", "page.set", "update");
        }
    }
    quit() {
        this.app.quit();
    }


    debug(debugEnabled) {
        this.debugEnabled = debugEnabled;
        this.screen.debug(debugEnabled);
    }
    checkNextUpdate() {
        if (!this.statusGameActive && (this.screen.getMap() !== null)) {
            setTimeout(() => {
                this.update();
            }, 100);
        } else {
            this.queueUpdate();
        }
    }
    isGameActive() {
        let now = (new Date()).getTime();
        if (now < this.statusGameActiveLock) {
            return true;
        }
        if (this.statusGameSaveFile !== null) {
            let latestSaveAge = (now - this.statusGameSaveFile.mtime) / 1000;
            if ((this.statusGameSaveFile.mtime - this.statusGameLastReplay.mtime) / 1000 > 30) {
                return (latestSaveAge < 150);
            } else {
                // New replay available, game is done!
                return false;
            }
        } else {
            return false;
        }
    }
    getConfig() {
        return HotsHelpers.getConfig();
    }
    setModalActive(active) {
        this.statusModalActive = active;
    }
    startDetection() {
        this.update();
    }
    queueUpdate() {
        if (!this.statusUpdatePending) {
            this.statusUpdatePending = true;
            setTimeout(() => {
                this.update();
            }, 1000);
        }
    }
    submitReplayData() {
        if (this.statusDraftData === null) {
            return;
        }
        let gameData = this.statusDraftData;
        // Clear draft state
        this.statusDraftData = null;
        // Replay found?
        if (this.statusGameLastReplay.file === null) {
            return;
        }
        // Submit player names and images
        let replay = new HotsReplay(this.statusGameLastReplay.file);
        let replayDetails = replay.getReplayDetails();
        // Validate map name
        if (gameData.map !== replayDetails.m_title.toUpperCase()) {
            return;
        }
        // Match players
        let playersLeft = gameData.players;
        let playersMatched = [];
        for (let r = 0; r < replayDetails.m_playerList.length; r++) {
            for (let i = 0; i < playersLeft.length; i++) {
                if ((playersLeft[i].playerName === replayDetails.m_playerList[r].m_name) ||
                    (playersLeft[i].heroName === replayDetails.m_playerList[r].m_hero.toUpperCase())) {
                    // Player- or Hero-Name matches!
                    playersLeft[i].playerName = replayDetails.m_playerList[r].m_name;
                    playersLeft[i].heroName = replayDetails.m_playerList[r].m_hero.toUpperCase();
                    playersMatched.push( playersLeft[i] );
                    playersLeft.splice(i, 1);
                    break;
                }
            }
        }
        if (playersMatched.length < 9) {
            return;
        }
        for (let i = 0; i < playersMatched.length; i++) {
            let player = playersMatched[i];
            if (player.playerNameImage !== null) {
                this.submitTrainingImage("playerName", player.playerName, player.playerNameImage);
            }
            if (player.heroNameImage !== null) {
                this.submitTrainingImage("heroName", player.heroName, player.heroNameImage);
            }
        }
    }

    /**
     * @param {string} type
     * @param {string} text
     * @param {Buffer} image
     */
    submitTrainingImage(type, text, image) {
        let url = "https://hotsdrafter.godlike.biz/training.php";
        let parameters = {
            "type": type, "text": text, image: image
        };
        request.post({ url: url, formData: parameters }, (err, httpResponse, body) => {
            // TODO: Error handling
        });
    }
    update() {
        this.statusUpdatePending = false;
        // Update game files
        this.updateGameFiles();
        // Update status
        if (this.statusGameActive) {
            if (this.statusDraftActive) {
                // Draft just ended
                this.statusDraftActive = false;
                this.emit("draft.ended");
                if (this.debugEnabled) {
                    console.log("=== DRAFT ENDED ===");
                }
            }
        } else {
            // Check draft status
            if (this.screen.getMap() !== null) {
                // Draft is active
                if (!this.statusDraftActive) {
                    // Draft just started
                    this.statusDraftActive = true;
                    this.emit("draft.started");
                    if (this.debugEnabled) {
                        console.log("=== DRAFT STARTED ===");
                    }
                }
            } else {
                // Draft not active
                if (this.statusDraftActive) {
                    // Draft just ended
                    this.statusDraftActive = false;
                    this.emit("draft.ended");
                    if (this.debugEnabled) {
                        console.log("=== DRAFT ENDED ===");
                    }
                }
            }
            this.updateScreenshot();
        }
        this.checkNextUpdate();
    }
    updateGameFiles() {
        let timeNow = (new Date()).getTime();
        // Check save file
        let saveUpdateAge = (timeNow - this.statusGameSaveFile.updated) / 1000;
        if (saveUpdateAge > 10) {
            this.statusGameSaveFile = HotsHelpers.getConfig().getLatestSaveFile();
        }
        let replayUpdateAge = (timeNow - this.statusGameLastReplay.updated) / 1000;
        if (replayUpdateAge > 30) {
            this.statusGameLastReplay =  HotsHelpers.getConfig().getLatestReplayFile();
        }
        // Check if game state changed
        let gameActive = this.isGameActive();
        if (this.statusGameActive !== gameActive) {
            this.statusGameActive = gameActive
            if (gameActive) {
                // Game started
                this.updateDraftData();
                this.screen.clear();
                this.emit("game.started");
                this.sendEvent("gui", "game.start");
                this.setDebugStep("Waiting for game to end...");
                if (this.debugEnabled) {
                    console.log("=== GAME STARTED ===");
                }
            } else {
                // Game ended
                this.submitReplayData();
                this.emit("game.ended");
                this.sendEvent("gui", "game.end");
                if (this.debugEnabled) {
                    console.log("=== GAME ENDED ===");
                }
            }
            this.updatePage();
        }
    }
    collectDraftData() {
        let draftData = {
            map: this.screen.getMap(),
            provider: this.collectProviderData(this.provider),
            bans: [],
            players: []
        };
        let teams = this.screen.getTeams();
        for (let t = 0; t < teams.length; t++) {
            let team = teams[t];
            let bans = team.getBans();
            for (let i in bans) {
                draftData.bans.push( this.collectBanData(team, i) );
            }
            for (let i in team.getPlayers()) {
                let player = team.getPlayer(i);
                draftData.players.push( this.collectPlayerData(player) );
            }
        };
        return draftData;
    }
    collectProviderData(provider) {
        return {
            template: provider.getTemplate(),
            templateData: provider.getTemplateData()
        };
    }
    collectBanData(team, index) {
        let banImage = team.getBanImageData(index);
        return {
            index: index,
            team: team.getColor(),
            heroName: team.getBanHero(index),
            heroImage: (banImage !== null ? banImage.toString('base64') : null)
        };
    }
    collectPlayerData(player) {
        return {
            index: player.getIndex(),
            team: player.getTeam().getColor(),
            playerName: player.getName(),
            playerNameImage: player.getImagePlayerName().toString('base64'),
            heroName: player.getCharacter(),
            heroNameImage: (player.isLocked() ? player.getImageHeroName().toString('base64') : null),
            detectionFailed: player.isDetectionFailed(),
            locked: player.isLocked()
        };
    }
    updateLanguage() {
        this.screen.updateLanguage();
        this.gameData.updateLanguage();
    }
    updateDraftData() {
        this.setDebugStep("Checking draft data...");
        this.statusDraftData = this.collectDraftData();
    }
    updateScreenshot() {
        if (this.statusDetectionRunning || this.screen.updateActive || this.statusDetectionPaused) {
            return;
        }
        this.statusDetectionRunning = true;
        let screenshotOptions = { format: 'png' };
        if (this.displays.length > 0) {
            screenshotOptions.screen = this.displays[0].id;
        }
        this.setDebugStep("Capturing screenshot...");
        screenshot(screenshotOptions).then((image) => {
            if (this.statusGameActive) {
                this.statusDetectionRunning = false;
                return;
            }
            this.setDebugStep("Analysing screenshot...");
            if (this.debugEnabled) {
                console.log("Analysing screenshot...");
            }
            this.screen.detect(image).catch((error) => {
                if (this.debugEnabled) {
                    if (error.message === "No map text found at the expected location!") {
                        console.log("Screenshot not detected: No draft found (Map name not detected)")
                    } else {
                        console.error(error);
                        console.error(error.stack);
                    }
                }
            });
        }).catch((error) => {
            this.statusDetectionRunning = false;
            if (this.debugEnabled) {
                console.error(error);
                console.error(error.stack);
            }
        });
        /*
        screen.detect("demo/hots-draft-2.png");
        screen.detect("demo/hots-draft-2.png").then(() => {
            console.log("DETECT DONE!");
            screen.detect("demo/hots-draft-4.png").then(() => {
                console.log("UPDATE DONE!");
                screen.detect("demo/hots-draft-6.png");
            });
        });
        */
    }
}

module.exports = HotsDraftApp;
