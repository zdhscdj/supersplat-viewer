/**
 * 3DGS Studio - Main Application
 * Based on Spark.js 2.0 - Load, Clean, Path, Export workflow
 */
import { SceneManager } from './modules/scene-manager.js';
import { CameraControls } from './modules/camera-controls.js';
import { SplatCleaner } from './modules/splat-cleaner.js';
import { CameraPath } from './modules/camera-path.js';
import { VideoExporter } from './modules/video-exporter.js';

class App {
    constructor() {
        this.mode = 'view'; // view | clean | path | export
        this.canvas = document.getElementById('viewport');

        // Core modules
        this.sceneManager = new SceneManager(this.canvas);
        this.controls = new CameraControls(this.sceneManager.camera, this.canvas);
        this.cleaner = new SplatCleaner(this.sceneManager);
        this.cameraPath = new CameraPath(this.sceneManager);
        this.exporter = new VideoExporter(this.sceneManager, this.cameraPath);

        // UI Elements
        this.ui = {
            statusText: document.getElementById('status-text'),
            splatCount: document.getElementById('splat-count'),
            fpsCounter: document.getElementById('fps-counter'),
            loadingOverlay: document.getElementById('loading-overlay'),
            loadingText: document.getElementById('loading-text'),
            loadingProgress: document.getElementById('loading-progress'),
            timeline: document.getElementById('timeline'),
            timelineTime: document.getElementById('timeline-time'),
            timelineDuration: document.getElementById('timeline-duration'),
            keyframeList: document.getElementById('keyframe-list'),
            exportProgress: document.getElementById('export-progress'),
        };

        this._bindEvents();
        this._startLoop();
    }

