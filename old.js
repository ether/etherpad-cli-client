var events = require('events');
module.exports = Etherpad;

function Etherpad(){
  events.eventEmitter.call(this);
}

// inherit events.EventEmitter
Etherpad.super_ = events.EventEmitter;

Etherpad.prototype = Object.create(events.EventEmitter.prototype, {
  constructor: {
    value: Etherpad,
    enumerable: false
  }
});

Etherpad.prototype.connect = function(host) {
  var self = this;
  self.host= host;
  self.cook = cook(); // assume dummy function that'll do the cooking
  self.cook(host, function(cooked_chicken) {
    self.host = cooked_chicken;
    self.emit('connected', self.host);
  });
  return self;
}


// Connect to the Etherpad Socket Instance
exports.connect = function(host, settings){
  if(!host) host = "http://127.0.0.1:9001";
  var socket = require('socket.io-client')(host);

  socket.on('message', function(obj){
    var type = obj.type;
    // Client is being told to disconnect
    if(obj.disconnect){
      console.warn("Disconnecting", obj);
//      return;
    }

    // Client is connected so we should start sending messages at the server
    if(type === 'CLIENT_VARS'){
      exports.padState.atext = obj.data.collab_client_vars.initialAttributedText;
      exports.padState.apool = new exports.AttributePool().fromJsonable(obj.data.collab_client_vars.apool);
      exports.padState.baseRev = obj.data.collab_client_vars.rev;
      this.emit("connected");
    }
  })
  
  exports.Changeset = require('./Changeset');
  exports.AttributePool = require('./AttributePool');
  exports.padState = {}; // The state of the pad, we hold this in memory
}

// Append Contents to a Pad
exports.append = function(content){
  // Create a new changeset using the makeSplice method
  var newChangeset = exports.Changeset.makeSplice(exports.padState.atext.text, exports.padState.atext.text.length, 0, content);

  // Create new AText with applied changeset
  var newAText = exports.Changeset.applyToAText(newChangeset, exports.padState.atext, exports.padState.apool);

  // Save the new AText with the changes
  exports.padState.atext = newAText;

  // Create a blank attribute pool for the wire
  var wireApool = new exports.AttributePool().toJsonable();

  // Create a message including the changeset
  var msg = {
    "component": "pad",
    "type": 'USER_CHANGES',
    "baseRev": exports.padState.baseRev,
    "changeset": newChangeset,
    "apool": wireApool
  };

  // Send the message
  socket.json.send({
    type: "COLLABROOM",
    component: "pad",
    data: msg
  });
}

