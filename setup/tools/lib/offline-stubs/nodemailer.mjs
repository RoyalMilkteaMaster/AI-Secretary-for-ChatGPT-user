// Offline stand-in for nodemailer: records messages, never opens a socket.
export default {
  createTransport(options) {
    return {
      async verify() { return true; },
      async sendMail(message) {
        globalThis.__offlineOutbox.push({auth_user: options.auth?.user, ...message});
        const to = Array.isArray(message.to) ? message.to : [message.to];
        return {accepted: to, rejected: []};
      },
      close() {},
    };
  },
};
