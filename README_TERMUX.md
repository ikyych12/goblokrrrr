# Panduan Instalasi Termux - Elite Guard Bot

⚠️ **PERINGATAN KEAMANAN:** Jangan pernah membagikan isi file `service-account.json` (Private Key) kepada siapapun atau di grup publik. Jika sudah terlanjur bocor, segera hapus key tersebut di Google Cloud Console dan buat yang baru.

## 1. Persiapan Awal di Termux
Buka Termux dan jalankan perintah ini satu per satu:
```bash
pkg update && pkg upgrade -y
pkg install nodejs-lts git nano -y
```

## 2. Download dan Setup Folder
Pastikan Anda masuk ke folder project dengan benar:
```bash
git clone https://github.com/ikyych12/goblokrrrr.git
cd goblokrrrr
```

## 3. Instalasi dan Build
Proses ini mungkin memakan waktu 1-3 menit tergantung koneksi internet:
```bash
npm install
npm run build
```

## 4. Konfigurasi Environment (.env)
Buka editor nano:
```bash
nano .env
```
Copy dan paste teks di bawah ini (Ganti token dengan punya Anda):
```env
TELEGRAM_BOT_TOKEN="8923762099:AAEmDIEF-eKnQZf2hhiB8LQb18qXHSpZzy8"
FIREBASE_PROJECT_ID="gen-lang-client-0291452836"
GEMINI_API_KEY="ISI_APAKAH_PUNYA"
```
Simpan: Tekan `CTRL + O`, lalu `Enter`. Keluar: `CTRL + X`.

## 5. Membuat File Service Account (PENTING)
Agar database Firestore berfungsi di Termux, Anda harus membuat file `service-account.json`.

1. Jalankan perintah ini:
   ```bash
   nano service-account.json
   ```
2. **Copy seluruh isi JSON** yang Anda dapatkan dari Firebase Console (yang diawali dengan `{ "type": "service_account", ... }`).
3. **Paste** ke dalam Termux.
4. Simpan: `CTRL + O` -> `Enter`. Keluar: `CTRL + X`.

## 6. Cara Menjalankan
Gunakan perintah ini setiap kali ingin memulai bot:
```bash
npm start
```

---
### Solusi Masalah Umum

**1. Error "Unable to detect a Project Id"**
Pastikan file `.env` sudah berisi `FIREBASE_PROJECT_ID` dan file `service-account.json` sudah ada di folder yang sama.

**2. Error "TelegramError 400"**
Ini biasanya karena ada karakter spesial di pesan Markdown. Saya sudah memperbaiki beberapa di kode, jika masih muncul, cek format pesan di `server.ts`.

**3. Error "cd: too many arguments"**
Anda mungkin mengetik `cd folder npm install` sekaligus. Perintah harus dipisah:
- Pertama: `cd goblokrrrr`
- Kedua: `npm install`
