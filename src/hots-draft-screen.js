// Librarys
const { TesseractWorker, TesseractUtils, ...TesseractTypes } = require('tesseract.js');
const worker = new TesseractWorker();
const jimp = require('jimp');
const path = require('path');
const fs = require('fs');
const os = require('os');

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
        this.updateActive = false;
        this.tessLangs = "eng";
        this.tessParams = {
            tessedit_pageseg_mode: TesseractTypes.PSM.SINGLE_LINE
        };
        this.generateDebugFiles = false;
        this.offsets = {};
        this.banImages = null;
        this.banActive = false;
        this.screenshot = null;
        this.map = null;
        this.teams = [];
        this.teamActive = null;
        this.heroes = { name: [], corrections: {} };
        // Load heroes and exceptions from disk
        this.loadHeroes();
        // Update handling
        this.on("update-started", () => {
            this.updateActive = true;
        });
        this.on("update-done", () => {
            this.updateActive = false;
        });
        this.on("update-failed", () => {
            this.updateActive = false;
        });
    }
    getStorageDir() {
        let cacheDir = ".";
        if(os.platform() === "linux") {
            cacheDir = path.join(os.homedir(), "/.config/HotsDrafter");
        } else {
            cacheDir = path.join(os.homedir(), "/AppData/Roaming/HotsDrafter");
        }
        return cacheDir;
    }
    getHeroesFile() {
        return path.join(this.getStorageDir(), "heroes.json");
    }
    loadHeroes() {
        let storageFile = this.getHeroesFile();
        // Read the data from file
        if (!fs.existsSync(storageFile)) {
            // Cache file does not exist! Initialize empty data object.
            return;
        }
        let cacheContent = fs.readFileSync(storageFile);
        try {
            let cacheData = JSON.parse(cacheContent.toString());
            this.heroes = cacheData;
        } catch (e) {
            console.error("Failed to read heroes data!");
            console.error(e);
        }
    }
    loadOffsets() {
        let baseSize = DraftLayout["screenSizeBase"];
        let targetSize = { "x": this.screenshot.bitmap.width, "y": this.screenshot.bitmap.height };
        this.offsets["mapSize"] = HotsHelpers.scaleOffset(DraftLayout["mapSize"], baseSize, targetSize);
        this.offsets["mapPos"] = HotsHelpers.scaleOffset(DraftLayout["mapPos"], baseSize, targetSize);
        this.offsets["banSize"] = HotsHelpers.scaleOffset(DraftLayout["banSize"], baseSize, targetSize);
        this.offsets["banCheckSize"] = HotsHelpers.scaleOffset(DraftLayout["banCheckSize"], baseSize, targetSize);
        this.offsets["banCropSize"] = HotsHelpers.scaleOffset(DraftLayout["banCropSize"], baseSize, targetSize);
        this.offsets["timerPos"] = HotsHelpers.scaleOffset(DraftLayout["timerPos"], baseSize, targetSize);
        this.offsets["timerSize"] = HotsHelpers.scaleOffset(DraftLayout["timerSize"], baseSize, targetSize);
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
                "banCheck": HotsHelpers.scaleOffset(DraftLayout["teams"][team]["banCheck"], baseSize, targetSize),
                "banCropPos": HotsHelpers.scaleOffset(DraftLayout["teams"][team]["banCropPos"], baseSize, targetSize),
                "name": HotsHelpers.scaleOffset(DraftLayout["teams"][team]["name"], baseSize, targetSize),
                "nameHeroRotated": HotsHelpers.scaleOffset(DraftLayout["teams"][team]["nameHeroRotated"], baseSize, targetSize),
                "namePlayerRotated": HotsHelpers.scaleOffset(DraftLayout["teams"][team]["namePlayerRotated"], baseSize, targetSize)
            };
        }
    }
    loadBanImages() {
        if (this.banImages !== null) {
            return true;
        }
        this.banImages = {};
        // Create cache directory if it does not exist
        let storageDir = this.getStorageDir();
        let banHeroDir = path.join(this.getStorageDir(), "heroes");
        if (!fs.existsSync( banHeroDir )) {
            fs.mkdirSync(banHeroDir, { recursive: true });
        }
        return new Promise((resolve, reject) => {
            const directoryPath = banHeroDir;
            fs.readdir(directoryPath, (err, files) => {
                if (err) {
                    return console.log('Unable to scan directory: ' + err);
                }
                let pending = 1;
                let sizeBan = this.offsets["banSize"];
                files.forEach((file) => {
                    let match = file.match(/^(.+)\.png$/);
                    if (match) {
                        // Load image
                        let heroName = match[1];
                        pending++;
                        jimp.read(directoryPath+"/"+file).then(async (image) => {
                            this.banImages[heroName] = image;
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
    saveHeroes() {
        // Create cache directory if it does not exist
        let storageDir = this.getStorageDir();
        if (!fs.existsSync( storageDir )) {
            fs.mkdirSync(storageDir, { recursive: true });
        }
        // Write specific type into cache
        let storageFile = this.getHeroesFile();
        fs.writeFileSync( storageFile, JSON.stringify(this.heroes) );
    }
    saveHeroBanImage(heroName, teamName, playerImage) {
        if (!this.banImages.hasOwnProperty(heroName)) {
            let banHeroImage = playerImage.clone();
            let banHeroFile = path.join(this.getStorageDir(), "heroes", heroName+".png");
            let banCropPos = this.offsets["teams"][teamName]["banCropPos"];
            let banCropSize = this.offsets["banCropSize"];
            banHeroImage.crop(banCropPos.x, banCropPos.y, banCropSize.x, banCropSize.y).normalize().write(banHeroFile);
            this.banImages[heroName] = banHeroImage;
        }
    }
    debug(generateDebugFiles) {
        this.generateDebugFiles = generateDebugFiles;
    }
    addHero(name) {
        name = this.fixHeroName(name);
        if (this.heroes.name.indexOf(name) === -1) {
            this.heroes.name.push(name);
            this.saveHeroes();
        }
    }
    addHeroCorrection(from, to) {
        this.heroes.corrections[from] = to;
        this.saveHeroes();
    }
    correctHero(name) {
        if (this.heroes.corrections.hasOwnProperty(name)) {
            return this.heroes.corrections[name];
        }
        return name;
    }
    clear() {
        this.screenshot = null;
        this.map = null;
        this.teams = [];
    }
    detect(screenshotFile) {
        // Start detection
        return new Promise((resolve, reject) => {
            if (this.updateActive) {
                resolve(false);
                return;
            }
            jimp.read(screenshotFile).then(async (image) => {
                this.trigger("update-started");
                try {
                    this.screenshot = image;
                    this.loadOffsets();
                    await this.loadBanImages();
                    // Map not yet detected
                    if (!await this.detectMap()) {
                        reject(new Error("Map not detected!"));
                        return;
                    }
                    if (!await this.detectTimer()) {
                        reject(error);
                        return;
                    }
                    let pending = 1;    // Ensure not to resolve before everything was started
                    // Teams
                    if (this.teams.length === 0) {
                        // Teams not yet detected
                        pending++;
                        this.detectTeams().then(() => {
                            if (--pending <= 0) {
                                resolve(true);
                                this.trigger("update-done");
                            }
                        }).catch((error) => {
                            reject(new Error("Teams not detected!"));
                            console.error(error);
                            console.error(error.stack);
                        });
                    } else {
                        // Update teams
                        pending++;
                        this.updateTeams().then(() => {
                            if (--pending <= 0) {
                                resolve(true);
                                this.trigger("update-done");
                            }
                        }).catch((error) => {
                            reject(new Error("Failed to update teams!"));
                            console.error(error);
                            console.error(error.stack);
                        });
                    }
                    // Can finish now
                    if (--pending <=0) {
                        resolve(true);
                        this.trigger("update-done");
                    }
                } catch (error) {
                    reject(error);
                    this.trigger("update-failed");
                }
            }).catch((error) => {
                console.error("Error loading screenshot '"+screenshotFile+"'");
                console.error(error);
                console.error(error.stack);
                reject(error);
                this.trigger("update-failed", error);
            });
        });
    }
    detectMap() {
        return new Promise((resolve, reject) => {
            let mapPos = this.offsets["mapPos"];
            let mapSize = this.offsets["mapSize"];
            let mapNameImg = this.screenshot.clone().crop(mapPos.x, mapPos.y, mapSize.x, mapSize.y);
            // Cleanup and trim map name
            if (!HotsHelpers.imageCleanupName(mapNameImg, DraftLayout["colors"]["mapName"])) {
                reject(new Error("No map text found at the expected location!"));
                return;
            }
            // Convert to black on white for optimal detection
            mapNameImg.greyscale().contrast(0.4).normalize().blur(1).invert();
            if (this.generateDebugFiles) {
                // Debug output
                mapNameImg.write("debug/mapName.png");
            }
            // Detect map name using tesseract
            mapNameImg.getBufferAsync(jimp.MIME_PNG).then((buffer) => {
                worker.recognize(buffer, this.tessLangs, this.tessParams).then((result) => {
                    let mapName = result.text.trim();
                    if (mapName !== "") {
                        this.setMap(mapName);
                        this.trigger("map-detected", mapName);
                        this.trigger("change");
                        resolve(true);
                    } else {
                        reject(new Error("Map name could not be detected!"));
                    }
                }).catch((error) => {
                    reject(error);
                });
            });
        });
    }
    detectTimer() {
        return new Promise(async (resolve, reject) => {
            let timerPos = this.offsets["timerPos"];
            let timerSize = this.offsets["timerSize"];
            let timerImg = this.screenshot.clone().crop(timerPos.x, timerPos.y, timerSize.x, timerSize.y).scale(0.5);
            if (this.generateDebugFiles) {
                // Debug output
                timerImg.write("debug/pickTimer.png");
            }
            if (HotsHelpers.imageFindColor(timerImg, DraftLayout["colors"]["timer"]["blue"])) {
                // Blue team active
                this.teamActive = "blue";
                this.banActive = false;
                resolve(true);
                return;
            } else if (HotsHelpers.imageFindColor(timerImg, DraftLayout["colors"]["timer"]["red"])) {
                // Red team active
                this.teamActive = "red";
                this.banActive = false;
                resolve(true);
                return;
            } else if (HotsHelpers.imageFindColor(timerImg, DraftLayout["colors"]["timer"]["ban"])) {
                // Banning, check which team is banning
                let sizeBanCheck = this.offsets["banCheckSize"];
                for (let color in this.offsets["teams"]) {
                    // Get offsets
                    let teamOffsets = this.offsets["teams"][color];
                    let posBanCheck = teamOffsets["banCheck"];
                    // Check bans
                    let banCheckImg = this.screenshot.clone().crop(posBanCheck.x, posBanCheck.y, sizeBanCheck.x, sizeBanCheck.y).scale(0.5);
                    if (this.generateDebugFiles) {
                        // Debug output
                        banCheckImg.write("debug/"+color+"_banCheck.png");
                    }
                    if (HotsHelpers.imageFindColor(banCheckImg, DraftLayout["colors"]["banActive"])) {
                        this.teamActive = color;
                        this.banActive = true;
                        resolve(true);
                        return;
                    }
                }
            }
            this.teamActive = null;
            reject(new Error("Failed to detect pick counter"));
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
        return new Promise(async (resolve, reject) => {
            let team = new HotsDraftTeam(color);
            let playerPos = this.offsets["teams"][color]["players"];
            let pending = 1;
            this.addTeam(team);
            // Bans
            pending++;
            this.detectBans(team).then(() => {
                if (--pending <= 0) {
                    resolve(true);
                }
            }).catch((error) => {
                reject(new Error("Bans not detected!"));
                console.error(error);
                console.error(error.stack);
            });
            // Players
            for (let i = 0; i < playerPos.length; i++) {
                let player = new HotsDraftPlayer(i, team);
                pending++;
                this.detectPlayer(player).then(() => {
                    team.addPlayer(player);
                    this.trigger("player-detected", player);
                    this.trigger("change");
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
        return new Promise(async (resolve, reject) => {
            let teamOffsets = this.offsets["teams"][team.getColor()];
            // Get offsets
            let posBans = teamOffsets["bans"];
            let sizeBan = this.offsets["banSize"];
            // Check bans
            for (let i = 0; i < posBans.length; i++) {
                let posBan = posBans[i];
                let banImg = this.screenshot.clone().crop(posBan.x, posBan.y, sizeBan.x, sizeBan.y).scale(2);
                if (HotsHelpers.imageBackgroundMatch(banImg, DraftLayout["colors"]["banBackground"])) {
                    // No ban yet
                    team.addBan(i, null);
                } else {
                    if (this.generateDebugFiles) {
                        // Debug output
                        banImg.write("debug/" + team.color + "_ban" + i + "_Test.png");
                    }
                    let matchBestHero = null;
                    let matchBestValue = 0;
                    for (let heroName in this.banImages) {
                        let heroValue = HotsHelpers.imageCompare(banImg, this.banImages[heroName]);
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
        return new Promise(async (resolve, reject) => {
            let index = player.getIndex();
            let team = player.getTeam();
            let teamOffsets = this.offsets["teams"][team.getColor()];
            let colorIdent = team.getColor()+( this.teamActive == team.getColor() ? "-active" : "-inactive" );
            // Get offsets
            let posPlayer = teamOffsets["players"][index];
            let posName = teamOffsets["name"];
            let posHeroNameRot = teamOffsets["nameHeroRotated"];
            let posPlayerNameRot = teamOffsets["namePlayerRotated"];
            let sizePlayer = this.offsets["playerSize"];
            let sizeName = this.offsets["nameSize"];
            let sizeHeroNameRot = this.offsets["nameHeroSizeRotated"];
            let sizePlayerNameRot = this.offsets["namePlayerSizeRotated"];
            try {
                let detectionsPending = 0;
                let playerImg = this.screenshot.clone().crop(posPlayer.x, posPlayer.y, sizePlayer.x, sizePlayer.y);
                if (this.generateDebugFiles) {
                    // Debug output
                    playerImg.write("debug/" + team.color + "_player" + index + "_Test.png");
                }
                let playerImgNameRaw = playerImg.clone().crop(posName.x, posName.y, sizeName.x, sizeName.y).scale(4, jimp.RESIZE_BILINEAR).rotate(posName.angle, jimp.RESIZE_BEZIER);
                if (this.generateDebugFiles) {
                    // Debug output
                    playerImgNameRaw.write("debug/" + team.color + "_player" + index + "_NameTest.png");
                }
                if (!player.isLocked()) {
                    // Cleanup and trim hero name
                    let heroImgName = playerImgNameRaw.clone().crop(posHeroNameRot.x, posHeroNameRot.y, sizeHeroNameRot.x, sizeHeroNameRot.y);
                    let heroVisible = false;
                    let heroLocked = false;
                    if (HotsHelpers.imageBackgroundMatch(heroImgName, DraftLayout["colors"]["heroBackgroundLocked"][colorIdent])) {
                        // Hero locked!
                        if (HotsHelpers.imageCleanupName(heroImgName, DraftLayout["colors"]["heroNameLocked"][colorIdent], [], 0x000000FF, 0xFFFFFFFF)) {
                            heroImgName.greyscale().contrast(0.4).normalize().blur(1).scale(0.5, jimp.RESIZE_BILINEAR);
                            heroVisible = true;
                            heroLocked = true;
                        }
                    } else {
                        player.setLocked(false);
                        if (team.getColor() === "blue") {
                            // Hero not locked!
                            let heroImgNameOrg = heroImgName.clone();
                            if ((colorIdent == "blue-active") && HotsHelpers.imageCleanupName(heroImgName, DraftLayout["colors"]["heroNamePrepick"][colorIdent+"-picking"])) {
                                heroImgName.greyscale().normalize().blur(1).scale(0.5, jimp.RESIZE_BILINEAR).invert();
                                heroVisible = true;
                            } else if (HotsHelpers.imageCleanupName(heroImgNameOrg, DraftLayout["colors"]["heroNamePrepick"][colorIdent])) {
                                heroImgName = heroImgNameOrg;
                                heroImgName.greyscale().normalize().blur(1).scale(0.5, jimp.RESIZE_BILINEAR).invert();
                                heroVisible = true;
                            }
                        }
                    }
                    if (this.generateDebugFiles) {
                        // Debug output
                        heroImgName.write("debug/" + team.color + "_player" + index + "_HeroNameTest.png");
                    }
                    if (heroVisible) {
                        // Detect hero name using tesseract
                        detectionsPending++;
                        heroImgName.getBufferAsync(jimp.MIME_PNG).then((buffer) => {
                            worker.recognize(buffer, this.tessLangs, this.tessParams).then((result) => {
                                let heroName = this.correctHero(result.text.trim());
                                if (heroName !== "PICKING") {
                                    let detectionError = (this.heroes.name.indexOf(heroName) === -1);
                                    player.setCharacter(heroName, detectionError);
                                    player.setLocked(heroLocked);
                                    if (!detectionError) {
                                        this.saveHeroBanImage(heroName, team.getColor(), playerImg);
                                    }
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
                        playerImgName, DraftLayout["colors"]["playerName"][colorIdent], DraftLayout["colors"]["boost"]
                    )) {
                        reject(new Error("Player name not found!"));
                    }
                    playerImgName.greyscale().contrast(0.4).normalize().blur(1).scale(0.5, jimp.RESIZE_BILINEAR).invert();
                    if (this.generateDebugFiles) {
                        // Debug output
                        playerImgName.write("debug/" + team.color + "_player" + index + "_PlayerNameTest.png");
                    }
                    // Detect player name using tesseract
                    detectionsPending++;
                    playerImgName.getBufferAsync(jimp.MIME_PNG).then((buffer) => {
                        worker.recognize(buffer, this.tessLangs, this.tessParams).then((result) => {
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
        return new Promise(async (resolve, reject) => {
            for (let t = 0; t < this.teams.length; t++) {
                let team = this.teams[t];
                let players = team.getPlayers();
                let pending = 0;
                // Bans
                pending++;
                this.detectBans(team).then(() => {
                    if (--pending <= 0) {
                        resolve(true);
                    }
                }).catch((error) => {
                    reject(new Error("Bans not detected!"));
                    console.error(error);
                    console.error(error.stack);
                });
                // Players
                for (let i = 0; i < players.length; i++) {
                    let player = players[i];
                    if (!player.isLocked()) {
                        pending++;
                        this.detectPlayer(player).then(() => {
                            if (--pending <= 0) {
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
        team.on("change", () => {
            this.trigger("team-updated", this);
            this.trigger("change");
        });
    }
    fixHeroName(name) {
        switch (name) {
            case "ETC":
                name = "E.T.C.";
                break;
        }
        name = name.toUpperCase();
        return name;
    }
    getHeroNames() {
        return this.heroes.name;
    }
    getHeroImage(heroName) {
        heroName = this.fixHeroName(heroName);
        return path.join(this.getStorageDir(), "heroes", heroName+".png");
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
    getTeamActive() {
        return this.teamActive;
    }
    setMap(mapName) {
        console.log(mapName);
        this.map = mapName;
    }

}

module.exports = HotsDraftScreen;
