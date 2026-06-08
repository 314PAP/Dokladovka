import React from 'react';
import { motion } from 'motion/react';
import {
  Sun,
  Moon,
  ShoppingBag,
  FolderOpen,
  CheckCircle2,
  User,
  Mail,
} from 'lucide-react';

interface GoogleAccount {
  user: {
    email: string;
    name: string;
    picture?: string;
  };
  accessToken: string | null;
  clientId: string;
  loginTime: number;
}

interface WelcomeSectionProps {
  darkMode: boolean;
  onToggleDarkMode: () => void;
  googleClientId: string;
  googleAccounts: GoogleAccount[];
  activeAccountIndex: number;
  onSelectAccount: (index: number) => void;
  onLoginWithGoogle: (clientId: string) => void;
  onNavigate: (section: 'selection' | 'settings') => void;
}

const WelcomeSection: React.FC<WelcomeSectionProps> = ({
  darkMode,
  onToggleDarkMode,
  googleClientId,
  googleAccounts,
  activeAccountIndex,
  onSelectAccount,
  onLoginWithGoogle,
  onNavigate,
}) => {
  return (
    <div className={`min-h-screen ${darkMode ? 'bg-slate-950 text-slate-100' : 'bg-white text-slate-800'} font-sans flex flex-col justify-between p-4 md:p-8 transition-colors duration-200`}>
      <div className="w-full max-w-4xl mx-auto flex items-center justify-between py-3 border-b border-slate-100 dark:border-slate-800">
        <div className="flex items-center gap-1.5 text-left">
          <span className="p-1.5 bg-blue-600 rounded-lg text-white font-black text-xs shadow-md">
            D
          </span>
          <div className="leading-none">
            <span className="font-extrabold tracking-tight text-slate-900 dark:text-white text-sm md:text-base">DOKLADOVKA</span>
            <span className="block text-[8px] font-bold text-slate-400 dark:text-slate-500 tracking-wider">vyrobil PIPAP.CZ</span>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <span className="text-[10px] text-blue-600 dark:text-blue-400 font-extrabold bg-blue-50 dark:bg-blue-950/40 px-3 py-1 rounded-full border border-blue-100 dark:border-blue-900/30">
            PIPAP.CZ
          </span>
          <button
            onClick={onToggleDarkMode}
            className="p-2 rounded-xl bg-slate-100 dark:bg-slate-900 text-slate-700 dark:text-slate-200 hover:scale-105 transition-all text-xs border border-slate-200 dark:border-slate-800 cursor-pointer flex items-center justify-center"
            title={darkMode ? "Přepnout do světlého režimu" : "Přepnout do tmavého režimu"}
          >
            {darkMode ? <Sun size={14} className="text-yellow-400" /> : <Moon size={14} className="text-blue-600" />}
          </button>
        </div>
      </div>

      <div className="w-full max-w-lg mx-auto py-8 space-y-6">
        <div className={`rounded-3xl p-6 md:p-8 shadow-xl border ${darkMode ? 'bg-slate-900 border-slate-800' : 'bg-slate-50 border-slate-200/50'} text-center space-y-6`}>
          <div className="space-y-2">
            <h2 className="text-xl font-bold text-slate-900 dark:text-white">Přihlášení &amp; Cloudová Synchronizace</h2>
            <p className="text-xs text-slate-500 dark:text-slate-400 max-w-xs mx-auto leading-relaxed">
              Mějte své doklady k dispozici z jakéhokoli zařízení! Vaše data se zálohují bezpečně přímo do vašeho osobního Google Disku.
            </p>
          </div>

          <div className="space-y-4">
            <button
              type="button"
              onClick={() => {
                if (!googleClientId.trim()) {
                  onNavigate('settings');
                  return;
                }
                onLoginWithGoogle(googleClientId.trim());
              }}
              className="w-full py-4 bg-blue-600 hover:bg-blue-700 text-white rounded-2xl font-bold text-sm shadow-xl active:scale-95 transition-all flex items-center justify-center gap-3 cursor-pointer"
            >
              <ShoppingBag size={18} />
              <span>Přihlásit se svým Google účtem</span>
            </button>

            {googleAccounts.length > 0 && (
              <div className="space-y-2 text-left pt-2">
                <p className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider">
                  Uložené účty v tomto prohlížeči:
                </p>
                <div className="space-y-2 max-h-40 overflow-y-auto pr-1">
                  {googleAccounts.map((acc, index) => (
                    <div
                      key={acc.user.email}
                      className={`flex items-center justify-between p-3 rounded-xl border transition-all cursor-pointer ${darkMode ? 'bg-slate-950 border-slate-800 hover:border-blue-700' : 'bg-white border-slate-200 hover:border-blue-400'}`}
                      onClick={() => {
                        onSelectAccount(index);
                        onNavigate('selection');
                      }}
                    >
                      <div className="flex items-center gap-2.5 text-left max-w-[70%]">
                        {acc.user.picture ? (
                          <img src={acc.user.picture} alt="" className="w-7 h-7 rounded-full" referrerPolicy="no-referrer" />
                        ) : (
                          <div className="w-7 h-7 rounded-full bg-blue-100 dark:bg-blue-900 text-blue-600 dark:text-blue-300 flex items-center justify-center text-xs font-bold animate-pulse">
                            {acc.user.email.substring(0, 2).toUpperCase()}
                          </div>
                        )}
                        <div className="truncate">
                          <p className="text-xs font-bold text-slate-800 dark:text-slate-100 truncate">{acc.user.name}</p>
                          <p className="text-[9px] text-slate-500 dark:text-slate-400 truncate">{acc.user.email}</p>
                        </div>
                      </div>
                      <span className="text-[10px] font-bold text-blue-600 dark:text-blue-400 hover:underline flex items-center gap-0.5">
                        Vstoupit &rarr;
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="w-full max-w-4xl mx-auto py-4 space-y-6">
        <div className="text-center space-y-2">
          <span className="px-2.5 py-1 bg-emerald-50 dark:bg-emerald-950/30 text-emerald-600 dark:text-emerald-400 rounded-full text-[10px] font-bold border border-emerald-100 dark:border-emerald-900/40 uppercase tracking-widest inline-block">
            100% Soukromý Cloudový Asistent
          </span>
          <h3 className="text-lg font-black tracking-tight text-slate-900 dark:text-white">Dokladovka Pipap &mdash; Hlavní Funkce</h3>
          <p className="text-xs text-slate-500 dark:text-slate-400 max-w-md mx-auto leading-relaxed">
            Stylová a moderní krabička na doklady, kterou spravujete pouze vy. Žádné sdílení dat třetím stranám.
          </p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div className={`p-5 rounded-3xl border text-left space-y-3 ${darkMode ? 'bg-slate-900/60 border-slate-800' : 'bg-slate-50 border-slate-200/50'}`}>
            <span className="inline-flex p-2 bg-emerald-50 dark:bg-emerald-900/10 text-emerald-600 dark:text-emerald-400 rounded-xl border border-emerald-100 dark:border-emerald-900/30">
              <ShoppingBag size={18} />
            </span>
            <h4 className="font-bold text-xs text-slate-800 dark:text-white uppercase tracking-wide">Výdaje &amp; Účtenky</h4>
            <p className="text-[11px] text-slate-500 dark:text-slate-400 leading-relaxed">
              Rychlé nahrávání, ořez a automatický položkový rozpad s AI extrakcí, rozdělení do kategorií s barevnými indikátory.
            </p>
          </div>

          <div className={`p-5 rounded-3xl border text-left space-y-3 ${darkMode ? 'bg-slate-900/60 border-slate-800' : 'bg-slate-50 border-slate-200/50'}`}>
            <span className="inline-flex p-2 bg-blue-50 dark:bg-blue-900/10 text-blue-600 dark:text-blue-400 rounded-xl border border-blue-100 dark:border-blue-900/30">
              <FolderOpen size={18} />
            </span>
            <h4 className="font-bold text-xs text-slate-800 dark:text-white uppercase tracking-wide">Dokumenty &amp; Smlouvy</h4>
            <p className="text-[11px] text-slate-500 dark:text-slate-400 leading-relaxed">
              Registr zdravotních zpráv, úřadů, rodinných dohod a pojistek. AI vygeneruje shrnutí a dohlédne na lhůty.
            </p>
          </div>

          <div className={`p-5 rounded-3xl border text-left space-y-3 ${darkMode ? 'bg-slate-900/60 border-slate-800' : 'bg-slate-50 border-slate-200/50'}`}>
            <span className="inline-flex p-2 bg-orange-50 dark:bg-orange-900/10 text-orange-600 dark:text-orange-400 rounded-xl border border-orange-100 dark:border-orange-900/30">
              <CheckCircle2 size={18} />
            </span>
            <h4 className="font-bold text-xs text-slate-800 dark:text-white uppercase tracking-wide">Více Google Účtů</h4>
            <p className="text-[11px] text-slate-500 dark:text-slate-400 leading-relaxed">
              Oddělte osobní věci od podnikání. Přidejte si vícero Google účtů a přepínejte se mezi nimi okamžitě.
            </p>
          </div>
        </div>
      </div>

      <div className="w-full border-t border-slate-100 dark:border-slate-900 max-w-4xl mx-auto py-5 text-center text-[10px] text-slate-400 dark:text-slate-500">
        <p className="font-bold">DOKLADOVKA &bull; Všechna práva vyhrazena &copy; {new Date().getFullYear()} PIPAP.CZ</p>
      </div>
    </div>
  );
};

export default WelcomeSection;
