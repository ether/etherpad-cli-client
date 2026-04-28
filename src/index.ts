import {EventEmitter} from 'node:events';
import assert from 'node:assert';
import superagent from 'superagent';
import {io} from 'socket.io-client';

import * as Changeset from './Changeset.js';
import AttributePool, {type JsonableAttributePool} from './AttributePool.js';

export interface AText {
  text: string;
  attribs: string;
}

interface PendingMessage {
  component: 'pad';
  type: 'USER_CHANGES';
  baseRev: number;
  changeset: string;
  apool: JsonableAttributePool;
}

export interface PadState {
  host: string;
  path: string;
  padId: string;
  atext: AText;
  apool: AttributePool;
  baseRev: number;
  outgoing: PendingMessage | null;
  inFlight: PendingMessage | null;
}

export type PadClient = EventEmitter & {
  append: (text: string) => void;
  close: () => void;
};

type ClientVarsMessage = {
  type: 'CLIENT_VARS';
  data: {
    collab_client_vars: {
      initialAttributedText: AText;
      apool: JsonableAttributePool;
      rev: number;
    };
  };
};

type NewChangesMessage = {
  type: 'COLLABROOM';
  data: {
    type: 'NEW_CHANGES';
    newRev: number;
    apool: JsonableAttributePool;
    changeset: string;
  };
};

type AcceptCommitMessage = {
  type: 'COLLABROOM';
  data: {
    type: 'ACCEPT_COMMIT';
    newRev: number;
  };
};

type DisconnectMessage = {
  disconnect: unknown;
};

const randomString = (len = 10): string => {
  const chars = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz';
  let randomstring = '';
  for (let i = 0; i < len; i++) {
    const rnum = Math.floor(Math.random() * chars.length);
    randomstring += chars.substring(rnum, rnum + 1);
  }
  return randomstring;
};

const isObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null;

const isClientVarsMessage = (value: unknown): value is ClientVarsMessage =>
  isObject(value) &&
  value.type === 'CLIENT_VARS' &&
  isObject(value.data) &&
  isObject(value.data.collab_client_vars) &&
  typeof value.data.collab_client_vars.rev === 'number';

const isNewChangesMessage = (value: unknown): value is NewChangesMessage =>
  isObject(value) &&
  value.type === 'COLLABROOM' &&
  isObject(value.data) &&
  value.data.type === 'NEW_CHANGES' &&
  typeof value.data.newRev === 'number' &&
  typeof value.data.changeset === 'string';

const isAcceptCommitMessage = (value: unknown): value is AcceptCommitMessage =>
  isObject(value) &&
  value.type === 'COLLABROOM' &&
  isObject(value.data) &&
  value.data.type === 'ACCEPT_COMMIT' &&
  typeof value.data.newRev === 'number';

const isDisconnectMessage = (value: unknown): value is DisconnectMessage =>
  isObject(value) && 'disconnect' in value;

