// Exam Timer Component
class ExamTimer {
    constructor(element, totalSeconds, onTick, onExpire) {
        this.element = element;
        this.totalSeconds = totalSeconds;
        this.remaining = totalSeconds;
        this.onTick = onTick;
        this.onExpire = onExpire;
        this.interval = null;
        this.running = false;
    }

    start() {
        if (this.running) return;
        this.running = true;
        this.render();
        this.interval = setInterval(() => {
            this.remaining--;
            this.render();
            if (this.onTick) this.onTick(this.remaining);

            if (this.remaining <= 0) {
                this.stop();
                if (this.onExpire) this.onExpire();
            }
        }, 1000);
    }

    stop() {
        this.running = false;
        clearInterval(this.interval);
    }

    reset(totalSeconds) {
        this.stop();
        this.totalSeconds = totalSeconds || this.totalSeconds;
        this.remaining = this.totalSeconds;
        this.render();
    }

    render() {
        const mins = Math.floor(this.remaining / 60);
        const secs = this.remaining % 60;
        const display = `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
        this.element.textContent = display;

        // Warning colors
        this.element.classList.remove('timer-warning', 'timer-danger');
        if (this.remaining <= 60) {
            this.element.classList.add('timer-danger');
        } else if (this.remaining <= 300) {
            this.element.classList.add('timer-warning');
        }
    }

    getElapsed() {
        return this.totalSeconds - this.remaining;
    }
}
