# scripts/ticket.config.sh — project overrides for the ticket system.
# Sourced by scripts/ticket.sh and scripts/merge-tickets.sh.
# One KEY="value" per line — no `export` needed.

# Base URL for per-ticket test DBs. Empty = no DB provisioning (generic).
TKT_DB_URL_BASE=""

# Per-ticket test DB name prefix.
TKT_TEST_DB_PREFIX=""

# Agent name stamped by `ticket.sh start`.
TKT_DEFAULT_ASSIGNEE="jarvis"

# Dev-server port base — ticket N listens on base+N (e.g. 8101, 8102).
TKT_PORT_BASE="8100"

# Test command printed by `ticket.sh start`.
TKT_TEST_CMD="npx vitest run"

# DB migrate command used by db-create/merge. Empty = skip migrations.
TKT_MIGRATE_CMD=""

# Merge gate chain (single command string).
TKT_GATE_CMD="npx vitest run"
