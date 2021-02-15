'use strict';

// Connect to the Socket Instance
const etherpad = require('./index.js');
const async = require('async');

const host = 'http://127.0.0.1:9001/p/test';

// For now let's create 5 lurking clients and 1 author.
const c = ['a', 'a', 'a', 'a', 'l', 'a'];

async.eachSeries(c, (type, callback) => {
  setTimeout(() => {
    if (type === 'l') {
      newLurker();
      callback();
    }
    if (type === 'a') {
      newAuthor();
      callback();
    }
  }, 1);
}, (err) => {

});

const newAuthor = () => {
  const pad = etherpad.connect(host);
  pad.on('connected', (padState) => {
    console.log('Connected Author to', padState.host);
    setInterval(() => {
      pad.append('Test'); // Appends Hello to the Pad contents
    }, 200);
  });
};

const newLurker = () => {
  const pad = etherpad.connect(host);
  pad.on('connected', (padState) => {
    console.log('Connected new lurker to', padState.host);
  });
};
