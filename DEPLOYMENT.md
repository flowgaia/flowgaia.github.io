# FlowGaia Deployment Guide

This guide explains how to deploy the FlowGaia static site to GitHub Pages using automated GitHub Actions.

## Prerequisites

- Git installed
- GitHub account with access to create repositories
- Command line access

## How Deployment Works

**Automatic deployment via GitHub Actions:**
- Every push to the `main` branch automatically triggers deployment
- GitHub Actions builds and deploys your site to GitHub Pages
- No manual deployment steps required!
- See deployment status in the "Actions" tab on GitHub

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

### 3. Initial Push

```bash
# Push to GitHub (this will trigger automatic deployment)
git push -u origin main
```

### 4. Configure GitHub Pages

1. Go to your repository on GitHub
2. Click **Settings** → **Pages**
3. Under "Build and deployment":
   - Source: **GitHub Actions**
4. The site will automatically deploy via the workflow

## Regular Deployment

Deployment is **fully automatic**! Just commit and push:

```bash
# Make changes to your code
# ...

# Stage changes
git add .

# Commit with descriptive message
git commit -m "Description of your changes"

# Push to GitHub - deployment happens automatically!
git push origin main
```

### Monitoring Deployment

1. Go to your repository on GitHub
2. Click the **Actions** tab
3. Watch the deployment progress in real-time
4. Green checkmark = successful deployment ✅

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
