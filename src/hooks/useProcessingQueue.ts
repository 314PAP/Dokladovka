import { useState, useEffect, useCallback } from 'react';

export type QueueStatus = 'queued' | 'compressing' | 'scanning' | 'done' | 'failed';

export interface QueueItemBase {
  id: string;
  name: string;
  status: QueueStatus;
  error?: string;
}

export interface QueueItemWithFile extends QueueItemBase {
  file?: File;
  virtualBase64?: string;
}

interface UseProcessingQueueOptions<T extends QueueItemBase> {
  processItem: (item: T) => Promise<void>;
  onItemProcessed?: (item: T) => void;
}

export function useProcessingQueue<T extends QueueItemBase>(
  options: UseProcessingQueueOptions<T>
) {
  const { processItem, onItemProcessed } = options;
  const [queue, setQueue] = useState<T[]>([]);
  
  const addItem = useCallback((item: T) => {
    setQueue(prev => [...prev, item]);
  }, []);
  
  const updateItem = useCallback((id: string, updates: Partial<T>) => {
    setQueue(prev => prev.map(item => 
      item.id === id ? { ...item, ...updates } as T : item
    ));
  }, []);
  
  const clearDone = useCallback(() => {
    setQueue(prev => prev.filter(item => 
      item.status !== 'done' && item.status !== 'failed'
    ));
  }, []);
  
  useEffect(() => {
    const queued = queue.find(item => item.status === 'queued');
    if (!queued) return;
    
    const process = async () => {
      await processItem(queued);
      onItemProcessed?.(queued);
    };
    
    process();
  }, [queue, processItem, onItemProcessed]);
  
  const isProcessing = queue.some(item => 
    item.status === 'compressing' || item.status === 'scanning' || item.status === 'queued'
  );
  
  return {
    queue,
    setQueue,
    addItem,
    updateItem,
    clearDone,
    isProcessing,
    total: queue.length,
    completed: queue.filter(q => q.status === 'done' || q.status === 'failed').length
  };
}