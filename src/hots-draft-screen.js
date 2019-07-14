// Librarys
const { TesseractWorker, TesseractUtils, ...TesseractTypes } = require('tesseract.js');
const worker = new TesseractWorker();
const jimp = require('jimp');
const path = require('path');
const fs = require('fs');

// Local classes
const EventHandler = require('./event-handler.js');
const HotsHelpers = require('./hots-helpers.js');
const HotsDraftTeam = require('./hots-draft-team.js');
const HotsDraftPlayer = require('./hots-draft-player.js');

// Data files
const DraftLayout = require('../data/draft-layout');

class HotsDraftScreen extends EventHandler {

    constructor() {
        super();
        this.tessLangs = "eng";
        this.tessParams = {
            tessedit_pageseg_mode: TesseractTypes.PSM.SINGLE_LINE
        };
        this.generateDebugFiles = false;
        this.offsets = {};
        this.banImages = {};
        this.screenshot = null;
        this.map = null;
        this.teams = [];
    }
    loadOffsets() {
        let baseSize = DraftLayout["screenSizeBase"];
        let targetSize = { "x": this.screenshot.bitmap.width, "y": this.screenshot.bitmap.height };
        this.offsets["mapSize"] = HotsHelpers.scaleOffset(DraftLayout["mapSize"], baseSize, targetSize);
        this.offsets["banSize"] = HotsHelpers.scaleOffset(DraftLayout["banSize"], baseSize, targetSize);
        this.offsets["mapPos"] = HotsHelpers.scaleOffset(DraftLayout["mapPos"], baseSize, targetSize);
        this.offsets["playerSize"] = HotsHelpers.scaleOffset(DraftLayout["playerSize"], baseSize, targetSize);
        this.offsets["nameSize"] = HotsHelpers.scaleOffset(DraftLayout["nameSize"], baseSize, targetSize);
        this.offsets["nameHeroSizeRotated"] = HotsHelpers.scaleOffset(DraftLayout["nameHeroSizeRotated"], baseSize, targetSize);
        this.offsets["namePlayerSizeRotated"] = HotsHelpers.scaleOffset(DraftLayout["namePlayerSizeRotated"], baseSize, targetSize);
        this.offsets["teams"] = {};
        for (let team in DraftLayout["teams"]) {
            let players = [];
            for (let i = 0; i < DraftLayout["teams"][team]["players"].length; i++) {
                players.push(HotsHelpers.scaleOffset(DraftLayout["teams"][team]["players"][i], baseSize, targetSize));
            }
            let bans = [];
            for (let i = 0; i < DraftLayout["teams"][team]["bans"].length; i++) {
                bans.push(HotsHelpers.scaleOffset(DraftLayout["teams"][team]["bans"][i], baseSize, targetSize));
            }
            this.offsets["teams"][team] = {
                "players": players,
                "bans": bans,
                "name": HotsHelpers.scaleOffset(DraftLayout["teams"][team]["name"], baseSize, targetSize),
                "nameHeroRotated": HotsHelpers.scaleOffset(DraftLayout["teams"][team]["nameHeroRotated"], baseSize, targetSize),
                "namePlayerRotated": HotsHelpers.scaleOffset(DraftLayout["teams"][team]["namePlayerRotated"], baseSize, targetSize)
            };
        }
    }
    loadBanImages() {
        let self = this;
        return new Promise((resolve, reject) => {
            const directoryPath = path.resolve(__dirname, '../gfx/heroes');
            fs.readdir(directoryPath, function (err, files) {
                if (err) {
                    return console.log('Unable to scan directory: ' + err);
                }
                let pending = 1;
                let sizeBan = self.offsets["banSize"];
                files.forEach(function (file) {
                    let match = file.match(/^(.+)\.jpg$/);
                    if (match) {
                        // Load image
                        let heroName = match[1];
                        pending++;
                        jimp.read(directoryPath+"/"+file).then(async (image) => {
                            image.crop(28, 25, sizeBan.x, sizeBan.y).scale(0.25);
                            self.banImages[heroName] = image;
                            if (--pending <= 0) {
                                resolve(true);
                            }
                        }).catch((error) => {
                            console.error("Error loading image '"+directoryPath+"/"+file+"'");
                            console.error(error);
                            console.error(error.stack);
                            reject(error);
                        });
                    }
                });
                if (--pending <= 0) {
                    resolve(true);
                }
            });
        });
    }
    debug(generateDebugFiles) {
        this.generateDebugFiles = generateDebugFiles;
    }
    clear() {
        this.screenshot = null;
        this.map = null;
        this.teams = [];
    }
    detect(screenshotFile) {
        // Start detection
        let self = this;
        return new Promise((resolve, reject) => {
            jimp.read(screenshotFile).then(async (image) => {
                self.trigger("update-started");
                self.screenshot = image;
                self.loadOffsets();
                await self.loadBanImages();
                try {
                    // Map not yet detected
                    if (!await self.detectMap()) {
                        reject("Map not detected!");
                        return;
                    }
                    let pending = 1;    // Ensure not to resolve before everything was started
                    // Teams
                    if (self.teams.length === 0) {
                        // Teams not yet detected
                        pending++;
                        self.detectTeams().then(() => {
                            if (--pending <= 0) {
                                resolve(true);
                                self.trigger("update-done");
                            }
                        }).catch((error) => {
                            reject("Teams not detected!");
                            console.error(error);
                            console.error(error.stack);
                        });
                    } else {
                        // Update teams
                        pending++;
                        self.updateTeams().then(() => {
                            if (--pending <= 0) {
                                resolve(true);
                                self.trigger("update-done");
                            }
                        }).catch((error) => {
                            reject("Failed to update teams!");
                            console.error(error);
                            console.error(error.stack);
                        });
                    }
                    // Can finish now
                    if (--pending <=0) {
                        resolve(true);
                        self.trigger("update-done");
                    }
                } catch (error) {
                    reject(error);
                }
            }).catch((error) => {
                console.error("Error loading screenshot '"+screenshotFile+"'");
                console.error(error);
                console.error(error.stack);
                reject(error);
            });
        });
    }
    detectMap() {
        let self = this;
        return new Promise((resolve, reject) => {
            let mapPos = self.offsets["mapPos"];
            let mapSize = self.offsets["mapSize"];
            let mapNameImg = self.screenshot.clone().crop(mapPos.x, mapPos.y, mapSize.x, mapSize.y);
            // Cleanup and trim map name
            if (!HotsHelpers.imageCleanupName(mapNameImg, DraftLayout["colors"]["mapName"])) {
                reject("No map text found at the expected location!");
                return;
            }
            // Convert to black on white for optimal detection
            mapNameImg.greyscale().contrast(0.4).normalize().blur(1).invert();
            if (this.generateDebugFiles) {
                // Debug output
                mapNameImg.write("debug/mapName.jpg");
            }
            // Detect map name using tesseract
            mapNameImg.getBufferAsync(jimp.MIME_PNG).then((buffer) => {
                worker.recognize(buffer, self.tessLangs, self.tessParams).then((result) => {
                    let mapName = result.text.trim();
                    if (mapName !== "") {
                        self.setMap(mapName);
                        self.trigger("map-detected", mapName);
                        self.trigger("change");
                        resolve(true);
                    } else {
                        reject("Map name could not be detected!");
                    }
                }).catch((error) => {
                    reject(error);
                });
            });
        });
    }
    detectTeams() {
        return new Promise(async (resolve, reject) => {
            let teamsPending = 2;
            this.detectTeam("blue").then(() => {
                if (--teamsPending <= 0) {
                    resolve(true);
                }
            }).catch((error) => {
                console.error(error);
                console.log(error.stack);
                reject(error);
            });
            this.detectTeam("red").then(() => {
                if (--teamsPending <= 0) {
                    resolve(true);
                }
            }).catch((error) => {
                console.error(error);
                console.log(error.stack);
                reject(error);
            });
        });
    }
    detectTeam(color) {
        let self = this;
        return new Promise(async (resolve, reject) => {
            let team = new HotsDraftTeam(color);
            let playerPos = self.offsets["teams"][color]["players"];
            let pending = 1;
            this.addTeam(team);
            // Bans
            pending++;
            self.detectBans(team).then(() => {
                if (--pending <= 0) {
                    resolve(true);
                }
            }).catch((error) => {
                reject("Bans not detected!");
                console.error(error);
                console.error(error.stack);
            });
            // Players
            for (let i = 0; i < playerPos.length; i++) {
                let player = new HotsDraftPlayer(i, team);
                pending++;
                self.detectPlayer(player).then(() => {
                    team.addPlayer(player);
                    self.trigger("player-detected", player);
                    self.trigger("change");
                    if (--pending <= 0) {
                        resolve(true);
                    }
                }).catch((error) => {
                    console.error(error);
                    console.log(error.stack);
                    reject(error);
                });
            }
            if (--pending <= 0) {
                resolve(true);
            }
        });
    }
    detectBans(team) {
        let self = this;
        return new Promise(async (resolve, reject) => {
            let teamOffsets = self.offsets["teams"][team.getColor()];
            // Get offsets
            let posBans = teamOffsets["bans"];
            let sizeBan = self.offsets["banSize"];
            // Check bans
            for (let i = 0; i < posBans.length; i++) {
                let posBan = posBans[i];
                let banImg = self.screenshot.clone().crop(posBan.x, posBan.y, sizeBan.x, sizeBan.y).scale(0.25);
                if (HotsHelpers.imageBackgroundMatch(banImg, DraftLayout["colors"]["banBackground"])) {
                    // No ban yet
                    team.addBan(i, null);
                } else {
                    // Debug output
                    banImg.write("debug/" + team.color + "_ban" + i + "_Test.jpg");
                    let matchBestHero = null;
                    let matchBestValue = 0;
                    for (let heroName in self.banImages) {
                        let heroValue = HotsHelpers.imageCompare(banImg, self.banImages[heroName]);
                        if (heroValue > matchBestValue) {
                            matchBestHero = heroName;
                            matchBestValue = heroValue;
                        }
                    }
                    team.addBan(i, matchBestHero);
                }
            }
            resolve(true);
        });
    }
    detectPlayer(player) {
        let self = this;
        return new Promise(async (resolve, reject) => {
            let index = player.getIndex();
            let team = player.getTeam();
            let teamOffsets = self.offsets["teams"][team.getColor()];
            // Get offsets
            let posPlayer = teamOffsets["players"][index];
            let posName = teamOffsets["name"];
            let posHeroNameRot = teamOffsets["nameHeroRotated"];
            let posPlayerNameRot = teamOffsets["namePlayerRotated"];
            let sizePlayer = self.offsets["playerSize"];
            let sizeName = self.offsets["nameSize"];
            let sizeHeroNameRot = self.offsets["nameHeroSizeRotated"];
            let sizePlayerNameRot = self.offsets["namePlayerSizeRotated"];
            try {
                let detectionsPending = 0;
                let playerImg = self.screenshot.clone().crop(posPlayer.x, posPlayer.y, sizePlayer.x, sizePlayer.y);
                if (this.generateDebugFiles) {
                    // Debug output
                    playerImg.write("debug/" + team.color + "_player" + index + "_Test.jpg");
                }
                let playerImgNameRaw = playerImg.clone().crop(posName.x, posName.y, sizeName.x, sizeName.y).scale(4, jimp.RESIZE_BILINEAR).rotate(posName.angle, jimp.RESIZE_BEZIER);
                if (this.generateDebugFiles) {
                    // Debug output
                    playerImgNameRaw.write("debug/" + team.color + "_player" + index + "_NameTest.jpg");
                }
                if (!player.isLocked()) {
                    // Cleanup and trim hero name
                    let heroImgName = playerImgNameRaw.clone().crop(posHeroNameRot.x, posHeroNameRot.y, sizeHeroNameRot.x, sizeHeroNameRot.y);
                    let heroVisible = false;
                    let heroLocked = false;
                    if (HotsHelpers.imageBackgroundMatch(heroImgName, DraftLayout["colors"]["heroBackgroundLocked"][team.getColor()])) {
                        // Hero locked!
                        if (HotsHelpers.imageCleanupName(heroImgName, DraftLayout["colors"]["heroNameLocked"][team.getColor()], [], 0x000000FF, 0xFFFFFFFF)) {
                            heroImgName.greyscale().contrast(0.4).normalize().blur(1).scale(0.5, jimp.RESIZE_BILINEAR);
                            heroVisible = true;
                            heroLocked = true;
                        }
                    } else {
                        player.setLocked(false);
                        if (team.getColor() === "blue") {
                            // Hero not locked!
                            if (HotsHelpers.imageCleanupName(heroImgName, DraftLayout["colors"]["heroNamePrepick"][team.getColor()])) {
                                heroImgName.greyscale().normalize().blur(1).scale(0.5, jimp.RESIZE_BILINEAR).invert();
                                heroVisible = true;
                            }
                        }
                    }
                    if (this.generateDebugFiles) {
                        // Debug output
                        heroImgName.write("debug/" + team.color + "_player" + index + "_HeroNameTest.jpg");
                    }
                    if (heroVisible) {
                        // Detect hero name using tesseract
                        detectionsPending++;
                        heroImgName.getBufferAsync(jimp.MIME_PNG).then((buffer) => {
                            worker.recognize(buffer, self.tessLangs, self.tessParams).then((result) => {
                                let heroName = result.text.trim();
                                if (heroName !== "PICKING") {
                                    console.log(heroName);
                                    player.setCharacter(heroName);
                                    player.setLocked(heroLocked);
                                }
                                if (--detectionsPending <= 0) {
                                    resolve(player);
                                }
                            }).catch((error) => {
                                reject(error);
                            });
                        });
                    }
                }
                if (player.getName() === null) {
                    // Cleanup and trim player name
                    let playerImgName = playerImgNameRaw.clone().crop(posPlayerNameRot.x, posPlayerNameRot.y, sizePlayerNameRot.x, sizePlayerNameRot.y);
                    if (!HotsHelpers.imageCleanupName(
                        playerImgName, DraftLayout["colors"]["playerName"][team.getColor()], DraftLayout["colors"]["boost"]
                    )) {
                        reject("Player name not found!");
                    }
                    playerImgName.greyscale().contrast(0.4).normalize().blur(1).scale(0.5, jimp.RESIZE_BILINEAR).invert();
                    if (this.generateDebugFiles) {
                        // Debug output
                        playerImgName.write("debug/" + team.color + "_player" + index + "_PlayerNameTest.jpg");
                    }
                    // Detect player name using tesseract
                    detectionsPending++;
                    playerImgName.getBufferAsync(jimp.MIME_PNG).then((buffer) => {
                        worker.recognize(buffer, self.tessLangs, self.tessParams).then((result) => {
                            let playerName = result.text.trim();
                            console.log(playerName);
                            player.setName(playerName);
                            if (--detectionsPending <= 0) {
                                resolve(player);
                            }
                            resolve(player);
                        }).catch((error) => {
                            reject(error);
                        });
                    });
                }
                if (detectionsPending === 0) {
                    resolve(player);
                }
            } catch (error) {
                reject(error);
            }
        });
    }
    updateTeams() {
        let self = this;
        return new Promise(async (resolve, reject) => {
            for (let t = 0; t < self.teams.length; t++) {
                let team = self.teams[t];
                let players = team.getPlayers();
                let playersPending = 0;
                for (let i = 0; i < players.length; i++) {
                    let player = players[i];
                    if (!player.isLocked()) {
                        playersPending++;
                        self.detectPlayer(player).then(() => {
                            if (--playersPending <= 0) {
                                resolve(true);
                            }
                        }).catch((error) => {
                            console.error(error);
                            console.log(error.stack);
                            reject(error);
                        });
                    }
                }
            }
        });
    }
    addTeam(team) {
        this.teams.push(team);
        let self = this;
        team.on("change", function() {
            self.trigger("team-updated", this);
            self.trigger("change");
        });
    }
    getMap() {
        return this.map;
    }
    getTeam(color) {
        for (let i = 0; i < this.teams.length; i++) {
            if (this.teams[i].getColor() === color) {
                return this.teams[i];
            }
        }
        return null;
    }
    setMap(mapName) {
        console.log(mapName);
        this.map = mapName;
    }

}

module.exports = HotsDraftScreen;
