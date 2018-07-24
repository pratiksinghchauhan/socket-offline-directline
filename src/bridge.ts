import * as express from 'express';
import bodyParser = require('body-parser');
import 'isomorphic-fetch';
import * as moment from 'moment';
import * as uuidv4 from 'uuid/v4';

import * as low from 'lowdb'
import * as FileSync from 'lowdb/adapters/FileSync'

const adapter = new FileSync('dist/db.json')
const db = low(adapter)

db.defaults({ conversations: [] })
    .write();
var connections = []


import { IActivity, IAttachment, IBotData, IChannelAccount, IConversation, IConversationAccount, IEntity, IMessageActivity, IUser, IConversationUpdateActivity } from './types';

const expires_in = 1800;
const conversationsCleanupInterval = 10000;
// let conversations: { [key: string]:  IConversation} = {};
let botDataStore: { [key: string]: IBotData } = {};


// conversationInitRequired -> By default require that a conversation is initialized before it is accessed, returning a 400
// when not the case. If set to false, a new conversation reference is created on the fly
export const initializeRoutes = (app: express.Server, serviceUrl: string, botUrl: string, conversationInitRequired = true, port: number = 3000) => {
    conversationsCleanup();
    app.use(bodyParser.json()); // for parsing application/json
    app.use(bodyParser.urlencoded({ extended: true })); // for parsing application/x-www-form-urlencoded
    app.use((req, res, next) => {
        res.header("Access-Control-Allow-Origin", "*");
        res.header("Access-Control-Allow-Methods", "GET, PUT, POST, DELETE, PATCH, OPTIONS");
        res.header("Access-Control-Allow-Headers", "Origin, X-Requested-With, Content-Type, Accept, Authorization");
        next();
    });
    // CLIENT ENDPOINT
    app.options('/directline', (req, res) => {
        res.status(200).end();
    })


    var expressWs = require('express-ws')(app);

    app.ws('/directline/:conversationId', function(ws, req) {
        console.log(req.params.conversationId);
        connections[req.params.conversationId] =  ws;

        ws.on('message', function(msg) {
            console.log(msg);
        });

        console.log('socket');
    });

    //Creates a conversation
    app.post('/directline/conversations', (req, res) => {
        let conversationId: string = uuidv4().toString();

        createConversation(conversationId)
        console.log("Created conversation with conversationId: " + conversationId);

        let activity = createConversationUpdateActivity(serviceUrl, conversationId);


        fetch(botUrl, {
            method: "POST",
            body: JSON.stringify(activity),
            headers: {
                "Content-Type": "application/json"
            }
        }).then(response => {
            res.status(response.status).send({
                streamUrl : "ws://localhost:9002/directline",
                conversationId,
                expires_in,
                token: "token"
            });
        });
    })

    app.listen(port, () => {
        console.log('listening' + port);
    });

    //reconnect API
    app.get('/v3/directline/conversations/:conversationId', (req, res) => {
        let watermark = req.query.watermark && req.query.watermark !== "null" ? Number(req.query.watermark) : 0;

        let conversation = getConversation(req.params.conversationId, conversationInitRequired)


        console.log("Get activities: " + req.params.conversationId);


        if (conversation) {
            //If the bot has pushed anything into the history array
            if (conversation.history.length > watermark) {
                let activities = conversation.history.slice(watermark)
                res.status(200).json({
                    activities,
                    watermark: watermark + activities.length
                });

                expressWs.getWss().clients[0].send({
                    activities,
                    watermark: watermark + activities.length
                })

            } else {
                res.status(200).send({
                    activities: [],
                    watermark
                })
            }
        }
        else {
            // Conversation was never initialized
            res.status(400).send;
        }

    })

    //Gets activities from store (local history array for now)
    app.get('/directline/conversations/:conversationId/activities', (req, res) => {
        let watermark = req.query.watermark && req.query.watermark !== "null" ? Number(req.query.watermark) : 0;

        let conversation = getConversation(req.params.conversationId, conversationInitRequired)


        console.log("Get activities: " + req.params.conversationId);


        if (conversation) {
            //If the bot has pushed anything into the history array
            if (conversation.history.length > watermark) {
                let activities = conversation.history.slice(watermark)
                res.status(200).json({
                    activities,
                    watermark: watermark + activities.length
                });

                expressWs.getWss().clients[0].send({
                    activities,
                    watermark: watermark + activities.length
                })

            } else {
                res.status(200).send({
                    activities: [],
                    watermark
                })
            }
        }
        else {
            // Conversation was never initialized
            res.status(400).send;
        }
    })

    //Sends message to bot. Assumes message activities. 
    app.post('/directline/conversations/:conversationId/activities', (req, res) => {

        console.log("Send message to bot: " + req.params.conversationId);

        let incomingActivity = req.body;
        //make copy of activity. Add required fields. 
        let activity = createMessageActivity(incomingActivity, serviceUrl, req.params.conversationId);

        let conversation = getConversation(req.params.conversationId, conversationInitRequired)

        if (conversation) {

            conversation.history.push(activity);

            db.get('conversations')
                .find({ conversationId: conversation.conversationId })
                .assign({ 'history': conversation.history})
                .write()

            fetch(botUrl, {
                method: "POST",
                body: JSON.stringify(activity),
                headers: {
                    "Content-Type": "application/json"
                }
            }).then(response => {
                res.status(response.status).json({ id: activity.id });
            });
        }
        else {
            // Conversation was never initialized
            res.status(400).send;
        }
    })

    app.post('/v3/directline/conversations/:conversationId/upload', (req, res) => { console.warn("/v3/directline/conversations/:conversationId/upload not implemented") })
    app.get('/v3/directline/conversations/:conversationId/stream', (req, res) => { console.warn("/v3/directline/conversations/:conversationId/stream not implemented") })

    // BOT CONVERSATION ENDPOINT

    app.post('/v3/conversations', (req, res) => { console.warn("/v3/conversations not implemented") })

    app.post('/v3/conversations/:conversationId/activities', (req, res) => {

        console.log("Post activity: " + req.params.conversationId);

        let activity: IActivity;

        activity = req.body;
        activity.id = uuidv4();
        activity.timestamp = new Date().toISOString();
        activity.from = { id: "id", name: "Atendente" };

        let conversation = getConversation(req.params.conversationId, conversationInitRequired)
        if (conversation) {

            conversation.history.push(activity);

            res.status(200).send();
        }
        else {
            // Conversation was never initialized
            res.status(400).send;
        }
    })

    app.post('/v3/conversations/:conversationId/activities/:activityId', (req, res) => {

        console.log("Post activityID: " + req.params.conversationId);

        let activity: IActivity;

        activity = req.body;
        activity.id = uuidv4();
        activity.timestamp = new Date().toISOString();
        activity.from = { id: "id", name: "Atendente" };

        let conversation = getConversation(req.params.conversationId, conversationInitRequired)
        if (conversation) {

            conversation.history.push(activity);

            expressWs.getWss().clients.forEach(item => {
                // console.log("aqui mandando")
                JSON.stringify({
                        activities : [activity],
                    })
            })

            // expressWs.getWss().clients[0].server.send()

            db.get('conversations')
                .find({ conversationId: conversation.conversationId })
                .assign({ 'history': conversation.history})
                .write()
            
            console.log(connections);
            connections[req.params.conversationId].send(
                    JSON.stringify({
                        "activities": [activity],
                    })
                )

            res.status(200).send();
        }
        else {
            // Conversation was never initialized
            res.status(400).send;
        }
    })

    app.get('/v3/conversations/:conversationId/members', (req, res) => { console.warn("/v3/conversations/:conversationId/members not implemented") })
    app.get('/v3/conversations/:conversationId/activities/:activityId/members', (req, res) => { console.warn("/v3/conversations/:conversationId/activities/:activityId/members") })

    // BOTSTATE ENDPOINT

    app.get('/v3/botstate/:channelId/users/:userId', (req, res) => {
        console.log("Called GET user data");
        getBotData(req, res);
    })

    app.get('/v3/botstate/:channelId/conversations/:conversationId', (req, res) => {
        console.log(("Called GET conversation data"));
        getBotData(req, res);
    })

    app.get('/v3/botstate/:channelId/conversations/:conversationId/users/:userId', (req, res) => {
        console.log("Called GET private conversation data");
        getBotData(req, res);
    })

    app.post('/v3/botstate/:channelId/users/:userId', (req, res) => {
        console.log("Called POST setUserData");
        setUserData(req, res);
    })

    app.post('/v3/botstate/:channelId/conversations/:conversationId', (req, res) => {
        console.log("Called POST setConversationData");
        setConversationData(req, res);
    })

    app.post('/v3/botstate/:channelId/conversations/:conversationId/users/:userId', (req, res) => {
        setPrivateConversationData(req, res);
    })

    app.delete('/v3/botstate/:channelId/users/:userId', (req, res) => {
        console.log("Called DELETE deleteStateForUser");
        deleteStateForUser(req, res);
    })

}

