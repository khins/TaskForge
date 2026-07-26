const API = "http://127.0.0.1:5010";
const state = {
  token: localStorage.getItem("taskforge_token"),
  user: JSON.parse(localStorage.getItem("taskforge_user") || "null"),
  projects: [],
  project: null,
  board: null,
  tasks: [],
  selectedTask: null,
  comments: [],
  authMode: "login",
  dialogMode: null
};

const $ = (id) => document.getElementById(id);

async function api(path, options = {}) {
  const headers = { ...(options.body ? { "Content-Type": "application/json" } : {}), ...options.headers };
  if (state.token) headers.Authorization = `Bearer ${state.token}`;
  const response = await fetch(`${API}${path}`, { ...options, headers });
  if (response.status === 401) {
    logout(false);
    throw new Error("Your session expired. Please sign in again.");
  }
  const data = response.status === 204 ? null : await response.json().catch(() => null);
  if (!response.ok) throw new Error(data?.message || data?.title || `Request failed (${response.status})`);
  return data;
}

function toast(message, type = "") {
  const el = $("toast");
  el.textContent = message;
  el.className = `toast show ${type}`;
  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => el.className = "toast", 3200);
}

function initials(value = "TF") {
  return value.split(/\s|@/).filter(Boolean).slice(0, 2).map(x => x[0]).join("").toUpperCase();
}

function decodeToken(token) {
  try {
    const payload = JSON.parse(atob(token.split(".")[1].replace(/-/g, "+").replace(/_/g, "/")));
    return {
      email: payload["http://schemas.xmlsoap.org/ws/2005/05/identity/claims/emailaddress"] || "",
      name: payload["http://schemas.xmlsoap.org/ws/2005/05/identity/claims/name"] || ""
    };
  } catch { return {}; }
}

async function checkApi() {
  try {
    await api("/health");
    $("apiStatus").classList.add("online");
    $("apiStatus").lastChild.textContent = " Local API connected";
  } catch {
    $("apiStatus").classList.remove("online");
    $("apiStatus").lastChild.textContent = " Local API is unavailable on port 5010";
  }
}

function setAuthMode(mode) {
  state.authMode = mode;
  const register = mode === "register";
  $("nameField").classList.toggle("hidden", !register);
  $("fullName").required = register;
  $("authTitle").textContent = register ? "Create your workspace account" : "Sign in to your workspace";
  $("authSubtitle").textContent = register ? "Start organizing your work in a few seconds." : "Pick up right where you left off.";
  $("authButtonText").textContent = register ? "Create account" : "Sign in";
  $("authPrompt").textContent = register ? "Already have an account?" : "New to TaskForge?";
  $("authToggle").textContent = register ? "Sign in" : "Create an account";
}

async function handleAuth(event) {
  event.preventDefault();
  const email = $("email").value.trim();
  const password = $("password").value;
  const button = $("authForm").querySelector("button[type=submit]");
  button.disabled = true;
  try {
    if (state.authMode === "register") {
      await api("/api/auth/register", { method: "POST", body: JSON.stringify({ email, password, fullName: $("fullName").value.trim() }) });
      toast("Account created. Signing you in…");
    }
    const result = await api("/api/auth/login", { method: "POST", body: JSON.stringify({ email, password }) });
    state.token = result.token;
    state.user = decodeToken(result.token);
    localStorage.setItem("taskforge_token", state.token);
    localStorage.setItem("taskforge_user", JSON.stringify(state.user));
    showApp();
    await loadProjects();
  } catch (error) { toast(error.message, "error"); }
  finally { button.disabled = false; }
}

function showApp() {
  $("authView").classList.add("hidden");
  $("appView").classList.remove("hidden");
  $("userName").textContent = state.user?.name || "TaskForge User";
  $("userEmail").textContent = state.user?.email || "";
  $("userAvatar").textContent = initials(state.user?.name || state.user?.email);
  showView("projects");
}

function logout(showMessage = true) {
  state.token = null;
  state.user = null;
  localStorage.removeItem("taskforge_token");
  localStorage.removeItem("taskforge_user");
  $("appView").classList.add("hidden");
  $("authView").classList.remove("hidden");
  if (showMessage) toast("You’ve been signed out.");
}

