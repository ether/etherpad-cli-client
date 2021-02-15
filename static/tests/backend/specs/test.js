'use strict';

const etherpad = require('../../../../index');

describe('Client connectivity', function () {
  context('Connects', function () {
    it('Connected', function (done) {
      this.timeout(10000);
      const pad = etherpad.connect('http://127.0.0.1:9001/p/test');
      pad.on('connected', (padState) => {
        console.log('Connected to', padState.host, 'with padId', padState.padId);
        done();
        process.exit(0); /* eslint-disable-line no-process-exit */
      });
    });
  });
});
