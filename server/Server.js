import express from 'express';
import zlib from 'zlib';
import compression from 'compression';
import {Server as WebSocketServer} from 'ws';
import http from 'http';
import url from 'url';
import random from 'lodash/number/random';
import indexTemplate from './templates/index';
import postTemplate from './templates/post';
import generateMessage from './generateMessage';

const compressor = compression({
  flush: zlib.Z_PARTIAL_FLUSH
});

function createMessage() {
  const message = {};
  const generatedMessage = generateMessage();
  message.avatar = '/imgs/avatar.jpg';
  message.name = 'Jake Archibald';
  message.time = new Date().toISOString();
  message.body = generatedMessage.msg;
  if (generatedMessage.img) {
    message.mainImg = generatedMessage.img;
  }
  return message;
}

function findIndex(arr, func) {
  for (let i = 0; i < arr.length; i++) {
    if (func(arr[i], i, arr)) return i;
  }
  return -1;
}

export default class Server {
  constructor() {
    this._app = express();
    this._messages = [];
    this._sockets = [];
    this._server = http.createServer(this._app);
    this._wss = new WebSocketServer({ server: this._server });
    
    const staticOptions = {
      maxAge: 0
    };

    this._wss.on('connection', ws => this._onWsConnection(ws));

    this._app.use('/js', express.static('../public/js', staticOptions));
    this._app.use('/css', express.static('../public/css', staticOptions));
    this._app.use('/imgs', express.static('../public/imgs', staticOptions));

    this._app.get('/', compressor, (req, res) => {
      res.send(indexTemplate({
        mainContent: this._messages.map(item => postTemplate(item)).join('')
      }));
    });

    this._app.get('/shell', compressor, (req, res) => {
      res.send(indexTemplate());
    });

    // generate initial messages
    let time = new Date();

    for (let i = 0; i < 10; i++) {
      const msg = createMessage();
      const timeDiff = random(5000, 15000);
      time = new Date(time - timeDiff);
      msg.time = time.toISOString();
      this._messages.push(msg);
    }

    this._generateDelayedMessages();
  }

  _generateDelayedMessages() {
    setTimeout(_ => {
      this._addMessage();
      this._generateDelayedMessages();
    }, random(5000, 15000));
  }

  _broadcast(obj) {
    const msg = JSON.stringify(obj);
    this._sockets.forEach(socket => socket.send(msg));
  }

  _onWsConnection(socket) {
    const requestUrl = url.parse(socket.upgradeReq.url, true);
    
    if (requestUrl.pathname != '/updates') {
      socket.close();
      return;
    }

    this._sockets.push(socket);

    socket.on('close', _ => {
      this._sockets.splice(this._sockets.indexOf(socket), 1);
    });

    let sendNow = [];

    if (requestUrl.query.since) {
      const sinceDate = new Date(Number(requestUrl.query.since));
      let missedMessages = findIndex(this._messages, msg => new Date(msg.time) <= sinceDate);
      if (missedMessages == -1) missedMessages = this._messages.length;
      sendNow = this._messages.slice(0, missedMessages);
    }
    else {
      sendNow = this._messages.slice();
    }

    socket.send(JSON.stringify(sendNow));
  }

  _addMessage() {
    const message = createMessage();
    this._messages.unshift(message);
    this._messages.pop();
    this._broadcast([message]);
  }

  listen(port) {
    this._server.listen(port, _ => {
      console.log("Server listening at localhost:" + port);
    });
  }
}