/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useMemo, useRef, useEffect, ChangeEvent, useCallback } from 'react';
import Cropper, { Point, Area } from 'react-easy-crop';
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
  Zap,
  Home,
  ShoppingBag,
  Car,
  Maximize2,
  Stethoscope,
  Utensils,
  Flashlight,
  FlashlightOff,
  ArrowLeft,
  Crop,
  FolderOpen,
  Calendar,
  Download,
  AlertTriangle
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import DocumentSection from './components/DocumentSection';
import { exportExpensesToPDF } from './utils/pdfExport';
import { resizeAndCompressImage } from './utils/imageCompressor';
import { getSmartFallbackReceipt } from './utils/smartFallback';

interface ReceiptItem {
  name: string;
  price: number;
}

interface Receipt {
  id: string;
  shopName: string;
  totalAmount: number;
  date: string;
  category: string;
  items: ReceiptItem[];
  imageUrl?: string;
  fileName?: string;
  fileSize?: number;
  isFallback?: boolean;
}

interface ReceiptQueueItem {
  id: string;
  name: string;
  status: 'queued' | 'compressing' | 'scanning' | 'done' | 'failed';
  error?: string;
  file?: File;
  virtualBase64?: string;
}

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
}

interface DuplicateConflict {
  id: string;
  file: File;
  existingItem: any;
  existingType: 'receipt' | 'document';
}

const CATEGORIES = [
  { id: 'Food', name: 'Potraviny', icon: ShoppingBag, color: 'bg-green-500' },
  { id: 'Electronics', name: 'Elektronika', icon: Zap, color: 'bg-yellow-500' },
  { id: 'Drugstore', name: 'Drogerie', icon: Home, color: 'bg-blue-500' },
  { id: 'Health', name: 'Zdraví', icon: Stethoscope, color: 'bg-red-500' },
  { id: 'Travel', name: 'Doprava', icon: Car, color: 'bg-purple-500' },
  { id: 'Dining', name: 'Restaurace', icon: Utensils, color: 'bg-orange-500' },
  { id: 'Other', name: 'Ostatní', icon: FileText, color: 'bg-gray-500' },
];

const DOCUMENT_CATEGORIES = [
  { id: 'HealthDoc', name: 'Zdravotní', icon: Stethoscope, color: 'bg-emerald-500' },
  { id: 'LaborDoc', name: 'Pracovní úřad', icon: Home, color: 'bg-indigo-500' },
  { id: 'SocialDoc', name: 'Sociální zabezpečení', icon: CheckCircle2, color: 'bg-cyan-500' },
  { id: 'ContractDoc', name: 'Pracovní smlouvy', icon: FileText, color: 'bg-violet-500' },
  { id: 'OtherDoc', name: 'Ostatní', icon: FolderOpen, color: 'bg-amber-500' },
];

/**
 * Utility to create a cropped image
 */
