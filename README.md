# FlowGaia Sacred Music Web App

A beautiful static web application for publishing FlowGaia's sacred music collection. Features a custom audio player with a spiritual aesthetic design.

## Features

- **Pure Static Site:** No build tools required - just HTML, CSS, and JavaScript
- **YAML Configuration:** All songs and albums managed through a single config file
- **Custom Audio Player:** Full-featured HTML5 audio player with:
  - Play/pause, previous/next track controls
  - Progress bar with seeking
  - Volume control with mute
  - Auto-advance to next track
  - Now playing display with artwork
  - **Playback Position Memory:** Automatically remembers which track was playing and the exact position, perfect for audiobooks and long meditations
- **Sacred Aesthetic:** Deep purple and gold color scheme with elegant typography
- **Responsive Design:** Works beautifully on mobile, tablet, and desktop
- **Easy to Extend:** Add new songs by simply updating the YAML file

## Getting Started

### View the App

Simply open `index.html` in a modern web browser. For best results, serve the files through a local web server:

```bash
# Using Python 3
python -m http.server 8000

# Using Node.js http-server
npx http-server

# Using PHP
php -S localhost:8000
```

Then navigate to `http://localhost:8000` in your browser.

## Project Structure

```
/Users/ryansadler/code/songs/
├── index.html              # Main entry point
├── config.yaml             # Song and album metadata
├── assets/
│   ├── audio/              # Audio files (.mp3)
│   ├── images/
│   │   ├── albums/         # Album cover images
│   │   └── songs/          # Individual song artwork
│   └── brand/              # Logos and branding
├── styles/
│   ├── main.css            # Core layout styles
│   ├── sacred-theme.css    # Spiritual aesthetic theme
│   └── player.css          # Audio player styles
├── scripts/
│   ├── config-loader.js    # YAML parsing and data management
│   ├── player.js           # Audio player controller
│   └── app.js              # Main application logic
└── README.md               # This file
```

## Adding New Songs

To add a new song, edit `config.yaml`:

1. Add your audio file to `assets/audio/`
2. Add artwork to `assets/images/songs/` (optional)
3. Update `config.yaml` to include the new song:

```yaml
albums:
  - id: "album-id"
    title: "Album Title"
    artist: "Artist Name"
    year: 2026
    description: "Album description"
    cover: "assets/images/albums/cover.jpg"
    copyright: "Copyright Info"
    songs:
      - id: "song-id"
        title: "Song Title"
        subtitle: "Optional Subtitle"
        artist: "Artist Name"
        audio: "assets/audio/song-file.mp3"
        image: "assets/images/songs/song-artwork.jpg"
        copyright: "Copyright Info"
        year: 2026
        description: "Song description"
        tags: ["tag1", "tag2"]
```

4. Refresh the page - the new song will appear automatically!

## Design

### Color Palette

- **Primary:** `#2D1B4E` (Deep mystical purple)
- **Secondary:** `#4A3269` (Medium purple)
- **Accent:** `#C9A961` (Sacred gold)
- **Light:** `#F5F3ED` (Soft parchment)
- **Dark:** `#1A0F2E` (Deep space)

### Typography

- **Headings:** Cinzel (elegant serif, classical)
- **Body:** Cormorant Garamond (graceful, readable)

### Visual Effects

- Sacred gold glow on hover
- Gradient backgrounds suggesting divine light
- Glass-morphism with backdrop blur
- Smooth transitions
- Sacred geometric background patterns

## Browser Compatibility

- Chrome/Edge (recommended)
- Firefox
- Safari
- Modern mobile browsers

Requires a browser that supports:
- HTML5 audio
- CSS Grid and Flexbox
- CSS custom properties
- ES6 JavaScript

## Technical Details

### Dependencies

- **js-yaml:** Loaded from CDN for YAML parsing
- **Google Fonts:** Cinzel and Cormorant Garamond

### Audio Format

Currently uses MP3 format. For best compatibility, consider providing multiple formats:
- MP3 (good browser support)
- OGG (Firefox, Chrome)
- M4A (Safari)

### Performance

- Lazy loading for images
- Efficient DOM updates
- Local storage for volume preferences and playback position
- Optimized CSS animations
- Automatic playback state persistence (saves every 5 seconds during playback)

### Playback Position Memory

The app automatically remembers:
- Which track was playing
- The exact position in the track (updated every 5 seconds)
- Your volume preference

This means if you refresh the page or close and reopen it, you'll return exactly where you left off - perfect for audiobooks, long meditations, or sacred ceremonies.

## Customization

### Changing Colors

Edit the CSS custom properties in `styles/sacred-theme.css`:

```css
:root {
    --color-primary: #2D1B4E;
    --color-accent: #C9A961;
    /* ... etc */
}
```

### Changing Fonts

Update the Google Fonts import in `index.html` and the font-family declarations in the CSS files.

### Modifying the Player

The audio player logic is in `scripts/player.js`. The `AudioPlayer` class handles all playback functionality.

## Deployment

This site automatically deploys to GitHub Pages at **https://flowgaia.github.io**

### Automatic Deployment

Every push to `main` triggers automatic deployment via GitHub Actions:

```bash
git add .
git commit -m "Your changes"
git push origin main
```

✨ That's it! GitHub Actions handles the rest.

See [DEPLOYMENT.md](DEPLOYMENT.md) for detailed setup instructions.

## Copyright & License

**Copyright © 2026 FlowGaia. All rights reserved.**

All source code, assets, designs, and content in this repository are protected by copyright and are the exclusive property of FlowGaia.

This includes but is not limited to:
- All HTML, CSS, and JavaScript source code
- All images, artwork, and visual assets
- All audio files and musical compositions
- All configuration files and documentation
- The FlowGaia name, logo, and branding

**Unauthorized copying, distribution, modification, or use of any part of this work is strictly prohibited.**

For licensing inquiries, please contact FlowGaia.

## Credits

- Design & Development: FlowGaia Sacred Music Web App
- Music: Flow Gaia
- Built with love and sacred intention
