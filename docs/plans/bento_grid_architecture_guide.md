# Panduan Membuat Architectural Bento Grid (Blueprint / Developer-First Style)

Panduan ini merinci cara merancang dan mengimplementasikan Bento Grid dengan gaya arsitektural modern (mirip situs-situs *developer-first* seperti Firecrawl, Resend, atau Vercel). Ciri khas dari gaya ini adalah **tidak adanya ruang kosong (gap) antar elemen**, melainkan menggunakan **garis batas (*hairline borders*) setebal 1px** yang bersambung dari ujung ke ujung layar.

---

## 1. Konsep Layout & Struktur Arsitektur

Alih-alih menggunakan `margin: 0 auto` konvensional, layout ini menggunakan pendekatan **3 Kolom Utama** dengan teknik *Full-Bleed Borders*:

1. **Gutter Kiri (`1fr`):** Kolom fleksibel di sisi kiri untuk merentangkan garis batas horizontal sampai menembus tepi layar.
2. **Konten Utama (`minmax(0, 1200px)`):** Area tengah tempat bento grid dan section header berada.
3. **Gutter Kanan (`1fr`):** Kolom fleksibel di sisi kanan untuk merentangkan garis batas horizontal ke ujung kanan layar.

Selain itu, **jarak antar section vertikal** tidak dibuat menggunakan `margin-bottom`, melainkan menggunakan **baris grid kosong (*spacer row*)** yang tetap memiliki garis batas di sekelilingnya.

---

## 2. Rincian Ukuran, Spacing, dan Padding

| Komponen / Bagian | Properti / Nilai Rekomendasi | Fungsi Desain |
| :--- | :--- | :--- |
| **Grid Utama** | `grid-template-columns: 1fr minmax(0, 1200px) 1fr` | Memastikan konten utama berada di tengah dengan lebar maksimal yang terkontrol. |
| **Jarak Antar Kartu (Gap)** | `0px` | Membuat kartu saling menempel erat tanpa celah, dipisahkan hanya oleh garis border. |
| **Ketebalan Border** | `1px solid #EBEBEB` (atau `#E5E5E5`) | Memberikan kesan garis cetak biru (*blueprint*) yang tipis dan rapi. |
| **Padding Kartu Teks** | `p-8` hingga `p-12` (`32px` - `48px`) | Memberikan ruang bernapas yang cukup untuk elemen teks persuasif. |
| **Padding Kartu Logo** | `p-8`, `min-height: 160px` | Menjaga agar logo perusahaan tampak proporsional dan berada di tengah (*centered flex*). |
| **Tipografi Indikator** | Font: *Monospace*, Ukuran: `12px`, Tracking: `wider` | Memberikan kesan teknis/developer pada label seperti `[ 01 / 07 ] · MAIN FEATURES`. |

---

## 3. Contoh Implementasi Kode Lengkap (HTML + Tailwind CSS)

Berikut adalah kode siap pakai yang mereplikasi struktur bento grid tersebut menggunakan Tailwind CSS:

```html
<div class="min-h-screen bg-[#F9F9F9] text-[#171717] font-sans">
  
  <!-- WRAPPER UTAMA: 3 Kolom [Gutter Kiri | Konten Utama | Gutter Kanan] -->
  <div class="grid grid-cols-[1fr_minmax(0,1200px)_1fr]">

    <!-- ================= BARIS 1: SPACER KOSONG ================= -->
    <div class="border-b border-r border-neutral-200/80 h-16"></div>
    <div class="border-b border-neutral-200/80 h-16"></div>
    <div class="border-b border-l border-neutral-200/80 h-16"></div>

    <!-- ================= BARIS 2: TRUSTED BY & LOGO BENTO ================= -->
    <div class="border-b border-r border-neutral-200/80"></div>
    
    <div class="border-b border-neutral-200/80 grid grid-cols-1 md:grid-cols-4">
      
      <!-- Kartu 1: Teks Trusted By -->
      <div class="p-8 md:p-10 flex items-center border-b md:border-b-0 md:border-r border-neutral-200/80">
        <p class="text-xl font-medium leading-snug tracking-tight">
          Trusted by <span class="text-[#FF4F00] font-semibold">150,000+ companies</span> of all sizes
        </p>
      </div>

      <!-- Kartu 2: Logo Botpress (Dengan Aksen Hover & Garis Bawah Oranye) -->
      <a href="#" class="group relative p-8 min-h-[160px] flex items-center justify-center border-b md:border-b-0 md:border-r border-neutral-200/80 hover:bg-white transition-colors">
        <span class="font-bold text-xl tracking-tight">botpress</span>
        <span class="absolute bottom-2.5 right-2.5 text-[#FF4F00] text-xs">↗</span>
        <div class="absolute bottom-0 left-0 right-0 h-[1.5px] bg-[#FF4F00]"></div>
      </a>

      <!-- Kartu 3: Logo Cognism -->
      <a href="#" class="p-8 min-h-[160px] flex items-center justify-center border-b md:border-b-0 md:border-r border-neutral-200/80 hover:bg-white transition-colors">
        <span class="font-bold text-xl tracking-wide">cognism</span>
      </a>

      <!-- Kartu 4: Logo Aleph Alpha -->
      <a href="#" class="p-8 min-h-[160px] flex items-center justify-center hover:bg-white transition-colors">
        <span class="font-bold text-lg tracking-widest uppercase">Aleph Alpha</span>
      </a>

    </div>

    <div class="border-b border-l border-neutral-200/80"></div>


    <!-- ================= BARIS 3: SECTION HEADER [ 01 / 07 ] ================= -->
    <div class="border-b border-r border-neutral-200/80 h-24"></div>
    
    <div class="border-b border-neutral-200/80 py-6 px-8 md:px-10 relative flex items-center">
      <!-- Garis Aksen Indikator Oranye di Kiri -->
      <div class="absolute left-0 top-1/2 -translate-y-1/2 w-[2px] h-5 bg-[#FF4F00]"></div>
      
      <div class="font-mono text-xs tracking-widest uppercase text-neutral-400 flex items-center gap-3">
        <span>[ <strong class="text-[#FF4F00] font-normal">01</strong> / 07 ]</span>
        <span>·</span>
        <span>MAIN FEATURES</span>
      </div>
    </div>

    <div class="border-b border-l border-neutral-200/80 h-24"></div>

  </div>
</div>
```

---

## 4. Tips Penting Saat Implementasi

1. **Hindari Double Border:**  
   Pastikan Anda tidak mendefinisikan `border-r` dan `border-l` secara berlebihan pada elemen yang saling bersebelahan agar ketebalan garis tetap konsisten di angka `1px`.
2. **Gunakan Kontras Warna yang Lembut:**  
   Jangan gunakan warna latar putih bersih (`#FFFFFF`) untuk halaman utama. Gunakan latar abu-abu sangat muda (`#F9F9F9`), dan jadikan putih murni hanya sebagai warna latar saat elemen di-hover (*interactive state*).
3. **Kombinasi Tipografi:**  
   Gunakan perpaduan antara **Sans-Serif tebal** untuk judul utama dan **Monospace** untuk teks indeks/kode demi memperkuat kesan *developer tool* yang profesional.