    _bindEvents() {
        // File input
        const fileInput = document.getElementById('file-input');
        document.getElementById('btn-load').addEventListener('click', () => fileInput.click());
        fileInput.addEventListener('change', (e) => {
            if (e.target.files.length) this.loadFile(e.target.files[0]);
        });

        // Drag & drop
        const app = document.getElementById('app');
        app.addEventListener('dragover', (e) => { e.preventDefault(); app.classList.add('drag-over'); });
        app.addEventListener('dragleave', () => app.classList.remove('drag-over'));
        app.addEventListener('drop', (e) => {
            e.preventDefault();
            app.classList.remove('drag-over');
            if (e.dataTransfer.files.length) this.loadFile(e.dataTransfer.files[0]);
        });

        // Mode tabs
        document.querySelectorAll('.mode-btn').forEach(btn => {
            btn.addEventListener('click', () => this.setMode(btn.dataset.mode));
        });

        // Undo/Redo
        document.getElementById('btn-undo').addEventListener('click', () => this.cleaner.undo());
        document.getElementById('btn-redo').addEventListener('click', () => this.cleaner.redo());

        // View panel
        document.getElementById('camera-mode').addEventListener('change', (e) => {
            this.controls.setMode(e.target.value);
        });
        document.getElementById('fov-slider').addEventListener('input', (e) => {
            this.sceneManager.camera.fov = parseFloat(e.target.value);
            this.sceneManager.camera.updateProjectionMatrix();
            document.getElementById('fov-value').textContent = e.target.value;
        });
        document.getElementById('btn-frame').addEventListener('click', () => {
            const center = this.sceneManager.getSceneCenter();
            const size = this.sceneManager.getSceneSize();
            this.controls.frameScene(center, size);
        });
        document.getElementById('btn-reset-camera').addEventListener('click', () => this.controls.reset());

        // Clean panel
        document.getElementById('clean-tool').addEventListener('change', (e) => {
            this.cleaner.tool = e.target.value;
        });
        document.getElementById('brush-radius').addEventListener('input', (e) => {
            this.cleaner.brushRadius = parseInt(e.target.value);
            this.cleaner.updateCursorSize();
            document.getElementById('radius-value').textContent = e.target.value;
        });
        document.getElementById('brush-opacity').addEventListener('input', (e) => {
            this.cleaner.brushOpacity = parseInt(e.target.value);
            document.getElementById('opacity-value').textContent = e.target.value + '%';
        });
        document.getElementById('float-threshold').addEventListener('input', (e) => {
            this.cleaner.floatThreshold = parseInt(e.target.value);
            document.getElementById('threshold-value').textContent = e.target.value;
        });
        document.getElementById('min-neighbors').addEventListener('input', (e) => {
            this.cleaner.minNeighbors = parseInt(e.target.value);
            document.getElementById('neighbors-value').textContent = e.target.value;
        });
        document.getElementById('btn-auto-filter').addEventListener('click', () => {
            const removed = this.cleaner.autoFilterFloaters();
            this.setStatus(`Filtered ~${removed} floating splats`);
        });
        document.getElementById('btn-delete-selected').addEventListener('click', () => {
            this.setStatus('Deleted selected splats');
        });
        document.getElementById('btn-invert-selection').addEventListener('click', () => {
            this.setStatus('Selection inverted');
        });

        // Path panel
        document.getElementById('path-preset').addEventListener('change', (e) => {
            this.cameraPath.preset = e.target.value;
            if (e.target.value !== 'custom') {
                const center = this.sceneManager.getSceneCenter();
                const size = this.sceneManager.getSceneSize();
                this.cameraPath.generatePreset(e.target.value, center, size);
                this._updateKeyframeUI();
                this.setStatus(`Generated ${e.target.value} path`);
            }
        });
        document.getElementById('path-duration').addEventListener('change', (e) => {
            this.cameraPath.duration = parseFloat(e.target.value);
            this.ui.timelineDuration.textContent = e.target.value + '.0s';
        });
        document.getElementById('path-easing').addEventListener('change', (e) => {
            this.cameraPath.easing = e.target.value;
        });
        document.getElementById('btn-add-keyframe').addEventListener('click', () => {
            const pose = this.controls.getPose();
            this.cameraPath.addKeyframe(pose);
            this._updateKeyframeUI();
            this.setStatus(`Added keyframe #${this.cameraPath.keyframes.length}`);
        });
        document.getElementById('btn-generate-path').addEventListener('click', () => {
            this.cameraPath.generateOptimalPath();
            this._updateKeyframeUI();
            this.setStatus('Generated optimal path');
        });
        document.getElementById('btn-preview-play').addEventListener('click', () => {
            this.controls.enabled = false;
            this.cameraPath.play((pose, progress) => {
                this.sceneManager.camera.position.copy(pose.position);
                this.sceneManager.camera.lookAt(pose.target);
                if (pose.fov) {
                    this.sceneManager.camera.fov = pose.fov;
                    this.sceneManager.camera.updateProjectionMatrix();
                }
                this._updateTimelinePlayhead(progress);
            });
            this.setStatus('Playing preview...');
        });
        document.getElementById('btn-preview-stop').addEventListener('click', () => {
            this.cameraPath.stop();
            this.controls.enabled = true;
            this.setStatus('Preview stopped');
        });
        document.getElementById('preview-time').addEventListener('input', (e) => {
            const t = parseFloat(e.target.value) / 100;
            const pose = this.cameraPath.evaluate(t * this.cameraPath.duration);
            if (pose) {
                this.sceneManager.camera.position.copy(pose.position);
                this.sceneManager.camera.lookAt(pose.target);
            }
            this._updateTimelinePlayhead(t);
        });

        // Export panel
        document.getElementById('btn-export-mp4').addEventListener('click', () => this._exportMP4());
        document.getElementById('btn-export-ply').addEventListener('click', () => {
            this.setStatus('PLY export not yet implemented for edited splats');
        });

        // Canvas pointer events for clean mode
        this.canvas.addEventListener('pointermove', (e) => {
            if (this.mode === 'clean') {
                this.cleaner.onPointerMove(e.clientX, e.clientY);
            }
        });
        this.canvas.addEventListener('pointerdown', (e) => {
            if (this.mode === 'clean') {
                const handled = this.cleaner.onPointerDown(e.clientX, e.clientY, e.button);
                if (handled) e.preventDefault();
            }
        });
        this.canvas.addEventListener('pointerup', (e) => {
            if (this.mode === 'clean') {
                this.cleaner.onPointerUp(e.clientX, e.clientY);
            }
        });

        // Keyboard shortcuts
        window.addEventListener('keydown', (e) => {
            if (e.ctrlKey && e.key === 'z') { this.cleaner.undo(); e.preventDefault(); }
            if (e.ctrlKey && e.key === 'y') { this.cleaner.redo(); e.preventDefault(); }
            if (e.key === '1') this.setMode('view');
            if (e.key === '2') this.setMode('clean');
            if (e.key === '3') this.setMode('path');
            if (e.key === '4') this.setMode('export');
        });
    }

