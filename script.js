class TaskScheduler {
    constructor() {
        this.tasks = JSON.parse(localStorage.getItem('tasks')) || [];
        this.recurringTasks = JSON.parse(localStorage.getItem('recurringTasks')) || this.getDefaultRecurringTasks();
        this.lastResetDate = localStorage.getItem('lastResetDate');
        
        this.initializeElements();
        this.bindEvents();
        this.updateCurrentTime();
        this.checkAndResetDailyTasks(); // New: Check and reset daily tasks
        this.renderTasks();
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

    checkAndResetDailyTasks() {
        const today = new Date().toISOString().split('T')[0];
        if (this.lastResetDate !== today) {
            console.log('New day detected, resetting recurring tasks.');
            this.resetRecurringTasks();
            this.lastResetDate = today;
            localStorage.setItem('lastResetDate', this.lastResetDate);
        } else {
            console.log('Same day, no need to reset recurring tasks.');
        }
        // Ensure recurring tasks are always in the main tasks array
        this.addRecurringTasksToMainTasks();
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

    addRecurringTasksToMainTasks() {
        // This method is now primarily for ensuring initial population of recurring tasks
        // The daily reset handles subsequent additions
        const existingRecurringTaskNamesInCurrentTasks = new Set(this.tasks.filter(task => task.isRecurring).map(task => task.name));
        const existingRecurringTaskNamesInStoredRecurringTasks = new Set(this.recurringTasks.map(task => task.name));

        this.recurringTasks.forEach(rTask => {
            // Add to main tasks only if it's not already there AND it's a new recurring task
            if (!existingRecurringTaskNamesInCurrentTasks.has(rTask.name)) {
                const newTask = { ...rTask, completed: false, id: `recurring-${Date.now()}-${rTask.name.replace(/\s/g, '-')}` };
                this.tasks.push(newTask);
            }
        });
        // Ensure any new recurring tasks (e.g. added through getDefaultRecurringTasks or directly by user) are saved in recurringTasks storage
        this.recurringTasks.forEach(rTask => {
            if (!existingRecurringTaskNamesInStoredRecurringTasks.has(rTask.name)) {
                this.recurringTasks.push(rTask); // Add to persistent recurring list
            }
        });
        this.saveTasks();
    }

    handleAddTask(e) {
        e.preventDefault();
        
        const taskName = this.taskNameInput.value.trim();
        const startTime = this.startTimeInput.value;
        const endTime = this.endTimeInput.value;
        const description = this.taskDescriptionInput.value.trim();
        const isRecurring = this.isRecurringInput.checked; // New: Get recurring status

        if (!taskName || !startTime || !endTime) {
            this.showNotification('Please fill in all required fields', 'error');
            return;
        }

        if (startTime >= endTime) {
            this.showNotification('End time must be after start time', 'error');
            return;
        }

        const task = {
            id: Date.now(),
            name: taskName,
            startTime: startTime,
            endTime: endTime,
            description: description,
            completed: false,
            createdAt: new Date().toISOString(),
            isRecurring: isRecurring // Set based on checkbox
        };

        if (isRecurring) {
            // Add to recurring tasks for persistence across days
            // Use a simpler ID for recurring tasks when saving to recurringTasks
            const recurringTaskBase = {
                id: task.name.replace(/\s/g, '-').toLowerCase(), // Simplified ID for recurring tasks
                name: task.name,
                startTime: task.startTime,
                endTime: task.endTime,
                description: task.description,
                completed: false, // Always start uncompleted for recurring
                isRecurring: true,
                createdAt: new Date().toISOString()
            };
            // Check if a recurring task with the same name already exists to prevent duplicates
            if (!this.recurringTasks.some(r => r.name === recurringTaskBase.name)) {
                this.recurringTasks.push(recurringTaskBase);
            }
            // Ensure the current instance added to `this.tasks` has a unique ID for the day
            this.tasks.push({ ...task, id: Date.now() }); 
        } else {
            this.tasks.push(task);
        }
        this.saveTasks();
        this.renderTasks();
        this.resetForm();
        this.showNotification('Task added successfully!', 'success');
    }

    resetForm() {
        this.taskForm.reset();
        this.taskNameInput.focus();
        this.isRecurringInput.checked = false; // Reset checkbox
    }

    deleteTask(taskId) {
        const taskToDelete = this.tasks.find(task => task.id === taskId);
        if (!taskToDelete) return;

        if (taskToDelete.isRecurring) {
            if (confirm('This is a recurring task. Do you want to remove it from your everyday tasks permanently?')) {
                this.recurringTasks = this.recurringTasks.filter(task => task.name !== taskToDelete.name); // Filter by name for simplicity with default recurring tasks
                this.tasks = this.tasks.filter(task => task.id !== taskId); // Remove the instance from current tasks
                this.saveTasks();
                this.renderTasks();
                this.showNotification('Recurring task removed!', 'success');
            }
        } else {
            this.tasks = this.tasks.filter(task => task.id !== taskId);
            this.saveTasks();
            this.renderTasks();
            this.showNotification('Task deleted successfully!', 'success');
        }
    }

    toggleTaskComplete(taskId) {
        console.log('Attempting to toggle task with ID:', taskId);
        const task = this.tasks.find(t => t.id === taskId);
        if (task) {
            console.log('Task found:', task);
            console.log('Task completed status BEFORE toggle:', task.completed);

            // For recurring tasks, toggle completion only for the current instance.
            // A new instance will be generated uncompleted tomorrow.
            if (task.isRecurring) {
                task.completed = !task.completed;
            } else {
                // For non-recurring tasks, simply toggle completion
                task.completed = !task.completed;
            }
            console.log('Task completed status AFTER toggle:', task.completed);
            this.saveTasks();
            console.log('saveTasks() called.');
            this.renderTasks();
            const status = task.completed ? 'completed' : 'marked as incomplete';
            this.showNotification(`Task ${status}!`, 'success');
        } else {
            console.log('Task with ID not found:', taskId);
        }
    }

    clearAllTasks() {
        if (this.tasks.length === 0) {
            this.showNotification('No tasks to clear', 'info');
            return;
        }

        if (confirm('Are you sure you want to delete all ONE-TIME tasks? Recurring tasks will remain.')) {
            this.tasks = this.tasks.filter(task => task.isRecurring); // Only keep recurring tasks
            this.saveTasks();
            this.renderTasks();
            this.showNotification('All tasks cleared!', 'success');
        }
    }

    sortTasksByTime() {
        this.tasks.sort((a, b) => {
            const timeA = new Date(`2000-01-01T${a.startTime}`);
            const timeB = new Date(`2000-01-01T${b.startTime}`);
            return timeA - timeB;
        });
        this.saveTasks();
        this.renderTasks();
        this.showNotification('Tasks sorted by start time!', 'success');
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

    saveTasks() {
        // Save all current tasks, including recurring task instances with their current completion status
        localStorage.setItem('tasks', JSON.stringify(this.tasks));
        // Save the base recurring task definitions separately
        localStorage.setItem('recurringTasks', JSON.stringify(this.recurringTasks));
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