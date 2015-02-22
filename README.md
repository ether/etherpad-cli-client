# Etherpad CLI Client
Interact with Pad contents

## Basic Example

```
var etherpad = require("etherpad-socketio-client");
var pad = etherpad(); // Note no host or padId, will connect to random pad Id on localhost

pad.on("connect", function(pad){
  console.log("Connected to ", pad.url);
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
var etherpad = require("etherpad-socketio-client");
var pad = etherpad("http://127.0.0.1:9001/p/test");
pad.on("newContents", function(atext){
  console.log("\u001b[2J\u001b[0;0H");
  console.log("Test Pad Contents", "\n"+atext.text);
});
```

## Append contents to Pad
```
var etherpad = require("etherpad-socketio-client");
var pad = etherpad("http://127.0.0.1:9001/p/test");
pad.on("connect", function(){
  pad.append("hello"); // Appends Hello to the Pad contents
});
```

## Todo
Prefix Pad content
