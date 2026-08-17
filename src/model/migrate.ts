/**
 * Schema migrations — the explicit, one-step-per-version upgrade chain
 * (architecture.md §2 rule 3, §8).
 *
 * A book saved by any earlier version of Novelka must always open. That is
 * enforced here, not by hope: every schema change ships a migration step and
 * a test in the same commit. The chain is walked one step at a time —
 * `v1 -> v2`, `v2 -> v3`, and so on — never a switch that handles every
 * version at once.
 *
 * The chain started life inside `document.ts` (Unit 01) and was empty at
 * version 1. Unit 04 moved it here and added the first real step: a
 * **deliberate no-op v1 -> v2**, so the mechanism is exercised by a real
 * migration before anything depends on it. Version 2 is intentionally
 * identical to version 1.
 */

import { CURRENT_SCHEMA_VERSION, assertValidDocument } from './document';
import { DocumentParseError, parseDocument, readSchemaVersion } from './parse';
import type { Document } from './types';

/**
 * One version step. `up` receives a record shaped like the previous version
 * and returns a record shaped like the next one. Each step stays a pure
 * function so the whole chain is testable with plain data.
 */
export type MigrationStep = {
  readonly from: number;
  readonly to: number;
  readonly up: (raw: Record<string, unknown>) => Record<string, unknown>;
};

/**
 * The deliberate no-op v1 -> v2 step. It changes nothing except the version
 * field. It exists so a real migration runs end to end rather than being
 * assumed to work (spec 04 §3).
 */
const v1ToV2: MigrationStep = {
  from: 1,
  to: 2,
  up: (raw) => ({ ...raw, schemaVersion: 2 }),
};

/** Walked in order. Appending a version step is mechanical. */
export const MIGRATIONS: readonly MigrationStep[] = [v1ToV2];

/**
 * Validates and upgrades unknown input into a current-version Document.
 *
 * Throws `DocumentParseError` when the input is not shaped like a document or
 * its version cannot be reached, and `DocumentInvariantError` when a
 * well-shaped document breaks an invariant. It never returns a broken
 * document, and it never guesses a missing version.
 */
export function migrate(raw: unknown): Document {
  let version = readSchemaVersion(raw);
  if (version > CURRENT_SCHEMA_VERSION) {
    throw new DocumentParseError(
      `document.schemaVersion: this book was saved by a newer version of Novelka (schema ${version}, this build reads ${CURRENT_SCHEMA_VERSION}). Update Novelka to open it.`,
    );
  }

  // `readSchemaVersion` has already proved this is an object.
  let current = raw as Record<string, unknown>;
  while (version < CURRENT_SCHEMA_VERSION) {
    const step = MIGRATIONS.find((candidate) => candidate.from === version);
    if (step === undefined) {
      throw new DocumentParseError(
        `document.schemaVersion: no migration exists from schema ${version} to ${CURRENT_SCHEMA_VERSION}.`,
      );
    }
    current = step.up(current);
    version = step.to;
  }

  const document = parseDocument(current);
  assertValidDocument(document);
  return document;
}
