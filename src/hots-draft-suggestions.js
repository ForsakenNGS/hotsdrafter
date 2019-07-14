// Local classes
const EventHandler = require('./event-handler.js');

class HotsDraftSuggestions extends EventHandler {

    constructor(draftScreen) {
        super();
        this.screen = draftScreen;
        // Update suggestions when the draft changes
        let self = this;
        this.screen.on("change", function() {
            self.update(this);
            self.trigger("change");
        });
    }
    init() {
        throw new Error('Function "init" not implemented for current suggestion provider!');
    }
    update() {
        throw new Error('Function "update" not implemented for current suggestion provider!');
    }
    getTemplate() {
        throw new Error('Function "getTemplate" not implemented for current suggestion provider!');
    }
}

module.exports = HotsDraftSuggestions;
