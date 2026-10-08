import nodemailer from 'nodemailer';
import {connect} from 'node:tls';
import {OWNER} from './owner-config.mjs';

// Keep the DNS hostname for the Workers socket proxy and TLS SNI instead of
// handing it a numeric IP selected by Nodemailer's Node DNS resolver.
function getSocket(_options, callback) {
  const socket = connect({host:'smtp.gmail.com',port:465,servername:'smtp.gmail.com',rejectUnauthorized:true});
  let returned = false;
  const finish = (error, value) => {if(returned) return; returned=true; clearTimeout(timeout); callback(error,value);};
  const timeout = setTimeout(()=>{const error=new Error('SMTP connection timeout');error.code='ETIMEDOUT';socket.destroy(error);},20000);
  socket.once('error',error=>finish(error));
  socket.once('secureConnect',()=>finish(null,{connection:socket,secured:true}));
}

// Shared SMTP transport for the account owner's Cloudflare service.
// Fixed-account guard: the Worker secrets must match the validated owner
// settings baked in by prepare.mjs, otherwise nothing is requested or sent.
// Without an origin the mail's checkbox links would be broken, so refuse too.
export async function sendCloudMail(env, content) {
  if (!OWNER.configured || !OWNER.origin || !OWNER.sender || !OWNER.recipient ||
      env.GMAIL_SENDER !== OWNER.sender || env.GMAIL_RECIPIENT !== OWNER.recipient) {
    throw new Error('Unexpected mail configuration');
  }
  const response = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST', headers: {'Content-Type': 'application/x-www-form-urlencoded'},
    body: new URLSearchParams({grant_type: 'refresh_token', client_id: env.GMAIL_CLIENT_ID,
      client_secret: env.GMAIL_CLIENT_SECRET, refresh_token: env.GMAIL_SMTP_REFRESH_TOKEN}),
  });
  if (!response.ok) throw new Error('Mail authorization failed');
  const token = await response.json();
  if (!token.access_token) throw new Error('Mail authorization failed');
  const transport = nodemailer.createTransport({
    host: 'smtp.gmail.com', port: 465, secure: true, getSocket,
    tls: {minVersion: 'TLSv1.2', rejectUnauthorized: true},
    auth: {type: 'OAuth2', user: OWNER.sender, accessToken: token.access_token},
    logger: false, debug: false, connectionTimeout: 20000, greetingTimeout: 20000,
    socketTimeout: 30000, disableFileAccess: true, disableUrlAccess: true,
  });
  try {
    const result = await transport.sendMail({...content,
      from: {name: 'AI秘書', address: OWNER.sender}, to: OWNER.recipient,
      envelope: {from: OWNER.sender, to: [OWNER.recipient]},
    });
    if (result.rejected.length || !result.accepted.includes(OWNER.recipient)) throw new Error('Mail not accepted');
  } finally { transport.close(); }
}
