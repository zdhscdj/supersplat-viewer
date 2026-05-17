/**
 * Video Exporter - Record canvas frames and encode to MP4 using WebCodecs/MediaRecorder
 */
export class VideoExporter {
    constructor(sceneManager, cameraPath) {
        this.sceneManager = sceneManager;
        this.cameraPath = cameraPath;
        this.recording = false;
        this.progress = 0;
        this.onProgress = null;
        this.onComplete = null;
    }

    async exportMP4(options = {}) {
        const {
            width = 1920,
            height = 1080,
            fps = 30,
            bitrate = 8000000,
            duration = null
        } = options;

        const pathDuration = duration || this.cameraPath.duration;
        const totalFrames = Math.ceil(pathDuration * fps);

        this.recording = true;
        this.progress = 0;

        // Use MediaRecorder with canvas capture stream
        const canvas = this.sceneManager.canvas;
        const renderer = this.sceneManager.renderer;
        const camera = this.sceneManager.camera;

        // Store original size
        const origWidth = canvas.width;
        const origHeight = canvas.height;

        // Resize for export
        renderer.setSize(width, height);
        camera.aspect = width / height;
        camera.updateProjectionMatrix();

        // Create offscreen canvas for recording
        const stream = canvas.captureStream(0); // 0 = manual frame capture
        const mediaRecorder = new MediaRecorder(stream, {
            mimeType: this._getSupportedMimeType(),
            videoBitsPerSecond: bitrate
        });

        const chunks = [];
        mediaRecorder.ondataavailable = (e) => {
            if (e.data.size > 0) chunks.push(e.data);
        };

        return new Promise((resolve, reject) => {
            mediaRecorder.onstop = () => {
                // Restore original size
                renderer.setSize(origWidth, origHeight);
                camera.aspect = origWidth / origHeight;
                camera.updateProjectionMatrix();

                const blob = new Blob(chunks, { type: 'video/mp4' });
                this.recording = false;
                this.progress = 1;

                if (this.onComplete) this.onComplete(blob);
                resolve(blob);
            };

            mediaRecorder.onerror = (e) => {
                renderer.setSize(origWidth, origHeight);
                camera.aspect = origWidth / origHeight;
                camera.updateProjectionMatrix();
                this.recording = false;
                reject(e);
            };

            mediaRecorder.start();
            this._renderFrames(totalFrames, fps, pathDuration, stream, mediaRecorder).then(() => {
                mediaRecorder.stop();
            });
        });
    }

    async _renderFrames(totalFrames, fps, duration, stream, mediaRecorder) {
        const dt = 1 / fps;

        for (let i = 0; i < totalFrames; i++) {
            const time = (i / totalFrames) * duration;

            // Evaluate camera path
            const pose = this.cameraPath.evaluate(time);
            if (pose) {
                this.sceneManager.camera.position.copy(pose.position);
                this.sceneManager.camera.lookAt(pose.target);
                if (pose.fov) {
                    this.sceneManager.camera.fov = pose.fov;
                    this.sceneManager.camera.updateProjectionMatrix();
                }
            }

            // Render frame
            this.sceneManager.render();

            // Capture frame
            const track = stream.getVideoTracks()[0];
            if (track && track.requestFrame) {
                track.requestFrame();
            }

            // Update progress
            this.progress = (i + 1) / totalFrames;
            if (this.onProgress) this.onProgress(this.progress);

            // Yield to prevent blocking
            if (i % 5 === 0) {
                await new Promise(r => setTimeout(r, 0));
            }
        }
    }

    _getSupportedMimeType() {
        const types = [
            'video/mp4;codecs=avc1',
            'video/mp4',
            'video/webm;codecs=vp9',
            'video/webm;codecs=vp8',
            'video/webm'
        ];
        for (const type of types) {
            if (MediaRecorder.isTypeSupported(type)) return type;
        }
        return 'video/webm';
    }

    downloadBlob(blob, filename = '3dgs-export.mp4') {
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    }
}
