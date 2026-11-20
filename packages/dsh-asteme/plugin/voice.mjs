// What a reading aloud is sent with, from what DSH already holds.
//
// DSH's own web tools reach DeepSeek's tool APIs in one of two ways, and this
// follows them: the account's token when the conversation thinks with the
// DeepSeek account, otherwise the API key kept in DSH's credentials (or, where
// DSH has no credentials service, in the environment it was started from).
// The secret is asked for at each reading and kept nowhere here.
const KEY = "DEEPSEEK_API_KEY", ACCOUNT = "deepseek-account";

export const dshVoiceAuth = (ctx, speaking = () => null, env = process.env) => async (base) => {
  const service = (name) => { try { return ctx.get(name) ?? null; } catch { return null; } };
  try { const account = service("deepseekAccount"); if (speaking()?.provider === ACCOUNT && account?.resolveToken) { const token = await account.resolveToken(base); if (token) return { "x-dsh-auth-token": token }; } } catch { /* then the key */ }
  try { const credentials = service("credentials"), value = credentials?.resolve ? (await credentials.resolve(KEY))?.value : env[KEY]; return value ? { authorization: `Bearer ${value}` } : null; } catch { return null; }
};
