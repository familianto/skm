'use client';

import { useState, useEffect, useCallback, FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { PageTitle } from '@/components/layout/page-title';
import { Card, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Loading } from '@/components/ui/loading';
import { cn } from '@/lib/utils';
import type { Master, Anggota, ApiResponse } from '@/types';

type Tab = 'profil' | 'keamanan' | 'anggota' | 'data';

const tabs: { key: Tab; label: string }[] = [
  { key: 'profil', label: 'Profil Masjid' },
  { key: 'keamanan', label: 'Keamanan' },
  { key: 'anggota', label: 'Anggota' },
  { key: 'data', label: 'Data' },
];

export default function PengaturanPage() {
  const [activeTab, setActiveTab] = useState<Tab>('profil');

  return (
    <div>
      <PageTitle title="Pengaturan" subtitle="Kelola profil masjid, keamanan, dan data" />

      {/* Tab Navigation */}
      <div className="flex gap-1 mb-6 border-b border-gray-200 overflow-x-auto">
        {tabs.map(tab => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            className={cn(
              'px-4 py-2.5 text-sm font-medium whitespace-nowrap border-b-2 transition-colors -mb-px',
              activeTab === tab.key
                ? 'border-emerald-600 text-emerald-600'
                : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
            )}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {activeTab === 'profil' && <ProfilTab />}
      {activeTab === 'keamanan' && <KeamananTab />}
      {activeTab === 'anggota' && <AnggotaTab />}
      {activeTab === 'data' && <DataTab />}
    </div>
  );
}

// ==============================
// Tab: Profil Masjid
// ==============================
function ProfilTab() {
  const [master, setMaster] = useState<Omit<Master, 'pin_hash'> | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [uploadingLogo, setUploadingLogo] = useState(false);

  const [form, setForm] = useState({
    nama_masjid: '',
    alamat: '',
    kota: '',
    provinsi: '',
    telepon: '',
    email: '',
    tahun_buku_aktif: '',
  });

  const fetchMaster = useCallback(async () => {
    try {
      const res = await fetch('/api/master');
      const json: ApiResponse<Omit<Master, 'pin_hash'>> = await res.json();
      if (json.success && json.data) {
        setMaster(json.data);
        setForm({
          nama_masjid: json.data.nama_masjid || '',
          alamat: json.data.alamat || '',
          kota: json.data.kota || '',
          provinsi: json.data.provinsi || '',
          telepon: json.data.telepon || '',
          email: json.data.email || '',
          tahun_buku_aktif: json.data.tahun_buku_aktif || '',
        });
      }
    } catch {
      setError('Gagal memuat data profil');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchMaster(); }, [fetchMaster]);

  const handleSave = async (e: FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setMessage('');
    setError('');

    try {
      const res = await fetch('/api/master', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      });
      const json = await res.json();
      if (json.success) {
        setMessage('Profil berhasil disimpan.');
        setMaster(json.data);
      } else {
        setError(json.error || 'Gagal menyimpan profil.');
      }
    } catch {
      setError('Terjadi kesalahan.');
    } finally {
      setSaving(false);
    }
  };

  const resizeImageToDataUrl = (file: File, maxSize: number): Promise<string> => {
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
        resolve(canvas.toDataURL('image/jpeg', 0.8));
      };
      img.onerror = () => reject(new Error('Gagal membaca gambar.'));
      img.src = URL.createObjectURL(file);
    });
  };

  const handleLogoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!['image/jpeg', 'image/png', 'image/jpg'].includes(file.type)) {
      setError('Hanya file JPG dan PNG yang diperbolehkan.');
      return;
    }

    if (file.size > 500 * 1024) {
      setError('Ukuran file logo maksimal 500KB.');
      return;
    }

    setUploadingLogo(true);
    setMessage('');
    setError('');

    try {
      const logoDataUrl = await resizeImageToDataUrl(file, 200);

      const res = await fetch('/api/upload/logo', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ logoDataUrl }),
      });
      const json = await res.json();
      if (json.success) {
        setMessage('Logo berhasil diupload.');
        fetchMaster();
      } else {
        setError(json.error || 'Gagal mengupload logo.');
      }
    } catch {
      setError('Terjadi kesalahan saat upload.');
    } finally {
      setUploadingLogo(false);
      e.target.value = '';
    }
  };

  if (loading) return <Loading className="my-8" />;

  const currentYear = new Date().getFullYear();
  const years = Array.from({ length: 5 }, (_, i) => (currentYear - i).toString());

  return (
    <div className="space-y-6 max-w-2xl">
      {/* Logo Section */}
      <Card>
        <CardTitle>Logo Masjid</CardTitle>
        <div className="mt-4 flex items-center gap-6">
          <div className="w-20 h-20 rounded-full bg-gray-100 flex items-center justify-center overflow-hidden border-2 border-gray-200">
            {master?.logo_url ? (
              /* eslint-disable-next-line @next/next/no-img-element */
              <img src={master.logo_url} alt="Logo" width={80} height={80} className="w-full h-full object-cover" />
            ) : (
              <svg className="w-10 h-10 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
              </svg>
            )}
          </div>
          <div>
            <label className="cursor-pointer">
              <span className="inline-flex items-center px-4 py-2 bg-white border border-gray-300 rounded-lg text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors">
                {uploadingLogo ? 'Mengupload...' : 'Ganti Logo'}
              </span>
              <input
                type="file"
                accept="image/jpeg,image/png"
                onChange={handleLogoUpload}
                disabled={uploadingLogo}
                className="hidden"
              />
            </label>
            <p className="text-xs text-gray-500 mt-1">JPG atau PNG, maksimal 500KB</p>
          </div>
        </div>
      </Card>

      {/* Profile Form */}
      <Card>
        <CardTitle>Informasi Masjid</CardTitle>
        <form onSubmit={handleSave} className="mt-4 space-y-4">
          <Input
            label="Nama Masjid"
            value={form.nama_masjid}
            onChange={e => setForm(f => ({ ...f, nama_masjid: e.target.value }))}
            required
          />
          <Input
            label="Alamat"
            value={form.alamat}
            onChange={e => setForm(f => ({ ...f, alamat: e.target.value }))}
          />
          <div className="grid grid-cols-2 gap-4">
            <Input
              label="Kota"
              value={form.kota}
              onChange={e => setForm(f => ({ ...f, kota: e.target.value }))}
            />
            <Input
              label="Provinsi"
              value={form.provinsi}
              onChange={e => setForm(f => ({ ...f, provinsi: e.target.value }))}
            />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <Input
              label="Telepon"
              value={form.telepon}
              onChange={e => setForm(f => ({ ...f, telepon: e.target.value }))}
            />
            <Input
              label="Email"
              value={form.email}
              type="email"
              onChange={e => setForm(f => ({ ...f, email: e.target.value }))}
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Tahun Buku Aktif</label>
            <select
              value={form.tahun_buku_aktif}
              onChange={e => setForm(f => ({ ...f, tahun_buku_aktif: e.target.value }))}
              className="block w-full rounded-lg border border-gray-300 px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500"
            >
              {years.map(y => (
                <option key={y} value={y}>{y}</option>
              ))}
            </select>
          </div>

          {message && <p className="text-emerald-600 text-sm">{message}</p>}
          {error && <p className="text-red-600 text-sm">{error}</p>}

          <Button type="submit" disabled={saving}>
            {saving ? 'Menyimpan...' : 'Simpan Profil'}
          </Button>
        </form>
      </Card>
    </div>
  );
}

