// Add your Google Apps Script Web App URL here
const API_ENDPOINT = 'https://script.google.com/macros/s/AKfycbwnjlYdAjhhvL4F4TfcEQBEkQ9DDYA4O9UWz72mUocF7KDexdXsZpV9dLocLDA1teO12Q/exec';
  
class TaskScheduler {
    constructor() {
        // Initialize tasks as empty; they will be loaded asynchronously
        this.tasks = [];
        // Recurring task definitions are still managed locally for daily reset logic
        this.recurringTasks = JSON.parse(localStorage.getItem('recurringTasks')) || this.getDefaultRecurringTasks();
        this.lastResetDate = localStorage.getItem('lastResetDate');
        
        this.initializeElements();
        this.bindEvents();
        this.updateCurrentTime();
        
        // Use an async IIFE (Immediately Invoked Function Expression) to handle async calls in constructor
        (async () => {
            console.log('TaskScheduler: Starting initialization...');
            await this.loadTasks(); // Load tasks from Google Sheet
            console.log('TaskScheduler: Tasks loaded. Checking and resetting daily tasks...');
            this.checkAndResetDailyTasks(); // Check and reset daily tasks after loading
            console.log('TaskScheduler: Daily tasks checked. Rendering tasks...');
            this.renderTasks(); // Render tasks after loading and potential reset
            console.log('TaskScheduler: Initialization complete.');
        })();

        this.startTimeTracking();
    }

    initializeElements() {
        this.taskForm = document.getElementById('taskForm');
        this.taskNameInput = document.getElementById('taskName');
        this.startTimeInput = document.getElementById('startTime');
        this.endTimeInput = document.getElementById('endTime');
        this.taskDescriptionInput = document.getElementById('taskDescription');
        this.isRecurringInput = document.getElementById('isRecurring'); // New: Recurring checkbox
        this.taskList = document.getElementById('taskList');
        this.clearAllBtn = document.getElementById('clearAll');
        this.sortByTimeBtn = document.getElementById('sortByTime');
        this.currentTimeDisplay = document.getElementById('currentTime');
    }

    bindEvents() {
        this.taskForm.addEventListener('submit', (e) => this.handleAddTask(e));
        this.clearAllBtn.addEventListener('click', () => this.clearAllTasks());
        this.sortByTimeBtn.addEventListener('click', () => this.sortTasksByTime());
    }

    getDefaultRecurringTasks() {
        return [
            { id: 'recurring-wake-up', name: 'Wake Up', startTime: '07:00', endTime: '07:30', description: 'Start your day!', completed: false, isRecurring: true, createdAt: new Date().toISOString() },
            { id: 'recurring-brush-teeth', name: 'Brush Teeth', startTime: '07:30', endTime: '07:45', description: 'Maintain oral hygiene.', completed: false, isRecurring: true, createdAt: new Date().toISOString() },
            { id: 'recurring-morning-prayers', name: 'Morning Prayers', startTime: '07:45', endTime: '08:00', description: 'Start your day with spiritual reflection.', completed: false, isRecurring: true, createdAt: new Date().toISOString() }
        ];
    }

    async checkAndResetDailyTasks() {
        const today = new Date().toISOString().split('T')[0];
        if (this.lastResetDate !== today) {
            console.log('New day detected, resetting recurring tasks.');
            // Prepare new instances of recurring tasks with unique IDs for today
            const newRecurringInstances = this.recurringTasks.map(rTask => ({
                ...rTask,
                id: `recurring-${Date.now()}-${rTask.name.replace(/\s/g, '-')}`,
                completed: false,
                createdAt: new Date().toISOString()
            }));

            const apiResponse = await this.sendToAPI('resetRecurringTasks', { newRecurringInstances: newRecurringInstances });
            if (apiResponse.success) {
                this.lastResetDate = today;
                this.saveRecurringTasksLocally(); // Save updated lastResetDate locally
                await this.loadTasks(); // Reload all tasks, including the newly reset recurring ones
                this.renderTasks();
            } else {
                this.showNotification(apiResponse.message || 'Failed to reset daily tasks.', 'error');
            }
        } else {
            console.log('Same day, no need to reset recurring tasks.');
        }
        // Ensure recurring tasks are always in the main tasks array after loading
        // This is handled by loadTasks now.
    }

    resetRecurringTasks() {
        const today = new Date().toISOString().split('T')[0];
        // Get all one-time tasks that are not recurring from the current tasks array
        const oneTimeTasks = this.tasks.filter(task => !task.isRecurring);
    
        // Create new instances of recurring tasks, ensuring unique IDs and uncompleted status
        const newRecurringInstances = this.recurringTasks.map(rTask => ({
            ...rTask,
            id: `recurring-${Date.now()}-${rTask.name.replace(/\s/g, '-')}`,
            completed: false,
            createdAt: new Date().toISOString() // Update createdAt to today for reset
        }));
    
        this.tasks = [...oneTimeTasks, ...newRecurringInstances];
        this.saveTasks();
    }

