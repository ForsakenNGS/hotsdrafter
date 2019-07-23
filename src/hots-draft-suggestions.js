// Nodejs dependencies
const EventEmitter = require('events');

class HotsDraftSuggestions extends EventEmitter {

    /**
     * @param {HotsDraftApp} app
     */
    constructor(app) {
        super();
        this.app = app;
        this.screen = app.screen;
        // Update suggestions when the draft changes
        let self = this;
        this.screen.on("change", function() {
            self.update(this);
            self.emit("change");
        });
    }
    init() {
        throw new Error('Function "init" not implemented for current suggestion provider!');
    }
    update() {
        throw new Error('Function "update" not implemented for current suggestion provider!');
    }
    handleGuiAction(parameters) {
        throw new Error('Function "handleGuiAction" not implemented for current suggestion provider!');
    }
    getTemplate() {
        throw new Error('Function "getTemplate" not implemented for current suggestion provider!');
    }
    getTemplateData() {
        throw new Error('Function "getTemplateData" not implemented for current suggestion provider!');
    }
}

module.exports = HotsDraftSuggestions;