export const connect = (host?: string): PadClient => {
  const ee = new EventEmitter() as PadClient;
  const padState: PadState = {
    host: '',
    path: '',
    padId: '',
    atext: {text: '', attribs: ''},
    apool: new AttributePool(),
    baseRev: 0,
    outgoing: null,
    inFlight: null,
  };

  if (!host) {
    padState.host = 'http://127.0.0.1:9001';
    padState.path = '';
    padState.padId = randomString();
  } else {
    const parsed = new URL(host);
    padState.host = `${parsed.protocol}//${parsed.host}`;
    const padIdParam = '/p/';
    const indexOfPadId = parsed.pathname.indexOf(padIdParam);
    if (indexOfPadId >= 0) {
      padState.path = parsed.pathname.substring(0, indexOfPadId);
      padState.padId = parsed.pathname.substring(indexOfPadId + padIdParam.length);
    } else {
      padState.path = '';
      padState.padId = randomString();
    }
  }

  void superagent.get(`${padState.host}${padState.path}/p/${padState.padId}`).then(() => {
    const socket = io(padState.host, {
      path: `${padState.path}/socket.io`,
      query: {padId: padState.padId},
      forceNew: true,
      timeout: 1000,
    });

    socket.on('connect', () => {
      const sessionID = randomString();
      const token = `t.${randomString(20)}`;
      socket.emit('message', {
        component: 'pad',
        type: 'CLIENT_READY',
        padId: padState.padId,
        sessionID,
        password: false,
        token,
        protocolVersion: 2,
      });
    });

    const sendMessage = (optMsg?: PendingMessage): void => {
      if (optMsg) {
        if (padState.outgoing) {
          assert(optMsg.baseRev === padState.outgoing.baseRev, 'should append to the same document version');
          padState.outgoing.changeset = Changeset.compose(
              padState.outgoing.changeset, optMsg.changeset, padState.apool);
        } else {
          padState.outgoing = optMsg;
        }
      }

      if (!padState.inFlight && padState.outgoing) {
        padState.inFlight = padState.outgoing;
        padState.outgoing = null;
        socket.emit('message', {
          type: 'COLLABROOM',
          component: 'pad',
          data: JSON.parse(JSON.stringify(padState.inFlight)),
        });
      }
    };

    socket.on('message', (obj: unknown) => {
      ee.emit('message', obj);

      const transformX = (
          client: {changeset: string; baseRev?: number},
          server: {changeset: string},
      ): void => {
        const transformedClient = Changeset.follow(server.changeset, client.changeset, false, padState.apool);
        const transformedServer = Changeset.follow(client.changeset, server.changeset, true, padState.apool);
        client.changeset = transformedClient;
        server.changeset = transformedServer;
      };

      if (isClientVarsMessage(obj)) {
        padState.atext = obj.data.collab_client_vars.initialAttributedText;
        padState.apool = new AttributePool().fromJsonable(obj.data.collab_client_vars.apool);
        padState.baseRev = obj.data.collab_client_vars.rev;
        ee.emit('connected', padState);
      } else if (isNewChangesMessage(obj)) {
        if (obj.data.newRev <= padState.baseRev) return;
        assert((obj.data.newRev - 1) === padState.baseRev,
            `wrong incoming revision :${obj.data.newRev}/${padState.baseRev}`);

        const wireApool = new AttributePool().fromJsonable(obj.data.apool);
        const server = {
          changeset: Changeset.moveOpsToNewPool(obj.data.changeset, wireApool, padState.apool),
        };

        if (padState.inFlight) transformX(padState.inFlight, server);
        if (padState.outgoing) {
          transformX(padState.outgoing, server);
          padState.outgoing.baseRev = obj.data.newRev;
        }

        padState.atext = Changeset.applyToAText(server.changeset, padState.atext, padState.apool) as AText;
        padState.baseRev = obj.data.newRev;
        ee.emit('newContents', padState.atext);
      } else if (isAcceptCommitMessage(obj)) {
        if (obj.data.newRev <= padState.baseRev) return;
        assert((obj.data.newRev - 1) === padState.baseRev,
            `wrong incoming revision :${obj.data.newRev}/${padState.baseRev}`);
        padState.baseRev = obj.data.newRev;
        padState.inFlight = null;
        if (padState.outgoing) padState.outgoing.baseRev = obj.data.newRev;
        sendMessage();
      } else if (isDisconnectMessage(obj)) {
        ee.emit('disconnect', obj.disconnect);
      }
    });

    socket.on('disconnect', (e) => ee.emit('disconnect', e));
    socket.on('connect_timeout', (e) => ee.emit('connect_timeout', e));
    socket.on('connect_error', (e) => ee.emit('connect_error', e));

    ee.close = () => {
      socket.close();
    };

    ee.append = (text: string) => {
      const newChangeset = Changeset.makeSplice(
          padState.atext.text, padState.atext.text.length, 0, text);
      const newRev = padState.baseRev;
      padState.atext = Changeset.applyToAText(newChangeset, padState.atext, padState.apool) as AText;
      const msg: PendingMessage = {
        component: 'pad',
        type: 'USER_CHANGES',
        baseRev: newRev,
        changeset: newChangeset,
        apool: new AttributePool().toJsonable(),
      };
      sendMessage(msg);
    };
  });

  return ee;
};

export default {connect};