    // This method is primarily for initial population of recurring tasks from defaults
    // or when adding a new recurring task via the form.
    async addRecurringTasksToMainTasks(forceAdd = false) {
        console.log('addRecurringTasksToMainTasks: started. forceAdd:', forceAdd);
        
        // this.tasks should already be up-to-date from the initial load in the constructor

        // Removed recursive call to loadTasks() here that caused issues

        const existingRecurringTaskNamesInCurrentTasks = new Set(this.tasks.filter(task => task.isRecurring).map(task => task.name));
        console.log('addRecurringTasksToMainTasks: Current tasks after initial load:', this.tasks); 
        console.log('addRecurringTasksToMainTasks: Existing recurring tasks in current tasks:', Array.from(existingRecurringTaskNamesInCurrentTasks));
        console.log('addRecurringTasksToMainTasks: Default/local recurring tasks to check:', this.recurringTasks.map(t => t.name));

        let tasksAdded = false; // Flag to check if any tasks were added
        for (const rTask of this.recurringTasks) {
            if (forceAdd || !existingRecurringTaskNamesInCurrentTasks.has(rTask.name)) {
                console.log(`addRecurringTasksToMainTasks: Attempting to add recurring task: ${rTask.name}`);
                const newTaskInstance = { 
                    ...rTask, 
                    id: `recurring-${Date.now()}-${rTask.name.replace(/\s/g, '-')}`,
                    completed: false,
                    createdAt: new Date().toISOString()
                };
                const apiResponse = await this.sendToAPI('addTask', { task: newTaskInstance });
                if (apiResponse.success) {
                    console.log(`addRecurringTasksToMainTasks: Successfully added recurring task to sheet: ${rTask.name}`, apiResponse);
                    tasksAdded = true;
                } else {
                    console.error(`addRecurringTasksToMainTasks: Failed to add recurring task ${rTask.name} to sheet:`, apiResponse.message);
                }
            } else {
                console.log(`addRecurringTasksToMainTasks: Recurring task "${rTask.name}" already exists in sheet (or was added), skipping add.`);
            }
        }
        
        if (tasksAdded) {
            console.log('addRecurringTasksToMainTasks: New recurring tasks were added. Reloading and rendering tasks...');
            await this.loadTasks(); // This reload is correctly placed here, after the loop finishes
            this.renderTasks();
        } else {
            console.log('addRecurringTasksToMainTasks: No new recurring tasks needed to be added during initialization.');
        }
    }

    async handleAddTask(e) {
        e.preventDefault();
        
        const taskName = this.taskNameInput.value.trim();
        const startTime = this.startTimeInput.value;
        const endTime = this.endTimeInput.value;
        const description = this.taskDescriptionInput.value.trim();
        const isRecurring = this.isRecurringInput.checked;

        if (!taskName || !startTime || !endTime) {
            this.showNotification('Please fill in all required fields', 'error');
            return;
        }

        if (startTime >= endTime) {
            this.showNotification('End time must be after start time', 'error');
            return;
        }

        const newTask = {
            id: isRecurring ? taskName.replace(/\s/g, '-').toLowerCase() : Date.now().toString(), // Use string IDs for both
            name: taskName,
            startTime: startTime,
            endTime: endTime,
            description: description,
            completed: false,
            createdAt: new Date().toISOString(),
            isRecurring: isRecurring
        };

        const apiResponse = await this.sendToAPI('addTask', { task: newTask });
        if (apiResponse.success) {
            // After successful addition to sheet, reload tasks to update local state
            await this.loadTasks(); 
            this.renderTasks();
            this.resetForm();
            this.showNotification('Task added successfully!', 'success');

            if (isRecurring) {
                // Add to recurringTasks locally for daily reset logic, if not already present
                const existingRecurringTask = this.recurringTasks.find(r => r.name === newTask.name);
                if (!existingRecurringTask) {
                    this.recurringTasks.push({ ...newTask, id: newTask.name.replace(/\s/g, '-').toLowerCase() }); // Save base recurring task with simple ID
                    this.saveRecurringTasksLocally();
                }
            }
        } else {
            this.showNotification(apiResponse.message || 'Failed to add task.', 'error');
        }
    }

    resetForm() {
        this.taskForm.reset();
        this.taskNameInput.focus();
        this.isRecurringInput.checked = false; // Reset checkbox
    }

