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
        this.bans[index] = hero;
    }
    addBanImageData(index, imageData) {
        this.banImageData[index] = imageData;
    }
    addPlayer(player) {
        this.players.push(player);
        let self = this;
        player.on("change", function() {
            self.emit("player.updated", this);
            self.emit("change");
        });
    }
    getColor() {
        return this.color;
    }
    getBans() {
        return this.bans;
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
