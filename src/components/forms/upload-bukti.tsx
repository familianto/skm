'use client';

import { useState } from 'react';
import { FileUpload } from '@/components/ui/file-upload';
import { Button } from '@/components/ui/button';
import { ImagePreview } from '@/components/ui/image-preview';
import type { ApiResponse } from '@/types';

interface UploadBuktiProps {
  transaksiId: string;
  currentBuktiUrl?: string;
  onUploadSuccess: (buktiUrl: string) => void;
}

function resizeImageToDataUrl(file: File, maxSize: number, quality: number): Promise<string> {
  return new Promise((resolve, reject) => {
    const img = document.createElement('img');
    img.onload = () => {
      const canvas = document.createElement('canvas');
      let { width, height } = img;
      if (width > maxSize || height > maxSize) {
        if (width > height) {
          height = Math.round((height * maxSize) / width);
          width = maxSize;
        } else {
          width = Math.round((width * maxSize) / height);
          height = maxSize;
        }
      }
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d');
      if (!ctx) { reject(new Error('Canvas not supported')); return; }
      ctx.drawImage(img, 0, 0, width, height);
      resolve(canvas.toDataURL('image/jpeg', quality));
    };
    img.onerror = () => reject(new Error('Gagal membaca gambar.'));
    img.src = URL.createObjectURL(file);
  });
}

export function UploadBukti({ transaksiId, currentBuktiUrl, onUploadSuccess }: UploadBuktiProps) {
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState('');

  const handleFileSelect = (file: File) => {
    setSelectedFile(file);
    setError('');
    const reader = new FileReader();
    reader.onload = (e) => setPreview(e.target?.result as string);
    reader.readAsDataURL(file);
  };

  const handleUpload = async () => {
    if (!selectedFile) return;
    setUploading(true);
    setError('');

    try {
      const buktiDataUrl = await resizeImageToDataUrl(selectedFile, 600, 0.7);

      const res = await fetch('/api/upload/bukti', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ transaksiId, buktiDataUrl }),
      });

      const json: ApiResponse<{ bukti_url: string }> = await res.json();

      if (json.success && json.data) {
        onUploadSuccess(json.data.bukti_url);
        setSelectedFile(null);
        setPreview(null);
      } else {
        setError(json.error || 'Gagal mengupload bukti');
      }
    } catch {
      setError('Gagal mengupload bukti');
    } finally {
      setUploading(false);
    }
  };

  const handleCancel = () => {
    setSelectedFile(null);
    setPreview(null);
    setError('');
  };

  return (
    <div className="space-y-3">
      {currentBuktiUrl && !preview && (
        <div className="w-32 h-32">
          <ImagePreview src={currentBuktiUrl} alt="Bukti transaksi" />
        </div>
      )}

      {preview ? (
        <div className="space-y-3">
          <div className="w-32 h-32">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={preview} alt="Preview" className="w-full h-full object-cover rounded-lg border border-gray-200" />
          </div>
          <p className="text-xs text-gray-500">{selectedFile?.name}</p>
          <div className="flex gap-2">
            <Button size="sm" onClick={handleUpload} disabled={uploading}>
              {uploading ? 'Mengupload...' : 'Upload'}
            </Button>
            <Button size="sm" variant="secondary" onClick={handleCancel} disabled={uploading}>
              Batal
            </Button>
          </div>
        </div>
      ) : (
        <FileUpload onFileSelect={handleFileSelect} disabled={uploading} />
      )}

      {error && <p className="text-sm text-red-600">{error}</p>}
    </div>
  );
}
