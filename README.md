# Event Scheduler Backend

API backend untuk mengelola event/jadwal dengan deteksi konflik dan rekomendasi slot waktu otomatis.

Stack: Express 5 + TypeScript + Drizzle ORM + PostgreSQL (Neon).

## Menjalankan

```bash
cp .env.example .env   # isi DATABASE_URL
npm install
npm run build
npm run dev            # development (nodemon + ts-node)
npm start              # production (perlu build dulu)
```

Migrasi database:

```bash
# file SQL: drizzle/0001_events.sql
# dijalankan ke DATABASE_URL (tabel events + kolom created_at/updated_at)
```

## Endpoint

| Method | Path         | Deskripsi              |
| ------ | ------------ | ---------------------- |
| POST   | /events      | Buat event baru        |
| GET    | /events      | Daftar event (start_time ASC) |
| GET    | /events/:id  | Detail event           |
| PUT    | /events/:id  | Ubah event             |
| DELETE | /events/:id  | Hapus event            |

### Request body (POST / PUT)

```json
{
  "title": "Meeting Project",
  "start_time": "2026-10-06T10:00:00Z",
  "end_time": "2026-10-06T11:00:00Z",
  "participants": ["haidar", "budi", "andi"]
}
```

`start_time`/`end_time` juga menerima format `startTime`/`endTime` (camelCase) untuk kompatibilitas.

Validasi (`400`):

- `title` wajib diisi
- `start_time` dan `end_time` wajib, format timestamp valid
- `start_time` harus lebih kecil dari `end_time`
- `participants` wajib array string dan tidak boleh kosong

### Response sukses

```json
{
  "success": true,
  "message": "Event berhasil dibuat",
  "data": {
    "id": "uuid",
    "title": "Meeting Project",
    "start_time": "2026-10-06T10:00:00.000Z",
    "end_time": "2026-10-06T11:00:00.000Z",
    "participants": ["haidar", "budi", "andi"]
  }
}
```

Error umum: `400` ID tidak valid / validasi gagal, `404` event tidak ditemukan, `500` kegagalan server (tanpa expose error database).

## Conflict Detection

Dua event dianggap konflik jika waktunya overlap DAN memiliki minimal satu participant yang sama:

```text
existing.start_time < new.end_time AND existing.end_time > new.start_time
```

Bersinggungan tepat di batas (mis. 10:00-11:00 vs 11:00-12:00) TIDAK dianggap konflik.

Pengecekan participant memakai irisan array (case-insensitive):

```text
intersection(existing.participants, newEvent.participants)
```

Jika konflik, event tidak dibuat dan API mengembalikan `409 Conflict`:

```json
{
  "success": false,
  "message": "Event memiliki konflik jadwal",
  "conflicts": [
    {
      "event_id": "uuid-event-lama",
      "title": "Meeting Project",
      "start_time": "2026-10-06T10:00:00.000Z",
      "end_time": "2026-10-06T11:00:00.000Z",
      "participants": ["haidar", "budi"],
      "conflicting_participants": ["budi"]
    }
  ],
  "suggestion": {
    "start_time": "2026-10-06T11:00:00.000Z",
    "end_time": "2026-10-06T12:00:00.000Z"
  }
}
```

Semua event yang bentrok ditampilkan, bukan hanya satu.

## Automatic Suggestion

Setiap response `409` menyertakan `suggestion`: slot terdekat yang bebas untuk SEMUA participant, dengan:

- durasi sama dengan request asli (mis. request 2 jam → saran 2 jam),
- waktu mulai tidak lebih awal dari request,
- terverifikasi bebas konflik untuk seluruh participant.

Algoritma: mulai dari `start_time` request, selama slot overlap dengan event milik participant mana pun, geser kandidat ke `end_time` tercepat dari event yang overlap (maksimal 100 iterasi).

## Update

`PUT /events/:id` menjalankan conflict detection yang sama, dengan event yang sedang diubah dikecualikan dari pengecekan (tidak konflik dengan dirinya sendiri).

## Testing

```bash
PORT=3001 node dist/index.js
TEST_BASE=http://localhost:3001 node scripts/test-events.cjs
```

Skenario yang diuji: create berhasil, overlap beda participant berhasil, overlap sama participant `409`, detail konflik, participant bentrok, suggestion tersedia, durasi suggestion, suggestion bebas konflik, update berhasil/ditolak, delete, get terurut, plus error (UUID invalid, title kosong, timestamp invalid, `end_time <= start_time`, participants bukan array, event tidak ditemukan).
