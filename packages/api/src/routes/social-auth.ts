import formbody from "@fastify/formbody";
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { buildAppleAuthUrl, exchangeAppleCode, verifyAppleIdToken } from "../auth/apple.js";
import {
  buildNaverAuthUrl,
  exchangeNaverCode,
  fetchNaverProfile,
  isNaverVerifiedEmail,
} from "../auth/naver.js";
import type { SocialIdentity, SocialProviderId } from "../auth/social-identity.js";
import { completeSocialLogin } from "../auth/social-login.js";
import { signToken, verifyToken } from "../auth.js";
import { appleLoginEnabled, naverLoginEnabled } from "../config.js";

export interface SocialAuthProvider {
  id: SocialProviderId;
  gate: () => boolean;
  buildAuthUrl: (state: string) => string;
  /** Apple mandates response_mode=form_post for scoped requests → POST callback. */
  callbackMethod: "GET" | "POST";
  resolveIdentity: (params: { code: string; state: string }) => Promise<SocialIdentity | null>;
}

export const appleAuthProvider: SocialAuthProvider = {
  id: "apple",
  gate: appleLoginEnabled,
  buildAuthUrl: buildAppleAuthUrl,
  callbackMethod: "POST",
  resolveIdentity: async ({ code }) => {
    const idToken = await exchangeAppleCode(code);
    if (!idToken) return null;
    const claims = await verifyAppleIdToken(idToken);
    if (!claims) return null;
    return {
      provider: "apple",
      subject: claims.sub,
      email: claims.email,
      emailVerified: claims.emailVerified,
    };
  },
};

export const naverAuthProvider: SocialAuthProvider = {
  id: "naver",
  gate: naverLoginEnabled,
  buildAuthUrl: buildNaverAuthUrl,
  callbackMethod: "GET",
  resolveIdentity: async ({ code, state }) => {
    const accessToken = await exchangeNaverCode(code, state);
    if (!accessToken) return null;
    const profile = await fetchNaverProfile(accessToken);
    if (!profile) return null;
    return {
      provider: "naver",
      subject: profile.id,
      email: profile.email,
      emailVerified: isNaverVerifiedEmail(profile.email),
      name: profile.name,
    };
  },
};

/**
 * Login + callback for one social provider, mounted per provider in index.ts
 * (/api/auth/apple, /api/auth/naver). The provider's OFF-by-default flag
 * cloaks every route as Fastify's default 404 while dark — same doctrine and
 * byte-for-byte body as routes/imap-connect.ts, so a scanner cannot tell a
 * dark provider from a route that doesn't exist.
 */
// Only the GET (Naver) callback reads request.query — the POST (Apple)
// callback reads request.body instead (see handleCallback below), so this
// schema is attached to the GET registration only.
// OAuth authorization codes routinely exceed 500 chars (Azure AD ~800), so the
// callback params get 2048 instead of the blanket 500 used elsewhere.
const socialCallbackQuerySchema = {
  type: "object",
  additionalProperties: false,
  properties: {
    code: { type: "string", maxLength: 2048 },
    state: { type: "string", maxLength: 2048 },
    error: { type: "string", maxLength: 2048 },
  },
} as const;

export function socialAuthRoutes(
  provider: SocialAuthProvider,
): (app: FastifyInstance) => Promise<void> {
  return async function routes(app: FastifyInstance) {
    app.addHook("onRequest", async (request, reply) => {
      if (!provider.gate()) {
        const { url, method } = request.raw;
        reply.code(404);
        return reply.send({
          message: `Route ${method}:${url} not found`,
          error: "Not Found",
          statusCode: 404,
        });
      }
    });
    if (provider.callbackMethod === "POST") {
      // Apple posts the callback as application/x-www-form-urlencoded.
      // Registered inside this encapsulated plugin so the parser exists only
      // for this provider's scope, not app-wide.
      await app.register(formbody);
    }

    // GET /login — mint the short-lived signed state and bounce to consent.
    // Same state shape as the Google flow: marker in the email field, 10 min.
    app.get(
      "/login",
      { config: { rateLimit: { max: 20, timeWindow: "15 minutes" } } },
      async (_request, reply) => {
        const state = signToken({ userId: "__login__", email: `__${provider.id}_login__` }, "10m");
        return reply.redirect(provider.buildAuthUrl(state));
      },
    );

    const handleCallback = async (request: FastifyRequest, reply: FastifyReply) => {
      const webUrl = process.env.WEB_URL || "http://localhost:8001";
      const params = (provider.callbackMethod === "POST" ? request.body : request.query) as {
        code?: string;
        state?: string;
        error?: string;
      } | null;
      // Consent denied / provider error / missing code: land on the login page
      // with a friendly toast, never a raw JSON error (Google-flow precedent).
      if (!params?.code || !params.state || params.error) {
        return reply.redirect(`${webUrl}/login?error=${provider.id}_denied`);
      }
      let statePayload: { userId: string; email: string };
      try {
        statePayload = verifyToken(params.state);
      } catch {
        return reply.redirect(`${webUrl}/login?error=${provider.id}_failed`);
      }
      // Both halves of the state must match: the provider marker AND the
      // "__login__" placeholder userId. Checking the marker alone would let
      // any signed JWT whose email happens to equal the marker (registration
      // does not enforce email format) stand in as a state (security review
      // 2026-08-06); the Google branch predates this check and keeps its own
      // shape untouched.
      if (
        statePayload.email !== `__${provider.id}_login__` ||
        statePayload.userId !== "__login__"
      ) {
        return reply.redirect(`${webUrl}/login?error=${provider.id}_failed`);
      }

      const ip =
        (request.headers["x-forwarded-for"] as string)?.split(",")[0]?.trim() || request.ip;
      const userAgent = (request.headers["user-agent"] as string) || "";
      // One net for the whole tail — resolveIdentity (Apple's client-secret
      // signing throws if the key env is broken) AND the DB writes inside
      // completeSocialLogin (withDbRetry re-throws once its budget is spent).
      // A browser navigation must land back on /login with a retryable toast,
      // never Fastify's raw JSON 500 — same degradation as the Google callback.
      try {
        const identity = await provider.resolveIdentity({
          code: params.code,
          state: params.state,
        });
        if (!identity) {
          return reply.redirect(`${webUrl}/login?error=${provider.id}_failed`);
        }
        const { redirect } = await completeSocialLogin(identity, { ip, userAgent });
        return reply.redirect(redirect);
      } catch (err) {
        console.error(`[SOCIAL] ${provider.id} login completion failed:`, err);
        return reply.redirect(`${webUrl}/login?error=${provider.id}_failed`);
      }
    };

    // Same ceiling as /login: every callback costs a provider token-exchange
    // round trip, so it must not ride the looser app-wide default limiter.
    const callbackOpts = { config: { rateLimit: { max: 20, timeWindow: "15 minutes" } } };
    if (provider.callbackMethod === "POST") {
      // Apple's callback reads request.body (form_post), never request.query,
      // so no querystring schema is attached here — see rule 6 in the
      // querystring-schemas hardening audit for why this route is exempt.
      app.post("/callback", callbackOpts, handleCallback);
    } else {
      app.get(
        "/callback",
        { ...callbackOpts, schema: { querystring: socialCallbackQuerySchema } },
        handleCallback,
      );
    }
  };
}
