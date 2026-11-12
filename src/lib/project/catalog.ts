/**
 * Daftar efek, transisi, dan preset penyesuaian (hanya data, tanpa React).
 * Cara menggambar tiap efek/transisi ada di src/remotion/fx.ts.
 */

export const EFFECT_IDS = [
  "mono",
  "sepia",
  "invert",
  "retro",
  "rainbow",
  "blur",
  "dreamy",
  "vignette",
  "shake",
  "pulse",
  "glitch",
  "flash",
  "lens-flare",
  "light-leak",
  "paparazzi",
  "glow",
  "flicker",
  "spotlight",
  "blink",
  "zoom-punch",
  "handheld",
  "letterbox",
  "vhs",
  "grain",
] as const;
export type EffectId = (typeof EFFECT_IDS)[number];

/** `popular` = tampil di kategori "Populer" (gaya yang sering dipakai di konten pendek). */
export type CatalogEntry<T extends string> = { id: T; label: string; category: string; hint: string; popular?: boolean };

export const EFFECT_CATEGORIES = [
  { id: "cahaya", label: "Cahaya" },
  { id: "kamera", label: "Kamera" },
  { id: "retro", label: "Retro" },
  { id: "warna", label: "Warna" },
  { id: "lensa", label: "Lensa" },
  { id: "gerak", label: "Gerak" },
] as const;

export const EFFECTS: CatalogEntry<EffectId>[] = [
  { id: "lens-flare", label: "Kilau lensa", category: "cahaya", hint: "Garis cahaya menyapu layar berulang", popular: true },
  { id: "light-leak", label: "Bocoran cahaya", category: "cahaya", hint: "Cahaya jingga hangat yang bergerak pelan", popular: true },
  { id: "paparazzi", label: "Kedip kamera", category: "cahaya", hint: "Kilatan blitz di waktu acak", popular: true },
  { id: "glow", label: "Berpendar", category: "cahaya", hint: "Lebih terang dan lembut di tengah" },
  { id: "flicker", label: "Lampu berkedip", category: "cahaya", hint: "Terang naik-turun tidak teratur" },
  { id: "spotlight", label: "Sorot", category: "cahaya", hint: "Tengah terang, sekeliling gelap pekat" },
  { id: "zoom-punch", label: "Hentak zoom", category: "kamera", hint: "Zoom menghentak mengikuti ketukan", popular: true },
  { id: "handheld", label: "Kamera genggam", category: "kamera", hint: "Goyangan halus seperti dipegang tangan" },
  { id: "blink", label: "Kedip mata", category: "kamera", hint: "Layar menutup-membuka seperti kelopak mata" },
  { id: "letterbox", label: "Bar sinema", category: "kamera", hint: "Bar hitam atas-bawah ala film", popular: true },
  { id: "vhs", label: "VHS", category: "retro", hint: "Garis-garis dan warna kaset lama", popular: true },
  { id: "grain", label: "Butiran film", category: "retro", hint: "Bintik halus seperti film analog", popular: true },
  { id: "retro", label: "Retro", category: "retro", hint: "Kontras dan warna ala film lama" },
  { id: "sepia", label: "Sepia", category: "retro", hint: "Cokelat hangat ala foto lama" },
  { id: "mono", label: "Hitam putih", category: "warna", hint: "Menghilangkan warna" },
  { id: "invert", label: "Negatif", category: "warna", hint: "Membalik warna" },
  { id: "rainbow", label: "Pelangi", category: "warna", hint: "Warna berputar terus" },
  { id: "blur", label: "Buram", category: "lensa", hint: "Mengaburkan gambar" },
  { id: "dreamy", label: "Lembut", category: "lensa", hint: "Sedikit buram dan cerah" },
  { id: "vignette", label: "Vinyet", category: "lensa", hint: "Tepi menggelap" },
  { id: "shake", label: "Guncang", category: "gerak", hint: "Kamera bergetar", popular: true },
  { id: "pulse", label: "Denyut", category: "gerak", hint: "Membesar-mengecil berirama" },
  { id: "glitch", label: "Glitch", category: "gerak", hint: "Gangguan sinyal sesekali", popular: true },
  { id: "flash", label: "Kilat", category: "gerak", hint: "Kilatan terang berkala" },
];

export const TRANSITION_IDS = [
  "fade",
  "dip-black",
  "flash",
  "blur",
  "slide-left",
  "slide-right",
  "slide-up",
  "slide-down",
  "zoom-in",
  "zoom-out",
  "spin",
  "wipe-left",
  "wipe-down",
  "circle",
  "glare",
  "camera-flash",
  "film-burn",
  "strobe",
  "blink",
  "whip-left",
  "whip-right",
  "whip-up",
  "zoom-blur",
  "spin-blur",
  "shake",
  "glitch",
  "split",
  "shutter",
  "flip",
  "pop",
] as const;
export type TransitionId = (typeof TRANSITION_IDS)[number];

