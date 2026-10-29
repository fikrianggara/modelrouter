# ModelRouter — System One (Liquid d1) Dynamic Complexity Model Router

Platform reverse proxy dan model routing AI berlatensi rendah (<30ms) yang mengevaluasi kompleksitas prompt/task secara dinamis menggunakan Decision Model System One (Liquid AI `d1`), mencocokkannya ke Model Registry berbasis kapabilitas/tag/biaya, dan mengekspos endpoint ganda berstandar OpenAI (`/v1/chat/completions`) dan Anthropic (`/v1/messages`) yang mendukung bidirectional streaming SSE.

## Arsitektur & Dokumentasi Resmi
Spesifikasi arsitektur dan dokumentasi teknis sistem lengkap tersedia di folder `docs/`:
- **PRD (Product Requirements Document):** [`docs/PRD.md`](docs/PRD.md)
- **TRD (Technical Requirements Document):** [`docs/TRD.md`](docs/TRD.md)
- **AFD (Application Flow Document):** [`docs/AFD.md`](docs/AFD.md)
- **DBD (Database & Data Model Document):** [`docs/DBD.md`](docs/DBD.md)
- **BSD (Business System Document):** [`docs/BSD.md`](docs/BSD.md)
- **System Architecture & Blueprint:** [`docs/SYSTEM_ARCHITECTURE.md`](docs/SYSTEM_ARCHITECTURE.md)
- **Historical Implementation Plan:** [`docs/plans/2026-10-29-d1-complexity-model-router.md`](docs/plans/2026-10-29-d1-complexity-model-router.md)
- **Bento Grid Architecture Guide:** [`docs/plans/bento_grid_architecture_guide.md`](docs/plans/bento_grid_architecture_guide.md)

## Workflow & Ticket System
Repositori ini menggunakan *Ticket-Driven Development* dan *Multi-Branch Workflow*:
- Aturan kontribusi agen: `AGENTS.md`
- Dokumentasi tiket: `tickets/README.md`
- Script manajemen tiket: `scripts/ticket.sh`
- Script orchestrasi merge: `scripts/merge-tickets.sh`

### Perintah Cepat Tiket:
```bash
# Membuat tiket baru
scripts/ticket.sh new "Judul tiket fitur/bug" [feature|bug] [small|medium|large] [group] [P0|P1|P2]

# Menampilkan backlog
scripts/ticket.sh list

# Memulai pengerjaan tiket di isolated branch
scripts/ticket.sh start TKT-001

# Menyelesaikan tiket (setelah AC tercentang di main)
scripts/ticket.sh done TKT-001

# Menggabungkan branch fitur ke main setelah gate lolos
scripts/merge-tickets.sh
```