    async loadFile(file) {
        const ext = file.name.split('.').pop().toLowerCase();
        if (!['ply', 'splat', 'spz', 'ksplat'].includes(ext)) {
            this.setStatus('Unsupported format. Use .ply, .splat, .spz, or .ksplat');
            return;
        }

        this.showLoading(`Loading ${file.name}...`);

        try {
            const result = await this.sceneManager.loadModel(file, (progress) => {
                this.ui.loadingProgress.style.width = `${progress * 100}%`;
                this.ui.loadingText.textContent = `Loading... ${Math.round(progress * 100)}%`;
            });

            this.hideLoading();
            this.ui.splatCount.textContent = `Splats: ${result.splatCount.toLocaleString()}`;
            this.setStatus(`Loaded ${file.name} - ${result.splatCount.toLocaleString()} splats`);

            // Frame the scene
            setTimeout(() => {
                const center = this.sceneManager.getSceneCenter();
                const size = this.sceneManager.getSceneSize();
                if (size > 0) this.controls.frameScene(center, size);
            }, 500);
        } catch (err) {
            this.hideLoading();
            this.setStatus(`Error: ${err.message}`);
            console.error('Load error:', err);
        }
    }

    setMode(mode) {
        this.mode = mode;

        // Update tab UI
        document.querySelectorAll('.mode-btn').forEach(btn => {
            btn.classList.toggle('active', btn.dataset.mode === mode);
        });

        // Show/hide panels
        document.querySelectorAll('.panel-section').forEach(panel => {
            panel.classList.toggle('hidden', panel.dataset.panel !== mode);
        });

        // Mode-specific activation
        this.cleaner.deactivate();
        this.controls.enabled = true;

        if (mode === 'clean') {
            this.cleaner.activate();
            this.controls.enabled = false;
        }

        // Timeline visibility
        this.ui.timeline.classList.toggle('hidden', mode !== 'path');

        // Path visualization
        if (mode === 'path') {
            this.cameraPath._updatePathVisualization();
        } else {
            this.cameraPath.clearVisualization();
        }

        this.setStatus(`Mode: ${mode.charAt(0).toUpperCase() + mode.slice(1)}`);
    }

    async _exportMP4() {
        if (this.cameraPath.keyframes.length < 2) {
            this.setStatus('Need at least 2 keyframes to export video');
            return;
        }

        const resolution = document.getElementById('export-resolution').value.split('x');
        const fps = parseInt(document.getElementById('export-fps').value);
        const bitrate = parseInt(document.getElementById('export-bitrate').value) * 1000000;

        this.ui.exportProgress.classList.remove('hidden');
        this.setStatus('Exporting MP4...');

        this.exporter.onProgress = (progress) => {
            const pct = Math.round(progress * 100);
            this.ui.exportProgress.querySelector('.progress-fill').style.width = `${pct}%`;
            this.ui.exportProgress.querySelector('.progress-text').textContent = `${pct}%`;
        };

        try {
            const blob = await this.exporter.exportMP4({
                width: parseInt(resolution[0]),
                height: parseInt(resolution[1]),
                fps,
                bitrate
            });

            this.exporter.downloadBlob(blob);
            this.setStatus('MP4 exported successfully!');
        } catch (err) {
            this.setStatus(`Export error: ${err.message}`);
            console.error('Export error:', err);
        } finally {
            this.ui.exportProgress.classList.add('hidden');
        }
    }

