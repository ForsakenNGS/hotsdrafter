const jimp = require('jimp');

class HotsHelpers {
    static screenshotVirtualScreen(screen, x, y, width, height) {
        let result = Object.assign({}, screen);
        result.offsetX += x;
        result.offsetY += y;
        result.width = width;
        result.height = height;
        result.crop = width+"x"+height+"+"+x+"+"+y;
        return result;
    }
    static imageBackgroundMatch(image, colorMatches, tolerance) {
        if (typeof tolerance === "undefined") {
            tolerance = 2;
        }
        let matchCount = 0;
        let matchesPositive = colorMatches;
        let matchesNegative = [];
        // Top Left
        if (HotsHelpers.imagePixelMatch(image, 0, 0, matchesPositive, matchesNegative)) {
            matchCount++;
        }
        // Top Center
        if (HotsHelpers.imagePixelMatch(image, Math.floor(image.bitmap.width / 2), 0, matchesPositive, matchesNegative)) {
            matchCount++;
        }
        // Top Right
        if (HotsHelpers.imagePixelMatch(image, image.bitmap.width-1, 0, matchesPositive, matchesNegative)) {
            matchCount++;
        }
        // Center Left
        if (HotsHelpers.imagePixelMatch(image, 0, Math.floor(image.bitmap.height / 2), matchesPositive, matchesNegative)) {
            matchCount++;
        }
        // Center Right
        if (HotsHelpers.imagePixelMatch(image, image.bitmap.width-1, Math.floor(image.bitmap.height / 2), matchesPositive, matchesNegative)) {
            matchCount++;
        }
        // Bottom Left
        if (HotsHelpers.imagePixelMatch(image, 0, image.bitmap.height-1, matchesPositive, matchesNegative)) {
            matchCount++;
        }
        // Bottom Center
        if (HotsHelpers.imagePixelMatch(image, 0, Math.floor(image.bitmap.height / 2), matchesPositive, matchesNegative)) {
            matchCount++;
        }
        // Bottom Right
        if (HotsHelpers.imagePixelMatch(image, image.bitmap.width-1, image.bitmap.height-1, matchesPositive, matchesNegative)) {
            matchCount++;
        }
        return matchCount >= (9 - tolerance);
    }
    static imageCompare(imageA, imageB, rasterSize) {
        if (typeof rasterSize === "undefined") {
            rasterSize = 1;
        }
        let score = 0;
        let scoreCount = Math.floor(imageA.bitmap.width / rasterSize) * Math.floor(imageA.bitmap.height / rasterSize);
        for (let x = 0; x < imageA.bitmap.width; x+=rasterSize) {
            for (let y = 0; y < imageA.bitmap.height; y+=rasterSize) {
                let pixelColorA = imageA.getPixelColor(x, y);
                let pixelColorB = imageB.getPixelColor(x, y);
                score += HotsHelpers.imagePixelCompare(pixelColorA, pixelColorB) / scoreCount;
            }
        }
        return score;
    }
    static imageFindColor(image, matchesColor) {
        for (let x = 0; x < image.bitmap.width; x++) {
            for (let y = 0; y < image.bitmap.height; y++) {
                if (HotsHelpers.imagePixelMatch(image, x, y, matchesColor, [])) {
                    return true;
                }
            }
        }
        return false;
    }
    static imageCleanupName(image, matchesPositive, matchesNegative, colorPositive, colorNegative) {
        if (typeof matchesNegative === "undefined") {
            matchesNegative = [];
        }
        if (typeof colorPositive === "undefined") {
            colorPositive = 0xFFFFFFFF;
        }
        if (typeof colorNegative === "undefined") {
            colorNegative = 0x000000FF;
        }
        let textMin = image.bitmap.width-1;
        let textMax = 0;
        for (let x = 0; x < image.bitmap.width; x++) {
            let positive = false;
            let negative = false;
            for (let y = 0; y < image.bitmap.height; y++) {
                let pixelColor = image.getPixelColor(x, y);
                let pixelMatch = HotsHelpers.imagePixelColorMatch(pixelColor, matchesPositive, matchesNegative);
                if (pixelMatch > 0) {
                    image.setPixelColor( HotsHelpers.imageColorMix(colorPositive, colorNegative, pixelMatch / 255), x, y );
                    positive = true;
                } else {
                    image.setPixelColor(colorNegative, x, y);
                }
                if (pixelMatch < 0) {
                    negative = true;
                }
            }
            if (positive && !negative) {
                textMin = Math.min(textMin, x);
                textMax = Math.max(textMax, x);
            }
        }
        textMin = Math.max(0, textMin - 8);
        textMax = Math.min(image.bitmap.width-1, textMax + 8);
        if (textMax < textMin) {
            return false;
        } else {
            image.crop(textMin, 0, textMax - textMin, image.bitmap.height);
            return true;
        }
    }
    static imagePixelCompare(pixelColorA, pixelColorB) {
        let colorA = { b: (pixelColorA >> 8) & 0xFF, g: (pixelColorA >> 16) & 0xFF, r: (pixelColorA >> 24) & 0xFF };
        let colorB = { b: (pixelColorB >> 8) & 0xFF, g: (pixelColorB >> 16) & 0xFF, r: (pixelColorB >> 24) & 0xFF };
        let colorDiffLum = HotsHelpers.imageColorLumDiff(colorA, colorB);
        let colorDiffHue = HotsHelpers.imageColorHueDiff(colorA, colorB);
        let matchValue = Math.round(
            1 + ((128 - colorDiffLum) * 63 / 128) + (Math.max(0, 90 - colorDiffHue) * 191 / 90)
        );
        return matchValue;
    }
    static imagePixelMatch(image, x, y, matchesPositive, matchesNegative) {
        let pixelColor = image.getPixelColor(x, y);
        return this.imagePixelColorMatch(pixelColor, matchesPositive, matchesNegative)
    }
    static imagePixelColorMatch(pixelColor, matchesPositive, matchesNegative) {
        let color = { a: pixelColor & 0xFF, b: (pixelColor >> 8) & 0xFF, g: (pixelColor >> 16) & 0xFF, r: (pixelColor >> 24) & 0xFF };
        let matchBest = (matchesPositive.length === 0 ? 255 : 0);
        for (let m = 0; m < matchesPositive.length; m++) {
            matchBest = Math.max(
                matchBest, HotsHelpers.imageColorMatch(color, matchesPositive[m].color, matchesPositive[m].toleranceLum, matchesPositive[m].toleranceHue)
            );
        }
        for (let m = 0; m < matchesNegative.length; m++) {
            if (HotsHelpers.imageColorMatch(color, matchesNegative[m].color, matchesNegative[m].toleranceLum, matchesNegative[m].toleranceHue)) {
                matchBest = -1;
                break;
            }
        }
        return matchBest;
    }
    static imageColorAlpha(color, alpha) {
        return color - (color & 0xFF) + alpha;
    }
    static imageColorMix(colorA, colorB, ratio) {
        if (typeof ratio === "undefined") {
            ratio = 0.5;
        }
        if (typeof colorA == "object") {
            return {
                r: Math.round((colorA.r * ratio) + (colorB.r * (1 - ratio))),
                g: Math.round((colorA.g * ratio) + (colorB.g * (1 - ratio))),
                b: Math.round((colorA.b * ratio) + (colorB.b * (1 - ratio)))
            };
        } else {
            return Math.round((colorA & 0xFF) * ratio + (colorB & 0xFF) * (1 - ratio)) +
                (Math.round(((colorA >> 8) & 0xFF) * ratio + ((colorB >> 8) & 0xFF) * (1 - ratio)) << 8) +
                (Math.round(((colorA >> 16) & 0xFF) * ratio + ((colorB >> 16) & 0xFF) * (1 - ratio)) << 16) +
                (Math.round(((colorA >> 24) & 0xFF) * ratio + ((colorB >> 24) & 0xFF) * (1 - ratio)) << 24) >>> 0;

        }
    }
    static imageColorHue(color) {
        let valueMin = Math.min(color.r, color.g, color.b);
        let valueMax = Math.max(color.r, color.g, color.b);
        if (valueMin == valueMax) {
            return 0;
        }
        let hue = 0;
        if (valueMax === color.r) {
            hue = (color.g - color.b) / (valueMax - valueMin);
        }
        if (valueMax === color.g) {
            hue = 2 + (color.b - color.r) / (valueMax - valueMin);
        }
        if (valueMax === color.b) {
            hue = 4 + (color.r - color.g) / (valueMax - valueMin);
        }
        hue *= 60;
        if (hue < 0) {
            hue += 360;
        }
        return hue;
    }
    static imageColorHueDiff(colorA, colorB) {
        let hueA = HotsHelpers.imageColorHue(colorA);
        let hueB = HotsHelpers.imageColorHue(colorB);
        let hueDiff = Math.abs(hueA - hueB);
        if (hueDiff > 180) {
            hueDiff -= 180;
        }
        return Math.abs(hueDiff);
    }
    static imageColorLumDiff(colorA, colorB) {
        return (Math.abs(colorA.r - colorB.r) + Math.abs(colorA.g - colorB.g) + Math.abs(colorA.b - colorB.b)) / 3;
    }
    static imageColorMatch(colorA, colorB, toleranceLum, toleranceHue) {
        if (typeof toleranceHue === "undefined") {
            toleranceHue = toleranceLum;
        }
        let colorDiffLum = HotsHelpers.imageColorLumDiff(colorA, colorB);
        let colorDiffHue = HotsHelpers.imageColorHueDiff(colorA, colorB);
        if ((colorDiffLum <= toleranceLum) && (colorDiffHue <= toleranceHue)) {
            let matchValue = Math.round(
                1 + ((toleranceLum - colorDiffLum) * 127 / toleranceLum) + ((toleranceHue - colorDiffHue) * 127 / toleranceHue)
            );
            return matchValue;
        } else {
            return 0;
        }
    }
    static scaleOffset(source, baseSize, targetSize) {
        let result = Object.assign({}, source);
        result.x = Math.round((source.x / baseSize.x) * targetSize.x);
        result.y = Math.round((source.y / baseSize.y) * targetSize.y);
        return result;
    }
    static logDebug(value, depth) {
        if (typeof depth === "undefined") {
            depth = null;
        }
        console.log(require('util').inspect(value, { depth: depth }));
    }
}

module.exports = HotsHelpers;
