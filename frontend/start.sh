#!/bin/bash
# Start the MedNav frontend

echo "🎨 Starting MedNav Frontend..."
echo ""

# Install if needed
if [ ! -d node_modules ]; then
    echo "📦 Installing npm packages..."
    npm install
fi

echo "🚀 Starting Vite dev server on http://localhost:5173"
echo ""
npm run dev
