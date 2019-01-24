"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const directline = require("./bridge");
const express = require("express");
const app = express();
let execute = (host, port, urlCallback) => {
    // const app = express();
    directline.initializeRoutes(app, `${host}:${port}`, urlCallback, true, port);
};
module.exports = { execute };
execute("http://127.0.0.1", 9002, "http://127.0.0.1:8080/api/messages");
//# sourceMappingURL=index.js.map