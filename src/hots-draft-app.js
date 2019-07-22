// Nodejs dependencies
const path = require('path');
const request = require('request');
const screenshot = require('screenshot-desktop');
const Twig = require('twig');
const HotsReplay = require('hots-replay');

// Local classes
const EventHandler = require('./event-handler.js');
const HotsDraftScreen = require('../src/hots-draft-screen.js');
const HotsHelpers = require('../src/hots-helpers.js');

// Templates
const templates = {
    "main": path.resolve(__dirname, "..", "gui", "pages", "main.twig.html"),
    "config": path.resolve(__dirname, "..", "gui", "pages", "config.twig.html"),
    "wait": path.resolve(__dirname, "..", "gui", "pages", "wait.twig.html"),
    "update": path.resolve(__dirname, "..", "gui", "pages", "update.twig.html")
};

class HotsDraftApp extends EventHandler {

    constructor(window) {
        super();
        this.debugEnabled = false;
        this.debugStep = "Initializing...";
        this.document = window.document;
        this.window = window;
        this.screen = new HotsDraftScreen();
        this.screen.on("update-done", () => {
            this.checkNextUpdate();
        });
        this.provider = null;
        this.providerUpdated = false;
        this.displays = null;
        // Status fields
        this.statusGameActive = false;
        this.statusGameSaveFile = { file: null, mtime: 0, updated: 0 };
        this.statusGameLastReplay = { file: null, mtime: 0, updated: 0 };
        this.statusGameData = null;
        this.statusUpdatePending = false;
        this.statusDraftActive = false;
        this.statusModalActive = false;
        this.statusScreenshotPending = false;
        // Bind ready event
        this.on("ready", () => {
            this.startDetection();
        });
        // Initialize
        this.init();
    }
    createProvider() {
        const ProviderName = HotsHelpers.getConfig().getOption("provider");
        const Provider = require('../src/external/'+ProviderName+'.js');
        return new Provider(this.screen);
    }
    initProvider() {
        // Init provider
        this.provider = this.createProvider();
        this.providerUpdated = false;
        this.provider.init();
        this.provider.on("change", () => {
            this.update();
        });
        this.provider.on("update-started", () => {
            this.render();
        });
        this.provider.on("update-done", () => {
            this.providerUpdated = true;
            this.trigger("provider-updated");
            this.updateReadyState();
            this.render();
            // Debug output
            if (this.debugEnabled) {
                console.log("=== PROVIDER UPDATED ===");
            }
        });
        this.provider.downloadHotsData();
    }
    init() {
        this.initProvider();
        // Detect displays
        this.detectDisplays();
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
        if (this.statusGameSaveFile !== null) {
            let latestSaveAge = ((new Date()).getTime() - this.statusGameSaveFile.mtime) / 1000;
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
    detectDisplays() {
        screenshot.listDisplays().then((displays) => {
            this.displays = displays;
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
            this.trigger("displays-detected");
            this.updateReadyState();
            // Debug output
            if (this.debugEnabled) {
                console.log("=== DISPLAYS DETECTED ===");
            }
        });
    }
    startDetection() {
        this.update();
    }
    setDebugStep(step) {
        this.debugStep = step;
        jQuery(".debug-step").text(step);
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
        if (this.statusGameData === null) {
            return;
        }
        let gameData = this.statusGameData;
        // Clear draft state
        this.statusGameData = null;
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
            "type": type, "text": text, image: image.toString('base64')
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
                this.trigger("draft-ended");
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
                    this.trigger("draft-started");
                    if (this.debugEnabled) {
                        console.log("=== DRAFT STARTED ===");
                    }
                }
            } else {
                // Draft not active
                if (this.statusDraftActive) {
                    // Draft just ended
                    this.statusDraftActive = false;
                    this.trigger("draft-ended");
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
                this.updateGameData();
                this.screen.clear();
                this.trigger("game-started");
                if (this.debugEnabled) {
                    console.log("=== GAME STARTED ===");
                }
            } else {
                // Game ended
                this.submitReplayData();
                this.render();
                this.trigger("game-ended");
                if (this.debugEnabled) {
                    console.log("=== GAME ENDED ===");
                }
            }
        }
    }
    updateGameData() {
        this.setDebugStep("Checking game data...");
        this.statusGameData = {
            map: this.screen.getMap(),
            players: []
        };
        let teamRed = this.screen.getTeam("red");
        if (teamRed !== null) {
            for (let i in teamRed.getPlayers()) {
                let player = teamRed.getPlayer(i);
                this.statusGameData.players.push({
                    team: "red",
                    playerName: player.getName(),
                    playerNameImage: player.getImagePlayerName(),
                    heroName: player.getCharacter(),
                    heroNameImage: (player.isLocked() ? player.getImageHeroName() : null)
                });
            }
        }
        let teamBlue = this.screen.getTeam("blue");
        if (teamBlue !== null) {
            for (let i in teamBlue.getPlayers()) {
                let player = teamBlue.getPlayer(i);
                this.statusGameData.players.push({
                    team: "blue",
                    playerName: player.getName(),
                    playerNameImage: player.getImagePlayerName(),
                    heroName: player.getCharacter(),
                    heroNameImage: (player.isLocked() ? player.getImageHeroName() : null)
                });
            }
        }
    }
    updateReadyState() {
        if (!this.ready) {
            if (this.providerUpdated && (this.displays !== null)) {
                this.ready = true;
                this.trigger("ready");
            }
        }
    }
    updateScreenshot() {
        if (this.statusScreenshotPending || this.screen.updateActive) {
            return;
        }
        this.statusScreenshotPending = true;
        let screenshotOptions = { format: 'png' };
        if (this.displays.length > 0) {
            screenshotOptions.screen = this.displays[0].id;
        }
        this.setDebugStep("Capturing screenshot...");
        screenshot(screenshotOptions).then((image) => {
            if (this.statusGameActive) {
                this.statusScreenshotPending = false;
                return;
            }
            this.setDebugStep("Analysing screenshot...");
            this.screen.detect(image).catch((error) => {
                if (this.debugEnabled) {
                    if (this.screen.getMap() === null) {
                        console.log("Screenshot not detected: No draft found (Map name not detected)")
                    } else {
                        console.error(error);
                        console.error(error.stack);
                    }
                }
            }).finally(() => {
                this.statusScreenshotPending = false;
            });
        }).catch((error) => {
            this.statusScreenshotPending = false;
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
    render() {
        if (this.statusModalActive) {
            // Do not re-render while a correction modal is active
            return;
        }
        // Render config template?
        let config = HotsHelpers.getConfig();
        if (config.isVisible()) {
            this.renderPage("config");
            return;
        }
        // App ready?
        if (this.ready) {
            if (this.statusDraftActive) {
                // Render draft screen
                this.renderPage("main");
            } else {
                // Show wait screen while not drafting
                this.renderPage("wait");
            }
        } else {
            // Show update screen
            this.renderPage("update");
        }
    }
    renderPage(ident) {
        Twig.renderFile(templates[ident], {
            app: this,
            draft: this.screen,
            provider: this.provider,
            config: HotsHelpers.getConfig(),
            pageActive: ident
        }, (error, html) => {
            if (error) {
                console.error(error);
            } else {
                jQuery(".page").html(html);
            }
        });
    }
}

module.exports = HotsDraftApp;
