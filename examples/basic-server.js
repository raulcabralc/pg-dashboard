"use strict";

require("dotenv").config({ override: true });
const express = require("express");
const { pgDashboard } = require("../backend");

const app = express();
const port = process.env.PORT || 3000;
const schemaName = process.env.PG_DASHBOARD_SCHEMA || "public";

if (!process.env.DATABASE_URL) {
  throw new Error(
    "DATABASE_URL is required. Add it to .env or set it before running npm run example.",
  );
}

app.get("/", (req, res) => {
  res.send('<a href="/admin/db">Open PG Dashboard</a>');
});

app.use(
  "/admin/db",
  pgDashboard({
    connectionString: process.env.DATABASE_URL,
    schemaName,
    enableCrud: false,
  }),
);

app.listen(port, () => {
  console.log(`Example app running at http://localhost:${port}`);
  console.log(`Dashboard available at http://localhost:${port}/admin/db`);
  console.log(`Dashboard schema: ${schemaName}`);
});
