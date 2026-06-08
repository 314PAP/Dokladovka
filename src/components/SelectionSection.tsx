import React from 'react';
import { motion } from 'motion/react';
import {
  ShoppingBag,
  FolderOpen,
  Loader2,
  Settings,
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

interface SelectionSectionProps {
  googleUser: {
    email: string;
    name: string;
    picture?: string;
  } | null;
  googleAccounts: GoogleAccount[];
  activeAccountIndex: number;
  isCloudSyncing: boolean;
  onNavigate: (section: 'receipts' | 'documents' | 'settings' | 'welcome') => void;
  onSelectAccount: (index: number) => void;
  onLogout: () => void;
  onAddGoogleAccount: (clientId: string) => void;
  googleClientId: string;
}

const SelectionSection: React.FC<SelectionSectionProps> = ({
  googleUser,
  googleAccounts,
  activeAccountIndex,
  isCloudSyncing,
  onNavigate,
  onSelectAccount,
  onLogout,
  onAddGoogleAccount,
  googleClientId,
}) => {
  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 font-sans flex items-center justify-center p-4 md:p-8">
      <div className="max-w-3xl w-full text-center space-y-12">
        <div className="space-y-3">
          <motion.div
            initial={{ scale: 0.8, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ type: "spring", stiffness: 100 }}
            className="inline-flex p-4 bg-indigo-600 rounded-3xl text-white shadow-xl shadow-indigo-100 mb-2"
          >
            <ShoppingBag size={48} />
          </motion.div>
          <h1 className="text-4xl md:text-5xl font-black tracking-tight text-slate-900">
            DOKLADOVKA
          </h1>
          <p className="text-slate-500 max-w-md mx-auto text-base md:text-lg">
            Váš chytrý AI pomocník pro správu účtenek a osobních celoživotních doložení.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
          <motion.button
            whileHover={{ scale: 1.02, y: -4 }}
            whileTap={{ scale: 0.98 }}
            onClick={() => onNavigate('receipts')}
            className="bg-white border-2 border-slate-100 hover:border-indigo-500 rounded-[32px] p-8 text-left shadow-lg hover:shadow-xl transition-all flex flex-col justify-between h-[300px] cursor-pointer group"
          >
            <div className="space-y-4">
              <div className="p-4 bg-green-50 text-green-600 rounded-2xl w-fit group-hover:bg-green-600 group-hover:text-white transition-colors">
                <ShoppingBag size={28} />
              </div>
              <h2 className="text-2xl font-bold text-slate-800">Složenky a účtenky</h2>
              <p className="text-slate-500 text-sm leading-relaxed">
                Skenování účtenek, automatická kategorizace, položkový přehled a měsíční statistika útrat.
              </p>
            </div>
            <div className="text-indigo-600 font-bold text-sm flex items-center gap-1 group-hover:translate-x-1 transition-transform">
              Vstoupit do výdajů &rarr;
            </div>
          </motion.button>

          <motion.button
            whileHover={{ scale: 1.02, y: -4 }}
            whileTap={{ scale: 0.98 }}
            onClick={() => onNavigate('documents')}
            className="bg-white border-2 border-slate-100 hover:border-indigo-500 rounded-[32px] p-8 text-left shadow-lg hover:shadow-xl transition-all flex flex-col justify-between h-[300px] cursor-pointer group"
          >
            <div className="space-y-4">
              <div className="p-4 bg-indigo-50 text-indigo-600 rounded-2xl w-fit group-hover:bg-indigo-600 group-hover:text-white transition-colors">
                <FolderOpen size={28} />
              </div>
              <h2 className="text-2xl font-bold text-slate-800">Osobní dokumenty</h2>
              <p className="text-slate-500 text-sm leading-relaxed">
                Zdravotní zprávy, smlouvy, úřady, sociální pojištění. AI shrnutí obsahu, klíčové lhůty a detaily.
              </p>
            </div>
            <div className="text-indigo-600 font-bold text-sm flex items-center gap-1 group-hover:translate-x-1 transition-transform">
              Vstoupit do dokumentu &rarr;
            </div>
          </motion.button>
        </div>

        <div className="bg-white border border-slate-200 rounded-3xl p-6 max-w-lg w-full mx-auto space-y-4 shadow-sm text-left">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-slate-400 uppercase tracking-wider flex items-center gap-1.5">
              <span className={`w-2 h-2 rounded-full ${googleUser ? 'bg-emerald-500 animate-pulse' : 'bg-slate-300'}`} />
              {googleUser ? 'Aktivní synchronizace Google' : 'Není přihlášen žádný účet'}
            </span>
            {isCloudSyncing && (
              <span className="text-[10px] text-indigo-500 font-semibold flex items-center gap-1">
                <Loader2 size={12} className="animate-spin" />
                Stahuji zálohu...
              </span>
            )}
          </div>

          {googleUser ? (
            <div className="space-y-4">
              <div className="flex items-center justify-between gap-3 bg-slate-50 p-3 rounded-2xl border border-slate-100">
                <div className="flex items-center gap-2.5">
                  {googleUser.picture ? (
                    <img src={googleUser.picture} alt="" className="w-10 h-10 rounded-full border border-slate-200 shadow-sm" referrerPolicy="no-referrer" />
                  ) : (
                    <div className="w-10 h-10 rounded-full bg-indigo-600 text-white font-bold flex items-center justify-center text-sm">
                      {googleUser.email.substring(0, 2).toUpperCase()}
                    </div>
                  )}
                  <div className="truncate">
                    <h4 className="text-sm font-bold text-slate-800 leading-normal">{googleUser.name}</h4>
                    <p className="text-xs text-slate-400 truncate max-w-[200px] leading-normal">{googleUser.email}</p>
                  </div>
                </div>
                <button
                  onClick={onLogout}
                  className="text-xs font-bold text-rose-500 hover:text-rose-600 hover:bg-rose-50 px-3 py-1.5 rounded-xl transition-all cursor-pointer whitespace-nowrap"
                >
                  Odhlásit
                </button>
              </div>

              {googleAccounts.length > 1 && (
                <div className="pt-2 border-t border-slate-100 space-y-2">
                  <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                    Uložené účty (Klepnutím přepnete):
                  </p>
                  <div className="flex flex-wrap gap-2">
                    {googleAccounts.map((acc, index) => {
                      const isActive = index === activeAccountIndex;
                      return (
                        <button
                          key={acc.user.email}
                          onClick={() => onSelectAccount(index)}
                          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold transition-all border cursor-pointer ${
                            isActive
                              ? 'bg-indigo-50 border-indigo-200 text-indigo-700 font-bold'
                              : 'bg-slate-50 border-slate-100 hover:bg-slate-100 text-slate-600'
                          }`}
                        >
                          {acc.user.picture && (
                            <img src={acc.user.picture} alt="" className="w-4 h-4 rounded-full" referrerPolicy="no-referrer" />
                          )}
                          <span className="truncate max-w-[120px]">{acc.user.name}</span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}

              <div className="pt-2 flex justify-between items-center gap-2">
                <button
                  onClick={() => {
                    if (!googleClientId.trim()) {
                      alert("Google přihlášení zatím není nakonfigurované. Doplňte prosím vlastní Client ID v nastavení.");
                      return;
                    }
                    onAddGoogleAccount(googleClientId.trim());
                  }}
                  className="text-xs font-bold text-indigo-600 hover:text-indigo-700 flex items-center gap-1 hover:underline cursor-pointer"
                >
                  + Přihlásit další Google účet
                </button>
                <span className="text-[10px] text-slate-400 font-semibold flex items-center gap-1">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                  Záloha zašifrována a uložena
                </span>
              </div>
            </div>
          ) : (
            <div className="space-y-4 py-2 text-center">
              <p className="text-xs text-slate-500 leading-relaxed">
                Pokud se přihlásíte se svým Google účtem, vaše účtenky a dokumenty se budou bezpečně ukládat do vašeho soukromého cloudu.
              </p>
              <div className="flex gap-3">
                <button
                  onClick={() => onNavigate('welcome')}
                  className="flex-1 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs rounded-xl shadow-sm transition-all cursor-pointer"
                >
                  Přihlásit se k Google
                </button>
                <button
                  onClick={() => onNavigate('settings')}
                  className="px-4 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs rounded-xl transition-all cursor-pointer"
                >
                  Nadefinovat Google Client ID
                </button>
              </div>
            </div>
          )}
        </div>

        <div className="flex flex-col items-center gap-4">
          <motion.button
            whileHover={{ scale: 1.02, y: -2 }}
            whileTap={{ scale: 0.98 }}
            onClick={() => onNavigate('settings')}
            className="inline-flex items-center gap-2.5 px-6 py-3 border border-slate-200 hover:border-indigo-400 bg-white hover:bg-slate-50 text-slate-700 font-bold text-sm shadow-sm hover:shadow-md rounded-2xl transition-all cursor-pointer"
          >
            <Settings size={16} className="text-indigo-600" />
            <span>Možnosti &amp; Pokročilé nastavení API</span>
          </motion.button>
        </div>

        <div className="text-xs text-slate-400 font-medium pt-4">
          Dokladovka by Pipap.cz &bull; Všechna práva vyhrazena. &copy; {new Date().getFullYear()} &bull; Data na Google Disku máte pod plnou kontrolou.
        </div>
      </div>
    </div>
  );
};

export default SelectionSection;
