// Nodejs dependencies
const fs = require('fs');
const path = require('path');
const Twig = require('twig');

// Local classes
const HotsHelpers = require('./hots-helpers.js');
const HotsReplay = require('hots-replay');

// Templates
const templateConfig = path.resolve(__dirname, "..", "gui", "pages", "config.twig.html");

class Config {

    constructor() {
        this.options = {
            language: "en-us",
            draftProvider: "heroescounters",
            talentProvider: "icyveins",
            playerName: "",
            gameDisplay: null,
            gameStorageDir: null,
            gameImproveDetection: true
        };
        this.visible = false;
        // Load gameData and exceptions from disk
        this.load();
        // Try to detect missing options
        this.detect();
    }
    getFile() {
        return path.join(HotsHelpers.getStorageDir(), "config.json");
    }
    getOption(name) {
        if (this.options.hasOwnProperty(name)) {
            return this.options[name];
        } else {
            return null;
        }
    }
    getAccounts() {
        if (this.options.gameStorageDir === null) {
            return [];
        }
        let accounts = [];
        let files = fs.readdirSync(path.join(this.options.gameStorageDir, "Accounts"));
        files.forEach((file) => {
            if (file.match(/^[0-9]+$/)) {
                accounts.push({
                    id: file,
                    players: this.getPlayers(file)
                });
            }
        });
        return accounts;
    }
    getPlayers(accountId) {
        if (this.options.gameStorageDir === null) {
            return [];
        }
        let players = [];
        let files = fs.readdirSync(path.join(this.options.gameStorageDir, "Accounts", accountId));
        files.forEach((file) => {
            if (file.match(/^[0-9]+\-Hero\-[0-9]+\-[0-9]+$/)) {
                players.push(file);
            }
        });
        return players;
    }
    getTesseractLanguage() {
        switch (this.options.language) {
            default:
            case "en-us":
                return "eng";
            case "de-de":
                return "deu";
            case "es-es":
            case "es-mx":
                return "spa";
            case "fr-fr":
                return "fra";
            case "it-it":
                return "ita";
            case "pt-br":
                return "por";
            case "pl-pl":
                return "pol";
            case "ru-ru":
                return "rus";
            case "ko-kr":
                return "kor";
            case "zh-tw":
                return "chi_sim";
        }
    }
    setOption(name, value) {
        this.options[name] = value;
        this.save();
    }
    detect() {
        let dirty = false;
        // Detect settings if possible
        if (this.options.gameStorageDir === null) {
            this.options.gameStorageDir = HotsHelpers.detectGameStorageDir();
            dirty = true;
        }
        if (dirty) {
            this.save();
        }
    }
    load() {
        let configFile = this.getFile();
        // Read the data from file
        if (!fs.existsSync(configFile)) {
            // Cache file does not exist! Initialize empty data object.
            return;
        }
        let configContent = fs.readFileSync(configFile);
        try {
            let configData = JSON.parse(configContent.toString());
            Object.assign(this.options, configData);
        } catch (e) {
            console.error("Failed to read configuration!");
            console.error(e);
        }
    }
    save() {
        // Create cache directory if it does not exist
        let storageDir = HotsHelpers.getStorageDir();
        if (!fs.existsSync( storageDir )) {
            fs.mkdirSync(storageDir, { recursive: true });
        }
        // Write specific type into cache
        let configFile = this.getFile();
        fs.writeFileSync( configFile, JSON.stringify(this.options) );
    }
    render(container, jQuery) {
        // Render update template?
        Twig.renderFile(templateConfig, { config: this }, (error, html) => {
            if (error) {
                console.error(error);
            } else {
                jQuery(container).html(html);
            }
        });
    }

}

module.exports = Config;
