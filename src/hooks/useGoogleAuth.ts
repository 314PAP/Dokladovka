import { useState, useEffect, useCallback } from "react";
import { useLocalStorage } from "./useLocalStorage";

interface GoogleAccount {
  user: {
    name: string;
    email: string;
    picture?: string;
  };
  accessToken: string | null;
  clientId: string;
  loginTime: number;
}

interface UseGoogleAuthReturn {
  activeSection: "welcome" | "selection" | "settings" | "receipts" | "documents";
  googleAccounts: GoogleAccount[];
  googleAccessToken: string | null;
  googleUser: { name: string; email: string; picture?: string } | null;
  googleClientId: string;
  setGoogleClientId: (value: string | ((prev: string) => string)) => void;
  isCloudSyncing: boolean;
  activeAccountIndex: number;
  setActiveAccountIndex: (index: number) => void;
  startGoogleLogin: (clientId: string) => void;
  handleOAuthCallback: () => Promise<void>;
  handleLogout: () => void;
  setActiveSection: (section: "welcome" | "selection" | "settings" | "receipts" | "documents") => void;
  setGoogleAccounts: (accounts: GoogleAccount[] | ((prev: GoogleAccount[]) => GoogleAccount[])) => void;
}

const createOauthState = (): string => {
  if (typeof globalThis.crypto?.randomUUID === "function") {
    return globalThis.crypto.randomUUID();
  }
  return Array.from({ length: 32 }, () => Math.floor(Math.random() * 36).toString(36)).join("");
};

const getGoogleRedirectUri = (): string => window.location.origin + window.location.pathname;

