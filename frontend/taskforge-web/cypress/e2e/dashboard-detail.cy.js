describe("TaskForge dashboard detail drilldowns", () => {
  beforeEach(function () {
    const email = Cypress.env("EMAIL");
    const password = Cypress.env("PASSWORD");

    if (!email || !password) {
      cy.log("Set CYPRESS_EMAIL and CYPRESS_PASSWORD to run dashboard detail tests.");
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
    cy.wait("@loadDashboard").its("response.statusCode").should("eq", 200);
    cy.get("#dashboardView").should("be.visible");
  });

  it("opens the Projects workspace from the Projects metric", () => {
    cy.get('[data-dashboard-drilldown="projects"]')
      .should("be.visible")
      .click();

    cy.get("#projectsView").should("be.visible");
    cy.get("#pageTitle").should("have.text", "Projects");
    cy.get("#projectsGrid").should("be.visible");
  });

  const taskDrilldowns = [
    { filter: "all", title: "All tasks", metricId: "#dashboardTaskCount" },
    { filter: "assigned", title: "Assigned to me", metricId: "#dashboardAssignedCount" },
    { filter: "overdue", title: "Overdue tasks", metricId: "#dashboardOverdueCount" },
    { filter: "dueSoon", title: "Due this week", metricId: "#dashboardDueSoonCount" }
  ];

  taskDrilldowns.forEach(({ filter, title, metricId }) => {
    it(`opens the ${title} detail`, () => {
      cy.get(metricId).invoke("text").then(metricCount => {
        cy.intercept("GET", `**/api/Dashboard/tasks?filter=${filter}`).as("loadDashboardDetail");
        cy.get(`[data-dashboard-drilldown="${filter}"]`)
          .should("be.visible")
          .click();

        cy.wait("@loadDashboardDetail").then(({ response }) => {
          expect(response.statusCode).to.eq(200);
          expect(response.body).to.be.an("array");
          expect(response.body.length).to.eq(Number(metricCount));

          cy.get("#dashboardDetailDialog").should("be.visible");
          cy.get("#dashboardDetailTitle").should("have.text", title);
          cy.get("#dashboardDetailCount").should("have.text", String(response.body.length));

          if (response.body.length > 0) {
            cy.get("#dashboardDetailTasks .dashboard-task-row")
              .should("have.length", response.body.length);
          } else {
            cy.get("#dashboardDetailTasks .dashboard-empty")
              .should("contain", "No tasks match this metric");
          }
        });

        cy.get("#dashboardDetailDone").click();
        cy.get("#dashboardDetailDialog").should("not.be.visible");
      });
    });
  });
});
