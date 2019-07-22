// Nodejs dependencies
const request = require('request');
const cheerio = require('cheerio');
const https = require('https');
const fs = require('fs');
const path = require('path');
const jimp = require('jimp');

// Local classes
const PromiseGroup = require('./promise-group.js');
const HotsHelpers = require('./hots-helpers.js');

class HotsHeroes {

    constructor(language) {
        this.language = language;
        this.heroes = {
            name: [],
            details: {},
            corrections: {}
        };
        // Load heroes and exceptions from disk
        this.load();
    }
    add(name) {
        name = this.fixName(name);
        if (this.heroes.name.indexOf(name) === -1) {
            this.heroes.name.push(name);
        }
    }
    addDetails(name, details) {
        this.heroes.details[name] = details;
    }
    addCorrection(from, to) {
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
    correct(name) {
        if (this.heroes.corrections.hasOwnProperty(name)) {
            return this.heroes.corrections[name];
        }
        return name;
    }
    exists(name) {
        return (this.heroes.name.indexOf(name) !== -1);
    }
    fixName(name) {
        switch (name) {
            case "ETC":
                name = "E.T.C.";
                break;
        }
        name = name.toUpperCase();
        return name;
    }
    getNames() {
        return this.heroes.name;
    }
    getImage(heroName) {
        heroName = this.fixName(heroName);
        return path.join(HotsHelpers.getStorageDir(), "heroes", heroName+"_crop.png");
    }
    getFile() {
        return path.join(HotsHelpers.getStorageDir(), "heroes.json");
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
            this.heroes = cacheData;
        } catch (e) {
            console.error("Failed to read heroes data!");
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
        fs.writeFileSync( storageFile, JSON.stringify(this.heroes) );
    }
    update() {
        let url = "https://heroesofthestorm.com/"+this.language+"/heroes/";
        let updatePromise = new PromiseGroup();
        updatePromise.add(new Promise((resolve, reject) => {
            request({
                'method': 'GET',
                'uri': url,
                headers: {
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
                this.updateHandler(body, updatePromise);
                updatePromise.trigger("start", updatePromise);
                resolve();
            });
        }));
        return updatePromise;
    }
    updateHandler(content, updatePromise) {
        let self = this;
        let page = cheerio.load(content);
        // Load heroesByName
        const heroDataVar = "window.blizzard.hgs.heroData";
        page("script").each(function() {
            let script = page(this).html();
            if (script.indexOf(heroDataVar) === 0) {
                let heroDataRaw = script.substr(heroDataVar.length + 3);
                heroDataRaw = heroDataRaw.substr(0, heroDataRaw.indexOf(";\n"));
                let heroData = JSON.parse(heroDataRaw);
                for (let i = 0; i < heroData.length; i++) {
                    let hero = heroData[i];
                    let heroImageUrl = hero.circleIcon;
                    let heroName = self.fixName(hero.name);
                    self.add(heroName);
                    self.addDetails(heroName, hero);
                    updatePromise.add( self.downloadHeroIcon(heroName, heroImageUrl) );
                }
            }
        });
        this.save();
    }

}

module.exports = HotsHeroes;
