import AttributePool, {type AttribPair} from './AttributePool.js';

type OpCode = '' | '=' | '+' | '-';
type AttributePair = readonly [string, string];
type AttributeInput = string | readonly AttributePair[] | null | undefined;

interface Op {
  opcode: OpCode;
  chars: number;
  lines: number;
  attribs: string;
}

interface UnpackedChangeset {
  oldLen: number;
  newLen: number;
  ops: string;
  charBank: string;
}

export interface AText {
  text: string;
  attribs: string;
}

const mustGetAttrib = (pool: AttributePool, id: number): AttribPair => {
  const pair = pool.getAttrib(id);
  if (pair === undefined) throw new Error(`Unknown attribute id: ${numToString(id)}`);
  return pair;
};

type EasysyncError = Error & {easysync?: boolean};

export const error = (msg: string): never => {
  const e: EasysyncError = new Error(msg);
  e.easysync = true;
  throw e;
};

export const assert: (condition: unknown, ...msgParts: unknown[]) => asserts condition = (
    condition: unknown,
    ...msgParts: unknown[]
): asserts condition => {
  if (!condition) error(`Failed assertion: ${msgParts.map((p) => String(p)).join('')}`);
};

export const parseNum = (str: string | number): number => parseInt(String(str), 36);
export const numToString = (num: number): string => num.toString(36).toLowerCase();

export const newOp = (opcode: OpCode = ''): Op => ({opcode, chars: 0, lines: 0, attribs: ''});
export const clearOp = (op: Op): void => {
  op.opcode = '';
  op.chars = 0;
  op.lines = 0;
  op.attribs = '';
};
export const copyOp = (from: Op, to: Op = newOp()): Op => {
  to.opcode = from.opcode;
  to.chars = from.chars;
  to.lines = from.lines;
  to.attribs = from.attribs;
  return to;
};

export const oldLen = (cs: string): number => unpack(cs).oldLen;
export const newLen = (cs: string): number => unpack(cs).newLen;

class StringAssembler {
  private readonly pieces: string[] = [];

  append(x: unknown): void {
    this.pieces.push(String(x));
  }

  toString(): string {
    return this.pieces.join('');
  }
}

class OpAssembler {
  private readonly pieces: string[] = [];

  append(op: Op): void {
    this.pieces.push(op.attribs);
    if (op.lines) this.pieces.push('|', numToString(op.lines));
    this.pieces.push(op.opcode, numToString(op.chars));
  }

  clear(): void {
    this.pieces.length = 0;
  }

  toString(): string {
    return this.pieces.join('');
  }
}

class MergingOpAssembler {
  private readonly assem = new OpAssembler();
  private readonly bufOp = newOp();
  private bufOpAdditionalCharsAfterNewline = 0;

  private flush(isEndDocument = false): void {
    if (!this.bufOp.opcode) return;
    if (!(isEndDocument && this.bufOp.opcode === '=' && !this.bufOp.attribs)) {
      this.assem.append(this.bufOp);
      if (this.bufOpAdditionalCharsAfterNewline) {
        this.bufOp.chars = this.bufOpAdditionalCharsAfterNewline;
        this.bufOp.lines = 0;
        this.assem.append(this.bufOp);
        this.bufOpAdditionalCharsAfterNewline = 0;
      }
    }
    this.bufOp.opcode = '';
  }

  append(op: Op): void {
    if (op.chars <= 0) return;
    if (this.bufOp.opcode === op.opcode && this.bufOp.attribs === op.attribs) {
      if (op.lines > 0) {
        this.bufOp.chars += this.bufOpAdditionalCharsAfterNewline + op.chars;
        this.bufOp.lines += op.lines;
        this.bufOpAdditionalCharsAfterNewline = 0;
      } else if (this.bufOp.lines === 0) {
        this.bufOp.chars += op.chars;
      } else {
        this.bufOpAdditionalCharsAfterNewline += op.chars;
      }
      return;
    }
    this.flush();
    copyOp(op, this.bufOp);
  }

  endDocument(): void {
    this.flush(true);
  }

  clear(): void {
    this.assem.clear();
    clearOp(this.bufOp);
    this.bufOpAdditionalCharsAfterNewline = 0;
  }

