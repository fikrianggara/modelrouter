# Project Tickets & Parallel Branch Workflow

Every feature or bug is a **ticket** in this directory; work happens on
isolated **branches**; branches merge into `main` only when parallel work is
finished (or on explicit instruction from the owner).

## Ticket lifecycle

| Status    | Meaning                                                            |
|-----------|--------------------------------------------------------------------|
| `backlog` | Logged, not yet assigned. Anyone may pick it up.                   |
| `ongoing` | Assigned and in progress. Hands-off for every other agent.         |
| `done`    | Unit + integration tests pass. Ready to merge. Branch NOT merged.  |
| `merged`  | Branch merged into `main` by the merge orchestrator.               |
| `cancelled` | Dropped / superseded.                                            |

## Rules (every agent MUST follow)

1. **Read `INDEX.md` before starting anything.** Never start work that is
   already `ongoing` or `done` — it is being processed by someone else.
2. **Create a ticket first.** New feature or bug → `scripts/ticket.sh new`.
3. **Never write code on `main`.** `main` receives only ticket-status doc
   commits. Code lives on `feat|fix/TKT-###-<slug>` branches.
4. **Assign + start via the CLI:** `scripts/ticket.sh start TKT-###`
   flags the ticket `ongoing`, creates the branch, and provisions the
   per-ticket test database (when DB provisioning is configured).
5. **Test on YOUR database:** run integration tests with
   `DATABASE_URL="<base-url>/<test-db-prefix>###" <test-command>`
   — never a shared test DB while other agents work.
6. **Dev servers** run on `port base + ticket number` (default base 3100).
7. **Keep the working tree clean before every `git checkout`** — uncommitted
   changes can clobber another agent's checkout.
8. **Finish with the CLI:** after tests pass,
   `scripts/ticket.sh done TKT-### "summary of changes"` — this marks the
   ticket `done` + `readyToMerge` on `main` (visible to everyone) but does NOT
   merge the branch.
9. **Merge only via the orchestrator:** `scripts/merge-tickets.sh` merges all
   `done` branches into `main` (no-ff), runs the gate chain, marks tickets
   `merged`, and drops the ticket test DBs. It refuses to run while any
   ticket is `ongoing` unless the owner passes `--force`.
10. **If `main` moved while you worked**, merge/rebase `main` into your branch
    before marking `done` — never force-push or rewrite shared history.

## CLI reference

```bash
scripts/ticket.sh new "<title>" [bug] [size] [group] [severity]  # create backlog ticket (next id); severity P0|P1|P2
scripts/ticket.sh start TKT-###            # flag ongoing, branch, test DB
scripts/ticket.sh done TKT-### "<summary>" # flag done + readyToMerge + notes
scripts/ticket.sh status TKT-###           # print ticket frontmatter
scripts/ticket.sh list                     # regenerate INDEX.md
scripts/ticket.sh db-create TKT-###        # create + migrate ticket test DB
scripts/ticket.sh db-drop TKT-###          # drop ticket test DB
scripts/merge-tickets.sh [--force] [--push]# merge done branches into main
```

## Ticket size, group & severity

- `size`: `small | medium | big` — implementation-effort estimate, decided at
  backlog time.
- `severity`: `P0 | P1 | P2` — business/risk priority. P0 = blocker
  (shipping-breaking, security, data integrity), P1 = high, P2 = normal.
- `group`: an epic/branch group. Tickets in the same group are **worked on
  the same branch** — `start` on a later ticket of the same group **joins the
  ongoing sibling branch** (one group = one branch/run, one merge).

## Ticket timestamps (created / updated / createdAt / updatedAt)

Every ticket file carries four timestamp fields in its frontmatter. They tell
you **when a ticket was issued and when it last changed** — visible in
INDEX.md's `created` / `updated` columns.

| Field | Format | Meaning | Maintained by |
|-------|--------|---------|---------------|
| `created` | `YYYY-MM-DD` | Issue date (when `ticket.sh new` ran) | `ticket.sh new` |
| `updated` | `YYYY-MM-DD` | Last status-change date | `ticket.sh start` / `done` |
| `createdAt` | ISO-8601 `YYYY-MM-DDTHH:MM:SS±HH:MM` | Precise issue timestamp | `ticket.sh new` (now); legacy tickets backfilled from **first git commit** |
| `updatedAt` | ISO-8601 | Precise last-change timestamp | `ticket.sh start` / `done` (now); legacy backfilled from **last git commit** |

Rules:

1. **Never hand-edit these fields** — `ticket.sh` owns them.
2. `created`/`createdAt` are immutable once the ticket exists; `updated`/
   `updatedAt` advance on every status change.
3. INDEX.md's `created`/`updated` columns come from the frontmatter — never
   edit INDEX.md by hand, always `scripts/ticket.sh list`.

## Project configuration

`scripts/ticket.config.sh` (optional) overrides the ticket-system defaults
via `TKT_*` variables — DB base URL, test-DB prefix, default assignee, port
base, test command, migrate command, merge gate command. See
`assets/templates/ticket.config.sh.example` in the bootstrap skill, or the
skill `ticket-system-bootstrap`.

## Ticket file format

One markdown file per ticket with YAML frontmatter — machine-parseable by any
agent tool. See `TKT-000-template.md`.
