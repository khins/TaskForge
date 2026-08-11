describe("TaskForge task editing", () => {
  const apiUrl = "http://127.0.0.1:5010";
  let projectId = null;
  let projectName;
  let boardId = null;
  let boardName;
  let taskId = null;
  let originalTitle;

  beforeEach(function () {
    const email = Cypress.env("EMAIL");
    const password = Cypress.env("PASSWORD");

    if (!email || !password) {
      cy.log("Set CYPRESS_EMAIL and CYPRESS_PASSWORD to run task editing tests.");
      this.skip();
    }

    projectId = null;
    boardId = null;
    taskId = null;
    const timestamp = Date.now();
    projectName = `Cypress edit project ${timestamp}`;
    boardName = `Cypress edit board ${timestamp}`;
    originalTitle = `Cypress original task ${timestamp}`;

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
        body: { name: projectName, description: "Temporary project for task editing." }
      }).then(projectResponse => {
        expect(projectResponse.status).to.eq(201);
        projectId = projectResponse.body.id;

        cy.request({
          method: "POST",
          url: `${apiUrl}/api/projects/${projectId}/boards`,
          headers,
          body: { name: boardName, description: "Temporary board for task editing.", createDefaultColumns: true }
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
                title: originalTitle,
                description: "Original task description.",
                status: "Todo",
                priority: "Low",
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

  it("edits an existing task", () => {
    const updatedTitle = `Cypress updated task ${Date.now()}`;
    const updatedDescription = "Updated by the focused Cypress task editing test.";
    const today = new Date();
    const dueDate = [
      today.getFullYear(),
      String(today.getMonth() + 1).padStart(2, "0"),
      String(today.getDate()).padStart(2, "0")
    ].join("-");
    const displayedDueDate = new Date(`${dueDate}T12:00:00`).toLocaleDateString();

    cy.reload();
    cy.get("#appView").should("be.visible");
    cy.get('.nav-item[data-view="projects"]').click();
    cy.get("#projectsGrid").contains(".project-card h3", projectName)
      .parents(".project-card").find("[data-project]").click({ force: true });
    cy.get("#boardsGrid").contains(".board-card h3", boardName)
      .parents(".board-card").find("[data-board]").click({ force: true });

    cy.get("#kanban").contains(".task-card", originalTitle).click();
    cy.get("#entityDialog").should("be.visible");
    cy.get('input[name="title"]').should("have.value", originalTitle).clear().type(updatedTitle);
    cy.get('textarea[name="description"]').clear().type(updatedDescription);
    cy.get('select[name="priority"]').select("High");
    cy.get('input[name="dueDate"]').clear().type(dueDate);

    cy.intercept("PUT", `**/api/tasks/${taskId}`).as("updateTask");
    cy.get("#dialogSubmit").should("have.text", "Save changes").click();

    cy.wait("@updateTask").then(({ request, response }) => {
      expect(request.body.title).to.eq(updatedTitle);
      expect(request.body.description).to.eq(updatedDescription);
      expect(request.body.priority).to.eq("High");
      expect(request.body.dueDate).to.include(dueDate);
      expect(response.statusCode).to.eq(200);
      expect(response.body.id).to.eq(taskId);
      expect(response.body.title).to.eq(updatedTitle);
      expect(response.body.priority).to.eq("High");
    });

    cy.get("#entityDialog").should("not.be.visible");
    cy.get("#toast").should("contain", "Task updated");
    cy.get("#kanban").contains(".task-card", originalTitle).should("not.exist");
    cy.get("#kanban").contains(".task-card", updatedTitle)
      .should("be.visible")
      .and("contain", updatedDescription)
      .within(() => {
        cy.get(".priority.high").should("have.text", "High");
        cy.get(".task-meta").should("contain", `Due ${displayedDueDate}`);
      });
  });
});
