import React, { useState, useEffect } from 'react';
import { Loader2 } from 'lucide-react';

interface FilePreviewProps {
  file: File;
}

function FilePreview({ file }: FilePreviewProps) {
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

export default FilePreview;