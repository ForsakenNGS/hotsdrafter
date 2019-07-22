const path = require("path");
const Twig = require("twig");

Twig.extendFunction("path", function(...segments) {
  return "file://"+path.resolve("..", ...segments);
})

module.exports = Twig;