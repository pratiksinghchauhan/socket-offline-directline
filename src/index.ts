import * as directline from "../dist/bridge";
import * as express from 'express';


const app = express();
directline.initializeRoutes(app, "http://127.0.0.1:9002", "http://127.0.0.1:8080/api/messages", true, 9002);