import { eq } from 'drizzle-orm'
import { db } from './client.js'
import { creditors } from './schema/index.js'
import { env } from '../config/env.js'

/**
 * TEST creditors for local development ONLY.
 *
 * The names are real companies so the screens and bill scanning can be tried
 * realistically, but the sort codes and account numbers are MADE UP. They are
 * flagged isTestData, are never served when NODE_ENV=production, and this
 * function refuses to run there. Real creditors are added with
 * `npm run db:import-creditors` after their bank details have been verified.
 */
const TEST_CREDITORS = [
  { name: 'British Gas',     category: 'energy',   aliases: ['British Gas Trading', 'BG'],            sortCode: '200000', accountNumber: '31510604', referenceLabel: 'Customer reference number', referenceHint: 'Top right of your bill, usually 9 digits' },
  { name: 'Octopus Energy',  category: 'energy',   aliases: ['Octopus'],                              sortCode: '200000', accountNumber: '31510611', referenceLabel: 'Account number',            referenceHint: 'Starts with A- on your statement' },
  { name: 'Thames Water',    category: 'water',    aliases: ['Thames Water Utilities'],               sortCode: '200000', accountNumber: '31510628', referenceLabel: 'Customer reference number', referenceHint: 'Top of your bill' },
  { name: 'Vodafone',        category: 'telecoms', aliases: ['Vodafone UK'],                          sortCode: '200000', accountNumber: '55512345', referenceLabel: 'Account number',            referenceHint: 'On the first page of your bill' },
  { name: 'Barclaycard',     category: 'lender',   aliases: ['Barclays', 'Barclays Bank'],            sortCode: '200000', accountNumber: '43219876', referenceLabel: 'Card or account number',    referenceHint: 'The last 16 digits shown on your statement' },
  { name: 'Zopa',            category: 'lender',   aliases: ['Zopa Loans', 'Zopa Bank'],              sortCode: '200000', accountNumber: '31510635', referenceLabel: 'Loan reference',            referenceHint: 'On your loan agreement or statement' },
  { name: 'Klarna',          category: 'bnpl',     aliases: ['Klarna Bank'],                          sortCode: '200000', accountNumber: '31510642', referenceLabel: 'Payment reference',         referenceHint: 'Shown in the Klarna app under the purchase' },
  { name: 'TV Licensing',    category: 'other',    aliases: ['TV Licence'],                           sortCode: '200000', accountNumber: '31510659', referenceLabel: 'Licence number',            referenceHint: '10 digits on your licence or letter' },
] as const

/** Create any missing test creditors. Safe to run repeatedly. Development only. */
export async function ensureTestCreditors(): Promise<number> {
  if (env.NODE_ENV !== 'development') return 0

  let created = 0
  for (const c of TEST_CREDITORS) {
    const existing = await db.query.creditors.findFirst({ where: eq(creditors.name, c.name) })
    if (existing) continue

    await db.insert(creditors).values({
      name:             c.name,
      category:         c.category,
      aliases:          [...c.aliases],
      sortCode:         c.sortCode,
      accountNumber:    c.accountNumber,
      referenceLabel:   c.referenceLabel,
      referenceHint:    c.referenceHint,
      isTestData:       true,
      verifiedAt:       new Date(),
      verifiedBy:       'dev-seed',
      verificationNote: 'TEST DATA — bank details are made up. Not for production.',
    })
    created += 1
  }
  return created
}
