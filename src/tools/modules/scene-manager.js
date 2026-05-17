/**
 * Scene Manager - THREE.js + Spark.js 2.0 scene setup
 */
import * as THREE from 'three';
import { SparkRenderer, SplatMesh } from '@sparkjsdev/spark';

export class SceneManager {
    constructor(canvas) {
        this.canvas = canvas;
        this.scene = new THREE.Scene();
        this.camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.01, 1000);
        this.camera.position.set(2, 1.5, 3);

        this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
        this.renderer.setSize(window.innerWidth, window.innerHeight);
        this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
        this.renderer.setClearColor(0x1a1a2e);

        // Spark renderer for 3DGS
        this.sparkRenderer = new SparkRenderer();
        this.scene.add(this.sparkRenderer);

        // Helpers
        this.gridHelper = new THREE.GridHelper(10, 20, 0x333366, 0x222244);
        this.scene.add(this.gridHelper);

        // Lights for helpers/gizmos
        const ambientLight = new THREE.AmbientLight(0xffffff, 0.5);
        this.scene.add(ambientLight);
        const dirLight = new THREE.DirectionalLight(0xffffff, 0.8);
        dirLight.position.set(5, 10, 5);
        this.scene.add(dirLight);

        // Current splat mesh
        this.splatMesh = null;
        this.splatCount = 0;

        // FPS tracking
        this.frameCount = 0;
        this.lastFpsTime = performance.now();
        this.fps = 0;

        // Resize handler
        window.addEventListener('resize', () => this.onResize());
    }

    onResize() {
        const w = window.innerWidth;
        const h = window.innerHeight;
        this.camera.aspect = w / h;
        this.camera.updateProjectionMatrix();
        this.renderer.setSize(w, h);
    }

    async loadModel(fileOrUrl, onProgress) {
        // Remove existing splat
        if (this.splatMesh) {
            this.scene.remove(this.splatMesh);
            this.splatMesh.dispose?.();
            this.splatMesh = null;
        }

        const splatMesh = new SplatMesh();

        if (typeof fileOrUrl === 'string') {
            await splatMesh.loadAsync(fileOrUrl, (event) => {
                if (event.lengthComputable && onProgress) {
                    onProgress(event.loaded / event.total);
                }
            });
        } else {
            // File object - create object URL
            const url = URL.createObjectURL(fileOrUrl);
            const ext = fileOrUrl.name.split('.').pop().toLowerCase();
            await splatMesh.loadAsync(url, { fileType: ext }, (event) => {
                if (event.lengthComputable && onProgress) {
                    onProgress(event.loaded / event.total);
                }
            });
            URL.revokeObjectURL(url);
        }

        this.splatMesh = splatMesh;
        this.scene.add(splatMesh);

        // Get splat count
        this.splatCount = splatMesh.packedSplats?.splatCount ?? 0;

        return { splatCount: this.splatCount };
    }

    getBoundingBox() {
        if (!this.splatMesh) return new THREE.Box3();
        const box = new THREE.Box3();
        box.setFromObject(this.splatMesh);
        return box;
    }

    getSceneCenter() {
        const box = this.getBoundingBox();
        const center = new THREE.Vector3();
        box.getCenter(center);
        return center;
    }

    getSceneSize() {
        const box = this.getBoundingBox();
        const size = new THREE.Vector3();
        box.getSize(size);
        return size.length();
    }

    render() {
        this.renderer.render(this.scene, this.camera);
        // FPS
        this.frameCount++;
        const now = performance.now();
        if (now - this.lastFpsTime >= 1000) {
            this.fps = this.frameCount;
            this.frameCount = 0;
            this.lastFpsTime = now;
        }
    }

    dispose() {
        this.renderer.dispose();
        if (this.splatMesh) {
            this.splatMesh.dispose?.();
        }
    }
}
