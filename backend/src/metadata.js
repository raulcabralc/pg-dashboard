"use strict";

const { BadRequestError } = require("./errors");
const { quoteIdentifier, quoteQualifiedTableName } = require("./queryBuilder");

async function listTables(pool, schemaName = "public") {
  const relations = await listRelations(pool, schemaName);

  return relations.map((relation) => relation.tableName);
}

async function listRelations(pool, schemaName = "public") {
  const result = await pool.query(
    `
    SELECT
      c.relname AS "tableName",
      CASE c.relkind
        WHEN 'v' THEN 'view'
        WHEN 'm' THEN 'materializedView'
        ELSE 'table'
      END AS "relationType"
    FROM pg_catalog.pg_class c
    JOIN pg_catalog.pg_namespace n
      ON n.oid = c.relnamespace
    WHERE n.nspname = $1
      AND c.relkind IN ('r', 'p', 'v', 'm')
    ORDER BY c.relname
  `,
    [schemaName],
  );

  return result.rows.map((row) => ({
    tableName: row.tableName,
    relationType: row.relationType,
    isView:
      row.relationType === "view" ||
      row.relationType === "materializedView",
  }));
}

async function getRelation(pool, tableName, schemaName = "public") {
  const relations = await listRelations(pool, schemaName);
  const relation = relations.find((candidate) => candidate.tableName === tableName);

  if (!relation) {
    throw new BadRequestError("Invalid tableName.");
  }

  return relation;
}

async function listColumns(pool, tableName, schemaName = "public") {
  const result = await pool.query(
    `
      SELECT
        column_name AS "columnName",
        data_type AS "dataType",
        udt_name AS "udtName"
      FROM information_schema.columns
      WHERE table_schema = $1
        AND table_name = $2
      ORDER BY ordinal_position
    `,
    [schemaName, tableName],
  );

  if (result.rows.length) {
    return result.rows;
  }

  const fallbackResult = await pool.query(
    `
      SELECT
        a.attname AS "columnName",
        CASE t.typname
          WHEN 'bool' THEN 'boolean'
          WHEN 'bpchar' THEN 'character'
          WHEN 'date' THEN 'date'
          WHEN 'float4' THEN 'real'
          WHEN 'float8' THEN 'double precision'
          WHEN 'int2' THEN 'smallint'
          WHEN 'int4' THEN 'integer'
          WHEN 'int8' THEN 'bigint'
          WHEN 'json' THEN 'json'
          WHEN 'jsonb' THEN 'jsonb'
          WHEN 'numeric' THEN 'numeric'
          WHEN 'text' THEN 'text'
          WHEN 'time' THEN 'time without time zone'
          WHEN 'timestamp' THEN 'timestamp without time zone'
          WHEN 'timestamptz' THEN 'timestamp with time zone'
          WHEN 'timetz' THEN 'time with time zone'
          WHEN 'uuid' THEN 'uuid'
          WHEN 'varchar' THEN 'character varying'
          ELSE pg_catalog.format_type(a.atttypid, a.atttypmod)
        END AS "dataType",
        t.typname AS "udtName"
      FROM pg_catalog.pg_attribute a
      JOIN pg_catalog.pg_class c
        ON c.oid = a.attrelid
      JOIN pg_catalog.pg_namespace n
        ON n.oid = c.relnamespace
      JOIN pg_catalog.pg_type t
        ON t.oid = a.atttypid
      WHERE n.nspname = $1
        AND c.relname = $2
        AND c.relkind IN ('r', 'p', 'v', 'm')
        AND a.attnum > 0
        AND NOT a.attisdropped
      ORDER BY a.attnum
    `,
    [schemaName, tableName],
  );

  return fallbackResult.rows;
}