    async deleteTask(taskId) {
        console.log('Attempting to delete task with ID:', taskId);
        const taskToDelete = this.tasks.find(task => task.id == taskId); // Use == for loose comparison
        if (!taskToDelete) {
            console.log('Task with ID not found:', taskId);
            this.showNotification('Task not found for deletion.', 'error');
            return;
        }

        let confirmMessage = 'Are you sure you want to delete this task?';
        if (taskToDelete.isRecurring) {
            confirmMessage = 'This is a recurring task. Do you want to remove it from your everyday tasks permanently?';
        }

        if (confirm(confirmMessage)) {
            let apiResponse;
            if (taskToDelete.isRecurring) {
                // If it's a recurring task, remove it from the local recurring list
                this.recurringTasks = this.recurringTasks.filter(task => task.name !== taskToDelete.name);
                this.saveRecurringTasksLocally();
                // Then, delete its current instance from the Google Sheet
                apiResponse = await this.sendToAPI('deleteTask', { taskId: taskId });
            } else {
                apiResponse = await this.sendToAPI('deleteTask', { taskId: taskId });
            }

            if (apiResponse.success) {
                await this.loadTasks(); // Reload tasks after deletion
                this.renderTasks();
                this.showNotification('Task deleted successfully!', 'success');
            } else {
                this.showNotification(apiResponse.message || 'Failed to delete task.', 'error');
            }
        }
    }

    async toggleTaskComplete(taskId) {
        console.log('Attempting to toggle task with ID:', taskId);
        const task = this.tasks.find(t => t.id == taskId); // Use == for loose comparison
        if (task) {
            console.log('Task found:', task);
            console.log('Task completed status BEFORE toggle:', task.completed);

            const newCompletedStatus = !task.completed;
            const apiResponse = await this.sendToAPI('updateTask', { 
                taskId: taskId, 
                updates: { completed: newCompletedStatus } 
            });

            if (apiResponse.success) {
                // Update local task object and re-render only if API call succeeded
                task.completed = newCompletedStatus;
                console.log('Task completed status AFTER toggle:', task.completed);
                this.renderTasks();
                const status = task.completed ? 'completed' : 'marked as incomplete';
                this.showNotification(`Task ${status}!`, 'success');
            } else {
                this.showNotification(apiResponse.message || 'Failed to update task status.', 'error');
            }
        } else {
            console.log('Task with ID not found:', taskId);
        }
    }

    async clearAllTasks() {
        if (this.tasks.filter(task => !task.isRecurring).length === 0) {
            this.showNotification('No one-time tasks to clear', 'info');
            return;
        }

        if (confirm('Are you sure you want to delete all ONE-TIME tasks? Recurring tasks will remain.')) {
            const apiResponse = await this.sendToAPI('clearOneTimeTasks');
            if (apiResponse.success) {
                await this.loadTasks(); // Reload tasks after clearing
                this.renderTasks();
                this.showNotification('All one-time tasks cleared!', 'success');
            } else {
                this.showNotification(apiResponse.message || 'Failed to clear one-time tasks.', 'error');
            }
        }
    }

    async sortTasksByTime() {
        // Sort locally, as this is a display preference
        this.tasks.sort((a, b) => {
            const timeA = new Date(`2000-01-01T${a.startTime}`);
            const timeB = new Date(`2000-01-01T${b.startTime}`);
            return timeA - timeB;
        });
        this.renderTasks();
        this.showNotification('Tasks sorted by start time!', 'success');
        // Note: Sorting is a client-side display action, no need to save back to sheet immediately
    }

    getTaskStatus(task) {
        const now = new Date();
        // Create a date object for comparison using today's date but task's time
        const [currentHour, currentMinute] = now.toTimeString().slice(0, 5).split(':').map(Number);
        const [taskStartHour, taskStartMinute] = task.startTime.split(':').map(Number);
        const [taskEndHour, taskEndMinute] = task.endTime.split(':').map(Number);

        const taskStartTimeObj = new Date(now.getFullYear(), now.getMonth(), now.getDate(), taskStartHour, taskStartMinute);
        const taskEndTimeObj = new Date(now.getFullYear(), now.getMonth(), now.getDate(), taskEndHour, taskEndMinute);

        if (task.completed) {
            return 'completed';
        }

        if (now < taskStartTimeObj) {
            return 'upcoming';
        } else if (now >= taskStartTimeObj && now <= taskEndTimeObj) {
            return 'current';
        } else {
            return 'overdue';
        }
    }

