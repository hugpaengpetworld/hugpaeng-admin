import process from "node:process";

import postgres from "postgres";
import { z } from "zod";

const SOURCE_PROJECT_REF = "wnnxdcxuxupmnplkegkt";
const TARGET_PROJECT_REF = "svgmzjphmdqfeptalxhe";

const environment = z
  .object({
    SOURCE_DATABASE_URL: z.string().min(1),
    TARGET_DATABASE_URL: z.string().min(1),
  })
  .parse(process.env);

function assertDatabaseTarget(
  rawUrl: string,
  expectedProjectRef: string,
  label: string,
): void {
  const url = new URL(rawUrl);
  const identifiesProject =
    url.hostname.includes(expectedProjectRef) ||
    decodeURIComponent(url.username).includes(expectedProjectRef);

  if (
    url.protocol !== "postgresql:" ||
    !url.hostname.endsWith("supabase.com") ||
    !identifiesProject ||
    url.pathname !== "/postgres"
  ) {
    throw new Error(`${label}_DATABASE_TARGET_MISMATCH`);
  }
}

assertDatabaseTarget(
  environment.SOURCE_DATABASE_URL,
  SOURCE_PROJECT_REF,
  "SOURCE",
);
assertDatabaseTarget(
  environment.TARGET_DATABASE_URL,
  TARGET_PROJECT_REF,
  "TARGET",
);

if (environment.SOURCE_DATABASE_URL === environment.TARGET_DATABASE_URL) {
  throw new Error("SOURCE_AND_TARGET_MUST_DIFFER");
}

interface RelationSummary {
  count: number;
  fingerprint: string;
}

interface DatabaseSummary {
  schema: {
    constraints: number;
    functions: number;
    policies: number;
    rlsEnabledTables: number;
    tables: number;
    triggers: number;
    views: number;
  };
  relations: Record<string, RelationSummary>;
}

function quoteIdentifier(identifier: string): string {
  if (!/^[a-z][a-z0-9_]*$/.test(identifier)) {
    throw new Error("UNSAFE_RELATION_NAME");
  }
  return `"${identifier}"`;
}

async function summarizeDatabase(
  databaseUrl: string,
): Promise<DatabaseSummary> {
  const sql = postgres(databaseUrl, { max: 1, prepare: false });
  try {
    const tableRows = await sql<{ table_name: string }[]>`
      select table_name
      from information_schema.tables
      where table_schema = 'public'
        and table_type = 'BASE TABLE'
      order by table_name
    `;
    const relations: Record<string, RelationSummary> = {};

    for (const { table_name: tableName } of tableRows) {
      const relation = quoteIdentifier(tableName);
      const [summary] = await sql.unsafe<RelationSummary[]>(`
        select
          count(*)::integer as count,
          md5(
            coalesce(
              string_agg(
                md5(row_to_json(source_row)::text),
                '' order by md5(row_to_json(source_row)::text)
              ),
              ''
            )
          ) as fingerprint
        from public.${relation} source_row
      `);
      if (!summary) throw new Error("RELATION_SUMMARY_MISSING");
      relations[tableName] = summary;
    }

    const [schema] = await sql<DatabaseSummary["schema"][]>`
      select
        (select count(*)::integer from information_schema.tables
          where table_schema = 'public' and table_type = 'BASE TABLE') as tables,
        (select count(*)::integer from information_schema.views
          where table_schema = 'public') as views,
        (select count(*)::integer from pg_proc procedure
          join pg_namespace namespace on namespace.oid = procedure.pronamespace
          where namespace.nspname = 'public') as functions,
        (select count(*)::integer from pg_policies
          where schemaname = 'public') as policies,
        (select count(*)::integer from pg_class relation
          join pg_namespace namespace on namespace.oid = relation.relnamespace
          where namespace.nspname = 'public'
            and relation.relkind = 'r'
            and relation.relrowsecurity) as "rlsEnabledTables",
        (select count(*)::integer from information_schema.table_constraints
          where table_schema = 'public') as constraints,
        (select count(*)::integer from information_schema.triggers
          where trigger_schema = 'public') as triggers
    `;
    if (!schema) throw new Error("SCHEMA_SUMMARY_MISSING");

    return { schema, relations };
  } finally {
    await sql.end();
  }
}

const [source, target] = await Promise.all([
  summarizeDatabase(environment.SOURCE_DATABASE_URL),
  summarizeDatabase(environment.TARGET_DATABASE_URL),
]);

if (JSON.stringify(source) !== JSON.stringify(target)) {
  process.stdout.write(
    `${JSON.stringify(
      {
        source: {
          schema: source.schema,
          rowCounts: Object.fromEntries(
            Object.entries(source.relations).map(([table, summary]) => [
              table,
              summary.count,
            ]),
          ),
        },
        target: {
          schema: target.schema,
          rowCounts: Object.fromEntries(
            Object.entries(target.relations).map(([table, summary]) => [
              table,
              summary.count,
            ]),
          ),
        },
      },
      null,
      2,
    )}\n`,
  );
  throw new Error("BACKUP_RESTORE_RECONCILIATION_FAILED");
}

process.stdout.write(
  `${JSON.stringify(
    {
      status: "MATCH",
      schema: source.schema,
      rowCounts: Object.fromEntries(
        Object.entries(source.relations).map(([table, summary]) => [
          table,
          summary.count,
        ]),
      ),
    },
    null,
    2,
  )}\n`,
);