export function useGoogleAuth(): UseGoogleAuthReturn {
  const [googleClientId, setGoogleClientId] = useLocalStorage("dokladovka-google-client-id", "");
  const [activeAccountIndex, _setActiveAccountIndex] = useLocalStorage("dokladovka-active-account-index", 0);
  const [legacyHandled, setLegacyHandled] = useState(false);
  const [isCloudSyncing, setIsCloudSyncing] = useState(false);

  const [accounts, setAccounts] = useLocalStorage<GoogleAccount[]>("dokladovka-google-accounts", []);

  useEffect(() => {
    if (legacyHandled) return;
    const legacyUser = window.localStorage.getItem("dokladovka-google-user");
    if (legacyUser && accounts.length === 0) {
      try {
        const u = JSON.parse(legacyUser);
        const legacyAcc: GoogleAccount = {
          user: u,
          accessToken: null,
          clientId: window.localStorage.getItem("dokladovka-google-client-id") || "",
          loginTime: Date.now(),
        };
        setAccounts([legacyAcc]);
      } catch {
        console.warn("Failed to migrate legacy google user");
      }
    }
    setLegacyHandled(true);
  }, []);

  const activeAccount = accounts[activeAccountIndex] || accounts[0] || null;
  const googleUser = activeAccount ? activeAccount.user : null;
  const googleAccessToken = activeAccount ? activeAccount.accessToken : null;

  const [activeSection, _setActiveSection] = useState<"welcome" | "selection" | "settings" | "receipts" | "documents">(() => {
    try {
      const saved = window.localStorage.getItem("dokladovka-google-accounts");
      const parsed = saved ? JSON.parse(saved) : [];
      return parsed.length > 0 ? "selection" : "welcome";
    } catch {
      return "welcome";
    }
  });

  const setActiveSection = useCallback((section: "welcome" | "selection" | "settings" | "receipts" | "documents") => {
    _setActiveSection(section);
  }, []);

  const setActiveAccountIndex = useCallback((index: number) => {
    _setActiveAccountIndex(index);
  }, []);

  const startGoogleLogin = useCallback(
    (clientId: string) => {
      const trimmedClientId = clientId.trim();
      if (!trimmedClientId) {
        throw new Error("Google Client ID is required");
      }

      const oauthState = createOauthState();
      window.localStorage.setItem("dokladovka-google-client-id", trimmedClientId);
      window.localStorage.setItem("google-auth-pending", "true");
      window.localStorage.setItem("google-oauth-state", oauthState);

      const authUrl =
        "https://accounts.google.com/o/oauth2/v2/auth?" +
        new URLSearchParams({
          client_id: trimmedClientId,
          redirect_uri: getGoogleRedirectUri(),
          response_type: "token",
          scope:
            "https://www.googleapis.com/auth/drive.file https://www.googleapis.com/auth/documents openid email profile",
          state: oauthState,
          prompt: "select_account consent",
          include_granted_scopes: "true",
        }).toString();

      window.location.href = authUrl;
    },
    []
  );

  const handleOAuthCallback = useCallback(async () => {
    const queryParams = new URLSearchParams(window.location.search);
    const hashParams = new URLSearchParams(window.location.hash.replace(/^#/, ""));
    const getParam = (key: string) => queryParams.get(key) || hashParams.get(key);

    const error = getParam("error");
    const errorDescription = getParam("error_description");
    const token = getParam("access_token");
    const state = getParam("state");
    const storedState = window.localStorage.getItem("google-oauth-state");
    const isPending = window.localStorage.getItem("google-auth-pending") === "true";

    if (error) {
      const message = errorDescription || "Nepodařilo se dokončit přihlášení přes Google.";
      console.error("Google OAuth error:", error, message);
      alert(`Google přihlášení selhalo: ${message}`);
      window.localStorage.removeItem("google-auth-pending");
      window.localStorage.removeItem("google-oauth-state");
      window.history.replaceState({}, document.title, window.location.pathname);
      return;
    }

    if (!token || !isPending) {
      return;
    }

    if (storedState && state && storedState !== state) {
      console.warn("Google OAuth state mismatch:", { storedState, state });
    }

    window.localStorage.removeItem("google-auth-pending");
    window.localStorage.removeItem("google-oauth-state");
    window.history.replaceState({}, document.title, window.location.pathname);

    _setActiveSection("selection");

    try {
      const response = await fetch("https://www.googleapis.com/oauth2/v3/userinfo", {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!response.ok) throw new Error("Profil se nepodařilo stáhnout");
      const user = await response.json();

      setAccounts((prev) => {
        const index = prev.findIndex((acc) => acc.user.email === user.email);
        const newAcc: GoogleAccount = {
          user,
          accessToken: token,
          clientId: window.localStorage.getItem("dokladovka-google-client-id") || "",
          loginTime: Date.now(),
        };
        let updated: GoogleAccount[];
        if (index > -1) {
          updated = [...prev];
          updated[index] = newAcc;
          _setActiveAccountIndex(index);
        } else {
          updated = [...prev, newAcc];
          const newIndex = updated.length - 1;
          _setActiveAccountIndex(newIndex);
        }
        window.localStorage.setItem("dokladovka-google-accounts", JSON.stringify(updated));
        return updated;
      });

      window.localStorage.setItem("dokladovka-google-user", JSON.stringify(user));
    } catch (err) {
      console.error("Chyba Google Profilu:", err);
    }
  }, []);

  const handleLogout = useCallback(
    (emailToRemove?: string) => {
      const email = emailToRemove || googleUser?.email;
      if (!email) return;

      setAccounts((prev) => {
        const filtered = prev.filter((acc) => acc.user.email !== email);
        window.localStorage.setItem("dokladovka-google-accounts", JSON.stringify(filtered));
        if (filtered.length === 0) {
          _setActiveSection("welcome");
          _setActiveAccountIndex(0);
        } else {
          const newIndex = Math.min(activeAccountIndex, filtered.length - 1);
          _setActiveAccountIndex(newIndex);
        }
        return filtered;
      });

      if (accounts.length <= 1) {
        window.localStorage.removeItem("dokladovka-google-user");
      }
    },
    [googleUser, activeAccountIndex, accounts.length, setAccounts]
  );

  useEffect(() => {
    handleOAuthCallback();
  }, [handleOAuthCallback]);

  return {
    activeSection,
    googleAccounts: accounts,
    googleAccessToken,
    googleUser,
    googleClientId,
    setGoogleClientId,
    isCloudSyncing,
    activeAccountIndex,
    setActiveAccountIndex,
    startGoogleLogin,
    handleOAuthCallback,
    handleLogout,
    setActiveSection,
    setGoogleAccounts: setAccounts,
  };
}