export const TRANSITION_CATEGORIES = [
  { id: "cahaya", label: "Cahaya" },
  { id: "kamera", label: "Kamera" },
  { id: "gaya", label: "Gaya" },
  { id: "dasar", label: "Dasar" },
  { id: "geser", label: "Geser" },
  { id: "zoom", label: "Zoom" },
  { id: "sapuan", label: "Sapuan" },
] as const;

export const TRANSITIONS: CatalogEntry<TransitionId>[] = [
  { id: "glare", label: "Kilau cahaya", category: "cahaya", hint: "Garis cahaya menyapu saat berganti", popular: true },
  { id: "camera-flash", label: "Kedip kamera", category: "cahaya", hint: "Kilatan blitz dengan hentakan kecil", popular: true },
  { id: "film-burn", label: "Terbakar cahaya", category: "cahaya", hint: "Cahaya jingga membanjiri layar", popular: true },
  { id: "strobe", label: "Kedip cepat", category: "cahaya", hint: "Klip baru berkedip masuk" },
  { id: "flash", label: "Lewat putih", category: "cahaya", hint: "Kilat putih di tengah" },
  { id: "blink", label: "Kedip mata", category: "kamera", hint: "Layar menutup lalu membuka", popular: true },
  { id: "whip-left", label: "Sapuan cepat kiri", category: "kamera", hint: "Kamera menyapu cepat ke kiri", popular: true },
  { id: "whip-right", label: "Sapuan cepat kanan", category: "kamera", hint: "Kamera menyapu cepat ke kanan" },
  { id: "whip-up", label: "Sapuan cepat atas", category: "kamera", hint: "Kamera menyapu cepat ke atas" },
  { id: "zoom-blur", label: "Zoom buram", category: "kamera", hint: "Menerobos masuk dengan buram gerak", popular: true },
  { id: "spin-blur", label: "Putar buram", category: "kamera", hint: "Berputar cepat sambil berganti", popular: true },
  { id: "shake", label: "Guncang", category: "kamera", hint: "Layar bergetar saat berganti" },
  { id: "glitch", label: "Glitch", category: "gaya", hint: "Gangguan sinyal saat berganti", popular: true },
  { id: "split", label: "Belah tengah", category: "gaya", hint: "Terbuka dari tengah ke samping" },
  { id: "shutter", label: "Tirai", category: "gaya", hint: "Garis-garis menutup seperti tirai" },
  { id: "flip", label: "Balik kartu", category: "gaya", hint: "Berbalik seperti kartu" },
  { id: "pop", label: "Pop", category: "gaya", hint: "Klip baru memantul masuk" },
  { id: "fade", label: "Larut", category: "dasar", hint: "Berbaur perlahan" },
  { id: "dip-black", label: "Lewat hitam", category: "dasar", hint: "Gelap sesaat di tengah" },
  { id: "blur", label: "Buram", category: "dasar", hint: "Mengabur lalu jelas" },
  { id: "slide-left", label: "Geser kiri", category: "geser", hint: "Klip baru mendorong dari kanan" },
  { id: "slide-right", label: "Geser kanan", category: "geser", hint: "Klip baru mendorong dari kiri" },
  { id: "slide-up", label: "Geser atas", category: "geser", hint: "Klip baru mendorong dari bawah" },
  { id: "slide-down", label: "Geser bawah", category: "geser", hint: "Klip baru mendorong dari atas" },
  { id: "zoom-in", label: "Zoom masuk", category: "zoom", hint: "Menerobos ke klip baru" },
  { id: "zoom-out", label: "Zoom keluar", category: "zoom", hint: "Klip baru mengecil ke tempatnya" },
  { id: "spin", label: "Putar", category: "zoom", hint: "Berputar sambil berganti" },
  { id: "wipe-left", label: "Sapu kiri", category: "sapuan", hint: "Tersingkap dari kanan ke kiri" },
  { id: "wipe-down", label: "Sapu bawah", category: "sapuan", hint: "Tersingkap dari atas ke bawah" },
  { id: "circle", label: "Lingkaran", category: "sapuan", hint: "Membuka dari tengah" },
];

/** Nilai penyesuaian; semua berpusat di 0 = tanpa perubahan. */
export type AdjustValues = {
  brightness: number;
  contrast: number;
  saturation: number;
  hue: number;
  temperature: number;
  tint: number;
  blur: number;
  vignette: number;
};

