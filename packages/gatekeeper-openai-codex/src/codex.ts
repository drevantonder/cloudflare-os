import { DurableObject, WorkerEntrypoint } from "cloudflare:workers";
import type { ModelAuth } from "@earendil-works/pi-ai";
import type { AccountDescription, Gatekeeper, GatekeeperConnectCallback, GatekeeperConnectOptions, GatekeeperUser, GatekeeperUserVerifier, GatekeeperVendor as GatekeeperVendorInterface, ModelAuthAccount, ResourceConfiguratorFrame, SupportedResource, VendorDescription } from "@gadgets/workshop-shared/gatekeeper";
import { tokensChanged, type CodexTokens } from "./token-refresh.js";

const CLIENT_ID = "app_EMoamEEZ73f0CkXaXp7hrann";
const USER_CODE_URL = "https://auth.openai.com/api/accounts/deviceauth/usercode";
const DEVICE_TOKEN_URL = "https://auth.openai.com/api/accounts/deviceauth/token";
const OAUTH_TOKEN_URL = "https://auth.openai.com/oauth/token";
const VERIFY_URL = "https://auth.openai.com/codex/device";
const LIFETIME = 15 * 60 * 1000;
const MINIMUM_TOKEN_VALIDITY = 5 * 60 * 1000;
const REQUEST_TIMEOUT = 20_000;
const JWT_AUTH_CLAIM = "https://api.openai.com/auth";

type DeviceCode = { id: string, userCode: string, interval: number, expires: number };
type Tokens = CodexTokens;
type Props = { accountObjectId: string };
type Env = Cloudflare.Env & { BASE_URL?: string };

function requestSignal(): AbortSignal { return AbortSignal.timeout(REQUEST_TIMEOUT); }

type ChatGptIdentity = { accountId: string | null, email: string | null };

function decodeChatGptIdentity(token: string): ChatGptIdentity {
  try {
    const payload = token.split(".")[1];
    if (!payload) return {accountId: null, email: null};
    const json = JSON.parse(atob(payload.replace(/-/g, "+").replace(/_/g, "/"))) as {
      [JWT_AUTH_CLAIM]?: { chatgpt_account_id?: unknown },
      email?: unknown,
    };
    const accountId = json[JWT_AUTH_CLAIM]?.chatgpt_account_id;
    return {
      accountId: typeof accountId === "string" && accountId.length > 0 ? accountId : null,
      email: typeof json.email === "string" && json.email.length > 0 ? json.email : null,
    };
  } catch {
    return {accountId: null, email: null};
  }
}

function getChatGptIdentity(accessToken: string, idToken: string | null): ChatGptIdentity {
  const accessIdentity = decodeChatGptIdentity(accessToken);
  const idIdentity = idToken ? decodeChatGptIdentity(idToken) : {accountId: null, email: null};
  return {
    accountId: idIdentity.accountId ?? accessIdentity.accountId,
    email: idIdentity.email ?? accessIdentity.email,
  };
}

function accountLabel({accountId, email}: ChatGptIdentity): string {
  if (email) return email;
  if (accountId) return `ChatGPT account ···${accountId.slice(-6)}`;
  return "OpenAI Codex account";
}

function nonce(): string { return [...crypto.getRandomValues(new Uint8Array(24))].map(byte => byte.toString(16).padStart(2, "0")).join(""); }

export default {
  async fetch(req: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(req.url);
    const basePath = new URL(env.BASE_URL ?? "http://localhost:8787/gatekeeper/openai-codex").pathname;
    if (!url.pathname.startsWith(`${basePath}/`)) return new Response("Not Found", {status: 404});
    const path = url.pathname.slice(basePath.length).split("/").filter(Boolean);
    if (path.length !== 2) return new Response("Not Found", {status: 404});
    const account = ctx.exports.CodexAccount.get(ctx.exports.CodexAccount.idFromString(path[0]));
    if (path[1] === "start") {
      const device = await account.start(url.searchParams.get("nonce") ?? "");
      return new Response(`<!doctype html><title>Connect OpenAI Codex</title><p>Open <a href="${VERIFY_URL}" target="_blank" rel="noreferrer">${VERIFY_URL}</a> and enter:</p><h1>${device.userCode}</h1><p id="s">Waiting for approval…</p><script>setInterval(async()=>{let u=new URL(location.href);u.pathname=u.pathname.replace('/start','/poll');let r=await fetch(u);let j=await r.json();document.querySelector('#s').textContent=j.message;if(j.done)window.close()},${Math.max(1000, device.interval * 1000)})</script>`, {headers:{"content-type":"text/html;charset=utf-8","referrer-policy":"no-referrer"}});
    }
    if (path[1] === "poll") return Response.json(await account.poll(url.searchParams.get("nonce") ?? ""));
    return new Response("Not Found", {status: 404});
  },
};

