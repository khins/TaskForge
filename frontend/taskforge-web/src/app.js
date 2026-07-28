const API = "http://127.0.0.1:5010";
const state = {
  token: localStorage.getItem("taskforge_token"),
  user: JSON.parse(localStorage.getItem("taskforge_user") || "null"),
  projects: [],
  users: [],
  selectedUser: null,
  dashboard: null,
  currentView: "dashboard",
  project: null,
  board: null,
  tasks: [],
  labels: [],
  labelFilter: null,
  selectedTask: null,
  selectedLabel: null,
  comments: [],
  editingCommentId: null,
  attachments: [],
  authMode: "login",
  dialogMode: null
};

const $ = (id) => document.getElementById(id);

async function api(path, options = {}) {
  const isFormData = options.body instanceof FormData;
  const headers = { ...(options.body && !isFormData ? { "Content-Type": "application/json" } : {}), ...options.headers };
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
      id: payload["http://schemas.xmlsoap.org/ws/2005/05/identity/claims/nameidentifier"] || payload.nameid || payload.sub || "",
      email: payload["http://schemas.xmlsoap.org/ws/2005/05/identity/claims/emailaddress"] || payload.email || "",
      name: payload["http://schemas.xmlsoap.org/ws/2005/05/identity/claims/name"] || payload.unique_name || payload.name || "",
      role: (payload["http://schemas.microsoft.com/ws/2008/06/identity/claims/role"] || payload.role || "user").toLowerCase()
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
    await Promise.all([loadDashboard(), loadProjects()]);
  } catch (error) { toast(error.message, "error"); }
  finally { button.disabled = false; }
}

function showApp() {
  $("authView").classList.add("hidden");
  $("appView").classList.remove("hidden");
  renderCurrentUser();
  showView("dashboard", { historyMode: "replace" });
  loadCurrentUserProfile();
}

function renderCurrentUser() {
  const displayName = state.user?.fullName || state.user?.name || state.user?.email || "TaskForge User";
  $("userName").textContent = displayName;
  $("userEmail").textContent = `${state.user?.email || ""}${isGlobalAdmin() ? " · Administrator" : ""}`;
  $("userAvatar").textContent = initials(displayName);
  $("usersNavItem").classList.toggle("hidden", !isGlobalAdmin());
}

function isGlobalAdmin() {
  return state.user?.role?.toLowerCase() === "admin";
}

