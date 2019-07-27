// Nodejs dependencies
const EventEmitter = require('events');

class HotsTalentSuggestions extends EventEmitter {

    /**
     * @param {HotsDraftApp} app
     */
    constructor(app) {
        super();
        this.app = app;
        this.screen = app.screen;
        // Update suggestions when the draft changes
        let self = this;
        this.app.on("game.started", function() {
            self.update(this);
            self.emit("change");
        });
        this.app.on("game.ended", function() {
            self.update(this);
            self.emit("change");
        });
    }
    init() {
        throw new Error('Function "init" not implemented for current talent provider!');
    }
    update() {
        throw new Error('Function "update" not implemented for current talent provider!');
    }
    handleGuiAction(parameters) {
        throw new Error('Function "handleGuiAction" not implemented for current talent provider!');
    }
    getTemplate() {
        throw new Error('Function "getTemplate" not implemented for current talent provider!');
    }
    getTemplateData() {
        throw new Error('Function "getTemplateData" not implemented for current talent provider!');
    }
}

module.exports = HotsTalentSuggestions;
