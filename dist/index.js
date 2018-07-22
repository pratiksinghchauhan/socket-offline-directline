"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const directline = require("../dist/bridge");
const express = require("express");
const ejs_1 = require("ejs");
var builder = require('botbuilder');
const app = express();

app.use(express.static(__dirname))
app.set('view engine', 'ejs');



app.get('/', (req, res) => {
    console.log("inside");
    ejs_1.renderFile(__dirname+"/index.ejs",(err, str) => {
        if (err)
            console.log("ejs error", err);
        else
            res.send(str);
    });    
});


var connector = new builder.ChatConnector();
var bot = new builder.UniversalBot(connector);


bot.dialog('/', function(session) {
    session.send('Wohoooooo this worked');
    session.endDialog();
});


app.post('/api/messages', connector.listen());

directline.initializeRoutes(app, "http://127.0.0.1:9002", "http://127.0.0.1:9002/api/messages", true, 9002);
//# sourceMappingURL=index.js.map