const getConversation = (conversationId: string, conversationInitRequired: boolean) => {

   let conversation =  db.get('conversations')
        .find({ conversationId: conversationId,})
        .value();

    // Create conversation on the fly when needed and init not required
    if (conversation && !conversationInitRequired) {
        createConversation(conversationId)

        conversation =  db.get('conversations')
            .find({
                conversationId: conversationId,
            })
            .value();
    }
    return conversation;

}

const getBotDataKey = (channelId: string, conversationId: string, userId: string) => {
    return `$${channelId || '*'}!${conversationId || '*'}!${userId || '*'}`;
}

const setBotData = (channelId: string, conversationId: string, userId: string, incomingData: IBotData): IBotData => {
    const key = getBotDataKey(channelId, conversationId, userId);
    let newData: IBotData = {
        eTag: new Date().getTime().toString(),
        data: incomingData.data
    };

    if (incomingData) {
        botDataStore[key] = newData;
    } else {
        delete botDataStore[key];
        newData.eTag = '*';
    }

    return newData;
}

const getBotData = (req: express.Request, res: express.Response) => {
    const key = getBotDataKey(req.params.channelId, req.params.conversationId, req.params.userId);
    console.log("Data key: " + key);

    res.status(200).send(botDataStore[key] || { data: null, eTag: '*' });
}

