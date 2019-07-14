const Twig = require('twig');
const ioHook = require('iohook');
const screenshot = require('screenshot-desktop');
const HeroesCountersProvider = require('../src/external/heroescounters.js');
const HotsDraftScreen = require('../src/hots-draft-screen.js');

/**
 * @param {HotsDraftScreen} draft
 */
function displayDraftScreen(draft, provider) {
    Twig.renderFile('gui/main.twig.html', { draft: draft, provider: provider }, (error, html) => {
        if (error) {
            console.error(error);
        } else {
            jQuery(".content").html(html);
        }
    });
}

let screen = new HotsDraftScreen();
let provider = new HeroesCountersProvider(screen);
provider.init();
provider.on("change", function() {
    displayDraftScreen(screen, provider);
});

screenshot.listDisplays().then((displays) => {
    let updateScreenshot = function() {
        screenshot({ screen: displays[0].id }).then((image) => {
            screen.detect(image);
        });
        /*
        screen.detect("demo/hots-draft-2.png");
        screen.detect("demo/hots-draft-2.png").then(() => {
            console.log("DETECT DONE!");
            screen.detect("demo/hots-draft-4.png").then(() => {
                console.log("UPDATE DONE!");
                screen.detect("demo/hots-draft-6.png");
            });
        });
        */
    };
    // Schedule next update when the previous is done
    screen.on("update-done", () => {
        if (screen.getMap() !== null) {
            setTimeout(function() {
                updateScreenshot();
            }, 1000);
        }
    });
    // Start updating via hotkey
    const clipboardShortcut = ioHook.registerShortcut([29, 32], (keys) => {
        updateScreenshot();
    });
    ioHook.start();
});

