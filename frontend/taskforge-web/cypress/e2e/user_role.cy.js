describe("TaskForge user roles", () => {
  const apiUrl = "http://127.0.0.1:5010";
  let userId = null;
  let fullName;
  let userEmail;

  beforeEach(function () {
    const email = Cypress.env("EMAIL");
    const password = Cypress.env("PASSWORD");

    if (!email || !password) {
      cy.log("Set CYPRESS_EMAIL and CYPRESS_PASSWORD to run user-role tests.");
      this.skip();
    }

    userId = null;
    const timestamp = Date.now();
    fullName = `Cypress Role User ${timestamp}`;
    userEmail = `cypress.role.${timestamp}@taskforge.test`;

    cy.clearLocalStorage();
    cy.visit("/");
    cy.intercept("POST", "**/api/auth/login").as("login");
    cy.get("#email").type(email);
    cy.get("#password").type(password, { log: false });
    cy.get("#authForm").submit();
    cy.wait("@login").its("response.statusCode").should("eq", 200);
    cy.get('#usersNavItem[data-view="users"]').should("be.visible");

    cy.window().then(win => {
      const token = win.localStorage.getItem("taskforge_token");
      expect(token).to.be.a("string").and.not.be.empty;

      cy.request({
        method: "POST",
        url: `${apiUrl}/api/Users`,
        headers: { Authorization: `Bearer ${token}` },
        body: {
          fullName,
          email: userEmail,
          password: "CypressTest123!",
          role: "user",
          isActive: true
        }
      }).then(response => {
        expect(response.status).to.eq(201);
        expect(response.body.role).to.eq("user");
        userId = response.body.id;
      });
    });
  });

  afterEach(() => {
    if (!userId) return;

    cy.window().then(win => {
      const token = win.localStorage.getItem("taskforge_token");
      if (!token) return;

      cy.request({
        method: "DELETE",
        url: `${apiUrl}/api/Users/${userId}`,
        headers: { Authorization: `Bearer ${token}` },
        failOnStatusCode: false
      }).then(response => {
        expect([204, 404]).to.include(response.status);
      });
    });
  });

  it("changes a user role from User to Administrator", () => {
    cy.reload();
    cy.get("#appView").should("be.visible");
    cy.get('#usersNavItem[data-view="users"]').should("be.visible").click();
    cy.get("#usersView").should("be.visible");
    cy.get("#usersList")
      .contains(".user-row strong", fullName)
      .parents(".user-row")
      .should("contain", userEmail)
      .and("contain", "user")
      .click();

    cy.get("#userDetailDialog").should("be.visible");
    cy.get("#userDetailTitle").should("have.text", fullName);
    cy.get("#adminUserRole").should("have.value", "user").select("admin");

    cy.intercept("PUT", `**/api/Users/${userId}`).as("promoteUser");
    cy.get("#saveUserAdminButton").should("be.visible").and("be.enabled").click();

    cy.wait("@promoteUser").then(({ request, response }) => {
      expect(request.body.fullName).to.eq(fullName);
      expect(request.body.email).to.eq(userEmail);
      expect(request.body.role).to.eq("admin");
      expect(request.body.isActive).to.eq(true);
      expect(response.statusCode).to.eq(200);
      expect(response.body.id).to.eq(userId);
      expect(response.body.role).to.eq("admin");
      expect(response.body.isActive).to.eq(true);
    });

    cy.get("#toast").should("contain", "User account updated");
    cy.get("#userDetailDone").click();
    cy.get("#userDetailDialog").should("not.be.visible");
    cy.get("#usersList")
      .contains(".user-row strong", fullName)
      .parents(".user-row")
      .should("contain", userEmail)
      .and("contain", "admin")
      .and("contain", "Active");
  });
});
