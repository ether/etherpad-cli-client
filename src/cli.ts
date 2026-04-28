#!/usr/bin/env node

import {connect, type AText, type PadState} from './index.js';

const args = process.argv;
const host = args[2];
const action = args[3];
const text = args[4];

if (args.length < 3) {
  console.log('No host specified..');
  console.log('Stream Pad to CLI: etherpad http://127.0.0.1:9001/p/test');
  console.log("Append contents to pad: etherpad http://127.0.0.1:9001/p/test -a 'hello world'");
  throw new Error();
}

if (host && !action) {
  const pad = connect(host);
  pad.on('connected', (padState: PadState) => {
    console.log('Connected to', padState.host, 'with padId', padState.padId);
    console.log('\u001b[2J\u001b[0;0H');
    console.log('Pad Contents', `\n${padState.atext.text}`);
  });
  pad.on('newContents', (atext: AText) => {
    console.log('\u001b[2J\u001b[0;0H');
    console.log('Pad Contents', `\n${atext.text}`);
  });
}

if (host && action === '-a') {
  if (!text) {
    console.log('No string specified with pad');
    throw new Error();
  }

  const pad = connect(host);
  pad.on('connected', () => {
    pad.append(text);
    console.log('Appended', text, 'to', host);
    throw new Error();
  });
}
