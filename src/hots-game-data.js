// Nodejs dependencies
const request = require('request');
const cheerio = require('cheerio');
const https = require('https');
const fs = require('fs');
const path = require('path');
const jimp = require('jimp');
const EventEmitter = require('events');

// Local classes
const HotsHelpers = require('./hots-helpers.js');

class HotsGameData extends EventEmitter {

    constructor(language) {
        super();
        this.language = language;
        this.heroes = {
            name: [],
            details: {},
            corrections: {}
        };
        this.maps = {
            name: []
        };
        this.substitutions = {
            "ETC": "E.T.C."
        };
        // Load gameData and exceptions from disk
        this.load();
    }
    addHero(name) {
        name = this.fixHeroName(name);
        if (!this.heroExists(name)) {
            this.heroes.name.push(name);
        }
    }
    addMap(name) {
        name = this.fixMapName(name);
        if (!this.mapExists(name)) {
            this.maps.name.push(name);
        }
    }
    addHeroDetails(name, details) {
        this.heroes.details[name] = details;
    }
    addHeroCorrection(from, to) {
        this.heroes.corrections[from] = to;
        this.save();
    }
    downloadHeroIcon(heroName, heroImageUrl) {
        return new Promise((resolve, reject) => {
            let filename = path.join(HotsHelpers.getStorageDir(), "heroes", heroName+".png");
            let filenameCrop = path.join(HotsHelpers.getStorageDir(), "heroes", heroName+"_crop.png");
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
    correctHeroName(name) {
        if (this.heroes.corrections.hasOwnProperty(name)) {
            return this.heroes.corrections[name];
        }
        return name;
    }
    heroExists(name) {
        return (this.heroes.name.indexOf(name) !== -1);
    }
    mapExists(name) {
        return (this.maps.name.indexOf(name) !== -1);
    }
    fixMapName(name) {
        name = name.toUpperCase();
        return name;
    }
    fixHeroName(name) {
        if (this.substitutions.hasOwnProperty(name)) {
          name = this.substitutions[name];
        }
        name = name.toUpperCase();
        return name;
    }
    getMapNames() {
        return this.maps.name;
    }
    getHeroNames() {
        return this.heroes.name;
    }
    getHeroImage(heroName) {
        heroName = this.fixHeroName(heroName);
        return path.join(HotsHelpers.getStorageDir(), "heroes", heroName+"_crop.png");
    }
    getFile() {
        return path.join(HotsHelpers.getStorageDir(), "gameData.json");
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
            if (cacheData.formatVersion == 1) {
                this.maps = cacheData.maps;
                this.heroes = cacheData.heroes;
            }
        } catch (e) {
            console.error("Failed to read gameData data!");
            console.error(e);
        }
    }
    save() {
        // Sort hero names alphabetically
        this.heroes.name.sort();
        // Create cache directory if it does not exist
        let storageDir = HotsHelpers.getStorageDir();
        if (!fs.existsSync( storageDir )) {
            fs.mkdirSync(storageDir, { recursive: true });
        }
        // Write specific type into cache
        let storageFile = this.getFile();
        fs.writeFileSync( storageFile, JSON.stringify({
            formatVersion: 1,
            maps: this.maps,
            heroes: this.heroes
        }) );
    }
    update() {
        let updatePromises = [
          this.updateMaps(),
          this.updateHeroes()
        ];
        return Promise.all(updatePromises);
    }
    updateMaps() {
        let url = "https://heroesofthestorm.com/"+this.language+"/battlegrounds/";
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
                this.updateMapsFromResponse(body).then(() => {
                    resolve();
                }).catch((error) => {
                    reject(error);
                });
            });
        });
    }
    updateMapsFromResponse(content) {
        return new Promise((resolve, reject) => {
            let self = this;
            let page = cheerio.load(content);
            page(".BattlegroundText-header").each(function() {
                self.addMap( page(this).text() );
            });
            resolve();
            this.save();
        });
    }
    updateHeroes() {
        let url = "https://heroesofthestorm.com/"+this.language+"/heroes/";
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
                this.updateHeroesFromResponse(body).then(() => {
                    resolve();
                }).catch((error) => {
                    reject(error);
                });
            });
        });
    }
    updateHeroesFromResponse(content) {
        return new Promise((resolve, reject) => {
            let self = this;
            let page = cheerio.load(content);
            // Load heroesByName
            const heroDataVar = "window.blizzard.hgs.heroData";
            let downloads = [];
            let downloadsDone = 0;
            let downloadsFailed = 0;
            page("script").each(function() {
                let script = page(this).html();
                if (script.indexOf(heroDataVar) === 0) {
                    let heroDataRaw = script.substr(heroDataVar.length + 3);
                    heroDataRaw = heroDataRaw.substr(0, heroDataRaw.indexOf(";\n"));
                    let heroData = JSON.parse(heroDataRaw);
                    for (let i = 0; i < heroData.length; i++) {
                        let hero = heroData[i];
                        let heroImageUrl = hero.circleIcon;
                        let heroName = self.fixHeroName(hero.name);
                        self.addHero(heroName);
                        self.addHeroDetails(heroName, hero);
                        let downloadPromise = self.downloadHeroIcon(heroName, heroImageUrl);
                        downloadPromise.then(() => {
                            downloadsDone++;
                            self.emit("download.progress", Math.round(downloadsDone * 100 / downloads.length));
                        }).catch((error) => {
                            downloadsFailed++;
                        });
                        downloads.push(downloadPromise);
                    }
                }
            });
            if (downloads.length > 0) {
                this.emit("download.start");
                Promise.all(downloads).catch((error) => {
                    reject(error);
                }).then(() => {
                    resolve(true);
                }).finally(() => {
                    this.emit("download.done", (downloadsFailed === 0));
                });
            } else {
                // No downloads pending, done!
                resolve(true);
            }
            this.save();
        });
    }

}

module.exports = HotsGameData;
