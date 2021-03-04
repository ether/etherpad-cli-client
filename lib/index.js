'use strict';

const EventEmitter = require('events').EventEmitter;
const Changeset = require('./Changeset');
const AttributePool = require('./AttributePool');
const assert = require('assert');
const superagent = require('superagent');

exports.connect = (host) => {
  // Create an event emitter
  const ee = new EventEmitter();

  // Create an object we will store pad data in
  const padState = {};

  // If host is undefined set to local host
  if (!host) {
    padState.host = 'http://127.0.0.1:9001';
    padState.padId = randomString();
  } else {
    const parsed = new URL(host);
    padState.host = `${parsed.protocol}//${parsed.host}`;
    padState.padId = parsed.pathname.replace('/p/', '');
  }

  // Connect to Socket
  superagent.get(`${padState.host}/p/${padState.padId}`).then((d) => {
    const socket = require('socket.io-client')(padState.host, {
      'query': `padId=${padState.padId}`,
      'forceNew': true,
      'timeout': 1000,
      'force new connection': true,
    });


    // On connection send Client ready data
    socket.on('connect', (data) => {
      const sessionID = randomString();
      const token = randomString();
      // TODO - Not sure if this is needed but needs to be unique
      // else Etherpad will think multiple connections are one client

      const msg = {
        component: 'pad',
        type: 'CLIENT_READY',
        padId: padState.padId,
        sessionID,
        password: false,
        token,
        protocolVersion: 2,
      };

      socket.json.send(msg);
    });

    socket.on('message', (obj) => {
    // message emitter sends all messages should they be required
      ee.emit('message', obj);


      // Client is connected so we should start sending messages at the server
      if (obj.type === 'CLIENT_VARS') {
        padState.atext = obj.data.collab_client_vars.initialAttributedText;
        padState.apool = new AttributePool().fromJsonable(obj.data.collab_client_vars.apool);
        padState.baseRev = obj.data.collab_client_vars.rev;
        ee.emit('connected', padState);
      } else if (obj.type === 'COLLABROOM' && obj.data && obj.data.type === 'NEW_CHANGES') {
        if (obj.data.newRev <= padState.baseRev) {
        // looks like server sometimes can send the same change twice. A bug in server or socket.io?
        // anyways, we're not interested in changes already happend, just ignore them
          return;
        }
        assert((obj.data.newRev - 1) === padState.baseRev,
            `wrong incoming revision :${obj.data.newRev}/${padState.baseRev}`);

        // Document has an attribute pool this is padState.apool
        // Each change also has an attribute pool.
        const wireApool = new AttributePool().fromJsonable(obj.data.apool);

        // Returns a changeset....
        const server = {
          changeset: Changeset.moveOpsToNewPool(obj.data.changeset, wireApool, padState.apool),
        };

        if (padState.inFlight) {
          transformX(padState.inFlight, server);
        }
        if (padState.outgoing) {
          transformX(padState.outgoing, server);
          padState.outgoing.baseRev = obj.data.newRev;
        }
        // Apply the changeset
        padState.atext = Changeset.applyToAText(server.changeset, padState.atext, padState.apool);
        // Get the new Revision number from a change and store this as the new base
        padState.baseRev = obj.data.newRev;

        ee.emit('newContents', padState.atext);
      } else if (obj.type === 'COLLABROOM' && obj.data && obj.data.type === 'ACCEPT_COMMIT') {
        if (obj.data.newRev <= padState.baseRev) {
        // looks like server sometimes can send the same change twice. A bug in server or socket.io?
        // anyways, we're not interested in changes already happend, just ignore them
          return;
        }

        assert((obj.data.newRev - 1) === padState.baseRev,
            `wrong incoming revision :${obj.data.newRev}/${padState.baseRev}`);
        // Server accepted a commit so bump the newRev..
        padState.baseRev = obj.data.newRev;
        padState.inFlight = null;

        // also update any outgoing changesets to the newRev
        if (padState.outgoing) {
          padState.outgoing.baseRev = obj.data.newRev;
        }
        sendMessage();
      } else if (obj.type === 'COLLABROOM' && obj.data && obj.data.type === 'USER_NEWINFO') {
      // We don't care about this for now.
      } else if (obj.type === 'COLLABROOM' && obj.data && obj.data.type === 'USER_LEAVE') {
      // We don't care about this for now.
      } else if (obj.disconnect) {
        ee.emit('disconnect', obj.disconnect);
      // TODO close socket here
      } else { // Unhandled message
      // console.log("Message from Server", obj);
      }
    });

    socket.on('disconnect', (e) => {
      ee.emit('disconnect', e);
    });

    socket.on('connect_timeout', (e) => {
      ee.emit('connect_timeout', e);
    });

    socket.on('connect_error', (e) => {
      ee.emit('connect_error', e);
    });

    ee.close = () => {
      socket.close();
    };

    // Function to append contents to a pad
    ee.append = (text) => {
    // Create a new changeset using the makeSplice method
      const newChangeset = Changeset.makeSplice(
          padState.atext.text, padState.atext.text.length, 0, text);
      const newRev = padState.baseRev;

      // Apply it to the document
      padState.atext = Changeset.applyToAText(newChangeset, padState.atext, padState.apool);
      // padState.baseRev++;

      // Create a blank attribute pool for the wire
      const wireApool = new AttributePool().toJsonable();

      // Create a message including the changeset
      const msg = {
        component: 'pad',
        type: 'USER_CHANGES',
        baseRev: newRev,
        changeset: newChangeset,
        apool: wireApool,
      };
      sendMessage(msg);
    };

    // Both server and client edited the document.
    // We need to update local change with remote changes
    // and visa versa
    const transformX = (client, server) => {
      const _c = Changeset.follow(server.changeset, client.changeset, false, padState.pool);
      const _s = Changeset.follow(client.changeset, server.changeset, true, padState.pool);
      client.changeset = _c;
      server.changeset = _s;
    };

    // sends a message to the server. Can be used without parameters to try sending outgoing message
    const sendMessage = (optMsg) => {
    // console.log("sending message: ", optMsg && (optMsg.changeset + '[' + optMsg.baseRev + ']'),
    //   '; inflight: ' + (padState.inFlight && (
    // padState.inFlight.changeset + '[' + padState.inFlight.baseRev + ']')),
    //   '; outgoing: ' + (padState.outgoing && (
    // padState.outgoing.changeset + '[' + padState.outgoing.baseRev + ']'))
    //   );
      if (optMsg) {
        if (padState.outgoing) {
          assert(optMsg.baseRev === padState.outgoing.baseRev,
              'should append to the same document version');

          padState.outgoing.changeset = Changeset.compose(
              padState.outgoing.changeset, optMsg.changeset, padState.apool);
        } else {
          padState.outgoing = optMsg;
        }
      }

      if (!padState.inFlight && padState.outgoing) {
        padState.inFlight = padState.outgoing;
        padState.outgoing = null;
        socket.json.send({
          type: 'COLLABROOM',
          component: 'pad',
          data: JSON.parse(JSON.stringify(padState.inFlight)),
        });
      }
    };
  });
  return ee;
};

const randomString = () => {
  const chars = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz';
  const string_length = 10;
  let randomstring = '';
  for (let i = 0; i < string_length; i++) {
    const rnum = Math.floor(Math.random() * chars.length);
    randomstring += chars.substring(rnum, rnum + 1);
  }
  return randomstring;
};
