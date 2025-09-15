// popup.js - Frontend logic for Tomato Clock extension with analytics

class TomatoTimer {
    constructor() {
        this.isRunning = false;
        this.currentPhase = 'work'; // 'work', 'short-break', 'long-break'
        this.currentCycle = 1;
        this.timeRemaining = 0;
        this.currentTab = 'timer';
        
        // Default durations in minutes
        this.settings = {
            workDuration: 25,
            shortBreakDuration: 5,
            longBreakDuration: 15
        };
        
        this.initializeElements();
        this.loadSettings();
        this.loadTimerState();
        this.bindEvents();
        this.updateDisplay();
        
        // Check timer state every second
        this.checkInterval = setInterval(() => {
            this.checkTimerState();
        }, 1000);
        
        // Update analytics when switching to analytics tab
        this.updateAnalytics();
    }

    initializeElements() {
        // Tab elements
        this.timerTab = document.getElementById('timerTab');
        this.analyticsTab = document.getElementById('analyticsTab');
        this.timerContent = document.getElementById('timerContent');
        this.analyticsContent = document.getElementById('analyticsContent');
        
        // Timer display elements
        this.statusText = document.getElementById('statusText');
        this.timeDisplay = document.getElementById('timeDisplay');
        this.cycleCount = document.getElementById('cycleCount');
        this.timerDisplayContainer = document.querySelector('.timer-display');
        
        // Task selection
        this.taskTypeSelect = document.getElementById('taskType');
        this.taskSelection = document.getElementById('taskSelection');
        
        // Control buttons
        this.startPauseBtn = document.getElementById('startPauseBtn');
        this.skipBtn = document.getElementById('skipBtn');
        this.resetBtn = document.getElementById('resetBtn');
        
        // Settings
        this.settingsBtn = document.getElementById('settingsBtn');
        this.settingsPanel = document.getElementById('settingsPanel');
        this.workDurationInput = document.getElementById('workDuration');
        this.shortBreakInput = document.getElementById('shortBreakDuration');
        this.longBreakInput = document.getElementById('longBreakDuration');
        this.saveSettingsBtn = document.getElementById('saveSettingsBtn');
        
        // Analytics elements
        this.todayPomodoros = document.getElementById('todayPomodoros');
        this.todayMinutes = document.getElementById('todayMinutes');
        this.totalPomodoros = document.getElementById('totalPomodoros');
        this.totalHours = document.getElementById('totalHours');
        this.weeklyChart = document.getElementById('weeklyChart');
        this.typeDistribution = document.getElementById('typeDistribution');
        this.exportDataBtn = document.getElementById('exportDataBtn');
        this.clearDataBtn = document.getElementById('clearDataBtn');
    }

