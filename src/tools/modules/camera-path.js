/**
 * Camera Path - Keyframe-based camera path planning with presets and spline interpolation
 */
import * as THREE from 'three';

// Catmull-Rom spline for smooth path interpolation
class CatmullRomSpline {
    constructor(points) {
        this.points = points;
    }

    getPoint(t) {
        const points = this.points;
        const n = points.length;
        if (n < 2) return points[0]?.clone() || new THREE.Vector3();

        const f = t * (n - 1);
        const i = Math.floor(f);
        const alpha = f - i;

        const p0 = points[Math.max(0, i - 1)];
        const p1 = points[i];
        const p2 = points[Math.min(n - 1, i + 1)];
        const p3 = points[Math.min(n - 1, i + 2)];

        return new THREE.Vector3(
            this._catmullRom(alpha, p0.x, p1.x, p2.x, p3.x),
            this._catmullRom(alpha, p0.y, p1.y, p2.y, p3.y),
            this._catmullRom(alpha, p0.z, p1.z, p2.z, p3.z)
        );
    }

    _catmullRom(t, p0, p1, p2, p3) {
        const t2 = t * t;
        const t3 = t2 * t;
        return 0.5 * (
            (2 * p1) +
            (-p0 + p2) * t +
            (2 * p0 - 5 * p1 + 4 * p2 - p3) * t2 +
            (-p0 + 3 * p1 - 3 * p2 + p3) * t3
        );
    }

    getLength(steps = 100) {
        let len = 0;
        let prev = this.getPoint(0);
        for (let i = 1; i <= steps; i++) {
            const curr = this.getPoint(i / steps);
            len += prev.distanceTo(curr);
            prev = curr;
        }
        return len;
    }
}

// Easing functions
const easings = {
    linear: t => t,
    easeIn: t => t * t * t,
    easeOut: t => 1 - Math.pow(1 - t, 3),
    easeInOut: t => t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2
};

export class CameraPath {
    constructor(sceneManager) {
        this.sceneManager = sceneManager;
        this.keyframes = []; // { time, position, target, fov }
        this.duration = 10; // seconds
        this.easing = 'easeInOut';
        this.preset = 'orbit360';

        // Path visualization
        this.pathLine = null;
        this.pathPoints = [];

        // Playback
        this.playing = false;
        this.currentTime = 0;
        this.onUpdate = null;
    }

    addKeyframe(pose, time = null) {
        const kf = {
            time: time !== null ? time : this._getNextTime(),
            position: pose.position.clone(),
            target: pose.target ? pose.target.clone() : new THREE.Vector3(0, 0, 0),
            fov: pose.fov || 60
        };
        this.keyframes.push(kf);
        this.keyframes.sort((a, b) => a.time - b.time);
        this._updatePathVisualization();
        return kf;
    }

    removeKeyframe(index) {
        this.keyframes.splice(index, 1);
        this._updatePathVisualization();
    }

    updateKeyframe(index, pose) {
        if (index < 0 || index >= this.keyframes.length) return;
        const kf = this.keyframes[index];
        if (pose.position) kf.position.copy(pose.position);
        if (pose.target) kf.target.copy(pose.target);
        if (pose.fov !== undefined) kf.fov = pose.fov;
        if (pose.time !== undefined) kf.time = pose.time;
        this._updatePathVisualization();
    }

    _getNextTime() {
        if (this.keyframes.length === 0) return 0;
        const last = this.keyframes[this.keyframes.length - 1];
        const step = this.duration / Math.max(4, this.keyframes.length + 1);
        return Math.min(last.time + step, this.duration);
    }

    generatePreset(preset, center, size) {
        this.keyframes = [];
        const radius = size * 0.8;
        const c = center || new THREE.Vector3();

        switch (preset) {
            case 'orbit360': {
                const keys = 8;
                for (let i = 0; i <= keys; i++) {
                    const angle = (i / keys) * Math.PI * 2;
                    const pos = new THREE.Vector3(
                        c.x + Math.cos(angle) * radius,
                        c.y + radius * 0.3,
                        c.z + Math.sin(angle) * radius
                    );
                    this.keyframes.push({
                        time: (i / keys) * this.duration,
                        position: pos,
                        target: c.clone(),
                        fov: 60
                    });
                }
                break;
            }
            case 'flythrough': {
                const keys = 6;
                for (let i = 0; i < keys; i++) {
                    const t = i / (keys - 1);
                    const pos = new THREE.Vector3(
                        c.x - radius + t * radius * 2,
                        c.y + radius * 0.2,
                        c.z + Math.sin(t * Math.PI) * radius * 0.3
                    );
                    const target = new THREE.Vector3(
                        c.x - radius + (t + 0.1) * radius * 2,
                        c.y,
                        c.z
                    );
                    this.keyframes.push({
                        time: t * this.duration,
                        position: pos,
                        target: target,
                        fov: 60
                    });
                }
                break;
            }
            case 'dolly': {
                const keys = 4;
                for (let i = 0; i < keys; i++) {
                    const t = i / (keys - 1);
                    const dist = radius * (1.5 - t * 0.8);
                    const fov = 60 + t * 30;
                    this.keyframes.push({
                        time: t * this.duration,
                        position: new THREE.Vector3(c.x, c.y + radius * 0.2, c.z + dist),
                        target: c.clone(),
                        fov: fov
                    });
                }
                break;
            }
            case 'spiral': {
                const keys = 10;
                for (let i = 0; i < keys; i++) {
                    const t = i / (keys - 1);
                    const angle = t * Math.PI * 4;
                    const r = radius * (1 - t * 0.5);
                    const height = c.y + t * radius * 1.5;
                    this.keyframes.push({
                        time: t * this.duration,
                        position: new THREE.Vector3(
                            c.x + Math.cos(angle) * r,
                            height,
                            c.z + Math.sin(angle) * r
                        ),
                        target: c.clone(),
                        fov: 60
                    });
                }
                break;
            }
        }

        this._updatePathVisualization();
    }

