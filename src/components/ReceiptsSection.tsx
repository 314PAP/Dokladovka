import React, { useCallback, useRef, useState } from 'react';
import {
  ArrowLeft,
  Download,
  Calendar,
  Plus,
  Upload,
  Camera,
  PieChart,
  ShoppingBag,
  FolderOpen,
  Loader2,
  AlertTriangle,
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { Receipt } from '../types';
import StatsCard from './ui/StatsCard';
import ReceiptItem from './ReceiptItem';
import { exportExpensesToPDF } from '../utils/pdfExport';
import { uploadReceiptImageToDrive } from '../utils/googleService';
import { useProcessingQueue, QueueItemBase } from '../hooks/useProcessingQueue';

interface ReceiptsSectionProps {
  onBack: () => void;
  userApiKey?: string;
  googleAccessToken?: string | null;
  googleUser?: any;
  receipts: Receipt[];
  setReceipts: React.Dispatch<React.SetStateAction<Receipt[]>>;
}

export default function ReceiptsSection({
  onBack,
  userApiKey,
  googleAccessToken,
  googleUser,
  receipts,
  setReceipts,
}: ReceiptsSectionProps) {
  const effectiveApiKey = userApiKey || '';

  type ReceiptQueue = QueueItemBase & {
    file?: File;
    virtualBase64?: string;
  };

  const { queue, addItem, updateItem, isProcessing, clearDone } =
    useProcessingQueue<ReceiptQueue>({
      processItem: async (item) => {
        updateItem(item.id, { status: 'scanning' });
        try {
          const base64Image = item.virtualBase64?.includes(',')
            ? item.virtualBase64.split(',')[1]
            : item.virtualBase64 || '';
          const headers: Record<string, string> = { 'Content-Type': 'application/json' };
          if (userApiKey) headers['x-gemini-key'] = userApiKey;
          const response = await fetch('/api/extract-receipt', {
            method: 'POST',
            headers,
            body: JSON.stringify({ image: base64Image, mimeType: 'image/jpeg' }),
          });
          if (!response.ok) throw new Error('Failed to extract receipt');
          const data = await response.json();
          if (data.isFallback) throw new Error(data.error || 'API fallback mode');
          const updated: Receipt = {
            id: crypto.randomUUID(),
            shopName: data.shopName || 'Neznámý obchod',
            totalAmount: data.totalAmount || 0,
            date: data.date || new Date().toISOString().split('T')[0],
            category: data.category || 'Ostatní',
            items: data.items || [],
            imageUrl: item.virtualBase64,
            fileName: item.file?.name,
            fileSize: item.file?.size,
          };
          setReceipts((prev) => [updated, ...prev]);
          if (googleAccessToken && updated.imageUrl) {
            try {
              const upload = await uploadReceiptImageToDrive(googleAccessToken, updated.imageUrl, updated.shopName, updated.date, updated.category);
              setReceipts((prev) => prev.map(r => r.id === updated.id ? { ...r, driveImageId: upload.id, driveImageUrl: upload.url } : r));
            } catch (uploadError) {
              console.warn("Upload receipt image to Drive failed:", uploadError);
            }
          }
          updateItem(item.id, { status: 'done' });
        } catch (err: unknown) {
          updateItem(item.id, { status: 'failed', error: err instanceof Error ? err.message : 'Unknown error' });
        }
      },
    });

  const addReceiptManual = useCallback(
    (receipt: Omit<Receipt, 'id'>) => {
      setReceipts((prev) => [{ ...receipt, id: crypto.randomUUID() } as Receipt, ...prev]);
    },
    [setReceipts],
  );

  const deleteReceipt = useCallback(
    (id: string) => {
      setReceipts((prev) => prev.filter((r) => r.id !== id));
    },
    [setReceipts],
  );

  const [filterFromDate, setFilterFromDate] = useState('');
  const [filterToDate, setFilterToDate] = useState('');
  const [showScanner, setShowScanner] = useState(false);
  const [selectedReceiptImage, setSelectedReceiptImage] = useState<string | null>(null);
  const [isUploadingArchive, setIsUploadingArchive] = useState(false);
  const [archiveUrl, setArchiveUrl] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);

  const filteredReceipts = receipts.filter((r) => {
    if (filterFromDate && r.date < filterFromDate) return false;
    if (filterToDate && r.date > filterToDate) return false;
    return true;
  });

  const sortedReceipts = [...filteredReceipts].sort(
    (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime(),
  );

  const totalSpent = filteredReceipts.reduce((sum, r) => sum + r.totalAmount, 0);

  const handleFilterChange = (from: string, to: string) => {
    setFilterFromDate(from);
    setFilterToDate(to);
  };

  const processFile = async (file: File, virtualBase64?: string) => {
    const id = crypto.randomUUID();
    addItem({ id, name: file.name, status: 'queued', file, virtualBase64 });
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;
    Array.from(files).forEach((f: File) => {
      const reader = new FileReader();
      reader.onload = () => {
        if (reader.result && typeof reader.result === 'string') {
          processFile(f, reader.result);
        }
      };
      reader.readAsDataURL(f);
    });
    e.target.value = '';
  };

  const handleCameraCapture = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file: File | undefined = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      if (reader.result && typeof reader.result === 'string') {
        processFile(file, reader.result);
      }
    };
    reader.readAsDataURL(file);
    e.target.value = '';
  };

  const handleUploadArchiveToDrive = async () => {
    if (!googleAccessToken) return;
    setIsUploadingArchive(true);
    setArchiveUrl(null);
    try {
      const doc = exportExpensesToPDF(sortedReceipts, filterFromDate, filterToDate, totalSpent);
      if (!doc) {
        throw new Error("Nepodařilo se vygenerovat PDF dokument.");
      }

      const pdfBlob = doc.output("blob");
      const fileName = `Archiv_Stranecek_${filterFromDate || "vse"}_do_${filterToDate || "dnes"}.pdf`;

      const boundary = "-------314159265358979323846";
      const delimiter = `\r\n--${boundary}\r\n`;
      const close_delim = `\r\n--${boundary}--`;

      const arrayBuffer = await pdfBlob.arrayBuffer();
      const bodyBytes = new Uint8Array(arrayBuffer);

      const metadata = {
        name: fileName,
        mimeType: "application/pdf",
        parents: ["root"]
      };

      const metadataStr = JSON.stringify(metadata);
      const header =
        `${delimiter}Content-Type: application/json; charset=UTF-8\r\n\r\n${metadataStr}${delimiter}Content-Type: application/pdf\r\n\r\n`;
      const footer = `\r\n${close_delim}`;

      const encoder = new TextEncoder();
      const headerBytes = encoder.encode(header);
      const footerBytes = encoder.encode(footer);

      const body = new Uint8Array(headerBytes.length + bodyBytes.length + footerBytes.length);
      body.set(headerBytes, 0);
      body.set(bodyBytes, headerBytes.length);
      body.set(footerBytes, headerBytes.length + bodyBytes.length);

      const response = await fetch(
        "https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart",
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${googleAccessToken}`,
            "Content-Type": `multipart/related; boundary=${boundary}`
          },
          body
        }
      );

      if (!response.ok) {
        const errText = await response.text();
        throw new Error(`Nahrání archivu na Disk selhalo: ${errText}`);
      }

      const data = await response.json();
      setArchiveUrl(`https://drive.google.com/file/d/${data.id}/view`);
      alert(`Archiv účtenek byl úspěšně nahrán na váš Disk!`);
    } catch (err: any) {
      console.error(err);
      alert(`Nahrání archivu na Disk selhalo: ${err?.message || String(err)}`);
    } finally {
      setIsUploadingArchive(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 font-sans p-4 md:p-8">
      <div className="max-w-4xl mx-auto space-y-8">
        <div className="flex items-center justify-between">
          <button
            onClick={onBack}
            className="flex items-center gap-2 text-sm font-semibold text-slate-500 hover:text-indigo-600 transition-colors bg-white px-4 py-2 rounded-xl border border-slate-200 shadow-sm cursor-pointer"
          >
            <ArrowLeft size={16} />
            Zpět na výběr sekce
          </button>
          <span className="text-xs font-bold uppercase text-slate-400 tracking-wider">
            Sekce: Účtenky a složenky
          </span>
        </div>

        <section className="grid grid-cols-1 lg:grid-cols-3 gap-4 md:gap-6">
          <div className="bg-white p-5 md:p-8 rounded-[32px] border border-slate-200 shadow-sm col-span-1 lg:col-span-2">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-6">
              <h2 className="font-semibold text-lg flex items-center gap-2">
                <PieChart size={20} className="text-indigo-600" />
                Měsíční útrata
              </h2>
              <span className="text-2xl md:text-3xl font-bold text-slate-900">
                {totalSpent.toLocaleString()} Kč
              </span>
            </div>
          </div>
          <StatsCard
            title="Naskenováno"
            value={`${receipts.length} nákupů`}
            icon={<ShoppingBag size={24} />}
          />
        </section>

        <section className="bg-white rounded-3xl border border-slate-200 shadow-sm overflow-hidden">
          <div className="p-4 md:p-6 border-b border-slate-100">
            <h2 className="font-semibold text-lg flex items-center gap-2">
              <ShoppingBag size={20} className="text-indigo-600" />
              Poslední přidané
            </h2>
          </div>
          <div className="hidden md:block overflow-x-auto">
            <table className="w-full text-left">
              <thead>
                <tr className="border-b border-slate-100 bg-slate-50/50">
                  <th className="px-6 py-4 text-xs font-semibold text-slate-500 uppercase tracking-wider">
                    Obchod
                  </th>
                  <th className="px-6 py-4 text-xs font-semibold text-slate-500 uppercase tracking-wider">
                    Datum
                  </th>
                  <th className="px-6 py-4 text-xs font-semibold text-slate-500 uppercase tracking-wider text-right">
                    Částka
                  </th>
                </tr>
              </thead>
              <tbody>
                {sortedReceipts.map((receipt) => (
                  <React.Fragment key={receipt.id}>
                    <ReceiptItem
                      receipt={receipt}
                      onDelete={deleteReceipt}
                      onPreviewImage={setSelectedReceiptImage}
                    />
                  </React.Fragment>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        <div className="bg-white border border-slate-200 p-6 rounded-3xl flex flex-col md:flex-row gap-5 items-center justify-between">
          <div className="flex items-center gap-2 text-slate-700 font-semibold text-sm">
            <Calendar size={18} className="text-indigo-600" />
            <span>Zvolené období:</span>
          </div>
          <div className="flex items-center gap-2.5">
            <input
              type="date"
              value={filterFromDate}
              onChange={(e) => handleFilterChange(e.target.value, filterToDate)}
              className="px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs"
            />
            <span className="text-slate-400 font-bold">—</span>
            <input
              type="date"
              value={filterToDate}
              onChange={(e) => handleFilterChange(filterFromDate, e.target.value)}
              className="px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs"
            />
          </div>
          <div className="flex gap-3 flex-wrap">
            <button
              onClick={() => cameraInputRef.current?.click()}
              className="flex items-center gap-2 px-4 py-3 bg-slate-100 hover:bg-slate-200 rounded-2xl cursor-pointer"
            >
              <Camera size={16} />
              Foto
            </button>
            <button
              onClick={() => fileInputRef.current?.click()}
              className="flex items-center gap-2 px-4 py-3 bg-slate-100 hover:bg-slate-200 rounded-2xl cursor-pointer"
            >
              <Upload size={16} />
              Nahrát
            </button>
            <button
              onClick={() => exportExpensesToPDF(sortedReceipts, filterFromDate, filterToDate, totalSpent)}
              disabled={sortedReceipts.length === 0}
              className="flex items-center gap-2 px-6 py-3 bg-indigo-600 hover:bg-indigo-700 text-white rounded-2xl disabled:opacity-50 cursor-pointer"
            >
              <Download size={16} />
              PDF
            </button>
            <button className="flex items-center gap-2 px-4 py-3 bg-slate-100 hover:bg-slate-200 rounded-2xl cursor-pointer">
              <Plus size={16} />
              Manuálně
            </button>
            {googleAccessToken && (
              <button
                onClick={handleUploadArchiveToDrive}
                disabled={sortedReceipts.length === 0 || isUploadingArchive}
                className="flex items-center gap-2 px-5 py-3 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 disabled:cursor-not-allowed text-white rounded-2xl font-semibold text-sm shadow-md transition-all cursor-pointer whitespace-nowrap border border-emerald-500"
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
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={handleFileUpload}
          />
          <input
            ref={cameraInputRef}
            type="file"
            accept="image/*"
            capture="environment"
            className="hidden"
            onChange={handleCameraCapture}
          />
        </div>

        <AnimatePresence>
          {queue.length > 0 && (
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              className="fixed bottom-4 right-4 bg-white border border-slate-200 shadow-2xl rounded-2xl p-4 space-y-2 w-72"
            >
              <p className="text-sm font-semibold text-slate-800">
                {isProcessing ? 'Zpracovávám soubory...' : 'Hotovo'}
              </p>
              {queue.map((item) => (
                <div key={item.id} className="flex justify-between text-xs text-slate-600">
                  <span className="truncate">{item.name}</span>
                  <span className="font-medium">{item.status}</span>
                </div>
              ))}
              {!isProcessing && (
                <button
                  onClick={clearDone}
                  className="text-xs w-full bg-slate-100 hover:bg-slate-200 py-2 rounded-xl text-slate-700 cursor-pointer"
                >
                  Zavřít
                </button>
              )}
            </motion.div>
          )}
        </AnimatePresence>

        <AnimatePresence>
          {selectedReceiptImage && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-4"
              onClick={() => setSelectedReceiptImage(null)}
            >
              <motion.img
                initial={{ scale: 0.9 }}
                animate={{ scale: 1 }}
                exit={{ scale: 0.9 }}
                src={selectedReceiptImage}
                alt="Náhled účtenky"
                className="max-w-full max-h-full object-contain rounded-lg cursor-pointer"
              />
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
