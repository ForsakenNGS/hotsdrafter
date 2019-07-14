// Local classes
const EventHandler = require('./event-handler.js');

class HotsDraftTeam extends EventHandler {

    constructor(color) {
        super();
        this.color = color;
        this.bans = [null, null, null];
        this.players = [];
    }
    addBan(index, hero) {
        this.bans[index] = hero;
    }
    addPlayer(player) {
        this.players.push(player);
        let self = this;
        player.on("change", function() {
            self.trigger("player-updated", this);
            self.trigger("change");
        });
    }
    getColor() {
        return this.color;
    }
    getBans() {
        return this.bans;
    }
    getPlayer(index) {
        if (index >= this.player.length) {
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
