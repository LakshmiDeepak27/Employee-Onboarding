import "../src/config/env.js";
import { describe, it, expect, vi, beforeEach, beforeAll } from "vitest";
import request from "supertest";
import crypto from "node:crypto";
import { generateKeyPair, exportJWK, SignJWT } from "jose";
import { createApp } from "../src/app.js";
import { prisma } from "../src/db/client.js";
import { env } from "../src/config/env.js";
import * as authService from "../src/auth/service.js";

describe("Keycloak OIDC Authentication & Security Controls", () => {
  const app = createApp();

  beforeAll(async () => {
    // Warm up the database connection
    try {
      await prisma.$queryRaw`SELECT 1`;
    } catch {
      // retry once
      await prisma.$queryRaw`SELECT 1`;
    }
  });

  beforeEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  describe("OIDC Authorization Flow & PKCE (GET /api/v1/auth/oidc/start)", () => {
    it("redirects to Keycloak authorization endpoint with PKCE challenge, state, and nonce", async () => {
      // Mock OIDC discovery fetch
      const mockDiscovery = {
        authorization_endpoint: "https://keycloak.example.com/auth",
        token_endpoint: "https://keycloak.example.com/token",
        jwks_uri: "https://keycloak.example.com/jwks",
        issuer: env.OIDC_ISSUER_URL || "https://keycloak.example.com/realms/employee-onboarding",
      };

      vi.stubGlobal(
        "fetch",
        vi.fn().mockResolvedValue({
          ok: true,
          json: async () => mockDiscovery,
        }),
      );

      const res = await request(app).get("/api/v1/auth/oidc/start");

      expect(res.status).toBe(302);
      const redirectUrl = new URL(res.header.location);
      expect(redirectUrl.origin).toBe("https://keycloak.example.com");
      expect(redirectUrl.pathname).toBe("/auth");
      expect(redirectUrl.searchParams.get("response_type")).toBe("code");
      expect(redirectUrl.searchParams.get("code_challenge_method")).toBe("S256");
      expect(redirectUrl.searchParams.get("code_challenge")).toBeDefined();
      expect(redirectUrl.searchParams.get("state")).toBeDefined();
      expect(redirectUrl.searchParams.get("nonce")).toBeDefined();

      // Verify cookie
      const cookies = res.header["set-cookie"];
      expect(cookies).toBeDefined();
      const stateCookie = cookies.find((c: string) => c.startsWith("eo_oidc_state="));
      expect(stateCookie).toBeDefined();
      expect(stateCookie).toContain("HttpOnly");
      expect(stateCookie).toContain("SameSite=Lax");
    });
  });

  describe("OIDC Callback Handling (GET /api/v1/auth/oidc/callback)", () => {
    it("handles Keycloak error response by redirecting to login with error message", async () => {
      const res = await request(app)
        .get("/api/v1/auth/oidc/callback?error=access_denied&error_description=User%20denied%20consent")
        .set("Accept", "text/html");

      expect(res.status).toBe(302);
      expect(res.header.location).toContain("/login?error=User%20denied%20consent");
    });

    it("rejects callback if state cookie is missing or expired", async () => {
      const res = await request(app)
        .get("/api/v1/auth/oidc/callback?code=some-code&state=some-state")
        .set("Accept", "text/html");

      expect(res.status).toBe(302);
      expect(res.header.location).toContain("/login?error=");
    });

    it("rejects callback if state parameter does not match stored cookie", async () => {
      const storedState = JSON.stringify({
        state: "expected-state",
        nonce: "test-nonce",
        verifier: "test-verifier",
      });

      const res = await request(app)
        .get("/api/v1/auth/oidc/callback?code=some-code&state=tampered-state")
        .set("Cookie", [`eo_oidc_state=${encodeURIComponent(storedState)}`])
        .set("Accept", "text/html");

      expect(res.status).toBe(302);
      expect(res.header.location).toContain("/login?error=");
    });

    it("rejects unverified email addresses from identity provider", async () => {
      // Generate ephemeral RSA keys for signing ID tokens
      const { privateKey, publicKey } = await generateKeyPair("RS256");
      const jwk = await exportJWK(publicKey);
      jwk.kid = "test-key-id";
      jwk.alg = "RS256";
      jwk.use = "sig";

      const issuer = env.OIDC_ISSUER_URL || "https://keycloak.example.com/realms/employee-onboarding";
      const clientId = env.OIDC_CLIENT_ID || "employee-onboarding-app";
      const nonce = "secure-nonce-123";

      // Create an unverified ID token
      const idToken = await new SignJWT({
        email: "unverified@demo.io",
        email_verified: false,
        sub: "keycloak-sub-unverified",
        nonce,
      })
        .setProtectedHeader({ alg: "RS256", kid: "test-key-id" })
        .setIssuer(issuer)
        .setAudience(clientId)
        .setExpirationTime("1h")
        .sign(privateKey);

      vi.stubGlobal(
        "fetch",
        vi.fn().mockImplementation(async (url: string | URL | Request) => {
          const urlStr = typeof url === "string" ? url : url.toString();
          if (urlStr.includes(".well-known/openid-configuration")) {
            return new Response(
              JSON.stringify({
                authorization_endpoint: "https://keycloak.example.com/auth",
                token_endpoint: "https://keycloak.example.com/token",
                jwks_uri: "https://keycloak.example.com/jwks",
                issuer,
              }),
              { status: 200, headers: { "content-type": "application/json" } },
            );
          }
          if (urlStr.includes("/token")) {
            return new Response(
              JSON.stringify({ id_token: idToken, access_token: "mock-token" }),
              { status: 200, headers: { "content-type": "application/json" } },
            );
          }
          if (urlStr.includes("/jwks")) {
            return new Response(
              JSON.stringify({ keys: [jwk] }),
              { status: 200, headers: { "content-type": "application/json" } },
            );
          }
          return new Response("Not found", { status: 404 });
        }),
      );

      const stored = JSON.stringify({
        state: "valid-state",
        nonce,
        verifier: "test-code-verifier",
      });

      const res = await request(app)
        .get("/api/v1/auth/oidc/callback?code=authz-code&state=valid-state")
        .set("Cookie", [`eo_oidc_state=${encodeURIComponent(stored)}`])
        .set("Accept", "text/html");

      expect(res.status).toBe(302);
      expect(res.header.location).toContain("not%20verified");
    });
  });

  describe("Identity Linking & Role Integrity (auth.loginWithOidc)", () => {
    it("rejects unprovisioned users whose email is not registered in the application", async () => {
      await expect(
        authService.loginWithOidc(
          "unprovisioned-sub-123",
          "stranger-not-in-db@example.invalid",
          { ipAddress: "127.0.0.1" },
        ),
      ).rejects.toThrow(/provisioned/i);
    });

    it("rejects conflicting identity mappings when subject is linked to another user", async () => {
      const userA = await prisma.user.create({
        data: {
          email: `usera-${Date.now()}@example.invalid`,
          status: "ACTIVE",
          oidcSubject: `sub-assigned-to-a-${Date.now()}`,
        },
      });
      const userB = await prisma.user.create({
        data: {
          email: `userb-${Date.now()}@example.invalid`,
          status: "ACTIVE",
        },
      });

      try {
        // Attempting to log in as userB with userA's subject must be rejected
        await expect(
          authService.loginWithOidc(
            userA.oidcSubject!,
            userB.email,
            { ipAddress: "127.0.0.1" },
          ),
        ).rejects.toThrow(/conflicts/i);
      } finally {
        await prisma.user.delete({ where: { id: userA.id } });
        await prisma.user.delete({ where: { id: userB.id } });
      }
    });

    it("preserves database-defined roles upon OIDC sign-in without escalating from claims or emails", async () => {
      const hrUser = await prisma.user.findUnique({
        where: { email: "asha.hr@clyora" },
        include: { userRoles: { include: { role: true } } },
      });

      expect(hrUser).toBeDefined();
      if (hrUser) {
        if (hrUser.oidcSubject) {
          await prisma.user.update({
            where: { id: hrUser.id },
            data: { oidcSubject: null },
          });
        }
        const testSub = `keycloak-hr-uuid-${Date.now()}`;
        const session = await authService.loginWithOidc(
          testSub,
          "asha.hr@clyora",
          { ipAddress: "127.0.0.1" },
        );

        expect(session.user.email).toBe("asha.hr@clyora");
        expect(session.user.roles).toContain("hr_admin");
        expect(session.user.roles).not.toContain("superadmin");

        // Verify the provider subject was persisted safely
        const updated = await prisma.user.findUnique({
          where: { id: hrUser.id },
          select: { oidcSubject: true, authProvider: true },
        });
        expect(updated?.oidcSubject).toBe(testSub);
        expect(updated?.authProvider).toBe("oidc");

        // Reset oidcSubject to avoid interfering with subsequent runs
        await prisma.user.update({
          where: { id: hrUser.id },
          data: { oidcSubject: null, authProvider: "local" },
        });
      }
    });
  });

  describe("Production vs Development Access Rules", () => {
    it("disables self-service public signup with HTTP 403 Forbidden", async () => {
      const res = await request(app)
        .post("/api/v1/auth/signup")
        .send({
          email: "someone@demo.io",
          password: "Onboard!ng2026",
          fullName: "Test User",
        });

      expect(res.status).toBe(403);
      expect(res.body.error.code).toBe("FORBIDDEN");
      expect(res.body.error.message).toContain("Self-service signup is disabled");
    });
  });

  describe("Invitation Acceptance (POST /api/v1/auth/accept-invite)", () => {
    it("activates an invited account with hashed, expiring single-use token and rejects reuse", async () => {
      const testEmail = `invite-test-${Date.now()}@example.invalid`;
      const rawToken = crypto.randomBytes(24).toString("base64url");
      const tokenHash = crypto.createHash("sha256").update(rawToken).digest("hex");
      const expiresAt = new Date(Date.now() + 24 * 3600 * 1000);

      const empRole = await prisma.role.findUnique({ where: { key: "employee" } });

      const invitedUser = await prisma.user.create({
        data: {
          email: testEmail,
          passwordHash: null,
          status: "INVITED",
          mustChangePassword: true,
          inviteTokenHash: tokenHash,
          inviteExpiresAt: expiresAt,
          userRoles: empRole ? { create: [{ roleId: empRole.id }] } : undefined,
        },
      });

      try {
        // 1. First acceptance with valid token
        const acceptRes = await request(app)
          .post("/api/v1/auth/accept-invite")
          .send({
            token: rawToken,
            newPassword: "ValidPassword123!",
          });

        expect(acceptRes.status).toBe(200);
        expect(acceptRes.body.user.email).toBe(testEmail);
        expect(acceptRes.body.user.status).toBe("ACTIVE");
        expect(acceptRes.body.user.roles).toContain("employee");

        // Verify token hash is cleared (single-use)
        const afterUser = await prisma.user.findUnique({
          where: { id: invitedUser.id },
          select: { inviteTokenHash: true, inviteExpiresAt: true, status: true },
        });
        expect(afterUser?.inviteTokenHash).toBeNull();
        expect(afterUser?.inviteExpiresAt).toBeNull();
        expect(afterUser?.status).toBe("ACTIVE");

        // 2. Reuse of the same token must be rejected
        const reuseRes = await request(app)
          .post("/api/v1/auth/accept-invite")
          .send({
            token: rawToken,
            newPassword: "AnotherPassword123!",
          });

        expect(reuseRes.status).toBe(401);
        expect(reuseRes.body.error.message).toContain("invalid or expired");
      } finally {
        // Cleanup
        await prisma.userRole.deleteMany({ where: { userId: invitedUser.id } });
        await prisma.refreshToken.deleteMany({ where: { userId: invitedUser.id } });
        await prisma.user.delete({ where: { id: invitedUser.id } });
      }
    });

    it("rejects expired invitations", async () => {
      const rawToken = crypto.randomBytes(24).toString("base64url");
      const tokenHash = crypto.createHash("sha256").update(rawToken).digest("hex");
      const expiredDate = new Date(Date.now() - 1000); // 1s in the past

      const expiredUser = await prisma.user.create({
        data: {
          email: `expired-${Date.now()}@example.invalid`,
          passwordHash: null,
          status: "INVITED",
          inviteTokenHash: tokenHash,
          inviteExpiresAt: expiredDate,
        },
      });

      try {
        const res = await request(app)
          .post("/api/v1/auth/accept-invite")
          .send({
            token: rawToken,
            newPassword: "ValidPassword123!",
          });

        expect(res.status).toBe(401);
        expect(res.body.error.message).toContain("invalid or expired");
      } finally {
        // Cleanup
        await prisma.user.delete({ where: { id: expiredUser.id } });
      }
    });
  });
});
