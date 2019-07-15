// Local classes
const EventHandler = require('./event-handler.js');

class HotsDraftPlayer extends EventHandler {

    constructor(index, team) {
        super();
        this.index = index;
        this.name = null;
        this.team = team;
        this.character = null;
        this.detectionError = false;
        this.locked = false;
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
    isDetectionFailed() {
        return this.detectionError;
    }
    isLocked() {
        return this.locked;
    }
    setName(name) {
        if (this.name !== name) {
            let oldName = this.name;
            this.name = name;
            this.trigger("name-updated", name, oldName);
            this.trigger("change");
        }
    }
    setTeam(team) {
        if (this.team !== team) {
            let oldTeam = this.team;
            this.team = team;
            this.trigger("team-updated", team, oldTeam);
            this.trigger("change");
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
            this.trigger("character-updated", character, oldCharacter);
            this.trigger("change");
        }
    }
    setLocked(locked) {
        if (this.locked !== locked) {
            this.locked = locked;
            if (locked) {
                this.trigger("locked");
            } else {
                this.trigger("unlocked");
            }
            this.trigger("change");
        }
    }
}

module.exports = HotsDraftPlayer;
