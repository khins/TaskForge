describe("TaskForge project labels", () => {
  const apiUrl = "http://127.0.0.1:5010";
  let projectId = null;
  let projectName;

  beforeEach(function () {
    const email = Cypress.env("EMAIL");
    const password = Cypress.env("PASSWORD");

    if (!email || !password) {
      cy.log("Set CYPRESS_EMAIL and CYPRESS_PASSWORD to run label tests.");
      this.skip();
    }

    projectId = null;
    projectName = `Cypress label project ${Date.now()}`;
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
          description: "Temporary project for the focused Cypress label test."
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

  it("adds a label to a project", () => {
    const labelName = `Cypress Label ${Date.now()}`;
    const labelColor = "#3366AA";

    cy.reload();
    cy.get("#appView").should("be.visible");
    cy.get('.nav-item[data-view="projects"]').click();
    cy.get("#projectsGrid")
      .contains(".project-card h3", projectName)
      .parents(".project-card")
      .find("[data-project]")
      .click({ force: true });

    cy.get("#projectView").should("be.visible");
    cy.get("#newLabelButton").should("be.visible").click();
    cy.get("#entityDialog").should("be.visible");
    cy.get("#dialogTitle").should("have.text", "Add a project label");
    cy.get('input[name="name"]').type(labelName);
    cy.get('input[name="colorText"]')
      .clear()
      .type(labelColor)
      .should("have.value", labelColor);

    cy.intercept("POST", `**/api/projects/${projectId}/labels`).as("createLabel");
    cy.get("#dialogSubmit").should("have.text", "Create label").click();

    cy.wait("@createLabel").then(({ request, response }) => {
      expect(request.body.name).to.eq(labelName);
      expect(request.body.color.toUpperCase()).to.eq(labelColor);
      expect(response.statusCode).to.eq(201);
      expect(response.body.projectId).to.eq(projectId);
      expect(response.body.name).to.eq(labelName);
      expect(response.body.color.toUpperCase()).to.eq(labelColor);
    });

    cy.get("#entityDialog").should("not.be.visible");
    cy.get("#toast").should("contain", "Label created");
    cy.get("#labelsGrid")
      .contains(".label-card strong", labelName)
      .should("be.visible")
      .parents(".label-card")
      .within(() => {
        cy.get(".label-swatch")
          .should("have.attr", "style")
          .and("contain", labelColor);
        cy.get("[data-edit-label]").should("exist").and("be.enabled");
        cy.get("[data-delete-label]").should("exist").and("be.enabled");
      });
  });
});
