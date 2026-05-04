// ============================================================
// Student Finance Tracker - app.js (LocalStorage Backend)
// ============================================================

const state = {
  expenses: [],
  savingsGoals: [],
  monthlyBudget: 1000,
  categoryBudgets: {
    food: 300, transport: 150, entertainment: 100,
    education: 200, housing: 400, other: 100,
  },
  customCategories: {}, // Stores user-added categories
  lastProcessedMonth: null // Used for auto-savings rollover
};

const CATEGORY_META = {
  food:          { label: "Food & Dining",    color: "#F97316", dot: "#F97316" },
  transport:     { label: "Transportation",   color: "#3B82F6", dot: "#3B82F6" },
  entertainment: { label: "Entertainment",    color: "#9333EA", dot: "#9333EA" },
  education:     { label: "Education",        color: "#22C55E", dot: "#22C55E" },
  housing:       { label: "Housing",          color: "#EF4444", dot: "#EF4444" },
  other:         { label: "Other",            color: "#6B7280", dot: "#6B7280" },
};

let currentViewMonth = new Date().toISOString().slice(0, 7); // Defaults to YYYY-MM
let editingExpenseId = null;

// ─── LOCAL STORAGE "DATABASE" ────────────────────────────────
function save() {
  const user = JSON.parse(localStorage.getItem("sft_current_user"));
  if (!user) return;
  const dbKey = `sft_data_${user.email}`;
  localStorage.setItem(dbKey, JSON.stringify(state));
}

function load() {
  const user = JSON.parse(localStorage.getItem("sft_current_user"));
  if (!user) {
    if (document.getElementById("expenses")) window.location.href = "login.html";
    return;
  }
  
  const savedData = localStorage.getItem(`sft_data_${user.email}`);
  if (savedData) {
    const parsed = JSON.parse(savedData);
    state.expenses = parsed.expenses || [];
    state.savingsGoals = parsed.savingsGoals || [];
    state.monthlyBudget = parsed.monthlyBudget || 1000;
    if (parsed.categoryBudgets) state.categoryBudgets = parsed.categoryBudgets;
    if (parsed.customCategories) state.customCategories = parsed.customCategories;
    if (parsed.lastProcessedMonth) state.lastProcessedMonth = parsed.lastProcessedMonth;
  }
  
  Object.assign(CATEGORY_META, state.customCategories); // Inject custom categories into META
  showUserInHeader(user.firstName);
  updateCategoryDropdown();
  processAutoSavings(); // Check for month rollover
  renderAll();
}

// ─── AUTO-SAVINGS (MONTH ROLLOVER) ───────────────────────────
function processAutoSavings() {
    const currentMonth = new Date().toISOString().slice(0, 7);
    if (!state.lastProcessedMonth) {
        state.lastProcessedMonth = currentMonth;
        save();
        return;
    }
    
    // If we've entered a new month
    if (state.lastProcessedMonth < currentMonth) {
        const lastMonthExpenses = state.expenses.filter(e => e.date.startsWith(state.lastProcessedMonth));
        const spent = lastMonthExpenses.reduce((s, e) => s + e.amount, 0);
        const remaining = state.monthlyBudget - spent;

        if (remaining > 0) {
            let autoGoal = state.savingsGoals.find(g => g.name === "Auto-Rollover Savings");
            if (!autoGoal) {
                autoGoal = { id: Date.now(), name: "Auto-Rollover Savings", target: 0, deadline: '', saved: 0 };
                state.savingsGoals.push(autoGoal);
            }
            autoGoal.target += remaining; 
            autoGoal.saved += remaining;
            showToast(`Month ended! $${remaining} auto-saved from last month.`, "success");
        }
        state.lastProcessedMonth = currentMonth;
        save();
    }
}

