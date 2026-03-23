'use client';

import { useState } from 'react';

interface ImagePreviewProps {
  src: string;
  alt?: string;
  className?: string;
}

export function ImagePreview({ src, alt = 'Preview', className }: ImagePreviewProps) {
  const [lightbox, setLightbox] = useState(false);

  return (
    <>
      <div
        className={`relative cursor-pointer group ${className || ''}`}
        onClick={() => setLightbox(true)}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={src}
          alt={alt}
          className="w-full h-full object-cover rounded-lg border border-gray-200"
        />
        <div className="absolute inset-0 bg-black/0 group-hover:bg-black/20 transition-colors rounded-lg flex items-center justify-center">
          <svg className="w-6 h-6 text-white opacity-0 group-hover:opacity-100 transition-opacity" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0zM10 7v3m0 0v3m0-3h3m-3 0H7" />
          </svg>
        </div>
      </div>

      {lightbox && (
        <>
          <div className="fixed inset-0 z-50 bg-black/80" onClick={() => setLightbox(false)} />
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4" onClick={() => setLightbox(false)}>
            <div className="relative max-w-4xl max-h-[90vh]" onClick={(e) => e.stopPropagation()}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={src}
                alt={alt}
                className="max-w-full max-h-[85vh] object-contain rounded-lg"
              />
              <button
                onClick={() => setLightbox(false)}
                className="absolute -top-3 -right-3 w-8 h-8 bg-white rounded-full flex items-center justify-center shadow-lg hover:bg-gray-100"
              >
                <svg className="w-4 h-4 text-gray-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
              <div className="absolute bottom-0 left-0 right-0 flex justify-center gap-3 p-3">
                <a
                  href={src}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="px-3 py-1.5 bg-white rounded-lg text-sm text-gray-700 shadow hover:bg-gray-50"
                >
                  Buka di tab baru
                </a>
              </div>
            </div>
          </div>
        </>
      )}
    </>
  );
}
