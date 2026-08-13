describe("TaskForge task movement", () => {
  const apiUrl = "http://127.0.0.1:5010";
  let projectId = null;
  let projectName;
  let boardId = null;
  let boardName;
  let taskId = null;
  let taskTitle;

  beforeEach(function () {
    const email = Cypress.env("EMAIL");
    const password = Cypress.env("PASSWORD");

    if (!email || !password) {
      cy.log("Set CYPRESS_EMAIL and CYPRESS_PASSWORD to run task movement tests.");
      this.skip();
    }

    projectId = null;
    boardId = null;
    taskId = null;
    const timestamp = Date.now();
    projectName = `Cypress move project ${timestamp}`;
    boardName = `Cypress move board ${timestamp}`;
    taskTitle = `Cypress movable task ${timestamp}`;

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
        body: { name: projectName, description: "Temporary project for task movement." }
      }).then(projectResponse => {
        expect(projectResponse.status).to.eq(201);
        projectId = projectResponse.body.id;

        cy.request({
          method: "POST",
          url: `${apiUrl}/api/projects/${projectId}/boards`,
          headers,
          body: { name: boardName, description: "Temporary board for task movement.", createDefaultColumns: true }
        }).then(boardResponse => {
          expect(boardResponse.status).to.eq(201);
          boardId = boardResponse.body.id;

          cy.request({
            method: "GET",
            url: `${apiUrl}/api/boards/${boardId}`,
            headers
          }).then(boardDetailResponse => {
            const todoColumn = boardDetailResponse.body.columns.find(column => column.name === "Todo");
            expect(todoColumn, "Todo column fixture").to.exist;

            cy.request({
              method: "POST",
              url: `${apiUrl}/api/projects/${projectId}/tasks`,
              headers,
              body: {
                title: taskTitle,
                description: "Task created for the focused movement test.",
                status: "Todo",
                priority: "Medium",
                boardColumnId: todoColumn.id,
                position: 0
              }
            }).then(taskResponse => {
              expect(taskResponse.status).to.eq(201);
              taskId = taskResponse.body.id;
            });
          });
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
  });

  it("drags a task from Todo to In Progress", () => {
    cy.reload();
    cy.get("#appView").should("be.visible");
    cy.get('.nav-item[data-view="projects"]').click();
    cy.intercept("GET", `**/api/projects/${projectId}`).as("openMoveProject");
    cy.intercept("GET", `**/api/projects/${projectId}/labels`).as("openMoveLabels");
    cy.get("#projectsGrid").contains(".project-card h3", projectName)
      .parents(".project-card").find("[data-project]").click({ force: true });
    cy.wait("@openMoveProject");
    cy.wait("@openMoveLabels");
    cy.intercept("GET", `**/api/boards/${boardId}`).as("openMoveBoard");
    cy.intercept("GET", `**/api/boards/${boardId}/tasks`).as("openMoveBoardTasks");
    cy.window().then(win => {
      expect(win.openBoard).to.be.a("function");
      return win.openBoard(boardId, { historyMode: "replace" });
    });
    cy.wait("@openMoveBoard");
    cy.wait("@openMoveBoardTasks");
    cy.get("#boardView").should("be.visible");
    cy.get("#boardTitle").should("have.text", boardName);

    cy.contains(".kanban-column .column-head h3", "Todo")
      .parents(".kanban-column")
      .within(() => {
        cy.contains(".task-card", taskTitle)
          .should("be.visible")
          .and("have.attr", "draggable", "true");
      });

    cy.intercept("PATCH", `**/api/tasks/${taskId}/move`).as("moveTask");
    cy.window().then(win => {
      const dataTransfer = new win.DataTransfer();

      cy.get("#kanban").contains(".task-card", taskTitle)
        .trigger("dragstart", { dataTransfer });

      cy.contains(".kanban-column .column-head h3", "In Progress")
        .parents(".kanban-column")
        .then($column => {
          const destinationColumnId = Number($column.attr("data-column"));
          cy.wrap($column)
            .trigger("dragover", { dataTransfer })
            .trigger("drop", { dataTransfer });
          cy.get("#kanban").trigger("dragend", { dataTransfer });

          cy.wait("@moveTask").then(({ request, response }) => {
            expect(request.body.boardColumnId).to.eq(destinationColumnId);
            expect(request.body.status).to.eq("In Progress");
            expect(response.statusCode).to.eq(200);
            expect(response.body.id).to.eq(taskId);
            expect(response.body.boardColumnId).to.eq(destinationColumnId);
            expect(response.body.status).to.eq("In Progress");
          });
        });
    });

    cy.get("#toast").should("contain", `"${taskTitle}" moved to In Progress`);
    cy.contains(".kanban-column .column-head h3", "Todo")
      .parents(".kanban-column")
      .within(() => cy.contains(".task-card", taskTitle).should("not.exist"));
    cy.contains(".kanban-column .column-head h3", "In Progress")
      .parents(".kanban-column")
      .within(() => cy.contains(".task-card", taskTitle).should("be.visible"));
  });
});
