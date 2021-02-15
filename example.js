'use strict';

const etherpad = require('./index.js');
const pad = etherpad.connect('http://127.0.0.1:9001/p/test');

pad.on('connected', (padState) => {
  console.log('Connected to', padState.host, 'with padId', padState.padId);
  setInterval(() => {
    pad.append('hello');
  }, 100);
});

pad.on('disconnect', (e) => {
  console.log('D', e);
  throw new Error();
});

pad.on('newContents', (atext) => {
  console.log('\u001b[2J\u001b[0;0H');
  console.log('Test Pad Contents', `\n${atext.text}`);
});
