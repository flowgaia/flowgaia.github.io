# FlowGaia Deployment Guide

This guide explains how to deploy the FlowGaia static site to GitHub Pages.

## Prerequisites

- Git installed
- GitHub account with access to create repositories
- Command line access

## Initial Setup (One-time)

### 1. Create GitHub Repository

1. Go to https://github.com and log in
2. Create a new repository named **exactly**: `flowgaia.github.io`
   - ⚠️ The repository name MUST be `flowgaia.github.io` for the root domain
   - Make it public
   - Do NOT initialize with README (we already have one)

### 2. Connect Local Repository to GitHub

```bash
# Add GitHub as remote
git remote add origin https://github.com/flowgaia/flowgaia.github.io.git

# Verify remote is set
git remote -v
```

### 3. Initial Commit and Push

```bash
# Stage all files
git add .

# Create initial commit
git commit -m "Initial commit: FlowGaia Sacred Music Web App

- Complete music player with Howler.js
- Album-based navigation
- Playback controls (speed, loop, volume)
- Responsive design with sacred aesthetic
- State persistence across sessions

Co-Authored-By: Claude Sonnet 4.5 <noreply@anthropic.com>"

# Push to GitHub
git push -u origin main
```

### 4. Enable GitHub Pages (if needed)

GitHub Pages should automatically enable for `<username>.github.io` repositories, but to verify:

1. Go to your repository on GitHub
2. Click **Settings** → **Pages**
3. Ensure:
   - Source is set to **Deploy from a branch**
   - Branch is set to **main** and **/ (root)**
4. Click **Save** if needed

## Regular Deployment

After the initial setup, use the deployment script for updates:

```bash
# Make changes to your code
# ...

# Stage changes
git add .

# Commit with descriptive message
git commit -m "Description of your changes"

# Deploy using the script
./deploy.sh
```

Or manually:

```bash
git push origin main
```

## Accessing Your Site

After deployment, your site will be available at:

**https://flowgaia.github.io**

⏳ Note: Changes may take 1-5 minutes to appear after pushing.

## Deployment Checklist

- [ ] All changes are tested locally
- [ ] Audio files are in place
- [ ] Album artwork is included
- [ ] Config.yaml is up to date
- [ ] No console errors in browser
- [ ] Changes are committed to git
- [ ] Pushed to GitHub
- [ ] Site verified at https://flowgaia.github.io

## Troubleshooting

### Site not updating after push
- Wait 5 minutes for GitHub Pages to rebuild
- Hard refresh browser (Cmd+Shift+R on Mac, Ctrl+Shift+R on Windows)
- Check GitHub Actions tab for build status

### 404 Error
- Verify repository name is exactly `flowgaia.github.io`
- Check that GitHub Pages is enabled in repository settings
- Ensure `index.html` is in the root directory

### Audio files not playing
- Check file paths in `config.yaml`
- Ensure audio files are committed and pushed
- Verify files are not too large (GitHub has 100MB file limit)

### Changes not showing
- Clear browser cache
- Check Network tab in browser DevTools for 404s
- Verify files were actually committed: `git log --name-status`

## Copyright

© 2026 FlowGaia. All rights reserved.
