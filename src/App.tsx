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
  Crop
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

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

export default function App() {
  const [receipts, setReceipts] = useState<Receipt[]>([]);
  const [isScanning, setIsScanning] = useState(false);
  const [showManualForm, setShowManualForm] = useState(false);
  const [isCameraActive, setIsCameraActive] = useState(false);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [selectedReceiptImage, setSelectedReceiptImage] = useState<string | null>(null);
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [isFlashOn, setIsFlashOn] = useState(false);
  const [hasFlash, setHasFlash] = useState(false);

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

  // Manual Form State
  const [shopName, setShopName] = useState('');
  const [manualPrice, setManualPrice] = useState('');
  const [newCategory, setNewCategory] = useState(CATEGORIES[0].name);
  const [newDate, setNewDate] = useState(new Date().toISOString().split('T')[0]);

  // Persistence: Load from localStorage
  useEffect(() => {
    const saved = localStorage.getItem('smart-receipts');
    if (saved) {
      try {
        setReceipts(JSON.parse(saved));
      } catch (e) {
        console.error("Failed to load receipts", e);
      }
    }
  }, []);

  // Persistence: Save to localStorage
  useEffect(() => {
    if (receipts.length > 0) {
      localStorage.setItem('smart-receipts', JSON.stringify(receipts));
    }
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

  const handleFileUpload = (e: ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0];
      const reader = new FileReader();
      reader.onloadend = () => {
        const base64String = reader.result as string;
        setImageToCrop(base64String);
        setIsCropping(true);
      };
      reader.readAsDataURL(file);
      
      if (e.target) e.target.value = '';
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
      startScanning(croppedImage, 'image/jpeg');
    } catch (e) {
      console.error(e);
    }
  };

  const startScanning = async (base64Image?: string, mimeType: string = 'image/jpeg') => {
    setIsScanning(true);
    
    try {
      if (base64Image) {
        const response = await fetch("/api/extract-receipt", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ image: base64Image, mimeType }),
        });

        if (!response.ok) {
          throw new Error("Failed to extract data via AI");
        }

        const data = await response.json();
        
        const newReceipt: Receipt = {
          id: Math.random().toString(36).substr(2, 9).toUpperCase(),
          shopName: data.shopName || "Neznámý obchod",
          totalAmount: data.totalAmount || 0,
          date: data.date || new Date().toISOString().split('T')[0],
          category: data.category || "Ostatní",
          items: data.items || [],
          imageUrl: base64Image
        };
        setReceipts(prev => [newReceipt, ...prev]);
      } else {
        // Fallback to mock for manual testing if no image
        setTimeout(() => {
          const choice = mockAIChoices[Math.floor(Math.random() * mockAIChoices.length)];
          const total = choice.items.reduce((sum, i) => sum + i.price, 0);
          
          const newReceipt: Receipt = {
            id: Math.random().toString(36).substr(2, 9).toUpperCase(),
            shopName: choice.shopName,
            totalAmount: total,
            date: new Date().toISOString().split('T')[0],
            category: choice.category,
            items: choice.items
          };
          setReceipts(prev => [newReceipt, ...prev]);
        }, 1500);
      }
    } catch (err) {
      console.error("Scanning failed:", err);
      alert("AI čtení účtenky selhalo. Zkuste to prosím znovu nebo nákup přidejte ručně.");
    } finally {
      setIsScanning(false);
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

  const sortedReceipts = useMemo(() => {
    return [...receipts].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  }, [receipts]);

  const totalSpent = useMemo(() => receipts.reduce((sum, r) => sum + r.totalAmount, 0), [receipts]);

  const categorySummary = useMemo(() => {
    const summary: Record<string, number> = {};
    receipts.forEach(r => {
      summary[r.category] = (summary[r.category] || 0) + r.totalAmount;
    });
    return summary;
  }, [receipts]);

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 font-sans p-4 md:p-8">
      <div className="max-w-4xl mx-auto space-y-8">
        
        {/* Header */}
        <header className="flex flex-col sm:flex-row sm:items-start justify-between gap-6">
          <div className="text-left">
            <h1 id="app-title" className="text-3xl font-bold tracking-tight text-slate-900 flex items-center gap-3">
              <span className="p-2.5 bg-indigo-600 rounded-2xl text-white shadow-lg shadow-indigo-200">
                <ShoppingBag size={24} />
              </span>
              Nákupní Rádce
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
                <h2 className="text-xl font-bold">Magické čtení...</h2>
                <p className="text-indigo-100 max-w-sm font-medium">
                  Naše AI právě precizně extrahuje data z vaší účtenky.
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

        {/* Bills List (Latest) */}
        <section className="bg-white rounded-3xl border border-slate-200 shadow-sm overflow-hidden">
          <div className="p-4 md:p-6 border-b border-slate-100 flex items-center justify-between">
            <h2 className="font-semibold text-lg flex items-center gap-2">
              <History size={20} className="text-indigo-600" />
              Poslední přidané
            </h2>
            <span className="text-[10px] md:text-xs font-medium text-slate-400 uppercase tracking-wider">Celkem {receipts.length} položek</span>
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
                        Zatím nemáte žádné naskenované nákupy.
                      </td>
                    </tr>
                  ) : (
                    receipts.slice(0, 1).map(receipt => (
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
                              <div className="font-medium text-slate-900">{receipt.shopName}</div>
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
              {receipts.length === 0 ? (
                <div className="px-6 py-12 text-center text-slate-400 italic">
                  Zatím nemáte žádné naskenované nákupy.
                </div>
              ) : (
                receipts.slice(0, 1).map(receipt => (
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
                          <div className="font-semibold text-slate-900">{receipt.shopName}</div>
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

      </div>
    </div>
  );
}

