/**
 * Camera Controls - Orbit & Fly modes
 */
import * as THREE from 'three';

export class CameraControls {
    constructor(camera, domElement) {
        this.camera = camera;
        this.domElement = domElement;
        this.mode = 'orbit'; // orbit | fly

        // Orbit state
        this.target = new THREE.Vector3(0, 0, 0);
        this.spherical = new THREE.Spherical(5, Math.PI / 3, Math.PI / 4);
        this.damping = 0.92;
        this.rotateSpeed = 0.005;
        this.panSpeed = 0.003;
        this.zoomSpeed = 0.001;

        // Fly state
        this.flySpeed = 2;
        this.flyRotateSpeed = 0.002;
        this.velocity = new THREE.Vector3();
        this.keys = {};

        // Input state
        this.isPointerDown = false;
        this.pointerButton = -1;
        this.lastPointer = { x: 0, y: 0 };
        this.deltaRotate = { x: 0, y: 0 };
        this.deltaPan = { x: 0, y: 0 };
        this.deltaZoom = 0;

        // Enabled flag
        this.enabled = true;

        this._bindEvents();
        this.updateOrbitCamera();
    }

    _bindEvents() {
        const el = this.domElement;
        el.addEventListener('pointerdown', (e) => this._onPointerDown(e));
        el.addEventListener('pointermove', (e) => this._onPointerMove(e));
        el.addEventListener('pointerup', (e) => this._onPointerUp(e));
        el.addEventListener('wheel', (e) => this._onWheel(e), { passive: false });
        el.addEventListener('contextmenu', (e) => e.preventDefault());
        window.addEventListener('keydown', (e) => { this.keys[e.code] = true; });
        window.addEventListener('keyup', (e) => { this.keys[e.code] = false; });
    }

    _onPointerDown(e) {
        if (!this.enabled) return;
        this.isPointerDown = true;
        this.pointerButton = e.button;
        this.lastPointer.x = e.clientX;
        this.lastPointer.y = e.clientY;
        this.domElement.setPointerCapture(e.pointerId);
    }

    _onPointerMove(e) {
        if (!this.enabled || !this.isPointerDown) return;
        const dx = e.clientX - this.lastPointer.x;
        const dy = e.clientY - this.lastPointer.y;
        this.lastPointer.x = e.clientX;
        this.lastPointer.y = e.clientY;

        if (this.mode === 'orbit') {
            if (this.pointerButton === 0) {
                this.spherical.theta -= dx * this.rotateSpeed;
                this.spherical.phi -= dy * this.rotateSpeed;
                this.spherical.phi = Math.max(0.01, Math.min(Math.PI - 0.01, this.spherical.phi));
            } else if (this.pointerButton === 2) {
                const panOffset = new THREE.Vector3();
                const right = new THREE.Vector3();
                const up = new THREE.Vector3();
                right.setFromMatrixColumn(this.camera.matrixWorld, 0);
                up.setFromMatrixColumn(this.camera.matrixWorld, 1);
                panOffset.addScaledVector(right, -dx * this.panSpeed * this.spherical.radius * 0.5);
                panOffset.addScaledVector(up, dy * this.panSpeed * this.spherical.radius * 0.5);
                this.target.add(panOffset);
            }
        } else if (this.mode === 'fly') {
            this.camera.rotation.y -= dx * this.flyRotateSpeed;
            this.camera.rotation.x -= dy * this.flyRotateSpeed;
            this.camera.rotation.x = Math.max(-Math.PI / 2, Math.min(Math.PI / 2, this.camera.rotation.x));
        }
    }

    _onPointerUp(e) {
        this.isPointerDown = false;
        this.pointerButton = -1;
        this.domElement.releasePointerCapture(e.pointerId);
    }

    _onWheel(e) {
        if (!this.enabled) return;
        e.preventDefault();
        if (this.mode === 'orbit') {
            this.spherical.radius *= 1 + e.deltaY * this.zoomSpeed;
            this.spherical.radius = Math.max(0.1, Math.min(100, this.spherical.radius));
        }
    }

    updateOrbitCamera() {
        const pos = new THREE.Vector3();
        pos.setFromSpherical(this.spherical);
        pos.add(this.target);
        this.camera.position.copy(pos);
        this.camera.lookAt(this.target);
    }

    update(dt) {
        if (this.mode === 'orbit') {
            this.updateOrbitCamera();
        } else if (this.mode === 'fly') {
            const speed = this.flySpeed * dt;
            const dir = new THREE.Vector3();
            if (this.keys['KeyW']) dir.z -= 1;
            if (this.keys['KeyS']) dir.z += 1;
            if (this.keys['KeyA']) dir.x -= 1;
            if (this.keys['KeyD']) dir.x += 1;
            if (this.keys['KeyE'] || this.keys['Space']) dir.y += 1;
            if (this.keys['KeyQ'] || this.keys['ShiftLeft']) dir.y -= 1;
            dir.normalize().multiplyScalar(speed);
            dir.applyQuaternion(this.camera.quaternion);
            this.camera.position.add(dir);
        }
    }

    frameScene(center, size) {
        const distance = size / Math.tan(this.camera.fov * Math.PI / 360);
        this.target.copy(center);
        this.spherical.radius = distance * 0.7;
        this.updateOrbitCamera();
    }

    reset() {
        this.target.set(0, 0, 0);
        this.spherical.set(5, Math.PI / 3, Math.PI / 4);
        this.updateOrbitCamera();
    }

    setMode(mode) {
        this.mode = mode;
        if (mode === 'fly') {
            this.camera.rotation.order = 'YXZ';
        }
    }

    getPose() {
        return {
            position: this.camera.position.clone(),
            rotation: this.camera.rotation.clone(),
            target: this.target.clone(),
            fov: this.camera.fov
        };
    }

    setPose(pose) {
        this.camera.position.copy(pose.position);
        if (pose.target) {
            this.target.copy(pose.target);
            const dir = new THREE.Vector3().subVectors(this.target, this.camera.position);
            this.spherical.setFromVector3(dir.negate());
        }
    }
}
