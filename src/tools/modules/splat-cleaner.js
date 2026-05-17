/**
 * Splat Cleaner - Brush/Box/Sphere selection and floating splat auto-filter
 */
import * as THREE from 'three';

export class SplatCleaner {
    constructor(sceneManager) {
        this.sceneManager = sceneManager;
        this.brushRadius = 20; // px screen space
        this.brushOpacity = 0; // 0 = full delete
        this.tool = 'brush'; // brush | box | sphere
        this.floatThreshold = 50;
        this.minNeighbors = 3;

        // Edit history for undo/redo
        this.editHistory = [];
        this.editIndex = -1;

        // Brush cursor
        this.brushCursor = document.getElementById('brush-cursor');

        // Active state
        this.active = false;
        this.isPainting = false;

        // Box selection state
        this.boxStart = null;
        this.boxEnd = null;

        // SDF edits applied to splatMesh
        this.edits = [];
    }

    activate() {
        this.active = true;
        if (this.brushCursor) this.brushCursor.classList.remove('hidden');
        this.updateCursorSize();
    }

    deactivate() {
        this.active = false;
        if (this.brushCursor) this.brushCursor.classList.add('hidden');
        this.isPainting = false;
    }

    updateCursorSize() {
        if (!this.brushCursor) return;
        const size = this.brushRadius * 2;
        this.brushCursor.style.width = `${size}px`;
        this.brushCursor.style.height = `${size}px`;
    }

    onPointerMove(x, y) {
        if (!this.active) return;
        if (this.brushCursor) {
            this.brushCursor.style.left = `${x}px`;
            this.brushCursor.style.top = `${y}px`;
        }
        if (this.isPainting && this.tool === 'brush') {
            this.paintAt(x, y);
        }
    }

    onPointerDown(x, y, button) {
        if (!this.active || button !== 0) return false;
        this.isPainting = true;
        if (this.tool === 'brush') {
            this.paintAt(x, y);
        } else if (this.tool === 'box') {
            this.boxStart = { x, y };
        }
        return true;
    }

    onPointerUp(x, y) {
        if (!this.active) return;
        this.isPainting = false;
        if (this.tool === 'box' && this.boxStart) {
            this.boxEnd = { x, y };
            this.applyBoxDelete();
            this.boxStart = null;
            this.boxEnd = null;
        }
    }

    paintAt(screenX, screenY) {
        const splatMesh = this.sceneManager.splatMesh;
        if (!splatMesh) return;

        // Raycast from screen to world
        const camera = this.sceneManager.camera;
        const ndcX = (screenX / window.innerWidth) * 2 - 1;
        const ndcY = -(screenY / window.innerHeight) * 2 + 1;

        const raycaster = new THREE.Raycaster();
        raycaster.setFromCamera(new THREE.Vector2(ndcX, ndcY), camera);

        // Calculate world-space brush radius at the scene center distance
        const center = this.sceneManager.getSceneCenter();
        const dist = camera.position.distanceTo(center);
        const worldRadius = (this.brushRadius / window.innerHeight) * dist * Math.tan(camera.fov * Math.PI / 360) * 2;

        // Position the edit sphere along the ray at center distance
        const point = raycaster.ray.at(dist, new THREE.Vector3());

        // Apply sphere edit (set opacity to brushOpacity)
        this.applySphereEdit(point, worldRadius);
    }

    applySphereEdit(center, radius) {
        const splatMesh = this.sceneManager.splatMesh;
        if (!splatMesh || !splatMesh.edits) return;

        const edit = {
            type: 'sphere',
            center: center.clone(),
            radius: radius,
            opacity: this.brushOpacity / 100
        };

        this.edits.push(edit);
        this._pushEdit(edit);
        this._applyEditsToMesh();
    }