    generateOptimalPath() {
        // Generate a smooth path that covers the scene from multiple angles
        const center = this.sceneManager.getSceneCenter();
        const size = this.sceneManager.getSceneSize();
        const radius = size * 0.6;

        // Create viewpoints that maximize scene coverage
        this.keyframes = [];
        const goldenAngle = Math.PI * (3 - Math.sqrt(5));
        const numPoints = 8;

        for (let i = 0; i < numPoints; i++) {
            const t = i / (numPoints - 1);
            const theta = goldenAngle * i;
            const phi = Math.acos(1 - 2 * (i + 0.5) / numPoints);
            const r = radius * (0.8 + 0.2 * Math.sin(t * Math.PI));

            const pos = new THREE.Vector3(
                center.x + r * Math.sin(phi) * Math.cos(theta),
                center.y + r * Math.cos(phi) * 0.5 + radius * 0.3,
                center.z + r * Math.sin(phi) * Math.sin(theta)
            );

            this.keyframes.push({
                time: t * this.duration,
                position: pos,
                target: center.clone(),
                fov: 55 + Math.sin(t * Math.PI * 2) * 10
            });
        }

        this._updatePathVisualization();
    }

    evaluate(time) {
        if (this.keyframes.length === 0) return null;
        if (this.keyframes.length === 1) {
            return { ...this.keyframes[0] };
        }

        // Apply easing
        const easingFn = easings[this.easing] || easings.linear;
        const t = easingFn(Math.max(0, Math.min(1, time / this.duration)));
        const actualTime = t * this.duration;

        // Build splines
        const positions = this.keyframes.map(kf => kf.position);
        const targets = this.keyframes.map(kf => kf.target);
        const times = this.keyframes.map(kf => kf.time / this.duration);
        const fovs = this.keyframes.map(kf => kf.fov);

        // Find segment
        let segT = 0;
        if (times.length > 1) {
            for (let i = 0; i < times.length - 1; i++) {
                if (t >= times[i] && t <= times[i + 1]) {
                    segT = (t - times[i]) / (times[i + 1] - times[i]);
                    const posSpline = new CatmullRomSpline(positions);
                    const targetSpline = new CatmullRomSpline(targets);

                    const overallT = (i + segT) / (times.length - 1);
                    return {
                        position: posSpline.getPoint(overallT),
                        target: targetSpline.getPoint(overallT),
                        fov: this._lerpFov(fovs, overallT)
                    };
                }
            }
        }

        // Fallback: last keyframe
        const last = this.keyframes[this.keyframes.length - 1];
        return { position: last.position.clone(), target: last.target.clone(), fov: last.fov };
    }

    _lerpFov(fovs, t) {
        const f = t * (fovs.length - 1);
        const i = Math.floor(f);
        const alpha = f - i;
        const a = fovs[Math.min(i, fovs.length - 1)];
        const b = fovs[Math.min(i + 1, fovs.length - 1)];
        return a + (b - a) * alpha;
    }

    _updatePathVisualization() {
        const scene = this.sceneManager.scene;

        // Remove old line
        if (this.pathLine) {
            scene.remove(this.pathLine);
            this.pathLine.geometry?.dispose();
            this.pathLine.material?.dispose();
        }

        if (this.keyframes.length < 2) return;

        // Generate path points
        const points = [];
        const steps = 100;
        for (let i = 0; i <= steps; i++) {
            const result = this.evaluate((i / steps) * this.duration);
            if (result) points.push(result.position);
        }

        const geometry = new THREE.BufferGeometry().setFromPoints(points);
        const material = new THREE.LineBasicMaterial({ color: 0xe94560, linewidth: 2 });
        this.pathLine = new THREE.Line(geometry, material);
        scene.add(this.pathLine);

        // Add keyframe markers
        this.pathPoints.forEach(p => { scene.remove(p); p.geometry?.dispose(); p.material?.dispose(); });
        this.pathPoints = [];

        for (const kf of this.keyframes) {
            const geo = new THREE.SphereGeometry(0.05);
            const mat = new THREE.MeshBasicMaterial({ color: 0xf9a826 });
            const mesh = new THREE.Mesh(geo, mat);
            mesh.position.copy(kf.position);
            scene.add(mesh);
            this.pathPoints.push(mesh);
        }
    }

    play(onFrame) {
        this.playing = true;
        this.currentTime = 0;
        this.onUpdate = onFrame;
    }

    stop() {
        this.playing = false;
        this.currentTime = 0;
    }

    tick(dt) {
        if (!this.playing) return null;
        this.currentTime += dt;
        if (this.currentTime >= this.duration) {
            this.playing = false;
            this.currentTime = this.duration;
        }
        const result = this.evaluate(this.currentTime);
        if (result && this.onUpdate) {
            this.onUpdate(result, this.currentTime / this.duration);
        }
        return result;
    }

    clearVisualization() {
        const scene = this.sceneManager.scene;
        if (this.pathLine) {
            scene.remove(this.pathLine);
            this.pathLine.geometry?.dispose();
            this.pathLine.material?.dispose();
            this.pathLine = null;
        }
        this.pathPoints.forEach(p => { scene.remove(p); p.geometry?.dispose(); p.material?.dispose(); });
        this.pathPoints = [];
    }
}
