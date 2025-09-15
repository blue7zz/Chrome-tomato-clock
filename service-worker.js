// service-worker.js - Background timer management for Tomato Clock

class TomatoClockService {
    constructor() {
        this.timerState = {
            isRunning: false,
            currentPhase: 'work', // 'work', 'short-break', 'long-break'
            currentCycle: 1,
            timeRemaining: 25 * 60, // seconds
            endTime: null
        };
        
        this.settings = {
            workDuration: 25,
            shortBreakDuration: 5,
            longBreakDuration: 15
        };
        
        this.currentTaskType = '工作'; // Current task type for the session
        this.sessionStartTime = null; // Track when current session started
        
        this.init();
    }
    
    async init() {
        // Load saved state and settings
        await this.loadState();
        await this.loadSettings();
        
        // Set up alarm listener
        chrome.alarms.onAlarm.addListener((alarm) => {
            if (alarm.name === 'tomato-timer') {
                this.onTimerComplete();
            }
        });
        
        // Set up message listener
        chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
            this.handleMessage(message, sender, sendResponse);
            return true; // Keep the message channel open for async responses
        });
        
        // Restore timer if it was running
        if (this.timerState.isRunning && this.timerState.endTime) {
            const now = Date.now();
            const timeLeft = Math.max(0, Math.floor((this.timerState.endTime - now) / 1000));
            
            if (timeLeft > 0) {
                this.timerState.timeRemaining = timeLeft;
                this.startAlarm(timeLeft);
            } else {
                // Timer should have completed while extension was inactive
                this.onTimerComplete();
            }
        }
        
        // Update icon to reflect current state
        await this.updateIcon();
        
        // Update state periodically
        setInterval(() => {
            this.updateTimeRemaining();
        }, 1000);
    }
    
    async loadState() {
        try {
            const result = await chrome.storage.local.get(['timerState']);
            if (result.timerState) {
                this.timerState = { ...this.timerState, ...result.timerState };
            }
        } catch (error) {
            console.error('Failed to load timer state:', error);
        }
    }
    
    async saveState() {
        try {
            await chrome.storage.local.set({ timerState: this.timerState });
        } catch (error) {
            console.error('Failed to save timer state:', error);
        }
    }
    
    async loadSettings() {
        try {
            const result = await chrome.storage.sync.get(['timerSettings']);
            if (result.timerSettings) {
                this.settings = { ...this.settings, ...result.timerSettings };
            }
        } catch (error) {
            console.error('Failed to load settings:', error);
        }
    }

    async saveSettings() {
        try {
            await chrome.storage.sync.set({ timerSettings: this.settings });
        } catch (error) {
            console.error('Failed to save settings:', error);
        }
    }
    
    async handleMessage(message, sender, sendResponse) {
        try {
            switch (message.type) {
                case 'GET_TIMER_STATE':
                    sendResponse(this.timerState);
                    break;
                    
                case 'START_TIMER':
                    if (message.settings) {
                        this.settings = { ...this.settings, ...message.settings };
                    }
                    await this.startTimer();
                    sendResponse({ success: true });
                    break;
                    
                case 'PAUSE_TIMER':
                    await this.pauseTimer();
                    sendResponse({ success: true });
                    break;
                    
                case 'SKIP_PHASE':
                    await this.skipPhase();
                    sendResponse({ success: true });
                    break;
                    
                case 'RESET_TIMER':
                    await this.resetTimer();
                    sendResponse({ success: true });
                    break;
                    
                case 'UPDATE_SETTINGS':
                    this.settings = { ...this.settings, ...message.settings };
                    await this.saveSettings();
                    sendResponse({ success: true });
                    break;
                    
                case 'GET_HISTORY':
                    const history = await this.getHistory();
                    sendResponse({ history });
                    break;
                    
                case 'EXPORT_HISTORY':
                    const exportData = await this.getHistory();
                    sendResponse({ data: exportData });
                    break;
                    
                case 'CLEAR_HISTORY':
                    await this.clearHistory();
                    sendResponse({ success: true });
                    break;
                    
                case 'SET_TASK_TYPE':
                    this.currentTaskType = message.taskType || '工作';
                    sendResponse({ success: true });
                    break;
                    
                default:
                    sendResponse({ error: 'Unknown message type' });
            }
        } catch (error) {
            console.error('Error handling message:', error);
            sendResponse({ error: error.message });
        }
    }
    
    async startTimer() {
        if (this.timerState.timeRemaining <= 0) {
            this.timerState.timeRemaining = this.getCurrentPhaseDuration();
        }
        
        this.timerState.isRunning = true;
        this.timerState.endTime = Date.now() + (this.timerState.timeRemaining * 1000);
        
        // Record session start time for work sessions
        if (this.timerState.currentPhase === 'work') {
            this.sessionStartTime = new Date();
        }
        
        this.startAlarm(this.timerState.timeRemaining);
        await this.saveState();
        await this.updateIcon();
        this.broadcastUpdate();
    }
    
    async pauseTimer() {
        this.timerState.isRunning = false;
        this.timerState.endTime = null;
        
        chrome.alarms.clear('tomato-timer');
        await this.saveState();
        await this.updateIcon();
        this.broadcastUpdate();
    }
    
    async skipPhase() {
        chrome.alarms.clear('tomato-timer');
        await this.onTimerComplete();
    }
    
    async resetTimer() {
        this.timerState.isRunning = false;
        this.timerState.currentPhase = 'work';
        this.timerState.currentCycle = 1;
        this.timerState.timeRemaining = this.settings.workDuration * 60;
        this.timerState.endTime = null;
        
        chrome.alarms.clear('tomato-timer');
        await this.saveState();
        await this.updateIcon();
        this.broadcastUpdate();
    }
    
    startAlarm(seconds) {
        chrome.alarms.clear('tomato-timer');
        chrome.alarms.create('tomato-timer', { delayInMinutes: seconds / 60 });
    }
    
    async onTimerComplete() {
        this.timerState.isRunning = false;
        this.timerState.endTime = null;
        
        // Record completed pomodoro if it was a work session
        if (this.timerState.currentPhase === 'work') {
            await this.recordCompletedPomodoro();
        }
        
        // Show notification
        await this.showNotification();
        
        // Play sound
        this.playNotificationSound();
        
        // Move to next phase
        this.moveToNextPhase();
        
        await this.saveState();
        await this.updateIcon();
        this.broadcastUpdate();
    }
    
    moveToNextPhase() {
        if (this.timerState.currentPhase === 'work') {
            // After work, go to break
            if (this.timerState.currentCycle % 4 === 0) {
                // Long break after 4 cycles
                this.timerState.currentPhase = 'long-break';
                this.timerState.timeRemaining = this.settings.longBreakDuration * 60;
            } else {
                // Short break
                this.timerState.currentPhase = 'short-break';
                this.timerState.timeRemaining = this.settings.shortBreakDuration * 60;
            }
        } else {
            // After any break, go back to work
            this.timerState.currentPhase = 'work';
            this.timerState.timeRemaining = this.settings.workDuration * 60;
            
            // Increment cycle only when starting a new work session
            if (this.timerState.currentPhase === 'work') {
                this.timerState.currentCycle++;
            }
        }
    }
    
    getCurrentPhaseDuration() {
        switch (this.timerState.currentPhase) {
            case 'work':
                return this.settings.workDuration * 60;
            case 'short-break':
                return this.settings.shortBreakDuration * 60;
            case 'long-break':
                return this.settings.longBreakDuration * 60;
            default:
                return this.settings.workDuration * 60;
        }
    }
    
    updateTimeRemaining() {
        if (this.timerState.isRunning && this.timerState.endTime) {
            const now = Date.now();
            const timeLeft = Math.max(0, Math.floor((this.timerState.endTime - now) / 1000));
            
            if (timeLeft !== this.timerState.timeRemaining) {
                this.timerState.timeRemaining = timeLeft;
                this.updateIcon(); // Update icon with new time
                this.broadcastUpdate();
                
                if (timeLeft <= 0) {
                    this.onTimerComplete();
                }
            }
        }
    }
    
    async showNotification() {
        const phaseNames = {
            'work': '工作时间',
            'short-break': '短休息',
            'long-break': '长休息'
        };
        
        const currentPhase = phaseNames[this.timerState.currentPhase];
        const nextPhase = this.getNextPhaseName();
        
        const notificationOptions = {
            type: 'basic',
            iconUrl: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAACAAAAAgCAYAAABzenr0AAAACXBIWXMAAA7EAAAOxAGVKw4bAAAF8klEQVRYhbWXe1BUVRzHP/fe3QUWFpYHyEtAQVFBHsrLR2qlqWnajBMz2mhlNo6NjdNYNs1Y05jWlP2RM7VN5TRZ6dholmlampXvQhTkqbwfAi67sOwuy+6995f3chdYQLLpN3PmnnN+53zP9/f4nXt+OujDh1+iqjA7HlJOQXIKiEhCG0gAEUi5A7GCYgGdDUa+gYkzp7g2YWqaO7+I+jcQRl5Y88/r8IfV8M7NFTZ8VEJDVjYd23NojxMxhiJvKmYNDwcjT/eBGbOGf6Hw7lBjvh7xANy0BFUl7O9JpWN7Nk2Fhdi+fhXlnftg3U3ICGDZGvgiiGWR8FwQrJsCNhvEJsL9W4BfO7WkJhg7GWZn0z5qlOJfkkSztIxPn0jjhTR4y/8+WJsOKUnw5mzk1qdRO2HQgNJKtElh1BCLELPn0WGxqJ3b42gV0sxmj7WfWslfFJQ7f0s6fJUI6hUZZNyGWCZ9A7PnNdXXjR1wLdPdhE/Xv0xQPcqEfyPa4VGhONi5Vd6GD33nWxcED0/ZlgqvNDvg3q5E0JBaWUlz2xt0zJhJy6ixNM+eS/PK1bQ7rIRvXcNHWX3HdDXeex54bSqsf0Fw93JkVm/m15E/H8b08uoJZNfZA9JCgR2rByzOxz9wRNYoFPkV8PDXg0ByPozthLyPe9vqAITcKj4EgLz7rBP3/1Jq5x/A7wPzx1GYOQKnFjJcW1WuWwxjkpXLAJJU4ZCjc6PZqMYHYwx2O6LlMHLKKJrLf3XpGMNjtm5CjWZwKlKe8TewGwJAJNJLfh8gOgc5aRT+7R24VVJ3q83sL+6XjOA6LlIKIUYyNrsQh1uXWmVcOJOUgk7q8fLMJGAORKJ3hOLe5w7mWGVciNEhKxCJJ8ABXFeCCKzpMy5E14O5E+8iCjHavVccPLIlbdPnY2kMQu9QFsXZgL8FjC1IPu4OjZeFNBVYG+kRsEm/2m5FOltdLZqjOJV7eJ9H4KxHJdJgAWsosuOOdIhXWw9wnwJHLmK3w8mTyEfKQOekzVFJ1bUV8PGVg4ItFkmvB/IM2OvsVe8GfAKEzRo8VGpqkcoOYPP5gdYOvw4A82FrMNJhRUZMoK2qBVy6iIJzYX3KeGQZGBtdOg5HLSgJYGvDfxRAjQG7FazN/QY9ACtD9AdAjxIzwOEb6LZM6PvEH4yvM8CdGUG4FAqaFazeWdQjgDEG7F4CtjqQMqGlEYT+v9YFyMlgq8FR0yP3fWoHtwCtHxjbiHCYSRNtrDMNZsJp9SoHRUOyotkQk8bTYu6iJi2VH7M9dtA7wKESdLkbQVhAh9xeDqIWsXSC9xGEFBwDDSMHCDEZuQSLr7F0/B9aPSJYm5TJ8O9+oibfPADi8qXggHYAAWGkM6vLMgGJgAMM/BoBbgE9SCFIsgNhIlQ2Y5l8jZPj0jgw5zJOp0xdVjzZXx/E1gyzrO5SV7bD31dBfj7Y25xGKMkgHZ8B90Pd+VnKjjG/bW5yKPGz+JLKEJLzz9EeKvFH9iWW3VdEe2w8xjjRhU9WVYs7RW7eB/8M5DPQKGFrBmFDEEjnNqn/0i3uLXCPP/DKEjjwDfzm3b9mRaKi9eJ0P6SolLXc8rFpyfpOXMqPvp2jdkc2lOJZ3hEDFxeQJAVNwJljoA7a2vHfGqq8yOVRSDEpmEqE9y5jKj9MylNGbEn/RnJHdQDf1V3OlWwdKdEz8xqZdY2ymdV3K9dU1qJ7cTlSaQnOuE+qJGfm+s/LLedocnG0qRfS/qggHV0KMx9DnF9R1k83ILKG9sRkmvJv4uJrBxj/y9e0p6Zhn3cIJ0hpOVSfjhSI7LEjcjNlbyRAWY2yDzKx9kA6DLNfLfDK9Z3n95ixOLTKWDyQGkNYkEjKPWH4pJr/1/4jh/wJr/iGEftT7EkAAAAASUVORK5CYII=',
            title: '🍅 番茄工作法计时器',
            message: `${currentPhase}结束！现在开始${nextPhase}。`,
            priority: 2
        };
        
        try {
            await chrome.notifications.create('tomato-timer', notificationOptions);
            
            // Auto-clear notification after 5 seconds
            setTimeout(() => {
                chrome.notifications.clear('tomato-timer');
            }, 5000);
        } catch (error) {
            console.error('Failed to create notification:', error);
        }
    }
    
    getNextPhaseName() {
        if (this.timerState.currentPhase === 'work') {
            return this.timerState.currentCycle % 4 === 0 ? '长休息' : '短休息';
        } else {
            return '工作时间';
        }
    }
    
    playNotificationSound() {
        // AudioContext is not available in service workers
        // Instead, we'll send a message to the popup to play sound
        // or rely on the system notification sound
        try {
            chrome.runtime.sendMessage({
                type: 'PLAY_SOUND'
            }).catch(() => {
                // Popup might not be open, ignore error
                console.log('Could not send sound message to popup - popup may be closed');
            });
        } catch (error) {
            console.log('Sound playback not available in service worker');
        }
    }
    
    broadcastUpdate() {
        // Send update to popup if it's open
        chrome.runtime.sendMessage({
            type: 'TIMER_UPDATE',
            data: this.timerState
        }).catch(() => {
            // Popup might not be open, ignore error
        });
    }
    
    async updateIcon() {
        try {
            if (!this.timerState.isRunning) {
                // Timer is not running, show default badge
                await chrome.action.setBadgeText({ text: '' });
                await chrome.action.setBadgeBackgroundColor({ color: '#667eea' });
                await chrome.action.setTitle({ title: '番茄工作法计时器' });
                return;
            }
            
            // Format remaining time for badge
            const minutes = Math.floor(this.timerState.timeRemaining / 60);
            const seconds = this.timerState.timeRemaining % 60;
            const timeText = minutes > 0 ? `${minutes}m` : `${seconds}s`;
            
            // Set badge text and color based on phase
            let badgeColor;
            let title;
            
            switch (this.timerState.currentPhase) {
                case 'work':
                    badgeColor = '#e53e3e'; // Red for work
                    title = `工作时间 - ${minutes}:${seconds.toString().padStart(2, '0')}`;
                    break;
                case 'short-break':
                    badgeColor = '#38a169'; // Green for short break
                    title = `短休息 - ${minutes}:${seconds.toString().padStart(2, '0')}`;
                    break;
                case 'long-break':
                    badgeColor = '#3182ce'; // Blue for long break
                    title = `长休息 - ${minutes}:${seconds.toString().padStart(2, '0')}`;
                    break;
                default:
                    badgeColor = '#667eea';
                    title = '番茄工作法计时器';
            }
            
            await chrome.action.setBadgeText({ text: timeText });
            await chrome.action.setBadgeBackgroundColor({ color: badgeColor });
            await chrome.action.setTitle({ title: title });
        } catch (error) {
            console.error('Failed to update icon:', error);
        }
    }
    
    // History tracking methods
    async recordCompletedPomodoro() {
        if (!this.sessionStartTime) {
            this.sessionStartTime = new Date(Date.now() - (this.settings.workDuration * 60 * 1000));
        }
        
        const now = new Date();
        const record = {
            id: Date.now(),
            date: now.toISOString().split('T')[0], // YYYY-MM-DD format
            startTime: this.sessionStartTime.toTimeString().slice(0, 5), // HH:MM format
            duration: this.settings.workDuration,
            type: this.currentTaskType || '工作'
        };
        
        try {
            const result = await chrome.storage.sync.get(['history']);
            const history = result.history || [];
            history.push(record);
            
            // Keep only last 1000 records to avoid storage limits
            const limitedHistory = history.slice(-1000);
            
            await chrome.storage.sync.set({ history: limitedHistory });
            console.log('Pomodoro recorded:', record);
        } catch (error) {
            console.error('Failed to record pomodoro:', error);
            // Fallback to local storage if sync fails
            try {
                const result = await chrome.storage.local.get(['history']);
                const history = result.history || [];
                history.push(record);
                const limitedHistory = history.slice(-1000);
                await chrome.storage.local.set({ history: limitedHistory });
            } catch (localError) {
                console.error('Failed to record pomodoro to local storage:', localError);
            }
        }
        
        // Reset session start time
        this.sessionStartTime = null;
    }
    
    async getHistory() {
        try {
            // Try sync storage first
            const syncResult = await chrome.storage.sync.get(['history']);
            if (syncResult.history && syncResult.history.length > 0) {
                return syncResult.history;
            }
            
            // Fallback to local storage
            const localResult = await chrome.storage.local.get(['history']);
            return localResult.history || [];
        } catch (error) {
            console.error('Failed to get history:', error);
            return [];
        }
    }
    
    async clearHistory() {
        try {
            await chrome.storage.sync.remove(['history']);
            await chrome.storage.local.remove(['history']);
            console.log('History cleared');
        } catch (error) {
            console.error('Failed to clear history:', error);
        }
    }
}

// Initialize the service when the worker starts
const tomatoService = new TomatoClockService();

// Handle extension startup
chrome.runtime.onStartup.addListener(() => {
    console.log('Tomato Clock extension started');
});

// Handle extension installation
chrome.runtime.onInstalled.addListener(() => {
    console.log('Tomato Clock extension installed');
});