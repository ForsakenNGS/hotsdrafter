// Nodejs dependencies
const request = require('request');
const cheerio = require('cheerio');
const https = require('https');
const fs = require('fs');
const path = require('path');
const jimp = require('jimp');
const EventEmitter = require('events');

// Local classes
const HotsReplay = require('hots-replay');
const HotsHelpers = require('./hots-helpers.js');

class HotsGameData extends EventEmitter {

    constructor(language) {
        super();
        this.language = language;
        this.languageOptions = [{ id: "en-us", name: "English (US)" }];
        this.heroes = {
            name: {},
            details: {},
            corrections: {}
        };
        this.maps = {
            name: {}
        };
        this.substitutions = {
            "ETC": "E.T.C.",
            "LUCIO": "LÚCIO"
        };
        this.replays = {
            details: [],
            fileNames: [],
            latestReplay: { file: null, mtime: 0 },
            lastUpdate: 0
        };
        this.saves = {
            latestSave: { file: null, mtime: 0 },
            lastUpdate: 0
        };
        this.updateProgress = {
            tasksPending: 0,
            tasksDone: 0,
            tasksFailed: 0,
            retries: 0
        };
        // Load gameData and exceptions from disk
        this.load();
    }
    addHero(id, name, language) {
        name = this.fixHeroName(name);
        if (!this.heroExists(name, language)) {
            this.heroes.name[language][id] = name;
        }
    }
    addMap(id, name, language) {
        if (typeof language === "undefined") {
            language = this.language;
        }
        name = this.fixMapName(name);
        if (!this.mapExists(name, language)) {
            this.maps.name[language][id] = name;
        }
    }
    addHeroDetails(id, details, language) {
        if (language === this.language) {
            this.heroes.details[id] = details;
        }
    }
    addHeroCorrection(fromName, toId, language) {
        if (typeof language === "undefined") {
            language = this.language;
        }
        if (!this.heroes.corrections.hasOwnProperty(language)) {
          this.heroes.corrections[language] = {};
        }
        this.heroes.corrections[language][fromName] = this.getHeroName(toId, language);
        this.save();
    }
    downloadHeroIcon(heroId, heroImageUrl) {
        return new Promise((resolve, reject) => {
            let filename = path.join(HotsHelpers.getStorageDir(), "heroes", heroId+".png");
            let filenameCrop = path.join(HotsHelpers.getStorageDir(), "heroes", heroId+"_crop.png");
            if (!fs.existsSync(filename)) {
                try {
                    // Create cache directory if it does not exist
                    let heroesDir = path.join(HotsHelpers.getStorageDir(), "heroes");
                    if (!fs.existsSync( heroesDir )) {
                        fs.mkdirSync(heroesDir, { recursive: true });
                    }
                    https.get(heroImageUrl, function(response) {
                        const file = fs.createWriteStream(filename);
                        const stream = response.pipe(file);
                        stream.on("finish", () => {
                            jimp.read(filename).then(async (image) => {
                                image.crop(10, 32, 108, 64).write(filenameCrop);
                                resolve();
                            }).catch((error) => {
                                console.error("Error loading image '"+heroImageUrl+"'");
                                console.error(error);
                                console.error(error.stack);
                                reject(error);
                            })
                        })
                    });
                } catch(error) {
                    reject(error);
                }
            } else {
                resolve();
            }
        });
    }
    correctHeroName(name, language) {
        if (typeof language === "undefined") {
            language = this.language;
        }
        if (!this.heroes.corrections.hasOwnProperty(language)) {
          this.heroes.corrections[language] = {};
        }
        if (this.heroes.corrections[language].hasOwnProperty(name)) {
            return this.heroes.corrections[language][name];
        }
        return name;
    }
    heroExists(name, language) {
        if (typeof language === "undefined") {
            language = this.language;
        }
        return (this.getHeroId(name, language) !== null);
    }
    mapExists(name, language) {
        if (typeof language === "undefined") {
            language = this.language;
        }
        return (this.getMapId(name, language) !== null);
    }
    fixMapName(name) {
        name = name.toUpperCase();
        return name;
    }
    fixHeroName(name) {
        name = name.toUpperCase().trim();
        if (this.substitutions.hasOwnProperty(name)) {
          name = this.substitutions[name];
        }
        return name;
    }
    getMapId(mapName, language) {
        if (typeof language === "undefined") {
            language = this.language;
        }
        if (!this.maps.name.hasOwnProperty(language)) {
            this.maps.name[language] = {};
        }
        for (let mapId in this.maps.name[language]) {
            if (this.maps.name[language][mapId] === mapName) {
                return mapId;
            }
        }
        return null;
    }
    getMapName(mapId, language) {
        if (typeof language === "undefined") {
            language = this.language;
        }
        if (!this.maps.name.hasOwnProperty(language)) {
            this.maps.name[language] = {};
        }
        return this.maps.name[language][mapId];
    }
    getMapNameTranslation(mapName, language) {
        if (language === this.language) {
            // Same language, leave it as is
            return mapName;
        }
        // Get the map id in the current language
        let mapId = this.getMapId(mapName);
        // Return the map name in the desired language
        return this.getMapName(mapId, language);
    }
    getMapNames(language) {
        if (typeof language === "undefined") {
            language = this.language;
        }
        if (!this.maps.name.hasOwnProperty(language)) {
            this.maps.name[language] = {};
        }
        return this.maps.name[language];
    }
    getHeroName(heroId, language) {
        if (typeof language === "undefined") {
            language = this.language;
        }
        if (!this.heroes.name.hasOwnProperty(language)) {
            this.heroes.name[language] = {};
        }
        return this.heroes.name[language][heroId];
    }
    getHeroNameTranslation(heroName, language) {
        if (language === this.language) {
            // Same language, leave it as is
            return heroName;
        }
        // Get the hero id in the current language
        let heroId = this.getHeroId(heroName);
        // Return the hero name in the desired language
        return this.getHeroName(heroId, language);
    }
    getHeroNames(language) {
        if (typeof language === "undefined") {
            language = this.language;
        }
        if (!this.heroes.name.hasOwnProperty(language)) {
            this.heroes.name[language] = {};
        }
        return this.heroes.name[language];
    }
    getHeroId(heroName, language) {
        if (typeof language === "undefined") {
            language = this.language;
        }
        if (!this.heroes.name.hasOwnProperty(language)) {
            this.heroes.name[language] = {};
        }
        for (let heroId in this.heroes.name[language]) {
            if (this.heroes.name[language][heroId] === heroName) {
                return heroId;
            }
        }
        return null;
    }
    getHeroImage(heroName, language) {
        if (typeof language === "undefined") {
            language = this.language;
        }
        heroName = this.fixHeroName(heroName);
        let heroId = this.getHeroId(heroName, language);
        if (heroId === null) {
            console.error("Failed to find image for hero: "+heroName);
        }
        return path.join(HotsHelpers.getStorageDir(), "heroes", heroId+"_crop.png");
    }
    getFile() {
        return path.join(HotsHelpers.getStorageDir(), "gameData.json");
    }
    getLatestReplay() {
        return this.replays.latestReplay;
    }
    getLatestSave() {
        return this.saves.latestSave;
    }
    load() {
        let storageFile = this.getFile();
        // Read the data from file
        if (!fs.existsSync(storageFile)) {
            // Cache file does not exist! Initialize empty data object.
            return;
        }
        let cacheContent = fs.readFileSync(storageFile);
        try {
            let cacheData = JSON.parse(cacheContent.toString());
            if (cacheData.formatVersion == 3) {
                this.languageOptions = cacheData.languageOptions;
                this.maps = cacheData.maps;
                this.heroes = cacheData.heroes;
                this.replays = cacheData.replays;
            }
        } catch (e) {
            console.error("Failed to read gameData data!");
            console.error(e);
        }
    }
    save() {
        // Sort hero names alphabetically
        for (let language in this.heroes.name) {
            let heroSort = [];
            for (let heroId in this.heroes.name[language]) {
                heroSort.push([heroId, this.heroes.name[language][heroId]]);
            }
            heroSort.sort(function(a, b) {
                if(a[1] < b[1]) { return -1; }
                if(a[1] > b[1]) { return 1; }
                return 0;
            });
            this.heroes.name[language] = {};
            for (let i = 0; i < heroSort.length; i++) {
                this.heroes.name[language][ heroSort[i][0] ] = heroSort[i][1];
            }
        }
        // Create cache directory if it does not exist
        let storageDir = HotsHelpers.getStorageDir();
        if (!fs.existsSync( storageDir )) {
            fs.mkdirSync(storageDir, { recursive: true });
        }
        // Write specific type into cache
        let storageFile = this.getFile();
        fs.writeFileSync( storageFile, JSON.stringify({
            formatVersion: 3,
            languageOptions: this.languageOptions,
            maps: this.maps,
            heroes: this.heroes,
            replays: this.replays
        }) );
    }
    update() {
        this.progressReset();
        this.progressTaskNew();
        return new Promise((resolve, reject) => {
            let updatePromises = [
              this.updateReplays(),
              this.updateSaves(),
              this.updateMaps("en-us"),
              this.updateHeroes("en-us")
            ];
            if (this.language !== "en-us") {
                updatePromises.push( this.updateMaps(this.language) );
                updatePromises.push( this.updateHeroes(this.language) );
            }
            Promise.all(updatePromises).then((result) => {
                resolve(result);
            }).catch((error) => {
                if (this.updateProgress.retries++ < 3) {
                    // Retry
                    this.update().then((result) => {
                        resolve(result)
                    }).catch((error) => {
                        reject(error);
                    });
                } else {
                    reject(error);
                }
            }).finally(() => {
                this.emit("update.done");
            });
        }).then((result) => {
            this.progressTaskDone();
            return result;
        }).catch((error) => {
            this.progressTaskFailed();
            throw error;
        }).finally(() => {
            this.emit("update.done");
        });
    }
    updateMaps(language) {
        this.progressTaskNew();
        let url = "https://heroesofthestorm.com/"+language+"/battlegrounds/";
        return new Promise((resolve, reject) => {
            request({
                'method': 'GET',
                'uri': url,
                'headers': {
                    'User-Agent': 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/75.0.3770.100 Safari/537.36'
                },
                'jar': true
            }, (error, response, body) => {
                if (error) {
                    reject(error);
                    return;
                }
                if (response.statusCode !== 200) {
                    reject('Invalid status code <' + response.statusCode + '>\n'+body);
                    return;
                }
                this.updateMapsFromResponse(language, body).then(() => {
                    resolve();
                }).catch((error) => {
                    reject(error);
                });
            });
        }).then((result) => {
            this.progressTaskDone();
            return result;
        }).catch((error) => {
            this.progressTaskFailed();
            throw error;
        });
    }
    updateMapsFromResponse(language, content) {
        return new Promise((resolve, reject) => {
            let self = this;
            let page = cheerio.load(content);
            let languages = [];
            page(".BattlegroundText-header").each(function() {
                let mapId = page(this).closest(".BattlegroundWrapper-container").attr("data-battleground-id");
                self.addMap( mapId, page(this).text(), language );
            });
            page(".NavbarFooter-selectorLocales [data-id]").each(function() {
                languages.push({
                    id: page(this).attr("data-id"),
                    name: page(this).find(".NavbarFooter-selectorOptionLabel").text()
                });
            });
            this.languageOptions = languages;
            resolve();
            this.save();
        });
    }
    updateHeroes(language) {
        this.progressTaskNew();
        let url = "https://heroesofthestorm.com/"+language+"/heroes/";
        return new Promise((resolve, reject) => {
            request({
                'method': 'GET',
                'uri': url,
                'headers': {
                    'User-Agent': 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/75.0.3770.100 Safari/537.36'
                },
                'jar': true
            }, (error, response, body) => {
                if (error) {
                    reject(error);
                    return;
                }
                if (response.statusCode !== 200) {
                    reject('Invalid status code <' + response.statusCode + '>\n'+body);
                    return;
                }
                this.updateHeroesFromResponse(language, body).then(() => {
                    resolve();
                }).catch((error) => {
                    reject(error);
                });
            });
        }).then((result) => {
            this.progressTaskDone();
            return result;
        }).catch((error) => {
            this.progressTaskFailed();
            throw error;
        });
    }
    updateHeroesFromResponse(language, content) {
        return new Promise((resolve, reject) => {
            let self = this;
            let page = cheerio.load(content);
            // Load heroesByName
            const heroDataVar = "window.blizzard.hgs.heroData";
            let downloads = [];
            page("script").each(function() {
                let script = page(this).html();
                if (script.indexOf(heroDataVar) === 0) {
                    let heroDataRaw = script.substr(heroDataVar.length + 3);
                    heroDataRaw = heroDataRaw.substr(0, heroDataRaw.indexOf(";\n"));
                    let heroData = JSON.parse(heroDataRaw);
                    for (let i = 0; i < heroData.length; i++) {
                        let hero = heroData[i];
                        let heroId = hero.slug;
                        let heroImageUrl = hero.circleIcon;
                        let heroName = self.fixHeroName(hero.name);
                        self.addHero(heroId, heroName, language);
                        self.addHeroDetails(heroId, hero, language);
                        if (language === "en-us") {
                            self.progressTaskNew();
                            let downloadPromise = self.downloadHeroIcon(heroId, heroImageUrl);
                            downloadPromise.then(() => {
                                self.progressTaskDone();
                            }).catch((error) => {
                                self.progressTaskFailed();
                            });
                            downloads.push(downloadPromise);
                        }
                    }
                }
            });
            if (downloads.length > 0) {
                Promise.all(downloads).then(() => {
                    resolve(true);
                }).catch((error) => {
                    reject(error);
                });
            } else {
                // No downloads pending, done!
                resolve(true);
            }
            this.save();
        });
    }
    updateLanguage() {
        this.language = HotsHelpers.getConfig().getOption("language");
        this.update();
    }
    updateReplays() {
        this.progressTaskNew();
        return new Promise((resolve, reject) => {
            // Do not update replays more often than every 30 seconds
            let replayUpdateAge = ((new Date()).getTime() - this.replays.lastUpdate) / 1000;
            if (replayUpdateAge < 30) {
                resolve(true);
                return;
            }
            // Update replays
            let accounts = HotsHelpers.getConfig().getAccounts();
            let gameStorageDir = HotsHelpers.getConfig().getOption("gameStorageDir");
            let replayTasks = [];
            for (let a = 0; a < accounts.length; a++) {
                for (let p = 0; p < accounts[a].players.length; p++) {
                    let replayPath = path.join(gameStorageDir, "Accounts", accounts[a].id, accounts[a].players[p], "Replays", "Multiplayer");
                    let files = fs.readdirSync(replayPath);
                    files.forEach((file) => {
                        if (file.match(/\.StormReplay$/)) {
                            let fileAbsolute = path.join(replayPath, file);
                            if (this.replays.fileNames.indexOf(fileAbsolute) === -1) {
                                // New replay detected
                                replayTasks.push( this.addReplay(fileAbsolute) );
                            }
                        }
                    });
                }
            }
            this.replays.lastUpdate = (new Date()).getTime();
            if (replayTasks.length === 0) {
                resolve(true);
            } else {
                Promise.all(replayTasks).then((replays) => {
                    // Sort replays (newest first)
                    this.replays.details.sort((a, b) => {
                        return b.mtime - a.mtime;
                    });
                    // Only sore the details for the latest 100 replays
                    if (this.replays.details.length > 100) {
                        this.replays.details.splice(100);
                    }
                    // Update done!
                    resolve(true);
                }).catch((error) => {
                    reject(error);
                });
            }
        }).then((result) => {
            this.progressTaskDone();
            return result;
        }).catch((error) => {
            this.progressTaskFailed();
            throw error;
        });
    }
    updateSaves() {
        this.progressTaskNew();
        return new Promise((resolve, reject) => {
            // Do not update saves more often than every 10 seconds
            let replayUpdateAge = ((new Date()).getTime() - this.saves.lastUpdate) / 1000;
            if (replayUpdateAge < 10) {
                resolve(true);
                return;
            }
            // Update saves
            let accounts = HotsHelpers.getConfig().getAccounts();
            let gameStorageDir = HotsHelpers.getConfig().getOption("gameStorageDir");
            for (let a = 0; a < accounts.length; a++) {
                for (let p = 0; p < accounts[a].players.length; p++) {
                    let replayPath = path.join(gameStorageDir, "Accounts", accounts[a].id, accounts[a].players[p], "Saves", "Rejoin");
                    let files = fs.readdirSync(replayPath);
                    files.forEach((file) => {
                        if (file.match(/\.StormSave$/)) {
                            let fileAbsolute = path.join(replayPath, file);
                            let fileStats = fs.statSync(path.join(replayPath, file));
                            if (this.saves.latestSave.mtime < fileStats.mtimeMs) {
                                this.saves.latestSave.file = fileAbsolute;
                                this.saves.latestSave.mtime = fileStats.mtimeMs;
                            }
                        }
                    });
                }
            }
            this.saves.lastUpdate = (new Date()).getTime();
            resolve(true);
        }).then((result) => {
            this.progressTaskDone();
            return result;
        }).catch((error) => {
            this.progressTaskFailed();
            throw error;
        });
    }
    progressReset() {
        this.updateProgress.tasksPending = 1;
        this.updateProgress.tasksDone = 0;
        this.updateProgress.tasksFailed = 0;
        this.progressRefresh();
    }
    progressTaskNew() {
        this.updateProgress.tasksPending++;
        this.progressRefresh();
    }
    progressTaskDone() {
        this.updateProgress.tasksDone++;
        this.progressRefresh();
    }
    progressTaskFailed() {
        this.updateProgress.tasksFailed++;
        this.progressRefresh();
    }
    progressRefresh() {
        this.emit("update.progress", Math.round(this.updateProgress.tasksDone * 100 / this.updateProgress.tasksPending));
    }

    addReplay(replayFile) {
        return new Promise((resolve, reject) => {
            this.progressTaskNew();
            this.loadReplay(replayFile).then((replayData) => {
                this.replays.fileNames.push(replayFile);
                if (replayData !== null) {
                    this.replays.details.push(replayData);
                    if (this.replays.latestReplay.mtime < replayData.mtime) {
                        this.replays.latestReplay = replayData;
                    }
                }
                this.progressTaskDone();
                resolve(replayData);
            }).catch((error) => {
                this.progressTaskFailed();
                reject(error);
            });
        });
    }

    loadReplay(replayFile) {
        return new Promise((resolve, reject) => {
            try {
                let fileStats = fs.statSync(replayFile);
                let replay = new HotsReplay(replayFile);
                let replayData = {
                    file: replayFile,
                    mtime: fileStats.mtimeMs,
                    replayDetails: replay.getReplayDetails()
                };
                resolve(replayData);
            } catch (error) {
                reject(error);
            }
        });
    }
}

module.exports = HotsGameData;
