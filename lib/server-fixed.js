'use strict';

// Shared HTTP bootstrap used by every platform entry point.
const mini = require('./mini');
const db = require('./db');

function start(opts) {
  opts = opts || {};
  const app = mini();

  if (opts.routes) opts.routes(app);
  app.get('/health', (q, r) => r.send('ok'));

  // The Discord module exports create(), which returns the adapter with mount().
  if (process.env.DISCORD_PUBLIC_KEY) {
    try {
      const discordModule = require('../platforms/discord');
      const discordAdapter =
        typeof discordModule.mount === 'function'
          ? discordModule
          : typeof discordModule.create === 'function'
            ? discordModule.create()
            : null;

      if (discordAdapter && typeof discordAdapter.mount === 'function') {
        discordAdapter.mount(app, mini);
        console.log('[discord] interactions endpoint mounted');
      } else {
        console.log('[discord] adapter does not expose a usable mount() method');
      }
    } catch (e) {
      const missingDiscordModule =
        e.code === 'MODULE_NOT_FOUND' &&
        String(e.message || '').includes('platforms/discord');

      if (missingDiscordModule) {
        console.log('[discord] adapter not included in this package');
      } else {
        throw e;
      }
    }
  }

  require('./web').mount(app);

  const PORT = process.env.PORT || 3000;
  const server = app.listen(PORT, '0.0.0.0', () => {
    console.log('HTTP on ' + PORT + ' | data dir ' + db.store.paths.DATA_DIR);
  });

  try {
    require('./duel').attach(server, require('./web').userFromReq);
  } catch (e) {
    console.log('[duel] websocket duels disabled: ' + e.message);
  }

  if (process.env.RENDER_EXTERNAL_URL) {
    setInterval(() => {
      fetch(process.env.RENDER_EXTERNAL_URL + '/health').catch(() => {});
    }, 10 * 60 * 1000).unref();
  }

  process.on('unhandledRejection', e => console.log('UNHANDLED', e && e.message || e));
  process.on('uncaughtException', e => console.log('UNCAUGHT', e && e.message || e));

  return { app, server };
}

module.exports = { start };
