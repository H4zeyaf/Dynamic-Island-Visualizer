// NAME: Dynamic Island Visualizer
// AUTHOR: H4zeyaf

(async function DynamicViz() {
    const BAR_SELECTOR = ".player-controls__left";
    const ART_SELECTOR = ".main-nowPlayingWidget-coverArt img, .cover-art img, .main-coverSlotCollapsed-container img";
    
    let audioData = null;
    let beats = [];
    let currentPitches = new Array(6).fill(0);
    let targetPitches = new Array(6).fill(0);
    
    // Automatic Gain Control (AGC) state
    let loudnessHistory = [];

    // --- COLOR HELPERS ---
    function getLuminance(r, g, b) { return 0.2126 * r + 0.7152 * g + 0.0722 * b; }

    /** * MANUAL EXTRACTOR: 
     * Used if no dynamic theme is detected. 
     * Averages the vibrant pixels of the album art. 
     */
    async function getVibrantAverageColor() {
        const imgElement = document.querySelector(ART_SELECTOR);
        if (!imgElement) return "#1db954";
        return new Promise((resolve) => {
            const img = new Image();
            img.crossOrigin = "Anonymous";
            img.onload = () => {
                const canvas = document.createElement("canvas");
                const ctx = canvas.getContext("2d");
                canvas.width = 5; canvas.height = 5;
                ctx.drawImage(img, 0, 0, 5, 5);
                const imageData = ctx.getImageData(0, 0, 5, 5).data;
                let rTotal = 0, gTotal = 0, bTotal = 0, count = 0;
                for (let i = 0; i < imageData.length; i += 4) {
                    if (getLuminance(imageData[i], imageData[i+1], imageData[i+2]) > 35) {
                        rTotal += imageData[i]; gTotal += imageData[i+1]; bTotal += imageData[i+2]; count++;
                    }
                }
                if (count === 0) {
                     let r = imageData[48], g = imageData[49], b = imageData[50];
                     resolve(`rgb(${Math.min(255, r + 80)}, ${Math.min(255, g + 80)}, ${Math.min(255, b + 80)})`);
                     return;
                }
                let fR = Math.floor(rTotal/count), fG = Math.floor(gTotal/count), fB = Math.floor(bTotal/count);
                if (getLuminance(fR, fG, fB) < 60) { fR += 40; fG += 40; fB += 40; }
                resolve(`rgb(${Math.min(255, fR)}, ${Math.min(255, fG)}, ${Math.min(255, fB)})`);
            };
            img.onerror = () => resolve("#1db954");
            img.src = imgElement.src;
        });
    }

    /**
     * SYNC LOGIC:
     * checks if a theme is active. If the theme color is generic (green/white/black),
     * it ignores it and uses the manual extractor.
     * personally only tested it with dribblish dynamic since that's how i based a lot of the color engine
     */
    async function getSyncColor() {
        const rootStyle = getComputedStyle(document.documentElement);
        const themeColor = rootStyle.getPropertyValue('--spice-button-active').trim().toLowerCase();
        
        // list of 'Generic' colors to ignore (Standard Spotify Green and common greyscale)
        const genericColors = ["#1db954", "#1ed760", "#ffffff", "#000000", "rgb(29, 185, 84)"];

        // 1. If there's a theme color and it's NOT generic, trust the theme
        if (themeColor && !genericColors.includes(themeColor)) {
            return themeColor;
        }

        // 2. Otherwise, calculate it from the image
        return await getVibrantAverageColor();
    }

    async function refreshVisuals() {
        const item = Spicetify.Player.data?.item;
        if (!item) return;
        try {
            const data = await Spicetify.getAudioData(item.uri);
            if (data) { 
                audioData = data.segments || null; 
                beats = data.beats || []; 
                loudnessHistory = [];
            }
        } catch (e) { audioData = null; }

        const color = await getSyncColor();
        const wrapper = document.getElementById("dynamic-island-viz");
        if (wrapper) {
            wrapper.style.setProperty('--viz-color', color);
            // Handle both hex and rgb strings for the glow
            const glow = color.startsWith('rgb') 
                ? color.replace(')', ', 0.5)').replace('rgb', 'rgba') 
                : color + "88"; 
            wrapper.style.setProperty('--viz-glow', glow);
        }
    }

    async function init() {
        const controlsLeft = document.querySelector(BAR_SELECTOR);
        if (!controlsLeft || !Spicetify.Player) { setTimeout(init, 500); return; }
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
        
        controlsLeft.prepend(container);
        const bars = container.querySelectorAll(".viz-pill");

        Spicetify.Player.addEventListener("songchange", refreshVisuals);
        Spicetify.Player.addEventListener("onplaypause", refreshVisuals);
        refreshVisuals();

        function animate() {
            if (Spicetify.Player.isPlaying() && audioData) {
                const lookaheadTime = 0.050; 
                const progress = (Spicetify.Player.getProgress() / 1000) + lookaheadTime;
                
                const segment = audioData.find(s => progress >= s.start && progress < (s.start + s.duration));
                const beat = beats.find(b => progress >= b.start && progress < (b.start + b.duration));
                
                // Beat Impact
                const impact = beat ? Math.max(0, 1 - (progress - beat.start) / (beat.duration * 0.8)) : 0;

                if (segment) {
                    // AGC Logic
                    const currentLoudnessRaw = segment.loudness_max;
                    loudnessHistory.push(currentLoudnessRaw);
                    if (loudnessHistory.length > 100) loudnessHistory.shift();
                    const localMax = Math.max(...loudnessHistory, -20);
                    
                    let normalizedVolume = Math.pow(Math.max(0, (currentLoudnessRaw + 60) / (localMax + 60)), 2);

                    // NOISE GATE
                    if (normalizedVolume < 0.05) normalizedVolume = 0;

                    // PITCH-COUPLED PHYSICS
                    const beatBoost = 1 + (impact * 0.6);

                    targetPitches = [
                        segment.pitches[0] * normalizedVolume * beatBoost,
                        segment.pitches[2] * normalizedVolume * beatBoost,
                        segment.pitches[4] * normalizedVolume * beatBoost,
                        segment.pitches[7] * normalizedVolume * beatBoost,
                        segment.pitches[9] * normalizedVolume * beatBoost,
                        segment.pitches[11] * normalizedVolume * beatBoost
                    ];
                }
            } else { targetPitches.fill(0.15); }

            bars.forEach((bar, i) => {
                const target = targetPitches[i];
                const current = currentPitches[i];
                
                if (target > current) {
                    currentPitches[i] += (target - current) * 0.7; 
                } else {
                    currentPitches[i] += (target - current) * 0.15;
                }

                const height = Math.max(0.15, Math.min(1.0, currentPitches[i]));
                bar.style.transform = `scaleY(${height})`;
            });
            requestAnimationFrame(animate);
        }
        animate();
    }
    init();
})();


