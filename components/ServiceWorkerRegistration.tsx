"use client";
import { useEffect } from "react";

export default function ServiceWorkerRegistration() {
  useEffect(() => {
    if (navigator.serviceWorker) {
      navigator.serviceWorker.register("/sw.js");
    }
  }, []);
  return null;
}
