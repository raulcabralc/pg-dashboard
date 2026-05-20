"use strict";

const { createDashboardRouter } = require("./src/router");

/**
 * @param {import('./index').PgDashboardConfig} [config]
 * @returns {import('express').Router}
 */
function pgDashboard(config = {}) {
  return createDashboardRouter(config);
}

module.exports = {
  pgDashboard,
  createDashboardRouter,
};
