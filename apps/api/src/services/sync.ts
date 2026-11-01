import { Prisma } from "@prisma/client";
import { prisma } from "../db.js";

type TxClient = Omit<
  Prisma.TransactionClient,
  "$connect" | "$disconnect" | "$on" | "$transaction" | "$use" | "$extends"
>;

export interface SyncEventInput {
  entityType: "PRODUCT" | "MATERIAL" | "SUPPLIER";
  entityId: string;
  changeType: "CREATED" | "UPDATED" | "DELETED" | "PRICE_CHANGED" | "MEDIA_CHANGED";
  payload: Prisma.InputJsonValue;
}

/**
 * §81 — the outbox.
 *
 * The event is written in the same transaction as the change it describes, and
 * delivery happens elsewhere. That ordering is the point: a channel push that
 * fails, times out or is retried cannot roll back the edit the user just made,
 * and nothing is lost if the process dies between the two. It is also what makes
 * "everything correct everywhere" auditable — the table shows what was sent, what
 * failed and what is still waiting.
 */
export async function recordSyncEvent(tx: TxClient, event: SyncEventInput): Promise<void> {
  await tx.syncEvent.create({
    data: {
      entityType: event.entityType,
      entityId: event.entityId,
      changeType: event.changeType,
      payload: event.payload,
    },
  });
}

/** Convenience for callers outside a transaction. */
export async function recordSyncEventStandalone(event: SyncEventInput): Promise<void> {
  await recordSyncEvent(prisma, event);
}

export async function pendingSyncEvents(limit = 50) {
  return prisma.syncEvent.findMany({
    where: { processedAt: null },
    orderBy: { createdAt: "asc" },
    take: limit,
  });
}
