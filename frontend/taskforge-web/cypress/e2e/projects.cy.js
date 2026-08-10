describe("TaskForge projects", () => {
  let createdProjectId = null;

  beforeEach(function () {
    const email = Cypress.env("EMAIL");
    const password = Cypress.env("PASSWORD");

    if (!email || !password) {
      cy.log("Set CYPRESS_EMAIL and CYPRESS_PASSWORD to run project tests.");
      this.skip();
    }

    createdProjectId = null;
    cy.clearLocalStorage();
    cy.visit("/");
    cy.intercept("POST", "**/api/auth/login").as("login");
    cy.get("#email").type(email);
    cy.get("#password").type(password, { log: false });
    cy.get("#authForm").submit();
    cy.wait("@login").its("response.statusCode").should("eq", 200);
    cy.get("#appView").should("be.visible");
  });

  afterEach(() => {
    if (!createdProjectId) return;

    cy.window().then(win => {
      const token = win.localStorage.getItem("taskforge_token");
      if (!token) return;

      cy.request({
        method: "DELETE",
        url: `http://127.0.0.1:5010/api/projects/${createdProjectId}`,
        headers: { Authorization: `Bearer ${token}` },
        failOnStatusCode: false
      }).then(response => {
        expect([204, 404]).to.include(response.status);
      });
    });
  });

  it("creates a new project", () => {
    const projectName = `Cypress project ${Date.now()}`;
    const projectDescription = "Created by the focused Cypress project test.";

    cy.get('.nav-item[data-view="projects"]').click();
    cy.get("#projectsView").should("be.visible");
    cy.get("#primaryAction")
      .should("be.visible")
      .and("contain", "New project")
      .click();

    cy.get("#entityDialog").should("be.visible");
    cy.get("#dialogTitle").should("have.text", "What are you working on?");
    cy.get('input[name="name"]').type(projectName);
    cy.get('textarea[name="description"]').type(projectDescription);

    cy.intercept("POST", "**/api/projects").as("createProject");
    cy.get("#dialogSubmit").should("have.text", "Create project").click();

    cy.wait("@createProject").then(({ request, response }) => {
      expect(request.body.name).to.eq(projectName);
      expect(request.body.description).to.eq(projectDescription);
      expect(response.statusCode).to.eq(201);
      expect(response.body.name).to.eq(projectName);
      expect(response.body.description).to.eq(projectDescription);
      createdProjectId = response.body.id;
    });

    cy.get("#entityDialog").should("not.be.visible");
    cy.get("#toast").should("contain", "Project created");
    cy.get("#projectsGrid")
      .contains(".project-card h3", projectName)
      .should("be.visible")
      .parents(".project-card")
      .should("contain", projectDescription)
      .and("contain", "0 boards")
      .and("contain", "0 tasks");
  });
});
