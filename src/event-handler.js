class EventHandler {

    constructor() {
        this.events = {};
    }
    on(event, callback) {
        if (!this.events.hasOwnProperty(event)) {
            this.events[event] = [];
        }
        this.events[event].push(callback);
    }
    off(event, callback) {
        if (!this.events.hasOwnProperty(event)) {
            return false;
        }
        let callbackIndex = this.events[event].indexOf(callback);
        if (callbackIndex >= 0) {
            this.events[event].splice(callbackIndex, 1);
        }
    }
    trigger(event, ...parameters) {
        if (!this.events.hasOwnProperty(event)) {
            return;
        }
        for (let i = 0; i < this.events[event].length; i++) {
            this.events[event][i].call(this, ...parameters);
        }
    }

}

module.exports = EventHandler;
