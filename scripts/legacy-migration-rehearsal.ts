import { createHash } from "node:crypto";
import { readdir, readFile, writeFile, mkdir } from "node:fs/promises";
import path from "node:path";
import process from "node:process";

import postgres from "postgres";

type Strategy = "CLEAN_SEED" | "LEGACY_IMPORT";

interface MigrationException {
  readonly sourceName: string;
  readonly sourceRowNumber: number | null;
  readonly entityType: string | null;
  readonly legacyId: string | null;
  readonly errorCode: string;
  readonly safeMessage: string;
  readonly safeDetails: Readonly<Record<string, string | number | boolean>>;
}

interface FileSummary {
  readonly sourceName: string;
  readonly entityType: string;
  readonly rowCount: number;
  readonly headers: readonly string[];
  readonly checksum: string;
  readonly statusCounts: Readonly<Record<string, number>>;
  readonly amountTotals: Readonly<Record<string, number>>;
}

interface RehearsalReport {
  readonly generatedAt: string;
  readonly sourceVersion: "1.8.3";
  readonly strategy: Strategy;
  readonly inputChecksum: string;
  readonly files: readonly FileSummary[];
  readonly totalRows: number;
  readonly exceptionCount: number;
  readonly exceptions: readonly MigrationException[];
  readonly readyForReviewedImport: boolean;
}

const args = parseArgs(process.argv.slice(2));
const inputDir = path.resolve(args["input-dir"] ?? "migration-data");
const reportPath = path.resolve(
  args.report ?? path.join("migration-reports", `rehearsal-${Date.now()}.json`),
);
const strategy = (args.strategy?.toUpperCase() ?? "LEGACY_IMPORT") as Strategy;
if (strategy !== "CLEAN_SEED" && strategy !== "LEGACY_IMPORT")
  fail("strategy must be clean_seed or legacy_import");

const report = await buildReport(inputDir, strategy);
await mkdir(path.dirname(reportPath), { recursive: true });
await writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");

if (args.stage === "true") {
  const tenantSlug = args["tenant-slug"];
  if (!tenantSlug) fail("--tenant-slug is required with --stage true");
  const databaseUrl = process.env.MIGRATION_DATABASE_URL;
  if (!databaseUrl)
    fail("MIGRATION_DATABASE_URL is required with --stage true");
  await stageReport(databaseUrl, tenantSlug, report);
}

process.stdout.write(
  `${JSON.stringify({ reportPath, totalRows: report.totalRows, exceptionCount: report.exceptionCount, readyForReviewedImport: report.readyForReviewedImport })}\n`,
);
if (report.exceptionCount > 0) process.exitCode = 2;

