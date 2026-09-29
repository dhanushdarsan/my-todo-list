(() => {
    "use strict";

    /* ------------------------------------------------------------------
       Constants and DOM references
       ------------------------------------------------------------------ */
    const STORAGE_KEY = "todo-app.tasks";
    const REMOVE_DELAY = 250; // ms, matches the CSS removal transition

    const prefersReducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    const form = document.getElementById("add-form");
    const input = document.getElementById("task-input");
    const formError = document.getElementById("form-error");
    const list = document.getElementById("task-list");
    const summary = document.getElementById("summary");
    const stats = document.getElementById("stats");
    const statTotal = document.getElementById("stat-total");
    const statCompleted = document.getElementById("stat-completed");
    const statRemaining = document.getElementById("stat-remaining");
    const emptyState = document.getElementById("empty-state");
    const emptyTitle = document.getElementById("empty-title");
    const emptyText = document.getElementById("empty-text");
    const toolbar = document.getElementById("toolbar");
    const filterButtons = document.querySelectorAll(".filter-btn");
    const clearButton = document.getElementById("clear-completed");

    const CHECK_ICON =
        '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3.5" ' +
        'stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg>';

    const TRASH_ICON =
        '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" ' +
        'stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
        '<path d="M4 7h16"/><path d="M10 11v6M14 11v6"/>' +
        '<path d="M6 7l1 12a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2l1-12"/>' +
        '<path d="M9 7V5a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/></svg>';

    const EMPTY_MESSAGES = {
        all: { title: "No tasks yet", text: "Add a task above to get started." },
        active: { title: "Nothing left to do", text: "Every task is completed." },
        completed: { title: "No completed tasks", text: "Completed tasks will show up here." }
    };

    /* ------------------------------------------------------------------
       State
       ------------------------------------------------------------------ */
    let tasks = loadTasks();          // [{ id, text, completed }]
    let currentFilter = "all";        // "all" | "active" | "completed"
    let shouldAnimate = false;        // false on first render so the page doesn't animate on load
    const taskElements = new Map();   // task id -> <li>, so we update elements instead of rebuilding them

    /* ------------------------------------------------------------------
       Storage
       ------------------------------------------------------------------ */
    function loadTasks() {
        try {
            const stored = JSON.parse(localStorage.getItem(STORAGE_KEY));
            if (!Array.isArray(stored)) return [];

            return stored
                .filter((task) => task && typeof task.text === "string" && Number.isFinite(Number(task.id)))
                .map((task) => ({
                    id: Number(task.id),
                    text: task.text,
                    completed: Boolean(task.completed)
                }));
        } catch (error) {
            console.warn("Could not read saved tasks:", error);
            return [];
        }
    }

    function saveTasks() {
        try {
            localStorage.setItem(STORAGE_KEY, JSON.stringify(tasks));
        } catch (error) {
            console.warn("Could not save tasks:", error);
        }
    }

    /* ------------------------------------------------------------------
       Task actions
       ------------------------------------------------------------------ */
    function addTask(text) {
        // If the user is looking at "Completed", switch to "All" so the new task is visible
        if (currentFilter === "completed") {
            currentFilter = "all";
            updateFilterButtons();
        }

        tasks.push({ id: Date.now(), text, completed: false });
        saveTasks();
        renderTasks();
    }

    function toggleTask(id) {
        const task = tasks.find((item) => item.id === id);
        if (!task) return;

        task.completed = !task.completed;
        saveTasks();
        renderTasks();
    }

    function deleteTask(id) {
        const element = taskElements.get(id);

        tasks = tasks.filter((task) => task.id !== id);
        saveTasks();
        updateStats();

        animateRemoval(element ? [element] : [], renderTasks);
    }

    function clearCompleted() {
        const completedElements = tasks
            .filter((task) => task.completed)
            .map((task) => taskElements.get(task.id))
            .filter(Boolean);

        tasks = tasks.filter((task) => !task.completed);
        saveTasks();
        updateStats();

        animateRemoval(completedElements, renderTasks);
    }

    function filterTasks() {
        if (currentFilter === "active") return tasks.filter((task) => !task.completed);
        if (currentFilter === "completed") return tasks.filter((task) => task.completed);
        return tasks;
    }

    function setFilter(filter) {
        currentFilter = filter;
        updateFilterButtons();
        renderTasks();
    }

    /* ------------------------------------------------------------------
       Rendering
       ------------------------------------------------------------------ */
    function renderTasks() {
        const visibleTasks = filterTasks();
        const visibleIds = new Set(visibleTasks.map((task) => task.id));

        // Remove elements for tasks that are deleted or filtered out
        taskElements.forEach((element, id) => {
            if (!visibleIds.has(id)) {
                element.remove();
                taskElements.delete(id);
            }
        });

        // Create or update the visible ones, keeping them in the right order
        visibleTasks.forEach((task, index) => {
            let element = taskElements.get(task.id);

            if (!element) {
                element = createTaskElement(task);
                taskElements.set(task.id, element);
            }

            updateTaskElement(element, task);

            // Only move the element if it isn't already in the right place
            // (moving it would interrupt transitions and drop keyboard focus)
            if (list.children[index] !== element) {
                list.insertBefore(element, list.children[index] || null);
            }
        });

        // Empty state
        const message = EMPTY_MESSAGES[currentFilter];
        emptyTitle.textContent = message.title;
        emptyText.textContent = message.text;
        emptyState.hidden = visibleTasks.length > 0;

        updateStats();
    }

    function createTaskElement(task) {
        const item = document.createElement("li");
        item.className = "task";
        item.dataset.id = task.id;

        if (shouldAnimate) {
            item.classList.add("enter");
            item.addEventListener("animationend", () => item.classList.remove("enter"), { once: true });
        }

        const checkbox = document.createElement("input");
        checkbox.type = "checkbox";
        checkbox.className = "task-checkbox";
        checkbox.id = "task-" + task.id;

        const label = document.createElement("label");
        label.className = "task-label";
        label.htmlFor = checkbox.id;

        const checkmark = document.createElement("span");
        checkmark.className = "checkmark";
        checkmark.innerHTML = CHECK_ICON; // static icon markup only, never user text

        const text = document.createElement("span");
        text.className = "task-text";
        text.textContent = task.text; // textContent keeps user input safe

        label.append(checkmark, text);

        const deleteButton = document.createElement("button");
        deleteButton.type = "button";
        deleteButton.className = "delete-btn";
        deleteButton.setAttribute("aria-label", "Delete task: " + task.text);
        deleteButton.innerHTML = TRASH_ICON;

        item.append(checkbox, label, deleteButton);
        return item;
    }

    function updateTaskElement(element, task) {
        element.classList.toggle("completed", task.completed);
        element.querySelector(".task-checkbox").checked = task.completed;
    }

    function updateStats() {
        const total = tasks.length;
        const completed = tasks.filter((task) => task.completed).length;
        const remaining = total - completed;

        statTotal.textContent = total;
        statCompleted.textContent = completed;
        statRemaining.textContent = remaining;

        if (total === 0) {
            summary.textContent = "No tasks yet";
        } else if (remaining === 0) {
            summary.textContent = "All tasks completed";
        } else {
            summary.textContent = remaining + (remaining === 1 ? " task remaining" : " tasks remaining");
        }

        stats.hidden = total === 0;
        toolbar.hidden = total === 0;
        clearButton.hidden = completed === 0;
    }

    function updateFilterButtons() {
        filterButtons.forEach((button) => {
            button.setAttribute("aria-pressed", String(button.dataset.filter === currentFilter));
        });
    }

    /* ------------------------------------------------------------------
       Helpers
       ------------------------------------------------------------------ */
    function animateRemoval(elements, done) {
        if (elements.length === 0 || prefersReducedMotion) {
            done();
            return;
        }

        elements.forEach((element) => {
            // Give CSS a real height to animate from, then collapse it
            element.style.maxHeight = element.offsetHeight + "px";
            void element.offsetHeight; // force a reflow so the transition starts
            element.classList.add("removing");
        });

        setTimeout(done, REMOVE_DELAY);
    }

    function showError() {
        form.classList.add("invalid");
        input.setAttribute("aria-invalid", "true");
        formError.hidden = false;
        input.focus();
    }

    function clearError() {
        form.classList.remove("invalid");
        input.removeAttribute("aria-invalid");
        formError.hidden = true;
    }

    /* ------------------------------------------------------------------
       Event listeners
       ------------------------------------------------------------------ */
    // Submitting the form handles both the Add button and the Enter key
    form.addEventListener("submit", (event) => {
        event.preventDefault();

        const text = input.value.trim();
        if (!text) {
            showError();
            return;
        }

        addTask(text);
        input.value = "";
        input.focus();
    });

    input.addEventListener("input", clearError);

    // One listener on the list handles every task (event delegation)
    list.addEventListener("change", (event) => {
        if (!event.target.matches(".task-checkbox")) return;
        toggleTask(Number(event.target.closest(".task").dataset.id));
    });

    list.addEventListener("click", (event) => {
        const deleteButton = event.target.closest(".delete-btn");
        if (!deleteButton) return;
        deleteTask(Number(deleteButton.closest(".task").dataset.id));
    });

    filterButtons.forEach((button) => {
        button.addEventListener("click", () => setFilter(button.dataset.filter));
    });

    clearButton.addEventListener("click", clearCompleted);

    /* ------------------------------------------------------------------
       Start
       ------------------------------------------------------------------ */
    renderTasks();
    shouldAnimate = true;
})();
