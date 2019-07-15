const path = require('path');
const Twig = require('twig');
const ioHook = require('iohook');
const screenshot = require('screenshot-desktop');
const HeroesCountersProvider = require('../src/external/heroescounters.js');
const HotsDraftScreen = require('../src/hots-draft-screen.js');
const HotsHelpers = require('../src/hots-helpers.js');

const mainTemplate = path.resolve(__dirname, "..", "gui", "main.twig.html");
const waitTemplate = path.resolve(__dirname, "..", "gui", "wait.twig.html");


let screen = new HotsDraftScreen();
//screen.debug(true);
let provider = new HeroesCountersProvider(screen);
provider.init();

let correctionActive = false;

/**
 * @param {HotsDraftScreen} draft
 */
function displayDraftScreen(draft, provider) {
    Twig.renderFile(mainTemplate, { draft: draft, provider: provider }, (error, html) => {
        if (correctionActive) {
            jQuery("#correct-hero-modal").off("hidden.bs.modal").on("hidden.bs.modal", function() {
                correctionActive = false;
                displayDraftScreen(draft, provider);
            });
            return;
        }
        if (error) {
            console.error(error);
        } else {
            jQuery(".content").html(html);
            jQuery("[data-failed]").on("click", function() {
                let heroNameFailed = jQuery(this).attr("data-failed");
                jQuery("#correct-hero-modal .btn-primary").off("click").on("click", function(e) {
                    e.preventDefault();
                    screen.addHeroCorrection(heroNameFailed, jQuery("#correct-hero-modal select").val());
                    correctionActive = false;
                    jQuery("#correct-hero-modal").modal("hide");
                });
                jQuery("#correct-hero-modal").modal("show");
                jQuery("#correct-hero-modal").off("hidden.bs.modal").on("hidden.bs.modal", function() {
                    correctionActive = false;
                });
                correctionActive = true;
            });
        }
    });
}

function displayWaitScreen() {
    Twig.renderFile(waitTemplate, {}, (error, html) => {
        if (correctionActive) {
            jQuery("#correct-hero-modal").off("hidden.bs.modal").on("hidden.bs.modal", function() {
                correctionActive = false;
                displayWaitScreen();
            });
            return;
        }
        if (error) {
            console.error(error);
        } else {
            jQuery(".content").html(html);
        }
    });
}

provider.on("change", function() {
    displayDraftScreen(screen, provider);
});
provider.on("error", function(error) {
    if (screen.getMap() === null) {
        screen.clear();
        displayWaitScreen();
    }
});

displayWaitScreen();

screenshot.listDisplays().then((displays) => {
    let testScreenshot = async function() {
        let screenFull = displays[0];
        let start = new Date().getTime();
        await screenshot({ format: 'png', screen: screenFull.id });
        console.log("Full Screenshot: "+(new Date().getTime() - start));
        start = new Date().getTime();
        await screenshot({ format: 'png', screen: screenFull.id, region: { x: 100, y: 100, w: 500, h: 500 } });
        console.log("Partial Screenshot: "+(new Date().getTime() - start));
    };
    testScreenshot();

    let updateScreenshot = function() {
        screenshot({ format: 'png', screen: displays[0].id }).then((image) => {
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
            }, 100);
        }
    });
    // Start updating via hotkey
    const clipboardShortcut = ioHook.registerShortcut([29, 32], (keys) => {
        updateScreenshot();
    });
    ioHook.start();
});

