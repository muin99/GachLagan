import { MAX_WIRE } from './core.mjs';

export const MAX_FRAMES = 16;
const HEADER = /^\[\[(GK2|GE2):([1-9][0-9]{0,4})\]\]/;

// Frames delimit adjacent inserts. The inner GK1 authentication tag still
// protects each encrypted message; framing does not authenticate ordering.
export function frameMessage(wire) {
  if (typeof wire !== 'string' || !/^(GK1|GE1)\./.test(wire) || wire.length > MAX_WIRE) throw new Error('Invalid message to insert.');
  const kind = wire.startsWith('GK1.') ? 'GK2' : 'GE2';
  const framed = `[[${kind}:${wire.length}]]${wire}[[/${kind}]]`;
  if (framed.length > MAX_WIRE) throw new Error('Encoded message is too large to insert.');
  return framed;
}

export function parseMessages(text) {
  if (typeof text !== 'string' || text.length > MAX_WIRE) throw new Error('Copied message is too large.');
  const input = text.trim();
  if (/^(GK1|GE1)\./.test(input)) return [input]; // Earlier releases.
  const messages = [];
  let offset = 0;
  while (offset < input.length) {
    while (/\s/.test(input[offset] ?? '')) offset++;
    if (offset === input.length) break;
    const match = HEADER.exec(input.slice(offset));
    if (!match) throw new Error('Copy complete Gachlagan messages, including their headers and tails.');
    const [header, kind, count] = match, length = Number(count);
    if (length > MAX_WIRE || messages.length >= MAX_FRAMES) throw new Error('Too many or oversized messages in this copy.');
    const start = offset + header.length, end = start + length, tail = `[[/${kind}]]`;
    const wire = input.slice(start, end);
    if (input.slice(end, end + tail.length) !== tail || !wire.startsWith(kind === 'GK2' ? 'GK1.' : 'GE1.')) {
      throw new Error('A copied message is incomplete or has a damaged tail.');
    }
    messages.push(wire);
    offset = end + tail.length;
  }
  if (!messages.length) throw new Error('Copy a complete Gachlagan message first.');
  return messages;
}

export function isRecognized(text) {
  return typeof text === 'string' && /^(?:GK1\.|GE1\.|\[\[(?:GK2|GE2):)/.test(text.trim());
}
