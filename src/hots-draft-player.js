// Nodejs dependencies
const EventEmitter = require('events');

class HotsDraftPlayer extends EventEmitter {

    constructor(index, team) {
        super();
        this.index = index;
        this.name = null;
        this.nameFinal = false;
        this.team = team;
        this.character = null;
        this.detectionError = false;
        this.locked = false;
        this.imagePlayerName = null;
        this.imageHeroName = null;
        this.recentPicks = null;
    }
    getIndex() {
        return this.index;
    }
    getName() {
        return this.name;
    }
    getTeam() {
        return this.team;
    }
    getCharacter() {
        return this.character;
    }
    getImagePlayerName() {
        return this.imagePlayerName;
    }
    getImageHeroName() {
        return this.imageHeroName;
    }
    getRecentPicks() {
        return this.recentPicks;
    }
    isDetectionFailed() {
        return this.detectionError;
    }
    isLocked() {
        return this.locked;
    }
    isNameFinal() {
        return this.nameFinal;
    }
    setName(name, final) {
        if (this.name !== name) {
            let oldName = this.name;
            this.name = name;
            this.emit("name.updated", name, oldName);
            this.emit("change");
        }
        if (!this.nameFinal) {
            this.nameFinal = (typeof final === "undefined" ? false : final);
        }
    }
    setTeam(team) {
        if (this.team !== team) {
            let oldTeam = this.team;
            this.team = team;
            this.emit("team.updated", team, oldTeam);
            this.emit("change");
        }
    }
    setCharacter(character, detectionError) {
        if (typeof detectionError === "undefined") {
            detectionError = false;
        }
        if (this.character !== character) {
            let oldCharacter = this.character;
            this.character = character;
            this.detectionError = detectionError;
            this.emit("character.updated", character, oldCharacter);
            this.emit("change");
        }
    }
    setLocked(locked) {
        if (this.locked !== locked) {
            this.locked = locked;
            if (locked) {
                this.emit("locked");
            } else {
                this.emit("unlocked");
            }
            this.emit("change");
        }
    }
    setImagePlayerName(image) {
        this.imagePlayerName = image;
    }
    setImageHeroName(image) {
        this.imageHeroName = image;
    }
    setRecentPicks(picks) {
        this.recentPicks = picks;
        this.emit("change");
    }
}

module.exports = HotsDraftPlayer;
