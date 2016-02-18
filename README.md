# Etherpad CLI Client
Interact with Etherpad contents in real time from within Node and from your CLI.  

# IMPORTANT: Your Etherpad installation must be in loadTest mode for this client to work.  
TLDR; Set ``loadTest`` to ``true`` in your Etherpad settings.json

We hope in the future to support full editor functionality but for how functionality is limited.  Read the Etherpad Guide for how to enable load testing.  https://github.com/ether/etherpad-lite/wiki/Load-Testing-Etherpad
Want to fund some dev so this isn't required?  Get at me.

## 5 seconds getting started...
```
sudo npm install -g etherpad-cli-client
etherpad https://beta.etherpad.org/p/clitest
```
Visit etherpad https://beta.etherpad.org/p/clitest in your browser and start typing...

## Installation
``sudo npm install -g etherpad-cli-client``

# CLI
## Get help
```
etherpad
```

## Stream Pad to CLI
```
etherpad http://127.0.0.1:9001/p/test
```

## Append contents to pad
```
etherpad http://127.0.0.1:9001/p/test -a "hello world"
```

# NODE
## Basic Example

```
var etherpad = require("etherpad-cli-client");
var pad = etherpad.connect(); // Note no host or padId, will connect to random pad Id on localhost

pad.on("connected", function(padState){
  console.log("Connected to ", padState.host);
});

pad.on("message", function(message){
  console.log("New message from Etherpad Server", message);
});

pad.on("disconnect", function(e){
  console.log("disconnected from pad", e);
  process.exit(code=0)
});
```

## Stream Pad Text contents to CLI
```
var etherpad = require("etherpad-cli-client");
var pad = etherpad.connect("http://127.0.0.1:9001/p/test");
pad.on("newContents", function(atext){
  console.log("\u001b[2J\u001b[0;0H");
  console.log("Test Pad Contents", "\n"+atext.text);
});
```

## Append contents to Pad
```
var etherpad = require("etherpad-cli-client");
var pad = etherpad.connect("http://127.0.0.1:9001/p/test");
pad.on("connected", function(){
  setInterval(function(){
    pad.append("hello world spam"); // Appends Hello to the Pad contents
  }, 200);
});
```

## Prefix contents to Pad
TODO

## Write contents to specific location in Pad
TODO

## Todo
Prefix Pad content
