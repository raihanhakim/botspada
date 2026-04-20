#!/bin/bash

# Bot SPADA Auto Deploy Script
# Usage: ./deploy.sh "commit message"

set -e

echo "🚀 Starting deployment..."

# Check if commit message provided
if [ -z "$1" ]; then
    echo "❌ Error: Commit message required"
    echo "Usage: ./deploy.sh \"your commit message\""
    exit 1
fi

COMMIT_MSG="$1"

# Git operations
echo "📦 Committing changes..."
git add .
git commit -m "$COMMIT_MSG"

echo "⬆️  Pushing to GitHub..."
git push origin main

echo "✅ Pushed to GitHub successfully!"

# VPS Configuration (edit these)
VPS_USER="your_vps_user"
VPS_HOST="your_vps_ip"
VPS_PATH="/path/to/botspada"
BOT_NAME="botspada"

echo ""
echo "🔧 VPS Configuration:"
echo "   User: $VPS_USER"
echo "   Host: $VPS_HOST"
echo "   Path: $VPS_PATH"
echo ""
read -p "Deploy to VPS? (y/n): " -n 1 -r
echo

if [[ $REPLY =~ ^[Yy]$ ]]; then
    echo "🌐 Deploying to VPS..."

    ssh $VPS_USER@$VPS_HOST << EOF
        set -e
        echo "📂 Navigating to project directory..."
        cd $VPS_PATH

        echo "⬇️  Pulling latest changes..."
        git pull origin main

        echo "📦 Installing dependencies (if any)..."
        npm install --production

        echo "🔄 Restarting bot..."
        pm2 restart $BOT_NAME

        echo "✅ Bot restarted successfully!"

        echo ""
        echo "📊 Bot Status:"
        pm2 status $BOT_NAME

        echo ""
        echo "📝 Recent logs:"
        pm2 logs $BOT_NAME --lines 10 --nostream
EOF

    echo ""
    echo "✅ Deployment completed successfully!"
else
    echo "⏭️  Skipped VPS deployment"
fi

echo ""
echo "🎉 Done!"
