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

  it("creates a new user and sets the login status to inactive", () => {
    const fullName = "Cypress Test User";
    const email = `cypress.user.${Date.now()}@taskforge.test`;
    const password = "CypressTest123!";

    cy.get('#usersNavItem[data-view="users"]').should("be.visible").click();
    cy.get("#usersView").should("be.visible");
    cy.get("#primaryAction")
      .should("be.visible")
      .and("contain", "New user")
      .click();

    cy.get("#entityDialog").should("be.visible");
    cy.get("#dialogTitle").should("have.text", "Add a workspace account");
    cy.get('input[name="fullName"]').type(fullName);
    cy.get('input[name="email"]').type(email);
    cy.get('input[name="password"]').type(password, { log: false });
    cy.get('select[name="role"]').select("User");
    cy.get('select[name="isActive"]').select("true");

    cy.intercept("POST", "**/api/Users").as("createUser");
    cy.get("#dialogSubmit").should("have.text", "Create user").click();

    cy.wait("@createUser").then(({ request, response }) => {
      expect(request.body.fullName).to.eq(fullName);
      expect(request.body.email).to.eq(email);
      expect(request.body.role).to.eq("User");
      expect(request.body.isActive).to.eq(true);
      expect(response.statusCode).to.eq(201);
      expect(response.body.fullName).to.eq(fullName);
      expect(response.body.email).to.eq(email);
      expect(response.body.role).to.eq("user");
      expect(response.body.isActive).to.eq(true);
    });

    cy.get("#entityDialog").should("not.be.visible");
    cy.get("#toast").should("contain", "User created");
    cy.get("#usersList")
      .contains(".user-row strong", fullName)
      .parents(".user-row")
      .should("contain", email)
      .and("contain", "user")
      .and("contain", "Active");

    cy.get("#usersList")
      .contains(".user-row strong", fullName)
      .parents(".user-row")
      .click();

    cy.get("#userDetailDialog").should("be.visible");
    cy.get("#userDetailTitle").should("have.text", fullName);
    cy.get("#adminUserActive").should("have.value", "true").select("false");

    cy.intercept("PUT", "**/api/Users/*").as("deactivateUser");
    cy.get("#saveUserAdminButton").click();

    cy.wait("@deactivateUser").then(({ request, response }) => {
      expect(request.body.fullName).to.eq(fullName);
      expect(request.body.email).to.eq(email);
      expect(request.body.role).to.eq("user");
      expect(request.body.isActive).to.eq(false);
      expect(response.statusCode).to.eq(200);
      expect(response.body.isActive).to.eq(false);
    });

    cy.get("#toast").should("contain", "User account updated");
    cy.get("#userDetailDone").click();
    cy.get("#userDetailDialog").should("not.be.visible");
    cy.get("#usersList")
      .contains(".user-row strong", fullName)
      .parents(".user-row")
      .should("contain", email)
      .and("contain", "Inactive");
  });

  it("navigates from the dashboard to projects", () => {
    cy.get('.nav-item[data-view="projects"]').click();
    cy.get("#pageTitle").should("have.text", "Projects");
    cy.get("#projectsView").should("be.visible");
    cy.get("#projectSearch").should("be.visible");
  });

  it("creates a new project with a board", () => {
    const projectName = `Cypress project ${Date.now()}`;
    const projectDescription = "Created by the Cypress end-to-end test.";
    const boardName = `Cypress board ${Date.now()}`;
    const boardDescription = "Default workflow created by Cypress.";

    cy.get('.nav-item[data-view="projects"]').click();
    cy.get("#projectsView").should("be.visible");
    cy.get("#primaryAction")
      .should("be.visible")
      .and("contain", "New project")
      .click();

    cy.get("#entityDialog").should("be.visible");
    cy.get("#dialogTitle").should("have.text", "What are you working on?");
    cy.get('input[name="name"]').type(projectName);
    cy.get('textarea[name="description"]').type(projectDescription);

    cy.intercept("POST", "**/api/projects").as("createProject");
    cy.get("#dialogSubmit").should("have.text", "Create project").click();

    cy.wait("@createProject").then(({ request, response }) => {
      expect(request.body.name).to.eq(projectName);
      expect(request.body.description).to.eq(projectDescription);
      expect(response.statusCode).to.eq(201);
      expect(response.body.name).to.eq(projectName);
    });

    cy.get("#entityDialog").should("not.be.visible");
    cy.get("#toast").should("contain", "Project created");
    cy.get("#projectsGrid")
      .contains(".project-card h3", projectName)
      .should("be.visible")
      .parents(".project-card")
      .should("contain", projectDescription);

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
      .and("contain", "3 columns");
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

  it("creates a subtask under a parent task", () => {
    const parentTitle = `Cypress parent task ${Date.now()}`;
    const subtaskTitle = `Cypress subtask ${Date.now()}`;
    let parentTaskId;

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
    cy.get('input[name="title"]').type(parentTitle);
    cy.get('textarea[name="description"]').type("Parent task created for the Cypress subtask test.");

    cy.intercept("POST", "**/api/projects/*/tasks").as("createParentTask");
    cy.get("#dialogSubmit").click();
    cy.wait("@createParentTask").then(({ response }) => {
      expect(response.statusCode).to.eq(201);
      expect(response.body.parentTaskId).to.eq(null);
      parentTaskId = response.body.id;
    });

    cy.intercept("GET", "**/api/tasks/*/subtasks").as("loadSubtasks");
    cy.get("#kanban").contains(".task-card", parentTitle).click();
    cy.get("#entityDialog").should("be.visible");
    cy.wait("@loadSubtasks").its("response.statusCode").should("eq", 200);
    cy.get("#subtaskCount").should("have.text", "0");
    cy.get("#subtaskTitle").type(subtaskTitle);

    cy.intercept("POST", "**/api/tasks/*/subtasks").as("createSubtask");
    cy.get("#addSubtaskButton").click();

    cy.wait("@createSubtask").then(({ request, response }) => {
      expect(request.body.title).to.eq(subtaskTitle);
      expect(response.statusCode).to.eq(201);
      expect(response.body.title).to.eq(subtaskTitle);
      expect(response.body.parentTaskId).to.eq(parentTaskId);
      expect(response.body.status).to.eq("Todo");
    });

    cy.get("#toast").should("contain", `Subtask "${subtaskTitle}" added`);
    cy.get("#subtaskCount").should("have.text", "1");
    cy.get("#subtasksList")
      .contains(".subtask-row", subtaskTitle)
      .should("be.visible")
      .and("contain", "Medium")
      .and("contain", "Todo");
  });

  it("sets a newly created task to Urgent with today's due date", () => {
    const taskTitle = `Cypress urgent task ${Date.now()}`;
    const today = new Date();
    const dueDate = [
      today.getFullYear(),
      String(today.getMonth() + 1).padStart(2, "0"),
      String(today.getDate()).padStart(2, "0")
    ].join("-");
    const displayedDueDate = new Date(`${dueDate}T12:00:00`).toLocaleDateString();

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
    cy.get('textarea[name="description"]').type("Created for the Cypress priority and due-date test.");

    cy.intercept("POST", "**/api/projects/*/tasks").as("createUrgentTask");
    cy.get("#dialogSubmit").click();
    cy.wait("@createUrgentTask").its("response.statusCode").should("eq", 201);

    cy.get("#kanban").contains(".task-card", taskTitle).click();
    cy.get("#entityDialog").should("be.visible");
    cy.get('select[name="priority"]').select("Urgent");
    cy.get('input[name="dueDate"]').clear().type(dueDate);

    cy.intercept("PUT", "**/api/tasks/*").as("updateUrgentTask");
    cy.get("#dialogSubmit").click();

    cy.wait("@updateUrgentTask").then(({ request, response }) => {
      expect(request.body.priority).to.eq("Urgent");
      expect(request.body.dueDate).to.include(dueDate);
      expect(response.statusCode).to.eq(200);
      expect(response.body.priority).to.eq("Urgent");
      expect(response.body.dueDate).to.include(dueDate);
    });

    cy.get("#entityDialog").should("not.be.visible");
    cy.get("#toast").should("contain", "Task updated");
    cy.get("#kanban")
      .contains(".task-card", taskTitle)
      .should("be.visible")
      .within(() => {
        cy.get(".priority.urgent").should("have.text", "Urgent");
        cy.get(".task-meta").should("contain", `Due ${displayedDueDate}`);
      });
  });

  it("drags a newly created task to In Progress", () => {
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

    cy.contains(".kanban-column .column-head h3", "Todo")
      .parents(".kanban-column")
      .within(() => {
        cy.contains(".task-card", taskTitle)
          .should("be.visible")
          .and("have.attr", "draggable", "true");
      });

    cy.intercept("PATCH", "**/api/tasks/*/move").as("dragTask");
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

          cy.wait("@dragTask").then(({ request, response }) => {
            expect(request.body.boardColumnId).to.eq(destinationColumnId);
            expect(request.body.status).to.eq("In Progress");
            expect(response.statusCode).to.eq(200);
            expect(response.body.status).to.eq("In Progress");
          });
        });
    });

    cy.get("#toast").should("contain", `"${taskTitle}" moved to In Progress`);
    cy.contains(".kanban-column .column-head h3", "Todo")
      .parents(".kanban-column")
      .within(() => {
        cy.contains(".task-card", taskTitle).should("not.exist");
      });
    cy.contains(".kanban-column .column-head h3", "In Progress")
      .parents(".kanban-column")
      .within(() => {
        cy.contains(".task-card", taskTitle).should("be.visible");
      });
  });

  it("moves an In Progress task to Done and archives it", () => {
    const taskTitle = `Cypress archive task ${Date.now()}`;

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
    cy.get('textarea[name="description"]').type("Created for the Cypress archive test.");

    cy.intercept("POST", "**/api/projects/*/tasks").as("createArchivableTask");
    cy.get("#dialogSubmit").click();
    cy.wait("@createArchivableTask").its("response.statusCode").should("eq", 201);

    cy.get("#kanban").contains(".task-card", taskTitle).click();
    cy.get("#entityDialog").should("be.visible");
    cy.get("#archiveTaskButton").should("not.be.visible");
    cy.get('select[name="boardColumnId"]').select("In Progress");

    cy.intercept("PUT", "**/api/tasks/*").as("startArchivableTask");
    cy.get("#dialogSubmit").click();
    cy.wait("@startArchivableTask").then(({ response }) => {
      expect(response.statusCode).to.eq(200);
      expect(response.body.status).to.eq("In Progress");
    });

    cy.contains(".kanban-column .column-head h3", "In Progress")
      .parents(".kanban-column")
      .within(() => {
        cy.contains(".task-card", taskTitle).should("be.visible").click();
      });

    cy.get("#entityDialog").should("be.visible");
    cy.get("#archiveTaskButton").should("not.be.visible");
    cy.get('select[name="boardColumnId"] option:selected').should("have.text", "In Progress");
    cy.get('select[name="boardColumnId"]').select("Done");

    cy.intercept("PUT", "**/api/tasks/*").as("completeArchivableTask");
    cy.get("#dialogSubmit").click();
    cy.wait("@completeArchivableTask").then(({ response }) => {
      expect(response.statusCode).to.eq(200);
      expect(response.body.status).to.eq("Done");
    });

    cy.contains(".kanban-column .column-head h3", "Done")
      .parents(".kanban-column")
      .within(() => {
        cy.contains(".task-card", taskTitle).should("be.visible").click();
      });

    cy.get("#entityDialog").should("be.visible");
    cy.get("#archiveTaskButton")
      .scrollIntoView()
      .should("be.visible")
      .and("be.enabled");
    cy.on("window:confirm", message => {
      expect(message).to.contain(taskTitle);
      expect(message).to.contain("removed from the Kanban board");
      return true;
    });

    cy.intercept("PATCH", "**/api/tasks/*/archive").as("archiveTask");
    cy.get("#archiveTaskButton").click();

    cy.wait("@archiveTask").then(({ response }) => {
      expect(response.statusCode).to.eq(200);
      expect(response.body.archivedAt).to.be.a("string");
    });
    cy.get("#entityDialog").should("not.be.visible");
    cy.get("#toast").should("contain", `"${taskTitle}" was archived`);
    cy.get("#kanban").contains(".task-card", taskTitle).should("not.exist");
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

  it("creates a task with the Development label", () => {
    const taskTitle = `Cypress labeled task ${Date.now()}`;

    cy.get('.nav-item[data-view="projects"]').click();
    cy.get("#projectsGrid .project-card")
      .first()
      .find("[data-project]")
      .click({ force: true });

    cy.get("#labelsGrid").then($labelsGrid => {
      const hasDevelopmentLabel = [...$labelsGrid.find(".label-card strong")]
        .some(label => label.textContent.trim().toLowerCase() === "development");

      if (!hasDevelopmentLabel) {
        cy.get("#newLabelButton").click();
        cy.get('input[name="name"]').type("Development");
        cy.intercept("POST", "**/api/projects/*/labels").as("createDevelopmentLabel");
        cy.get("#dialogSubmit").click();
        cy.wait("@createDevelopmentLabel").its("response.statusCode").should("eq", 201);
        cy.get("#entityDialog").should("not.be.visible");
        cy.get("#labelsGrid").contains(".label-card strong", "Development").should("be.visible");
      }
    });

    cy.get("#boardsGrid .board-card")
      .first()
      .find("[data-board]")
      .click({ force: true });

    cy.get("#newTaskButton").click();
    cy.get("#entityDialog").should("be.visible");
    cy.get('input[name="title"]').type(taskTitle);
    cy.get('textarea[name="description"]').type("Created with the Development label by Cypress.");

    cy.get(".label-picker label")
      .filter((index, label) => label.textContent.trim().toLowerCase() === "development")
      .should(labels => {
        expect(labels.length, "available Development labels").to.be.greaterThan(0);
      })
      .first()
      .find('input[name="labelIds"]')
      .check();

    cy.intercept("POST", "**/api/projects/*/tasks").as("createLabeledTask");
    cy.intercept("POST", "**/api/tasks/*/labels/*").as("assignDevelopmentLabel");
    cy.get("#dialogSubmit").click();

    cy.wait("@createLabeledTask").its("response.statusCode").should("eq", 201);
    cy.wait("@assignDevelopmentLabel").then(({ response }) => {
      expect(response.statusCode).to.eq(200);
      expect(response.body.name).to.be.a("string");
      expect(response.body.name.toLowerCase()).to.eq("development");
    });
    cy.get("#entityDialog").should("not.be.visible");

    cy.get("#kanban").contains(".task-card", taskTitle).should("be.visible").click();
    cy.get("#entityDialog").should("be.visible");
    cy.get(".label-picker label")
      .filter((index, label) => label.textContent.trim().toLowerCase() === "development")
      .find('input[name="labelIds"]:checked')
      .should("have.length", 1);
  });
});
