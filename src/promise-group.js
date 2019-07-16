// Local classes
const EventHandler = require('./event-handler.js');

class PromiseGroup extends EventHandler {

    constructor(promises) {
        super();
        this.countDone = 0;
        this.promises = (typeof promises === "undefined" ? [] : promises);
        this.groupPromise = null;
    }

    add(promise) {
        if (this.groupPromise !== null) {
            throw new Error("Can't add new promises after handlers were added!")
        }
        this.promises.push(promise);
        promise.then(() => {
            this.countDone++;
            this.trigger("update");
        });
        this.trigger("added", promise);
        this.trigger("update");
        return this;
    }
    getCount() {
        return this.promises.length;
    }
    getCountDone() {
        return this.countDone;
    }
    getGroupPromise() {
        if (this.groupPromise === null) {
            this.groupPromise = Promise.all(this.promises);
            this.groupPromise.then(() => {
                this.trigger("done");
            }).catch((error) => {
                this.trigger("error", error);
            });
        }
        return this.groupPromise;
    }
    getPromises() {
        return this.promises;
    }
    then(onFullfilled, onRejected) {
        return this.getGroupPromise().then(onFullfilled, onRejected);
    }
    catch(onRejected) {
        return this.getGroupPromise().catch(onRejected);
    }
    finally(onSettled) {
        return this.getGroupPromise().finally(onSettled);
    }
}

module.exports = PromiseGroup;
