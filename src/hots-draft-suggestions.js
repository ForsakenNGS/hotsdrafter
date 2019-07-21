// Local classes
const EventHandler = require('./event-handler.js');

class HotsDraftSuggestions extends EventHandler {

    constructor(draftScreen) {
        super();
        this.downloadPromise = null;
        this.screen = draftScreen;
        // Update suggestions when the draft changes
        let self = this;
        this.screen.on("change", function() {
            self.update(this);
            self.trigger("change");
        });
        this.screen.on("update-failed", function() {
            self.trigger("error");
        });
    }
    downloadHotsData() {
        this.screen.getHeroes().update().on("start", (downloaderPromise) => {
            this.downloadPromise = downloaderPromise;
            this.trigger("update-started");
            this.downloadPromise.then(() => {
                this.downloadPromise = null;
                this.trigger("update-done");
            });
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
