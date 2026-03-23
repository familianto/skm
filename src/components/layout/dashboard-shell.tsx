'use client';

import { useState, useEffect } from 'react';
import { Sidebar } from './sidebar';

export function DashboardShell({ children }: { children: React.ReactNode }) {
  const [masjidName, setMasjidName] = useState('SKM');
  const [logoUrl, setLogoUrl] = useState('');

  useEffect(() => {
    fetch('/api/master')
      .then(res => res.json())
      .then(json => {
        if (json.success && json.data) {
          setMasjidName(json.data.nama_masjid || 'SKM');
          setLogoUrl(json.data.logo_url || '');
        }
      })
      .catch(() => {});
  }, []);

  return (
    <div className="min-h-screen bg-gray-50">
      <Sidebar masjidName={masjidName} logoUrl={logoUrl} />
      <div className="lg:pl-64">
        <main className="p-6">{children}</main>
      </div>
    </div>
  );
}
