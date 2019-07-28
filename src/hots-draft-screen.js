// Nodejs dependencies
const jimp = require('jimp');
const path = require('path');
const fs = require('fs');
const EventEmitter = require('events');
const {TesseractWorker, TesseractUtils, ...TesseractTypes} = require('tesseract.js');

// Local classes
const HotsDraftTeam = require('./hots-draft-team.js');
const HotsDraftPlayer = require('./hots-draft-player.js');
const HotsHelpers = require('./hots-helpers.js');
const TesseractCluster = require('./tesseract-cluster.js');

const ocrCluster = new TesseractCluster(4);

// Data files
const DraftLayout = require('../data/draft-layout');

class HotsDraftScreen extends EventEmitter {

    constructor(app) {
        super();
        this.app = app;
        this.debugData = [];
        this.updateActive = false;
        this.jimpScaleMode = jimp.RESIZE_HERMITE;
        this.jimpRotateMode = jimp.RESIZE_HERMITE;
        this.tessLangs = HotsHelpers.getConfig().getTesseractLanguage();
        this.tessParams = {
            tessedit_pageseg_mode: TesseractTypes.PSM.SINGLE_LINE
        };
        this.generateDebugFiles = false;
        this.offsets = {};
        this.banImages = null;
        this.banActive = false;
        this.screenshot = null;
        this.map = null;
        this.mapLock = 0;
        this.teams = [];
        this.teamActive = null;
        // Update handling
        this.on("update.started", () => {
            this.updateActive = true;
        });
        this.on("update.done", () => {
            this.updateActive = false;
        });
        this.on("update.failed", () => {
            // Nothing yet
        });
    }
    loadOffsets() {
        let baseSize = DraftLayout["screenSizeBase"];
        let targetSize = { "x": this.screenshot.bitmap.width, "y": this.screenshot.bitmap.height };
        this.offsets["mapSize"] = HotsHelpers.scaleOffset(DraftLayout["mapSize"], baseSize, targetSize);
        this.offsets["mapPos"] = HotsHelpers.scaleOffset(DraftLayout["mapPos"], baseSize, targetSize);
        this.offsets["banSize"] = HotsHelpers.scaleOffset(DraftLayout["banSize"], baseSize, targetSize);
        this.offsets["banSizeCompare"] = HotsHelpers.scaleOffset(DraftLayout["banSizeCompare"], baseSize, targetSize);
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
        return new Promise((resolve, reject) => {
            if (this.banImages !== null) {
                resolve(true);
                return;
            }
            this.banImages = {};
            // Create cache directory if it does not exist
            let storageDir = HotsHelpers.getStorageDir();
            let banHeroDir = path.join(storageDir, "bans");
            if (!fs.existsSync( banHeroDir )) {
                fs.mkdirSync(banHeroDir, { recursive: true });
            }
            const directoryPathBase = path.join(__dirname, "..", "data", "bans");
            const directoryPathUser = banHeroDir;
            this.loadBanImagesFromDir(directoryPathBase).then(() => {
                return this.loadBanImagesFromDir(directoryPathUser);
            }).then(() => {
                resolve(true);
            }).catch((error) => {
                reject(error);
            });
        });
    }
    loadBanImagesFromDir(directoryPath) {
        return new Promise((resolve, reject) => {
            fs.readdir(directoryPath, (errorMessage, files) => {
                if (errorMessage) {
                    reject(new Error('Unable to scan directory: ' + errorMessage));
                    return;
                }
                let loadPromises = [];
                files.forEach((file) => {
                    let match = file.match(/^(.+)\.png$/);
                    if (match) {
                        // Load image
                        let heroId = match[1];
                        loadPromises.push(
                            jimp.read(directoryPath+"/"+file).then(async (image) => {
                                this.banImages[heroId] = image.resize(this.offsets["banSizeCompare"].x, this.offsets["banSizeCompare"].y);
                            })
                        );
                    }
                });
                if (loadPromises.length === 0) {
                    resolve(true);
                } else {
                    Promise.all(loadPromises).then(() => {
                        resolve(true);
                    }).catch((error) => {
                        reject(error);
                    });
                }
            });
        });
    }
    saveHeroBanImage(heroId, banImageBase64) {
        if (!this.banImages.hasOwnProperty(heroId)) {
            let buffer = Buffer.from(banImageBase64.substr( banImageBase64.indexOf("base64,") + 7 ), 'base64');
            jimp.read(buffer).then((image) => {
                let banHeroFile = path.join(HotsHelpers.getStorageDir(), "bans", heroId+".png");
                image.write(banHeroFile);
                this.banImages[heroId] = image.resize(this.offsets["banSizeCompare"].x, this.offsets["banSizeCompare"].y);
            });
        }
    }
    debug(generateDebugFiles) {
        this.generateDebugFiles = generateDebugFiles;
    }
    debugDataClear() {
        this.debugData = [];
    }
    debugDataAdd(imgOriginal, imgCleanup, colorsIdent, colorsPositive, colorsNegative, invert) {
        if (!this.generateDebugFiles) {
            return;
        }
        let imgOriginalBase64 = null;
        let imgCleanupBase64 = null;
        imgOriginal.getBase64Async(jimp.MIME_PNG).then((imageData) => {
            imgOriginalBase64 = imageData;
            return imgCleanup.getBase64Async(jimp.MIME_PNG);
        }).then((imageData) => {
            imgCleanupBase64 = imageData;
        }).catch((error) => {
            console.error("Failed to generate debug data!");
            console.error(error);
        }).finally(() => {
            this.debugData.push({
                imgOriginal: imgOriginalBase64,
                imgCleanup: imgCleanupBase64,
                colorsIdent: colorsIdent,
                colorsPositive: colorsPositive,
                colorsNegative: colorsNegative,
                colorsInvert: invert
            });
        });
    }
    clear() {
        this.map = null;
        this.teams = [];
        this.emit("change");
    }
    detect(screenshotFile) {
        // Start detection
        return new Promise((resolve, reject) => {
            if (this.updateActive) {
                resolve(false);
                return;
            }
            this.emit("detect.start");
            this.debugDataClear();
            let timeStart = (new Date()).getTime();
            jimp.read(screenshotFile).then((screenshot) => {
                if (this.generateDebugFiles) {
                    console.log("Loaded screenshot after "+((new Date()).getTime() - timeStart)+"ms");
                    timeStart = (new Date()).getTime();
                }
                // Screenshot file loaded
                this.screenshot = screenshot;
                this.emit("detect.screenshot.load.success");
                // Load offsets
                this.loadOffsets();
                // Load images for detecting banned heroes (if not already loaded)
                return this.loadBanImages();
            }).then(() => {
                if (this.generateDebugFiles) {
                    console.log("Loaded ban images after "+((new Date()).getTime() - timeStart)+"ms");
                    timeStart = (new Date()).getTime();
                }
                this.emit("detect.ban.images.load.success");
                // Detect draft timer
                this.emit("detect.timer.start");
                return this.detectTimer();
            }).then(() => {
                if (this.generateDebugFiles) {
                    console.log("Detected timer after "+((new Date()).getTime() - timeStart)+"ms");
                    timeStart = (new Date()).getTime();
                }
                // Success
                this.emit("detect.timer.success");
                this.emit("change");
                // Detect map text
                this.emit("detect.map.start");
                return this.detectMap();
            }).then((mapName) => {
                if (this.generateDebugFiles) {
                    console.log("Detected map name after "+((new Date()).getTime() - timeStart)+"ms");
                    timeStart = (new Date()).getTime();
                }
                // Success
                if (this.getMap() !== mapName) {
                    this.clear();
                    this.setMap(mapName);
                }
                this.emit("detect.map.success");
                this.emit("change");
                // Teams
                this.emit("detect.teams.start");
                return this.detectTeams();
            }).then((teams) => {
                if (this.generateDebugFiles) {
                    console.log("Detected teams after "+((new Date()).getTime() - timeStart)+"ms");
                    timeStart = (new Date()).getTime();
                }
                if (this.teams.length === 0) {
                    // Initial detection
                    this.addTeam(teams[0]); // Team blue
                    this.addTeam(teams[1]); // Team red
                    this.emit("detect.teams.new");
                } else {
                    this.emit("detect.teams.update");
                }
                this.emit("detect.teams.success");
                this.emit("detect.success");
                this.emit("detect.done");
                this.emit("change");
                resolve(true);
            }).catch((error) => {
                // Error in the detection chain
                this.emit("detect.error", error);
                this.emit("detect.done");
                reject(error);
            });
        });
    }
    detectMap() {
        return new Promise((resolve, reject) => {
            let mapPos = this.offsets["mapPos"];
            let mapSize = this.offsets["mapSize"];
            let mapNameImg = this.screenshot.clone().crop(mapPos.x, mapPos.y, mapSize.x, mapSize.y);
            let mapNameImgOriginal = (this.generateDebugFiles ? mapNameImg.clone() : null);
            // Cleanup and trim map name
            if (!HotsHelpers.imageCleanupName(mapNameImg, DraftLayout["colors"]["mapName"])) {
                reject(new Error("No map text found at the expected location!"));
                return;
            }
            // Only once every 20 seconds if already detected to improve performance
            let timeNow = (new Date()).getTime();
            if ((this.map !== null) && (this.mapLock > timeNow)) {
                resolve(this.getMap());
                return;
            }
            // Convert to black on white for optimal detection
            HotsHelpers.imageOcrOptimize(mapNameImg.scale(2).invert());
            if (this.generateDebugFiles) {
                // Debug output
                mapNameImg.write("debug/mapName.png");
            }
            this.debugDataAdd(mapNameImgOriginal, mapNameImg, "mapName", DraftLayout["colors"]["mapName"], [], true);
            // Detect map name using tesseract
            mapNameImg.getBufferAsync(jimp.MIME_PNG).then((buffer) => {
                ocrCluster.recognize(buffer, this.tessLangs, this.tessParams).then((result) => {
                    let mapName = this.app.gameData.fixMapName( result.text.trim() );
                    if ((mapName !== "") && (this.app.gameData.mapExists(mapName))) {
                        this.mapLock = timeNow + 20000;
                        resolve(mapName);
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
            let timerImg = this.screenshot.clone().crop(timerPos.x, timerPos.y, timerSize.x, timerSize.y).scale(0.5, this.jimpScaleMode);
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
                    let banCheckImg = this.screenshot.clone().crop(posBanCheck.x, posBanCheck.y, sizeBanCheck.x, sizeBanCheck.y).scale(0.5, this.jimpScaleMode);
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
            let teamDetections = [
                this.detectTeam("blue"),
                this.detectTeam("red")
            ];
            Promise.all(teamDetections).then((teams) => {
                resolve(teams);
            }).catch((error) => {
                reject(error);
            });
        });
    }
    detectTeam(color) {
        return new Promise(async (resolve, reject) => {
            let team = this.getTeam(color);
            if (team === null) {
                team = new HotsDraftTeam(color);
            }
            let playerPos = this.offsets["teams"][color]["players"];
            let detections = [];
            // Bans
            detections.push( this.detectBans(team) );
            // Players
            for (let i = 0; i < playerPos.length; i++) {
                detections.push( this.detectPlayer(i, team) );
            }
            Promise.all(detections).then((result) => {
                let banResult = result.shift();
                for (let i = 0; i < banResult.names.length; i++) {
                    team.addBan(i, banResult.names[i]);
                }
                for (let i = 0; i < banResult.images.length; i++) {
                    team.addBanImageData(i, banResult.images[i]);
                }
                if (team.getPlayers().length === 0) {
                    for (let i = 0; i < result.length; i++) {
                        team.addPlayer(result[i]);
                    }
                }
                resolve(team);
            });
        }).then((result) => {
            // Success
            this.emit("detect.team.success", color);
            this.emit("change");
            return result;
        });
    }
    detectBans(team) {
        return new Promise(async (resolve, reject) => {
            let teamOffsets = this.offsets["teams"][team.getColor()];
            let bans = {
                names: team.getBans(),
                images: team.getBanImages()
            };
            let banImageTasks = [];
            // Get offsets
            let posBans = teamOffsets["bans"];
            let sizeBan = this.offsets["banSize"];
            let bansLocked = team.getBansLocked();
            // Check bans
            for (let i = bansLocked; i < posBans.length; i++) {
                let posBan = posBans[i];
                let banImg = this.screenshot.clone().crop(posBan.x, posBan.y, sizeBan.x, sizeBan.y);
                if (!HotsHelpers.imageBackgroundMatch(banImg, DraftLayout["colors"]["banBackground"])) {
                    let banImgCompare = banImg.clone().resize(this.offsets["banSizeCompare"].x, this.offsets["banSizeCompare"].y);
                    if (this.generateDebugFiles) {
                        // Debug output
                        banImg.write("debug/" + team.color + "_ban" + i + "_Test.png");
                        banImgCompare.write("debug/" + team.color + "_ban" + i + "_TestCompare.png");
                    }
                    let matchBestHero = null;
                    let matchBestValue = 200;
                    for (let heroId in this.banImages) {
                        let heroValue = HotsHelpers.imageCompare(banImgCompare, this.banImages[heroId]);
                        if (heroValue > matchBestValue) {
                            matchBestHero = heroId;
                            matchBestValue = heroValue;
                        }
                    }
                    if (matchBestHero !== null) {
                        let heroNameTranslated = this.app.gameData.getHeroName(matchBestHero);
                        if (bans.names[i] !== heroNameTranslated) {
                            bans.names[i] = heroNameTranslated;
                            team.emit("change");
                            // Lock bans that are detected properly and can not change to save detection time
                            if (!this.banActive && (bansLocked == i)) {
                                team.setBansLocked(++bansLocked);
                            }
                        }
                    } else {
                        bans.names[i] = "???";
                        banImageTasks.push(
                            banImg.getBase64Async(jimp.MIME_PNG).then((result) => {
                                bans.images[i] = result;
                                return result;
                            })
                        );
                    }
                }
            }
            if (banImageTasks.length === 0) {
                resolve(bans);
            } else {
                Promise.all(banImageTasks).then((result) => {
                    resolve(bans);
                });
            }
        }).then((result) => {
            // Success
            this.emit("detect.bans.success", team);
            this.emit("change");
            return result;
        });
    }
    detectPlayer(index, team) {
        return new Promise(async (resolve, reject) => {
            let player = team.getPlayer(index);
            if (player === null) {
                player = new HotsDraftPlayer(index, team);
            }
            let teamOffsets = this.offsets["teams"][team.getColor()];
            let colorIdent = team.getColor()+( this.teamActive == team.getColor() ? "-active" : "-inactive" );
            let pickText = DraftLayout.pickText[HotsHelpers.getConfig().getOption("language")];
            // Text detection is more reliable when the team is not currently picking (cleaner background)
            let playerNameFinal = (this.teamActive !== team.getColor());
            // Get offsets
            let posPlayer = teamOffsets["players"][index];
            let posName = teamOffsets["name"];
            let posHeroNameRot = teamOffsets["nameHeroRotated"];
            let posPlayerNameRot = teamOffsets["namePlayerRotated"];
            let sizePlayer = this.offsets["playerSize"];
            let sizeName = this.offsets["nameSize"];
            let sizeHeroNameRot = this.offsets["nameHeroSizeRotated"];
            let sizePlayerNameRot = this.offsets["namePlayerSizeRotated"];
            let detections = [];
            let playerImg = this.screenshot.clone().crop(posPlayer.x, posPlayer.y, sizePlayer.x, sizePlayer.y);
            if (this.generateDebugFiles) {
                // Debug output
                playerImg.write("debug/" + team.color + "_player" + index + "_Test.png");
            }
            let playerImgNameRaw = playerImg.clone().crop(posName.x, posName.y, sizeName.x, sizeName.y).scale(4, this.jimpScaleMode).rotate(posName.angle, this.jimpRotateMode);
            if (this.generateDebugFiles) {
                // Debug output
                playerImgNameRaw.write("debug/" + team.color + "_player" + index + "_NameTest.png");
            }
            if (!player.isLocked() || !this.app.gameData.heroExists(player.getCharacter())) {
                // Cleanup and trim hero name
                let heroImgName = playerImgNameRaw.clone().crop(posHeroNameRot.x, posHeroNameRot.y, sizeHeroNameRot.x, sizeHeroNameRot.y);
                let heroImgNameOriginal = (this.generateDebugFiles ? heroImgName.clone() : null);
                let heroVisible = false;
                let heroLocked = false;
                if (HotsHelpers.imageBackgroundMatch(heroImgName, DraftLayout["colors"]["heroBackgroundLocked"][colorIdent])) {
                    // Hero locked!
                    if (HotsHelpers.imageCleanupName(heroImgName, DraftLayout["colors"]["heroNameLocked"][colorIdent], [], 0x000000FF, 0xFFFFFFFF)) {
                        HotsHelpers.imageOcrOptimize(heroImgName);
                        heroVisible = true;
                        heroLocked = true;
                    }
                    this.debugDataAdd(heroImgNameOriginal, heroImgName, "heroNameLocked-"+colorIdent, DraftLayout["colors"]["heroNameLocked"][colorIdent], [], false);
                } else {
                    player.setLocked(false);
                    if (team.getColor() === "blue") {
                        // Hero not locked!
                        let heroImgNameOrg = heroImgName.clone();
                        if ((colorIdent == "blue-active") && HotsHelpers.imageCleanupName(heroImgName, DraftLayout["colors"]["heroNamePrepick"][colorIdent+"-picking"])) {
                            HotsHelpers.imageOcrOptimize(heroImgName.invert());
                            heroVisible = true;
                            this.debugDataAdd(heroImgNameOriginal, heroImgName, "heroNamePrepick-"+colorIdent+"-picking", DraftLayout["colors"]["heroNamePrepick"][colorIdent+"-picking"], [], true);
                        } else if (HotsHelpers.imageCleanupName(heroImgNameOrg, DraftLayout["colors"]["heroNamePrepick"][colorIdent])) {
                            heroImgName = heroImgNameOrg;
                            HotsHelpers.imageOcrOptimize(heroImgName.invert());
                            heroVisible = true;
                            this.debugDataAdd(heroImgNameOriginal, heroImgName, "heroNamePrepick-"+colorIdent, DraftLayout["colors"]["heroNamePrepick"][colorIdent], [], true);
                        }
                    }
                }
                if (this.generateDebugFiles) {
                    // Debug output
                    heroImgName.write("debug/" + team.color + "_player" + index + "_HeroNameTest.png");
                }
                if (heroVisible) {
                    // Detect hero name using tesseract
                    let imageHeroName = null;
                    detections.push(
                        heroImgName.getBufferAsync(jimp.MIME_PNG).then((buffer) => {
                            imageHeroName = buffer;
                            return ocrCluster.recognize(buffer, this.tessLangs, this.tessParams);
                        }).then((result) => {
                            let heroName = this.app.gameData.correctHeroName(result.text.trim());
                            if (heroName !== pickText) {
                                let detectionError = !this.app.gameData.heroExists(heroName);
                                player.setCharacter(heroName, detectionError);
                                player.setImageHeroName(imageHeroName);
                                player.setLocked(heroLocked);
                            }
                            return heroName;
                        })
                    )
                }
            }
            if (!player.isNameFinal()) {
                // Cleanup and trim player name
                let playerImgName = playerImgNameRaw.clone().crop(posPlayerNameRot.x, posPlayerNameRot.y, sizePlayerNameRot.x, sizePlayerNameRot.y);
                let playerImgNameOriginal = (this.generateDebugFiles ? playerImgName.clone() : null);
                if (!HotsHelpers.imageCleanupName(
                    playerImgName, DraftLayout["colors"]["playerName"][colorIdent], DraftLayout["colors"]["boost"]
                )) {
                    reject(new Error("Player name not found!"));
                }
                HotsHelpers.imageOcrOptimize(playerImgName.invert());
                this.debugDataAdd(playerImgNameOriginal, playerImgName, "playerName-"+colorIdent, DraftLayout["colors"]["playerName"][colorIdent], DraftLayout["colors"]["boost"], true);
                if (this.generateDebugFiles) {
                    // Debug output
                    playerImgName.write("debug/" + team.color + "_player" + index + "_PlayerNameTest.png");
                }
                // Detect player name using tesseract
                let imagePlayerName = null;
                detections.push(
                    playerImgName.getBufferAsync(jimp.MIME_PNG).then((buffer) => {
                        imagePlayerName = buffer;
                        return ocrCluster.recognize(buffer, this.tessLangs, this.tessParams);
                    }).then((result) => {
                        let playerName = result.text.trim();
                        console.log(playerName+" / "+result.confidence);
                        player.setName(playerName, playerNameFinal);
                        player.setImagePlayerName(imagePlayerName);
                        return playerName;
                    })
                );
            }
            if (detections.length == 0) {
                resolve(player);
            } else {
                Promise.all(detections).then(() => {
                    resolve(player);
                }).catch((error) => {
                  reject(error);
              });
            }
        });
    }
    addTeam(team) {
        this.teams.push(team);
        team.on("change", () => {
            this.emit("team.updated", this);
            this.emit("change");
        });
    }
    /**
     * @returns {string|null}
     */
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
    getTeams() {
        return this.teams;
    }
    setMap(mapName) {
        console.log(mapName);
        this.map = mapName;
    }
    updateLanguage() {
        this.tessLangs = HotsHelpers.getConfig().getTesseractLanguage();
    }

}

module.exports = HotsDraftScreen;
