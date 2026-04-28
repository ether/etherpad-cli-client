import common from '../../../../../../tests/backend/common';
import * as etherpad from '../../../../dist/index.js';

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