async function getPrimaryKeyColumns(pool, tableName, schemaName = "public") {
  const result = await pool.query(
    `
      SELECT kcu.column_name AS "columnName"
      FROM information_schema.table_constraints tc
      JOIN information_schema.key_column_usage kcu
        ON kcu.constraint_name = tc.constraint_name
       AND kcu.constraint_schema = tc.constraint_schema
       AND kcu.table_schema = tc.table_schema
       AND kcu.table_name = tc.table_name
      WHERE tc.constraint_type = 'PRIMARY KEY'
        AND tc.table_schema = $1
        AND tc.table_name = $2
      ORDER BY kcu.ordinal_position
    `,
    [schemaName, tableName],
  );

  return result.rows.map((row) => row.columnName);
}

async function getEnumValues(pool, schemaName = "public") {
  const result = await pool.query(
    `
      SELECT
        n.nspname AS "enumSchema",
        t.typname AS "enumName",
        e.enumlabel AS "enumValue"
      FROM pg_catalog.pg_type t
      JOIN pg_catalog.pg_enum e
        ON e.enumtypid = t.oid
      JOIN pg_catalog.pg_namespace n
        ON n.oid = t.typnamespace
      WHERE n.nspname = $1
      ORDER BY n.nspname, t.typname, e.enumsortorder
    `,
    [schemaName],
  );

  return result.rows.reduce((enumValuesByType, row) => {
    const key = `${row.enumSchema}.${row.enumName}`;

    if (!enumValuesByType[key]) {
      enumValuesByType[key] = [];
    }

    enumValuesByType[key].push(row.enumValue);

    return enumValuesByType;
  }, {});
}

async function getCrudMetadata(pool, tableName, schemaName = "public") {
  const relation = await getRelation(pool, tableName, schemaName);
  const columnsResult = await pool.query(
    `
      SELECT
        column_name AS "columnName",
        data_type AS "dataType",
        udt_schema AS "udtSchema",
        udt_name AS "udtName",
        is_nullable AS "isNullable",
        column_default AS "columnDefault",
        is_identity AS "isIdentity",
        is_generated AS "isGenerated",
        character_maximum_length AS "characterMaximumLength",
        numeric_precision AS "numericPrecision",
        numeric_scale AS "numericScale"
      FROM information_schema.columns
      WHERE table_schema = $1
        AND table_name = $2
      ORDER BY ordinal_position
    `,
    [schemaName, tableName],
  );
  const baseColumns =
    columnsResult.rows.length > 0
      ? columnsResult.rows
      : await listColumns(pool, tableName, schemaName);
  const primaryKeyColumns = await getPrimaryKeyColumns(pool, tableName, schemaName);
  const enumValuesByType = await getEnumValues(pool, schemaName);
  const isWritableRelation = relation.relationType === "table";
  const columns = baseColumns.map((column) => {
    const isPrimaryKey = primaryKeyColumns.includes(column.columnName);
    const isGenerated = column.isGenerated === "ALWAYS";
    const isIdentity = column.isIdentity === "YES";
    const hasDefault = Boolean(column.columnDefault) || isIdentity;
    const isWritable =
      isWritableRelation && !isGenerated && !isIdentity && !isPrimaryKey;
    const enumValues =
      enumValuesByType[`${column.udtSchema || schemaName}.${column.udtName}`] ||
      [];

    return {
      ...column,
      isNullable: column.isNullable === "YES",
      isIdentity,
      isGenerated,
      hasDefault,
      isPrimaryKey,
      isWritable,
      isEnum: enumValues.length > 0,
      enumValues,
    };
  });

  return {
    schemaName,
    tableName,
    relationType: relation.relationType,
    isView: relation.isView,
    isWritable: isWritableRelation,
    canCreate: isWritableRelation && columns.some((column) => column.isWritable),
    canUpdate:
      isWritableRelation &&
      primaryKeyColumns.length > 0 &&
      columns.some((column) => column.isWritable),
    canDelete: isWritableRelation && primaryKeyColumns.length > 0,
    primaryKeyColumns,
    columns,
  };
}

