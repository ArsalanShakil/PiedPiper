// MediaRecorder wrapper for speaking practice
class AudioRecorder {
    constructor() {
        this.mediaRecorder = null;
        this.chunks = [];
        this.stream = null;
        this.isRecording = false;
    }

    async init() {
        this.stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    }

    start() {
        if (!this.stream) throw new Error('Call init() first');
        this.chunks = [];
        const mimeType = MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
            ? 'audio/webm;codecs=opus' : 'audio/webm';
        this.mediaRecorder = new MediaRecorder(this.stream, { mimeType });
        this.mediaRecorder.ondataavailable = (e) => {
            if (e.data.size > 0) this.chunks.push(e.data);
        };
        this.mediaRecorder.start();
        this.isRecording = true;
    }

    stop() {
        return new Promise((resolve) => {
            this.mediaRecorder.onstop = () => {
                const blob = new Blob(this.chunks, { type: this.mediaRecorder.mimeType });
                this.isRecording = false;
                resolve(blob);
            };
            this.mediaRecorder.stop();
        });
    }

    destroy() {
        if (this.stream) {
            this.stream.getTracks().forEach(t => t.stop());
            this.stream = null;
        }
        this.isRecording = false;
    }
}
