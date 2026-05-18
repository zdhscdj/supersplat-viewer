/**
 * 3DGS Studio - Main Application
 * Based on Spark.js 2.0 - Load, Clean, Path, Export workflow
 * 
 * 使用延迟初始化确保 UI 事件即使 CDN 加载失败也能工作
 */

let SceneManager, CameraControls, SplatCleaner, CameraPath, VideoExporter;
let modulesLoaded = false;

async function loadModules() {
    try {
        const [sm, cc, sc, cp, ve] = await Promise.all([
            import('./modules/scene-manager.js'),
            import('./modules/camera-controls.js'),
            import('./modules/splat-cleaner.js'),
            import('./modules/camera-path.js'),
            import('./modules/video-exporter.js')
        ]);
        SceneManager = sm.SceneManager;
        CameraControls = cc.CameraControls;
        SplatCleaner = sc.SplatCleaner;
        CameraPath = cp.CameraPath;
        VideoExporter = ve.VideoExporter;
        modulesLoaded = true;
        return true;
    } catch (err) {
        console.error('Failed to load modules:', err);
        return false;
    }
}

class App {
    constructor() {
        this.mode = 'view';
        this.canvas = document.getElementById('viewport');
        this.initialized = false;

        // Module instances (lazy init)
        this.sceneManager = null;
        this.controls = null;
        this.cleaner = null;
        this.cameraPath = null;
        this.exporter = null;

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
        this._initEngine();
    }

    async _initEngine() {
        this.setStatus('Loading 3D engine (THREE.js + Spark.js)...');
        const ok = await loadModules();
        if (!ok) {
            this.setStatus('Error: Failed to load 3D engine. Check internet connection and refresh.');
            return;
        }

        try {
            this.sceneManager = new SceneManager(this.canvas);
            this.controls = new CameraControls(this.sceneManager.camera, this.canvas);
            this.cleaner = new SplatCleaner(this.sceneManager);
            this.cameraPath = new CameraPath(this.sceneManager);
            this.exporter = new VideoExporter(this.sceneManager, this.cameraPath);
            this.initialized = true;
            this._startLoop();
            this.setStatus('Ready - Drop a .ply/.splat/.spz/.ksplat file or click Load');
        } catch (err) {
            console.error('Engine init error:', err);
            this.setStatus('Error initializing engine: ' + err.message);
        }
    }

