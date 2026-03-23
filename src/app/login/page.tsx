export default function LoginPage() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-background">
      <div className="text-center space-y-4">
        <h1 className="text-3xl font-bold text-foreground">
          SKM - Sistem Keuangan Masjid
        </h1>
        <p className="text-foreground/60">
          Halaman login akan diimplementasi di Sprint 1
        </p>
        <a
          href="/api/health"
          className="inline-block px-4 py-2 bg-foreground text-background rounded-md hover:opacity-90 transition"
        >
          Cek Status Koneksi
        </a>
      </div>
    </main>
  );
}
