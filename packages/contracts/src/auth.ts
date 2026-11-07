import {
  z,
  Uuid,
  Email,
  Password,
  IsoDateTime,
  UserStatusEnum,
  RoleKeyEnum,
  PermissionScopeEnum,
} from "./common.js";
// JWT claims
//
// The access token carries IDENTITY ONLY — subject, roles and a token version.
// It deliberately does NOT carry permissions or scopes: those are resolved
// server-side on every request against the database, so a revoked grant takes
// effect immediately rather than when the token expires.

export const AccessTokenClaimsSchema = z
  .object({
    sub: Uuid.openapi({ description: "User id" }),
    email: Email,
    /** Employee record id, when the user is linked to one. */
    eid: Uuid.nullable(),
    roles: z.array(RoleKeyEnum),
    /** Must equal users.token_version or the token is rejected. */
    tv: z.number().int(),
    typ: z.literal("access"),
    iss: z.string(),
    aud: z.string(),
    iat: z.number().int(),
    exp: z.number().int(),
    jti: Uuid,
  })
  .openapi("AccessTokenClaims");

export const RefreshTokenClaimsSchema = z
  .object({
    sub: Uuid,
    /** Rotation chain id. Reuse of a rotated token revokes the whole family. */
    fam: Uuid,
    typ: z.literal("refresh"),
    iss: z.string(),
    aud: z.string(),
    iat: z.number().int(),
    exp: z.number().int(),
    jti: Uuid,
  })
  .openapi("RefreshTokenClaims");

export type AccessTokenClaims = z.infer<typeof AccessTokenClaimsSchema>;
export type RefreshTokenClaims = z.infer<typeof RefreshTokenClaimsSchema>;
// Effective permission — what the RBAC middleware resolves per request

export const EffectivePermissionSchema = z
  .object({
    key: z.string().openapi({ example: "plan.read" }),
    resource: z.string().openapi({ example: "plan" }),
    action: z.string().openapi({ example: "read" }),
    /** Widest scope the user holds for this permission across all their roles. */
    scope: PermissionScopeEnum,
  })
  .openapi("EffectivePermission");
// POST /api/v1/auth/signup

export const SignupRequestSchema = z
  .object({
    fullName: z.string().min(1, "full name is required").max(120),
    company: z.string().optional(),
    // Signup uses the training environment's documented @clyora identities;
    // the generic Email schema correctly rejects this non-public TLD.
    email: z
      .string()
      .trim()
      .toLowerCase()
      .regex(
        /^[a-z0-9][a-z0-9._-]*@clyora$/,
        "Use username.hr@clyora, username.manager@clyora, or username@clyora",
      ),
    password: z
      .string()
      .min(6, "password must be at least 6 characters")
      .max(128),
    role: RoleKeyEnum.optional().default("hr_admin"),
  })
  .openapi("SignupRequest");

export type SignupRequest = z.infer<typeof SignupRequestSchema>;
// POST /api/v1/auth/login

export const LoginRequestSchema = z
  .object({
    email: Email,
    password: z.string().min(1, "password is required").max(128),
  })
  .openapi("LoginRequest");

export const AuthUserSchema = z
  .object({
    id: Uuid,
    email: Email,
    status: UserStatusEnum,
    mustChangePassword: z.boolean(),
    employeeId: Uuid.nullable(),
    firstName: z.string().nullable(),
    lastName: z.string().nullable(),
    roles: z.array(RoleKeyEnum),
    permissions: z.array(EffectivePermissionSchema),
  })
  .openapi("AuthUser");

export const LoginResponseSchema = z
  .object({
    accessToken: z.string().openapi({ example: "eyJhbGciOiJIUzI1NiIs..." }),
    /**
     * Also set as an httpOnly, SameSite=Strict cookie named `eo_refresh`.
     * Returned in the body too so non-browser clients and the Swagger UI work.
     */
    refreshToken: z.string(),
    tokenType: z.literal("Bearer"),
    expiresIn: z
      .number()
      .int()
      .openapi({ example: 900, description: "Access token TTL, seconds" }),
    user: AuthUserSchema,
  })
  .openapi("LoginResponse");
// POST /api/v1/auth/refresh

export const RefreshRequestSchema = z
  .object({
    /** Omit to use the httpOnly `eo_refresh` cookie instead. */
    refreshToken: z.string().optional(),
  })
  .openapi("RefreshRequest");

export const RefreshResponseSchema = z
  .object({
    accessToken: z.string(),
    refreshToken: z.string(),
    tokenType: z.literal("Bearer"),
    expiresIn: z.number().int(),
  })
  .openapi("RefreshResponse");
// POST /api/v1/auth/logout

export const LogoutRequestSchema = z
  .object({
    /** true revokes every refresh token for the user, not just this device. */
    allDevices: z.boolean().default(false),
  })
  .openapi("LogoutRequest");

export const MessageResponseSchema = z
  .object({ message: z.string().openapi({ example: "Logged out" }) })
  .openapi("MessageResponse");
// POST /api/v1/auth/change-password

export const ChangePasswordRequestSchema = z
  .object({
    currentPassword: z.string().min(1).max(128),
    newPassword: Password,
  })
  .refine((v) => v.currentPassword !== v.newPassword, {
    message: "new password must differ from the current password",
    path: ["newPassword"],
  })
  .openapi("ChangePasswordRequest");
// POST /api/v1/auth/accept-invite  (new hire activating their portal account)

export const AcceptInviteRequestSchema = z
  .object({
    token: z.string().min(16),
    newPassword: Password,
  })
  .openapi("AcceptInviteRequest");
// GET /api/v1/auth/me

export const MeResponseSchema = AuthUserSchema.extend({
  lastLoginAt: IsoDateTime.nullable(),
}).openapi("MeResponse");

export type LoginRequest = z.infer<typeof LoginRequestSchema>;
export type LoginResponse = z.infer<typeof LoginResponseSchema>;
export type AuthUser = z.infer<typeof AuthUserSchema>;
export type EffectivePermission = z.infer<typeof EffectivePermissionSchema>;
