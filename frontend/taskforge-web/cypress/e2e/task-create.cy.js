describe("TaskForge task creation", () => {
  const apiUrl = "http://127.0.0.1:5010";
  let projectId = null;
  let projectName;
  let boardId = null;
  let boardName;
  let taskId = null;

  beforeEach(function () {
    const email = Cypress.env("EMAIL");
    const password = Cypress.env("PASSWORD");

    if (!email || !password) {
      cy.log("Set CYPRESS_EMAIL and CYPRESS_PASSWORD to run task creation tests.");
      this.skip();
    }

    projectId = null;
    boardId = null;
    taskId = null;
    projectName = `Cypress task project ${Date.now()}`;
    boardName = `Cypress task board ${Date.now()}`;

    cy.clearLocalStorage();
    cy.visit("/");
    cy.intercept("POST", "**/api/auth/login").as("login");
    cy.get("#email").type(email);
    cy.get("#password").type(password, { log: false });
    cy.get("#authForm").submit();
    cy.wait("@login").its("response.statusCode").should("eq", 200);

    cy.window().then(win => {
      const token = win.localStorage.getItem("taskforge_token");
      expect(token).to.be.a("string").and.not.be.empty;
      const headers = { Authorization: `Bearer ${token}` };

      cy.request({
        method: "POST",
        url: `${apiUrl}/api/projects`,
        headers,
        body: {
          name: projectName,
          description: "Temporary project for the focused task creation test."
        }
      }).then(projectResponse => {
        expect(projectResponse.status).to.eq(201);
        projectId = projectResponse.body.id;

        cy.request({
          method: "POST",
          url: `${apiUrl}/api/projects/${projectId}/boards`,
          headers,
          body: {
            name: boardName,
            description: "Temporary board for the focused task creation test.",
            createDefaultColumns: true
          }
        }).then(boardResponse => {
          expect(boardResponse.status).to.eq(201);
          expect(boardResponse.body.columnCount).to.eq(3);
          boardId = boardResponse.body.id;
        });
      });
    });
  });

  afterEach(() => {
    if (!projectId) return;

    cy.window().then(win => {
      const token = win.localStorage.getItem("taskforge_token");
      if (!token) return;
      const headers = { Authorization: `Bearer ${token}` };
      const deleteProject = () => cy.request({
        method: "DELETE",
        url: `${apiUrl}/api/projects/${projectId}`,
        headers,
        failOnStatusCode: false
      }).then(response => {
        expect([204, 404]).to.include(response.status);
      });

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
  });

  it("creates a task in the Todo column", () => {
    const taskTitle = `Cypress task ${Date.now()}`;
    const taskDescription = "Created by the focused Cypress task creation test.";

    cy.reload();
    cy.get("#appView").should("be.visible");
    cy.get('.nav-item[data-view="projects"]').click();
    cy.get("#projectsGrid")
      .contains(".project-card h3", projectName)
      .parents(".project-card")
      .find("[data-project]")
      .click({ force: true });

    cy.get("#boardsGrid")
      .contains(".board-card h3", boardName)
      .parents(".board-card")
      .find("[data-board]")
      .click({ force: true });

    cy.get("#boardView").should("be.visible");
    cy.get("#newTaskButton").click();
    cy.get("#entityDialog").should("be.visible");
    cy.get('input[name="title"]').type(taskTitle);
    cy.get('textarea[name="description"]').type(taskDescription);
    cy.get('select[name="boardColumnId"] option:selected').should("have.text", "Todo");
    cy.get('select[name="priority"]').select("Medium");

    cy.intercept("POST", "**/api/projects/*/tasks").as("createTask");
    cy.get("#dialogSubmit").should("have.text", "Add task").click();

    cy.wait("@createTask").then(({ request, response }) => {
      expect(request.body.title).to.eq(taskTitle);
      expect(request.body.description).to.eq(taskDescription);
      expect(request.body.status).to.eq("Todo");
      expect(request.body.priority).to.eq("Medium");
      expect(response.statusCode).to.eq(201);
      expect(response.body.projectId).to.eq(projectId);
      expect(response.body.boardColumnId).to.be.a("number");
      expect(response.body.parentTaskId).to.eq(null);
      expect(response.body.status).to.eq("Todo");
      taskId = response.body.id;
    });

    cy.get("#entityDialog").should("not.be.visible");
    cy.get("#toast").should("contain", "Task added");
    cy.contains(".kanban-column .column-head h3", "Todo")
      .parents(".kanban-column")
      .within(() => {
        cy.contains(".task-card", taskTitle)
          .should("be.visible")
          .and("contain", taskDescription)
          .within(() => {
            cy.get(".priority.medium").should("have.text", "Medium");
          });
      });
  });
});