async function buildReport(
  directory: string,
  selectedStrategy: Strategy,
): Promise<RehearsalReport> {
  if (selectedStrategy === "CLEAN_SEED") {
    return {
      generatedAt: new Date().toISOString(),
      sourceVersion: "1.8.3",
      strategy: selectedStrategy,
      inputChecksum: createHash("sha256").update("CLEAN_SEED").digest("hex"),
      files: [],
      totalRows: 0,
      exceptionCount: 0,
      exceptions: [],
      readyForReviewedImport: true,
    };
  }
  let names: string[];
  try {
    names = (await readdir(directory))
      .filter((name) => name.toLowerCase().endsWith(".csv"))
      .sort();
  } catch {
    fail(`cannot read input directory: ${directory}`);
  }
  if (names.length === 0) fail(`no CSV exports found in: ${directory}`);

  const exceptions: MigrationException[] = [];
  const files: FileSummary[] = [];
  const overallHash = createHash("sha256");
  for (const name of names) {
    const buffer = await readFile(path.join(directory, name));
    overallHash.update(name).update(buffer);
    const checksum = createHash("sha256").update(buffer).digest("hex");
    const parsed = parseCsv(buffer.toString("utf8").replace(/^\uFEFF/, ""));
    if (parsed.length === 0) {
      exceptions.push(
        exception(
          name,
          null,
          fileKind(name),
          null,
          "EMPTY_FILE",
          "ไฟล์ไม่มี header หรือข้อมูล",
        ),
      );
      continue;
    }
    const headers = parsed[0]!.map((header) => header.trim());
    const entityType = fileKind(name);
    const duplicateHeaders = headers.filter(
      (header, index) => !header || headers.indexOf(header) !== index,
    );
    for (const header of duplicateHeaders)
      exceptions.push(
        exception(
          name,
          1,
          entityType,
          null,
          "INVALID_HEADER",
          "พบ header ว่างหรือซ้ำ",
          { header: header || "(empty)" },
        ),
      );
    const secretHeaders = headers.filter((header) =>
      /(password|salt|session|token|secret|gateway.?key)/i.test(header),
    );
    for (const header of secretHeaders)
      exceptions.push(
        exception(
          name,
          1,
          entityType,
          null,
          "FORBIDDEN_SECRET_COLUMN",
          "ห้ามนำเข้าคอลัมน์ credential/session/secret",
          { header },
        ),
      );

    const rows = parsed
      .slice(1)
      .filter((row) => row.some((value) => value.trim() !== ""));
    const statusCounts: Record<string, number> = {};
    const amountTotals: Record<string, number> = {};
    const idHeader = headers.find((header) => /(^|_)id$/i.test(header));
    const seenIds = new Set<string>();
    rows.forEach((values, rowIndex) => {
      const rowNumber = rowIndex + 2;
      if (values.length !== headers.length)
        exceptions.push(
          exception(
            name,
            rowNumber,
            entityType,
            null,
            "COLUMN_COUNT_MISMATCH",
            "จำนวนคอลัมน์ไม่ตรงกับ header",
            { expected: headers.length, actual: values.length },
          ),
        );
      const row = Object.fromEntries(
        headers.map((header, index) => [header, values[index]?.trim() ?? ""]),
      );
      const legacyId = idHeader ? row[idHeader] || null : null;
      if (legacyId) {
        if (seenIds.has(legacyId))
          exceptions.push(
            exception(
              name,
              rowNumber,
              entityType,
              legacyId,
              "DUPLICATE_LEGACY_ID",
              "legacy ID ซ้ำในไฟล์",
            ),
          );
        seenIds.add(legacyId);
      }
      for (const [header, value] of Object.entries(row)) {
        if (!value) continue;
        if (/room(_id|_code)?$/i.test(header) && !normalizeRoomCode(value))
          exceptions.push(
            exception(
              name,
              rowNumber,
              entityType,
              legacyId,
              "UNKNOWN_ROOM_CODE",
              "รหัสห้องไม่อยู่ใน C01–C11, D01–D07, CAT01–CAT11 หรือ DOG01–DOG07",
              { column: header },
            ),
          );
        if (
          /(^|_)(date|created_at|updated_at|timestamp|checkin|checkout)$/i.test(
            header,
          ) &&
          !parseLegacyDate(value)
        )
          exceptions.push(
            exception(
              name,
              rowNumber,
              entityType,
              legacyId,
              "INVALID_DATE",
              "วันที่ไม่ตรงรูปแบบที่รองรับ",
              { column: header },
            ),
          );
        if (header.toLowerCase() === "status") {
          statusCounts[value] = (statusCounts[value] ?? 0) + 1;
          if (!statusAllowed(entityType, value))
            exceptions.push(
              exception(
                name,
                rowNumber,
                entityType,
                legacyId,
                "UNKNOWN_STATUS",
                "สถานะไม่มี mapping ที่อนุมัติ",
                { status: value },
              ),
            );
        }
        if (/(amount|total|price|deposit|refund)/i.test(header)) {
          const amount = parseAmount(value);
          if (amount === null)
            exceptions.push(
              exception(
                name,
                rowNumber,
                entityType,
                legacyId,
                "INVALID_AMOUNT",
                "ยอดเงินไม่ใช่ตัวเลขที่รองรับ",
                { column: header },
              ),
            );
          else amountTotals[header] = (amountTotals[header] ?? 0) + amount;
        }
      }
    });
    files.push({
      sourceName: name,
      entityType,
      rowCount: rows.length,
      headers,
      checksum,
      statusCounts,
      amountTotals,
    });
  }
  const inputChecksum = overallHash.digest("hex");
  return {
    generatedAt: new Date().toISOString(),
    sourceVersion: "1.8.3",
    strategy: selectedStrategy,
    inputChecksum,
    files,
    totalRows: files.reduce((sum, file) => sum + file.rowCount, 0),
    exceptionCount: exceptions.length,
    exceptions,
    readyForReviewedImport: exceptions.length === 0,
  };
}