  toString(): string {
    this.flush();
    return this.assem.toString();
  }
}

class SmartOpAssembler {
  private readonly minusAssem = new MergingOpAssembler();
  private readonly plusAssem = new MergingOpAssembler();
  private readonly keepAssem = new MergingOpAssembler();
  private readonly assem = new StringAssembler();
  private lastOpcode: OpCode = '';
  private lengthChange = 0;

  private flushKeeps(): void {
    this.assem.append(this.keepAssem.toString());
    this.keepAssem.clear();
  }

  private flushPlusMinus(): void {
    this.assem.append(this.minusAssem.toString());
    this.minusAssem.clear();
    this.assem.append(this.plusAssem.toString());
    this.plusAssem.clear();
  }

  append(op: Op): void {
    if (!op.opcode || !op.chars) return;
    if (op.opcode === '-') {
      if (this.lastOpcode === '=') this.flushKeeps();
      this.minusAssem.append(op);
      this.lengthChange -= op.chars;
    } else if (op.opcode === '+') {
      if (this.lastOpcode === '=') this.flushKeeps();
      this.plusAssem.append(op);
      this.lengthChange += op.chars;
    } else {
      if (this.lastOpcode !== '=') this.flushPlusMinus();
      this.keepAssem.append(op);
    }
    this.lastOpcode = op.opcode;
  }

  appendOpWithText(
      opcode: Exclude<OpCode, ''>,
      text: string,
      attribs?: AttributeInput,
      pool?: AttributePool,
  ): void {
    const op = newOp(opcode);
    op.attribs = makeAttribsString(opcode, attribs, pool);
    const lastNewlinePos = text.lastIndexOf('\n');
    if (lastNewlinePos < 0) {
      op.chars = text.length;
      op.lines = 0;
      this.append(op);
      return;
    }
    op.chars = lastNewlinePos + 1;
    op.lines = (text.match(/\n/g) ?? []).length;
    this.append(op);
    op.chars = text.length - (lastNewlinePos + 1);
    op.lines = 0;
    this.append(op);
  }

  endDocument(): void {
    this.keepAssem.endDocument();
  }

  clear(): void {
    this.minusAssem.clear();
    this.plusAssem.clear();
    this.keepAssem.clear();
    this.lengthChange = 0;
  }

  getLengthChange(): number {
    return this.lengthChange;
  }

  toString(): string {
    this.flushPlusMinus();
    this.flushKeeps();
    return this.assem.toString();
  }
}

class StringIterator {
  private curIndex = 0;
  private newlineCount: number;

  constructor(private readonly str: string) {
    this.newlineCount = (str.match(/\n/g) ?? []).length;
  }

  private assertRemaining(n: number): void {
    assert(n <= this.remaining(), 'stringIterator bounds');
  }

  take(n: number): string {
    this.assertRemaining(n);
    const s = this.str.slice(this.curIndex, this.curIndex + n);
    this.newlineCount -= (s.match(/\n/g) ?? []).length;
    this.curIndex += n;
    return s;
  }

  peek(n: number): string {
    this.assertRemaining(n);
    return this.str.slice(this.curIndex, this.curIndex + n);
  }

  skip(n: number): void {
    this.assertRemaining(n);
    const s = this.str.slice(this.curIndex, this.curIndex + n);
    this.newlineCount -= (s.match(/\n/g) ?? []).length;
    this.curIndex += n;
  }

  remaining(): number {
    return this.str.length - this.curIndex;
  }

  newlines(): number {
    return this.newlineCount;
  }
}

export const unpack = (cs: string): UnpackedChangeset => {
  const headerRegex = /Z:([0-9a-z]+)([><])([0-9a-z]+)|/;
  const headerMatch = headerRegex.exec(cs);
  if (headerMatch == null || !headerMatch[0]) error(`Not a Changeset: ${cs}`);
  const hm = headerMatch as RegExpExecArray;
  const oldLength = parseNum(hm[1]);
  const changeSign = hm[2] === '>' ? 1 : -1;
  const changeMagnitude = parseNum(hm[3]);
  const newLength = oldLength + changeSign * changeMagnitude;
  const opsStart = hm[0].length;
  const opsEnd = cs.indexOf('$') < 0 ? cs.length : cs.indexOf('$');
  return {
    oldLen: oldLength,
    newLen: newLength,
    ops: cs.slice(opsStart, opsEnd),
    charBank: cs.slice(opsEnd + 1),
  };
};

