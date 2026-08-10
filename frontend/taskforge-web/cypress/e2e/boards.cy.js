describe("TaskForge boards", () => {
  const apiUrl = "http://127.0.0.1:5010";
  let projectId = null;
  let projectName;

  beforeEach(function () {
    const email = Cypress.env("EMAIL");
    const password = Cypress.env("PASSWORD");

    if (!email || !password) {
      cy.log("Set CYPRESS_EMAIL and CYPRESS_PASSWORD to run board tests.");
      this.skip();
    }

    projectId = null;
    projectName = `Cypress board project ${Date.now()}`;
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

      cy.request({
        method: "POST",
        url: `${apiUrl}/api/projects`,
        headers: { Authorization: `Bearer ${token}` },
        body: {
          name: projectName,
          description: "Temporary project for the focused Cypress board test."
        }
      }).then(response => {
        expect(response.status).to.eq(201);
        projectId = response.body.id;
      });
    });
  });

  afterEach(() => {
    if (!projectId) return;

    cy.window().then(win => {
      const token = win.localStorage.getItem("taskforge_token");
      if (!token) return;

      cy.request({
        method: "DELETE",
        url: `${apiUrl}/api/projects/${projectId}`,
        headers: { Authorization: `Bearer ${token}` },
        failOnStatusCode: false
      }).then(response => {
        expect([204, 404]).to.include(response.status);
      });
    });
  });

  it("creates a board with the default workflow", () => {
    const boardName = `Cypress board ${Date.now()}`;
    const boardDescription = "Created by the focused Cypress board test.";

    cy.reload();
    cy.get("#appView").should("be.visible");
    cy.get('.nav-item[data-view="projects"]').click();
    cy.get("#projectsGrid")
      .contains(".project-card h3", projectName)
      .parents(".project-card")
      .find("[data-project]")
      .click({ force: true });

    cy.get("#projectView").should("be.visible");
    cy.get("#newBoardButton").should("be.visible").click();
    cy.get("#entityDialog").should("be.visible");
    cy.get("#dialogTitle").should("have.text", "Add a workflow");
    cy.get('input[name="name"]').type(boardName);
    cy.get('textarea[name="description"]').type(boardDescription);
    cy.get('select[name="createDefaultColumns"]').select("true");

    cy.intercept("POST", "**/api/projects/*/boards").as("createBoard");
    cy.get("#dialogSubmit").should("have.text", "Create board").click();

    cy.wait("@createBoard").then(({ request, response }) => {
      expect(request.body.name).to.eq(boardName);
      expect(request.body.description).to.eq(boardDescription);
      expect(request.body.createDefaultColumns).to.eq(true);
      expect(response.statusCode).to.eq(201);
      expect(response.body.projectId).to.eq(projectId);
      expect(response.body.name).to.eq(boardName);
      expect(response.body.columnCount).to.eq(3);
    });

    cy.get("#entityDialog").should("not.be.visible");
    cy.get("#toast").should("contain", "Board created");
    cy.get("#boardsGrid")
      .contains(".board-card h3", boardName)
      .should("be.visible")
      .parents(".board-card")
      .should("contain", boardDescription)
      .and("contain", "3 columns")
      .find("[data-board]")
      .click({ force: true });

    cy.get("#boardView").should("be.visible");
    cy.get("#kanban .kanban-column .column-head h3").then($headings => {
      expect([...$headings].map(heading => heading.textContent.trim())).to.deep.eq([
        "Todo",
        "In Progress",
        "Done"
      ]);
    });
  });
});
