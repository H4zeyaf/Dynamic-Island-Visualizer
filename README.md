#  Dynamic Island Visualizer

> **A sleek, minimalist, and high-performance audio-reactive visualizer for Spicetify, inspired by the iPhone's Dynamic Island call interface.**



---

##  Key Features

* **Adaptive Color Engine**: Uses a robust Dribbblish-Dynamic style canvas extraction method to grab colors directly from album art. It bypasses broken APIs and includes a "darkness check" to ensure visibility on all tracks.
* **Pro Physics Engine**: Features **Asymmetric Physics** with a snappy "Fast Attack" (upward movement) and a smooth, gravity-based "Decay" (downward movement).
* **Rhythmic Beat-Sync**: Taps into Spotify's internal `AudioAnalysis` to pulse in sync with the song's actual beats, tatums, and loudness segments.
* **GPU Optimized**: Utilizes hardware-accelerated CSS transforms (`scaleY`) and `will-change` hints for smooth 60fps performance without taxing your CPU.
* **Zero-Dependency**: Works perfectly on vanilla Spotify. No specific themes or external CSS frameworks required.

## ⚡ See it in Action
![Dynamic Island Animation](demo.gif)

---

##  Installation

### 1. Download the script
Download the [dynamicViz.js](https://github.com/ghamza127/Dynamic-Island-Visualizer/blob/main/dynamicViz.js) file and place it in your Spicetify Extensions folder:

* **Windows**: `%AppData%\Spicetify\Extensions\`
* **macOS/Linux**: `~/.spicetify/Extensions/`

### 2. Enable the extension
Open your terminal or PowerShell and run the following commands:

```powershell
spicetify config extensions dynamicViz.js
spicetify apply
```
## 📜 Credits & Acknowledgements

* **UI Design**: Inspired by the Apple **Dynamic Island** interface.
* **Color Logic**: This extension uses a modified version of the Canvas Extractor class from **[Dribbblish Dynamic](https://github.com/JulienMaille/dribbblish-dynamic-theme)**. Huge thanks to **Julien Maille** and the contributors of that project for their robust approach to color sourcing in Spotify.

---

## ⚖️ License
This project is open-source. If you use the color extraction logic in your own projects, please continue to credit the original Dribbblish Dynamic authors.
