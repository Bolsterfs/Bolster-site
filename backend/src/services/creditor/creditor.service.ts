import { and, eq, isNull } from 'drizzle-orm'
import { db } from '../../db/client.js'
import { creditors } from '../../db/schema/index.js'
import type { Creditor } from '../../db/schema/index.js'
import { env } from '../../config/env.js'

/**
 * What a recipient is allowed to see about a creditor. Deliberately excludes
 * the sort code and account number — recipients never handle bank details.
 */
export interface PublicCreditor {
  id:             string
  name:           string
  category:       string
  referenceLabel: string
  referenceHint:  string | null
  isTestData:     boolean
}

function toPublic(c: Creditor): PublicCreditor {
  return {
    id:             c.id,
    name:           c.name,
    category:       c.category,
    referenceLabel: c.referenceLabel,
    referenceHint:  c.referenceHint,
    isTestData:     c.isTestData,
  }
}

/** Lower-case, strip punctuation and company suffixes, collapse spaces. */
export function normaliseCreditorName(value: string): string {
  return value
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9 ]+/g, ' ')
    .replace(/\b(ltd|limited|plc|uk|group|the)\b/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

/** True when a creditor may be offered to recipients in this environment. */
function isUsable(c: Creditor): boolean {
  if (!c.isActive || c.deletedAt) return false
  // Test rows exist only so the app can be exercised in development.
  if (c.isTestData && env.NODE_ENV === 'production') return false
  return true
}

export class CreditorService {
  /** All creditors a recipient may choose from, optionally filtered by a search. */
  async list(search?: string): Promise<PublicCreditor[]> {
    const rows = await db.query.creditors.findMany({
      where: and(eq(creditors.isActive, true), isNull(creditors.deletedAt)),
      orderBy: (c, { asc }) => [asc(c.name)],
    })

    const usable = rows.filter(isUsable)
    const needle = search ? normaliseCreditorName(search) : ''
    if (!needle) return usable.map(toPublic)

    return usable
      .filter((c) =>
        [c.name, ...c.aliases].some((n) => normaliseCreditorName(n).includes(needle)),
      )
      .map(toPublic)
  }

  /** The full creditor row (including bank details) — server-side use only. */
  async findUsableById(id: string): Promise<Creditor | null> {
    const row = await db.query.creditors.findFirst({ where: eq(creditors.id, id) })
    return row && isUsable(row) ? row : null
  }

  /**
   * Match a name read from a bill to a creditor on the list. Exact match on
   * the normalised name or an alias first; otherwise the single creditor whose
   * name or alias appears, as whole words, inside the longer name on the bill
   * ("British Gas" inside "British Gas Services"). A short or generic name on
   * the bill ("Energy") never matches. Returns null when there is no match or
   * more than one candidate — never guesses.
   */
  async matchByName(nameOnBill: string): Promise<PublicCreditor | null> {
    const needle = normaliseCreditorName(nameOnBill)
    if (needle.length < 3) return null

    const rows = (await db.query.creditors.findMany({
      where: and(eq(creditors.isActive, true), isNull(creditors.deletedAt)),
    })).filter(isUsable)

    const names = (c: Creditor) => [c.name, ...c.aliases].map(normaliseCreditorName)

    const exact = rows.filter((c) => names(c).includes(needle))
    if (exact.length === 1 && exact[0]) return toPublic(exact[0])
    if (exact.length > 1) return null

    const padded  = ` ${needle} `
    const partial = rows.filter((c) =>
      names(c).some((n) => n.length >= 3 && padded.includes(` ${n} `)),
    )
    return partial.length === 1 && partial[0] ? toPublic(partial[0]) : null
  }
}

export const creditorService = new CreditorService()
