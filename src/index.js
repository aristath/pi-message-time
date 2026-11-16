import { projectMessages, formatter } from './timestamps.js';

export default function messageTime(pi) {
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
  pi.on('context_with_system', (event, ctx) => ({ messages: projectMessages(event.messages, configuration(ctx)) }));
  pi.registerCommand('message-time', {
    description: 'Show the timezone used for user-message time metadata',
    handler: async (_args, ctx) => {
      const format = configuration(ctx);
      ctx.ui.notify(`Message timestamps: ${format.resolvedOptions().timeZone}. Configure messageTime.timeZone in Pi settings. Separate metadata messages precede user messages in model requests. Saved messages and the visible transcript remain unchanged.`, 'info');
    },
  });
}
