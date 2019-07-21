// Nodejs dependencies
const path = require('path');
const request = require('request');
const ioHook = require('iohook');
const screenshot = require('screenshot-desktop');
const Twig = require('twig');
const HotsReplay = require('hots-replay');

// Local classes
const EventHandler = require('./event-handler.js');
const HeroesCountersProvider = require('../src/external/heroescounters.js');
const HotsDraftScreen = require('../src/hots-draft-screen.js');
const HotsHelpers = require('../src/hots-helpers.js');

// Templates
const templateMain = path.resolve(__dirname, "..", "gui", "main.twig.html");
const templateWait = path.resolve(__dirname, "..", "gui", "wait.twig.html");
const templateUpdate = path.resolve(__dirname, "..", "gui", "update.twig.html");

class HotsDraftApp extends EventHandler {

    constructor() {
        super();
        this.debugEnabled = false;
        this.screen = new HotsDraftScreen();
        this.screen.on("update-done", () => {
            this.checkNextUpdate();
        });
        this.provider = new HeroesCountersProvider(this.screen);
        this.providerUpdated = false;
        this.displays = [];
        this.hotkeyUpdate = null;
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
            this.bindHotkeys();
            this.startDetection();
        });
        // Initialize
        this.init();
    }
    init() {
        // Init provider
        this.provider.init();
        this.provider.on("change", () => {
            this.update();
            this.render();
        });
        this.provider.on("update-started", () => {
            this.render();
        });
        this.provider.on("update-done", () => {
            this.providerUpdated = true;
            this.trigger("provider-updated");
            this.updateReadyState();
            this.render();
        });
        this.provider.downloadHotsData();
        // Detect displays
        this.detectDisplays();
    }
    debug(debugEnabled) {
        this.debugEnabled = debugEnabled;
        this.screen.debug(debugEnabled);
    }
    bindHotkeys() {
        if (this.hotkeyUpdate === null) {
            // Start updating via hotkey
            this.hotkeyUpdate = ioHook.registerShortcut([29, 32], (keys) => {
                this.screen.clear();
                this.queueUpdate();
            });
        }
        ioHook.start();
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
            if (this.statusGameLastReplay.mtime < this.statusGameSaveFile.mtime) {
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
            this.trigger("displays-detected");
            this.updateReadyState();
        });
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
                this.trigger("game-ended");
                if (this.debugEnabled) {
                    console.log("=== GAME ENDED ===");
                }
            }
        }
    }
    updateGameData() {
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
            if (this.providerUpdated && (this.displays.length > 0)) {
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
        screenshot({ format: 'png', screen: this.displays[0].id }).then((image) => {
            if (this.statusGameActive) {
                this.statusScreenshotPending = false;
                return;
            }
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
        let self = this;
        let container = jQuery(".content");
        // Render config template?
        let config = HotsHelpers.getConfig();
        if (config.isVisible()) {
            config.render(container, jQuery);
            return;
        }
        // Handler for the render result
        let renderResult = (error, html) => {
            if (error) {
                console.error(error);
            } else {
                jQuery(container).html(html);
            }
        };
        // App ready?
        if (this.ready) {
            if (this.statusDraftActive) {
                // Render draft screen
                Twig.renderFile(templateMain, { app: this, draft: this.screen, provider: this.provider }, renderResult);
            } else {
                // Show wait screen while not drafting
                Twig.renderFile(templateWait, { app: this }, renderResult);
            }
        } else {
            // Show update screen
            Twig.renderFile(templateUpdate, { app: this }, renderResult);
        }
    }
}

module.exports = HotsDraftApp;
