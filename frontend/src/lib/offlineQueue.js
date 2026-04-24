import { useEffect, useState } from "react";
import { toast } from "sonner";
import api from "@/lib/api";

const DB_NAME = "cylinder-ms-offline";
const DB_VERSION = 1;
const STORE_NAME = "pending_requests";

function openDb() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: "id" });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function withStore(mode, callback) {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, mode);
    const store = tx.objectStore(STORE_NAME);
    const result = callback(store);
    tx.oncomplete = () => {
      db.close();
      resolve(result);
    };
    tx.onerror = () => {
      db.close();
      reject(tx.error);
    };
  });
}

export async function addPendingRequest({ type, method = "post", url, data }) {
  const id = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  const record = {
    id,
    type,
    method,
    url,
    data,
    status: "PENDING_SYNC",
    createdAt: new Date().toISOString(),
  };
  await withStore("readwrite", (store) => store.put(record));
  return record;
}

async function getAllPendingRequests() {
  return new Promise(async (resolve, reject) => {
    try {
      const db = await openDb();
      const tx = db.transaction(STORE_NAME, "readonly");
      const request = tx.objectStore(STORE_NAME).getAll();
      request.onsuccess = () => resolve(request.result || []);
      request.onerror = () => reject(request.error);
      tx.oncomplete = () => db.close();
    } catch (error) {
      reject(error);
    }
  });
}

async function deletePendingRequest(id) {
  await withStore("readwrite", (store) => store.delete(id));
}

export function useOfflineSync({ onSynced } = {}) {
  const [pendingCount, setPendingCount] = useState(0);

  useEffect(() => {
    if (!("indexedDB" in window)) return undefined;

    let cancelled = false;

    const refreshCount = async () => {
      const pending = await getAllPendingRequests();
      if (!cancelled) setPendingCount(pending.length);
    };

    const syncPending = async () => {
      if (!navigator.onLine) return;
      const pending = await getAllPendingRequests();
      if (!pending.length) {
        if (!cancelled) setPendingCount(0);
        return;
      }

      let synced = 0;
      for (const request of pending) {
        try {
          await api.request({
            method: request.method,
            url: request.url,
            data: request.data,
          });
          await deletePendingRequest(request.id);
          synced += 1;
        } catch (error) {
          console.error("[offline-sync] request failed:", request.url, error);
        }
      }

      await refreshCount();
      if (synced > 0) {
        toast.success(`${synced} offline item${synced === 1 ? "" : "s"} synced`);
        onSynced?.();
      }
    };

    refreshCount().catch(console.error);
    syncPending().catch(console.error);
    window.addEventListener("online", syncPending);

    return () => {
      cancelled = true;
      window.removeEventListener("online", syncPending);
    };
  }, [onSynced]);

  return { pendingCount };
}