    _updateKeyframeUI() {
        const list = this.ui.keyframeList;
        list.innerHTML = '';
        this.cameraPath.keyframes.forEach((kf, i) => {
            const item = document.createElement('div');
            item.className = 'keyframe-item';
            item.innerHTML = `
                <span class="kf-index">#${i + 1}</span>
                <span class="kf-info">${kf.time.toFixed(1)}s | FOV ${kf.fov.toFixed(0)}</span>
                <span class="kf-actions">
                    <button class="kf-goto" title="Go to">&#x25B6;</button>
                    <button class="kf-update" title="Update">&#x21BB;</button>
                    <button class="kf-delete" title="Delete">&#x2715;</button>
                </span>
            `;
            item.querySelector('.kf-goto').addEventListener('click', () => {
                this.sceneManager.camera.position.copy(kf.position);
                this.sceneManager.camera.lookAt(kf.target);
            });
            item.querySelector('.kf-update').addEventListener('click', () => {
                const pose = this.controls.getPose();
                this.cameraPath.updateKeyframe(i, pose);
                this._updateKeyframeUI();
                this.setStatus(`Updated keyframe #${i + 1}`);
            });
            item.querySelector('.kf-delete').addEventListener('click', () => {
                this.cameraPath.removeKeyframe(i);
                this._updateKeyframeUI();
                this.setStatus(`Removed keyframe #${i + 1}`);
            });
            list.appendChild(item);
        });

        // Update timeline markers
        const markers = document.querySelector('.timeline-keyframes');
        if (markers) {
            markers.innerHTML = '';
            this.cameraPath.keyframes.forEach((kf, i) => {
                const marker = document.createElement('div');
                marker.className = 'timeline-kf-marker';
                marker.style.left = `${(kf.time / this.cameraPath.duration) * 100}%`;
                marker.title = `Keyframe #${i + 1}`;
                markers.appendChild(marker);
            });
        }
    }

    _updateTimelinePlayhead(progress) {
        const playhead = document.querySelector('.timeline-playhead');
        if (playhead) playhead.style.left = `${progress * 100}%`;
        this.ui.timelineTime.textContent = `${(progress * this.cameraPath.duration).toFixed(1)}s`;
    }

    showLoading(text) {
        this.ui.loadingOverlay.classList.remove('hidden');
        this.ui.loadingText.textContent = text;
        this.ui.loadingProgress.style.width = '0%';
    }

    hideLoading() {
        this.ui.loadingOverlay.classList.add('hidden');
    }

    setStatus(text) {
        this.ui.statusText.textContent = text;
    }

    _startLoop() {
        const clock = { last: performance.now() };

        const loop = () => {
            requestAnimationFrame(loop);
            const now = performance.now();
            const dt = (now - clock.last) / 1000;
            clock.last = now;

            // Update controls
            if (this.controls.enabled) {
                this.controls.update(dt);
            }

            // Update camera path playback
            if (this.cameraPath.playing) {
                this.cameraPath.tick(dt);
                if (!this.cameraPath.playing) {
                    this.controls.enabled = true;
                    this.setStatus('Preview complete');
                }
            }

            // Render
            this.sceneManager.render();

            // FPS display
            this.ui.fpsCounter.textContent = `FPS: ${this.sceneManager.fps}`;
        };

        loop();
    }
}

// Initialize app
document.addEventListener('DOMContentLoaded', () => {
    window.app = new App();
});
