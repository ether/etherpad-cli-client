#!/usr/bin/env node
'use strict';

const etherpad = require('./index.js');
const args = process.argv;
const host = args[2];
const action = args[3];
const string = args[4];

if (args.length < 3) {
  console.log('No host specified..');
  console.log('Stream Pad to CLI: etherpad http://127.0.0.1:9001/p/test');
  console.log("Append contents to pad: etherpad http://127.0.0.1:9001/p/test -a 'hello world'");
  throw new Error();
}

if (host) {
  if (!action) {
    // Stream pad to UI
    const pad = etherpad.connect(host);
    pad.on('connected', (padState) => {
      console.log('Connected to', padState.host, 'with padId', padState.padId);
      console.log('\u001b[2J\u001b[0;0H');
      console.log('Pad Contents', `\n${padState.atext.text}`);
    });
    pad.on('newContents', (atext) => {
      console.log('\u001b[2J\u001b[0;0H');
      console.log('Pad Contents', `\n${atext.text}`);
    });
  }
  if (action) {
    if (action === '-a') {
      // appending a string to a pad
      if (!string) {
        console.log('No string specified with pad');
        throw new Error();
      }

      const pad = etherpad.connect(host);

      pad.on('connected', () => {
        pad.append(string); // Appends Hello to the Pad contents
        console.log('Appended', string, 'to ', host);
        throw new Error();
      });
    }
  }
}
