/**
 * Add or update REAL creditors on Bolster's vetted list.
 *
 *   npm run db:import-creditors --workspace=backend -- path/to/creditors.json
 *
 * The file is a JSON array; see backend/creditors.example.json. Every entry
 * must say who verified the bank details and how (e.g. "confirmed by phone
 * with the creditor's payments team on 12 Nov 2026 and against their website").
 * Existing creditors are matched by name and updated; nothing is deleted.
 */
import { readFileSync } from 'node:fs'
import { eq } from 'drizzle-orm'
import { z } from 'zod'
import { db, pool } from './client.js'
import { creditors } from './schema/index.js'
import { creditorImportSchema } from '../types/index.js'

async function main(): Promise<void> {
  const file = process.argv[2]
  if (!file) {
    console.error('Usage: npm run db:import-creditors --workspace=backend -- path/to/creditors.json')
    process.exit(1)
  }

  const parsed = z.array(creditorImportSchema).safeParse(JSON.parse(readFileSync(file, 'utf8')))
  if (!parsed.success) {
    console.error('The file has problems — nothing was imported:')
    for (const issue of parsed.error.issues) {
      console.error(`  entry ${String(issue.path[0])}, ${issue.path.slice(1).join('.')}: ${issue.message}`)
    }
    process.exit(1)
  }

  const now = new Date()
  let added = 0
  let updated = 0

  for (const c of parsed.data) {
    const values = {
      name:             c.name,
      category:         c.category,
      aliases:          c.aliases,
      sortCode:         c.sortCode,
      accountNumber:    c.accountNumber,
      referenceLabel:   c.referenceLabel,
      referenceHint:    c.referenceHint ?? null,
      isActive:         true,
      isTestData:       false,
      verifiedAt:       now,
      verifiedBy:       c.verifiedBy,
      verificationNote: c.verificationNote,
      updatedAt:        now,
    }

    const existing = await db.query.creditors.findFirst({ where: eq(creditors.name, c.name) })
    if (existing) {
      await db.update(creditors).set(values).where(eq(creditors.id, existing.id))
      updated += 1
    } else {
      await db.insert(creditors).values(values)
      added += 1
    }
  }

  console.log(`Creditors imported: ${added} added, ${updated} updated.`)
  await pool.end()
}

main().catch((e: unknown) => {
  console.error('Import failed:', e instanceof Error ? e.message : e)
  process.exit(1)
})
