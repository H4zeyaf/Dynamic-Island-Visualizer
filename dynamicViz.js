// NAME: Dynamic Island Visualizer
// AUTHOR: ghamza127

(async function DynamicViz() {
    /** * 1. SELECTORS & CONSTANTS
     * Change BAR_SELECTOR if the visualizer moves or disappears after a Spotify update.
     */
    const BAR_SELECTOR = ".player-controls__left";
    const ART_SELECTOR = ".main-nowPlayingWidget-coverArt img, .cover-art img, .main-coverSlotCollapsed-container img";
    
    let audioData = null;
    let beats = [];
    let currentPitches = new Array(6).fill(0);
    let targetPitches = new Array(6).fill(0);

    /**
     * 2. LUMINANCE UTILITY
     * Standard formula to determine perceived brightness (0-255).
     */
    function getLuminance(r, g, b) {
        return 0.2126 * r + 0.7152 * g + 0.0722 * b;
    }

    /**
     * 3. VIBRANT AVERAGE ENGINE
     * Downsamples the album art to a 5x5 grid and averages only non-black pixels.
     * This avoids picking up dark borders and prevents "blackout" visualizers.
     */
    async function getVibrantAverageColor() {
        const imgElement = document.querySelector(ART_SELECTOR);
        if (!imgElement) return "#1db954"; // Default Spotify Green

        return new Promise((resolve) => {
            const img = new Image();
            img.crossOrigin = "Anonymous"; // Required to read pixel data from Spotify's CDN
            img.onload = () => {
                const canvas = document.createElement("canvas");
                const ctx = canvas.getContext("2d");
                
                // Downsampling to 5x5 for performance and better color distribution
                canvas.width = 5;
                canvas.height = 5;
                ctx.drawImage(img, 0, 0, 5, 5);
                
                const imageData = ctx.getImageData(0, 0, 5, 5).data;
                let rTotal = 0, gTotal = 0, bTotal = 0, count = 0;

                for (let i = 0; i < imageData.length; i += 4) {
                    const r = imageData[i];
                    const g = imageData[i+1];
                    const b = imageData[i+2];
                    
                    // Filter: Skip pixels that are too dark to contribute to a 'vibrant' look
                    if (getLuminance(r, g, b) > 35) {
                        rTotal += r; gTotal += g; bTotal += b;
                        count++;
                    }
                }

                // Fallback: If the whole image is too dark, pick the center pixel and boost it
                if (count === 0) {
                    let r = imageData[48], g = imageData[49], b = imageData[50];
                    resolve(`rgb(${Math.min(255, r + 85)}, ${Math.min(255, g + 85)}, ${Math.min(255, b + 85)})`);
                    return;
                }

                let fR = Math.floor(rTotal / count), fG = Math.floor(gTotal / count), fB = Math.floor(bTotal / count);

                // Final safety: Ensure the result isn't a muddy grey
                if (getLuminance(fR, fG, fB) < 60) {
                    fR = Math.min(255, fR + 40); fG = Math.min(255, fG + 40); fB = Math.min(255, fB + 40);
                }

                resolve(`rgb(${fR}, ${fG}, ${fB})`);
            };
            img.onerror = () => resolve("#1db954");
            img.src = imgElement.src;
        });
    }

    /**
     * 4. TRACK DATA REFRESHER
     * Fetches audio analysis (beats/loudness) and updates the visualizer color.
     */
    async function refreshVisuals() {
        const item = Spicetify.Player.data?.item;
        if (!item) return;
        try {
            const data = await Spicetify.getAudioData(item.uri);
            if (data) { audioData = data.segments || null; beats = data.beats || []; }
        } catch (e) { audioData = null; }

        const color = await getVibrantAverageColor();
        const wrapper = document.getElementById("dynamic-island-viz");
        if (wrapper) {
            wrapper.style.setProperty('--viz-color', color);
            // Format RGB string into RGBA for the glow effect
            const glow = color.replace(')', ', 0.5)').replace('rgb', 'rgba');
            wrapper.style.setProperty('--viz-glow', glow);
        }
    }

    /**
     * 5. INITIALIZATION & STYLING
     * Injects the HTML and CSS into the Spotify UI.
     */
    async function init() {
        const controlsLeft = document.querySelector(BAR_SELECTOR);
        if (!controlsLeft || !Spicetify.Player) {
            setTimeout(init, 500); // Retry if UI is still loading
            return;
        }
        if (document.getElementById("dynamic-island-viz")) return;

        const style = document.createElement("style");
        style.innerHTML = `
            #dynamic-island-viz {
                display: flex; align-items: center; justify-content: center;
                gap: 3px; height: 16px; width: 38px;
                align-self: center; margin-right: 12px;
                --viz-color: #1db954;
                --viz-glow: rgba(29, 185, 185, 0.4);
            }
            .viz-pill {
                width: 3px; height: 100%;
                background-color: var(--viz-color);
                border-radius: 10px;
                transform-origin: center;
                transform: scaleY(0.2);
                will-change: transform;
                transition: background-color 0.8s ease;
                box-shadow: 0 0 8px var(--viz-glow);
            }
        `;
        document.head.append(style);

        const container = document.createElement("div");
        container.id = "dynamic-island-viz";
        for (let i = 0; i < 6; i++) {
            const b = document.createElement("div");
            b.className = "viz-pill";
            container.appendChild(b);
        }
        
        controlsLeft.prepend(container); // Anchors viz next to the shuffle button
        const bars = container.querySelectorAll(".viz-pill");

        Spicetify.Player.addEventListener("songchange", refreshVisuals);
        Spicetify.Player.addEventListener("onplaypause", refreshVisuals);
        refreshVisuals();

        /**
         * 6. ANIMATION LOOP
         * Runs at 60fps to handle physics-based scaling.
         */
        function animate() {
            if (Spicetify.Player.isPlaying() && audioData) {
                const prog = Spicetify.Player.getProgress() / 1000;
                const seg = audioData.find(s => prog >= s.start && prog < (s.start + s.duration));
                const beat = beats.find(b => prog >= b.start && prog < (b.start + b.duration));
                const impact = beat ? (1 - (prog - beat.start) / beat.duration) : 0;

                if (seg) {
                    const loud = Math.max(0.4, (seg.loudness_max + 35) / 20);
                    const bst = impact * 0.3; 
                    targetPitches = [
                        (seg.pitches[0] + bst) * loud, (seg.pitches[2] + bst) * loud,
                        (seg.pitches[4] + bst) * loud, (seg.pitches[7] + bst) * loud,
                        (seg.pitches[9] + bst) * loud, (seg.pitches[11] + bst) * loud
                    ];
                }
            } else { targetPitches.fill(0.2); }

            // PHYSICS: Snap up (0.6) and float down (0.08)
            bars.forEach((bar, i) => {
                const t = targetPitches[i], c = currentPitches[i];
                currentPitches[i] += (t - c) * (t > c ? 0.6 : 0.08);
                const breath = Spicetify.Player.isPlaying() ? (Math.sin(Date.now() / 50 + i) * 0.03) : 0;
                bar.style.transform = `scaleY(${Math.max(0.2, currentPitches[i] + breath)})`;
            });
            requestAnimationFrame(animate);
        }
        animate();
    }
    init();
})();

