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

  it("opens the first project and board", () => {
    cy.get('.nav-item[data-view="projects"]').click();

    cy.get("#projectsGrid .project-card")
      .first()
      .find("[data-project]")
      .click({ force: true });

    cy.get("#projectView").should("be.visible");

    cy.get("#boardsGrid .board-card")
      .first()
      .find("[data-board]")
      .click({ force: true });

    cy.get("#boardView").should("be.visible");
    cy.get("#kanban").should("be.visible");
  });

  it("creates a task and saves it to the board", () => {
    const taskTitle = `Cypress task ${Date.now()}`;

    cy.get('.nav-item[data-view="projects"]').click();
    cy.get("#projectsGrid .project-card")
      .first()
      .find("[data-project]")
      .click({ force: true });

    cy.get("#boardsGrid .board-card")
      .first()
      .find("[data-board]")
      .click({ force: true });

    cy.get("#boardView").should("be.visible");
    cy.get("#newTaskButton").click();
    cy.get("#entityDialog").should("be.visible");

    cy.get('input[name="title"]').type(taskTitle);
    cy.get('textarea[name="description"]').type("Created by the Cypress end-to-end test.");
    cy.get('select[name="priority"]').select("Medium");

    cy.intercept("POST", "**/api/projects/*/tasks").as("createTask");
    cy.get("#dialogSubmit").click();

    cy.wait("@createTask").its("response.statusCode").should("eq", 201);
    cy.get("#entityDialog").should("not.be.visible");
    cy.get("#toast").should("contain", "Task added");
    cy.get("#kanban").contains(".task-card", taskTitle).should("be.visible");
  });

  it("moves a newly created task to In Progress", () => {
    const taskTitle = `Cypress move task ${Date.now()}`;

    cy.get('.nav-item[data-view="projects"]').click();
    cy.get("#projectsGrid .project-card")
      .first()
      .find("[data-project]")
      .click({ force: true });

    cy.get("#boardsGrid .board-card")
      .first()
      .find("[data-board]")
      .click({ force: true });

    cy.get("#newTaskButton").click();
    cy.get('input[name="title"]').type(taskTitle);
    cy.get('textarea[name="description"]').type("Created and moved by Cypress.");

    cy.intercept("POST", "**/api/projects/*/tasks").as("createMovableTask");
    cy.get("#dialogSubmit").click();
    cy.wait("@createMovableTask").its("response.statusCode").should("eq", 201);

    cy.get("#kanban").contains(".task-card", taskTitle).click();
    cy.get("#entityDialog").should("be.visible");
    cy.get("#deleteTaskButton").should("be.enabled").and("have.text", "Delete task");
    cy.get('select[name="boardColumnId"]').select("In Progress");

    cy.intercept("PUT", "**/api/tasks/*").as("moveTask");
    cy.get("#dialogSubmit").click();
    cy.wait("@moveTask").its("response.statusCode").should("eq", 200);

    cy.get("#toast").should("contain", "Task updated");
    cy.contains(".kanban-column .column-head h3", "In Progress")
      .parents(".kanban-column")
      .within(() => {
        cy.contains(".task-card", taskTitle).should("be.visible");
      });
  });

  it("deletes a newly created task from the board", () => {
    const taskTitle = `Cypress delete task ${Date.now()}`;

    cy.get('.nav-item[data-view="projects"]').click();
    cy.get("#projectsGrid .project-card")
      .first()
      .find("[data-project]")
      .click({ force: true });

    cy.get("#boardsGrid .board-card")
      .first()
      .find("[data-board]")
      .click({ force: true });

    cy.get("#newTaskButton").click();
    cy.get('input[name="title"]').type(taskTitle);
    cy.get('textarea[name="description"]').type("Created for the Cypress deletion test.");

    cy.intercept("POST", "**/api/projects/*/tasks").as("createDeletableTask");
    cy.get("#dialogSubmit").click();
    cy.wait("@createDeletableTask").its("response.statusCode").should("eq", 201);

    cy.get("#kanban").contains(".task-card", taskTitle).click();
    cy.get("#entityDialog").should("be.visible");
    cy.get("#deleteTaskButton").should("be.enabled").and("have.text", "Delete task");

    cy.on("window:confirm", message => {
      expect(message).to.contain(taskTitle);
      return true;
    });
    cy.intercept("DELETE", "**/api/tasks/*").as("deleteTask");
    cy.get("#deleteTaskButton").click();

    cy.wait("@deleteTask").its("response.statusCode").should("eq", 204);
    cy.get("#entityDialog").should("not.be.visible");
    cy.get("#toast").should("contain", `"${taskTitle}" was deleted`);
    cy.get("#kanban").contains(".task-card", taskTitle).should("not.exist");
  });
});
