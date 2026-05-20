"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");
const {
  getCrudMetadata,
  listRelations,
  listTables,
} = require("../backend/src/metadata");

test("listRelations includes tables, views and materialized views", async () => {
  const pool = {
    query: async (sql, values) => {
      assert.match(sql, /pg_catalog\.pg_class/);
      assert.match(sql, /'m'/);
      assert.deepEqual(values, ["public"]);

      return {
        rows: [
          { tableName: "clientes", relationType: "table" },
          { tableName: "clientesResumo", relationType: "view" },
          { tableName: "clientesRank", relationType: "materializedView" },
        ],
      };
    },
  };

  assert.deepEqual(await listRelations(pool), [
    { tableName: "clientes", relationType: "table", isView: false },
    { tableName: "clientesResumo", relationType: "view", isView: true },
    {
      tableName: "clientesRank",
      relationType: "materializedView",
      isView: true,
    },
  ]);
});

test("listTables keeps returning only relation names", async () => {
  const pool = {
    query: async () => ({
      rows: [
        { tableName: "pets", relationType: "table" },
        { tableName: "petsPorTutor", relationType: "view" },
        { tableName: "petsResumo", relationType: "materializedView" },
      ],
    }),
  };

  assert.deepEqual(await listTables(pool), [
    "pets",
    "petsPorTutor",
    "petsResumo",
  ]);
});

test("getCrudMetadata maps postgres enum values", async () => {
  const pool = {
    query: async (sql) => {
      if (sql.includes("FROM pg_catalog.pg_class")) {
        return {
          rows: [{ tableName: "pets", relationType: "table" }],
        };
      }

      if (sql.includes("FROM information_schema.columns")) {
        return {
          rows: [
            {
              columnName: "status",
              dataType: "USER-DEFINED",
              udtSchema: "public",
              udtName: "pet_status",
              isNullable: "NO",
              columnDefault: null,
              isIdentity: "NO",
              isGenerated: "NEVER",
            },
          ],
        };
      }

      if (sql.includes("FROM information_schema.table_constraints")) {
        return { rows: [] };
      }

      if (sql.includes("FROM pg_catalog.pg_type")) {
        return {
          rows: [
            {
              enumSchema: "public",
              enumName: "pet_status",
              enumValue: "ativo",
            },
            {
              enumSchema: "public",
              enumName: "pet_status",
              enumValue: "inativo",
            },
          ],
        };
      }

      throw new Error(`Unexpected query: ${sql}`);
    },
  };

  const metadata = await getCrudMetadata(pool, "pets");

  assert.equal(metadata.columns[0].isEnum, true);
  assert.deepEqual(metadata.columns[0].enumValues, ["ativo", "inativo"]);
});
