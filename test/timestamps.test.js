import test from 'node:test';
import assert from 'node:assert/strict';
import extension from '../src/index.js';
import { CUSTOM_TYPE, projectMessages, formatter, formatTime } from '../src/timestamps.js';

const stamp = Date.parse('2026-11-16T04:42:00Z');
test('exact wording, local calendar dates and DST are derived from the saved message time', () => {
  assert.equal(formatTime(stamp, formatter('Europe/Athens')), 'Monday, November 16, 2026, 06:42');
  const ny = formatter('America/New_York');
  assert.equal(formatTime('2026-03-08T06:59:00Z', ny), 'Sunday, March 8, 2026, 01:59');
  assert.equal(formatTime('2026-03-08T07:00:00Z', ny), 'Sunday, March 8, 2026, 03:00');
  assert.equal(formatTime('2026-01-01T00:15:00Z', ny), 'Wednesday, December 31, 2025, 19:15');
  assert.equal(formatTime(String(stamp), formatter('Asia/Kathmandu')), 'Monday, November 16, 2026, 10:27');
  for (const bad of [undefined, null, '', 'not-a-date', Infinity]) assert.equal(formatTime(bad, ny), null);
});
test('one separate hidden note precedes each user message; authored text, system, assistant and tools retain identity', () => {
  const format = formatter('Europe/Athens');
  const user = { role: 'user', timestamp: stamp, content: [{ type: 'text', text: 'Fictional user message' }, { type: 'image', mimeType: 'image/png', data: 'fixture' }] };
  const others = [
    { role: 'system', content: 'Prompt', sections: { fixture: 'Original section' }, timestamp: 0 },
    { role: 'assistant', timestamp: stamp, content: [{ type: 'thinking', thinking: 'Reasoning', thinkingSignature: 'opaque' }, { type: 'toolCall', id: 'one', name: 'fixture', arguments: {} }] },
    { role: 'toolResult', toolCallId: 'one', timestamp: stamp, content: [{ type: 'text', text: 'Result' }] },
    { role: 'custom', customType: 'another-package', content: 'Observation', timestamp: stamp },
    { role: 'compactionSummary', summary: 'Summary', timestamp: stamp },
    { role: 'user', timestamp: null, content: 'Undated' },
  ];
  const input = [others[0], user, ...others.slice(1)], saved = structuredClone(input);
  const output = projectMessages(input, format);
  assert.deepEqual(output[1], { role: 'custom', customType: CUSTOM_TYPE, display: false, timestamp: stamp, content: 'System metadata: Message creation time is Monday, November 16, 2026, 06:42' });
  assert.equal(output[2], user);
  assert.deepEqual(output.filter(message => message.customType !== CUSTOM_TYPE), input);
  for (const message of input) assert.ok(output.includes(message));
  assert.deepEqual(input, saved);
  assert.deepEqual(projectMessages(output, format), output);
  const later = projectMessages([...input, { role: 'user', timestamp: stamp + 60000, content: 'Later' }], format);
  assert.deepEqual(later.slice(0, output.length), output);
});
test('configuration errors retain the valid timezone and recover without introducing instructions or compaction handlers', async () => {
  const handlers = new Map(), commands = new Map(), notices = [];
  let settings = { messageTime: { timeZone: 'Europe/Athens' } };
  extension({ getSettings: () => settings, on: (name, fn) => handlers.set(name, fn), registerCommand: (name, command) => commands.set(name, command) });
  assert.deepEqual([...handlers.keys()], ['context_with_system']);
  const ctx = { ui: { notify: (...args) => notices.push(args) } };
  const system = { role: 'system', content: 'Original prompt', timestamp: 0 };
  const messages = [system, { role: 'user', content: 'Hello', timestamp: stamp }];
  const run = () => handlers.get('context_with_system')({ messages }, ctx).messages;
  assert.match(run()[1].content, /2026, 06:42$/); assert.equal(run()[0], system);
  settings = { messageTime: { timeZone: 'Not/A_Zone' } };
  assert.match(run()[1].content, /2026, 06:42$/); run(); assert.equal(notices.length, 1);
  settings = { messageTime: { timeZone: ' UTC ' } };
  assert.match(run()[1].content, /2026, 04:42$/);
  await commands.get('message-time').handler('', ctx); assert.match(notices.at(-1)[0], /UTC/);
});
