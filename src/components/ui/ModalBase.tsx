import { motion, AnimatePresence } from "motion/react";
import { ReactNode } from "react";
import { X } from "lucide-react";

interface ModalBaseProps {
  isOpen: boolean;
  onClose: () => void;
  title?: string;
  children: ReactNode;
  maxWidth?: string;
}

export default function ModalBase({ isOpen, onClose, title, children, maxWidth = "max-w-2xl" }: ModalBaseProps) {
  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={onClose}
          className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4"
        >
          <motion.div
            initial={{ scale: 0.95, y: 15 }}
            animate={{ scale: 1, y: 0 }}
            exit={{ scale: 0.95, y: 15 }}
            onClick={e => e.stopPropagation()}
            className={`bg-white rounded-3xl ${maxWidth} w-full max-h-[90vh] overflow-y-auto shadow-2xl`}
          >
            {title && (
              <div className="p-6 border-b border-slate-100 flex items-center justify-between">
                <h2 className="text-xl font-bold">{title}</h2>
                <button onClick={onClose} className="p-2 rounded-full hover:bg-slate-100">
                  <X size={20} />
                </button>
              </div>
            )}
            <div className="p-6">{children}</div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
