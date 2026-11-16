import { addGuide, createProjector, formatter, SUMMARY_GUIDE } from './timestamps.js';

export default function messageTime(pi) {
  const project = createProjector();
  let current = formatter(), selectedZone, warning;
  function configuration(ctx) {
    try {
      const options = pi.getSettings().messageTime;
      if (options != null && (typeof options !== 'object' || Array.isArray(options))) throw new Error('messageTime must be a JSON object.');
      const zone = options?.timeZone;
      if (zone != null && (typeof zone !== 'string' || !zone.trim())) throw new Error('messageTime.timeZone must be an IANA timezone.');
      const selected = zone?.trim();
      if (selected !== selectedZone) { current = formatter(selected); selectedZone = selected; }
      warning = undefined;
    } catch {
      const message = `Message time: invalid configuration. Keeping timezone ${current.resolvedOptions().timeZone}. Set messageTime.timeZone to a valid IANA timezone and reload Pi.`;
      if (warning !== message) ctx.ui.notify(message, 'warning');
      warning = message;
    }
    return current;
  }
  pi.on('context_with_system', (event, ctx) => ({ messages: addGuide(project(event.messages, configuration(ctx))) }));
  pi.on('session_before_compact', (event, ctx) => {
    const format = configuration(ctx), preparation = event.preparation;
    const summarize = messages => {
      const stamped = project(messages, format);
      const index = stamped.findIndex((message, i) => message !== messages[i]);
      if (index < 0) return stamped;
      const message = stamped[index], note = `<message_time_guidance>${SUMMARY_GUIDE}</message_time_guidance>\n`;
      if (typeof message.content === 'string') stamped[index] = { ...message, content: note + message.content };
      else {
        let at = 0;
        while (message.content[at]?.type === 'thinking') at++;
        stamped[index] = { ...message, content: [...message.content.slice(0, at), { type: 'text', text: note }, ...message.content.slice(at)] };
      }
      return stamped;
    };
    preparation.messagesToSummarize = summarize(preparation.messagesToSummarize);
    preparation.turnPrefixMessages = summarize(preparation.turnPrefixMessages);
  });
  pi.registerCommand('message-time', {
    description: 'Show the timezone used for inline model-facing message timestamps',
    handler: async (_args, ctx) => {
      const format = configuration(ctx);
      ctx.ui.notify(`Message timestamps: ${format.resolvedOptions().timeZone}. Configure messageTime.timeZone in Pi settings. Headers are sent to the model; saved messages and the visible transcript remain unchanged.`, 'info');
    },
  });
}
