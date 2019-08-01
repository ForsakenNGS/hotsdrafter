// Nodejs dependencies
const request = require('request');
const cheerio = require('cheerio');

// Local classes
const HotsTalentSuggestions = require('../hots-talent-suggestions.js');
const HotsHelpers = require('../hots-helpers.js');

class IcyVeinsProvider extends HotsTalentSuggestions {

    constructor(app) {
        super(app);
        this.heroesByName = {};
        this.heroesById = {};
        this.talents = {};
        this.updateActive = false;
        this.updatePending = false;
    }
    addHero(id, name, url) {
        let hero = {
            id: id, name: name, url: url
        }
        this.heroesByName[name.toUpperCase()] = hero;
        this.heroesById[id] = hero;
    }
    loadCoreData(response) {
        let self = this;
        let page = cheerio.load(response);
        // Load heroes
        page('.nav_content_block_entry_heroes_hero a').each(function() {
            let hero = page(this);
            let heroBuildUrl = hero.attr("href").replace("//", "https://");
            let heroName = hero.find("img + span").text();
            let heroIdMatch = heroBuildUrl.match(/heroes\/(.+)-build-guide$/i);
            if (heroIdMatch) {
                self.addHero(heroIdMatch[1], heroName, heroBuildUrl);
            }
        });
    }
    getHeroByName(name) {
        name = this.app.gameData.getHeroNameTranslation(name, "en-us");
        if (this.heroesByName.hasOwnProperty(name)) {
            return this.heroesByName[name];
        } else {
            return null;
        }
    }
    getHeroById(id) {
        return this.heroesById[id];
    }
    getTemplate() {
        return "external/icyveins.twig.html";
    }
    getTemplateData() {
        return {
            talents: this.getTalents()
        };
    }
    getTalents() {
        return this.talents;
    }
    init() {
        this.updateActive = true;
        let url = "https://www.icy-veins.com/heroes/";
        return new Promise((resolve, reject) => {
            request({
                'method': 'GET',
                'uri': url,
                'jar': true
            }, (error, response, body) => {
                this.updateActive = false;
                if (error || (typeof response === "undefined")) {
                    reject(error);
                    return;
                }
                if (response.statusCode !== 200) {
                    reject('Invalid status code <' + response.statusCode + '>');
                    return;
                }
                this.loadCoreData(body);
                resolve(true);
            });
        });
    }
    update() {
        return new Promise((resolve, reject) => {
            this.talents = null;
            let playerName = this.app.getConfig().getOption("playerName");
            if ((playerName !== "") && (this.app.statusDraftData !== null)) {
                // Check the selected hero
                let playerHero = null;
                for (let i = 0; i < this.app.statusDraftData.players.length; i++) {
                    let player = this.app.statusDraftData.players[i];
                    if (player.playerName === playerName) {
                        playerHero = this.getHeroByName(player.heroName);
                        break;
                    }
                }
                if (playerHero !== null) {
                    this.talents = playerHero;
                }
            }
            if (this.talents === null) {
                this.emit("change");
                resolve();
            } else {
                this.parseBuild(this.talents).then(() => {
                    this.emit("change");
                    resolve();
                }).catch((error) => {
                    console.error("Failed to parse build data for icy-veins provider, falling back to iframe.");
                    this.emit("change");
                    resolve();
                });
            }
        });
    }
    parseBuild(hero) {
        let parseTasks = [
            this.parseBuildSection("https://www.icy-veins.com/heroes/"+hero.id+"-build-guide", "build-guide")
            // Currently not used:
            //this.parseBuildSection("https://www.icy-veins.com/heroes/"+hero.id+"-abilities-strategy", "abilities-strategy"),
            //this.parseBuildSection("https://www.icy-veins.com/heroes/"+hero.id+"-talents", "talents")
        ];
        return Promise.all(parseTasks);
    }
    parseBuildSection(url, section) {
        return new Promise((resolve, reject) => {
            request({
                'method': 'GET',
                'uri': url,
                'jar': true
            }, (error, response, body) => {
                if (error || (typeof response === "undefined")) {
                    reject(error);
                    return;
                }
                if (response.statusCode !== 200) {
                    reject('Invalid status code <' + response.statusCode + '>');
                    return;
                }
                this.parseBuildSectionData(body, section);
                resolve(true);
            });
        });
    }
    parseBuildSectionData(body, section) {
        let self = this;
        let page = cheerio.load(body);
        switch (section) {
            case "build-guide":
                let buildData = {
                    strengths: [],
                    weaknesses: [],
                    talentCheatsheet: [],
                    tips: []
                };
                // Strengths and Weaknesses
                page('.heroes_strengths ul li span').each(function() {
                    buildData.strengths.push( self.processContentElements(page, this).html() );
                });
                page('.heroes_weaknesses ul li span').each(function() {
                    buildData.weaknesses.push( self.processContentElements(page, this).html() );
                });
                // Talent Build Cheatsheet
                page('.heroes_build').each(function() {
                    buildData.talentCheatsheet.push({
                        name: self.processContentElements(page, page(this).find(".heroes_build_header h3")).text(),
                        talents: self.processContentElements(page, page(this).find(".heroes_build_talents")).html(),
                        description: self.processContentElements(page, page(this).find(".heroes_build_text")).html()
                    });
                });
                // Tips and Tricks
                page('.heroes_tips li').each(function() {
                    buildData.tips.push( self.processContentElements(page, this).html() );
                });
                // Store parsed data
                if (!this.talents.hasOwnProperty("parsed")) {
                    this.talents.parsed = {};
                }
                Object.assign(this.talents.parsed, buildData);
                break;
        }
    }
    processContentElements(page, element) {
        let cheerioElement = page(element);
        // Disable links to not break the app
        cheerioElement.find("a").each(function() {
            page(this).attr("href", "#disabled");
        });
        // Fix image paths
        cheerioElement.find("img").each(function() {
            page(this).attr("src", page(this).attr("src").replace(/^\/\//, "https://"));
        });
        return cheerioElement;
    }
};

module.exports = IcyVeinsProvider;