// ==============================
// Tab: Keamanan (Ganti PIN)
// ==============================
function KeamananTab() {
  const router = useRouter();
  const [pinLama, setPinLama] = useState('');
  const [pinBaru, setPinBaru] = useState('');
  const [konfirmasiPin, setKonfirmasiPin] = useState('');
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setMessage('');
    setError('');

    try {
      const res = await fetch('/api/auth/change-pin', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pinLama, pinBaru, konfirmasiPin }),
      });
      const json = await res.json();
      if (json.success) {
        setMessage('PIN berhasil diubah. Anda akan dialihkan ke halaman login...');
        setTimeout(() => router.push('/login'), 2000);
      } else {
        setError(json.error || 'Gagal mengubah PIN.');
      }
    } catch {
      setError('Terjadi kesalahan.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="max-w-md">
      <Card>
        <CardTitle>Ganti PIN</CardTitle>
        <form onSubmit={handleSubmit} className="mt-4 space-y-4">
          <Input
            label="PIN Lama"
            type="password"
            inputMode="numeric"
            maxLength={6}
            value={pinLama}
            onChange={e => setPinLama(e.target.value.replace(/\D/g, ''))}
            placeholder="Masukkan PIN lama"
            required
          />
          <Input
            label="PIN Baru"
            type="password"
            inputMode="numeric"
            maxLength={6}
            value={pinBaru}
            onChange={e => setPinBaru(e.target.value.replace(/\D/g, ''))}
            placeholder="4-6 digit angka"
            required
          />
          <Input
            label="Konfirmasi PIN Baru"
            type="password"
            inputMode="numeric"
            maxLength={6}
            value={konfirmasiPin}
            onChange={e => setKonfirmasiPin(e.target.value.replace(/\D/g, ''))}
            placeholder="Ulangi PIN baru"
            required
          />

          {message && <p className="text-emerald-600 text-sm">{message}</p>}
          {error && <p className="text-red-600 text-sm">{error}</p>}

          <Button
            type="submit"
            disabled={saving || pinBaru.length < 4 || konfirmasiPin.length < 4}
          >
            {saving ? 'Menyimpan...' : 'Ubah PIN'}
          </Button>
        </form>
      </Card>

      <div className="mt-4 p-4 bg-amber-50 border border-amber-200 rounded-lg">
        <p className="text-sm text-amber-800">
          <strong>Perhatian:</strong> Setelah mengubah PIN, Anda akan otomatis logout dan harus login kembali dengan PIN baru.
        </p>
      </div>
    </div>
  );
}