export const pack = (oldLength: number, newLength: number, opsStr: string, bank: string): string => {
  const lenDiff = newLength - oldLength;
  const lenDiffStr = lenDiff >= 0 ? `>${numToString(lenDiff)}` : `<${numToString(-lenDiff)}`;
  return `Z:${numToString(oldLength)}${lenDiffStr}${opsStr}$${bank}`;
};

const deserializeOps = function* (ops: string): Generator<Op> {
  const regex = /((?:\*[0-9a-z]+)*)(?:\|([0-9a-z]+))?([-+=])([0-9a-z]+)|(.)/g;
  let match: RegExpExecArray | null;
  while ((match = regex.exec(ops)) != null) {
    if (match[5] === '$') return;
    if (match[5] != null) error(`invalid operation: ${ops.slice(regex.lastIndex - 1)}`);
    yield {
      opcode: match[3] as Exclude<OpCode, ''>,
      chars: parseNum(match[4]),
      lines: parseNum(match[2] || '0'),
      attribs: match[1],
    };
  }
};

export const opIterator = (opsStr: string, optStartIndex = 0): {
  next: (op?: Op) => Op;
  hasNext: () => boolean;
  lastIndex: () => number;
} => {
  const iter = deserializeOps(opsStr.slice(optStartIndex));
  let nextItem = iter.next();
  let index = optStartIndex;
  return {
    next: (op: Op = newOp()): Op => {
      if (nextItem.done || !nextItem.value) {
        clearOp(op);
        return op;
      }
      copyOp(nextItem.value, op);
      index += 1;
      nextItem = iter.next();
      return op;
    },
    hasNext: (): boolean => !nextItem.done,
    lastIndex: (): number => index,
  };
};

const applyZip = (
    in1: string,
    in2: string,
    zipper: (op1: Op, op2: Op, out: Op) => void,
): string => {
  const iter1 = deserializeOps(in1);
  const iter2 = deserializeOps(in2);
  let next1 = iter1.next();
  let next2 = iter2.next();
  let op1 = newOp();
  let op2 = newOp();
  const assem = new SmartOpAssembler();
  while (op1.opcode || !next1.done || op2.opcode || !next2.done) {
    if (!op1.opcode && !next1.done && next1.value) {
      op1 = copyOp(next1.value);
      next1 = iter1.next();
    }
    if (!op2.opcode && !next2.done && next2.value) {
      op2 = copyOp(next2.value);
      next2 = iter2.next();
    }
    const opOut = newOp();
    zipper(op1, op2, opOut);
    if (opOut.opcode) assem.append(opOut);
  }
  assem.endDocument();
  return assem.toString();
};

export const composeAttributes = (
    att1: string,
    att2: string,
    resultIsMutation: boolean,
    pool: AttributePool,
): string => {
  if (!att1 && resultIsMutation) return att2;
  if (!att2) return att1;
  const attributePool: AttributePool = pool;

  const atts: [string, string][] = [];
  att1.replace(/\*([0-9a-z]+)/g, (_s: string, a: string) => {
    const attribPair = mustGetAttrib(attributePool, parseNum(a));
    atts.push([attribPair[0], attribPair[1]]);
    return '';
  });

  att2.replace(/\*([0-9a-z]+)/g, (_s: string, a: string) => {
    const attribPair = mustGetAttrib(attributePool, parseNum(a));
    let found = false;
    for (let i = 0; i < atts.length; i++) {
      if (atts[i][0] === attribPair[0]) {
        if (attribPair[1] || resultIsMutation) atts[i][1] = attribPair[1];
        else atts.splice(i, 1);
        found = true;
        break;
      }
    }
    if (!found && (attribPair[1] || resultIsMutation)) atts.push([attribPair[0], attribPair[1]]);
    return '';
  });

  atts.sort((a, b) => (a[0] === b[0] ? a[1].localeCompare(b[1]) : a[0].localeCompare(b[0])));
  const buf = new StringAssembler();
  for (const pair of atts) {
    buf.append('*');
    buf.append(numToString(attributePool.putAttrib(pair)));
  }
  return buf.toString();
};