async function stageReport(
  databaseUrl: string,
  tenantSlug: string,
  rehearsal: RehearsalReport,
): Promise<void> {
  const sql = postgres(databaseUrl, { max: 1 });
  try {
    await sql.begin(async (transaction) => {
      const [tenant] = await transaction<
        { id: string }[]
      >`select id from public.tenants where slug = ${tenantSlug}`;
      if (!tenant) throw new Error("TENANT_NOT_FOUND");
      const [run] = await transaction<{ id: string }[]>`
        insert into public.migration_runs (
          tenant_id, source_version, input_checksum, strategy, status,
          source_manifest, reconciliation_summary, exception_count, completed_at
        ) values (
          ${tenant.id}, ${rehearsal.sourceVersion}, ${rehearsal.inputChecksum},
          ${rehearsal.strategy}, ${rehearsal.readyForReviewedImport ? "VALIDATED" : "FAILED"},
          ${transaction.json(JSON.parse(JSON.stringify(rehearsal.files)))},
          ${transaction.json({ totalRows: rehearsal.totalRows })},
          ${rehearsal.exceptionCount}, now()
        )
        on conflict (tenant_id, input_checksum, strategy)
        do update set source_manifest = excluded.source_manifest,
          reconciliation_summary = excluded.reconciliation_summary,
          exception_count = excluded.exception_count,
          status = excluded.status,
          completed_at = now()
        returning id
      `;
      await transaction`delete from public.migration_exceptions where migration_run_id = ${run!.id}`;
      for (const item of rehearsal.exceptions)
        await transaction`
        insert into public.migration_exceptions (
          tenant_id, migration_run_id, source_name, source_row_number, entity_type,
          legacy_id, error_code, safe_message, safe_details
        ) values (
          ${tenant.id}, ${run!.id}, ${item.sourceName}, ${item.sourceRowNumber},
          ${item.entityType}, ${item.legacyId}, ${item.errorCode},
          ${item.safeMessage}, ${transaction.json(item.safeDetails)}
        )
      `;
      await transaction`
        insert into public.audit_logs (tenant_id, action, entity_type, entity_id, after_summary)
        values (${tenant.id}, 'MIGRATION_REHEARSAL_RECORDED', 'MIGRATION_RUN', ${run!.id},
          ${transaction.json({ inputChecksum: rehearsal.inputChecksum, exceptionCount: rehearsal.exceptionCount, strategy: rehearsal.strategy })})
      `;
    });
  } finally {
    await sql.end();
  }
}

function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;
  for (let index = 0; index < text.length; index += 1) {
    const character = text[index]!;
    if (quoted) {
      if (character === '"' && text[index + 1] === '"') {
        field += '"';
        index += 1;
      } else if (character === '"') quoted = false;
      else field += character;
    } else if (character === '"') quoted = true;
    else if (character === ",") {
      row.push(field);
      field = "";
    } else if (character === "\n") {
      row.push(field.replace(/\r$/, ""));
      rows.push(row);
      row = [];
      field = "";
    } else field += character;
  }
  if (quoted) fail("CSV contains an unterminated quoted field");
  if (field || row.length > 0) {
    row.push(field.replace(/\r$/, ""));
    rows.push(row);
  }
  return rows;
}

