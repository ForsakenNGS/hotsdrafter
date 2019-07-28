// Nodejs dependencies
const {TesseractWorker, TesseractUtils, ...TesseractTypes} = require('tesseract.js');
const worker = new TesseractWorker({
  //dataPath: process.argv[2],
  cachePath: process.argv[2]
  //cacheMethod: "none"
});

// send incoming messages from the main process to the app
process.on("message", (message) => {
  let action = message.shift();
  switch(action) {
    case "recognize":
      let image = Buffer.from(message.shift(), "base64");
      try {
        worker.recognize(image, ...message).then((result) => {
          process.send(["success", {
            confidence: result.confidence,
            text: result.text
          }])
        }).catch((error) => {
          process.send(["error", error.toString()])
        });
      } catch (error) {
        process.send(["error", error.toString()])
      }
      break;
  }
});