function showView(view) {
  ["projects", "project", "board"].forEach(name => $(`${name}View`).classList.toggle("hidden", name !== view));
  document.querySelectorAll(".nav-item[data-view]").forEach(el => el.classList.toggle("active", el.dataset.view === view || (view === "project" && el.dataset.view === "projects")));
  const titles = { projects: ["Workspace", "Projects", "+ New project"], project: ["Project", state.project?.name || "Project", "+ New board"], board: ["Board", state.board?.name || "Board", "+ Add task"] };
  $("pageEyebrow").textContent = titles[view][0];
  $("pageTitle").textContent = titles[view][1];
  $("primaryAction").textContent = titles[view][2];
  $("primaryAction").dataset.action = view === "projects" ? "project" : view === "project" ? "board" : "task";
}

async function loadProjects() {
  try {
    state.projects = await api("/api/projects");
    renderProjects();
  } catch (error) { toast(error.message, "error"); }
}

function renderProjects() {
  const query = $("projectSearch").value.trim().toLowerCase();
  const projects = state.projects.filter(p => `${p.name} ${p.description || ""}`.toLowerCase().includes(query));
  $("projectCount").textContent = state.projects.length;
  $("boardCount").textContent = state.projects.reduce((sum, p) => sum + p.boardCount, 0);
  $("taskCount").textContent = state.projects.reduce((sum, p) => sum + p.taskCount, 0);
  $("projectsGrid").innerHTML = projects.length ? projects.map(project => `
    <article class="project-card">
      <button class="card-hit" data-project="${project.id}" aria-label="Open ${escapeHtml(project.name)}"></button>
      <span class="card-icon">${initials(project.name)}</span>
      <h3>${escapeHtml(project.name)}</h3>
      <p>${escapeHtml(project.description || "No description yet.")}</p>
      <div class="card-meta"><span>▦ ${project.boardCount} boards</span><span>✓ ${project.taskCount} tasks</span><span>♙ ${project.memberCount}</span></div>
    </article>`).join("") : emptyState(query ? "No matching projects" : "No projects yet", query ? "Try another search." : "Create your first project to begin organizing work.");
}

async function openProject(id) {
  try {
    state.project = await api(`/api/projects/${id}`);
    $("projectHero").innerHTML = `<h2>${escapeHtml(state.project.name)}</h2><p>${escapeHtml(state.project.description || "A focused place for this project's work.")}</p>`;
    $("boardsGrid").innerHTML = state.project.boards.length ? state.project.boards.map(board => `
      <article class="board-card">
        <button class="card-hit" data-board="${board.id}" aria-label="Open ${escapeHtml(board.name)}"></button>
        <span class="card-icon">▦</span><h3>${escapeHtml(board.name)}</h3>
        <p>${escapeHtml(board.description || "A flexible workflow for your team.")}</p>
        <div class="card-meta"><span>${board.columnCount} columns</span></div>
      </article>`).join("") : emptyState("No boards yet", "Create a board with Todo, In Progress, and Done columns.");
    showView("project");
  } catch (error) { toast(error.message, "error"); }
}

async function openBoard(id) {
  try {
    [state.board, state.tasks] = await Promise.all([api(`/api/boards/${id}`), api(`/api/boards/${id}/tasks`)]);
    $("boardTitle").textContent = state.board.name;
    $("boardDescription").textContent = state.board.description || `${state.board.columns.length} stage workflow`;
    renderBoard();
    showView("board");
  } catch (error) { toast(error.message, "error"); }
}

function renderBoard() {
  $("kanban").innerHTML = state.board.columns.map(column => {
    const tasks = state.tasks.filter(task => task.boardColumnId === column.id);
    return `<section class="kanban-column">
      <div class="column-head"><h3>${escapeHtml(column.name)}</h3><span class="count-pill">${tasks.length}</span></div>
      ${tasks.map(task => `<button class="task-card" data-task="${task.id}" type="button" aria-label="Edit ${escapeHtml(task.title)}"><span class="priority ${task.priority.toLowerCase()}">${escapeHtml(task.priority)}</span><h4>${escapeHtml(task.title)}</h4><p>${escapeHtml(task.description || "No description")}</p><div class="task-meta">${task.dueDate ? `Due ${new Date(task.dueDate).toLocaleDateString()}` : "No due date"}<span>Edit →</span></div></button>`).join("")}
    </section>`;
  }).join("");
}

function emptyState(title, text) {
  return `<div class="empty-state"><span class="card-icon">＋</span><strong>${title}</strong><p>${text}</p></div>`;
}

function escapeHtml(value = "") {
  return String(value).replace(/[&<>"']/g, char => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;" })[char]);
}