// ─── AUTHENTICATION ──────────────────────────────────────────
function initAuth() {
  const regForm = document.getElementById("register-form");
  if (regForm) {
    regForm.addEventListener("submit", e => {
      e.preventDefault();
      const firstName = document.getElementById("first-name").value.trim();
      const email     = document.getElementById("reg-email").value.trim();
      const password  = document.getElementById("reg-password").value;

      const users = JSON.parse(localStorage.getItem("sft_users") || "[]");
      if (users.find(u => u.email === email)) {
        showToast("Email already exists!", "error");
        return;
      }

      users.push({ firstName, email, password });
      localStorage.setItem("sft_users", JSON.stringify(users));
      localStorage.setItem("sft_current_user", JSON.stringify({ firstName, email }));
      
      showToast("Account created! Redirecting...");
      setTimeout(() => window.location.href = "dashboard.html", 800);
    });
  }

  const loginForm = document.getElementById("login-form");
  if (loginForm) {
    loginForm.addEventListener("submit", e => {
      e.preventDefault();
      const email    = document.getElementById("email").value.trim();
      const password = document.getElementById("password").value;
      
      const users = JSON.parse(localStorage.getItem("sft_users") || "[]");
      const user  = users.find(u => u.email === email && u.password === password);

      if (user) {
        localStorage.setItem("sft_current_user", JSON.stringify({ firstName: user.firstName, email: user.email }));
        showToast("Welcome back!");
        setTimeout(() => window.location.href = "dashboard.html", 800);
      } else {
        showToast("Invalid credentials.", "error");
      }
    });
  }
}

function logout() {
  localStorage.removeItem("sft_current_user");
  window.location.href = "index.html";
}

// ─── EXPENSES ────────────────────────────────────────────────
window.changeViewMonth = function() {
    currentViewMonth = document.getElementById("filter-month").value;
    renderAll();
}

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

  form.addEventListener("submit", e => {
    e.preventDefault();
    const desc   = document.getElementById("expense-description").value.trim();
    const amount = parseFloat(document.getElementById("expense-amount").value);
    const cat    = document.getElementById("expense-category").value;
    const date   = document.getElementById("expense-date").value;

    if (editingExpenseId) {
        const idx = state.expenses.findIndex(exp => exp.id === editingExpenseId);
        if (idx !== -1) {
            state.expenses[idx] = { id: editingExpenseId, description: desc, amount, category: cat, date };
        }
        editingExpenseId = null;
        document.getElementById("expense-submit-btn").innerHTML = `<svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg> Add Expense`;
        showToast("Expense updated!");
    } else {
        state.expenses.unshift({ id: Date.now(), description: desc, amount, category: cat, date });
        showToast("Expense added!");
    }
    
    save();
    renderAll();
    form.reset();
    document.getElementById("expense-date").valueAsDate = new Date();
  });
}

window.editExpense = function(id) {
    const exp = state.expenses.find(e => e.id === id);
    if(!exp) return;
    
    document.getElementById("expense-description").value = exp.description;
    document.getElementById("expense-amount").value = exp.amount;
    document.getElementById("expense-category").value = exp.category;
    document.getElementById("expense-date").value = exp.date;
    
    editingExpenseId = id;
    document.getElementById("expense-submit-btn").innerHTML = `Update Expense`;
    window.scrollTo({ top: 0, behavior: 'smooth' });
}

function deleteExpense(id) {
  if (!confirm("Delete this expense?")) return;
  state.expenses = state.expenses.filter(e => e.id !== id);
  save();
  renderAll();
  showToast("Expense deleted.", "info");
}

// ─── BUDGETS ─────────────────────────────────────────────────
window.updateMonthlyBudget = function() {
  const amount = parseFloat(document.getElementById("monthly-budget-input").value);
  if (!isNaN(amount) && amount >= 0) {
    state.monthlyBudget = amount;
    save(); renderBudget(); renderExpenses(); renderInsights();
    showToast("Monthly budget updated!");
  }
};

window.updateCategoryBudget = function(key) {
  const amount = parseFloat(document.getElementById("cat-budget-" + key).value);
  if (!isNaN(amount) && amount >= 0) {
    state.categoryBudgets[key] = amount;
    save(); renderBudget(); renderInsights();
    showToast(`${CATEGORY_META[key].label} budget updated!`);
  }
};

window.addNewCategory = function() {
    const name = document.getElementById("new-category-name").value.trim();
    if (!name) return;
    
    const key = name.toLowerCase().replace(/[^a-z0-9]/g, '');
    if (CATEGORY_META[key]) {
        showToast("Category already exists!", "error");
        return;
    }
    
    const colors = ['#F43F5E', '#8B5CF6', '#14B8A6', '#F59E0B', '#EC4899', '#0EA5E9'];
    const color = colors[Object.keys(CATEGORY_META).length % colors.length];
    
    state.customCategories[key] = { label: name, color: color, dot: color };
    state.categoryBudgets[key] = 0; // Default budget amount
    
    Object.assign(CATEGORY_META, state.customCategories); // Refresh runtime META
    save(); 
    updateCategoryDropdown();
    renderBudget(); 
    renderInsights();
    
    document.getElementById("new-category-name").value = '';
    showToast("Category added!");
}

