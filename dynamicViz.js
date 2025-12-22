// NAME: Dynamic Island Visualizer (Developer Edition)
// AUTHOR: Gemini & You
// VERSION: 3.2

(async function DynamicViz() {
    /** * 1. CRITICAL SELECTORS
     * If the visualizer disappears, Spotify likely renamed these classes.
     * Use Ctrl+Shift+I in Spotify to find the new class names for the progress bar and album art.
     */
    const BAR_SELECTOR = ".playback-bar";
    const ART_SELECTOR = ".main-nowPlayingWidget-coverArt img, .cover-art img, .main-coverSlotCollapsed-container img";
    
    // Global variables for audio analysis and animation state
    let audioData = null;
    let beats = [];
    let currentPitches = new Array(6).fill(0);
    let targetPitches = new Array(6).fill(0);

    /**
     * 2. COLOR EXTRACTION ENGINE (Dribbblish Method)
     * Recreates the album art in a 1x1 canvas to find the average color.
     * This bypasses Spicetify.getColors if that API is broken.
     */
    async function getDribbblishColor() {
        const imgElement = document.querySelector(ART_SELECTOR);
        if (!imgElement) return "#1db954"; // Default Spotify Green if art not found

        return new Promise((resolve) => {
            const img = new Image();
            // crossOrigin is vital; without it, the canvas will be "tainted" and unreadable.
            img.crossOrigin = "Anonymous";
            img.onload = () => {
                const canvas = document.createElement("canvas");
                const ctx = canvas.getContext("2d");
                canvas.width = 1;
                canvas.height = 1;
                // Draw image into 1 pixel to get the "average" color
                ctx.drawImage(img, 0, 0, 1, 1);
                const [r, g, b] = ctx.getImageData(0, 0, 1, 1).data;
                
                // ADJUSTMENT: If the album is very dark, we boost the RGB values
                // so the visualizer stays visible on dark themes.
                if (r + g + b < 50) {
                    resolve(`rgb(${r + 60}, ${g + 60}, ${b + 60})`);
                } else {
                    resolve(`rgb(${r}, ${g}, ${b})`);
                }
            };
            img.onerror = () => resolve("#1db954");
            img.src = imgElement.src;
        });
    }

    /**
     * 3. DATA REFRESHER
     * Runs every time the song changes.
     * Fetches the "map" of the song (segments and beats) from Spotify.
     */
    async function refreshVisuals() {
        const item = Spicetify.Player.data?.item;
        if (!item) return;

        try {
            // This API fetches the pre-analyzed loudness/pitch data for the track
            const data = await Spicetify.getAudioData(item.uri);
            if (data) {
                audioData = data.segments || null;
                beats = data.beats || [];
            }
        } catch (e) { 
            console.error("DynamicViz: Audio data failed", e);
            audioData = null; 
        }

        // Apply colors after song change
        const color = await getDribbblishColor();
        const wrapper = document.getElementById("dynamic-island-viz");
        if (wrapper) {
            wrapper.style.setProperty('--viz-color', color);
            wrapper.style.setProperty('--viz-glow', color + "88"); // 88 = ~50% opacity
        }
    }

    /**
     * 4. INITIALIZATION
     * Injects the CSS and creates the HTML container for the 6 pills.
     */
    async function init() {
        const playbackBar = document.querySelector(BAR_SELECTOR);
        if (!playbackBar || !Spicetify.Player) {
            setTimeout(init, 500); // Retry if Spotify UI hasn't loaded yet
            return;
        }

        if (document.getElementById("dynamic-island-viz")) return;

        const style = document.createElement("style");
        style.innerHTML = `
            #dynamic-island-viz {
                display: flex; align-items: center; justify-content: center;
                gap: 3px; height: 20px; width: 40px;
                margin-right: 12px; margin-left: 8px;
                --viz-color: #1db954;
                --viz-glow: rgba(29, 185, 84, 0.4);
            }
            .viz-pill {
                width: 3px; height: 100%;
                background-color: var(--viz-color);
                border-radius: 10px;
                transform-origin: center; /* Ensures pills expand from the middle */
                transform: scaleY(0.2);
                will-change: transform; /* Triggers GPU acceleration */
                transition: background-color 0.8s ease;
                box-shadow: 0 0 10px var(--viz-glow);
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
        
        playbackBar.prepend(container);
        const bars = container.querySelectorAll(".viz-pill");

        // Listeners to trigger data and color updates
        Spicetify.Player.addEventListener("songchange", refreshVisuals);
        Spicetify.Player.addEventListener("onplaypause", refreshVisuals);
        refreshVisuals();

        /**
         * 5. ANIMATION ENGINE
         * Runs at 60fps. Handles the physics and the "bounce" logic.
         */
        function animate() {
            if (Spicetify.Player.isPlaying() && audioData) {
                const progress = Spicetify.Player.getProgress() / 1000; // Current song time in seconds
                
                // Find where we are in the song's audio segments
                const segment = audioData.find(s => progress >= s.start && progress < (s.start + s.duration));
                
                // Calculate "Beat Impact" to add an extra pulse on the rhythm
                const currentBeat = beats.find(b => progress >= b.start && progress < (b.start + b.duration));
                const beatImpact = currentBeat ? (1 - (progress - currentBeat.start) / currentBeat.duration) : 0;

                if (segment) {
                    // loudness_max is usually -60 to 0. We map it to a 0.4 - 1.0 range.
                    const loudness = Math.max(0.4, (segment.loudness_max + 35) / 20);
                    const boost = beatImpact * 0.3; 
                    
                    // Map 6 specific musical pitches to our 6 bars
                    targetPitches = [
                        (segment.pitches[0] + boost) * loudness,
                        (segment.pitches[2] + boost) * loudness,
                        (segment.pitches[4] + boost) * loudness,
                        (segment.pitches[7] + boost) * loudness,
                        (segment.pitches[9] + boost) * loudness,
                        (segment.pitches[11] + boost) * loudness
                    ];
                }
            } else { 
                targetPitches.fill(0.2); // Baseline height when paused
            }

            // PHYSICS LOOP: Attack and Decay
            bars.forEach((bar, i) => {
                const target = targetPitches[i];
                const current = currentPitches[i];
                
                // If target > current, we are "Attacking" (jumping up). 
                // If target < current, we are "Decaying" (falling down).
                // 0.6 = Very fast jump. 0.08 = Smooth, floaty fall.
                currentPitches[i] += (target - current) * (target > current ? 0.6 : 0.08);

                // Add a high-frequency sine wave for a "vibrating" breath effect
                const breath = Spicetify.Player.isPlaying() ? (Math.sin(Date.now() / 50 + i) * 0.03) : 0;
                
                // Apply the final vertical scale
                bar.style.transform = `scaleY(${Math.max(0.2, currentPitches[i] + breath)})`;
            });

            requestAnimationFrame(animate); // Queue next frame
        }
        animate();
    }
    init();
})();