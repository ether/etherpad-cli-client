
'use strict';

const common = require('ep_etherpad-lite/tests/backend/common');
const etherpad = require('../../../../index');

describe(__filename, function () {
  before(async function () {
    await common.init();
  });

  it('connects', async function () {
    const pad = etherpad.connect(new URL('/p/test', common.baseUrl).href);
    const padState = await new Promise((resolve) => pad.on('connected', (s) => resolve(s)));
    common.logger.info('Connected to', padState.host, 'with padId', padState.padId);
    pad.close();
  });
});
