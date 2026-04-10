import { db } from '../db/client.js'
import { auditLog } from '../db/schema/index.js'
import type { AuditLog } from '../db/schema/index.js'

export type AuditEventType = typeof auditLog.$inferInsert['eventType']

export interface AuditEventPayload {
  eventType:   AuditEventType
  entityType:  string
  entityId:    string
  userId?:     string | undefined
  actorType:   'system' | 'user' | 'webhook'
  actorId?:    string | undefined
  metadata?:   Record<string, unknown> | undefined
  ipAddress?:  string | undefined
  userAgent?:  string | undefined
}

/**
 * Write an immutable audit log entry.
 * NEVER update or delete audit log records — MLR 2017 requires 5-year retention.
 * Called after every significant payment, KYC, or compliance event.
 */
export async function writeAuditEvent(payload: AuditEventPayload): Promise<AuditLog> {
  const [entry] = await db
    .insert(auditLog)
    .values({
      eventType:  payload.eventType,
      entityType: payload.entityType,
      entityId:   payload.entityId,
      userId:     payload.userId     ?? null,
      actorType:  payload.actorType,
      actorId:    payload.actorId    ?? null,
      metadata:   payload.metadata   ?? null,
      ipAddress:  payload.ipAddress  ?? null,
      userAgent:  payload.userAgent  ?? null,
    })
    .returning()

  if (!entry) {
    throw new Error('Failed to write audit log entry — this is a critical error')
  }

  return entry
}
