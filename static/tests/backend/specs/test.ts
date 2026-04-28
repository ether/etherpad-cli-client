import common from 'ep_etherpad-lite/tests/backend/common';
import * as etherpad from '../../../../src/index.js';

describe(__filename, function () {
  before(async function () {
    await common.init();
  });

  it('connects', async function () {
    const pad = etherpad.connect(new URL('/p/test', common.baseUrl).href);
    const padState = await new Promise((resolve) => pad.on('connected', (s) => resolve(s)));
    common.logger.info('Connected to', (padState as any).host, 'with padId', (padState as any).padId);
    pad.close();
  });
});
