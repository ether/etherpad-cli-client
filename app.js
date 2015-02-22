var etherpad = require("./index.js");
var pad = etherpad.connect("http://127.0.0.1:9001/p/test");

pad.on("connected", function (padState) {
  console.log("Connected to", padState.host, "with padId", padState.padId);
  setInterval(function(){
    pad.append("hello");
  }, 100);
});

pad.on("disconnect", function(e){
  console.log("D", e);
  process.exit(code=0)
})

