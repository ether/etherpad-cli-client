/**
 * This code represents the Attribute Pool Object of the original Etherpad.
 * 90% of the code is still like in the original Etherpad
 * Look at https://github.com/ether/pad/blob/master/infrastructure/ace/www/easysync2.js
 * You can find a explanation what a attribute pool is here:
 * https://github.com/ether/etherpad-lite/blob/master/doc/easysync/easysync-notes.txt
 */

/*
 * Copyright 2009 Google Inc., 2011 Peter 'Pita' Martischka (Primary Technology Ltd)
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *      http://www.apache.org/licenses/LICENSE-2.0
 */

export type AttribPair = [string, string];

export interface JsonableAttributePool {
  numToAttrib: Record<string, AttribPair>;
  nextNum: number;
}

export class AttributePool {
  numToAttrib: Record<string, AttribPair> = {};
  attribToNum: Record<string, number> = {};
  nextNum = 0;

  putAttrib(attrib: AttribPair | readonly [string, string], dontAddIfAbsent?: boolean): number {
    const str = String(attrib);
    if (str in this.attribToNum) {
      return this.attribToNum[str];
    }
    if (dontAddIfAbsent) {
      return -1;
    }
    const num = this.nextNum++;
    this.attribToNum[str] = num;
    this.numToAttrib[num] = [String(attrib[0] || ''), String(attrib[1] || '')];
    return num;
  }

  getAttrib(num: number): AttribPair | undefined {
    const pair = this.numToAttrib[num];
    if (!pair) {
      return pair;
    }
    return [pair[0], pair[1]];
  }

  getAttribKey(num: number): string {
    const pair = this.numToAttrib[num];
    if (!pair) return '';
    return pair[0];
  }

  getAttribValue(num: number): string {
    const pair = this.numToAttrib[num];
    if (!pair) return '';
    return pair[1];
  }

  eachAttrib(func: (key: string, value: string) => void): void {
    for (const n of Object.keys(this.numToAttrib)) {
      const pair = this.numToAttrib[n];
      func(pair[0], pair[1]);
    }
  }

  toJsonable(): JsonableAttributePool {
    return {
      numToAttrib: this.numToAttrib,
      nextNum: this.nextNum,
    };
  }

  fromJsonable(obj: JsonableAttributePool): this {
    this.numToAttrib = obj.numToAttrib;
    this.nextNum = obj.nextNum;
    this.attribToNum = {};
    for (const n of Object.keys(this.numToAttrib)) {
      this.attribToNum[String(this.numToAttrib[n])] = Number(n);
    }
    return this;
  }
}

export default AttributePool;
