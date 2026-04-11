#!/bin/bash
echo "Installing onchainos CLI..."
curl -sSL https://raw.githubusercontent.com/okx/onchainos-skills/main/install.sh | sh
echo "Installing dependencies..."
npm install
echo "Copy .env.example to .env and fill in your OKX credentials"
cp .env.example .env
echo "Setup complete. Run 'npm run dev' to start."
