import React, { useState, useEffect } from 'react';
import { 
  Settings, 
  Key, 
  Chrome, 
  LogOut, 
  User, 
  HelpCircle, 
  ChevronDown, 
  ChevronUp, 
  Check, 
  AlertCircle,
  Eye,
  EyeOff
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

interface GoogleSettingsProps {
  apiKey: string;
  setApiKey: (val: string) => void;
  clientId: string;
  setClientId: (val: string) => void;
  builtInClientId?: string;
  googleUser: any;
  setGoogleUser: (user: any) => void;
  accessToken: string | null;
  setAccessToken: (token: string | null) => void;
  googleAccounts: any[];
  setGoogleAccounts: React.Dispatch<React.SetStateAction<any[]>>;
  activeAccountIndex: number;
  setActiveAccountIndex: (idx: number) => void;
  onBack?: () => void;
}

export default function GoogleSettings({
  apiKey,
  setApiKey,
  clientId,
  setClientId,
  builtInClientId = "",
  googleUser,
  setGoogleUser,
  accessToken,
  setAccessToken,
  googleAccounts,
  setGoogleAccounts,
  activeAccountIndex,
  setActiveAccountIndex,
  onBack
}: GoogleSettingsProps) {
  const [showInstructions, setShowInstructions] = useState(false);
  const [showKey, setShowKey] = useState(false);
  const [showKeyTooltip, setShowKeyTooltip] = useState(false);
  const [showClientIdTooltip, setShowClientIdTooltip] = useState(false);
  const [isCopied, setIsCopied] = useState(false);
  const [saveStatus, setSaveStatus] = useState<string | null>(null);
  const activeClientId = clientId.trim() || builtInClientId.trim();

  // Parse Google Auth hash/query redirect with error handling
  useEffect(() => {
    const handleGoogleRedirect = async () => {
      const queryParams = new URLSearchParams(window.location.search);
      const hashParams = new URLSearchParams(window.location.hash.replace(/^#/, ""));
      const getParam = (key: string) => queryParams.get(key) || hashParams.get(key);

      const error = getParam("error");
      const errorDescription = getParam("error_description");
      const token = getParam("access_token");
      const state = getParam("state");
      const storedState = localStorage.getItem("google-oauth-state");
      const isPending = localStorage.getItem("google-auth-pending") === "true";

      if (error) {
        const message = errorDescription || "Nepodařilo se dokončit přihlášení přes Google.";
        console.error("Google OAuth error:", error, message);
        alert(`Google přihlášení selhalo: ${message}`);
        localStorage.removeItem("google-auth-pending");
        localStorage.removeItem("google-oauth-state");
        window.history.replaceState({}, document.title, window.location.pathname);
        return;
      }

      if (!token) {
        return;
      }

      if (isPending && storedState && state && storedState !== state) {
        console.warn("Google OAuth state mismatch:", { storedState, state });
      }

      localStorage.removeItem("google-auth-pending");
      localStorage.removeItem("google-oauth-state");

      // Clear address bar hash/query
      window.history.replaceState(
        {}, 
        document.title, 
        window.location.pathname
      );

      setAccessToken(token);

      // Fetch user profile from Google API Docs/v1
      fetch("https://www.googleapis.com/oauth2/v3/userinfo", {
        headers: { Authorization: `Bearer ${token}` }
      })
      .then(r => {
        if (!r.ok) throw new Error("Profil se nepodařilo stáhnout");
        return r.json();
      })
      .then(user => {
        setGoogleUser(user);
        localStorage.setItem("dokladovka-google-user", JSON.stringify(user));
        triggerNotification("Přihlášení přes Google proběhlo úspěšně!");
      })
      .catch(err => {
        console.error("Chyba Google Profilu:", err);
        alert("Nepodařilo se načíst profil z Google účtu.");
      });
    };

    handleGoogleRedirect();
  }, [setAccessToken, setGoogleUser]);

  const triggerNotification = (text: string) => {
    setSaveStatus(text);
    setTimeout(() => {
      setSaveStatus(null);
    }, 3000);
  };

  const handleGoogleLogin = () => {
    const trimmedClientId = activeClientId;
    if (!trimmedClientId) {
      alert("Google přihlášení zatím není nakonfigurované. Doplňte prosím vlastní Client ID níže.");
      return;
    }

    // Generate secure random state for CSRF protection
    const oauthState = typeof globalThis.crypto?.randomUUID === "function"
      ? globalThis.crypto.randomUUID()
      : Array.from({ length: 32 }, () => Math.floor(Math.random() * 36).toString(36)).join("");

    localStorage.setItem("dokladovka-google-client-id", trimmedClientId);
    localStorage.setItem("google-auth-pending", "true");
    localStorage.setItem("google-oauth-state", oauthState);

    const redirectUri = getRedirectUri();
    const authUrl = `https://accounts.google.com/o/oauth2/v2/auth?` + new URLSearchParams({
      client_id: trimmedClientId,
      redirect_uri: redirectUri,
      response_type: "token",
      scope: "https://www.googleapis.com/auth/drive.file https://www.googleapis.com/auth/documents openid email profile",
      state: oauthState,
      prompt: "select_account consent",
      include_granted_scopes: "true"
    }).toString();

    window.location.href = authUrl;
  };

  const handleLogout = () => {
    const updated = googleAccounts.filter((_, idx) => idx !== activeAccountIndex);
    setGoogleAccounts(updated);
    localStorage.setItem("dokladovka-google-accounts", JSON.stringify(updated));
    const nextIndex = Math.max(0, updated.length - 1);
    setActiveAccountIndex(nextIndex);
    localStorage.setItem("dokladovka-active-account-index", String(nextIndex));
    if (updated.length === 0) {
      localStorage.removeItem("dokladovka-google-user");
      setAccessToken(null);
      setGoogleUser(null);
    }
    triggerNotification("Účet byl odhlášen.");
  };

  const handleSaveApiKeys = () => {
    localStorage.setItem("dokladovka-user-api-key", apiKey.trim());
    localStorage.setItem("dokladovka-google-client-id", clientId.trim());
    triggerNotification("Nastavení uloženo do prohlížeče.");
  };

  const handleClearCustomSettings = () => {
    if (window.confirm("Opravdu chcete vymazat vaše vlastní klíče?")) {
      setApiKey("");
      setClientId("");
      localStorage.removeItem("dokladovka-user-api-key");
      localStorage.removeItem("dokladovka-google-client-id");
      triggerNotification("Vlastní nastavení bylo vymazáno.");
    }
  };

  const getRedirectUri = () => window.location.origin + window.location.pathname;

  const copyRedirectUri = () => {
    navigator.clipboard.writeText(getRedirectUri());
    setIsCopied(true);
    setTimeout(() => setIsCopied(false), 2000);
  };

  return (
    <div className="bg-slate-50 min-h-screen text-slate-900 font-sans p-4 md:p-8">
      <div className="max-w-2xl mx-auto space-y-8">
        
        {/* Navigation / Header */}
        <div className="flex items-center justify-between">
          <button 
            onClick={onBack}
            className="flex items-center gap-2 text-slate-600 hover:text-slate-900 font-semibold text-sm cursor-pointer"
          >
            &larr; Zpět na úvod
          </button>
          
          <div className="flex items-center gap-2 bg-indigo-50 px-3.5 py-1.5 rounded-full text-indigo-700 text-xs font-bold uppercase tracking-wider">
            <Settings size={14} className="animate-spin-slow" />
            <span>Bezpečné cloudové nastavení</span>
          </div>
        </div>

        {/* Title */}
        <div className="space-y-2">
          <h1 className="text-3xl font-black tracking-tight text-slate-900">
            Nastavení Google & API
          </h1>
          <p className="text-slate-500 text-sm">
            Tato sekce vám umožňuje nastavit vlastní Gemini API klíč, připojit váš Google účet a změnit OAuth spojení, aby byla vaše data 100% soukromá a nezávislá na limitech aplikace.
          </p>
        </div>

        {/* Status Notification */}
        <AnimatePresence>
          {saveStatus && (
            <motion.div 
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              className="bg-emerald-550 bg-emerald-500 text-white p-4 rounded-2xl font-semibold text-sm flex items-center gap-2 shadow-md shadow-emerald-100"
            >
              <Check size={18} />
              <span>{saveStatus}</span>
            </motion.div>
          )}
        </AnimatePresence>

        {/* SECTION 1: Active Google Account State */}
        <section className="bg-white rounded-3xl border border-slate-200 shadow-sm p-6 space-y-6">
          <h2 className="font-bold text-lg flex items-center gap-2">
            <Chrome size={20} className="text-indigo-600" />
            Propojený Google Účet
          </h2>

                  {googleAccounts.length > 0 ? (
            <div className="space-y-4">
              <div className="bg-slate-50 border border-slate-100 rounded-2xl p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-5">
                <div className="flex items-center gap-4">
                  {googleUser?.picture ? (
                    <img 
                      src={googleUser.picture} 
                      alt={googleUser.name} 
                      className="w-14 h-14 rounded-full border border-slate-200 shadow-sm"
                      referrerPolicy="no-referrer"
                    />
                  ) : (
                    <div className="w-14 h-14 rounded-full bg-indigo-100 text-indigo-600 flex items-center justify-center font-bold text-xl">
                      <User size={24} />
                    </div>
                  )}
                  <div className="text-left">
                    <h3 className="font-bold text-slate-800 text-base">{googleUser?.name || "Uživatel Google"}</h3>
                    <p className="text-slate-500 text-sm font-medium">{googleUser?.email || "E-mail nedostupný"}</p>
                    <p className="text-[10px] text-emerald-600 font-bold flex items-center gap-1 mt-1">
                      <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                      Propojeno k Google Drive (Aktivní)
                    </p>
                  </div>
                </div>

                <button 
                  onClick={handleLogout}
                  className="flex items-center justify-center gap-1.5 px-4 py-2 bg-slate-150 hover:bg-rose-50 text-slate-600 hover:text-rose-600 rounded-xl font-bold text-xs transition-colors cursor-pointer border border-slate-200 whitespace-nowrap"
                >
                  <LogOut size={14} />
                  Odhlásit tento účet
                </button>
              </div>

              {/* Other logged-in accounts */}
              {googleAccounts.length > 1 && (
                <div className="space-y-2 bg-slate-50/50 p-4 rounded-2xl border border-slate-200/50">
                  <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider text-left">
                    Ostatní připojené účty (kliknutím přepnete):
                  </p>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    {googleAccounts.map((acc, index) => {
                      if (index === activeAccountIndex) return null;
                      return (
                        <div 
                          key={acc.user.email} 
                          onClick={() => {
                            setActiveAccountIndex(index);
                            localStorage.setItem("dokladovka-active-account-index", String(index));
                            triggerNotification(`Přepnuto na účet: ${acc.user.name}`);
                          }}
                          className="flex items-center justify-between p-2.5 bg-white border border-slate-200 hover:border-indigo-400 rounded-xl transition-all cursor-pointer"
                        >
                          <div className="flex items-center gap-2 text-left truncate">
                            {acc.user.picture ? (
                              <img src={acc.user.picture} alt="" className="w-6 h-6 rounded-full" referrerPolicy="no-referrer" />
                            ) : (
                              <div className="w-6 h-6 rounded-full bg-indigo-900 flex items-center justify-center text-[10px] font-bold text-indigo-300">
                                {acc.user.email.substring(0, 2).toUpperCase()}
                              </div>
                            )}
                            <div className="truncate">
                              <p className="text-xs font-bold text-slate-700 truncate">{acc.user.name}</p>
                              <p className="text-[9px] text-slate-400 truncate">{acc.user.email}</p>
                            </div>
                          </div>
                          <span className="text-[10px] text-indigo-500 font-semibold hover:underline px-2">
                            Přepnout
                          </span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Add account button inside settings */}
              <div className="pt-2 flex justify-start">
                <button
                  type="button"
                  onClick={handleGoogleLogin}
                  className="px-4 py-2 border border-indigo-200 hover:bg-indigo-50 text-indigo-600 rounded-xl font-bold text-xs transition-all flex items-center gap-1.5 cursor-pointer shadow-sm"
                >
                  + Připojit další Google účet
                </button>
              </div>
            </div>
          ) : (
            <div className="bg-amber-50/50 border border-amber-200/50 rounded-2xl p-5 space-y-4">
              <div className="flex gap-3 text-left">
                <AlertCircle className="text-amber-500 shrink-0 mt-0.5" size={20} />
                <div className="space-y-1">
                  <h3 className="font-bold text-amber-800 text-sm">Nejste přihlášeni k Google</h3>
                  <p className="text-slate-600 text-xs leading-relaxed">
                    Přihlášením propojíte Dokladovku se svým Google Diskem (Google Drive) a Google Dokumenty (Google Docs). To vám umožní automaticky synchronizovat a zálohovat vaše doklady a přistupovat k nim z jakéhokoliv cloudu a zařízení.
                  </p>
                </div>
              </div>

              {activeClientId ? (
                <button 
                  onClick={handleGoogleLogin}
                  className="w-full sm:w-auto flex items-center justify-center gap-3 px-5 py-3 bg-slate-900 hover:bg-slate-800 text-white rounded-xl font-semibold text-sm shadow-md transition-all cursor-pointer"
                >
                  <Chrome size={18} />
                  Přihlásit se přes Google
                </button>
              ) : (
                <p className="text-xs text-slate-400 italic text-left">
                  Google přihlášení zatím nemá nastavený veřejný OAuth identifikátor aplikace. Doplňte vlastní ID níže, nebo nastavte ID aplikace v deployi.
                </p>
              )}
            </div>
          )}
        </section>

        {/* SECTION 2: Custom Credentials Form */}
        <section className="bg-white rounded-3xl border border-slate-200 shadow-sm p-6 space-y-6">
          <div className="space-y-2 border-b border-slate-100 pb-4">
            <h2 className="font-bold text-lg flex items-center gap-2 text-slate-800">
              <Key size={18} className="text-indigo-600 animate-pulse" />
              Vlastní API Klíče a Identifikace (Zvýšené limity & Soukromí)
            </h2>
            <p className="text-xs text-slate-500 leading-relaxed font-medium">
              Zde můžete nakonfigurovat své vlastní přístupové údaje. Google OAuth Client ID je veřejný identifikátor aplikace pro přihlášení přes Google; není to osobní účet ani API klíč. Gemini API klíč slouží pro AI analýzu dokladů a bez vlastního klíče nebo bezpečně nastaveného serveru může aplikace použít jen náhradní zpracování bez AI.
            </p>
          </div>

          <div className="space-y-6">
            {/* Gemini API Key */}
            <div className="space-y-2 relative">
              <div className="flex items-center justify-between flex-wrap gap-2">
                <span className="block text-xs font-bold text-slate-600 uppercase tracking-wider flex items-center gap-1.5">
                  1. Vlastní Gemini API Klíč
                  <div className="relative inline-block group">
                    <button
                      type="button"
                      aria-label="Informace o Gemini API klíči"
                      className="text-slate-400 hover:text-indigo-600 transition-colors focus:outline-none"
                      onMouseEnter={() => setShowKeyTooltip(true)}
                      onMouseLeave={() => setShowKeyTooltip(false)}
                      onClick={() => setShowKeyTooltip(!showKeyTooltip)}
                    >
                      <HelpCircle size={15} />
                    </button>
                    
                    {/* Tooltip Popup */}
                    <AnimatePresence>
                      {showKeyTooltip && (
                        <motion.div
                          initial={{ opacity: 0, y: 10, scale: 0.95 }}
                          animate={{ opacity: 1, y: 0, scale: 1 }}
                          exit={{ opacity: 0, y: 10, scale: 0.95 }}
                          className="absolute bottom-6 left-0 sm:left-auto sm:right-0 w-72 bg-slate-900 text-white text-[11px] p-3.5 rounded-xl shadow-xl z-30 pointer-events-none leading-relaxed border border-slate-700/50"
                        >
                          <span className="font-bold block text-indigo-300 mb-1">Gemini API Klíč</span>
                          Slouží k provádění inteligentní OCR analýzy (čtení účtenek a smluv). Vlastní klíč zaručuje, že nebudete omezeni sdílenou kapacitou a vaše naskenované dokumenty se analyzují okamžitě. Je zcela zdarma do určitého měsíčního objemu.
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </div>
                </span>

                <a 
                  href="https://aistudio.google.com/app/apikey" 
                  target="_blank" 
                  rel="noopener noreferrer" 
                  className="text-xs text-indigo-600 hover:text-indigo-800 font-bold flex items-center gap-1 transition-colors underline"
                >
                  Získat klíč přímo v Google AI Studio (ZDARMA na 1 kliknutí) &rarr;
                </a>
              </div>

              <div className="relative">
                <input 
                  id="geminiApiKey"
                  type={showKey ? "text" : "password"}
                  value={apiKey}
                  onChange={(e) => setApiKey(e.target.value)}
                  placeholder="Zadejte vlastní klíč začínající na AIzaSy..."
                  className="w-full pl-3.5 pr-11 py-3 bg-slate-50 border border-slate-200 rounded-xl text-sm font-mono focus:ring-2 focus:ring-indigo-500 focus:outline-none focus:bg-white text-slate-800"
                />
                <button
                  type="button"
                  aria-label={showKey ? "Hide key" : "Show key"}
                  onClick={() => setShowKey(!showKey)}
                  className="absolute right-3.5 top-3 text-slate-400 hover:text-slate-600 cursor-pointer"
                >
                  {showKey ? <EyeOff size={18} /> : <Eye size={18} />}
                </button>
              </div>
              <p className="text-[11px] text-slate-400 font-medium">
                Ponecháte-li prázdné, AI analýza poběží jen tehdy, pokud je bezpečně nastavený serverový klíč. Na GitHub Pages bez serveru aplikace použije náhradní zpracování.
              </p>
            </div>

            {/* Google OAuth Client ID */}
            <div className="space-y-2 relative">
              <div className="flex items-center justify-between flex-wrap gap-2">
                <span className="block text-xs font-bold text-slate-600 uppercase tracking-wider flex items-center gap-1.5">
                  2. Volitelné vlastní Google OAuth Client ID
                  <div className="relative inline-block group">
                    <button
                      type="button"
                      aria-label="Informace o Google Client ID"
                      className="text-slate-400 hover:text-indigo-600 transition-colors focus:outline-none"
                      onMouseEnter={() => setShowClientIdTooltip(true)}
                      onMouseLeave={() => setShowClientIdTooltip(false)}
                      onClick={() => setShowClientIdTooltip(!showClientIdTooltip)}
                    >
                      <HelpCircle size={15} />
                    </button>
                    
                    {/* Tooltip Popup */}
                    <AnimatePresence>
                      {showClientIdTooltip && (
                        <motion.div
                          initial={{ opacity: 0, y: 10, scale: 0.95 }}
                          animate={{ opacity: 1, y: 0, scale: 1 }}
                          exit={{ opacity: 0, y: 10, scale: 0.95 }}
                          className="absolute bottom-6 left-0 sm:left-auto sm:right-0 w-72 bg-slate-900 text-white text-[11px] p-3.5 rounded-xl shadow-xl z-30 pointer-events-none leading-relaxed border border-slate-700/50"
                        >
                          <span className="font-bold block text-indigo-300 mb-1">Google OAuth Client ID</span>
                          Identifikátor vaší vlastní soukromé aplikace v cloudu Google. Zajišťuje bezpečné přihlášení do Google Disku. Umožňuje ukládat vaše naskenované materiály a reporty přímo do vašeho cloudu naprosto privátně, aniž by kdokoli jiný měl k vašim dokumentům přístup.
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </div>
                </span>

                <a 
                  href="https://console.cloud.google.com/apis/credentials" 
                  target="_blank" 
                  rel="noopener noreferrer" 
                  className="text-xs text-indigo-600 hover:text-indigo-800 font-bold flex items-center gap-1 transition-colors underline"
                >
                  Získat Client ID přímo v Google Cloud Console &rarr;
                </a>
              </div>

              <input 
                id="googleClientId"
                type="text"
                value={clientId}
                onChange={(e) => setClientId(e.target.value)}
                placeholder="Např. 123456-abcdef.apps.googleusercontent.com"
                className="w-full px-3.5 py-3 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-indigo-500 focus:outline-none focus:bg-white text-slate-800 font-mono"
              />
              <p className="text-[11px] text-slate-400 font-medium">
                Pokud políčko necháte prázdné, aplikace použije veřejný OAuth identifikátor Dokladovky nastavený při deployi. Vlastní ID je uložené pouze lokálně ve vašem prohlížeči.
              </p>
            </div>

            {/* Actions for local configuration */}
            <div className="flex flex-wrap gap-3 pt-2 border-t border-slate-100">
              <button
                onClick={handleSaveApiKeys}
                className="px-5 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl font-bold text-sm shadow-sm transition-all cursor-pointer"
              >
                Uložit nastavení
              </button>
              
              {(apiKey || clientId) && (
                <button
                  onClick={handleClearCustomSettings}
                  className="px-4 py-2.5 bg-slate-50 hover:bg-red-50 hover:text-red-600 text-slate-500 border border-slate-200 rounded-xl font-bold text-sm transition-colors cursor-pointer"
                >
                  Vymazat klíče
                </button>
              )}
            </div>
          </div>
        </section>

        {/* SECTION 3: Detailed instructions how to configure Google Workspace for free */}
        <section className="bg-white rounded-3xl border border-slate-200 shadow-sm p-6 space-y-4">
          <button 
            type="button"
            className="w-full text-left flex items-center justify-between font-bold text-base text-slate-800 cursor-pointer"
            onClick={() => setShowInstructions(!showInstructions)}
          >
            <span className="flex items-center gap-2">
              <HelpCircle size={20} className="text-indigo-600" />
              Návod krok za krokem: Jak získat klíče zcela zdarma (Pro každého)
            </span>
            {showInstructions ? <ChevronUp size={18} /> : <ChevronDown size={18} />}
          </button>

          <AnimatePresence>
            {showInstructions && (
              <motion.div 
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: "auto", opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                className="overflow-hidden text-xs text-slate-600 space-y-6 pt-4 border-t border-slate-100"
              >
                {/* PART A: Gemini Key */}
                <div className="space-y-2.5 bg-indigo-50/40 p-4 rounded-2xl border border-indigo-100/50">
                  <h3 className="font-bold text-slate-900 text-sm flex items-center gap-1.5 text-indigo-700">
                    <span className="w-5 h-5 rounded-full bg-indigo-600 text-white text-[10px] font-black flex items-center justify-center shrink-0">A</span>
                    Návod: Jak zprovoznit Gemini API Klíč (Zabere 15 sekund)
                  </h3>
                  <p className="text-slate-600 text-[11px] leading-relaxed font-semibold">
                    Tento klíč slouží k inteligentnímu popisu a rozboru účtenek. Vytvoření je plně zdarma a nepotřebujete platební kartu:
                  </p>
                  <ol className="list-decimal pl-5 space-y-1.5 text-[11px] text-slate-700 leading-relaxed font-semibold">
                    <li>
                      Klikněte na přímý odkaz <a href="https://aistudio.google.com/app/apikey" target="_blank" rel="noopener noreferrer" className="text-indigo-600 font-bold hover:underline">Google AI Studio API Keys &rarr;</a> a přihlaste se libovolným Google účtem.
                    </li>
                    <li>
                      Vpravo nahoře klikněte na velké modré tlačítko <strong>"Create API key"</strong> (Vytvořit API klíč).
                    </li>
                    <li>
                      Pokud se ukáže nabídka s výběrem projektu, stiskněte <strong>"Create API key in new project"</strong> (Vytvořit klíč v novém projektu).
                    </li>
                    <li>
                      Zobrazí se vám kód začínající na <code className="font-mono bg-indigo-100/70 px-1 py-0.5 rounded text-indigo-800 font-bold">AIzaSy...</code>. Klikněte na <strong>Copy</strong> (Zkopírovat).
                    </li>
                    <li>
                      Vložte ho do pole <strong>1. Vlastní Gemini API Klíč</strong> nahoře na této stránce a klikněte na <strong>Uložit nastavení</strong>. Hotovo!
                    </li>
                  </ol>
                </div>

                {/* PART B: Google Client ID */}
                <div className="space-y-3 bg-emerald-50/35 p-4 rounded-2xl border border-emerald-100/50">
                  <h3 className="font-bold text-slate-900 text-sm flex items-center gap-1.5 text-emerald-800">
                    <span className="w-5 h-5 rounded-full bg-emerald-600 text-white text-[10px] font-black flex items-center justify-center shrink-0">B</span>
                    Návod: Jak vytvořit Google Client ID (Zabere 2 minuty)
                  </h3>
                  <p className="text-slate-600 text-[11px] leading-relaxed font-medium">
                    Tento identifikátor zaručuje, že se vaše přihlášení a Google Disk propojí bezpečně a soukromě:
                  </p>
                  
                  <div className="space-y-4">
                    {/* Step 1 */}
                    <div className="flex gap-2">
                      <span className="font-bold text-emerald-600 text-xs shrink-0 mt-0.5">1. krok:</span>
                      <div>
                        <p className="font-bold text-slate-800 text-xs">Vytvoření projektu a aktivace Google služeb</p>
                        <p className="text-slate-600 mt-1 leading-relaxed text-[11px]">
                          Přejdete do bezplatné administrace <a href="https://console.cloud.google.com/" target="_blank" rel="noopener noreferrer" className="text-indigo-600 font-bold hover:underline">Google Cloud Console &rarr;</a>. Vlevo nahoře vedle loga Google Cloud klikněte na seznam projektů a stiskněte <strong>"New Project"</strong> (Nový projekt). Pojmenujte ho např. <code className="font-mono bg-slate-100 px-1 py-0.5 rounded text-slate-800 font-bold">Dokladovka</code> a klikněte na <strong>Create</strong>.
                        </p>
                        <p className="text-amber-800 bg-amber-50 p-2.5 rounded-lg border border-amber-200 text-[11px] mt-1.5 font-bold leading-relaxed shadow-xs">
                          ⚠️ EXTRÉMNĚ DŮLEŽITÉ: V horním vyhledávacím řádku na webu vyhledejte <strong className="font-black">"Google Drive API"</strong>, klikněte na něj a klikněte na modré stiskací tlačítko <strong className="font-black">Enable (Povolit)</strong>. Pak vyhledejte <strong className="font-black">"Google Docs API"</strong> a také pro něj klikněte na <strong className="font-black">Enable</strong>. Bez tohoto povolení přihlášení k Disku selže!
                        </p>
                      </div>
                    </div>

                    {/* Step 2 */}
                    <div className="flex gap-2">
                      <span className="font-bold text-emerald-600 text-xs shrink-0 mt-0.5">2. krok:</span>
                      <div>
                        <p className="font-bold text-slate-800 text-xs">Nastavení schvalovací obrazovky (OAuth consent screen)</p>
                        <p className="text-slate-600 mt-1 leading-relaxed text-[11px]">
                          V levém menu zvolte <strong>APIs &amp; Services (Rozhraní API a služby) &gt; OAuth consent screen (Obrazovka souhlasu)</strong>.
                        </p>
                        <ul className="list-disc pl-4 mt-1.5 space-y-1 text-slate-600 font-semibold text-[11px]">
                          <li>Zvolte možnost <strong>External (Externí)</strong> a klikněte na <strong>Create</strong>.</li>
                          <li>Vyplňte pouze povinná pole: <i>App name</i> (Dokladovka), <i>User support email</i> (vaše e-mailová adresa) a dole <i>Developer contact information</i> (znovu vaše e-mailová adresa). Klikněte na <strong>Save and Continue</strong>.</li>
                          <li>Na další stránce "Scopes" nic neměňte a jen stiskněte <strong>Save and Continue</strong>.</li>
                          <li>V záložce "Test users" klikněte na <strong>+ Add Users</strong> a zadejte svůj vlastní e-mail, pod kterým se chcete přihlašovat. Klikněte na <strong>Add</strong> a pak na <strong>Save and Continue</strong>.</li>
                        </ul>
                      </div>
                    </div>

                    {/* Step 3 */}
                    <div className="flex gap-2">
                      <span className="font-bold text-emerald-600 text-xs shrink-0 mt-0.5">3. krok:</span>
                      <div>
                        <p className="font-bold text-slate-800 text-xs">Vygenerování Client ID</p>
                        <p className="text-slate-600 mt-1 leading-relaxed text-[11px]">
                          V levém menu klikněte přímo na záložku <a href="https://console.cloud.google.com/apis/credentials" target="_blank" rel="noopener noreferrer" className="text-indigo-600 font-bold hover:underline">Credentials (Přihlašovací údaje) &rarr;</a>. Nahoře na stránce klikněte na <strong>+ Create Credentials &gt; OAuth client ID</strong>.
                        </p>
                        <ul className="list-disc pl-4 mt-1.5 space-y-1.5 text-slate-600 font-semibold text-[11px]">
                          <li>Jako <i>Application type</i> zvolte <strong>Web application</strong> (Webová aplikace).</li>
                          <li>
                            Do části <strong>Authorized JavaScript origins</strong> klikněte vpravo na <strong>+ Add URI</strong> a vložte přesně adresu naší aplikace:
                            <div className="flex items-center gap-2 mt-1 bg-white p-2 rounded-lg border border-slate-200 font-mono text-[10px] text-slate-700 overflow-x-auto font-bold">
                              <span>{getRedirectUri()}</span>
                              <button 
                                onClick={copyRedirectUri}
                                className="ml-auto px-2 py-0.5 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 rounded-md font-bold text-[9px] cursor-pointer whitespace-nowrap border border-indigo-200"
                              >
                                {isCopied ? "Zkopírováno!" : "Zkopírovat adresu"}
                              </button>
                            </div>
                          </li>
                          <li>
                            Do části <strong>Authorized redirect URIs</strong> klikněte na <strong>+ Add URI</strong> a vložte tam naprosto stejnou adresu:
                            <div className="bg-white p-2 mt-1 rounded-lg border border-slate-200 font-mono text-[10px] text-slate-700 overflow-x-auto font-bold">
                              {getRedirectUri()}
                            </div>
                          </li>
                          <li>Klikněte dolů na tlačítko <strong>Create</strong> (Vytvořit).</li>
                        </ul>
                        <p className="text-slate-700 mt-2.5 text-[11px] leading-relaxed font-semibold">
                          Google vám zobrazí okno s vygenerovaným <strong>Client ID</strong> (dlouhý text končící na <code className="bg-slate-100 px-1 py-0.5 rounded text-indigo-950 font-mono font-bold font-black">.apps.googleusercontent.com</code>). Ten zkopírujte, vložte nahoru do políčka <strong>2. Vlastní Google OAuth Client ID</strong> a klikněte na <strong>Uložit nastavení</strong>. Hotovo!
                        </p>
                      </div>
                    </div>
                  </div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </section>

      </div>
    </div>
  );
}
