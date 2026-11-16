import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Type } from 'typebox';
import { createAgentSession, SessionManager, DefaultResourceLoader, SettingsManager } from '@earendil-works/pi-coding-agent';
import { createAssistantMessageEventStream, getCurrentSystemPrompt } from '@earendil-works/pi-ai';
import { convertMessages } from '@earendil-works/pi-ai/api/openai-completions';
import { image as png } from './image.js';

const root = fileURLToPath(new URL('../', import.meta.url));
function reply(content = 'Controlled answer') {
  return { role: 'assistant', content: typeof content === 'string' ? [{ type: 'text', text: content }] : content, api: 'openai-completions', provider: 'synthetic', model: 'clock', timestamp: 1750000000000,
    usage: { input: 10, output: 5, cacheRead: 0, cacheWrite: 0, totalTokens: 15, cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 } }, stopReason: Array.isArray(content) && content.some(part => part.type === 'toolCall') ? 'toolUse' : 'stop' };
}
function stream(handler) {
  return (model, context, options) => {
    const result = createAssistantMessageEventStream();
    void (async () => {
      try { const message = { ...await handler(model, context, options), api: model.api, provider: model.provider, model: model.id }; result.push({ type: 'done', reason: message.stopReason, message }); result.end(message); }
      catch (error) { const message = { ...reply(''), stopReason: 'error', errorMessage: error.message }; result.push({ type: 'error', reason: 'error', error: message }); result.end(message); }
    })();
    return result;
  };
}
async function fixture(t) {
  const base = mkdtempSync(join(tmpdir(), 'pi-message-time-')), agentDir = join(base, 'agent'), cwd = join(base, 'work');
  mkdirSync(agentDir); mkdirSync(cwd); t.after(() => rmSync(base, { recursive: true, force: true }));
  writeFileSync(join(agentDir, 'models.json'), JSON.stringify({ providers: { synthetic: { api: 'openai-completions', baseUrl: 'http://127.0.0.1:1/v1', apiKey: 'fixture', models: [{ id: 'clock', name: 'Controlled fixture', reasoning: true, input: ['text','image'], cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 }, contextWindow: 65536, maxTokens: 4096 }] } } }));
  writeFileSync(join(agentDir, 'settings.json'), JSON.stringify({ defaultProvider: 'synthetic', defaultModel: 'clock', cacheWarming: 'off', retry: { enabled: false }, compaction: { enabled: false, reserveTokens: 512, keepRecentTokens: 10 }, messageTime: { timeZone: 'UTC' } }));
  const open = async options => {
    const settingsManager = SettingsManager.create(cwd, agentDir);
    const resourceLoader = new DefaultResourceLoader({ cwd, agentDir, settingsManager, noExtensions: true, additionalExtensionPaths: [root], disabledBuiltinExtensions: ['mcp'], noSkills: true, noPromptTemplates: true, noThemes: true, noContextFiles: true });
    await resourceLoader.reload(); assert.deepEqual(resourceLoader.getExtensions().errors, []);
    const { session } = await createAgentSession({ cwd, agentDir, settingsManager, resourceLoader, sessionManager: SessionManager.create(cwd, join(base, 'sessions')), ...options });
    await session.bindExtensions({ mode: 'rpc', onError: error => { throw new Error(error.error); } });
    t.after(() => session.dispose()); return session;
  };
  return { open, base };
}

