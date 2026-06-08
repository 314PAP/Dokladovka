import { useState, useEffect, useCallback } from 'react';
import { useLocalStorage } from './useLocalStorage';

interface UsePersistentDataOptions<T> {
  key: string;
  legacyKey?: string;
  backendEndpoint: string;
}

interface UsePersistentDataReturn<T> {
  data: T[];
  setData: (value: T[] | ((prev: T[]) => T[])) => void;
  mergeData: (incoming: T[]) => void;
  total: number;
}

export function usePersistentData<T extends { id: string }>(
  options: UsePersistentDataOptions<T>
): UsePersistentDataReturn<T> {
  const { key, legacyKey, backendEndpoint } = options;
  
  const [data, setData] = useLocalStorage<T[]>(key, []);
  
  const mergeData = useCallback((incoming: T[]) => {
    setData(prev => {
      const map = new Map<string, T>();
      prev.forEach(item => map.set(item.id, item));
      incoming.forEach(item => map.set(item.id, item));
      return Array.from(map.values());
    });
  }, [setData]);
  
  useEffect(() => {
    let active = true;
    fetch(backendEndpoint)
      .then(r => r.ok ? r.json() : [])
      .then((serverData: T[]) => {
        if (!active || !Array.isArray(serverData)) return;
        setData(prev => mergeDataLocal(prev, serverData));
      })
      .catch(err => console.error(`Failed to sync ${key}:`, err));
    return () => { active = false; };
  }, [backendEndpoint, key]);
  
  useEffect(() => {
    try {
      localStorage.setItem(key, JSON.stringify(data));
    } catch (e) {
      console.warn(`Storage quota exceeded for ${key}`);
      try {
        localStorage.setItem(key, JSON.stringify(data.map(d => ({ ...d, imageUrl: undefined }))));
      } catch {}
    }
    
    const timeoutId = setTimeout(() => {
      fetch(backendEndpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ [key.slice(0, -1)]: data })
      }).catch(err => console.error(`Failed to save ${key} to backend:`, err));
    }, 1200);
    
    return () => clearTimeout(timeoutId);
  }, [data, key, backendEndpoint]);
  
  const total = data.reduce((sum, item: any) => sum + (item.totalAmount || item.fileSize || 0), 0);
  
  return { data, setData, mergeData, total };
}

function mergeDataLocal<T extends { id: string }>(local: T[], server: T[]): T[] {
  const map = new Map<string, T>();
  local.forEach(item => map.set(item.id, item));
  server.forEach(item => map.set(item.id, item));
  return Array.from(map.values());
}