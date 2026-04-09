import { db } from '../../db/client.js'
import { amlScreenings } from '../../db/schema/index.js'
import type { AmlScreening } from '../../db/schema/index.js'
import { env } from '../../config/env.js'
import type { Result } from '../../types/index.js'
import { ok, err } from '../../types/index.js'

interface ScreenSubjectInput {
  name:   string
  email?: string
}

interface ComplyAdvantageSearchResponse {
  data: {
    id:      number
    hits:    Array<{
      match_status: string
      score:        number
      doc: {
        name:   string
        types:  string[]
      }
    }>
    total_hits: number
  }
}

/**
 * AML Screening Service — Comply Advantage integration
 *
 * All contributors are screened before payment initiation against:
 * - UK Consolidated Sanctions List (OFSI)
 * - OFAC (US sanctions)
 * - UN Security Council list
 * - PEP (Politically Exposed Persons) databases
 *
 * Under MLR 2017, you must file a SAR to the NCA via goAML
 * if a confirmed match is found. This service records the screening result;
 * your MLRO handles SAR filing for confirmed_match results.
 *
 * Records are retained for 5 years minimum (MLR 2017 Reg 40).
 */
export class AmlService {
  private readonly baseUrl = 'https://api.complyadvantage.com'

  async screenContributor(
    subject: ScreenSubjectInput,
  ): Promise<Result<AmlScreening>> {
    return this.screen('contributor', subject)
  }

  async screenRecipient(
    subject: ScreenSubjectInput,
  ): Promise<Result<AmlScreening>> {
    return this.screen('recipient', subject)
  }

  private async screen(
    subjectType: 'contributor' | 'recipient',
    subject:     ScreenSubjectInput,
  ): Promise<Result<AmlScreening>> {
    try {
      const response = await fetch(
        `${this.baseUrl}/searches?api_key=${env.COMPLY_ADVANTAGE_API_KEY}`,
        {
          method:  'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            search_term:    subject.name,
            fuzziness:      env.COMPLY_ADVANTAGE_FUZZINESS,
            search_profile: 'sanctions_and_pep',
            filters: {
              types: ['sanction', 'pep', 'warning', 'adverse-media'],
            },
          }),
        },
      )

      if (!response.ok) {
        // AML screening failure — do not block payment, but log for MLRO review
        console.error(`Comply Advantage API error: ${response.status}`)
        const [screening] = await db
          .insert(amlScreenings)
          .values({
            subjectType,
            subjectName:  subject.name,
            subjectEmail: subject.email,
            result:       'error',
            matchCount:   0,
          })
          .returning()
        return ok(screening!)
      }

      const data = await response.json() as ComplyAdvantageSearchResponse
      const totalHits = data.data.total_hits

      // Determine result based on hits and match quality
      let result: 'clear' | 'potential_match' | 'confirmed_match' = 'clear'

      if (totalHits > 0) {
        const highConfidenceHit = data.data.hits.some(
          (hit) => hit.score > 0.9 && hit.match_status === 'potential_match',
        )
        result = highConfidenceHit ? 'confirmed_match' : 'potential_match'
      }

      const [screening] = await db
        .insert(amlScreenings)
        .values({
          subjectType,
          subjectName:         subject.name,
          subjectEmail:        subject.email,
          complyAdvantageId:   String(data.data.id),
          result,
          matchCount:          totalHits,
          rawResponse:         data as unknown as Record<string, unknown>,
        })
        .returning()

      if (!screening) {
        return err(new Error('Failed to save AML screening result'))
      }

      // Log potential matches for MLRO review
      if (result !== 'clear') {
        console.warn(`AML screening ${result} for "${subject.name}" — MLRO review required`, {
          screeningId:       screening.id,
          complyAdvantageId: screening.complyAdvantageId,
          matchCount:        totalHits,
        })
      }

      return ok(screening)
    } catch (e) {
      return err(e instanceof Error ? e : new Error(String(e)))
    }
  }
}

export const amlService = new AmlService()
