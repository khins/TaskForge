describe("TaskForge availability", () => {
  beforeEach(() => cy.clearLocalStorage());

  it("loads the sign-in page and connects to the API", () => {
    cy.visit("/");
    cy.get("#authTitle").should("contain", "Sign in");
    cy.get("#email").should("be.visible");
    cy.get("#password").should("be.visible");
    cy.get("#apiStatus", { timeout: 10000 }).should("contain", "Local API connected");
  });
});

describe("TaskForge authenticated navigation", () => {
  beforeEach(function () {
    const email = Cypress.env("EMAIL");
    const password = Cypress.env("PASSWORD");

    if (!email || !password) {
      cy.log("Set CYPRESS_EMAIL and CYPRESS_PASSWORD to run authenticated tests.");
      this.skip();
    }

    cy.clearLocalStorage();
    cy.visit("/");
    cy.get("#email").type(email);
    cy.get("#password").type(password, { log: false });
    cy.get("#authForm").submit();
    cy.get("#appView", { timeout: 10000 }).should("be.visible");
  });

  it("shows dashboard metrics after signing in", () => {
    cy.get("#pageTitle").should("have.text", "Dashboard");
    cy.get("#dashboardProjectCount").should("not.have.text", "—");
    cy.get("#dashboardTaskCount").should("not.have.text", "—");
    cy.get("#dashboardAssignedCount").should("not.have.text", "—");
  });

  it("navigates from the dashboard to projects", () => {
    cy.get('.nav-item[data-view="projects"]').click();
    cy.get("#pageTitle").should("have.text", "Projects");
    cy.get("#projectsView").should("be.visible");
    cy.get("#projectSearch").should("be.visible");
  });
});
