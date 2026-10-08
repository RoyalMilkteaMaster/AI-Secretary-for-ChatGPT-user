// Offline stand-in: any attempt to use Google OAuth in offline mode fails loudly.
export class OAuth2Client {
  constructor() { throw new Error('OFFLINE_STUB_GOOGLE_AUTH'); }
}
