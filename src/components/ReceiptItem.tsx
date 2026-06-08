import { Receipt } from "../types";
import { Trash2, Maximize2 } from "lucide-react";

interface ReceiptItemProps {
  receipt: Receipt;
  onDelete: (id: string) => void;
  onPreviewImage?: (imageUrl: string) => void;
}

export default function ReceiptItem({ receipt, onDelete, onPreviewImage }: ReceiptItemProps) {
  return (
    <tr className="hover:bg-slate-50/50 transition-colors group">
      <td className="px-6 py-4">
        <div className="flex items-center gap-3">
          {receipt.imageUrl && onPreviewImage && (
            <button onClick={() => onPreviewImage(receipt.imageUrl!)} className="relative group cursor-zoom-in">
              <img src={receipt.imageUrl} alt="Receipt" className="w-12 h-12 rounded-lg object-cover border border-slate-200" />
              <div className="absolute inset-0 bg-black/0 group-hover:bg-black/20 rounded-lg flex items-center justify-center transition-all">
                <Maximize2 size={12} className="text-white opacity-0 group-hover:opacity-100" />
              </div>
            </button>
          )}
          <div>
            <div className="font-medium text-slate-900">{receipt.shopName}</div>
            {receipt.items.map((item, idx) => (
              <div key={idx} className="text-xs text-slate-400 flex justify-between max-w-[200px]">
                <span className="truncate pr-4">{item.name}</span>
                <span>{item.price} Kč</span>
              </div>
            ))}
          </div>
        </div>
      </td>
      <td className="px-6 py-4">
        <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium">{receipt.category}</span>
      </td>
      <td className="px-6 py-4 text-slate-600 text-sm">
        {new Date(receipt.date).toLocaleDateString("cs-CZ")}
      </td>
      <td className="px-6 py-4 text-right font-semibold text-slate-900">
        {receipt.totalAmount.toLocaleString()} Kč
      </td>
      <td className="px-6 py-4 text-right">
        <button onClick={() => onDelete(receipt.id)} className="p-2 text-slate-400 hover:text-red-500 rounded-lg transition-all opacity-0 group-hover:opacity-100">
          <Trash2 size={16} />
        </button>
      </td>
    </tr>
  );
}
