describe("TaskForge smoke test", () => {
  const apiUrl = "http://127.0.0.1:5010";
  let sessionToken = null;
  let projectId = null;
  let projectName;
  let boardName;
  let taskId = null;

  beforeEach(function () {
    if (!Cypress.env("EMAIL") || !Cypress.env("PASSWORD")) {
      cy.log("Set CYPRESS_EMAIL and CYPRESS_PASSWORD to run the smoke test.");
      this.skip();
    }

    sessionToken = null;
    projectId = null;
    taskId = null;
    const timestamp = Date.now();
    projectName = `Cypress smoke project ${timestamp}`;
    boardName = `Cypress smoke board ${timestamp}`;
    cy.clearLocalStorage();
  });

  afterEach(() => {
    if (!sessionToken || !projectId) return;
    const headers = { Authorization: `Bearer ${sessionToken}` };
    const deleteProject = () => cy.request({
      method: "DELETE",
      url: `${apiUrl}/api/projects/${projectId}`,
      headers,
      failOnStatusCode: false
    }).then(response => expect([204, 404]).to.include(response.status));

    if (!taskId) return deleteProject();
    return cy.request({
      method: "DELETE",
      url: `${apiUrl}/api/tasks/${taskId}`,
      headers,
      failOnStatusCode: false
    }).then(response => {
      expect([204, 404]).to.include(response.status);
      return deleteProject();
    });
  });

  it("loads, logs in, shows the dashboard, creates a task, and logs out", () => {
    const email = Cypress.env("EMAIL");
    const password = Cypress.env("PASSWORD");
    const taskTitle = `Cypress smoke task ${Date.now()}`;

    // Website loads.
    cy.visit("/");
    cy.get("#authView").should("be.visible");
    cy.get("#authTitle").should("contain", "Sign in");
    cy.get("#apiStatus", { timeout: 10000 }).should("contain", "Local API connected");

    // User can log in.
    cy.intercept("POST", "**/api/auth/login").as("login");
    cy.intercept("GET", "**/api/Dashboard").as("loadDashboard");
    cy.get("#email").type(email);
    cy.get("#password").type(password, { log: false });
    cy.get("#authForm").submit();
    cy.wait("@login").then(({ response }) => {
      expect(response.statusCode).to.eq(200);
      expect(response.body.token).to.be.a("string").and.not.be.empty;
      sessionToken = response.body.token;
    });

    // Dashboard appears.
    cy.wait("@loadDashboard").its("response.statusCode").should("eq", 200);
    cy.get("#appView").should("be.visible");
    cy.get("#dashboardView").should("be.visible");
    cy.get("#pageTitle").should("have.text", "Dashboard");
    cy.get("#dashboardProjectCount").should("not.have.text", "—");

    // Provision an isolated project and board for task creation.
    cy.then(() => {
      const headers = { Authorization: `Bearer ${sessionToken}` };
      cy.request({
        method: "POST",
        url: `${apiUrl}/api/projects`,
        headers,
        body: { name: projectName, description: "Temporary project for the smoke test." }
      }).then(projectResponse => {
        expect(projectResponse.status).to.eq(201);
        projectId = projectResponse.body.id;

        cy.request({
          method: "POST",
          url: `${apiUrl}/api/projects/${projectId}/boards`,
          headers,
          body: { name: boardName, description: "Temporary board for the smoke test.", createDefaultColumns: true }
        }).then(boardResponse => {
          expect(boardResponse.status).to.eq(201);
          expect(boardResponse.body.columnCount).to.eq(3);
        });
      });
    });

    // User can create a task.
    cy.reload();
    cy.get("#appView").should("be.visible");
    cy.get('.nav-item[data-view="projects"]').click();
    cy.get("#projectsGrid").contains(".project-card h3", projectName)
      .parents(".project-card").find("[data-project]").click({ force: true });
    cy.get("#boardsGrid").contains(".board-card h3", boardName)
      .parents(".board-card").find("[data-board]").click({ force: true });
    cy.get("#newTaskButton").click();
    cy.get('input[name="title"]').type(taskTitle);
    cy.get('textarea[name="description"]').type("Created by the TaskForge smoke test.");
    cy.intercept("POST", "**/api/projects/*/tasks").as("createTask");
    cy.get("#dialogSubmit").click();
    cy.wait("@createTask").then(({ response }) => {
      expect(response.statusCode).to.eq(201);
      expect(response.body.title).to.eq(taskTitle);
      taskId = response.body.id;
    });
    cy.get("#kanban").contains(".task-card", taskTitle).should("be.visible");

    // User can log out.
    cy.get("#logoutButton").should("be.visible").click();
    cy.get("#appView").should("not.be.visible");
    cy.get("#authView").should("be.visible");
    cy.get("#toast").should("contain", "signed out");
    cy.window().then(win => {
      expect(win.localStorage.getItem("taskforge_token")).to.eq(null);
      expect(win.localStorage.getItem("taskforge_user")).to.eq(null);
    });
  });
});