// ─── GOALS ───────────────────────────────────────────────────
function initGoalForm() {
  const form = document.getElementById("goal-form");
  if (!form) return;
  form.addEventListener("submit", e => {
    e.preventDefault();
    const name     = document.getElementById("goal-name").value.trim();
    const target   = parseFloat(document.getElementById("goal-amount").value);
    const deadline = document.getElementById("goal-deadline").value;

    state.savingsGoals.push({ id: Date.now(), name, target, deadline, saved: 0 });
    save(); renderSavings(); renderInsights(); form.reset();
    showToast("Goal created!");
  });
}

window.contributeToGoal = function(id) {
  const amount = parseFloat(document.getElementById("contrib-" + id).value);
  if (isNaN(amount) || amount <= 0) return;
  const goal = state.savingsGoals.find(g => g.id === id);
  if (goal) {
    goal.saved = Math.min(goal.saved + amount, goal.target);
    save(); renderSavings(); renderInsights();
    showToast(`Added $${amount}!`);
  }
};

window.deleteGoal = function(id) {
  if (!confirm("Delete goal?")) return;
  state.savingsGoals = state.savingsGoals.filter(g => g.id !== id);
  save(); renderSavings(); renderInsights();
  showToast("Goal deleted.");
};

// ─── RENDERING & UTILITIES ───────────────────────────────────
function fmt(amount) { return "$" + Number(amount).toFixed(2); }
function clamp(val, min, max) { return Math.min(Math.max(val, min), max); }
function escHtml(str) { return String(str).replace(/[&<>"']/g, m => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[m]); }

function getMonthExpenses() {
  // Uses selected view month to fetch expenses
  return state.expenses.filter(e => e.date.startsWith(currentViewMonth));
}

function totalSpentThisMonth() {
  return getMonthExpenses().reduce((sum, e) => sum + e.amount, 0);
}

function spentByCategory() {
  const result = {}; Object.keys(CATEGORY_META).forEach(k => result[k] = 0);
  getMonthExpenses().forEach(e => {
    if (result[e.category] !== undefined) result[e.category] += e.amount;
    else result["other"] += e.amount;
  }); return result;
}

function showToast(msg, type = "success") {
  const existing = document.querySelector(".toast"); if (existing) existing.remove();
  const toast = document.createElement("div"); toast.className = "toast toast-" + type; toast.textContent = msg;
  document.body.appendChild(toast);
  setTimeout(() => toast.classList.add("toast-visible"), 10);
  setTimeout(() => { toast.classList.remove("toast-visible"); setTimeout(() => toast.remove(), 300); }, 3000);
}

function initTabs() {
  document.querySelectorAll(".tab-btn").forEach(btn => {
    btn.addEventListener("click", () => {
      const tab = btn.dataset.tab;
      document.querySelectorAll(".tab-btn").forEach(b => b.classList.remove("active"));
      document.querySelectorAll(".tab-content").forEach(c => c.classList.remove("active"));
      btn.classList.add("active"); document.getElementById(tab).classList.add("active");
    });
  });
}

function showUserInHeader(firstName) {
  const header = document.querySelector(".dashboard-header"); if (!header || !firstName) return;
  const existing = document.querySelector(".user-greeting"); if(existing) existing.remove();
  const greeting = document.createElement("div"); greeting.className = "user-greeting";
  greeting.innerHTML = `<span>👋 Hi, <strong>${escHtml(firstName)}</strong></span> <button class="btn btn-sm btn-outline" onclick="logout()">Logout</button>`;
  header.appendChild(greeting);
}

function renderExpenses() {
  const d = new Date(currentViewMonth + "-01T00:00:00");
  document.getElementById("current-month").textContent = d.toLocaleString("default", { month: "long", year: "numeric" });
  document.getElementById("filter-month").value = currentViewMonth;

  const spent = totalSpentThisMonth(); const budget = state.monthlyBudget;
  const remaining = budget - spent; const pct = budget > 0 ? clamp((spent / budget) * 100, 0, 100) : 0;
  
  document.getElementById("total-spent").textContent = fmt(spent); 
  document.getElementById("remaining-budget").textContent = fmt(remaining);
  document.getElementById("budget-progress").style.width = pct + "%"; 
  document.getElementById("budget-percentage").textContent = pct.toFixed(0) + "% of monthly budget used";
  document.getElementById("remaining-box").style.background = remaining < 0 ? "linear-gradient(135deg, #EF4444 0%, #DC2626 100%)" : "linear-gradient(135deg, #22C55E 0%, #10B981 100%)";
  
  const list = document.getElementById("expenses-list");
  const monthData = getMonthExpenses();
  if (monthData.length === 0) { list.innerHTML = `<div class="empty-state"><p>📭 No expenses yet</p></div>`; return; }
  
  list.innerHTML = monthData.map(expense => {
    const meta = CATEGORY_META[expense.category] || CATEGORY_META.other;
    const dt = new Date(expense.date + "T00:00:00");
    return `<div class="expense-item" id="exp-${expense.id}"><div class="expense-info"><div class="expense-header"><span class="expense-title">${escHtml(expense.description)}</span><span class="expense-category" style="background:${meta.color}22;color:${meta.color}">${meta.label}</span></div><div class="expense-date">📅 ${dt.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}</div></div><div class="expense-actions"><span class="expense-amount">${fmt(expense.amount)}</span>
    <button class="btn-delete" style="color: #3B82F6" onclick="editExpense(${expense.id})" title="Edit">✎</button>
    <button class="btn-delete" onclick="deleteExpense(${expense.id})" title="Delete"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4h6v2"/></svg></button></div></div>`;
  }).join("");
}

function renderBudget() {
  const d = new Date(currentViewMonth + "-01T00:00:00");
  document.getElementById("budget-month").textContent = d.toLocaleString("default", { month: "long", year: "numeric" });
  document.getElementById("monthly-budget-input").value = state.monthlyBudget;
  const spent = totalSpentThisMonth(); const budget = state.monthlyBudget;
  const remaining = budget - spent; const pct = budget > 0 ? clamp((spent / budget) * 100, 0, 100) : 0;
  
  document.getElementById("budget-total-spent").textContent = fmt(spent); 
  document.getElementById("budget-used-percent").textContent = pct.toFixed(0) + "% used";
  document.getElementById("budget-remaining-amount").textContent = fmt(remaining) + " remaining";
  document.getElementById("budget-overview-progress").style.width = pct + "%";
  
  const byCategory = spentByCategory();
  document.getElementById("categories-list").innerHTML = Object.keys(CATEGORY_META).map(key => {
    const meta = CATEGORY_META[key]; const catBudget = state.categoryBudgets[key] || 0;
    const catSpent = byCategory[key] || 0; const catPct = catBudget > 0 ? clamp((catSpent / catBudget) * 100, 0, 100) : 0;
    const isOver = catSpent > catBudget && catBudget > 0;
    return `<div class="category-item"><div class="category-header"><div class="category-name-group"><div class="category-dot" style="background:${meta.dot}"></div><div><div class="category-name">${meta.label}</div><div class="category-amount">${fmt(catSpent)} of ${fmt(catBudget)} budget</div></div></div><div style="text-align:right"><div class="budget-edit-group"><input type="number" id="cat-budget-${key}" value="${catBudget}" step="0.01" style="width:100px"><button class="btn btn-sm" onclick="updateCategoryBudget('${key}')">Set</button></div>${isOver ? `<div class="over-budget" style="font-size:0.75rem;margin-top:0.25rem">⚠ Over budget by ${fmt(catSpent - catBudget)}</div>` : ""}</div></div><div class="category-progress"><div class="progress-bar" style="margin:0.25rem 0"><div class="progress-fill ${isOver ? "over-budget" : ""}" style="width:${catPct}%;background:${meta.color}"></div></div><div class="category-stats"><span>${catPct.toFixed(0)}% used</span><span>${fmt(Math.max(catBudget - catSpent, 0))} left</span></div></div></div>`;
  }).join("");
}

function renderSavings() {
  const goals = state.savingsGoals;
  const totalSaved = goals.reduce((s, g) => s + g.saved, 0); const totalTarget = goals.reduce((s, g) => s + g.target, 0);
  const pct = totalTarget > 0 ? clamp((totalSaved / totalTarget) * 100, 0, 100) : 0;
  
  document.getElementById("total-savings").textContent = fmt(totalSaved); 
  document.getElementById("total-targets").textContent = fmt(totalTarget);
  document.getElementById("savings-progress").style.width = pct + "%"; 
  document.getElementById("savings-percentage").textContent = pct.toFixed(0) + "% of total goals";
  document.getElementById("active-goals-count").textContent = goals.filter(g => g.saved < g.target).length;
  
  const list = document.getElementById("goals-list");
  if (goals.length === 0) { list.innerHTML = `<div class="empty-state"><p>🎯 No savings goals yet</p></div>`; return; }
  
  list.innerHTML = goals.map(goal => {
    const goalPct = goal.target > 0 ? clamp((goal.saved / goal.target) * 100, 0, 100) : 0;
    const isComplete = goal.saved >= goal.target;
    return `<div class="goal-item" id="goal-${goal.id}"><div class="goal-header"><div class="goal-info"><h4>${escHtml(goal.name)} ${isComplete ? "✅" : ""}</h4><p>Target: ${fmt(goal.target)}</p></div><button class="btn-delete" onclick="deleteGoal(${goal.id})"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6"/></svg></button></div><div class="goal-progress"><div class="goal-progress-header"><span style="font-weight:600">${fmt(goal.saved)} saved</span><span>${goalPct.toFixed(0)}%</span></div><div class="progress-bar" style="margin:0.25rem 0"><div class="progress-fill" style="width:${goalPct}%;background:${isComplete ? "#22C55E" : "#3B82F6"}"></div></div></div>${!isComplete ? `<div class="goal-contribution"><input type="number" id="contrib-${goal.id}" placeholder="Add ($)"><button class="btn btn-sm btn-primary" onclick="contributeToGoal(${goal.id})">Add</button></div>` : ""}</div>`;
  }).join("");
}

function renderInsights() {
  const content = document.getElementById("insights-content");
  if (state.expenses.length === 0) { content.innerHTML = `<div class="empty-state"><p>📊 No data yet</p></div>`; return; }
  
  // Set up chart UI container
  content.innerHTML = `
      <canvas id="expenseChart" style="width:100%; max-height:300px; margin-bottom: 2rem;"></canvas>
      <div id="insight-text-list"></div>
  `;

  // Render Graph via Chart.js
  const ctx = document.getElementById('expenseChart');
  const monthlyData = {};
  
  // Group all historical expenses by month
  state.expenses.forEach(e => {
      const month = e.date.slice(0, 7);
      monthlyData[month] = (monthlyData[month] || 0) + e.amount;
  });
  
  const labels = Object.keys(monthlyData).sort();
  const data = labels.map(m => monthlyData[m]);

  if(window.chartInstance) window.chartInstance.destroy();
  window.chartInstance = new Chart(ctx, {
      type: 'bar',
      data: {
          labels: labels,
          datasets: [{ label: 'Total Spend ($)', data: data, backgroundColor: '#3B82F6', borderRadius: 4 }]
      },
      options: { responsive: true }
  });

  // Calculate insights logic based on selected view month
  const spent = totalSpentThisMonth(); const budget = state.monthlyBudget;
  const insights = [];
  
  if (budget > 0) {
    const pct = (spent / budget) * 100;
    if (pct >= 100) insights.push({ dot: "red", text: `You've exceeded your monthly budget for this month by ${fmt(spent - budget)}.` });
    else if (pct >= 80) insights.push({ dot: "orange", text: `You're at ${pct.toFixed(0)}% of your monthly budget. Tread carefully!` });
    else insights.push({ dot: "green", text: `Great job! You've used ${pct.toFixed(0)}% of your budget this month.` });
  }
  
  document.getElementById("insight-text-list").innerHTML = insights.map(i => `<div class="insight-item"><div class="insight-dot ${i.dot}"></div><p class="insight-text">${i.text}</p></div>`).join("");
}

function renderAll() { 
  renderExpenses(); 
  renderBudget(); 
  renderSavings(); 
  renderInsights(); 
}

// ─── INITIALIZE APP ──────────────────────────────────────────
document.addEventListener("DOMContentLoaded", () => {
  initAuth();
  if (document.getElementById("expenses")) {
    initTabs(); 
    initExpenseForm(); 
    initGoalForm(); 
    load(); // Pulls everything from local storage and renders!
  }
});