export const ADJUST_PRESETS: { id: string; label: string; hint: string; adjust: Partial<AdjustValues> }[] = [
  { id: "custom", label: "Kustom", hint: "Mulai dari netral, atur sendiri", adjust: {} },
  { id: "warm", label: "Hangat", hint: "Nuansa jingga", adjust: { temperature: 0.5, saturation: 0.1 } },
  { id: "cool", label: "Dingin", hint: "Nuansa biru", adjust: { temperature: -0.5, contrast: 0.05 } },
  { id: "vivid", label: "Tajam", hint: "Warna dan kontras naik", adjust: { contrast: 0.2, saturation: 0.35 } },
  { id: "faded", label: "Pudar", hint: "Lembut, kontras turun", adjust: { contrast: -0.2, saturation: -0.25, brightness: 0.08 } },
  { id: "bright", label: "Cerah", hint: "Lebih terang", adjust: { brightness: 0.18, contrast: 0.05 } },
  { id: "moody", label: "Dramatis", hint: "Gelap dengan tepi menggelap", adjust: { brightness: -0.12, contrast: 0.25, saturation: -0.15, vignette: 0.5 } },
];

export const ANIMATION_IDS = [
  "fade",
  "pop",
  "bounce",
  "flash-in",
  "blur",
  "slide-up",
  "slide-down",
  "slide-left",
  "slide-right",
  "fly-up",
  "fly-down",
  "fly-left",
  "fly-right",
  "drop",
  "zoom-in",
  "zoom-out",
  "stretch",
  "squash",
  "spin",
  "spin-zoom",
  "flip-x",
  "flip-y",
  "swing",
  "roll",
  "tilt",
  "wipe-right",
  "wipe-up",
  "iris",
  "shake",
  "glitch",
  "typewriter",
  "words",
  "tracking",
] as const;
export type AnimationId = (typeof ANIMATION_IDS)[number];

export const ANIMATION_CATEGORIES = [
  { id: "dasar", label: "Dasar" },
  { id: "geser", label: "Geser" },
  { id: "zoom", label: "Zoom" },
  { id: "putar", label: "Putar" },
  { id: "sapuan", label: "Sapuan" },
  { id: "getar", label: "Getar" },
  { id: "teks", label: "Khusus teks" },
] as const;

/** Animasi masuk/keluar sebuah klip. `textOnly` hanya masuk akal untuk teks. */
export const ANIMATIONS: { id: AnimationId; label: string; category: string; textOnly?: boolean }[] = [
  { id: "fade", label: "Pudar", category: "dasar" },
  { id: "pop", label: "Pop", category: "dasar" },
  { id: "bounce", label: "Memantul", category: "dasar" },
  { id: "flash-in", label: "Kilat", category: "dasar" },
  { id: "blur", label: "Buram", category: "dasar" },
  { id: "slide-up", label: "Geser naik", category: "geser" },
  { id: "slide-down", label: "Geser turun", category: "geser" },
  { id: "slide-left", label: "Geser ke kiri", category: "geser" },
  { id: "slide-right", label: "Geser ke kanan", category: "geser" },
  { id: "fly-up", label: "Terbang naik", category: "geser" },
  { id: "fly-down", label: "Terbang turun", category: "geser" },
  { id: "fly-left", label: "Terbang ke kiri", category: "geser" },
  { id: "fly-right", label: "Terbang ke kanan", category: "geser" },
  { id: "drop", label: "Jatuh", category: "geser" },
  { id: "zoom-in", label: "Membesar", category: "zoom" },
  { id: "zoom-out", label: "Mengecil", category: "zoom" },
  { id: "stretch", label: "Melebar", category: "zoom" },
  { id: "squash", label: "Meninggi", category: "zoom" },
  { id: "spin", label: "Putar", category: "putar" },
  { id: "spin-zoom", label: "Putar cepat", category: "putar" },
  { id: "flip-x", label: "Balik samping", category: "putar" },
  { id: "flip-y", label: "Balik atas", category: "putar" },
  { id: "swing", label: "Ayun", category: "putar" },
  { id: "roll", label: "Menggelinding", category: "putar" },
  { id: "tilt", label: "Miring", category: "putar" },
  { id: "wipe-right", label: "Sapu kanan", category: "sapuan" },
  { id: "wipe-up", label: "Sapu atas", category: "sapuan" },
  { id: "iris", label: "Lingkaran", category: "sapuan" },
  { id: "shake", label: "Getar", category: "getar" },
  { id: "glitch", label: "Glitch", category: "getar" },
  { id: "typewriter", label: "Mesin ketik", category: "teks", textOnly: true },
  { id: "words", label: "Kata demi kata", category: "teks", textOnly: true },
  { id: "tracking", label: "Merapat", category: "teks", textOnly: true },
];