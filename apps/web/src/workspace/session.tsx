import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import { useQueryClient } from "@tanstack/react-query";
import type { AuthUser } from "@eo/contracts";
import { api, restoreSession, setAccessToken } from "../lib/api";

const Context = createContext<{
  user: AuthUser | null;
  loading: boolean;
  signingOut: boolean;
  error: string;
  acceptInvite: (token: string, password: string) => Promise<AuthUser>;
  demoLogin: (email: string) => Promise<AuthUser>;
  signOut: () => Promise<void>;
}>(null!);
export function SessionProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [loading, setLoading] = useState(true);
  const [signingOut, setSigningOut] = useState(false);
  const [error, setError] = useState("");
  const cache = useQueryClient();
  useEffect(() => {
    let mounted = true;
    restoreSession()
      .then((u) => {
        if (mounted) setUser(u);
      })
      .catch((e) => {
        if (mounted) setError(e.message);
      })
      .finally(() => {
        if (mounted) setLoading(false);
      });
    const expired = () => {
      setAccessToken(null);
      setUser(null);
      cache.clear();
    };
    window.addEventListener("session-expired", expired);
    return () => {
      mounted = false;
      window.removeEventListener("session-expired", expired);
    };
  }, [cache]);
  return (
    <Context.Provider
      value={{
        user,
        loading,
        signingOut,
        error,
        acceptInvite: async (token, password) => {
          const result = await api.auth.acceptInvite(token, password);
          cache.clear();
          setAccessToken(result.accessToken);
          setUser(result.user);
          return result.user;
        },
        demoLogin: async (email: string) => {
          const result = await api.auth.demoLogin(email);
          cache.clear();
          setAccessToken(result.accessToken);
          setUser(result.user);
          return result.user;
        },
        signOut: async () => {
          // Start revocation before clearing the token; the request helper reads
          // it synchronously. Clear local state immediately for responsive UI.
          setSigningOut(true);
          const logoutRequest = api.auth.logout();
          setAccessToken(null);
          setUser(null);
          cache.clear();
          try {
            await logoutRequest;
          } catch {
            // Local sign-out still completes if the server cannot be reached.
          } finally {
            setSigningOut(false);
          }
        },
      }}
    >
      {children}
    </Context.Provider>
  );
}
export const useSession = () => useContext(Context);
export const workspaceFor = (user: AuthUser) =>
  user.roles.includes("hr_admin")
    ? "hr"
    : user.roles.includes("it_admin")
      ? "it_admin"
    : user.roles.includes("manager")
      ? "manager"
      : "employee";
export const homeFor = (user: AuthUser) =>
  `/${workspaceFor(user)}/${workspaceFor(user) === "employee" ? "home" : "dashboard"}`;