    bindEvents() {
        // Tab switching
        this.timerTab.addEventListener('click', () => this.switchTab('timer'));
        this.analyticsTab.addEventListener('click', () => this.switchTab('analytics'));
        
        // Timer controls
        this.startPauseBtn.addEventListener('click', () => this.toggleTimer());
        this.skipBtn.addEventListener('click', () => this.skipPhase());
        this.resetBtn.addEventListener('click', () => this.resetTimer());
        this.settingsBtn.addEventListener('click', () => this.toggleSettings());
        this.saveSettingsBtn.addEventListener('click', () => this.saveSettings());
        
        // Task type selection
        this.taskTypeSelect.addEventListener('change', () => this.updateTaskType());
        
        // Analytics controls
        this.exportDataBtn.addEventListener('click', () => this.exportData());
        this.clearDataBtn.addEventListener('click', () => this.clearData());
        
        // Listen for messages from service worker
        chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
            if (message.type === 'TIMER_UPDATE') {
                this.handleTimerUpdate(message.data);
            } else if (message.type === 'PLAY_SOUND') {
                this.playNotificationSound();
            }
        });
    }

    switchTab(tab) {
        this.currentTab = tab;
        
        // Update tab buttons
        this.timerTab.classList.toggle('active', tab === 'timer');
        this.analyticsTab.classList.toggle('active', tab === 'analytics');
        
        // Update tab content
        this.timerContent.classList.toggle('active', tab === 'timer');
        this.analyticsContent.classList.toggle('active', tab === 'analytics');
        
        if (tab === 'analytics') {
            this.updateAnalytics();
        }
    }

    async updateTaskType() {
        const taskType = this.taskTypeSelect.value;
        try {
            await chrome.runtime.sendMessage({
                type: 'SET_TASK_TYPE',
                taskType: taskType
            });
        } catch (error) {
            console.error('Failed to update task type:', error);
        }
    }

    async loadSettings() {
        try {
            const result = await chrome.storage.sync.get(['timerSettings']);
            if (result.timerSettings) {
                this.settings = { ...this.settings, ...result.timerSettings };
                this.updateSettingsInputs();
            }
        } catch (error) {
            console.error('Failed to load settings:', error);
        }
    }

    async saveSettings() {
        const newSettings = {
            workDuration: parseInt(this.workDurationInput.value) || 25,
            shortBreakDuration: parseInt(this.shortBreakInput.value) || 5,
            longBreakDuration: parseInt(this.longBreakInput.value) || 15
        };

        try {
            await chrome.storage.sync.set({ timerSettings: newSettings });
            this.settings = newSettings;
            
            // Send updated settings to service worker
            chrome.runtime.sendMessage({
                type: 'UPDATE_SETTINGS',
                settings: newSettings
            });
            
            this.toggleSettings();
            this.showNotification('设置已保存');
        } catch (error) {
            console.error('Failed to save settings:', error);
            this.showNotification('保存设置失败');
        }
    }

    updateSettingsInputs() {
        this.workDurationInput.value = this.settings.workDuration;
        this.shortBreakInput.value = this.settings.shortBreakDuration;
        this.longBreakInput.value = this.settings.longBreakDuration;
    }

    toggleSettings() {
        this.settingsPanel.classList.toggle('show');
    }

    async loadTimerState() {
        try {
            const response = await chrome.runtime.sendMessage({ type: 'GET_TIMER_STATE' });
            if (response && !response.error) {
                this.isRunning = response.isRunning;
                this.currentPhase = response.currentPhase;
                this.currentCycle = response.currentCycle;
                this.timeRemaining = response.timeRemaining;
            } else {
                console.log('Failed to load timer state or service worker not ready');
                this.resetTimerLocal();
            }
        } catch (error) {
            console.error('Failed to load timer state:', error);
            this.resetTimerLocal();
        }
    }

    async checkTimerState() {
        try {
            const response = await chrome.runtime.sendMessage({ type: 'GET_TIMER_STATE' });
            if (response && !response.error) {
                const wasRunning = this.isRunning;
                this.isRunning = response.isRunning;
                this.currentPhase = response.currentPhase;
                this.currentCycle = response.currentCycle;
                this.timeRemaining = response.timeRemaining;
                
                // Update display if state changed
                if (wasRunning !== this.isRunning || this.timeRemaining !== response.timeRemaining) {
                    this.updateDisplay();
                }
            }
        } catch (error) {
            // Service worker might not be ready, just continue with current state
            console.log('Could not check timer state - service worker may not be ready');
        }
    }

    handleTimerUpdate(data) {
        this.isRunning = data.isRunning;
        this.currentPhase = data.currentPhase;
        this.currentCycle = data.currentCycle;
        this.timeRemaining = data.timeRemaining;
        this.updateDisplay();
    }

    async toggleTimer() {
        try {
            if (this.isRunning) {
                await chrome.runtime.sendMessage({ type: 'PAUSE_TIMER' });
            } else {
                // Update task type before starting
                await this.updateTaskType();
                await chrome.runtime.sendMessage({ 
                    type: 'START_TIMER',
                    settings: this.settings
                });
            }
        } catch (error) {
            console.error('Failed to toggle timer:', error);
        }
    }

    async skipPhase() {
        try {
            await chrome.runtime.sendMessage({ type: 'SKIP_PHASE' });
        } catch (error) {
            console.error('Failed to skip phase:', error);
        }
    }

    async resetTimer() {
        try {
            await chrome.runtime.sendMessage({ type: 'RESET_TIMER' });
            this.resetTimerLocal();
        } catch (error) {
            console.error('Failed to reset timer:', error);
            this.resetTimerLocal();
        }
    }

    resetTimerLocal() {
        this.currentPhase = 'work';
        this.currentCycle = 1;
        this.timeRemaining = this.settings.workDuration * 60;
        this.isRunning = false;
        this.updateDisplay();
    }

    updateDisplay() {
        // Update status text
        const statusTexts = {
            'work': '工作',
            'short-break': '短休息',
            'long-break': '长休息'
        };
        
        this.statusText.textContent = statusTexts[this.currentPhase] || '工作';
        
        // Update time display
        const minutes = Math.floor(this.timeRemaining / 60);
        const seconds = this.timeRemaining % 60;
        this.timeDisplay.textContent = `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
        
        // Update cycle count
        this.cycleCount.textContent = this.currentCycle;
        
        // Update start/pause button
        this.startPauseBtn.textContent = this.isRunning ? '暂停' : '开始';
        
        // Update timer display class for styling
        this.timerDisplayContainer.className = `timer-display ${this.currentPhase}`;
        if (this.isRunning) {
            this.timerDisplayContainer.classList.add('active');
        }
        
        // Show/hide task selection based on running state
        if (this.isRunning && this.currentPhase === 'work') {
            this.timerContent.classList.add('timer-running');
        } else {
            this.timerContent.classList.remove('timer-running');
        }
    }

    // Analytics methods
    async updateAnalytics() {
        try {
            const response = await chrome.runtime.sendMessage({ type: 'GET_HISTORY' });
            const history = response.history || [];
            
            this.renderTodayStats(history);
            this.renderTotalStats(history);
            this.renderWeeklyChart(history);
            this.renderTypeDistribution(history);
        } catch (error) {
            console.error('Failed to update analytics:', error);
        }
    }

    renderTodayStats(history) {
        const today = new Date().toISOString().split('T')[0];
        const todayRecords = history.filter(record => record.date === today);
        
        const todayCount = todayRecords.length;
        const todayMinutes = todayRecords.reduce((sum, record) => sum + record.duration, 0);
        
        this.todayPomodoros.textContent = todayCount;
        this.todayMinutes.textContent = todayMinutes;
    }

    renderTotalStats(history) {
        const totalCount = history.length;
        const totalMinutes = history.reduce((sum, record) => sum + record.duration, 0);
        const totalHours = Math.round(totalMinutes / 60 * 10) / 10;
        
        this.totalPomodoros.textContent = totalCount;
        this.totalHours.textContent = totalHours;
    }

    renderWeeklyChart(history) {
        const days = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'];
        const today = new Date();
        const weekData = [];
        
        // Get data for the last 7 days
        for (let i = 6; i >= 0; i--) {
            const date = new Date(today);
            date.setDate(date.getDate() - i);
            const dateStr = date.toISOString().split('T')[0];
            const dayRecords = history.filter(record => record.date === dateStr);
            
            weekData.push({
                label: days[date.getDay()],
                value: dayRecords.length,
                date: dateStr
            });
        }
        
        const maxValue = Math.max(...weekData.map(d => d.value), 1);
        
        this.weeklyChart.innerHTML = '';
        weekData.forEach(day => {
            const barContainer = document.createElement('div');
            barContainer.className = 'chart-bar';
            
            const barInner = document.createElement('div');
            barInner.className = 'chart-bar-inner';
            barInner.style.height = `${(day.value / maxValue) * 100}%`;
            
            const label = document.createElement('div');
            label.className = 'chart-label';
            label.textContent = day.label;
            
            const value = document.createElement('div');
            value.className = 'chart-value';
            value.textContent = day.value;
            
            barContainer.appendChild(barInner);
            barContainer.appendChild(value);
            barContainer.appendChild(label);
            
            this.weeklyChart.appendChild(barContainer);
        });
    }

    renderTypeDistribution(history) {
        const typeCount = {};
        const typeColors = {
            '工作': '#667eea',
            '学习': '#38a169',
            '创意': '#ed8936',
            '阅读': '#3182ce',
            '编程': '#805ad5',
            '其他': '#718096'
        };
        
        // Count records by type
        history.forEach(record => {
            const type = record.type || '工作';
            typeCount[type] = (typeCount[type] || 0) + 1;
        });
        
        const total = history.length || 1;
        const sortedTypes = Object.entries(typeCount)
            .sort(([,a], [,b]) => b - a)
            .slice(0, 6); // Show top 6 types
        
        this.typeDistribution.innerHTML = '';
        
        if (sortedTypes.length === 0) {
            this.typeDistribution.innerHTML = '<div style="text-align: center; color: #718096; font-size: 14px;">暂无数据</div>';
            return;
        }
        
        sortedTypes.forEach(([type, count]) => {
            const percentage = Math.round((count / total) * 100);
            const color = typeColors[type] || '#718096';
            
            const item = document.createElement('div');
            item.className = 'type-item';
            
            item.innerHTML = `
                <div class="type-color" style="background: ${color}"></div>
                <div class="type-label">${type}</div>
                <div class="type-value">${count}</div>
                <div class="type-bar">
                    <div class="type-bar-fill" style="width: ${percentage}%; background: ${color}"></div>
                </div>
            `;
            
            this.typeDistribution.appendChild(item);
        });
    }

    async exportData() {
        try {
            const response = await chrome.runtime.sendMessage({ type: 'EXPORT_HISTORY' });
            const data = response.data || [];
            
            const blob = new Blob([JSON.stringify(data, null, 2)], { 
                type: 'application/json' 
            });
            
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `tomato-clock-history-${new Date().toISOString().split('T')[0]}.json`;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);
            
            this.showNotification('数据已导出');
        } catch (error) {
            console.error('Failed to export data:', error);
            this.showNotification('导出失败');
        }
    }

    async clearData() {
        if (confirm('确定要清除所有历史记录吗？此操作不可恢复。')) {
            try {
                await chrome.runtime.sendMessage({ type: 'CLEAR_HISTORY' });
                this.updateAnalytics();
                this.showNotification('历史记录已清除');
            } catch (error) {
                console.error('Failed to clear data:', error);
                this.showNotification('清除失败');
            }
        }
    }

    showNotification(message) {
        // Create a simple notification element
        const notification = document.createElement('div');
        notification.textContent = message;
        notification.style.cssText = `
            position: fixed;
            top: 10px;
            left: 50%;
            transform: translateX(-50%);
            background: #667eea;
            color: white;
            padding: 10px 20px;
            border-radius: 6px;
            font-size: 14px;
            z-index: 1000;
            box-shadow: 0 4px 12px rgba(0,0,0,0.2);
        `;
        
        document.body.appendChild(notification);
        
        setTimeout(() => {
            notification.remove();
        }, 2000);
    }

    playNotificationSound() {
        // Play 3 consecutive beeps when the popup is open
        this.playMultipleBeeps(3);
    }
    
    playMultipleBeeps(count = 3) {
        for (let i = 0; i < count; i++) {
            setTimeout(() => {
                this.playSingleBeep();
            }, i * 800); // 800ms delay between each beep
        }
    }
    
    playSingleBeep() {
        try {
            // Create a simple notification sound using Web Audio API
            const audioContext = new (window.AudioContext || window.webkitAudioContext)();
            
            // Create a simple beep
            const oscillator = audioContext.createOscillator();
            const gainNode = audioContext.createGain();
            
            oscillator.connect(gainNode);
            gainNode.connect(audioContext.destination);
            
            oscillator.frequency.setValueAtTime(800, audioContext.currentTime);
            gainNode.gain.setValueAtTime(0.3, audioContext.currentTime);
            gainNode.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.5);
            
            oscillator.start(audioContext.currentTime);
            oscillator.stop(audioContext.currentTime + 0.5);
        } catch (error) {
            console.log('Audio playback not available:', error);
            // Fallback: Try to vibrate if available
            if ('vibrate' in navigator) {
                navigator.vibrate(200);
            }
        }
    }

    destroy() {
        if (this.checkInterval) {
            clearInterval(this.checkInterval);
        }
    }
}

// Initialize the timer when the popup loads
document.addEventListener('DOMContentLoaded', () => {
    window.tomatoTimer = new TomatoTimer();
});

// Clean up when the popup is closed
window.addEventListener('beforeunload', () => {
    if (window.tomatoTimer) {
        window.tomatoTimer.destroy();
    }
});