    _bindEvents() {
        // File input - this works regardless of engine state
        const fileInput = document.getElementById('file-input');
        const btnLoad = document.getElementById('btn-load');

        btnLoad.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            console.log('Load button clicked');
            fileInput.value = ''; // reset so same file can be selected again
            fileInput.click();
        });

        fileInput.addEventListener('change', (e) => {
            console.log('File selected:', e.target.files);
            if (e.target.files && e.target.files.length > 0) {
                this.loadFile(e.target.files[0]);
            }
        });

        // Drag & drop
        const app = document.getElementById('app');
        app.addEventListener('dragover', (e) => {
            e.preventDefault();
            e.stopPropagation();
            app.classList.add('drag-over');
        });
        app.addEventListener('dragleave', (e) => {
            e.preventDefault();
            app.classList.remove('drag-over');
        });
        app.addEventListener('drop', (e) => {
            e.preventDefault();
            e.stopPropagation();
            app.classList.remove('drag-over');
            if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
                this.loadFile(e.dataTransfer.files[0]);
            }
        });

        // Mode tabs
        document.querySelectorAll('.mode-btn').forEach(btn => {
            btn.addEventListener('click', () => this.setMode(btn.dataset.mode));
        });

        // Undo/Redo
        document.getElementById('btn-undo').addEventListener('click', () => {
            if (this.cleaner) this.cleaner.undo();
        });
        document.getElementById('btn-redo').addEventListener('click', () => {
            if (this.cleaner) this.cleaner.redo();
        });

        // View panel
        document.getElementById('camera-mode').addEventListener('change', (e) => {
            if (this.controls) this.controls.setMode(e.target.value);
        });
        document.getElementById('fov-slider').addEventListener('input', (e) => {
            if (this.sceneManager) {
                this.sceneManager.camera.fov = parseFloat(e.target.value);
                this.sceneManager.camera.updateProjectionMatrix();
            }
            document.getElementById('fov-value').textContent = e.target.value;
        });
        document.getElementById('btn-frame').addEventListener('click', () => {
            if (!this.controls || !this.sceneManager) return;
            const center = this.sceneManager.getSceneCenter();
            const size = this.sceneManager.getSceneSize();
            this.controls.frameScene(center, size);
        });
        document.getElementById('btn-reset-camera').addEventListener('click', () => {
            if (this.controls) this.controls.reset();
        });

        // Clean panel
        document.getElementById('clean-tool').addEventListener('change', (e) => {
            if (this.cleaner) this.cleaner.tool = e.target.value;
        });
        document.getElementById('brush-radius').addEventListener('input', (e) => {
            if (this.cleaner) {
                this.cleaner.brushRadius = parseInt(e.target.value);
                this.cleaner.updateCursorSize();
            }
            document.getElementById('radius-value').textContent = e.target.value;
        });
        document.getElementById('brush-opacity').addEventListener('input', (e) => {
            if (this.cleaner) this.cleaner.brushOpacity = parseInt(e.target.value);
            document.getElementById('opacity-value').textContent = e.target.value + '%';
        });
        document.getElementById('float-threshold').addEventListener('input', (e) => {
            if (this.cleaner) this.cleaner.floatThreshold = parseInt(e.target.value);
            document.getElementById('threshold-value').textContent = e.target.value;
        });
        document.getElementById('min-neighbors').addEventListener('input', (e) => {
            if (this.cleaner) this.cleaner.minNeighbors = parseInt(e.target.value);
            document.getElementById('neighbors-value').textContent = e.target.value;
        });
        document.getElementById('btn-auto-filter').addEventListener('click', () => {
            if (!this.cleaner) return;
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
            if (!this.cameraPath || !this.sceneManager) return;
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
            if (this.cameraPath) this.cameraPath.duration = parseFloat(e.target.value);
            if (this.ui.timelineDuration) this.ui.timelineDuration.textContent = e.target.value + '.0s';
        });
        document.getElementById('path-easing').addEventListener('change', (e) => {
            if (this.cameraPath) this.cameraPath.easing = e.target.value;
        });
        document.getElementById('btn-add-keyframe').addEventListener('click', () => {
            if (!this.cameraPath || !this.controls) return;
            const pose = this.controls.getPose();
            this.cameraPath.addKeyframe(pose);
            this._updateKeyframeUI();
            this.setStatus(`Added keyframe #${this.cameraPath.keyframes.length}`);
        });
        document.getElementById('btn-generate-path').addEventListener('click', () => {
            if (!this.cameraPath) return;
            this.cameraPath.generateOptimalPath();
            this._updateKeyframeUI();
            this.setStatus('Generated optimal path');
        });
        document.getElementById('btn-preview-play').addEventListener('click', () => {
            if (!this.cameraPath || !this.controls || !this.sceneManager) return;
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
            if (this.cameraPath) this.cameraPath.stop();
            if (this.controls) this.controls.enabled = true;
            this.setStatus('Preview stopped');
        });
        document.getElementById('preview-time').addEventListener('input', (e) => {
            if (!this.cameraPath || !this.sceneManager) return;
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
            if (this.mode === 'clean' && this.cleaner) {
                this.cleaner.onPointerMove(e.clientX, e.clientY);
            }
        });
        this.canvas.addEventListener('pointerdown', (e) => {
            if (this.mode === 'clean' && this.cleaner) {
                const handled = this.cleaner.onPointerDown(e.clientX, e.clientY, e.button);
                if (handled) e.preventDefault();
            }
        });
        this.canvas.addEventListener('pointerup', (e) => {
            if (this.mode === 'clean' && this.cleaner) {
                this.cleaner.onPointerUp(e.clientX, e.clientY);
            }
        });

        // Keyboard shortcuts
        window.addEventListener('keydown', (e) => {
            if (e.ctrlKey && e.key === 'z') { if (this.cleaner) this.cleaner.undo(); e.preventDefault(); }
            if (e.ctrlKey && e.key === 'y') { if (this.cleaner) this.cleaner.redo(); e.preventDefault(); }
            if (e.key === '1') this.setMode('view');
            if (e.key === '2') this.setMode('clean');
            if (e.key === '3') this.setMode('path');
            if (e.key === '4') this.setMode('export');
        });
    }

    async loadFile(file) {
        if (!this.initialized) {
            this.setStatus('Engine not ready yet. Please wait...');
            return;
        }

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
            this.setStatus(`Error loading file: ${err.message}`);
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
        if (this.cleaner) this.cleaner.deactivate();
        if (this.controls) this.controls.enabled = true;

        if (mode === 'clean' && this.cleaner) {
            this.cleaner.activate();
            if (this.controls) this.controls.enabled = false;
        }

        // Timeline visibility
        if (this.ui.timeline) {
            this.ui.timeline.classList.toggle('hidden', mode !== 'path');
        }

        // Path visualization
        if (this.cameraPath) {
            if (mode === 'path') {
                this.cameraPath._updatePathVisualization();
            } else {
                this.cameraPath.clearVisualization();
            }
        }

        this.setStatus(`Mode: ${mode.charAt(0).toUpperCase() + mode.slice(1)}`);
    }

    async _exportMP4() {
        if (!this.cameraPath || !this.exporter) return;
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
        if (!list || !this.cameraPath) return;
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
                if (this.sceneManager) {
                    this.sceneManager.camera.position.copy(kf.position);
                    this.sceneManager.camera.lookAt(kf.target);
                }
            });
            item.querySelector('.kf-update').addEventListener('click', () => {
                if (!this.controls || !this.cameraPath) return;
                const pose = this.controls.getPose();
                this.cameraPath.updateKeyframe(i, pose);
                this._updateKeyframeUI();
                this.setStatus(`Updated keyframe #${i + 1}`);
            });
            item.querySelector('.kf-delete').addEventListener('click', () => {
                if (!this.cameraPath) return;
                this.cameraPath.removeKeyframe(i);
                this._updateKeyframeUI();
                this.setStatus(`Removed keyframe #${i + 1}`);
            });
            list.appendChild(item);
        });

        // Update timeline markers
        const markers = document.querySelector('.timeline-keyframes');
        if (markers && this.cameraPath) {
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
        if (this.ui.timelineTime && this.cameraPath) {
            this.ui.timelineTime.textContent = `${(progress * this.cameraPath.duration).toFixed(1)}s`;
        }
    }

    showLoading(text) {
        if (this.ui.loadingOverlay) this.ui.loadingOverlay.classList.remove('hidden');
        if (this.ui.loadingText) this.ui.loadingText.textContent = text;
        if (this.ui.loadingProgress) this.ui.loadingProgress.style.width = '0%';
    }

    hideLoading() {
        if (this.ui.loadingOverlay) this.ui.loadingOverlay.classList.add('hidden');
    }

    setStatus(text) {
        if (this.ui.statusText) this.ui.statusText.textContent = text;
        console.log('[3DGS Studio]', text);
    }

    _startLoop() {
        const clock = { last: performance.now() };

        const loop = () => {
            requestAnimationFrame(loop);
            const now = performance.now();
            const dt = (now - clock.last) / 1000;
            clock.last = now;

            // Update controls
            if (this.controls && this.controls.enabled) {
                this.controls.update(dt);
            }

            // Update camera path playback
            if (this.cameraPath && this.cameraPath.playing) {
                this.cameraPath.tick(dt);
                if (!this.cameraPath.playing) {
                    if (this.controls) this.controls.enabled = true;
                    this.setStatus('Preview complete');
                }
            }

            // Render
            if (this.sceneManager) {
                this.sceneManager.render();
            }

            // FPS display
            if (this.ui.fpsCounter && this.sceneManager) {
                this.ui.fpsCounter.textContent = `FPS: ${this.sceneManager.fps}`;
            }
        };

        loop();
    }
}

// Initialize app when DOM is ready
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => { window.app = new App(); });
} else {
    window.app = new App();
}
