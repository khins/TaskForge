describe("TaskForge dashboard", () => {
  beforeEach(function () {
    const email = Cypress.env("EMAIL");
    const password = Cypress.env("PASSWORD");

    if (!email || !password) {
      cy.log("Set CYPRESS_EMAIL and CYPRESS_PASSWORD to run the dashboard test.");
      this.skip();
    }

    cy.clearLocalStorage();
    cy.visit("/");
    cy.intercept("POST", "**/api/auth/login").as("login");
    cy.intercept("GET", "**/api/Dashboard").as("loadDashboard");
    cy.get("#email").type(email);
    cy.get("#password").type(password, { log: false });
    cy.get("#authForm").submit();
    cy.wait("@login").its("response.statusCode").should("eq", 200);
  });

  it("logs in and displays the dashboard", () => {
    cy.wait("@loadDashboard").then(({ response }) => {
      expect(response.statusCode).to.eq(200);
      expect(response.body.projectCount).to.be.a("number");
      expect(response.body.taskCount).to.be.a("number");
      expect(response.body.assignedToMeCount).to.be.a("number");
      expect(response.body.overdueCount).to.be.a("number");
      expect(response.body.dueSoonCount).to.be.a("number");

      cy.get("#dashboardProjectCount").should("have.text", String(response.body.projectCount));
      cy.get("#dashboardTaskCount").should("have.text", String(response.body.taskCount));
      cy.get("#dashboardAssignedCount").should("have.text", String(response.body.assignedToMeCount));
      cy.get("#dashboardOverdueCount").should("have.text", String(response.body.overdueCount));
      cy.get("#dashboardDueSoonCount").should("have.text", String(response.body.dueSoonCount));
    });

    cy.get("#appView").should("be.visible");
    cy.get("#dashboardView").should("be.visible");
    cy.get("#pageTitle").should("have.text", "Dashboard");
    cy.get("#statusBreakdown").children().should("have.length.greaterThan", 0);
    cy.get("#priorityBreakdown").children().should("have.length.greaterThan", 0);
    cy.get("#recentTasks").children().should("have.length.greaterThan", 0);
    cy.get("#overdueTasks").children().should("have.length.greaterThan", 0);
  });
});
