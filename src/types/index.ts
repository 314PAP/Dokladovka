export interface ReceiptItem {
  name: string;
  price: number;
}

export interface Receipt {
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
  fallbackError?: string;
  driveImageId?: string;
  driveImageUrl?: string;
}

export interface DocumentItem {
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
  driveImageId?: string;
  driveImageUrl?: string;
}
