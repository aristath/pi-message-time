import { deflateSync } from 'node:zlib';

// A small, deterministic PNG for protocol and canvas checks.
function chunk(type, data) {
  const body = Buffer.concat([Buffer.from(type), data]);
  let crc = 0xffffffff;
  for (const byte of body) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit++) crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0);
  }
  const size = Buffer.alloc(4); size.writeUInt32BE(data.length);
  const checksum = Buffer.alloc(4); checksum.writeUInt32BE((crc ^ 0xffffffff) >>> 0);
  return Buffer.concat([size, body, checksum]);
}
const header = Buffer.alloc(13);
header.writeUInt32BE(128); header.writeUInt32BE(128, 4); header[8] = 8; header[9] = 2;
const pixels = Buffer.alloc((128 * 3 + 1) * 128);
let random = 12345;
for (let y = 0; y < 128; y++) for (let x = 0; x < 128; x++) {
  const offset = y * (128 * 3 + 1) + 1 + x * 3;
  for (let channel = 0; channel < 3; channel++) {
    random = (Math.imul(random, 1664525) + 1013904223) >>> 0;
    pixels[offset + channel] = random >>> 24;
  }
  if (x < 32 || x >= 96) {
    pixels[offset] = x < 32 ? 245 : 30;
    pixels[offset + 1] = 45;
    pixels[offset + 2] = x < 32 ? 80 : 230;
  }
}
export const image = Buffer.concat([Buffer.from('89504e470d0a1a0a', 'hex'), chunk('IHDR', header), chunk('IDAT', deflateSync(pixels)), chunk('IEND', Buffer.alloc(0))]).toString('base64');
