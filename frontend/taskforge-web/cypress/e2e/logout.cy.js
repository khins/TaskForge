describe("TaskForge logout", () => {
  beforeEach(function () {
    const email = Cypress.env("EMAIL");
    const password = Cypress.env("PASSWORD");

    if (!email || !password) {
      cy.log("Set CYPRESS_EMAIL and CYPRESS_PASSWORD to run the logout test.");
      this.skip();
    }

    cy.clearLocalStorage();
    cy.visit("/");
    cy.intercept("POST", "**/api/auth/login").as("login");
    cy.get("#email").type(email);
    cy.get("#password").type(password, { log: false });
    cy.get("#authForm").submit();
    cy.wait("@login").its("response.statusCode").should("eq", 200);
    cy.get("#appView").should("be.visible");
  });

  it("signs out and clears the local session", () => {
    cy.window().then(win => {
      expect(win.localStorage.getItem("taskforge_token")).to.be.a("string").and.not.be.empty;
      expect(win.localStorage.getItem("taskforge_user")).to.be.a("string").and.not.be.empty;
    });

    cy.get("#logoutButton")
      .should("be.visible")
      .and("contain", "Sign out")
      .click();

    cy.get("#appView").should("not.be.visible");
    cy.get("#authView").should("be.visible");
    cy.get("#authTitle").should("contain", "Sign in");
    cy.get("#toast").should("contain", "signed out");

    cy.window().then(win => {
      expect(win.localStorage.getItem("taskforge_token")).to.eq(null);
      expect(win.localStorage.getItem("taskforge_user")).to.eq(null);
    });
  });
});
