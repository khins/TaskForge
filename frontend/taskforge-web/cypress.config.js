const { defineConfig } = require("cypress");

module.exports = defineConfig({
  e2e: {
    baseUrl: "http://127.0.0.1:8000",
    specPattern: ["cypress/e2e/**/*.cy.js", "cypress/support/e2e.js"],
    supportFile: false,
    video: false,
    screenshotOnRunFailure: true
  },
  viewportWidth: 1440,
  viewportHeight: 900,
  retries: { runMode: 1, openMode: 0 }
});
