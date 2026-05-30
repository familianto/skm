# Aset gambar untuk `menara.html`

Signage `menara.html` membutuhkan **dua berkas gambar** di folder ini
(direferensikan secara relatif: `images/...`):

| Berkas | Ukuran asli | Keterangan |
|---|---|---|
| `menara-foto.jpeg` | 688×1529 (potret) | Foto menara jadi (dari klien). Dipakai sebagai gambar utama Slide 1 **dan** sebagai latar (blur) di kedua slide. |
| `menara-keterangan.jpeg` | 688×1432 (potret) | Diagram potongan menara dengan label struktur (Kubah, Spira, Tangga Spiral, … Tanah Lempung). Gambar utama Slide 2. |

Catatan:
- Gambar ditampilkan **utuh** (`object-fit: contain`, `max-height: 90vh`) — jangan
  di-crop; semua label pada diagram harus tetap terlihat penuh.
- `menara-foto.jpeg` saat ini masih memuat chrome screenshot HP (status bar / tombol
  navigasi) karena permintaan klien dipakai apa adanya. Konfirmasi ke klien apakah
  tetap dipakai atau diganti foto bersih sebelum tayang.

Setelah kedua berkas ditaruh di sini, halaman dapat diakses tanpa login di:

```
/mockup/menara.html
```
