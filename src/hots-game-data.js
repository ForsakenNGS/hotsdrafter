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
            if (cacheData.formatVersion == 2) {
                this.languageOptions = cacheData.languageOptions;
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
            formatVersion: 2,
            languageOptions: this.languageOptions,
            maps: this.maps,
            heroes: this.heroes
        }) );
    }
    update() {
        let updatePromises = [
          this.updateMaps("en-us"),
          this.updateHeroes("en-us")
        ];
        if (this.language !== "en-us") {
            updatePromises.push( this.updateMaps(this.language) );
            updatePromises.push( this.updateHeroes(this.language) );
        }
        return Promise.all(updatePromises);
    }
    updateMaps(language) {
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
        });
    }
    updateHeroesFromResponse(language, content) {
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
                        let heroId = hero.slug;
                        let heroImageUrl = hero.circleIcon;
                        let heroName = self.fixHeroName(hero.name);
                        self.addHero(heroId, heroName, language);
                        self.addHeroDetails(heroId, hero, language);
                        if (language === "en-us") {
                            let downloadPromise = self.downloadHeroIcon(heroId, heroImageUrl);
                            downloadPromise.then(() => {
                                downloadsDone++;
                                self.emit("download.progress", Math.round(downloadsDone * 100 / downloads.length));
                            }).catch((error) => {
                                downloadsFailed++;
                            });
                            downloads.push(downloadPromise);
                        }
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
    updateLanguage() {
        this.language = HotsHelpers.getConfig().getOption("language");
        this.update();
    }

}

module.exports = HotsGameData;
