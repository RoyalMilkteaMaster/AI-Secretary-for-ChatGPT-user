// Offline mode for tests and local acceptance: nodemailer and google-auth-library
// resolve to local stubs, and global fetch is replaced by a blocker that only
// answers explicitly allowed fictional Google endpoints. Nothing leaves this machine.
import {registerHooks} from 'node:module';

const stubs = {
  'nodemailer': new URL('./offline-stubs/nodemailer.mjs', import.meta.url).href,
  'google-auth-library': new URL('./offline-stubs/google-auth-library.mjs', import.meta.url).href,
};
registerHooks({
  resolve(specifier, context, next) {
    if (Object.hasOwn(stubs, specifier)) return {url: stubs[specifier], shortCircuit: true};
    return next(specifier, context);
  },
});

globalThis.__offlineOutbox = [];
globalThis.__offlineFetchLog = [];
export function offlineFetch(routes = {}) {
  return async (url, options = {}) => {
    const target = String(url);
    globalThis.__offlineFetchLog.push(target);
    for (const [prefix, handler] of Object.entries(routes)) if (target.startsWith(prefix)) return handler(target, options);
    throw new Error('OFFLINE_NETWORK_BLOCKED');
  };
}
globalThis.fetch = offlineFetch();
