/**
 * AI Study Buddy 2.0 - Main Application Controller
 * Wires modular sub-systems while maintaining full backwards compatibility.
 */

console.log("AI Study Buddy 2.0 Loaded Successfully 🚀");

// ==================== GLOBAL VIEW SWITCHER ====================

function switchView(viewId, element) {
  // Hide all view sections
  const views = document.querySelectorAll(".view-section");
  views.forEach(view => view.classList.add("hidden"));

  // Show the target view
  const targetView = document.getElementById(viewId + "-view");
  if (targetView) {
    targetView.classList.remove("hidden");
  }

  // Update active class on sidebar menu items
  const menuItems = document.querySelectorAll(".menu-item");
  menuItems.forEach(item => {
    item.classList.remove("active");
    if (element && item === element) {
      item.classList.add("active");
    } else if (!element && item.dataset.view === viewId) {
      item.classList.add("active");
    }
  });

  // Render view-specific content
  if (viewId === "dashboard" && window.Dashboard) {
    window.Dashboard.render();
  } else if (viewId === "quiz" && window.QuizController) {
    window.QuizController.initSetup();
  } else if (viewId === "planner" && window.PlannerView) {
    window.PlannerView.render();
  } else if (viewId === "notes" && window.NotesView) {
    window.NotesView.render();
  } else if (viewId === "flashcards" && window.FlashcardsView) {
    window.FlashcardsView.render();
  } else if (viewId === "progress" && window.ProgressView) {
    window.ProgressView.render();
  }

  // Close sidebar on mobile
  if (window.innerWidth <= 768) {
    closeSidebar();
  }
}

// ==================== AUTH & SESSION ====================

function checkSession() {
  const student = Storage.getStudent();
  const sessionActive = sessionStorage.getItem("csb_auth_active");

  if (sessionActive === "true" && student.username) {
    document.getElementById("login-screen").classList.add("hidden");
    document.getElementById("app").classList.remove("hidden");
    updateProfileDisplays(student);
    switchView("dashboard");
  } else {
    document.getElementById("login-screen").classList.remove("hidden");
    document.getElementById("app").classList.add("hidden");
  }
}

function login() {
  const usernameInput = document.getElementById("username");
  const passwordInput = document.getElementById("password");
  const username = usernameInput ? usernameInput.value.trim() : "";
  const password = passwordInput ? passwordInput.value.trim() : "";

  // Support demo credentials or any non-empty username
  if ((username === "admin" && password === "1234") || (username && password)) {
    sessionStorage.setItem("csb_auth_active", "true");

    const student = Storage.getStudent();
    student.username = username;
    Storage.saveStudent(student);

    document.getElementById("login-screen").classList.add("hidden");
    document.getElementById("app").classList.remove("hidden");

    updateProfileDisplays(student);
    switchView("dashboard");
  } else {
    alert("Please enter a valid Username and Password (Demo: admin / 1234)");
  }
}

function logout() {
  sessionStorage.removeItem("csb_auth_active");
  document.getElementById("app").classList.add("hidden");
  document.getElementById("login-screen").classList.remove("hidden");
  const loginForm = document.getElementById("login-form");
  if (loginForm) loginForm.reset();
  const dropdown = document.getElementById("profile-dropdown");
  if (dropdown) dropdown.classList.add("hidden");
}

function updateProfileDisplays(student) {
  const name = student.username || "Admin";
  const initial = name.charAt(0).toUpperCase();

  const userElem = document.getElementById("profile-username");
  if (userElem) userElem.textContent = name;

  const emailElem = document.getElementById("profile-email");
  if (emailElem) emailElem.textContent = student.email || "Student";

  const initElem = document.getElementById("profile-initial");
  if (initElem) initElem.textContent = initial;

  const initLargeElem = document.getElementById("profile-initial-large");
  if (initLargeElem) initLargeElem.textContent = initial;
}

// ==================== PROFILE MODAL ====================

function toggleProfileMenu() {
  const dropdown = document.getElementById("profile-dropdown");
  if (dropdown) dropdown.classList.toggle("hidden");
}

function openEditProfile() {
  const student = Storage.getStudent();
  document.getElementById("edit-name").value = student.username || "";
  document.getElementById("edit-email").value = student.email || "";
  document.getElementById("edit-level").value = student.learningLevel || "Intermediate";
  document.getElementById("edit-exam").value = student.targetExam || "";
  document.getElementById("edit-goal").value = student.dailyStudyGoal || 120;

  document.getElementById("edit-profile-modal").classList.remove("hidden");
  document.getElementById("profile-dropdown").classList.add("hidden");
}

