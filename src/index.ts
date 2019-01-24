import * as directline from "./bridge";
import * as express from 'express';


const app = express();


let execute = (host, port, urlCallback) => {
    // const app = express();
    directline.initializeRoutes(app, `${host}:${port}`, urlCallback, true, port);
}


module.exports = {execute}

execute("http://127.0.0.1", 9002, "http://127.0.0.1:8080/api/messages");