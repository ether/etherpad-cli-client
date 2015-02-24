var events = require("events");
var url = require("url");
var EventEmitter = require("events").EventEmitter;
var Changeset = require('./Changeset');
var AttributePool = require('./AttributePool');

exports.connect = function(host){

  // Create an event emitter
  var ee = new EventEmitter();

  // Create an object we will store pad data in
  var padState = {};
  padState.inFlight;
  padState.pendingChange;

  // If host is undefined set to local host
  if(!host){
    padState.host = "http://127.0.0.1:9001";
    padState.padId = randomString();
  }else{
    var parsed = url.parse(host);
    padState.host = parsed.protocol + "//" + parsed.host;
    padState.padId = parsed.pathname.replace("/p/", "");
  }

  // Connect to Socket
  var socket = require('socket.io-client')(padState.host, {
    "forceNew": true,
    "force new connection": true
  });

  // On connection send Client ready data
  socket.on('connect', function(data){

    sessionID = randomString();
    token = randomString(); 
    // TODO - Not sure if this is needed but needs to be unique
    // else Etherpad will think multiple connections are one client

    var msg = {
      "component": "pad",
      "type": 'CLIENT_READY',
      "padId": padState.padId,
      "sessionID": sessionID,
      "password": false,
      "token": token,
      "protocolVersion": 2
    };

    socket.json.send(msg);
  });

  socket.on('message', function(obj){
    // message emitter sends all messages should they be required
    ee.emit('message', obj);

    // Client is connected so we should start sending messages at the server
    if(obj.type === 'CLIENT_VARS'){
      padState.atext = obj.data.collab_client_vars.initialAttributedText;
      padState.apool = new AttributePool().fromJsonable(obj.data.collab_client_vars.apool);
      padState.baseRev = obj.data.collab_client_vars.rev;
      ee.emit("connected", padState);
    }
    else if(obj.type === 'COLLABROOM' && obj.data && obj.data.type === 'NEW_CHANGES'){
      // var unpacked = Changeset.unpack(obj.data.changeset); // Unpack the changeset
      // var opiterator = Changeset.opIterator(unpacked.ops); // Look at each op
      // console.log("opiterator", opiterator);

      // Get the new Revision number from a change and store this as the new base
      padState.baseRev = obj.data.newRev;

      if(obj.data.text){
        padState.atext = obj.data.text;
      }else{
        obj.data.text = padState.atext;
      }

      // Document has an attribute pool this is padState.apool
      // Each change also has an attribute pool.
      var wireApool = new AttributePool().fromJsonable(obj.data.apool);
      // console.log("wireApool", wireApool);

      // Returns a changeset....
      var c = Changeset.moveOpsToNewPool(obj.data.changeset, wireApool, padState.apool);
      // console.log("new changeset with wireApool applied", c);

      // Set it as a pending change
      console.log("padstate.pendingChange", padState.pendingChange, "c", c);
      if(padState.pendingChange){
        padState.pendingChange = Changeset.follow(c, padState.pendingChange, true, wireApool); 
      }

      // We clone the atext
      var baseAText = Changeset.cloneAText(padState.atext);
      // console.log("baseAText", baseAText);

      // Apply the changeset
      baseAText = Changeset.applyToAText(c, baseAText, padState.apool);

      // Set the text
      padState.atext = baseAText;

      ee.emit("newContents", padState.atext);
    }
    else if(obj.type === 'COLLABROOM' && obj.data && obj.data.type === 'ACCEPT_COMMIT'){
      padState.inFlight = null; // server has accepted our changes so we can't be sending them at current
      // Server accepted a commit so bump the newRev..
      padState.baseRev = obj.data.newRev;
      drainPending(padState, socket);
    }

    else if(obj.type === 'COLLABROOM' && obj.data && obj.data.type === 'USER_NEWINFO'){
      // We don't care about this for now.
    }

    else if(obj.type === 'COLLABROOM' && obj.data && obj.data.type === 'USER_LEAVE'){
      // We don't care about this for now.
    }

    else{ // Unhandled message
      // console.log("Message from Server", obj);
    }

  });

  socket.on("disconnect", function(e){
    ee.emit("disconnect", e);
  });

  // Function to append contents to a pad
  ee.append = function(text){
    // Create a new changeset using the makeSplice method
    var newChangeset = Changeset.makeSplice(padState.atext.text, padState.atext.text.length, 0, text);

    // Create new AText with applied changeset
    var newAText = Changeset.applyToAText(newChangeset, padState.atext, padState.apool);

    // Save the new AText with the changes
    padState.atext = newAText;

    // Create a blank attribute pool for the wire
    var wireApool = new AttributePool().toJsonable();

    padState.wireApool = wireApool;

    if(!padState.pendingChange){ // No changes are pending
      padState.pendingChange = newChangeset;
    }else{
      // console.log("padState.pendingChange", padState.pendingChange);
      // console.log("newChangeset", newChangeset);
      padState.pendingChange = Changeset.compose(padState.pendingChange, newChangeset, wireApool);
    }
    drainPending(padState, socket); // sending all pending changes?

  }

  return ee;

};

function randomString(){
  var chars = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz";
  var string_length = 10;
  var randomstring = '';
  for (var i = 0; i < string_length; i++){
    var rnum = Math.floor(Math.random() * chars.length);
    randomstring += chars.substring(rnum, rnum + 1);
  }
  return randomstring;
}

function drainPending(padState, socket){
  // in flight is basically if we're already sending messages
  // if(padState.inFlight == null && !Changeset.isIdentity(padState.pendingChange)) { 
  if(padState.inFlight == null && padState.pendingChange) { 
    // https://github.com/ether/etherpad-lite/blob/19c78212e8c6cf3f3f3b8007a5dbb5590b8503c3/src/static/js/Changeset.js#L1703
    padState.inFlight = padState.pendingChange; // Set in flight as the current pending change
    // padState.pendingChange = Changeset.identity(padState.atext.text.length);
    padState.pendingChange = null;
    // Creates identity changeset which is changeset about nothing
    // https://github.com/ether/etherpad-lite/blob/19c78212e8c6cf3f3f3b8007a5dbb5590b8503c3/src/static/js/Changeset.js#L1386

    // Send a message including the changeset
    var msg = {
      "component": "pad",
      "type": 'USER_CHANGES',
      "baseRev": padState.baseRev,
      "changeset": padState.inFlight,
      "apool": padState.wireApool
    };

    console.log("sent", padState.inFlight, padState.wireApool);

    // Send the message
    socket.json.send({
      type: "COLLABROOM",
      component: "pad",
      data: msg
    });
  }

  console.log("here");
}
