// Nodejs dependencies
const fs = require('fs');
const request = require('request');

// Local classes
const HotsReplayUploader = require('../hots-replay-uploader.js');

class HotsApiUploader extends HotsReplayUploader {

    static upload(replayFilePath) {
        return new Promise((resolve, reject) => {
            try {
                let formData = {
                    file: fs.createReadStream(replayFilePath)
                };
                request.post({
                    url: "http://hotsapi.net/api/v1/replays",
                    formData: formData,
                    json: true
                }, function optionalCallback(err, httpResponse, result) {
                    if (err) {
                        reject(err);
                        return;
                    }
                    if (!result.success) {
                        reject(new Error("Error"));
                        return;
                    }
                    switch (result.status) {
                        default:
                            resolve("success");
                            return;
                        case "CustomGame":
                            resolve("custom-game");
                            return;
                        case "Duplicate":
                            resolve("duplicate");
                            return;
                    }
                });
            } catch (error) {
                reject(error);
            }
        });
    }

};

module.exports = HotsApiUploader;