// ==============================
// Tab: Anggota
// ==============================
function AnggotaTab() {
  const [anggota, setAnggota] = useState<Anggota[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const fetchAnggota = useCallback(async () => {
    try {
      const res = await fetch('/api/anggota');
      const json: ApiResponse<Anggota[]> = await res.json();
      if (json.success && json.data) {
        setAnggota(json.data);
      }
    } catch {
      setError('Gagal memuat data anggota');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchAnggota(); }, [fetchAnggota]);

  if (loading) return <Loading className="my-8" />;

  const roleColors: Record<string, string> = {
    BENDAHARA: 'bg-emerald-100 text-emerald-700',
    PENGURUS: 'bg-blue-100 text-blue-700',
    VIEWER: 'bg-gray-100 text-gray-700',
  };

  return (
    <div className="max-w-2xl">
      <Card>
        <div className="flex items-center justify-between mb-4">
          <CardTitle>Daftar Anggota/Pengurus</CardTitle>
        </div>

        {error && <p className="text-red-600 text-sm mb-4">{error}</p>}

        {anggota.length === 0 ? (
          <p className="text-gray-400 text-sm">Belum ada data anggota.</p>
        ) : (
          <div className="space-y-3">
            {anggota.map(a => (
              <div
                key={a.id}
                className="flex items-center justify-between py-3 border-b border-gray-100 last:border-0"
              >
                <div>
                  <p className="text-sm font-medium text-gray-900">{a.nama}</p>
                  <p className="text-xs text-gray-500">
                    {a.telepon && `${a.telepon} • `}{a.email}
                  </p>
                </div>
                <span className={cn(
                  'text-xs font-medium px-2.5 py-1 rounded-full',
                  roleColors[a.peran] || 'bg-gray-100 text-gray-700'
                )}>
                  {a.peran}
                </span>
              </div>
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}

// ==============================
// Tab: Data
// ==============================
function DataTab() {
  return (
    <div className="max-w-2xl space-y-4">
      <Card>
        <CardTitle>Kelola Data</CardTitle>
        <div className="mt-4 space-y-3">
          <Link
            href="/kategori"
            className="flex items-center justify-between p-3 rounded-lg border border-gray-200 hover:bg-gray-50 transition-colors"
          >
            <div>
              <p className="text-sm font-medium text-gray-900">Kategori Transaksi</p>
              <p className="text-xs text-gray-500">Kelola kategori pemasukan dan pengeluaran</p>
            </div>
            <svg className="w-5 h-5 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
            </svg>
          </Link>
          <Link
            href="/rekening"
            className="flex items-center justify-between p-3 rounded-lg border border-gray-200 hover:bg-gray-50 transition-colors"
          >
            <div>
              <p className="text-sm font-medium text-gray-900">Rekening Bank</p>
              <p className="text-xs text-gray-500">Kelola rekening bank masjid</p>
            </div>
            <svg className="w-5 h-5 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
            </svg>
          </Link>
          <Link
            href="/donatur"
            className="flex items-center justify-between p-3 rounded-lg border border-gray-200 hover:bg-gray-50 transition-colors"
          >
            <div>
              <p className="text-sm font-medium text-gray-900">Donatur</p>
              <p className="text-xs text-gray-500">Kelola data donatur masjid</p>
            </div>
            <svg className="w-5 h-5 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
            </svg>
          </Link>
        </div>
      </Card>

      <Card>
        <CardTitle>Display Publik (TV Masjid)</CardTitle>
        <div className="mt-4">
          <p className="text-sm text-gray-600 mb-3">
            Tampilkan ringkasan keuangan di TV/monitor masjid. Halaman ini bisa diakses tanpa login.
          </p>
          <div className="flex items-center gap-3">
            <a
              href="/publik"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 px-4 py-2 bg-emerald-600 text-white rounded-lg text-sm font-medium hover:bg-emerald-700 transition-colors"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
              </svg>
              Buka Halaman Publik
            </a>
          </div>
          <div className="mt-3 p-3 bg-blue-50 border border-blue-200 rounded-lg">
            <p className="text-xs text-blue-800">
              <strong>Tips TV Display:</strong> Buka halaman publik di browser TV, lalu tekan F11 untuk mode fullscreen. Data akan auto-refresh setiap 5 menit.
            </p>
          </div>
        </div>
      </Card>

      <Card>
        <CardTitle>Informasi Sistem</CardTitle>
        <div className="mt-4 space-y-2">
          <div className="flex justify-between text-sm">
            <span className="text-gray-500">Versi Aplikasi</span>
            <span className="text-gray-900 font-medium">SKM v2.1.0</span>
          </div>
          <div className="flex justify-between text-sm">
            <span className="text-gray-500">Database</span>
            <span className="text-gray-900 font-medium">Google Sheets</span>
          </div>
          <div className="flex justify-between text-sm">
            <span className="text-gray-500">File Storage</span>
            <span className="text-gray-900 font-medium">Google Drive</span>
          </div>
        </div>
      </Card>
    </div>
  );
}