function taskFields(task = {}, includeComments = false) {
  task ??= {};
  const dueDate = task.dueDate ? new Date(task.dueDate).toISOString().slice(0, 10) : "";
  return `
    <label class="field">Task title<input name="title" placeholder="What needs to be done?" value="${escapeHtml(task.title || "")}" required autofocus /></label>
    <label class="field">Description<textarea name="description" rows="3" placeholder="Add useful details or context">${escapeHtml(task.description || "")}</textarea></label>
    <label class="field">Workflow stage<select name="boardColumnId">${state.board?.columns.map(c => `<option value="${c.id}" ${c.id === task.boardColumnId ? "selected" : ""}>${escapeHtml(c.name)}</option>`).join("") || ""}</select></label>
    <label class="field">Priority<select name="priority">${["Medium", "High", "Urgent", "Low"].map(priority => `<option ${priority === task.priority ? "selected" : ""}>${priority}</option>`).join("")}</select></label>
    <label class="field">Due date<input name="dueDate" type="date" value="${dueDate}" /></label>
    ${includeComments ? `
      <section class="comments-section" aria-labelledby="commentsHeading">
        <div class="comments-heading"><div><h3 id="commentsHeading">Comments</h3><p>Share updates and keep the conversation with the work.</p></div><span id="commentCount" class="count-pill">0</span></div>
        <div id="commentsList" class="comments-list"><p class="comments-empty">Loading comments…</p></div>
        <div class="comment-composer">
          <div class="avatar">${initials(state.user?.name || state.user?.email)}</div>
          <div>
            <textarea id="commentBody" rows="3" maxlength="4000" placeholder="Write a comment…" aria-label="New comment"></textarea>
            <div class="comment-composer-actions"><small>Keep it clear and actionable.</small><button id="postCommentButton" class="button primary compact" type="button">Post comment</button></div>
          </div>
        </div>
      </section>` : ""}`;
}

function openDialog(mode, task = null) {
  if ((mode === "board" || mode === "task" || mode === "editTask") && !state.project) return toast("Choose a project first.", "error");
  if ((mode === "task" || mode === "editTask") && !state.board) return toast("Choose a board first.", "error");
  state.selectedTask = mode === "editTask" ? task : null;
  state.dialogMode = mode;
  const configs = {
    project: { eyebrow: "Create project", title: "What are you working on?", submit: "Create project", fields: `
      <label class="field">Project name<input name="name" placeholder="e.g. Mobile app launch" required autofocus /></label>
      <label class="field">Description<textarea name="description" rows="4" placeholder="What does this project aim to accomplish?"></textarea></label>` },
    board: { eyebrow: "Create board", title: "Add a workflow", submit: "Create board", fields: `
      <label class="field">Board name<input name="name" placeholder="e.g. Product delivery" required autofocus /></label>
      <label class="field">Description<textarea name="description" rows="3" placeholder="How will this board be used?"></textarea></label>
      <label class="field">Starting columns<select name="createDefaultColumns"><option value="true">Todo, In Progress, Done</option><option value="false">Start with an empty board</option></select></label>` },
    task: { eyebrow: "Create task", title: "Add work to the board", submit: "Add task", fields: taskFields() },
    editTask: { eyebrow: "Edit task", title: "Update this task", submit: "Save changes", fields: taskFields(task, true) }
  };
  const config = configs[mode];
  $("dialogEyebrow").textContent = config.eyebrow;
  $("dialogTitle").textContent = config.title;
  $("dialogSubmit").textContent = config.submit;
  $("dialogFields").innerHTML = config.fields;
  $("entityDialog").showModal();
  if (mode === "editTask") loadComments(task.id);
}

async function loadComments(taskId) {
  try {
    state.comments = await api(`/api/tasks/${taskId}/comments`);
    renderComments();
  } catch (error) {
    $("commentsList").innerHTML = `<p class="comments-empty error-text">${escapeHtml(error.message)}</p>`;
  }
}

function renderComments() {
  const list = $("commentsList");
  if (!list) return;
  $("commentCount").textContent = state.comments.length;
  list.innerHTML = state.comments.length ? state.comments.map(comment => {
    const created = new Date(comment.createdAt);
    const edited = new Date(comment.updatedAt).getTime() - created.getTime() > 1000;
    return `<article class="comment">
      <div class="avatar">${initials(comment.authorName)}</div>
      <div class="comment-content">
        <div class="comment-meta"><strong>${escapeHtml(comment.authorName)}</strong><time datetime="${comment.createdAt}">${created.toLocaleString([], { dateStyle: "medium", timeStyle: "short" })}</time>${edited ? "<span>edited</span>" : ""}</div>
        <p>${escapeHtml(comment.body).replace(/\n/g, "<br>")}</p>
      </div>
    </article>`;
  }).join("") : `<p class="comments-empty">No comments yet. Start the conversation.</p>`;
}

