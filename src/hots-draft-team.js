// Nodejs dependencies
const EventEmitter = require('events');

class HotsDraftTeam extends EventEmitter {

    constructor(color) {
        super();
        this.color = color;
        this.bans = [null, null, null];
        this.bansLocked = 0;
        this.banImageData = [null, null, null];
        this.players = [];
    }
    addBan(index, hero) {
        if (this.bans[index] !== hero) {
            this.bans[index] = hero;
            this.emit("ban.update", index);
        }
    }
    addBanImageData(index, imageData) {
        if (this.banImageData[index] !== imageData) {
            this.banImageData[index] = imageData;
            this.emit("ban.update", index);
        }
    }
    addPlayer(player) {
        this.players.push(player);
        let self = this;
        player.on("change", function() {
            self.emit("player.update", this);
            self.emit("change");
        });
    }
    getColor() {
        return this.color;
    }
    getBans() {
        return this.bans;
    }
    getBansLocked() {
        return this.bansLocked;
    }
    getBanHero(index) {
        return this.bans[index];
    }
    getBanImages() {
        return this.banImageData;
    }
    getBanImageData(index) {
        return this.banImageData[index];
    }
    getPlayer(index) {
        if (index >= this.players.length) {
            return null;
        }
        return this.players[index];
    }
    getPlayers() {
        return this.players;
    }
    setColor(color) {
        this.color = color;
    }
    setBansLocked(bansLocked) {
        if (this.bansLocked !== bansLocked) {
            let bansLockedBefore = this.bansLocked;
            this.bansLocked = bansLocked;
            for (let i = bansLockedBefore; i < bansLocked; i++) {
                this.emit("ban.update", i);
            }
        }
    }

}

module.exports = HotsDraftTeam;
