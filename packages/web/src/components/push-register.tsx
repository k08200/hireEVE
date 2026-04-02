"use client";

import { useEffect } from "react";
import { API_BASE, authHeaders } from "../lib/api";

/**
 * Registers the browser for push notifications after service worker is ready.
 * Silently subscribes if permission is already granted.
 * Does nothing if VAPID key is not configured or permission is denied.
 */
export default function PushRegister() {
  useEffect(() => {
    if (!("serviceWorker" in navigator) || !("PushManager" in window)) return;
    if (Notification.permission === "denied") return;

    registerPush();
  }, []);

  return null;
}

async function registerPush() {
  try {
    // Get VAPID public key from server
    const res = await fetch(`${API_BASE}/api/notifications/vapid-key`);
    const { publicKey } = await res.json();
    if (!publicKey) return;

    const reg = await navigator.serviceWorker.ready;

    // Check existing subscription
    let subscription = await reg.pushManager.getSubscription();

    if (!subscription) {
      // Only ask for permission if not yet decided
      if (Notification.permission === "default") {
        const permission = await Notification.requestPermission();
        if (permission !== "granted") return;
      }

      subscription = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(publicKey),
      });
    }

    // Send subscription to server
    const subJson = subscription.toJSON();
    await fetch(`${API_BASE}/api/notifications/push/subscribe`, {
      method: "POST",
      headers: authHeaders(),
      body: JSON.stringify({
        endpoint: subJson.endpoint,
        keys: subJson.keys,
      }),
    });
  } catch {
    // Push registration failed — not critical
  }
}

function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(base64);
  const arr = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) {
    arr[i] = raw.charCodeAt(i);
  }
  return arr;
}