const slicerZipperFunc = (attOp: Op, csOp: Op, opOut: Op, pool: AttributePool | null): void => {
  if (attOp.opcode === '-') {
    copyOp(attOp, opOut);
    attOp.opcode = '';
    return;
  }
  if (!attOp.opcode) {
    copyOp(csOp, opOut);
    csOp.opcode = '';
    return;
  }
  switch (csOp.opcode) {
    case '-':
      if (csOp.chars <= attOp.chars) {
        if (attOp.opcode === '=') {
          opOut.opcode = '-';
          opOut.chars = csOp.chars;
          opOut.lines = csOp.lines;
          opOut.attribs = '';
        }
        attOp.chars -= csOp.chars;
        attOp.lines -= csOp.lines;
        csOp.opcode = '';
        if (!attOp.chars) attOp.opcode = '';
      } else {
        if (attOp.opcode === '=') {
          opOut.opcode = '-';
          opOut.chars = attOp.chars;
          opOut.lines = attOp.lines;
          opOut.attribs = '';
        }
        csOp.chars -= attOp.chars;
        csOp.lines -= attOp.lines;
        attOp.opcode = '';
      }
      return;
    case '+':
      copyOp(csOp, opOut);
      csOp.opcode = '';
      return;
    case '=':
      if (csOp.chars <= attOp.chars) {
        opOut.opcode = attOp.opcode;
        opOut.chars = csOp.chars;
        opOut.lines = csOp.lines;
        opOut.attribs = composeAttributes(attOp.attribs, csOp.attribs, attOp.opcode === '=', pool ?? new AttributePool());
        csOp.opcode = '';
        attOp.chars -= csOp.chars;
        attOp.lines -= csOp.lines;
        if (!attOp.chars) attOp.opcode = '';
      } else {
        opOut.opcode = attOp.opcode;
        opOut.chars = attOp.chars;
        opOut.lines = attOp.lines;
        opOut.attribs = composeAttributes(attOp.attribs, csOp.attribs, attOp.opcode === '=', pool ?? new AttributePool());
        attOp.opcode = '';
        csOp.chars -= attOp.chars;
        csOp.lines -= attOp.lines;
      }
      return;
    default:
      copyOp(attOp, opOut);
      attOp.opcode = '';
  }
};

export const applyToAttribution = (cs: string, astr: string, pool: AttributePool): string => {
  const unpacked = unpack(cs);
  return applyZip(astr, unpacked.ops, (op1, op2, out) => slicerZipperFunc(op1, op2, out, pool));
};

export const applyToText = (cs: string, str: string): string => {
  const unpacked = unpack(cs);
  assert(str.length === unpacked.oldLen, 'mismatched apply: ', str.length, ' / ', unpacked.oldLen);
  const csIter = deserializeOps(unpacked.ops);
  const bankIter = new StringIterator(unpacked.charBank);
  const strIter = new StringIterator(str);
  const assem = new StringAssembler();

  for (const op of csIter) {
    switch (op.opcode) {
      case '+':
        assem.append(bankIter.take(op.chars));
        break;
      case '-':
        strIter.skip(op.chars);
        break;
      case '=':
        assem.append(strIter.take(op.chars));
        break;
    }
  }
  assem.append(strIter.take(strIter.remaining()));
  return assem.toString();
};

export const makeAttribsString = (
    opcode: Exclude<OpCode, ''>,
    attribs?: AttributeInput,
    pool?: AttributePool,
): string => {
  if (!attribs) return '';
  if (typeof attribs === 'string') return attribs;
  if (!pool || !attribs.length) return '';
  const sorted = attribs.length > 1 ? [...attribs].sort() : attribs;
  const result: string[] = [];
  for (const pair of sorted) {
    if (opcode === '=' || (opcode === '+' && pair[1])) {
      result.push(`*${numToString(pool.putAttrib(pair))}`);
    }
  }
  return result.join('');
};

