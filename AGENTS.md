# Ticket-Driven Workflow — Working Rules

This project runs like a real co-worked team. Every feature or bug is a
ticket in `tickets/`; work happens on isolated branches; branches merge into
`main` only when parallel work is finished (or on explicit instruction from
the owner). Read `tickets/README.md` and `tickets/INDEX.md` before doing
anything.

## Hard rules

1. **Never start work that is `ongoing` or `done`** — another agent owns it.
   Check `tickets/INDEX.md` first.
2. **Every feature/bug is a ticket first**: `scripts/ticket.sh new "<title>" [bug]`.
3. **Code only on your ticket branch** (`feat|fix/TKT-###-<slug>`). `main`
   receives ticket-status doc commits only. Never commit code to `main`.
4. **Start a ticket with the CLI**: `scripts/ticket.sh start TKT-###`
   (flags `ongoing`, creates the branch, provisions the test DB when
   configured).
5. **Keep the working tree clean before every `git checkout`** — uncommitted
   changes can clobber another agent's checkout.
6. **Finish with the CLI**: before `scripts/ticket.sh done TKT-### "summary"`,
   replace any template placeholders with concrete acceptance criteria and tick
   every `- [ ]` box you actually verified — `done` REFUSES unchecked criteria
   (`--force` only for genuinely N/A). Do NOT merge the branch yourself.
7. **Merges happen via `scripts/merge-tickets.sh`** when all parallel work is
   done or the owner says merge.
8. **If `main` moves while you work**, merge/rebase `main` into your branch
   before finishing. Never force-push or rewrite shared branches.

## Ticket timestamps

Every ticket file carries **four** timestamp fields in its frontmatter:
`created` / `updated` (dates, maintained by `ticket.sh new|start|done`) and
`createdAt` / `updatedAt` (precise ISO-8601 timestamps — new tickets stamped
by the CLI, legacy tickets backfilled from git history). INDEX.md shows the
dates in its `created` / `updated` columns. **Never hand-edit these fields or
INDEX.md** — the CLI owns them (see `tickets/README.md` → Ticket timestamps).

## Project facts

- Ticket prefix: `TKT` (by design; see the bootstrap skill if you need to
  change it).
- Per-ticket test DB + dev-server port conventions: see
  `scripts/ticket.config.sh` (if present) or `tickets/README.md`.
