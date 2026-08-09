describe("TaskForge login", () => {
  beforeEach(() => {
    cy.clearLocalStorage();
    cy.visit("/");
  });

  it("logs in and opens the dashboard", function () {
    const email = Cypress.env("EMAIL");
    const password = Cypress.env("PASSWORD");

    if (!email || !password) {
      cy.log("Set CYPRESS_EMAIL and CYPRESS_PASSWORD to run the login test.");
      this.skip();
    }

    cy.get("#authView").should("be.visible");
    cy.get("#authTitle").should("contain", "Sign in");

    cy.intercept("POST", "**/api/auth/login").as("login");
    cy.get("#email").type(email);
    cy.get("#password").type(password, { log: false });
    cy.get("#authForm").submit();

    cy.wait("@login").then(({ request, response }) => {
      expect(request.body.email).to.eq(email);
      expect(response.statusCode).to.eq(200);
      expect(response.body.token).to.be.a("string").and.not.be.empty;
    });

    cy.get("#authView").should("not.be.visible");
    cy.get("#appView").should("be.visible");
    cy.get("#pageTitle").should("have.text", "Dashboard");
    cy.get("#dashboardProjectCount").should("not.have.text", "—");
  });
});
