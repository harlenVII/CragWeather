"use client";

import { Scanner, type IDetectedBarcode, type IScannerError } from "@yudiel/react-qr-scanner";

type QrScannerProps = {
  onDecode: (text: string) => void;
  onError: (reason: "denied" | "no-camera" | "other") => void;
};

function classifyError(err: IScannerError): "denied" | "no-camera" | "other" {
  if (err.kind === "permission-denied" || err.kind === "insecure-context" || err.kind === "security") {
    return "denied";
  }
  if (err.kind === "no-camera" || err.kind === "overconstrained" || err.kind === "unsupported") {
    return "no-camera";
  }
  if (typeof navigator !== "undefined" && !navigator.mediaDevices) return "no-camera";
  return "other";
}

export function QrScanner({ onDecode, onError }: QrScannerProps) {
  return (
    <Scanner
      onScan={(results: IDetectedBarcode[]) => {
        const first = results[0];
        if (first && first.rawValue) onDecode(first.rawValue);
      }}
      onError={(err) => onError(classifyError(err))}
      constraints={{ facingMode: "environment" }}
      formats={["qr_code"]}
      styles={{ container: { width: "100%", height: "100%" } }}
    />
  );
}
