# Qurban VA — Integrasi Xendit Virtual Account

Branch `feat/qurban-va` dikhususkan untuk pengembangan fitur **integrasi Virtual Account (VA) Xendit** dengan sistem **Qurban** pada SKM (Sistem Keuangan Masjid) v2.1.

## Tujuan

Memungkinkan panitia qurban menerima pembayaran dari mudhohi (pequrban) secara otomatis melalui Virtual Account Xendit, lalu mencatatnya sebagai transaksi `MASUK` di modul qurban tanpa input manual.

## Ruang Lingkup

- Pembuatan VA dinamis per transaksi qurban via Xendit API
- Webhook callback Xendit untuk konfirmasi pembayaran
- Rekonsiliasi otomatis pembayaran VA ↔ data qurban
- Notifikasi status pembayaran ke mudhohi (via Fonnte WhatsApp)
- Audit trail pembayaran di Google Sheets

## Status

Work in progress — lihat riwayat commit pada branch ini untuk progres terkini.