const setUserData = (req: express.Request, res: express.Response) => {
    res.status(200).send(setBotData(req.params.channelId, req.params.conversationId, req.params.userId, req.body));
}

const setConversationData = (req: express.Request, res: express.Response) => {
    res.status(200).send(setBotData(req.params.channelId, req.params.conversationId, req.params.userId, req.body));
}

const setPrivateConversationData = (req: express.Request, res: express.Response) => {
    res.status(200).send(setBotData(req.params.channelId, req.params.conversationId, req.params.userId, req.body));
}

const deleteStateForUser = (req: express.Request, res: express.Response) => {
    Object.keys(botDataStore)
        .forEach(key => {
            if (key.endsWith(`!{req.query.userId}`)) {
                delete botDataStore[key];
            }
        });
    res.status(200).send();
}

//CLIENT ENDPOINT HELPERS
const createMessageActivity = (incomingActivity: IMessageActivity, serviceUrl: string, conversationId: string): IMessageActivity => {
    return { ...incomingActivity, channelId: "emulator", serviceUrl: serviceUrl, conversation: { 'id': conversationId }, id: uuidv4() };
}

const createConversation = (conversationId) =>{

    db.get('conversations')
        .push({
            conversationId: conversationId,
            history: []
        })
        .write()
}

const createConversationUpdateActivity = (serviceUrl: string, conversationId: string): IConversationUpdateActivity => {
    const activity: IConversationUpdateActivity = {
        type: 'conversationUpdate',
        channelId: "emulator",
        serviceUrl: serviceUrl,
        conversation: { 'id': conversationId },
        id: uuidv4(),
        membersAdded: [],
        membersRemoved: []
    }
    return activity;
}

const conversationsCleanup = () => {
    // setInterval(() => {
    //     let expiresTime = moment().subtract(expires_in, 'seconds');
    //     Object.keys(conversations).forEach( conversationId => {
    //         if (conversations[conversationId].history.length>0) {
    //             let lastTime = moment(conversations[conversationId].history[conversations[conversationId].history.length-1].localTimestamp);
    //             if ( lastTime < expiresTime) {
    //                 delete conversations[conversationId];
    //                 console.log("deleted cId: "+conversationId);
    //             }
    //         }
    //     });
    // }, conversationsCleanupInterval);
} 
