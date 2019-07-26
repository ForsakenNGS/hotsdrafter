// Nodejs dependencies
const EventEmitter = require('events');

class HotsDraftTeam extends EventEmitter {

    constructor(color) {
        super();
        this.color = color;
        this.bans = [null, null, null];
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
    getBanHero(index) {
        return this.bans[index];
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

}

module.exports = HotsDraftTeam;