async function loadCurrentUserProfile() {
  if (!state.user?.id) return;
  try {
    const profile = await api(`/api/Users/${state.user.id}`);
    state.user = { ...state.user, ...profile, name: profile.fullName || state.user.name };
    localStorage.setItem("taskforge_user", JSON.stringify(state.user));
    renderCurrentUser();
  } catch {
    // Keep the token-provided identity when the profile cannot be refreshed.
  }
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

function routeForView(view) {
  const route = { taskForge: true, view };
  if (view === "project" && state.project) route.projectId = state.project.id;
  if (view === "board" && state.board) {
    route.projectId = state.project?.id || state.board.projectId;
    route.boardId = state.board.id;
  }
  return route;
}

function routeUrl(route) {
  if (route.view === "board") return `#board/${route.boardId}`;
  if (route.view === "project") return `#project/${route.projectId}`;
  return `#${route.view}`;
}

function updateBrowserHistory(view, mode) {
  if (mode === "none") return;
  const route = routeForView(view);
  const current = history.state;
  const isSameRoute = current?.taskForge &&
    current.view === route.view &&
    Number(current.projectId || 0) === Number(route.projectId || 0) &&
    Number(current.boardId || 0) === Number(route.boardId || 0);
  if (mode === "replace" || isSameRoute) {
    history.replaceState(route, "", routeUrl(route));
  } else {
    history.pushState(route, "", routeUrl(route));
  }
}

function showView(view, { historyMode = "push" } = {}) {
  state.currentView = view;
  ["dashboard", "users", "projects", "project", "board"].forEach(name => $(`${name}View`).classList.toggle("hidden", name !== view));
  document.querySelectorAll(".nav-item[data-view]").forEach(el => el.classList.toggle("active", el.dataset.view === view || (view === "project" && el.dataset.view === "projects")));
  const titles = { dashboard: ["Overview", "Dashboard", ""], users: ["Workspace", "Users", "+ New user"], projects: ["Workspace", "Projects", "+ New project"], project: ["Project", state.project?.name || "Project", "+ New board"], board: ["Board", state.board?.name || "Board", "+ Add task"] };
  const actions = { dashboard: "", users: "user", projects: "project", project: "board", board: "task" };
  $("pageEyebrow").textContent = titles[view][0];
  $("pageTitle").textContent = titles[view][1];
  $("primaryAction").textContent = titles[view][2];
  $("primaryAction").classList.toggle("hidden", view === "dashboard");
  $("primaryAction").dataset.action = actions[view];
  updateBrowserHistory(view, historyMode);
}

async function loadDashboard() {
  try {
    state.dashboard = await api("/api/Dashboard");
    renderDashboard();
  } catch (error) { toast(error.message, "error"); }
}

function renderDashboard() {
  const dashboard = state.dashboard;
  $("dashboardProjectCount").textContent = dashboard.projectCount;
  $("dashboardTaskCount").textContent = dashboard.taskCount;
  $("dashboardAssignedCount").textContent = dashboard.assignedToMeCount;
  $("dashboardOverdueCount").textContent = dashboard.overdueCount;
  $("dashboardDueSoonCount").textContent = dashboard.dueSoonCount;
  renderBreakdown("statusBreakdown", dashboard.tasksByStatus, dashboard.taskCount);
  renderBreakdown("priorityBreakdown", dashboard.tasksByPriority, dashboard.taskCount);
  renderDashboardTasks("recentTasks", dashboard.recentTasks, "No tasks have been updated yet.");
  renderDashboardTasks("overdueTasks", dashboard.overdueTasks, "You’re all caught up—nothing is overdue.");
  $("recentTaskCount").textContent = dashboard.recentTasks.length;
  $("overdueTaskCount").textContent = dashboard.overdueTasks.length;
}

function renderBreakdown(elementId, groups, total) {
  $(elementId).innerHTML = groups.length ? groups.map((group, index) => {
    const percent = total ? Math.round((group.count / total) * 100) : 0;
    return `<div class="breakdown-row">
      <div class="breakdown-label"><span><i class="breakdown-dot color-${index % 5}"></i>${escapeHtml(group.name)}</span><strong>${group.count}</strong></div>
      <div class="breakdown-track"><span class="color-${index % 5}" style="width:${percent}%"></span></div>
    </div>`;
  }).join("") : `<p class="dashboard-empty">No task data yet.</p>`;
}

function renderDashboardTasks(elementId, tasks, emptyMessage) {
  $(elementId).innerHTML = tasks.length ? tasks.map(task => `
    <button class="dashboard-task-row" type="button" data-dashboard-task="${task.id}" data-dashboard-project="${task.projectId}" data-dashboard-board="${task.boardId || ""}" aria-label="Open task ${escapeHtml(task.title)}">
      <span class="priority ${escapeHtml(task.priority.toLowerCase())}">${escapeHtml(task.priority)}</span>
      <span class="dashboard-task-main"><strong>${escapeHtml(task.title)}</strong><small>${escapeHtml(task.projectName)} · Updated ${new Date(task.updatedAt).toLocaleDateString()}</small></span>
      <span class="status-chip">${escapeHtml(task.status)}</span>
      <span class="dashboard-due ${task.dueDate && new Date(task.dueDate) < new Date() && task.status !== "Done" ? "late" : ""}">${task.dueDate ? new Date(task.dueDate).toLocaleDateString() : "No due date"}</span>
      <span aria-hidden="true">→</span>
    </button>`).join("") : `<p class="dashboard-empty">${emptyMessage}</p>`;
}

async function openDashboardTask(taskId, projectId, boardId) {
  try {
    await openProject(projectId);
    if (Number(state.project?.id) !== Number(projectId)) return;
    const task = await api(`/api/tasks/${taskId}`);
    let resolvedBoardId = boardId ? Number(boardId) : null;

    if (!resolvedBoardId && task.boardColumnId) {
      const boards = await Promise.all(state.project.boards.map(board => api(`/api/boards/${board.id}`)));
      resolvedBoardId = boards.find(board =>
        board.columns.some(column => Number(column.id) === Number(task.boardColumnId))
      )?.id;
    }

    if (!resolvedBoardId) return toast("This task is not assigned to a board yet.", "error");
    await openBoard(resolvedBoardId);
    if (Number(state.board?.id) !== Number(resolvedBoardId)) return;
    openDialog("editTask", task);
  } catch (error) { toast(error.message, "error"); }
}

async function loadUsers() {
  try {
    state.users = await api("/api/Users");
    renderUsers();
  } catch (error) { toast(error.message, "error"); }
}

function renderUsers() {
  const query = $("userSearch").value.trim().toLowerCase();
  const users = state.users.filter(user =>
    `${user.fullName || ""} ${user.email} ${user.role}`.toLowerCase().includes(query)
  );
  $("userCount").textContent = state.users.length;
  $("activeUserCount").textContent = state.users.filter(user => user.isActive).length;
  $("adminUserCount").textContent = state.users.filter(user => user.role?.toLowerCase() === "admin").length;
  $("usersList").innerHTML = users.length ? users.map(user => `
    <button class="user-row" type="button" data-user="${user.id}">
      <span class="user-identity"><span class="avatar">${initials(user.fullName || user.email)}</span><span><strong>${escapeHtml(user.fullName || "Unnamed user")}</strong><small>${escapeHtml(user.email)}</small></span></span>
      <span><i class="role-chip">${escapeHtml(user.role)}</i></span>
      <span><i class="account-status ${user.isActive ? "active" : "inactive"}"><b></b>${user.isActive ? "Active" : "Inactive"}</i></span>
      <span class="joined-date">${new Date(user.createdAt).toLocaleDateString()}</span>
      <span aria-hidden="true">→</span>
    </button>`).join("") : `<div class="user-empty">${query ? "No users match that search." : "No users have been created yet."}</div>`;
}

async function openUserDetail(id) {
  try {
    const [user, assets] = await Promise.all([
      api(`/api/Users/${id}`),
      api(`/api/Users/${id}/assets`)
    ]);
    state.selectedUser = user;
    $("userDetailTitle").textContent = user.fullName || "Unnamed user";
    $("userDetailContent").innerHTML = `
      <div class="user-detail-hero">
        <span class="avatar large">${initials(user.fullName || user.email)}</span>
        <div><strong>${escapeHtml(user.fullName || "Unnamed user")}</strong><span>${escapeHtml(user.email)}</span></div>
      </div>
      <dl class="user-detail-grid">
        <div><dt>Role</dt><dd>${escapeHtml(user.role)}</dd></div>
        <div><dt>Status</dt><dd>${user.isActive ? "Active" : "Inactive"}</dd></div>
        <div><dt>Created</dt><dd>${new Date(user.createdAt).toLocaleString()}</dd></div>
        <div><dt>Last updated</dt><dd>${new Date(user.updatedAt).toLocaleString()}</dd></div>
      </dl>
      <section class="admin-user-editor">
        <div class="user-assets-heading"><div><h3>Account administration</h3><p>Update this user’s identity, access level, and login status.</p></div></div>
        <div class="admin-user-fields">
          <label class="field">Full name<input id="adminUserFullName" value="${escapeHtml(user.fullName || "")}" /></label>
          <label class="field">Email<input id="adminUserEmail" type="email" value="${escapeHtml(user.email)}" required /></label>
          <label class="field">Global role<select id="adminUserRole"><option value="user" ${user.role.toLowerCase() === "user" ? "selected" : ""}>User</option><option value="admin" ${user.role.toLowerCase() === "admin" ? "selected" : ""}>Administrator</option></select></label>
          <label class="field">Login status<select id="adminUserActive"><option value="true" ${user.isActive ? "selected" : ""}>Active</option><option value="false" ${!user.isActive ? "selected" : ""}>Inactive</option></select></label>
        </div>
        <button id="saveUserAdminButton" class="button secondary compact" type="button">Save account</button>
      </section>
      ${renderUserAssets(assets)}`;
    $("userDetailDialog").showModal();
  } catch (error) { toast(error.message, "error"); }
}

async function saveUserAdministration() {
  const user = state.selectedUser;
  if (!user) return;
  const button = $("saveUserAdminButton");
  button.disabled = true;
  button.textContent = "Saving…";
  try {
    const updated = await api(`/api/Users/${user.id}`, {
      method: "PUT",
      body: JSON.stringify({
        fullName: $("adminUserFullName").value.trim(),
        email: $("adminUserEmail").value.trim(),
        role: $("adminUserRole").value,
        isActive: $("adminUserActive").value === "true"
      })
    });
    state.selectedUser = updated;
    state.users = state.users.map(item => item.id === updated.id ? updated : item);
    if (Number(updated.id) === Number(state.user?.id)) {
      state.user = { ...state.user, ...updated, name: updated.fullName || state.user.name };
      localStorage.setItem("taskforge_user", JSON.stringify(state.user));
      renderCurrentUser();
    }
    renderUsers();
    toast("User account updated. Role changes take effect at the next sign-in.");
    await openUserDetail(updated.id);
  } catch (error) {
    toast(error.message, "error");
    button.disabled = false;
    button.textContent = "Save account";
  }
}

function renderUserAssets(assets) {
  const groups = [
    ["Owned projects", assets.ownedProjects, "project"],
    ["Project memberships", assets.memberships, "membership"],
    ["Assigned tasks", assets.assignedTasks, "task"],
    ["Reported tasks", assets.reportedTasks, "task"],
    ["Comments", assets.comments, "task"],
    ["Status changes", assets.statusChanges, "task"],
    ["Attachments", assets.attachments, "task"]
  ].filter(([, items]) => items.length);
  const total = groups.reduce((sum, [, items]) => sum + items.length, 0);

  return `<section class="user-assets">
    <div class="user-assets-heading">
      <div><h3>Assigned assets</h3><p>${total ? "Remove or reassign these records before deleting this user." : "This user has no blocking TaskForge assets."}</p></div>
      <span class="count-pill">${total}</span>
    </div>
    ${groups.length ? `<div class="user-asset-groups">${groups.map(([title, items, type]) => `
      <div class="user-asset-group">
        <h4>${title}<span>${items.length}</span></h4>
        ${items.map(item => type === "project" ? `
          <button type="button" class="user-asset-row" data-asset-project="${item.projectId}">
            <span><strong>${escapeHtml(item.projectName)}</strong><small>Project ID ${item.projectId}</small></span><b>Open →</b>
          </button>` : type === "membership" ? `
          <div class="user-asset-row">
            <span><strong>${escapeHtml(item.projectName)}</strong><small>Project ID ${item.projectId} · Membership</small></span>
            <span class="user-asset-actions">
              <button class="text-button" type="button" data-asset-project="${item.projectId}">Open</button>
              <button class="text-button danger" type="button" data-remove-membership="${item.projectId}">Remove</button>
            </span>
          </div>` : `
          <button type="button" class="user-asset-row" data-asset-task="${item.taskId}" data-asset-project="${item.projectId}" data-asset-board="${item.boardId || ""}">
            <span><strong>${escapeHtml(item.taskTitle)}</strong><small>${escapeHtml(item.projectName)}${item.detail ? ` · ${escapeHtml(item.detail)}` : ""}</small></span><b>Open →</b>
          </button>`).join("")}
      </div>`).join("")}</div>` : `<div class="user-assets-empty">Ready to delete—no assets are assigned to this account.</div>`}
  </section>`;
}

async function removeSelectedUserMembership(projectId) {
  const user = state.selectedUser;
  if (!user || !confirm(`Remove ${user.fullName || user.email} from this project?`)) return;
  try {
    await api(`/api/projects/${projectId}/members/${user.id}`, { method: "DELETE" });
    toast("Project membership removed.");
    await openUserDetail(user.id);
  } catch (error) { toast(error.message, "error"); }
}

async function deleteSelectedUser() {
  const user = state.selectedUser;
  if (!user) return;
  const name = user.fullName || user.email;
  if (!confirm(`Delete "${name}"?\n\nDeletion will only succeed if all projects, memberships, tasks, comments, attachments, and other assets associated with this user have already been removed or reassigned.`)) return;

  const button = $("deleteUserButton");
  button.disabled = true;
  button.textContent = "Checking assets…";
  try {
    await api(`/api/Users/${user.id}`, { method: "DELETE" });
    $("userDetailDialog").close();
    state.selectedUser = null;
    if (Number(user.id) === Number(state.user?.id)) {
      logout(false);
      toast("Your user account was deleted.");
      return;
    }
    await loadUsers();
    toast(`"${name}" was deleted.`);
  } catch (error) {
    toast(error.message, "error");
  } finally {
    button.disabled = false;
    button.textContent = "Delete user";
  }
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

async function openProject(id, { historyMode = "push" } = {}) {
  try {
    state.labelFilter = null;
    [state.project, state.labels] = await Promise.all([
      api(`/api/projects/${id}`),
      api(`/api/projects/${id}/labels`)
    ]);
    const currentMembership = state.project.members.find(member => Number(member.userId) === Number(state.user?.id));
    const canManageProject = state.user?.role === "admin" ||
      Number(state.project.ownerId) === Number(state.user?.id) ||
      ["owner", "admin"].includes(currentMembership?.role?.toLowerCase());
    const canDeleteProject = state.user?.role === "admin" || Number(state.project.ownerId) === Number(state.user?.id);
    $("projectHero").innerHTML = `
      <div class="project-hero-copy"><h2>${escapeHtml(state.project.name)}</h2><p>${escapeHtml(state.project.description || "A focused place for this project's work.")}</p></div>
      ${canDeleteProject ? `<button id="deleteProjectButton" class="button project-delete" type="button">Delete project</button>` : ""}`;
    renderLabels();
    $("boardsGrid").innerHTML = state.project.boards.length ? state.project.boards.map(board => `
      <article class="board-card">
        <button class="card-hit" data-board="${board.id}" aria-label="Open ${escapeHtml(board.name)}"></button>
        <span class="card-icon">▦</span><h3>${escapeHtml(board.name)}</h3>
        <p>${escapeHtml(board.description || "A flexible workflow for your team.")}</p>
        <div class="card-meta">
          <span>${board.columnCount} columns</span>
          ${canManageProject ? `<button class="board-delete" type="button" data-delete-board="${board.id}" aria-label="Delete ${escapeHtml(board.name)}">Delete</button>` : ""}
        </div>
      </article>`).join("") : emptyState("No boards yet", "Create a board with Todo, In Progress, and Done columns.");
    showView("project", { historyMode });
  } catch (error) { toast(error.message, "error"); }
}

function renderLabels() {
  $("labelsGrid").innerHTML = state.labels.length ? state.labels.map(label => `
    <article class="label-card">
      <div class="label-card-main">
        <span class="label-swatch" style="--label-color:${safeColor(label.color)}"></span>
        <div><strong>${escapeHtml(label.name)}</strong><small>${label.taskCount} ${label.taskCount === 1 ? "task" : "tasks"}</small></div>
      </div>
      <div class="label-actions">
        <button class="text-button" type="button" data-edit-label="${label.id}">Edit</button>
        <button class="text-button danger" type="button" data-delete-label="${label.id}">Delete</button>
      </div>
    </article>`).join("") : `<div class="labels-empty">No labels yet. Add one to make tasks easier to scan.</div>`;
}

async function openBoard(id, { historyMode = "push" } = {}) {
  try {
    [state.board, state.tasks] = await Promise.all([api(`/api/boards/${id}`), api(`/api/boards/${id}/tasks`)]);
    state.tasks = await Promise.all(state.tasks.map(task =>
      api(`/api/tasks/${task.id}`).catch(() => task)
    ));
    $("boardTitle").textContent = state.board.name;
    $("boardDescription").textContent = state.board.description || `${state.board.columns.length} stage workflow`;
    renderLabelFilter();
    renderBoard();
    showView("board", { historyMode });
  } catch (error) { toast(error.message, "error"); }
}

function renderLabelFilter() {
  const filter = $("labelFilter");
  filter.innerHTML = `<option value="">All labels</option>${state.labels.map(label =>
    `<option value="${label.id}" ${String(label.id) === String(state.labelFilter || "") ? "selected" : ""}>${escapeHtml(label.name)}</option>`
  ).join("")}`;
  $("clearLabelFilter").classList.toggle("hidden", !state.labelFilter);
}

function renderBoard() {
  const matchingTasks = state.labelFilter
    ? state.tasks.filter(task => (task.labels || []).some(label => label.id === Number(state.labelFilter)))
    : state.tasks;
  $("filterResultCount").textContent = state.labelFilter
    ? `${matchingTasks.length} ${matchingTasks.length === 1 ? "task" : "tasks"}`
    : "";
  $("clearLabelFilter").classList.toggle("hidden", !state.labelFilter);
  $("kanban").innerHTML = state.board.columns.map(column => {
    const tasks = matchingTasks.filter(task => task.boardColumnId === column.id);
    return `<section class="kanban-column">
      <div class="column-head"><h3>${escapeHtml(column.name)}</h3><span class="count-pill">${tasks.length}</span></div>
      ${tasks.map(task => `<button class="task-card" data-task="${task.id}" type="button" aria-label="Edit ${escapeHtml(task.title)}"><div class="task-badges"><span class="priority ${task.priority.toLowerCase()}">${escapeHtml(task.priority)}</span>${(task.labels || []).map(label => `<span class="task-label" style="--label-color:${safeColor(label.color)}">${escapeHtml(label.name)}</span>`).join("")}</div><h4>${escapeHtml(task.title)}</h4><p>${escapeHtml(task.description || "No description")}</p><div class="task-meta">${task.dueDate ? `Due ${new Date(task.dueDate).toLocaleDateString()}` : "No due date"}<span>Edit →</span></div></button>`).join("")}
    </section>`;
  }).join("");
}

function emptyState(title, text) {
  return `<div class="empty-state"><span class="card-icon">＋</span><strong>${title}</strong><p>${text}</p></div>`;
}

function escapeHtml(value = "") {
  return String(value).replace(/[&<>"']/g, char => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;" })[char]);
}

function safeColor(value) {
  return /^#[0-9A-Fa-f]{6}$/.test(value || "") ? value : "#6B7280";
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
    <fieldset class="label-picker">
      <legend>Labels</legend>
      ${state.labels.length ? state.labels.map(label => `<label><input type="checkbox" name="labelIds" value="${label.id}" ${(task.labels || []).some(item => item.id === label.id) ? "checked" : ""} /><span class="label-swatch" style="--label-color:${safeColor(label.color)}"></span>${escapeHtml(label.name)}</label>`).join("") : `<p>No project labels yet. Create labels from the project page first.</p>`}
    </fieldset>
    ${includeComments ? `
      <section class="attachments-section" aria-labelledby="attachmentsHeading">
        <div class="comments-heading"><div><h3 id="attachmentsHeading">Attachments</h3><p>Add files, screenshots, and supporting documents up to 10 MB.</p></div><span id="attachmentCount" class="count-pill">0</span></div>
        <div id="attachmentsList" class="attachments-list"><p class="comments-empty">Loading attachments…</p></div>
        <div class="attachment-uploader">
          <input id="attachmentFile" type="file" aria-label="Choose attachment" />
          <button id="uploadAttachmentButton" class="button secondary compact" type="button">Upload file</button>
        </div>
      </section>
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
  if ((mode === "board" || mode === "label" || mode === "editLabel" || mode === "task" || mode === "editTask") && !state.project) return toast("Choose a project first.", "error");
  if ((mode === "task" || mode === "editTask") && !state.board) return toast("Choose a board first.", "error");
  state.selectedTask = mode === "editTask" ? task : null;
  state.selectedLabel = mode === "editLabel" ? task : null;
  state.dialogMode = mode;
  const configs = {
    project: { eyebrow: "Create project", title: "What are you working on?", submit: "Create project", fields: `
      <label class="field">Project name<input name="name" placeholder="e.g. Mobile app launch" required autofocus /></label>
      <label class="field">Description<textarea name="description" rows="4" placeholder="What does this project aim to accomplish?"></textarea></label>` },
    board: { eyebrow: "Create board", title: "Add a workflow", submit: "Create board", fields: `
      <label class="field">Board name<input name="name" placeholder="e.g. Product delivery" required autofocus /></label>
      <label class="field">Description<textarea name="description" rows="3" placeholder="How will this board be used?"></textarea></label>
      <label class="field">Starting columns<select name="createDefaultColumns"><option value="true">Todo, In Progress, Done</option><option value="false">Start with an empty board</option></select></label>` },
    label: { eyebrow: "Create label", title: "Add a project label", submit: "Create label", fields: labelFields() },
    editLabel: { eyebrow: "Edit label", title: "Update this label", submit: "Save label", fields: labelFields(task) },
    user: { eyebrow: "Create user", title: "Add a workspace account", submit: "Create user", fields: `
      <label class="field">Full name<input name="fullName" maxlength="200" placeholder="e.g. Alex Morgan" autofocus /></label>
      <label class="field">Email address<input name="email" type="email" maxlength="320" placeholder="alex@company.com" required /></label>
      <label class="field">Temporary password<input name="password" type="password" minlength="8" autocomplete="new-password" placeholder="At least 8 characters" required /></label>
      <label class="field">Role<select name="role"><option value="User">User</option><option value="Admin">Administrator</option></select></label>
      <label class="field">Account status<select name="isActive"><option value="true">Active</option><option value="false">Inactive</option></select></label>` },
    task: { eyebrow: "Create task", title: "Add work to the board", submit: "Add task", fields: taskFields() },
    editTask: { eyebrow: "Edit task", title: "Update this task", submit: "Save changes", fields: taskFields(task, true) }
  };
  const config = configs[mode];
  $("dialogEyebrow").textContent = config.eyebrow;
  $("dialogTitle").textContent = config.title;
  $("dialogSubmit").textContent = config.submit;
  $("dialogFields").innerHTML = config.fields;
  $("deleteTaskButton").classList.toggle("hidden", mode !== "editTask");
  $("entityDialog").showModal();
  if (mode === "editTask") {
    loadComments(task.id);
    loadAttachments(task.id);
  }
}

async function deleteSelectedTask() {
  const task = state.selectedTask;
  if (!task || !confirm(`Delete "${task.title}"?\n\nThis permanently deletes the task and its related comments, attachment records, labels, and status history. This action cannot be undone.`)) return;

  const button = $("deleteTaskButton");
  button.disabled = true;
  button.textContent = "Deleting…";
  try {
    await api(`/api/tasks/${task.id}`, { method: "DELETE" });
    $("entityDialog").close();
    state.selectedTask = null;
    await openBoard(state.board.id);
    toast(`"${task.title}" was deleted.`);
  } catch (error) {
    toast(error.message, "error");
    button.disabled = false;
    button.textContent = "Delete task";
  }
}

function labelFields(label = {}) {
  label ??= {};
  return `
    <label class="field">Label name<input name="name" maxlength="100" placeholder="e.g. Bug, Design, Customer request" value="${escapeHtml(label.name || "")}" required autofocus /></label>
    <label class="field">Color<div class="color-field"><input name="color" type="color" value="${safeColor(label.color)}" /><input name="colorText" pattern="#[0-9A-Fa-f]{6}" value="${safeColor(label.color)}" aria-label="Label hex color" /></div></label>`;
}

async function loadComments(taskId) {
  try {
    state.editingCommentId = null;
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
    const canEdit = Number(comment.authorId) === Number(state.user?.id);
    const isEditing = Number(state.editingCommentId) === Number(comment.id);
    return `<article class="comment">
      <div class="avatar">${initials(comment.authorName)}</div>
      <div class="comment-content">
        <div class="comment-meta"><strong>${escapeHtml(comment.authorName)}</strong><time datetime="${comment.createdAt}">${created.toLocaleString([], { dateStyle: "medium", timeStyle: "short" })}</time>${edited ? "<span>edited</span>" : ""}${canEdit && !isEditing ? `<button class="text-button comment-edit-link" type="button" data-edit-comment="${comment.id}">Edit</button>` : ""}</div>
        ${isEditing ? `
          <div class="comment-editor">
            <textarea data-comment-editor="${comment.id}" rows="4" maxlength="4000" aria-label="Edit comment">${escapeHtml(comment.body)}</textarea>
            <div class="comment-editor-actions">
              <button class="text-button" type="button" data-cancel-comment="${comment.id}">Cancel</button>
              <button class="button primary compact" type="button" data-save-comment="${comment.id}">Save comment</button>
            </div>
          </div>` : `<p>${escapeHtml(comment.body).replace(/\n/g, "<br>")}</p>`}
      </div>
    </article>`;
  }).join("") : `<p class="comments-empty">No comments yet. Start the conversation.</p>`;
}

function beginCommentEdit(commentId) {
  state.editingCommentId = Number(commentId);
  renderComments();
  document.querySelector(`[data-comment-editor="${commentId}"]`)?.focus();
}

function cancelCommentEdit() {
  state.editingCommentId = null;
  renderComments();
}

async function saveCommentEdit(commentId) {
  const editor = document.querySelector(`[data-comment-editor="${commentId}"]`);
  const body = editor?.value.trim();
  if (!body) return toast("Comment body cannot be empty.", "error");
  const button = document.querySelector(`[data-save-comment="${commentId}"]`);
  button.disabled = true;
  button.textContent = "Saving…";
  try {
    const updated = await api(`/api/comments/${commentId}`, {
      method: "PUT",
      body: JSON.stringify({ body })
    });
    state.comments = state.comments.map(comment => Number(comment.id) === Number(commentId) ? updated : comment);
    state.editingCommentId = null;
    renderComments();
    toast("Comment updated.");
  } catch (error) {
    toast(error.message, "error");
    button.disabled = false;
    button.textContent = "Save comment";
  }
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

async function loadAttachments(taskId) {
  try {
    state.attachments = await api(`/api/tasks/${taskId}/attachments`);
    renderAttachments();
  } catch (error) {
    $("attachmentsList").innerHTML = `<p class="comments-empty error-text">${escapeHtml(error.message)}</p>`;
  }
}

function renderAttachments() {
  const list = $("attachmentsList");
  if (!list) return;
  $("attachmentCount").textContent = state.attachments.length;
  list.innerHTML = state.attachments.length ? state.attachments.map(attachment => `
    <article class="attachment-item">
      <div class="file-icon" aria-hidden="true">${fileExtension(attachment.fileName)}</div>
      <div class="attachment-info">
        <strong>${escapeHtml(attachment.fileName)}</strong>
        <small>${formatBytes(attachment.sizeBytes)} · ${escapeHtml(attachment.uploadedByName)} · ${new Date(attachment.createdAt).toLocaleDateString()}</small>
      </div>
      <div class="attachment-actions">
        <button class="text-button" type="button" data-download-attachment="${attachment.id}">Download</button>
        <button class="text-button danger" type="button" data-delete-attachment="${attachment.id}">Delete</button>
      </div>
    </article>`).join("") : `<p class="comments-empty">No attachments yet.</p>`;
}

function fileExtension(fileName) {
  const extension = fileName.includes(".") ? fileName.split(".").pop() : "FILE";
  return escapeHtml(extension.slice(0, 4).toUpperCase());
}

function formatBytes(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

async function uploadAttachment() {
  const input = $("attachmentFile");
  const file = input?.files?.[0];
  if (!file) return toast("Choose a file to upload.", "error");
  if (file.size > 10 * 1024 * 1024) return toast("Attachments cannot exceed 10 MB.", "error");

  const button = $("uploadAttachmentButton");
  button.disabled = true;
  button.textContent = "Uploading…";
  const formData = new FormData();
  formData.append("file", file);

  try {
    const attachment = await api(`/api/tasks/${state.selectedTask.id}/attachments`, {
      method: "POST",
      body: formData
    });
    state.attachments.unshift(attachment);
    input.value = "";
    renderAttachments();
    toast("Attachment uploaded.");
  } catch (error) { toast(error.message, "error"); }
  finally {
    button.disabled = false;
    button.textContent = "Upload file";
  }
}

async function downloadAttachment(attachmentId) {
  const attachment = state.attachments.find(item => item.id === Number(attachmentId));
  if (!attachment) return;
  try {
    const response = await fetch(`${API}/api/attachments/${attachment.id}/download`, {
      headers: { Authorization: `Bearer ${state.token}` }
    });
    if (!response.ok) throw new Error(`Download failed (${response.status})`);
    const blob = await response.blob();
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = attachment.fileName;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  } catch (error) { toast(error.message, "error"); }
}

async function deleteAttachment(attachmentId) {
  const attachment = state.attachments.find(item => item.id === Number(attachmentId));
  if (!attachment || !confirm(`Delete "${attachment.fileName}"? This cannot be undone.`)) return;
  try {
    await api(`/api/attachments/${attachment.id}`, { method: "DELETE" });
    state.attachments = state.attachments.filter(item => item.id !== attachment.id);
    renderAttachments();
    toast("Attachment deleted.");
  } catch (error) { toast(error.message, "error"); }
}

async function submitDialog(event) {
  event.preventDefault();
  const formData = new FormData($("entityForm"));
  const values = Object.fromEntries(formData);
  const selectedLabelIds = formData.getAll("labelIds").map(Number);
  delete values.labelIds;
  if (values.colorText) {
    values.color = values.colorText;
    delete values.colorText;
  }
  try {
    if (state.dialogMode === "project") {
      await api("/api/projects", { method: "POST", body: JSON.stringify(values) });
      await loadProjects();
      toast("Project created.");
    } else if (state.dialogMode === "user") {
      values.isActive = values.isActive === "true";
      await api("/api/Users", { method: "POST", body: JSON.stringify(values) });
      await loadUsers();
      toast("User created.");
    } else if (state.dialogMode === "board") {
      values.createDefaultColumns = values.createDefaultColumns === "true";
      await api(`/api/projects/${state.project.id}/boards`, { method: "POST", body: JSON.stringify(values) });
      await openProject(state.project.id);
      toast("Board created.");
    } else if (state.dialogMode === "label" || state.dialogMode === "editLabel") {
      const editing = state.dialogMode === "editLabel";
      await api(editing ? `/api/labels/${state.selectedLabel.id}` : `/api/projects/${state.project.id}/labels`, {
        method: editing ? "PUT" : "POST",
        body: JSON.stringify(values)
      });
      await openProject(state.project.id);
      toast(editing ? "Label updated." : "Label created.");
    } else if (state.dialogMode === "task" || state.dialogMode === "editTask") {
      values.boardColumnId = Number(values.boardColumnId);
      values.dueDate = values.dueDate ? new Date(`${values.dueDate}T12:00:00`).toISOString() : null;
      values.status = state.board.columns.find(c => c.id === values.boardColumnId)?.name || "Todo";
      let savedTask;
      if (state.dialogMode === "editTask") {
        values.assigneeId = state.selectedTask.assigneeId;
        values.position = state.selectedTask.position;
        savedTask = await api(`/api/tasks/${state.selectedTask.id}`, { method: "PUT", body: JSON.stringify(values) });
      } else {
        savedTask = await api(`/api/projects/${state.project.id}/tasks`, { method: "POST", body: JSON.stringify(values) });
      }
      await syncTaskLabels(savedTask.id, selectedLabelIds, state.selectedTask?.labels || []);
      await openBoard(state.board.id);
      const refreshed = state.tasks.find(task => task.id === savedTask.id);
      if (refreshed) refreshed.labels = state.labels.filter(label => selectedLabelIds.includes(label.id));
      renderBoard();
      toast(state.dialogMode === "editTask" ? "Task updated." : "Task added.");
    }
    $("entityDialog").close();
  } catch (error) { toast(error.message, "error"); }
}

async function syncTaskLabels(taskId, selectedIds, existingLabels) {
  const existingIds = existingLabels.map(label => label.id);
  const additions = selectedIds.filter(id => !existingIds.includes(id));
  const removals = existingIds.filter(id => !selectedIds.includes(id));
  await Promise.all([
    ...additions.map(labelId => api(`/api/tasks/${taskId}/labels/${labelId}`, { method: "POST" })),
    ...removals.map(labelId => api(`/api/tasks/${taskId}/labels/${labelId}`, { method: "DELETE" }))
  ]);
}

async function deleteLabel(labelId) {
  const label = state.labels.find(item => item.id === Number(labelId));
  if (!label || !confirm(`Delete the "${label.name}" label? It will be removed from all tasks.`)) return;
  try {
    await api(`/api/labels/${label.id}`, { method: "DELETE" });
    state.labels = state.labels.filter(item => item.id !== label.id);
    renderLabels();
    toast("Label deleted.");
  } catch (error) { toast(error.message, "error"); }
}

async function deleteCurrentProject() {
  if (!state.project) return;
  const project = state.project;
  const confirmed = confirm(`Delete "${project.name}"?\n\nThis permanently deletes the project and all of its boards, tasks, comments, and labels. This action cannot be undone.`);
  if (!confirmed) return;

  const button = $("deleteProjectButton");
  if (button) {
    button.disabled = true;
    button.textContent = "Deleting…";
  }

  try {
    await api(`/api/projects/${project.id}`, { method: "DELETE" });
    state.project = null;
    state.board = null;
    state.tasks = [];
    state.labels = [];
    state.labelFilter = null;
    await loadProjects();
    showView("projects");
    toast(`"${project.name}" was deleted.`);
  } catch (error) {
    toast(error.message, "error");
    if (button) {
      button.disabled = false;
      button.textContent = "Delete project";
    }
  }
}

async function deleteBoard(boardId, button) {
  const board = state.project?.boards.find(item => item.id === Number(boardId));
  if (!board) return;

  try {
    const tasks = await api(`/api/boards/${board.id}/tasks`);
    const activeTaskCount = tasks.filter(task => task.status !== "Done").length;
    if (activeTaskCount > 0) {
      toast(`"${board.name}" has ${activeTaskCount} active ${activeTaskCount === 1 ? "task" : "tasks"}. Move or delete the active work first.`, "error");
      return;
    }

    if (!confirm(`Delete "${board.name}"?\n\nThere are no active tasks. This permanently deletes the board, its columns, and any completed tasks. This action cannot be undone.`)) return;

    if (button) {
      button.disabled = true;
      button.textContent = "Deleting…";
    }
    await api(`/api/boards/${board.id}`, { method: "DELETE" });
    await openProject(state.project.id);
    toast(`"${board.name}" was deleted.`);
  } catch (error) {
    toast(error.message, "error");
    if (button) {
      button.disabled = false;
      button.textContent = "Delete";
    }
  }
}

$("authForm").addEventListener("submit", handleAuth);
$("authToggle").addEventListener("click", () => setAuthMode(state.authMode === "login" ? "register" : "login"));
$("logoutButton").addEventListener("click", () => logout());
$("projectSearch").addEventListener("input", renderProjects);
$("userSearch").addEventListener("input", renderUsers);
$("usersList").addEventListener("click", event => {
  const row = event.target.closest("[data-user]");
  if (row) openUserDetail(row.dataset.user);
});
$("dashboardView").addEventListener("click", event => {
  const row = event.target.closest("[data-dashboard-task]");
  if (row) openDashboardTask(row.dataset.dashboardTask, row.dataset.dashboardProject, row.dataset.dashboardBoard);
});
$("projectsGrid").addEventListener("click", e => e.target.dataset.project && openProject(e.target.dataset.project));
$("projectHero").addEventListener("click", event => {
  if (event.target.id === "deleteProjectButton") deleteCurrentProject();
});
$("boardsGrid").addEventListener("click", event => {
  const deleteButton = event.target.closest("[data-delete-board]");
  if (deleteButton) {
    deleteBoard(deleteButton.dataset.deleteBoard, deleteButton);
    return;
  }
  const boardButton = event.target.closest("[data-board]");
  if (boardButton) openBoard(boardButton.dataset.board);
});
$("labelsGrid").addEventListener("click", event => {
  const editId = event.target.dataset.editLabel;
  const deleteId = event.target.dataset.deleteLabel;
  if (editId) openDialog("editLabel", state.labels.find(label => label.id === Number(editId)));
  if (deleteId) deleteLabel(deleteId);
});
$("kanban").addEventListener("click", e => {
  const card = e.target.closest("[data-task]");
  if (!card) return;
  const task = state.tasks.find(item => item.id === Number(card.dataset.task));
  if (task) api(`/api/tasks/${task.id}`).then(detail => openDialog("editTask", detail)).catch(error => toast(error.message, "error"));
});
$("backToProjects").addEventListener("click", () => history.back());
$("backToProject").addEventListener("click", () => history.back());
$("newBoardButton").addEventListener("click", () => openDialog("board"));
$("newLabelButton").addEventListener("click", () => openDialog("label"));
$("newTaskButton").addEventListener("click", () => openDialog("task"));
$("labelFilter").addEventListener("change", event => {
  state.labelFilter = event.target.value ? Number(event.target.value) : null;
  renderBoard();
});
$("clearLabelFilter").addEventListener("click", () => {
  state.labelFilter = null;
  $("labelFilter").value = "";
  renderBoard();
});
$("primaryAction").addEventListener("click", e => openDialog(e.currentTarget.dataset.action || "project"));
$("entityForm").addEventListener("submit", submitDialog);
$("dialogFields").addEventListener("click", event => {
  if (event.target.id === "postCommentButton") postComment();
  if (event.target.dataset.editComment) beginCommentEdit(event.target.dataset.editComment);
  if (event.target.dataset.cancelComment) cancelCommentEdit();
  if (event.target.dataset.saveComment) saveCommentEdit(event.target.dataset.saveComment);
  if (event.target.id === "uploadAttachmentButton") uploadAttachment();
  if (event.target.dataset.downloadAttachment) downloadAttachment(event.target.dataset.downloadAttachment);
  if (event.target.dataset.deleteAttachment) deleteAttachment(event.target.dataset.deleteAttachment);
});
$("dialogFields").addEventListener("input", event => {
  if (event.target.name === "color") {
    const textInput = $("entityForm").elements.colorText;
    if (textInput) textInput.value = event.target.value.toUpperCase();
  }
  if (event.target.name === "colorText" && /^#[0-9A-Fa-f]{6}$/.test(event.target.value)) {
    const colorInput = $("entityForm").elements.color;
    if (colorInput) colorInput.value = event.target.value;
  }
});
$("dialogClose").addEventListener("click", () => $("entityDialog").close());
$("dialogCancel").addEventListener("click", () => $("entityDialog").close());
$("deleteTaskButton").addEventListener("click", deleteSelectedTask);
$("userDetailClose").addEventListener("click", () => $("userDetailDialog").close());
$("userDetailDone").addEventListener("click", () => $("userDetailDialog").close());
$("deleteUserButton").addEventListener("click", deleteSelectedUser);
$("userDetailContent").addEventListener("click", event => {
  const projectButton = event.target.closest("[data-asset-project]");
  const taskButton = event.target.closest("[data-asset-task]");
  const membershipButton = event.target.closest("[data-remove-membership]");
  if (event.target.id === "saveUserAdminButton") {
    saveUserAdministration();
    return;
  }
  if (membershipButton) {
    removeSelectedUserMembership(membershipButton.dataset.removeMembership);
    return;
  }
  if (projectButton) {
    $("userDetailDialog").close();
    openProject(projectButton.dataset.assetProject);
  }
  if (taskButton) {
    $("userDetailDialog").close();
    openDashboardTask(taskButton.dataset.assetTask, taskButton.dataset.assetProject, taskButton.dataset.assetBoard);
  }
});
$("refreshButton").addEventListener("click", () => {
  if (state.currentView === "dashboard") return loadDashboard();
  if (state.currentView === "users") return loadUsers();
  if (state.currentView === "board" && state.board) return openBoard(state.board.id);
  if (state.currentView === "project" && state.project) return openProject(state.project.id);
  return loadProjects();
});
$("menuButton").addEventListener("click", () => document.querySelector(".sidebar").classList.toggle("open"));
document.querySelectorAll(".nav-item[data-view]").forEach(el => el.addEventListener("click", () => {
  const view = el.dataset.view;
  if (view === "board" && !state.board) return toast("Open a board from a project first.");
  showView(view);
  if (view === "dashboard") loadDashboard();
  if (view === "users") loadUsers();
}));

window.addEventListener("popstate", async event => {
  if (!state.token) return;
  const route = event.state?.taskForge ? event.state : { taskForge: true, view: "dashboard" };
  try {
    if (route.view === "project" && route.projectId) {
      await openProject(route.projectId, { historyMode: "none" });
      return;
    }
    if (route.view === "board" && route.boardId) {
      if (!state.project || Number(state.project.id) !== Number(route.projectId)) {
        await openProject(route.projectId, { historyMode: "none" });
      }
      await openBoard(route.boardId, { historyMode: "none" });
      return;
    }
    showView(route.view || "dashboard", { historyMode: "none" });
    if (route.view === "dashboard") await loadDashboard();
    if (route.view === "users") await loadUsers();
    if (route.view === "projects") await loadProjects();
  } catch (error) {
    toast(error.message, "error");
    showView("dashboard", { historyMode: "replace" });
    await loadDashboard();
  }
});

checkApi();
if (state.token) {
  state.user = { ...(state.user || {}), ...decodeToken(state.token) };
  localStorage.setItem("taskforge_user", JSON.stringify(state.user));
  showApp();
  Promise.all([loadDashboard(), loadProjects()]);
}
