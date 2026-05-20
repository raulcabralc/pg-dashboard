"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");
const { listRelations, listTables } = require("../backend/src/metadata");

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