async function getCroppedImg(imageSrc: string, pixelCrop: Area): Promise<string> {
  const image = new Image();
  image.src = imageSrc;
  await new Promise((resolve) => (image.onload = resolve));

  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');

  if (!ctx) {
    throw new Error('No 2d context');
  }

  canvas.width = pixelCrop.width;
  canvas.height = pixelCrop.height;

  ctx.drawImage(
    image,
    pixelCrop.x,
    pixelCrop.y,
    pixelCrop.width,
    pixelCrop.height,
    0,
    0,
    pixelCrop.width,
    pixelCrop.height
  );

  return canvas.toDataURL('image/jpeg');
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

export default function App() {
  const [activeSection, setActiveSection] = useState<'selection' | 'receipts' | 'documents'>('selection');
  
  const [receipts, setReceipts] = useState<Receipt[]>(() => {
    try {
      const saved = localStorage.getItem('smart-receipts') || localStorage.getItem('receipts');
      if (saved) {
        return JSON.parse(saved);
      }
    } catch (e) {
      console.error("Failed to load receipts from localStorage:", e);
    }
    return [];
  });
  
  const [isScanning, setIsScanning] = useState(false);
  const [scanningIndex, setScanningIndex] = useState(0);
  const [scanningTotal, setScanningTotal] = useState(0);
  const [receiptQueue, setReceiptQueue] = useState<ReceiptQueueItem[]>([]);
  const [showManualForm, setShowManualForm] = useState(false);
  const [duplicateConflicts, setDuplicateConflicts] = useState<DuplicateConflict[]>([]);
  const [croppingFileName, setCroppingFileName] = useState<string | undefined>(undefined);
  const [croppingFileSize, setCroppingFileSize] = useState<number | undefined>(undefined);
  const [showQuotaWarning, setShowQuotaWarning] = useState(() => {
    return localStorage.getItem('gemini-quota-warning') === 'true';
  });

  // Synchronize `isScanning`, `scanningTotal`, `scanningIndex` with receiptQueue
  useEffect(() => {
    const active = receiptQueue.some(item => item.status === 'compressing' || item.status === 'scanning' || item.status === 'queued');
    setIsScanning(active);
    if (active) {
      setScanningTotal(receiptQueue.length);
      const doneOrFailedCount = receiptQueue.filter(item => item.status === 'done' || item.status === 'failed').length;
      setScanningIndex(doneOrFailedCount + 1);
    } else {
      setScanningTotal(0);
      setScanningIndex(0);
    }
  }, [receiptQueue]);

  const fallbackReceiptCreation = async (fileName: string, base64Image?: string, fileSize?: number) => {
    const smartData = getSmartFallbackReceipt(fileName, fileSize);
    
    // Set warning flag
    localStorage.setItem('gemini-quota-warning', 'true');
    setShowQuotaWarning(true);

    const newReceipt: Receipt = {
      id: Math.random().toString(36).substr(2, 9).toUpperCase(),
      shopName: smartData.shopName,
      totalAmount: smartData.totalAmount,
      date: smartData.date,
      category: smartData.category,
      items: smartData.items,
      imageUrl: base64Image || undefined,
      fileName,
      fileSize,
      isFallback: true
    };
    setReceipts(prev => [newReceipt, ...prev]);
  };

  // Background queue processing
  useEffect(() => {
    const currentActive = receiptQueue.find(item => item.status === 'compressing' || item.status === 'scanning');
    if (currentActive) {
      return; 
    }

    const nextItem = receiptQueue.find(item => item.status === 'queued');
    if (!nextItem) {
      return;
    }

    const processItem = async () => {
      setReceiptQueue(prev => prev.map(item => item.id === nextItem.id ? { ...item, status: 'compressing' } : item));

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
          throw new Error("Žádná data k účtence");
        }

        setReceiptQueue(prev => prev.map(item => item.id === nextItem.id ? { ...item, status: 'scanning' } : item));

        await scanReceiptDirectly(base64String, 'image/jpeg', nextItem.name, nextItem.file?.size);

        setReceiptQueue(prev => prev.map(item => item.id === nextItem.id ? { ...item, status: 'done' } : item));
      } catch (err: any) {
        console.warn("Queue process used fallback for receipt:", nextItem.name, err?.message || err);
        setReceiptQueue(prev => prev.map(item => item.id === nextItem.id ? { ...item, status: 'failed', error: err.message || "Chyba" } : item));
        
        await fallbackReceiptCreation(nextItem.name, base64String || nextItem.virtualBase64 || undefined, nextItem.file?.size);
        setReceiptQueue(prev => prev.map(item => item.id === nextItem.id ? { ...item, status: 'done' } : item));
      } finally {
        await new Promise(resolve => setTimeout(resolve, 350));
      }
    };

    processItem();
  }, [receiptQueue]);
  const [isCameraActive, setIsCameraActive] = useState(false);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [selectedReceiptImage, setSelectedReceiptImage] = useState<string | null>(null);
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [selectedDocCategory, setSelectedDocCategory] = useState<string | null>(null);
  const [isFlashOn, setIsFlashOn] = useState(false);
  const [hasFlash, setHasFlash] = useState(false);
  const [filterFromDate, setFilterFromDate] = useState<string>('');
  const [filterToDate, setFilterToDate] = useState<string>('');

  // Cropping State
  const [imageToCrop, setImageToCrop] = useState<string | null>(null);
  const [crop, setCrop] = useState<Point>({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [croppedAreaPixels, setCroppedAreaPixels] = useState<Area | null>(null);
  const [isCropping, setIsCropping] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const nativeCameraRef = useRef<HTMLInputElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);

  // Manual Form State for Receipts
  const [shopName, setShopName] = useState('');
  const [manualPrice, setManualPrice] = useState('');
  const [newCategory, setNewCategory] = useState(CATEGORIES[0].name);
  const [newDate, setNewDate] = useState(new Date().toISOString().split('T')[0]);

  // Manual Form State for Documents
  const [docTitle, setDocTitle] = useState('');
  const [docIssuer, setDocIssuer] = useState('');
  const [docCategory, setDocCategory] = useState(DOCUMENT_CATEGORIES[0].name);
  const [docDate, setDocDate] = useState(new Date().toISOString().split('T')[0]);
  const [docSummary, setDocSummary] = useState('');
  const [docDetailsRaw, setDocDetailsRaw] = useState('');

  // Helper to merge receipts securely (avoid duplicates by ID)
  const mergeReceipts = (local: Receipt[], server: Receipt[]) => {
    const map = new Map<string, Receipt>();
    local.forEach(r => map.set(r.id, r));
    server.forEach(r => map.set(r.id, r));
    return Array.from(map.values());
  };

  // Sync receipts with backend on mount
  useEffect(() => {
    let active = true;
    const syncReceipts = async () => {
      try {
        const response = await fetch("/api/db/receipts");
        if (response.ok && active) {
          const serverReceipts = await response.json();
          if (Array.isArray(serverReceipts)) {
            setReceipts(prev => {
              const merged = mergeReceipts(prev, serverReceipts);
              // Save merged list to localStorage
              localStorage.setItem('smart-receipts', JSON.stringify(merged));
              // Save merged list back to backend to keep both strictly in sync
              if (merged.length !== serverReceipts.length || merged.length !== prev.length) {
                fetch("/api/db/receipts", {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({ receipts: merged }),
                }).catch(err => console.error("Failed to back-sync merged receipts to backend", err));
              }
              return merged;
            });
          }
        }
      } catch (err) {
        console.error("Failed to retrieve receipts from backend database:", err);
      }
    };
    syncReceipts();
    return () => { active = false; };
  }, []);

  // Persistence: Save receipts to localStorage & server backend with safe error catching and debounce
  useEffect(() => {
    try {
      localStorage.setItem('smart-receipts', JSON.stringify(receipts));
    } catch (e) {
      console.warn("Storage quota exceeded. Saving text metadata locally to avoid page crash.", e);
      try {
        const textOnlyReceipts = receipts.map(r => ({ ...r, imageUrl: undefined }));
        localStorage.setItem('smart-receipts', JSON.stringify(textOnlyReceipts));
      } catch (err) {
        console.error("Failsafe local storage write failed:", err);
      }
    }
    
    // Debounce backend write to prevent overlapping massive POST payloads
    const timeoutId = setTimeout(() => {
      fetch("/api/db/receipts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ receipts }),
      }).catch(err => console.error("Error backing up receipts to server:", err));
    }, 1200);

    return () => clearTimeout(timeoutId);
  }, [receipts]);

  // Simulated AI Data Pool for Receipts
  const mockAIChoices = [
    { 
      shopName: 'Lidl', 
      category: 'Potraviny',
      items: [{ name: 'Mléko polotučné', price: 19.90 }, { name: 'Chléb Šumava', price: 34.90 }, { name: 'Banány 1kg', price: 29.90 }]
    },
    { 
      shopName: 'Alza.cz', 
      category: 'Elektronika',
      items: [{ name: 'Powerbanka 10k', price: 599 }, { name: 'USB-C Kabel', price: 149 }]
    },
    { 
      shopName: 'dm Drogerie', 
      category: 'Drogerie',
      items: [{ name: 'Mýdlo tekuté', price: 45 }, { name: 'Šampon na vlasy', price: 89 }, { name: 'Zubní pasta', price: 65 }]
    },
    { 
      shopName: 'Tesco', 
      category: 'Potraviny',
      items: [{ name: 'Pivo Plzeň 6ks', price: 162 }, { name: 'Chipsy slané', price: 39.90 }]
    },
  ];

  const toggleCamera = (active: boolean) => {
    setCameraError(null);
    setIsFlashOn(false);
    setHasFlash(false);
    if (!active) {
      if (streamRef.current) {
        streamRef.current.getTracks().forEach(track => track.stop());
        streamRef.current = null;
      }
    }
    setIsCameraActive(active);
  };

  // Handle camera stream when active state changes
  useEffect(() => {
    let activeStream: MediaStream | null = null;

    const startVideo = async () => {
      if (isCameraActive && videoRef.current) {
        try {
          const constraints = {
            video: {
              facingMode: { ideal: 'environment' },
              width: { ideal: 1280 },
              height: { ideal: 720 }
            }
          };
          activeStream = await navigator.mediaDevices.getUserMedia(constraints);
          streamRef.current = activeStream;
          
          if (videoRef.current) {
            videoRef.current.srcObject = activeStream;
            await videoRef.current.play();

            // Check for torch/flash support
            const track = activeStream.getVideoTracks()[0];
            const capabilities = track.getCapabilities() as any;
            if (capabilities.torch) {
              setHasFlash(true);
            }
          }
        } catch (err) {
          console.error("Camera access error:", err);
          setCameraError("Prohlížeč k fotoaparátu nepustil. Zkuste aplikaci otevřít v novém okně (tlačítko vpravo nahoře) nebo použijte tlačítko 'Zkusit nativní fotoaparát' níže.");
        }
      }
    };

    startVideo();

    return () => {
      if (activeStream) {
        activeStream.getTracks().forEach(track => track.stop());
      }
    };
  }, [isCameraActive]);

  const capturePhoto = () => {
    if (videoRef.current && canvasRef.current) {
      const context = canvasRef.current.getContext('2d');
      if (context) {
        canvasRef.current.width = videoRef.current.videoWidth;
        canvasRef.current.height = videoRef.current.videoHeight;
        context.drawImage(videoRef.current, 0, 0);
        
        const base64Image = canvasRef.current.toDataURL('image/jpeg', 0.95);
        toggleCamera(false);
        setImageToCrop(base64Image);
        setIsCropping(true);
      }
    }
  };

  const toggleFlash = async () => {
    if (streamRef.current && hasFlash) {
      const track = streamRef.current.getVideoTracks()[0];
      const newFlashState = !isFlashOn;
      try {
        await track.applyConstraints({
          advanced: [{ torch: newFlashState }]
        } as any);
        setIsFlashOn(newFlashState);
      } catch (err) {
        console.error("Flash toggle failed:", err);
      }
    }
  };

  const handleFileUpload = async (e: ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      const filesCount = e.target.files.length;
      const newItems: ReceiptQueueItem[] = [];
      const conflicts: DuplicateConflict[] = [];

      for (let i = 0; i < filesCount; i++) {
        const file = e.target.files[i];
        if (!file) continue;

        // Check if there's any existing receipt with same name or size
        const conflict = receipts.find(r => 
          r.fileName === file.name || 
          (r.fileSize && r.fileSize === file.size)
        );

        if (conflict) {
          conflicts.push({
            id: 'CONFL-' + Math.random().toString(36).substr(2, 9).toUpperCase(),
            file,
            existingItem: conflict,
            existingType: 'receipt'
          });
        } else {
          newItems.push({
            id: 'RQ-' + Math.random().toString(36).substr(2, 9).toUpperCase(),
            name: file.name,
            status: 'queued',
            file: file
          });
        }
      }

      // If singular file and no conflicts, run standard visual crop
      if (filesCount === 1 && conflicts.length === 0 && newItems.length === 1) {
        const file = newItems[0].file!;
        setCroppingFileName(file.name);
        setCroppingFileSize(file.size);
        const reader = new FileReader();
        reader.onloadend = () => {
          const base64String = reader.result as string;
          setImageToCrop(base64String);
          setIsCropping(true);
        };
        reader.readAsDataURL(file);
      } else {
        // Enqueue remaining clean files
        if (newItems.length > 0) {
          setReceiptQueue(prev => [...prev, ...newItems]);
        }
      }

      if (conflicts.length > 0) {
        setDuplicateConflicts(prev => [...prev, ...conflicts]);
      }
      
      if (e.target) e.target.value = '';
    }
  };

  const scanReceiptDirectly = async (base64Image: string, mimeType = 'image/jpeg', fileName?: string, fileSize?: number) => {
    try {
      const response = await fetch("/api/extract-receipt", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ image: base64Image, mimeType }),
      });

      if (!response.ok) {
        throw new Error("Failed to extract data via AI");
      }

      const data = await response.json();
      
      if (data.isFallback) {
        throw new Error(data.error || "Server triggered fallback mode");
      }
      
      const newReceipt: Receipt = {
        id: Math.random().toString(36).substr(2, 9).toUpperCase(),
        shopName: data.shopName || "Neznámý obchod",
        totalAmount: data.totalAmount || 0,
        date: data.date || new Date().toISOString().split('T')[0],
        category: data.category || "Ostatní",
        items: data.items || [],
        imageUrl: base64Image,
        fileName,
        fileSize
      };
      setReceipts(prev => [newReceipt, ...prev]);
    } catch (err: any) {
      console.warn("Direct receipt scan yielded fallback:", err?.message || err);
      // Run fail-safe smart fallback generation
      await fallbackReceiptCreation(fileName || "Účtenka.jpg", base64Image, fileSize);
    }
  };

  const onCropComplete = useCallback((_: Area, pixels: Area) => {
    setCroppedAreaPixels(pixels);
  }, []);

  const createCroppedImage = async () => {
    if (!imageToCrop || !croppedAreaPixels) return;

    try {
      const croppedImage = await getCroppedImg(imageToCrop, croppedAreaPixels);
      setIsCropping(false);
      setImageToCrop(null);
      startScanning(croppedImage, 'image/jpeg', croppingFileName, croppingFileSize);
    } catch (e) {
      console.error(e);
    }
  };

  const startScanning = async (base64Image?: string, mimeType: string = 'image/jpeg', fileName?: string, fileSize?: number) => {
    setIsScanning(true);
    setScanningTotal(1);
    setScanningIndex(1);
    
    try {
      if (base64Image) {
        // Compress and resize client-side before sending to server
        const compressed = await resizeAndCompressImage(base64Image, 2048, 2048, 0.95);
        await scanReceiptDirectly(compressed, mimeType, fileName, fileSize);
      } else {
        // Fallback to mock for manual testing if no image
        await new Promise(resolve => setTimeout(resolve, 1500));
        const choice = mockAIChoices[Math.floor(Math.random() * mockAIChoices.length)];
        const total = choice.items.reduce((sum, i) => sum + i.price, 0);
        
        const newReceipt: Receipt = {
          id: Math.random().toString(36).substr(2, 9).toUpperCase(),
          shopName: choice.shopName,
          totalAmount: total,
          date: new Date().toISOString().split('T')[0],
          category: choice.category,
          items: choice.items,
          fileName,
          fileSize
        };
        setReceipts(prev => [newReceipt, ...prev]);
      }
    } catch (err) {
      console.error("Scanning failed:", err);
    } finally {
      setIsScanning(false);
      setScanningTotal(0);
      setScanningIndex(0);
      setCroppingFileName(undefined);
      setCroppingFileSize(undefined);
    }
  };

  const addManualReceipt = (e: React.FormEvent) => {
    e.preventDefault();
    if (!shopName || !manualPrice) return;

    const newReceipt: Receipt = {
      id: Math.random().toString(36).substr(2, 9).toUpperCase(),
      shopName: shopName,
      totalAmount: parseFloat(manualPrice),
      date: newDate,
      category: newCategory,
      items: [{ name: 'Ručně přidaný nákup', price: parseFloat(manualPrice) }]
    };

    setReceipts(prev => [newReceipt, ...prev]);
    setShopName('');
    setManualPrice('');
    setShowManualForm(false);
  };

  const deleteReceipt = (id: string) => {
    setReceipts(prev => prev.filter(r => r.id !== id));
  };

  const filteredReceipts = useMemo(() => {
    return receipts.filter(r => {
      // Compare dates as strings (yyyy-mm-dd format matches alphabetical comparison perfectly)
      if (filterFromDate && r.date < filterFromDate) return false;
      if (filterToDate && r.date > filterToDate) return false;
      return true;
    });
  }, [receipts, filterFromDate, filterToDate]);

  const sortedReceipts = useMemo(() => {
    return [...filteredReceipts].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  }, [filteredReceipts]);

  const totalSpent = useMemo(() => filteredReceipts.reduce((sum, r) => sum + r.totalAmount, 0), [filteredReceipts]);

  const categorySummary = useMemo(() => {
    const summary: Record<string, number> = {};
    filteredReceipts.forEach(r => {
      summary[r.category] = (summary[r.category] || 0) + r.totalAmount;
    });
    return summary;
  }, [filteredReceipts]);

  if (activeSection === 'selection') {
    return (
      <div className="min-h-screen bg-slate-50 text-slate-900 font-sans flex items-center justify-center p-4 md:p-8">
        <div className="max-w-3xl w-full text-center space-y-12">
          {/* Logo / Header */}
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

          {/* Cards Container */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
            {/* Card 1: Receipts */}
            <motion.button
              whileHover={{ scale: 1.02, y: -4 }}
              whileTap={{ scale: 0.98 }}
              onClick={() => {
                setActiveSection('receipts');
                setSelectedCategory(null);
                setShowManualForm(false);
              }}
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

            {/* Card 2: Documents */}
            <motion.button
              whileHover={{ scale: 1.02, y: -4 }}
              whileTap={{ scale: 0.98 }}
              onClick={() => {
                setActiveSection('documents');
                setSelectedDocCategory(null);
                setShowManualForm(false);
              }}
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

          <div className="text-xs text-slate-400 font-medium">
            Dokladovka Pipap.cz &copy; {new Date().getFullYear()} &bull; Všechna data jsou bezpečně uložena na vašem zařízení.
          </div>
        </div>
      </div>
    );
  }

  if (activeSection === 'documents') {
    return (
      <div className="min-h-screen bg-slate-50 text-slate-900 font-sans p-4 md:p-8">
        <div className="max-w-4xl mx-auto space-y-8">
          <DocumentSection 
            onBack={() => setActiveSection('selection')} 
            onPreviewImage={(src) => setSelectedReceiptImage(src)} 
          />
          
          {/* Shared Full Image Preview Modal */}
          <AnimatePresence>
            {selectedReceiptImage && (
              <motion.div 
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                onClick={() => setSelectedReceiptImage(null)}
                className="fixed inset-0 z-[60] bg-black/90 backdrop-blur-sm flex items-center justify-center p-4 md:p-12 cursor-pointer"
              >
                <motion.div 
                  initial={{ scale: 0.9, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                  exit={{ scale: 0.9, opacity: 0 }}
                  className="relative max-w-4xl max-h-full"
                  onClick={e => e.stopPropagation()}
                >
                  <img 
                    src={selectedReceiptImage} 
                    alt="Full Scan" 
                    className="rounded-2xl shadow-2xl max-h-[85vh] object-contain"
                  />
                  <button 
                    onClick={() => setSelectedReceiptImage(null)}
                    className="absolute -top-4 -right-4 p-3 bg-white text-slate-900 rounded-full shadow-xl hover:scale-110 transition-transform"
                  >
                    <Plus className="rotate-45" size={20} />
                  </button>
                </motion.div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 font-sans p-4 md:p-8">
      <div className="max-w-4xl mx-auto space-y-8">
        
        {/* Navigation Top bar */}
        <div className="flex items-center justify-between">
          <button
            onClick={() => {
              setActiveSection('selection');
              setSelectedCategory(null);
            }}
            className="flex items-center gap-2 text-sm font-semibold text-slate-500 hover:text-indigo-600 transition-colors bg-white px-4 py-2 rounded-xl border border-slate-200 shadow-sm cursor-pointer"
          >
            <ArrowLeft size={16} />
            Zpět na výběr sekce
          </button>
          <span className="text-xs font-bold uppercase text-slate-400 tracking-wider">
            Sekce: Účtenky a složenky
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
            <h1 id="app-title" className="text-3xl font-bold tracking-tight text-slate-900 flex items-center gap-3">
              <span className="p-2.5 bg-indigo-600 rounded-2xl text-white shadow-lg shadow-indigo-200">
                <ShoppingBag size={24} />
              </span>
              DOKLADOVKA
            </h1>
            <p className="text-slate-500 mt-2 text-sm md:text-base">Mějte přehled o každém rohlíku skrze AI.</p>
          </div>
          <div className="flex flex-col xs:flex-row flex-wrap gap-3 w-full sm:w-auto">
            <button 
              id="manual-add-btn"
              onClick={() => setShowManualForm(!showManualForm)}
              className="flex-1 sm:flex-none flex items-center justify-center gap-2 px-5 py-3 bg-white border border-slate-200 rounded-2xl hover:bg-slate-50 transition-all shadow-sm font-medium text-sm"
            >
              <Plus size={18} />
              <span>Ruční nákup</span>
            </button>
            <button 
              id="gallery-btn"
              onClick={() => fileInputRef.current?.click()}
              className="flex-1 sm:flex-none flex items-center justify-center gap-2 px-5 py-3 bg-indigo-50 border border-indigo-100 text-indigo-600 rounded-2xl hover:bg-indigo-100 transition-all shadow-sm font-medium text-sm"
            >
              <Upload size={18} />
              <span>Galerie</span>
            </button>
            <button 
              id="upload-btn"
              onClick={() => toggleCamera(true)}
              className="flex-1 sm:flex-none flex items-center justify-center gap-2 px-5 py-3 bg-indigo-600 text-white rounded-2xl hover:bg-indigo-700 transition-all shadow-md shadow-indigo-100 font-medium text-sm"
            >
              <Camera size={18} />
              <span>Fotit účtenku</span>
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

        {/* Full Image Preview Modal */}
        <AnimatePresence>
          {selectedReceiptImage && (
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setSelectedReceiptImage(null)}
              className="fixed inset-0 z-[60] bg-black/90 backdrop-blur-sm flex items-center justify-center p-4 md:p-12 cursor-pointer"
            >
              <motion.div 
                initial={{ scale: 0.9, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                exit={{ scale: 0.9, opacity: 0 }}
                className="relative max-w-4xl max-h-full"
                onClick={e => e.stopPropagation()}
              >
                <img 
                  src={selectedReceiptImage} 
                  alt="Full Receipt" 
                  className="rounded-2xl shadow-2xl max-h-[85vh] object-contain"
                />
                <button 
                  onClick={() => setSelectedReceiptImage(null)}
                  className="absolute -top-4 -right-4 p-3 bg-white text-slate-900 rounded-full shadow-xl hover:scale-110 transition-transform"
                >
                  <Plus className="rotate-45" size={20} />
                </button>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Live Camera Modal */}
        <AnimatePresence>
          {isCameraActive && (
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 z-50 bg-black flex flex-col items-center justify-center p-4 md:p-8"
            >
              <div className="relative w-full max-w-2xl bg-slate-900 rounded-3xl overflow-hidden shadow-2xl flex flex-col aspect-[3/4] md:aspect-video">
                {cameraError ? (
                  <div className="absolute inset-0 flex flex-col items-center justify-center p-8 text-center space-y-6">
                    <div className="bg-red-500/10 p-4 rounded-full">
                      <Camera size={48} className="text-red-500" />
                    </div>
                    <div className="space-y-2">
                      <h3 className="text-xl font-bold text-white">Chyba přístupu</h3>
                      <p className="text-slate-400 text-sm max-w-sm">{cameraError}</p>
                    </div>
                    <button 
                      onClick={() => {
                        toggleCamera(false);
                        nativeCameraRef.current?.click();
                      }}
                      className="px-6 py-3 bg-indigo-600 text-white rounded-xl font-bold hover:bg-indigo-700 transition-all shadow-lg active:scale-95"
                    >
                      Pustit nativní fotoaparát
                    </button>
                    <button 
                      onClick={() => toggleCamera(false)}
                      className="text-slate-500 hover:text-white transition-colors"
                    >
                      Zavřít
                    </button>
                  </div>
                ) : (
                  <>
                    <video 
                      ref={videoRef} 
                      autoPlay 
                      playsInline 
                      muted
                      className="absolute inset-0 w-full h-full object-cover"
                    />
                    
                    {/* Overlay UI */}
                    <div className="absolute inset-x-0 bottom-0 p-8 flex items-center justify-between bg-gradient-to-t from-black/80 to-transparent">
                      <button 
                        onClick={() => toggleCamera(false)}
                        className="p-4 bg-white/10 hover:bg-white/20 text-white rounded-full transition-colors backdrop-blur-xl"
                      >
                        <Plus className="rotate-45" size={24} />
                      </button>
                      
                      <button 
                        onClick={capturePhoto}
                        className="w-20 h-20 bg-white rounded-full p-1 border-4 border-white/30 active:scale-90 transition-transform shadow-lg shadow-white/10"
                      >
                        <div className="w-full h-full bg-white rounded-full border-2 border-black/10" />
                      </button>
                      
                      {hasFlash ? (
                        <button 
                          onClick={toggleFlash}
                          className={`p-4 rounded-full transition-colors backdrop-blur-xl ${isFlashOn ? 'bg-yellow-400 text-slate-900 shadow-lg shadow-yellow-400/20' : 'bg-white/10 text-white hover:bg-white/20'}`}
                        >
                          {isFlashOn ? <Flashlight size={24} /> : <FlashlightOff size={24} />}
                        </button>
                      ) : (
                        <div className="w-12 h-12" /> 
                      )}
                    </div>

                    {/* Scan Frame */}
                    <div className="absolute inset-12 border-2 border-white/20 border-dashed rounded-2xl pointer-events-none">
                      <div className="absolute inset-0 bg-white/5 animate-pulse" />
                    </div>
                  </>
                )}
              </div>
              <canvas ref={canvasRef} className="hidden" />
              {!cameraError && <p className="text-white/60 text-sm mt-6 font-medium">Zamiřte na účtenku a stiskněte spoušť</p>}
            </motion.div>
          )}
        </AnimatePresence>

        {/* Cropping Modal */}
        <AnimatePresence>
          {isCropping && imageToCrop && (
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 z-[70] bg-slate-900 flex flex-col"
            >
              <div className="flex-1 relative bg-black">
                <Cropper
                  image={imageToCrop}
                  crop={crop}
                  zoom={zoom}
                  aspect={undefined}
                  onCropChange={setCrop}
                  onCropComplete={onCropComplete}
                  onZoomChange={setZoom}
                />
              </div>
              
              <div className="bg-white p-6 md:p-8 flex flex-col gap-6 border-t border-slate-200">
                <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                  <div>
                    <h3 className="text-xl font-bold text-slate-900">Ořízněte účtenku</h3>
                    <p className="text-slate-500 text-sm">Vyberte pouze plochu účtenky pro lepší rozpoznání AI.</p>
                  </div>
                  <div className="flex gap-3">
                     <button 
                      onClick={() => {
                        setIsCropping(false);
                        setImageToCrop(null);
                      }}
                      className="px-6 py-3 bg-slate-100 text-slate-600 rounded-2xl font-bold hover:bg-slate-200 transition-all shadow-sm"
                    >
                      Zrušit
                    </button>
                    <button 
                      onClick={createCroppedImage}
                      className="flex-1 md:flex-none flex items-center justify-center gap-2 px-8 py-3 bg-indigo-600 text-white rounded-2xl font-bold hover:bg-indigo-700 transition-all shadow-lg active:scale-95"
                    >
                      <Crop size={20} />
                      Hotovo
                    </button>
                  </div>
                </div>
                
                <div className="space-y-2">
                  <div className="flex justify-between text-xs font-bold text-slate-400 uppercase tracking-widest">
                    <span>Přiblížení</span>
                    <span>{Math.round(zoom * 100)}%</span>
                  </div>
                  <input
                    type="range"
                    value={zoom}
                    min={1}
                    max={3}
                    step={0.1}
                    aria-labelledby="Zoom"
                    onChange={(e) => setZoom(Number(e.target.value))}
                    className="w-full h-2 bg-slate-100 rounded-lg appearance-none cursor-pointer accent-indigo-600"
                  />
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* AI Scanner Animation Section */}
        <AnimatePresence>
          {isScanning && (
            <motion.div 
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="bg-indigo-900 text-white rounded-3xl p-8 flex flex-col items-center justify-center text-center relative overflow-hidden"
            >
              <motion.div 
                className="absolute inset-0 bg-gradient-to-r from-indigo-800 to-indigo-950 opacity-50"
                animate={{ x: ['-100%', '100%'] }}
                transition={{ duration: 2, repeat: Infinity, ease: "linear" }}
              />
              <div className="relative z-10 space-y-4">
                <div className="bg-indigo-500/20 p-4 rounded-full inline-block">
                  <div className="relative">
                    <Loader2 size={48} className="animate-spin text-indigo-100" />
                    <Zap size={20} className="absolute inset-0 m-auto text-yellow-400 animate-pulse" />
                  </div>
                </div>
                <h2 className="text-xl font-bold">
                  {scanningTotal > 1 
                    ? `Magické čtení účtenek (${scanningIndex}/${scanningTotal})...`
                    : "Magické čtení..."
                  }
                </h2>
                <p className="text-indigo-100 max-w-sm font-medium">
                  {scanningTotal > 1
                    ? "Naše AI postupně extrahuje a analyzuje data ze všech nahraných účtenek."
                    : "Naše AI právě precizně extrahuje data z vaší účtenky."
                  }
                </p>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Manual Form Modal (Inline) */}
        <AnimatePresence>
          {showManualForm && (
            <motion.div 
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              className="overflow-hidden"
            >
              <form onSubmit={addManualReceipt} className="bg-white border border-slate-200 rounded-3xl p-6 shadow-sm space-y-4">
                <h3 className="font-semibold text-lg">Zadat nákup ručně</h3>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                  <div className="space-y-1">
                    <label className="text-xs font-medium text-slate-500 uppercase">Obchod</label>
                    <input 
                      type="text" 
                      value={shopName}
                      onChange={e => setShopName(e.target.value)}
                      placeholder="Např. Lidl" 
                      className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none transition-all"
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-xs font-medium text-slate-500 uppercase">Celková cena (Kč)</label>
                    <input 
                      type="number" 
                      value={manualPrice}
                      onChange={e => setManualPrice(e.target.value)}
                      placeholder="0.00" 
                      className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none transition-all"
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-xs font-medium text-slate-500 uppercase">Kategorie</label>
                    <select 
                      value={newCategory}
                      onChange={e => setNewCategory(e.target.value)}
                      className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none transition-all appearance-none"
                    >
                      {CATEGORIES.map(cat => <option key={cat.id} value={cat.name}>{cat.name}</option>)}
                    </select>
                  </div>
                  <div className="space-y-1">
                    <label className="text-xs font-medium text-slate-500 uppercase">Datum</label>
                    <input 
                      type="date" 
                      value={newDate}
                      onChange={e => setNewDate(e.target.value)}
                      className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none transition-all"
                    />
                  </div>
                </div>
                <div className="flex justify-end gap-2 pt-2">
                  <button 
                    type="button"
                    onClick={() => setShowManualForm(false)}
                    className="px-4 py-2 text-slate-600 hover:bg-slate-100 rounded-lg transition-colors"
                  >
                    Zrušit
                  </button>
                  <button 
                    type="submit"
                    className="px-6 py-2 bg-slate-900 text-white rounded-lg hover:bg-slate-800 transition-colors"
                  >
                    Uložit výdaj
                  </button>
                </div>
              </form>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Dashboard Stats */}
        <section className="grid grid-cols-1 lg:grid-cols-3 gap-4 md:gap-6">
          <div className="bg-white p-5 md:p-8 rounded-[32px] border border-slate-200 shadow-sm col-span-1 lg:col-span-2">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-6">
              <h2 className="font-semibold text-lg flex items-center gap-2">
                <PieChart size={20} className="text-indigo-600" />
                Měsíční útrata
              </h2>
              <span className="text-2xl md:text-3xl font-bold text-slate-900">{totalSpent.toLocaleString()} Kč</span>
            </div>
            
            <div className="space-y-5">
              {CATEGORIES.map(cat => {
                const amount = receipts.filter(r => r.category.trim().toLowerCase() === cat.name.toLowerCase()).reduce((sum, r) => sum + r.totalAmount, 0);
                const percentage = totalSpent > 0 ? (amount / totalSpent) * 100 : 0;
                
                return (
                  <button 
                    key={cat.id} 
                    onClick={() => setSelectedCategory(cat.name)}
                    className="w-full text-left space-y-1 group cursor-pointer"
                  >
                    <div className="flex justify-between text-sm">
                      <span className="flex items-center gap-2 text-slate-600 group-hover:text-indigo-600 transition-colors">
                        <cat.icon size={14} className="text-slate-400 group-hover:text-indigo-400" />
                        {cat.name}
                      </span>
                      <span className="font-medium group-hover:text-indigo-600 transition-colors">{amount.toLocaleString()} Kč</span>
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

          <div className="bg-indigo-600 p-6 rounded-3xl text-white flex flex-col justify-between shadow-lg shadow-indigo-200">
            <div>
              <div className="bg-white/20 p-2 rounded-lg inline-block mb-3">
                <CheckCircle2 size={24} />
              </div>
              <h3 className="text-lg font-medium opacity-90">Naskenováno</h3>
              <p className="text-3xl font-bold mt-1">{receipts.length} <span className="text-lg font-normal opacity-75">nákupů</span></p>
            </div>
            <p className="text-sm opacity-75 mt-4">
              AI automaticky roztřídila vaše nákupy podle obsahu účtenky.
            </p>
          </div>
        </section>

        {/* Period selection & Export controls */}
        <div className="bg-white border border-slate-200 p-6 rounded-3xl flex flex-col md:flex-row gap-5 items-center justify-between shadow-xs mb-2">
          <div className="flex flex-col sm:flex-row gap-4 items-center w-full md:w-auto">
            <div className="flex items-center gap-2 text-slate-700 font-semibold text-sm whitespace-nowrap self-start sm:self-auto">
              <Calendar size={18} className="text-indigo-600" />
              <span>Zvolené období pro přehled:</span>
            </div>
            
            <div className="flex items-center gap-2.5 w-full sm:w-auto">
              <div className="relative w-full sm:w-36">
                <span className="absolute left-3 top-2.5 text-[9px] font-bold text-slate-400 uppercase tracking-wider">Od</span>
                <input 
                  type="date"
                  value={filterFromDate}
                  onChange={(e) => setFilterFromDate(e.target.value)}
                  className="w-full pl-9 pr-2.5 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs focus:outline-none focus:ring-2 focus:ring-indigo-500 text-slate-750 font-medium"
                />
              </div>
              
              <span className="text-slate-400 font-bold">—</span>
              
              <div className="relative w-full sm:w-36">
                <span className="absolute left-3 top-2.5 text-[9px] font-bold text-slate-400 uppercase tracking-wider">Do</span>
                <input 
                  type="date"
                  value={filterToDate}
                  onChange={(e) => setFilterToDate(e.target.value)}
                  className="w-full pl-9 pr-2.5 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs focus:outline-none focus:ring-2 focus:ring-indigo-500 text-slate-755 font-medium"
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
          
          <button
            onClick={() => exportExpensesToPDF(sortedReceipts, filterFromDate, filterToDate, totalSpent)}
            disabled={sortedReceipts.length === 0}
            className="w-full md:w-auto flex items-center justify-center gap-2 px-6 py-3 bg-indigo-600 hover:bg-indigo-700 text-white disabled:opacity-50 disabled:cursor-not-allowed rounded-2xl font-semibold text-sm shadow-md shadow-indigo-100 transition-all cursor-pointer whitespace-nowrap shrink-0"
          >
            <Download size={16} />
            <span>Exportovat přehled (PDF)</span>
          </button>
        </div>

        {/* Fronta nahrávání a zpracování účtenek */}
        {receiptQueue.length > 0 && (
          <div className="bg-white border-2 border-indigo-100 rounded-3xl p-6 shadow-sm space-y-4">
            <div className="flex items-center justify-between border-b border-indigo-50 pb-3">
              <h3 className="font-bold text-slate-900 flex items-center gap-2 text-sm md:text-base">
                <span className="relative flex h-3 w-3">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-indigo-400 opacity-75"></span>
                  <span className="relative inline-flex rounded-full h-3 w-3 bg-indigo-600"></span>
                </span>
                Fronta zpracování účtenek ({receiptQueue.filter(q => q.status === 'done' || q.status === 'failed').length} / {receiptQueue.length} hotovo)
              </h3>
              {receiptQueue.every(q => q.status === 'done' || q.status === 'failed') && (
                <button 
                  onClick={() => setReceiptQueue([])}
                  className="text-xs text-indigo-600 hover:text-indigo-800 font-bold hover:underline cursor-pointer"
                >
                  Vyčistit frontu
                </button>
              )}
            </div>
            
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3 max-h-60 overflow-y-auto pr-1">
              {receiptQueue.map(item => (
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

        {/* Bills List (Latest) */}
        <section className="bg-white rounded-3xl border border-slate-200 shadow-sm overflow-hidden">
          <div className="p-4 md:p-6 border-b border-slate-100 flex items-center justify-between">
            <h2 className="font-semibold text-lg flex items-center gap-2">
              <History size={20} className="text-indigo-600" />
              Poslední přidané
            </h2>
            <span className="text-[10px] md:text-xs font-medium text-slate-500 uppercase tracking-wider bg-slate-100 px-2.5 py-1 rounded-full">
              Zobrazeno {sortedReceipts.length} z {receipts.length}
            </span>
          </div>
          
          {/* Desktop Table View */}
          <div className="hidden md:block overflow-x-auto">
            <table className="w-full text-left">
              <thead>
                <tr className="border-b border-slate-100 bg-slate-50/50">
                  <th className="px-6 py-4 text-xs font-semibold text-slate-500 uppercase tracking-wider">Obchod / Položky</th>
                  <th className="px-6 py-4 text-xs font-semibold text-slate-500 uppercase tracking-wider">Kategorie</th>
                  <th className="px-6 py-4 text-xs font-semibold text-slate-500 uppercase tracking-wider">Datum</th>
                  <th className="px-6 py-4 text-xs font-semibold text-slate-500 uppercase tracking-wider text-right">Částka</th>
                  <th className="px-6 py-4 text-xs font-semibold text-slate-500 uppercase tracking-wider"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                <AnimatePresence initial={false}>
                  {sortedReceipts.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="px-6 py-12 text-center text-slate-400 italic">
                        V tomto období nemáte žádné přidané nákupy.
                      </td>
                    </tr>
                  ) : (
                    sortedReceipts.map(receipt => (
                      <motion.tr 
                        key={receipt.id}
                        initial={{ opacity: 0, x: -10 }}
                        animate={{ opacity: 1, x: 0 }}
                        exit={{ opacity: 0, x: 10 }}
                        className="hover:bg-slate-50/50 transition-colors group"
                      >
                        <td className="px-6 py-4">
                          <div className="flex items-center gap-3">
                            {receipt.imageUrl && (
                              <button 
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setSelectedReceiptImage(receipt.imageUrl || null);
                                }}
                                className="relative group cursor-zoom-in"
                              >
                                <img 
                                  src={receipt.imageUrl} 
                                  alt="Receipt" 
                                  className="w-12 h-12 rounded-lg object-cover border border-slate-200"
                                />
                                <div className="absolute inset-0 bg-black/0 group-hover:bg-black/20 rounded-lg flex items-center justify-center transition-all">
                                  <Maximize2 size={12} className="text-white opacity-0 group-hover:opacity-100" />
                                </div>
                              </button>
                            )}
                            <div>
                              <div className="font-medium text-slate-900 flex flex-wrap items-center gap-1.5 leading-tight">
                                {receipt.shopName}
                                {receipt.isFallback && (
                                  <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 bg-amber-50 text-[10px] font-bold text-amber-600 rounded-lg border border-amber-100">
                                    Simulováno (API Quota Limit)
                                  </span>
                                )}
                              </div>
                              <div className="text-xs text-slate-400 flex flex-col gap-1 mt-2">
                                {receipt.items.map((item, idx) => (
                                  <div key={idx} className="flex justify-between max-w-[200px]">
                                    <span className="truncate pr-4">{item.name}</span>
                                    <span className="shrink-0">{item.price} Kč</span>
                                  </div>
                                ))}
                              </div>
                            </div>
                          </div>
                        </td>
                        <td className="px-6 py-4">
                          <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                            CATEGORIES.find(c => c.name.toLowerCase() === receipt.category.trim().toLowerCase())?.color.replace('bg-', 'bg-opacity-10 text-') || 'bg-slate-100 text-slate-600'
                          } ${
                            CATEGORIES.find(c => c.name.toLowerCase() === receipt.category.trim().toLowerCase())?.color.replace('bg-', 'text-')
                          }`}>
                            {receipt.category}
                          </span>
                        </td>
                        <td className="px-6 py-4 text-slate-600 text-sm">
                          {new Date(receipt.date).toLocaleDateString('cs-CZ')}
                        </td>
                        <td className="px-6 py-4 text-right font-semibold text-slate-900">
                          {receipt.totalAmount.toLocaleString()} Kč
                        </td>
                        <td className="px-6 py-4 text-right">
                          <button 
                            onClick={() => deleteReceipt(receipt.id)}
                            className="p-2 text-slate-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-all opacity-0 group-hover:opacity-100"
                          >
                            <Trash2 size={16} />
                          </button>
                        </td>
                      </motion.tr>
                    ))
                  )}
                </AnimatePresence>
              </tbody>
            </table>
          </div>

          {/* Mobile Card View */}
          <div className="md:hidden divide-y divide-slate-100 text-slate-900">
            <AnimatePresence initial={false}>
              {sortedReceipts.length === 0 ? (
                <div className="px-6 py-12 text-center text-slate-400 italic">
                  V tomto období nemáte žádné přidané nákupy.
                </div>
              ) : (
                sortedReceipts.map(receipt => (
                  <motion.div 
                    key={receipt.id}
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, scale: 0.95 }}
                    className="p-4 space-y-3"
                  >
                    <div className="flex justify-between items-start">
                      <div className="flex items-start gap-3">
                        {receipt.imageUrl && (
                          <button 
                            onClick={(e) => {
                              e.stopPropagation();
                              setSelectedReceiptImage(receipt.imageUrl || null);
                            }}
                            className="relative group cursor-zoom-in"
                          >
                            <img 
                              src={receipt.imageUrl} 
                              alt="Receipt" 
                              className="w-16 h-16 rounded-xl object-cover border border-slate-200 shadow-sm"
                            />
                            <div className="absolute inset-0 bg-black/0 active:bg-black/20 rounded-xl flex items-center justify-center transition-all">
                              <Maximize2 size={16} className="text-white opacity-100" />
                            </div>
                          </button>
                        )}
                        <div>
                          <div className="font-semibold text-slate-900 flex flex-wrap items-center gap-1.5 leading-tight">
                            {receipt.shopName}
                            {receipt.isFallback && (
                              <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 bg-amber-50 text-[10px] font-bold text-amber-600 rounded-lg border border-amber-100">
                                Simulováno (API Quota Limit)
                              </span>
                            )}
                          </div>
                          <div className="text-[10px] text-slate-400 uppercase tracking-wide">{receipt.id}</div>
                        </div>
                      </div>
                      <div className="text-right">
                        <div className="font-bold text-lg">{receipt.totalAmount.toLocaleString()} Kč</div>
                        <div className="text-xs text-slate-400">{new Date(receipt.date).toLocaleDateString('cs-CZ')}</div>
                      </div>
                    </div>
                    
                    <div className="text-xs text-slate-500 border-l-2 border-slate-100 pl-3 py-1 space-y-1">
                      {receipt.items.map((item, idx) => (
                        <div key={idx} className="flex justify-between">
                          <span>{item.name}</span>
                          <span className="text-slate-400">{item.price} Kč</span>
                        </div>
                      ))}
                    </div>

                    <div className="flex justify-between items-center">
                      <span className={`inline-flex items-center px-3 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider ${
                        CATEGORIES.find(c => c.name.toLowerCase() === receipt.category.trim().toLowerCase())?.color.replace('bg-', 'bg-opacity-10 text-') || 'bg-slate-100 text-slate-600'
                      } ${
                        CATEGORIES.find(c => c.name.toLowerCase() === receipt.category.trim().toLowerCase())?.color.replace('bg-', 'text-')
                      }`}>
                        {receipt.category}
                      </span>
                      <button 
                        onClick={() => deleteReceipt(receipt.id)}
                        className="p-2 text-red-500 bg-red-50 rounded-lg active:scale-95 transition-transform"
                      >
                        <Trash2 size={16} />
                      </button>
                    </div>
                  </motion.div>
                ))
              )}
            </AnimatePresence>
          </div>
        </section>

        {/* Category Detail View */}
        <AnimatePresence>
          {selectedCategory && (
            <motion.div 
              initial={{ opacity: 0, x: '100%' }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: '100%' }}
              className="fixed inset-0 z-40 bg-slate-50 flex flex-col p-4 md:p-8 md:pt-12 overflow-y-auto"
            >
              <div className="max-w-4xl mx-auto w-full space-y-8">
                <div className="flex items-center justify-between">
                  <button 
                    onClick={() => setSelectedCategory(null)}
                    className="flex items-center gap-2 text-indigo-600 font-medium hover:translate-x-[-4px] transition-transform"
                  >
                    <ArrowLeft size={20} />
                    Zpět na přehled
                  </button>
                  <h2 className="text-2xl font-bold">{selectedCategory}</h2>
                </div>

                {/* Category Summary Card */}
                <div className="bg-white p-8 rounded-3xl border border-slate-200 shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-6">
                  <div>
                    <div className="text-sm font-medium text-slate-500 uppercase tracking-wider mb-1">Celková útrata v kategorii</div>
                    <div className="text-4xl font-black text-slate-900">
                      {receipts
                        .filter(r => r.category.trim().toLowerCase() === selectedCategory.toLowerCase())
                        .reduce((sum, r) => sum + r.totalAmount, 0)
                        .toLocaleString()} Kč
                    </div>
                  </div>
                  <div className="flex gap-4">
                    <div className="p-4 bg-indigo-50 rounded-2xl">
                      <div className="text-[10px] text-indigo-400 uppercase font-bold">Počet účtenek</div>
                      <div className="text-xl font-bold text-indigo-700">
                        {receipts.filter(r => r.category.trim().toLowerCase() === selectedCategory.toLowerCase()).length}
                      </div>
                    </div>
                  </div>
                </div>

                  <h3 className="font-semibold text-lg px-2 flex justify-between items-center">
                    <span>Výpis účtenek (od nejnovější)</span>
                    <span className="text-xs font-normal text-slate-400 italic">Srovnáno automaticky podle data</span>
                  </h3>
                  <div className="bg-white rounded-3xl border border-slate-200 shadow-sm divide-y divide-slate-100 overflow-hidden">
                    {sortedReceipts
                      .filter(r => r.category.trim().toLowerCase() === selectedCategory.toLowerCase())
                      .map(receipt => (
                        <div key={receipt.id} className="p-6 hover:bg-slate-50 transition-colors">
                          <div className="flex flex-col sm:flex-row justify-between gap-4">
                            <div className="flex gap-4">
                              {receipt.imageUrl && (
                                <img 
                                  src={receipt.imageUrl} 
                                  alt="Receipt" 
                                  onClick={() => setSelectedReceiptImage(receipt.imageUrl || null)}
                                  className="w-16 h-16 rounded-xl object-cover border border-slate-200 cursor-zoom-in"
                                />
                              )}
                              <div>
                                <div className="font-bold text-lg text-slate-900">{receipt.shopName}</div>
                                <div className="text-sm text-slate-500">{new Date(receipt.date).toLocaleDateString('cs-CZ')}</div>
                                <div className="text-[10px] text-slate-400 mt-1 uppercase">ID: {receipt.id}</div>
                              </div>
                            </div>
                            <div className="text-left sm:text-right">
                              <div className="text-2xl font-black text-indigo-600">{receipt.totalAmount.toLocaleString()} Kč</div>
                              <button 
                                onClick={() => deleteReceipt(receipt.id)}
                                className="mt-2 text-xs text-red-500 hover:underline flex items-center gap-1 sm:justify-end"
                              >
                                <Trash2 size={12} /> Odstranit
                              </button>
                            </div>
                          </div>
                          
                          <div className="mt-6 pt-4 border-t border-slate-50">
                            <div className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-3">Položky nákupu</div>
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-8 gap-y-2">
                              {receipt.items.map((item, idx) => (
                                <div key={idx} className="flex justify-between text-sm py-1 border-b border-slate-50 last:border-0">
                                  <span className="text-slate-700">{item.name}</span>
                                  <span className="font-medium text-slate-900">{item.price} Kč</span>
                                </div>
                              ))}
                            </div>
                          </div>
                        </div>
                      ))}
                    {receipts.filter(r => r.category.trim().toLowerCase() === selectedCategory.toLowerCase()).length === 0 && (
                      <div className="p-12 text-center text-slate-400 italic">V této kategorii zatím nemáte žádné účtenky.</div>
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
                    <h3 className="text-xl font-bold text-slate-900">Duplicitní soubor detekován</h3>
                    <p className="text-xs text-slate-500">
                      Tento soubor byl pravděpodobně již nahrán. Vyberte, jak konflikt vyřešit.
                    </p>
                  </div>
                </div>

                <div className="bg-slate-50 rounded-2xl p-4 text-xs text-slate-600 border border-slate-100 leading-relaxed">
                  Byl rozpoznán soubor se stejným názvem popř. velikostí jako již existující uložená účtenka. Srovnejte je prosím níže:
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-6 pb-2">
                  {/* Left: Existing Item */}
                  <div className="border border-slate-200 rounded-2xl p-4 bg-slate-50/55 space-y-3">
                    <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Existující uložený záznam:</div>
                    <div className="space-y-1.5 min-w-0">
                      <div className="font-bold text-base text-indigo-700 truncate block">
                        {duplicateConflicts[0].existingItem.shopName}
                      </div>
                      <div className="text-xs font-semibold text-slate-500">
                        Datum: {new Date(duplicateConflicts[0].existingItem.date).toLocaleDateString('cs-CZ')}
                      </div>
                      <div className="text-xs font-semibold text-indigo-600">
                        Částka: {duplicateConflicts[0].existingItem.totalAmount} Kč
                      </div>
                      <div className="text-[10px] text-slate-400 italic truncate block">
                        Soubor: {duplicateConflicts[0].existingItem.fileName || "Není k dispozici"}
                      </div>
                    </div>
                    {duplicateConflicts[0].existingItem.imageUrl ? (
                      <img 
                        src={duplicateConflicts[0].existingItem.imageUrl} 
                        alt="Stávající" 
                        className="w-full h-44 object-cover rounded-xl border border-slate-200 mt-2"
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
                    onClick={() => {
                      setDuplicateConflicts(prev => prev.slice(1));
                    }}
                    className="px-4 py-2.5 rounded-xl border border-slate-200 text-slate-700 hover:bg-slate-50 font-bold transition-all text-xs cursor-pointer"
                  >
                    Přeskočit (Neukládat)
                  </button>
                  <button
                    onClick={() => {
                      const conflict = duplicateConflicts[0];
                      const newQueueItem: ReceiptQueueItem = {
                        id: 'RQ-' + Math.random().toString(36).substr(2, 9).toUpperCase(),
                        name: conflict.file.name,
                        status: 'queued',
                        file: conflict.file
                      };
                      setReceiptQueue(prev => [...prev, newQueueItem]);
                      setDuplicateConflicts(prev => prev.slice(1));
                    }}
                    className="px-4 py-2.5 rounded-xl bg-slate-800 text-white hover:bg-slate-700 font-bold transition-all text-xs cursor-pointer"
                  >
                    Ponechat oba
                  </button>
                  <button
                    onClick={() => {
                      const conflict = duplicateConflicts[0];
                      setReceipts(prev => prev.filter(r => r.id !== conflict.existingItem.id));
                      const newQueueItem: ReceiptQueueItem = {
                        id: 'RQ-' + Math.random().toString(36).substr(2, 9).toUpperCase(),
                        name: conflict.file.name,
                        status: 'queued',
                        file: conflict.file
                      };
                      setReceiptQueue(prev => [...prev, newQueueItem]);
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
    </div>
  );
}

