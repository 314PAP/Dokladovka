import React, { useState, useMemo, useRef, useEffect } from 'react';
import { 
  Plus, 
  Upload, 
  Trash2, 
  FileText, 
  History, 
  PieChart, 
  CheckCircle2, 
  Loader2, 
  Camera,
  Maximize2,
  Stethoscope,
  Home,
  ArrowLeft,
  FolderOpen,
  ChevronDown,
  ChevronUp,
  Calendar,
  Download,
  AlertTriangle
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { exportDocumentsToPDF } from '../utils/pdfExport';
import { resizeAndCompressImage } from '../utils/imageCompressor';
import { getSmartFallbackDocument } from '../utils/smartFallback';
import { uploadPdfToGoogleDrive, createGoogleDocFromDocument } from '../utils/googleService';

interface DocumentItem {
  id: string;
  title: string;
  issuer: string;
  issueDate: string;
  category: string;
  summary: string;
  keyDetails: string[];
  imageUrl?: string;
  fileName?: string;
  fileSize?: number;
  isFallback?: boolean;
  fallbackError?: string;
}

interface DocQueueItem {
  id: string;
  name: string;
  status: 'queued' | 'compressing' | 'scanning' | 'done' | 'failed';
  error?: string;
  file?: File;
  virtualBase64?: string;
}

interface DuplicateConflict {
  id: string;
  file: File;
  existingItem: any;
  existingType: 'receipt' | 'document';
}

const DOCUMENT_CATEGORIES = [
  { id: 'HealthDoc', name: 'Zdravotní', icon: Stethoscope, color: 'bg-emerald-500', hoverColor: 'hover:border-emerald-500' },
  { id: 'LaborDoc', name: 'Pracovní úřad', icon: Home, color: 'bg-indigo-500', hoverColor: 'hover:border-indigo-500' },
  { id: 'SocialDoc', name: 'Sociální zabezpečení', icon: CheckCircle2, color: 'bg-cyan-500', hoverColor: 'hover:border-cyan-500' },
  { id: 'ContractDoc', name: 'Pracovní smlouvy', icon: FileText, color: 'bg-violet-500', hoverColor: 'hover:border-violet-500' },
  { id: 'OtherDoc', name: 'Ostatní', icon: FolderOpen, color: 'bg-amber-500', hoverColor: 'hover:border-amber-500' },
];

const mockDocChoices = [
  {
    title: 'Pracovní smlouva',
    issuer: 'ACME Corporation s.r.o.',
    category: 'Pracovní smlouvy',
    issueDate: '2026-01-15',
    summary: 'Oficiální pracovní smlouva pro pozici Hlavního vývojáře s dohodnutou hrubou mzdou a sjednanou zkušební dobou na dobu neurčitou.',
    keyDetails: ['Smlouva na dobu neurčitou', 'Zkušební doba 3 měsíce', 'Místo výkonu práce: Praha', 'Plný pracovní úvazek']
  },
  {
    title: 'Lékařská zpráva - ortopedie',
    issuer: 'Fakultní nemocnice - MUDr. Novák',
    category: 'Zdravotní',
    issueDate: '2026-05-10',
    summary: 'Ambulantní zpráva z kontrolního vyšetření pravého kolenního kloubu po předchozí lehké sportovní distorzi.',
    keyDetails: ['Kloub klidný bez patologického výpotku', 'Doporučena rehabilitace 6x', 'Šetřit kolenní kloub, lokálně ledovat', 'Kontrola za 14 dní v případě obtíží']
  },
  {
    title: 'Rozhodnutí o podpoře',
    issuer: 'Úřad práce ČR',
    category: 'Pracovní úřad',
    issueDate: '2026-04-20',
    summary: 'Rozhodnutí Úřadu práce ČR o splnění zákonných podmínek a přiznání podpory v nezaměstnanosti na stanovenou podpůrčí dobu.',
    keyDetails: ['Schváleno od 1. 5. 2026', 'Výše podpory: 18 450 Kč', 'Podpůrčí doba 5 měsíců', 'Povinnost hlásit veškeré změny do 8 dnů']
  },
  {
    title: 'Dávky nemocenského pojištění',
    issuer: 'Česká správa sociálního zabezpečení (ČSSZ)',
    category: 'Sociální zabezpečení',
    issueDate: '2026-03-12',
    summary: 'Oznámení o výpočtu denního vyměřovacího základu a přiznání výše dávky nemocenského pojištění během pracovní neschopnosti.',
    keyDetails: ['Denní vyměřovací základ: 620 Kč', 'Vypláceno od 15. kalendářního dne nemoci', 'Číslo účtu pro výplatu doručeno', 'Rozhodnutí schváleno']
  }
];

interface DocumentSectionProps {
  onBack: () => void;
  onPreviewImage: (src: string) => void;
  userApiKey?: string;
  googleAccessToken?: string | null;
  googleUser?: any;
  documents: DocumentItem[];
  setDocuments: React.Dispatch<React.SetStateAction<DocumentItem[]>>;
}

function FilePreview({ file }: { file: File }) {
  const [src, setSrc] = useState<string>('');
  useEffect(() => {
    const reader = new FileReader();
    reader.onloadend = () => {
      setSrc(reader.result as string);
    };
    reader.readAsDataURL(file);
  }, [file]);
  
  if (!src) {
    return (
      <div className="w-full h-40 bg-slate-100 flex items-center justify-center rounded-2xl border border-dashed border-slate-200">
        <Loader2 className="w-6 h-6 text-indigo-500 animate-spin" />
      </div>
    );
  }
  
  return (
    <img src={src} alt={file.name} className="w-full h-44 object-cover rounded-2xl border border-slate-200 shadow-sm animate-fade-in" referrerPolicy="no-referrer" />
  );
}

export default function DocumentSection({ 
  onBack, 
  onPreviewImage,
  userApiKey,
  googleAccessToken,
  googleUser,
  documents,
  setDocuments
}: DocumentSectionProps) {
  const [expandedDocId, setExpandedDocId] = useState<string | null>(null);
  const [isSavingDocId, setIsSavingDocId] = useState<string | null>(null);
  const [docDocUrls, setDocDocUrls] = useState<Record<string, string>>({});
  const [isUploadingArchive, setIsUploadingArchive] = useState(false);
  const [archiveUrl, setArchiveUrl] = useState<string | null>(null);
  const [isScanning, setIsScanning] = useState(false);
  const [scanningTotal, setScanningTotal] = useState(0);
  const [scanningIndex, setScanningIndex] = useState(0);
  const [docQueue, setDocQueue] = useState<DocQueueItem[]>([]);
  const [showManualForm, setShowManualForm] = useState(false);
  const [duplicateConflicts, setDuplicateConflicts] = useState<DuplicateConflict[]>([]);
  const [showQuotaWarning, setShowQuotaWarning] = useState(() => {
    return localStorage.getItem('gemini-quota-warning') === 'true';
  });

  // Synchronize `isScanning`, `scanningTotal`, `scanningIndex` with docQueue
  useEffect(() => {
    const active = docQueue.some(item => item.status === 'compressing' || item.status === 'scanning' || item.status === 'queued');
    setIsScanning(active);
    if (active) {
      setScanningTotal(docQueue.length);
      const doneOrFailedCount = docQueue.filter(item => item.status === 'done' || item.status === 'failed').length;
      setScanningIndex(doneOrFailedCount + 1);
    } else {
      setScanningTotal(0);
      setScanningIndex(0);
    }
  }, [docQueue]);

  const fallbackDocumentCreation = async (fileName: string, base64Image?: string, fileSize?: number, fallbackError?: string) => {
    const smartData = getSmartFallbackDocument(fileName, fileSize);
    
    // Set warning flag
    localStorage.setItem('gemini-quota-warning', 'true');
    setShowQuotaWarning(true);

    const errorText = fallbackError ? `: ${fallbackError}` : "vyčerpání limitu bezplatného API";

    const newDoc: DocumentItem = {
      id: 'DOC-' + Math.random().toString(36).substr(2, 9).toUpperCase(),
      title: smartData.title,
      issuer: smartData.issuer,
      issueDate: smartData.issueDate,
      category: smartData.category,
      summary: smartData.summary + ` (Poznámka: Aktivován lokální záložní režim. Důvod: ${errorText}).`,
      keyDetails: smartData.keyDetails,
      imageUrl: base64Image,
      fileName,
      fileSize,
      isFallback: true,
      fallbackError
    };
    setDocuments(prev => [newDoc, ...prev]);
  };

  // Background queue processing
  useEffect(() => {
    const currentActive = docQueue.find(item => item.status === 'compressing' || item.status === 'scanning');
    if (currentActive) {
      return; 
    }

    const nextItem = docQueue.find(item => item.status === 'queued');
    if (!nextItem) {
      return;
    }

    const processItem = async () => {
      setDocQueue(prev => prev.map(item => item.id === nextItem.id ? { ...item, status: 'compressing' } : item));

      let base64String = "";
      try {
        if (nextItem.virtualBase64) {
          base64String = await resizeAndCompressImage(nextItem.virtualBase64, 2048, 2048, 0.95);
        } else if (nextItem.file) {
          const rawBase64 = await new Promise<string>((resolve, reject) => {
            const reader = new FileReader();
            reader.onloadend = () => resolve(reader.result as string);
            reader.onerror = () => reject(new Error("Failed to read file"));
            reader.readAsDataURL(nextItem.file!);
          });
          
          base64String = await resizeAndCompressImage(rawBase64, 2048, 2048, 0.95);
        } else {
          throw new Error("Žádná data k doložení");
        }

        setDocQueue(prev => prev.map(item => item.id === nextItem.id ? { ...item, status: 'scanning' } : item));

        await performDocumentExtraction(base64String, nextItem.name, nextItem.file?.size);

        setDocQueue(prev => prev.map(item => item.id === nextItem.id ? { ...item, status: 'done' } : item));
      } catch (err: any) {
        console.warn("Queue process used fallback for item:", nextItem.name, err?.message || err);
        setDocQueue(prev => prev.map(item => item.id === nextItem.id ? { ...item, status: 'failed', error: err.message || "Chyba" } : item));
        
        await fallbackDocumentCreation(
          nextItem.name, 
          base64String || nextItem.virtualBase64 || undefined, 
          nextItem.file?.size,
          err?.message || String(err)
        );
        setDocQueue(prev => prev.map(item => item.id === nextItem.id ? { ...item, status: 'done' } : item));
      } finally {
        await new Promise(resolve => setTimeout(resolve, 350));
      }
    };

    processItem();
  }, [docQueue]);

  const handleSaveToGoogleDocs = async (docItem: DocumentItem) => {
    if (!googleAccessToken) return;
    setIsSavingDocId(docItem.id);
    try {
      const res = await createGoogleDocFromDocument(googleAccessToken, {
        title: docItem.title,
        issuer: docItem.issuer,
        issueDate: docItem.issueDate,
        category: docItem.category,
        summary: docItem.summary || "Bez AI popisu.",
        keyDetails: docItem.keyDetails || []
      });
      setDocDocUrls(prev => ({
        ...prev,
        [docItem.id]: res.url
      }));
      alert(`Dokument "${docItem.title}" byl úspěšně uložen do Google Dokumentů.`);
    } catch (err: any) {
      console.error(err);
      alert(`Uložení do Google Dokumentů selhalo: ${err?.message || String(err)}`);
    } finally {
      setIsSavingDocId(null);
    }
  };

  const handleUploadArchiveToDrive = async () => {
    if (!googleAccessToken) return;
    setIsUploadingArchive(true);
    setArchiveUrl(null);
    try {
      const doc = exportDocumentsToPDF(sortedDocuments, filterFromDate, filterToDate);
      if (!doc) {
        throw new Error("Nepodařilo se vygenerovat PDF dokument.");
      }
      
      const pdfBlob = doc.output("blob");
      const fileName = `Archiv_Dokumentu_${filterFromDate || "vse"}_do_${filterToDate || "dnes"}.pdf`;
      
      const uploadRes = await uploadPdfToGoogleDrive(googleAccessToken, pdfBlob, fileName);
      setArchiveUrl(uploadRes.url);
      alert(`Archiv byl úspěšně nahrán na váš Disk!`);
    } catch (err: any) {
      console.error(err);
      alert(`Nahrání archivu na Disk selhalo: ${err?.message || String(err)}`);
    } finally {
      setIsUploadingArchive(false);
    }
  };

  const [selectedDocCategory, setSelectedDocCategory] = useState<string | null>(null);
  const [expandedDocIds, setExpandedDocIds] = useState<Record<string, boolean>>({});
  const [filterFromDate, setFilterFromDate] = useState<string>('');
  const [filterToDate, setFilterToDate] = useState<string>('');

  const toggleExpand = (id: string, e?: React.MouseEvent) => {
    if (e) {
      e.stopPropagation();
    }
    setExpandedDocIds(prev => ({
      ...prev,
      [id]: !prev[id]
    }));
  };

  const fileInputRef = useRef<HTMLInputElement>(null);
  const nativeCameraRef = useRef<HTMLInputElement>(null);

  // Manual input form states
  const [docTitle, setDocTitle] = useState('');
  const [docIssuer, setDocIssuer] = useState('');
  const [docCategory, setDocCategory] = useState(DOCUMENT_CATEGORIES[0].name);
  const [docDate, setDocDate] = useState(new Date().toISOString().split('T')[0]);
  const [docSummary, setDocSummary] = useState('');
  const [docDetailsRaw, setDocDetailsRaw] = useState('');

  // Helper to merge documents securely (avoid duplicates by ID)
  const mergeDocuments = (local: DocumentItem[], server: DocumentItem[]) => {
    const map = new Map<string, DocumentItem>();
    local.forEach(d => map.set(d.id, d));
    server.forEach(d => map.set(d.id, d));
    return Array.from(map.values());
  };

  // Sync documents with backend on mount
  useEffect(() => {
    let active = true;
    const syncDocuments = async () => {
      try {
        const response = await fetch("/api/db/documents");
        if (response.ok && active) {
          const serverDocs = await response.json();
          if (Array.isArray(serverDocs)) {
            setDocuments(prev => {
              const merged = mergeDocuments(prev, serverDocs);
              // Save merged list to localStorage
              localStorage.setItem('smart-documents', JSON.stringify(merged));
              // Save merged list back to backend to keep both strictly in sync
              if (merged.length !== serverDocs.length || merged.length !== prev.length) {
                fetch("/api/db/documents", {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({ documents: merged }),
                }).catch(err => console.error("Failed to back-sync merged documents to backend", err));
              }
              return merged;
            });
          }
        }
      } catch (err) {
        console.error("Failed to retrieve documents from backend database:", err);
      }
    };
    syncDocuments();
    return () => { active = false; };
  }, []);

  // Local storage & server-side persistence with safe quota catch and debounce
  useEffect(() => {
    try {
      localStorage.setItem('smart-documents', JSON.stringify(documents));
    } catch (e) {
      console.warn("Storage quota exceeded. Storing text metadata locally to avoid page crash.", e);
      try {
        const textOnlyDocs = documents.map(d => ({ ...d, imageUrl: undefined }));
        localStorage.setItem('smart-documents', JSON.stringify(textOnlyDocs));
      } catch (err) {
        console.error("Failsafe local storage write failed:", err);
      }
    }
    
    // Debounced server save to prevent massive concurrent requests during batch uploads
    const timeoutId = setTimeout(() => {
      fetch("/api/db/documents", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ documents }),
      }).catch(err => console.error("Error backing up documents to backend:", err));
    }, 1200);

    return () => clearTimeout(timeoutId);
  }, [documents]);

  const filteredDocuments = useMemo(() => {
    return documents.filter(d => {
      if (filterFromDate && d.issueDate < filterFromDate) return false;
      if (filterToDate && d.issueDate > filterToDate) return false;
      return true;
    });
  }, [documents, filterFromDate, filterToDate]);

  const sortedDocuments = useMemo(() => {
    return [...filteredDocuments].sort((a, b) => new Date(b.issueDate).getTime() - new Date(a.issueDate).getTime());
  }, [filteredDocuments]);

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      const filesCount = e.target.files.length;
      const newItems: DocQueueItem[] = [];
      const conflicts: DuplicateConflict[] = [];

      for (let i = 0; i < filesCount; i++) {
        const file = e.target.files[i];
        if (!file) continue;

        // Check if there's an existing document with the same name or size
        const conflict = documents.find(d => 
          d.fileName === file.name || 
          (d.fileSize && d.fileSize === file.size)
        );

        if (conflict) {
          conflicts.push({
            id: 'CONFL-' + Math.random().toString(36).substr(2, 9).toUpperCase(),
            file,
            existingItem: conflict,
            existingType: 'document'
          });
        } else {
          newItems.push({
            id: 'DQ-' + Math.random().toString(36).substr(2, 9).toUpperCase(),
            name: file.name,
            status: 'queued',
            file: file
          });
        }
      }

      if (newItems.length > 0) {
        setDocQueue(prev => [...prev, ...newItems]);
      }

      if (conflicts.length > 0) {
        setDuplicateConflicts(prev => [...prev, ...conflicts]);
      }

      if (e.target) e.target.value = '';
    }
  };

  const performDocumentExtraction = async (base64Image: string, fileName?: string, fileSize?: number) => {
    const headers: Record<string, string> = { "Content-Type": "application/json" };
    if (userApiKey) {
      headers["x-gemini-key"] = userApiKey;
    }
    // Call backend processing endpoint
    const response = await fetch("/api/extract-document", {
      method: "POST",
      headers,
      body: JSON.stringify({ image: base64Image }),
    });

    if (!response.ok) {
      let errorMsg = "Failed to extract document";
      try {
        const errData = await response.json();
        if (errData && errData.message) {
          errorMsg += `: ${errData.message}`;
        }
      } catch (_) {}
      throw new Error(errorMsg);
    }

    const data = await response.json();
    if (data.isFallback) {
      throw new Error(data.message || data.error || "Server fallback mode");
    }

    const newDoc: DocumentItem = {
      id: 'DOC-' + Math.random().toString(36).substr(2, 9).toUpperCase(),
      title: data.title || fileName || "Naskenovaný dokument",
      issuer: data.issuer || "Neznámý vydavatel",
      issueDate: data.issueDate || new Date().toISOString().split('T')[0],
      category: data.category || "Ostatní",
      summary: "",
      keyDetails: [],
      imageUrl: base64Image,
      fileName,
      fileSize
    };
    setDocuments(prev => [newDoc, ...prev]);
  };

  const sendToDocumentScanner = async (base64Image?: string) => {
    if (base64Image) {
      const virtualId = 'Q-CAM-' + Math.random().toString(36).substr(2, 9).toUpperCase();
      setDocQueue(prev => [...prev, {
        id: virtualId,
        name: `Fotka z fotoaparátu (${new Date().toLocaleTimeString('cs-CZ')}).jpg`,
        status: 'queued',
        virtualBase64: base64Image
      }]);
    } else {
      // Offline / mock fallback trigger
      setScanningTotal(1);
      setScanningIndex(1);
      setIsScanning(true);
      await new Promise(resolve => setTimeout(resolve, 1500));
      const choice = mockDocChoices[Math.floor(Math.random() * mockDocChoices.length)];
      const newDoc: DocumentItem = {
        id: 'DOC-' + Math.random().toString(36).substr(2, 9).toUpperCase(),
        title: choice.title,
        issuer: choice.issuer,
        issueDate: choice.issueDate,
        category: choice.category,
        summary: choice.summary,
        keyDetails: choice.keyDetails
      };
      setDocuments(prev => [newDoc, ...prev]);
      setIsScanning(false);
      setScanningTotal(0);
      setScanningIndex(0);
    }
  };

  const addManualDocument = (e: React.FormEvent) => {
    e.preventDefault();
    if (!docTitle || !docIssuer) return;

    const keyDetails = docDetailsRaw 
      ? docDetailsRaw.split(',').map(item => item.trim()).filter(Boolean)
      : ["Ručně vytvořený záznam"];

    const newDoc: DocumentItem = {
      id: 'DOC-' + Math.random().toString(36).substr(2, 9).toUpperCase(),
      title: docTitle,
      issuer: docIssuer,
      issueDate: docDate,
      category: docCategory,
      summary: docSummary || "Manuálně zadaný osobní dokument.",
      keyDetails: keyDetails
    };

    setDocuments(prev => [newDoc, ...prev]);
    setDocTitle('');
    setDocIssuer('');
    setDocCategory(DOCUMENT_CATEGORIES[0].name);
    setDocDate(new Date().toISOString().split('T')[0]);
    setDocSummary('');
    setDocDetailsRaw('');
    setShowManualForm(false);
  };

  const deleteDocument = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setDocuments(prev => prev.filter(d => d.id !== id));
  };

  return (
    <div className="space-y-8 animate-fade-in">
      {/* Navigation Top bar */}
      <div className="flex items-center justify-between">
        <button
          onClick={onBack}
          className="flex items-center gap-2 text-sm font-semibold text-slate-500 hover:text-indigo-600 transition-colors bg-white px-4 py-2 rounded-xl border border-slate-200 shadow-sm cursor-pointer"
        >
          <ArrowLeft size={16} />
          Zpět na výběr sekce
        </button>
        <span className="text-xs font-bold uppercase text-slate-400 tracking-wider">
          Sekce: Osobní a úřední dokumenty
        </span>
      </div>

      {/* Quota limit warning banner */}
      {showQuotaWarning && (
        <motion.div 
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          className="bg-amber-50 rounded-3xl p-5 border border-amber-200/80 shadow-sm flex flex-col md:flex-row items-start md:items-center justify-between gap-4 text-left font-sans text-slate-800"
        >
          <div className="flex gap-4">
            <span className="p-3 bg-amber-100 text-amber-600 rounded-2xl flex-shrink-0 self-start md:self-center">
              <AlertTriangle size={20} />
            </span>
            <div className="space-y-1">
              <h4 className="text-sm font-bold text-slate-950">Aktivován lokální záložní režim (Limit API překročen)</h4>
              <p className="text-xs text-slate-600 leading-relaxed max-w-2xl">
                Byl vyčerpán bezplatný limit požadavků pro Gemini API. Abychom vám umožnili aplikaci nadále testovat, 
                systém automaticky generuje <strong>inteligentní náhledy na základě názvů nahraných souborů</strong>.
                Pro plnou podporu naskenovaných dat s reálným OCR si můžete kdykoliv vložit vlastní API klíč v levém dolním menu pod ozubeným kolečkem.
              </p>
            </div>
          </div>
          <button 
            type="button" 
            onClick={() => {
              localStorage.removeItem('gemini-quota-warning');
              setShowQuotaWarning(false);
            }}
            className="text-xs font-bold text-slate-400 hover:text-slate-600 px-3 py-1.5 rounded-lg hover:bg-amber-100/50 transition-all cursor-pointer whitespace-nowrap self-end md:self-auto bg-transparent border-0"
          >
            Skrýt upozornění
          </button>
        </motion.div>
      )}

      {/* Header */}
      <header className="flex flex-col sm:flex-row sm:items-start justify-between gap-6">
        <div className="text-left">
          <h1 className="text-3xl font-bold tracking-tight text-slate-900 flex items-center gap-3">
            <span className="p-2.5 bg-indigo-600 rounded-2xl text-white shadow-lg shadow-indigo-100">
              <FolderOpen size={24} />
            </span>
            Osobní Dokumenty
          </h1>
          <p className="text-slate-500 mt-2 text-sm md:text-base">Mějte bezpečný přehled o všech smlouvách, lékařských či úředních zprávách.</p>
        </div>
        <div className="flex flex-col xs:flex-row flex-wrap gap-3 w-full sm:w-auto">
          <button 
            onClick={() => setShowManualForm(!showManualForm)}
            className="flex-1 sm:flex-none flex items-center justify-center gap-2 px-5 py-3 bg-white border border-slate-200 rounded-2xl hover:bg-slate-50 transition-all shadow-sm font-medium text-sm"
          >
            <Plus size={18} />
            <span>Ruční záznam</span>
          </button>
          <button 
            onClick={() => fileInputRef.current?.click()}
            className="flex-1 sm:flex-none flex items-center justify-center gap-2 px-5 py-3 bg-indigo-50 border border-indigo-100 text-indigo-600 rounded-2xl hover:bg-indigo-100 transition-all shadow-sm font-medium text-sm"
          >
            <Upload size={18} />
            <span>Z galerie</span>
          </button>
          <button 
            onClick={() => nativeCameraRef.current?.click()}
            className="flex-1 sm:flex-none flex items-center justify-center gap-2 px-5 py-3 bg-indigo-600 text-white rounded-2xl hover:bg-indigo-700 transition-all shadow-md shadow-indigo-100 font-medium text-sm"
          >
            <Camera size={18} />
            <span>Nafotit doložení</span>
          </button>
          <input 
            type="file" 
            ref={fileInputRef} 
            onChange={handleFileUpload} 
            className="hidden" 
            accept="image/*"
            multiple
          />
          <input 
            type="file" 
            ref={nativeCameraRef} 
            onChange={handleFileUpload} 
            className="hidden" 
            accept="image/*"
            capture="environment"
          />
        </div>
      </header>

      {/* Loader */}
      <AnimatePresence>
        {isScanning && (
          <motion.div 
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95 }}
            className="bg-indigo-900 text-white rounded-3xl p-8 flex flex-col items-center justify-center text-center relative overflow-hidden"
          >
            <div className="relative z-10 space-y-4">
              <div className="bg-indigo-500/20 p-4 rounded-full inline-block">
                <div className="relative">
                  <Loader2 size={48} className="animate-spin text-indigo-100" />
                </div>
              </div>
              <h2 className="text-xl font-bold">
                {scanningTotal > 1 
                  ? `Čtení dokumentů (${scanningIndex}/${scanningTotal})...`
                  : "Chytré čtení dokumentu..."
                }
              </h2>
              <p className="text-indigo-100 max-w-sm font-medium text-sm">
                {scanningTotal > 1
                  ? "Naše AI postupně zpracovává a samostatně analyzuje nahrané dokumenty. Výsledky se doplňují průběžně."
                  : "Naše AI provádí hloubkovou analýzu, sepisuje shrnutí obsahu a vyhledává klíčové informace doložení."
                }
              </p>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Fronta nahrávání a zpracování */}
      {docQueue.length > 0 && (
        <div className="bg-white border-2 border-indigo-100 rounded-3xl p-6 shadow-sm space-y-4">
          <div className="flex items-center justify-between border-b border-indigo-50 pb-3">
            <h3 className="font-bold text-slate-900 flex items-center gap-2 text-sm md:text-base">
              <span className="relative flex h-3 w-3">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-indigo-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-3 w-3 bg-indigo-600"></span>
              </span>
              Fronta zpracování dokumentů ({docQueue.filter(q => q.status === 'done' || q.status === 'failed').length} / {docQueue.length} hotovo)
            </h3>
            {docQueue.every(q => q.status === 'done' || q.status === 'failed') && (
              <button 
                onClick={() => setDocQueue([])}
                className="text-xs text-indigo-600 hover:text-indigo-800 font-bold hover:underline cursor-pointer"
              >
                Vyčistit frontu
              </button>
            )}
          </div>
          
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3 max-h-60 overflow-y-auto pr-1">
            {docQueue.map(item => (
              <div 
                key={item.id} 
                className={`p-3 rounded-xl border flex items-center justify-between gap-3 text-xs transition-all ${
                  item.status === 'done' ? 'bg-emerald-50 border-emerald-100' :
                  item.status === 'failed' ? 'bg-red-50 border-red-100' :
                  item.status === 'scanning' ? 'bg-indigo-50 border-indigo-200 animate-pulse' :
                  item.status === 'compressing' ? 'bg-amber-50 border-amber-200' :
                  'bg-slate-50 border-slate-100'
                }`}
              >
                <div className="flex items-center gap-2 min-w-0 flex-1">
                  <FileText size={16} className={
                    item.status === 'done' ? 'text-emerald-500' :
                    item.status === 'failed' ? 'text-red-500' :
                    item.status === 'scanning' ? 'text-indigo-500 animate-spin' :
                    'text-slate-400'
                  } />
                  <span className="font-semibold text-slate-700 truncate block" title={item.name}>
                    {item.name}
                  </span>
                </div>
                
                <span className={`px-2.5 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider shrink-0 whitespace-nowrap ${
                  item.status === 'done' ? 'bg-emerald-500 text-white' :
                  item.status === 'failed' ? 'bg-red-500 text-white' :
                  item.status === 'scanning' ? 'bg-indigo-600 text-white' :
                  item.status === 'compressing' ? 'bg-amber-500 text-white' :
                  'bg-slate-300 text-slate-700'
                }`}>
                  {item.status === 'done' ? 'Hotovo' :
                   item.status === 'failed' ? 'Chyba' :
                   item.status === 'scanning' ? 'AI Sken...' :
                   item.status === 'compressing' ? 'Komprese' :
                   'Čeká'}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Manual document Form */}
      <AnimatePresence>
        {showManualForm && (
          <motion.div 
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="overflow-hidden"
          >
            <form onSubmit={addManualDocument} className="bg-white border border-slate-200 rounded-3xl p-6 shadow-sm space-y-4">
              <h3 className="font-semibold text-lg">Zadat osobní dokument ručně</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                <div className="space-y-1">
                  <label className="text-xs font-medium text-slate-500 uppercase">Název doložení / dokumentu</label>
                  <input 
                    type="text" 
                    required
                    value={docTitle}
                    onChange={e => setDocTitle(e.target.value)}
                    placeholder="Např. Lékařská zpráva" 
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none transition-all text-sm"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-medium text-slate-500 uppercase">Vydavatel / Původce</label>
                  <input 
                    type="text" 
                    required
                    value={docIssuer}
                    onChange={e => setDocIssuer(e.target.value)}
                    placeholder="ČSSZ, Úřad práce, VZP..." 
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none transition-all text-sm"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-medium text-slate-500 uppercase">Kategorie</label>
                  <select 
                    value={docCategory}
                    onChange={e => setDocCategory(e.target.value)}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none transition-all text-sm"
                  >
                    {DOCUMENT_CATEGORIES.map(cat => <option key={cat.id} value={cat.name}>{cat.name}</option>)}
                  </select>
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-medium text-slate-500 uppercase">Datum doložení / vydání</label>
                  <input 
                    type="date" 
                    value={docDate}
                    onChange={e => setDocDate(e.target.value)}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none transition-all text-sm"
                  />
                </div>
                <div className="space-y-1 lg:col-span-2">
                  <label className="text-xs font-medium text-slate-500 uppercase">Klíčové body (oddělit čárkou)</label>
                  <input 
                    type="text" 
                    value={docDetailsRaw}
                    onChange={e => setDocDetailsRaw(e.target.value)}
                    placeholder="Např. Kontrola v únoru, Platnost na neurčito, Schválen příspěvek" 
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none transition-all text-sm"
                  />
                </div>
                <div className="space-y-1 lg:col-span-3">
                  <label className="text-xs font-medium text-slate-500 uppercase">Stručné shrnutí obsahu doložení</label>
                  <textarea 
                    value={docSummary}
                    onChange={e => setDocSummary(e.target.value)}
                    placeholder="Stručně popište podstatu dokumentu doložení..." 
                    rows={2}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none transition-all text-sm resize-none"
                  />
                </div>
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <button 
                  type="button"
                  onClick={() => setShowManualForm(false)}
                  className="px-4 py-2 text-slate-600 hover:bg-slate-100 rounded-lg transition-colors text-sm font-medium"
                >
                  Zrušit
                </button>
                <button 
                  type="submit"
                  className="px-6 py-2 bg-slate-900 text-white rounded-lg hover:bg-slate-800 transition-colors text-sm font-medium"
                >
                  Uložit doložení
                </button>
              </div>
            </form>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Document Stats Widgets */}
      <section className="grid grid-cols-1 lg:grid-cols-3 gap-4 md:gap-6">
        <div className="bg-white p-5 md:p-8 rounded-[32px] border border-slate-200 shadow-sm col-span-1 lg:col-span-2">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-6">
            <h2 className="font-semibold text-lg flex items-center gap-2">
              <PieChart size={20} className="text-indigo-600" />
              Rozdělení dokumentů
            </h2>
            <span className="text-2xl md:text-3xl font-bold text-slate-900">{documents.length} ks</span>
          </div>
          
          <div className="space-y-5">
            {DOCUMENT_CATEGORIES.map(cat => {
              const count = documents.filter(d => d.category.trim().toLowerCase() === cat.name.toLowerCase()).length;
              const percentage = documents.length > 0 ? (count / documents.length) * 100 : 0;
              
              return (
                <button 
                  key={cat.id} 
                  onClick={() => setSelectedDocCategory(cat.name)}
                  className="w-full text-left space-y-1 group cursor-pointer"
                >
                  <div className="flex justify-between text-sm">
                    <span className="flex items-center gap-2 text-slate-600 group-hover:text-indigo-600 transition-colors">
                      <cat.icon size={14} className="text-slate-400 group-hover:text-indigo-400" />
                      {cat.name}
                    </span>
                    <span className="font-medium group-hover:text-indigo-600 transition-colors">{count} ks</span>
                  </div>
                  <div className="h-2 w-full bg-slate-100 rounded-full overflow-hidden">
                    <motion.div 
                      initial={{ width: 0 }}
                      animate={{ width: `${percentage}%` }}
                      className={`h-full ${cat.color}`}
                      transition={{ duration: 1, ease: "easeOut" }}
                    />
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        <div className="bg-indigo-600 p-6 rounded-3xl text-white flex flex-col justify-between shadow-lg shadow-indigo-100">
          <div>
            <div className="bg-white/20 p-2 rounded-lg inline-block mb-3">
              <CheckCircle2 size={24} />
            </div>
            <h3 className="text-lg font-medium opacity-90">Skenování aktivní</h3>
            <p className="text-3xl font-bold mt-1">{documents.length} <span className="text-lg font-normal opacity-75">složek</span></p>
          </div>
          <p className="text-sm opacity-80 mt-4">
            Nahrajte zdravotní posudky, smlouvy nebo doložení. AI automaticky provede sumarizaci a vyhledá klíčové parametry.
          </p>
        </div>
      </section>

      {/* Period selection & Export controls */}
      <div className="bg-white border border-slate-200 p-6 rounded-3xl flex flex-col md:flex-row gap-5 items-center justify-between shadow-xs">
        <div className="flex flex-col sm:flex-row gap-4 items-center w-full md:w-auto">
          <div className="flex items-center gap-2 text-slate-700 font-semibold text-sm whitespace-nowrap self-start sm:self-auto">
            <Calendar size={18} className="text-emerald-600" />
            <span>Zvolené období pro archiv:</span>
          </div>
          
          <div className="flex items-center gap-2.5 w-full sm:w-auto">
            <div className="relative w-full sm:w-36">
              <span className="absolute left-3 top-2.5 text-[9px] font-bold text-slate-400 tracking-wider uppercase">Od</span>
              <input 
                type="date"
                value={filterFromDate}
                onChange={(e) => setFilterFromDate(e.target.value)}
                className="w-full pl-9 pr-2.5 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs focus:outline-none focus:ring-2 focus:ring-emerald-500 text-slate-750 font-medium"
              />
            </div>
            
            <span className="text-slate-400 font-bold">—</span>
            
            <div className="relative w-full sm:w-36">
              <span className="absolute left-3 top-2.5 text-[9px] font-bold text-slate-400 tracking-wider uppercase">Do</span>
              <input 
                type="date"
                value={filterToDate}
                onChange={(e) => setFilterToDate(e.target.value)}
                className="w-full pl-9 pr-2.5 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs focus:outline-none focus:ring-2 focus:ring-emerald-500 text-slate-755 font-medium"
              />
            </div>
            
            {(filterFromDate || filterToDate) && (
              <button 
                onClick={() => { setFilterFromDate(''); setFilterToDate(''); }}
                className="text-xs text-red-500 hover:text-red-700 font-bold hover:underline cursor-pointer px-2 py-1 shrink-0"
              >
                Smazat
              </button>
            )}
          </div>
        </div>
        
        <div className="flex flex-col sm:flex-row gap-3 w-full md:w-auto shrink-0 items-center">
          {archiveUrl && (
            <div className="text-xs text-emerald-600 font-bold bg-emerald-50 px-3.5 py-2 rounded-xl border border-emerald-150 flex items-center gap-1 mr-2 animate-fade-in shrink-0">
              <span>Archiv uložen!</span>
              <a href={archiveUrl} target="_blank" rel="noreferrer" className="underline hover:text-emerald-800 font-medium">
                Otevřít Disk &rarr;
              </a>
            </div>
          )}

          <button
            onClick={() => exportDocumentsToPDF(sortedDocuments, filterFromDate, filterToDate)}
            disabled={sortedDocuments.length === 0}
            className="w-full sm:w-auto flex items-center justify-center gap-2 px-6 py-3 bg-slate-900 hover:bg-slate-800 disabled:opacity-50 disabled:cursor-not-allowed text-white rounded-2xl font-semibold text-sm shadow-md transition-all cursor-pointer whitespace-nowrap shrink-0"
          >
            <Download size={16} />
            <span>Exportovat archiv (PDF)</span>
          </button>
          
          {googleAccessToken && (
            <button
              onClick={handleUploadArchiveToDrive}
              disabled={sortedDocuments.length === 0 || isUploadingArchive}
              className="w-full sm:w-auto flex items-center justify-center gap-2 px-5 py-3 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 disabled:cursor-not-allowed text-white rounded-2xl font-semibold text-sm shadow-md transition-all cursor-pointer whitespace-nowrap shrink-0 border border-emerald-500"
            >
              {isUploadingArchive ? (
                <Loader2 size={16} className="animate-spin" />
              ) : (
                <FolderOpen size={16} />
              )}
              <span>Nahrát na Google Disk</span>
            </button>
          )}
        </div>
      </div>

      {/* Documents Grid / Main List */}
      <section className="bg-white rounded-3xl border border-slate-200 shadow-sm overflow-hidden p-6 space-y-4">
        <div className="pb-4 border-b border-slate-100 flex items-center justify-between">
          <h2 className="font-semibold text-lg flex items-center gap-2">
            <History size={20} className="text-indigo-600" />
            Všechny složené dokumenty
          </h2>
          <span className="text-[10px] md:text-xs font-medium text-slate-500 uppercase tracking-wider bg-slate-100 px-2.5 py-1 rounded-full">
            Zobrazeno {sortedDocuments.length} z {documents.length}
          </span>
        </div>

        {sortedDocuments.length === 0 ? (
          <div className="py-12 text-center text-slate-400 italic">
            Zatím nemáte žádné naskenované dokumenty. Nahrajte z galerie nebo vyfoťte.
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {sortedDocuments.map(doc => {
              const catObj = DOCUMENT_CATEGORIES.find(c => c.name.toLowerCase() === doc.category.trim().toLowerCase());
              return (
                <motion.div 
                  key={doc.id}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="bg-slate-50 border border-slate-200/60 rounded-2xl p-5 flex flex-col justify-between space-y-4 shadow-sm"
                >
                  <div className="space-y-3">
                    <div className="flex justify-between items-start gap-2">
                      <div className="flex items-start gap-3">
                        {doc.imageUrl && (
                          <button 
                            type="button"
                            onClick={() => onPreviewImage(doc.imageUrl || '')}
                            className="relative group cursor-zoom-in shrink-0"
                          >
                            <img 
                              src={doc.imageUrl} 
                              alt="Scan" 
                              className="w-12 h-12 rounded-lg object-cover border border-slate-200 shadow-xs"
                            />
                            <div className="absolute inset-0 bg-black/0 group-hover:bg-black/20 rounded-lg flex items-center justify-center transition-all">
                              <Maximize2 size={12} className="text-white opacity-0 group-hover:opacity-100" />
                            </div>
                          </button>
                        )}
                        <div>
                          <h3 className="font-bold text-slate-900 text-sm md:text-base flex flex-wrap items-center gap-1.5 leading-tight">
                            {doc.title}
                            {doc.isFallback && (
                              <span 
                                title={doc.fallbackError ? `Chyba API: ${doc.fallbackError}` : "Zapnut automatický záložní režim pro úsporu tokenů"}
                                className="inline-flex items-center gap-0.5 px-1.5 py-0.5 bg-amber-50 text-[10px] font-bold text-amber-600 rounded-lg border border-amber-100 cursor-help"
                              >
                                {doc.fallbackError ? "Simulováno (Chyba API)" : "Simulováno (API Quota Limit)"}
                              </span>
                            )}
                          </h3>
                          <p className="text-xs text-slate-500 font-medium">{doc.issuer}</p>
                        </div>
                      </div>
                      <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider ${
                        catObj?.color.replace('bg-', 'bg-opacity-10 text-') || 'bg-slate-100 text-slate-600'
                      } ${
                        catObj?.color.replace('bg-', 'text-')
                      }`}>
                        {doc.category}
                      </span>
                    </div>

                    <div className="flex justify-between text-xs text-slate-400">
                      <span>ID: {doc.id}</span>
                      <span>Vydáno: {new Date(doc.issueDate).toLocaleDateString('cs-CZ')}</span>
                    </div>

                    {/* Collapsible Details Panel */}
                    {expandedDocId === doc.id && (
                      <div className="bg-slate-50 rounded-2xl p-4 mt-3 border border-slate-200/50 text-xs text-slate-600 space-y-3.5">
                        {doc.summary && (
                          <div>
                            <div className="font-bold text-slate-700 uppercase tracking-wide text-[9px] mb-1">AI Souhrn obsahu</div>
                            <p className="leading-relaxed">{doc.summary}</p>
                          </div>
                        )}
                        {doc.keyDetails && doc.keyDetails.length > 0 && (
                          <div>
                            <div className="font-bold text-slate-700 uppercase tracking-wide text-[9px] mb-1">Klíčové parametry doložení</div>
                            <ul className="list-disc pl-4 space-y-1">
                              {doc.keyDetails.map((detail, idx) => (
                                <li key={idx}>{detail}</li>
                              ))}
                            </ul>
                          </div>
                        )}
                        
                        {/* Google Docs button */}
                        {googleAccessToken ? (
                          <div className="pt-2.5 border-t border-slate-200/60 flex items-center justify-between gap-2">
                            <button
                              onClick={() => handleSaveToGoogleDocs(doc)}
                              disabled={isSavingDocId === doc.id}
                              className="flex items-center gap-1.5 px-3 py-1.5 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white rounded-lg font-bold text-[10px] transition-colors cursor-pointer"
                            >
                              {isSavingDocId === doc.id ? "Ukládám..." : "Uložit do Google Dokumentů"}
                            </button>
                            
                            {docDocUrls[doc.id] && (
                              <a 
                                href={docDocUrls[doc.id]} 
                                target="_blank" 
                                rel="noreferrer"
                                className="text-[10px] text-emerald-600 hover:underline font-bold"
                              >
                                Otevřít dokument &rarr;
                              </a>
                            )}
                          </div>
                        ) : (
                          <p className="text-[10px] text-slate-400 italic pt-1 border-t border-slate-200/40">
                            Pro uložení doložení jako Google Dokument se nejprve přihlaste ve vašem nastavení.
                          </p>
                        )}
                      </div>
                    )}
                  </div>

                  <div className="flex justify-between items-center pt-3 border-t border-slate-200/40">
                    <button 
                      onClick={() => setExpandedDocId(expandedDocId === doc.id ? null : doc.id)}
                      className="text-xs text-indigo-600 hover:text-indigo-800 font-bold flex items-center gap-1 cursor-pointer"
                    >
                      {expandedDocId === doc.id ? "Skrýt detaily" : "Zobrazit AI detaily"}
                    </button>
                    
                    <button 
                      onClick={(e) => deleteDocument(doc.id, e)}
                      className="p-1.5 text-red-500 hover:bg-red-50 hover:text-red-700 rounded-lg transition-colors text-xs font-semibold flex items-center gap-1.5 cursor-pointer"
                    >
                      <Trash2 size={13} /> Odstranit doložení
                    </button>
                  </div>
                </motion.div>
              );
            })}
          </div>
        )}
      </section>

      {/* Document Category Details Folder View */}
      <AnimatePresence>
        {selectedDocCategory && (
          <motion.div 
            initial={{ opacity: 0, x: '100%' }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: '100%' }}
            className="fixed inset-0 z-40 bg-slate-50 flex flex-col p-4 md:p-8 md:pt-12 overflow-y-auto"
          >
            <div className="max-w-4xl mx-auto w-full space-y-8">
              <div className="flex items-center justify-between">
                <button 
                  onClick={() => setSelectedDocCategory(null)}
                  className="flex items-center gap-2 text-indigo-600 font-medium hover:translate-x-[-4px] transition-transform cursor-pointer text-sm"
                >
                  <ArrowLeft size={18} />
                  Zpět na přehled doložení
                </button>
                <h2 className="text-2xl font-bold">{selectedDocCategory}</h2>
              </div>

              <div className="bg-white p-8 rounded-3xl border border-slate-200 shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-6">
                <div>
                  <div className="text-xs font-medium text-slate-400 uppercase tracking-wider mb-1">Počet doložení v této složce</div>
                  <div className="text-3xl font-black text-slate-950">
                    {documents.filter(d => d.category.trim().toLowerCase() === selectedDocCategory.toLowerCase()).length} doložení
                  </div>
                </div>
              </div>

              <h3 className="font-semibold text-lg px-2 flex justify-between items-center text-slate-700">
                <span>Výpis složky doložení po nejdůležitější</span>
                <span className="text-xs font-normal text-slate-400 italic">Srovnáno automaticky podle data</span>
              </h3>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6 pb-12">
                {sortedDocuments
                  .filter(d => d.category.trim().toLowerCase() === selectedDocCategory.toLowerCase())
                  .map(doc => {
                    const catObj = DOCUMENT_CATEGORIES.find(c => c.name.toLowerCase() === doc.category.trim().toLowerCase());
                    return (
                      <div key={doc.id} className="bg-white rounded-3xl border border-slate-200 shadow-sm p-6 space-y-4">
                        <div className="flex justify-between items-start gap-2">
                          <div className="flex gap-3">
                            {doc.imageUrl && (
                              <img 
                                src={doc.imageUrl} 
                                alt="Scan" 
                                onClick={() => onPreviewImage(doc.imageUrl || '')}
                                className="w-16 h-16 rounded-xl object-cover border border-slate-200 cursor-zoom-in shrink-0 shadow-xs"
                              />
                            )}
                            <div>
                              <h3 className="font-bold text-slate-900 text-base">{doc.title}</h3>
                              <p className="text-sm text-slate-500">{doc.issuer}</p>
                            </div>
                          </div>
                          <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider ${
                            catObj?.color.replace('bg-', 'bg-opacity-10 text-') || 'bg-slate-100 text-slate-600'
                          } ${
                            catObj?.color.replace('bg-', 'text-')
                          }`}>
                            {doc.category}
                          </span>
                        </div>

                        <div className="flex justify-between text-xs text-slate-400">
                          <span>ID: {doc.id}</span>
                          <span>Vydáno: {new Date(doc.issueDate).toLocaleDateString('cs-CZ')}</span>
                        </div>

                        {/* Collapsible Details Panel inside Folder View */}
                        {expandedDocId === doc.id && (
                          <div className="bg-slate-50 rounded-2xl p-4 border border-slate-200/50 text-xs text-slate-600 space-y-3.5">
                            {doc.summary && (
                              <div>
                                <div className="font-bold text-slate-700 uppercase tracking-wide text-[9px] mb-1">AI Souhrn obsahu</div>
                                <p className="leading-relaxed">{doc.summary}</p>
                              </div>
                            )}
                            {doc.keyDetails && doc.keyDetails.length > 0 && (
                              <div>
                                <div className="font-bold text-slate-700 uppercase tracking-wide text-[9px] mb-1">Klíčové parametry doložení</div>
                                <ul className="list-disc pl-4 space-y-1">
                                  {doc.keyDetails.map((detail, idx) => (
                                    <li key={idx}>{detail}</li>
                                  ))}
                                </ul>
                              </div>
                            )}
                            
                            {/* Google Docs button */}
                            {googleAccessToken ? (
                              <div className="pt-2.5 border-t border-slate-200/60 flex items-center justify-between gap-2">
                                <button
                                  onClick={() => handleSaveToGoogleDocs(doc)}
                                  disabled={isSavingDocId === doc.id}
                                  className="flex items-center gap-1.5 px-3 py-1.5 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white rounded-lg font-bold text-[10px] transition-colors cursor-pointer"
                                >
                                  {isSavingDocId === doc.id ? "Ukládám..." : "Uložit do Google Dokumentů"}
                                </button>
                                
                                {docDocUrls[doc.id] && (
                                  <a 
                                    href={docDocUrls[doc.id]} 
                                    target="_blank" 
                                    rel="noreferrer"
                                    className="text-[10px] text-emerald-600 hover:underline font-bold"
                                  >
                                    Otevřít dokument &rarr;
                                  </a>
                                )}
                              </div>
                            ) : (
                              <p className="text-[10px] text-slate-400 italic pt-1 border-t border-slate-200/40">
                                Pro uložení doložení jako Google Dokument se nejprve přihlaste ve vašem nastavení.
                              </p>
                            )}
                          </div>
                        )}

                        <div className="flex justify-between items-center pt-3 border-t border-slate-100">
                          <button 
                            onClick={() => setExpandedDocId(expandedDocId === doc.id ? null : doc.id)}
                            className="text-xs text-indigo-600 hover:text-indigo-800 font-bold flex items-center gap-1 cursor-pointer"
                          >
                            {expandedDocId === doc.id ? "Skrýt detaily" : "Zobrazit AI detaily"}
                          </button>
                          
                          <button 
                            onClick={(e) => deleteDocument(doc.id, e)}
                            className="text-xs text-red-500 hover:text-red-700 font-semibold flex items-center gap-1 cursor-pointer"
                          >
                            <Trash2 size={12} /> Odstranit doložení
                          </button>
                        </div>
                      </div>
                    );
                  })}
                {documents.filter(d => d.category.trim().toLowerCase() === selectedDocCategory.toLowerCase()).length === 0 && (
                  <div className="col-span-full bg-white p-12 text-center text-slate-400 italic rounded-2xl border border-slate-200">
                    V této kategorii zatím nemáte žádné dokumenty.
                  </div>
                )}
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {duplicateConflicts.length > 0 && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 text-left font-sans"
          >
            <motion.div 
              initial={{ scale: 0.95, y: 15 }}
              animate={{ scale: 1, y: 0 }}
              exit={{ scale: 0.95, y: 15 }}
              className="bg-white rounded-3xl p-6 lg:p-8 max-w-2xl w-full max-h-[90vh] overflow-y-auto shadow-2xl space-y-6"
            >
              <div className="flex items-center gap-3 border-b border-rose-100 pb-4">
                <div className="p-3 bg-rose-50 text-rose-500 rounded-2xl">
                  <History size={24} />
                </div>
                <div>
                  <h3 className="text-xl font-bold text-slate-900">Duplicitní dokument detekován</h3>
                  <p className="text-xs text-slate-500">
                    Tento dokument byl pravděpodobně již nahrán. Vyberte, jak konflikt vyřešit.
                  </p>
                </div>
              </div>

              <div className="bg-slate-50 rounded-2xl p-4 text-xs text-slate-600 border border-slate-100 leading-relaxed">
                Byl rozpoznán soubor se stejným názvem popř. velikostí jako již existující uložený dokument. Srovnejte je prosím níže:
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6 pb-2">
                {/* Left: Existing Item */}
                <div className="border border-slate-200 rounded-2xl p-4 bg-slate-50/55 space-y-3">
                  <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Existující uložený dokument:</div>
                  <div className="space-y-1.5 min-w-0">
                    <div className="font-bold text-base text-indigo-700 truncate block">
                      {duplicateConflicts[0].existingItem.title}
                    </div>
                    <div className="text-xs font-semibold text-slate-500">
                      Vystavitel: {duplicateConflicts[0].existingItem.issuer}
                    </div>
                    <div className="text-xs font-semibold text-slate-500">
                      Datum: {new Date(duplicateConflicts[0].existingItem.issueDate).toLocaleDateString('cs-CZ')}
                    </div>
                    <div className="text-xs font-medium text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded-full inline-block">
                      {duplicateConflicts[0].existingItem.category}
                    </div>
                    <div className="text-[10px] text-slate-400 italic truncate block pt-1">
                      Soubor: {duplicateConflicts[0].existingItem.fileName || "Není k dispozici"}
                    </div>
                  </div>
                  {duplicateConflicts[0].existingItem.imageUrl ? (
                    <img 
                      src={duplicateConflicts[0].existingItem.imageUrl} 
                      alt="Stávající" 
                      className="w-full h-44 object-cover rounded-xl border border-slate-200 mt-2 hover:opacity-90 transition-opacity"
                      referrerPolicy="no-referrer"
                    />
                  ) : (
                    <div className="w-full h-44 bg-slate-100 flex items-center justify-center rounded-xl border border-dashed border-slate-200 text-slate-400 text-xs">
                      Bez fotografie stávajícího
                    </div>
                  )}
                </div>

                {/* Right: New File */}
                <div className="border border-indigo-100 rounded-2xl p-4 bg-indigo-50/20 space-y-3">
                  <div className="text-[10px] font-bold uppercase tracking-wider text-indigo-500">Nový nahraný soubor:</div>
                  <div className="space-y-1.5 min-w-0">
                    <div className="font-bold text-base text-slate-900 truncate block" title={duplicateConflicts[0].file.name}>
                      {duplicateConflicts[0].file.name}
                    </div>
                    <div className="text-xs font-semibold text-slate-500">
                      Velikost: {Math.round(duplicateConflicts[0].file.size / 1024)} KB
                    </div>
                    <div className="text-xs font-semibold text-slate-500">
                      Typ: {duplicateConflicts[0].file.type || "neznámý"}
                    </div>
                    <div className="text-[10px] text-indigo-500 font-medium">
                      Připraven k doložení / opětovnému skenování
                    </div>
                  </div>
                  <FilePreview file={duplicateConflicts[0].file} />
                </div>
              </div>

              <div className="flex flex-col sm:flex-row justify-end gap-3 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => {
                    setDuplicateConflicts(prev => prev.slice(1));
                  }}
                  className="px-4 py-2.5 rounded-xl border border-slate-200 text-slate-700 hover:bg-slate-50 font-bold transition-all text-xs cursor-pointer"
                >
                  Přeskočit (Neukládat)
                </button>
                <button
                  type="button"
                  onClick={() => {
                    const conflict = duplicateConflicts[0];
                    const newQueueItem: DocQueueItem = {
                      id: 'DQ-' + Math.random().toString(36).substr(2, 9).toUpperCase(),
                      name: conflict.file.name,
                      status: 'queued',
                      file: conflict.file
                    };
                    setDocQueue(prev => [...prev, newQueueItem]);
                    setDuplicateConflicts(prev => prev.slice(1));
                  }}
                  className="px-4 py-2.5 rounded-xl bg-slate-800 text-white hover:bg-slate-700 font-bold transition-all text-xs cursor-pointer"
                >
                  Ponechat oba
                </button>
                <button
                  type="button"
                  onClick={() => {
                    const conflict = duplicateConflicts[0];
                    setDocuments(prev => prev.filter(r => r.id !== conflict.existingItem.id));
                    const newQueueItem: DocQueueItem = {
                      id: 'DQ-' + Math.random().toString(36).substr(2, 9).toUpperCase(),
                      name: conflict.file.name,
                      status: 'queued',
                      file: conflict.file
                    };
                    setDocQueue(prev => [...prev, newQueueItem]);
                    setDuplicateConflicts(prev => prev.slice(1));
                  }}
                  className="px-4 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-bold transition-all text-xs cursor-pointer"
                >
                  Nahradit stávající
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

    </div>
  );
}
