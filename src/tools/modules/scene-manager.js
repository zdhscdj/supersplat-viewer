/**
 * Scene Manager - THREE.js + Spark.js 2.0 scene setup
 * Handles graceful fallback if Spark fails to initialize
 */
import * as THREE from 'three';

let SparkRenderer, SplatMesh;
let sparkAvailable = false;

try {
    const spark = await import('@sparkjsdev/spark');
    SparkRenderer = spark.SparkRenderer;
    SplatMesh = spark.SplatMesh;
    sparkAvailable = true;
    console.log('[SceneManager] Spark.js loaded successfully');
} catch (err) {
    console.warn('[SceneManager] Spark.js failed to load, 3DGS features unavailable:', err);
}

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

        // Spark renderer for 3DGS (optional)
        this.sparkRenderer = null;
        if (sparkAvailable && SparkRenderer) {
            try {
                this.sparkRenderer = new SparkRenderer();
                this.scene.add(this.sparkRenderer);
            } catch (e) {
                console.warn('[SceneManager] SparkRenderer init failed:', e);
            }
        }

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
        if (!sparkAvailable || !SplatMesh) {
            throw new Error('Spark.js not available. Cannot load splat models. Check internet connection.');
        }

        // Remove existing splat
        if (this.splatMesh) {
            this.scene.remove(this.splatMesh);
            if (this.splatMesh.dispose) this.splatMesh.dispose();
            this.splatMesh = null;
        }

        const splatMesh = new SplatMesh();

        if (typeof fileOrUrl === 'string') {
            // URL string
            await splatMesh.loadAsync(fileOrUrl, (event) => {
                if (event && event.lengthComputable && onProgress) {
                    onProgress(event.loaded / event.total);
                }
            });
        } else {
            // File object - create object URL
            const url = URL.createObjectURL(fileOrUrl);
            const ext = fileOrUrl.name.split('.').pop().toLowerCase();
            try {
                // Spark.js loadAsync signature: loadAsync(url, options?, onProgress?)
                await splatMesh.loadAsync(url, { fileType: ext });
                if (onProgress) onProgress(1);
            } catch (loadErr) {
                // Try alternative signature: loadAsync(url, onProgress)
                try {
                    await splatMesh.loadAsync(url, (event) => {
                        if (event && event.lengthComputable && onProgress) {
                            onProgress(event.loaded / event.total);
                        }
                    });
                } catch (loadErr2) {
                    URL.revokeObjectURL(url);
                    throw loadErr2;
                }
            }
            URL.revokeObjectURL(url);
        }

        this.splatMesh = splatMesh;
        this.scene.add(splatMesh);

        // Get splat count
        this.splatCount = splatMesh.packedSplats?.splatCount ?? splatMesh.count ?? 0;

        return { splatCount: this.splatCount };
    }

    getBoundingBox() {
        if (!this.splatMesh) {
            return new THREE.Box3(new THREE.Vector3(-1,-1,-1), new THREE.Vector3(1,1,1));
        }
        const box = new THREE.Box3();
        box.setFromObject(this.splatMesh);
        // Fallback if box is empty
        if (box.isEmpty()) {
            return new THREE.Box3(new THREE.Vector3(-1,-1,-1), new THREE.Vector3(1,1,1));
        }
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
        return size.length() || 2;
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
        if (this.splatMesh && this.splatMesh.dispose) {
            this.splatMesh.dispose();
        }
    }
}