export const makeSplice = (
    oldFullText: string,
    spliceStart: number,
    numRemoved: number,
    newText: string,
    optNewTextAPairs?: AttributeInput,
    pool?: AttributePool,
): string => {
  if (spliceStart < 0) spliceStart = 0;
  if (numRemoved < 0) numRemoved = 0;
  const oldLength = oldFullText.length;
  if (spliceStart > oldLength) spliceStart = oldLength;
  if (numRemoved > oldLength - spliceStart) numRemoved = oldLength - spliceStart;
  const oldText = oldFullText.slice(spliceStart, spliceStart + numRemoved);
  const newLength = oldLength + newText.length - oldText.length;

  const assem = new SmartOpAssembler();
  assem.appendOpWithText('=', oldFullText.slice(0, spliceStart));
  assem.appendOpWithText('-', oldText);
  assem.appendOpWithText('+', newText, optNewTextAPairs, pool);
  assem.endDocument();

  return pack(oldLength, newLength, assem.toString(), newText);
};

export const applyToAText = (cs: string, atext: AText, pool: AttributePool): AText => ({
  text: applyToText(cs, atext.text),
  attribs: applyToAttribution(cs, atext.attribs, pool),
});

export const moveOpsToNewPool = (cs: string, oldPool: AttributePool, newPool: AttributePool): string => {
  let dollarPos = cs.indexOf('$');
  if (dollarPos < 0) dollarPos = cs.length;
  const upToDollar = cs.slice(0, dollarPos);
  const fromDollar = cs.slice(dollarPos);
  return upToDollar.replace(/\*([0-9a-z]+)/g, (_s: string, a: string) => {
    const attribPair = mustGetAttrib(oldPool, parseNum(a));
    const newNum = newPool.putAttrib(attribPair);
    return `*${numToString(newNum)}`;
  }) + fromDollar;
};

export const compose = (cs1: string, cs2: string, pool: AttributePool): string => {
  const unpacked1 = unpack(cs1);
  const unpacked2 = unpack(cs2);
  const len1 = unpacked1.oldLen;
  const len2 = unpacked1.newLen;
  assert(len2 === unpacked2.oldLen, 'mismatched composition of two changesets');
  const len3 = unpacked2.newLen;
  const bankIter1 = new StringIterator(unpacked1.charBank);
  const bankIter2 = new StringIterator(unpacked2.charBank);
  const bankAssem = new StringAssembler();

  const newOps = applyZip(unpacked1.ops, unpacked2.ops, (op1, op2, opOut) => {
    const op1code = op1.opcode;
    const op2code = op2.opcode;
    if (op1code === '+' && op2code === '-') bankIter1.skip(Math.min(op1.chars, op2.chars));
    slicerZipperFunc(op1, op2, opOut, pool);
    if (opOut.opcode === '+') {
      if (op2code === '+') bankAssem.append(bankIter2.take(opOut.chars));
      else bankAssem.append(bankIter1.take(opOut.chars));
    }
  });

  return pack(len1, len3, newOps, bankAssem.toString());
};

const attributeTester = (attribPair: AttributePair, pool: AttributePool | null): ((attribs: string) => boolean) => {
  if (!pool) return () => false;
  const attribNum = pool.putAttrib(attribPair, true);
  if (attribNum < 0) return () => false;
  const re = new RegExp(`\\*${numToString(attribNum)}(?!\\w)`);
  return (attribs: string): boolean => re.test(attribs);
};

const followAttributes = (att1: string, att2: string, pool: AttributePool): string => {
  if (!att2) return '';
  if (!att1) return att2;
  const attributePool: AttributePool = pool;
  const atts: [string, string][] = [];
  att2.replace(/\*([0-9a-z]+)/g, (_s: string, a: string) => {
    const attribPair = mustGetAttrib(attributePool, parseNum(a));
    atts.push([attribPair[0], attribPair[1]]);
    return '';
  });
  att1.replace(/\*([0-9a-z]+)/g, (_s: string, a: string) => {
    const firstPair = mustGetAttrib(attributePool, parseNum(a));
    for (let i = 0; i < atts.length; i++) {
      if (firstPair[0] === atts[i][0]) {
        if (firstPair[1] <= atts[i][1]) atts.splice(i, 1);
        break;
      }
    }
    return '';
  });
  const buf = new StringAssembler();
  for (const pair of atts) {
    buf.append('*');
    buf.append(numToString(attributePool.putAttrib(pair)));
  }
  return buf.toString();
};

