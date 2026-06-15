// ─── CONSTANTS & STATE ──────────────────────────────────────
const API = 'app.php';

const state = {
  expenses: [],
  savingsGoals: [],
  monthlyBudget: 1000,
  categoryBudgets: {
    food: 300, transport: 150, entertainment: 100,
    education: 200, housing: 400, other: 100,
  },
};

const CATEGORY_META = {
  food:          { label: "Food & Dining",    color: "#F97316", dot: "#F97316" },
  transport:     { label: "Transportation",   color: "#3B82F6", dot: "#3B82F6" },
  entertainment: { label: "Entertainment",    color: "#9333EA", dot: "#9333EA" },
  education:     { label: "Education",        color: "#22C55E", dot: "#22C55E" },
  housing:       { label: "Housing",          color: "#EF4444", dot: "#EF4444" },
  other:         { label: "Other",            color: "#6B7280", dot: "#6B7280" },
};

let currentViewMonth = new Date().toISOString().slice(0, 7);
let editingExpenseId = null;

// ─── API HELPER ──────────────────────────────────────────────
async function api(payload) {
  try {
    const res = await fetch(API, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    return await res.json();
  } catch (err) {
    showToast("Network error. Is XAMPP running?", "error");
    return { success: false, error: err.message };
  }
}

// ─── SESSION HELPERS ─────────────────────────────────────────
function getSession() {
  return JSON.parse(sessionStorage.getItem("sft_user") || "null");
}

function setSession(user) {
  sessionStorage.setItem("sft_user", JSON.stringify(user));
}

function clearSession() {
  sessionStorage.removeItem("sft_user");
}

// ─── LOAD ALL DATA FROM DB ───────────────────────────────────
async function load() {
  const user = getSession();
  if (!user) {
    window.location.href = "login.html";
    return;
  }

  showUserInHeader(user.firstName);
  showLoadingState(true);

  const res = await api({ action: 'load_all', userId: user.userId });

  if (!res.success) {
    showToast("Failed to load data.", "error");
    showLoadingState(false);
    return;
  }

  state.expenses = res.expenses.map(e => ({
    id: parseInt(e.id),
    description: e.description,
    amount: parseFloat(e.amount),
    category: e.category,
    date: e.expense_date,
  }));

  state.savingsGoals = res.goals.map(g => ({
    id: parseInt(g.id),
    name: g.name,
    target: parseFloat(g.target),
    deadline: g.deadline,
    saved: parseFloat(g.saved),
  }));

  if (res.budgets) {
    state.monthlyBudget = parseFloat(res.budgets.monthly_budget) || 1000;
    state.categoryBudgets.food          = parseFloat(res.budgets.food)          || 300;
    state.categoryBudgets.transport     = parseFloat(res.budgets.transport)     || 150;
    state.categoryBudgets.entertainment = parseFloat(res.budgets.entertainment) || 100;
    state.categoryBudgets.education     = parseFloat(res.budgets.education)     || 200;
    state.categoryBudgets.housing       = parseFloat(res.budgets.housing)       || 400;
    state.categoryBudgets.other         = parseFloat(res.budgets.other)         || 100;
  }

  showLoadingState(false);
  updateCategoryDropdown();
  renderAll();
}

function showLoadingState(isLoading) {
  const tabs = document.querySelector(".tabs");
  if (tabs) tabs.style.opacity = isLoading ? "0.5" : "1";
}

// ─── AUTHENTICATION ──────────────────────────────────────────
function initAuth() {
  const regForm = document.getElementById("register-form");
  if (regForm) {
    regForm.addEventListener("submit", async e => {
      e.preventDefault();
      const btn = regForm.querySelector("button[type=submit]");
      btn.disabled = true;
      btn.textContent = "Creating account...";

      const firstName = document.getElementById("first-name").value.trim();
      const email     = document.getElementById("reg-email").value.trim();
      const password  = document.getElementById("reg-password").value;

      const res = await api({ action: 'register', firstName, email, password });

      if (res.success) {
        setSession({ userId: res.userId, firstName: res.firstName });
        showToast("Account created! Redirecting...");
        setTimeout(() => window.location.href = "dashboard.html", 800);
      } else {
        showToast(res.error || "Registration failed.", "error");
        btn.disabled = false;
        btn.textContent = "Create My Account";
      }
    });
  }

  const loginForm = document.getElementById("login-form");
  if (loginForm) {
    loginForm.addEventListener("submit", async e => {
      e.preventDefault();
      const btn = loginForm.querySelector("button[type=submit]");
      btn.disabled = true;
      btn.textContent = "Logging in...";

      const email    = document.getElementById("email").value.trim();
      const password = document.getElementById("password").value;

      const res = await api({ action: 'login', email, password });

      if (res.success) {
        setSession({ userId: res.userId, firstName: res.firstName });
        showToast("Welcome back!");
        setTimeout(() => window.location.href = "dashboard.html", 800);
      } else {
        showToast(res.error || "Login failed.", "error");
        btn.disabled = false;
        btn.textContent = "Login to Dashboard";
      }
    });
  }
}

function logout() {
  clearSession();
  window.location.href = "index.html";
}

// ─── EXPENSES ────────────────────────────────────────────────
window.changeViewMonth = function () {
  currentViewMonth = document.getElementById("filter-month").value;
  renderAll();
};

function updateCategoryDropdown() {
  const select = document.getElementById("expense-category");
  if (!select) return;
  select.innerHTML = Object.keys(CATEGORY_META).map(key =>
    `<option value="${key}">${CATEGORY_META[key].label}</option>`
  ).join("");
}

function initExpenseForm() {
  const form = document.getElementById("expense-form");
  if (!form) return;
  document.getElementById("expense-date").valueAsDate = new Date();

  form.addEventListener("submit", async e => {
    e.preventDefault();
    const user = getSession();
    const btn  = document.getElementById("expense-submit-btn");

    const desc   = document.getElementById("expense-description").value.trim();
    const amount = parseFloat(document.getElementById("expense-amount").value);
    const cat    = document.getElementById("expense-category").value;
    const date   = document.getElementById("expense-date").value;

    btn.disabled = true;

    if (editingExpenseId) {
      const res = await api({
        action: 'edit_expense',
        userId: user.userId,
        id: editingExpenseId,
        description: desc,
        amount,
        category: cat,
        date,
      });

      if (res.success) {
        const idx = state.expenses.findIndex(exp => exp.id === editingExpenseId);
        if (idx !== -1) {
          state.expenses[idx] = { id: editingExpenseId, description: desc, amount, category: cat, date };
        }
        editingExpenseId = null;
        btn.innerHTML = `<svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg> Add Expense`;
        showToast("Expense updated!");
      } else {
        showToast("Failed to update expense.", "error");
      }
    } else {
      const res = await api({
        action: 'add_expense',
        userId: user.userId,
        description: desc,
        amount,
        category: cat,
        date,
      });

      if (res.success) {
        state.expenses.unshift({ id: res.id, description: desc, amount, category: cat, date });
        showToast("Expense added!");
      } else {
        showToast("Failed to add expense.", "error");
      }
    }

    btn.disabled = false;
    renderAll();
    form.reset();
    document.getElementById("expense-date").valueAsDate = new Date();
  });
}

window.editExpense = function (id) {
  const exp = state.expenses.find(e => e.id === id);
  if (!exp) return;
  document.getElementById("expense-description").value = exp.description;
  document.getElementById("expense-amount").value      = exp.amount;
  document.getElementById("expense-category").value    = exp.category;
  document.getElementById("expense-date").value        = exp.date;
  editingExpenseId = id;
  document.getElementById("expense-submit-btn").textContent = "Update Expense";
  window.scrollTo({ top: 0, behavior: 'smooth' });
};

async function deleteExpense(id) {
  if (!confirm("Delete this expense?")) return;
  const user = getSession();
  const res  = await api({ action: 'delete_expense', id, userId: user.userId });
  if (res.success) {
    state.expenses = state.expenses.filter(e => e.id !== id);
    renderAll();
    showToast("Expense deleted.", "info");
  } else {
    showToast("Failed to delete.", "error");
  }
}

// ─── BUDGETS ────────────────────────────────────────────────
window.updateMonthlyBudget = async function () {
  const amount = parseFloat(document.getElementById("monthly-budget-input").value);
  if (isNaN(amount) || amount < 0) return;
  const user = getSession();
  const res  = await api({ action: 'update_monthly_budget', userId: user.userId, amount });
  if (res.success) {
    state.monthlyBudget = amount;
    renderBudget(); renderExpenses(); renderInsights();
    showToast("Monthly budget updated!");
  } else {
    showToast("Failed to update budget.", "error");
  }
};

window.updateCategoryBudget = async function (key) {
  const amount = parseFloat(document.getElementById("cat-budget-" + key).value);
  if (isNaN(amount) || amount < 0) return;
  const user = getSession();
  const res  = await api({ action: 'update_budget', userId: user.userId, category: key, amount });
  if (res.success) {
    state.categoryBudgets[key] = amount;
    renderBudget(); renderInsights();
    showToast(`${CATEGORY_META[key].label} budget updated!`);
  } else {
    showToast("Failed to update budget.", "error");
  }
};

// ─── GOALS ───────────────────────────────────────────────────
function initGoalForm() {
  const form = document.getElementById("goal-form");
  if (!form) return;
  form.addEventListener("submit", async e => {
    e.preventDefault();
    const user     = getSession();
    const name     = document.getElementById("goal-name").value.trim();
    const target   = parseFloat(document.getElementById("goal-amount").value);
    const deadline = document.getElementById("goal-deadline").value;

    const res = await api({ action: 'add_goal', userId: user.userId, name, target, deadline });
    if (res.success) {
      state.savingsGoals.push({ id: res.id, name, target, deadline, saved: 0 });
      renderSavings(); renderInsights(); renderAchievements();
      form.reset();
      showToast("Goal created!");
    } else {
      showToast("Failed to create goal.", "error");
    }
  });
}

window.contributeToGoal = async function (id) {
  const amount = parseFloat(document.getElementById("contrib-" + id).value);
  if (isNaN(amount) || amount <= 0) return;
  const user = getSession();
  const res  = await api({ action: 'contribute_goal', userId: user.userId, id, amount });
  if (res.success) {
    const goal = state.savingsGoals.find(g => g.id === id);
    if (goal) {
      goal.saved = res.saved;
      if (goal.saved >= goal.target) {
        showToast(`🎉 Goal achieved: ${goal.name}!`);
      } else {
        showToast(`Added $${amount.toFixed(2)}!`);
      }
    }
    renderSavings(); renderInsights(); renderAchievements();
  } else {
    showToast("Failed to contribute.", "error");
  }
};

window.deleteGoal = async function (id) {
  if (!confirm("Delete this goal?")) return;
  const user = getSession();
  const res  = await api({ action: 'delete_goal', userId: user.userId, id });
  if (res.success) {
    state.savingsGoals = state.savingsGoals.filter(g => g.id !== id);
    renderSavings(); renderInsights(); renderAchievements();
    showToast("Goal deleted.");
  } else {
    showToast("Failed to delete goal.", "error");
  }
};

// ─── RENDERING UTILITIES ─────────────────────────────────────
function fmt(amount) { return "$" + Number(amount).toFixed(2); }
function clamp(val, min, max) { return Math.min(Math.max(val, min), max); }
function escHtml(str) {
  return String(str).replace(/[&<>"']/g, m =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[m]
  );
}

function getMonthExpenses() {
  return state.expenses.filter(e => e.date && e.date.startsWith(currentViewMonth));
}

function totalSpentThisMonth() {
  return getMonthExpenses().reduce((sum, e) => sum + e.amount, 0);
}

function spentByCategory() {
  const result = {};
  Object.keys(CATEGORY_META).forEach(k => result[k] = 0);
  getMonthExpenses().forEach(e => {
    if (result[e.category] !== undefined) result[e.category] += e.amount;
    else result["other"] += e.amount;
  });
  return result;
}

function showToast(msg, type = "success") {
  const existing = document.querySelector(".toast");
  if (existing) existing.remove();
  const toast = document.createElement("div");
  toast.className = "toast toast-" + type;
  toast.textContent = msg;
  document.body.appendChild(toast);
  setTimeout(() => toast.classList.add("toast-visible"), 10);
  setTimeout(() => {
    toast.classList.remove("toast-visible");
    setTimeout(() => toast.remove(), 300);
  }, 3000);
}

function initTabs() {
  document.querySelectorAll(".tab-btn").forEach(btn => {
    btn.addEventListener("click", () => {
      const tab = btn.dataset.tab;
      document.querySelectorAll(".tab-btn").forEach(b => b.classList.remove("active"));
      document.querySelectorAll(".tab-content").forEach(c => c.classList.remove("active"));
      btn.classList.add("active");
      document.getElementById(tab).classList.add("active");
    });
  });
}

function showUserInHeader(firstName) {
  const header = document.querySelector(".dashboard-header");
  if (!header || !firstName) return;
  const existing = document.querySelector(".user-greeting");
  if (existing) existing.remove();
  const greeting = document.createElement("div");
  greeting.className = "user-greeting";
  greeting.innerHTML = `<span>👋 Hi, <strong>${escHtml(firstName)}</strong></span> <button class="btn btn-sm btn-outline" onclick="logout()">Logout</button>`;
  header.appendChild(greeting);
}

// ─── RENDER FUNCTIONS ────────────────────────────────────────
function renderExpenses() {
  const d = new Date(currentViewMonth + "-01T00:00:00");
  document.getElementById("current-month").textContent = d.toLocaleString("default", { month: "long", year: "numeric" });
  document.getElementById("filter-month").value = currentViewMonth;

  const spent = totalSpentThisMonth();
  const budget = state.monthlyBudget;
  const remaining = budget - spent;
  const pct = budget > 0 ? clamp((spent / budget) * 100, 0, 100) : 0;

  document.getElementById("total-spent").textContent = fmt(spent);
  document.getElementById("remaining-budget").textContent = fmt(remaining);
  document.getElementById("budget-progress").style.width = pct + "%";
  document.getElementById("budget-percentage").textContent = pct.toFixed(0) + "% of monthly budget used";
  document.getElementById("remaining-box").style.background = remaining < 0
    ? "linear-gradient(135deg, #EF4444 0%, #DC2626 100%)"
    : "linear-gradient(135deg, #22C55E 0%, #10B981 100%)";

  const list = document.getElementById("expenses-list");
  const monthData = getMonthExpenses();
  if (monthData.length === 0) {
    list.innerHTML = `<div class="empty-state"><p>📭 No expenses yet for this month</p></div>`;
    return;
  }

  list.innerHTML = monthData.map(expense => {
    const meta = CATEGORY_META[expense.category] || CATEGORY_META.other;
    const dt   = new Date(expense.date + "T00:00:00");
    return `
      <div class="expense-item" id="exp-${expense.id}">
        <div class="expense-info">
          <div class="expense-header">
            <span class="expense-title">${escHtml(expense.description)}</span>
            <span class="expense-category" style="background:${meta.color}22;color:${meta.color}">${meta.label}</span>
          </div>
          <div class="expense-date">📅 ${dt.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}</div>
        </div>
        <div class="expense-actions">
          <span class="expense-amount">${fmt(expense.amount)}</span>
          <button class="btn-delete" style="color:#3B82F6" onclick="editExpense(${expense.id})" title="Edit">✎</button>
          <button class="btn-delete" onclick="deleteExpense(${expense.id})" title="Delete">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <polyline points="3 6 5 6 21 6"/>
              <path d="M19 6l-1 14H6L5 6"/>
              <path d="M10 11v6"/><path d="M14 11v6"/>
              <path d="M9 6V4h6v2"/>
            </svg>
          </button>
        </div>
      </div>`;
  }).join("");
}

function renderBudget() {
  const d = new Date(currentViewMonth + "-01T00:00:00");
  document.getElementById("budget-month").textContent = d.toLocaleString("default", { month: "long", year: "numeric" });
  document.getElementById("monthly-budget-input").value = state.monthlyBudget;

  const spent = totalSpentThisMonth();
  const budget = state.monthlyBudget;
  const remaining = budget - spent;
  const pct = budget > 0 ? clamp((spent / budget) * 100, 0, 100) : 0;

  document.getElementById("budget-total-spent").textContent = fmt(spent);
  document.getElementById("budget-used-percent").textContent = pct.toFixed(0) + "% used";
  document.getElementById("budget-remaining-amount").textContent = fmt(remaining) + " remaining";
  document.getElementById("budget-overview-progress").style.width = pct + "%";

  const byCategory = spentByCategory();
  document.getElementById("categories-list").innerHTML = Object.keys(CATEGORY_META).map(key => {
    const meta = CATEGORY_META[key];
    const catBudget = state.categoryBudgets[key] || 0;
    const catSpent  = byCategory[key] || 0;
    const catPct    = catBudget > 0 ? clamp((catSpent / catBudget) * 100, 0, 100) : 0;
    const isOver    = catSpent > catBudget && catBudget > 0;

    return `
      <div class="category-item">
        <div class="category-header">
          <div class="category-name-group">
            <div class="category-dot" style="background:${meta.dot}"></div>
            <div>
              <div class="category-name">${meta.label}</div>
              <div class="category-amount">${fmt(catSpent)} of ${fmt(catBudget)} budget</div>
            </div>
          </div>
          <div style="text-align:right">
            <div class="budget-edit-group">
              <input type="number" id="cat-budget-${key}" value="${catBudget}" step="0.01" style="width:100px">
              <button class="btn btn-sm" onclick="updateCategoryBudget('${key}')">Set</button>
            </div>
            ${isOver ? `<div class="over-budget" style="font-size:0.75rem;margin-top:0.25rem">⚠ Over by ${fmt(catSpent - catBudget)}</div>` : ""}
          </div>
        </div>
        <div class="category-progress">
          <div class="progress-bar" style="margin:0.25rem 0">
            <div class="progress-fill ${isOver ? "over-budget" : ""}" style="width:${catPct}%;background:${meta.color}"></div>
          </div>
          <div class="category-stats">
            <span>${catPct.toFixed(0)}% used</span>
            <span>${fmt(Math.max(catBudget - catSpent, 0))} left</span>
          </div>
        </div>
      </div>`;
  }).join("");
}

function renderSavings() {
  const goals = state.savingsGoals;
  const totalSaved  = goals.reduce((s, g) => s + g.saved, 0);
  const totalTarget = goals.reduce((s, g) => s + g.target, 0);
  const pct = totalTarget > 0 ? clamp((totalSaved / totalTarget) * 100, 0, 100) : 0;

  document.getElementById("total-savings").textContent  = fmt(totalSaved);
  document.getElementById("total-targets").textContent  = fmt(totalTarget);
  document.getElementById("savings-progress").style.width = pct + "%";
  document.getElementById("savings-percentage").textContent = pct.toFixed(0) + "% of all goals tracked";

  const activeGoals = goals.filter(g => g.saved < g.target);
  document.getElementById("active-goals-count").textContent = activeGoals.length;

  const list = document.getElementById("goals-list");
  if (activeGoals.length === 0) {
    list.innerHTML = `<div class="empty-state"><p>🎯 No active savings goals</p></div>`;
    return;
  }

  list.innerHTML = activeGoals.map(goal => {
    const goalPct = goal.target > 0 ? clamp((goal.saved / goal.target) * 100, 0, 100) : 0;
    return `
      <div class="goal-item" id="goal-${goal.id}">
        <div class="goal-header">
          <div class="goal-info">
            <h4>${escHtml(goal.name)}</h4>
            <p>Target: ${fmt(goal.target)} ${goal.deadline ? `· Deadline: ${goal.deadline}` : ''}</p>
          </div>
          <button class="btn-delete" onclick="deleteGoal(${goal.id})">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <polyline points="3 6 5 6 21 6"/>
              <path d="M19 6l-1 14H6L5 6"/>
            </svg>
          </button>
        </div>
        <div class="goal-progress">
          <div class="goal-progress-header">
            <span style="font-weight:600">${fmt(goal.saved)} saved</span>
            <span>${goalPct.toFixed(0)}%</span>
          </div>
          <div class="progress-bar" style="margin:0.25rem 0">
            <div class="progress-fill" style="width:${goalPct}%;background:#3B82F6"></div>
          </div>
        </div>
        <div class="goal-contribution">
          <input type="number" id="contrib-${goal.id}" placeholder="Add ($)" step="0.01">
          <button class="btn btn-sm btn-primary" onclick="contributeToGoal(${goal.id})">Add</button>
        </div>
      </div>`;
  }).join("");
}

function renderAchievements() {
  const list = document.getElementById("completed-goals-list");
  if (!list) return;

  const completedGoals = state.savingsGoals.filter(g => g.saved >= g.target);
  if (completedGoals.length === 0) {
    list.innerHTML = `<div class="empty-state"><p>🏆 No completed goals yet. Keep saving!</p></div>`;
    return;
  }

  list.innerHTML = completedGoals.map(goal => `
    <div class="goal-item completed-achievement">
      <div class="goal-header" style="margin-bottom:0;">
        <div class="goal-info">
          <h4 style="color:#D97706;display:flex;align-items:center;gap:0.5rem;">
            <span>🏆</span> ${escHtml(goal.name)}
          </h4>
          <p style="margin-top:0.25rem;">Target Reached: ${fmt(goal.target)}</p>
        </div>
        <div style="display:flex;align-items:center;gap:1rem;">
          <div style="background:#FEF3C7;color:#B45309;padding:0.5rem 1rem;border-radius:9999px;font-weight:bold;font-size:0.875rem;">
            Completed ✓
          </div>
          <button class="btn-delete" onclick="deleteGoal(${goal.id})" title="Delete Record">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <polyline points="3 6 5 6 21 6"/>
              <path d="M19 6l-1 14H6L5 6"/>
            </svg>
          </button>
        </div>
      </div>
    </div>`
  ).join("");
}

function renderInsights() {
  const content = document.getElementById("insights-content");
  if (state.expenses.length === 0) {
    content.innerHTML = `<div class="empty-state"><p>📊 No data yet. Add expenses to see insights.</p></div>`;
    return;
  }

  content.innerHTML = `
    <canvas id="expenseChart" style="width:100%;max-height:300px;margin-bottom:2rem;"></canvas>
    <div id="insight-text-list"></div>
  `;

  const ctx = document.getElementById('expenseChart');
  const monthlyData = {};
  state.expenses.forEach(e => {
    const month = e.date.slice(0, 7);
    monthlyData[month] = (monthlyData[month] || 0) + e.amount;
  });

  const labels = Object.keys(monthlyData).sort();
  const data   = labels.map(m => monthlyData[m]);

  if (window.chartInstance) window.chartInstance.destroy();
  window.chartInstance = new Chart(ctx, {
    type: 'bar',
    data: {
      labels,
      datasets: [{ label: 'Total Spend ($)', data, backgroundColor: '#3B82F6', borderRadius: 4 }]
    },
    options: { responsive: true }
  });

  const spent  = totalSpentThisMonth();
  const budget = state.monthlyBudget;
  const insights = [];

  if (budget > 0) {
    const pct = (spent / budget) * 100;
    if (pct >= 100)
      insights.push({ dot: "red",    text: `You've exceeded your monthly budget by ${fmt(spent - budget)}.` });
    else if (pct >= 80)
      insights.push({ dot: "orange", text: `You're at ${pct.toFixed(0)}% of your monthly budget. Tread carefully!` });
    else
      insights.push({ dot: "green",  text: `Great job! You've used ${pct.toFixed(0)}% of your budget this month.` });
  }

  document.getElementById("insight-text-list").innerHTML = insights.map(i =>
    `<div class="insight-item"><div class="insight-dot ${i.dot}"></div><p class="insight-text">${i.text}</p></div>`
  ).join("");
}

function renderAll() {
  renderExpenses();
  renderBudget();
  renderSavings();
  renderAchievements();
  renderInsights();
}

// ─── INITIALIZE ──────────────────────────────────────────────
document.addEventListener("DOMContentLoaded", () => {
  initAuth();
  if (document.getElementById("expenses")) {
    initTabs();
    initExpenseForm();
    initGoalForm();
    load();
  }
});