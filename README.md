# Etherpad CLI Client
Interact with Pad contents

## Installation
``sudo npm install -g etherpad-cli-client``

# CLI
## Get help
```
etherpad
```

## Stream Pad to CLI
```
etherpad http://127.0.0.1:9001/p/test/
```

## Append contents to pad
```
etherpad http://127.0.0.1:9001/p/test/ -a "hello world"
```

# NODE
## Basic Example

```
var etherpad = require("etherpad-cli-client");
var pad = etherpad(); // Note no host or padId, will connect to random pad Id on localhost

pad.on("connected", function(pad){
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
var etherpad = require("etherpad-cli-client");
var pad = etherpad("http://127.0.0.1:9001/p/test");
pad.on("newContents", function(atext){
  console.log("\u001b[2J\u001b[0;0H");
  console.log("Test Pad Contents", "\n"+atext.text);
});
```

## Append contents to Pad
```
var etherpad = require("etherpad-cli-client");
var pad = etherpad("http://127.0.0.1:9001/p/test");
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