function fileKind(name: string): string {
  const value = name.toLowerCase();
  const mappings: readonly [RegExp, string][] = [
    [/รายการใบเสร็จ|receipt.?item/, "RECEIPT_ITEM"],
    [/ใบเสร็จ|receipt/, "RECEIPT"],
    [/วันหยุดทำหมัน|sterilization.?holiday/, "STERILIZATION_HOLIDAY"],
    [/นัดทำหมัน|sterilization/, "STERILIZATION"],
    [/สัตว์เลี้ยง|pet/, "PET"],
    [/ห้อง|room/, "ROOM"],
    [/ชำระ|payment/, "PAYMENT"],
    [/ค่าใช้จ่าย|charge/, "CHARGE"],
    [/เลื่อน|reschedule/, "RESCHEDULE"],
    [/ผู้ใช้|user/, "USER"],
    [/ประวัติ|audit/, "AUDIT"],
    [/ตั้งค่า|setting/, "SETTING"],
    [/จอง|booking/, "BOOKING"],
  ];
  return mappings.find(([pattern]) => pattern.test(value))?.[1] ?? "UNKNOWN";
}

function statusAllowed(entityType: string, status: string): boolean {
  const allowed: Readonly<Record<string, readonly string[]>> = {
    BOOKING: [
      "PENDING_APPROVAL",
      "APPROVED_AWAITING_DEPOSIT",
      "CONFIRMED",
      "CHECKED_IN",
      "CHECKED_OUT",
      "REJECTED",
      "EXPIRED_PAYMENT",
      "CANCELLED_NO_REFUND",
      "NO_SHOW",
    ],
    PAYMENT: [
      "NOT_REQUIRED",
      "WAITING",
      "SUBMITTED",
      "VERIFIED",
      "WAIVED",
      "EXPIRED",
      "FORFEITED",
      "REFUND_DUE",
      "REFUNDED",
    ],
    STERILIZATION: [
      "PENDING_CONFIRMATION",
      "CONFIRMED",
      "ARRIVED",
      "COMPLETED",
      "CANCELLED",
      "NO_SHOW",
    ],
    RECEIPT: ["ISSUED", "VOID"],
  };
  return (
    !allowed[entityType] || allowed[entityType].includes(status.toUpperCase())
  );
}

function normalizeRoomCode(value: string): string | null {
  const normalized = value.trim().toUpperCase();
  if (/^CAT(0[1-9]|1[01])$/.test(normalized) || /^DOG0[1-7]$/.test(normalized))
    return normalized;
  if (/^C(0[1-9]|1[01])$/.test(normalized)) return `CAT${normalized.slice(1)}`;
  if (/^D0[1-7]$/.test(normalized)) return `DOG${normalized.slice(1)}`;
  return null;
}

function parseLegacyDate(value: string): string | null {
  const trimmed = value.trim();
  if (
    /^\d{4}-\d{2}-\d{2}(?:[T ][^ ]+)?/.test(trimmed) &&
    !Number.isNaN(Date.parse(trimmed.slice(0, 10)))
  )
    return trimmed.slice(0, 10);
  const match = /^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/.exec(trimmed);
  if (!match) return null;
  const year = Number(match[3]);
  const month = Number(match[2]);
  const day = Number(match[1]);
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year &&
    date.getUTCMonth() + 1 === month &&
    date.getUTCDate() === day
    ? `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`
    : null;
}

function parseAmount(value: string): number | null {
  const normalized = value.replace(/,/g, "").trim();
  if (!/^-?\d+(?:\.\d{1,2})?$/.test(normalized)) return null;
  const amount = Number(normalized);
  return Number.isSafeInteger(Math.round(amount * 100)) ? amount : null;
}
function exception(
  sourceName: string,
  sourceRowNumber: number | null,
  entityType: string | null,
  legacyId: string | null,
  errorCode: string,
  safeMessage: string,
  safeDetails: Readonly<Record<string, string | number | boolean>> = {},
): MigrationException {
  return {
    sourceName,
    sourceRowNumber,
    entityType,
    legacyId,
    errorCode,
    safeMessage,
    safeDetails,
  };
}
function parseArgs(values: readonly string[]): Record<string, string> {
  const parsed: Record<string, string> = {};
  for (let index = 0; index < values.length; index += 2) {
    const key = values[index];
    const value = values[index + 1];
    if (!key?.startsWith("--") || value === undefined)
      fail("arguments must use --key value");
    parsed[key.slice(2)] = value;
  }
  return parsed;
}
function fail(message: string): never {
  throw new Error(`MIGRATION_REHEARSAL_ERROR: ${message}`);
}
