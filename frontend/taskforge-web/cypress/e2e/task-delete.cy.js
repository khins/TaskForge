describe("TaskForge task deletion", () => {
  const apiUrl = "http://127.0.0.1:5010";
  let projectId = null;
  let projectName;
  let boardName;
  let taskId = null;
  let taskTitle;

  beforeEach(function () {
    const email = Cypress.env("EMAIL");
    const password = Cypress.env("PASSWORD");

    if (!email || !password) {
      cy.log("Set CYPRESS_EMAIL and CYPRESS_PASSWORD to run task deletion tests.");
      this.skip();
    }

    projectId = null;
    taskId = null;
    const timestamp = Date.now();
    projectName = `Cypress delete project ${timestamp}`;
    boardName = `Cypress delete board ${timestamp}`;
    taskTitle = `Cypress deletable task ${timestamp}`;

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
        body: { name: projectName, description: "Temporary project for task deletion." }
      }).then(projectResponse => {
        expect(projectResponse.status).to.eq(201);
        projectId = projectResponse.body.id;

        cy.request({
          method: "POST",
          url: `${apiUrl}/api/projects/${projectId}/boards`,
          headers,
          body: { name: boardName, description: "Temporary board for task deletion.", createDefaultColumns: true }
        }).then(boardResponse => {
          expect(boardResponse.status).to.eq(201);

          cy.request({
            method: "GET",
            url: `${apiUrl}/api/boards/${boardResponse.body.id}`,
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
                description: "Task created for the focused deletion test.",
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

  it("deletes an existing task after confirmation", () => {
    cy.reload();
    cy.get("#appView").should("be.visible");
    cy.get('.nav-item[data-view="projects"]').click();
    cy.get("#projectsGrid").contains(".project-card h3", projectName)
      .parents(".project-card").find("[data-project]").click({ force: true });
    cy.get("#boardsGrid").contains(".board-card h3", boardName)
      .parents(".board-card").find("[data-board]").click({ force: true });

    cy.get("#kanban").contains(".task-card", taskTitle).should("be.visible").click();
    cy.get("#entityDialog").should("be.visible");
    cy.get("#deleteTaskButton")
      .scrollIntoView()
      .should("be.visible")
      .and("be.enabled");

    cy.on("window:confirm", message => {
      expect(message).to.contain(taskTitle);
      expect(message).to.contain("permanently deletes the task");
      return true;
    });

    cy.intercept("DELETE", `**/api/tasks/${taskId}`).as("deleteTask");
    cy.get("#deleteTaskButton").scrollIntoView().click();

    cy.wait("@deleteTask").its("response.statusCode").should("eq", 204);
    cy.get("#entityDialog").should("not.be.visible");
    cy.get("#toast").should("contain", `"${taskTitle}" was deleted`);
    cy.get("#kanban").contains(".task-card", taskTitle).should("not.exist");
  });
});