export class GatekeeperVendor extends WorkerEntrypoint<Env> implements GatekeeperVendorInterface {
  status() { return "OpenAI Codex Gatekeeper"; }
  async describe(): Promise<VendorDescription> { return {displayName:"OpenAI Codex", url:"https://openai.com/codex/", tagline:"Use your ChatGPT Codex account", description:"Connect a ChatGPT account with the Codex device authorization flow."}; }
  async connectAccount(callback: Fetcher<GatekeeperConnectCallback>, _options?: GatekeeperConnectOptions): Promise<{url:string}> {
    const id = this.ctx.exports.CodexAccount.newUniqueId();
    const account = this.ctx.exports.CodexAccount.get(id);
    const token = nonce();
    await account.prepare(callback, token);
    const baseUrl = this.env.BASE_URL ?? "http://localhost:8787/gatekeeper/openai-codex";
    return {url: `${baseUrl}/${id.toString()}/start?nonce=${token}`};
  }
  async getSupportedResources(): Promise<SupportedResource[]> { return [{urlPattern:"https://chatgpt.com/*", title:"OpenAI Codex", description:"Use a connected Codex model."}]; }
  async getTypeScriptTypes(): Promise<string> { return ""; }
}

export class CodexAccount extends DurableObject<Env> {
  #refresh?: Promise<string>;
  async prepare(callback: Fetcher<GatekeeperConnectCallback>, token: string) { await this.ctx.storage.put({callback, nonce: token, nonceExpires: Date.now() + LIFETIME}); this.ctx.storage.setAlarm(Date.now()+LIFETIME); }
  async prepareReconnect(token: string) { await this.ctx.storage.put({nonce: token, nonceExpires: Date.now() + LIFETIME, reconnecting: true}); this.ctx.storage.setAlarm(Date.now()+LIFETIME); }
  async start(token: string): Promise<DeviceCode> {
    if (token !== await this.ctx.storage.get<string>("nonce") || Date.now() >= (await this.ctx.storage.get<number>("nonceExpires") ?? 0)) throw new Error("Invalid login link.");
    const r = await fetch(USER_CODE_URL, {method:"POST", headers:{"content-type":"application/json"}, body:JSON.stringify({client_id:CLIENT_ID}), signal:requestSignal()});
    if (!r.ok) throw new Error("OpenAI Codex device authorization could not start.");
    const j = await r.json() as {device_auth_id:string,user_code:string,interval:number|string};
    const interval = Number(j.interval);
    if (!j.device_auth_id || !j.user_code || !Number.isFinite(interval) || interval < 1) {
      throw new Error("OpenAI Codex returned an invalid device code.");
    }
    const d: DeviceCode = {id:j.device_auth_id,userCode:j.user_code,interval,expires:Date.now()+LIFETIME};
    await this.ctx.storage.put("device", d); return d;
  }
  async poll(token: string): Promise<{done:boolean,message:string}> {
    if (token !== await this.ctx.storage.get<string>("nonce") || Date.now() >= (await this.ctx.storage.get<number>("nonceExpires") ?? 0)) throw new Error("Invalid login link.");
    const d = await this.ctx.storage.get<DeviceCode>("device"); if (!d || d.expires < Date.now()) return {done:false,message:"This login expired. Start again."};
    const r = await fetch(DEVICE_TOKEN_URL,{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({device_auth_id:d.id,user_code:d.userCode}),signal:requestSignal()});
    if (r.status === 403 || r.status === 404) return {done:false,message:"Waiting for approval…"};
    if (!r.ok) return {done:false,message:"Authorization failed. Start again."};
    const j = await r.json() as {authorization_code:string,code_verifier:string};
    const t = await fetch(OAUTH_TOKEN_URL,{method:"POST",headers:{"content-type":"application/x-www-form-urlencoded"},body:new URLSearchParams({grant_type:"authorization_code",client_id:CLIENT_ID,code:j.authorization_code,code_verifier:j.code_verifier,redirect_uri:"https://auth.openai.com/deviceauth/callback"}),signal:requestSignal()});
    if (!t.ok) throw new Error("OpenAI Codex authorization could not complete.");
    const v = await t.json() as {access_token:string,refresh_token:string,id_token?:string,expires_in:number};
    await this.ctx.storage.put("tokens", {access:v.access_token,refresh:v.refresh_token,id:typeof v.id_token === "string" ? v.id_token : null,expires:Date.now()+v.expires_in*1000} satisfies Tokens);
    const callback = await this.ctx.storage.get<Fetcher<GatekeeperConnectCallback>>("callback");
    if (!callback) throw new Error("This login expired.");
    if (await this.ctx.storage.get<boolean>("reconnecting")) {
      await this.ctx.storage.delete("reconnecting");
      await callback.credentialsRestored();
    } else {
      await callback.complete(this.ctx.exports.CodexGatekeeperUser({props:{accountObjectId:this.ctx.id.toString()}}));
    }
    await this.ctx.storage.delete(["nonce", "nonceExpires", "device"]);
    return {done:true,message:"Connected. You can close this window."};
  }
  async getAccessToken(): Promise<string> { const t=await this.ctx.storage.get<Tokens>("tokens"); if (!t) throw new Error("Codex account is not connected."); if (t.expires > Date.now() + MINIMUM_TOKEN_VALIDITY) return t.access; return this.#refresh ??= this.#refreshAccessToken(t).finally(() => { this.#refresh = undefined; }); }
  async getTokens(): Promise<Tokens> { await this.getAccessToken(); const tokens = await this.ctx.storage.get<Tokens>("tokens"); if (!tokens) throw new Error("Codex account is not connected."); return tokens; }
  async #refreshAccessToken(t: Tokens): Promise<string> { const r=await fetch(OAUTH_TOKEN_URL,{method:"POST",headers:{"content-type":"application/x-www-form-urlencoded"},body:new URLSearchParams({grant_type:"refresh_token",refresh_token:t.refresh,client_id:CLIENT_ID}),signal:requestSignal()}); if(!r.ok) throw new Error("Codex credentials expired. Reconnect the account."); const v=await r.json() as {access_token:string,refresh_token:string,id_token?:string,expires_in:number}; const fresh={access:v.access_token,refresh:v.refresh_token,id:typeof v.id_token === "string" ? v.id_token : t.id,expires:Date.now()+v.expires_in*1000}; return await this.ctx.storage.transaction(async txn => { const current=await txn.get<Tokens>("tokens"); if(!current) throw new Error("Codex account is not connected."); if(tokensChanged(current,t)) return current.access; await txn.put("tokens",fresh); return fresh.access; }); }
  async alarm(){ await this.ctx.storage.delete(["nonce", "nonceExpires", "device", "reconnecting"]); }
  async revoke(){ await this.ctx.storage.deleteAll(); }
}

export class CodexGatekeeperUser extends WorkerEntrypoint<Env, Props>
    implements GatekeeperUser, ModelAuthAccount {
  #account() { return this.ctx.exports.CodexAccount.get(this.ctx.exports.CodexAccount.idFromString(this.ctx.props.accountObjectId)); }
  async describe(): Promise<AccountDescription> {
    const account = this.#account();
    const tokens = await account.getTokens();
    const identity = getChatGptIdentity(tokens.access, tokens.id);
    return {displayName: accountLabel(identity), uniqueName: identity.accountId ?? this.ctx.props.accountObjectId, avatar:{url:"https://openai.com/favicon.ico"}};
  }
  async getAccessToken(): Promise<string> { return this.#account().getAccessToken(); }
  async getModelAuth(): Promise<ModelAuth> { return {apiKey: await this.getAccessToken()}; }
  async getSupportedResources(): Promise<SupportedResource[]> { return []; }
  async getGatekeeperClassFor(_url:string): Promise<{class:DurableObjectClass<Gatekeeper<any>>,resource:SupportedResource}> { throw new Error("Codex accounts do not provide resources."); }
  async startResourceConfigurator(_resource:string): Promise<ResourceConfiguratorFrame> { throw new Error("Codex accounts do not provide resources."); }
  async revoke(): Promise<void> { await this.#account().revoke(); }
  async reconnect(): Promise<{url:string}> {
    const token = nonce();
    await this.#account().prepareReconnect(token);
    const baseUrl = this.env.BASE_URL ?? "http://localhost:8787/gatekeeper/openai-codex";
    return {url: `${baseUrl}/${this.ctx.props.accountObjectId}/start?nonce=${token}`};
  }
  async getAuthenticatedEmail(): Promise<string|null> { const tokens = await this.#account().getTokens(); return getChatGptIdentity(tokens.access, tokens.id).email; }
  async getVerifier(): Promise<Fetcher<GatekeeperUserVerifier>> { throw new Error("Codex accounts cannot verify access."); }
  async ensureResources(_resources:string[]): Promise<{url?:string}> { return {}; }
}
