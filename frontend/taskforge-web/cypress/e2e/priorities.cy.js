describe("TaskForge task priorities", () => {
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
      cy.log("Set CYPRESS_EMAIL and CYPRESS_PASSWORD to run priority tests.");
      this.skip();
    }

    projectId = null;
    taskId = null;
    const timestamp = Date.now();
    projectName = `Cypress priority project ${timestamp}`;
    boardName = `Cypress priority board ${timestamp}`;
    taskTitle = `Cypress priority task ${timestamp}`;

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
        body: { name: projectName, description: "Temporary project for priority testing." }
      }).then(projectResponse => {
        expect(projectResponse.status).to.eq(201);
        projectId = projectResponse.body.id;

        cy.request({
          method: "POST",
          url: `${apiUrl}/api/projects/${projectId}/boards`,
          headers,
          body: { name: boardName, description: "Temporary board for priority testing.", createDefaultColumns: true }
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
                description: "Task created for the focused priority test.",
                status: "Todo",
                priority: "Low",
                boardColumnId: todoColumn.id,
                position: 0
              }
            }).then(taskResponse => {
              expect(taskResponse.status).to.eq(201);
              expect(taskResponse.body.priority).to.eq("Low");
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

  it("changes a task priority from Low to High", () => {
    cy.reload();
    cy.get("#appView").should("be.visible");
    cy.get('.nav-item[data-view="projects"]').click();
    cy.get("#projectsGrid").contains(".project-card h3", projectName)
      .parents(".project-card").find("[data-project]").click({ force: true });
    cy.get("#boardsGrid").contains(".board-card h3", boardName)
      .parents(".board-card").find("[data-board]").click({ force: true });

    cy.get("#kanban").contains(".task-card", taskTitle)
      .should("be.visible")
      .within(() => cy.get(".priority.low").should("have.text", "Low"));
    cy.get("#kanban").contains(".task-card", taskTitle).click();

    cy.get("#entityDialog").should("be.visible");
    cy.get('select[name="priority"]').should("have.value", "Low").select("High");
    cy.intercept("PUT", `**/api/tasks/${taskId}`).as("updatePriority");
    cy.get("#dialogSubmit").click();

    cy.wait("@updatePriority").then(({ request, response }) => {
      expect(request.body.priority).to.eq("High");
      expect(response.statusCode).to.eq(200);
      expect(response.body.id).to.eq(taskId);
      expect(response.body.priority).to.eq("High");
    });

    cy.get("#entityDialog").should("not.be.visible");
    cy.get("#toast").should("contain", "Task updated");
    cy.get("#kanban").contains(".task-card", taskTitle)
      .should("be.visible")
      .within(() => {
        cy.get(".priority.high").should("have.text", "High");
        cy.get(".priority.low").should("not.exist");
      });
  });
});
