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
  error: string;
  signIn: (email: string, password: string) => Promise<AuthUser>;
  acceptInvite: (token: string, password: string) => Promise<AuthUser>;
  signOut: () => Promise<void>;
}>(null!);
export function SessionProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [loading, setLoading] = useState(true);
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
        error,
        signIn: async (email, password) => {
          const result = await api.auth.login({ email, password });
          cache.clear();
          setAccessToken(result.accessToken);
          setUser(result.user);
          return result.user;
        },
        acceptInvite: async (token, password) => {
          const result = await api.auth.acceptInvite(token, password);
          cache.clear();
          setAccessToken(result.accessToken);
          setUser(result.user);
          return result.user;
        },
        signOut: async () => {
          await api.auth.logout();
          setAccessToken(null);
          setUser(null);
          cache.clear();
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
    : user.roles.includes("manager")
      ? "manager"
      : "employee";
export const homeFor = (user: AuthUser) =>
  `/${workspaceFor(user)}/${workspaceFor(user) === "employee" ? "home" : "dashboard"}`;