/*
socket.on('message', function(obj){
  var type = obj.type;
  // Client is being told to disconnect
  if(obj.disconnect){
    console.warn("Disconnecting", obj);
    return;
  }

  // Client is connected so we should start sending messages at the server
  if(type === 'CLIENT_VARS'){
    exports.padState.atext = obj.data.collab_client_vars.initialAttributedText;
    exports.padState.apool = new exports.AttributePool().fromJsonable(obj.data.collab_client_vars.apool);
    exports.padState.baseRev = obj.data.collab_client_vars.rev;
    this.emit("connected");
  }
})
*/
/* 

# Etherpad Load Test CLI

## Basic Load Test Example
``etherpad-loadtest``

## Specify the Etherpad instance
``etherpad-loadtest http://127.0.0.1:9001``

## Test Specific Etherpad Instance for 60 seconds``
``etherpad-loadtest http://127.0.0.1:9001 -d 60``

## Test a specific Pad
``etherpad-loadtest http://127.0.0.1:9001/p/test``

## 50 Lurkers, 10 authors, 10 pads (so 600 connections in total)
``etherpad-loadtest http://127.0.0.1:9001 -l 50 -a 10 -p 10``
Note ``-p`` Will create 10 random pads and assign -l and -a to each.  ``-p`` Cannot be used with an explicity pad ergo -p 1 is pointless

## Parameters
``-l`` number of lurkers.
``-a`` number of active authors.
``-p`` number of pads to test against.
``-d`` duration in seconds to test for.  Default is unlimited.

Basic load test will increase # of lurkers and authors every second until changesets are stopped processing
At this point the # of lurkers and authors tells the admin how many people could use
their instance

exports.socket.on('message', function(obj){
  var type = obj.type;
  // Client is being told to disconnect
  if(obj.disconnect){
    console.warn("Disconnecting", obj);
    return;
  }
 
  // Client is connected so we should start sending messages at the server
  if(type === 'CLIENT_VARS'){
    padState.atext = obj.data.collab_client_vars.initialAttributedText;
    padState.apool = new AttributePool().fromJsonable(obj.data.collab_client_vars.apool);
    padState.baseRev = obj.data.collab_client_vars.rev;
    beginSendingMessages(obj);
  }

  else if(obj.type === 'COLLABROOM' && obj.data && obj.data.type === 'NEW_CHANGES'){
    // console.log("new changes", obj.data);
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

    // We clone the atext
    var baseAText = Changeset.cloneAText(padState.atext);
    // console.log("baseAText", baseAText);

    // Apply the changeset
    baseAText = Changeset.applyToAText(c, baseAText, padState.apool);

    // Set the text
    padState.atext = baseAText;

    if(exports.pad.stream){
      console.log("\u001b[2J\u001b[0;0H");
      console.log("Test Pad Contents", "\n"+baseAText.text);
    }
  }

  else if(obj.type === 'COLLABROOM' && obj.data && obj.data.type === 'ACCEPT_COMMIT'){
    // Server accepted a commit so bump the newRev..
    padState.baseRev = obj.data.newRev;
  }

  else if(obj.type === 'COLLABROOM' && obj.data && obj.data.type === 'USER_NEWINFO'){
    // We don't care about this.
  }

  else if(obj.type === 'COLLABROOM' && obj.data && obj.data.type === 'USER_LEAVE'){
    // We don't care about this.
  }

  else{ // Unhandled message
    console.log("Message from Server", obj);
  }
});

function beginSendingMessages(obj){
  console.log("Beggining to send messages to the Pad");
  var opiterator = Changeset.opIterator(padState.atext.attribs); // This seems pointless

  console.log("initial atext", padState.atext);
  console.log("initial apool", padState.apool);

  // Send a message every second
  setInterval(function(){
    // Generate random string.
    var randomString = generateRandomString();

    // Create a new changeset using the makeSplice method
    var newChangeset = Changeset.makeSplice(padState.atext.text, padState.atext.text.length, 0, randomString);

    // Create new AText with applied changeset
    var newAText = Changeset.applyToAText(newChangeset, padState.atext, padState.apool);

    // Save the new AText with the changes
    padState.atext = newAText;

    // Create a blank attribute pool for the wire
    var wireApool = new AttributePool().toJsonable();

    // Create a message including the changeset
    var msg = {
      "component": "pad",
      "type": 'USER_CHANGES',
      "baseRev": padState.baseRev,
      "changeset": newChangeset,
      "apool": wireApool
    };

    // Send the message
    socket.json.send({
      type: "COLLABROOM",
      component: "pad",
      data: msg
    });

  }, 1000);

}

exports.socket.on('connect', function(data){
  var padId = 'test';
  sessionID = 'whatever';
  token = 'test';

  console.log("Sending Client Ready");

  var msg = {
    "component": "pad",
    "type": 'CLIENT_READY',
    "padId": padId,
    "sessionID": sessionID,
    "password": false,
    "token": token,
    "protocolVersion": 2
  };

  socket.json.send(msg);
});


function generateRandomString() {
  var chars = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXTZabcdefghiklmnopqrstuvwxyz";
  var string_length = Math.floor(Math.random() *10);
  var randomstring = '';
  for (var i=0; i<string_length; i++) {
    var rnum = Math.floor(Math.random() * chars.length);
    randomstring += chars.substring(rnum,rnum+1);
  }
  return randomstring;
}

*/
