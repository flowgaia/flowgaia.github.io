#!/bin/bash
# FlowGaia Deployment Script for GitHub Pages
#
# Copyright © 2026 FlowGaia. All rights reserved.

set -e # Exit on error

echo "🚀 Deploying FlowGaia to GitHub Pages..."

# Check if we're in the right directory
if [ ! -f "index.html" ]; then
    echo "❌ Error: index.html not found. Are you in the correct directory?"
    exit 1
fi

# Check if remote is set
if ! git remote get-url origin > /dev/null 2>&1; then
    echo "❌ Error: Git remote 'origin' not set."
    echo "📝 Please run: git remote add origin https://github.com/flowgaia/flowgaia.github.io.git"
    exit 1
fi

# Check for uncommitted changes
if ! git diff-index --quiet HEAD -- 2>/dev/null; then
    echo "⚠️  You have uncommitted changes. Commit them first."
    git status --short
    exit 1
fi

# Push to GitHub
echo "📤 Pushing to GitHub..."
git push origin main

echo "✅ Deployment complete!"
echo "🌐 Your site will be available at: https://flowgaia.github.io"
echo "⏳ Note: It may take a few minutes for changes to appear."