function closeEditProfile() {
  document.getElementById("edit-profile-modal").classList.add("hidden");
}

// ==================== MOBILE SIDEBAR ====================

function openSidebar() {
  document.getElementById("sidebar").classList.add("open");
  document.getElementById("sidebar-overlay").classList.add("active");
}

function closeSidebar() {
  document.getElementById("sidebar").classList.remove("open");
  document.getElementById("sidebar-overlay").classList.remove("active");
}

// ==================== BACKWARD COMPATIBILITY ====================

function sendMessage() {
  if (window.Tutor && typeof window.Tutor.sendMessage === "function") {
    window.Tutor.sendMessage();
  }
}

function askTopic(topic) {
  switchView("chat");
  if (window.Tutor && typeof window.Tutor.sendUserPrompt === "function") {
    window.Tutor.sendUserPrompt(topic);
  }
}

function startQuiz(subject) {
  switchView("quiz");
  const subjectSelect = document.getElementById("quiz-subject-select");
  if (subjectSelect) subjectSelect.value = subject;
  if (window.QuizController) {
    window.QuizController.startQuizFromSetup();
  }
}

function nextQuestion() {
  if (window.QuizController) window.QuizController.nextQuestion();
}

// ==================== DOM CONTENT LOADED ====================

document.addEventListener("DOMContentLoaded", () => {
  // Check auth session
  checkSession();

  // Initialize Tutor
  if (window.Tutor) window.Tutor.init();

  // Login form submission
  const loginForm = document.getElementById("login-form");
  if (loginForm) {
    loginForm.addEventListener("submit", (e) => {
      e.preventDefault();
      login();
    });
  }

  // Hamburger menu
  const hamburgerBtn = document.getElementById("hamburger-btn");
  if (hamburgerBtn) hamburgerBtn.addEventListener("click", openSidebar);

  // Sidebar close button
  const sidebarCloseBtn = document.getElementById("sidebar-close-btn");
  if (sidebarCloseBtn) sidebarCloseBtn.addEventListener("click", closeSidebar);

  // Mobile backdrop overlay
  const overlay = document.getElementById("sidebar-overlay");
  if (overlay) overlay.addEventListener("click", closeSidebar);

  // Profile modal form
  const editProfileForm = document.getElementById("edit-profile-form");
  if (editProfileForm) {
    editProfileForm.addEventListener("submit", (e) => {
      e.preventDefault();
      const updated = Storage.updateStudent({
        username: document.getElementById("edit-name").value.trim(),
        email: document.getElementById("edit-email").value.trim(),
        learningLevel: document.getElementById("edit-level").value,
        targetExam: document.getElementById("edit-exam").value.trim(),
        dailyStudyGoal: parseInt(document.getElementById("edit-goal").value, 10) || 120,
      });

      updateProfileDisplays(updated);
      closeEditProfile();
      if (window.Dashboard) window.Dashboard.render();
    });
  }

  // Close profile dropdown when clicking outside
  document.addEventListener("click", (e) => {
    const profile = document.querySelector(".profile-container");
    const dropdown = document.getElementById("profile-dropdown");
    if (profile && dropdown && !profile.contains(e.target)) {
      dropdown.classList.add("hidden");
    }
  });

  // Focus timer mode buttons
  document.querySelectorAll(".focus-mode-btn").forEach(btn => {
    btn.addEventListener("click", () => {
      if (window.FocusTimer) window.FocusTimer.setMode(btn.dataset.mode);
    });
  });

  // Notes search & filter
  const notesSearch = document.getElementById("notes-search-input");
  if (notesSearch) {
    notesSearch.addEventListener("input", (e) => {
      if (window.NotesView) {
        window.NotesView.searchTerm = e.target.value;
        window.NotesView.render();
      }
    });
  }

  const notesFilter = document.getElementById("notes-subject-filter");
  if (notesFilter) {
    notesFilter.addEventListener("change", (e) => {
      if (window.NotesView) {
        window.NotesView.selectedSubject = e.target.value;
        window.NotesView.render();
      }
    });
  }

  // Flashcards deck filter
  const fcFilter = document.getElementById("fc-deck-filter");
  if (fcFilter) {
    fcFilter.addEventListener("change", (e) => {
      if (window.FlashcardsView) {
        window.FlashcardsView.selectedSubject = e.target.value;
        window.FlashcardsView.currentIndex = 0;
        window.FlashcardsView.render();
      }
    });
  }
});