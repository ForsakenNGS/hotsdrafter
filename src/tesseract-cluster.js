// Nodejs dependencies
const fs = require('fs');
const path = require('path');
const {TesseractWorker, TesseractUtils, ...TesseractTypes} = require('tesseract.js');
const fork = require('child_process').fork;

const cacheDir = path.resolve("./cache/tesseract");

class TesseractCluster {

  constructor(threads) {
    this.threads = [];
    this.queue = [];
    while (threads-- > 0) {
      this.addWorker();
    }
  }

  addWorker() {
    let threadCache = path.join(cacheDir, "thread"+this.threads.length);
    if (!fs.existsSync(threadCache)) {
      fs.mkdirSync(threadCache, { recursive: true });
    }
    let thread = {
      job: null,
      process: fork("./src/tesseract-thread.js", [ threadCache ])
    };
    thread.process.on("message", (message) => {
      let result = message.shift();
      switch(result) {
        case "success":
          thread.job.resolve(...message);
          break;
        case "error":
          thread.job.reject(...message);
          break;
      }
      thread.job = null;
      this.checkQueue();
    });
    this.threads.push(thread);
  }

  addJob(image, langs, params) {
    return new Promise((resolve, reject) => {
      let job = {
        image: image, langs: langs, params: params,
        resolve: resolve, reject: reject
      };
      // Check for available threads
      for (let i = 0; i < this.threads.length; i++) {
        if (this.threads[i].job === null) {
          this.threads[i].job = job;
          this.threads[i].process.send(["recognize", image.toString("base64"), langs, params]);
          return;
        }
      }
      // No free thread, queue task
      this.queue.push(job)
    });

  }

  checkQueue() {
    if (this.queue.length > 0) {
      let nextJob = this.queue.shift();
      this.addJob(nextJob.image, nextJob.langs, nextJob.params).then((result) => {
        nextJob.resolve(result);
      }).catch((error) => {
        nextJob.reject(error);
      });
    }
  }

  recognize(image, langs, params) {
    return this.addJob(image, langs, params);
  }

}

module.exports = TesseractCluster;