test('real Pi sends a separate metadata message before each user message and preserves assistant, tools and images', async t => {
  const f = await fixture(t); let calls = 0;
  const tool = { name: 'fixture_read', label: 'Fixture', description: 'Controlled tool', parameters: Type.Object({}), execute: async () => { calls++; return { content: [{ type: 'text', text: 'Controlled tool result' }] }; } };
  const session = await f.open({ customTools: [tool] }); const requests = [];
  session.agent.streamFunction = stream((_model, context) => {
    requests.push(structuredClone(context));
    return requests.length === 1 ? reply([{ type: 'thinking', thinking: 'Controlled reasoning' }, { type: 'toolCall', id: 'fixture-call', name: 'fixture_read', arguments: {} }]) : reply();
  });
  const image = { type: 'image', mimeType: 'image/png', data: png };
  await session.prompt('Hello', { images: [image] });
  assert.equal(calls, 1); assert.equal(requests.length, 2);
  assert.ok(!getCurrentSystemPrompt(requests[0].messages).includes('System metadata:'));
  const authoredUser = context => context.messages.find(message => message.role === 'user' && message.content.some?.(part => part.type === 'text' && part.text.startsWith('Hello')));
  const firstUser = authoredUser(requests[0]);
  const index = requests[0].messages.indexOf(firstUser);
  const metadata = requests[0].messages[index - 1];
  assert.equal(metadata.role, 'user');
  assert.match(metadata.content[0].text, /^System metadata: Message creation time is /);
  assert.ok(firstUser.content[0].text.startsWith('Hello'));
  assert.deepEqual(authoredUser(requests[1]), firstUser);
  const assistant = requests[1].messages.find(message => message.role === 'assistant');
  assert.equal(assistant.content[0].type, 'thinking'); assert.equal(assistant.content[1].type, 'toolCall');
  const wire = convertMessages(session.model, requests[1], {});
  const wireUsers = wire.filter(message => message.role === 'user');
  assert.equal(wireUsers.length, 2);
  assert.match(JSON.stringify(wireUsers[0].content), /System metadata: Message creation time is /);
  assert.ok(!JSON.stringify(wireUsers[1].content).includes('System metadata:'));
  assert.deepEqual(wireUsers[1].content.filter(part => part.type === 'text').map(part => part.text), firstUser.content.filter(part => part.type === 'text').map(part => part.text));
  assert.ok(wire.find(message => message.role === 'assistant').tool_calls.some(call => call.id === 'fixture-call'));
  assert.ok(wire.find(message => message.role === 'tool').content.includes('Controlled tool result'));
  const stored = readFileSync(session.sessionManager.getSessionFile(), 'utf8');
  assert.doesNotMatch(stored, /System metadata: Message creation time is/);
  const originalUser = session.sessionManager.getEntries().find(entry => entry.message?.role === 'user').message;
  assert.ok(originalUser.content.some(part => part.type === 'text' && part.text.startsWith('Hello')));
  assert.ok(originalUser.content.some(part => part.type === 'image'));
  await session.prompt('Next');
  assert.deepEqual(authoredUser(requests[2]), firstUser);
});

test('resumes and branches retain the original user time while native compaction receives unmodified history', async t => {
  const f = await fixture(t), session = await f.open();
  const manager = session.sessionManager;
  const rootId = manager.appendMessage({ role: 'user', content: 'Yesterday I fixed the fictional gate.', timestamp: Date.parse('2025-06-01T10:00:00Z') });
  manager.appendMessage(reply('Saved response'));
  manager.appendMessage({ role: 'user', content: 'Remember the date.', timestamp: Date.parse('2025-06-02T10:00:00Z') });
  manager.appendMessage(reply('Understood'));
  const resumed = await f.open({ sessionManager: SessionManager.open(manager.getSessionFile()) });
  const seen = [];
  resumed.agent.streamFunction = stream((_model, context) => { seen.push(structuredClone(context)); return reply(); });
  await resumed.prompt('Continue');
  assert.match(JSON.stringify(seen[0].messages), /Sunday, June 1, 2025, 10:00/);
  const before = structuredClone(resumed.sessionManager.getEntries().filter(entry => entry.type === 'message'));
  await resumed.compact();
  const summaryInput = JSON.stringify(seen.at(-1).messages);
  assert.doesNotMatch(summaryInput, /System metadata: Message creation time is/);
  assert.doesNotMatch(summaryInput, /Sunday, June 1, 2025, 10:00/);
  assert.match(summaryInput, /Yesterday I fixed the fictional gate/);
  assert.doesNotMatch(readFileSync(manager.getSessionFile(), 'utf8'), /System metadata: Message creation time is/);
  assert.deepEqual(SessionManager.open(manager.getSessionFile()).getEntries().filter(entry => entry.type === 'message'), before);
  const branchManager = SessionManager.open(manager.getSessionFile()); branchManager.branch(rootId);
  const branch = await f.open({ sessionManager: branchManager }); let branchContext;
  branch.agent.streamFunction = stream((_model, context) => { branchContext = context; return reply(); });
  await branch.prompt('Branch question');
  assert.match(JSON.stringify(branchContext.messages), /Sunday, June 1, 2025, 10:00/);
  assert.doesNotMatch(JSON.stringify(branchContext.messages), /Remember the date/);
});
