#!/usr/bin/env node

var etherpad = require("./index.js");
var args = process.argv;
var host = args[2];
var action = args[3];
var string = args[4];

if(args.length < 3){
  console.log("No host specified..");
  console.log("Stream Pad to CLI: etherpad http://127.0.0.1/p/test");
  console.log("Append contents to pad: etherpad http://127.0.0.1/p/test -a 'hello world'");
  process.exit(code=0);
}

if(host){
  if(!action){
    // Stream pad to UI
    var pad = etherpad.connect(host);
    pad.on("connected", function (padState) {
      console.log("Connected to", padState.host, "with padId", padState.padId);
      console.log("\u001b[2J\u001b[0;0H");
      console.log("Pad Contents", "\n"+padState.atext.text);
    });
    pad.on("newContents", function(atext){
      console.log("\u001b[2J\u001b[0;0H");
      console.log("Pad Contents", "\n"+atext.text);
    });
  }
  if(action){
    if(action === "-a"){
      // appending a string to a pad
      if(!string){
        console.log("No string specified with pad");
        process.exit(code=0);
      }

      var pad = etherpad.connect(host);

      pad.on("connected", function(){
        pad.append(string); // Appends Hello to the Pad contents
        console.log("Appended",  string, "to ", host);
        process.exit(code=0);
      });

    }
  }
}

/*

pad.on("disconnect", function(e){
  console.log("D", e);
  process.exit(code=0)
})

pad.on("newContents", function(atext){
  console.log("\u001b[2J\u001b[0;0H");
  console.log("Test Pad Contents", "\n"+atext.text);
});
*/
