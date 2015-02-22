var etherpad = require("./index.js");
var pad = new etherpad();
console.log(pad);
// pad.connect("http://127.0.0.1:9001/p/test");

pad.on("connected", function(){
  console.log("connected");
  // pad.append("hello"); // Appends Hello to the Pad contents
});

/*
pad.on("message", function(obj){
  console.log("New message from Etherpad Server", message);
});

pad.on("newContents", function(atext){

  console.log("\u001b[2J\u001b[0;0H");
  console.log("Test Pad Contents", "\n"+atext.text);
});

pad.on("Disconnect", function(e){ 
  console.log("disconnected from pad");
});

*/
