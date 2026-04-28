import {connect, type PadState} from './index.js';

const host = 'http://127.0.0.1:9001/p/test';
const clients = ['a', 'a', 'a', 'a', 'l', 'a'];

const newAuthor = (): void => {
  const pad = connect(host);
  pad.on('connected', (padState: PadState) => {
    console.log('Connected Author to', padState.host);
    setInterval(() => {
      pad.append('Test');
    }, 200);
  });
};

const newLurker = (): void => {
  const pad = connect(host);
  pad.on('connected', (padState: PadState) => {
    console.log('Connected new lurker to', padState.host);
  });
};

const wait = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

const run = async (): Promise<void> => {
  for (const type of clients) {
    await wait(1);
    if (type === 'l') {
      newLurker();
      continue;
    }
    if (type === 'a') {
      newAuthor();
    }
  }
};

void run();