    renderTasks() {
        if (this.tasks.length === 0) {
            this.taskList.innerHTML = `
                <div class="empty-state">
                    <div class="emoji">📝</div>
                    <p>No tasks yet!</p>
                    <p>Add your first task to get started.</p>
                </div>
            `;
            return;
        }

        this.taskList.innerHTML = this.tasks.map(task => {
            const status = this.getTaskStatus(task);
            let statusClass = '';
            if (!task.completed) { // Only apply status classes if the task is NOT completed
                statusClass = status === 'current' ? 'current' :
                              status === 'overdue' ? 'overdue' : '';
            }
            
            return `
                <div class="task-item ${statusClass} ${task.completed ? 'completed' : ''}" data-id="${task.id}">
                    <div class="task-header">
                        <div class="task-name">${task.completed ? '✅ ' : ''}${task.name}</div>
                        <div class="task-time">
                            ${task.startTime} - ${task.endTime}
                            ${status === 'current' ? ' 🔴' : 
                              status === 'overdue' ? ' ⚠️' : 
                              status === 'upcoming' ? ' ⏰' : ''}
                        </div>
                    </div>
                    ${task.description ? `<div class="task-description">${task.description}</div>` : ''}
                    <div class="task-actions">
                        <button class="complete-btn ${task.completed ? 'completed' : ''}" 
                                onclick="taskScheduler.toggleTaskComplete('${task.id}')">
                            ${task.completed ? 'Undo' : 'Complete'}
                        </button>
                        <button class="delete-btn" onclick="taskScheduler.deleteTask('${task.id}')">
                            ${task.isRecurring ? 'Remove Recurring' : 'Delete'}
                        </button>
                    </div>
                </div>
            `;
        }).join('');
    }

    updateCurrentTime() {
        const now = new Date();
        const timeString = now.toLocaleTimeString();
        const dateString = now.toLocaleDateString();
        this.currentTimeDisplay.textContent = `${dateString} - ${timeString}`;
        this.currentTime = now;
    }

    startTimeTracking() {
        setInterval(() => {
            this.updateCurrentTime();
            this.renderTasks(); // Re-render to update status indicators
        }, 1000);
    }

    // --- New API Communication Functions ---
    async fetchFromAPI() {
        try {
            const response = await fetch(API_ENDPOINT);
            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }
            const data = await response.json();
            return data;
        } catch (error) {
            console.error('Error fetching data from API:', error);
            this.showNotification('Failed to load tasks from server.', 'error');
            return []; // Return empty array on error
        }
    }

    async sendToAPI(action, payload = {}) {
        try {
            const response = await fetch(API_ENDPOINT, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ action, ...payload }),
            });
            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }
            const data = await response.json();
            if (!data.success) {
                throw new Error(data.message || 'API request failed');
            }
            return data;
        } catch (error) {
            console.error('Error sending data to API:', error);
            this.showNotification(`Server error: ${error.message || 'Action failed'}`, 'error');
            return { success: false, message: error.message };
        }
    }

    // --- Modified Task Handling Functions ---

    async loadTasks() {
        console.log('Loading tasks from Google Sheet...');
        this.tasks = await this.fetchFromAPI();
        // Ensure recurring tasks from default are present if sheet is empty or only has one-time tasks
        this.addRecurringTasksToMainTasks(true); // Pass true to force re-add recurring tasks upon load
        this.saveRecurringTasksLocally(); // Save local parts only
    }

    // Modified saveTasks to only handle local storage parts
    saveRecurringTasksLocally() {
        localStorage.setItem('recurringTasks', JSON.stringify(this.recurringTasks));
        localStorage.setItem('lastResetDate', this.lastResetDate);
    }

    showNotification(message, type = 'info') {
        // Create notification element
        const notification = document.createElement('div');
        notification.className = `notification ${type}`;
        notification.textContent = message;
        
        // Style the notification
        notification.style.cssText = `
            position: fixed;
            top: 20px;
            right: 20px;
            padding: 15px 20px;
            border-radius: 8px;
            color: white;
            font-weight: 600;
            z-index: 1000;
            transform: translateX(100%);
            transition: transform 0.3s ease;
            max-width: 300px;
            word-wrap: break-word;
        `;

        // Set background color based on type
        const colors = {
            success: '#28a745',
            error: '#dc3545',
            info: '#17a2b8'
        };
        notification.style.backgroundColor = colors[type] || colors.info;

        // Add to page
        document.body.appendChild(notification);

        // Animate in
        setTimeout(() => {
            notification.style.transform = 'translateX(0)';
        }, 100);

        // Remove after 3 seconds
        setTimeout(() => {
            notification.style.transform = 'translateX(100%)';
            setTimeout(() => {
                if (notification.parentNode) {
                    notification.parentNode.removeChild(notification);
                }
            }, 300);
        }, 3000);
    }
}

// Initialize the app when the page loads
let taskScheduler;
document.addEventListener('DOMContentLoaded', () => {
    taskScheduler = new TaskScheduler();
}); 