async function postComment() {
  const body = $("commentBody")?.value.trim();
  if (!body) return toast("Write a comment before posting.", "error");
  const button = $("postCommentButton");
  button.disabled = true;
  try {
    const comment = await api(`/api/tasks/${state.selectedTask.id}/comments`, {
      method: "POST",
      body: JSON.stringify({ body })
    });
    state.comments.push(comment);
    $("commentBody").value = "";
    renderComments();
    $("commentsList").lastElementChild?.scrollIntoView({ behavior: "smooth", block: "nearest" });
    toast("Comment posted.");
  } catch (error) { toast(error.message, "error"); }
  finally { button.disabled = false; }
}

async function submitDialog(event) {
  event.preventDefault();
  const formData = new FormData($("entityForm"));
  const values = Object.fromEntries(formData);
  try {
    if (state.dialogMode === "project") {
      await api("/api/projects", { method: "POST", body: JSON.stringify(values) });
      await loadProjects();
      toast("Project created.");
    } else if (state.dialogMode === "board") {
      values.createDefaultColumns = values.createDefaultColumns === "true";
      await api(`/api/projects/${state.project.id}/boards`, { method: "POST", body: JSON.stringify(values) });
      await openProject(state.project.id);
      toast("Board created.");
    } else if (state.dialogMode === "task" || state.dialogMode === "editTask") {
      values.boardColumnId = Number(values.boardColumnId);
      values.dueDate = values.dueDate ? new Date(`${values.dueDate}T12:00:00`).toISOString() : null;
      values.status = state.board.columns.find(c => c.id === values.boardColumnId)?.name || "Todo";
      if (state.dialogMode === "editTask") {
        values.assigneeId = state.selectedTask.assigneeId;
        values.position = state.selectedTask.position;
        await api(`/api/tasks/${state.selectedTask.id}`, { method: "PUT", body: JSON.stringify(values) });
      } else {
        await api(`/api/projects/${state.project.id}/tasks`, { method: "POST", body: JSON.stringify(values) });
      }
      await openBoard(state.board.id);
      toast(state.dialogMode === "editTask" ? "Task updated." : "Task added.");
    }
    $("entityDialog").close();
  } catch (error) { toast(error.message, "error"); }
}

$("authForm").addEventListener("submit", handleAuth);
$("authToggle").addEventListener("click", () => setAuthMode(state.authMode === "login" ? "register" : "login"));
$("logoutButton").addEventListener("click", () => logout());
$("projectSearch").addEventListener("input", renderProjects);
$("projectsGrid").addEventListener("click", e => e.target.dataset.project && openProject(e.target.dataset.project));
$("boardsGrid").addEventListener("click", e => e.target.dataset.board && openBoard(e.target.dataset.board));
$("kanban").addEventListener("click", e => {
  const card = e.target.closest("[data-task]");
  if (!card) return;
  const task = state.tasks.find(item => item.id === Number(card.dataset.task));
  if (task) openDialog("editTask", task);
});
$("backToProjects").addEventListener("click", () => showView("projects"));
$("backToProject").addEventListener("click", () => showView("project"));
$("newBoardButton").addEventListener("click", () => openDialog("board"));
$("newTaskButton").addEventListener("click", () => openDialog("task"));
$("primaryAction").addEventListener("click", e => openDialog(e.currentTarget.dataset.action || "project"));
$("entityForm").addEventListener("submit", submitDialog);
$("dialogFields").addEventListener("click", event => {
  if (event.target.id === "postCommentButton") postComment();
});
$("dialogClose").addEventListener("click", () => $("entityDialog").close());
$("dialogCancel").addEventListener("click", () => $("entityDialog").close());
$("refreshButton").addEventListener("click", () => state.board ? openBoard(state.board.id) : state.project ? openProject(state.project.id) : loadProjects());
$("menuButton").addEventListener("click", () => document.querySelector(".sidebar").classList.toggle("open"));
document.querySelectorAll(".nav-item[data-view]").forEach(el => el.addEventListener("click", () => {
  const view = el.dataset.view;
  if (view === "board" && !state.board) return toast("Open a board from a project first.");
  showView(view);
}));

checkApi();
if (state.token) {
  state.user ||= decodeToken(state.token);
  showApp();
  loadProjects();
}