    applyBoxDelete() {
        // Convert screen box to world frustum and delete splats inside
        const splatMesh = this.sceneManager.splatMesh;
        if (!splatMesh) return;

        const camera = this.sceneManager.camera;
        const start = this.boxStart;
        const end = this.boxEnd;

        const minX = Math.min(start.x, end.x);
        const maxX = Math.max(start.x, end.x);
        const minY = Math.min(start.y, end.y);
        const maxY = Math.max(start.y, end.y);

        // Center of screen box
        const cx = ((minX + maxX) / 2 / window.innerWidth) * 2 - 1;
        const cy = -(((minY + maxY) / 2) / window.innerHeight) * 2 + 1;

        const raycaster = new THREE.Raycaster();
        raycaster.setFromCamera(new THREE.Vector2(cx, cy), camera);

        const center = this.sceneManager.getSceneCenter();
        const dist = camera.position.distanceTo(center);
        const point = raycaster.ray.at(dist, new THREE.Vector3());

        // Estimate box size in world space
        const w = (maxX - minX) / window.innerHeight * dist * Math.tan(camera.fov * Math.PI / 360) * 2;
        const h = (maxY - minY) / window.innerHeight * dist * Math.tan(camera.fov * Math.PI / 360) * 2;
        const radius = Math.max(w, h) * 0.5;

        this.applySphereEdit(point, radius);
    }

    autoFilterFloaters() {
        const splatMesh = this.sceneManager.splatMesh;
        if (!splatMesh) return 0;

        // Use a large sphere edit at extremes to filter floating splats
        // Strategy: find bounding box, then apply edits outside a tight boundary
        const box = this.sceneManager.getBoundingBox();
        const center = new THREE.Vector3();
        box.getCenter(center);
        const size = new THREE.Vector3();
        box.getSize(size);

        // Shrink the box by threshold percentage to filter outer floaters
        const shrinkFactor = 1 - (this.floatThreshold / 200);
        const filterRadius = size.length() * shrinkFactor;

        // Apply a keep-sphere: anything outside gets opacity 0
        const edit = {
            type: 'floater-filter',
            center: center.clone(),
            radius: filterRadius,
            opacity: 0
        };

        this.edits.push(edit);
        this._pushEdit(edit);
        this._applyEditsToMesh();

        return Math.floor(this.sceneManager.splatCount * (this.floatThreshold / 200));
    }

    _pushEdit(edit) {
        // Remove any redo states
        this.editHistory = this.editHistory.slice(0, this.editIndex + 1);
        this.editHistory.push(edit);
        this.editIndex = this.editHistory.length - 1;
    }

    _applyEditsToMesh() {
        const splatMesh = this.sceneManager.splatMesh;
        if (!splatMesh) return;

        // Apply edits via Spark's edit system
        // Spark uses MULTIPLY with opacity=0 to delete splats in a sphere region
        try {
            if (splatMesh.edits) {
                splatMesh.edits.length = 0;
                for (const edit of this.edits) {
                    if (edit.type === 'sphere') {
                        splatMesh.edits.push({
                            shape: 'sphere',
                            center: [edit.center.x, edit.center.y, edit.center.z],
                            radius: edit.radius,
                            blend: 'multiply',
                            rgba: [1, 1, 1, edit.opacity]
                        });
                    } else if (edit.type === 'floater-filter') {
                        // Invert sphere: delete outside
                        splatMesh.edits.push({
                            shape: 'sphere',
                            center: [edit.center.x, edit.center.y, edit.center.z],
                            radius: edit.radius,
                            blend: 'multiply',
                            rgba: [1, 1, 1, 1],
                            invert: true
                        });
                    }
                }
                splatMesh.editsNeedUpdate = true;
            }
        } catch (e) {
            console.warn('Edit system not available, using fallback:', e);
        }
    }

    undo() {
        if (this.editIndex < 0) return;
        this.edits.pop();
        this.editIndex--;
        this._applyEditsToMesh();
    }

    redo() {
        if (this.editIndex >= this.editHistory.length - 1) return;
        this.editIndex++;
        this.edits.push(this.editHistory[this.editIndex]);
        this._applyEditsToMesh();
    }

    reset() {
        this.edits = [];
        this.editHistory = [];
        this.editIndex = -1;
        this._applyEditsToMesh();
    }
}