export const follow = (
    cs1: string,
    cs2: string,
    reverseInsertOrder: boolean,
    pool: AttributePool,
): string => {
  const unpacked1 = unpack(cs1);
  const unpacked2 = unpack(cs2);
  assert(unpacked1.oldLen === unpacked2.oldLen, 'mismatched follow');
  const chars1 = new StringIterator(unpacked1.charBank);
  const chars2 = new StringIterator(unpacked2.charBank);
  const oldLength = unpacked1.newLen;
  let oldPos = 0;
  let newLength = 0;
  const hasInsertFirst = attributeTester(['insertorder', 'first'], pool);

  const newOps = applyZip(unpacked1.ops, unpacked2.ops, (op1, op2, opOut) => {
    if (op1.opcode === '+' || op2.opcode === '+') {
      let whichToDo: 1 | 2;
      if (op2.opcode !== '+') whichToDo = 1;
      else if (op1.opcode !== '+') whichToDo = 2;
      else {
        const firstChar1 = chars1.peek(1);
        const firstChar2 = chars2.peek(1);
        const insertFirst1 = hasInsertFirst(op1.attribs);
        const insertFirst2 = hasInsertFirst(op2.attribs);
        if (insertFirst1 && !insertFirst2) whichToDo = 1;
        else if (insertFirst2 && !insertFirst1) whichToDo = 2;
        else if (firstChar1 === '\n' && firstChar2 !== '\n') whichToDo = 2;
        else if (firstChar1 !== '\n' && firstChar2 === '\n') whichToDo = 1;
        else whichToDo = reverseInsertOrder ? 2 : 1;
      }

      if (whichToDo === 1) {
        chars1.skip(op1.chars);
        opOut.opcode = '=';
        opOut.lines = op1.lines;
        opOut.chars = op1.chars;
        opOut.attribs = '';
        op1.opcode = '';
      } else {
        chars2.skip(op2.chars);
        copyOp(op2, opOut);
        op2.opcode = '';
      }
    } else if (op1.opcode === '-') {
      if (!op2.opcode) {
        op1.opcode = '';
      } else if (op1.chars <= op2.chars) {
        op2.chars -= op1.chars;
        op2.lines -= op1.lines;
        op1.opcode = '';
        if (!op2.chars) op2.opcode = '';
      } else {
        op1.chars -= op2.chars;
        op1.lines -= op2.lines;
        op2.opcode = '';
      }
    } else if (op2.opcode === '-') {
      copyOp(op2, opOut);
      if (!op1.opcode) {
        op2.opcode = '';
      } else if (op2.chars <= op1.chars) {
        op1.chars -= op2.chars;
        op1.lines -= op2.lines;
        op2.opcode = '';
        if (!op1.chars) op1.opcode = '';
      } else {
        opOut.lines = op1.lines;
        opOut.chars = op1.chars;
        op2.lines -= op1.lines;
        op2.chars -= op1.chars;
        op1.opcode = '';
      }
    } else if (!op1.opcode) {
      copyOp(op2, opOut);
      op2.opcode = '';
    } else if (!op2.opcode) {
      op1.opcode = '';
    } else {
      opOut.opcode = '=';
      opOut.attribs = followAttributes(op1.attribs, op2.attribs, pool);
      if (op1.chars <= op2.chars) {
        opOut.chars = op1.chars;
        opOut.lines = op1.lines;
        op2.chars -= op1.chars;
        op2.lines -= op1.lines;
        op1.opcode = '';
        if (!op2.chars) op2.opcode = '';
      } else {
        opOut.chars = op2.chars;
        opOut.lines = op2.lines;
        op1.chars -= op2.chars;
        op1.lines -= op2.lines;
        op2.opcode = '';
      }
    }

    switch (opOut.opcode) {
      case '=':
        oldPos += opOut.chars;
        newLength += opOut.chars;
        break;
      case '-':
        oldPos += opOut.chars;
        break;
      case '+':
        newLength += opOut.chars;
        break;
      default:
        break;
    }
  });

  newLength += oldLength - oldPos;
  return pack(oldLength, newLength, newOps, unpacked2.charBank);
};
