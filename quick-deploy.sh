#!/bin/bash

# Quick Deploy Script (No VPS)
# Usage: ./quick-deploy.sh "commit message"

set -e

if [ -z "$1" ]; then
    echo "❌ Error: Commit message required"
    echo "Usage: ./quick-deploy.sh \"your commit message\""
    exit 1
fi

echo "🚀 Quick deploying..."

git add .
git commit -m "$1"
git push origin main

echo "✅ Pushed to GitHub!"
echo ""
echo "📝 Next steps on VPS:"
echo "   ssh your_user@your_vps"
echo "   cd /path/to/botspada"
echo "   git pull && pm2 restart botspada"
