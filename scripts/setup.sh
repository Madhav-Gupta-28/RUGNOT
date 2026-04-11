#!/bin/bash
echo "Installing dependencies..."
npm install
echo "Copy .env.example to .env and fill in your OKX credentials"
cp -n .env.example .env
echo "Setup complete. Run 'npm run dev' to start."