async function getTableWhitelist(pool, tableName, schemaName = "public") {
  const tables = await listTables(pool, schemaName);

  if (!tables.includes(tableName)) {
    throw new BadRequestError("Invalid tableName.");
  }

  const columns = await listColumns(pool, tableName, schemaName);
  const columnNames = columns.map((column) => column.columnName);

  return {
    schemaName,
    tableName,
    columns,
    columnNames,
  };
}

async function getDatabaseHealth(pool, schemaName = "public") {
  const databaseResult = await pool.query(`
    SELECT current_database() AS "databaseName", current_user AS "userName"
  `);
  const schemaResult = await pool.query(
    `
      SELECT schema_name AS "schemaName"
      FROM information_schema.schemata
      WHERE schema_name NOT LIKE 'pg_%'
        AND schema_name <> 'information_schema'
      ORDER BY schema_name
    `,
  );
  const tables = await listTables(pool, schemaName);

  return {
    ...databaseResult.rows[0],
    schemaName,
    availableSchemas: schemaResult.rows.map((row) => row.schemaName),
    tableCount: tables.length,
  };
}

async function listColumnValues(
  pool,
  tableName,
  columnName,
  schemaName = "public",
  limit = 50,
) {
  const whitelist = await getTableWhitelist(pool, tableName, schemaName);

  if (!whitelist.columnNames.includes(columnName)) {
    throw new BadRequestError("Invalid columnName.");
  }

  const safeLimit = Number.parseInt(limit, 10);

  if (!Number.isInteger(safeLimit) || safeLimit < 1 || safeLimit > 100) {
    throw new BadRequestError("limit must be an integer between 1 and 100.");
  }

  const result = await pool.query(
    `
      SELECT DISTINCT ${quoteIdentifier(columnName)}::text AS value
      FROM ${quoteQualifiedTableName(tableName, schemaName)}
      WHERE ${quoteIdentifier(columnName)} IS NOT NULL
      ORDER BY value
      LIMIT $1
    `,
    [safeLimit + 1],
  );
  const values = result.rows.map((row) => row.value);

  return {
    values: values.slice(0, safeLimit),
    hasMore: values.length > safeLimit,
  };
}

async function listFunctions(pool, schemaName = "public") {
  const result = await pool.query(
    `
      SELECT
        routine_name AS "routineName",
        data_type AS "returnType"
      FROM information_schema.routines
      WHERE routine_schema = $1
        AND routine_type = 'FUNCTION'
      ORDER BY routine_name
    `,
    [schemaName],
  );

  return result.rows;
}

async function listFunctionParameters(pool, functionName, schemaName = "public") {
  const functions = await listFunctions(pool, schemaName);

  if (!functions.some((routine) => routine.routineName === functionName)) {
    throw new BadRequestError("Invalid functionName.");
  }

  const result = await pool.query(
    `
      SELECT
        p.parameter_name AS "parameterName",
        p.data_type AS "dataType",
        p.parameter_mode AS "parameterMode",
        p.ordinal_position AS "ordinalPosition"
      FROM information_schema.routines r
      JOIN information_schema.parameters p
        ON r.specific_name = p.specific_name
       AND r.specific_schema = p.specific_schema
      WHERE r.routine_schema = $1
        AND r.routine_name = $2
      ORDER BY p.ordinal_position
    `,
    [schemaName, functionName],
  );

  return result.rows.filter(
    (parameter) =>
      parameter.ordinalPosition > 0 &&
      (parameter.parameterMode === "IN" ||
        parameter.parameterMode === "INOUT" ||
        parameter.parameterMode === null),
  );
}

module.exports = {
  listTables,
  listRelations,
  listColumns,
  listColumnValues,
  listFunctions,
  listFunctionParameters,
  getCrudMetadata,
  getTableWhitelist,
  getDatabaseHealth,
};
