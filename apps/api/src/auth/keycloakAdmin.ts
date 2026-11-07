import { env } from "../config/env.js";
import { AppError, conflict } from "../lib/errors.js";

type KeycloakUser = {
  id: string;
  username: string;
  email?: string;
};

function unavailable(message: string, cause?: unknown) {
  return new AppError(503, "UPSTREAM_UNAVAILABLE", message, { cause, expose: true });
}

function configuration() {
  if (!env.OIDC_ISSUER_URL || !env.OIDC_CLIENT_ID || !env.KEYCLOAK_ADMIN_CLIENT_ID || !env.KEYCLOAK_ADMIN_CLIENT_SECRET) {
    throw unavailable("Automatic account activation is not configured. Set the Keycloak admin service-account client ID and secret in the API environment.");
  }
  const issuer = new URL(env.OIDC_ISSUER_URL);
  const match = issuer.pathname.match(/\/realms\/([^/]+)\/?$/);
  if (!match) throw unavailable("OIDC_ISSUER_URL must include /realms/<realm> for account provisioning.");
  const realm = decodeURIComponent(match[1]!);
  const base = `${issuer.origin}/admin/realms/${encodeURIComponent(realm)}`;
  return { issuer: issuer.toString().replace(/\/$/, ""), base };
}

async function adminAccessToken(issuer: string) {
  const response = await fetch(`${issuer}/protocol/openid-connect/token`, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "client_credentials",
      client_id: env.KEYCLOAK_ADMIN_CLIENT_ID!,
      client_secret: env.KEYCLOAK_ADMIN_CLIENT_SECRET!,
    }),
    signal: AbortSignal.timeout(10_000),
  }).catch((error) => { throw unavailable("Could not reach Keycloak to provision the account.", error); });
  if (!response.ok) throw unavailable("Keycloak rejected the provisioning service account. Check its client credentials and realm-management roles.");
  const body = await response.json() as { access_token?: string };
  if (!body.access_token) throw unavailable("Keycloak returned no service-account token.");
  return body.access_token;
}

/** Creates or reuses the exact matching Keycloak identity and emails a one-time password-setup link. */
export async function provisionKeycloakUserAndSendActivation(input: {
  username: string;
  email: string;
  firstName: string;
  lastName: string;
}) {
  const { issuer, base } = configuration();
  const token = await adminAccessToken(issuer);
  const headers = { authorization: `Bearer ${token}`, "content-type": "application/json" };
  const searchUrl = new URL(`${base}/users`);
  searchUrl.searchParams.set("email", input.email);
  searchUrl.searchParams.set("exact", "true");
  const search = await fetch(searchUrl, { headers, signal: AbortSignal.timeout(10_000) })
    .catch((error) => { throw unavailable("Could not look up the Keycloak account.", error); });
  if (!search.ok) throw unavailable("Keycloak could not look up the employee account. Check service-account permissions.");
  const matches = await search.json() as KeycloakUser[];
  let user = matches.find((candidate) => candidate.email?.toLowerCase() === input.email.toLowerCase());

  if (user && user.username.toLowerCase() !== input.username.toLowerCase()) {
    throw conflict("A Keycloak account already uses this email with a different username. Ask the Keycloak administrator to review it before inviting.");
  }

  if (!user) {
    const create = await fetch(`${base}/users`, {
      method: "POST",
      headers,
      body: JSON.stringify({
        username: input.username,
        email: input.email,
        firstName: input.firstName,
        lastName: input.lastName,
        enabled: true,
        emailVerified: false,
        requiredActions: ["VERIFY_EMAIL", "UPDATE_PASSWORD"],
      }),
      signal: AbortSignal.timeout(10_000),
    }).catch((error) => { throw unavailable("Could not create the employee's Keycloak account.", error); });
    if (create.status !== 201) {
      if (create.status === 409) throw conflict("A Keycloak account already exists for this employee. Retry the activation email after confirming the username and email match.");
      throw unavailable("Keycloak could not create the employee account. Check the service-account manage-users permission.");
    }
    const location = create.headers.get("location");
    const userId = location?.split("/").filter(Boolean).pop();
    if (!userId) throw unavailable("Keycloak created the account but did not return its account ID.");
    user = { id: userId, username: input.username, email: input.email };
  }

  const actionUrl = new URL(`${base}/users/${encodeURIComponent(user.id)}/execute-actions-email`);
  actionUrl.searchParams.set("lifespan", String(7 * 24 * 60 * 60));
  const emailResult = await fetch(actionUrl, {
    method: "PUT",
    headers,
    body: JSON.stringify(["VERIFY_EMAIL", "UPDATE_PASSWORD"]),
    signal: AbortSignal.timeout(10_000),
  }).catch((error) => { throw unavailable("Keycloak account exists, but sending the activation email failed. Check Keycloak SMTP settings and retry the invite.", error); });
  if (!emailResult.ok) throw unavailable("Keycloak account exists, but could not send its activation email. Configure Keycloak SMTP and retry the invite.");
  return { username: user.username, email: input.email };
}
